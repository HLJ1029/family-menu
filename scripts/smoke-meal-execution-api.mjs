import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const smokeDirectory = await mkdtemp(join(tmpdir(), "humi-meal-execution-"));
const dataFile = join(smokeDirectory, "data.json");
process.env.HUMI_API_DATA_FILE = dataFile;
process.env.HUMI_SESSION_SECRET = "humi-meal-execution-smoke-secret";
process.env.HUMI_WECHAT_MOCK = "1";
process.env.HUMI_MEAL_EXECUTION_ENABLED = "1";
process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS = "*";
process.env.HUMI_MEAL_REMINDER_TEMPLATE_ID = "mock-meal-template";
process.env.HUMI_MEAL_REMINDER_THING_KEY = "thing1";
process.env.HUMI_MEAL_REMINDER_TIME_KEY = "time2";

const { createHumiApiServer, processDueMealReminders } = await import("../api/server.js");
const { HumiStore } = await import("../api/store.js");
const server = createHumiApiServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const owner = await createUser(baseUrl, "meal-owner", "主厨小禾");
  const member = await createUser(baseUrl, "meal-member", "家人小林");
  const outsider = await createUser(baseUrl, "meal-outsider", "路人");
  const familyEnvelope = await request(`${baseUrl}/households`, {
    method: "POST",
    session: owner,
    body: { householdName: "周末小家" },
  });
  const householdId = familyEnvelope.family.id;
  const invite = await request(`${baseUrl}/household-invites`, {
    method: "POST",
    session: owner,
    body: { householdId },
  });
  await request(`${baseUrl}/household-invites/${invite.invite.token}/join`, {
    method: "POST",
    session: member,
    body: {},
  });

  const stateEnvelope = await request(`${baseUrl}/state`, { session: owner });
  assert.equal(stateEnvelope.capabilities.mealExecution, true, "allowlisted household should receive meal execution capability");

  await assertRejected(`${baseUrl}/meal-runs`, {
    method: "POST",
    session: member,
    body: mealPlan(householdId, "2026-07-22", "member-plan"),
  }, 403, "forbidden");

  const firstPlan = await request(`${baseUrl}/meal-runs`, {
    method: "POST",
    session: owner,
    body: { ...mealPlan(householdId, "2026-07-22", "plan-1"), syncedFromLocalId: "local-test-run" },
  });
  assert.equal(firstPlan.mealRun.status, "planned");
  assert.deepEqual(firstPlan.mealRun.recipeIds, ["tomato-egg", "seaweed-egg-soup"]);
  assert.equal(firstPlan.mealRun.timelineVersion, 1);
  assert.equal(firstPlan.mealRun.timeline, null, "absolute timeline starts only when cooking starts");
  assert.equal(firstPlan.mealRun.syncedFromLocalId, "local-test-run", "guest merge provenance must survive persistence");

  const repeatedPlan = await request(`${baseUrl}/meal-runs`, {
    method: "POST",
    session: owner,
    body: mealPlan(householdId, "2026-07-22", "plan-1"),
  });
  assert.equal(repeatedPlan.mealRun.id, firstPlan.mealRun.id, "create must be idempotent by idempotency key");

  const replacement = await request(`${baseUrl}/meal-runs`, {
    method: "POST",
    session: owner,
    body: { ...mealPlan(householdId, "2026-07-22", "plan-2"), recipeIds: ["tomato-egg"] },
  });
  assert.notEqual(replacement.mealRun.id, firstPlan.mealRun.id);
  assert.equal(replacement.replacedMealRunId, firstPlan.mealRun.id);
  const current = await request(`${baseUrl}/meal-runs/current?householdId=${householdId}&dateKey=2026-07-22&mealSlot=dinner`, { session: member });
  assert.equal(current.mealRun.id, replacement.mealRun.id);

  const started = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/start`, {
    method: "POST",
    session: member,
    body: {},
  });
  assert.equal(started.mealRun.status, "cooking");
  assert(started.mealRun.timeline.steps.length > 0);
  assert(started.mealRun.startedBy === member.user.id);
  const repeatedStart = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/start`, {
    method: "POST",
    session: member,
    body: {},
  });
  assert.equal(repeatedStart.mealRun.startedAt, started.mealRun.startedAt, "start must be idempotent");

  await assertRejected(`${baseUrl}/meal-runs/${replacement.mealRun.id}/progress`, {
    method: "PUT",
    session: member,
    body: { currentStepId: "unknown-step" },
  }, 400, "meal_step_invalid");
  const firstStep = started.mealRun.timeline.steps[0];
  const progressed = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/progress`, {
    method: "PUT",
    session: member,
    body: { currentStepId: firstStep.id, timerEndsAt: firstStep.endsAt },
  });
  assert.equal(progressed.mealRun.currentStepId, firstStep.id);

  const downgradedRun = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/downgrade`, {
    method: "POST",
    session: member,
    body: { action: "ready_staple" },
  });
  assert.equal(downgradedRun.mealRun.status, "cooking");
  assert.equal(downgradedRun.mealRun.readyStaple, "即食米饭");
  assert.equal(downgradedRun.mealRun.downgrades.length, 1);

  const completed = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/complete`, {
    method: "POST",
    session: member,
    body: {},
  });
  assert.equal(completed.mealRun.status, "completed");
  assert.equal(completed.mealRun.completedBy, member.user.id);
  const completedAgain = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/complete`, {
    method: "POST",
    session: member,
    body: {},
  });
  assert.equal(completedAgain.mealRun.completedAt, completed.mealRun.completedAt, "completion must count exactly once");

  await assertRejected(`${baseUrl}/meal-runs`, {
    method: "POST",
    session: owner,
    body: mealPlan(householdId, "2026-07-22", "after-completion"),
  }, 409, "meal_run_locked");

  await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/feedback`, {
    method: "PUT",
    session: owner,
    body: { value: "want_again" },
  });
  await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/feedback`, {
    method: "PUT",
    session: member,
    body: { value: "too_much_effort" },
  });
  const feedbackUpdated = await request(`${baseUrl}/meal-runs/${replacement.mealRun.id}/feedback`, {
    method: "PUT",
    session: member,
    body: { value: "change_next_time" },
  });
  assert.equal(feedbackUpdated.mealRun.feedback.length, 2, "feedback is one upserted value per member");
  assert.equal(feedbackUpdated.mealRun.feedback.find((entry) => entry.userId === member.user.id).value, "change_next_time");

  const taskPlan = await request(`${baseUrl}/meal-runs`, {
    method: "POST",
    session: owner,
    body: mealPlan(householdId, "2026-07-23", "task-plan"),
  });
  const task = await request(`${baseUrl}/meal-runs/${taskPlan.mealRun.id}/tasks`, {
    method: "POST",
    session: owner,
    body: { type: "buy", ingredientName: "鸡蛋" },
  });
  assert.equal(task.task.label, "请家人买鸡蛋");
  assert.match(task.task.token, /^[A-Za-z0-9_-]{24,}$/);
  await assertRejected(`${baseUrl}/meal-tasks/${task.task.token}/claim`, { method: "POST", body: {} }, 401, "missing_token");
  await assertRejected(`${baseUrl}/meal-tasks/${task.task.token}/claim`, { method: "POST", session: outsider, body: {} }, 404, "household_not_found");
  const claimed = await request(`${baseUrl}/meal-tasks/${task.task.token}/claim`, { method: "POST", session: member, body: {} });
  assert.equal(claimed.task.status, "claimed");
  assert.equal(claimed.task.claimedBy, member.user.id);
  const taskDone = await request(`${baseUrl}/meal-tasks/${task.task.token}/complete`, { method: "POST", session: member, body: {} });
  assert.equal(taskDone.task.status, "completed");

  const reminderConfig = await request(`${baseUrl}/meal-reminders/config`, { session: owner });
  assert.deepEqual(reminderConfig, { enabled: true, templateId: "mock-meal-template" });
  await assertRejected(`${baseUrl}/meal-reminders`, {
    method: "POST",
    session: owner,
    body: { accepted: false, templateId: "mock-meal-template", scheduledAt: new Date(Date.now() + 60_000).toISOString(), dateKey: "2026-07-24", effortTier: "quick_15" },
  }, 400, "reminder_consent_required");
  const scheduledAt = new Date(Date.now() + 1000).toISOString();
  const reminder = await request(`${baseUrl}/meal-reminders`, {
    method: "POST",
    session: owner,
    body: { accepted: true, templateId: "mock-meal-template", scheduledAt, dateKey: "2026-07-24", effortTier: "quick_15" },
  });
  assert.equal(reminder.reminder.status, "scheduled");
  await processDueMealReminders({ now: new Date(Date.now() + 2000).toISOString() });
  const persistedAfterSend = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(persistedAfterSend.mealReminders.find((entry) => entry.id === reminder.reminder.id).status, "sent");
  assert.equal(persistedAfterSend.mealReminders.find((entry) => entry.id === reminder.reminder.id).attempts, 1);

  const cancellable = await request(`${baseUrl}/meal-reminders`, {
    method: "POST",
    session: owner,
    body: { accepted: true, templateId: "mock-meal-template", scheduledAt: new Date(Date.now() + 120_000).toISOString(), dateKey: "2026-07-25", effortTier: "easy_30" },
  });
  const cancelled = await request(`${baseUrl}/meal-reminders/${cancellable.reminder.id}`, { method: "DELETE", session: owner });
  assert.equal(cancelled.reminder.status, "cancelled");

  const event = await request(`${baseUrl}/product-events`, {
    method: "POST",
    session: member,
    body: {
      eventType: "plan_presented",
      mealRunId: taskPlan.mealRun.id,
      effortTier: "quick_15",
      displayName: "must-not-persist",
      note: "must-not-persist",
    },
  });
  assert.equal(event.ok, true);
  await assertRejected(`${baseUrl}/product-events`, {
    method: "POST",
    session: member,
    body: { eventType: "arbitrary_event" },
  }, 400, "product_event_invalid");
  const persisted = JSON.parse(await readFile(dataFile, "utf8"));
  const savedEvent = persisted.productEvents.at(-1);
  assert.equal(savedEvent.eventType, "plan_presented");
  assert.equal(savedEvent.userId, member.user.id);
  assert.equal(savedEvent.householdId, householdId);
  assert.equal("displayName" in savedEvent, false);
  assert.equal("note" in savedEvent, false);

  const retentionStore = new HumiStore(join(smokeDirectory, "retention.json"));
  await retentionStore.load();
  retentionStore.data.households = [{
    id: householdId,
    ownerId: owner.user.id,
    members: [{ memberId: owner.user.id, role: "owner", status: "formal" }],
  }];
  retentionStore.data.productEvents = [{ id: "old", occurredAt: "2025-01-01T00:00:00.000Z" }];
  await retentionStore.recordProductEvent(owner.user.id, householdId, { eventType: "plan_accepted", effortTier: "quick_15" });
  assert.equal(retentionStore.data.productEvents.some((entry) => entry.id === "old"), false, "raw events older than 180 days must be pruned");

  console.log("Meal execution API smoke test passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(smokeDirectory, { recursive: true, force: true });
}

function mealPlan(householdId, dateKey, idempotencyKey) {
  return {
    householdId,
    dateKey,
    mealSlot: "dinner",
    effortTier: "quick_15",
    recipeIds: ["tomato-egg", "seaweed-egg-soup"],
    idempotencyKey,
  };
}

async function createUser(baseUrl, code, displayName) {
  const session = await request(`${baseUrl}/auth/wechat/login`, { method: "POST", body: { code } });
  const profile = await request(`${baseUrl}/identity/profile`, {
    method: "PUT",
    session,
    body: { displayName, avatarKey: "humi-avatar-family-f-01" },
  });
  return { ...session, user: profile.user };
}

async function request(url, { method = "GET", session, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

async function assertRejected(url, options, status, code) {
  await assert.rejects(
    () => request(url, options),
    (error) => error.status === status && error.code === code,
    `${options.method || "GET"} ${url} should reject with ${status} ${code}`,
  );
}

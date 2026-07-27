import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(new URL("..", import.meta.url).pathname);

await checkTaskPage();
await checkSettingsPage();
console.log("Native family task and household settings action checks passed.");

async function checkTaskPage() {
  const token = "t".repeat(32);
  const formalTask = {
    id: "task-1", householdId: "household-1", mealRunId: "run-1", label: "帮忙洗青菜", type: "prep",
    status: "open", claimedBy: null, claimedByName: "", viewerClaimed: false, viewerCanComplete: false,
  };
  let activeSession = null;
  const requests = [];
  const page = loadPage("miniprogram/packageFamily/pages/task/index.js", {
    "../../../utils/request": {
      rawRequest: async () => ({ task: structuredClone(formalTask) }),
      requestHumi: async (options) => {
        requests.push(options);
        if (!activeSession || activeSession.user.id === "outsider") {
          const error = new Error("household_not_found"); error.code = "household_not_found"; error.status = 404; throw error;
        }
        if (options.path.endsWith("/claim")) return { task: { ...formalTask, status: "claimed", claimedBy: activeSession.user.id, claimedByName: activeSession.user.displayName, viewerClaimed: true, viewerCanComplete: true } };
        return { task: { ...page.data.task, status: "completed", completedBy: activeSession.user.id } };
      },
    },
    "../../../utils/session": {
      getSession: () => activeSession,
      loginWithWechat: async () => {
        activeSession = { accessToken: "member-token", expiresAt: Date.now() + 60_000, user: { id: "member-1", displayName: "小米" } };
        return activeSession;
      },
    },
    "../../../utils/telemetry": { trackEvent() {} },
    "../../../behaviors/shareable-page": shareBehavior(),
  }, { getApp: () => ({ setHumiSession(value) { activeSession = value; } }) });

  await page.onLoad({ token });
  assert.equal(page.data.currentUserId, "", "a guest view remains guest-only");
  assert.equal(page.data.task.claimedByName, "", "a public open task does not invent a formal identity");
  await page.claimTask();
  assert.equal(page.data.currentUserId, "member-1", "claiming binds the authenticated member identity");
  assert.equal(page.data.task.claimedByName, "小米", "the claimed task renders the backend claimant identity");
  assert.equal(requests[0].expectedUserId, "member-1", "a claim replay is pinned to the login identity");
  await page.completeTask();
  await page.completeTask();
  const completes = requests.filter((request) => request.path.endsWith("/complete"));
  assert.equal(completes.length, 2, "an explicit replay reaches the idempotent boundary");
  assert.equal(completes[0].idempotencyKey, completes[1].idempotencyKey, "double complete reuses one stable action key");
  assert.equal(completes[0].expectedUserId, "member-1");

  activeSession = { accessToken: "outsider-token", expiresAt: Date.now() + 60_000, user: { id: "outsider", displayName: "路人" } };
  page.setData({ task: structuredClone(formalTask), currentUserId: "outsider" });
  await page.claimTask();
  assert.match(page.data.errorText, /正式成员/, "a non-member receives a truthful claim denial");

  activeSession = null;
  const claimedGuestPage = loadPage("miniprogram/packageFamily/pages/task/index.js", {
    "../../../utils/request": {
      rawRequest: async () => ({ task: { ...formalTask, status: "claimed", claimedByName: "", viewerClaimed: false, viewerCanComplete: false } }),
      requestHumi: async () => { throw new Error("guest must use the public boundary"); },
    },
    "../../../utils/session": { getSession: () => null, loginWithWechat: async () => null },
    "../../../utils/telemetry": { trackEvent() {} },
    "../../../behaviors/shareable-page": shareBehavior(),
  }, { getApp: () => ({}) });
  await claimedGuestPage.onLoad({ token });
  assert.equal(claimedGuestPage.data.task.claimedByName, "", "a guest task page renders no concrete claimant identity");
  assert.equal(claimedGuestPage.data.task.status, "claimed", "the generic claimed state remains visible to guests");
}

async function checkSettingsPage() {
  const renamed = createSettingsRuntime(householdBootstrap("owner", true));
  renamed.page.updateName({ detail: { value: "周末厨房" } });
  await renamed.page.saveName();
  assert.deepEqual(stripKey(renamed.requests.at(-1)), { path: "/households/household-1", method: "PATCH", data: { name: "周末厨房" } });
  assert.equal(renamed.page.data.household.name, "周末厨房", "rename reloads and renders the server bootstrap truth");
  assert.equal(renamed.responses.at(-1).family.name, "周末厨房", "rename fixture mirrors the real household response shape");

  const transferred = createSettingsRuntime(householdBootstrap("owner", true));
  await transferred.page.transferOwnership({ detail: { memberId: "member-1" } });
  assert.equal(transferred.modals.at(-1).title, "转让家庭创建者？");
  assert.deepEqual(stripKey(transferred.requests.at(-1)), { path: "/households/household-1/owner", method: "POST", data: { memberId: "member-1" } });
  assert.equal(transferred.page.data.household.role, "member", "the former owner reloads as a member after transfer");
  assert.equal(transferred.page.data.members.find((member) => member.id === "member-1").role, "owner");
  assert.deepEqual(transferred.navigations, ["back"]);

  const removed = createSettingsRuntime(householdBootstrap("owner", true));
  await removed.page.removeMember({ detail: { memberId: "member-1" } });
  assert.match(removed.modals.at(-1).title, /移除/);
  assert.deepEqual(stripKey(removed.requests.at(-1)), { path: "/households/household-1/members/member-1", method: "DELETE" });
  assert.deepEqual(removed.page.data.members.map((member) => member.id), ["owner-1"], "member removal reloads the actual remaining member list");

  const left = createSettingsRuntime(householdBootstrap("member", true));
  await left.page.leaveHousehold();
  assert.deepEqual(stripKey(left.requests.at(-1)), { path: "/households/household-1/leave", method: "POST", data: {} });
  assert.equal(left.page.data.status, "empty", "a member leave reloads to no-household state");
  assert.equal(left.page.data.household, null);
  assert.deepEqual(left.navigations, ["back"]);

  const disbanded = createSettingsRuntime(householdBootstrap("owner", false));
  await disbanded.page.leaveHousehold();
  assert.equal(disbanded.modals.at(-1).title, "解散这个家？");
  assert.equal(disbanded.page.data.status, "empty", "sole-owner disband reloads to no-household state");
  assert.deepEqual(disbanded.navigations, ["back"]);

  const blocked = createSettingsRuntime(householdBootstrap("owner", true));
  await blocked.page.leaveHousehold();
  assert.equal(blocked.requests.length, 0, "an owner with other members cannot leave before transfer");
  assert.match(blocked.page.data.errorText, /先转让/);

  const member = createSettingsRuntime(householdBootstrap("member", true));
  await member.page.saveName();
  await member.page.transferOwnership({ detail: { memberId: "member-1" } });
  await member.page.removeMember({ detail: { memberId: "member-1" } });
  assert.equal(member.requests.length, 0, "a member cannot invoke owner-only mutations");

  for (const [failure, message] of [
    [Object.assign(new Error("state version conflict"), { status: 409, code: "state_version_conflict" }), /更新|冲突|重试/],
    [Object.assign(new Error("invalid session"), { status: 401, code: "invalid_session" }), /登录状态已失效|重新登录/],
  ]) {
    const failed = createSettingsRuntime(householdBootstrap("owner", true), failure);
    failed.page.updateName({ detail: { value: "保留输入的名字" } });
    await failed.page.saveName();
    assert.equal(failed.page.data.name, "保留输入的名字", "a failed rename keeps the owner's input");
    assert.match(failed.page.data.errorText, message, "a failed mutation gives recoverable user-facing guidance");
    assert.equal(failed.page.data.pendingAction, "", "a failed mutation never leaves the page hung");
    assert.equal(failed.page.data.household.name, "测试家", "failed optimistic input never overwrites household truth");
  }
}

function createSettingsRuntime(initialBootstrap, initialFailure = null) {
  const requests = [];
  const responses = [];
  const navigations = [];
  const modals = [];
  let bootstrap = structuredClone(initialBootstrap);
  let nextFailure = initialFailure;
  const page = loadPage("miniprogram/packageFamily/pages/settings/index.js", {
    "../../../utils/bootstrap": { loadBootstrap: async () => structuredClone(bootstrap) },
    "../../../utils/household-state": { createMutationId: () => "prefs-key", saveHouseholdStatePatch: async () => bootstrap },
    "../../../utils/request": {
      requestHumi: async (options) => {
        requests.push(options);
        if (nextFailure) { const error = nextFailure; nextFailure = null; throw error; }
        const household = structuredClone(bootstrap.households[0]);
        if (options.method === "PATCH") {
          household.name = options.data.name;
        } else if (options.path.endsWith("/owner")) {
          household.ownerId = options.data.memberId;
          household.role = "member";
          household.members = household.members.map((member) => ({ ...member, role: member.memberId === options.data.memberId ? "owner" : "member" }));
        } else if (options.method === "DELETE") {
          const memberId = options.path.split("/").at(-1);
          household.members = household.members.filter((member) => member.memberId !== memberId);
        } else if (options.path.endsWith("/leave")) {
          bootstrap = { ...bootstrap, activeHouseholdId: "", households: [], householdState: null };
          const response = { family: null, households: [] };
          responses.push(response);
          return response;
        }
        bootstrap = { ...bootstrap, households: [household] };
        const response = { family: structuredClone(household), households: [structuredClone(household)] };
        responses.push(response);
        return response;
      },
    },
    "../../../utils/store": {
      appStore: { getState: () => ({ bootstrap }), replaceBootstrap: (value) => { bootstrap = value; } },
    },
  }, {
    wx: {
      showModal(options) { modals.push(options); options.success({ confirm: true }); },
      navigateBack() { navigations.push("back"); },
      navigateTo() {},
    },
  });
  page.onLoad({ householdId: "household-1" });
  return { page, requests, responses, navigations, modals };
}

function householdBootstrap(role, withMember) {
  const owner = { memberId: "owner-1", nickname: "主理人", avatarKey: "humi-avatar-owner", avatarUrl: "", role: "owner", status: "formal", joinedAt: "2026-07-20T10:00:00.000Z" };
  const member = { memberId: "member-1", nickname: "小米", avatarKey: "humi-avatar-member", avatarUrl: "", role: "member", status: "formal", joinedAt: "2026-07-21T10:00:00.000Z" };
  const current = role === "owner" ? owner : member;
  return {
    stateVersion: "state-v1", activeHouseholdId: "household-1", user: { id: current.memberId },
    households: [{ id: "household-1", name: "测试家", ownerId: "owner-1", role, members: withMember ? [owner, member] : [owner] }],
    householdState: { familyProfile: {} },
  };
}

function stripKey(request) {
  const clone = structuredClone(request);
  delete clone.idempotencyKey;
  return clone;
}

function shareBehavior() {
  return { data: { preparedShares: {}, sharePreparing: {}, shareErrors: {} }, methods: { prepareNativeShare: async () => null, getNativeSharePayload: (_event, fallback) => fallback } };
}

function loadPage(relativePath, stubs, globals = {}) {
  let definition;
  const record = { exports: {} };
  const filename = path.join(root, relativePath);
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    ...globals,
    Page: (candidate) => { definition = candidate; },
    module: record,
    exports: record.exports,
    require: (specifier) => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
      throw new Error(`Unexpected require ${specifier} from ${relativePath}`);
    },
    wx: { navigateTo() {}, ...(globals.wx || {}) },
    console, Date, Math, Promise, Map, encodeURIComponent,
  }, { filename });
  assert(definition, `${relativePath} must register a page`);
  const behaviorMethods = Object.assign({}, ...(definition.behaviors || []).map((behavior) => behavior.methods || {}));
  const behaviorData = Object.assign({}, ...(definition.behaviors || []).map((behavior) => behavior.data || {}));
  return {
    ...behaviorMethods,
    ...definition,
    data: structuredClone({ ...behaviorData, ...(definition.data || {}) }),
    setData(patch) { Object.assign(this.data, patch); },
  };
}

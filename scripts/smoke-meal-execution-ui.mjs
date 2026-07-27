import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const recipes = JSON.parse(await readFile(new URL("../data/recipes.json", import.meta.url), "utf8"));
const cookAssist = JSON.parse(await readFile(new URL("../data/cook-assist.json", import.meta.url), "utf8"));
const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const pantryFixtureNames = [...new Set(recipes.flatMap((recipe) => (
  (recipe.ingredients || []).map((ingredient) => ingredient.name).filter(Boolean)
)))];
const certifiedByTier = new Map(["quick_15", "easy_30", "normal"].map((effortTier) => [
  effortTier,
  new Map(cookAssist
    .filter((assist) => assist.effortTier === effortTier)
    .map((assist) => [recipeById.get(assist.id)?.name, assist.id])
    .filter(([name]) => Boolean(name))),
]));
const tierCases = [
  { effortTier: "quick_15", buttonName: "15 分钟·只求开饭", dishCount: 1 },
  { effortTier: "easy_30", buttonName: "30 分钟·简单做", dishCount: 2 },
  { effortTier: "normal", buttonName: "正常做·今天有精力", dishCount: 2 },
];

const evidenceDir = join(
  process.env.HUMI_PRIVATE_EVIDENCE_DIR || "/Users/honglijie/.humi-release-evidence",
  `meal-execution-ui-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}`,
);
await mkdir(evidenceDir, { recursive: true, mode: 0o700 });

const vite = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  clearScreen: false,
});
await vite.listen();
const address = vite.httpServer.address();
const baseUrl = `http://127.0.0.1:${address.port}/?mealExecutionPreview=1`;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  let cookingFlow = null;
  await verifyMealExecutionFallbackBranches(browser, `http://127.0.0.1:${address.port}/`);
  for (const tierCase of tierCases) {
    const flow = await verifyTierRotation(browser, baseUrl, tierCase);
    if (tierCase.effortTier === "quick_15") cookingFlow = flow;
    else {
      pageErrors.push(...flow.pageErrors);
      await flow.context.close();
    }
  }
  assert(cookingFlow, "the quick tier flow must remain available for the cooking timeline checks");
  const { page } = cookingFlow;

  const plannedDateKey = await page.evaluate(() => (
    JSON.parse(localStorage.getItem("humi:meal-execution-runs:v1") || "[]")[0]?.dateKey
  ));
  assert.match(plannedDateKey, /^\d{4}-\d{2}-\d{2}$/, "accepted plan must retain its business date");
  await page.clock.install({ time: new Date(`${plannedDateKey}T10:00:00.000Z`) });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始做" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "开始做" }).count(), 1, "planned state must expose exactly one start decision");
  assert.equal(await page.getByRole("button", { name: "上桌了" }).count(), 0, "planned state must not expose completion before cooking starts");
  assert.equal(await page.getByTestId("post-cooking-dinner-confirmation").count(), 0, "planned state must not resurrect the legacy dinner confirmation panel");
  await page.getByRole("button", { name: "开始做" }).click();
  await page.getByTestId("meal-cooking-timeline").waitFor();
  assert.equal(await page.getByRole("button", { name: "上桌了" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "太累了" }).count(), 1);
  if (await page.getByRole("button", { name: "下一步" }).count() === 0) {
    assert.equal(
      await page.getByText("先等正在计时的步骤结束", { exact: false }).count(),
      1,
      "H5 rollback must lock a dependent/resource-conflicting step against the actual timer",
    );
    await page.clock.fastForward("31:00");
  }
  await page.getByRole("button", { name: "下一步" }).click();
  const stepAfterAdvance = await page.getByTestId("meal-current-step").textContent();
  const cookingRun = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:meal-execution-runs:v1") || "[]")[0]);
  assert(cookingRun.timers && !Array.isArray(cookingRun.timers), "H5 rollback persists a per-step timer map");
  for (const timer of Object.values(cookingRun.timers)) {
    const step = cookingRun.timeline.steps.find((candidate) => candidate.id === timer.stepId);
    assert.equal(
      Date.parse(timer.endsAt) - Date.parse(timer.startedAt),
      step.durationSeconds * 1000,
      "H5 rollback timer retains the certified full duration",
    );
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("meal-cooking-timeline").waitFor();
  assert.equal(await page.getByTestId("meal-current-step").textContent(), stepAfterAdvance, "cooking progress must survive a reload");
  assert.equal(await page.getByTestId("mobile-primary-navigation").count(), 0, "mobile navigation must not cover active cooking controls");
  await page.getByRole("button", { name: "太累了" }).click();
  await page.getByRole("button", { name: "主食改现成" }).click();
  await page.getByText("即食米饭", { exact: false }).waitFor();

  await page.getByRole("button", { name: "上桌了" }).click();
  await page.getByTestId("meal-completion-sheet").waitFor();
  const completedProductState = await page.evaluate(() => ({
    mealLogs: JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}"),
    pantryItems: JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]"),
  }));
  const completedMealLog = completedProductState.mealLogs[plannedDateKey] || {};
  assert.equal(completedMealLog.confirmation, "all", "canonical completion must update the product dinner record");
  assert.equal(completedMealLog.mealRunId, cookingRun.id, "the product dinner record must point to the canonical MealRun");
  assert.deepEqual(
    [...(completedMealLog.pantryConsumedRecipeIds || [])].sort(),
    [...cookingRun.recipeIds].sort(),
    "canonical completion must consume pantry clues for the recipes that actually reached the table",
  );
  const completedPantryNames = new Set(completedProductState.pantryItems.map((item) => item.name));
  const consumedIngredientNames = cookingRun.recipeIds.flatMap((recipeId) => (
    (recipeById.get(recipeId)?.ingredients || []).map((ingredient) => ingredient.name)
  ));
  assert(
    consumedIngredientNames.every((name) => !completedPantryNames.has(name)),
    "canonical completion must remove consumed ingredients from the hidden pantry clue set",
  );
  await page.getByRole("button", { name: "下次还想吃" }).click();
  await page.getByText("本周做成 1 顿", { exact: false }).waitFor();
  assert.equal(await page.getByTestId("meal-reminder-guest-gate").count(), 1, "guest reminder must require login");

  await page.screenshot({ path: join(evidenceDir, "weekly-two-meals-mobile.png"), fullPage: true });
  pageErrors.push(...cookingFlow.pageErrors);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ok: true, evidenceDir, checks: [
    "three effort tiers",
    "quick, easy, and normal each show five real non-repeating groups",
    "each tier disables rotation while advancing and re-enables afterward",
    "same-tick rapid taps advance each tier cursor once",
    "each tier accepts the exact recipes currently shown on screen",
    "plan acceptance is not completion",
    "actual per-step timers lock unsafe progress and keep certified duration",
    "background time recovery unlocks the next step",
    "cooking progress survives reload",
    "downgrade remains available",
    "explicit serving counts one weekly completion",
    "guest reminder stays login-gated",
  ] }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}

async function verifyMealExecutionFallbackBranches(browser, stableBaseUrl) {
  const disabled = await openCapabilityFixture(browser, stableBaseUrl, { mealExecution: false });
  await disabled.page.getByTestId("tonight-primary-action").waitFor();
  assert.equal(await disabled.page.getByTestId("meal-execution-experience").count(), 0, "disabled capability must retain the stable Tonight experience");
  await disabled.context.close();

  const enabled = await openCapabilityFixture(browser, stableBaseUrl, { mealExecution: true });
  await enabled.page.getByTestId("meal-execution-experience").waitFor();
  assert.equal(await enabled.page.getByTestId("tonight-primary-action").count(), 0, "enabled capability must select the MealRun experience");
  await enabled.context.close();

  const failed = await openCapabilityFixture(browser, stableBaseUrl, { mealExecution: true, currentRunStatus: 503 });
  assert.equal(failed.currentRunRequests(), 1, "enabled capability must attempt the actual current MealRun API boundary");
  await failed.page.getByTestId("tonight-primary-action").waitFor();
  assert.equal(await failed.page.getByTestId("meal-execution-experience").count(), 0, "MealRun API failure must recover to the stable Tonight experience");
  await failed.context.close();
}

async function openCapabilityFixture(browser, stableBaseUrl, { mealExecution, currentRunStatus = 200 }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "meal-fallback-owner-token",
      refreshToken: "meal-fallback-owner-token",
      expiresAt: Date.now() + 60_000,
      user: {
        id: "meal-fallback-owner",
        displayName: "主厨",
        provider: "wechat",
        profileStatus: "complete",
      },
    }));
  });
  const page = await context.newPage();
  const family = {
    id: "meal-fallback-family",
    name: "回退测试家",
    role: "owner",
    currentMemberId: "meal-fallback-owner",
    members: [{ memberId: "meal-fallback-owner", nickname: "主厨", role: "owner", status: "formal" }],
  };
  let currentRunRequests = 0;
  await page.route("**/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      state: null,
      family,
      households: [family],
      capabilities: { mealExecution },
    }),
  }));
  await page.route("**/meal-runs/current?**", (route) => {
    currentRunRequests += 1;
    return route.fulfill({
      status: currentRunStatus,
      contentType: "application/json",
      body: JSON.stringify(currentRunStatus === 200 ? { mealRun: null } : { error: "temporary_failure", message: "temporary failure" }),
    });
  });
  await page.route("**/recommendations/dinner", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "temporary_failure", message: "temporary failure" }),
  }));
  await page.route("**/product-events", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.goto(stableBaseUrl, { waitUntil: "networkidle" });
  return { context, page, currentRunRequests: () => currentRunRequests };
}

async function verifyTierRotation(browser, targetUrl, tierCase) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript((pantryNames) => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.removeItem("humi:identity-session:v1");
    localStorage.setItem("family-menu:pantry-items", JSON.stringify(
      pantryNames.map((name, index) => ({
        key: `meal-execution-pantry-${index}`,
        name,
        amount: "",
        source: "测试食材线索",
      })),
    ));
    if (!sessionStorage.getItem("humi:meal-execution-test-initialized")) {
      localStorage.removeItem("humi:meal-execution-runs:v1");
      localStorage.removeItem("humi:meal-effort-tier:v1");
      sessionStorage.setItem("humi:meal-execution-test-initialized", "1");
    }
  }, pantryFixtureNames);

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  const experience = page.getByTestId("meal-execution-experience");
  await experience.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await page.getByTestId("meal-effort-tier").count(), 3, "Tonight must show three effort choices");
  await page.getByRole("button", { name: tierCase.buttonName }).click();
  await page.waitForFunction(
    (dishCount) => document.querySelectorAll('[data-testid="meal-plan-recipe"]').length === dishCount,
    tierCase.dishCount,
  );

  const certifiedByName = certifiedByTier.get(tierCase.effortTier);
  const readDisplayedNames = async () => (await experience.getByTestId("meal-plan-recipe").allTextContents())
    .map((name) => name.trim());
  const assertDisplayedGroup = async () => {
    const names = await readDisplayedNames();
    assert.equal(
      names.length,
      tierCase.dishCount,
      `${tierCase.effortTier} must display ${tierCase.dishCount} certified recipes`,
    );
    assert(
      names.every((name) => certifiedByName.has(name)),
      `${tierCase.effortTier} must display only recipes certified for that effort tier`,
    );
    return names;
  };

  const acceptPlan = page.getByRole("button", { name: "就做这顿" });
  const rotatePlan = page.getByRole("button", { name: "换一组" });
  await acceptPlan.waitFor();
  assert.equal(await acceptPlan.count(), 1, `${tierCase.effortTier} must have one primary acceptance action`);
  assert.equal(await rotatePlan.count(), 1, `${tierCase.effortTier} must have one rotate action`);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "换一组");
    return Boolean(button && !button.disabled);
  });
  assert.equal(await acceptPlan.isEnabled(), true, `${tierCase.effortTier} acceptance must enable after loading`);

  let displayedNames = await assertDisplayedGroup();
  const groupSignatures = new Set([displayedNames.join("|")]);
  const seenRecipeNames = new Set(displayedNames);
  const firstPreviousSignature = displayedNames.join("|");
  assert.equal(
    await clickRotateAndObserveDisabled(page),
    true,
    `${tierCase.effortTier} rotate must disable while the next group is loading`,
  );
  await waitForDisplayedGroupChange(page, firstPreviousSignature);
  displayedNames = await assertDisplayedGroup();
  groupSignatures.add(displayedNames.join("|"));
  displayedNames.forEach((name) => seenRecipeNames.add(name));

  for (let groupIndex = 2; groupIndex < 5; groupIndex += 1) {
    const previousSignature = displayedNames.join("|");
    await rotatePlan.click();
    await waitForDisplayedGroupChange(page, previousSignature);
    displayedNames = await assertDisplayedGroup();
    groupSignatures.add(displayedNames.join("|"));
    displayedNames.forEach((name) => seenRecipeNames.add(name));
    assert.equal(await rotatePlan.isEnabled(), true, `${tierCase.effortTier} rotate must re-enable after group ${groupIndex + 1}`);
  }
  assert.equal(groupSignatures.size, 5, `${tierCase.effortTier} must show five distinct groups`);
  assert.equal(
    seenRecipeNames.size,
    tierCase.dishCount * 5,
    `${tierCase.effortTier} must not repeat a recipe inside its first five groups`,
  );

  const cursorBeforeRapidTap = await currentTierCursor(page, tierCase.effortTier);
  const beforeRapidTapSignature = displayedNames.join("|");
  await page.evaluate(() => {
    const rotate = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "换一组");
    rotate?.click();
    rotate?.click();
  });
  await waitForDisplayedGroupChange(page, beforeRapidTapSignature);
  const cursorAfterRapidTap = await currentTierCursor(page, tierCase.effortTier);
  assert.equal(
    cursorAfterRapidTap.recentGroupIds.length,
    cursorBeforeRapidTap.recentGroupIds.length + 1,
    `${tierCase.effortTier} same-tick rapid taps must advance exactly one group`,
  );
  assert.equal(await rotatePlan.isEnabled(), true, `${tierCase.effortTier} rotate must re-enable after a rapid tap`);

  displayedNames = await assertDisplayedGroup();
  const displayedRecipeIds = displayedNames.map((name) => certifiedByName.get(name));
  await acceptPlan.click();
  await page.getByRole("button", { name: "开始做" }).waitFor();
  const plannedRuns = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:meal-execution-runs:v1") || "[]"));
  assert.equal(plannedRuns[0]?.status, "planned", `${tierCase.effortTier} acceptance must create a planned MealRun`);
  assert.equal(plannedRuns[0]?.effortTier, tierCase.effortTier, `${tierCase.effortTier} must persist its selected tier`);
  assert.deepEqual(
    plannedRuns[0]?.recipeIds,
    displayedRecipeIds,
    `${tierCase.effortTier} planned MealRun must retain the recipes currently shown on screen`,
  );
  await page.screenshot({
    path: join(evidenceDir, `${tierCase.effortTier}-five-groups-accepted.png`),
    fullPage: true,
  });
  return { context, page, pageErrors };
}

async function clickRotateAndObserveDisabled(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "换一组");
    if (!button) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      if (button.disabled) finish(true);
    });
    observer.observe(button, { attributes: true, attributeFilter: ["disabled"] });
    const timeout = window.setTimeout(() => finish(false), 1_000);
    button.click();
    if (button.disabled) finish(true);
  }));
}

async function waitForDisplayedGroupChange(page, previousSignature) {
  await page.waitForFunction((previous) => {
    const current = [...document.querySelectorAll('[data-testid="meal-plan-recipe"]')]
      .map((node) => node.textContent?.trim())
      .join("|");
    return Boolean(current && current !== previous);
  }, previousSignature);
}

async function currentTierCursor(page, effortTier) {
  return page.evaluate((tier) => {
    const key = Object.keys(localStorage).find((candidate) => (
      candidate.startsWith("humi:recommendation:v1:guest:")
      && candidate.includes(`:meal_execution:${tier}:`)
    ));
    const cursor = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    return {
      cycle: Number(cursor?.cycle || 0),
      seenRecipeIds: Array.isArray(cursor?.seenRecipeIds) ? cursor.seenRecipeIds : [],
      recentGroupIds: Array.isArray(cursor?.recentGroupIds) ? cursor.recentGroupIds : [],
    };
  }, effortTier);
}

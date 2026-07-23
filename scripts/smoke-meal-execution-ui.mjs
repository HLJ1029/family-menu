import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const recipes = JSON.parse(await readFile(new URL("../data/recipes.json", import.meta.url), "utf8"));
const cookAssist = JSON.parse(await readFile(new URL("../data/cook-assist.json", import.meta.url), "utf8"));
const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const quickCertifiedByName = new Map(cookAssist
  .filter((assist) => assist.effortTier === "quick_15")
  .map((assist) => [recipeById.get(assist.id)?.name, assist.id])
  .filter(([name]) => Boolean(name)));

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
  await page.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.removeItem("humi:identity-session:v1");
    if (!sessionStorage.getItem("humi:meal-execution-test-initialized")) {
      localStorage.removeItem("humi:meal-execution-runs:v1");
      localStorage.removeItem("humi:meal-effort-tier:v1");
      sessionStorage.setItem("humi:meal-execution-test-initialized", "1");
    }
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const experience = page.getByTestId("meal-execution-experience");
  await experience.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await page.getByTestId("meal-effort-tier").count(), 3, "Tonight must show three effort choices");
  await page.getByRole("button", { name: "15 分钟·只求开饭" }).click();
  const acceptPlan = page.getByRole("button", { name: "就做这顿" });
  await acceptPlan.waitFor();
  assert.equal(await acceptPlan.count(), 1, "the plan has one primary acceptance action");
  assert.equal(await acceptPlan.isEnabled(), true, "the rotated plan must finish loading before it can be accepted");
  const readDisplayedQuickNames = async () => (await experience.getByTestId("meal-plan-recipe").allTextContents())
    .map((name) => name.trim())
    .filter((name) => quickCertifiedByName.has(name));
  let displayedQuickNames = await readDisplayedQuickNames();
  assert.equal(displayedQuickNames.length, 1, "the 15-minute plan must display one certified quick recipe");
  const seenQuickNames = new Set(displayedQuickNames);
  const rotatePlan = page.getByRole("button", { name: "换一组" });
  assert.equal(await rotatePlan.count(), 1, "effort plans need an explicit rotate action");
  for (let index = 0; index < 5; index += 1) {
    const previousName = displayedQuickNames[0];
    await rotatePlan.click();
    await page.waitForFunction((previous) => {
      const current = document.querySelector('[data-testid="meal-plan-recipe"]')?.textContent?.trim();
      return Boolean(current && current !== previous);
    }, previousName);
    displayedQuickNames = await readDisplayedQuickNames();
    assert.equal(displayedQuickNames.length, 1, "every rotated 15-minute plan stays certified and non-empty");
    seenQuickNames.add(displayedQuickNames[0]);
  }
  assert.equal(seenQuickNames.size, 6, "five real rotate actions must produce five new quick plans");

  const cursorSizeBeforeRapidTap = await currentQuickCursorSize(page);
  const beforeRapidTapName = displayedQuickNames[0];
  await page.evaluate(() => {
    const rotate = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "换一组");
    rotate?.click();
    rotate?.click();
  });
  await page.waitForFunction((previous) => {
    const current = document.querySelector('[data-testid="meal-plan-recipe"]')?.textContent?.trim();
    return Boolean(current && current !== previous);
  }, beforeRapidTapName);
  assert.equal(
    await currentQuickCursorSize(page),
    cursorSizeBeforeRapidTap + 1,
    "two same-tick taps must advance the persisted cursor only once",
  );
  displayedQuickNames = await readDisplayedQuickNames();
  await acceptPlan.click();
  await page.getByRole("button", { name: "开始做" }).waitFor();
  const plannedRuns = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:meal-execution-runs:v1") || "[]"));
  assert.equal(plannedRuns[0]?.status, "planned", "accepting a rotated plan must create a planned MealRun");
  assert.deepEqual(
    plannedRuns[0]?.recipeIds,
    displayedQuickNames.map((name) => quickCertifiedByName.get(name)),
    "the planned MealRun must retain the certified recipe shown to the user",
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始做" }).waitFor();
  await page.getByRole("button", { name: "开始做" }).click();
  await page.getByTestId("meal-cooking-timeline").waitFor();
  assert.equal(await page.getByRole("button", { name: "上桌了" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "太累了" }).count(), 1);
  await page.getByRole("button", { name: "下一步" }).click();
  const stepAfterAdvance = await page.getByTestId("meal-current-step").textContent();

  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("meal-cooking-timeline").waitFor();
  assert.equal(await page.getByTestId("meal-current-step").textContent(), stepAfterAdvance, "cooking progress must survive a reload");
  assert.equal(await page.getByTestId("mobile-primary-navigation").count(), 0, "mobile navigation must not cover active cooking controls");
  await page.getByRole("button", { name: "太累了" }).click();
  await page.getByRole("button", { name: "主食改现成" }).click();
  await page.getByText("即食米饭", { exact: false }).waitFor();

  await page.getByRole("button", { name: "上桌了" }).click();
  await page.getByTestId("meal-completion-sheet").waitFor();
  await page.getByRole("button", { name: "下次还想吃" }).click();
  await page.getByText("本周做成 1 顿", { exact: false }).waitFor();
  assert.equal(await page.getByTestId("meal-reminder-guest-gate").count(), 1, "guest reminder must require login");

  await page.screenshot({ path: join(evidenceDir, "weekly-two-meals-mobile.png"), fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ok: true, evidenceDir, checks: [
    "three effort tiers",
    "rotated quick plan uses a certified recipe",
    "five explicit rotations stay non-repeating",
    "rapid taps advance the cursor once",
    "accepting the displayed recipe creates a matching planned run",
    "plan acceptance is not completion",
    "cooking progress survives reload",
    "downgrade remains available",
    "explicit serving counts one weekly completion",
    "guest reminder stays login-gated",
  ] }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}

async function currentQuickCursorSize(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => (
      candidate.startsWith("humi:recommendation:v1:guest:")
      && candidate.includes(":meal_execution:quick_15:")
    ));
    const cursor = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
    return Array.isArray(cursor?.seenRecipeIds) ? cursor.seenRecipeIds.length : 0;
  });
}

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const DEFAULT_BASE_URL = "https://www.humi-home.com/";
const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(args.baseUrl || process.env.HUMI_PRODUCT_SMOKE_BASE_URL || DEFAULT_BASE_URL);
const evidenceDir = args.evidenceDir
  || process.env.HUMI_PRODUCT_SMOKE_EVIDENCE_DIR
  || join(process.env.HUMI_PRIVATE_EVIDENCE_DIR || DEFAULT_PRIVATE_DIR, `product-entrypoint-smoke-${timestamp}`);
const minRecipeCards = Number.parseInt(args.minRecipeCards || process.env.HUMI_PRODUCT_SMOKE_MIN_RECIPE_CARDS || "20", 10);

await mkdir(evidenceDir, { recursive: true, mode: 0o700 });

let browser;
try {
  browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  let craveCreatePayload = null;
  await page.addInitScript(() => {
    window.__humiMiniProgramCalls = [];
    window.wx = {
      miniProgram: {
        postMessage(payload) {
          window.__humiMiniProgramCalls.push({ method: "postMessage", payload });
        },
        navigateTo(payload) {
          window.__humiMiniProgramCalls.push({ method: "navigateTo", payload });
        },
      },
    };
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.route("**/state", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const payload = request.postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: payload.state }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        family: buildSmokeFamily(),
        households: [buildSmokeFamily()],
        state: buildSmokeHouseholdState(),
      }),
    });
  });

  await page.route("**/crave-requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    craveCreatePayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ownerSecret: "product-smoke-owner-secret",
        request: {
          id: "product-smoke-crave",
          token: "product-smoke-token",
          householdName: "我家",
          initiatorName: "主厨",
          recipientCount: 1,
          status: "collecting",
          votes: [],
          deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route("**/grocery-shares", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        share: {
          id: "product-smoke-grocery",
          token: "product-smoke-grocery-token",
          householdName: "我家",
          initiatorName: "主厨",
          items: [{ key: "ingredient:tomato", name: "西红柿", amount: "约2个" }],
        },
      }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await seedGuestDinnerState(page);
  await page.reload({ waitUntil: "networkidle" });
  await installMiniProgramMock(page);
  const tonightViewport = await verifyTonightPrimaryViewport(browser, baseUrl, evidenceDir);

  await openTodayMenu(page);
  await page.getByRole("button", { name: "发现新菜" }).first().click();
  await page.getByRole("heading", { name: "全部菜品库" }).first().waitFor({ timeout: 15_000 });
  const discoveryTitle = await page.getByRole("heading", { name: "全部菜品库" }).first().isVisible();
  await page.getByRole("heading", { name: "今晚已安排" }).waitFor({ timeout: 15_000 });
  const selectedRecipeCount = await page.locator('[data-testid="selected-recipes-panel"] article').count();
  const recipeCards = await page.getByTestId("recipe-card").count();
  const arrangedBeforeFilters = await page.evaluate(() => {
    const arranged = [...document.querySelectorAll("h3")].find((node) => node.textContent?.includes("今晚已安排"));
    const allFilter = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim() === "全部");
    if (!arranged || !allFilter) return false;
    return Boolean(arranged.compareDocumentPosition(allFilter) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const discoveryScreenshot = join(evidenceDir, "discovery-mobile.png");
  const discoveryFullScreenshot = join(evidenceDir, "discovery-mobile-full.png");
  await page.screenshot({ path: discoveryScreenshot });
  await page.screenshot({ path: discoveryFullScreenshot, fullPage: true });

  await page.getByRole("button", { name: "今晚", exact: true }).click();
  await page.getByRole("button", { name: "选早餐吃什么" }).click();
  await page.getByRole("heading", { name: "给早餐选菜" }).first().waitFor({ timeout: 15_000 });
  const breakfastBeforePick = await readTodayMealSlot(page, "breakfast");
  await page.getByRole("button", { name: "加入 西红柿炒鸡蛋" }).click();
  await page.getByRole("heading", { name: "早餐已选择" }).waitFor({ timeout: 15_000 });
  const breakfastAfterPick = await readTodayMealSlot(page, "breakfast");

  await page.getByRole("button", { name: "清单", exact: true }).click();
  await waitForTransientUi(page);
  const inventoryMaintenanceHidden = await page.getByText("后台已有", { exact: true }).count() === 0;
  const groceryNutritionEntryHidden = await page.getByRole("button", { name: "营养视图" }).count() === 0;
  const groceryScreenshot = join(evidenceDir, "grocery-mobile.png");
  await page.screenshot({ path: groceryScreenshot, fullPage: true });
  await page.getByRole("button", { name: "分享买菜清单" }).click();
  await page.getByText("已打开买菜分享卡片").waitFor({ timeout: 15_000 });

  await page.getByRole("button", { name: "我的家" }).click();
  const groceryActivityVisible = await page.getByText("家人小林在买 牛奶").isVisible();
  const dinnerActivityVisible = await page.getByText("主厨确认今晚已做饭").isVisible();
  const wantActivityVisible = await page.getByText("家人小林想吃 冬瓜排骨汤").isVisible();
  const craveStarterCollapsed = await page.getByRole("heading", { name: "今晚想问谁？" }).count() === 0;
  const activityBeforeAccountSettings = await page.evaluate(() => {
    const activity = document.querySelector('[data-testid="family-activity-section"]');
    const account = document.querySelector('[data-testid="cloud-account-section"]');
    if (!activity || !account) return false;
    return Boolean(activity.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const familyActivityScreenshot = join(evidenceDir, "family-activity-mobile.png");
  await page.getByTestId("family-activity-section").screenshot({ path: familyActivityScreenshot });
  await page.getByRole("button", { name: "问问大家" }).first().click();
  await page.getByRole("heading", { name: "今晚想问谁？" }).waitFor({ timeout: 15_000 });
  const selectedFamilyMember = await page.getByRole("button", { name: "家人小林" }).getAttribute("aria-pressed");
  await page.getByRole("button", { name: "发给 1 位家人" }).click();
  await page.waitForSelector("text=今晚征集单已在我的家展开", { timeout: 15_000 });
  await page.getByRole("button", { name: "查看征集单" }).first().click();
  await page.waitForSelector("text=今晚征集单已经在我的家展开", { timeout: 15_000 });
  const craveSheetVisible = await page.getByText("大家点了什么感觉").isVisible();
  const viewButtonVisible = await page.getByRole("button", { name: "查看征集单" }).first().isVisible();
  const miniProgramCalls = await page.evaluate(() => window.__humiMiniProgramCalls ?? []);
  const grocerySharePosted = miniProgramCalls.some((call) => call.method === "postMessage" && call.payload?.data?.type === "humi:share-grocery");
  const groceryShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=grocery"));
  const craveSharePosted = miniProgramCalls.some((call) => call.method === "postMessage" && call.payload?.data?.type === "humi:share-crave");
  const craveShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=crave"));
  const userCraveScreenshot = join(evidenceDir, "user-crave-mobile.png");
  await page.screenshot({ path: userCraveScreenshot, fullPage: true });
  const memberBoundary = await verifyMemberOwnerBoundary(browser, baseUrl, evidenceDir);
  const persistedCraveDeadline = await verifyPersistedCraveDeadline(browser, baseUrl, evidenceDir);
  const pantryPipeline = await verifyImplicitPantryPipeline(browser, baseUrl);

  const checks = [
    { key: "tonight-primary-action-is-in-first-viewport", ok: tonightViewport.primaryInFirstViewport, actual: tonightViewport.primaryBox },
    { key: "breakfast-and-lunch-follow-dinner-decision", ok: tonightViewport.mealRhythmAfterPrimary },
    { key: "full-library-title", ok: discoveryTitle },
    { key: "full-library-card-count", ok: recipeCards + selectedRecipeCount >= minRecipeCards, actual: recipeCards + selectedRecipeCount, expectedAtLeast: minRecipeCards },
    { key: "arranged-dishes-before-library-filters", ok: arrangedBeforeFilters },
    { key: "breakfast-empty-before-user-pick", ok: breakfastBeforePick.length === 0, actual: breakfastBeforePick },
    { key: "breakfast-saves-user-picked-dish", ok: breakfastAfterPick.some((entry) => entry.recipeId === "tomato-egg"), actual: breakfastAfterPick },
    { key: "breakfast-does-not-default-to-seaweed-soup", ok: !breakfastAfterPick.some((entry) => entry.recipeId === "seaweed-egg-soup"), actual: breakfastAfterPick },
    { key: "grocery-share-posts-miniprogram-card", ok: grocerySharePosted },
    { key: "grocery-share-opens-native-share-page", ok: groceryShareOpened },
    { key: "inventory-maintenance-is-not-exposed", ok: inventoryMaintenanceHidden },
    { key: "nutrition-entry-is-not-on-grocery-tab", ok: groceryNutritionEntryHidden },
    { key: "crave-share-posts-miniprogram-card", ok: craveSharePosted },
    { key: "crave-share-opens-native-share-page", ok: craveShareOpened },
    { key: "crave-members-default-selected", ok: selectedFamilyMember === "true", actual: selectedFamilyMember },
    { key: "crave-create-keeps-selected-members", ok: craveCreatePayload?.recipientIds?.includes("product-smoke-member"), actual: craveCreatePayload?.recipientIds ?? [] },
    { key: "user-center-crave-sheet", ok: craveSheetVisible },
    { key: "user-center-view-crave-button", ok: viewButtonVisible },
    { key: "family-activity-shows-grocery-claim", ok: groceryActivityVisible },
    { key: "family-activity-shows-dinner-confirmation", ok: dinnerActivityVisible },
    { key: "family-activity-shows-want-item", ok: wantActivityVisible },
    { key: "family-activity-precedes-account-settings", ok: activityBeforeAccountSettings },
    { key: "crave-starter-is-collapsed-until-requested", ok: craveStarterCollapsed },
    { key: "member-menu-action-is-blocked", ok: memberBoundary.blocked },
    { key: "member-menu-stays-unchanged", ok: memberBoundary.menuBefore.length === 0 && memberBoundary.menuAfter.length === 0, actual: memberBoundary },
    { key: "member-cannot-edit-owner-want-item", ok: memberBoundary.ownerWantActions === 0, actual: memberBoundary.ownerWantActions },
    { key: "member-can-edit-own-want-item", ok: memberBoundary.memberCanEditOwnWant },
    { key: "member-cannot-add-want-item-to-dinner", ok: !memberBoundary.memberCanAddWantToDinner },
    { key: "member-cannot-start-crave-from-user-center", ok: memberBoundary.memberUserCenterAskButtons === 0, actual: memberBoundary.memberUserCenterAskButtons },
    { key: "member-cannot-start-crave-from-dashboard", ok: memberBoundary.memberDashboardAskButtons === 0, actual: memberBoundary.memberDashboardAskButtons },
    { key: "member-boundary-page-errors", ok: memberBoundary.pageErrors.length === 0, errors: memberBoundary.pageErrors },
    { key: "persisted-crave-auto-generates-after-deadline", ok: persistedCraveDeadline.generated },
    { key: "no-reply-crave-keeps-initiator-feeling", ok: persistedCraveDeadline.initiatorFeelingApplied },
    { key: "persisted-crave-closes-with-owner-session", ok: persistedCraveDeadline.closeAuthorized },
    { key: "persisted-crave-page-errors", ok: persistedCraveDeadline.pageErrors.length === 0, errors: persistedCraveDeadline.pageErrors },
    { key: "grocery-check-adds-hidden-pantry-clue", ok: pantryPipeline.addedAfterCheck, actual: pantryPipeline.pantryAfterCheck },
    { key: "dinner-confirmation-consumes-hidden-pantry-clue", ok: pantryPipeline.removedAfterDinner, actual: pantryPipeline.pantryAfterDinner },
    { key: "dinner-confirmation-writes-meal-log", ok: pantryPipeline.mealLogged, actual: pantryPipeline.mealLog },
    { key: "implicit-pantry-pipeline-page-errors", ok: pantryPipeline.pageErrors.length === 0, errors: pantryPipeline.pageErrors },
    { key: "page-errors", ok: pageErrors.length === 0, errors: pageErrors },
  ];
  const manifest = {
    ok: checks.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    baseUrl,
    evidenceDir,
    screenshots: {
      tonightFirstViewportMobile: tonightViewport.screenshot,
      discoveryMobile: discoveryScreenshot,
      discoveryMobileFull: discoveryFullScreenshot,
      userCraveMobile: userCraveScreenshot,
      groceryMobile: groceryScreenshot,
      familyActivityMobile: familyActivityScreenshot,
      memberBoundaryMobile: memberBoundary.screenshot,
      persistedCraveDeadlineMobile: persistedCraveDeadline.screenshot,
    },
    checks,
    nextActions: [
      "If this fails on production, verify the latest GitHub Pages deployment and rerun with --base-url.",
      "This smoke test intercepts POST /crave-requests, so it does not create real collaboration records.",
    ],
  };

  await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(manifest, null, 2));
  if (!manifest.ok) process.exit(1);
} catch (error) {
  const failure = {
    ok: false,
    checkedAt: new Date().toISOString(),
    baseUrl,
    evidenceDir,
    error: error.message,
  };
  await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
} finally {
  if (browser) await browser.close();
}

async function seedGuestDinnerState(page) {
  const today = getLocalDateKey();
  await page.evaluate((todayDateKey) => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "product-smoke-access-token",
      refreshToken: "product-smoke-access-token",
      user: {
        id: "product-smoke-owner",
        displayName: "主厨",
        provider: "wechat",
      },
    }));
    localStorage.setItem("family-menu:today-menu", JSON.stringify([{ recipeId: "tomato-egg", quantity: 1 }]));
    localStorage.setItem("humi:meal-plan:v1", JSON.stringify({
      [todayDateKey]: {
        breakfast: [],
        lunch: [],
        dinner: [{ recipeId: "tomato-egg", quantity: 1 }],
      },
    }));
  }, today);
}

async function verifyTonightPrimaryViewport(browser, base, evidenceDir) {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const family = buildSmokeFamily();
  const emptyDinnerState = {
    ...buildSmokeHouseholdState(),
    todayMenu: [],
    mealPlan: {},
    mealLogs: {},
  };
  await page.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "product-smoke-owner-token",
      refreshToken: "product-smoke-owner-token",
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat" },
    }));
    localStorage.setItem("family-menu:today-menu", "[]");
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: payload.state, family, households: [family] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: emptyDinnerState, family, households: [family] }) });
  });
  await page.goto(base, { waitUntil: "networkidle" });
  const primary = page.getByTestId("tonight-primary-action");
  await primary.waitFor({ timeout: 15_000 });
  const primaryBox = await primary.boundingBox();
  const primaryInFirstViewport = Boolean(
    primaryBox
    && primaryBox.y >= 0
    && primaryBox.y + primaryBox.height <= viewport.height - 96,
  );
  const mealRhythmAfterPrimary = await page.evaluate(() => {
    const action = document.querySelector('[data-testid="tonight-primary-action"]');
    const mealRhythm = document.querySelector('[data-testid="meal-rhythm-panel"]');
    if (!action || !mealRhythm) return false;
    return Boolean(action.compareDocumentPosition(mealRhythm) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const screenshot = join(evidenceDir, "tonight-first-viewport-mobile.png");
  await page.screenshot({ path: screenshot });
  await context.close();
  return { primaryInFirstViewport, mealRhythmAfterPrimary, primaryBox, screenshot };
}

async function installMiniProgramMock(page) {
  await page.evaluate(() => {
    window.__humiMiniProgramCalls = [];
    window.wx = window.wx || {};
    window.wx.miniProgram = {
      postMessage(payload) {
        window.__humiMiniProgramCalls.push({ method: "postMessage", payload });
      },
      navigateTo(payload) {
        window.__humiMiniProgramCalls.push({ method: "navigateTo", payload });
      },
    };
  });
}

function buildSmokeFamily() {
  return {
    id: "product-smoke-family",
    name: "我家",
    ownerId: "product-smoke-owner",
    currentMemberId: "product-smoke-owner",
    role: "owner",
    members: [
      { memberId: "product-smoke-owner", nickname: "主厨", role: "owner", status: "formal" },
      { memberId: "product-smoke-member", nickname: "家人小林", role: "member", status: "formal" },
    ],
  };
}

function buildSmokeHouseholdState() {
  const today = getLocalDateKey();
  return {
    todayMenu: [{ recipeId: "tomato-egg", quantity: 1 }],
    mealPlan: {
      [today]: {
        breakfast: [],
        lunch: [],
        dinner: [{ recipeId: "tomato-egg", quantity: 1 }],
      },
    },
    mealLogs: {
      [today]: {
        source: "home",
        confirmation: "all",
        actorMemberId: "product-smoke-owner",
        actorName: "主厨",
        updatedAt: new Date().toISOString(),
      },
    },
    groceryClaims: {
      "custom:milk": {
        itemKey: "custom:milk",
        itemName: "牛奶",
        memberId: "product-smoke-member",
        memberName: "家人小林",
        status: "claimed",
        claimedAt: new Date().toISOString(),
      },
    },
    wantToEatItems: [{
      id: "want:product-smoke-member",
      title: "冬瓜排骨汤",
      recipeId: "wintermelon-rib-soup",
      memberId: "product-smoke-member",
      memberName: "家人小林",
      status: "open",
      createdAt: new Date().toISOString(),
    }],
  };
}

async function openTodayMenu(page) {
  await waitForTransientUi(page);
  const viewToday = page.getByRole("button", { name: "查看今晚菜单" }).first();
  if (await viewToday.isVisible().catch(() => false)) {
    await viewToday.click();
    return;
  }

  const acceptRecommendation = page.getByRole("button", { name: /今晚就做|就做选中的/ }).first();
  if (await acceptRecommendation.isVisible().catch(() => false)) {
    await acceptRecommendation.click();
    await waitForTransientUi(page);
    await page.getByRole("button", { name: "查看今晚菜单" }).first().click();
    return;
  }

  throw new Error("Could not find an entry to the Today menu.");
}

async function readTodayMealSlot(page, slotId) {
  const today = getLocalDateKey();
  return page.evaluate(({ dateKey, targetSlotId }) => {
    const mealPlan = JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}");
    return mealPlan?.[dateKey]?.[targetSlotId] ?? [];
  }, { dateKey: today, targetSlotId: slotId });
}

async function waitForTransientUi(page) {
  await page.locator(".toast-enter").waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {});
}

async function verifyMemberOwnerBoundary(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const memberFamily = {
    id: "product-smoke-family",
    name: "我家",
    ownerId: "product-smoke-owner",
    currentMemberId: "product-smoke-member",
    role: "member",
    members: [
      { memberId: "product-smoke-owner", nickname: "主厨", role: "owner", status: "formal" },
      { memberId: "product-smoke-member", nickname: "家人小林", role: "member", status: "formal" },
    ],
  };
  const state = {
    ...buildSmokeHouseholdState(),
    todayMenu: [],
    mealPlan: {},
    wantToEatItems: [
      {
        id: "want:owner",
        title: "主厨想吃的菜",
        memberId: "product-smoke-owner",
        memberName: "主厨",
        status: "open",
      },
      {
        id: "want:member",
        title: "家人想吃的菜",
        memberId: "product-smoke-member",
        memberName: "家人小林",
        status: "open",
      },
    ],
  };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "product-smoke-member-token",
      refreshToken: "product-smoke-member-token",
      user: { id: "product-smoke-member", displayName: "家人小林", provider: "wechat" },
    }));
    localStorage.setItem("family-menu:today-menu", "[]");
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state, family: memberFamily, households: [memberFamily] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state, family: memberFamily, households: [memberFamily] }) });
  });
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/state") && response.request().method() === "GET", { timeout: 15_000 }),
    page.goto(base, { waitUntil: "networkidle" }),
  ]);
  await page.getByRole("button", { name: "我的家", exact: true }).click();
  await page.waitForTimeout(1_000);
  const memberRoleHeading = page.getByRole("heading", { name: /里的家人$/ });
  if (!await memberRoleHeading.isVisible().catch(() => false)) {
    const headings = await page.locator("h1, h2, h3").allTextContents();
    throw new Error(`Member family role did not load: ${JSON.stringify(headings)}`);
  }
  const ownerWantRow = page.getByTestId("want-to-eat-row").filter({ hasText: "主厨想吃的菜" });
  const memberWantRow = page.getByTestId("want-to-eat-row").filter({ hasText: "家人想吃的菜" });
  const ownerWantActions = await ownerWantRow.getByRole("button").count();
  const memberCanEditOwnWant = await memberWantRow.getByRole("button", { name: "标记安排" }).isVisible()
    && await memberWantRow.getByRole("button", { name: "移除" }).isVisible();
  const memberCanAddWantToDinner = await memberWantRow.getByRole("button", { name: "今晚就吃" }).isVisible().catch(() => false);
  const memberUserCenterAskButtons = await page.getByRole("button", { name: /问问大家/ }).count();
  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const memberDashboardAskButtons = await page.getByRole("button", { name: "问问大家想吃啥" }).count();
  const menuBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
  await page.getByRole("button", { name: /今晚就做|就做选中的/ }).first().click();
  const ownerNotice = page.getByText("只有主厨能修改菜单和家庭设置；你仍可以点感觉、认领买菜或丢想吃。");
  await ownerNotice.waitFor({ timeout: 15_000 });
  const blocked = await ownerNotice.isVisible();
  const menuAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
  const screenshot = join(evidenceDir, "member-boundary-mobile.png");
  await page.screenshot({ path: screenshot });
  await context.close();
  return {
    blocked,
    menuBefore,
    menuAfter,
    ownerWantActions,
    memberCanEditOwnWant,
    memberCanAddWantToDinner,
    memberUserCenterAskButtons,
    memberDashboardAskButtons,
    pageErrors,
    screenshot,
  };
}

async function verifyPersistedCraveDeadline(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  let closeAuthorization = "";
  const family = buildSmokeFamily();
  const state = {
    ...buildSmokeHouseholdState(),
    todayMenu: [],
    mealPlan: {},
    craveSignals: [{
      id: "persisted-crave",
      token: "persisted-crave-token",
      householdName: "我家",
      initiatorName: "主厨",
      feelingTag: "想喝汤",
      status: "open",
      deadlineAt: new Date(Date.now() - 1_000).toISOString(),
      votes: [],
      createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    }],
  };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "persisted-crave-owner-token",
      refreshToken: "persisted-crave-owner-token",
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat" },
    }));
    localStorage.setItem("family-menu:today-menu", "[]");
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: payload.state, family, households: [family] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state, family, households: [family] }) });
  });
  await page.route("**/crave-requests/persisted-crave-token/close", async (route) => {
    closeAuthorization = route.request().headers().authorization || "";
    await fulfillJson(route, {
      request: { ...state.craveSignals[0], status: "closed", resultSummary: route.request().postDataJSON()?.resultSummary },
    });
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByText("已揉合家人的感觉").waitFor({ timeout: 15_000 }).catch(async (error) => {
    const headings = await page.locator("h1, h2, h3").allTextContents();
    throw new Error(`${error.message}; headings=${JSON.stringify(headings)}; pageErrors=${JSON.stringify(pageErrors)}`);
  });
  const generated = await page.getByText("已揉合家人的感觉").isVisible();
  const initiatorFeelingApplied = await page.getByText("照顾到：想喝汤").count() > 0;
  await page.waitForTimeout(300);
  const closeAuthorized = closeAuthorization === "Bearer persisted-crave-owner-token";
  const screenshot = join(evidenceDir, "persisted-crave-deadline-mobile.png");
  await page.screenshot({ path: screenshot });
  await context.close();
  return { generated, initiatorFeelingApplied, closeAuthorized, closeAuthorization, pageErrors, screenshot };
}

async function verifyImplicitPantryPipeline(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const family = buildSmokeFamily();
  const state = {
    ...buildSmokeHouseholdState(),
    mealLogs: {},
    pantryItems: [],
    checkedItems: {},
  };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "pantry-pipeline-owner-token",
      refreshToken: "pantry-pipeline-owner-token",
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat" },
    }));
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: payload.state, family, households: [family] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state, family, households: [family] }) });
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "清单", exact: true }).click();
  const tomatoRow = page.locator("label").filter({ hasText: "西红柿" });
  const tomatoCheckbox = tomatoRow.getByRole("checkbox");
  const tomatoCheckboxCount = await tomatoCheckbox.count();
  if (tomatoCheckboxCount < 1) throw new Error("隐形食材流水线没有找到西红柿清单项。");
  await tomatoRow.first().click();
  const pantryAfterCheck = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]"));
  const addedAfterCheck = pantryAfterCheck.some((item) => item.name === "西红柿");
  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const doneButton = page.getByRole("button").filter({ hasText: "做了" });
  if (await doneButton.count() !== 1) throw new Error("隐形食材流水线没有找到唯一的晚饭“做了”按钮。");
  await doneButton.click();
  const result = await page.evaluate(() => ({
    pantry: JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]"),
    mealLogs: JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}"),
  }));
  const today = getLocalDateKey();
  const mealLog = result.mealLogs[today] ?? {};
  const removedAfterDinner = !result.pantry.some((item) => item.name === "西红柿");
  const mealLogged = mealLog.confirmation === "all"
    && mealLog.consumedEntries?.some((entry) => entry.recipeId === "tomato-egg");
  await context.close();
  return {
    addedAfterCheck,
    removedAfterDinner,
    mealLogged,
    pantryAfterCheck,
    pantryAfterDinner: result.pantry,
    mealLog,
    pageErrors,
  };
}

async function fulfillJson(route, body) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  return url.toString();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--headed") {
      parsed.headed = true;
      continue;
    }
    if (arg === "--base-url") {
      parsed.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      parsed.evidenceDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--min-recipe-cards") {
      parsed.minRecipeCards = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

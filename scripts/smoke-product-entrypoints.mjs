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

  await page.route("**/crave-requests/product-smoke-token", async (route) => {
    await fulfillJson(route, {
      request: {
        id: "product-smoke-crave",
        token: "product-smoke-token",
        householdName: "我家",
        initiatorName: "主厨",
        recipientCount: 1,
        status: "collecting",
        votes: [{
          memberId: "product-smoke-member",
          memberName: "家人小林",
          feelingTag: "想喝汤",
          note: "今天想暖和一点",
          createdAt: new Date().toISOString(),
        }],
        deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
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

  const dashboardLibraryEntry = page.getByTestId("dashboard-library-entry");
  await dashboardLibraryEntry.click();
  const dashboardLibraryTitle = page.getByRole("heading", { name: "全部菜品库" }).first();
  await dashboardLibraryTitle.waitFor({ timeout: 15_000 });
  const dashboardLibraryOpened = await dashboardLibraryTitle.isVisible();
  await page.getByRole("button", { name: "返回上一页" }).click();

  await page.getByRole("button", { name: "打开我的家" }).click();
  const dashboardFamilyActivity = page.getByTestId("family-activity-section");
  await dashboardFamilyActivity.waitFor({ state: "visible", timeout: 15_000 });
  const dashboardAvatarOpenedFamily = await dashboardFamilyActivity.isVisible();
  await page.getByRole("button", { name: "今晚", exact: true }).click();

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
  const potatoCard = page.getByTestId("recipe-card").filter({ hasText: "青椒土豆丝" });
  if (await potatoCard.count() !== 1) throw new Error("完整菜品库没有唯一展示青椒土豆丝卡片。");
  await potatoCard.getByRole("button", { name: "补进今晚" }).click();
  const libraryAddState = await page.evaluate((dateKey) => {
    const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
    const mealPlan = JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}");
    return { todayMenu, dinnerPlan: mealPlan?.[dateKey]?.dinner ?? [] };
  }, getLocalDateKey());
  const libraryDishAddedToMenu = libraryAddState.todayMenu.some((entry) => entry.recipeId === "potato-shreds");
  const libraryDishAddedToDinnerPlan = libraryAddState.dinnerPlan.some((entry) => entry.recipeId === "potato-shreds");

  await page.getByRole("button", { name: "今晚", exact: true }).click();
  await page.getByRole("button", { name: "选早餐吃什么" }).click();
  const breakfastQuickPicker = page.getByTestId("breakfast-quick-picker");
  await breakfastQuickPicker.waitFor({ timeout: 15_000 });
  const breakfastQuickOptionCount = await page.getByTestId("breakfast-quick-options").getByRole("button").count();
  const breakfastSkippedDinnerLibrary = await page.getByRole("heading", { name: "全部菜品库" }).count() === 0;
  const breakfastBeforePick = await readTodayMealSlot(page, "breakfast");
  const breakfastQuickScreenshot = join(evidenceDir, "breakfast-quick-picker-mobile.png");
  await waitForTransientUi(page);
  await page.screenshot({ path: breakfastQuickScreenshot });
  await page.getByRole("button", { name: "更多早餐选择" }).click();
  await page.getByRole("heading", { name: "给早餐选菜" }).first().waitFor({ timeout: 15_000 });
  const breakfastCategoryButton = page.getByRole("button", { name: "早餐", exact: true });
  const breakfastBrowseStartsFiltered = (await breakfastCategoryButton.getAttribute("class"))?.includes("bg-ink") === true;
  await page.getByRole("button", { name: "今晚", exact: true }).click();
  await page.getByRole("button", { name: "选早餐吃什么" }).click();
  await page.getByRole("button", { name: "早餐选择 阳春面" }).click();
  await breakfastQuickPicker.waitFor({ state: "hidden", timeout: 15_000 });
  const breakfastAfterPick = await readTodayMealSlot(page, "breakfast");

  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const mealRhythmPanel = page.getByTestId("meal-rhythm-panel");
  await mealRhythmPanel.getByRole("button", { name: "在家做" }).click();
  await page.getByRole("heading", { name: "给午餐选菜" }).first().waitFor({ timeout: 15_000 });
  const lunchBeforePick = await readTodayMealSlot(page, "lunch");
  await page.getByRole("button", { name: "加入 青椒土豆丝" }).click();
  await page.getByRole("heading", { name: "午餐已选择" }).waitFor({ timeout: 15_000 });
  const lunchAfterPick = await readTodayMealSlot(page, "lunch");

  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const plannerEntry = page.getByTestId("dashboard-planner-entry");
  await plannerEntry.click();
  await page.getByRole("heading", { name: "想连排几天" }).first().waitFor({ timeout: 15_000 });
  const dashboardPlannerOpened = await page.getByRole("heading", { name: "想连排几天" }).first().isVisible();
  const plannerGrocerySummary = page.getByTestId("planner-grocery-summary");
  const plannerGrocerySummaryVisible = await plannerGrocerySummary.isVisible();
  const plannerScreenshot = join(evidenceDir, "planner-mobile.png");
  await page.screenshot({ path: plannerScreenshot, fullPage: true });
  await plannerGrocerySummary.click();
  await page.getByRole("button", { name: "分享买菜清单" }).waitFor({ timeout: 15_000 });
  const plannerSummaryOpenedGrocery = await page.getByRole("button", { name: "分享买菜清单" }).isVisible();

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
  const dietSettingsButton = page.getByRole("button", { name: "修改忌口" });
  const dietSettingsVisible = await dietSettingsButton.isVisible();
  const legacyProfileControlsHidden = await page.getByRole("button", { name: /修改家庭画像|调整营养目标/ }).count() === 0;
  const activityBeforeAccountSettings = await page.evaluate(() => {
    const activity = document.querySelector('[data-testid="family-activity-section"]');
    const account = document.querySelector('[data-testid="cloud-account-section"]');
    if (!activity || !account) return false;
    return Boolean(activity.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  const familyActivityScreenshot = join(evidenceDir, "family-activity-mobile.png");
  await page.getByTestId("family-activity-section").screenshot({ path: familyActivityScreenshot });
  await dietSettingsButton.click();
  await page.getByRole("heading", { name: "家里不能吃什么" }).waitFor({ timeout: 15_000 });
  const dietConstraintPanel = page.getByTestId("diet-constraints-panel");
  const dietConstraintPanelVisible = await dietConstraintPanel.isVisible();
  const softPreferenceFormsHidden = await page.getByText(/晚饭最在意什么|买菜接受度|保存营养目标/).count() === 0;
  const dietConstraintScreenshot = join(evidenceDir, "diet-constraints-mobile.png");
  await dietConstraintPanel.screenshot({ path: dietConstraintScreenshot });
  await page.getByRole("button", { name: "营养分析", exact: true }).click();
  const nutritionReflectionPage = page.getByTestId("nutrition-reflection-page");
  await nutritionReflectionPage.waitFor({ timeout: 15_000 });
  const nutritionReflectionVisible = await page.getByRole("heading", { name: "营养回看" }).isVisible();
  const nutritionGoalMaintenanceHidden = await page.getByText(/目标管理|目标完成度|营养目标看板|修改目标/).count() === 0;
  const nutritionReflectionScreenshot = join(evidenceDir, "nutrition-reflection-mobile.png");
  await waitForTransientUi(page);
  await page.screenshot({ path: nutritionReflectionScreenshot, fullPage: true });
  await page.getByRole("button", { name: "我的家", exact: true }).click();
  await page.getByRole("button", { name: "问问大家" }).first().click();
  await page.getByRole("heading", { name: "今晚想问谁？" }).waitFor({ timeout: 15_000 });
  const selectedFamilyMember = await page.getByRole("button", { name: "家人小林" }).getAttribute("aria-pressed");
  await page.getByRole("button", { name: "发给 1 位家人" }).click();
  await page.waitForSelector("text=今晚征集单已在我的家展开", { timeout: 15_000 });
  await page.getByRole("button", { name: "查看征集单" }).first().click();
  await page.waitForSelector("text=今晚征集单已经在我的家展开", { timeout: 15_000 });
  const craveSheetVisible = await page.getByText("大家点了什么感觉").isVisible();
  const viewButtonVisible = await page.getByRole("button", { name: "查看征集单" }).first().isVisible();
  await page.getByRole("button", { name: "刷新回复" }).click();
  const craveVoteReceipt = page.getByText("家人小林 · 想喝汤", { exact: true });
  await craveVoteReceipt.waitFor({ timeout: 15_000 });
  const craveVoteReceiptVisible = await craveVoteReceipt.isVisible();
  const craveManualMenuActionVisible = await page.getByRole("button", { name: "现在出菜单" }).isVisible();
  const miniProgramCalls = await page.evaluate(() => window.__humiMiniProgramCalls ?? []);
  const grocerySharePosted = miniProgramCalls.some((call) => call.method === "postMessage" && call.payload?.data?.type === "humi:share-grocery");
  const groceryShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=grocery"));
  const craveSharePosted = miniProgramCalls.some((call) => call.method === "postMessage" && call.payload?.data?.type === "humi:share-crave");
  const craveShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=crave"));
  const userCraveScreenshot = join(evidenceDir, "user-crave-mobile.png");
  await page.screenshot({ path: userCraveScreenshot, fullPage: true });
  const memberBoundary = await verifyMemberOwnerBoundary(browser, baseUrl, evidenceDir);
  const soloOwnerFlow = await verifySoloOwnerFlow(browser, baseUrl, evidenceDir);
  const multiHouseholdFlow = await verifyMultiHouseholdSwitch(browser, baseUrl, evidenceDir);
  const persistedCraveDeadline = await verifyPersistedCraveDeadline(browser, baseUrl, evidenceDir);
  const pantryPipeline = await verifyImplicitPantryPipeline(browser, baseUrl);
  const hardConstraintOnboarding = await verifyHardConstraintOnboarding(browser, baseUrl, evidenceDir);

  const checks = [
    { key: "tonight-primary-action-is-in-first-viewport", ok: tonightViewport.primaryInFirstViewport, actual: tonightViewport.primaryBox },
    { key: "breakfast-and-lunch-follow-dinner-decision", ok: tonightViewport.mealRhythmAfterPrimary },
    { key: "tonight-do-writes-menu-and-dinner-plan", ok: tonightViewport.menuWritten && tonightViewport.dinnerPlanWritten, actual: tonightViewport.decisionState },
    { key: "tonight-do-auto-generates-grocery", ok: tonightViewport.groceryGenerated, actual: tonightViewport.groceryCheckboxCount },
    { key: "dashboard-self-pick-opens-full-library", ok: dashboardLibraryOpened },
    { key: "dashboard-avatar-opens-my-home", ok: dashboardAvatarOpenedFamily },
    { key: "full-library-title", ok: discoveryTitle },
    { key: "full-library-card-count", ok: recipeCards + selectedRecipeCount >= minRecipeCards, actual: recipeCards + selectedRecipeCount, expectedAtLeast: minRecipeCards },
    { key: "arranged-dishes-before-library-filters", ok: arrangedBeforeFilters },
    { key: "library-dish-adds-to-tonight-menu", ok: libraryDishAddedToMenu, actual: libraryAddState.todayMenu },
    { key: "library-dish-adds-to-dinner-plan", ok: libraryDishAddedToDinnerPlan, actual: libraryAddState.dinnerPlan },
    { key: "breakfast-opens-lightweight-quick-picker", ok: breakfastQuickOptionCount >= 4 && breakfastSkippedDinnerLibrary, actual: breakfastQuickOptionCount },
    { key: "breakfast-more-options-starts-in-breakfast-category", ok: breakfastBrowseStartsFiltered },
    { key: "breakfast-empty-before-user-pick", ok: breakfastBeforePick.length === 0, actual: breakfastBeforePick },
    { key: "breakfast-saves-user-picked-dish", ok: breakfastAfterPick.some((entry) => entry.recipeId === "scallion-noodle-soup"), actual: breakfastAfterPick },
    { key: "breakfast-does-not-default-to-seaweed-soup", ok: !breakfastAfterPick.some((entry) => entry.recipeId === "seaweed-egg-soup"), actual: breakfastAfterPick },
    { key: "lunch-empty-before-user-pick", ok: lunchBeforePick.length === 0, actual: lunchBeforePick },
    { key: "lunch-home-saves-user-picked-dish", ok: lunchAfterPick.some((entry) => entry.recipeId === "potato-shreds"), actual: lunchAfterPick },
    { key: "lunch-does-not-default-to-seaweed-soup", ok: !lunchAfterPick.some((entry) => entry.recipeId === "seaweed-egg-soup"), actual: lunchAfterPick },
    { key: "dashboard-planner-entry-opens-optional-week-plan", ok: dashboardPlannerOpened },
    { key: "week-plan-shows-grocery-summary-action", ok: plannerGrocerySummaryVisible },
    { key: "week-plan-grocery-summary-opens-shared-list", ok: plannerSummaryOpenedGrocery },
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
    { key: "crave-waiting-shows-member-feeling", ok: craveVoteReceiptVisible },
    { key: "crave-waiting-allows-manual-menu", ok: craveManualMenuActionVisible },
    { key: "family-activity-shows-grocery-claim", ok: groceryActivityVisible },
    { key: "family-activity-shows-dinner-confirmation", ok: dinnerActivityVisible },
    { key: "family-activity-shows-want-item", ok: wantActivityVisible },
    { key: "family-activity-precedes-account-settings", ok: activityBeforeAccountSettings },
    { key: "crave-starter-is-collapsed-until-requested", ok: craveStarterCollapsed },
    { key: "my-home-exposes-diet-constraints-only", ok: dietSettingsVisible && dietConstraintPanelVisible },
    { key: "soft-profile-maintenance-is-not-exposed", ok: legacyProfileControlsHidden && softPreferenceFormsHidden },
    { key: "nutrition-is-feedback-not-maintenance", ok: nutritionReflectionVisible && nutritionGoalMaintenanceHidden },
    { key: "member-menu-action-is-blocked", ok: memberBoundary.blocked },
    { key: "member-menu-stays-unchanged", ok: memberBoundary.menuBefore.length === 0 && memberBoundary.menuAfter.length === 0, actual: memberBoundary },
    { key: "member-cannot-edit-owner-want-item", ok: memberBoundary.ownerWantActions === 0, actual: memberBoundary.ownerWantActions },
    { key: "member-can-edit-own-want-item", ok: memberBoundary.memberCanEditOwnWant },
    { key: "member-cannot-add-want-item-to-dinner", ok: !memberBoundary.memberCanAddWantToDinner },
    { key: "member-cannot-start-crave-from-user-center", ok: memberBoundary.memberUserCenterAskButtons === 0, actual: memberBoundary.memberUserCenterAskButtons },
    { key: "member-cannot-start-crave-from-dashboard", ok: memberBoundary.memberDashboardAskButtons === 0, actual: memberBoundary.memberDashboardAskButtons },
    { key: "member-cannot-edit-family-diet-constraints", ok: memberBoundary.memberDietEditButtons === 0 && memberBoundary.memberDietSummaryReadonly, actual: memberBoundary },
    { key: "member-sees-meal-rhythm-without-owner-controls", ok: memberBoundary.memberMealEditingButtons === 0 && memberBoundary.memberDinnerReadonly && memberBoundary.memberPlannerEntries === 0, actual: memberBoundary },
    { key: "member-library-contributes-to-want-pool", ok: memberBoundary.memberLibraryUsesWantAction && memberBoundary.memberWantAddedFromLibrary, actual: memberBoundary },
    { key: "member-boundary-page-errors", ok: memberBoundary.pageErrors.length === 0, errors: memberBoundary.pageErrors },
    { key: "solo-owner-can-decide-without-family", ok: soloOwnerFlow.starterHasNoMemberPressure && soloOwnerFlow.decidedAlone && !soloOwnerFlow.shareRequestCreated, actual: soloOwnerFlow },
    { key: "solo-owner-flow-generates-menu-and-grocery", ok: soloOwnerFlow.menuWritten && soloOwnerFlow.planWritten && soloOwnerFlow.groceryGenerated, actual: soloOwnerFlow },
    { key: "solo-owner-page-errors", ok: soloOwnerFlow.pageErrors.length === 0, errors: soloOwnerFlow.pageErrors },
    { key: "multi-household-switch-is-user-visible", ok: multiHouseholdFlow.switchRequested && multiHouseholdFlow.activeHeadingUpdated, actual: multiHouseholdFlow },
    { key: "multi-household-switch-loads-isolated-menu", ok: multiHouseholdFlow.menuLoaded && multiHouseholdFlow.menuVisible, actual: multiHouseholdFlow },
    { key: "multi-household-page-errors", ok: multiHouseholdFlow.pageErrors.length === 0, errors: multiHouseholdFlow.pageErrors },
    { key: "persisted-crave-auto-generates-after-deadline", ok: persistedCraveDeadline.generated },
    { key: "no-reply-crave-keeps-initiator-feeling", ok: persistedCraveDeadline.initiatorFeelingApplied },
    { key: "persisted-crave-closes-with-owner-session", ok: persistedCraveDeadline.closeAuthorized },
    { key: "crave-result-converges-to-menu-and-plan", ok: persistedCraveDeadline.menuConverged && persistedCraveDeadline.planConverged, actual: persistedCraveDeadline.convergedState },
    { key: "crave-result-generates-grocery", ok: persistedCraveDeadline.groceryGenerated, actual: persistedCraveDeadline.groceryCheckboxCount },
    { key: "persisted-crave-page-errors", ok: persistedCraveDeadline.pageErrors.length === 0, errors: persistedCraveDeadline.pageErrors },
    { key: "grocery-check-adds-hidden-pantry-clue", ok: pantryPipeline.addedAfterCheck, actual: pantryPipeline.pantryAfterCheck },
    { key: "dinner-confirmation-consumes-hidden-pantry-clue", ok: pantryPipeline.removedAfterDinner, actual: pantryPipeline.pantryAfterDinner },
    { key: "dinner-confirmation-writes-meal-log", ok: pantryPipeline.mealLogged, actual: pantryPipeline.mealLog },
    { key: "implicit-pantry-pipeline-page-errors", ok: pantryPipeline.pageErrors.length === 0, errors: pantryPipeline.pageErrors },
    { key: "signed-in-onboarding-only-asks-hard-constraints", ok: hardConstraintOnboarding.onlyHardConstraints },
    { key: "signed-in-onboarding-can-skip-without-diet-tags", ok: hardConstraintOnboarding.canSkip },
    { key: "signed-in-onboarding-saves-diet-constraint", ok: hardConstraintOnboarding.savedConstraint, actual: hardConstraintOnboarding.savedProfile },
    { key: "signed-in-onboarding-page-errors", ok: hardConstraintOnboarding.pageErrors.length === 0, errors: hardConstraintOnboarding.pageErrors },
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
      breakfastQuickPickerMobile: breakfastQuickScreenshot,
      userCraveMobile: userCraveScreenshot,
      groceryMobile: groceryScreenshot,
      familyActivityMobile: familyActivityScreenshot,
      plannerMobile: plannerScreenshot,
      dietConstraintsMobile: dietConstraintScreenshot,
      nutritionReflectionMobile: nutritionReflectionScreenshot,
      memberBoundaryMobile: memberBoundary.screenshot,
      memberDietReadonlyMobile: memberBoundary.dietScreenshot,
      soloOwnerMobile: soloOwnerFlow.screenshot,
      multiHouseholdMobile: multiHouseholdFlow.screenshot,
      persistedCraveDeadlineMobile: persistedCraveDeadline.screenshot,
      profileOnboardingMobile: hardConstraintOnboarding.screenshot,
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
  await primary.click();
  await page.waitForTimeout(700);
  const today = getLocalDateKey();
  const decisionState = await page.evaluate((dateKey) => {
    const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
    const mealPlan = JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}");
    return { todayMenu, dinnerPlan: mealPlan?.[dateKey]?.dinner ?? [] };
  }, today);
  const menuWritten = decisionState.todayMenu.length >= 2;
  const dinnerPlanWritten = decisionState.dinnerPlan.length === decisionState.todayMenu.length
    && decisionState.dinnerPlan.every((entry) => decisionState.todayMenu.some((item) => item.recipeId === entry.recipeId));
  await page.getByRole("button", { name: "清单", exact: true }).click();
  const groceryCheckboxCount = await page.getByRole("checkbox").count();
  const groceryGenerated = groceryCheckboxCount > 0;
  await context.close();
  return {
    primaryInFirstViewport,
    mealRhythmAfterPrimary,
    menuWritten,
    dinnerPlanWritten,
    groceryGenerated,
    groceryCheckboxCount,
    decisionState,
    primaryBox,
    screenshot,
  };
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

async function verifySoloOwnerFlow(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  let shareRequestCreated = false;
  const family = {
    ...buildSmokeFamily(),
    id: "solo-owner-family",
    name: "一个人的家",
    members: [{ memberId: "product-smoke-owner", nickname: "主厨", role: "owner", status: "formal" }],
  };
  const state = { ...buildSmokeHouseholdState(), todayMenu: [], mealPlan: {}, mealLogs: {}, groceryClaims: {}, wantToEatItems: [] };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "solo-owner-token",
      refreshToken: "solo-owner-token",
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat" },
    }));
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      await fulfillJson(route, { state: payload.state, family, households: [family] });
      return;
    }
    await fulfillJson(route, { state, family, households: [family] });
  });
  await page.route("**/crave-requests", async (route) => {
    shareRequestCreated = true;
    await fulfillJson(route, { error: "solo flow should not create a share request" });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "问问大家想吃啥" }).click();
  await page.getByRole("heading", { name: "今晚想问谁？" }).waitFor({ timeout: 15_000 });
  const starterHasNoMemberPressure = await page.getByText("还没有正式成员也没关系").isVisible()
    && await page.getByRole("button", { name: "生成征集卡片" }).isVisible()
    && await page.getByRole("button", { name: "我自己做主" }).isVisible();
  await page.getByRole("button", { name: "想喝汤", exact: true }).click();
  await page.getByRole("button", { name: "我自己做主" }).click();
  await page.getByText("已直接出一组今晚菜单").waitFor({ timeout: 15_000 });
  const decidedAlone = await page.getByRole("heading", { name: "今晚想问谁？" }).count() === 0;
  await waitForTransientUi(page);
  const screenshot = join(evidenceDir, "solo-owner-mobile.png");
  await page.screenshot({ path: screenshot });
  await page.getByTestId("tonight-primary-action").click();
  await page.waitForTimeout(700);
  const today = getLocalDateKey();
  const decisionState = await page.evaluate((dateKey) => {
    const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
    const mealPlan = JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}");
    return { todayMenu, dinnerPlan: mealPlan?.[dateKey]?.dinner ?? [] };
  }, today);
  const menuWritten = decisionState.todayMenu.length >= 2;
  const planWritten = decisionState.dinnerPlan.length === decisionState.todayMenu.length;
  await page.getByRole("button", { name: "清单", exact: true }).click();
  const groceryGenerated = await page.getByRole("checkbox").count() > 0;
  await context.close();
  return {
    starterHasNoMemberPressure,
    decidedAlone,
    shareRequestCreated,
    menuWritten,
    planWritten,
    groceryGenerated,
    decisionState,
    pageErrors,
    screenshot,
  };
}

async function verifyMultiHouseholdSwitch(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const familyA = { ...buildSmokeFamily(), id: "family-a", name: "小家" };
  const familyB = { ...buildSmokeFamily(), id: "family-b", name: "爸妈家" };
  const stateA = buildSmokeHouseholdState();
  const today = getLocalDateKey();
  const stateB = {
    ...buildSmokeHouseholdState(),
    todayMenu: [{ recipeId: "potato-shreds", quantity: 1 }],
    mealPlan: { [today]: { breakfast: [], lunch: [], dinner: [{ recipeId: "potato-shreds", quantity: 1 }] } },
    wantToEatItems: [],
    groceryClaims: {},
  };
  let switchRequested = false;
  let activeFamily = familyA;
  let activeState = stateA;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "multi-household-token",
      refreshToken: "multi-household-token",
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat" },
    }));
  });
  await page.route("**/households/active", async (route) => {
    const payload = route.request().postDataJSON();
    switchRequested = payload?.householdId === familyB.id;
    if (switchRequested) {
      activeFamily = familyB;
      activeState = stateB;
    }
    await fulfillJson(route, { state: activeState, family: activeFamily, households: [familyA, familyB] });
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      activeState = payload.state;
    }
    await fulfillJson(route, { state: activeState, family: activeFamily, households: [familyA, familyB] });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "我的家", exact: true }).click();
  await page.getByRole("heading", { name: "当前用的是 小家" }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /爸妈家/ }).click();
  const switchedHeading = page.getByRole("heading", { name: "当前用的是 爸妈家" });
  await switchedHeading.waitFor({ timeout: 15_000 });
  const activeHeadingUpdated = await switchedHeading.isVisible();
  await waitForTransientUi(page);
  const screenshot = join(evidenceDir, "multi-household-mobile.png");
  await page.getByTestId("household-switcher").screenshot({ path: screenshot });
  const loadedMenu = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
  const menuLoaded = loadedMenu.length === 1 && loadedMenu[0]?.recipeId === "potato-shreds";
  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const menuVisible = await page.getByText("青椒土豆丝", { exact: true }).first().isVisible();
  await context.close();
  return {
    switchRequested,
    activeHeadingUpdated,
    menuLoaded,
    menuVisible,
    loadedMenu,
    pageErrors,
    screenshot,
  };
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
  const memberDietEditButtons = await page.getByRole("button", { name: "修改忌口" }).count();
  const memberDietSummaryReadonly = await page.getByTestId("family-constraints-readonly").isVisible();
  const dietScreenshot = join(evidenceDir, "member-diet-readonly-mobile.png");
  await page.getByTestId("family-constraints-readonly").screenshot({ path: dietScreenshot });
  await page.getByRole("button", { name: "全部菜品库" }).click();
  await page.getByRole("heading", { name: "全部菜品库" }).first().waitFor({ timeout: 15_000 });
  const memberLibraryWantButton = page.getByTestId("recipe-card").filter({ hasText: "青椒土豆丝" }).getByRole("button", { name: "加入想吃池子" });
  const memberLibraryUsesWantAction = await memberLibraryWantButton.isVisible();
  await memberLibraryWantButton.click();
  await page.getByText("青椒土豆丝 已放进想吃池子").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "返回上一页" }).click();
  await page.getByRole("heading", { name: /里的家人$/ }).waitFor({ timeout: 15_000 });
  const memberWantAddedFromLibrary = await page.getByTestId("want-to-eat-row").filter({ hasText: "青椒土豆丝" }).isVisible();
  const ownerWantRow = page.getByTestId("want-to-eat-row").filter({ hasText: "主厨想吃的菜" });
  const memberWantRow = page.getByTestId("want-to-eat-row").filter({ hasText: "家人想吃的菜" });
  const ownerWantActions = await ownerWantRow.getByRole("button").count();
  const memberCanEditOwnWant = await memberWantRow.getByRole("button", { name: "标记安排" }).isVisible()
    && await memberWantRow.getByRole("button", { name: "移除" }).isVisible();
  const memberCanAddWantToDinner = await memberWantRow.getByRole("button", { name: "今晚就吃" }).isVisible().catch(() => false);
  const memberUserCenterAskButtons = await page.getByRole("button", { name: /问问大家/ }).count();
  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const memberDashboardAskButtons = await page.getByRole("button", { name: "问问大家想吃啥" }).count();
  const memberMealEditingButtons = await page.getByTestId("meal-rhythm-panel").getByRole("button").count();
  const memberDinnerReadonly = await page.getByTestId("dinner-log-readonly").isVisible()
    && await page.getByTestId("dinner-log-readonly").getByRole("button").count() === 0;
  const memberPlannerEntries = await page.getByTestId("dashboard-planner-entry").count();
  const menuBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
  const memberPrimaryAction = page.getByTestId("tonight-primary-action");
  const blocked = await memberPrimaryAction.isDisabled()
    && await memberPrimaryAction.getByText("等主厨安排").isVisible();
  const menuAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
  const screenshot = join(evidenceDir, "member-boundary-mobile.png");
  await waitForTransientUi(page);
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
    memberDietEditButtons,
    memberDietSummaryReadonly,
    memberLibraryUsesWantAction,
    memberWantAddedFromLibrary,
    memberMealEditingButtons,
    memberDinnerReadonly,
    memberPlannerEntries,
    pageErrors,
    screenshot,
    dietScreenshot,
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
      accessToken: "crave-test-token",
      refreshToken: "crave-test-token",
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
  const closeAuthorized = closeAuthorization === "Bearer crave-test-token";
  const screenshot = join(evidenceDir, "persisted-crave-deadline-mobile.png");
  await page.screenshot({ path: screenshot });
  const convergeButton = page.getByRole("button", { name: "就做选中的 2 道" });
  await convergeButton.click();
  await page.waitForTimeout(700);
  const today = getLocalDateKey();
  const convergedState = await page.evaluate((dateKey) => {
    const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
    const mealPlan = JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}");
    return { todayMenu, dinnerPlan: mealPlan?.[dateKey]?.dinner ?? [] };
  }, today);
  const menuConverged = convergedState.todayMenu.length === 2;
  const planConverged = convergedState.dinnerPlan.length === 2
    && convergedState.dinnerPlan.every((entry) => convergedState.todayMenu.some((item) => item.recipeId === entry.recipeId));
  await page.getByRole("button", { name: "清单", exact: true }).click();
  const groceryCheckboxCount = await page.getByRole("checkbox").count();
  const groceryGenerated = groceryCheckboxCount > 0;
  await context.close();
  return {
    generated,
    initiatorFeelingApplied,
    closeAuthorized,
    closeAuthorization,
    menuConverged,
    planConverged,
    groceryGenerated,
    groceryCheckboxCount,
    convergedState,
    pageErrors,
    screenshot,
  };
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

async function verifyHardConstraintOnboarding(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const family = buildSmokeFamily();
  const state = buildSmokeHouseholdState();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(false));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "hard-constraint-onboarding-token",
      refreshToken: "hard-constraint-onboarding-token",
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat" },
    }));
  });
  await page.route("**/state", async (route) => {
    const request = route.request();
    if (request.method() === "PUT" || request.method() === "POST") {
      const payload = request.postDataJSON();
      await fulfillJson(route, { state: payload.state, family, households: [family] });
      return;
    }
    await fulfillJson(route, { state, family, households: [family] });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "先记住家里不能吃的。" }).waitFor({ timeout: 15_000 });
  const onboardingText = await page.locator("body").innerText();
  const legacyControlLabels = ["这次主要想规划什么", "晚饭目标", "买菜接受度", "营养目标"];
  const skipButton = page.getByRole("button", { name: "没有忌口，直接开始" });
  const onlyHardConstraints = legacyControlLabels.every((label) => !onboardingText.includes(label))
    && await page.getByText("家里不能吃什么", { exact: true }).isVisible();
  const canSkip = await skipButton.isVisible();
  const screenshot = join(evidenceDir, "profile-onboarding-mobile.png");
  await page.screenshot({ path: screenshot, fullPage: true });

  await page.getByRole("button", { name: "香菜", exact: true }).click();
  await page.getByRole("button", { name: "保存忌口，开始使用" }).click();
  await page.getByTestId("tonight-primary-action").waitFor({ timeout: 15_000 });
  const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:family-profile") || "{}"));
  const savedConstraint = savedProfile.dislikes?.includes("香菜") === true;
  await context.close();
  return {
    onlyHardConstraints,
    canSkip,
    savedConstraint,
    savedProfile,
    pageErrors,
    screenshot,
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

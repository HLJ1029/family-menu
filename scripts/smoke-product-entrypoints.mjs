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
  const posterUploadRequests = [];
  await page.addInitScript(() => {
    window.__humiMiniProgramCalls = [];
    window.__wxjs_environment = "miniprogram";
    window.wx = {
      miniProgram: {
        navigateTo(payload) {
          window.__humiMiniProgramCalls.push({ method: "navigateTo", payload });
          payload.success?.({ errMsg: "navigateTo:ok" });
        },
        redirectTo(payload) {
          window.__humiMiniProgramCalls.push({ method: "redirectTo", payload });
          payload.success?.({ errMsg: "redirectTo:ok" });
        },
      },
    };
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "product-smoke-owner-token",
      refreshToken: "product-smoke-owner-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
    }));
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      pageErrors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
    }
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

  await page.route("**/grocery-share-requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        request: {
          id: "product-smoke-grocery",
          token: "product-smoke-grocery-token",
          householdName: "我家",
          initiatorName: "主厨",
          items: [{ id: "ingredient:tomato", name: "西红柿", amount: "约2个", checked: false }],
          claims: [],
        },
      }),
    });
  });

  await page.route("**/menu-share-requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const payload = route.request().postDataJSON();
    await fulfillJson(route, {
      request: {
        id: "product-smoke-menu",
        token: "product-smoke-menu-token",
        householdName: payload.householdName || "我家",
        initiatorName: payload.initiatorName || "主厨",
        title: payload.title || "我家今晚菜单",
        dishes: payload.dishes || [],
        groceryCount: payload.groceryCount || 0,
      },
    });
  });

  await page.route("**/household-invites", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await fulfillJson(route, {
      invite: {
        id: "product-smoke-invite",
        token: "product-smoke-invite-token",
        householdId: "product-smoke-family",
        householdName: "我家",
        inviterName: "主厨",
        status: "active",
        acceptedCount: 0,
      },
    });
  });

  await page.route("**/wish-share-requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await fulfillJson(route, {
      ownerSecret: "product-smoke-wish-owner-secret",
      request: {
        id: "product-smoke-wish",
        token: "product-smoke-wish-token",
        householdName: "我家",
        initiatorName: "主厨",
        title: "家里最近想吃什么",
        status: "collecting",
        wishes: [],
      },
    });
  });

  await page.route("**/poster-shares", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataBuffer();
    const contentType = route.request().headers()["content-type"] || "";
    const format = contentType.includes("png") ? "png" : "jpg";
    const sequence = posterUploadRequests.length + 1;
    const token = `product_smoke_poster_token_${String(sequence).padStart(4, "0")}`;
    posterUploadRequests.push({ size: body?.length || 0, contentType });
    await fulfillJson(route, {
      poster: {
        token,
        format,
        url: `https://api.humi-home.com/poster-shares/${token}.${format}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await seedGuestDinnerState(page);
  await page.reload({ waitUntil: "networkidle" });
  await installMiniProgramMock(page);
  const tonightViewport = await verifyTonightPrimaryViewport(browser, baseUrl, evidenceDir);

  const dashboardLibraryEntry = page.getByTestId("dashboard-library-entry");
  const dashboardLibraryLabelLines = await page.getByTestId("dashboard-library-entry-label").evaluate((node) => node.getClientRects().length);
  await dashboardLibraryEntry.click();
  const dashboardLibraryTitle = page.getByRole("heading", { name: "发现", exact: true });
  await dashboardLibraryTitle.waitFor({ timeout: 15_000 });
  await waitForTransientUi(page);
  const dashboardLibraryOpened = await dashboardLibraryTitle.isVisible();
  const libraryPrimaryNav = page.getByTestId("mobile-primary-navigation");
  const libraryPrimaryNavCount = await libraryPrimaryNav.getByRole("button").count();
  const libraryParentNavActive = await page.getByTestId("mobile-nav-library").getAttribute("aria-current");
  const libraryPrimaryNavLayout = await libraryPrimaryNav.evaluate((nav) => {
    const navBox = nav.getBoundingClientRect();
    const items = [...nav.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim(),
        visible: box.width > 0 && box.height > 0,
        width: Math.round(box.width * 100) / 100,
      };
    });
    return {
      navWidth: Math.round(navBox.width * 100) / 100,
      items,
      equalColumns: items.length === 5
        && Math.max(...items.map((item) => item.width)) - Math.min(...items.map((item) => item.width)) < 2,
    };
  });
  await page.getByRole("button", { name: "返回上一页" }).click();
  const libraryBackReturnsTonight = await page.getByTestId("tonight-hero").isVisible();

  await page.getByTestId("mobile-nav-library").click();
  await dashboardLibraryTitle.waitFor({ timeout: 15_000 });
  const discoveryPrimaryTabOpened = await dashboardLibraryTitle.isVisible()
    && await page.getByTestId("mobile-nav-library").getAttribute("aria-current") === "page";
  await page.getByTestId("mobile-nav-dashboard").click();

  await dashboardLibraryEntry.click();
  await dashboardLibraryTitle.waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "打开我的家" }).click();
  const childPageFamilyRoom = page.getByTestId("family-living-room");
  await childPageFamilyRoom.waitFor({ state: "visible", timeout: 15_000 });
  const childPageAvatarOpenedFamily = await childPageFamilyRoom.isVisible();
  await page.getByTestId("mobile-nav-dashboard").click();

  await page.getByRole("button", { name: "打开我的家" }).click();
  const dashboardFamilyRoom = page.getByTestId("family-living-room");
  await dashboardFamilyRoom.waitFor({ state: "visible", timeout: 15_000 });
  const dashboardAvatarOpenedFamily = await dashboardFamilyRoom.isVisible();
  await page.getByRole("button", { name: "今晚", exact: true }).click();

  await openTodayMenu(page);
  const todayMenuPosterButton = page.getByRole("button", { name: "生成菜单海报", exact: true });
  const todayMenuPosterEntryVisible = await todayMenuPosterButton.isVisible();
  const todayMenuPosterEntryScreenshot = join(evidenceDir, "today-menu-poster-entry-mobile.png");
  await page.screenshot({ path: todayMenuPosterEntryScreenshot, fullPage: true });
  await todayMenuPosterButton.click();
  await page.getByRole("heading", { name: "Humi 今晚菜单", exact: true }).waitFor({ timeout: 15_000 });
  const todayMenuPosterImage = page.getByRole("img", { name: "Humi 今晚菜单海报预览" });
  await todayMenuPosterImage.waitFor({ state: "visible", timeout: 15_000 });
  const todayMenuPosterGenerated = await todayMenuPosterImage.evaluate((image) => image.naturalWidth > 0 && image.naturalHeight > 0);
  const todayMenuPosterPreviewScreenshot = join(evidenceDir, "today-menu-poster-preview-mobile.png");
  await page.screenshot({ path: todayMenuPosterPreviewScreenshot, fullPage: true });
  await page.getByRole("button", { name: "分享海报", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) =>
      call.method === "navigateTo"
      && call.payload?.url?.includes("/pages/poster/index?")
      && call.payload?.url?.includes("action=share")
    ),
  );
  await page.getByRole("button", { name: "关闭海报预览" }).first().click();
  await page.getByRole("button", { name: "去微信发菜单", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) =>
      call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=today_menu")
    ),
  );
  await page.getByRole("button", { name: /发现新菜|全部菜品库/ }).first().click();
  await page.getByRole("heading", { name: "发现", exact: true }).waitFor({ timeout: 15_000 });
  const discoveryTitle = await page.getByRole("heading", { name: "发现", exact: true }).isVisible();
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
  await waitForTransientUi(page);
  await page.screenshot({ path: discoveryScreenshot });
  await page.screenshot({ path: discoveryFullScreenshot, fullPage: true });
  const potatoCard = page.getByTestId("recipe-card").filter({ hasText: "青椒土豆丝" });
  if (await potatoCard.count() !== 1) throw new Error("完整菜品库没有唯一展示青椒土豆丝卡片。");
  await potatoCard.getByRole("button", { name: /补进今晚|加入 青椒土豆丝/ }).click();
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
  const breakfastSkippedDinnerLibrary = await page.getByRole("heading", { name: "发现", exact: true }).count() === 0;
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
  await mealRhythmPanel.getByRole("button", { name: /午餐.*记录午餐来源/ }).click();
  await mealRhythmPanel.getByRole("button", { name: "在家做" }).click();
  await page.getByRole("heading", { name: "给午餐选菜" }).first().waitFor({ timeout: 15_000 });
  const lunchBeforePick = await readTodayMealSlot(page, "lunch");
  await page.getByRole("button", { name: "加入 青椒土豆丝" }).click();
  await page.getByRole("heading", { name: "午餐已选择" }).waitFor({ timeout: 15_000 });
  const lunchAfterPick = await readTodayMealSlot(page, "lunch");

  await page.getByRole("button", { name: "今晚", exact: true }).click();
  const plannerEntry = page.getByTestId("mobile-nav-planner");
  await plannerEntry.click();
  await page.getByRole("heading", { name: "先把几顿重要的饭安排好" }).waitFor({ timeout: 15_000 });
  const dashboardPlannerOpened = await page.getByRole("heading", { name: "先把几顿重要的饭安排好" }).isVisible();
  await page.getByTestId("mobile-nav-dashboard").click();
  await page.getByTestId("mobile-nav-planner").click();
  await page.getByRole("heading", { name: "先把几顿重要的饭安排好" }).waitFor({ timeout: 15_000 });
  const plannerPrimaryTabOpened = await page.getByTestId("mobile-nav-planner").getAttribute("aria-current") === "page";
  const plannerGrocerySummary = page.getByTestId("planner-grocery-summary");
  const plannerGrocerySummaryVisible = await plannerGrocerySummary.isVisible();
  const plannerScreenshot = join(evidenceDir, "planner-mobile.png");
  await page.screenshot({ path: plannerScreenshot, fullPage: true });
  await plannerGrocerySummary.click();
  await page.getByRole("button", { name: "去微信发清单", exact: true }).waitFor({ timeout: 15_000 });
  const plannerSummaryOpenedGrocery = await page.getByRole("button", { name: "去微信发清单", exact: true }).isVisible();

  await page.getByRole("button", { name: "清单", exact: true }).click();
  await waitForTransientUi(page);
  const inventoryMaintenanceHidden = await page.getByText("后台已有", { exact: true }).count() === 0;
  const groceryNutritionEntryHidden = await page.getByRole("button", { name: "营养视图" }).count() === 0;
  const groceryScreenshot = join(evidenceDir, "grocery-mobile.png");
  await page.screenshot({ path: groceryScreenshot, fullPage: true });
  const groceryPosterButton = page.getByRole("button", { name: "生成清单海报", exact: true });
  const groceryPosterEntryVisible = await groceryPosterButton.isVisible();
  await groceryPosterButton.click();
  await page.getByRole("heading", { name: "Humi 购物清单", exact: true }).waitFor({ timeout: 15_000 });
  const groceryPosterImage = page.getByRole("img", { name: "Humi 购物清单海报预览" });
  await groceryPosterImage.waitFor({ state: "visible", timeout: 15_000 });
  const groceryPosterGenerated = await groceryPosterImage.evaluate((image) => image.naturalWidth > 0 && image.naturalHeight > 0);
  const groceryPosterPreviewScreenshot = join(evidenceDir, "grocery-poster-preview-mobile.png");
  await page.screenshot({ path: groceryPosterPreviewScreenshot, fullPage: true });
  await page.getByRole("button", { name: "保存图片", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) =>
      call.method === "navigateTo"
      && call.payload?.url?.includes("/pages/poster/index?")
      && call.payload?.url?.includes("action=save")
    ),
  );
  await page.getByRole("button", { name: "关闭海报预览" }).first().click();
  await page.getByRole("button", { name: "去微信发清单", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) =>
      call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=grocery")
    ),
  );

  await page.getByTestId("mobile-nav-user").click();
  const familyLivingRoom = page.getByTestId("family-living-room");
  await familyLivingRoom.waitFor({ state: "visible", timeout: 15_000 });
  const familyLivingRoomText = await familyLivingRoom.innerText();
  const familyLivingRoomLabels = [
    "当前家庭",
    "邀请家人",
    "成员管理",
    "家庭设置",
    "正在一起做",
    "家庭偏好",
    "协作记录",
    "账号设置",
  ];
  const familyLivingRoomHasFocusedSections = familyLivingRoomLabels.every((label) => familyLivingRoomText.includes(label));
  const familyLivingRoomHasNoClutter = !/(?:云同步|AI|验证数据|营养目标|营养分析)/.test(familyLivingRoomText);
  const familyLivingRoomKeepsFiveTabs = await page.getByTestId("mobile-primary-navigation").getByRole("button").count() === 5;
  const familyLivingRoomScreenshot = join(evidenceDir, "family-living-room-mobile.png");
  await familyLivingRoom.screenshot({ path: familyLivingRoomScreenshot });
  await page.getByRole("button", { name: "邀请家人", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) =>
      call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=invite")
    ),
  );
  const miniProgramCalls = await page.evaluate(() => window.__humiMiniProgramCalls ?? []);
  const groceryShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=grocery"));
  const menuShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=today_menu"));
  const inviteShareOpened = miniProgramCalls.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=invite"));
  const menuPosterNativeShareOpened = miniProgramCalls.some((call) =>
    call.method === "navigateTo"
    && call.payload?.url?.includes("/pages/poster/index?")
    && call.payload?.url?.includes("action=share")
  );
  const groceryPosterNativeSaveOpened = miniProgramCalls.some((call) =>
    call.method === "navigateTo"
    && call.payload?.url?.includes("/pages/poster/index?")
    && call.payload?.url?.includes("action=save")
  );
  const nativeShareTypes = miniProgramCalls
    .filter((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?"))
    .map((call) => new URLSearchParams(String(call.payload?.url || "").split("?")[1] || "").get("type"));
  const nativeShareTypeCounts = Object.fromEntries(nativeShareTypes.map((type) => [
    type,
    nativeShareTypes.filter((candidate) => candidate === type).length,
  ]));
  const shareNavigationStayedSingle = miniProgramCalls.every((call) => call.method !== "redirectTo");
  const noHouseholdStart = await verifyNoHouseholdStart(browser, baseUrl, evidenceDir);
  const ownerCollaborationShares = await verifyOwnerCollaborationShares(browser, baseUrl, evidenceDir);
  const memberBoundary = await verifyMemberOwnerBoundary(browser, baseUrl, evidenceDir);
  const soloOwnerFlow = await verifySoloOwnerFlow(browser, baseUrl, evidenceDir);
  const persistedCraveDeadline = await verifyPersistedCraveDeadline(browser, baseUrl, evidenceDir);
  const pantryPipeline = await verifyImplicitPantryPipeline(browser, baseUrl);
  const hardConstraintOnboarding = await verifyHardConstraintOnboarding(browser, baseUrl, evidenceDir);

  const checks = [
    { key: "tonight-primary-action-is-in-first-viewport", ok: tonightViewport.primaryInFirstViewport, actual: tonightViewport.primaryBox },
    { key: "tonight-hero-has-one-solid-primary-action", ok: tonightViewport.heroHierarchy.solidActionCount === 1, actual: tonightViewport.heroHierarchy },
    { key: "tonight-hero-has-context-scene-illustration", ok: tonightViewport.heroHierarchy.hasPermanentSceneIllustration, actual: tonightViewport.heroHierarchy },
    { key: "breakfast-and-lunch-follow-dinner-decision", ok: tonightViewport.mealRhythmAfterPrimary },
    { key: "tonight-do-writes-menu-and-dinner-plan", ok: tonightViewport.menuWritten && tonightViewport.dinnerPlanWritten, actual: tonightViewport.decisionState },
    { key: "tonight-do-auto-generates-grocery", ok: tonightViewport.groceryGenerated, actual: tonightViewport.groceryCheckboxCount },
    { key: "dashboard-self-pick-opens-full-library", ok: dashboardLibraryOpened },
    { key: "dashboard-library-entry-label-stays-on-one-line", ok: dashboardLibraryLabelLines === 1, actual: dashboardLibraryLabelLines },
    { key: "library-child-page-keeps-five-primary-tabs", ok: libraryPrimaryNavCount === 5, actual: libraryPrimaryNavCount },
    { key: "library-child-page-belongs-to-discovery-tab", ok: libraryParentNavActive === "page", actual: libraryParentNavActive },
    {
      key: "library-child-page-primary-tabs-are-visible-and-equal",
      ok: libraryPrimaryNavLayout.equalColumns
        && libraryPrimaryNavLayout.items.every((item) => item.visible)
        && libraryPrimaryNavLayout.items.map((item) => item.text).join("|") === "今晚|发现|计划|清单|我的家",
      actual: libraryPrimaryNavLayout,
    },
    { key: "library-child-page-back-returns-tonight", ok: libraryBackReturnsTonight },
    { key: "discovery-primary-tab-opens-full-library", ok: discoveryPrimaryTabOpened },
    { key: "child-page-avatar-opens-my-home", ok: childPageAvatarOpenedFamily },
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
    { key: "dashboard-planner-entry-opens-week-plan", ok: dashboardPlannerOpened },
    { key: "planner-primary-tab-opens-week-plan", ok: plannerPrimaryTabOpened },
    { key: "week-plan-shows-grocery-summary-action", ok: plannerGrocerySummaryVisible },
    { key: "week-plan-grocery-summary-opens-shared-list", ok: plannerSummaryOpenedGrocery },
    { key: "today-menu-poster-entry-is-visible", ok: todayMenuPosterEntryVisible },
    { key: "grocery-poster-entry-is-visible", ok: groceryPosterEntryVisible },
    { key: "poster-preview-generates-image", ok: todayMenuPosterGenerated && groceryPosterGenerated },
    { key: "menu-poster-opens-native-image-share-page", ok: menuPosterNativeShareOpened },
    { key: "grocery-poster-opens-native-album-save-page", ok: groceryPosterNativeSaveOpened },
    {
      key: "poster-uploads-stay-under-api-limit",
      ok: posterUploadRequests.length === 2
        && posterUploadRequests.every((request) => request.size > 0
          && request.size <= 950 * 1024
          && /^image\/(?:jpeg|png)/.test(request.contentType)),
      actual: posterUploadRequests,
    },
    { key: "grocery-share-uses-native-handoff", ok: groceryShareOpened },
    { key: "grocery-share-opens-native-share-page", ok: groceryShareOpened },
    { key: "menu-share-opens-native-share-page", ok: menuShareOpened },
    { key: "invite-share-opens-native-share-page", ok: inviteShareOpened },
    {
      key: "living-room-share-actions-dispatch-once",
      ok: ["invite", "grocery", "today_menu"].every((type) => nativeShareTypeCounts[type] === 1),
      actual: nativeShareTypeCounts,
    },
    { key: "native-share-navigation-does-not-double-dispatch", ok: shareNavigationStayedSingle, actual: miniProgramCalls },
    { key: "inventory-maintenance-is-not-exposed", ok: inventoryMaintenanceHidden },
    { key: "nutrition-entry-is-not-on-grocery-tab", ok: groceryNutritionEntryHidden },
    { key: "family-living-room-has-four-focused-sections", ok: familyLivingRoomHasFocusedSections, actual: familyLivingRoomText },
    { key: "family-living-room-removes-cloud-ai-nutrition-and-export-clutter", ok: familyLivingRoomHasNoClutter, actual: familyLivingRoomText },
    { key: "family-living-room-keeps-five-primary-tabs", ok: familyLivingRoomKeepsFiveTabs },
    { key: "signed-in-no-household-shows-explicit-start", ok: noHouseholdStart.hasExpectedCopy && noHouseholdStart.hasNoClutter, actual: noHouseholdStart },
    { key: "household-start-reveals-only-one-name-input-after-create-selection", ok: noHouseholdStart.nameInputIsDeferred, actual: noHouseholdStart },
    { key: "household-start-invite-action-explains-how-to-open-a-real-invite", ok: noHouseholdStart.inviteGuidanceShown, actual: noHouseholdStart },
    { key: "signed-in-no-household-does-not-fabricate-family", ok: noHouseholdStart.hasNoLivingRoom, actual: noHouseholdStart },
    { key: "signed-in-no-household-page-errors", ok: noHouseholdStart.pageErrors.length === 0, errors: noHouseholdStart.pageErrors },
    { key: "dashboard-crave-owner-creation-opens-recipient-picker", ok: ownerCollaborationShares.craveAudiencePickerVisible, actual: ownerCollaborationShares },
    { key: "dashboard-crave-recipients-default-selected", ok: ownerCollaborationShares.craveRecipientsDefaultSelected, actual: ownerCollaborationShares.craveRecipientState },
    { key: "dashboard-crave-create-keeps-selected-members", ok: ownerCollaborationShares.craveCreateKeptSelectedMembers, actual: ownerCollaborationShares.craveCreatePayload },
    { key: "dashboard-crave-share-opens-native-share-page", ok: ownerCollaborationShares.craveShareOpened, actual: ownerCollaborationShares.nativeShareTypeCounts },
    { key: "dashboard-crave-retry-share-action-is-visible", ok: ownerCollaborationShares.craveRetryShareActionVisible },
    { key: "living-room-wish-share-creates-current-household-request", ok: ownerCollaborationShares.wishCreateRequested, actual: ownerCollaborationShares.wishCreatePayload },
    { key: "living-room-wish-share-opens-native-share-page", ok: ownerCollaborationShares.wishShareOpened, actual: ownerCollaborationShares.nativeShareTypeCounts },
    { key: "owner-collaboration-native-share-actions-dispatch-once", ok: ownerCollaborationShares.shareActionsDispatchOnce, actual: ownerCollaborationShares.nativeShareTypeCounts },
    { key: "owner-collaboration-share-page-errors", ok: ownerCollaborationShares.pageErrors.length === 0, errors: ownerCollaborationShares.pageErrors },
    { key: "member-cannot-invite-from-family-living-room", ok: memberBoundary.memberHasNoInviteAction, actual: memberBoundary },
    { key: "living-room-internal-actions-keep-primary-tab", ok: memberBoundary.internalActionKeepsPrimaryTab, actual: memberBoundary },
    { key: "member-menu-action-is-blocked", ok: memberBoundary.blocked },
    { key: "member-menu-stays-unchanged", ok: memberBoundary.menuBefore.length === 0 && memberBoundary.menuAfter.length === 0, actual: memberBoundary },
    { key: "member-cannot-start-crave-from-dashboard", ok: memberBoundary.memberDashboardAskButtons === 0, actual: memberBoundary.memberDashboardAskButtons },
    { key: "member-sees-meal-rhythm-without-owner-controls", ok: memberBoundary.memberMealEditingButtons === 0 && memberBoundary.memberDinnerReadonly && memberBoundary.memberPlannerEntries === 0, actual: memberBoundary },
    { key: "member-library-contributes-to-want-pool", ok: memberBoundary.memberLibraryUsesWantAction && memberBoundary.memberWantAddedFromLibrary, actual: memberBoundary },
    { key: "member-boundary-page-errors", ok: memberBoundary.pageErrors.length === 0, errors: memberBoundary.pageErrors },
    { key: "solo-owner-can-decide-without-family", ok: soloOwnerFlow.starterHasNoMemberPressure && soloOwnerFlow.decidedAlone && !soloOwnerFlow.shareRequestCreated, actual: soloOwnerFlow },
    { key: "solo-owner-flow-generates-menu-and-grocery", ok: soloOwnerFlow.menuWritten && soloOwnerFlow.planWritten && soloOwnerFlow.groceryGenerated, actual: soloOwnerFlow },
    { key: "solo-owner-page-errors", ok: soloOwnerFlow.pageErrors.length === 0, errors: soloOwnerFlow.pageErrors },
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
      todayMenuPosterEntryMobile: todayMenuPosterEntryScreenshot,
      todayMenuPosterPreviewMobile: todayMenuPosterPreviewScreenshot,
      discoveryMobile: discoveryScreenshot,
      discoveryMobileFull: discoveryFullScreenshot,
      breakfastQuickPickerMobile: breakfastQuickScreenshot,
      groceryMobile: groceryScreenshot,
      groceryPosterPreviewMobile: groceryPosterPreviewScreenshot,
      familyLivingRoomMobile: familyLivingRoomScreenshot,
      householdStartMobile: noHouseholdStart.screenshot,
      plannerMobile: plannerScreenshot,
      memberBoundaryMobile: memberBoundary.screenshot,
      soloOwnerMobile: soloOwnerFlow.screenshot,
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
      expiresAt: Date.now() + 60_000,
      user: {
        id: "product-smoke-owner",
        displayName: "主厨",
        provider: "wechat", profileStatus: "complete",
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
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
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
  const heroHierarchy = await page.getByTestId("tonight-hero").evaluate((hero) => {
    const buttons = [...hero.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const solidButtons = buttons.filter((button) => {
      const background = getComputedStyle(button).backgroundColor.replaceAll(" ", "");
      return background === "rgb(17,17,17)" || background === "rgb(26,26,26)";
    });
    return {
      solidActionCount: solidButtons.length,
      hasPermanentSceneIllustration: Boolean(hero.querySelector('img[alt="一家人准备吃晚饭"]')),
    };
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
    heroHierarchy,
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
      navigateTo(payload) {
        window.__humiMiniProgramCalls.push({ method: "navigateTo", payload });
        payload.success?.({ errMsg: "navigateTo:ok" });
      },
      redirectTo(payload) {
        window.__humiMiniProgramCalls.push({ method: "redirectTo", payload });
        payload.success?.({ errMsg: "redirectTo:ok" });
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
  await page.waitForTimeout(360);
}

async function verifyNoHouseholdStart(browser, base, evidenceDir) {
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
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "no-household-token",
      refreshToken: "no-household-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "no-household-user", displayName: "小禾", provider: "wechat", profileStatus: "complete" },
    }));
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      await fulfillJson(route, { state: route.request().postDataJSON()?.state ?? null, family: null, households: [] });
      return;
    }
    await fulfillJson(route, { state: null, family: null, households: [] });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByTestId("mobile-nav-user").click();
  const householdStart = page.getByTestId("household-start");
  await householdStart.waitFor({ state: "visible", timeout: 15_000 });
  const startText = await householdStart.innerText();
  const hasExpectedCopy = ["创建我的家", "通过邀请加入", "共享菜单、一起决定想吃什么、协作买菜"]
    .every((copy) => startText.includes(copy));
  const hasNoClutter = !/(?:云同步|AI|试用额度)/.test(startText);
  const inputsBeforeSelection = await householdStart.locator("input").count();
  await householdStart.getByRole("button", { name: /^创建我的家/ }).click();
  const inputsAfterCreateSelection = await householdStart.locator("input").count();
  await householdStart.getByRole("button", { name: /^通过邀请加入/ }).click();
  const inviteGuidance = page.getByText("请使用家人发来的邀请卡片或链接打开 Humi。", { exact: true });
  await inviteGuidance.waitFor({ state: "visible", timeout: 15_000 });
  const inviteGuidanceShown = await inviteGuidance.isVisible();
  const hasNoLivingRoom = await page.getByTestId("family-living-room").count() === 0;
  const screenshot = join(evidenceDir, "household-start-mobile.png");
  await householdStart.screenshot({ path: screenshot });
  await context.close();
  return {
    hasExpectedCopy,
    hasNoClutter,
    nameInputIsDeferred: inputsBeforeSelection === 0 && inputsAfterCreateSelection === 1,
    inviteGuidanceShown,
    hasNoLivingRoom,
    pageErrors,
    screenshot,
  };
}

async function verifyOwnerCollaborationShares(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  let craveCreatePayload = null;
  let wishCreatePayload = null;
  const family = buildSmokeFamily();
  const state = { ...buildSmokeHouseholdState(), todayMenu: [], mealPlan: {}, mealLogs: {} };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) pageErrors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await page.addInitScript(() => {
    window.__humiMiniProgramCalls = [];
    window.__wxjs_environment = "miniprogram";
    window.wx = {
      miniProgram: {
        navigateTo(payload) {
          window.__humiMiniProgramCalls.push({ method: "navigateTo", payload });
          payload.success?.({ errMsg: "navigateTo:ok" });
        },
        redirectTo(payload) {
          window.__humiMiniProgramCalls.push({ method: "redirectTo", payload });
          payload.success?.({ errMsg: "redirectTo:ok" });
        },
      },
    };
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "owner-collaboration-token",
      refreshToken: "owner-collaboration-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
    }));
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      await fulfillJson(route, { state: route.request().postDataJSON()?.state ?? state, family, households: [family] });
      return;
    }
    await fulfillJson(route, { state, family, households: [family] });
  });
  await page.route("**/crave-requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    craveCreatePayload = route.request().postDataJSON();
    await fulfillJson(route, {
      ownerSecret: "owner-collaboration-crave-secret",
      request: {
        id: "owner-collaboration-crave",
        token: "owner-collaboration-crave-token",
        householdName: "我家",
        initiatorName: "主厨",
        recipientCount: 1,
        status: "collecting",
        votes: [],
        deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
  });
  await page.route("**/wish-share-requests", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    wishCreatePayload = route.request().postDataJSON();
    await fulfillJson(route, {
      ownerSecret: "owner-collaboration-wish-secret",
      request: {
        id: "owner-collaboration-wish",
        token: "owner-collaboration-wish-token",
        householdName: "我家",
        initiatorName: "主厨",
        title: "家里最近想吃什么",
        status: "collecting",
        wishes: [],
      },
    });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await installMiniProgramMock(page);
  await page.getByRole("button", { name: "问问大家想吃啥" }).click();
  const audiencePicker = page.getByText("默认全选，家人点开卡片免登录参与", { exact: true });
  await audiencePicker.waitFor({ state: "visible", timeout: 15_000 });
  const craveAudiencePickerVisible = await audiencePicker.isVisible();
  const recipient = page.getByRole("button", { name: /家人小林/ });
  const craveRecipientState = await recipient.getAttribute("aria-pressed");
  await page.getByRole("button", { name: "生成征集单", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=crave")),
  ).catch(async (error) => {
    const calls = await page.evaluate(() => window.__humiMiniProgramCalls ?? []);
    throw new Error(`${error.message}; craveCreatePayload=${JSON.stringify(craveCreatePayload)}; calls=${JSON.stringify(calls)}; pageErrors=${JSON.stringify(pageErrors)}`);
  });
  const craveRetryShareActionVisible = await page.getByRole("button", { name: "分享征集单", exact: true }).isVisible();
  await page.getByTestId("mobile-nav-user").click();
  const familyLivingRoom = page.getByTestId("family-living-room");
  await familyLivingRoom.waitFor({ state: "visible", timeout: 15_000 });
  await familyLivingRoom.getByRole("button", { name: "邀请家人写想吃", exact: true }).click();
  await page.waitForFunction(() =>
    window.__humiMiniProgramCalls?.some((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?type=wish")),
  ).catch(async (error) => {
    const calls = await page.evaluate(() => window.__humiMiniProgramCalls ?? []);
    throw new Error(`${error.message}; wishCreatePayload=${JSON.stringify(wishCreatePayload)}; calls=${JSON.stringify(calls)}; pageErrors=${JSON.stringify(pageErrors)}`);
  });
  const miniProgramCalls = await page.evaluate(() => window.__humiMiniProgramCalls ?? []);
  const nativeShareTypes = miniProgramCalls
    .filter((call) => call.method === "navigateTo" && call.payload?.url?.includes("/pages/share/index?"))
    .map((call) => new URLSearchParams(String(call.payload?.url || "").split("?")[1] || "").get("type"));
  const nativeShareTypeCounts = Object.fromEntries(nativeShareTypes.map((type) => [
    type,
    nativeShareTypes.filter((candidate) => candidate === type).length,
  ]));
  const screenshot = join(evidenceDir, "owner-collaboration-shares-mobile.png");
  await familyLivingRoom.screenshot({ path: screenshot });
  await context.close();
  return {
    craveAudiencePickerVisible,
    craveRecipientsDefaultSelected: craveRecipientState === "true",
    craveRecipientState,
    craveCreateKeptSelectedMembers: craveCreatePayload?.recipientIds?.includes("product-smoke-member") === true,
    craveCreatePayload,
    craveRetryShareActionVisible,
    wishCreatePayload,
    wishCreateRequested: wishCreatePayload?.householdId === family.id,
    craveShareOpened: nativeShareTypeCounts.crave === 1,
    wishShareOpened: nativeShareTypeCounts.wish === 1,
    shareActionsDispatchOnce: nativeShareTypeCounts.crave === 1 && nativeShareTypeCounts.wish === 1 && miniProgramCalls.every((call) => call.method !== "redirectTo"),
    nativeShareTypeCounts,
    pageErrors,
    screenshot,
  };
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
  page.on("response", (response) => {
    if (response.status() >= 400) {
      pageErrors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "solo-owner-token",
      refreshToken: "solo-owner-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
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
  await page.getByRole("heading", { name: "先发一张征集单" }).waitFor({ timeout: 15_000 });
  const starterHasNoMemberPressure = await page.getByText("家人不用登录，点开卡片只要选一个感觉。没人回也可以按“随便都行”出菜单。").isVisible()
    && await page.getByRole("button", { name: "生成征集单" }).isVisible()
    && await page.getByRole("button", { name: "我自己做主，直接出菜单" }).isVisible();
  await page.getByRole("button", { name: "想喝汤", exact: true }).click();
  await page.getByRole("button", { name: "我自己做主，直接出菜单" }).click();
  await page.getByText("已按“想喝汤”换一组").waitFor({ timeout: 15_000 });
  const decidedAlone = await page.getByRole("heading", { name: "先发一张征集单" }).count() === 0;
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
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
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
  await page.getByTestId("mobile-nav-user").click();
  const householdSwitcher = page.getByTestId("household-switcher");
  await householdSwitcher.getByRole("heading", { name: "小家" }).waitFor({ timeout: 15_000 });
  await householdSwitcher.getByRole("button", { name: /爸妈家/ }).click();
  const switchedHeading = householdSwitcher.getByRole("heading", { name: "爸妈家" });
  await switchedHeading.waitFor({ timeout: 15_000 });
  const activeHeadingUpdated = await switchedHeading.isVisible();
  await waitForTransientUi(page);
  const screenshot = join(evidenceDir, "multi-household-mobile.png");
  await householdSwitcher.screenshot({ path: screenshot });
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
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-member", displayName: "家人小林", provider: "wechat", profileStatus: "complete" },
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
  await page.getByTestId("mobile-nav-user").click();
  const memberRoom = page.getByTestId("family-living-room");
  await memberRoom.waitFor({ state: "visible", timeout: 15_000 });
  const memberHasNoInviteAction = await memberRoom.getByRole("button", { name: "邀请家人", exact: true }).count() === 0;
  await memberRoom.getByRole("button", { name: /^成员管理/ }).click();
  const internalActionKeepsPrimaryTab = await page.getByTestId("mobile-nav-user").getAttribute("aria-current") === "page";
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
  await page.getByTestId("mobile-nav-library").click();
  await page.getByRole("heading", { name: "发现", exact: true }).waitFor({ timeout: 15_000 });
  const memberWantAction = page.getByRole("button", { name: "记到最近想吃", exact: true }).first();
  const memberLibraryUsesWantAction = await memberWantAction.isVisible();
  await memberWantAction.click();
  await page.waitForFunction(() => {
    const items = JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]");
    return items.some((item) => item.memberId === "product-smoke-member");
  }, { timeout: 15_000 });
  const memberWantAddedFromLibrary = await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]");
    return items.some((item) => item.memberId === "product-smoke-member");
  });
  const screenshot = join(evidenceDir, "member-boundary-mobile.png");
  await waitForTransientUi(page);
  await page.screenshot({ path: screenshot });
  await context.close();
  return {
    blocked,
    menuBefore,
    menuAfter,
    memberHasNoInviteAction,
    internalActionKeepsPrimaryTab,
    memberDashboardAskButtons,
    memberMealEditingButtons,
    memberDinnerReadonly,
    memberPlannerEntries,
    memberLibraryUsesWantAction,
    memberWantAddedFromLibrary,
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
  page.on("response", (response) => {
    if (response.status() >= 400) {
      pageErrors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "crave-test-token",
      refreshToken: "crave-test-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
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
  await page.route("**/crave-requests/persisted-crave-token", async (route) => {
    await fulfillJson(route, { request: state.craveSignals[0] });
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Humi 照着大家的回复安排了这组" }).waitFor({ timeout: 15_000 }).catch(async (error) => {
    const headings = await page.locator("h1, h2, h3").allTextContents();
    throw new Error(`${error.message}; headings=${JSON.stringify(headings)}; pageErrors=${JSON.stringify(pageErrors)}`);
  });
  const generated = await page.getByRole("heading", { name: "Humi 照着大家的回复安排了这组" }).isVisible();
  const initiatorFeelingApplied = await page.getByText(/先按发起时选的“想喝汤”来|已先按“想喝汤”安排出一组/).count() > 0;
  await page.waitForTimeout(300);
  const closeAuthorized = closeAuthorization === "Bearer crave-test-token";
  const screenshot = join(evidenceDir, "persisted-crave-deadline-mobile.png");
  await page.screenshot({ path: screenshot });
  const convergeButton = page.getByRole("button", { name: "就做这些" });
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
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
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
  const doneButton = page.getByRole("button", { name: "做了", exact: true });
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
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
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
  await page.getByRole("heading", { name: "先确认家里不能吃的" }).waitFor({ timeout: 15_000 });
  const onboardingText = await page.locator("body").innerText();
  const legacyControlLabels = ["这次主要想规划什么", "晚饭目标", "买菜接受度", "营养目标"];
  const skipButton = page.getByRole("button", { name: "开始使用 Humi" });
  const onlyHardConstraints = legacyControlLabels.every((label) => !onboardingText.includes(label))
    && await page.getByText("绝不想吃 / 不能吃", { exact: true }).isVisible();
  const canSkip = await skipButton.isVisible();
  const screenshot = join(evidenceDir, "profile-onboarding-mobile.png");
  await page.screenshot({ path: screenshot, fullPage: true });

  await page.getByRole("button", { name: "香菜", exact: true }).click();
  await page.getByRole("button", { name: "开始使用 Humi" }).click();
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

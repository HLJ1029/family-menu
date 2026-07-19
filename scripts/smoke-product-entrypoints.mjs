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
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete", avatarUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", phoneVerified: true, phoneMasked: "138****8000" },
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
        state: buildLivingRoomSmokeHouseholdState(),
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
  const familyLivingRoomRoleVisible = await familyLivingRoom.getByTestId("current-family-role").getByText("主厨", { exact: true }).isVisible();
  const familyLivingRoomMemberCountVisible = await familyLivingRoom.getByTestId("current-family-member-count").getByText("2 位家人", { exact: true }).isVisible();
  const memberAvatarRegion = familyLivingRoom.getByTestId("current-family-member-avatars");
  const familyLivingRoomMemberAvatars = await memberAvatarRegion.getByRole("img").count();
  const loadedFamilyMemberAvatar = await memberAvatarRegion.getByRole("img", { name: "主厨的头像" }).evaluate((image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  const missingAvatarFallbackVisible = await memberAvatarRegion.getByTestId("member-avatar-fallback").getByText("家", { exact: true }).isVisible();
  const expectedPreferenceSummary = "2 位家人 · 主要口味：家常、清淡 · 忌口：香菜、花生";
  const familyPreferenceSummaryComplete = await familyLivingRoom.getByTestId("family-preference-action").getByText(expectedPreferenceSummary, { exact: true }).isVisible();
  const familyLivingRoomScreenshot = join(evidenceDir, "family-living-room-mobile.png");
  await familyLivingRoom.screenshot({ path: familyLivingRoomScreenshot });
  await familyLivingRoom.getByTestId("family-preference-action").click();
  const preferenceOpenedSettings = await page.getByTestId("household-settings-page").isVisible();
  await page.getByTestId("household-settings-page").getByRole("button", { name: "返回家庭客厅", exact: true }).click();
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
  const familyManagementPages = await verifyFamilyManagementPages(browser, baseUrl, evidenceDir);
  const familyIdentityRouteReset = await verifyFamilyIdentityRouteReset(browser, baseUrl, evidenceDir);
  const multiHouseholdSwitch = await verifyMultiHouseholdSwitch(browser, baseUrl, evidenceDir);
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
    { key: "family-living-room-shows-current-role", ok: familyLivingRoomRoleVisible },
    {
      key: "family-living-room-shows-member-avatars-and-count",
      ok: familyLivingRoomMemberAvatars === 1
        && loadedFamilyMemberAvatar.complete
        && loadedFamilyMemberAvatar.naturalWidth > 0
        && loadedFamilyMemberAvatar.naturalHeight > 0
        && missingAvatarFallbackVisible
        && familyLivingRoomMemberCountVisible,
      actual: { familyLivingRoomMemberAvatars, loadedFamilyMemberAvatar, missingAvatarFallbackVisible, familyLivingRoomMemberCountVisible },
    },
    { key: "family-preference-summary-covers-size-tastes-and-restrictions", ok: familyPreferenceSummaryComplete, actual: familyLivingRoomText, expected: expectedPreferenceSummary },
    { key: "family-preference-opens-household-settings", ok: preferenceOpenedSettings },
    { key: "signed-in-no-household-shows-explicit-start", ok: noHouseholdStart.hasExpectedCopy && noHouseholdStart.hasNoClutter, actual: noHouseholdStart },
    { key: "household-start-reveals-only-one-name-input-after-create-selection", ok: noHouseholdStart.nameInputIsDeferred, actual: noHouseholdStart },
    { key: "household-start-invite-action-explains-how-to-open-a-real-invite", ok: noHouseholdStart.inviteGuidanceShown, actual: noHouseholdStart },
    { key: "signed-in-no-household-does-not-fabricate-family", ok: noHouseholdStart.hasNoLivingRoom, actual: noHouseholdStart },
    { key: "household-name-draft-defaults-to-we-family", ok: noHouseholdStart.defaultName === "我们家", actual: noHouseholdStart.defaultName },
    { key: "household-name-blank-is-rejected-locally-and-preserved", ok: noHouseholdStart.blankCreateRequests === 0 && noHouseholdStart.blankInputPreserved && noHouseholdStart.blankErrorVisible, actual: noHouseholdStart },
    { key: "signed-in-no-household-page-errors", ok: noHouseholdStart.pageErrors.length === 0, errors: noHouseholdStart.pageErrors },
    { key: "dashboard-crave-owner-creation-opens-recipient-picker", ok: ownerCollaborationShares.craveAudiencePickerVisible, actual: ownerCollaborationShares },
    { key: "dashboard-crave-recipients-default-selected", ok: ownerCollaborationShares.craveRecipientsDefaultSelected, actual: ownerCollaborationShares.craveRecipientState },
    { key: "dashboard-crave-create-keeps-selected-members", ok: ownerCollaborationShares.craveCreateKeptSelectedMembers, actual: ownerCollaborationShares.craveCreatePayload },
    { key: "dashboard-crave-share-opens-native-share-page", ok: ownerCollaborationShares.craveShareOpened, actual: ownerCollaborationShares.nativeShareTypeCounts },
    { key: "dashboard-crave-retry-share-action-is-visible", ok: ownerCollaborationShares.craveRetryShareActionVisible },
    { key: "living-room-wish-share-creates-current-household-request", ok: ownerCollaborationShares.wishCreateRequested, actual: ownerCollaborationShares.wishCreatePayload },
    { key: "living-room-wish-share-opens-native-share-page", ok: ownerCollaborationShares.wishShareOpened, actual: ownerCollaborationShares.nativeShareTypeCounts },
    { key: "living-room-wish-collaboration-has-refresh-action", ok: ownerCollaborationShares.wishRefreshActionVisible && ownerCollaborationShares.wishRefreshRequested, actual: ownerCollaborationShares },
    { key: "living-room-collected-wish-has-plan-action", ok: ownerCollaborationShares.wishPlanActionVisible, actual: ownerCollaborationShares },
    { key: "living-room-wish-plan-enters-tonight-and-leaves-pool", ok: ownerCollaborationShares.wishPlannedIntoTonight && ownerCollaborationShares.wishRemovedFromPool, actual: ownerCollaborationShares.wishPlanningState },
    { key: "owner-collaboration-native-share-actions-dispatch-once", ok: ownerCollaborationShares.shareActionsDispatchOnce, actual: ownerCollaborationShares.nativeShareTypeCounts },
    { key: "owner-collaboration-share-page-errors", ok: ownerCollaborationShares.pageErrors.length === 0, errors: ownerCollaborationShares.pageErrors },
    { key: "family-management-pages-open-from-living-room", ok: familyManagementPages.allPagesOpened, actual: familyManagementPages.openedPages },
    { key: "family-management-pages-return-to-living-room", ok: familyManagementPages.allPagesReturn, actual: familyManagementPages.returnedPages },
    { key: "family-management-child-pages-keep-five-primary-tabs", ok: familyManagementPages.allPagesKeepTabs, actual: familyManagementPages.primaryTabCounts },
    { key: "household-members-shows-owner-controls", ok: familyManagementPages.ownerControlsVisible, actual: familyManagementPages.ownerControls },
    { key: "household-settings-owner-manages-family-constraints", ok: familyManagementPages.ownerConstraintsVisible, actual: familyManagementPages.ownerConstraintsVisible },
    { key: "household-settings-owner-must-transfer-before-leaving", ok: familyManagementPages.leaveBlockedForOwnerWithMembers, actual: familyManagementPages.leaveBlockedForOwnerWithMembers },
    { key: "humi-account-exposes-mobile-account-basics", ok: familyManagementPages.accountBasicsVisible, actual: familyManagementPages.accountText },
    { key: "humi-account-renders-truthful-profile-data", ok: familyManagementPages.accountDataTruthful, actual: familyManagementPages.accountText },
    { key: "household-members-render-member-avatars", ok: familyManagementPages.memberAvatarsRendered },
    { key: "household-lifecycle-metadata-preserves-current-state", ok: familyManagementPages.lifecycleMetadataPreservesCurrentState, actual: familyManagementPages.lifecycleMetadataPreservesCurrentState },
    { key: "household-lifecycle-preserves-meal-logs-and-collaboration-state", ok: familyManagementPages.lifecyclePreservesLogsAndCollaboration, actual: familyManagementPages.lifecyclePreservationSnapshots },
    { key: "family-activity-hides-secrets-and-internal-fields", ok: familyManagementPages.activityPrivacySafe, actual: familyManagementPages.activityText },
    { key: "household-lifecycle-remove-and-transfer-refresh-members", ok: familyManagementPages.lifecycleMembersRefresh, actual: familyManagementPages.lifecycleMembersRefresh },
    { key: "family-identity-change-resets-internal-route-before-paint", ok: familyIdentityRouteReset.resetToLivingRoom && familyIdentityRouteReset.noStaleSettingsPaint && familyIdentityRouteReset.pageErrors.length === 0, actual: familyIdentityRouteReset },
    { key: "nutrition-reflection-is-available-in-current-ui", ok: familyManagementPages.nutritionReachable },
    {
      key: "multi-household-owner-creates-via-family-settings",
      ok: multiHouseholdSwitch.blankCreateRequests === 0
        && multiHouseholdSwitch.blankInputPreserved
        && multiHouseholdSwitch.blankErrorVisible
        && multiHouseholdSwitch.failedInputPreserved
        && multiHouseholdSwitch.failedErrorVisible
        && multiHouseholdSwitch.failedResponseObserved
        && multiHouseholdSwitch.createRequestCount === 2
        && multiHouseholdSwitch.createRequestBody?.householdName === "爸妈家"
        && multiHouseholdSwitch.createRequestBody?.memberName === "主厨"
        && multiHouseholdSwitch.createPendingDisabled
        && multiHouseholdSwitch.newFamilyActive,
      actual: multiHouseholdSwitch,
    },
    { key: "multi-household-new-family-starts-empty", ok: multiHouseholdSwitch.newFamilyStateIsolated, actual: multiHouseholdSwitch.newFamilyState },
    { key: "multi-household-switches-from-household-settings", ok: multiHouseholdSwitch.switchRequested && multiHouseholdSwitch.originalHeadingRestored && multiHouseholdSwitch.originalStateRestored, actual: multiHouseholdSwitch },
    { key: "multi-household-page-errors", ok: multiHouseholdSwitch.pageErrors.length === 0, errors: multiHouseholdSwitch.pageErrors },
    { key: "member-cannot-invite-from-family-living-room", ok: memberBoundary.memberHasNoInviteAction, actual: memberBoundary },
    { key: "member-cannot-manage-household-members", ok: memberBoundary.memberManagementControlsHidden, actual: memberBoundary.memberManagementControls },
    { key: "member-sees-readonly-family-constraints", ok: memberBoundary.memberConstraintsReadonly, actual: memberBoundary.memberConstraintsText },
    { key: "member-cannot-create-another-household", ok: memberBoundary.memberCreateHouseholdControlsHidden, actual: memberBoundary.memberCreateHouseholdControls },
    { key: "member-cannot-invite-family-wishes", ok: memberBoundary.memberHasNoWishInviteAction, actual: memberBoundary.memberHasNoWishInviteAction },
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
      familyManagementMobile: familyManagementPages.screenshot,
      familyIdentityRouteResetMobile: familyIdentityRouteReset.screenshot,
      multiHouseholdMobile: multiHouseholdSwitch.screenshot,
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
      { memberId: "product-smoke-owner", nickname: "主厨", role: "owner", status: "formal", avatarUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23111111'/%3E%3Ccircle cx='16' cy='13' r='6' fill='white'/%3E%3Cpath d='M6 30c1-7 5-10 10-10s9 3 10 10' fill='white'/%3E%3C/svg%3E" },
      { memberId: "product-smoke-member", nickname: "家人小林", role: "member", status: "formal", avatarUrl: "" },
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
        id: "preserved-meal-log",
        source: "home",
        confirmation: "all",
        actorMemberId: "product-smoke-owner",
        actorName: "主厨",
        updatedAt: new Date().toISOString(),
      },
    },
    familyProfile: {
      dislikes: ["香菜"],
      allergies: ["花生"],
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

function buildLivingRoomSmokeHouseholdState() {
  const state = buildSmokeHouseholdState();
  return {
    ...state,
    familyProfile: {
      ...state.familyProfile,
      familySize: 5,
      tastePreferences: ["家常", "清淡"],
    },
  };
}

async function hasPreservedHouseholdState(page) {
  return page.evaluate(() => {
    const menu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
    const plan = JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}");
    const profile = JSON.parse(localStorage.getItem("family-menu:family-profile") || "{}");
    const mealLogs = JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}");
    const craveSignals = JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]");
    const activeCrave = JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null");
    const activeGrocery = JSON.parse(localStorage.getItem("humi:active-grocery-share-request:v1") || "null");
    const activeWish = JSON.parse(localStorage.getItem("humi:active-wish-share-request:v1") || "null");
    const core = menu.some((item) => item.recipeId === "tomato-egg")
      && Object.values(plan).some((day) => day?.dinner?.some((item) => item.recipeId === "tomato-egg"))
      && profile.dislikes?.includes("香菜")
      && profile.allergies?.includes("花生");
    const logsAndCollaboration = Object.values(mealLogs).some((log) => log?.id === "preserved-meal-log")
      && craveSignals.some((signal) => signal?.id === "preserved-crave-signal" || signal?.id === "privacy-crave-signal")
      && ["preserved-active-crave", "privacy-active-crave"].includes(activeCrave?.id)
      && ["preserved-active-grocery", "privacy-active-grocery"].includes(activeGrocery?.id)
      && ["preserved-active-wish", "privacy-active-wish"].includes(activeWish?.id);
    return { core, logsAndCollaboration };
  });
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
  let blankCreateRequests = 0;
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
  await page.route("**/households", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    blankCreateRequests += 1;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "household_name_required", message: "请填写家庭名称。" } }),
    });
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
  const nameInput = householdStart.getByLabel("给这个家起个名字");
  const defaultName = await nameInput.inputValue();
  await nameInput.fill("   ");
  await householdStart.getByRole("button", { name: "确认创建", exact: true }).click();
  await page.waitForTimeout(250);
  const blankInputPreserved = await nameInput.inputValue() === "   ";
  const blankErrorVisible = await householdStart.getByText("请填写家庭名称。", { exact: true }).isVisible();
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
    defaultName,
    blankCreateRequests,
    blankInputPreserved,
    blankErrorVisible,
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
  let wishRefreshRequested = false;
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
  await page.route("**/wish-share-requests/owner-collaboration-wish-token", async (route) => {
    wishRefreshRequested = route.request().method() === "GET";
    await fulfillJson(route, {
      request: {
        id: "owner-collaboration-wish",
        token: "owner-collaboration-wish-token",
        householdName: "我家",
        initiatorName: "主厨",
        title: "家里最近想吃什么",
        status: "collecting",
        wishes: [{ memberName: "家人小林", dishName: "西红柿炒鸡蛋", note: "今晚想吃" }],
      },
    });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await installMiniProgramMock(page);
  await page.getByRole("button", { name: "问问大家想吃啥" }).click();
  const audiencePicker = page.getByText("默认全选，家人点开卡片免登录参与", { exact: true });
  await audiencePicker.waitFor({ state: "visible", timeout: 15_000 }).catch(async (error) => {
    const bodyText = await page.locator("body").innerText();
    throw new Error(`${error.message}; body=${JSON.stringify(bodyText)}; pageErrors=${JSON.stringify(pageErrors)}`);
  });
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
  const wishRefreshAction = familyLivingRoom.getByRole("button", { name: "刷新最近想吃回复", exact: true });
  const wishRefreshActionVisible = await wishRefreshAction.isVisible();
  await wishRefreshAction.click();
  const wishPlanAction = familyLivingRoom.getByRole("button", { name: "今晚做 西红柿炒鸡蛋", exact: true });
  await wishPlanAction.waitFor({ state: "visible", timeout: 15_000 });
  const wishPlanActionVisible = await wishPlanAction.isVisible();
  await wishPlanAction.click();
  await page.waitForFunction(() => {
    const menu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
    const pool = JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]");
    return menu.some((item) => item.recipeId === "tomato-egg") && !pool.some((item) => item.recipeId === "tomato-egg");
  }, null, { timeout: 15_000 });
  const wishPlanningState = await page.evaluate(() => ({
    menu: JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"),
    pool: JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]"),
  }));
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
    wishRefreshActionVisible,
    wishRefreshRequested,
    wishPlanActionVisible,
    wishPlannedIntoTonight: wishPlanningState.menu.some((item) => item.recipeId === "tomato-egg"),
    wishRemovedFromPool: !wishPlanningState.pool.some((item) => item.recipeId === "tomato-egg"),
    wishPlanningState,
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

async function verifyFamilyManagementPages(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  const family = {
    ...buildSmokeFamily(),
    members: [
      ...buildSmokeFamily().members,
      { memberId: "product-smoke-third", nickname: "家人小周", role: "member", status: "formal", avatarUrl: "data:image/svg+xml,%3Csvg id='member-3'/%3E" },
    ],
  };
  const state = {
    ...buildSmokeHouseholdState(),
    familyProfile: { dislikes: ["香菜"], allergies: ["花生"] },
    craveSignals: [{
      id: "privacy-crave-signal",
      token: "DO_NOT_RENDER_CRAVE_TOKEN",
      ownerSecret: "DO_NOT_RENDER_OWNER_SECRET",
      participantKey: "DO_NOT_RENDER_PARTICIPANT_KEY",
      householdId: "DO_NOT_RENDER_HOUSEHOLD_ID",
      householdName: "我家",
      initiatorName: "主厨",
      status: "open",
      votes: [],
      createdAt: "2026-07-19T08:00:00.000Z",
    }],
    activeCraveRequest: {
      id: "privacy-active-crave",
      token: "DO_NOT_RENDER_ACTIVE_CRAVE_TOKEN",
      ownerSecret: "DO_NOT_RENDER_ACTIVE_OWNER_SECRET",
      participantKey: "DO_NOT_RENDER_ACTIVE_PARTICIPANT_KEY",
      householdId: "DO_NOT_RENDER_ACTIVE_HOUSEHOLD_ID",
      votes: [],
      createdAt: "2026-07-19T08:01:00.000Z",
    },
    activeGroceryShareRequest: {
      id: "privacy-active-grocery",
      token: "DO_NOT_RENDER_GROCERY_TOKEN",
      ownerSecret: "DO_NOT_RENDER_GROCERY_OWNER_SECRET",
      participantKey: "DO_NOT_RENDER_GROCERY_PARTICIPANT_KEY",
      householdId: "DO_NOT_RENDER_GROCERY_HOUSEHOLD_ID",
      items: [{ id: "milk", name: "牛奶", checked: false }],
      createdAt: "2026-07-19T08:02:00.000Z",
    },
    activeWishShareRequest: {
      id: "privacy-active-wish",
      token: "DO_NOT_RENDER_WISH_TOKEN",
      ownerSecret: "DO_NOT_RENDER_WISH_OWNER_SECRET",
      participantKey: "DO_NOT_RENDER_WISH_PARTICIPANT_KEY",
      householdId: "DO_NOT_RENDER_WISH_HOUSEHOLD_ID",
      wishes: [],
      createdAt: "2026-07-19T08:03:00.000Z",
    },
  };
  let activeFamily = family;
  const lifecycleRequests = { rename: false, remove: false, transfer: false };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.confirm = () => true;
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "family-management-owner-token",
      refreshToken: "family-management-owner-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "product-smoke-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete", avatarUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", phoneVerified: true, phoneMasked: "138****8000" },
    }));
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      await fulfillJson(route, { state: route.request().postDataJSON()?.state ?? state, family: activeFamily, households: [activeFamily] });
      return;
    }
    await fulfillJson(route, { state, family: activeFamily, households: [activeFamily] });
  });
  await page.route("**/households/product-smoke-family", async (route) => {
    lifecycleRequests.rename = route.request().method() === "PATCH";
    activeFamily = { ...activeFamily, name: route.request().postDataJSON()?.name || activeFamily.name };
    await fulfillJson(route, { family: activeFamily, households: [activeFamily] });
  });
  await page.route("**/households/product-smoke-family/members/product-smoke-third", async (route) => {
    lifecycleRequests.remove = route.request().method() === "DELETE";
    activeFamily = {
      ...activeFamily,
      members: activeFamily.members.filter((member) => member.memberId !== "product-smoke-third"),
    };
    await fulfillJson(route, { family: activeFamily, households: [activeFamily] });
  });
  await page.route("**/households/product-smoke-family/owner", async (route) => {
    lifecycleRequests.transfer = route.request().method() === "POST";
    activeFamily = {
      ...activeFamily,
      ownerId: "product-smoke-member",
      role: "member",
      members: activeFamily.members.map((member) => ({
        ...member,
        role: member.memberId === "product-smoke-member" ? "owner" : "member",
        avatarUrl: member.memberId === "product-smoke-member"
          ? "data:image/svg+xml,%3Csvg id='member-2-refreshed'/%3E"
          : member.avatarUrl,
      })),
    };
    await fulfillJson(route, { family: activeFamily, households: [activeFamily] });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByTestId("mobile-nav-user").click();
  await page.getByTestId("family-living-room").waitFor({ state: "visible", timeout: 15_000 });
  const pages = [
    { action: "成员管理", testId: "household-members-page" },
    { action: "家庭设置", testId: "household-settings-page" },
    { action: "协作记录", testId: "family-activity-page" },
    { action: "账号设置", testId: "humi-account-page" },
  ];
  const openedPages = {};
  const returnedPages = {};
  const primaryTabCounts = {};
  let activityText = "";
  for (const item of pages) {
    await page.getByRole("button", { name: new RegExp(`^${item.action}`) }).click();
    const child = page.getByTestId(item.testId);
    await child.waitFor({ state: "visible", timeout: 15_000 });
    openedPages[item.testId] = await child.isVisible();
    primaryTabCounts[item.testId] = await page.getByTestId("mobile-primary-navigation").getByRole("button").count();
    if (item.testId === "family-activity-page") activityText = await child.innerText();
    await child.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
    await page.getByTestId("family-living-room").waitFor({ state: "visible", timeout: 15_000 });
    returnedPages[item.testId] = true;
  }
  await page.getByRole("button", { name: /^成员管理/ }).click();
  const membersPage = page.getByTestId("household-members-page");
  const ownerControls = {
    invite: await membersPage.getByRole("button", { name: "邀请家人", exact: true }).count() === 1,
    remove: await membersPage.getByRole("button", { name: "移除成员", exact: true }).count() === 2,
    transfer: await membersPage.getByRole("button", { name: "转让主厨", exact: true }).count() === 2,
  };
  const expectedMemberImageCount = family.members.filter((member) => Boolean(member.avatarUrl)).length;
  const missingMemberAvatarFallback = await membersPage.locator("article").filter({ hasText: "家人小林" }).getByText("家", { exact: true }).isVisible();
  const memberAvatarsRendered = await membersPage.getByRole("img").count() === expectedMemberImageCount
    && missingMemberAvatarFallback;
  await membersPage.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
  await page.getByRole("button", { name: /^家庭设置/ }).click();
  const settingsPage = page.getByTestId("household-settings-page");
  const ownerConstraintsVisible = await settingsPage.getByTestId("family-constraints-editor").isVisible();
  const leaveBlockedForOwnerWithMembers = await settingsPage.getByRole("button", { name: "离开这个家", exact: true }).isDisabled()
    && await settingsPage.getByText("先转让主厨后再退出", { exact: true }).isVisible();
  await settingsPage.getByLabel("家庭名称", { exact: true }).fill("改名后的我家");
  await settingsPage.getByRole("button", { name: "重命名家庭", exact: true }).click();
  await settingsPage.locator("h2").filter({ hasText: "改名后的我家" }).waitFor({ timeout: 15_000 });
  const stateAfterRename = await hasPreservedHouseholdState(page);
  await settingsPage.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
  await page.getByTestId("mobile-nav-dashboard").click();
  await page.getByRole("button", { name: "点外卖", exact: true }).click();
  await page.getByRole("button", { name: "看看吃饭习惯", exact: true }).first().click();
  const nutritionReachable = await page.getByTestId("nutrition-reflection-page").isVisible();
  await page.getByTestId("mobile-nav-user").click();
  await page.getByRole("button", { name: /^成员管理/ }).click();
  const lifecycleMembersPage = page.getByTestId("household-members-page");
  await lifecycleMembersPage.getByRole("button", { name: "移除成员", exact: true }).last().click();
  await lifecycleMembersPage.getByText("家人小周", { exact: true }).waitFor({ state: "detached", timeout: 15_000 });
  const stateAfterRemove = await hasPreservedHouseholdState(page);
  const removedMemberReflected = await lifecycleMembersPage.getByText("家人小周", { exact: true }).count() === 0;
  await lifecycleMembersPage.getByRole("button", { name: "转让主厨", exact: true }).click();
  const nextOwnerRow = lifecycleMembersPage.locator("article").filter({ hasText: "家人小林" });
  await nextOwnerRow.getByText("主厨", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  const stateAfterTransfer = await hasPreservedHouseholdState(page);
  const transferRoleReflected = await nextOwnerRow.getByText("主厨", { exact: true }).isVisible();
  const refreshedAvatar = (await nextOwnerRow.getByRole("img", { name: "家人小林的头像" }).getAttribute("src"))?.includes("member-2-refreshed") === true;
  const lifecycleMetadataPreservesCurrentState = lifecycleRequests.rename && lifecycleRequests.remove && lifecycleRequests.transfer
    && stateAfterRename.core && stateAfterRemove.core && stateAfterTransfer.core;
  const lifecyclePreservesLogsAndCollaboration = lifecycleRequests.rename && lifecycleRequests.remove && lifecycleRequests.transfer
    && stateAfterRename.logsAndCollaboration && stateAfterRemove.logsAndCollaboration && stateAfterTransfer.logsAndCollaboration;
  const forbiddenActivityText = ["DO_NOT_RENDER", "ownerSecret", "participantKey", "householdId", "token"];
  const activityPrivacySafe = forbiddenActivityText.every((value) => !activityText.includes(value));
  const lifecycleMembersRefresh = lifecycleRequests.remove && lifecycleRequests.transfer
    && removedMemberReflected && transferRoleReflected && refreshedAvatar;
  await lifecycleMembersPage.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
  await page.getByRole("button", { name: /^账号设置/ }).click();
  const accountPage = page.getByTestId("humi-account-page");
  const accountText = await accountPage.innerText();
  const accountBasicsVisible = ["手机号", "退出登录", "隐私政策", "用户协议"].every((text) => accountText.includes(text));
  const accountDataTruthful = accountText.includes("138****8000")
    && await accountPage.getByRole("img", { name: "主厨的头像" }).count() === 1
    && await accountPage.getByRole("link", { name: "隐私政策" }).getAttribute("href") === "/privacy.html"
    && await accountPage.getByRole("link", { name: "用户协议" }).getAttribute("href") === "/terms.html";
  await accountPage.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
  const screenshot = join(evidenceDir, "family-management-mobile.png");
  await page.getByTestId("family-living-room").screenshot({ path: screenshot });
  await context.close();
  return {
    allPagesOpened: Object.values(openedPages).every(Boolean),
    allPagesReturn: Object.values(returnedPages).every(Boolean),
    allPagesKeepTabs: Object.values(primaryTabCounts).every((count) => count === 5),
    openedPages,
    returnedPages,
    primaryTabCounts,
    ownerControls,
    ownerControlsVisible: Object.values(ownerControls).every(Boolean),
    memberAvatarsRendered,
    ownerConstraintsVisible,
    leaveBlockedForOwnerWithMembers,
    lifecycleMetadataPreservesCurrentState,
    lifecyclePreservesLogsAndCollaboration,
    lifecyclePreservationSnapshots: { stateAfterRename, stateAfterRemove, stateAfterTransfer },
    activityPrivacySafe,
    activityText,
    lifecycleMembersRefresh,
    accountBasicsVisible,
    accountDataTruthful,
    accountText,
    nutritionReachable,
    pageErrors,
    screenshot,
  };
}

async function verifyFamilyIdentityRouteReset(browser, base, evidenceDir) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  let activeFamily = {
    id: "route-family-a",
    name: "旧家",
    ownerId: "route-owner",
    currentMemberId: "route-owner",
    role: "owner",
    members: [{ memberId: "route-owner", nickname: "主厨", role: "owner", status: "formal", avatarUrl: "" }],
  };
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "route-owner-token",
      refreshToken: "route-owner-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "route-owner", displayName: "主厨", provider: "wechat", profileStatus: "complete" },
    }));
    window.confirm = () => true;
    window.__familyRouteStates = [];
    window.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(() => {
        window.__familyRouteStates.push(
          document.querySelector("[data-testid='family-living-room']") ? "home"
            : document.querySelector("[data-testid='household-settings-page']") ? "settings"
              : document.querySelector("[data-testid='household-start']") ? "start"
                : "other",
        );
      }).observe(document.documentElement, { childList: true, subtree: true });
    }, { once: true });
  });
  await page.route("**/state", async (route) => {
    if (route.request().method() === "PUT") {
      await fulfillJson(route, { state: route.request().postDataJSON()?.state ?? null, family: activeFamily, households: activeFamily ? [activeFamily] : [] });
      return;
    }
    await fulfillJson(route, { state: activeFamily ? buildSmokeHouseholdState() : null, family: activeFamily, households: activeFamily ? [activeFamily] : [] });
  });
  await page.route("**/households/route-family-a/leave", async (route) => {
    activeFamily = null;
    await fulfillJson(route, { state: null, family: null, households: [] });
  });
  await page.route("**/households", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const name = route.request().postDataJSON()?.householdName;
    activeFamily = {
      id: "route-family-b",
      name,
      ownerId: "route-owner",
      currentMemberId: "route-owner",
      role: "owner",
      members: [{ memberId: "route-owner", nickname: "主厨", role: "owner", status: "formal", avatarUrl: "" }],
    };
    await fulfillJson(route, { family: activeFamily, households: [activeFamily] });
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByTestId("mobile-nav-user").click();
  await page.getByRole("button", { name: /^家庭设置/ }).click();
  const settings = page.getByTestId("household-settings-page");
  await settings.getByRole("button", { name: "离开这个家", exact: true }).click();
  const start = page.getByTestId("household-start");
  await start.waitFor({ state: "visible", timeout: 15_000 });
  await start.getByRole("button", { name: /^创建我的家/ }).click();
  await start.getByLabel("给这个家起个名字").fill("新家");
  await page.evaluate(() => { window.__familyRouteStates = []; });
  await start.getByRole("button", { name: "确认创建", exact: true }).click();
  const livingRoom = page.getByTestId("family-living-room");
  await livingRoom.waitFor({ state: "visible", timeout: 15_000 });
  const routeStates = await page.evaluate(() => window.__familyRouteStates || []);
  const resetToLivingRoom = await livingRoom.getByRole("heading", { name: "新家", exact: true }).isVisible();
  const noStaleSettingsPaint = !routeStates.includes("settings") && await page.getByTestId("household-settings-page").count() === 0;
  const screenshot = join(evidenceDir, "family-identity-route-reset-mobile.png");
  await livingRoom.screenshot({ path: screenshot });
  await context.close();
  return { resetToLivingRoom, noStaleSettingsPaint, routeStates, pageErrors, screenshot };
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
  const familyB = {
    ...buildSmokeFamily(),
    id: "family-b",
    name: "爸妈家",
    members: [buildSmokeFamily().members[0]],
  };
  const stateA = {
    ...buildSmokeHouseholdState(),
    craveSignals: [{ id: "original-family-crave", token: "original-family-token", status: "open" }],
    activeCraveRequest: { id: "original-family-active-crave", token: "original-active-token", status: "open" },
    activeGroceryShareRequest: { id: "original-family-active-grocery", token: "original-grocery-token", items: [] },
    activeWishShareRequest: { id: "original-family-active-wish", token: "original-wish-token", wishes: [] },
  };
  let switchRequested = false;
  let activeFamily = familyA;
  let activeState = stateA;
  let createRequestCount = 0;
  let createRequestBody = null;
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
    switchRequested = payload?.householdId === familyA.id;
    if (switchRequested) {
      activeFamily = familyA;
      activeState = stateA;
    }
    await fulfillJson(route, { state: activeState, family: activeFamily, households: [familyA, familyB] });
  });
  await page.route("**/households", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    createRequestCount += 1;
    createRequestBody = route.request().postDataJSON();
    if (createRequestBody?.householdName === "失败家") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "household_create_failed", message: "模拟创建失败，请稍后重试。" }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    activeFamily = familyB;
    activeState = null;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ family: familyB, households: [familyA, familyB] }),
    });
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
  await page.getByRole("button", { name: /^家庭设置/ }).click();
  const settings = page.getByTestId("household-settings-page");
  const householdSwitcher = settings.getByTestId("household-switcher");
  await householdSwitcher.getByRole("heading", { name: "小家" }).waitFor({ timeout: 15_000 });
  const nameInput = settings.getByPlaceholder("例如：爸妈家");
  await nameInput.fill("   ");
  await settings.getByRole("button", { name: "新建一个家", exact: true }).click();
  const blankCreateRequests = createRequestCount;
  const blankInputPreserved = await nameInput.inputValue() === "   ";
  const blankErrorVisible = await settings.getByRole("alert").getByText("请填写家庭名称。", { exact: true }).isVisible();

  await nameInput.fill("失败家");
  const failedResponse = page.waitForResponse((response) => response.url().endsWith("/households") && response.request().method() === "POST");
  await settings.getByRole("button", { name: "新建一个家", exact: true }).click();
  const failedResponseResult = await failedResponse;
  const failedResponseObserved = failedResponseResult.status() === 503;
  const failedInputPreserved = await nameInput.inputValue() === "失败家";
  const failedErrorVisible = await settings.getByRole("alert").getByText("模拟创建失败，请稍后重试。", { exact: true }).isVisible();

  await nameInput.fill("  爸妈家  ");
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/households") && response.request().method() === "POST");
  await settings.getByRole("button", { name: "新建一个家", exact: true }).click();
  const createPendingDisabled = await settings.getByRole("button", { name: "正在创建…", exact: true }).isDisabled();
  await createResponse;
  const newFamilyRoom = page.getByTestId("family-living-room");
  await newFamilyRoom.getByRole("heading", { name: "爸妈家", exact: true }).waitFor({ timeout: 15_000 });
  const newFamilyActive = await newFamilyRoom.getByRole("heading", { name: "爸妈家", exact: true }).isVisible();
  const newFamilyState = await readHouseholdStateFromLocalStorage(page);
  const newFamilyStateIsolated = isEmptyHouseholdState(newFamilyState);
  await waitForTransientUi(page);
  const screenshot = join(evidenceDir, "multi-household-mobile.png");
  await newFamilyRoom.screenshot({ path: screenshot });

  await newFamilyRoom.getByRole("button", { name: /^家庭设置/ }).click();
  await page.getByTestId("household-switcher").getByRole("button", { name: /小家.*切换/ }).click();
  const originalRoom = page.getByTestId("family-living-room");
  await originalRoom.getByRole("heading", { name: "小家", exact: true }).waitFor({ timeout: 15_000 });
  const originalHeadingRestored = await originalRoom.getByRole("heading", { name: "小家", exact: true }).isVisible();
  const originalState = await readHouseholdStateFromLocalStorage(page);
  const originalStateRestored = hasOriginalMultiHouseholdState(originalState);
  const expectedFailureConsole = "Failed to load resource: the server responded with a status of 503 (Service Unavailable)";
  const unexpectedPageErrors = pageErrors.filter((message) => message !== expectedFailureConsole);
  await context.close();
  return {
    blankCreateRequests,
    blankInputPreserved,
    blankErrorVisible,
    failedInputPreserved,
    failedErrorVisible,
    failedResponseObserved,
    createRequestCount,
    createRequestBody,
    createPendingDisabled,
    newFamilyActive,
    newFamilyState,
    newFamilyStateIsolated,
    switchRequested,
    originalHeadingRestored,
    originalState,
    originalStateRestored,
    pageErrors: unexpectedPageErrors,
    screenshot,
  };
}

async function readHouseholdStateFromLocalStorage(page) {
  return page.evaluate(() => ({
    menu: JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"),
    mealPlan: JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}"),
    profile: JSON.parse(localStorage.getItem("family-menu:family-profile") || "{}"),
    craveSignals: JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]"),
    groceryClaims: JSON.parse(localStorage.getItem("humi:grocery-claims:v1") || "{}"),
    wishPool: JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]"),
    activeCrave: JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"),
    activeGrocery: JSON.parse(localStorage.getItem("humi:active-grocery-share-request:v1") || "null"),
    activeWish: JSON.parse(localStorage.getItem("humi:active-wish-share-request:v1") || "null"),
  }));
}

function isEmptyHouseholdState(state) {
  return state.menu.length === 0
    && Object.values(state.mealPlan).every((day) => ["breakfast", "lunch", "dinner"].every((slot) => (day?.[slot] || []).length === 0))
    && (state.profile.dislikes || []).length === 0
    && (state.profile.allergies || []).length === 0
    && state.craveSignals.length === 0
    && Object.keys(state.groceryClaims).length === 0
    && state.wishPool.length === 0
    && state.activeCrave === null
    && state.activeGrocery === null
    && state.activeWish === null;
}

function hasOriginalMultiHouseholdState(state) {
  return state.menu.some((item) => item.recipeId === "tomato-egg")
    && state.profile.dislikes?.includes("香菜")
    && state.profile.allergies?.includes("花生")
    && state.craveSignals.some((item) => item.id === "original-family-crave")
    && state.groceryClaims["custom:milk"]?.itemName === "牛奶"
    && state.wishPool.some((item) => item.id === "want:product-smoke-member")
    && state.activeCrave?.id === "original-family-active-crave"
    && state.activeGrocery?.id === "original-family-active-grocery"
    && state.activeWish?.id === "original-family-active-wish";
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
  const memberHasNoWishInviteAction = await memberRoom.getByRole("button", { name: "邀请家人写想吃", exact: true }).count() === 0;
  await memberRoom.getByRole("button", { name: /^成员管理/ }).click();
  const memberMembersPage = page.getByTestId("household-members-page");
  await memberMembersPage.waitFor({ state: "visible", timeout: 15_000 });
  const memberManagementControls = {
    invite: await memberMembersPage.getByRole("button", { name: "邀请家人", exact: true }).count(),
    remove: await memberMembersPage.getByRole("button", { name: "移除成员", exact: true }).count(),
    transfer: await memberMembersPage.getByRole("button", { name: "转让主厨", exact: true }).count(),
  };
  const memberManagementControlsHidden = Object.values(memberManagementControls).every((count) => count === 0);
  await memberMembersPage.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
  await memberRoom.getByRole("button", { name: /^家庭设置/ }).click();
  const memberSettingsPage = page.getByTestId("household-settings-page");
  const memberConstraintsText = await memberSettingsPage.innerText();
  const memberConstraintsReadonly = memberConstraintsText.includes("主厨统一维护")
    && await memberSettingsPage.getByTestId("family-constraints-editor").count() === 0;
  const memberCreateHouseholdControls = {
    input: await memberSettingsPage.getByPlaceholder("例如：爸妈家").count(),
    button: await memberSettingsPage.getByRole("button", { name: "新建一个家", exact: true }).count(),
  };
  const memberCreateHouseholdControlsHidden = Object.values(memberCreateHouseholdControls).every((count) => count === 0);
  await memberSettingsPage.getByRole("button", { name: "返回家庭客厅", exact: true }).click();
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
    memberHasNoWishInviteAction,
    memberManagementControls,
    memberManagementControlsHidden,
    memberConstraintsText,
    memberConstraintsReadonly,
    memberCreateHouseholdControls,
    memberCreateHouseholdControlsHidden,
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
  const state = {
    ...buildSmokeHouseholdState(),
    familyProfile: { dislikes: [], allergies: [] },
  };
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

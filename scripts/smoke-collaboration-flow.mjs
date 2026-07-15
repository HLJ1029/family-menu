import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import net from "node:net";
import { chromium } from "playwright";
import { normalizeHumiApiError } from "../src/lib/humiApi.js";

assert.equal(
  normalizeHumiApiError(new TypeError("Failed to fetch"), "collaboration").message,
  "协作连接失败，请检查网络后重试。",
  "guest collaboration pages should not expose raw browser network errors",
);

const apiPort = await getFreePort();
const webPort = await getFreePort();
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const dataFile = `/tmp/humi-collaboration-smoke-${Date.now()}.json`;
const recipes = JSON.parse(await readFile(new URL("../data/recipes.json", import.meta.url), "utf8"));
const expectedRecipeCount = recipes.length;

process.env.NODE_ENV ||= "test";
process.env.HUMI_WECHAT_MOCK ||= "1";
process.env.HUMI_API_DATA_FILE = dataFile;
process.env.HUMI_ALLOWED_ORIGINS = `${webBaseUrl},http://localhost:${webPort}`;

await unlink(dataFile).catch(() => {});

const { createHumiApiServer } = await import("../api/server.js");
const apiServer = createHumiApiServer();
await new Promise((resolve) => apiServer.listen(apiPort, "127.0.0.1", resolve));

const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_HUMI_API_BASE_URL: apiBaseUrl,
    VITE_HUMI_WECHAT_LOGIN_ENABLED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
let smokeOwnerSession;

try {
  await waitForHttp(`${apiBaseUrl}/health`);
  await waitForVite(vite, webBaseUrl);

  smokeOwnerSession = await request(`${apiBaseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: "collaboration-owner" },
  });

  const crave = await request(`${apiBaseUrl}/crave-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      mealType: "dinner",
      starterFeeling: "随便都行",
    },
  });
  assert(crave.request?.token, "crave request should create a share token");

  const expiredCrave = await request(`${apiBaseUrl}/crave-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      mealType: "dinner",
      starterFeeling: "不想动",
      deadlineAt: new Date(Date.now() - 60 * 1000).toISOString(),
    },
  });
  assert(expiredCrave.request?.token, "expired crave request should create a share token");

  const grocery = await request(`${apiBaseUrl}/grocery-share-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      title: "测试买菜清单",
      items: [
        { id: "tomato", name: "西红柿", amount: "2 个", category: "蔬菜" },
        { id: "egg", name: "鸡蛋", amount: "3 个", category: "蛋奶" },
      ],
    },
  });
  assert(grocery.request?.token, "grocery share should create a share token");

  const menuShare = await request(`${apiBaseUrl}/menu-share-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      title: "西红柿炒鸡蛋 + 青椒土豆丝",
      groceryCount: 4,
      dishes: [
        { id: "tomato-egg", recipeId: "tomato-egg", name: "西红柿炒鸡蛋", quantity: 1, category: "家常菜", timeMinutes: 15 },
        { id: "potato-shreds", recipeId: "potato-shreds", name: "青椒土豆丝", quantity: 1, category: "素菜", timeMinutes: 20 },
      ],
    },
  });
  assert(menuShare.request?.token, "menu share should create a share token");

  const wishShare = await request(`${apiBaseUrl}/wish-share-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      title: "测试想吃池",
    },
  });
  assert(wishShare.request?.token, "wish share should create a share token");

  browser = await chromium.launch({ headless: true });

  await verifyCraveGuestFlow({
    browser,
    token: crave.request.token,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyClosedCraveGuestFlow({
    browser,
    token: expiredCrave.request.token,
    webBaseUrl,
  });

  await verifyGroceryGuestFlow({
    browser,
    token: grocery.request.token,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyOwnerGroceryShareRefreshFlow({
    browser,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyMenuShareGuestFlow({
    browser,
    token: menuShare.request.token,
    webBaseUrl,
  });

  await verifyWishGuestAndOwnerFlow({
    browser,
    token: wishShare.request.token,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyShareLandingErrorFallbacks({
    browser,
    webBaseUrl,
  });

  await verifyWishPoolPlanningFlow({
    browser,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyOwnerCraveClosureFlow({
    browser,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyGuestCraveLoginBoundary({
    browser,
    webBaseUrl,
  });

  await verifyCraveDeadlineFallbackFlow({
    browser,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyPantryLightConfirmationFlow({
    browser,
    webBaseUrl,
  });

  await verifyPantryQuickHintFlow({
    browser,
    webBaseUrl,
  });

  await verifyGroceryEmptyStateFlow({
    browser,
    webBaseUrl,
  });

  await verifyGroceryCheckAddsHiddenPantry({
    browser,
    webBaseUrl,
  });

  await verifyProfileOnboardingHardInfoOnly({
    browser,
    webBaseUrl,
  });

  await verifyTemporaryJoinMergeFlow({
    browser,
    webBaseUrl,
  });

  await verifyHouseholdUserCenterFlow({
    browser,
    apiBaseUrl,
    webBaseUrl,
  });

  await verifyMyHomeCraveStartFlow({
    browser,
    webBaseUrl,
  });

  await verifyMyHomeFirstViewportHierarchy({
    browser,
    webBaseUrl,
  });

  await verifyMyHomeSoloFallbackFlow({
    browser,
    webBaseUrl,
  });

  await verifyDashboardSoloFallbackFlow({
    browser,
    webBaseUrl,
  });

  await verifyDashboardPrimaryActionHierarchy({
    browser,
    webBaseUrl,
  });

  await verifyCraveRejectReturnsToFeelingChoice({
    browser,
    webBaseUrl,
  });

  await verifyLibraryMealPlanningFlow({
    browser,
    webBaseUrl,
    expectedRecipeCount,
  });

  await verifyMealPipelineFlow({
    browser,
    webBaseUrl,
  });

  await verifyThreeMealPortraitFlow({
    browser,
    webBaseUrl,
  });

  await verifyTodayMenuResultFirstStructure({
    browser,
    webBaseUrl,
  });

  await verifyPlannerIntroDegradesAfterUse({
    browser,
    webBaseUrl,
  });

  await verifyCalendarExplanationDegradesAfterDateSelection({
    browser,
    webBaseUrl,
  });

  console.log("Humi collaboration and library meal flow smoke passed.");
} finally {
  if (browser) await browser.close().catch(() => {});
  vite.kill("SIGTERM");
  await new Promise((resolve) => apiServer.close(resolve));
  await unlink(dataFile).catch(() => {});
}

async function verifyCraveGuestFlow({ browser, token, apiBaseUrl, webBaseUrl }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${webBaseUrl}/?crave=${encodeURIComponent(token)}&shareSource=crave`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "你想吃点啥？" }).waitFor({ timeout: 10000 });
  assert.equal(
    await page.getByPlaceholder("怎么称呼你？可不填").isVisible().catch(() => false),
    false,
    "guest crave landing should not show name input before optional details are opened",
  );
  await assertElementInFirstViewport(page.getByRole("button", { name: "想喝汤" }), "crave feeling choice");
  await assertElementInFirstViewport(page.getByRole("button", { name: "发给主厨" }), "crave submit action");
  await page.getByRole("button", { name: "想喝汤" }).click();
  await page.getByRole("button", { name: "想补一句？选填" }).click();
  await page.getByPlaceholder("怎么称呼你？可不填").fill("阿宁");
  await page.getByPlaceholder("有特别想吃的菜？可不填").fill("番茄汤");
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到！" }).waitFor({ timeout: 10000 });

  const updated = await request(`${apiBaseUrl}/crave-requests/${encodeURIComponent(token)}`);
  const vote = updated.request?.votes?.[0];
  assert.equal(vote?.memberName, "阿宁", "crave vote should save guest name");
  assert.equal(vote?.feelingTag, "想喝汤", "crave vote should save guest feeling");
  assert.equal(vote?.dishWish, "番茄汤", "crave vote should save optional dish wish");
  assert.equal(vote?.temporary, true, "crave vote should stay temporary before login");
  assert(vote?.participantKey, "crave vote should expose participant key for member merge");

  await page.getByRole("button", { name: "加入这个家，看今晚定了啥" }).click();
  await page.getByRole("heading", { name: "刚才的感觉已经保留" }).waitFor({ timeout: 10000 });
  await page.getByText("现在只是临时参与，可以继续看今晚菜单和清单；登录后再转成正式成员。").waitFor({ timeout: 10000 });
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:pending-join-context:v1") || "null"));
  assert.equal(pending?.type, "crave", "joining after crave should create pending join context");
  assert.equal(pending?.memberName, "阿宁", "pending crave context should keep guest name");
  assert.equal(pending?.dishWish, "番茄汤", "pending crave context should keep dish wish");
  assert.equal(pending?.participantKey, vote.participantKey, "pending crave context should keep the same participant key");
  await page.close();
}

async function verifyClosedCraveGuestFlow({ browser, token, webBaseUrl }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${webBaseUrl}/?crave=${encodeURIComponent(token)}&shareSource=crave`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "这次已经收口" }).waitFor({ timeout: 10000 });
    await page.getByText("已经开始安排今晚菜单").waitFor({ timeout: 10000 });
    assert.equal(
      await page.getByRole("button", { name: "发给主厨" }).isVisible().catch(() => false),
      false,
      "closed crave landing should not allow guests to submit a late feeling",
    );
  } finally {
    await page.close();
  }
}

async function verifyGroceryGuestFlow({ browser, token, apiBaseUrl, webBaseUrl }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${webBaseUrl}/?groceryShare=${encodeURIComponent(token)}&shareSource=grocery`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "顺路带这些就够了" }).waitFor({ timeout: 10000 });
  assert.equal(
    await page.getByPlaceholder("怎么称呼你？可不填").isVisible().catch(() => false),
    false,
    "grocery claim landing should not show name input before optional details are opened",
  );
  await assertElementInFirstViewport(page.getByRole("button", { name: /西红柿/ }), "grocery item choice");
  await assertElementInFirstViewport(page.getByRole("button", { name: "我来买 2 项" }), "grocery claim action");
  await assertElementInFirstViewport(page.getByRole("button", { name: "这次我买不了" }), "grocery decline action");
  await page.getByRole("button", { name: "补一句，可不填" }).click();
  await page.getByPlaceholder("怎么称呼你？可不填").fill("阿宁");
  await page.getByRole("button", { name: "我来买 2 项" }).click();
  await page.getByRole("heading", { name: "已认领" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /西红柿/ }).click();

  const updated = await request(`${apiBaseUrl}/grocery-share-requests/${encodeURIComponent(token)}`);
  const claim = updated.request?.claims?.[0];
  assert.equal(claim?.memberName, "阿宁", "grocery claim should save guest name");
  assert.equal(claim?.status, "claimed", "grocery claim should save claimed status");
  assert.deepEqual(claim?.itemIds, ["tomato", "egg"], "grocery claim should include selected items");
  assert(claim?.participantKey, "grocery claim should expose participant key for member merge");
  const tomato = updated.request?.items?.find((item) => item.id === "tomato");
  assert.equal(tomato?.checked, true, "guest should be able to mark a claimed item as bought");

  await page.getByRole("button", { name: "加入这个家" }).click();
  await page.getByRole("heading", { name: "刚才的买菜参与已经保留" }).waitFor({ timeout: 10000 });
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:pending-join-context:v1") || "null"));
  assert.equal(pending?.type, "grocery", "joining after grocery claim should create pending join context");
  assert.equal(pending?.memberName, "阿宁", "pending grocery context should keep guest name");
  assert.equal(pending?.itemCount, 2, "pending grocery context should keep item count");
  assert.equal(pending?.participantKey, claim.participantKey, "pending grocery context should keep the same participant key");
  await page.close();
}

async function verifyOwnerGroceryShareRefreshFlow({ browser, apiBaseUrl, webBaseUrl }) {
  const ownerShare = await request(`${apiBaseUrl}/grocery-share-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      title: "测试清单同步",
      items: [
        { id: "ingredient:tomato", name: "西红柿", amount: "2 个", category: "蔬菜", checked: false },
      ],
    },
  });
  await request(`${apiBaseUrl}/grocery-share-requests/${ownerShare.request.token}/claims`, {
    method: "POST",
    body: {
      participantKey: "owner-refresh-grocery",
      memberName: "阿宁",
      status: "claimed",
      itemIds: ["ingredient:tomato"],
    },
  });
  await request(`${apiBaseUrl}/grocery-share-requests/${ownerShare.request.token}/items/${encodeURIComponent("ingredient:tomato")}/check`, {
    method: "POST",
    body: { checked: true },
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((payload) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:meal-plan:v1", JSON.stringify({
      [payload.todayKey]: {
        breakfast: [],
        lunch: [],
        dinner: [{ recipeId: "tomato-egg", quantity: 1 }],
      },
    }));
    localStorage.setItem("humi:active-grocery-share-request:v1", JSON.stringify(payload.shareRequest));
  }, {
    todayKey: formatLocalDateKey(),
    shareRequest: {
      ...ownerShare.request,
      items: [{ id: "ingredient:tomato", name: "西红柿", amount: "2 个", category: "蔬菜", checked: false }],
      claims: [],
    },
  });

  try {
    await page.goto(`${webBaseUrl}/?view=grocery`, { waitUntil: "domcontentloaded" });
    await page.getByText("买菜协作").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "刷新协作" }).click();
    await page.waitForFunction(() => {
      const checkedItems = JSON.parse(localStorage.getItem("family-menu:checked-items") || "{}");
      const pantryItems = JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]");
      return checkedItems["ingredient:tomato"] === true &&
        pantryItems.some((item) => item.name === "西红柿" && item.source === "家人买菜回传");
    }, null, { timeout: 10000 });
    await page.getByText("已买 1/1").waitFor({ timeout: 10000 });
  } finally {
    await context.close();
  }
}

async function verifyMenuShareGuestFlow({ browser, token, webBaseUrl }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${webBaseUrl}/?menuShare=${encodeURIComponent(token)}&shareSource=today_menu`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "测试家今晚安排好了。" }).waitFor({ timeout: 10000 });
  await page.getByText("西红柿炒鸡蛋", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("青椒土豆丝", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("4 项").waitFor({ timeout: 10000 });
  await assertElementInFirstViewport(page.getByText("西红柿炒鸡蛋", { exact: true }), "first shared menu dish");
  await assertElementInFirstViewport(page.getByText("青椒土豆丝", { exact: true }), "second shared menu dish");
  await assertElementInFirstViewport(page.getByRole("button", { name: "回到 Humi" }), "menu return action");
  const authLandingVisible = await page.getByRole("heading", { name: "先把今晚这顿顺起来" }).isVisible().catch(() => false);
  assert.equal(authLandingVisible, false, "menu share guest landing should bypass auth landing");
  await page.close();
}

async function verifyWishGuestAndOwnerFlow({ browser, token, apiBaseUrl, webBaseUrl }) {
  const guestPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await guestPage.goto(`${webBaseUrl}/?wishShare=${encodeURIComponent(token)}&shareSource=wish`, { waitUntil: "domcontentloaded" });
  await guestPage.getByRole("heading", { name: "你最近想吃什么？" }).waitFor({ timeout: 10000 });
  assert.equal(
    await guestPage.getByPlaceholder("怎么称呼你？可不填").isVisible().catch(() => false),
    false,
    "wish landing should not show name input before optional details are opened",
  );
  await assertElementInFirstViewport(
    guestPage.getByPlaceholder("比如：糖醋排骨、番茄牛腩、凉拌黄瓜"),
    "wish dish input",
  );
  await assertElementInFirstViewport(guestPage.getByRole("button", { name: "发给主厨" }), "wish submit action");
  await guestPage.getByPlaceholder("比如：糖醋排骨、番茄牛腩、凉拌黄瓜").fill("糖醋排骨");
  await guestPage.getByRole("button", { name: "补一句，可不填" }).click();
  await guestPage.getByPlaceholder("怎么称呼你？可不填").fill("阿宁");
  await guestPage.getByPlaceholder("补一句：少辣、想清淡、周末再做...").fill("周末做");
  await guestPage.getByRole("button", { name: "发给主厨" }).click();
  await guestPage.getByRole("heading", { name: "收到，已经放进想吃池候选。" }).waitFor({ timeout: 10000 });

  const updated = await request(`${apiBaseUrl}/wish-share-requests/${encodeURIComponent(token)}`);
  const wish = updated.request?.wishes?.[0];
  assert.equal(wish?.memberName, "阿宁", "wish share should save guest name");
  assert.equal(wish?.dishName, "糖醋排骨", "wish share should save guest dish name");
  assert.equal(wish?.note, "周末做", "wish share should save guest note");
  assert.equal(wish?.temporary, true, "wish share should stay temporary before login");
  assert(wish?.participantKey, "wish share should expose participant key for member merge");

  await guestPage.getByRole("button", { name: "加入这个家" }).click();
  await guestPage.getByRole("heading", { name: "刚才写的想吃已经保留" }).waitFor({ timeout: 10000 });
  const pending = await guestPage.evaluate(() => JSON.parse(localStorage.getItem("humi:pending-join-context:v1") || "null"));
  assert.equal(pending?.type, "wish", "joining after wish share should create pending join context");
  assert.equal(pending?.memberName, "阿宁", "pending wish context should keep guest name");
  assert.equal(pending?.dishWish, "糖醋排骨", "pending wish context should keep dish wish");
  assert.equal(pending?.participantKey, wish.participantKey, "pending wish context should keep the same participant key");
  await guestPage.close();

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerPage = await context.newPage();
  await ownerPage.addInitScript((activeRequest) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:active-wish-share-request:v1", JSON.stringify(activeRequest));
  }, {
    token,
    householdName: "测试家",
    initiatorName: "主厨",
    title: "测试想吃池",
    status: "open",
    wishes: [],
  });

  try {
    await ownerPage.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await ownerPage.getByRole("button", { name: "刷新想吃" }).first().click();
    await ownerPage.waitForFunction(() => {
      const wishPool = JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]");
      return wishPool.some((item) => item.name === "糖醋排骨");
    }, null, { timeout: 10000 });
    const wishPool = await ownerPage.evaluate(() => JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]"));
    const pooledWish = wishPool.find((item) => item.name === "糖醋排骨");
    assert(pooledWish, "owner refresh should collect wish share entries into wish pool");
    assert.match(pooledWish.source || "", /阿宁想吃/, "wish pool item should keep guest source");
  } finally {
    await context.close();
  }
}

async function verifyShareLandingErrorFallbacks({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const cases = [
    { query: "crave=missing-crave", heading: "这个链接暂时不可用" },
    { query: "groceryShare=missing-grocery", heading: "这份清单暂时不可用" },
    { query: "menuShare=missing-menu", heading: "这个菜单暂时不可用" },
    { query: "wishShare=missing-wish", heading: "这个入口暂时不可用" },
  ];

  try {
    for (const item of cases) {
      await page.goto(`${webBaseUrl}/?${item.query}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: item.heading }).waitFor({ timeout: 10000 });
      assert.equal(await page.getByRole("button", { name: "重试", exact: true }).count(), 1, `${item.heading} should offer retry`);
      assert.equal(await page.getByRole("button", { name: "回到 Humi", exact: true }).count(), 1, `${item.heading} should offer a safe exit`);
      assert.equal(await page.getByRole("img").count(), 0, `${item.heading} should stay compact without a large empty-state illustration`);
    }
  } finally {
    await context.close();
  }
}

async function verifyWishPoolPlanningFlow({ browser, apiBaseUrl, webBaseUrl }) {
  const wishShare = await request(`${apiBaseUrl}/wish-share-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      title: "测试想吃池安排",
    },
  });
  await request(`${apiBaseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    body: {
      participantKey: "wish-plan-guest",
      memberName: "阿宁",
      dishName: "西红柿炒鸡蛋",
      note: "今晚想吃",
    },
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((activeRequest) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:active-wish-share-request:v1", JSON.stringify(activeRequest));
  }, {
    token: wishShare.request.token,
    householdName: "测试家",
    initiatorName: "主厨",
    title: "测试想吃池安排",
    status: "open",
    wishes: [],
  });

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "刷新想吃" }).first().click();
    await page.getByText("西红柿炒鸡蛋").first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "今晚做" }).first().click();
    await page.waitForFunction(() => {
      const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
      const wishPool = JSON.parse(localStorage.getItem("humi:wish-pool:v1") || "[]");
      return todayMenu.some((item) => item.recipeId === "tomato-egg") &&
        !wishPool.some((item) => item.recipeId === "tomato-egg");
    }, null, { timeout: 10000 });

  } finally {
    await context.close();
  }

  const unmatchedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const unmatchedPage = await unmatchedContext.newPage();
  await unmatchedPage.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:wish-pool:v1", JSON.stringify([{
      id: "wish:unmatched",
      recipeId: "",
      name: "外婆的神秘菜",
      source: "阿宁想吃",
    }]));
  });
  try {
    await unmatchedPage.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await unmatchedPage.getByText("外婆的神秘菜", { exact: true }).first().waitFor({ timeout: 10000 });
    await unmatchedPage.getByRole("button", { name: "去挑菜" }).first().click();
    await unmatchedPage.getByRole("heading", { name: "全部菜品库" }).first().waitFor({ timeout: 10000 });
    await unmatchedPage.getByText("我的家 · 推荐外子页面").waitFor({ timeout: 10000 });
  } finally {
    await unmatchedContext.close();
  }
}

async function verifyOwnerCraveClosureFlow({ browser, apiBaseUrl, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });
  await seedLocalOwnerSession(page);

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "问问大家想吃啥" }).click();
    await page.getByText("今晚想问谁").waitFor({ timeout: 10000 });
    await page.getByText("默认全选，家人点开卡片免登录参与").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "想喝汤" }).click();
    await page.getByRole("button", { name: "生成征集单" }).click();

    await page.waitForFunction(() => {
      const request = JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null");
      return Boolean(request?.token && request?.ownerSecret);
    }, null, { timeout: 10000 });

    const activeRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    assert(activeRequest?.token, "owner should create a crave request token from dashboard");
    assert(activeRequest?.ownerSecret, "owner should keep ownerSecret locally for closing the request");
    assert(activeRequest?.targetParticipantNames?.includes("家人"), "dashboard crave request should keep selected audience");

    await request(`${apiBaseUrl}/crave-requests/${encodeURIComponent(activeRequest.token)}/votes`, {
      method: "POST",
      body: {
        participantKey: "owner-flow-guest",
        memberName: "阿宁",
        feelingTag: "想喝汤",
        dishWish: "番茄汤",
        temporary: true,
      },
    });

    await page.getByRole("button", { name: "刷新回复" }).click();
    await page.getByText("收到 1 个感觉").waitFor({ timeout: 10000 });
    const refreshedRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    assert(refreshedRequest?.votes?.some((vote) => vote.memberName === "阿宁" && vote.feelingTag === "想喝汤"), "owner refresh should pull guest crave vote into local request");
    await page.getByRole("button", { name: "就这些，出菜单" }).click();
    await page.getByText("确认菜单").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "就做这些" }).click();

    await page.waitForFunction(() => {
      const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
      return todayMenu.length > 0;
    }, null, { timeout: 10000 });

    const todayMenu = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
    assert(todayMenu.length > 0, "confirmed crave menu should write dishes into tonight menu");

    await page.getByRole("button", { name: "做了", exact: true }).first().click();
    let mealLog = await readTodayMealLog(page);
    assert.equal(mealLog?.source, "home", "one-tap dinner confirmation should mark dinner as home cooked");
    assert.equal(mealLog?.confirmation, "all", "one-tap done should confirm all planned dinner dishes");
    assert((mealLog?.consumedEntries ?? []).length > 0, "one-tap done should keep planned dishes in consumed entries");
    assert((mealLog?.pantryConsumedRecipeIds ?? []).length > 0, "one-tap done should mark planned dishes as pantry-consumed for this log");

    await page.getByRole("button", { name: "换了别的", exact: true }).first().click();
    mealLog = await readTodayMealLog(page);
    assert.equal(mealLog?.source, "home", "changed dinner should still count as a home dinner source");
    assert.equal(mealLog?.confirmation, "missed", "changed dinner should mark planned dishes as not cooked");
    assert.equal((mealLog?.consumedEntries ?? []).length, 0, "changed dinner should not count planned dishes as consumed");
    assert.equal((mealLog?.pantryConsumedRecipeIds ?? []).length, 0, "changed dinner should clear stale pantry consumption markers");

    await page.getByRole("button", { name: "出去吃了", exact: true }).first().click();
    mealLog = await readTodayMealLog(page);
    assert.equal(mealLog?.source, "outside", "outside dinner should record outside source");
    assert.equal((mealLog?.consumedEntries ?? []).length, 0, "outside dinner should not count planned dishes as consumed");
    assert.equal((mealLog?.pantryConsumedRecipeIds ?? []).length, 0, "outside dinner should not keep stale pantry consumption markers");

    await page.getByRole("button", { name: "做了", exact: true }).first().click();
    mealLog = await readTodayMealLog(page);
    assert((mealLog?.pantryConsumedRecipeIds ?? []).length > 0, "done after outside should rebuild pantry consumption markers");

    await page.getByRole("button", { name: "不记录", exact: true }).first().click();
    mealLog = await readTodayMealLog(page);
    assert.equal(mealLog?.source, "skip", "skip dinner should record the legal no-log source");
    assert.equal(mealLog?.confirmation, undefined, "skip dinner should not keep a dinner confirmation");
    assert.equal((mealLog?.consumedEntries ?? []).length, 0, "skip dinner should not count planned dishes as consumed");
    assert.equal((mealLog?.pantryConsumedRecipeIds ?? []).length, 0, "skip dinner should clear stale pantry consumption markers");

    await page.getByRole("button", { name: "做了", exact: true }).first().click();
    const craveSignals = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]"));
    assert(craveSignals.some((signal) => signal.requestToken === activeRequest.token), "owner refresh/close should persist crave signal for family portrait");

    await page.getByRole("button", { name: "清单", exact: true }).click();
    await page.getByRole("heading", { name: /项待核对/ }).waitFor({ timeout: 10000 });
    const groceryNamesVisible = await page.locator("text=/西红柿|番茄|鸡蛋|小葱|豆腐|紫菜/").first().isVisible({ timeout: 10000 });
    assert.equal(groceryNamesVisible, true, "confirmed crave menu should generate grocery ingredients");
  } finally {
    await context.close();
  }
}

async function verifyGuestCraveLoginBoundary({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "问问大家想吃啥" }).click();
    await page.getByRole("button", { name: "生成征集单" }).click();
    await page.getByText("发起家庭征集").waitFor({ timeout: 10000 });
    await page.getByText("主厨登录后才能发起；家人点开征集卡片仍然免登录。").waitFor({ timeout: 10000 });
    const activeRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    assert.equal(activeRequest, null, "guest chef should not create a collaboration request before login");
    await page.getByRole("button", { name: "先不发起，回到 Humi" }).click();
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
  } finally {
    await context.close();
  }
}

async function verifyCraveDeadlineFallbackFlow({ browser, apiBaseUrl, webBaseUrl }) {
  const crave = await request(`${apiBaseUrl}/crave-requests`, {
    method: "POST",
    headers: ownerAuthHeaders(),
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      mealType: "dinner",
      starterFeeling: "不想动",
    },
  });
  assert(crave.request?.token, "deadline fallback crave request should create a token");
  assert(crave.ownerSecret, "deadline fallback crave request should expose owner secret");
  assert(Number.isFinite(Date.parse(crave.request.deadlineAt)), "deadline fallback request should expose deadline");

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const expiredCreatedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  const expiredDeadlineAt = new Date(Date.now() - 60 * 1000).toISOString();
  await page.addInitScript(({ request, ownerSecret, expiredCreatedAt, expiredDeadlineAt }) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:active-crave-request:v1", JSON.stringify({
      ...request,
      ownerSecret,
      status: "open",
      starterFeeling: "不想动",
      votes: [],
      audience: [{ id: "family", name: "家人" }],
      targetParticipantNames: ["家人"],
      createdAt: expiredCreatedAt,
      deadlineAt: expiredDeadlineAt,
    }));
  }, {
    request: crave.request,
    ownerSecret: crave.ownerSecret,
    expiredCreatedAt,
    expiredDeadlineAt,
  });

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    await page.waitForFunction(() => {
      const activeRequest = JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null");
      const craveSignals = JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]");
      return activeRequest?.status === "closed" &&
        craveSignals.some((signal) =>
          signal.requestToken === activeRequest.token &&
          signal.feelingTag === "不想动" &&
          Array.isArray(signal.recipeIds) &&
          signal.recipeIds.length > 0
        );
    }, null, { timeout: 10000 });
    await page.getByRole("button", { name: "问问大家想吃啥" }).click();
    await page.getByText("已收口").waitFor({ timeout: 10000 });
    await page.getByText("确认菜单").waitFor({ timeout: 10000 });
  } finally {
    await context.close();
  }
}

async function readTodayMealLog(page) {
  const todayKey = formatLocalDateKey();
  return page.evaluate((dateKey) => {
    const logs = JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}");
    return logs[dateKey] ?? null;
  }, todayKey);
}

async function verifyPantryLightConfirmationFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("family-menu:pantry-items", JSON.stringify([
      { key: "pantry:tomato", name: "西红柿", amount: "2 个", source: "smoke" },
      { key: "pantry:egg", name: "鸡蛋", amount: "4 个", source: "smoke" },
      { key: "pantry:potato", name: "土豆", amount: "2 个", source: "smoke" },
      { key: "pantry:tofu", name: "豆腐", amount: "1 块", source: "smoke" },
    ]));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("这几样家里还在吗？").waitFor({ timeout: 10000 });
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]"));
    await page.getByRole("button", { name: "没了" }).first().click();
    await page.waitForFunction((count) => {
      const pantryItems = JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]");
      return pantryItems.length < count;
    }, before.length, { timeout: 10000 });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]"));
    assert(after.length < before.length, "marking a pantry confirmation as gone should remove it from hidden pantry state");
  } finally {
    await context.close();
  }
}

async function verifyPantryQuickHintFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "想更准？告诉我家里有啥" }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByText("库存", { exact: true }).count(), 0, "pantry hint should not expose an inventory management concept");
    await page.getByRole("button", { name: "想更准？告诉我家里有啥" }).click();
    await page.getByPlaceholder("比如：豆腐、鸡蛋").fill("豆腐、鸡蛋");
    await page.getByRole("button", { name: "记住", exact: true }).click();
    await page.waitForFunction(() => {
      const pantryItems = JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]");
      return pantryItems.some((item) => item.name === "豆腐" && item.source === "顺手告诉 Humi") &&
        pantryItems.some((item) => item.name === "鸡蛋" && item.source === "顺手告诉 Humi");
    }, null, { timeout: 10000 });
    assert.equal(
      await page.getByRole("button", { name: "想更准？告诉我家里有啥" }).count(),
      0,
      "pantry quick hint should disappear after the optional input is saved",
    );
  } finally {
    await context.close();
  }
}

async function verifyGroceryCheckAddsHiddenPantry({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((todayKey) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:meal-plan:v1", JSON.stringify({
      [todayKey]: {
        breakfast: [],
        lunch: [],
        dinner: [{ recipeId: "tomato-egg", quantity: 1 }],
      },
    }));
  }, formatLocalDateKey());

  try {
    await page.goto(`${webBaseUrl}/?view=grocery`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /项待核对/ }).waitFor({ timeout: 10000 });
    await expectHiddenText(page, "后台已有项");
    await expectHiddenText(page, "后台已记");
    await expectHiddenText(page, "当前后台记着");
    await expectHiddenText(page, "后台食材记录");
    await page.locator("label").filter({ hasText: "西红柿" }).first().click();
    await page.waitForFunction(() => {
      const pantryItems = JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]");
      return pantryItems.some((item) => item.name === "西红柿");
    }, null, { timeout: 10000 });
    const pantryItems = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]"));
    assert(pantryItems.some((item) => item.name === "西红柿" && item.source === "清单完成"), "checking a grocery item should add it to hidden pantry state");
  } finally {
    await context.close();
  }
}

async function verifyGroceryEmptyStateFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=grocery`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "清单还空着" }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole("button", { name: "返回上一页" }).count(), 0, "grocery is a root tab and should not show a back button");
    await expectHiddenText(page, "还没有餐次要核对");
    assert.equal(
      await page.getByRole("button", { name: /分享清单|生成清单海报|有清单后可分享/ }).count(),
      0,
      "empty grocery list should not render a misleading share action",
    );
    await page.getByRole("button", { name: "去安排晚饭" }).first().click();
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
  } finally {
    await context.close();
  }
}

async function verifyProfileOnboardingHardInfoOnly({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(false));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "profile-onboarding-smoke",
      user: {
        id: "profile-owner-smoke",
        displayName: "主厨",
        provider: "smoke",
      },
    }));
  });

  try {
    await page.goto(`${webBaseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "先确认家里不能吃的" }).waitFor({ timeout: 10000 });
    await page.getByText("家里几个人吃饭").waitFor({ timeout: 10000 });
    await page.getByText("绝不想吃 / 不能吃").waitFor({ timeout: 10000 });
    assert.equal(await page.getByText("这次主要想规划什么").count(), 0, "profile onboarding should not ask users to maintain planning modes");
    assert.equal(await page.getByText("买菜接受度").count(), 0, "profile onboarding should not ask users to maintain shopping tolerance");
    assert.equal(await page.getByRole("img", { name: "家庭画像生活场景" }).count(), 0, "profile onboarding should not occupy the first screen with an illustration");

    await page.getByRole("button", { name: "香菜", exact: true }).click();
    await page.getByRole("button", { name: "开始使用 Humi" }).click();
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });

    const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:family-profile") || "null"));
    assert(savedProfile?.dislikes?.includes("香菜"), "profile onboarding should persist hard avoid choices");
    assert.equal(savedProfile?.hardAvoidReviewed, true, "profile onboarding should record that hard avoids were reviewed");
  } finally {
    await context.close();
  }
}

async function verifyTemporaryJoinMergeFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((todayKey) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "smoke-local-session",
      user: {
        id: "owner-smoke",
        displayName: "主厨",
        provider: "smoke",
      },
    }));
    localStorage.setItem("humi:pending-join-context:v1", JSON.stringify({
      type: "crave",
      participantKey: "join-merge-guest",
      memberName: "阿宁",
      feelingTag: "想喝汤",
      dishWish: "番茄汤",
      householdName: "测试家",
      createdAt: new Date().toISOString(),
    }));
    localStorage.setItem("humi:active-crave-request:v1", JSON.stringify({
      token: "join-merge-token",
      status: "open",
      householdName: "测试家",
      initiatorName: "主厨",
      votes: [{
        id: "vote-join-merge",
        participantKey: "join-merge-guest",
        memberName: "阿宁",
        feelingTag: "想喝汤",
        dishWish: "番茄汤",
        temporary: true,
        createdAt: new Date().toISOString(),
      }],
    }));
    localStorage.setItem("humi:crave-signals:v1", JSON.stringify([{
      id: "signal-join-merge",
      requestToken: "join-merge-token",
      feelingTag: "想喝汤",
      voteCount: 1,
      votes: [{
        participantKey: "join-merge-guest",
        memberName: "阿宁",
        feelingTag: "想喝汤",
        dishWish: "番茄汤",
        temporary: true,
      }],
      createdAt: new Date().toISOString(),
    }]));
    localStorage.setItem("humi:wish-pool:v1", JSON.stringify([{
      id: "wish:tomato-egg",
      recipeId: "tomato-egg",
      name: "西红柿炒鸡蛋",
      source: "阿宁想吃",
      createdAt: new Date().toISOString(),
    }]));
    localStorage.setItem("family-menu:meal-logs:v1", JSON.stringify({
      [todayKey]: {
        source: "home",
        confirmation: "all",
        consumedEntries: [{ recipeId: "tomato-egg", quantity: 1 }],
        updatedAt: new Date().toISOString(),
      },
    }));
  }, formatLocalDateKey());

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "阿宁刚刚参与了。" }).waitFor({ timeout: 10000 });
    const homeHero = page.getByRole("heading", { name: "阿宁刚刚参与了。" }).locator("..");
    await homeHero.getByText("阿宁点了“想喝汤”，还提到“番茄汤”。", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("协作主场").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "今晚先看这三件事" }).waitFor({ timeout: 10000 });
    await page.getByText(/画像回执：\d+ 条线索/).waitFor({ timeout: 10000 });
    await page.getByText("这周家里的饭").waitFor({ timeout: 10000 });
    const heroBeforeFamilyPulse = await page.evaluate(() => {
      const heroHeading = [...document.querySelectorAll("h2")]
        .find((node) => node.textContent?.includes("阿宁刚刚参与了。"));
      const pulseHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("Humi 正在记住这些变化"));
      if (!heroHeading || !pulseHeading) return false;
      return Boolean(heroHeading.compareDocumentPosition(pulseHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(heroBeforeFamilyPulse, true, "my home hero should show latest family activity before secondary panels");
    const collaborationBeforeFamilyPulse = await page.evaluate(() => {
      const collaborationHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("今晚先看这三件事"));
      const pulseHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("Humi 正在记住这些变化"));
      if (!collaborationHeading || !pulseHeading) return false;
      return Boolean(collaborationHeading.compareDocumentPosition(pulseHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(collaborationBeforeFamilyPulse, true, "my home collaboration hub should appear before family portrait reflection");
    const receiptHintBeforeFamilyPulse = await page.evaluate(() => {
      const receiptHint = [...document.querySelectorAll("p")]
        .find((node) => node.textContent?.includes("画像回执："));
      const pulseHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("Humi 正在记住这些变化"));
      if (!receiptHint || !pulseHeading) return false;
      return Boolean(receiptHint.compareDocumentPosition(pulseHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(receiptHintBeforeFamilyPulse, true, "my home should expose portrait receipt before deeper reflection panels");
    const familyPulseBeforeAccount = await page.evaluate(() => {
      const pulseHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("Humi 正在记住这些变化"));
      const accountHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("保存家里的吃饭习惯"));
      if (!pulseHeading || !accountHeading) return false;
      return Boolean(pulseHeading.compareDocumentPosition(accountHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(familyPulseBeforeAccount, true, "my home should show family eating dynamics before account/save settings");
    await page.getByText(/想喝汤/).first().waitFor({ timeout: 10000 });
    await page.getByText("今天吃得怎么样").waitFor({ timeout: 10000 });
    await page.getByText(/今天 · 晚饭做了 西红柿炒鸡蛋/).waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "已留下 1 条三餐记录" }).waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "1 道想吃" }).waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "自然动作已经在生成画像" }).waitFor({ timeout: 10000 });
    await page.getByText("下一顿会用").first().waitFor({ timeout: 10000 });
    await page.getByText(/条自然动作整理成画像线索/).first().waitFor({ timeout: 10000 });
    await page.getByText("体验边界", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText(/免费无限：感觉征集/).waitFor({ timeout: 10000 });
    await page.getByText(/精准质量层：/).waitFor({ timeout: 10000 });
    await page.getByText(/基础推荐/).first().waitFor({ timeout: 10000 });
    await page.getByText("刚才的感觉已经保留").waitFor({ timeout: 10000 });
    await page.getByText("点“收进家庭成员”后，这次临时参与才会合并成正式成员记录。").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "家庭信息与忌口" }).click();
    await page.getByRole("heading", { name: "人数和忌口" }).waitFor({ timeout: 10000 });
    await page.getByText("软口味来源").waitFor({ timeout: 10000 });
    await page.getByText("绝不想吃 / 不能吃").waitFor({ timeout: 10000 });
    assert.equal(
      await page.getByText("平时喜欢怎么吃").count(),
      0,
      "my home profile settings should not expose a manual soft-taste preference form",
    );
    assert.equal(
      await page.getByText("晚饭最在意什么").count(),
      0,
      "my home profile settings should not expose manual dinner goal maintenance",
    );
    assert.equal(
      await page.getByText("这次主要想规划什么").count(),
      0,
      "my home settings should not ask users to maintain a planning mode",
    );
    assert.equal(
      await page.getByText("买菜接受度").count(),
      0,
      "my home settings should not ask users to maintain shopping tolerance",
    );
    await page.getByRole("button", { name: "家庭信息与忌口" }).click();
    await page.getByRole("button", { name: "收进家庭成员" }).click();
    await page.waitForFunction(() => {
      const value = localStorage.getItem("humi:pending-join-context:v1");
      return value === null || value === "null";
    }, null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const members = JSON.parse(localStorage.getItem("humi:household-members:v1") || "[]");
      return members.some((member) => member.name === "阿宁" && member.status === "正式成员");
    }, null, { timeout: 10000 });

    const householdMembers = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:household-members:v1") || "[]"));
    assert(householdMembers.some((member) => member.name === "阿宁" && member.status === "正式成员"), "accepting pending join should create a formal household member");

    const activeRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    const mergedVote = activeRequest?.votes?.find((vote) => vote.participantKey === "join-merge-guest");
    assert.equal(mergedVote?.temporary, false, "accepting pending join should merge active crave vote into a formal member");
    assert(mergedVote?.mergedAt, "merged crave vote should keep merge timestamp");

    const craveSignals = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]"));
    const signalVote = craveSignals[0]?.votes?.find((vote) => vote.participantKey === "join-merge-guest");
    assert.equal(signalVote?.temporary, false, "accepting pending join should merge historical crave signal vote");
  } finally {
    await context.close();
  }
}

async function verifyHouseholdUserCenterFlow({ browser, apiBaseUrl, webBaseUrl }) {
  const login = await request(`${apiBaseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: "household-ui-owner" },
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((session) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify(session));
  }, login);

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByText("当前家庭空间").first().waitFor({ timeout: 10000 });
    await page.getByText("你是主厨，可以邀请家人；不同家庭的菜单、清单和画像会分开保存。").waitFor({ timeout: 10000 });

    await page.getByRole("button", { name: "邀请家人" }).click();
    await page.getByText("家庭邀请卡片已准备好").waitFor({ timeout: 10000 });
    const invite = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:household-invite:v1") || "null"));
    assert(invite?.token, "my home should persist a real household invite token");

    await page.getByPlaceholder("例如：爸妈家").fill("爸妈家");
    await page.getByRole("button", { name: "新建一个家" }).click();
    await page.getByRole("button", { name: "爸妈家", exact: true }).waitFor({ timeout: 10000 });
    const householdsAfterCreate = await request(`${apiBaseUrl}/households`, {
      headers: { Authorization: `Bearer ${login.accessToken}` },
    });
    assert(householdsAfterCreate.households?.length === 2, "my home should create a second household through the API");
    assert(householdsAfterCreate.family?.name === "爸妈家", "new household should become active after creation");

    await page.getByRole("main").getByRole("button", { name: "我的家", exact: true }).click();
    await page.waitForFunction(() => {
      const buttons = [...document.querySelectorAll("button")];
      return buttons.some((button) => button.textContent?.includes("我的家") && String(button.className || "").includes("bg-ink"));
    }, null, { timeout: 10000 });
    const householdsAfterSwitch = await request(`${apiBaseUrl}/households`, {
      headers: { Authorization: `Bearer ${login.accessToken}` },
    });
    assert(householdsAfterSwitch.family?.name === "我的家", "household switcher should update the active household on the server");
  } finally {
    await context.close();
  }
}

async function verifyMyHomeCraveStartFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });
  await seedLocalOwnerSession(page);

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByText("协作主场").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "问问大家", exact: true }).click();
    await page.getByText("今晚想问问大家什么感觉？").waitFor({ timeout: 10000 });
    await page.getByText("今晚想问谁").waitFor({ timeout: 10000 });
    await page.getByText("征集单模板").waitFor({ timeout: 10000 });
    await page.getByText("家人动作").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "想喝汤" }).click();
    await page.getByRole("button", { name: "发起征集" }).click();
    await page.getByText("征集单已经在路上").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "今晚口味征集单" }).waitFor({ timeout: 10000 });
    await page.getByText(/CRAVE-[A-Z0-9]{6}/).waitFor({ timeout: 10000 });
    await page.getByText("兜底感觉", { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText("想喝汤").first().waitFor({ timeout: 10000 });
    const activeRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    assert(activeRequest?.token, "my home crave composer should create an active crave request");
    assert.equal(activeRequest?.starterFeeling, "想喝汤", "my home crave composer should keep starter feeling");
    assert(activeRequest?.targetParticipantNames?.includes("家人"), "my home crave composer should keep selected audience");
  } finally {
    await context.close();
  }
}

async function verifyMyHomeFirstViewportHierarchy({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByText("协作主场").waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole("button", { name: "返回上一页" }).count(), 0, "my home is a root tab and should not show a back button");
    await page.getByRole("heading", { name: "今晚先看这三件事" }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole("heading", { name: "今晚一家人进展" }).count(), 0, "my home should not repeat the collaboration hub");
    assert.equal(await page.getByRole("heading", { name: "吃饭画像慢慢反射" }).count(), 0, "my home should not repeat the portrait receipt");
    assert.equal(await page.getByRole("heading", { name: "自然动作已经在生成画像" }).count(), 0, "empty portrait receipt should stay hidden until the first signal exists");
    const firstViewportInkButtons = await getFirstViewportInkButtonLabels(page);
    assert.equal(
      JSON.stringify(firstViewportInkButtons),
      JSON.stringify([]),
      `my home first viewport should not contain competing ink primary buttons, found: ${firstViewportInkButtons.join(", ")}`,
    );
    const askButtonsInFirstViewport = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((button) => button.textContent?.trim() === "问问大家")
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= window.innerHeight;
        }).length,
    );
    assert.equal(askButtonsInFirstViewport, 1, "my home first viewport should expose one clear ask-family entry");
  } finally {
    await context.close();
  }
}

async function verifyMyHomeSoloFallbackFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByText("协作主场").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "问问大家", exact: true }).click();
    await page.getByText("今晚想问问大家什么感觉？").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "想喝汤" }).click();
    await page.getByRole("button", { name: "我自己做主" }).click();
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    await page.getByText(/已先按“想喝汤”揉合出一组/).waitFor({ timeout: 10000 });

    await page.waitForFunction(() => {
      const craveSignals = JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]");
      return craveSignals.some((signal) =>
        signal.feelingTag === "想喝汤" &&
        Array.isArray(signal.recipeIds) &&
        signal.recipeIds.length > 0
      );
    }, null, { timeout: 10000 });
    const activeRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    assert.equal(activeRequest, null, "solo fallback should not create a share request");
  } finally {
    await context.close();
  }
}

async function verifyDashboardSoloFallbackFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "问问大家想吃啥" }).click();
    await page.getByRole("heading", { name: "先发一张征集单" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "想喝汤" }).click();
    await page.getByRole("button", { name: "我自己做主，直接出菜单" }).click();
    await page.getByText(/已先按“想喝汤”揉合出一组/).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "今晚就做" }).click();

    await page.waitForFunction(() => {
      const todayMenu = JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]");
      const craveSignals = JSON.parse(localStorage.getItem("humi:crave-signals:v1") || "[]");
      return todayMenu.length > 0 && craveSignals.some((signal) =>
        signal.feelingTag === "想喝汤" &&
        Array.isArray(signal.recipeIds) &&
        signal.recipeIds.length > 0
      );
    }, null, { timeout: 10000 });
  } finally {
    await context.close();
  }
}

async function verifyDashboardPrimaryActionHierarchy({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });
  await seedLocalOwnerSession(page);

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    assert.equal(await buttonHasInkFill(page, "今晚就做"), true, "dashboard should keep exactly one dinner primary action before collaboration starts");

    await page.getByRole("button", { name: "问问大家想吃啥" }).click();
    await page.getByRole("heading", { name: "先发一张征集单" }).waitFor({ timeout: 10000 });
    assert.equal(await buttonHasInkFill(page, "生成征集单"), false, "crave composer should be secondary so it does not compete with dinner primary");

    await page.getByRole("button", { name: "生成征集单" }).click();
    await page.waitForFunction(() => {
      const request = JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null");
      return Boolean(request?.token && request?.ownerSecret);
    }, null, { timeout: 10000 });
    await page.getByRole("button", { name: "分享征集单" }).waitFor({ timeout: 10000 });
    assert.equal(await buttonHasInkFill(page, "分享征集单"), false, "share crave request should stay secondary on the dashboard");

    await page.getByRole("button", { name: "就这些，出菜单" }).click();
    await page.getByText("确认菜单").waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole("button", { name: "今晚就做", exact: true }).isVisible().catch(() => false), false, "closed crave confirmation should hide the duplicate top dinner primary");
    assert.equal(await buttonHasInkFill(page, "就做这些"), true, "closed crave confirmation should leave the final accept action as the only ink primary");
    const selectedDishButtonsUseInk = await page.locator("button", { hasText: "已选这道" }).evaluateAll((buttons) =>
      buttons.some((button) => String(button.className || "").includes("bg-ink")),
    );
    assert.equal(selectedDishButtonsUseInk, false, "selected crave dishes should not look like competing primary actions");
  } finally {
    await context.close();
  }
}

async function verifyCraveRejectReturnsToFeelingChoice({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });
  await seedLocalOwnerSession(page);

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "问问大家想吃啥" }).click();
    await page.getByRole("button", { name: "生成征集单" }).click();
    await page.waitForFunction(() => {
      const request = JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null");
      return Boolean(request?.token && request?.ownerSecret);
    }, null, { timeout: 10000 });
    await page.getByRole("button", { name: "就这些，出菜单" }).click();
    await page.getByText("确认菜单").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "都不想吃，重选感觉" }).click();
    await page.getByRole("heading", { name: "先发一张征集单" }).waitFor({ timeout: 10000 });
    await page.getByText("今晚想问谁").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "我自己做主，直接出菜单" }).waitFor({ timeout: 10000 });
    const activeRequest = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:active-crave-request:v1") || "null"));
    assert.equal(activeRequest, null, "rejecting all crave suggestions should return to feeling choice instead of keeping a closed request");
  } finally {
    await context.close();
  }
}

async function verifyLibraryMealPlanningFlow({ browser, webBaseUrl, expectedRecipeCount }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("humi-smoke-seeded")) {
      localStorage.clear();
      sessionStorage.setItem("humi-smoke-seeded", "1");
    }
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("今晚吃什么").waitFor({ timeout: 10000 });
    const primaryDinnerBeforeBreakfast = await page.evaluate(() => {
      const dinnerButton = [...document.querySelectorAll("button")]
        .find((node) => node.textContent?.includes("今晚就做"));
      const breakfastButton = [...document.querySelectorAll("button")]
        .find((node) => node.textContent?.includes("选早餐吃什么"));
      if (!dinnerButton || !breakfastButton) return false;
      return Boolean(dinnerButton.compareDocumentPosition(breakfastButton) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(primaryDinnerBeforeBreakfast, true, "tonight primary action should appear before breakfast/lunch light recording");
    await page.getByRole("button", { name: "选早餐吃什么" }).click();
    await page.getByRole("heading", { name: "给早餐选菜" }).first().waitFor({ timeout: 10000 });
    const mealLogsBeforeBreakfastPick = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}"));
    assert.equal(
      mealLogsBeforeBreakfastPick?.[formatLocalDateKey()]?.mealSources?.breakfast,
      undefined,
      "breakfast should not be recorded as home before the user picks a dish",
    );
    await page.getByText(`共 ${expectedRecipeCount} 道`).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "加入 西红柿炒鸡蛋" }).click();
    await page.getByRole("heading", { name: "早餐已选择" }).waitFor({ timeout: 10000 });
    await page.getByText("西红柿炒鸡蛋").first().waitFor({ timeout: 10000 });

    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "记录午餐来源" }).waitFor({ state: "visible", timeout: 10000 });
    assert.equal(
      await page.getByRole("button", { name: "选午餐吃什么" }).isVisible().catch(() => false),
      false,
      "lunch should start from source recording instead of direct dish picking",
    );
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "记录午餐来源" }).click();
    await page.getByRole("heading", { name: "在家做就先去选菜" }).waitFor({ timeout: 10000 });
    const mealLogsBeforeLunchSourcePick = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}"));
    assert.equal(
      mealLogsBeforeLunchSourcePick?.[formatLocalDateKey()]?.mealSources?.lunch,
      undefined,
      "lunch should not be recorded before the user picks a source or dish",
    );
    await page.locator("section").filter({ hasText: "午餐来源" }).getByRole("button", { name: "在家做" }).click();
    await page.getByRole("heading", { name: "给午餐选菜" }).first().waitFor({ timeout: 10000 });
    await page.getByText("今晚菜单 · 选餐子页面").waitFor({ timeout: 10000 });
    await page.getByText(`共 ${expectedRecipeCount} 道`).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "加入 蒜蓉西兰花" }).click();
    await page.getByRole("heading", { name: "午餐已选择" }).waitFor({ timeout: 10000 });
    await page.getByText("蒜蓉西兰花").first().waitFor({ timeout: 10000 });

    const mealPlan = await page.evaluate(() => JSON.parse(localStorage.getItem("humi:meal-plan:v1") || "{}"));
    const todayKey = formatLocalDateKey();
    const breakfastRecipeIds = mealPlan?.[todayKey]?.breakfast?.map((entry) => entry.recipeId) ?? [];
    const lunchRecipeIds = mealPlan?.[todayKey]?.lunch?.map((entry) => entry.recipeId) ?? [];
    assert(breakfastRecipeIds.includes("tomato-egg"), "breakfast should record the dish the user selected");
    assert(!breakfastRecipeIds.includes("seaweed-egg-soup"), "breakfast should not default to seaweed egg soup");
    assert(lunchRecipeIds.includes("garlic-broccoli"), "lunch should record the dish the user selected");
    assert(!lunchRecipeIds.includes("seaweed-egg-soup"), "lunch should not default to seaweed egg soup");

    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "全部菜品库" }).click();
    await page.getByRole("heading", { name: "全部菜品库" }).first().waitFor({ timeout: 10000 });
    await page.getByText("发现 · 推荐外子页面").waitFor({ timeout: 10000 });
    const searchInputVisibleByDefault = await page.getByPlaceholder("搜索菜名、食材、标签").isVisible().catch(() => false);
    assert.equal(searchInputVisibleByDefault, false, "top search input should be collapsed by default on child pages");
    await page.getByText(`共 ${expectedRecipeCount} 道`).waitFor({ timeout: 10000 });
    const visibleCardCountBeforeAdd = await page.getByTestId("recipe-card").count();
    assert.equal(
      visibleCardCountBeforeAdd,
      expectedRecipeCount,
      "all-dish child page should show the full recipe card stream before anything is arranged",
    );
    await page.getByRole("button", { name: "加入 青椒土豆丝" }).click();
    await page.getByRole("heading", { name: "今晚已安排" }).waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "未安排的新菜" }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "加入 青椒土豆丝" }).waitFor({ state: "detached", timeout: 10000 });
    await page.getByTestId("selected-recipes-panel").waitFor({ timeout: 10000 });

    const selectedPanelBeforeLibraryIntro = await page.evaluate(() => {
      const selectedHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("今晚已安排"));
      const libraryIntroHeading = [...document.querySelectorAll("h2")]
        .find((node) => node.textContent?.includes("全部菜品库"));
      if (!selectedHeading || !libraryIntroHeading) return false;
      return Boolean(selectedHeading.compareDocumentPosition(libraryIntroHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(selectedPanelBeforeLibraryIntro, true, "arranged dishes panel should appear before the all-dish library intro");

    const selectedPanelBeforeFilters = await page.evaluate(() => {
      const selectedHeading = [...document.querySelectorAll("h3")]
        .find((node) => node.textContent?.includes("今晚已安排"));
      const categoryButton = [...document.querySelectorAll("button")]
        .find((node) => node.textContent?.trim() === "全部");
      if (!selectedHeading || !categoryButton) return false;
      return Boolean(selectedHeading.compareDocumentPosition(categoryButton) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.equal(selectedPanelBeforeFilters, true, "arranged dishes panel should appear above library filters");

    const todayMenu = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:today-menu") || "[]"));
    assert(todayMenu.some((item) => item.recipeId === "potato-shreds"), "all dish library should add the selected dinner dish");

    await page.goto(`${webBaseUrl}/?view=recommendations`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "全部菜品库" }).click();
    await page.getByRole("heading", { name: "全部菜品库" }).first().waitFor({ timeout: 10000 });
    await page.getByText("推荐外入口").first().waitFor({ timeout: 10000 });

    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /全部菜品.*推荐外的完整菜品库.*去挑/ }).click();
    await page.getByRole("heading", { name: "全部菜品库" }).first().waitFor({ timeout: 10000 });
    await page.getByText("我的家 · 推荐外子页面").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "今晚已安排" }).waitFor({ timeout: 10000 });
    const selectedAndVisibleCardCount = await page.evaluate(() => {
      const selectedCountText = [...document.querySelectorAll("[data-testid='selected-recipes-panel'] span")]
        .map((node) => node.textContent || "")
        .find((text) => text.includes("道")) || "0";
      const selectedCount = Number.parseInt(selectedCountText, 10) || 0;
      return selectedCount + document.querySelectorAll("[data-testid='recipe-card']").length;
    });
    assert.equal(
      selectedAndVisibleCardCount,
      expectedRecipeCount,
      "my-home child entry should expose the complete recipe library with arranged dishes pinned above the stream",
    );
  } finally {
    await context.close();
  }
}

async function verifyMealPipelineFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((todayKey) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("family-menu:today-menu", JSON.stringify([
      { recipeId: "potato-shreds", quantity: 1 },
    ]));
    localStorage.setItem("humi:meal-plan:v1", JSON.stringify({
      [todayKey]: {
        breakfast: [{ recipeId: "tomato-egg", quantity: 1 }],
        lunch: [{ recipeId: "garlic-broccoli", quantity: 1 }],
        dinner: [{ recipeId: "potato-shreds", quantity: 1 }],
      },
    }));
    localStorage.setItem("family-menu:meal-logs:v1", JSON.stringify({
      [todayKey]: {
        source: "home",
        mealSources: {
          breakfast: "home",
          lunch: "home",
        },
      },
    }));
    localStorage.setItem("family-menu:pantry-items", JSON.stringify([
      { key: "pantry:potato", name: "土豆", amount: "2 个", source: "清单完成" },
      { key: "pantry:green-pepper", name: "青椒", amount: "1 个", source: "清单完成" },
    ]));
  }, formatLocalDateKey());

  try {
    await page.goto(`${webBaseUrl}/?view=grocery`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /项待核对/ }).waitFor({ timeout: 10000 });
    const breakfastSection = page.getByRole("button", { name: /早餐.*西红柿炒鸡蛋/ });
    await breakfastSection.waitFor({ timeout: 10000 });
    await assertReadableContrast(breakfastSection.locator("span.bg-ink"), "grocery meal count badge");
    await page.getByRole("button", { name: /午餐.*蒜蓉西兰花/ }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /晚餐.*青椒土豆丝/ }).waitFor({ timeout: 10000 });

    await page.locator("label").filter({ hasText: "西红柿" }).first().click();
    await page.waitForFunction(() => {
      const pantryItems = JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]");
      return pantryItems.some((item) => item.name === "西红柿" && item.source === "清单完成");
    }, null, { timeout: 10000 });

    await page.goto(`${webBaseUrl}/?view=dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /今晚安排了/ }).waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "做了" }).first().click();
    await page.waitForFunction(() => {
      const pantryItems = JSON.parse(localStorage.getItem("family-menu:pantry-items") || "[]");
      return !pantryItems.some((item) => item.name === "土豆") && !pantryItems.some((item) => item.name === "青椒");
    }, null, { timeout: 10000 });

    const mealLogs = await page.evaluate(() => JSON.parse(localStorage.getItem("family-menu:meal-logs:v1") || "{}"));
    const todayKey = formatLocalDateKey();
    const log = mealLogs[todayKey];
    assert.equal(log?.confirmation, "all", "one-tap dinner confirmation should record dinner as fully eaten");
    assert(log?.consumedEntries?.some((entry) => entry.recipeId === "potato-shreds"), "dinner confirmation should keep consumed dinner recipe");
    assert(log?.pantryConsumedRecipeIds?.includes("potato-shreds"), "dinner confirmation should record pantry consumption for the cooked recipe");
  } finally {
    await context.close();
  }
}

async function verifyThreeMealPortraitFlow({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((todayKey) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("family-menu:meal-logs:v1", JSON.stringify({
      [todayKey]: {
        source: "home",
        recordedBy: "阿宁",
        confirmation: "all",
        confirmedBy: "阿宁",
        consumedEntries: [{ recipeId: "potato-shreds", quantity: 1 }],
        mealSources: {
          breakfast: "home",
          lunch: "delivery",
        },
        mealRecordedBy: {
          breakfast: "阿宁",
          lunch: "阿宁",
        },
      },
    }));
  }, formatLocalDateKey());

  try {
    await page.goto(`${webBaseUrl}/?view=user`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "三餐记录开始成形。" }).waitFor({ timeout: 10000 });
    await page.getByText("早餐 1 次 · 午餐 1 次 · 晚饭确认 1 次；画像正在成形。").waitFor({ timeout: 10000 });
    await page.getByText("阿宁记下了今天吃饭").waitFor({ timeout: 10000 });
    await page.getByText("今天 · 早餐在家做 · 午餐点外卖 · 晚饭做了 青椒土豆丝").waitFor({ timeout: 10000 });
    await page.getByText("已留下 3 条三餐记录").waitFor({ timeout: 10000 });
    await page.getByText("早餐 1 次 · 午餐 1 次 · 晚饭确认 1 次；晚饭在家做 1 次，外食/外卖 0 次。").waitFor({ timeout: 10000 });
  } finally {
    await context.close();
  }
}

async function verifyTodayMenuResultFirstStructure({ browser, webBaseUrl }) {
  const emptyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const emptyPage = await emptyContext.newPage();
  await emptyPage.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
  });

  try {
    await emptyPage.goto(`${webBaseUrl}/?view=today`, { waitUntil: "domcontentloaded" });
    await emptyPage.getByRole("heading", { name: "今晚可以从这里开始" }).waitFor({ timeout: 10000 });
    assert.equal(await emptyPage.getByRole("button", { name: "返回上一页" }).count(), 1, "tonight menu is a child page and should keep a back button");
    assert.equal(await emptyPage.getByText("今晚菜单还是空的。").count(), 0, "empty tonight menu should not use a large guilt-oriented hero");
    assert.equal(await emptyPage.getByRole("img", { name: "空菜单生活场景" }).count(), 0, "empty tonight menu should not occupy the page with an illustration");
  } finally {
    await emptyContext.close();
  }

  const filledContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const filledPage = await filledContext.newPage();
  await filledPage.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("family-menu:today-menu", JSON.stringify([
      { recipeId: "potato-shreds", quantity: 1 },
    ]));
  });

  try {
    await filledPage.goto(`${webBaseUrl}/?view=today`, { waitUntil: "domcontentloaded" });
    await filledPage.getByRole("heading", { name: "青椒土豆丝", exact: true, level: 2 }).waitFor({ timeout: 10000 });
    assert.equal(await filledPage.getByText("今晚安排完成。").count(), 0, "filled tonight menu should lead with the actual dishes");
    assert.equal(await buttonHasInkFill(filledPage, "全部菜品库"), false, "recipe library should remain secondary on the filled menu page");
    const firstViewportInkButtons = await getFirstViewportInkButtonLabels(filledPage);
    assert.deepEqual(firstViewportInkButtons, ["查看采购清单"], "filled tonight menu should expose one clear first-viewport primary action");
  } finally {
    await filledContext.close();
  }
}

async function verifyPlannerIntroDegradesAfterUse({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((todayKey) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:meal-plan:v1", JSON.stringify({
      [todayKey]: {
        breakfast: [],
        lunch: [],
        dinner: [{ recipeId: "tomato-egg", quantity: 1 }],
      },
    }));
  }, formatLocalDateKey());

  try {
    await page.goto(`${webBaseUrl}/?view=planner`, { waitUntil: "domcontentloaded" });
    await page.getByText("已安排").first().waitFor({ timeout: 10000 });
    const introVisible = await page.getByText("先把这一周顺一顺。").isVisible().catch(() => false);
    assert.equal(introVisible, false, "week plan should not keep a self-introduction hero above the actual plan");
    assert.equal(await page.getByText(/还没安排/).count(), 0, "week plan empty meals should use neutral, non-pressuring copy");
    assert.equal(
      await page.locator('button.bg-ink').filter({ hasText: /^[一二三四五六日]\s*\d+$/ }).count(),
      0,
      "week strip should not mark every past empty day as completed",
    );
  } finally {
    await context.close();
  }
}

async function verifyCalendarExplanationDegradesAfterDateSelection({ browser, webBaseUrl }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((todayKey) => {
    localStorage.clear();
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("family-menu:meal-calendar", JSON.stringify({
      [todayKey]: ["tomato-egg"],
    }));
  }, formatLocalDateKey());

  try {
    await page.goto(`${webBaseUrl}/?view=calendar`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.getByText("营养环说明").count(), 0, "calendar should not keep a permanent tutorial card");
    assert.equal(await page.getByText("0 道").count(), 0, "empty calendar days should not repeat zero-count badges");
    assert.equal(
      await page.locator('[data-calendar-day][data-item-count="0"] svg').count(),
      0,
      "empty calendar days should not render nutrition rings",
    );
    await page.getByRole("button", { name: "今天", exact: true }).click();
    await page.getByText("Daily page").waitFor({ timeout: 10000 });
    await assertReadableContrast(page.getByRole("button", { name: "添加菜品", exact: true }), "calendar add dish action");
    const explanationVisible = await page.getByText("营养环说明").isVisible().catch(() => false);
    assert.equal(explanationVisible, false, "calendar should remain result-first after a date is selected");
  } finally {
    await context.close();
  }
}

async function request(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `${method} ${url} failed with ${response.status}`);
  }
  return data;
}

async function seedLocalOwnerSession(page) {
  await page.addInitScript((session) => {
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
    localStorage.setItem("humi:identity-session:v1", JSON.stringify(session));
  }, smokeOwnerSession);
}

function ownerAuthHeaders() {
  return { Authorization: `Bearer ${smokeOwnerSession.accessToken}` };
}

async function expectHiddenText(page, text) {
  const visible = await page.getByText(text).isVisible().catch(() => false);
  assert.equal(visible, false, `"${text}" should not be visible`);
}

async function assertElementInFirstViewport(locator, label) {
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  assert(
    geometry.width > 0 &&
      geometry.height > 0 &&
      geometry.top >= 0 &&
      geometry.bottom <= geometry.viewportHeight,
    `${label} should be fully visible in the first mobile viewport: ${JSON.stringify(geometry)}`,
  );
}

async function assertReadableContrast(locator, label) {
  const contrast = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const parseRgb = (value) => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      return channels.length === 3 ? channels : null;
    };
    const luminance = (channels) => {
      const linear = channels.map((value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const foreground = parseRgb(style.color);
    const background = parseRgb(style.backgroundColor);
    if (!foreground || !background) return 0;
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  });
  assert(contrast >= 4.5, `${label} should meet readable text contrast, got ${contrast.toFixed(2)}:1`);
}

async function buttonHasInkFill(page, name) {
  return page.getByRole("button", { name, exact: true }).evaluate((button) =>
    String(button.className || "").includes("bg-ink"),
  );
}

async function getFirstViewportInkButtonLabels(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((button) => String(button.className || "").includes("bg-ink"))
      .filter((button) => !button.closest("nav, aside, header"))
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
      })
      .map((button) => button.textContent?.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  );
}

function formatLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function waitForVite(child, url) {
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  await waitForHttp(url).catch((error) => {
    throw new Error(`${error.message}\nVite output:\n${output}`);
  });
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "no response"}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

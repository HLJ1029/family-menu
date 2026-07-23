import assert from "node:assert/strict";
import fs from "node:fs";
import { access, chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const WECHAT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.56";
const evidenceDir = process.env.HUMI_H5_ENTRY_EVIDENCE_DIR || "";
const expectedChecks = [
  "WeChat bridge and API bootstrap resources load without parser blocking",
  "pre-React fallback is visible when the main module fails",
  "retry action appears after six seconds",
  "normal React boot replaces the fallback",
  "failed lazy chunks show an accessible reload recovery instead of a blank screen",
  "H5 login prefers the native identity page and recovers from navigation failure",
  "one-time H5 ticket is exchanged and removed from the URL",
  "ticket exchange gates stale-session hydration during silent recovery",
  "legacy serialized session URLs are discarded",
  "legacy incomplete identity can be completed in H5",
  "expired H5 sessions are cleared",
  "server-rejected H5 sessions downgrade to logged out",
  "later authenticated writes also downgrade on invalid sessions",
  "local logout succeeds when remote revocation fails",
];

const entryHtml = fs.readFileSync("index.html", "utf8");
assert.match(
  entryHtml,
  /<link\s+rel="preconnect"\s+href="https:\/\/api\.humi-home\.com"\s+crossorigin\s*\/?>/,
  "H5 entry should preconnect to the identity API before login bootstrap",
);
assert.match(
  entryHtml,
  /<script\s+defer\s+src="\/vendor\/jweixin-1\.6\.0\.js"><\/script>/,
  "WeChat JSSDK should not block parsing the H5 entry document",
);

if (evidenceDir) {
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  await chmod(evidenceDir, 0o700);
}

const screenshots = evidenceDir ? {
  failedBoot: join(evidenceDir, "wechat-main-script-failed.png"),
  normalBoot: join(evidenceDir, "wechat-normal-boot.png"),
} : null;

const vite = await createViteServer({
  root: process.cwd(),
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
  },
});

let browser;
try {
  await vite.listen();
  const baseUrl = vite.resolvedUrls?.local?.[0];
  assert.ok(baseUrl, "Vite must expose a local validation URL");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });

  const failedBootPage = await context.newPage();
  await failedBootPage.route("**/src/main.jsx", (route) => route.abort("failed"));
  await failedBootPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const fallback = failedBootPage.locator("#humi-boot-fallback");
  await fallback.waitFor({ state: "visible", timeout: 5_000 });
  assert.equal(await fallback.getByRole("heading", { name: "正在打开今晚菜单。" }).isVisible(), true);
  assert.equal(await failedBootPage.getByRole("link", { name: "重新加载" }).isVisible(), false);
  await failedBootPage.waitForTimeout(6_100);
  assert.equal(await failedBootPage.getByRole("link", { name: "重新加载" }).isVisible(), true);
  if (evidenceDir) {
    await failedBootPage.screenshot({ path: screenshots.failedBoot, fullPage: true });
  }

  const normalBootPage = await context.newPage();
  const normalBootErrors = [];
  normalBootPage.on("pageerror", (error) => normalBootErrors.push(error.message));
  await normalBootPage.goto(baseUrl, { waitUntil: "networkidle" });
  await normalBootPage.locator("#root > :not(#humi-boot-fallback)").first().waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await normalBootPage.locator("#humi-boot-fallback").count(), 0);
  assert.deepEqual(normalBootErrors, []);
  if (evidenceDir) {
    await normalBootPage.screenshot({ path: screenshots.normalBoot, fullPage: true });
  }

  const lazyRecoveryContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await lazyRecoveryContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:profile-onboarding-complete:v1", "true");
  });
  const lazyRecoveryPage = await lazyRecoveryContext.newPage();
  let failLazyChunkOnce = true;
  await lazyRecoveryPage.route("**/src/components/StatsPage.jsx*", (route) => {
    if (failLazyChunkOnce) {
      failLazyChunkOnce = false;
      return route.abort("failed");
    }
    return route.continue();
  });
  await lazyRecoveryPage.goto(`${baseUrl}?view=stats`, { waitUntil: "domcontentloaded" });
  const lazyError = lazyRecoveryPage.getByTestId("lazy-route-error");
  await lazyError.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await lazyError.getByRole("button", { name: "重新加载" }).isVisible(), true);
  await lazyError.getByRole("button", { name: "重新加载" }).click();
  await lazyRecoveryPage.getByTestId("nutrition-reflection-page").waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await lazyRecoveryPage.getByTestId("lazy-route-error").count(), 0);
  await lazyRecoveryContext.close();

  const bridgeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await bridgeContext.addInitScript(() => {
    window.__humiNativeCalls = [];
  });
  const bridgePage = await bridgeContext.newPage();
  await bridgePage.goto(`${baseUrl}?channel=wechat-miniprogram`, { waitUntil: "networkidle" });
  await bridgePage.evaluate(() => {
    window.wx = window.wx || {};
    window.wx.miniProgram = {
      navigateTo: (payload) => {
        window.__humiNativeCalls.push({ method: "navigateTo", payload: { url: payload.url } });
        payload.fail?.({ errMsg: "navigateTo:fail page not found" });
      },
      postMessage: (payload) => window.__humiNativeCalls.push({ method: "postMessage", payload }),
      reLaunch: (payload) => window.__humiNativeCalls.push({ method: "reLaunch", payload }),
    };
  });
  await bridgePage.getByRole("button", { name: "微信登录", exact: true }).click();
  await bridgePage.waitForFunction(() => window.__humiNativeCalls.length > 1, null, { timeout: 2_000 });
  assert.deepEqual(await bridgePage.evaluate(() => window.__humiNativeCalls[0]), {
    method: "navigateTo",
    payload: { url: "/pages/identity/index?action=login" },
  });
  assert.equal(await bridgePage.evaluate(() => window.__humiNativeCalls[1]?.method), "reLaunch");
  assert.equal(await bridgePage.evaluate(() => window.__humiNativeCalls[1]?.payload?.url), "/pages/identity/index?action=login");
  await bridgePage.getByRole("button", { name: "微信登录", exact: true }).waitFor({ state: "visible", timeout: 8_000 });
  assert.equal(await bridgePage.getByRole("button", { name: "微信登录", exact: true }).isEnabled(), true);
  await bridgeContext.close();

  const ticketContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  const ticketPage = await ticketContext.newPage();
  await ticketPage.route("**/auth/h5/exchange", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "h5-session-token",
        refreshToken: "h5-session-token",
        expiresAt: Date.now() + 60_000,
        user: {
          id: "user-ticket",
          displayName: "小禾",
          provider: "wechat",
          profileStatus: "complete",
          avatarKey: "humi-avatar-family-f-01",
          avatarUrl: "",
          phoneVerified: false,
          phoneMasked: "",
          phoneVerifiedAt: null,
        },
      }),
    });
  });
  await ticketPage.route("**/state", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ state: null, family: null, households: [] }),
    });
  });
  await ticketPage.goto(`${baseUrl}?channel=wechat-miniprogram&humiTicket=one-time-ticket`, { waitUntil: "networkidle" });
  await ticketPage.waitForFunction(() => localStorage.getItem("humi:identity-session:v1")?.includes("user-ticket"));
  assert.equal(new URL(ticketPage.url()).searchParams.has("humiTicket"), false);
  await ticketContext.close();

  const ticketRaceContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await ticketRaceContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:profile-onboarding-complete:v1", "true");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "stale-before-recovery",
      refreshToken: "stale-before-recovery",
      expiresAt: Date.now() + 60_000,
      user: { id: "stale-user", displayName: "旧登录", provider: "wechat", profileStatus: "complete" },
    }));
  });
  const ticketRacePage = await ticketRaceContext.newPage();
  let staleStateRequests = 0;
  await ticketRacePage.route("**/auth/h5/exchange", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "fresh-after-recovery",
        refreshToken: "fresh-after-recovery",
        expiresAt: Date.now() + 60_000,
        user: { id: "fresh-user", displayName: "新登录", provider: "wechat", profileStatus: "complete" },
      }),
    });
  });
  await ticketRacePage.route("**/state", async (route) => {
    const authorization = route.request().headers().authorization || "";
    if (authorization.includes("stale-before-recovery")) {
      staleStateRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_session", message: "旧登录已失效。" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ state: null, family: null, households: [] }),
    });
  });
  await ticketRacePage.goto(`${baseUrl}?channel=wechat-miniprogram&humiTicket=recovery-ticket`, { waitUntil: "networkidle" });
  await ticketRacePage.waitForFunction(() => JSON.parse(localStorage.getItem("humi:identity-session:v1") || "null")?.accessToken === "fresh-after-recovery");
  await ticketRacePage.waitForTimeout(350);
  assert.equal(staleStateRequests, 0, "stale session hydration must not start while a fresh H5 ticket is exchanging");
  assert.equal(
    await ticketRacePage.evaluate(() => JSON.parse(localStorage.getItem("humi:identity-session:v1") || "null")?.accessToken),
    "fresh-after-recovery",
    "a delayed stale 401 must not clear the recovered session",
  );
  await ticketRaceContext.close();

  const rejectedLegacyUrlContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  const rejectedLegacyUrlPage = await rejectedLegacyUrlContext.newPage();
  const legacyUrlSession = encodeURIComponent(JSON.stringify({ accessToken: "must-not-enter-storage", user: { id: "legacy-url" } }));
  await rejectedLegacyUrlPage.goto(`${baseUrl}?channel=wechat-miniprogram&humiSession=${legacyUrlSession}`, { waitUntil: "networkidle" });
  assert.equal(new URL(rejectedLegacyUrlPage.url()).searchParams.has("humiSession"), false);
  assert.equal(await rejectedLegacyUrlPage.evaluate(() => localStorage.getItem("humi:identity-session:v1")), null);
  await rejectedLegacyUrlContext.close();

  const legacyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await legacyContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "legacy-session-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "legacy-user", displayName: "微信用户", provider: "wechat" },
    }));
  });
  const legacyPage = await legacyContext.newPage();
  let savedIdentityBody = null;
  await legacyPage.route("**/identity/profile", async (route) => {
    savedIdentityBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "legacy-user",
          displayName: savedIdentityBody.displayName,
          provider: "wechat",
          profileStatus: "complete",
          avatarKey: savedIdentityBody.avatarKey,
          avatarUrl: "",
        },
      }),
    });
  });
  await legacyPage.goto(baseUrl, { waitUntil: "networkidle" });
  await legacyPage.getByLabel("你的昵称").fill("小禾");
  await legacyPage.getByRole("button", { name: "选择头像 5" }).click();
  await legacyPage.getByRole("button", { name: "保存并进入 Humi" }).click();
  await legacyPage.waitForFunction(() => JSON.parse(localStorage.getItem("humi:identity-session:v1"))?.user?.profileStatus === "complete", null, { timeout: 5_000 });
  assert.deepEqual(savedIdentityBody, { displayName: "小禾", avatarKey: "humi-avatar-family-f-01" });
  assert.equal(JSON.parse(await legacyPage.evaluate(() => localStorage.getItem("humi:identity-session:v1"))).user.avatarKey, "humi-avatar-family-f-01");
  assert.equal(await legacyPage.getByText("已登录 Humi", { exact: false }).count(), 0);
  await legacyContext.close();

  const expiredContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await expiredContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:profile-onboarding-complete:v1", "true");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "expired-session-token",
      expiresAt: Date.now() - 1,
      user: { id: "expired-user", displayName: "过期用户", provider: "wechat", profileStatus: "complete" },
    }));
  });
  const expiredPage = await expiredContext.newPage();
  await expiredPage.goto(`${baseUrl}?channel=wechat-miniprogram`, { waitUntil: "networkidle" });
  await expiredPage.getByRole("button", { name: "重新微信登录", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await expiredPage.evaluate(() => localStorage.getItem("humi:identity-session:v1")), null);
  await expiredContext.close();

  const unauthorizedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await unauthorizedContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:profile-onboarding-complete:v1", "true");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "revoked-session-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "revoked-user", displayName: "旧登录", provider: "wechat", profileStatus: "complete" },
    }));
  });
  const unauthorizedPage = await unauthorizedContext.newPage();
  await unauthorizedPage.route("**/state", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "invalid_session", message: "登录状态已失效。" }),
  }));
  await unauthorizedPage.goto(`${baseUrl}?channel=wechat-miniprogram`, { waitUntil: "networkidle" });
  await unauthorizedPage.getByRole("button", { name: "重新微信登录", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await unauthorizedPage.evaluate(() => localStorage.getItem("humi:identity-session:v1")), null);
  await unauthorizedContext.close();

  const laterUnauthorizedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await laterUnauthorizedContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:profile-onboarding-complete:v1", "true");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "later-revoked-session-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "later-revoked-user", displayName: "小禾", provider: "wechat", profileStatus: "complete" },
    }));
  });
  const laterUnauthorizedPage = await laterUnauthorizedContext.newPage();
  await laterUnauthorizedPage.route("**/state", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          state: { householdId: "household-1", todayMenu: [] },
          family: { id: "household-1", name: "我们家", members: [] },
          households: [{ id: "household-1", name: "我们家", members: [] }],
        }),
      });
    }
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid_session", message: "登录状态已失效。" }),
    });
  });
  await laterUnauthorizedPage.goto(`${baseUrl}?channel=wechat-miniprogram`, { waitUntil: "networkidle" });
  await laterUnauthorizedPage.getByRole("button", { name: "重新微信登录", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  assert.equal(await laterUnauthorizedPage.evaluate(() => localStorage.getItem("humi:identity-session:v1")), null);
  await laterUnauthorizedContext.close();

  const failedLogoutContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    serviceWorkers: "block",
    userAgent: WECHAT_USER_AGENT,
  });
  await failedLogoutContext.addInitScript(() => {
    localStorage.setItem("humi:onboarding-complete", "true");
    localStorage.setItem("humi:profile-onboarding-complete:v1", "true");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify({
      accessToken: "logout-session-token",
      expiresAt: Date.now() + 60_000,
      user: { id: "logout-user", displayName: "小禾", provider: "wechat", profileStatus: "complete" },
    }));
    window.__humiNativeCalls = [];
  });
  const failedLogoutPage = await failedLogoutContext.newPage();
  await failedLogoutPage.route("**/state", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      state: {},
      family: {
        id: "logout-household",
        name: "我们家",
        ownerId: "logout-user",
        currentMemberId: "logout-user",
        role: "owner",
        members: [{ memberId: "logout-user", nickname: "小禾", role: "owner", status: "formal" }],
      },
      households: [{ id: "logout-household", name: "我们家", role: "owner" }],
    }),
  }));
  await failedLogoutPage.route("**/auth/logout", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "temporarily_unavailable" }),
  }));
  await failedLogoutPage.goto(`${baseUrl}?channel=wechat-miniprogram`, { waitUntil: "networkidle" });
  await failedLogoutPage.evaluate(() => {
    window.wx = window.wx || {};
    window.wx.miniProgram = {
      reLaunch: (payload) => window.__humiNativeCalls.push({ method: "reLaunch", payload }),
    };
  });
  await failedLogoutPage.getByTestId("mobile-nav-user").click();
  await failedLogoutPage.getByRole("button", { name: /^账号设置/ }).click();
  await failedLogoutPage.getByRole("button", { name: "退出登录", exact: true }).click();
  await failedLogoutPage.waitForFunction(() => localStorage.getItem("humi:identity-session:v1") === null, null, { timeout: 2_000 });
  assert.deepEqual(await failedLogoutPage.evaluate(() => window.__humiNativeCalls[0]), {
    method: "reLaunch",
    payload: { url: "/pages/index/index?humiLogout=1" },
  });
  await failedLogoutContext.close();

  const mainSource = fs.readFileSync("src/main.jsx", "utf8");
  const appShellSource = fs.readFileSync("src/components/AppShell.jsx", "utf8");
  const identitySource = fs.readFileSync("src/lib/humiIdentity.js", "utf8");
  assert.doesNotMatch(mainSource, /createHumiSessionFamily/);
  assert.match(appShellSource, /avatarUrl/);
  assert.match(appShellSource, /avatarKey/);
  assert.match(identitySource, /postMessage/);
  assert.match(mainSource, /subscribeHumiSessionInvalid/);
  assert.match(mainSource, /requestMiniProgramLogout\(\{ expired: true \}\)/);

  const checkedAt = new Date().toISOString();
  const result = {
    ok: true,
    checkedAt,
    timestamp: checkedAt,
    userAgent: "WeChat iOS",
    evidenceDir: evidenceDir || null,
    screenshots,
    checks: expectedChecks,
  };
  if (evidenceDir) {
    const manifestPath = join(evidenceDir, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    await chmod(manifestPath, 0o600);
    await access(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.deepEqual(manifest.checks, expectedChecks, "H5 evidence manifest must carry the exact validation checks");
    assert.deepEqual(manifest.screenshots, screenshots);
    assert.equal(manifest.ok, true);
    assert.equal(manifest.evidenceDir, evidenceDir);
    assert.equal(typeof manifest.checkedAt, "string");
    assert.equal(typeof manifest.timestamp, "string");
    assert.equal((await stat(manifestPath)).mode & 0o777, 0o600, "H5 manifest must be private");
    assert.equal((await stat(evidenceDir)).mode & 0o777, 0o700, "H5 evidence directory must be private");
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (evidenceDir) {
    const checkedAt = new Date().toISOString();
    const failure = {
      ok: false,
      checkedAt,
      timestamp: checkedAt,
      userAgent: "WeChat iOS",
      evidenceDir,
      screenshots,
      checks: expectedChecks,
      error: error.message,
    };
    const manifestPath = join(evidenceDir, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
    await chmod(manifestPath, 0o600);
  }
  throw error;
} finally {
  await browser?.close();
  await vite.close();
}

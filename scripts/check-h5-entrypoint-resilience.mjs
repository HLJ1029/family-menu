import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const WECHAT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.56";
const evidenceDir = process.env.HUMI_H5_ENTRY_EVIDENCE_DIR || "";

if (evidenceDir) await mkdir(evidenceDir, { recursive: true, mode: 0o700 });

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
    await failedBootPage.screenshot({ path: join(evidenceDir, "wechat-main-script-failed.png"), fullPage: true });
  }

  const normalBootPage = await context.newPage();
  const normalBootErrors = [];
  normalBootPage.on("pageerror", (error) => normalBootErrors.push(error.message));
  await normalBootPage.goto(baseUrl, { waitUntil: "networkidle" });
  await normalBootPage.locator("#root > :not(#humi-boot-fallback)").first().waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(await normalBootPage.locator("#humi-boot-fallback").count(), 0);
  assert.deepEqual(normalBootErrors, []);
  if (evidenceDir) {
    await normalBootPage.screenshot({ path: join(evidenceDir, "wechat-normal-boot.png"), fullPage: true });
  }

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
      navigateTo: (payload) => window.__humiNativeCalls.push({ method: "navigateTo", payload }),
      reLaunch: (payload) => window.__humiNativeCalls.push({ method: "reLaunch", payload }),
    };
  });
  await bridgePage.getByRole("button", { name: "微信登录", exact: true }).click();
  await bridgePage.waitForFunction(() => window.__humiNativeCalls.length > 0, null, { timeout: 2_000 });
  assert.deepEqual(await bridgePage.evaluate(() => window.__humiNativeCalls[0]), {
    method: "navigateTo",
    payload: { url: "/pages/identity/index?action=login" },
  });
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
  await legacyPage.goto(baseUrl, { waitUntil: "networkidle" });
  await legacyPage.getByRole("button", { name: "继续完善身份" }).waitFor({ state: "visible", timeout: 10_000 });
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
    body: JSON.stringify({ state: null, family: null, households: [] }),
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
  await failedLogoutPage.getByRole("button", { name: "退出并重新验证微信登录", exact: true }).click();
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
  assert.doesNotMatch(identitySource, /postMessage/);

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    userAgent: "WeChat iOS",
    evidenceDir: evidenceDir || null,
    checks: [
      "pre-React fallback is visible when the main module fails",
      "retry action appears after six seconds",
      "normal React boot replaces the fallback",
      "H5 login uses immediate native page navigation",
      "one-time H5 ticket is exchanged and removed from the URL",
      "legacy serialized session URLs are discarded",
      "legacy incomplete identity is gated",
      "expired H5 sessions are cleared",
      "server-rejected H5 sessions downgrade to logged out",
      "local logout succeeds when remote revocation fails",
    ],
  }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}

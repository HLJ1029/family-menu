import assert from "node:assert/strict";
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

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    userAgent: "WeChat iOS",
    evidenceDir: evidenceDir || null,
    checks: [
      "pre-React fallback is visible when the main module fails",
      "retry action appears after six seconds",
      "normal React boot replaces the fallback",
    ],
  }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}

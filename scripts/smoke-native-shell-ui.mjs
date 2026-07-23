import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = createGuestTonightRuntime();
const tonight = runtime.loadPage("miniprogram/pages/tonight/index.js");
await tonight.onLoad();
assert.equal(tonight.data.viewState, "choose_effort");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.exposeFunction("nativeAction", async (action, tier = "") => {
    if (action === "select") await tonight.selectEffort({ currentTarget: { dataset: { tier } } });
    if (action === "next") await tonight.nextRecommendation();
    if (action === "accept") await tonight.acceptRecommendation();
    if (action === "start") tonight.startCooking();
    return { data: plain(tonight.data), routes: plain(runtime.routes) };
  });
  await page.setContent(shellDocument(nativeStyles()));
  await page.evaluate((data) => window.renderTonight(data), plain(tonight.data));

  await assertFitsViewport(page, "[data-testid=tonight-shell]");
  assert.equal(await page.locator("[data-testid=effort-option]").count(), 3);
  await page.getByRole("button", { name: "15 分钟·只求开饭" }).click();
  await page.waitForSelector("[data-testid=dinner-plan]");
  const firstRecipe = await page.locator("[data-testid=recipe-title]").first().textContent();
  assert(firstRecipe);
  assert.equal(await page.locator("[data-testid=plan-action]").count(), 2, "the recommendation card must expose exactly two decisions");
  await assertFitsViewport(page, "[data-testid=dinner-plan]");
  await assertPrimaryActionVisible(page, "就做这顿");

  await page.getByRole("button", { name: "换一组" }).click();
  const secondRecipe = await page.locator("[data-testid=recipe-title]").first().textContent();
  assert.notEqual(secondRecipe, firstRecipe, "a real rotate tap must update the visible dinner");

  await page.getByRole("button", { name: "就做这顿" }).click();
  await page.waitForSelector("[data-testid=meal-run-resume]");
  await assertPrimaryActionVisible(page, "开始做饭");
  await page.getByRole("button", { name: "开始做饭" }).click();
  assert.match(runtime.routes.at(-1)?.url || "", /^\/packageCooking\/pages\/cooking\/index\?mealRunId=guest%3A.+&action=start$/);

  console.log("Native shell 390x844 interaction smoke passed.");
} finally {
  await browser.close();
}

async function assertFitsViewport(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector} must render`);
  assert(box.x >= 0 && box.x + box.width <= 390.5, `${selector} must fit the 390px viewport`);
}

async function assertPrimaryActionVisible(page, label) {
  const button = page.getByRole("button", { name: label });
  const box = await button.boundingBox();
  assert(box, `${label} must render`);
  const viewport = page.viewportSize();
  assert(box.y < viewport.height, `${label} must enter the first 844px viewport`);
  assert(box.x >= 0 && box.x + box.width <= viewport.width, `${label} must not overflow horizontally`);
}

function shellDocument(styles) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
      button { font: inherit; border: 0; }
      ${styles}
    </style>
  </head>
  <body>
    <main id="app"></main>
    <script>
      const app = document.getElementById("app");
      const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
      async function act(action, tier = "") {
        const result = await window.nativeAction(action, tier);
        window.renderTonight(result.data);
      }
      window.renderTonight = (data) => {
        const headerTitle = data.viewState === "choose_effort"
          ? "今晚有多少力气？"
          : data.viewState === "recommendation" || data.viewState === "accepting"
            ? "这套能端上桌。"
            : data.viewState === "completed" ? "今晚，做成了。" : "接着把饭端上桌。";
        let content = "";
        if (data.viewState === "choose_effort") {
          content = '<section class="effort-picker">' + data.effortOptions.map((option) => (
            '<button data-testid="effort-option" class="effort-option" aria-label="' + escapeHtml(option.title) + '" onclick="act(\\'select\\',\\'' + option.id + '\\')">'
            + '<span class="effort-copy"><span class="effort-title">' + escapeHtml(option.title) + '</span><span class="effort-detail">' + escapeHtml(option.detail) + '</span></span>'
            + '<span class="effort-badge">选择</span></button>'
          )).join("") + "</section>";
        }
        if (data.viewState === "recommendation" || data.viewState === "accepting") {
          content = '<section class="plan-card" data-testid="dinner-plan">'
            + '<div class="plan-topline"><span class="plan-kicker">今晚就做这套</span><span class="plan-time">' + data.plan.totalMinutes + ' 分钟</span></div>'
            + '<div class="recipe-list">' + data.plan.recipes.map((recipe) => (
              '<article class="recipe"><div class="recipe-image"></div><div class="recipe-copy"><span data-testid="recipe-title" class="recipe-title">' + escapeHtml(recipe.title) + '</span>'
              + '<span class="recipe-detail">动手 ' + recipe.activeMinutes + ' 分钟</span></div></article>'
            )).join("") + '</div>'
            + '<div class="plan-facts"><span>总计 ' + data.plan.totalMinutes + ' 分钟</span><span>动手 ' + data.plan.activeMinutes + ' 分钟</span><span>' + data.plan.cookwareCount + ' 件厨具</span></div>'
            + '<div class="missing"><span class="missing-label">还需要</span><span class="missing-value">' + escapeHtml(data.plan.missingIngredientsText) + '</span></div>'
            + '<div class="plan-actions"><button data-testid="plan-action" class="primary-action" aria-label="就做这顿" onclick="act(\\'accept\\')">就做这顿</button>'
            + '<button data-testid="plan-action" class="secondary-action" aria-label="换一组" onclick="act(\\'next\\')">换一组</button></div></section>';
        }
        if (["planned", "resuming", "completed"].includes(data.viewState)) {
          const primary = data.mealRun.status === "planned"
            ? '<button class="run-primary" aria-label="开始做饭" onclick="act(\\'start\\')">开始做饭</button>'
            : data.mealRun.status === "cooking"
              ? '<button class="run-primary" aria-label="继续做饭">继续做饭</button>'
              : '<div class="completed-note">这一顿已完成。</div>';
          content = '<section class="run-card" data-testid="meal-run-resume"><span class="run-kicker">今晚已经决定</span>'
            + '<span class="run-title">' + escapeHtml(data.plan?.recipes?.[0]?.title || "今晚这顿饭") + '</span>'
            + primary + '</section>';
        }
        app.innerHTML = '<section class="tonight-shell" data-testid="tonight-shell"><header class="tonight-header"><span class="eyebrow">HUMI · 今晚</span>'
          + '<span class="title">' + headerTitle + '</span><span class="subtitle">先选行动力，再把真的做得完的晚饭端上桌。</span></header>' + content + '</section>';
      };
    </script>
  </body>
</html>`;
}

function nativeStyles() {
  return [
    "miniprogram/pages/tonight/index.wxss",
    "miniprogram/components/effort-picker/index.wxss",
    "miniprogram/components/dinner-plan-card/index.wxss",
    "miniprogram/components/meal-run-resume/index.wxss",
  ].map((relativePath) => readFileSync(path.join(root, relativePath), "utf8"))
    .join("\n")
    .replace(/(\d+(?:\.\d+)?)rpx/g, (_, value) => `${Number(value) * 390 / 750}px`);
}

function createGuestTonightRuntime() {
  const modules = new Map();
  const storage = new Map();
  const routes = [];
  let pageDefinition;
  const session = {
    accessToken: "guest-ui-token",
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: { id: "guest-ui", profileStatus: "complete" },
  };
  const bootstrap = {
    schemaVersion: 1,
    stateVersion: "guest-ui-state",
    user: session.user,
    activeHouseholdId: "",
    households: [],
    householdState: {
      familyProfile: { familySize: 2, allergies: [], dislikes: [] },
      familyMembers: [],
      pantryItems: [],
      wantToEatItems: [],
      dislikedRecipeIds: [],
    },
    currentMealRun: null,
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
  };
  storage.set("humi:native-session:v1", session);
  const app = { globalData: { humiSession: session, nativeShellCandidate: true } };
  let random = 1;
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, plain(value)),
    removeStorageSync: (key) => storage.delete(key),
    navigateTo: ({ url }) => routes.push({ kind: "navigateTo", url }),
    reLaunch: ({ url }) => routes.push({ kind: "reLaunch", url }),
    getDeviceInfo: () => ({ platform: "devtools" }),
    getRandomValues: (array) => {
      for (let index = 0; index < array.length; index += 1) array[index] = (random++ * 23) % 256;
      return array;
    },
  };

  function load(relativePath) {
    const absolutePath = resolve(path.join(root, relativePath));
    if (modules.has(absolutePath)) return modules.get(absolutePath).exports;
    if (absolutePath.endsWith(".json")) return JSON.parse(readFileSync(absolutePath, "utf8"));
    const module = { exports: {} };
    modules.set(absolutePath, module);
    const context = vm.createContext({
      module,
      exports: module.exports,
      require: (specifier) => load(path.relative(root, resolve(path.resolve(path.dirname(absolutePath), specifier)))),
      wx,
      getApp: () => app,
      Page: (definition) => { pageDefinition = definition; },
      Component: () => {},
      console,
      Date,
      Math,
      Promise,
      Uint8Array,
      encodeURIComponent,
      setTimeout,
      clearTimeout,
    });
    new vm.Script(readFileSync(absolutePath, "utf8"), { filename: absolutePath }).runInContext(context);
    return module.exports;
  }

  const store = load("miniprogram/utils/store.js").appStore;
  store.resetSessionState(session);
  store.replaceBootstrap(bootstrap);
  return {
    routes,
    loadPage(relativePath) {
      load(relativePath);
      return {
        ...pageDefinition,
        data: plain(pageDefinition.data),
        setData(patch) { this.data = { ...this.data, ...plain(patch) }; },
      };
    },
  };
}

function resolve(candidate) {
  for (const option of [candidate, `${candidate}.js`, `${candidate}.json`]) {
    try {
      readFileSync(option);
      return option;
    } catch (_) {
      // Continue to the next mini-program module extension.
    }
  }
  return candidate;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

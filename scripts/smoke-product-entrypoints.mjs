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
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
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
          status: "collecting",
          votes: [],
          deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await seedGuestDinnerState(page);
  await page.reload({ waitUntil: "networkidle" });

  await openTodayMenu(page);
  await page.getByRole("button", { name: "发现新菜" }).first().click();
  await page.waitForSelector("text=像刷菜谱卡片一样慢慢逛", { timeout: 15_000 });
  const discoveryTitle = await page.getByRole("heading", { name: "发现新菜" }).first().isVisible();
  const recipeCards = await page.locator('article:has-text("补进今晚"), article:has-text("已在今晚")').count();
  const discoveryScreenshot = join(evidenceDir, "discovery-mobile.png");
  await page.screenshot({ path: discoveryScreenshot, fullPage: true });

  await page.getByRole("button", { name: "我的家" }).click();
  await page.getByRole("button", { name: "问问大家" }).first().click();
  await page.waitForSelector("text=今晚征集单已在我的家展开", { timeout: 15_000 });
  await page.getByRole("button", { name: "查看征集单" }).first().click();
  await page.waitForSelector("text=今晚征集单已经在我的家展开", { timeout: 15_000 });
  const craveSheetVisible = await page.getByText("大家点了什么感觉").isVisible();
  const viewButtonVisible = await page.getByRole("button", { name: "查看征集单" }).first().isVisible();
  const userCraveScreenshot = join(evidenceDir, "user-crave-mobile.png");
  await page.screenshot({ path: userCraveScreenshot, fullPage: true });

  const checks = [
    { key: "full-library-title", ok: discoveryTitle },
    { key: "full-library-card-count", ok: recipeCards >= minRecipeCards, actual: recipeCards, expectedAtLeast: minRecipeCards },
    { key: "user-center-crave-sheet", ok: craveSheetVisible },
    { key: "user-center-view-crave-button", ok: viewButtonVisible },
    { key: "page-errors", ok: pageErrors.length === 0, errors: pageErrors },
  ];
  const manifest = {
    ok: checks.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    baseUrl,
    evidenceDir,
    screenshots: {
      discoveryMobile: discoveryScreenshot,
      userCraveMobile: userCraveScreenshot,
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
  const today = new Date().toISOString().slice(0, 10);
  await page.evaluate((todayDateKey) => {
    localStorage.setItem("humi:onboarding-complete", JSON.stringify(true));
    localStorage.setItem("humi:profile-onboarding-complete:v1", JSON.stringify(true));
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

async function openTodayMenu(page) {
  const viewToday = page.getByRole("button", { name: "查看今晚菜单" }).first();
  if (await viewToday.isVisible().catch(() => false)) {
    await viewToday.click();
    return;
  }

  const acceptRecommendation = page.getByRole("button", { name: /今晚就做|就做选中的/ }).first();
  if (await acceptRecommendation.isVisible().catch(() => false)) {
    await acceptRecommendation.click();
    await page.getByRole("button", { name: "查看今晚菜单" }).first().click();
    return;
  }

  throw new Error("Could not find an entry to the Today menu.");
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

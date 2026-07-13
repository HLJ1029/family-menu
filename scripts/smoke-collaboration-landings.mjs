import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(args.baseUrl || process.env.HUMI_COLLABORATION_SMOKE_BASE_URL || "https://www.humi-home.com/");
const evidenceDir = args.evidenceDir || process.env.HUMI_COLLABORATION_SMOKE_EVIDENCE_DIR || "/tmp/humi-collaboration-smoke";

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
  const authRequests = [];
  let craveVotePayload = null;
  let groceryClaimPayload = null;
  let craveRequest = buildCraveRequest();
  let groceryShare = buildGroceryShare();

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/auth/wechat/login")) authRequests.push(request.url());
  });

  await page.route("**/crave-requests/crave-guest-smoke", async (route) => {
    await fulfillJson(route, { request: craveRequest });
  });
  await page.route("**/crave-requests/crave-guest-smoke/votes", async (route) => {
    craveVotePayload = route.request().postDataJSON();
    craveRequest = {
      ...craveRequest,
      votes: [{
        id: "guest-vote",
        memberName: craveVotePayload.memberName || "家人",
        feelingTag: craveVotePayload.feelingTag,
        note: craveVotePayload.note,
        temporary: true,
      }],
    };
    await fulfillJson(route, { request: craveRequest });
  });
  await page.route("**/grocery-shares/grocery-guest-smoke", async (route) => {
    await fulfillJson(route, { share: groceryShare });
  });
  await page.route("**/grocery-shares/grocery-guest-smoke/claims", async (route) => {
    groceryClaimPayload = route.request().postDataJSON();
    groceryShare = {
      ...groceryShare,
      claims: {
        [groceryClaimPayload.itemKey]: {
          itemKey: groceryClaimPayload.itemKey,
          memberId: `temporary:${groceryClaimPayload.participantKey}`,
          memberName: groceryClaimPayload.memberName || "家人",
          status: groceryClaimPayload.status || "claimed",
        },
      },
    };
    await fulfillJson(route, { share: groceryShare });
  });
  await page.route("**/household-invites/invite-guest-smoke", async (route) => {
    await fulfillJson(route, {
      invite: {
        token: "invite-guest-smoke",
        householdName: "周末小家",
        inviterName: "主厨阿杰",
        status: "open",
      },
    });
  });

  await page.goto(withQuery(baseUrl, "crave", "crave-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "你想吃点啥？" }).waitFor({ timeout: 15_000 });
  const craveFirstScreen = await page.getByText("免登录参与").isVisible();
  const initiatorContextVisible = await page.getByText("主厨阿杰家今晚要做饭。不用想菜名，点一个感觉就行。").isVisible();
  const craveNoteCollapsed = await page.getByPlaceholder("想补一句？可不填").count() === 0;
  const craveFirstScreenScreenshot = join(evidenceDir, "crave-guest-first-screen-mobile.png");
  await page.screenshot({ path: craveFirstScreenScreenshot });
  await page.getByRole("button", { name: "辣一点" }).click();
  await page.getByRole("button", { name: "想补一句？" }).click();
  await page.getByPlaceholder("想补一句？可不填").fill("想吃麻婆豆腐");
  await page.getByRole("button", { name: "提交征集单" }).click();
  await page.getByRole("heading", { name: "收到！主厨会看着安排" }).waitFor({ timeout: 15_000 });
  const craveScreenshot = join(evidenceDir, "crave-guest-mobile.png");
  await page.screenshot({ path: craveScreenshot });

  await page.goto(withQuery(baseUrl, "grocery", "grocery-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "顺路带这些" }).waitFor({ timeout: 15_000 });
  const groceryFirstScreen = await page.getByText("不用先做设置").isVisible();
  const groceryFirstScreenScreenshot = join(evidenceDir, "grocery-guest-first-screen-mobile.png");
  await page.screenshot({ path: groceryFirstScreenScreenshot });
  await page.getByRole("button", { name: "我来买" }).first().click();
  await page.getByText("牛奶 已认领。").waitFor({ timeout: 15_000 });
  const groceryScreenshot = join(evidenceDir, "grocery-guest-mobile.png");
  await page.screenshot({ path: groceryScreenshot });

  await page.goto(withQuery(baseUrl, "invite", "invite-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "加入 周末小家" }).waitFor({ timeout: 15_000 });
  const inviteValueVisible = await page.getByRole("heading", { name: "一家人的饭放在一起" }).isVisible();
  await page.getByRole("button", { name: "加入这个家" }).click();
  await page.getByText("请从微信小程序里打开这个邀请，登录后就能加入。").waitFor({ timeout: 15_000 });
  const inviteScreenshot = join(evidenceDir, "invite-guest-mobile.png");
  await page.screenshot({ path: inviteScreenshot });

  const checks = [
    { key: "crave-first-screen-is-guest-usable", ok: craveFirstScreen && initiatorContextVisible },
    { key: "crave-optional-note-is-collapsed", ok: craveNoteCollapsed },
    { key: "crave-vote-posted-without-login", ok: craveVotePayload?.feelingTag === "辣一点", actual: craveVotePayload },
    { key: "crave-note-can-feed-want-pool", ok: craveVotePayload?.note === "想吃麻婆豆腐", actual: craveVotePayload?.note },
    { key: "grocery-first-screen-is-guest-usable", ok: groceryFirstScreen },
    { key: "grocery-claim-posted-without-login", ok: groceryClaimPayload?.itemKey === "custom:milk", actual: groceryClaimPayload },
    { key: "invite-shows-value-before-login", ok: inviteValueVisible },
    { key: "landings-do-not-auto-login", ok: authRequests.length === 0, actual: authRequests },
    { key: "page-errors", ok: pageErrors.length === 0, actual: pageErrors },
  ];
  const manifest = {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    baseUrl,
    evidenceDir,
    screenshots: {
      craveFirstScreen: craveFirstScreenScreenshot,
      craveSubmitted: craveScreenshot,
      groceryFirstScreen: groceryFirstScreenScreenshot,
      groceryClaimed: groceryScreenshot,
      invite: inviteScreenshot,
    },
    checks,
  };
  await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(manifest, null, 2));
  if (!manifest.ok) process.exit(1);
} catch (error) {
  const failure = { ok: false, checkedAt: new Date().toISOString(), baseUrl, evidenceDir, error: error.message };
  await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 });
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
} finally {
  if (browser) await browser.close();
}

function buildCraveRequest() {
  return {
    id: "crave-guest-smoke",
    token: "crave-guest-smoke",
    householdName: "周末小家",
    initiatorName: "主厨阿杰",
    mealType: "dinner",
    status: "open",
    deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    votes: [],
  };
}

function buildGroceryShare() {
  return {
    id: "grocery-guest-smoke",
    token: "grocery-guest-smoke",
    householdName: "周末小家",
    initiatorName: "主厨阿杰",
    items: [{ key: "custom:milk", name: "牛奶", amount: "1盒", source: "早餐" }],
    claims: {},
  };
}

async function fulfillJson(route, body) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

function withQuery(base, key, value) {
  const url = new URL(base);
  url.search = "";
  url.searchParams.set(key, value);
  return url.toString();
}

function normalizeBaseUrl(value) {
  return new URL(value).toString();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--headed") {
      parsed.headed = true;
      continue;
    }
    if (argv[index] === "--base-url") {
      parsed.baseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (argv[index] === "--evidence-dir") {
      parsed.evidenceDir = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

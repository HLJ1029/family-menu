import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(args.baseUrl || process.env.HUMI_COLLABORATION_SMOKE_BASE_URL || "https://www.humi-home.com/");
const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const evidenceDir = args.evidenceDir
  || process.env.HUMI_COLLABORATION_SMOKE_EVIDENCE_DIR
  || join(process.env.HUMI_PRIVATE_EVIDENCE_DIR || DEFAULT_PRIVATE_DIR, `collaboration-landings-smoke-${timestamp}`);

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
  const collaborationActionRequests = [];
  const householdMutationRequests = [];
  let craveVotePayload = null;
  let groceryClaimPayload = null;
  let wishPayload = null;
  let craveRequest = buildCraveRequest();
  let alternateCraveRequest = { ...buildCraveRequest(), id: "crave-guest-alt", token: "crave-guest-alt", votes: [] };
  let groceryShare = buildGroceryShare();
  let wishRequest = buildWishRequest();
  let alternateCravePayload = null;

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/auth/")) authRequests.push({ method: request.method(), url: request.url() });
    if (
      request.method() !== "GET"
      && (url.pathname.includes("/households") || url.pathname.includes("/household-invites"))
    ) {
      householdMutationRequests.push({ method: request.method(), url: request.url() });
    }
    if (request.method() === "POST" && /\/(?:crave-requests|grocery-share-requests|wish-share-requests)\//.test(url.pathname)) {
      collaborationActionRequests.push({
        path: url.pathname,
        authorization: request.headers().authorization || "",
        body: request.postDataJSON(),
      });
    }
  });

  await page.route("**/crave-requests/crave-guest-smoke", async (route) => {
    await fulfillJson(route, { request: craveRequest });
  });
  await page.route("**/crave-requests/crave-guest-smoke/votes", async (route) => {
    craveVotePayload = route.request().postDataJSON();
    const participant = route.request().headers().authorization
      ? signedInParticipant()
      : guestParticipant(craveVotePayload.guestParticipantId, "游客 1");
    craveRequest = {
      ...craveRequest,
      votes: [{
        id: "guest-vote",
        memberName: participant.displayName,
        feelingTag: craveVotePayload.feelingTag,
        note: craveVotePayload.note,
        temporary: true,
      }],
    };
    await fulfillJson(route, { request: craveRequest, participant });
  });
  await page.route("**/crave-requests/crave-guest-alt", async (route) => {
    await fulfillJson(route, { request: alternateCraveRequest });
  });
  await page.route("**/crave-requests/crave-guest-alt/votes", async (route) => {
    alternateCravePayload = route.request().postDataJSON();
    alternateCraveRequest = {
      ...alternateCraveRequest,
      votes: [{ id: "alternate-guest-vote", participantKey: alternateCravePayload.guestParticipantId, memberName: "游客 1", feelingTag: alternateCravePayload.feelingTag, note: alternateCravePayload.note, temporary: true }],
    };
    await fulfillJson(route, { request: alternateCraveRequest, participant: guestParticipant(alternateCravePayload.guestParticipantId, "游客 1") });
  });
  await page.route("**/grocery-share-requests/grocery-guest-smoke", async (route) => {
    await fulfillJson(route, { request: groceryShare });
  });
  await page.route("**/grocery-share-requests/grocery-guest-smoke/claims", async (route) => {
    groceryClaimPayload = route.request().postDataJSON();
    const participant = route.request().headers().authorization
      ? signedInParticipant()
      : guestParticipant(groceryClaimPayload.guestParticipantId, "游客 1");
    groceryShare = {
      ...groceryShare,
      claims: [{
          id: "grocery-claim-smoke",
          itemIds: groceryClaimPayload.itemIds,
          participantKey: participant.id,
          memberName: participant.displayName,
          status: groceryClaimPayload.status || "claimed",
        }],
    };
    await fulfillJson(route, { request: groceryShare, participant });
  });
  await page.route("**/wish-share-requests/wish-guest-smoke", async (route) => {
    await fulfillJson(route, { request: wishRequest });
  });
  await page.route("**/wish-share-requests/wish-guest-smoke/wishes", async (route) => {
    wishPayload = route.request().postDataJSON();
    const participant = route.request().headers().authorization
      ? signedInParticipant()
      : guestParticipant(wishPayload.guestParticipantId, "游客 1");
    wishRequest = {
      ...wishRequest,
      wishes: [{
        id: "wish-entry-smoke",
        dishName: wishPayload.dishName,
        memberName: participant.displayName,
        participantKey: participant.id,
        temporary: true,
      }],
    };
    await fulfillJson(route, { request: wishRequest, participant });
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
  await page.route("**/state", async (route) => {
    await fulfillJson(route, { state: null, family: null, households: [] });
  });
  await page.goto(withQuery(baseUrl, "crave", "crave-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "你想吃点啥？" }).waitFor({ timeout: 15_000 });
  await assertNoIdentityInputs(page, "crave");
  const craveGuestKeyBeforeSubmit = await hasGuestParticipantKey(page, "crave", "crave-guest-smoke");
  const craveFirstScreen = await page.getByText(/不用登录，不用想菜名，点一个感觉就行/).isVisible();
  const initiatorContextVisible = await page.getByText("主厨阿杰家今晚要做饭", { exact: true }).isVisible();
  const craveNoteCollapsed = await page.getByPlaceholder("想补一句？可不填").count() === 0;
  const craveFirstScreenScreenshot = join(evidenceDir, "crave-guest-first-screen-mobile.png");
  await page.screenshot({ path: craveFirstScreenScreenshot });
  await page.getByRole("button", { name: "辣一点" }).click();
  await page.getByRole("button", { name: "想补一句？选填" }).click();
  await assertNoIdentityInputs(page, "crave optional details");
  await page.getByPlaceholder("比如：别太辣、想快一点").fill("想吃麻婆豆腐");
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到！" }).waitFor({ timeout: 15_000 });
  const craveSubmittedText = await page.getByTestId("crave-share-landing").innerText();
  const guestCraveVotePayload = craveVotePayload;
  const craveGuestAliasVisible = craveSubmittedText.includes("游客 1");
  const craveParticipationExplanation = await page.getByText(
    "登录只会把这次参与关联到你的 Humi 身份，不会自动成为家庭成员；加入家庭需要另行接受家庭邀请。",
    { exact: true },
  ).isVisible();
  const craveHasNoMembershipPromise = !craveSubmittedText.includes("加入这个家");
  const craveScreenshot = join(evidenceDir, "crave-guest-mobile.png");
  await page.screenshot({ path: craveScreenshot });
  await page.getByRole("button", { name: "登录 Humi，保存这次参与", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("humi:pending-join-context:v1")), null, { timeout: 10_000 });
  const cravePendingContext = await readPendingParticipation(page);

  await page.goto(withQuery(baseUrl, "groceryShare", "grocery-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "顺路带这些就够了" }).waitFor({ timeout: 15_000 });
  await assertNoIdentityInputs(page, "grocery");
  const groceryGuestKeyBeforeSubmit = await hasGuestParticipantKey(page, "grocery", "grocery-guest-smoke");
  const groceryFirstScreen = await page.getByText("不用登录。先选你方便买的，买到后照着勾；主厨刷新就能看到。").isVisible();
  const groceryFirstScreenScreenshot = join(evidenceDir, "grocery-guest-first-screen-mobile.png");
  await page.screenshot({ path: groceryFirstScreenScreenshot });
  await page.getByRole("button", { name: "我来买 1 项" }).click();
  await page.getByRole("heading", { name: "好，这些你来买" }).waitFor({ timeout: 15_000 });
  const grocerySubmittedText = await page.getByTestId("grocery-share-landing").innerText();
  const guestGroceryClaimPayload = groceryClaimPayload;
  const groceryGuestAliasVisible = grocerySubmittedText.includes("游客 1");
  const groceryParticipationExplanation = await page.getByText(
    "登录只会把这次参与关联到你的 Humi 身份，不会自动成为家庭成员；加入家庭需要另行接受家庭邀请。",
    { exact: true },
  ).isVisible();
  const groceryHasNoMembershipPromise = !grocerySubmittedText.includes("加入这个家");
  const groceryScreenshot = join(evidenceDir, "grocery-guest-mobile.png");
  await page.screenshot({ path: groceryScreenshot });
  await page.getByRole("button", { name: "登录 Humi，保存这次参与", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("humi:pending-join-context:v1")), null, { timeout: 10_000 });
  const groceryPendingContext = await readPendingParticipation(page);

  await page.goto(withQuery(baseUrl, "wishShare", "wish-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "你最近想吃什么？" }).waitFor({ timeout: 15_000 });
  await assertNoIdentityInputs(page, "wish");
  const wishGuestKeyBeforeSubmit = await hasGuestParticipantKey(page, "wish", "wish-guest-smoke");
  await page.getByPlaceholder("比如：糖醋排骨、番茄牛腩、凉拌黄瓜").fill("牛肉面");
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到，已经记下了。" }).waitFor({ timeout: 15_000 });
  const wishSubmittedText = await page.getByTestId("wish-share-landing").innerText();
  const guestWishPayload = wishPayload;
  const wishGuestAliasVisible = wishSubmittedText.includes("游客 1");
  const wishParticipationExplanation = await page.getByText(
    "登录只会把这次参与关联到你的 Humi 身份，不会自动成为家庭成员；加入家庭需要另行接受家庭邀请。",
    { exact: true },
  ).isVisible();
  const wishHasNoMembershipPromise = !wishSubmittedText.includes("加入这个家");
  const wishScreenshot = join(evidenceDir, "wish-guest-mobile.png");
  await page.screenshot({ path: wishScreenshot });
  await page.getByRole("button", { name: "登录 Humi，保存这次参与", exact: true }).click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("humi:pending-join-context:v1")), null, { timeout: 10_000 });
  const wishPendingContext = await readPendingParticipation(page);

  await page.goto(withQuery(baseUrl, "crave", "crave-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到！" }).waitFor({ timeout: 15_000 });
  const retryCravePayload = craveVotePayload;

  await page.goto(withQuery(baseUrl, "crave", "crave-guest-alt"), { waitUntil: "networkidle" });
  const alternateGuestKeyBeforeSubmit = await hasGuestParticipantKey(page, "crave", "crave-guest-alt");
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到！" }).waitFor({ timeout: 15_000 });
  const guestIdsAreScoped = !alternateGuestKeyBeforeSubmit
    && retryCravePayload?.guestParticipantId === guestCraveVotePayload?.guestParticipantId
    && new Set([
      guestCraveVotePayload?.guestParticipantId,
      alternateCravePayload?.guestParticipantId,
      guestGroceryClaimPayload?.guestParticipantId,
      guestWishPayload?.guestParticipantId,
    ]).size === 4;

  const signedInResults = await verifySignedInActions(page, baseUrl, collaborationActionRequests);

  await page.evaluate(() => localStorage.removeItem("humi:identity-session:v1"));

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
    { key: "guest-get-does-not-create-identity", ok: !craveGuestKeyBeforeSubmit && !groceryGuestKeyBeforeSubmit && !wishGuestKeyBeforeSubmit, actual: { craveGuestKeyBeforeSubmit, groceryGuestKeyBeforeSubmit, wishGuestKeyBeforeSubmit } },
    { key: "guest-identity-is-reused-per-request-and-distinct-across-request-scopes", ok: guestIdsAreScoped, actual: { firstCrave: guestCraveVotePayload?.guestParticipantId, retryCrave: retryCravePayload?.guestParticipantId, alternateCrave: alternateCravePayload?.guestParticipantId, grocery: guestGroceryClaimPayload?.guestParticipantId, wish: guestWishPayload?.guestParticipantId } },
    { key: "crave-vote-posted-with-request-scoped-guest-id", ok: isGuestActionBody(guestCraveVotePayload) && guestCraveVotePayload?.feelingTag === "辣一点", actual: guestCraveVotePayload },
    { key: "crave-note-can-feed-want-pool", ok: guestCraveVotePayload?.note === "想吃麻婆豆腐", actual: guestCraveVotePayload?.note },
    { key: "crave-completion-promises-identity-binding-only", ok: craveGuestAliasVisible && craveParticipationExplanation && craveHasNoMembershipPromise, actual: craveSubmittedText },
    { key: "crave-cta-stores-typed-pending-participation", ok: isTypedPendingParticipation(cravePendingContext, "crave", "crave-guest-smoke"), actual: cravePendingContext },
    { key: "grocery-first-screen-is-guest-usable", ok: groceryFirstScreen },
    { key: "grocery-claim-posted-with-request-scoped-guest-id", ok: isGuestActionBody(guestGroceryClaimPayload) && guestGroceryClaimPayload?.itemIds?.includes("custom:milk"), actual: guestGroceryClaimPayload },
    { key: "grocery-completion-promises-identity-binding-only", ok: groceryGuestAliasVisible && groceryParticipationExplanation && groceryHasNoMembershipPromise, actual: grocerySubmittedText },
    { key: "grocery-cta-stores-typed-pending-participation", ok: isTypedPendingParticipation(groceryPendingContext, "grocery", "grocery-guest-smoke"), actual: groceryPendingContext },
    { key: "wish-posted-with-request-scoped-guest-id", ok: isGuestActionBody(guestWishPayload) && guestWishPayload?.dishName === "牛肉面", actual: guestWishPayload },
    { key: "wish-completion-promises-identity-binding-only", ok: wishGuestAliasVisible && wishParticipationExplanation && wishHasNoMembershipPromise, actual: wishSubmittedText },
    { key: "wish-cta-stores-typed-pending-participation", ok: isTypedPendingParticipation(wishPendingContext, "wish", "wish-guest-smoke"), actual: wishPendingContext },
    { key: "signed-in-actions-use-session-identity-without-redundant-bind-cta", ok: signedInResults.ok, actual: signedInResults },
    { key: "invite-shows-value-before-login", ok: inviteValueVisible },
    { key: "landings-do-not-auto-login", ok: authRequests.length === 0, actual: authRequests },
    { key: "participation-ctas-do-not-mutate-households", ok: householdMutationRequests.length === 0, actual: householdMutationRequests },
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
      wishSubmitted: wishScreenshot,
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
    items: [{ id: "custom:milk", name: "牛奶", amount: "1盒", source: "早餐", checked: false }],
    claims: [],
  };
}

function buildWishRequest() {
  return {
    id: "wish-guest-smoke",
    token: "wish-guest-smoke",
    householdName: "周末小家",
    initiatorName: "主厨阿杰",
    status: "open",
    wishes: [],
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

async function readPendingParticipation(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("humi:pending-join-context:v1") || "null"));
}

async function verifySignedInActions(page, base, actionRequests) {
  const start = actionRequests.length;
  await page.evaluate((session) => {
    localStorage.removeItem("humi:pending-join-context:v1");
    localStorage.setItem("humi:identity-session:v1", JSON.stringify(session));
  }, signedInSession());

  await page.goto(withQuery(base, "crave", "crave-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到！" }).waitFor({ timeout: 15_000 });
  const craveText = await page.getByTestId("crave-share-landing").innerText();

  await page.goto(withQuery(base, "groceryShare", "grocery-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /我来买/ }).click();
  await page.getByRole("heading", { name: "好，这些你来买" }).waitFor({ timeout: 15_000 });
  const groceryText = await page.getByTestId("grocery-share-landing").innerText();

  await page.goto(withQuery(base, "wishShare", "wish-guest-smoke"), { waitUntil: "networkidle" });
  await page.getByPlaceholder("比如：糖醋排骨、番茄牛腩、凉拌黄瓜").fill("登录态牛肉面");
  await page.getByRole("button", { name: "发给主厨" }).click();
  await page.getByRole("heading", { name: "收到，已经记下了。" }).waitFor({ timeout: 15_000 });
  const wishText = await page.getByTestId("wish-share-landing").innerText();

  const requests = actionRequests.slice(start);
  const bodiesAreAnonymous = requests.length === 3 && requests.every((request) => (
    request.authorization === "Bearer signed-in-smoke-token" && isSignedInActionBody(request.body)
  ));
  const successUsesHumiSnapshot = [craveText, groceryText, wishText].every((text) => (
    text.includes("小禾") && !text.includes("登录 Humi，保存这次参与")
  ));
  return { ok: bodiesAreAnonymous && successUsesHumiSnapshot, requests, successUsesHumiSnapshot };
}

function isTypedPendingParticipation(context, type, token) {
  return context?.type === type
    && context?.token === token
    && typeof context?.guestParticipantId === "string"
    && context.guestParticipantId.length > 0
    && !Object.hasOwn(context, "participantKey")
    && typeof context?.createdAt === "string"
    && !Number.isNaN(Date.parse(context.createdAt));
}

function isGuestActionBody(body) {
  return typeof body?.guestParticipantId === "string"
    && body.guestParticipantId.length > 0
    && !Object.hasOwn(body, "memberName")
    && !Object.hasOwn(body, "participantKey")
    && !Object.hasOwn(body, "memberId")
    && !Object.hasOwn(body, "userId")
    && !Object.hasOwn(body, "avatar")
    && !Object.hasOwn(body, "relationship");
}

function isSignedInActionBody(body) {
  return !Object.hasOwn(body, "guestParticipantId")
    && !Object.hasOwn(body, "memberName")
    && !Object.hasOwn(body, "participantKey")
    && !Object.hasOwn(body, "memberId")
    && !Object.hasOwn(body, "userId")
    && !Object.hasOwn(body, "avatar")
    && !Object.hasOwn(body, "relationship");
}

function guestParticipant(id, displayName) {
  return { type: "guest", id, displayName, avatar: "" };
}

function signedInParticipant() {
  return { type: "user", id: "humi-user-smoke", displayName: "小禾", avatar: "humi-avatar-family-f-01" };
}

function signedInSession() {
  return {
    accessToken: "signed-in-smoke-token",
    expiresAt: Date.now() + 60 * 60 * 1000,
    user: { ...signedInParticipant(), provider: "wechat", profileStatus: "complete" },
  };
}

async function hasGuestParticipantKey(page, requestType, token) {
  return page.evaluate(({ requestType: type, requestToken }) => (
    Boolean(localStorage.getItem(`humi:collaboration-guest:${type}:${requestToken}`))
  ), { requestType, requestToken: token });
}

async function assertNoIdentityInputs(page, label) {
  const identityInputs = page.locator('input[placeholder*="称呼"], input[placeholder*="姓名"], input[placeholder*="关系"]');
  const count = await identityInputs.count();
  if (count !== 0) {
    throw new Error(`${label} landing must not ask a guest for an identity; found ${count} identity input(s)`);
  }
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

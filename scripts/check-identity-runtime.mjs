import assert from "node:assert/strict";
import fs from "node:fs";

const appConfig = JSON.parse(fs.readFileSync("miniprogram/app.json", "utf8"));
assert.ok(appConfig.pages.includes("pages/identity/index"));

const appSource = fs.readFileSync("miniprogram/app.js", "utf8");
assert.match(appSource, /getStorageSync\(NATIVE_SESSION_KEY\)/);
assert.match(appSource, /setHumiSession\(session\)/);
assert.match(appSource, /clearHumiSession\(\)/);

const identityJs = fs.readFileSync("miniprogram/pages/identity/index.js", "utf8");
const identityWxml = fs.readFileSync("miniprogram/pages/identity/index.wxml", "utf8");
assert.match(identityWxml, /open-type="chooseAvatar"/);
assert.match(identityWxml, /type="nickname"/);
assert.match(identityJs, /\/identity\/profile/);
assert.match(identityJs, /\/identity\/avatar/);
assert.match(identityJs, /wx\.reLaunch/);
assert.match(identityJs, /action === "login"/);
assert.match(identityJs, /wx\.login/);
assert.match(identityJs, /\/auth\/wechat\/login/);

const indexSource = fs.readFileSync("miniprogram/pages/index/index.js", "utf8");
assert.doesNotMatch(indexSource, /appendSessionToUrl/);
assert.doesNotMatch(indexSource, /humiSession=/);
assert.match(indexSource, /humiTicket/);
assert.match(indexSource, /clearHumiSession/);
assert.match(indexSource, /options\.humiLogout === "1"/);
assert.doesNotMatch(indexSource, /loginWithWechat\(\{\s*initial:\s*true/);

const phoneBindSource = fs.readFileSync("miniprogram/pages/phone-bind/index.js", "utf8");
assert.match(phoneBindSource, /app\.setHumiSession\(data\)/);

const mainSource = fs.readFileSync("src/main.jsx", "utf8");
const authLandingSource = fs.readFileSync("src/components/AuthLanding.jsx", "utf8");
const userCenterSource = fs.readFileSync("src/components/UserCenter.jsx", "utf8");
const householdStartSource = fs.readFileSync("src/components/HouseholdStart.jsx", "utf8");
const familyLivingRoomSource = fs.readFileSync("src/components/FamilyLivingRoom.jsx", "utf8");
const deployWorkflow = fs.readFileSync(".github/workflows/deploy-pages.yml", "utf8");
assert.doesNotMatch(mainSource, /getCurrentSession|subscribeToAuthChanges/);
assert.doesNotMatch(mainSource, /\.\/lib\/supabase\//);
assert.doesNotMatch(authLandingSource, /CloudAccount|devAuth/);
assert.match(authLandingSource, /entryIntent !== "completeIdentity"/);
assert.match(authLandingSource, /先体验 Humi/);
assert.doesNotMatch(userCenterSource, /CloudAccount|FamilyPreferencesPanel/);
assert.match(userCenterSource, /import \{ FamilyLivingRoom \} from "\.\/FamilyLivingRoom"/);
assert.match(userCenterSource, /import \{ HouseholdStart \} from "\.\/HouseholdStart"/);
assert.match(userCenterSource, /if \(!family\)/);
assert.match(userCenterSource, /<HouseholdStart/);
assert.match(userCenterSource, /<FamilyLivingRoom/);
assert.match(userCenterSource, /data-testid="guest-family-explanation"/);
assert.doesNotMatch(userCenterSource, /create-household-section|humi-account-settings|household-switcher/);

assert.match(householdStartSource, /data-testid="household-start"/);
assert.match(householdStartSource, /创建我的家/);
assert.match(householdStartSource, /通过邀请加入/);
assert.match(householdStartSource, /共享菜单、一起决定想吃什么、协作买菜/);
assert.match(householdStartSource, /selection === "create"/);
assert.match(householdStartSource, /需要一张邀请卡片或邀请链接/);
assert.doesNotMatch(householdStartSource, /云同步|AI|试用额度/);

assert.match(familyLivingRoomSource, /data-testid="family-living-room"/);
assert.match(familyLivingRoomSource, /当前家庭/);
assert.match(familyLivingRoomSource, /邀请家人/);
assert.match(familyLivingRoomSource, /成员管理/);
assert.match(familyLivingRoomSource, /家庭设置/);
assert.match(familyLivingRoomSource, /正在一起做/);
assert.match(familyLivingRoomSource, /家庭偏好/);
assert.match(familyLivingRoomSource, /协作记录/);
assert.match(familyLivingRoomSource, /账号设置/);
assert.match(familyLivingRoomSource, /activeCollaborations\.slice\(0, 3\)/);
assert.doesNotMatch(familyLivingRoomSource, /云同步|营养目标|验证数据|CloudSyncPanel/);
assert.doesNotMatch(deployWorkflow, /VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/);

const humiApi = await import(`../src/lib/humiApi.js?session-invalid-check=${Date.now()}`);
const humiIdentity = await import(`../src/lib/humiIdentity.js?native-navigation-check=${Date.now()}`);
assert.equal(typeof humiApi.subscribeHumiSessionInvalid, "function");
let invalidSessionNotifications = 0;
const unsubscribe = humiApi.subscribeHumiSessionInvalid(() => {
  invalidSessionNotifications += 1;
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  error: "invalid_session",
  message: "登录状态已失效。",
}), {
  status: 401,
  headers: { "content-type": "application/json" },
});
try {
  await assert.rejects(
    humiApi.saveHumiState({ accessToken: "revoked-token" }, { todayMenu: [] }),
    (error) => error.status === 401 && error.code === "invalid_session"
  );
  assert.equal(invalidSessionNotifications, 1, "every authenticated 401 should broadcast session invalidation");
} finally {
  unsubscribe();
  globalThis.fetch = originalFetch;
}

const nativeIdentityCalls = [];
const nativeWindowTarget = new EventTarget();
const nativeDocumentTarget = new EventTarget();
globalThis.window = {
  document: {
    visibilityState: "visible",
    addEventListener: nativeDocumentTarget.addEventListener.bind(nativeDocumentTarget),
    removeEventListener: nativeDocumentTarget.removeEventListener.bind(nativeDocumentTarget),
  },
  addEventListener: nativeWindowTarget.addEventListener.bind(nativeWindowTarget),
  removeEventListener: nativeWindowTarget.removeEventListener.bind(nativeWindowTarget),
  dispatchEvent: nativeWindowTarget.dispatchEvent.bind(nativeWindowTarget),
  wx: {
    miniProgram: {
      navigateTo({ success }) {
        nativeIdentityCalls.push("navigateTo");
        success?.({ errMsg: "navigateTo:ok" });
      },
      redirectTo({ success }) {
        nativeIdentityCalls.push("redirectTo");
        success?.({ errMsg: "redirectTo:ok" });
      },
      reLaunch({ success }) {
        nativeIdentityCalls.push("reLaunch");
        success?.({ errMsg: "reLaunch:ok" });
        nativeWindowTarget.dispatchEvent(new Event("pagehide"));
      },
    },
  },
  setTimeout,
  clearTimeout,
};
assert.equal(
  humiIdentity.requestWechatLoginFromMiniProgram({ confirmationMs: 10 }),
  true,
  "identity navigation should start synchronously",
);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.deepEqual(
  nativeIdentityCalls,
  ["navigateTo", "redirectTo", "reLaunch"],
  "identity callback receipt must not stop fallback before native page visibility is confirmed",
);
delete globalThis.window;

console.log("Identity runtime checks passed.");

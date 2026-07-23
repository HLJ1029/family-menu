import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

const appConfig = JSON.parse(fs.readFileSync("miniprogram/app.json", "utf8"));
assert.ok(appConfig.pages.includes("pages/identity/index"));

const appSource = fs.readFileSync("miniprogram/app.js", "utf8");
assert.match(appSource, /restoreSession\(\)/, "app startup must restore the shared native session foundation");
assert.match(appSource, /setHumiSession\(session\)/);
assert.match(appSource, /clearHumiSession\(\)/);

const identityJs = fs.readFileSync("miniprogram/pages/identity/index.js", "utf8");
const identityWxml = fs.readFileSync("miniprogram/pages/identity/index.wxml", "utf8");
const identityJson = fs.readFileSync("miniprogram/pages/identity/index.json", "utf8");
const userMessageModule = { exports: {} };
vm.runInNewContext(fs.readFileSync("miniprogram/utils/user-message.js", "utf8"), {
  module: userMessageModule,
  exports: userMessageModule.exports,
});
assert.equal(userMessageModule.exports.toHumiUserMessage({ code: "invalid_session", message: "invalid_session" }), "登录状态已失效，请重新登录。");
assert.equal(userMessageModule.exports.toHumiUserMessage({ code: "network_error", message: "network_error" }), "网络连接失败，请检查网络后重试。");
assert.match(identityWxml, /type="nickname"/);
assert.match(identityJs, /\/identity\/profile/);
assert.match(identityJs, /\/identity\/avatar/);
assert.match(identityJs, /wx\.reLaunch/);
assert.match(identityJs, /action === "login"/);
assert.match(identityJs, /loginWithWechat/, "identity login must reuse the native session foundation");
assert.match(identityJs, /requestHumi/, "identity API calls must reuse authenticated request retries");
assert.match(identityJs, /clearBootstrapCacheForUser/, "identity completion must invalidate user bootstrap cache");
assert.doesNotMatch(identityJs, /\/households/, "identity completion must never create a household");
const silentLoginSource = identityJs.slice(identityJs.indexOf("async loginWithWechat"), identityJs.indexOf("async useWechatProfile"));
assert.doesNotMatch(silentLoginSource, /getUserProfile/, "silent login must not request profile permission");
assert.match(identityJson, /"avatar-picker": "\/components\/avatar-picker\/index"/, "identity must register approved Humi avatar choices");
assert.match(identityWxml, /使用微信头像和昵称/);
assert.match(identityWxml, /保存并进入 Humi/);
assert.match(identityWxml, /disabled="\{\{!canSubmit \|\| pending\}\}"/, "identity save must require an explicit name and avatar choice");

const indexSource = fs.readFileSync("miniprogram/pages/legacy/index.js", "utf8");
assert.doesNotMatch(indexSource, /appendSessionToUrl/);
assert.doesNotMatch(indexSource, /humiSession=/);
assert.match(indexSource, /humiTicket/);
assert.match(indexSource, /clearHumiSession/);
assert.match(indexSource, /options\.humiLogout === "1"/);
assert.doesNotMatch(indexSource, /loginWithWechat\(\{\s*initial:\s*true/);

const phoneBindSource = fs.readFileSync("miniprogram/pages/phone-bind/index.js", "utf8");
assert.match(phoneBindSource, /app\.setHumiSession\(data\)/);
assert.match(phoneBindSource, /requestHumi/, "phone binding must reuse the authenticated request foundation");
assert.doesNotMatch(phoneBindSource, /wx\.request/, "phone binding must not duplicate raw authenticated requests");
assert.match(phoneBindSource, /toHumiUserMessage/, "phone binding must map request codes to fixed recovery copy");
assert.doesNotMatch(phoneBindSource, /error\.message \|\|/, "phone binding must not render raw request error codes");

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

function loadIdentityPage({ user, loginResult = null, rejectProfile = false, profileAvatarUrl = "https://thirdwx.qlogo.cn/mmopen/avatar.jpg", requestError = null } = {}) {
  let definition;
  const routes = [];
  const calls = { login: 0, getUserProfile: 0, request: [], clearCache: [], downloadFile: [], compressImage: [], readFile: [] };
  const app = {
    globalData: { humiSession: user ? { accessToken: "token", expiresAt: Date.now() + 60_000, user } : null },
    setHumiSession(session) { this.globalData.humiSession = session; },
    clearHumiSession() { this.globalData.humiSession = null; }
  };
  const runtime = vm.createContext({
    Page: (page) => { definition = page; },
    getApp: () => app,
    wx: {
      reLaunch: ({ url }) => routes.push(url),
      getUserProfile: ({ success, fail }) => {
        calls.getUserProfile += 1;
        if (rejectProfile) return fail?.(new Error("denied"));
        success?.({ userInfo: { nickName: "微信小禾", avatarUrl: profileAvatarUrl } });
      },
      downloadFile: ({ url, success }) => {
        calls.downloadFile.push(url);
        success?.({ statusCode: 200, tempFilePath: "/tmp/wechat-avatar.jpg" });
      },
      compressImage: ({ src, success }) => {
        calls.compressImage.push(src);
        success?.({ tempFilePath: "/tmp/compressed-avatar.jpg" });
      },
      getFileSystemManager: () => ({
        readFile: ({ filePath, success }) => {
          calls.readFile.push(filePath);
          success?.({ data: "/9j/AA==" });
        }
      })
    },
    require: (specifier) => {
      if (specifier === "../../utils/config") return { getHumiApiBaseUrl: () => "https://api.example" };
      if (specifier === "../../utils/user-message") return userMessageModule.exports;
      if (specifier === "../../data/approved-avatar-keys.json") return nodeRequire("../miniprogram/data/approved-avatar-keys.json");
      if (specifier === "../../utils/session") return {
        loginWithWechat: async () => {
          calls.login += 1;
          return loginResult;
        }
      };
      if (specifier === "../../utils/request") return {
        requestHumi: async (options) => {
          calls.request.push(options);
          if (requestError) throw requestError;
          if (options.path === "/identity/avatar") return { user: { ...app.globalData.humiSession?.user, avatarUrl: "https://api.example/avatars/uploaded.jpg", profileStatus: "incomplete" } };
          return { user: { ...app.globalData.humiSession?.user, profileStatus: "complete" } };
        }
      };
      if (specifier === "../../utils/bootstrap") return { clearBootstrapCacheForUser: (id) => calls.clearCache.push(id) };
      throw new Error(`Unexpected identity dependency: ${specifier}`);
    },
    Promise,
    Date,
    String,
    RegExp,
    console,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(identityJs, runtime, { filename: "miniprogram/pages/identity/index.js" });
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) { this.data = { ...this.data, ...patch }; }
  };
  return { app, calls, page, routes };
}

const firstUse = {
  id: "first-use",
  displayName: "微信用户",
  avatarKey: "humi-avatar-family-m-01",
  avatarUrl: "",
  profileStatus: "incomplete"
};
const firstUsePage = loadIdentityPage({ user: firstUse });
firstUsePage.page.onLoad();
assert.equal(firstUse.profileStatus, "incomplete", "silent account login must remain explicitly incomplete");
assert.equal(firstUsePage.page.data.displayName, "", "first use must not prefill a default nickname");
assert.equal(firstUsePage.page.data.selectedAvatarKey, "", "a server fallback avatar is not an explicit picker choice");
assert.equal(firstUsePage.page.data.avatarUrl, "", "first use must not present a shared default avatar as chosen");
assert.deepEqual(firstUsePage.calls.request.filter((call) => call.path === "/households"), [], "identity start must not create a household");
assert.equal(firstUsePage.page.data.canSubmit, false, "a nickname and explicit avatar are both required before identity can save");

await firstUsePage.page.useWechatProfile();
assert.equal(firstUsePage.calls.getUserProfile, 1, "WeChat profile permission must be requested only after the explicit tap handler");
assert.equal(firstUsePage.page.data.displayName, "微信小禾");
assert.equal(firstUsePage.page.data.localAvatarUrl, "https://thirdwx.qlogo.cn/mmopen/avatar.jpg");

const forgedPickerPage = loadIdentityPage({ user: firstUse });
forgedPickerPage.page.onLoad();
forgedPickerPage.page.updateNickname({ detail: { value: "手工小禾" } });
forgedPickerPage.page.selectApprovedAvatar({ detail: { avatarKey: "not-an-approved-avatar" } });
assert.equal(forgedPickerPage.page.data.selectedAvatarKey, "", "the page must reject forged avatar-picker events");
assert.equal(forgedPickerPage.page.data.canSubmit, false, "a forged avatar key must not enable save");

for (const profileAvatarUrl of [
  "https://evil.example/avatar.jpg",
  "http://thirdwx.qlogo.cn/avatar.jpg",
  "https://thirdwx.qlogo.cn.evil/avatar.jpg",
  "https://thirdwx.qlogo.cn@evil.example/avatar.jpg"
]) {
  const untrustedWechatProfile = loadIdentityPage({ user: firstUse, profileAvatarUrl });
  await untrustedWechatProfile.page.useWechatProfile();
  assert.equal(untrustedWechatProfile.page.data.avatarUrl, "", `untrusted remote avatar URL must not enter upload: ${profileAvatarUrl}`);
  assert.equal(untrustedWechatProfile.page.data.canSubmit, false, `untrusted remote avatar must not enable identity save: ${profileAvatarUrl}`);
}

const forgedLocalAvatar = loadIdentityPage({ user: firstUse });
forgedLocalAvatar.page.onLoad();
forgedLocalAvatar.page.updateNickname({ detail: { value: "伪造本地文件" } });
forgedLocalAvatar.page.chooseAvatar({ detail: { avatarUrl: "https://evil.example/avatar.jpg" } });
assert.equal(forgedLocalAvatar.page.data.avatarUrl, "", "chooseAvatar must reject forged remote file paths");
assert.equal(forgedLocalAvatar.page.data.canSubmit, false, "a forged local-avatar event must not enable save");

const rejectedProfilePage = loadIdentityPage({ user: firstUse, rejectProfile: true });
rejectedProfilePage.page.onLoad();
await rejectedProfilePage.page.useWechatProfile();
rejectedProfilePage.page.updateNickname({ detail: { value: "手工小禾" } });
rejectedProfilePage.page.selectApprovedAvatar({ detail: { avatarKey: "humi-avatar-family-f-01" } });
assert.equal(rejectedProfilePage.page.data.canSubmit, true, "refusing profile permission must still allow a manual nickname and approved Humi avatar");

const firstSilentLogin = loadIdentityPage({ user: null, loginResult: { accessToken: "first-token", expiresAt: Date.now() + 60_000, user: firstUse } });
await firstSilentLogin.page.loginWithWechat();
assert.equal(firstSilentLogin.app.globalData.humiSession.user.profileStatus, "incomplete", "first silent login only creates an incomplete account session");
assert.equal(firstSilentLogin.page.data.displayName, "", "first silent login must not turn the default name into a completed identity");
assert.equal(firstSilentLogin.page.data.selectedAvatarKey, "", "first silent login must not turn the server fallback avatar into a selected avatar");
assert.equal(firstSilentLogin.calls.getUserProfile, 0, "silent login must not claim WeChat profile permission");

const manualIdentity = loadIdentityPage({ user: firstUse });
manualIdentity.page.onLoad();
manualIdentity.page.updateNickname({ detail: { value: "  手工小禾  " } });
assert.equal(manualIdentity.page.data.canSubmit, false, "a name alone must not enable save");
manualIdentity.page.selectApprovedAvatar({ detail: { avatarKey: "humi-avatar-parent-f-01" } });
assert.equal(manualIdentity.page.data.canSubmit, true, "an approved avatar key and trimmed name enable save");
await manualIdentity.page.submit();
assert.deepEqual(JSON.parse(JSON.stringify(manualIdentity.calls.request)), [{
  path: "/identity/profile",
  method: "PUT",
  data: { displayName: "手工小禾", avatarKey: "humi-avatar-parent-f-01", avatarUrl: "" }
}], "save must persist the explicit identity payload through the authenticated client");
assert.equal(manualIdentity.app.globalData.humiSession.user.profileStatus, "complete", "saved identity must replace the persisted session user");
assert.deepEqual(manualIdentity.calls.clearCache, ["first-use"], "save must clear only this user's bootstrap cache");
assert.deepEqual(manualIdentity.routes, ["/pages/boot/index?reason=identity_complete"], "post-save routing must return to boot for the real household decision");
assert.deepEqual(JSON.parse(JSON.stringify(manualIdentity.calls.request.filter((call) => call.path === "/households"))), [], "identity save must not create a household");

const remoteAvatarIdentity = loadIdentityPage({ user: firstUse });
remoteAvatarIdentity.page.onLoad();
await remoteAvatarIdentity.page.useWechatProfile();
await remoteAvatarIdentity.page.submit();
assert.deepEqual(remoteAvatarIdentity.calls.downloadFile, ["https://thirdwx.qlogo.cn/mmopen/avatar.jpg"], "an allowed WeChat CDN avatar must download before upload");
assert.deepEqual(remoteAvatarIdentity.calls.compressImage, ["/tmp/wechat-avatar.jpg"]);
assert.deepEqual(remoteAvatarIdentity.calls.readFile, ["/tmp/compressed-avatar.jpg"]);
assert.deepEqual(JSON.parse(JSON.stringify(remoteAvatarIdentity.calls.request)), [
  { path: "/identity/avatar", method: "POST", data: { mimeType: "image/jpeg", dataBase64: "/9j/AA==" } },
  { path: "/identity/profile", method: "PUT", data: { displayName: "微信小禾", avatarKey: "", avatarUrl: "https://api.example/avatars/uploaded.jpg" } }
], "a remote WeChat avatar must upload then complete identity through the normal session/cache/boot path");
assert.deepEqual(remoteAvatarIdentity.calls.clearCache, ["first-use"]);
assert.deepEqual(remoteAvatarIdentity.routes, ["/pages/boot/index?reason=identity_complete"]);

const localAvatarIdentity = loadIdentityPage({ user: firstUse });
localAvatarIdentity.page.onLoad();
localAvatarIdentity.page.updateNickname({ detail: { value: "本地头像" } });
localAvatarIdentity.page.chooseAvatar({ detail: { avatarUrl: "wxfile://tmp/local-avatar.jpg" } });
await localAvatarIdentity.page.submit();
assert.deepEqual(localAvatarIdentity.calls.downloadFile, [], "a local chooseAvatar file must not download again");
assert.deepEqual(localAvatarIdentity.calls.compressImage, ["wxfile://tmp/local-avatar.jpg"]);
assert.deepEqual(localAvatarIdentity.calls.readFile, ["/tmp/compressed-avatar.jpg"]);

const identityErrorPage = loadIdentityPage({ user: firstUse, requestError: { code: "invalid_session", message: "invalid_session" } });
identityErrorPage.page.onLoad();
identityErrorPage.page.updateNickname({ detail: { value: "错误映射" } });
identityErrorPage.page.selectApprovedAvatar({ detail: { avatarKey: "humi-avatar-parent-f-01" } });
await identityErrorPage.page.submit();
assert.equal(identityErrorPage.page.data.error, "登录状态已失效，请重新登录。", "identity errors must map request codes to recoverable Chinese text");

const existingUser = {
  id: "existing-user",
  displayName: "已完成",
  avatarKey: "humi-avatar-parent-f-01",
  avatarUrl: "",
  profileStatus: "complete"
};
const existingUserPage = loadIdentityPage({ user: null, loginResult: { accessToken: "fresh", expiresAt: Date.now() + 60_000, user: existingUser } });
await existingUserPage.page.loginWithWechat();
assert.equal(existingUserPage.calls.login, 1, "identity login must delegate to the shared silent-login function");
assert.equal(existingUserPage.calls.getUserProfile, 0, "silent login must not claim WeChat profile permission");
assert.deepEqual(existingUserPage.routes, ["/pages/boot/index?humiResume=1"], "a complete user must return to boot for the real tonight/household decision");

console.log("Identity runtime checks passed.");

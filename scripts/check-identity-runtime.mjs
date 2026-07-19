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
const deployWorkflow = fs.readFileSync(".github/workflows/deploy-pages.yml", "utf8");
assert.doesNotMatch(mainSource, /getCurrentSession|subscribeToAuthChanges/);
assert.doesNotMatch(mainSource, /\.\/lib\/supabase\//);
assert.doesNotMatch(authLandingSource, /CloudAccount|devAuth/);
assert.match(authLandingSource, /entryIntent !== "completeIdentity"/);
assert.match(authLandingSource, /先体验 Humi/);
assert.doesNotMatch(userCenterSource, /CloudAccount|FamilyPreferencesPanel/);
assert.match(userCenterSource, /data-testid="create-household-section"/);
assert.match(userCenterSource, /data-testid="humi-account-settings"/);
assert.doesNotMatch(deployWorkflow, /VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/);

const humiApi = await import(`../src/lib/humiApi.js?session-invalid-check=${Date.now()}`);
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

console.log("Identity runtime checks passed.");

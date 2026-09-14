import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { requestMiniProgramPage } from "../src/lib/runtime.js";
import { requestWechatLoginFromMiniProgram, getWechatLoginFailureMessage, readHumiSession, takeHumiTicketFromUrl, takeHumiSessionExpiredNotice } from "../src/lib/humiIdentity.js";
import { subscribeHumiSessionInvalid } from "../src/lib/humiApi.js";

// Keep the shipping SDK real: only the host's native invoke boundary is simulated.
const sdk = fs.readFileSync(new URL("../public/vendor/jweixin-1.6.0.js", import.meta.url), "utf8");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const options = { confirmationMs: 15, timeoutMs: 75 };

function createHost({ ready = true, loaded = true, invoke = () => {} } = {}) {
  const documentEvents = new EventTarget();
  const windowEvents = new EventTarget();
  const calls = [];
  const host = {
    document: {
      title: "Humi",
      visibilityState: "visible",
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    },
    navigator: { userAgent: "MicroMessenger/8.0.56 iPhone", platform: "iPhone" },
    location: { href: "https://humi-home.com/?channel=wechat-miniprogram", search: "?channel=wechat-miniprogram" },
    __wxjs_environment: "miniprogram",
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    setTimeout,
    clearTimeout,
  };
  const bridge = {
    invoke(api, arg, callback) {
      assert.equal(api, "invokeMiniProgramAPI");
      calls.push({ method: arg.name, url: arg.arg?.url });
      invoke(arg.name, callback, host);
    },
  };
  vm.createContext(host);
  function loadSdk() {
    vm.runInContext(sdk, host);
    documentEvents.dispatchEvent(new Event("load"));
  }
  function readyBridge() {
    host.WeixinJSBridge = bridge;
    documentEvents.dispatchEvent(new Event("WeixinJSBridgeReady"));
  }
  function hidePage() {
    host.document.visibilityState = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
  }
  function resumePage() {
    host.document.visibilityState = "visible";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    windowEvents.dispatchEvent(new Event("pageshow"));
  }
  if (ready) readyBridge();
  if (loaded) loadSdk();
  globalThis.window = host;
  return { calls, host, loadSdk, readyBridge, hidePage, resumePage };
}

const accepted = createHost({ invoke: (_, done) => done({ err_msg: "invokeMiniProgramAPI:ok" }) });
assert.equal(await requestMiniProgramPage("/pages/identity/index", options), "accepted",
  "native success without a browser hide signal is acceptance, not confirmed handoff or failure");
assert.deepEqual(accepted.calls.map(({ method }) => method), ["navigateTo"],
  "a native success must stop all navigation fallbacks");

const silent = createHost();
assert.equal(await requestMiniProgramPage("/pages/identity/index", options), "unavailable");
assert.deepEqual(silent.calls.map(({ method }) => method), ["navigateTo"],
  "silence cannot prove failure, so it must never trigger another native navigation");

const delayedLeave = createHost({ invoke: (_, done) => done({ err_msg: "invokeMiniProgramAPI:ok" }) });
const delayedResult = requestMiniProgramPage("/pages/identity/index", options);
await pause(30);
delayedLeave.hidePage();
assert.equal(await delayedResult, "handoff");
assert.equal(delayedLeave.calls.length, 1, "slow page hiding must not cause duplicate native pages");

const lateReady = createHost({ ready: false });
assert.equal(await requestMiniProgramPage("/pages/identity/index", options), "unavailable");
lateReady.readyBridge();
await pause(20);
assert.deepEqual(lateReady.calls, [], "timed-out readiness must not leave queued SDK navigation behind");

const sdkLoadsLater = createHost({ loaded: false, invoke: (_, done) => done({ err_msg: "invokeMiniProgramAPI:ok" }) });
const laterSdkResult = requestMiniProgramPage("/pages/identity/index", options);
await pause(10);
sdkLoadsLater.loadSdk();
assert.equal(await laterSdkResult, "accepted");
assert.equal(sdkLoadsLater.calls.length, 1, "a deferred SDK can finish loading before the request deadline");

const bridgeLoadsLater = createHost({ ready: false, invoke: (_, done) => done({ err_msg: "invokeMiniProgramAPI:ok" }) });
const laterBridgeResult = requestMiniProgramPage("/pages/identity/index", options);
await pause(30);
bridgeLoadsLater.readyBridge();
assert.equal(await laterBridgeResult, "accepted");
assert.deepEqual(bridgeLoadsLater.calls.map(({ method }) => method), ["navigateTo"],
  "readiness waiting must not enqueue one request per expired fallback interval");

let firstCallback;
const explicitFailure = createHost({ invoke(method, done) {
  if (method === "navigateTo") {
    firstCallback = done;
    done({ err_msg: "invokeMiniProgramAPI:fail page stack limit" });
  } else {
    done({ err_msg: "invokeMiniProgramAPI:ok" });
  }
} });
const explicitResult = requestMiniProgramPage("/pages/identity/index", options);
firstCallback({ err_msg: "invokeMiniProgramAPI:fail page not found" });
assert.equal(await explicitResult, "accepted");
assert.deepEqual(explicitFailure.calls.map(({ method }) => method), ["navigateTo", "redirectTo"],
  "only explicit current-attempt failure may advance; stale callbacks must not cause relaunch");

const hiddenBeforeReady = createHost({ ready: false });
const noNavigationResult = requestMiniProgramPage("/pages/identity/index", options);
hiddenBeforeReady.hidePage();
assert.equal(await noNavigationResult, "unavailable", "backgrounding before navigation cannot confirm handoff");
hiddenBeforeReady.readyBridge();
assert.equal(hiddenBeforeReady.calls.length, 0);

const recovery = [];
const identity = createHost({ invoke: (_, done) => done({ err_msg: "invokeMiniProgramAPI:ok" }) });
assert.equal(requestWechatLoginFromMiniProgram({ ...options, onFailure: (failure) => recovery.push(failure) }), true);
await pause(100);
assert.deepEqual(identity.calls, [{ method: "navigateTo", url: "/pages/identity/index?action=login&returnTo=legacy" }]);
assert.deepEqual(recovery, [{ errorCode: "handoff_unconfirmed" }],
  "accepted-but-unconfirmed identity navigation must restore a user retry");
assert.match(getWechatLoginFailureMessage(recovery[0]), /已接收/);

let handoffs = 0;
let resumes = 0;
const resumable = createHost();
requestWechatLoginFromMiniProgram({ ...options, onHandoff: () => { handoffs += 1; }, onResume: () => { resumes += 1; } });
resumable.hidePage();
await pause(0);
resumable.resumePage();
await pause(0);
assert.equal(handoffs, 1);
assert.equal(resumes, 1, "returning from a confirmed native page must restore retry exactly once");

const originalFetch = globalThis.fetch;
let revocations = 0;
let invalidSessionNotifications = 0;
const unsubscribe = subscribeHumiSessionInvalid(() => { invalidSessionNotifications += 1; });
globalThis.fetch = async (url, request) => {
  assert.match(String(url), /\/auth\/logout$/);
  assert.equal(request.method, "POST");
  revocations += 1;
  return revocations === 1
    ? new Response(JSON.stringify({ error: "invalid_session" }), { status: 401 })
    : new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 });
};
try {
  for (const query of ["channel=wechat-miniprogram&humiGuest=1", "channel=wechat-miniprogram&humiLogout=123"]) {
    const storage = new Map([["humi:identity-session:v1", JSON.stringify({
      accessToken: "old-account-bearer",
      expiresAt: Date.now() + 60_000,
      user: { id: "old-account", provider: "wechat", profileStatus: "complete" },
    })]]);
    globalThis.window = {
      location: { href: `https://humi-home.com/?${query}&humiTicket=must-not-exchange`, search: `?${query}&humiTicket=must-not-exchange` },
      localStorage: { getItem: (key) => storage.get(key) ?? null, removeItem: (key) => storage.delete(key) },
      sessionStorage: { getItem: () => "1", removeItem() {} },
      history: { replaceState(_, __, path) {
        const location = new URL(path, globalThis.window.location.href);
        globalThis.window.location = { href: location.href, search: location.search };
      } },
    };
    assert.equal(takeHumiTicketFromUrl(), "", "native guest/logout intent must discard leftover login tickets");
    assert.equal(new URL(window.location.href).searchParams.has("humiTicket"), false, "discarded tickets must also leave the visible URL");
    assert.equal(readHumiSession(), null, "native guest/logout intent must override an old unexpired H5 account");
    assert.equal(storage.has("humi:identity-session:v1"), false, "clear locally before waiting for remote logout");
    assert.equal(readHumiSession(), null);
    if (query.includes("humiGuest=1")) {
      assert.equal(takeHumiSessionExpiredNotice(), false, "choosing native guest must not revive a previous login-expiry gate");
    }
    await pause(0);
  }
  assert.equal(revocations, 2, "each old bearer is revoked once, with local logout surviving request failure");
  assert.equal(invalidSessionNotifications, 0, "late revocation errors for an old bearer must not invalidate a later login");

  globalThis.window = {
    location: { href: "https://humi-home.com/?humiGuest=1", search: "?humiGuest=1" },
    localStorage: { getItem: () => JSON.stringify({ accessToken: "ordinary-web-session", expiresAt: Date.now() + 60_000 }) },
  };
  assert.equal(readHumiSession()?.accessToken, "ordinary-web-session", "ordinary browser query flags must not silently log users out");
} finally {
  unsubscribe();
  globalThis.fetch = originalFetch;
}

delete globalThis.window;
console.log("Real WeChat SDK readiness, single navigation, handoff, retry and native guest isolation regressions passed.");

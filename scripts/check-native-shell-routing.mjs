import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { directPreviewFixtures, shareCardGuideFixtures } from "./lib/native-share-qa-fixtures.mjs";

const appConfig = JSON.parse(readFileSync(new URL("../miniprogram/app.json", import.meta.url), "utf8"));
const tabPaths = [
  "pages/tonight/index",
  "pages/discover/index",
  "pages/plan/index",
  "pages/grocery/index",
  "pages/family/index"
];
const tabLabels = ["今晚", "发现", "计划", "清单", "我的家"];

assert.equal(appConfig.pages[0], "pages/boot/index", "boot must be the non-tab entry page");
assert.deepEqual(appConfig.tabBar?.list?.map((item) => item.pagePath), tabPaths, "the five native tabs must be registered in order");
assert.deepEqual(appConfig.tabBar?.list?.map((item) => item.text), tabLabels, "the five native tab labels must stay exact");
assert(appConfig.pages.includes("pages/legacy/index"), "the H5 compatibility page must stay registered");
assert(appConfig.pages.includes("pages/index/index"), "the historical share-entry shim must stay registered");
assert(!appConfig.tabBar.list.some((item) => item.pagePath === "pages/legacy/index"), "legacy must not be a tab");
assert(!appConfig.tabBar.list.some((item) => item.pagePath === "pages/index/index"), "the historical shim must not be a tab");
for (const pagePath of appConfig.pages) assertPageFiles(`../miniprogram/${pagePath}`, `registered page ${pagePath}`);
for (const subPackage of appConfig.subPackages || []) {
  for (const pagePath of subPackage.pages || []) {
    assertPageFiles(`../miniprogram/${subPackage.root}/${pagePath}`, `registered subpackage page ${subPackage.root}/${pagePath}`);
  }
}
for (const tabPath of tabPaths) {
  const pagePath = `../miniprogram/${tabPath}.js`;
  assert(existsSync(new URL(pagePath, import.meta.url)), `${tabPath} must have a native page controller`);
  const source = readFileSync(new URL(pagePath, import.meta.url), "utf8");
  const config = readFileSync(new URL(`../miniprogram/${tabPath}.json`, import.meta.url), "utf8");
  assert.match(config, /components\/page-state\/index/, `${tabPath} must use the shared page-state component`);
  assert.match(source, /status:/, `${tabPath} must expose its page state`);
}
assert(existsSync(new URL("../miniprogram/components/page-state/index.js", import.meta.url)), "the shared page-state component must exist");

function assertPageFiles(basePath, label) {
  for (const extension of ["js", "json", "wxml", "wxss"]) {
    assert(existsSync(new URL(`${basePath}.${extension}`, import.meta.url)), `${label} must include index.${extension}`);
  }
}

const bootstrapModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../miniprogram/utils/bootstrap.js", import.meta.url), "utf8"), {
  module: bootstrapModule,
  exports: bootstrapModule.exports,
  require: (specifier) => {
    if (specifier === "./cache") return {};
    if (specifier === "./request") return {};
    throw new Error(`Unexpected bootstrap dependency: ${specifier}`);
  }
});
const { buildLegacyRoute, resolveKnownShareRoute, resolveStartupRoute } = bootstrapModule.exports;
const enabled = { capabilities: { nativeShellEnabled: true }, user: { profileStatus: "complete" } };
const disabled = { capabilities: { nativeShellEnabled: false }, user: { profileStatus: "complete" } };
const incomplete = { capabilities: { nativeShellEnabled: true }, user: { profileStatus: "incomplete" } };
const validToken = "abcdefghijklmnopqrstuvwx";
const assertRoute = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

assertRoute(resolveStartupRoute({ candidate: false, envelope: enabled }), { route: "/pages/legacy/index", reason: "package_disabled" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: disabled }), { route: "/pages/legacy/index", reason: "server_disabled" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: incomplete }), { route: "/pages/identity/index", reason: "identity_incomplete" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: enabled }), { route: "/pages/tonight/index", reason: "native_enabled" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: { ...enabled, cacheState: "cached" } }), { route: "/pages/tonight/index", reason: "native_enabled" });

assert.equal(resolveKnownShareRoute({ crave: ` ${validToken} `, shareSource: "ignored" }), `/pages/share/index?type=crave&token=${validToken}&shareSource=crave`);
assert.equal(resolveKnownShareRoute({ grocery: validToken, shareSource: "ignored" }), `/pages/share/index?type=grocery&token=${validToken}&shareSource=grocery`);
assert.equal(resolveKnownShareRoute({ groceryShare: validToken, shareSource: "ignored" }), `/pages/share/index?type=grocery&token=${validToken}&shareSource=grocery`);
assert.equal(resolveKnownShareRoute({ menuShare: validToken, shareSource: "ignored" }), `/pages/share/index?type=today_menu&token=${validToken}&shareSource=today_menu`);
assert.equal(resolveKnownShareRoute({ wishShare: validToken, shareSource: "ignored" }), `/pages/share/index?type=wish&token=${validToken}&shareSource=wish`);
assert.equal(resolveKnownShareRoute({ invite: validToken, shareSource: "ignored" }), `/pages/share/index?type=invite&token=${validToken}&shareSource=invite`);
assert.equal(resolveKnownShareRoute({ mealTask: validToken, shareSource: "ignored" }), `/pages/share/index?type=meal_task&token=${validToken}&shareSource=meal_task`);
for (const invalidToken of [{ value: validToken }, "", "   ", "short", "x".repeat(65), "abcdefghijklmnopqrstuv!" ]) {
  assert.equal(resolveKnownShareRoute({ crave: invalidToken }), null, "only opaque 24–64 character token strings may use the native landing");
}
assert.equal(resolveKnownShareRoute({ crave: validToken, invite: validToken }), null, "ambiguous token combinations must not silently select a landing");
assert.equal(resolveKnownShareRoute({ view: "today" }), null, "non-token legacy deep links must remain on the H5 compatibility route");
assert.equal(
  buildLegacyRoute({ view: "today", shareSource: "today_menu", humiLogout: "1", humiExpired: true, humiResume: "1", token: validToken, note: "private" }),
  "/pages/legacy/index?view=today&shareSource=today_menu&humiLogout=1&humiExpired=1&humiResume=1",
  "legacy routes must preserve only the reviewed compatibility parameters",
);
assert.equal(buildLegacyRoute({ view: "admin", shareSource: "unknown", invite: validToken, arbitrary: "value" }), "/pages/legacy/index", "legacy routes must not forward token or free-text query values");

for (const fixture of directPreviewFixtures) {
  const landing = bootstrapModule.exports.validateShareLandingOptions(fixture.query);
  assert.deepEqual(
    JSON.parse(JSON.stringify(landing)),
    { type: fixture.query.type, token: fixture.query.token },
    `${fixture.key} direct preview must use a strict native share landing`,
  );
  const expectedBootPath = fixture.expectedPath;
  assert.equal(expectedBootPath.startsWith("/pages/boot/index?"), true, `${fixture.key} direct preview must use the canonical boot path`);
}

const cacheValues = new Map();
const cacheUtilsModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../miniprogram/utils/cache.js", import.meta.url), "utf8"), {
  module: cacheUtilsModule,
  exports: cacheUtilsModule.exports,
  Date,
  wx: {
    getStorageSync: (key) => cacheValues.get(key),
    setStorageSync: (key, value) => cacheValues.set(key, value),
    removeStorageSync: (key) => cacheValues.delete(key)
  }
});
const cacheUtils = cacheUtilsModule.exports;
const userAEnvelope = { stateVersion: "state-a", user: { id: "user-a" } };
const userBEnvelope = { stateVersion: "state-b", user: { id: "user-b" } };
cacheUtils.writeHouseholdCache("household-1", userAEnvelope, "user-a");
cacheUtils.writeHouseholdCache("household-1", userBEnvelope, "user-b");
assert.deepEqual(JSON.parse(JSON.stringify(cacheUtils.readHouseholdCache("household-1", "user-a")?.envelope)), userAEnvelope, "the same household cache must remain isolated for user-a");
assert.deepEqual(JSON.parse(JSON.stringify(cacheUtils.readHouseholdCache("household-1", "user-b")?.envelope)), userBEnvelope, "the same household cache must remain isolated for user-b");
cacheUtils.writeHouseholdCache("household-1", { stateVersion: "legacy", user: { id: "user-a" } });
assert.equal(cacheUtils.readHouseholdCache("household-1", "user-c"), null, "an unscoped legacy cache must not authorize another user");

function loadBootstrapWith({ error, pointer, activeUserId, cached }) {
  const cacheModule = { exports: {} };
  const scopedCache = cached || { envelope: { ...enabled, user: { id: activeUserId, profileStatus: "complete" } } };
  vm.runInNewContext(readFileSync(new URL("../miniprogram/utils/bootstrap.js", import.meta.url), "utf8"), {
    module: cacheModule,
    exports: cacheModule.exports,
    getApp: () => ({ globalData: { humiSession: { user: { id: activeUserId } } } }),
    wx: { getStorageSync: (key) => key === `humi:bootstrap:last-household:v1:${activeUserId}` && pointer?.userId === activeUserId ? pointer.householdId : null, setStorageSync: () => {} },
    require: (specifier) => {
      if (specifier === "./cache") return { readHouseholdCache: () => scopedCache, writeHouseholdCache: () => {} };
      if (specifier === "./request") return { requestHumi: async () => { throw error; } };
      throw new Error(`Unexpected bootstrap cache dependency: ${specifier}`);
    }
  });
  return cacheModule.exports;
}
const cacheModule = loadBootstrapWith({
  error: { status: 0, retryable: true, code: "network_error" },
  pointer: { householdId: "household-1", userId: "user-1" },
  activeUserId: "user-1"
});
assert.deepEqual(
  JSON.parse(JSON.stringify(await cacheModule.loadBootstrap({ allowCache: true }))),
  { ...enabled, user: { id: "user-1", profileStatus: "complete" }, cacheState: "cached" },
  "an offline bootstrap request must use only the versioned household read cache",
);
const authError = { status: 401, retryable: false, code: "invalid_session" };
await assert.rejects(
  loadBootstrapWith({ error: authError, pointer: { householdId: "household-1", userId: "user-1" }, activeUserId: "user-1" }).loadBootstrap({ allowCache: true }),
  (error) => error === authError,
  "401 responses must never fall back to a cached household envelope",
);
await assert.rejects(
  loadBootstrapWith({ error: { status: 0, retryable: true, code: "network_error" }, pointer: { householdId: "household-1", userId: "user-a" }, activeUserId: "user-b" }).loadBootstrap({ allowCache: true }),
  (error) => error.code === "network_error",
  "a new session user must not read another user's household cache",
);
await assert.rejects(
  loadBootstrapWith({
    error: { status: 0, retryable: true, code: "network_error" },
    pointer: { householdId: "household-1", userId: "user-a" },
    activeUserId: "user-a",
    cached: { envelope: userBEnvelope }
  }).loadBootstrap({ allowCache: true }),
  (error) => error.code === "network_error",
  "a scoped cache with a mismatched envelope user must not be treated as authoritative",
);
const writeModule = { exports: {} };
const cacheWrites = [];
vm.runInNewContext(readFileSync(new URL("../miniprogram/utils/bootstrap.js", import.meta.url), "utf8"), {
  module: writeModule,
  exports: writeModule.exports,
  wx: { setStorageSync: (key, value) => cacheWrites.push([key, value]) },
  require: (specifier) => {
    if (specifier === "./cache") return { readHouseholdCache: () => null, writeHouseholdCache: () => {} };
    if (specifier === "./request") return { requestHumi: async () => ({ ...enabled, user: { id: "user-1", profileStatus: "complete" }, activeHousehold: { id: "household-1" } }) };
    throw new Error(`Unexpected bootstrap write dependency: ${specifier}`);
  }
});
await writeModule.exports.loadBootstrap();
assert.deepEqual(
  JSON.parse(JSON.stringify(cacheWrites)),
  [["humi:bootstrap:last-household:v1:user-1", "household-1"]],
  "the last-household cache pointer must be namespaced to the current bootstrap user",
);

const guardSource = readFileSync(new URL("../miniprogram/utils/native-shell-guard.js", import.meta.url), "utf8");
function runGuard({ bootstrap, candidate }) {
  const module = { exports: {} };
  const guardRoutes = [];
  vm.runInNewContext(guardSource, {
    module,
    exports: module.exports,
    getApp: () => ({ globalData: { nativeShellCandidate: candidate } }),
    wx: { reLaunch: ({ url }) => guardRoutes.push(url) },
    require: (specifier) => {
      if (specifier === "./bootstrap") return { resolveStartupRoute };
      if (specifier === "./store") return { appStore: { getState: () => ({ bootstrap }) } };
      throw new Error(`Unexpected guard dependency: ${specifier}`);
    }
  });
  return { allowed: module.exports.guardNativeTab(), guardRoutes };
}
assert.deepEqual(runGuard({ bootstrap: null, candidate: true }), { allowed: false, guardRoutes: ["/pages/boot/index"] }, "an unknown direct tab entry must return to boot");
assert.deepEqual(runGuard({ bootstrap: disabled, candidate: true }), { allowed: false, guardRoutes: ["/pages/legacy/index"] }, "a server-disabled direct tab entry must return to legacy");
assert.deepEqual(runGuard({ bootstrap: enabled, candidate: false }), { allowed: false, guardRoutes: ["/pages/legacy/index"] }, "a package-disabled direct tab entry must return to legacy");
assert.deepEqual(runGuard({ bootstrap: enabled, candidate: true }), { allowed: true, guardRoutes: [] }, "an enabled envelope may enter any core tab");
for (const tabPath of tabPaths) {
  const pageSource = readFileSync(new URL(`../miniprogram/${tabPath}.js`, import.meta.url), "utf8");
  let definition;
  let guardCalls = 0;
  vm.runInNewContext(pageSource, {
    Page: (page) => { definition = page; },
    require: (specifier) => {
      if (specifier === "../../utils/native-shell-guard") return { guardNativeTab: () => { guardCalls += 1; return false; } };
      if (specifier === "../../utils/store") return { appStore: { getState: () => ({ bootstrap: null }) } };
      throw new Error(`Unexpected tab dependency: ${specifier}`);
    }
  });
  const page = { ...definition, setData: () => assert.fail(`${tabPath} must not render before its guard allows entry`) };
  page.onShow();
  assert.equal(guardCalls, 1, `${tabPath} must invoke the shared native-tab guard`);
}

const bootSource = readFileSync(new URL("../miniprogram/pages/boot/index.js", import.meta.url), "utf8");
let legacyBootDefinition;
const legacyBootRoutes = [];
vm.runInNewContext(bootSource, {
  Page: (definition) => { legacyBootDefinition = definition; },
  getApp: () => ({ globalData: { nativeShellCandidate: true } }),
  wx: { switchTab: () => assert.fail("server-disabled boot must not switch to a tab"), reLaunch: ({ url }) => legacyBootRoutes.push(url) },
  require: (specifier) => {
    if (specifier === "../../utils/bootstrap") return { buildLegacyRoute, extractLegacyOptions: (options) => options, getHouseholdId: () => "", loadBootstrap: async () => disabled, resolveKnownShareRoute, resolveStartupRoute };
    if (specifier === "../../utils/store") return { appStore: { setState: () => {} } };
    if (specifier === "../../utils/telemetry") return { startSpan: () => ({ end: () => {} }) };
    throw new Error(`Unexpected legacy boot dependency: ${specifier}`);
  }
});
const legacyBootPage = { ...legacyBootDefinition, data: structuredClone(legacyBootDefinition.data), setData(patch) { this.data = { ...this.data, ...patch }; } };
await legacyBootPage.onLoad({ view: "grocery", shareSource: "grocery", humiResume: "1", token: validToken, freeText: "nope" });
assert.deepEqual(legacyBootRoutes, ["/pages/legacy/index?view=grocery&shareSource=grocery&humiResume=1"], "boot must preserve only safe tokenless compatibility parameters when it rolls back");
let retryBootDefinition;
const retryBootRoutes = [];
let retryBootstrapCalls = 0;
vm.runInNewContext(bootSource, {
  Page: (definition) => { retryBootDefinition = definition; },
  getApp: () => ({ globalData: { nativeShellCandidate: true } }),
  wx: { switchTab: () => assert.fail("retry fixture must roll back to legacy"), reLaunch: ({ url }) => retryBootRoutes.push(url) },
  require: (specifier) => {
    if (specifier === "../../utils/bootstrap") return {
      buildLegacyRoute,
      extractLegacyOptions: (options) => options,
      getHouseholdId: () => "",
      loadBootstrap: async () => {
        retryBootstrapCalls += 1;
        if (retryBootstrapCalls === 1) throw { code: "network_error" };
        return disabled;
      },
      resolveKnownShareRoute,
      resolveStartupRoute
    };
    if (specifier === "../../utils/store") return { appStore: { setState: () => {} } };
    if (specifier === "../../utils/telemetry") return { startSpan: () => ({ end: () => {} }) };
    throw new Error(`Unexpected retry boot dependency: ${specifier}`);
  }
});
const retryBootPage = { ...retryBootDefinition, data: structuredClone(retryBootDefinition.data), setData(patch) { this.data = { ...this.data, ...patch }; } };
const retryOptions = { view: "today", shareSource: "today_menu", humiLogout: "1", humiExpired: "1", humiResume: "1", token: validToken, arbitrary: "drop" };
await retryBootPage.onLoad(retryOptions);
assert.equal(retryBootPage.data.state, "error", "a bootstrap failure must render the boot error state");
await retryBootPage.retry();
assert.deepEqual(retryBootRoutes, ["/pages/legacy/index?view=today&shareSource=today_menu&humiLogout=1&humiExpired=1&humiResume=1"], "retry must retain only the launch compatibility parameters when it resolves to legacy");
retryBootRoutes.length = 0;
retryBootPage.enterLegacy();
assert.deepEqual(retryBootRoutes, ["/pages/legacy/index?view=today&shareSource=today_menu&humiLogout=1&humiExpired=1&humiResume=1"], "enterLegacy must retain the first launch compatibility parameters");
let bootDefinition;
const routes = [];
const spanEvents = [];
const storeUpdates = [];
vm.runInNewContext(bootSource, {
  Page: (definition) => { bootDefinition = definition; },
  getApp: () => ({ globalData: { nativeShellCandidate: true } }),
  wx: {
    switchTab: ({ url }) => routes.push(["switchTab", url]),
    reLaunch: ({ url }) => routes.push(["reLaunch", url])
  },
  require: (specifier) => {
    if (specifier === "../../utils/bootstrap") return {
      buildLegacyRoute,
      extractLegacyOptions: (options) => options,
      getHouseholdId: () => "",
      loadBootstrap: async () => enabled,
      resolveKnownShareRoute,
      resolveStartupRoute
    };
    if (specifier === "../../utils/store") return { appStore: { setState: (patch) => storeUpdates.push(patch) } };
    if (specifier === "../../utils/telemetry") return { startSpan: () => ({ end: (result, fields) => spanEvents.push({ result, fields }) }) };
    throw new Error(`Unexpected boot dependency: ${specifier}`);
  }
});
assert.ok(bootDefinition, "boot page definition must load");
const bootPage = {
  ...bootDefinition,
  data: structuredClone(bootDefinition.data),
  setData(patch) { this.data = { ...this.data, ...patch }; }
};
await bootPage.onLoad({});
assert.deepEqual(routes, [["switchTab", "/pages/tonight/index"]], "native core entry must use switchTab");
assert.deepEqual(JSON.parse(JSON.stringify(storeUpdates)), [{ bootstrap: enabled, currentHouseholdId: "" }]);
assert.deepEqual(JSON.parse(JSON.stringify(spanEvents)), [{ result: "completed", fields: { page: "boot" } }]);

routes.length = 0;
await bootPage.onLoad({ invite: validToken, shareSource: "ignored" });
assert.deepEqual(routes, [["reLaunch", `/pages/share/index?type=invite&token=${validToken}&shareSource=invite`]], "a recognized public token must bypass core-shell bootstrap routing");

const shimSource = readFileSync(new URL("../miniprogram/pages/index/index.js", import.meta.url), "utf8");
let shimDefinition;
const shimRoutes = [];
const shimModule = { exports: {} };
vm.runInNewContext(shimSource, {
  Page: (definition) => { shimDefinition = definition; },
  module: shimModule,
  exports: shimModule.exports,
  wx: { reLaunch: ({ url }) => shimRoutes.push(url) },
  require: (specifier) => {
    assert.equal(specifier, "../../utils/bootstrap");
    return { buildLegacyRoute, resolveKnownShareRoute };
  }
});
shimDefinition.onLoad({ menuShare: validToken, shareSource: "today_menu" });
shimDefinition.onLoad({ view: "today", shareSource: "today_menu" });
assert.deepEqual(shimRoutes, [
  `/pages/share/index?type=today_menu&token=${validToken}&shareSource=today_menu`,
  "/pages/legacy/index?view=today&shareSource=today_menu"
], "the historical index shim must preserve token compatibility and send unknown deep links to legacy");
assert.doesNotMatch(shimSource, /web-view/, "the historical index shim must never mount a WebView");

const sharePageSource = readFileSync(new URL("../miniprogram/pages/share/index.js", import.meta.url), "utf8");
let sharePageDefinition;
const shareMenuCalls = [];
const sharePageModule = { exports: {} };
vm.runInNewContext(sharePageSource, {
  Page: (definition) => { sharePageDefinition = definition; },
  module: sharePageModule,
  exports: sharePageModule.exports,
  wx: {
    hideShareMenu: () => shareMenuCalls.push("hide"),
    showShareMenu: () => shareMenuCalls.push("show")
  },
  require: (specifier) => {
    assert.equal(specifier, "../../utils/bootstrap");
    return { validateShareLandingOptions: bootstrapModule.exports.validateShareLandingOptions };
  }
});
function createSharePage() {
  return {
    ...sharePageDefinition,
    data: structuredClone(sharePageDefinition.data),
    setData(patch) { this.data = { ...this.data, ...patch }; }
  };
}
for (const options of [
  { type: "admin", token: validToken },
  { type: "crave", token: "short" },
  { type: { value: "crave" }, token: validToken },
  { type: "crave,invite", token: validToken },
  { type: "invite", token: { value: validToken } }
]) {
  const page = createSharePage();
  page.onLoad(options);
  assert.equal(page.data.canShare, false, "invalid direct share entries must never enable the native share menu");
  assert.equal(page.onShareAppMessage(), null, "invalid direct share entries must not emit a share payload");
}
const validSharePage = createSharePage();
validSharePage.onLoad({ type: " invite ", token: ` ${validToken} ` });
assert.equal(validSharePage.data.canShare, true, "a valid direct share landing must remain available");
assert.equal(validSharePage.data.token, validToken);
assert.equal(validSharePage.data.type, "invite");
assert.equal(validSharePage.onShareAppMessage().path, `/pages/boot/index?invite=${validToken}`);
assert(shareMenuCalls.includes("hide") && shareMenuCalls.includes("show"), "invalid share landings must hide and valid landings may show the share menu");

for (const fixture of [
  ...directPreviewFixtures.map((item) => ({ key: `direct-preview:${item.key}`, ...item.query, expectedPath: item.expectedPath })),
  ...Object.entries(shareCardGuideFixtures).map(([key, item]) => ({ key: `workbench:${key}`, type: item.type, token: item.token, expectedPath: item.expectedPath })),
]) {
  const landing = bootstrapModule.exports.validateShareLandingOptions(fixture);
  assert.deepEqual(
    JSON.parse(JSON.stringify(landing)),
    { type: fixture.type, token: fixture.token },
    `${fixture.key} fixture must pass the strict native share landing validator`,
  );
  assert.equal(
    sharePageModule.exports.buildShareData(landing).path,
    fixture.expectedPath,
    `${fixture.key} fixture must keep its buildShareData landing path canonical`,
  );
}

console.log("Native shell routing checks passed.");

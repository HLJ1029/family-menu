import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

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
for (const tabPath of tabPaths) {
  const pagePath = `../miniprogram/${tabPath}.js`;
  assert(existsSync(new URL(pagePath, import.meta.url)), `${tabPath} must have a native page controller`);
  const source = readFileSync(new URL(pagePath, import.meta.url), "utf8");
  const config = readFileSync(new URL(`../miniprogram/${tabPath}.json`, import.meta.url), "utf8");
  assert.match(config, /components\/page-state\/index/, `${tabPath} must use the shared page-state component`);
  assert.match(source, /status:/, `${tabPath} must expose its page state`);
}
assert(existsSync(new URL("../miniprogram/components/page-state/index.js", import.meta.url)), "the shared page-state component must exist");

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
const { resolveKnownShareRoute, resolveStartupRoute } = bootstrapModule.exports;
const enabled = { capabilities: { nativeShellEnabled: true }, user: { profileStatus: "complete" } };
const disabled = { capabilities: { nativeShellEnabled: false }, user: { profileStatus: "complete" } };
const incomplete = { capabilities: { nativeShellEnabled: true }, user: { profileStatus: "incomplete" } };
const assertRoute = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

assertRoute(resolveStartupRoute({ candidate: false, envelope: enabled }), { route: "/pages/legacy/index", reason: "package_disabled" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: disabled }), { route: "/pages/legacy/index", reason: "server_disabled" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: incomplete }), { route: "/pages/identity/index", reason: "identity_incomplete" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: enabled }), { route: "/pages/tonight/index", reason: "native_enabled" });
assertRoute(resolveStartupRoute({ candidate: true, envelope: { ...enabled, cacheState: "cached" } }), { route: "/pages/tonight/index", reason: "native_enabled" });

assert.equal(resolveKnownShareRoute({ crave: "crave-token", shareSource: "crave" }), "/pages/share/index?type=crave&token=crave-token&shareSource=crave");
assert.equal(resolveKnownShareRoute({ grocery: "legacy-grocery-token", shareSource: "grocery" }), "/pages/share/index?type=grocery&token=legacy-grocery-token&shareSource=grocery");
assert.equal(resolveKnownShareRoute({ groceryShare: "grocery-token", shareSource: "grocery" }), "/pages/share/index?type=grocery&token=grocery-token&shareSource=grocery");
assert.equal(resolveKnownShareRoute({ menuShare: "menu-token", shareSource: "today_menu" }), "/pages/share/index?type=today_menu&token=menu-token&shareSource=today_menu");
assert.equal(resolveKnownShareRoute({ wishShare: "wish-token", shareSource: "wish" }), "/pages/share/index?type=wish&token=wish-token&shareSource=wish");
assert.equal(resolveKnownShareRoute({ invite: "invite-token", shareSource: "invite" }), "/pages/share/index?type=invite&token=invite-token&shareSource=invite");
assert.equal(resolveKnownShareRoute({ mealTask: "meal-token", shareSource: "meal_task" }), "/pages/share/index?type=meal_task&token=meal-token&shareSource=meal_task");
assert.equal(resolveKnownShareRoute({ view: "today" }), null, "non-token legacy deep links must remain on the H5 compatibility route");

const cacheModule = { exports: {} };
vm.runInNewContext(readFileSync(new URL("../miniprogram/utils/bootstrap.js", import.meta.url), "utf8"), {
  module: cacheModule,
  exports: cacheModule.exports,
  wx: { getStorageSync: () => "household-1", setStorageSync: () => {} },
  require: (specifier) => {
    if (specifier === "./cache") return { readHouseholdCache: () => ({ envelope: enabled }), writeHouseholdCache: () => {} };
    if (specifier === "./request") return { requestHumi: async () => { throw { code: "network_error" }; } };
    throw new Error(`Unexpected bootstrap cache dependency: ${specifier}`);
  }
});
assert.deepEqual(
  JSON.parse(JSON.stringify(await cacheModule.exports.loadBootstrap({ allowCache: true }))),
  { ...enabled, cacheState: "cached" },
  "an offline bootstrap request must use only the versioned household read cache",
);

const bootSource = readFileSync(new URL("../miniprogram/pages/boot/index.js", import.meta.url), "utf8");
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
await bootPage.onLoad({ invite: "public-invite", shareSource: "invite" });
assert.deepEqual(routes, [["reLaunch", "/pages/share/index?type=invite&token=public-invite&shareSource=invite"]], "a recognized public token must bypass core-shell bootstrap routing");

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
    return { resolveKnownShareRoute };
  }
});
shimDefinition.onLoad({ menuShare: "historical-menu", shareSource: "today_menu" });
shimDefinition.onLoad({ view: "today", shareSource: "today_menu" });
assert.deepEqual(shimRoutes, [
  "/pages/share/index?type=today_menu&token=historical-menu&shareSource=today_menu",
  "/pages/legacy/index?view=today&shareSource=today_menu"
], "the historical index shim must preserve token compatibility and send unknown deep links to legacy");
assert.doesNotMatch(shimSource, /web-view/, "the historical index shim must never mount a WebView");

console.log("Native shell routing checks passed.");

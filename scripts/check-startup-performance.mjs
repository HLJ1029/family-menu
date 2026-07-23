import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const checks = [];

async function check(name, run) {
  try {
    const details = await run();
    checks.push({ name, ok: true, ...(details || {}) });
  } catch (error) {
    checks.push({ name, ok: false, error: error.message });
    failures.push(`${name}: ${error.message}`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function collectInitialManifestKeys(manifest, entryKey) {
  const visited = new Set();
  function visit(key) {
    if (!key || visited.has(key)) return;
    const record = manifest[key];
    assert.ok(record, `manifest import ${key} must exist`);
    visited.add(key);
    for (const imported of record.imports || []) visit(imported);
  }
  visit(entryKey);
  return visited;
}

function findManifestRecord(manifest, sourceSuffix) {
  const match = Object.entries(manifest).find(([key, value]) => (
    key.endsWith(sourceSuffix) || value.src?.endsWith(sourceSuffix)
  ));
  assert.ok(match, `${sourceSuffix} must have a build manifest record`);
  return match;
}

function loadCommonJs(relativePath, { require: requireOverride, globals = {} } = {}) {
  const filename = path.join(root, relativePath);
  const record = { exports: {} };
  vm.runInNewContext(read(relativePath), {
    module: record,
    exports: record.exports,
    require: requireOverride || (() => {
      throw new Error(`Unexpected dependency while loading ${relativePath}`);
    }),
    console,
    Date,
    Promise,
    JSON,
    Math,
    Set,
    Map,
    ...globals,
  }, { filename });
  return record.exports;
}

await check("H5 initial static JS graph stays within 350 KiB gzip", () => {
  const manifestPath = path.join(root, "dist/.vite/manifest.json");
  assert.ok(fs.existsSync(manifestPath), "Vite build manifest is required for truthful initial-graph accounting");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = Object.entries(manifest).find(([, value]) => value.isEntry);
  assert.ok(entry, "build manifest must identify the H5 entry");
  const initialKeys = collectInitialManifestKeys(manifest, entry[0]);
  const files = [...initialKeys]
    .map((key) => manifest[key].file)
    .filter((file) => file.endsWith(".js"));
  const measurements = files.map((file) => {
    const bytes = fs.readFileSync(path.join(root, "dist", file));
    return { file, gzipBytes: zlib.gzipSync(bytes, { level: 9 }).byteLength };
  });
  const gzipBytes = measurements.reduce((sum, item) => sum + item.gzipBytes, 0);
  assert.ok(gzipBytes <= 350 * 1024, `initial graph is ${gzipBytes} bytes gzip`);
  return { gzipBytes, files: measurements };
});

await check("low-frequency H5 routes are dynamic and outside the initial graph", () => {
  const manifestPath = path.join(root, "dist/.vite/manifest.json");
  assert.ok(fs.existsSync(manifestPath), "Vite build manifest is required to prove route isolation");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = Object.entries(manifest).find(([, value]) => value.isEntry);
  assert.ok(entry, "build manifest must identify the H5 entry");
  const initialKeys = collectInitialManifestKeys(manifest, entry[0]);
  const routes = [
    "src/components/StatsPage.jsx",
    "src/components/RecipeDetailDrawer.jsx",
    "src/components/FamilyActivityPage.jsx",
    "src/components/HouseholdSettingsPage.jsx",
  ];
  const chunks = routes.map((source) => {
    const [key, record] = findManifestRecord(manifest, source);
    assert.equal(record.isDynamicEntry, true, `${source} must be emitted as a dynamic entry`);
    assert.equal(initialKeys.has(key), false, `${source} must not be in the initial static graph`);
    return { source, file: record.file };
  });
  return { chunks };
});

await check("runtime WebP thumbnails stay within 80 KiB", () => {
  const directory = path.join(root, "public/assets/dishes/thumbs");
  const runtimeFiles = fs.readdirSync(directory).filter((name) => name.endsWith(".webp")).sort();
  assert.ok(runtimeFiles.length > 0, "runtime WebP thumbnails must exist");
  const oversized = runtimeFiles
    .map((name) => ({ file: name, bytes: fs.statSync(path.join(directory, name)).size }))
    .filter((item) => item.bytes > 80 * 1024);
  assert.deepEqual(oversized, []);
  const legacyOversized = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".jpg"))
    .map((name) => ({ file: name, bytes: fs.statSync(path.join(directory, name)).size }))
    .filter((item) => item.bytes > 80 * 1024);
  if (legacyOversized.length) {
    warnings.push({
      name: "legacy JPEG thumbnails are not runtime candidates",
      files: legacyOversized,
    });
  }
  const heroOversizedCount = fs.readdirSync(path.join(root, "public/assets/dishes/webp"))
    .filter((name) => name.endsWith(".webp"))
    .filter((name) => fs.statSync(path.join(root, "public/assets/dishes/webp", name)).size > 80 * 1024)
    .length;
  if (heroOversizedCount) {
    warnings.push({
      name: "hero WebP images are outside the thumbnail budget",
      count: heroOversizedCount,
    });
  }
  return { count: runtimeFiles.length };
});

await check("cached boot summary paints before the fresh bootstrap settles", async () => {
  let resolveRequest;
  const network = new Promise((resolve) => {
    resolveRequest = resolve;
  });
  const cachedEnvelope = {
    schemaVersion: 1,
    stateVersion: "state-cached",
    activeHouseholdId: "household-1",
    activeHousehold: { id: "household-1", name: "我们家" },
    user: { id: "user-1" },
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
  };
  const bootstrap = loadCommonJs("miniprogram/utils/bootstrap.js", {
    require: (specifier) => {
      if (specifier === "./request") return { requestHumi: () => network };
      if (specifier === "./cache") {
        return {
          householdCacheKey: () => "cache-key",
          readHouseholdCache: () => ({ envelope: cachedEnvelope }),
          writeHouseholdCache: () => {},
        };
      }
      throw new Error(`Unexpected bootstrap dependency: ${specifier}`);
    },
    globals: {
      wx: {
        getStorageSync: () => "household-1",
        setStorageSync: () => {},
        removeStorageSync: () => {},
      },
      getApp: () => ({ globalData: { humiSession: { user: { id: "user-1" } } } }),
    },
  });
  assert.equal(typeof bootstrap.readCachedBootstrapSummary, "function", "bootstrap must expose a safe synchronous cache summary");
  const summary = bootstrap.readCachedBootstrapSummary();
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    cacheState: "cached",
    hasHousehold: true,
  });

  const pendingFresh = bootstrap.loadBootstrap({ allowCache: false });
  const marker = await Promise.race([
    pendingFresh.then(() => "network"),
    Promise.resolve("cached_paint"),
  ]);
  assert.equal(marker, "cached_paint", "cached summary must be available without waiting for network");
  resolveRequest({
    schemaVersion: 1,
    stateVersion: "state-fresh",
    activeHouseholdId: "household-1",
    user: { id: "user-1" },
    capabilities: { nativeShellEnabled: false, mealExecutionEnabled: false },
  });
  const fresh = await pendingFresh;
  assert.equal(fresh.stateVersion, "state-fresh");
  assert.equal(fresh.capabilities.nativeShellEnabled, false, "fresh kill switch must remain authoritative");
});

await check("native performance events are allowlisted, versioned, and privacy-safe", () => {
  const telemetry = loadCommonJs("miniprogram/utils/telemetry.js", {
    require: (specifier) => {
      if (specifier === "./config") return { HUMI_PACKAGE_VERSION: "1.1.72" };
      throw new Error(`Unexpected telemetry dependency: ${specifier}`);
    },
  });
  const spans = [
    "native_boot",
    "native_login",
    "bootstrap",
    "recommendation",
    "meal_run_restore",
    "thumbnail_first_visible",
  ];
  for (const name of spans) {
    const event = telemetry.startSpan(name, {
      page: name === "native_login" ? "identity" : name === "thumbnail_first_visible" ? "discover" : "boot",
      src: "https://example.test/private?token=secret",
      nickname: "不应上传",
    }).end("completed", { durationMs: 12 });
    assert.ok(event, `${name} completed event must be allowlisted`);
    assert.match(event.fields.packageVersion, /^\d+\.\d+\.\d+$/);
    assert.equal("src" in event.fields, false);
    assert.equal("nickname" in event.fields, false);
  }
  const names = JSON.parse(JSON.stringify(telemetry.readPendingTelemetry().map((event) => event.name)));
  assert.deepEqual(names, spans.map((name) => `${name}_completed`));
});

await check("runtime thumbnail first-visible timing emits once without image source", () => {
  let componentDefinition;
  const events = [];
  loadCommonJs("miniprogram/components/image-with-fallback/index.js", {
    require: (specifier) => {
      if (specifier === "../../utils/telemetry") {
        return {
          startSpan: (name, fields) => ({
            end: (_result, finishFields) => events.push({ name, fields: { ...fields, ...finishFields } }),
          }),
        };
      }
      throw new Error(`Unexpected image component dependency: ${specifier}`);
    },
    globals: {
      Component: (definition) => {
        componentDefinition = definition;
      },
    },
  });
  assert.ok(componentDefinition, "image component must load");
  const component = {
    properties: { src: "https://example.test/dish.webp?token=secret" },
    data: { ...componentDefinition.data },
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
    ...componentDefinition.methods,
  };
  componentDefinition.lifetimes.attached.call(component);
  component.onError();
  component.retry();
  component.onLoad();
  component.onLoad();
  assert.equal(events.length, 1, "first visible thumbnail must emit once after the first successful load");
  assert.equal(events[0].name, "thumbnail_first_visible");
  assert.equal(events[0].fields.page, "discover", "the only runtime thumbnail consumer is the discover page");
  assert.equal(JSON.stringify(events[0]).includes("example.test"), false, "telemetry must not include the image URL");
  assert.equal(JSON.stringify(events[0]).includes("secret"), false, "telemetry must not include URL tickets");
});

await check("performance spans wrap the actual native business calls", () => {
  assert.match(read("miniprogram/pages/identity/index.js"), /startSpan\("native_login"/);
  assert.match(read("miniprogram/pages/tonight/index.js"), /startSpan\("recommendation"/);
  assert.match(read("miniprogram/packageCooking/pages/cooking/index.js"), /startSpan\("meal_run_restore"/);
});

await check("only the six approved native duration spans are used", () => {
  const approved = new Set([
    "native_boot",
    "native_login",
    "bootstrap",
    "recommendation",
    "meal_run_restore",
    "thumbnail_first_visible",
  ]);
  const files = [
    "miniprogram/pages/boot/index.js",
    "miniprogram/pages/identity/index.js",
    "miniprogram/pages/tonight/index.js",
    "miniprogram/packageCooking/pages/cooking/index.js",
    "miniprogram/components/image-with-fallback/index.js",
  ];
  const used = files.flatMap((file) => [...read(file).matchAll(/startSpan\("([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual(used.filter((name) => !approved.has(name)), []);
});

await check("foreground queue recovery does not masquerade as native boot", () => {
  const appSource = read("miniprogram/app.js");
  const onShowBody = appSource.slice(appSource.indexOf("onShow()"), appSource.indexOf("setHumiSession("));
  assert.doesNotMatch(onShowBody, /native_boot_(?:completed|failed)/);
});

await check("H5 lazy routes have an accessible recoverable fallback", () => {
  const shellSource = read("src/components/AppShell.jsx");
  assert.match(shellSource, /role=["']alert["']/);
  assert.match(shellSource, /重新加载|重试/);
  assert.match(shellSource, /componentDidCatch|getDerivedStateFromError/);
});

await check("identity exchange, content parsing, and share landings stay in the H5 entry", () => {
  const mainSource = read("src/main.jsx");
  for (const requiredStaticImport of [
    "AuthLanding",
    "CraveLanding",
    "GroceryClaimLanding",
    "InviteLanding",
    "MealTaskLanding",
    "MenuShareLanding",
    "WishLanding",
    "parseH5ContentEntry",
    "exchangeHumiTicket",
  ]) {
    assert.match(mainSource, new RegExp(`import[\\s\\S]{0,500}\\b${requiredStaticImport}\\b`), `${requiredStaticImport} must remain statically reachable from main.jsx`);
  }
  const lazySource = read("src/routes/lazyRoutes.js");
  assert.doesNotMatch(lazySource, /AuthLanding|ContentEntry|Landing|humiIdentity/);
});

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  checks,
  warnings,
  externalEvidence: {
    required: true,
    status: "blocked",
    reason: "devtools_login_required",
    budgets: {
      cachedFirstPaintMs: 400,
      warmBootstrapMs: 1000,
      coldAuthenticatedBootstrapMs: 2500,
    },
  },
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  throw new AggregateError(failures.map((message) => new Error(message)), `${failures.length} startup performance checks failed`);
}

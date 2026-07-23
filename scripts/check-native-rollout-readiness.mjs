import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { checkSupabaseRetirement } from "./check-supabase-retirement.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MINIPROGRAM_ROOT = resolve(ROOT, "miniprogram");
const MAIN_PACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const SUBPACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const TOTAL_PACKAGE_LIMIT_BYTES = 20 * 1024 * 1024;
const EXPECTED_API_ORIGIN = "https://api.humi-home.com";
const EXPECTED_WEB_ORIGIN = "https://www.humi-home.com";
const REQUIRED_SCRIPTS = Object.freeze([
  "validate:data",
  "validate:identity",
  "validate:household",
  "validate:collaboration-identity",
  "validate:api",
  "validate:meal-execution",
  "validate:meal-run-client",
  "validate:meal-execution-api",
  "validate:meal-execution-ui",
  "validate:recommendation",
  "validate:native-bootstrap-api",
  "validate:native-session",
  "validate:native-offline",
  "validate:native-shell-routing",
  "validate:native-recommendation",
  "validate:native-tonight",
  "validate:native-cooking",
  "validate:native-primary-tabs",
  "validate:native-sharing",
  "validate:native-observability",
  "validate:share-bridge",
  "validate:miniprogram-entry",
  "validate:h5-entry",
  "validate:miniprogram-poster",
  "validate:miniprogram-meal-reminder",
  "validate:startup-performance",
  "smoke:native-shell-ui",
  "release:product:review",
  "release:product:smoke",
  "release:collaboration:smoke",
  "validate:supabase-retirement",
  "build",
  "release:native-shell:check",
]);
const EXTERNAL_ACTIONS = Object.freeze([
  "production_api_deployed",
  "h5_deployed",
  "miniprogram_uploaded",
  "wechat_review_submitted",
  "wechat_released",
  "native_allowlist_enabled",
]);
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".wxml",
  ".wxss",
  ".css",
  ".html",
]);
const AD_PATTERNS = [
  /<\s*ad(?:-custom)?(?:\s|\/|>)/i,
  /\b(?:adUnitId|adunit|unit-id)\b/i,
  /["']ad-custom["']/i,
  /\bwx\.create(?:Banner|Interstitial|RewardedVideo|Custom)Ad\b/i,
  /\b(?:Banner|Interstitial|RewardedVideo|Custom)Ad\b/,
  /plugin:\/\/[^"'/\s]*ad[^"'\/\s]*/i,
];
const SUPABASE_PATTERNS = [
  /@supabase\//i,
  /supabase\.co/i,
  /\b(?:VITE_)?SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY)\b/i,
  /(?:from\s+|require\s*\()\s*["'][^"']*supabase/i,
];
const CREDENTIAL_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:WECHAT_APP_SECRET|HUMI_SESSION_SECRET|DEEPSEEK_API_KEY|ARK_API_KEY)\s*[:=]\s*["'][^"'$\s]{12,}["']/,
];

const failures = [];
const checks = [];

await check("repository rollout defaults remain off", async () => {
  const env = parseEnv(await text(".env.example"));
  assert.equal(env.HUMI_NATIVE_SHELL_ENABLED, "0", "repository default must remain off");
  assert.equal(env.HUMI_NATIVE_SHELL_HOUSEHOLDS, "", "repository allowlist must remain empty");
  assert.equal(env.HUMI_MEAL_EXECUTION_ENABLED, "0", "meal execution default must remain off");
  assert.equal(env.HUMI_MEAL_EXECUTION_HOUSEHOLDS, "", "meal execution allowlist must remain empty");
});

await check("legacy H5 compatibility page remains registered", async () => {
  const appJson = JSON.parse(await text("miniprogram/app.json"));
  assert(appJson.pages.includes("pages/legacy/index"), "pages/legacy/index must stay registered");
  assert(
    !appJson.tabBar?.list?.some((item) => item.pagePath === "pages/legacy/index"),
    "legacy must not become a native tab",
  );
  const legacyWxml = await text("miniprogram/pages/legacy/index.wxml");
  const legacyJs = await text("miniprogram/pages/legacy/index.js");
  assert.match(legacyWxml, /<web-view\b/, "legacy page must retain the H5 web-view");
  assert.match(legacyJs, /\bloginWithWechat\s*\(/, "legacy page must retain H5 login handoff");
  assert.match(legacyJs, /\bonShareAppMessage\s*\(/, "legacy page must retain share behavior");
});

await check("required local candidate scripts exist", async () => {
  const packageJson = JSON.parse(await text("package.json"));
  const missing = REQUIRED_SCRIPTS.filter((name) => typeof packageJson.scripts?.[name] !== "string");
  assert.deepEqual(missing, [], `missing package scripts: ${missing.join(", ")}`);
  assert.equal(
    packageJson.scripts["release:native-shell:check"],
    "node scripts/check-native-rollout-readiness.mjs",
    "native rollout command must invoke the immutable local checker",
  );
});

await check("mini-program domains and platform configuration are legal", async () => {
  const configSource = await text("miniprogram/utils/config.js");
  const projectJson = JSON.parse(await text("miniprogram/project.config.json"));
  assert.match(
    configSource,
    /HUMI_API_BASE_URL\s*=\s*["']https:\/\/api\.humi-home\.com["']/,
    "native API origin must use the HTTPS Humi API domain",
  );
  assert.match(
    configSource,
    /HUMI_WEB_URL\s*=\s*["']https:\/\/www\.humi-home\.com\//,
    "legacy H5 origin must use the HTTPS Humi web domain",
  );
  assert.equal(projectJson.setting?.urlCheck, true, "candidate must not bypass WeChat domain checks");
  assert.equal(projectJson.appid, "wx4040b89f3b363416", "candidate must target the approved Humi AppID");
  assert.equal(projectJson.libVersion, "3.8.10", "candidate must keep the approved base library");
  const runtimeFiles = await listTextFiles(MINIPROGRAM_ROOT);
  const origins = new Set();
  for (const file of runtimeFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\bhttp:\/\/[A-Za-z0-9.-]+/i, `${relative(ROOT, file)} contains a non-HTTPS origin`);
    for (const match of source.matchAll(/https:\/\/[A-Za-z0-9.-]+/g)) {
      origins.add(match[0]);
    }
  }
  assert.deepEqual(
    [...origins].sort(),
    [EXPECTED_API_ORIGIN, EXPECTED_WEB_ORIGIN],
    `unexpected hard-coded mini-program origins: ${[...origins].sort().join(", ")}`,
  );
});

const packageReport = await calculatePackageSizes();
await check("mini-program packages stay within WeChat size limits", async () => {
  assert(
    packageReport.main.bytes <= MAIN_PACKAGE_LIMIT_BYTES,
    `main package is ${packageReport.main.bytes} bytes`,
  );
  for (const subpackage of packageReport.subpackages) {
    assert(
      subpackage.bytes <= SUBPACKAGE_LIMIT_BYTES,
      `${subpackage.name} is ${subpackage.bytes} bytes`,
    );
  }
  assert(
    packageReport.totalBytes <= TOTAL_PACKAGE_LIMIT_BYTES,
    `total package is ${packageReport.totalBytes} bytes`,
  );
});

await check("candidate runtime contains no ads, Supabase, or credential values", async () => {
  const runtimeRoots = ["api", "miniprogram", "public", "src"];
  const findings = [];
  for (const runtimeRoot of runtimeRoots) {
    const files = await listTextFiles(resolve(ROOT, runtimeRoot), { optional: true });
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const pattern of AD_PATTERNS) {
        if (pattern.test(source)) findings.push(`ad:${relative(ROOT, file)}`);
      }
      for (const pattern of SUPABASE_PATTERNS) {
        if (pattern.test(source)) findings.push(`supabase:${relative(ROOT, file)}`);
      }
      for (const pattern of CREDENTIAL_PATTERNS) {
        if (pattern.test(source)) findings.push(`credential:${relative(ROOT, file)}`);
      }
      if (extname(file) === ".json") {
        const parsed = JSON.parse(source);
        const componentEntries = Object.entries(parsed.usingComponents || {});
        for (const [name, componentPath] of componentEntries) {
          if (/^(?:ad|ad-custom)$/i.test(name) || /(?:^|\/)ad(?:-custom)?(?:\/|$)/i.test(String(componentPath))) {
            findings.push(`ad-component:${relative(ROOT, file)}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...new Set(findings)].sort(), [], `forbidden runtime findings: ${findings.join(", ")}`);
  const env = parseEnv(await text(".env.example"));
  for (const key of ["ARK_API_KEY", "HUMI_SESSION_SECRET", "WECHAT_APP_SECRET", "HUMI_TELEMETRY_HASH_SALT", "DEEPSEEK_API_KEY"]) {
    const value = env[key] || "";
    assert(
      value === "" || /^(?:your_|replace_with_)/.test(value),
      `${key} must remain empty or a documented placeholder`,
    );
  }
  assert.deepEqual(
    await checkSupabaseRetirement(ROOT),
    [],
    "the complete source/dependency/bundle Supabase retirement gate must remain clean",
  );
});

const rollbackReport = await runRollbackDrill();
await check("server-flag rollback returns to H5 without deleting product caches", async () => {
  assert.equal(rollbackReport.enabledRoute, "/pages/tonight/index");
  assert.equal(rollbackReport.disabledRoute, "/pages/legacy/index");
  assert.deepEqual(
    rollbackReport.removedKeys.sort(),
    [
      "humi:bootstrap:last-household:v1:user-rollout",
      "humi:household-cache:v1:user-rollout:household-rollout",
    ],
    "rollback must clear only the bootstrap pointer and its one household read cache",
  );
  assert.equal(rollbackReport.productCachePreserved, true, "rollback must preserve MealRun and product data");
});

await check("repository handoff records preview-only external state", async () => {
  const handoff = await text("docs/humi-1.1-release-operator-handoff.md");
  const tracker = await text("docs/humi-1.1-gray-release-tracker.md");
  const apiContract = await text("docs/humi-api-contract.md");
  assert.match(handoff, /native_shell_candidate:\s*\n\s+status:\s*preview\b/);
  assert.match(handoff, /\n\s+ads:\s*excluded\b/);
  for (const action of EXTERNAL_ACTIONS) {
    assert.match(handoff, new RegExp(`\\n\\s+${action}:\\s*false\\b`));
  }
  assert.match(handoff, /true_device_evidence:\s*0\/36\b/);
  assert.match(handoff, /downloadFile[\s\S]{0,200}(?:missing|未配置|阻塞)/i);
  assert.match(tracker, /原生壳候选：preview/);
  assert.match(tracker, /真机证据：0\/36/);
  assert.match(apiContract, /关闭 `HUMI_NATIVE_SHELL_ENABLED`/);
  assert.match(apiContract, /不删除 MealRun/);
});

const report = {
  contractOk: failures.length === 0,
  status: "preview",
  ads: "excluded",
  checks,
  package: packageReport,
  rollback: rollbackReport,
  externalActions: Object.fromEntries(EXTERNAL_ACTIONS.map((action) => [action, false])),
  platformEvidence: {
    trueDevicePassed: 0,
    trueDeviceRequired: 36,
    complete: false,
    downloadFileDomainVerified: false,
    startupBudgetsVerifiedOnDevice: false,
  },
  blockers: [
    "36-row iOS/Android true-device evidence has not been collected.",
    "api.humi-home.com is not yet verified in the WeChat downloadFile legal-domain list.",
    "native cached/warm/cold startup budgets have not been verified on agreed real devices.",
  ],
  failures,
};

report.packageVersion = extractPackageVersion(await text("miniprogram/utils/config.js"));
report.platformEvidence.wechatDevtoolsAuthenticated = false;
report.platformEvidence.productionLegacyH5SmokeVerified = false;
report.blockers.push(
  "WeChat DevTools automation is not authenticated for candidate device measurements.",
  "The latest production legacy-H5 product smoke timed out and remains an external baseline blocker.",
);

console.log(JSON.stringify(report, null, 2));
if (!report.contractOk) process.exitCode = 1;

async function check(name, operation) {
  try {
    await operation();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false });
    failures.push({ name, message: String(error?.message || error) });
  }
}

async function text(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function extractPackageVersion(source) {
  const match = source.match(/HUMI_PACKAGE_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/);
  assert(match, "HUMI_PACKAGE_VERSION must use semantic x.y.z form");
  return match[1];
}

async function listTextFiles(directory, { optional = false } = {}) {
  const directoryStat = await stat(directory).catch(() => null);
  if (!directoryStat?.isDirectory()) {
    if (optional) return [];
    throw new Error(`missing directory: ${relative(ROOT, directory)}`);
  }
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTextFiles(path));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
  return files.sort();
}

async function calculatePackageSizes() {
  const appJson = JSON.parse(await text("miniprogram/app.json"));
  const subpackageRoots = new Set((appJson.subPackages || []).map((subpackage) => subpackage.root));
  const subpackages = [];
  for (const root of [...subpackageRoots].sort()) {
    subpackages.push({ name: root, bytes: await treeBytes(resolve(MINIPROGRAM_ROOT, root)) });
  }
  const mainBytes = await treeBytes(MINIPROGRAM_ROOT, {
    excludeTopLevel: subpackageRoots,
  });
  return {
    limits: {
      mainBytes: MAIN_PACKAGE_LIMIT_BYTES,
      subpackageBytes: SUBPACKAGE_LIMIT_BYTES,
      totalBytes: TOTAL_PACKAGE_LIMIT_BYTES,
    },
    main: { name: "main", bytes: mainBytes },
    subpackages,
    totalBytes: mainBytes + subpackages.reduce((sum, item) => sum + item.bytes, 0),
  };
}

async function treeBytes(directory, { excludeTopLevel = new Set() } = {}) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludeTopLevel.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) total += await treeBytes(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

async function runRollbackDrill() {
  const bootstrapSource = await text("miniprogram/utils/bootstrap.js");
  const storage = new Map([
    ["humi:bootstrap:last-household:v1:user-rollout", "household-rollout"],
    ["humi:household-cache:v1:user-rollout:household-rollout", { schemaVersion: 1 }],
    ["humi:meal-run:v1:user-rollout", { status: "cooking" }],
  ]);
  const removedKeys = [];
  const bootstrapModule = { exports: {} };
  vm.runInNewContext(bootstrapSource, {
    module: bootstrapModule,
    exports: bootstrapModule.exports,
    require(specifier) {
      if (specifier === "./cache") {
        return {
          householdCacheKey: (householdId, userId) => `humi:household-cache:v1:${userId}:${householdId}`,
          readHouseholdCache: () => null,
          writeHouseholdCache: () => {},
        };
      }
      if (specifier === "./request") return { requestHumi: async () => ({}) };
      throw new Error(`unexpected bootstrap dependency: ${specifier}`);
    },
    wx: {
      getStorageSync: (key) => storage.get(key),
      removeStorageSync: (key) => {
        removedKeys.push(key);
        storage.delete(key);
      },
      setStorageSync: (key, value) => storage.set(key, value),
    },
  });
  const { clearBootstrapCacheForUser, resolveStartupRoute } = bootstrapModule.exports;
  const envelope = {
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
    user: { id: "user-rollout", profileStatus: "complete" },
  };
  const enabledRoute = resolveStartupRoute({ candidate: true, envelope }).route;
  clearBootstrapCacheForUser("user-rollout");
  const disabledRoute = resolveStartupRoute({
    candidate: true,
    envelope: {
      ...envelope,
      capabilities: { ...envelope.capabilities, nativeShellEnabled: false },
    },
  }).route;
  return {
    enabledRoute,
    disabledRoute,
    removedKeys,
    productCachePreserved: storage.has("humi:meal-run:v1:user-rollout"),
  };
}

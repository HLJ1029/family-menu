import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSupabaseRetirement } from "./check-supabase-retirement.mjs";
import { runNativeRollbackDrill } from "./lib/native-rollout-drill.mjs";
import {
  assertCandidateVersionIsUnused,
  EXTERNAL_ACTION_KEYS,
  findForbiddenRuntimeFindings,
  validateNativeCandidateState,
} from "./lib/native-rollout-readiness-policy.mjs";
import {
  CURRENT_MINIPROGRAM_VERSION,
  NATIVE_SHELL_PREVIEW_VERSION,
} from "./release-candidate.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MINIPROGRAM_ROOT = resolve(ROOT, "miniprogram");
const MAIN_PACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const SUBPACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const TOTAL_PACKAGE_LIMIT_BYTES = 20 * 1024 * 1024;
const EXPECTED_API_ORIGIN = "https://api.humi-home.com";
const EXPECTED_WEB_ORIGIN = "https://www.humi-home.com";
const LATEST_UPLOADED_VERSION = "1.1.73";
const NATIVE_PREVIEW_VERSION = "1.1.74";
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

const packageVersion = extractPackageVersion(await text("miniprogram/utils/config.js"));
await check("native preview uses a never-uploaded package version", async () => {
  assert.equal(CURRENT_MINIPROGRAM_VERSION, LATEST_UPLOADED_VERSION, "release history must stay at 1.1.73");
  assert.equal(NATIVE_SHELL_PREVIEW_VERSION, NATIVE_PREVIEW_VERSION, "native preview constant must stay at 1.1.74");
  assert.equal(packageVersion, NATIVE_PREVIEW_VERSION, `native preview must freeze ${NATIVE_PREVIEW_VERSION}`);
  assertCandidateVersionIsUnused(packageVersion, LATEST_UPLOADED_VERSION);
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
  const runtimeSources = [];
  for (const runtimeRoot of runtimeRoots) {
    const files = await listTextFiles(resolve(ROOT, runtimeRoot), { optional: true });
    for (const file of files) {
      runtimeSources.push({
        path: relative(ROOT, file),
        source: await readFile(file, "utf8"),
      });
    }
  }
  const findings = findForbiddenRuntimeFindings(runtimeSources);
  assert.deepEqual(findings, [], `forbidden runtime findings: ${JSON.stringify(findings)}`);
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

const rollbackReport = await runNativeRollbackDrill({ root: ROOT });
await check("server-flag rollback returns to H5 without deleting product caches", async () => {
  assert.equal(rollbackReport.serverStarted, true);
  assert.equal(rollbackReport.requestCount, 2);
  assert.deepEqual(rollbackReport.bootstrapCapabilities, [true, false]);
  assert.deepEqual(rollbackReport.authorizationHeaders, ["Bearer session-rollout", "Bearer session-rollout"]);
  assert.equal(rollbackReport.bootExecutions, 2);
  assert.deepEqual(rollbackReport.switchTabRoutes, ["/pages/tonight/index"]);
  assert.deepEqual(rollbackReport.relaunchRoutes, ["/pages/legacy/index"]);
  assert.deepEqual(
    [...rollbackReport.removedKeys].sort(),
    [
      "humi:bootstrap:last-household:v1:user-rollout",
      "humi:household-cache:v1:user-rollout:household-rollout",
    ],
    "rollback must clear only the bootstrap pointer and its one household read cache",
  );
  assert.equal(rollbackReport.productCachePreserved, true, "rollback must preserve MealRun and product data");
  assert.equal(rollbackReport.serverFixtureMutations, 1, "only nativeShellEnabled may change");
  assert.equal(rollbackReport.householdFixture, "household-rollout");
  assert.equal(rollbackReport.allowlistPreserved, true, "the test household allowlist must remain unchanged");
});

let repositoryCandidateState = null;
await check("repository handoff records preview-only external state", async () => {
  const handoff = await text("docs/humi-1.1-release-operator-handoff.md");
  const tracker = await text("docs/humi-1.1-gray-release-tracker.md");
  const apiContract = await text("docs/humi-api-contract.md");
  repositoryCandidateState = validateNativeCandidateState(handoff, {
    expectedPackageVersion: packageVersion,
  });
  assert.match(handoff, /downloadFile[\s\S]{0,200}(?:missing|未配置|阻塞)/i);
  assert.match(tracker, /原生壳候选：preview/);
  assert.match(tracker, /原生包版本：`1\.1\.74`/);
  assert.match(tracker, /已上传兼容版：`1\.1\.73`/);
  assert.match(tracker, /真机证据：0\/36/);
  assert.match(apiContract, /关闭 `HUMI_NATIVE_SHELL_ENABLED`/);
  assert.match(apiContract, /不删除 MealRun/);
});

const externalHandoffPath = String(process.env.HUMI_NATIVE_HANDOFF_PATH || "").trim();
if (externalHandoffPath) {
  await check("AI-HQ native handoff matches the immutable preview state", async () => {
    const externalHandoff = await readFile(resolve(externalHandoffPath), "utf8");
    const externalCandidateState = validateNativeCandidateState(externalHandoff, {
      expectedPackageVersion: packageVersion,
    });
    assert.deepEqual(
      externalCandidateState,
      repositoryCandidateState,
      "AI-HQ candidate state must match the repository handoff",
    );
  });
}

const report = {
  contractOk: failures.length === 0,
  status: "preview",
  ads: "excluded",
  checks,
  package: packageReport,
  rollback: rollbackReport,
  packageVersion,
  latestUploadedVersion: LATEST_UPLOADED_VERSION,
  externalActions: Object.fromEntries(EXTERNAL_ACTION_KEYS.map((action) => [action, false])),
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

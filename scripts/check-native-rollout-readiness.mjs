import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSupabaseRetirement } from "./check-supabase-retirement.mjs";
import {
  assertNativeArtifactMatchesCommit,
  verifyNativeCandidateUploadEvidence,
} from "./lib/native-candidate-artifact.mjs";
import { runNativeRollbackDrill } from "./lib/native-rollout-drill.mjs";
import {
  EXTERNAL_ACTION_KEYS,
  extractNativeCandidateArtifactPath,
  extractNativeCandidateCommit,
  findForbiddenRuntimeFindings,
  resolveExternalHandoffPath,
  validateNativeCandidateEvidence,
  validateNativeCandidateState,
  validateWechatPlatformEvidence,
} from "./lib/native-rollout-readiness-policy.mjs";
import { auditWechatPrivacyContract } from "./lib/wechat-privacy-contract.mjs";
import { REQUIRED_SCENARIOS } from "./check-humi-true-device-evidence.mjs";
import {
  CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
  CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
  LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
  LAST_UPLOADED_EXPERIENCE_VERSION,
  PRODUCTION_COMPATIBILITY_BASELINE_VERSION,
} from "./release-candidate.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MINIPROGRAM_ROOT = resolve(ROOT, "miniprogram");
const MAIN_PACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const SUBPACKAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const TOTAL_PACKAGE_LIMIT_BYTES = 20 * 1024 * 1024;
const EXPECTED_API_ORIGIN = "https://api.humi-home.com";
const EXPECTED_WEB_ORIGIN = "https://www.humi-home.com";
const EXPECTED_LAST_UPLOAD_ACTIONS = Object.freeze({
  production_api_deployed: true,
  h5_deployed: true,
  miniprogram_uploaded: true,
  wechat_review_submitted: false,
  wechat_released: false,
  native_allowlist_enabled: false,
});
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
  "release:wechat:privacy:check",
  "release:local-matrix",
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
  assert.equal(
    packageJson.scripts["release:local-matrix"],
    "node scripts/run-local-command-matrix.mjs",
    "release matrix command must invoke the immutable sequential runner",
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
await check("native runtime is the current uploaded experience candidate", async () => {
  assert.equal(
    PRODUCTION_COMPATIBILITY_BASELINE_VERSION,
    "1.1.73",
    "historical compatibility baseline must remain labelled",
  );
  assert.equal(
    LAST_UPLOADED_EXPERIENCE_VERSION,
    "1.1.74",
    "the last uploaded N5b experience runtime must remain labelled",
  );
  assert.equal(
    packageVersion,
    CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
    "runtime package must match the current uploaded experience candidate",
  );
});

const runtimeDriftFiles = listNativeRuntimeDrift(LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT);
await check("current candidate is distinct from the last uploaded runtime", async () => {
  assert(
    runtimeDriftFiles.length > 0,
    "1.1.75 must not claim to be a new candidate when its mini-program runtime is identical to uploaded 1.1.74",
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

await check("runtime capabilities match the pending WeChat privacy declaration", async () => {
  const runtimeFiles = [];
  for (const file of await listTextFiles(MINIPROGRAM_ROOT)) {
    runtimeFiles.push({
      path: relative(ROOT, file),
      source: await readFile(file, "utf8"),
    });
  }
  const declaration = JSON.parse(await text("docs/wechat-privacy-declaration.json"));
  const privacy = auditWechatPrivacyContract({ runtimeFiles, declaration });
  assert.equal(privacy.ok, true, `privacy contract findings: ${JSON.stringify(privacy.findings)}`);
  assert.equal(
    declaration.platformDeclarationStatus,
    "pending",
    "repository declaration must not claim uncollected WeChat-console evidence",
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

let currentCandidateState = null;
let currentCandidateVerification = null;
const candidateEvidencePath = resolve(
  process.env.HUMI_NATIVE_CANDIDATE_EVIDENCE_PATH
    || resolve(ROOT, "docs/native-candidate-evidence.json"),
);
await check("current candidate state matches expected 1.1.75 runtime", async () => {
  const evidence = JSON.parse(await readFile(candidateEvidencePath, "utf8"));
  currentCandidateState = validateNativeCandidateEvidence(evidence, {
    expectedVersion: packageVersion,
    expectedRuntimeCommit: CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
  });
});

if (currentCandidateState) await check("current 1.1.75 experience upload requires trusted private attestation", async () => {
  try {
    currentCandidateVerification = await verifyNativeCandidateUploadEvidence({
      candidate: currentCandidateState,
      repoRoot: ROOT,
      evidenceBaseDir: dirname(candidateEvidencePath),
      uploadAttestationPath: process.env.HUMI_WECHAT_UPLOAD_ATTESTATION_PATH
        || process.env.HUMI_WECHAT_UPLOAD_RECEIPT_PATH,
    });
  } catch (error) {
    throw new Error(
      `trusted private upload attestation is unavailable: ${String(error?.message || error)}`,
    );
  }
  assert.equal(
    currentCandidateVerification?.uploaded,
    true,
    "trusted private upload attestation is required to verify the recorded 1.1.75 experience upload before N5c",
  );
});

await check("repository handoff documents uploaded 1.1.75 experience boundaries", async () => {
  const handoff = await text("docs/humi-1.1-release-operator-handoff.md");
  const tracker = await text("docs/humi-1.1-gray-release-tracker.md");
  const apiContract = await text("docs/humi-api-contract.md");
  assert.match(handoff, /status: uploaded-experience/);
  assert.match(handoff, /package_version: 1\.1\.75/);
  assert.match(handoff, /miniprogram_uploaded: true/);
  assert.match(handoff, /wechat_review_submitted: false/);
  assert.match(handoff, /wechat_released: false/);
  assert.match(handoff, /native_allowlist_enabled: false/);
  assert.match(handoff, /true_device_evidence: 0\/56/);
  assert.match(handoff, new RegExp(CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT));
  assert.match(handoff, /上一历史体验版.*`1\.1\.74`/);
  assert.match(tracker, /原生壳候选：uploaded-experience/);
  assert.match(tracker, /原生包版本：`1\.1\.75`/);
  assert.match(tracker, /上一历史体验版：`1\.1\.74`/);
  assert.match(tracker, /历史兼容基线：`1\.1\.73`/);
  assert.match(tracker, new RegExp(`真机证据：0/${REQUIRED_SCENARIOS.length}`));
  assert.match(apiContract, /关闭 `HUMI_NATIVE_SHELL_ENABLED`/);
  assert.match(apiContract, /不删除 MealRun/);
});

let platformEvidence = null;
await check("structured WeChat platform evidence is valid", async () => {
  platformEvidence = validateWechatPlatformEvidence(
    JSON.parse(await text("docs/wechat-platform-evidence.json")),
  );
});

let externalHandoffPath = "";
await check("release check requires the external AI-HQ handoff", async () => {
  externalHandoffPath = resolveExternalHandoffPath({
    handoffPath: process.env.HUMI_NATIVE_HANDOFF_PATH,
    localContractOnly: process.argv.includes("--local-contract-only"),
  });
});
if (externalHandoffPath) {
  await check("AI-HQ native handoff proves the last uploaded 1.1.74 runtime", async () => {
    const externalHandoff = await readFile(resolve(externalHandoffPath), "utf8");
    validateNativeCandidateState(externalHandoff, {
      expectedPackageVersion: LAST_UPLOADED_EXPERIENCE_VERSION,
      expectedExternalActions: EXPECTED_LAST_UPLOAD_ACTIONS,
      expectedTrueDeviceEvidence: "0/36",
    });
    assert.equal(
      extractNativeCandidateCommit(externalHandoff),
      LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
      "AI-HQ handoff must bind the exact uploaded runtime commit",
    );
    const artifactPath = resolve(
      dirname(resolve(externalHandoffPath)),
      extractNativeCandidateArtifactPath(externalHandoff, {
        expectedVersion: LAST_UPLOADED_EXPERIENCE_VERSION,
      }),
    );
    await assertNativeArtifactMatchesCommit({
      artifactPath,
      repoRoot: ROOT,
      commit: LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
    });
  });
}

const blockers = [];
if (!platformEvidence?.webViewDomainVerified) {
  blockers.push("WeChat web-view business-domain screenshot/confirmation is still required.");
}
if (!platformEvidence.privacyDeclarationVerified) {
  blockers.push("WeChat platform privacy declaration and screenshot are still required.");
}
blockers.push(
  ...(!currentCandidateVerification?.uploaded
    ? [
      "Trusted private upload attestation is unavailable, so this process cannot verify the recorded 1.1.75 experience upload.",
      `${REQUIRED_SCENARIOS.length}-row iOS/Android true-device evidence remains required before N5c can complete.`,
    ]
    : []),
  "native cached/warm/cold startup budgets have not been verified on agreed real devices.",
);

const report = {
  contractOk: failures.length === 0,
  status: currentCandidateState?.status || "invalid",
  ads: "excluded",
  checks,
  package: packageReport,
  rollback: rollbackReport,
  packageVersion,
  historicalCompatibilityBaseline: PRODUCTION_COMPATIBILITY_BASELINE_VERSION,
  lastUploadedExperience: {
    version: LAST_UPLOADED_EXPERIENCE_VERSION,
    runtimeCommit: LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
    immutableArtifactVerified: Boolean(externalHandoffPath)
      && !failures.some((failure) => failure.name === "AI-HQ native handoff proves the last uploaded 1.1.74 runtime"),
  },
  currentCandidate: {
    version: CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
    uploadStatus: currentCandidateState?.status === "uploaded-experience" ? "uploaded" : "not_uploaded",
    runtimeDriftFromLastUpload: runtimeDriftFiles,
    immutableArchivePresent: Boolean(currentCandidateVerification?.uploaded),
    runtimeCommit: currentCandidateState?.runtimeCommit || null,
  },
  evidenceLevel: externalHandoffPath ? "external-handoff" : "local-contract",
  externalActions: currentCandidateState
    ? {
      production_api_deployed: currentCandidateState.actions.productionApiDeployed,
      h5_deployed: currentCandidateState.actions.h5Deployed,
      miniprogram_uploaded: currentCandidateState.actions.miniprogramUploaded,
      wechat_review_submitted: currentCandidateState.actions.wechatReviewSubmitted,
      wechat_released: currentCandidateState.actions.wechatReleased,
      native_allowlist_enabled: currentCandidateState.actions.nativeAllowlistEnabled,
    }
    : Object.fromEntries(EXTERNAL_ACTION_KEYS.map((action) => [action, false])),
  platformEvidence: {
    trueDevicePassed: currentCandidateState?.trueDeviceEvidence.passed ?? 0,
    trueDeviceRequired: currentCandidateState?.trueDeviceEvidence.required ?? REQUIRED_SCENARIOS.length,
    complete: false,
    ...(platformEvidence || {}),
    startupBudgetsVerifiedOnDevice: false,
  },
  blockers,
  failures,
};

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

function listNativeRuntimeDrift(commit) {
  return execFileSync(
    "git",
    ["diff", "--name-only", commit, "--", "miniprogram"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
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

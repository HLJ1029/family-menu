import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const LOGIN_SCENARIOS = [
  "fresh_guest_start",
  "explicit_wechat_login",
  "new_identity_profile",
  "legacy_identity_recovery",
  "session_revocation_relogin",
  "logout_to_guest",
];

const RECOMMENDATION_SCENARIOS = ["quick_15", "easy_30", "normal"]
  .flatMap((tier) => Array.from({ length: 5 }, (_, index) => `recommendation_${tier}_rotation_${index + 1}`));

const COOKING_SCENARIOS = [
  "cooking_background_restore",
  "offline_sync_recovery",
  "owner_cooking_flow",
  "member_cooking_flow",
];

export const SHARE_SCENARIOS = [
  "menu_share_send_and_recipient_open",
  "grocery_share_send_and_recipient_open",
  "invite_share_send_and_recipient_open",
  "meal_task_share_send_and_recipient_open",
  "poster_share_send_and_recipient_open",
];

const POSTER_SCENARIOS = [
  "poster_style_change_primary",
  "poster_style_change_secondary",
];

const REMINDER_SCENARIOS = [
  "reminder_accept",
  "reminder_reject",
  "reminder_cancel",
];

export const REQUIRED_SCENARIOS = Object.freeze([
  ...LOGIN_SCENARIOS,
  ...RECOMMENDATION_SCENARIOS,
  ...COOKING_SCENARIOS,
  ...SHARE_SCENARIOS,
  ...POSTER_SCENARIOS,
  ...REMINDER_SCENARIOS,
  "immediate_h5_rollback",
]);

const REQUIRED_FIELDS = Object.freeze([
  "device",
  "platform",
  "wechatVersion",
  "packageVersion",
  "householdFixture",
  "startedAt",
  "finishedAt",
  "result",
  "evidencePath",
]);
const REQUIRED_FIELD_SET = new Set(REQUIRED_FIELDS);
const ALLOWED_RESULTS = new Set(["pass", "fail", "pending", "blocked"]);
const ALLOWED_PLATFORMS = new Set(["iOS", "Android"]);
const PACKAGE_VERSION = /^\d+\.\d+\.\d+$/;
const WECHAT_VERSION = /^\d+\.\d+\.\d+(?:\.\d+)?$/;
const UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const PII_PATTERN = /(?:\+?86[- ]?)?1[3-9]\d{9}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:openid|unionid|token|session|authorization)\b\s*[:=]\s*\S+|\bo[A-Za-z0-9_-]{27}\b|sk-[A-Za-z0-9_-]{12,}/i;

assert.equal(REQUIRED_SCENARIOS.length, 36, "the native true-device matrix must retain all 36 required rows");

export async function validateEvidence({ evidenceDir, candidateTimestamp }) {
  const root = resolve(evidenceDir);
  const rootStat = await lstat(root).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail("evidence_root_invalid");
  const realRoot = await realpath(root);
  const manifestPath = resolve(root, "manifest.json");
  const manifestStat = await lstat(manifestPath).catch(() => null);
  if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) fail("manifest_path_invalid");
  const realManifestPath = await realpath(manifestPath);
  if (!isInside(realRoot, realManifestPath)) fail("manifest_path_invalid");

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.schemaVersion !== 2 || !isRecord(manifest.scenarios)) fail("manifest_schema_invalid");
  const candidateTime = Date.parse(candidateTimestamp);
  if (!Number.isFinite(candidateTime)) fail("candidate_timestamp_invalid");

  const rows = [];
  const issues = [];
  const seenArtifacts = new Set();
  for (const scenario of REQUIRED_SCENARIOS) {
    const entry = manifest.scenarios[scenario];
    if (!isRecord(entry)) {
      issues.push(issue(scenario, "missing", "scenario_missing"));
      continue;
    }
    const entryKeys = Object.keys(entry).sort();
    if (
      entryKeys.length !== REQUIRED_FIELDS.length
      || entryKeys.some((key) => !REQUIRED_FIELD_SET.has(key))
    ) {
      issues.push(issue(scenario, "invalid", "field_set_invalid"));
      continue;
    }
    const fieldIssue = validateFields(entry, candidateTime);
    if (fieldIssue) {
      issues.push(issue(scenario, "invalid", fieldIssue));
      continue;
    }
    if (entry.result !== "pass") {
      issues.push(issue(scenario, entry.result, `result_${entry.result}`));
      rows.push({ scenario, status: entry.result, path: entry.evidencePath });
      continue;
    }
    const artifactIssue = await validateArtifact({
      root,
      realRoot,
      realManifestPath,
      relativePath: entry.evidencePath,
      scenario,
      seenArtifacts,
    });
    if (artifactIssue) {
      issues.push(issue(scenario, "invalid", artifactIssue));
      continue;
    }
    rows.push({ scenario, status: "pass", path: entry.evidencePath });
  }

  return {
    ok: issues.length === 0,
    required: REQUIRED_SCENARIOS.length,
    passed: rows.filter((row) => row.status === "pass").length,
    rows,
    issues,
  };
}

function validateFields(entry, candidateTime) {
  if (!REQUIRED_FIELDS.every((field) => typeof entry[field] === "string")) return "field_type_invalid";
  if (!entry.device.trim() || entry.device.length > 80) return "device_invalid";
  if (!ALLOWED_PLATFORMS.has(entry.platform)) return "platform_invalid";
  if (!WECHAT_VERSION.test(entry.wechatVersion)) return "wechat_version_invalid";
  if (!PACKAGE_VERSION.test(entry.packageVersion)) return "package_version_invalid";
  if (!FIXTURE_ID.test(entry.householdFixture)) return "household_fixture_invalid";
  if (!ALLOWED_RESULTS.has(entry.result)) return "result_invalid";
  if (!UTC_ISO_TIMESTAMP.test(entry.startedAt) || !UTC_ISO_TIMESTAMP.test(entry.finishedAt)) {
    return "timestamp_format_invalid";
  }
  const startedAt = Date.parse(entry.startedAt);
  const finishedAt = Date.parse(entry.finishedAt);
  if (
    !Number.isFinite(startedAt)
    || !Number.isFinite(finishedAt)
    || startedAt <= candidateTime
    || finishedAt < startedAt
  ) {
    return "timestamp_range_invalid";
  }
  const privacyFields = REQUIRED_FIELDS.map((field) => entry[field]);
  if (privacyFields.some((value) => PII_PATTERN.test(value))) return "privacy_check_failed";
  if (
    !entry.evidencePath.trim()
    || isAbsolute(entry.evidencePath)
    || entry.evidencePath.split(/[\\/]/).includes("..")
  ) {
    return "evidence_path_invalid";
  }
  return "";
}

async function validateArtifact({
  root,
  realRoot,
  realManifestPath,
  relativePath,
  scenario,
  seenArtifacts,
}) {
  await rejectSymlinkAncestors(root, relativePath, scenario);
  const artifactPath = resolve(root, relativePath);
  if (!isInside(root, artifactPath)) return "evidence_path_invalid";
  const artifactStat = await lstat(artifactPath).catch(() => null);
  if (!artifactStat?.isFile() || artifactStat.isSymbolicLink() || artifactStat.size < 1) {
    return "artifact_missing";
  }
  const realArtifactPath = await realpath(artifactPath).catch(() => "");
  if (!realArtifactPath || !isInside(realRoot, realArtifactPath) || realArtifactPath === realManifestPath) {
    return "evidence_path_invalid";
  }
  const artifactIdentity = `${artifactStat.dev}:${artifactStat.ino}`;
  if (seenArtifacts.has(artifactIdentity)) return "artifact_reused";
  seenArtifacts.add(artifactIdentity);
  if (/\.(?:json|md|txt)$/i.test(relativePath) && artifactStat.size <= 64 * 1024) {
    const text = await readFile(artifactPath, "utf8");
    if (PII_PATTERN.test(text)) return "privacy_check_failed";
  }
  return "";
}

function issue(scenario, status, code) {
  return { scenario, status, code };
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInside(root, target) {
  const inside = relative(root, target);
  return Boolean(inside) && !inside.startsWith("..") && !isAbsolute(inside);
}

async function rejectSymlinkAncestors(root, artifactPath, scenario) {
  const segments = artifactPath.split(/[\\/]/).filter(Boolean);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = resolve(current, segment);
    const currentStat = await lstat(current).catch(() => null);
    if (!currentStat?.isDirectory() || currentStat.isSymbolicLink()) {
      const error = new Error(`${scenario}:evidence_path_invalid`);
      error.code = "evidence_path_invalid";
      throw error;
    }
  }
}

function evidenceEntry(scenario, overrides = {}) {
  const fixture = scenario.includes("guest")
    ? "guest"
    : scenario.startsWith("member_")
      ? "member-household"
      : "owner-household";
  return {
    device: "iPhone 15 Pro",
    platform: "iOS",
    wechatVersion: "8.0.56",
    packageVersion: "1.1.72",
    householdFixture: fixture,
    startedAt: "2026-07-23T08:00:00.000Z",
    finishedAt: "2026-07-23T08:02:00.000Z",
    result: "pass",
    evidencePath: `${scenario}.txt`,
    ...overrides,
  };
}

async function writeFixture(root, scenarios) {
  for (const [scenario, entry] of Object.entries(scenarios)) {
    if (entry.result === "pass") {
      await writeFile(join(root, entry.evidencePath), `redacted evidence for ${scenario}\n`, { mode: 0o600 });
    }
  }
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 2, scenarios }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function selftest() {
  const root = await mkdtemp(join(tmpdir(), "humi-true-device-evidence-"));
  const scenarios = Object.fromEntries(REQUIRED_SCENARIOS.map((scenario) => [scenario, evidenceEntry(scenario)]));
  await writeFixture(root, scenarios);
  const accepted = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted.issues));
  assert.equal(accepted.passed, 36);

  const incomplete = structuredClone(scenarios);
  delete incomplete.fresh_guest_start;
  incomplete.reminder_reject = evidenceEntry("reminder_reject", { result: "pending" });
  incomplete.reminder_cancel = evidenceEntry("reminder_cancel", { result: "fail" });
  await writeFixture(root, incomplete);
  const blocked = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(
    blocked.issues.map(({ scenario, status }) => ({ scenario, status })),
    [
      { scenario: "fresh_guest_start", status: "missing" },
      { scenario: "reminder_reject", status: "pending" },
      { scenario: "reminder_cancel", status: "fail" },
    ],
  );

  const unknownField = structuredClone(scenarios);
  unknownField.explicit_wechat_login.notes = "must be rejected";
  await writeFixture(root, unknownField);
  const unknownReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    unknownReport.issues.some((entry) => (
      entry.scenario === "explicit_wechat_login" && entry.code === "field_set_invalid"
    )),
    true,
  );

  const unsafe = structuredClone(scenarios);
  unsafe.owner_cooking_flow.device = "13800138000";
  await writeFixture(root, unsafe);
  const unsafeReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    unsafeReport.issues.some((entry) => (
      entry.scenario === "owner_cooking_flow" && entry.code === "privacy_check_failed"
    )),
    true,
  );

  const externalRoot = await mkdtemp(join(tmpdir(), "humi-true-device-external-"));
  const externalArtifact = join(externalRoot, "outside.txt");
  await writeFile(externalArtifact, "outside evidence\n");
  const linkedPath = join(root, "linked-evidence.txt");
  await symlink(externalArtifact, linkedPath);
  const linked = structuredClone(scenarios);
  linked.member_cooking_flow.evidencePath = "linked-evidence.txt";
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 2, scenarios: linked }, null, 2)}\n`,
    { mode: 0o600 },
  );
  const linkedReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    linkedReport.issues.some((entry) => (
      entry.scenario === "member_cooking_flow" && entry.code === "artifact_missing"
    )),
    true,
  );

  console.log("Humi true-device evidence v2 selftest passed (36 required rows).");
}

function parseArgs(argv) {
  if (argv.length === 0) return { reportMissing: true };
  if (argv.length === 1 && argv[0] === "--selftest") return { selftest: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--evidence-dir", "--candidate-commit"].includes(key) || !value || value.startsWith("--")) {
      throw new Error("Use --evidence-dir <dir> --candidate-commit <sha>, or --selftest.");
    }
    options[key.slice(2).replaceAll("-", "")] = value;
  }
  if (!options.evidencedir || !options.candidatecommit) {
    throw new Error("Evidence directory and candidate commit are required.");
  }
  return options;
}

function printReport(report) {
  for (const entry of report.issues) {
    console.error(`${entry.scenario}\t${entry.status}\t${entry.code}`);
  }
  for (const row of report.rows.filter((entry) => entry.status === "pass")) {
    console.log(`${row.scenario}\tpass\t${row.path}`);
  }
  const status = report.ok ? "passed" : "blocked";
  console.log(`True-device evidence ${status}: ${report.passed}/${report.required}.`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.selftest) return await selftest();
    if (options.reportMissing) {
      const report = {
        ok: false,
        required: REQUIRED_SCENARIOS.length,
        passed: 0,
        rows: [],
        issues: REQUIRED_SCENARIOS.map((scenario) => issue(scenario, "missing", "scenario_missing")),
      };
      printReport(report);
      process.exitCode = 1;
      return;
    }
    const candidateTimestamp = execFileSync(
      "git",
      ["show", "-s", "--format=%cI", options.candidatecommit],
      { encoding: "utf8" },
    ).trim();
    const report = await validateEvidence({
      evidenceDir: options.evidencedir,
      candidateTimestamp,
    });
    printReport(report);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    if (process.argv.includes("--selftest")) console.error(error.stack);
    console.error(`True-device evidence failed: ${error.code ?? "arguments_invalid"}.`);
    process.exitCode = 1;
  }
}

await main();

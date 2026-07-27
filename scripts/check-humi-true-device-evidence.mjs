import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

const COMPLETION_SCENARIOS = [
  "native_tab_tonight",
  "native_tab_discover",
  "native_tab_plan",
  "native_tab_grocery",
  "native_tab_family",
  "multi_household_switch",
  "household_owner_member_permissions",
  "meal_task_identity_claim_complete",
  "cooking_downgrade_remove_side",
  "cooking_downgrade_lower_effort",
  "cooking_downgrade_ready_staple",
  "serve_feedback",
  "poster_save",
  "poster_cancel",
  "poster_permission_recovery",
  "reminder_send_failure",
  "reminder_deep_link",
];

export const PERFORMANCE_BUDGETS_MS = Object.freeze({
  performance_cached_first_paint: 400,
  performance_warm_bootstrap: 1000,
  performance_cold_authenticated_bootstrap: 2500,
});
export const PERFORMANCE_SCENARIOS = Object.freeze(Object.keys(PERFORMANCE_BUDGETS_MS));

export const REQUIRED_SCENARIOS = Object.freeze([
  ...LOGIN_SCENARIOS,
  ...RECOMMENDATION_SCENARIOS,
  ...COOKING_SCENARIOS,
  ...SHARE_SCENARIOS,
  ...POSTER_SCENARIOS,
  ...REMINDER_SCENARIOS,
  "immediate_h5_rollback",
  ...COMPLETION_SCENARIOS,
  ...PERFORMANCE_SCENARIOS,
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
const MANIFEST_FIELDS = new Set(["schemaVersion", "scenarios"]);
const DESCRIPTOR_FIELDS = new Set(["schemaVersion", "scenarioId", "redacted", "checks", "metrics", "mediaPaths"]);
const MEDIA_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".mp4", ".mov"]);
const MIN_IMAGE_BYTES = 10 * 1024;
const MIN_VIDEO_BYTES = 50 * 1024;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const MIN_MEDIA_WIDTH = 300;
const MIN_MEDIA_HEIGHT = 300;
const MIN_VIDEO_DURATION_SECONDS = 1;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

const SCENARIO_CHECKS = {
  fresh_guest_start: ["fresh_install", "guest_visible", "no_false_login"],
  explicit_wechat_login: ["wechat_consent", "login_completed", "identity_visible"],
  new_identity_profile: ["profile_required", "nickname_saved", "avatar_saved"],
  legacy_identity_recovery: ["legacy_detected", "profile_recovered", "session_restored"],
  session_revocation_relogin: ["session_revoked", "login_prompted", "relogin_completed"],
  logout_to_guest: ["logout_completed", "guest_visible", "private_state_cleared"],
  cooking_background_restore: ["timer_started", "backgrounded", "remaining_time_restored"],
  offline_sync_recovery: ["offline_mutation", "reconnected", "server_reconciled"],
  owner_cooking_flow: ["owner_started", "progressed", "completed"],
  member_cooking_flow: ["member_started", "progressed", "completed", "menu_edit_denied"],
  poster_style_change_primary: ["style_changed", "visual_changed", "poster_rendered"],
  poster_style_change_secondary: ["style_changed", "visual_changed", "poster_rendered"],
  reminder_accept: ["consent_prompt", "accepted", "single_reminder_scheduled"],
  reminder_reject: ["consent_prompt", "rejected", "not_reprompted"],
  reminder_cancel: ["reminder_scheduled", "cancelled", "not_sent"],
  immediate_h5_rollback: ["native_enabled", "flag_disabled", "legacy_opened"],
  native_tab_tonight: ["tab_visible", "tab_selected", "tonight_content_visible"],
  native_tab_discover: ["tab_visible", "tab_selected", "discover_content_visible"],
  native_tab_plan: ["tab_visible", "tab_selected", "plan_content_visible"],
  native_tab_grocery: ["tab_visible", "tab_selected", "grocery_content_visible"],
  native_tab_family: ["tab_visible", "tab_selected", "family_content_visible"],
  multi_household_switch: ["two_households_visible", "switched_household", "household_context_changed"],
  household_owner_member_permissions: ["owner_settings_allowed", "member_settings_denied", "member_cooking_allowed"],
  meal_task_identity_claim_complete: ["task_claimed", "actor_identity_recorded", "task_completed"],
  cooking_downgrade_remove_side: ["cooking_started", "remove_side_selected", "timeline_updated"],
  cooking_downgrade_lower_effort: ["cooking_started", "lower_effort_selected", "recipe_replaced"],
  cooking_downgrade_ready_staple: ["cooking_started", "ready_staple_selected", "staple_replaced"],
  serve_feedback: ["meal_completed", "feedback_submitted", "feedback_persisted"],
  poster_save: ["poster_rendered", "save_requested", "saved_to_album"],
  poster_cancel: ["save_requested", "cancelled", "no_album_write"],
  poster_permission_recovery: ["permission_denied", "settings_recovery", "saved_after_recovery"],
  reminder_send_failure: ["reminder_scheduled", "delivery_failed", "single_retry_only"],
  reminder_deep_link: ["reminder_received", "deep_link_opened", "meal_run_restored"],
  performance_cached_first_paint: ["cached_summary_present", "first_paint_observed", "fresh_bootstrap_pending"],
  performance_warm_bootstrap: ["valid_session_present", "bootstrap_measured", "native_page_ready"],
  performance_cold_authenticated_bootstrap: ["cold_authenticated_start", "session_exchange_completed", "native_page_ready"],
};

for (const scenario of RECOMMENDATION_SCENARIOS) {
  const rotation = Number(scenario.match(/rotation_(\d+)$/)?.[1] || 0);
  SCENARIO_CHECKS[scenario] = [
    "tier_selected",
    "certified_recipes_only",
    "hard_constraints_satisfied",
    "plan_visible",
    ...(rotation > 1 ? ["no_group_repeat"] : []),
  ];
}
for (const scenario of SHARE_SCENARIOS) {
  SCENARIO_CHECKS[scenario] = ["contact_panel", "sent", "recipient_open"];
}
Object.freeze(SCENARIO_CHECKS);

assert.equal(REQUIRED_SCENARIOS.length, 56, "the native true-device matrix must retain all 56 required rows");
assert.deepEqual(
  Object.keys(SCENARIO_CHECKS).sort(),
  [...REQUIRED_SCENARIOS].sort(),
  "every true-device row must declare concrete checks",
);

export async function validateEvidence({
  evidenceDir,
  candidateTimestamp,
  candidatePackageVersion = "",
  scenarioIds = REQUIRED_SCENARIOS,
}) {
  const root = resolve(evidenceDir);
  const rootStat = await lstat(root).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail("evidence_root_invalid");
  const realRoot = await realpath(root);
  const manifestPath = resolve(root, "manifest.json");
  const manifestStat = await lstat(manifestPath).catch(() => null);
  if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) fail("manifest_path_invalid");
  const realManifestPath = await realpath(manifestPath);
  if (!isInside(realRoot, realManifestPath)) fail("manifest_path_invalid");

  if (manifestStat.size > 256 * 1024) fail("manifest_too_large");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("manifest_schema_invalid");
  }
  if (
    manifest?.schemaVersion !== 3
    || !isRecord(manifest.scenarios)
    || Object.keys(manifest).length !== MANIFEST_FIELDS.size
    || Object.keys(manifest).some((field) => !MANIFEST_FIELDS.has(field))
    || Object.keys(manifest.scenarios).some((scenario) => !REQUIRED_SCENARIOS.includes(scenario))
  ) fail("manifest_schema_invalid");
  const candidateTime = Date.parse(candidateTimestamp);
  if (!Number.isFinite(candidateTime)) fail("candidate_timestamp_invalid");
  const expectedPackageVersion = candidatePackageVersion || await readCandidatePackageVersion();

  const rows = [];
  const issues = [];
  const seenArtifacts = new Set();
  for (const scenario of scenarioIds) {
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
    const fieldIssue = validateFields(entry, candidateTime, expectedPackageVersion, scenario);
    if (fieldIssue) {
      issues.push(issue(scenario, "invalid", fieldIssue));
      continue;
    }
    if (entry.result !== "pass") {
      issues.push(issue(scenario, entry.result, `result_${entry.result}`));
      rows.push({ scenario, status: entry.result, path: entry.evidencePath });
      continue;
    }
    const descriptorResult = await validateEvidenceDescriptor({
      root,
      realRoot,
      realManifestPath,
      relativePath: entry.evidencePath,
      scenario,
      seenArtifacts,
      candidateTime,
    });
    if (descriptorResult.issue) {
      issues.push(issue(scenario, "invalid", descriptorResult.issue));
      continue;
    }
    rows.push({
      scenario,
      status: "pass",
      path: entry.evidencePath,
      metrics: descriptorResult.metrics,
      descriptorSha256: descriptorResult.descriptorSha256,
    });
  }

  return {
    ok: issues.length === 0,
    required: scenarioIds.length,
    passed: rows.filter((row) => row.status === "pass").length,
    rows,
    issues,
  };
}

function validateFields(entry, candidateTime, candidatePackageVersion, scenario) {
  if (!REQUIRED_FIELDS.every((field) => typeof entry[field] === "string")) return "field_type_invalid";
  if (!entry.device.trim() || entry.device.length > 80) return "device_invalid";
  if (!ALLOWED_PLATFORMS.has(entry.platform)) return "platform_invalid";
  if (!WECHAT_VERSION.test(entry.wechatVersion)) return "wechat_version_invalid";
  if (!PACKAGE_VERSION.test(entry.packageVersion)) return "package_version_invalid";
  if (entry.packageVersion !== candidatePackageVersion) return "package_version_mismatch";
  if (!FIXTURE_ID.test(entry.householdFixture)) return "household_fixture_invalid";
  if (!fixtureMatchesScenario(entry.householdFixture, scenario)) return "household_fixture_mismatch";
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
    || finishedAt > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS
  ) {
    return "timestamp_range_invalid";
  }
  const privacyFields = REQUIRED_FIELDS.map((field) => entry[field]);
  if (privacyFields.some((value) => PII_PATTERN.test(value))) return "privacy_check_failed";
  if (
    !entry.evidencePath.trim()
    || isAbsolute(entry.evidencePath)
    || entry.evidencePath.split(/[\\/]/).includes("..")
    || !/^[A-Za-z0-9_./-]+$/.test(entry.evidencePath)
  ) {
    return "evidence_path_invalid";
  }
  return "";
}

function fixtureMatchesScenario(fixture, scenario) {
  if (["fresh_guest_start", "logout_to_guest"].includes(scenario)) return fixture === "guest";
  if (scenario === "owner_cooking_flow") return fixture.startsWith("owner-");
  if (scenario === "member_cooking_flow") return fixture.startsWith("member-");
  if (
    SHARE_SCENARIOS.includes(scenario)
    || ["multi_household_switch", "household_owner_member_permissions", "meal_task_identity_claim_complete"].includes(scenario)
  ) return fixture.startsWith("owner-member-");
  return true;
}

export async function readCandidatePackageVersion(candidateCommit = "") {
  const source = candidateCommit
    ? execFileSync(
      "git",
      ["show", `${candidateCommit}:miniprogram/utils/config.js`],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    )
    : await readFile(resolve("miniprogram/utils/config.js"), "utf8");
  const match = source.match(/HUMI_PACKAGE_VERSION\s*=\s*["'](\d+\.\d+\.\d+)["']/);
  if (!match) fail("candidate_package_version_missing");
  return match[1];
}

async function validateEvidenceDescriptor({
  root,
  realRoot,
  realManifestPath,
  relativePath,
  scenario,
  seenArtifacts,
  candidateTime,
}) {
  if (!relativePath.endsWith(".json")) return invalidDescriptor("evidence_descriptor_required");
  await rejectSymlinkAncestors(root, relativePath, scenario);
  const artifactPath = resolve(root, relativePath);
  if (!isInside(root, artifactPath)) return invalidDescriptor("evidence_path_invalid");
  const artifactStat = await lstat(artifactPath).catch(() => null);
  if (!artifactStat?.isFile() || artifactStat.isSymbolicLink() || artifactStat.size < 1) {
    return invalidDescriptor("artifact_missing");
  }
  if (
    artifactStat.mtimeMs <= candidateTime
    || artifactStat.mtimeMs > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS
  ) {
    return invalidDescriptor("artifact_timestamp_invalid");
  }
  const realArtifactPath = await realpath(artifactPath).catch(() => "");
  if (!realArtifactPath || !isInside(realRoot, realArtifactPath) || realArtifactPath === realManifestPath) {
    return invalidDescriptor("evidence_path_invalid");
  }
  const artifactIdentity = `${artifactStat.dev}:${artifactStat.ino}`;
  if (seenArtifacts.has(artifactIdentity)) return invalidDescriptor("artifact_reused");
  seenArtifacts.add(artifactIdentity);
  if (artifactStat.size > 64 * 1024) return invalidDescriptor("evidence_descriptor_too_large");

  let descriptor;
  const descriptorSource = await readFile(artifactPath, "utf8");
  try {
    descriptor = JSON.parse(descriptorSource);
  } catch {
    return invalidDescriptor("evidence_descriptor_invalid");
  }
  if (
    !isRecord(descriptor)
    || Object.keys(descriptor).length !== DESCRIPTOR_FIELDS.size
    || Object.keys(descriptor).some((field) => !DESCRIPTOR_FIELDS.has(field))
    || descriptor.schemaVersion !== 2
    || descriptor.scenarioId !== scenario
    || descriptor.redacted !== true
    || !isRecord(descriptor.checks)
    || !isRecord(descriptor.metrics)
    || !Array.isArray(descriptor.mediaPaths)
  ) {
    return invalidDescriptor("evidence_descriptor_invalid");
  }
  const expectedChecks = SCENARIO_CHECKS[scenario];
  if (
    Object.keys(descriptor.checks).sort().join(",") !== [...expectedChecks].sort().join(",")
    || expectedChecks.some((checkName) => descriptor.checks[checkName] !== true)
  ) {
    return invalidDescriptor("evidence_checks_incomplete");
  }
  const metricsIssue = validateMetrics(scenario, descriptor.metrics);
  if (metricsIssue) return invalidDescriptor(metricsIssue);
  const minimumMedia = SHARE_SCENARIOS.includes(scenario) ? 2 : 1;
  if (descriptor.mediaPaths.length < minimumMedia) return invalidDescriptor("evidence_media_incomplete");
  if (
    descriptor.mediaPaths.some((mediaPath) => (
      typeof mediaPath !== "string"
      || !mediaPath.trim()
      || isAbsolute(mediaPath)
      || mediaPath.split(/[\\/]/).includes("..")
      || !/^[A-Za-z0-9_./-]+$/.test(mediaPath)
      || PII_PATTERN.test(mediaPath)
    ))
  ) {
    return invalidDescriptor("evidence_media_path_invalid");
  }
  for (const mediaPath of descriptor.mediaPaths) {
    const mediaIssue = await validateMediaArtifact({
      root,
      realRoot,
      relativePath: mediaPath,
      scenario,
      seenArtifacts,
      candidateTime,
    });
    if (mediaIssue) return invalidDescriptor(mediaIssue);
  }
  return {
    issue: "",
    metrics: descriptor.metrics,
    descriptorSha256: createHash("sha256").update(descriptorSource).digest("hex"),
  };
}

function invalidDescriptor(issue) {
  return { issue, metrics: {}, descriptorSha256: "" };
}

function validateMetrics(scenario, metrics) {
  const keys = Object.keys(metrics);
  if (!PERFORMANCE_SCENARIOS.includes(scenario)) {
    return keys.length === 0 ? "" : "evidence_metrics_invalid";
  }
  if (
    keys.length !== 1
    || keys[0] !== "durationMs"
    || typeof metrics.durationMs !== "number"
    || !Number.isFinite(metrics.durationMs)
    || metrics.durationMs < 0
  ) {
    return "evidence_metrics_invalid";
  }
  return metrics.durationMs <= PERFORMANCE_BUDGETS_MS[scenario]
    ? ""
    : "performance_budget_exceeded";
}

export async function validatePerformanceEvidence(options) {
  const report = await validateEvidence({ ...options, scenarioIds: PERFORMANCE_SCENARIOS });
  return {
    ...report,
    measurements: report.rows
      .filter((row) => row.status === "pass")
      .map((row) => ({
        scenarioId: row.scenario,
        durationMs: row.metrics.durationMs,
        descriptorPath: row.path,
        descriptorSha256: row.descriptorSha256,
      })),
  };
}

async function validateMediaArtifact({
  root,
  realRoot,
  relativePath,
  scenario,
  seenArtifacts,
  candidateTime,
}) {
  const extension = `.${relativePath.split(".").at(-1)?.toLowerCase() || ""}`;
  if (!MEDIA_EXTENSIONS.has(extension)) return "evidence_media_type_invalid";
  await rejectSymlinkAncestors(root, relativePath, scenario);
  const artifactPath = resolve(root, relativePath);
  if (!isInside(root, artifactPath)) return "evidence_media_path_invalid";
  const artifactStat = await lstat(artifactPath).catch(() => null);
  const minimumBytes = [".mp4", ".mov"].includes(extension) ? MIN_VIDEO_BYTES : MIN_IMAGE_BYTES;
  if (
    !artifactStat?.isFile()
    || artifactStat.isSymbolicLink()
    || artifactStat.size < minimumBytes
    || artifactStat.size > MAX_MEDIA_BYTES
  ) {
    return "evidence_media_missing";
  }
  if (
    artifactStat.mtimeMs <= candidateTime
    || artifactStat.mtimeMs > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS
  ) {
    return "artifact_timestamp_invalid";
  }
  const realArtifactPath = await realpath(artifactPath).catch(() => "");
  if (!realArtifactPath || !isInside(realRoot, realArtifactPath)) return "evidence_media_path_invalid";
  const artifactIdentity = `${artifactStat.dev}:${artifactStat.ino}`;
  if (seenArtifacts.has(artifactIdentity)) return "artifact_reused";
  seenArtifacts.add(artifactIdentity);
  const artifactBytes = await readFile(artifactPath);
  const contentIdentity = `sha256:${createHash("sha256").update(artifactBytes).digest("hex")}`;
  if (seenArtifacts.has(contentIdentity)) return "artifact_reused";
  seenArtifacts.add(contentIdentity);
  const header = artifactBytes.subarray(0, 12);
  if (!hasValidMediaHeader(extension, header)) return "evidence_media_invalid";
  if (!hasValidDecodedMedia(extension, artifactPath)) return "evidence_media_invalid";
  return "";
}

function hasValidMediaHeader(extension, header) {
  if (extension === ".png") {
    return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  return header.subarray(4, 8).toString("ascii") === "ftyp";
}

function hasValidDecodedMedia(extension, artifactPath) {
  try {
    if ([".png", ".jpg", ".jpeg"].includes(extension)) {
      const output = execFileSync(
        "/usr/bin/sips",
        ["-g", "pixelWidth", "-g", "pixelHeight", artifactPath],
        { encoding: "utf8", maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "ignore"] },
      );
      const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
      const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
      return width >= MIN_MEDIA_WIDTH && height >= MIN_MEDIA_HEIGHT;
    }
    const output = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "json",
        artifactPath,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    const metadata = JSON.parse(output);
    const stream = metadata?.streams?.[0];
    const duration = Number(metadata?.format?.duration || 0);
    return (
      Number(stream?.width) >= MIN_MEDIA_WIDTH
      && Number(stream?.height) >= MIN_MEDIA_HEIGHT
      && duration >= MIN_VIDEO_DURATION_SECONDS
    );
  } catch {
    return false;
  }
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
  const fixture = (
    SHARE_SCENARIOS.includes(scenario)
    || ["multi_household_switch", "household_owner_member_permissions", "meal_task_identity_claim_complete"].includes(scenario)
  )
    ? "owner-member-household"
    : scenario.includes("guest")
    ? "guest"
    : scenario.startsWith("member_")
      ? "member-household"
      : "owner-household";
  return {
    device: "iPhone 15 Pro",
    platform: "iOS",
    wechatVersion: "8.0.56",
    packageVersion: "1.1.74",
    householdFixture: fixture,
    startedAt: "2026-07-23T08:00:00.000Z",
    finishedAt: "2026-07-23T08:02:00.000Z",
    result: "pass",
    evidencePath: `${scenario}.json`,
    ...overrides,
  };
}

async function writeFixture(root, scenarios) {
  const selftestMedia = await loadSelftestMedia();
  let mediaIndex = 0;
  for (const [scenario, entry] of Object.entries(scenarios)) {
    if (entry.result === "pass") {
      const mediaCount = SHARE_SCENARIOS.includes(scenario) ? 2 : 1;
      const mediaPaths = Array.from(
        { length: mediaCount },
        (_, index) => `${scenario}-${index + 1}.png`,
      );
      for (const mediaPath of mediaPaths) {
        await writeFile(join(root, mediaPath), selftestMedia[mediaIndex], { mode: 0o600 });
        mediaIndex += 1;
      }
      const descriptor = {
        schemaVersion: 2,
        scenarioId: scenario,
        redacted: true,
        checks: Object.fromEntries(SCENARIO_CHECKS[scenario].map((checkName) => [checkName, true])),
        metrics: PERFORMANCE_SCENARIOS.includes(scenario)
          ? { durationMs: PERFORMANCE_BUDGETS_MS[scenario] }
          : {},
        mediaPaths,
      };
      await writeFile(
        join(root, entry.evidencePath),
        `${JSON.stringify(descriptor, null, 2)}\n`,
        { mode: 0o600 },
      );
    }
  }
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 3, scenarios }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

let selftestMediaPromise;

async function loadSelftestMedia() {
  if (!selftestMediaPromise) selftestMediaPromise = createSelftestMedia();
  return selftestMediaPromise;
}

async function createSelftestMedia() {
  const required = REQUIRED_SCENARIOS.length + SHARE_SCENARIOS.length;
  const mediaRoot = await mkdtemp(join(tmpdir(), "humi-true-device-media-"));
  const source = resolve("public/icons/humi-icon-512.png");
  const unique = [];
  try {
    for (let index = 0; index < required; index += 1) {
      const target = join(mediaRoot, `${index}.png`);
      const dimension = 480 - index;
      execFileSync(
        "/usr/bin/sips",
        ["--cropToHeightWidth", `${dimension}`, `${dimension}`, source, "--out", target],
        { stdio: "ignore" },
      );
      unique.push(await readFile(target));
    }
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
  assert.equal(
    new Set(unique.map((bytes) => createHash("sha256").update(bytes).digest("hex"))).size,
    required,
    "selftest requires unique decodable image fixtures",
  );
  return unique;
}

function fakePng() {
  const bytes = Buffer.alloc(MIN_IMAGE_BYTES, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  return bytes;
}

async function selftest() {
  const root = await mkdtemp(join(tmpdir(), "humi-true-device-evidence-"));
  const scenarios = Object.fromEntries(REQUIRED_SCENARIOS.map((scenario) => [scenario, evidenceEntry(scenario)]));
  assert.equal(await readCandidatePackageVersion(), "1.1.74");
  await writeFixture(root, scenarios);
  const accepted = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(accepted.ok, true, JSON.stringify(accepted.issues));
  assert.equal(accepted.passed, 56);

  for (const scenario of [...COMPLETION_SCENARIOS, ...PERFORMANCE_SCENARIOS]) {
    const descriptorPath = join(root, scenarios[scenario].evidencePath);
    for (const checkName of SCENARIO_CHECKS[scenario]) {
      const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
      delete descriptor.checks[checkName];
      await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
      const incompleteRow = await validateEvidence({
        evidenceDir: root,
        candidateTimestamp: "2026-07-23T07:00:00.000Z",
        scenarioIds: [scenario],
      });
      assert.deepEqual(incompleteRow.issues, [issue(scenario, "invalid", "evidence_checks_incomplete")]);
      descriptor.checks[checkName] = true;
      await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    }
  }

  for (const [scenario, checkName] of [
    ["recommendation_quick_15_rotation_1", "certified_recipes_only"],
    ["recommendation_quick_15_rotation_1", "hard_constraints_satisfied"],
    ["recommendation_quick_15_rotation_2", "no_group_repeat"],
  ]) {
    const descriptorPath = join(root, scenarios[scenario].evidencePath);
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
    delete descriptor.checks[checkName];
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    const incompleteRecommendation = await validateEvidence({
      evidenceDir: root,
      candidateTimestamp: "2026-07-23T07:00:00.000Z",
      scenarioIds: [scenario],
    });
    assert.deepEqual(
      incompleteRecommendation.issues,
      [issue(scenario, "invalid", "evidence_checks_incomplete")],
    );
    descriptor.checks[checkName] = true;
    await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  }

  await writeFixture(root, scenarios);
  const performanceScenario = "performance_cached_first_paint";
  const performanceDescriptorPath = join(root, scenarios[performanceScenario].evidencePath);
  for (const [metrics, expectedCode] of [
    [{ durationMs: 401 }, "performance_budget_exceeded"],
    [{ durationMs: "400" }, "evidence_metrics_invalid"],
    [{ durationMs: -1 }, "evidence_metrics_invalid"],
    [{ durationMs: 400, budgetMet: true }, "evidence_metrics_invalid"],
  ]) {
    const descriptor = JSON.parse(await readFile(performanceDescriptorPath, "utf8"));
    descriptor.metrics = metrics;
    await writeFile(performanceDescriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    const metricsReport = await validateEvidence({
      evidenceDir: root,
      candidateTimestamp: "2026-07-23T07:00:00.000Z",
      scenarioIds: [performanceScenario],
    });
    assert.deepEqual(metricsReport.issues, [issue(performanceScenario, "invalid", expectedCode)]);
  }

  await writeFixture(root, scenarios);
  const nonPerformanceDescriptorPath = join(root, scenarios.owner_cooking_flow.evidencePath);
  const nonPerformanceDescriptor = JSON.parse(await readFile(nonPerformanceDescriptorPath, "utf8"));
  nonPerformanceDescriptor.metrics = { durationMs: 1 };
  await writeFile(nonPerformanceDescriptorPath, `${JSON.stringify(nonPerformanceDescriptor, null, 2)}\n`);
  const nonPerformanceMetrics = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: ["owner_cooking_flow"],
  });
  assert.deepEqual(
    nonPerformanceMetrics.issues,
    [issue("owner_cooking_flow", "invalid", "evidence_metrics_invalid")],
  );

  await writeFixture(root, scenarios);
  const legacyDescriptor = JSON.parse(await readFile(performanceDescriptorPath, "utf8"));
  legacyDescriptor.schemaVersion = 1;
  await writeFile(performanceDescriptorPath, `${JSON.stringify(legacyDescriptor, null, 2)}\n`);
  const legacyDescriptorReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: [performanceScenario],
  });
  assert.deepEqual(
    legacyDescriptorReport.issues,
    [issue(performanceScenario, "invalid", "evidence_descriptor_invalid")],
  );

  await writeFixture(root, scenarios);
  await writeFile(performanceDescriptorPath, "{\"schemaVersion\":2,\"metrics\":{\"durationMs\":NaN}}\n");
  const malformedMetricsReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: [performanceScenario],
  });
  assert.deepEqual(
    malformedMetricsReport.issues,
    [issue(performanceScenario, "invalid", "evidence_descriptor_invalid")],
  );

  await writeFixture(root, scenarios);
  const infiniteMetricsDescriptor = JSON.parse(await readFile(performanceDescriptorPath, "utf8"));
  const infiniteMetricsSource = JSON.stringify(infiniteMetricsDescriptor, null, 2)
    .replace(`${PERFORMANCE_BUDGETS_MS[performanceScenario]}`, "1e309");
  await writeFile(performanceDescriptorPath, `${infiniteMetricsSource}\n`);
  const infiniteMetricsReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: [performanceScenario],
  });
  assert.deepEqual(
    infiniteMetricsReport.issues,
    [issue(performanceScenario, "invalid", "evidence_metrics_invalid")],
  );

  await writeFixture(root, scenarios);
  const legacyManifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  legacyManifest.schemaVersion = 2;
  await writeFile(join(root, "manifest.json"), `${JSON.stringify(legacyManifest, null, 2)}\n`);
  await assert.rejects(
    validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-23T07:00:00.000Z" }),
    (error) => error.code === "manifest_schema_invalid",
  );

  await writeFixture(root, scenarios);
  await writeFile(
    join(root, `${scenarios.owner_cooking_flow.evidencePath.replace(".json", "")}-1.png`),
    fakePng(),
    { mode: 0o600 },
  );
  const fakeMediaReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    fakeMediaReport.issues.some((entry) => (
      entry.scenario === "owner_cooking_flow" && entry.code === "evidence_media_invalid"
    )),
    true,
  );

  await writeFixture(root, scenarios);
  const reusedBytes = await readFile(join(root, "owner_cooking_flow-1.png"));
  await writeFile(join(root, "member_cooking_flow-1.png"), reusedBytes, { mode: 0o600 });
  const reusedMediaReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    reusedMediaReport.issues.some((entry) => (
      entry.scenario === "member_cooking_flow" && entry.code === "artifact_reused"
    )),
    true,
  );

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

  const wrongPackage = structuredClone(scenarios);
  wrongPackage.owner_cooking_flow.packageVersion = "9.9.9";
  await writeFixture(root, wrongPackage);
  const wrongPackageReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    wrongPackageReport.issues.some((entry) => (
      entry.scenario === "owner_cooking_flow" && entry.code === "package_version_mismatch"
    )),
    true,
  );

  const future = structuredClone(scenarios);
  future.owner_cooking_flow.finishedAt = "2099-07-23T08:02:00.000Z";
  await writeFixture(root, future);
  const futureReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    futureReport.issues.some((entry) => (
      entry.scenario === "owner_cooking_flow" && entry.code === "timestamp_range_invalid"
    )),
    true,
  );

  const wrongFixture = structuredClone(scenarios);
  wrongFixture.member_cooking_flow.householdFixture = "owner-household";
  await writeFixture(root, wrongFixture);
  const wrongFixtureReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    wrongFixtureReport.issues.some((entry) => (
      entry.scenario === "member_cooking_flow" && entry.code === "household_fixture_mismatch"
    )),
    true,
  );

  await writeFixture(root, scenarios);
  await writeFile(
    join(root, scenarios.explicit_wechat_login.evidencePath),
    "{\"schemaVersion\":2}\n",
    { mode: 0o600 },
  );
  const placeholderReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    placeholderReport.issues.some((entry) => (
      entry.scenario === "explicit_wechat_login" && entry.code === "evidence_descriptor_invalid"
    )),
    true,
  );

  await writeFixture(root, scenarios);
  const shareScenario = SHARE_SCENARIOS[0];
  const incompleteShareDescriptor = {
    schemaVersion: 2,
    scenarioId: shareScenario,
    redacted: true,
    checks: { contact_panel: true, sent: true },
    metrics: {},
    mediaPaths: [`${shareScenario}-1.png`],
  };
  await writeFile(
    join(root, scenarios[shareScenario].evidencePath),
    `${JSON.stringify(incompleteShareDescriptor, null, 2)}\n`,
    { mode: 0o600 },
  );
  const incompleteShareReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    incompleteShareReport.issues.some((entry) => (
      entry.scenario === shareScenario && entry.code === "evidence_checks_incomplete"
    )),
    true,
  );

  await writeFixture(root, scenarios);
  const externalRoot = await mkdtemp(join(tmpdir(), "humi-true-device-external-"));
  const externalArtifact = join(externalRoot, "outside.json");
  await writeFile(externalArtifact, "{\"redacted\":true}\n");
  const linkedPath = join(root, "linked-evidence.json");
  await symlink(externalArtifact, linkedPath);
  const linked = structuredClone(scenarios);
  linked.member_cooking_flow.evidencePath = "linked-evidence.json";
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 3, scenarios: linked }, null, 2)}\n`,
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

  await writeFixture(root, scenarios);
  const traversal = structuredClone(scenarios);
  traversal.owner_cooking_flow.evidencePath = "../outside.json";
  await writeFile(
    join(root, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 3, scenarios: traversal }, null, 2)}\n`,
  );
  const traversalReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
  });
  assert.equal(
    traversalReport.issues.some((entry) => (
      entry.scenario === "owner_cooking_flow" && entry.code === "evidence_path_invalid"
    )),
    true,
  );

  await writeFixture(root, scenarios);
  const staleMediaPath = join(root, "owner_cooking_flow-1.png");
  await utimes(staleMediaPath, new Date("2026-07-23T06:00:00.000Z"), new Date("2026-07-23T06:00:00.000Z"));
  const staleMediaReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: ["owner_cooking_flow"],
  });
  assert.deepEqual(
    staleMediaReport.issues,
    [issue("owner_cooking_flow", "invalid", "artifact_timestamp_invalid")],
  );

  await writeFixture(root, scenarios);
  const staleDescriptorPath = join(root, scenarios.owner_cooking_flow.evidencePath);
  await utimes(
    staleDescriptorPath,
    new Date("2026-07-23T06:00:00.000Z"),
    new Date("2026-07-23T06:00:00.000Z"),
  );
  const staleDescriptorReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: ["owner_cooking_flow"],
  });
  assert.deepEqual(
    staleDescriptorReport.issues,
    [issue("owner_cooking_flow", "invalid", "artifact_timestamp_invalid")],
  );

  await writeFixture(root, scenarios);
  const externalMedia = join(externalRoot, "outside.png");
  await writeFile(externalMedia, await readFile(join(root, "owner_cooking_flow-1.png")));
  await rm(join(root, "owner_cooking_flow-1.png"));
  await symlink(externalMedia, join(root, "owner_cooking_flow-1.png"));
  const linkedMediaReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: ["owner_cooking_flow"],
  });
  assert.deepEqual(
    linkedMediaReport.issues,
    [issue("owner_cooking_flow", "invalid", "evidence_media_missing")],
  );

  await rm(join(root, "owner_cooking_flow-1.png"));
  await writeFixture(root, scenarios);
  await writeFile(
    join(root, scenarios.owner_cooking_flow.evidencePath),
    JSON.stringify({ padding: "x".repeat(70 * 1024) }),
  );
  const oversizedDescriptorReport = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: "2026-07-23T07:00:00.000Z",
    scenarioIds: ["owner_cooking_flow"],
  });
  assert.deepEqual(
    oversizedDescriptorReport.issues,
    [issue("owner_cooking_flow", "invalid", "evidence_descriptor_too_large")],
  );

  await writeFile(join(root, "manifest.json"), " ".repeat(257 * 1024));
  await assert.rejects(
    validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-23T07:00:00.000Z" }),
    (error) => error.code === "manifest_too_large",
  );

  await rm(externalRoot, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });

  console.log("Humi true-device evidence v3 selftest passed (56 required rows).");
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
    const candidatePackageVersion = await readCandidatePackageVersion(options.candidatecommit);
    const report = await validateEvidence({
      evidenceDir: options.evidencedir,
      candidateTimestamp,
      candidatePackageVersion,
    });
    printReport(report);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    if (process.argv.includes("--selftest")) console.error(error.stack);
    console.error(`True-device evidence failed: ${error.code ?? "arguments_invalid"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

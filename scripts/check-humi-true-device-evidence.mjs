import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

export const REQUIRED_SCENARIOS = [
  "fresh_guest_start",
  "explicit_wechat_login",
  "new_identity_profile",
  "legacy_identity_recovery",
  "session_revocation_relogin",
  "create_household",
  "join_household",
  "family_living_room_owner",
  "family_living_room_member",
  "guest_crave",
  "signed_in_crave",
  "guest_grocery",
  "guest_wish",
  "guest_to_user_merge",
  "collaboration_history",
  "logout_to_guest",
];

const PII_PATTERN = /(?:\+?86[- ]?)?1[3-9]\d{9}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b(?:openid|unionid|token|session|authorization)\b\s*[:=]\s*\S+|\bo[A-Za-z0-9_-]{20,31}\b|sk-[A-Za-z0-9_-]{12,}/i;
const UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export async function validateEvidence({ evidenceDir, candidateTimestamp }) {
  const root = resolve(evidenceDir);
  const realRoot = await realpath(root);
  const manifestPath = resolve(root, "manifest.json");
  const manifestStat = await lstat(manifestPath).catch(() => null);
  if (!manifestStat?.isFile() || manifestStat.isSymbolicLink()) fail("manifest_path_invalid");
  const realManifestPath = await realpath(manifestPath);
  const realManifestInsideRoot = relative(realRoot, realManifestPath);
  if (!realManifestInsideRoot || realManifestInsideRoot.startsWith("..") || isAbsolute(realManifestInsideRoot)) {
    fail("manifest_path_invalid");
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.schemaVersion !== 1 || !isRecord(manifest.scenarios)) fail("manifest_schema_invalid");
  const candidateTime = Date.parse(candidateTimestamp);
  if (!Number.isFinite(candidateTime)) fail("candidate_timestamp_invalid");

  const rows = [];
  const seenArtifacts = new Set();
  for (const scenario of REQUIRED_SCENARIOS) {
    const entry = manifest.scenarios[scenario];
    if (!isRecord(entry)) fail("scenario_missing", scenario);
    for (const field of ["deviceModel", "wechatVersion", "miniProgramBuild", "testerRole", "timestamp", "result", "artifactPath", "notes"]) {
      if (typeof entry[field] !== "string") fail(`field_invalid:${field}`, scenario);
    }
    if (![entry.deviceModel, entry.wechatVersion, entry.miniProgramBuild, entry.testerRole].every((value) => value.trim())) {
      fail("identity_field_empty", scenario);
    }
    if (entry.result !== "pass") fail("result_not_pass", scenario);
    if (!UTC_ISO_TIMESTAMP.test(entry.timestamp)) fail("timestamp_format_invalid", scenario);
    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= candidateTime) fail("evidence_not_after_candidate", scenario);
    if (!entry.artifactPath.trim() || isAbsolute(entry.artifactPath) || entry.artifactPath.split(/[\\/]/).includes("..")) {
      fail("artifact_path_invalid", scenario);
    }
    const privacyFields = [entry.deviceModel, entry.wechatVersion, entry.miniProgramBuild, entry.testerRole, entry.notes, entry.artifactPath];
    if (entry.notes.length > 240 || privacyFields.some((value) => PII_PATTERN.test(value))) {
      fail("privacy_check_failed", scenario);
    }
    const artifactPath = resolve(root, entry.artifactPath);
    const insideRoot = relative(root, artifactPath);
    if (!insideRoot || insideRoot.startsWith("..") || isAbsolute(insideRoot)) fail("artifact_path_invalid", scenario);
    const artifactStat = await lstat(artifactPath).catch(() => null);
    if (!artifactStat || artifactStat.isSymbolicLink()) fail("artifact_path_invalid", scenario);
    const realArtifactPath = await realpath(artifactPath).catch(() => null);
    const realInsideRoot = realArtifactPath ? relative(realRoot, realArtifactPath) : "";
    if (!realArtifactPath || !realInsideRoot || realInsideRoot.startsWith("..") || isAbsolute(realInsideRoot)) {
      fail("artifact_path_invalid", scenario);
    }
    if (realArtifactPath === realManifestPath) fail("artifact_path_invalid", scenario);
    if (!artifactStat.isFile() || artifactStat.size < 1) fail("artifact_missing", scenario);
    const artifactIdentity = `${artifactStat.dev}:${artifactStat.ino}`;
    if (seenArtifacts.has(artifactIdentity)) fail("artifact_reused", scenario);
    seenArtifacts.add(artifactIdentity);
    rows.push({ scenario, status: entry.result, path: entry.artifactPath });
  }
  return rows;
}

function fail(code, scenario = "manifest") {
  const error = new Error(`${scenario}:${code}`);
  error.code = code;
  error.scenario = scenario;
  throw error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function selftest() {
  const root = await mkdtemp(join(tmpdir(), "humi-true-device-evidence-"));
  const scenarios = {};
  for (const scenario of REQUIRED_SCENARIOS) {
    const artifactPath = `${scenario}.txt`;
    await writeFile(join(root, artifactPath), "sanitized local evidence\n");
    scenarios[scenario] = {
      deviceModel: "test-device",
      wechatVersion: "test-version",
      miniProgramBuild: "candidate-build",
      testerRole: scenario.includes("guest") ? "guest" : "test-user",
      timestamp: "2026-07-20T08:00:00.000Z",
      result: "pass",
      artifactPath,
      notes: "sanitized selftest evidence",
    };
  }
  const manifestPath = join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios }, null, 2)}\n`);
  assert.equal((await validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" })).length, REQUIRED_SCENARIOS.length);

  const missing = structuredClone(scenarios);
  delete missing.fresh_guest_start;
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: missing }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /scenario_missing/);

  const stale = structuredClone(scenarios);
  stale.explicit_wechat_login.timestamp = "2026-07-20T06:00:00.000Z";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: stale }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /evidence_not_after_candidate/);

  const unsafe = structuredClone(scenarios);
  unsafe.join_household.notes = "phone=13800138000";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: unsafe }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /privacy_check_failed/);

  const externalRoot = await mkdtemp(join(tmpdir(), "humi-true-device-external-"));
  const externalArtifact = join(externalRoot, "outside.txt");
  await writeFile(externalArtifact, "outside evidence\n");
  await symlink(externalArtifact, join(root, "linked-evidence.txt"));
  const linked = structuredClone(scenarios);
  linked.guest_wish.artifactPath = "linked-evidence.txt";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: linked }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /artifact_path_invalid/);

  const manifestAsArtifact = structuredClone(scenarios);
  manifestAsArtifact.fresh_guest_start.artifactPath = "manifest.json";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: manifestAsArtifact }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /artifact_path_invalid/);

  const reusedArtifact = structuredClone(scenarios);
  reusedArtifact.guest_crave.artifactPath = reusedArtifact.fresh_guest_start.artifactPath;
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: reusedArtifact }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /artifact_reused/);

  const unsafeMetadata = structuredClone(scenarios);
  unsafeMetadata.guest_crave.deviceModel = "13800138000";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: unsafeMetadata }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /privacy_check_failed/);

  const bareIdentity = structuredClone(scenarios);
  bareIdentity.signed_in_crave.testerRole = "oAbCdEfGhIjKlMnOpQrStUvWxYz";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: bareIdentity }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /privacy_check_failed/);

  const looseTimestamp = structuredClone(scenarios);
  looseTimestamp.guest_grocery.timestamp = "July 20, 2026 08:00 UTC";
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, scenarios: looseTimestamp }, null, 2)}\n`);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /timestamp_format_invalid/);

  const externalManifest = join(externalRoot, "external-manifest.json");
  await writeFile(externalManifest, `${JSON.stringify({ schemaVersion: 1, scenarios }, null, 2)}\n`);
  await unlink(manifestPath);
  await symlink(externalManifest, manifestPath);
  await assert.rejects(validateEvidence({ evidenceDir: root, candidateTimestamp: "2026-07-20T07:00:00.000Z" }), /manifest_path_invalid/);
  console.log("Humi true-device evidence selftest passed.");
}

function parseArgs(argv) {
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
  if (!options.evidencedir || !options.candidatecommit) throw new Error("Evidence directory and candidate commit are required.");
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.selftest) return await selftest();
    const candidateTimestamp = execFileSync("git", ["show", "-s", "--format=%cI", options.candidatecommit], { encoding: "utf8" }).trim();
    const rows = await validateEvidence({ evidenceDir: options.evidencedir, candidateTimestamp });
    for (const row of rows) console.log(`${row.scenario}\t${row.status}\t${row.path}`);
    console.log(`True-device evidence passed: ${rows.length}/${REQUIRED_SCENARIOS.length}.`);
  } catch (error) {
    console.error(`True-device evidence failed: ${error.scenario ?? "arguments"}:${error.code ?? "invalid"}.`);
    process.exitCode = 1;
  }
}

await main();

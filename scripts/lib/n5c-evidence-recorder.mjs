import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  PERFORMANCE_SCENARIOS,
  REQUIRED_SCENARIOS,
  SHARE_SCENARIOS,
  validateEvidence,
  validatePerformanceEvidence,
} from "../check-humi-true-device-evidence.mjs";
import {
  N5C_DEVICE_SLOTS,
  candidateTimestamp,
  loadAndValidateN5cSession,
} from "./n5c-evidence-session.mjs";

const ROW_FIELDS = new Set([
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
const DESCRIPTOR_FIELDS = new Set([
  "schemaVersion",
  "scenarioId",
  "redacted",
  "checks",
  "metrics",
  "mediaPaths",
]);

export async function recordN5cScenario({
  sessionDir,
  scenarioId,
  rowPath,
  descriptorPath = "",
  repoRoot,
  verifyCandidate = true,
}) {
  if (!REQUIRED_SCENARIOS.includes(scenarioId)) fail("scenario_invalid");
  const context = await loadAndValidateN5cSession({ sessionDir, repoRoot, verifyCandidate });
  const { root, session, allocation } = context;
  const manifestPath = join(root, "manifest.json");
  await assertPrivateRegularFile(manifestPath, "manifest_path_invalid");
  const manifestBytesBefore = await readFile(manifestPath);
  const manifest = parseManifest(manifestBytesBefore);
  const existing = manifest.scenarios[scenarioId];
  if (existing?.result === "pass") fail("scenario_pass_immutable");

  const rowFile = await resolvePrivateDraftFile(root, rowPath, "row_path_invalid");
  const row = await readExactJson(rowFile, ROW_FIELDS, "row_schema_invalid");
  if (row.evidencePath !== `descriptors/${scenarioId}.json`) fail("row_scenario_mismatch");
  const expectedPlatform = N5C_DEVICE_SLOTS[allocation.scenarios[scenarioId].deviceSlot].platform;
  if (row.platform !== expectedPlatform || row.packageVersion !== session.packageVersion) {
    fail("row_allocation_mismatch");
  }
  if (existing && Date.parse(row.startedAt) <= Date.parse(existing.finishedAt)) {
    fail("row_execution_not_newer");
  }
  if (row.result === "pass" && !descriptorPath) fail("descriptor_required");
  if (row.result !== "pass" && descriptorPath) fail("descriptor_not_allowed");

  let canonicalDescriptor = "";
  let temporaryManifest = "";
  let manifestCommitted = false;
  try {
    if (row.result === "pass") {
      const descriptorFile = await resolvePrivateDraftFile(root, descriptorPath, "descriptor_path_invalid");
      const descriptor = await readExactJson(descriptorFile, DESCRIPTOR_FIELDS, "descriptor_schema_invalid");
      assertDescriptorMediaContract({ descriptor, scenarioId, root });
      await assertArtifactsNewerThanCandidate({
        descriptorFile,
        descriptor,
        root,
        repoRoot,
        runtimeCommit: session.runtimeCommit,
      });
      canonicalDescriptor = join(root, `descriptors/${scenarioId}.json`);
      await copyFile(descriptorFile, canonicalDescriptor, constants.COPYFILE_EXCL).catch((error) => {
        if (error.code === "EEXIST") fail("descriptor_target_exists");
        throw error;
      });
      await chmod(canonicalDescriptor, 0o600);
    }

    const next = structuredClone(manifest);
    next.scenarios[scenarioId] = row;
    temporaryManifest = `.manifest-${randomBytes(8).toString("hex")}.json`;
    const temporaryManifestPath = join(root, temporaryManifest);
    await writeFile(temporaryManifestPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    const report = await validateEvidence({
      evidenceDir: root,
      candidateTimestamp: candidateTimestamp(repoRoot, session.runtimeCommit),
      candidatePackageVersion: session.packageVersion,
      scenarioIds: Object.keys(next.scenarios),
      manifestFileName: temporaryManifest,
    });
    assertRecordValidation(report, next.scenarios, scenarioId, row.result);
    await rename(temporaryManifestPath, manifestPath);
    manifestCommitted = true;
    return {
      ok: true,
      sessionId: session.sessionId,
      scenarioId,
      result: row.result,
      passed: Object.values(next.scenarios).filter((entry) => entry.result === "pass").length,
      required: REQUIRED_SCENARIOS.length,
    };
  } catch (error) {
    const unchanged = (await readFile(manifestPath)).equals(manifestBytesBefore);
    if (!unchanged && !manifestCommitted) fail("manifest_atomicity_failed");
    throw error;
  } finally {
    if (!manifestCommitted && canonicalDescriptor) await rm(canonicalDescriptor, { force: true });
    if (temporaryManifest) await rm(join(root, temporaryManifest), { force: true });
  }
}

export async function checkN5cSession({
  sessionDir,
  repoRoot,
  verifyCandidate = true,
}) {
  const { root, session, allocation } = await loadAndValidateN5cSession({
    sessionDir,
    repoRoot,
    verifyCandidate,
  });
  await assertPrivateTree(root);
  const timestamp = candidateTimestamp(repoRoot, session.runtimeCommit);
  const evidence = await validateEvidence({
    evidenceDir: root,
    candidateTimestamp: timestamp,
    candidatePackageVersion: session.packageVersion,
  });
  const performance = await validatePerformanceEvidence({
    evidenceDir: root,
    candidateTimestamp: timestamp,
    candidatePackageVersion: session.packageVersion,
  });
  const manifest = parseManifest(await readFile(join(root, "manifest.json")));
  const sessionIssues = [];
  for (const [scenarioId, row] of Object.entries(manifest.scenarios)) {
    const assignment = allocation.scenarios[scenarioId];
    const expectedPlatform = N5C_DEVICE_SLOTS[assignment.deviceSlot].platform;
    if (row.platform !== expectedPlatform) {
      sessionIssues.push({ scenario: scenarioId, status: "invalid", code: "row_allocation_mismatch" });
    }
  }
  for (const platform of ["iOS", "Android"]) {
    if (!(await hasExactViewportEvidence({ root, manifest, platform, width: 390, height: 844 }))) {
      sessionIssues.push({ scenario: platform, status: "invalid", code: "viewport_390x844_missing" });
    }
  }
  const counts = Object.fromEntries(["pass", "pending", "blocked", "fail"].map((status) => [
    status,
    Object.values(manifest.scenarios).filter((entry) => entry.result === status).length,
  ]));
  counts.missing = REQUIRED_SCENARIOS.length - Object.keys(manifest.scenarios).length;
  return {
    ok: evidence.ok && performance.ok && sessionIssues.length === 0,
    sessionId: session.sessionId,
    candidate: `${session.packageVersion}@${session.runtimeCommit}`,
    passed: evidence.passed,
    required: evidence.required,
    counts,
    performance: {
      ok: performance.ok,
      measurements: performance.measurements,
    },
    issues: [...evidence.issues, ...sessionIssues],
  };
}

function parseManifest(bytes) {
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("manifest_schema_invalid");
  }
  if (
    !manifest
    || manifest.schemaVersion !== 3
    || !manifest.scenarios
    || typeof manifest.scenarios !== "object"
    || Array.isArray(manifest.scenarios)
    || Object.keys(manifest).length !== 2
    || Object.keys(manifest).some((key) => !["schemaVersion", "scenarios"].includes(key))
    || Object.keys(manifest.scenarios).some((scenarioId) => !REQUIRED_SCENARIOS.includes(scenarioId))
  ) fail("manifest_schema_invalid");
  return manifest;
}

async function resolvePrivateDraftFile(root, configuredPath, code) {
  if (!isAbsolute(String(configuredPath || ""))) fail(code);
  const candidate = await realpath(resolve(configuredPath)).catch(() => "");
  if (!candidate) fail(code);
  const drafts = resolve(root, "drafts");
  if (!isInside(drafts, candidate)) fail(code);
  const info = await lstat(candidate).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0) fail(code);
  return candidate;
}

async function assertPrivateRegularFile(path, code) {
  const info = await lstat(path).catch(() => null);
  if (
    !info?.isFile()
    || info.isSymbolicLink()
    || info.nlink !== 1
    || (info.mode & 0o077) !== 0
  ) fail(code);
}

async function readExactJson(path, expectedFields, code) {
  let value;
  try {
    const info = await lstat(path);
    if (info.size < 2 || info.size > 128 * 1024) fail(code);
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === code) throw error;
    fail(code);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.length !== expectedFields.size || keys.some((key) => !expectedFields.has(key))) fail(code);
  return value;
}

function assertDescriptorMediaContract({ descriptor, scenarioId, root }) {
  if (descriptor.scenarioId !== scenarioId || descriptor.redacted !== true || !Array.isArray(descriptor.mediaPaths)) {
    fail("descriptor_scenario_mismatch");
  }
  const mediaPrefix = `media/${scenarioId}/`;
  if (descriptor.mediaPaths.some((path) => (
    typeof path !== "string"
    || !path.startsWith(mediaPrefix)
    || !/^[A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|mp4|mov)$/i.test(path)
    || !isInside(resolve(root, "media"), resolve(root, path))
  ))) fail("descriptor_media_path_invalid");
  if (SHARE_SCENARIOS.includes(scenarioId)) {
    if (
      descriptor.mediaPaths.length < 2
      || !descriptor.mediaPaths.some((path) => /\/sender-[A-Za-z0-9_-]+\./.test(path))
      || !descriptor.mediaPaths.some((path) => /\/recipient-[A-Za-z0-9_-]+\./.test(path))
    ) fail("share_endpoint_media_incomplete");
  }
}

async function assertArtifactsNewerThanCandidate({ descriptorFile, descriptor, root, repoRoot, runtimeCommit }) {
  const commitTime = Date.parse(candidateTimestamp(repoRoot, runtimeCommit));
  for (const path of [descriptorFile, ...descriptor.mediaPaths.map((mediaPath) => resolve(root, mediaPath))]) {
    const info = await lstat(path).catch(() => null);
    if (
      !info?.isFile()
      || info.isSymbolicLink()
      || info.nlink !== 1
      || (info.mode & 0o077) !== 0
      || info.mtimeMs <= commitTime
    ) fail("artifact_timestamp_or_permissions_invalid");
  }
}

function assertRecordValidation(report, scenarios, scenarioId, result) {
  const unexpected = report.issues.filter((entry) => {
    const row = scenarios[entry.scenario];
    return !row || entry.code !== `result_${row.result}` || entry.status !== row.result;
  });
  if (unexpected.length) fail(unexpected[0].code || "scenario_validation_failed");
  if (result === "pass" && !report.rows.some((row) => row.scenario === scenarioId && row.status === "pass")) {
    fail("scenario_validation_failed");
  }
  if (result !== "pass" && !report.issues.some((entry) => (
    entry.scenario === scenarioId && entry.code === `result_${result}`
  ))) fail("scenario_validation_failed");
}

async function assertPrivateTree(root) {
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("session_permissions_invalid");
      if (entry.isDirectory()) await visit(path);
      else if (!entry.isFile() || info.nlink !== 1) fail("session_permissions_invalid");
    }
  };
  await visit(root);
}

async function hasExactViewportEvidence({ root, manifest, platform, width, height }) {
  for (const [scenarioId, row] of Object.entries(manifest.scenarios)) {
    if (row.result !== "pass" || row.platform !== platform) continue;
    let descriptor;
    try {
      descriptor = JSON.parse(await readFile(join(root, `descriptors/${scenarioId}.json`), "utf8"));
    } catch {
      continue;
    }
    for (const mediaPath of descriptor.mediaPaths || []) {
      if (!/\.(?:png|jpe?g)$/i.test(mediaPath)) continue;
      try {
        const output = execFileSync("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", join(root, mediaPath)], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        const actualWidth = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
        const actualHeight = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
        if (actualWidth === width && actualHeight === height) return true;
      } catch {
        // The authoritative media validator reports invalid files separately.
      }
    }
  }
  return false;
}

function isInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel);
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

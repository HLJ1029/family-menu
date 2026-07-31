import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  PERFORMANCE_BUDGETS_MS,
  PERFORMANCE_SCENARIOS,
  REQUIRED_SCENARIOS,
  SCENARIO_CHECKS,
  SHARE_SCENARIOS,
  readCandidatePackageVersion,
} from "../check-humi-true-device-evidence.mjs";
import { verifyNativeCandidateUploadEvidence } from "./native-candidate-artifact.mjs";
import { validateNativeCandidateEvidence } from "./native-rollout-readiness-policy.mjs";
import { CURRENT_UPLOADED_EXPERIENCE_VERSION } from "../release-candidate.mjs";

export const N5C_APP_ID = "wx4040b89f3b363416";
export const N5C_SESSION_FIELDS = Object.freeze([
  "schemaVersion",
  "sessionId",
  "createdAt",
  "appId",
  "packageVersion",
  "runtimeCommit",
  "archiveSha256",
  "uploadAttestationRef",
  "uploadRawEvidenceSha256",
  "status",
]);
export const N5C_DEVICE_SLOTS = Object.freeze({
  "ios-primary": Object.freeze({ platform: "iOS", role: "sender", viewport: "390x844" }),
  "android-primary": Object.freeze({ platform: "Android", role: "sender", viewport: "device-native" }),
  "recipient-primary": Object.freeze({ platform: "recipient", role: "recipient", viewport: "device-native" }),
});

const SESSION_FIELD_SET = new Set(N5C_SESSION_FIELDS);
const ALLOCATION_FIELDS = Object.freeze(["schemaVersion", "devices", "scenarios"]);
const ALLOCATION_FIELD_SET = new Set(ALLOCATION_FIELDS);
const ASSIGNMENT_FIELDS = Object.freeze(["deviceSlot", "recipientSlot"]);
const ASSIGNMENT_FIELD_SET = new Set(ASSIGNMENT_FIELDS);
const PRIVATE_ROOT = resolve(homedir(), ".humi-release-evidence");
const SESSION_ID = /^n5c-\d+\.\d+\.\d+-\d{8}T\d{6}Z(?:-[a-f0-9]{8})?$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function buildN5cAllocation() {
  const scenarios = {};
  for (const [index, scenarioId] of REQUIRED_SCENARIOS.entries()) {
    let deviceSlot = index % 2 === 0 ? "ios-primary" : "android-primary";
    if (scenarioId.startsWith("recommendation_quick_15")) deviceSlot = "ios-primary";
    if (scenarioId.startsWith("recommendation_easy_30")) deviceSlot = "android-primary";
    if (scenarioId.startsWith("recommendation_normal")) deviceSlot = "ios-primary";
    scenarios[scenarioId] = {
      deviceSlot,
      recipientSlot: SHARE_SCENARIOS.includes(scenarioId) ? "recipient-primary" : null,
    };
  }
  const allocation = {
    schemaVersion: 1,
    devices: structuredClone(N5C_DEVICE_SLOTS),
    scenarios,
  };
  validateN5cAllocation(allocation);
  return allocation;
}

export function validateN5cAllocation(allocation) {
  assertExactKeys(allocation, ALLOCATION_FIELD_SET, "allocation_schema_invalid");
  if (allocation.schemaVersion !== 1) fail("allocation_schema_invalid");
  assertExactKeys(allocation.devices, new Set(Object.keys(N5C_DEVICE_SLOTS)), "allocation_devices_invalid");
  for (const [slot, expected] of Object.entries(N5C_DEVICE_SLOTS)) {
    assertExactKeys(allocation.devices[slot], new Set(Object.keys(expected)), "allocation_devices_invalid");
    if (JSON.stringify(allocation.devices[slot]) !== JSON.stringify(expected)) fail("allocation_devices_invalid");
  }
  assertExactKeys(allocation.scenarios, new Set(REQUIRED_SCENARIOS), "allocation_scenarios_invalid");
  for (const scenarioId of REQUIRED_SCENARIOS) {
    const assignment = allocation.scenarios[scenarioId];
    assertExactKeys(assignment, ASSIGNMENT_FIELD_SET, "allocation_assignment_invalid");
    if (!["ios-primary", "android-primary"].includes(assignment.deviceSlot)) {
      fail("allocation_device_slot_invalid");
    }
    const expectedRecipient = SHARE_SCENARIOS.includes(scenarioId) ? "recipient-primary" : null;
    if (assignment.recipientSlot !== expectedRecipient || assignment.recipientSlot === assignment.deviceSlot) {
      fail("allocation_recipient_slot_invalid");
    }
  }
  assertPlatformCoverage(allocation);
  return allocation;
}

export async function loadVerifiedN5cCandidate({
  repoRoot,
  candidateCommit,
  attestationPath,
  candidateEvidencePath,
}) {
  const commit = String(candidateCommit || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("candidate_commit_invalid");
  const expectedVersion = await readCandidatePackageVersion(commit);
  const evidencePath = resolve(candidateEvidencePath || (
    expectedVersion === CURRENT_UPLOADED_EXPERIENCE_VERSION
      ? resolve(repoRoot, "docs/native-uploaded-experience-evidence.json")
      : resolve(repoRoot, "docs/native-candidate-evidence.json")
  ));
  const evidence = await readJsonFile(evidencePath, "candidate_evidence_invalid");
  const candidate = validateNativeCandidateEvidence(evidence, {
    expectedVersion,
    expectedRuntimeCommit: commit,
  });
  if (!candidate.actions.miniprogramUploaded || candidate.status !== "uploaded-experience") {
    fail("candidate_not_uploaded");
  }
  const verified = await verifyNativeCandidateUploadEvidence({
    candidate,
    repoRoot,
    evidenceBaseDir: dirname(evidencePath),
    uploadAttestationPath: attestationPath,
  });
  if (
    verified.version !== candidate.version
    || verified.runtimeCommit !== commit
    || verified.sha256 !== candidate.archive.sha256
    || verified.uploadReceiptRef !== candidate.uploadReceiptRef
    || verified.rawEvidenceSha256 !== candidate.uploadEvidence.rawEvidenceSha256
  ) fail("candidate_binding_mismatch");
  return { candidate, verified };
}

export async function prepareN5cSession({
  repoRoot,
  candidateCommit,
  attestationPath,
  outputRoot = join(PRIVATE_ROOT, "HUMI-2026-001"),
  open = false,
}) {
  const repository = resolve(repoRoot);
  if (!isAbsolute(String(outputRoot || ""))) fail("session_path_absolute_required");
  assertIsolatedCleanWorktree(repository);
  const binding = await loadVerifiedN5cCandidate({
    repoRoot: repository,
    candidateCommit,
    attestationPath,
  });
  const createdAt = new Date();
  const packageVersion = binding.candidate.version;
  const sessionId = buildSessionId(packageVersion, createdAt);
  const sessionDir = resolve(outputRoot, sessionId);
  const session = buildSessionRecord({
    sessionId,
    createdAt,
    candidate: binding.candidate,
    verified: binding.verified,
  });
  await createN5cSessionFiles({ sessionDir, session, allocation: buildN5cAllocation() });
  if (open) execFileSync("open", [join(sessionDir, "run-sheet.md")], { stdio: "ignore" });
  return { sessionDir, session, passed: 0, required: REQUIRED_SCENARIOS.length };
}

export async function createN5cSessionFiles({ sessionDir, session, allocation }) {
  validateN5cSessionRecord(session);
  validateN5cAllocation(allocation);
  const target = resolve(sessionDir);
  await assertControlledPrivateTarget(target);
  const existing = await lstat(target).catch(() => null);
  if (existing) fail("session_target_exists");
  await mkdir(target, { mode: 0o700 });
  try {
    for (const directory of ["descriptors", "media", "drafts"]) {
      await mkdir(join(target, directory), { mode: 0o700 });
    }
    await writePrivateJson(join(target, "session.json"), session);
    await writePrivateJson(join(target, "allocation.json"), allocation);
    await writePrivateJson(join(target, "manifest.json"), { schemaVersion: 3, scenarios: {} });
    await writeFile(join(target, "run-sheet.md"), renderRunSheet(session, allocation), { mode: 0o600, flag: "wx" });
    await chmod(target, 0o700);
  } catch (error) {
    error.code ||= "session_prepare_failed";
    throw error;
  }
  return target;
}

export async function loadAndValidateN5cSession({ sessionDir, repoRoot, verifyCandidate = true }) {
  const root = await resolveControlledSessionDir(sessionDir);
  const session = await readJsonFile(join(root, "session.json"), "session_schema_invalid");
  const allocation = await readJsonFile(join(root, "allocation.json"), "allocation_schema_invalid");
  validateN5cSessionRecord(session);
  validateN5cAllocation(allocation);
  await assertSessionPermissions(root);
  let binding = null;
  if (verifyCandidate) {
    const attestationPath = privateReferenceToPath(session.uploadAttestationRef);
    binding = await loadVerifiedN5cCandidate({
      repoRoot,
      candidateCommit: session.runtimeCommit,
      attestationPath,
    });
    assertSessionMatchesBinding(session, binding);
  }
  return { root, session, allocation, binding };
}

export function validateN5cSessionRecord(session) {
  assertExactKeys(session, SESSION_FIELD_SET, "session_schema_invalid");
  const createdAt = Date.parse(String(session.createdAt || ""));
  if (
    session.schemaVersion !== 1
    || !SESSION_ID.test(String(session.sessionId || ""))
    || !UTC_TIMESTAMP.test(String(session.createdAt || ""))
    || session.appId !== N5C_APP_ID
    || !/^\d+\.\d+\.\d+$/.test(String(session.packageVersion || ""))
    || !/^[a-f0-9]{40}$/.test(String(session.runtimeCommit || ""))
    || !SHA256.test(String(session.archiveSha256 || ""))
    || !/^private:\/\/[A-Za-z0-9_./-]+$/.test(String(session.uploadAttestationRef || ""))
    || !SHA256.test(String(session.uploadRawEvidenceSha256 || ""))
    || session.status !== "prepared"
    || !Number.isFinite(createdAt)
    || createdAt > Date.now() + 5 * 60 * 1000
  ) fail("session_schema_invalid");
  return session;
}

export async function resolveControlledSessionDir(sessionDir) {
  if (!isAbsolute(String(sessionDir || ""))) fail("session_path_absolute_required");
  const resolved = resolve(sessionDir);
  const actual = await realpath(resolved).catch(() => "");
  if (!actual || !(await lstat(actual)).isDirectory()) fail("session_path_invalid");
  if (!allowedPrivateRoots().some((root) => isInsideOrEqual(root, actual))) fail("session_path_outside_private_root");
  if ((await lstat(resolved)).isSymbolicLink()) fail("session_path_invalid");
  return actual;
}

export function privateReferenceToPath(reference) {
  const value = String(reference || "");
  if (!value.startsWith("private://")) fail("attestation_reference_invalid");
  const relativePath = value.slice("private://".length);
  if (!relativePath || relativePath.split(/[\\/]/).includes("..")) fail("attestation_reference_invalid");
  return resolve(PRIVATE_ROOT, relativePath);
}

export function candidateTimestamp(repoRoot, commit) {
  return execFileSync("git", ["show", "-s", "--format=%cI", commit], {
    cwd: resolve(repoRoot),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function buildSessionRecord({ sessionId, createdAt, candidate, verified }) {
  return {
    schemaVersion: 1,
    sessionId,
    createdAt: createdAt.toISOString(),
    appId: N5C_APP_ID,
    packageVersion: candidate.version,
    runtimeCommit: candidate.runtimeCommit,
    archiveSha256: candidate.archive.sha256,
    uploadAttestationRef: verified.uploadReceiptRef,
    uploadRawEvidenceSha256: verified.rawEvidenceSha256,
    status: "prepared",
  };
}

function buildSessionId(version, date) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `n5c-${version}-${stamp}-${randomBytes(4).toString("hex")}`;
}

function assertSessionMatchesBinding(session, { candidate, verified }) {
  if (
    session.appId !== N5C_APP_ID
    || session.packageVersion !== candidate.version
    || session.runtimeCommit !== candidate.runtimeCommit
    || session.archiveSha256 !== candidate.archive.sha256
    || session.uploadAttestationRef !== verified.uploadReceiptRef
    || session.uploadRawEvidenceSha256 !== verified.rawEvidenceSha256
  ) fail("session_candidate_binding_mismatch");
}

function assertIsolatedCleanWorktree(repoRoot) {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (!branch || ["main", "master"].includes(branch)) fail("isolated_branch_required");
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (status) fail("clean_worktree_required");
}

async function assertControlledPrivateTarget(target) {
  if (!isAbsolute(target)) fail("session_path_absolute_required");
  const parent = dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const actualParent = await realpath(parent).catch(() => "");
  if (!actualParent || !allowedPrivateRoots().some((root) => isInsideOrEqual(root, actualParent))) {
    fail("session_path_outside_private_root");
  }
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail("session_path_invalid");
}

async function assertSessionPermissions(root) {
  const directories = [root, ...["descriptors", "media", "drafts"].map((name) => join(root, name))];
  for (const path of directories) {
    const info = await lstat(path).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("session_permissions_invalid");
  }
  for (const name of ["session.json", "allocation.json", "manifest.json", "run-sheet.md"]) {
    const info = await lstat(join(root, name)).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0) fail("session_permissions_invalid");
  }
}

function assertPlatformCoverage(allocation) {
  const groups = [
    REQUIRED_SCENARIOS.filter((id) => /guest|login|identity|session|logout/.test(id)),
    REQUIRED_SCENARIOS.filter((id) => id.startsWith("recommendation_")),
    REQUIRED_SCENARIOS.filter((id) => id.includes("cooking") || id === "offline_sync_recovery"),
    REQUIRED_SCENARIOS.filter((id) => id.startsWith("native_tab_")),
    REQUIRED_SCENARIOS.filter((id) => id.includes("household") || id.includes("meal_task_identity")),
    [...SHARE_SCENARIOS],
    REQUIRED_SCENARIOS.filter((id) => id.startsWith("poster_") || id.startsWith("reminder_")),
    [...PERFORMANCE_SCENARIOS],
  ];
  for (const ids of groups) {
    const platforms = new Set(ids.map((id) => N5C_DEVICE_SLOTS[allocation.scenarios[id].deviceSlot].platform));
    if (!platforms.has("iOS") || !platforms.has("Android")) fail("allocation_platform_coverage_invalid");
  }
}

function renderRunSheet(session, allocation) {
  const rows = REQUIRED_SCENARIOS.map((scenarioId, index) => {
    const assignment = allocation.scenarios[scenarioId];
    const checks = SCENARIO_CHECKS[scenarioId].join("、");
    const recipient = assignment.recipientSlot ? ` / 接收 ${assignment.recipientSlot}` : "";
    const budget = PERFORMANCE_BUDGETS_MS[scenarioId] ? ` / ≤${PERFORMANCE_BUDGETS_MS[scenarioId]}ms` : "";
    return `${index + 1}. [ ] \`${scenarioId}\` — ${assignment.deviceSlot}${recipient}${budget}\n   检查：${checks}`;
  }).join("\n");
  return `# Humi N5c 真机验收执行单\n\n- 会话：\`${session.sessionId}\`\n- AppID：\`${session.appId}\`\n- 体验版：\`${session.packageVersion}\`\n- 运行时：\`${session.runtimeCommit}\`\n- 初始事实：\`0/${REQUIRED_SCENARIOS.length}\`\n- 入口：从微信体验版打开 ${session.packageVersion}（不要使用历史二维码）\n\n> 只记录真实真机结果；不在此文件填写昵称、手机号、微信号、OpenID、聊天内容或家庭自由文本。\n\n${rows}\n`;
}

async function writePrivateJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

async function readJsonFile(path, code) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 512 * 1024) fail(code);
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === code) throw error;
    fail(code);
  }
}

function assertExactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) fail(code);
}

function allowedPrivateRoots() {
  const roots = [canonicalExistingPath(PRIVATE_ROOT)];
  if (process.env.NODE_ENV === "test" && process.env.HUMI_N5C_FIXTURE_MODE === "1") {
    roots.push(canonicalExistingPath(tmpdir()));
  }
  return roots;
}

function canonicalExistingPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isInsideOrEqual(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

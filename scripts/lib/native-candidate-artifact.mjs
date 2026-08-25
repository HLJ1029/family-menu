import { execFileSync } from "node:child_process";
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
  dirname,
  join,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const WECHAT_APP_ID = "wx4040b89f3b363416";
const WECHAT_MACHINE_ATTESTATION_SOURCE = "humi-wechat-upload-machine-attestation";
const WECHAT_CI_OUTPUT_SOURCE = "wechat-miniprogram-ci-upload-output";
const WECHAT_DEVTOOLS_CLI_OUTPUT_SOURCE = "wechat-devtools-cli-upload-output";
const WECHAT_VERSION_LIST_SOURCE = "wechat-platform-version-list-response";
const MAX_ATTESTATION_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PRODUCTION_WECHAT_MACHINE_KEYS = Object.freeze({
  "humi-wechat-upload-2026-07-28-a1": createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAthyT9Bmvxrr8ZBPwgocApzwR65rVLT34ZctgHWwTEoM=
-----END PUBLIC KEY-----`),
});

export async function assertNativeArtifactMatchesCommit({
  artifactPath,
  repoRoot,
  commit,
}) {
  const candidateArchive = resolve(String(artifactPath || ""));
  const repository = resolve(String(repoRoot || ""));
  const candidateCommit = String(commit || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidateCommit)) {
    throw new Error("candidate commit must be a full 40-character Git SHA");
  }
  const artifactStat = await lstat(candidateArchive).catch(() => null);
  if (!artifactStat?.isFile() || !candidateArchive.endsWith(".tar.gz")) {
    throw new Error(`native source archive is missing or invalid: ${candidateArchive}`);
  }

  const work = await mkdtemp(join(tmpdir(), "humi-native-artifact-check-"));
  try {
    const candidateRoot = join(work, "candidate");
    const expectedRoot = join(work, "expected");
    const expectedArchive = join(work, "expected.tar");
    await extractArchive(candidateArchive, candidateRoot, { gzip: true });
    execFileSync("git", [
      "archive",
      "--format=tar",
      `--output=${expectedArchive}`,
      candidateCommit,
      "miniprogram",
    ], {
      cwd: repository,
      stdio: ["ignore", "ignore", "pipe"],
    });
    await extractArchive(expectedArchive, expectedRoot, { gzip: false });

    const candidateMiniprogram = await findSingleMiniprogramRoot(candidateRoot);
    const expectedMiniprogram = resolve(expectedRoot, "miniprogram");
    const candidateManifest = await buildManifest(candidateMiniprogram);
    const expectedManifest = await buildManifest(expectedMiniprogram);
    if (JSON.stringify(candidateManifest) !== JSON.stringify(expectedManifest)) {
      const mismatch = firstMismatch(expectedManifest, candidateManifest);
      throw new Error(
        `native source archive does not match candidate commit ${candidateCommit}: ${mismatch}`,
      );
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return true;
}

export async function assertNativeRuntimeMatchesCommit({
  repoRoot,
  commit,
}) {
  const repository = resolve(String(repoRoot || ""));
  const uploadedCommit = String(commit || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(uploadedCommit)) {
    throw new Error("uploaded runtime commit must be a full 40-character Git SHA");
  }
  const changed = execFileSync(
    "git",
    ["diff", "--name-only", uploadedCommit, "--", "miniprogram"],
    {
      cwd: repository,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).split(/\r?\n/).filter(Boolean);
  if (changed.length) {
    throw new Error(
      `current miniprogram runtime differs from uploaded commit ${uploadedCommit}: ${changed.join(", ")}`,
    );
  }
  return true;
}

export async function verifyNativeCandidateUploadEvidence({
  candidate,
  repoRoot,
  evidenceBaseDir,
  uploadAttestationPath,
  uploadReceiptPath,
}) {
  return verifyNativeCandidateUploadEvidenceWithTrust({
    candidate,
    repoRoot,
    evidenceBaseDir,
    uploadAttestationPath: uploadAttestationPath || uploadReceiptPath,
    allowedRoots: [resolve(homedir(), ".humi-release-evidence")],
    trustedKeys: PRODUCTION_WECHAT_MACHINE_KEYS,
  });
}

export async function verifyTestOnlyNativeCandidateUploadEvidence({
  candidate,
  repoRoot,
  evidenceBaseDir,
  uploadAttestationPath,
  testOnlyTrustedKey,
}) {
  const testTrust = await buildTestOnlyWechatTrust(testOnlyTrustedKey);
  return verifyNativeCandidateUploadEvidenceWithTrust({
    candidate,
    repoRoot,
    evidenceBaseDir,
    uploadAttestationPath,
    ...testTrust,
  });
}

export async function verifyTestOnlyWechatUploadMachineAttestation({
  path,
  candidate,
  testOnlyTrustedKey,
}) {
  return verifyWechatUploadMachineAttestationBinding({
    path,
    candidate,
    ...await buildTestOnlyWechatTrust(testOnlyTrustedKey),
  });
}

async function verifyNativeCandidateUploadEvidenceWithTrust({
  candidate,
  repoRoot,
  evidenceBaseDir,
  uploadAttestationPath,
  allowedRoots,
  trustedKeys,
}) {
  const version = String(candidate?.version || "");
  if (!candidate?.actions?.miniprogramUploaded) return { uploaded: false, version };
  const artifactPath = resolve(
    String(evidenceBaseDir || ""),
    String(candidate?.archive?.path || ""),
  );
  const content = await readFile(artifactPath);
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (sha256 !== candidate.archive.sha256) {
    throw new Error(`native source archive sha256 mismatch: expected ${candidate.archive.sha256}, received ${sha256}`);
  }
  const attestation = await verifyWechatUploadMachineAttestationBinding({
    path: uploadAttestationPath,
    candidate,
    allowedRoots,
    trustedKeys,
  });
  await assertNativeArtifactMatchesCommit({
    artifactPath,
    repoRoot,
    commit: candidate.runtimeCommit,
  });
  await assertNativeRuntimeMatchesCommit({
    repoRoot,
    commit: candidate.runtimeCommit,
  });
  const commitAt = Number(execFileSync(
    "git",
    ["show", "-s", "--format=%ct", candidate.runtimeCommit],
    {
      cwd: resolve(String(repoRoot || "")),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim()) * 1_000;
  if (!Number.isFinite(commitAt) || commitAt <= 0) {
    throw new Error("candidate commit timestamp is invalid");
  }
  assertTimestampOrder([
    ["candidate commit", commitAt],
    ["upload start", attestation.uploadStartedAt],
    ["upload completion", attestation.uploadCompletedAt],
    ["evidence capture", attestation.capturedAt],
    ["machine attestation", attestation.attestedAt],
  ]);
  return {
    uploaded: true,
    version,
    runtimeCommit: candidate.runtimeCommit,
    artifactPath,
    sha256,
    uploadReceiptRef: attestation.attestationRef,
    rawEvidenceSha256: attestation.rawEvidenceSha256,
    attestationKeyId: attestation.keyId,
  };
}

export async function verifyWechatUploadReceiptBinding({ path, candidate }) {
  return verifyWechatUploadMachineAttestationBinding({
    path,
    candidate,
    allowedRoots: [resolve(homedir(), ".humi-release-evidence")],
    trustedKeys: PRODUCTION_WECHAT_MACHINE_KEYS,
  });
}

async function verifyWechatUploadMachineAttestationBinding({
  path,
  candidate,
  allowedRoots,
  trustedKeys,
}) {
  const configuredPath = String(path || "").trim();
  if (!isAbsolute(configuredPath)) {
    throw new Error("a controlled absolute WeChat upload receipt machine-attestation path is required");
  }
  const actualPath = await realpath(configuredPath).catch(() => "");
  if (!actualPath || !allowedRoots.some((root) => isInsideOrEqual(root, actualPath))) {
    throw new Error("trusted machine attestation must be a controlled private evidence file");
  }
  const attestation = JSON.parse(await readFile(actualPath, "utf8"));
  if (attestation?.source !== WECHAT_MACHINE_ATTESTATION_SOURCE) {
    throw new Error("WeChat upload evidence requires a trusted machine attestation");
  }
  assertExactKeys(attestation, [
    "schemaVersion",
    "source",
    "attestationRef",
    "keyId",
    "appId",
    "candidate",
    "rawEvidence",
    "capturedAt",
    "attestedAt",
    "signature",
  ], "WeChat upload machine attestation");
  assertExactKeys(
    attestation.candidate,
    ["version", "runtimeCommit", "archiveSha256"],
    "WeChat upload machine attestation candidate",
  );
  assertExactKeys(
    attestation.rawEvidence,
    ["kind", "path", "sha256"],
    "WeChat upload machine attestation rawEvidence",
  );
  if (attestation.schemaVersion !== 1) {
    throw new Error("WeChat upload machine attestation schemaVersion must be 1");
  }
  if (attestation.appId !== WECHAT_APP_ID) {
    throw new Error("WeChat upload machine attestation AppID is invalid");
  }
  if (attestation.attestationRef !== candidate.uploadReceiptRef) {
    throw new Error("WeChat upload machine attestation reference does not match candidate");
  }
  if (attestation.candidate.version !== candidate.version) {
    throw new Error("WeChat upload machine attestation version does not match candidate");
  }
  if (attestation.candidate.runtimeCommit !== candidate.runtimeCommit) {
    throw new Error("WeChat upload machine attestation commit does not match candidate");
  }
  if (attestation.candidate.archiveSha256 !== candidate.archive.sha256) {
    throw new Error("WeChat upload machine attestation archive SHA-256 does not match candidate");
  }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(attestation.keyId || ""))) {
    throw new Error("WeChat upload machine attestation key ID is invalid");
  }
  const trustedKey = trustedKeys[attestation.keyId];
  if (!trustedKey) {
    throw new Error(
      "official WeChat upload authenticity cannot be verified: no trusted machine attestation key is configured",
    );
  }
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(String(attestation.signature || ""))) {
    throw new Error("WeChat upload machine attestation signature is invalid");
  }
  const unsigned = { ...attestation };
  delete unsigned.signature;
  if (!verifySignature(
    null,
    Buffer.from(canonicalJson(unsigned)),
    trustedKey,
    Buffer.from(attestation.signature, "base64url"),
  )) {
    throw new Error("WeChat upload machine attestation signature is invalid");
  }

  const rawRelativePath = String(attestation.rawEvidence.path || "");
  if (
    !rawRelativePath
    || isAbsolute(rawRelativePath)
    || rawRelativePath.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    throw new Error("WeChat upload raw evidence path must stay beside its machine attestation");
  }
  const rawPath = await realpath(resolve(dirname(actualPath), rawRelativePath)).catch(() => "");
  if (!rawPath || !isInsideOrEqual(dirname(actualPath), rawPath)) {
    throw new Error("WeChat upload raw evidence must stay beside its machine attestation");
  }
  const rawBytes = await readFile(rawPath);
  const rawEvidenceSha256 = createHash("sha256").update(rawBytes).digest("hex");
  if (rawEvidenceSha256 !== attestation.rawEvidence.sha256) {
    throw new Error("WeChat upload raw evidence SHA-256 does not match its machine attestation");
  }
  const rawEvidence = JSON.parse(rawBytes.toString("utf8"));
  if (attestation.rawEvidence.kind !== rawEvidence?.source) {
    throw new Error("WeChat upload raw evidence kind does not match its machine attestation");
  }
  const official = validateOfficialWechatUploadEvidence(rawEvidence, candidate);
  const capturedAt = parseUtcTimestamp(attestation.capturedAt, "evidence capturedAt");
  const attestedAt = parseUtcTimestamp(attestation.attestedAt, "machine attestedAt");
  assertTimestampOrder([
    ["upload start", official.uploadStartedAt],
    ["upload completion", official.uploadCompletedAt],
    ["evidence capture", capturedAt],
    ["machine attestation", attestedAt],
  ]);
  if (attestedAt > Date.now() + MAX_ATTESTATION_CLOCK_SKEW_MS) {
    throw new Error("WeChat upload machine attestation timestamp is unreasonably in the future");
  }
  return {
    attestationRef: attestation.attestationRef,
    keyId: attestation.keyId,
    rawEvidenceSha256,
    uploadStartedAt: official.uploadStartedAt,
    uploadCompletedAt: official.uploadCompletedAt,
    capturedAt,
    attestedAt,
  };
}

function validateOfficialWechatUploadEvidence(evidence, candidate) {
  if (evidence?.source === WECHAT_DEVTOOLS_CLI_OUTPUT_SOURCE) {
    assertExactKeys(evidence, [
      "schemaVersion",
      "source",
      "operation",
      "appId",
      "version",
      "description",
      "invocationStartedAt",
      "uploadCompletedAt",
      "exitCode",
      "stdout",
      "stderr",
      "infoOutput",
    ], "WeChat DevTools CLI upload output");
    if (evidence.schemaVersion !== 1 || evidence.operation !== "upload") {
      throw new Error("WeChat DevTools CLI upload output contract is invalid");
    }
    if (evidence.appId !== WECHAT_APP_ID || evidence.version !== candidate.version) {
      throw new Error("WeChat DevTools CLI upload output does not match candidate");
    }
    if (
      typeof evidence.description !== "string"
      || !evidence.description.trim()
      || evidence.description.length > 120
    ) {
      throw new Error("WeChat DevTools CLI upload description is invalid");
    }
    if (
      evidence.exitCode !== 0
      || typeof evidence.stdout !== "string"
      || evidence.stdout.length > 20_000
      || typeof evidence.stderr !== "string"
      || evidence.stderr.length > 20_000
      || !/(?:^|\n)✔ upload(?:\n|$)/u.test(`${evidence.stdout}\n${evidence.stderr}`)
    ) {
      throw new Error("WeChat DevTools CLI did not report a successful upload");
    }
    validateWechatDevtoolsInfoOutput(evidence.infoOutput);
    return {
      uploadStartedAt: parseUtcTimestamp(
        evidence.invocationStartedAt,
        "WeChat DevTools CLI invocationStartedAt",
      ),
      uploadCompletedAt: parseUtcTimestamp(
        evidence.uploadCompletedAt,
        "WeChat DevTools CLI uploadCompletedAt",
      ),
    };
  }
  if (evidence?.source === WECHAT_CI_OUTPUT_SOURCE) {
    assertExactKeys(evidence, [
      "schemaVersion",
      "source",
      "operation",
      "appId",
      "version",
      "invocationStartedAt",
      "uploadCompletedAt",
      "result",
    ], "WeChat miniprogram-ci upload output");
    if (evidence.schemaVersion !== 1 || evidence.operation !== "upload") {
      throw new Error("WeChat miniprogram-ci upload output contract is invalid");
    }
    if (evidence.appId !== WECHAT_APP_ID || evidence.version !== candidate.version) {
      throw new Error("WeChat miniprogram-ci upload output does not match candidate");
    }
    if (!evidence.result || typeof evidence.result !== "object" || Array.isArray(evidence.result)) {
      throw new Error("WeChat miniprogram-ci upload result is invalid");
    }
    const allowedResultKeys = new Set(["subPackageInfo", "pluginInfo", "devPluginId"]);
    if (Object.keys(evidence.result).some((key) => !allowedResultKeys.has(key))) {
      throw new Error("WeChat miniprogram-ci upload result contains an unexpected field");
    }
    return {
      uploadStartedAt: parseUtcTimestamp(
        evidence.invocationStartedAt,
        "miniprogram-ci invocationStartedAt",
      ),
      uploadCompletedAt: parseUtcTimestamp(
        evidence.uploadCompletedAt,
        "miniprogram-ci uploadCompletedAt",
      ),
    };
  }
  if (evidence?.source === WECHAT_VERSION_LIST_SOURCE) {
    assertExactKeys(evidence, [
      "schemaVersion",
      "source",
      "appId",
      "requestStartedAt",
      "responseReceivedAt",
      "response",
    ], "WeChat platform version-list response");
    assertExactKeys(
      evidence.response,
      ["errcode", "errmsg", "experienceVersion"],
      "WeChat platform version-list response body",
    );
    assertExactKeys(
      evidence.response.experienceVersion,
      ["version", "uploadedAt"],
      "WeChat platform experience version",
    );
    if (
      evidence.schemaVersion !== 1
      || evidence.appId !== WECHAT_APP_ID
      || evidence.response.errcode !== 0
      || evidence.response.errmsg !== "ok"
      || evidence.response.experienceVersion.version !== candidate.version
    ) {
      throw new Error("WeChat platform version-list response does not match candidate");
    }
    const uploadedAt = parseUtcTimestamp(
      evidence.response.experienceVersion.uploadedAt,
      "platform experience uploadedAt",
    );
    const requestedAt = parseUtcTimestamp(
      evidence.requestStartedAt,
      "platform version-list requestStartedAt",
    );
    const receivedAt = parseUtcTimestamp(
      evidence.responseReceivedAt,
      "platform version-list responseReceivedAt",
    );
    assertTimestampOrder([
      ["platform upload", uploadedAt],
      ["version-list request", requestedAt],
      ["version-list response", receivedAt],
    ]);
    return {
      uploadStartedAt: uploadedAt,
      uploadCompletedAt: uploadedAt,
    };
  }
  throw new Error("raw evidence is not official WeChat upload output or a platform version-list response");
}

function validateWechatDevtoolsInfoOutput(infoOutput) {
  assertExactKeys(infoOutput, ["size"], "WeChat DevTools CLI info output");
  assertExactKeys(infoOutput.size, ["total", "packages"], "WeChat DevTools CLI size output");
  const { total, packages } = infoOutput.size;
  if (!Number.isSafeInteger(total) || total <= 0 || !Array.isArray(packages) || packages.length < 2) {
    throw new Error("WeChat DevTools CLI package size output is invalid");
  }
  let declaredTotal = null;
  let packageTotal = 0;
  const names = new Set();
  for (const entry of packages) {
    assertExactKeys(entry, ["name", "size"], "WeChat DevTools CLI package size entry");
    if (
      typeof entry.name !== "string"
      || !/^(?:TOTAL|main|\/[A-Za-z0-9_-]+\/)$/.test(entry.name)
      || names.has(entry.name)
      || !Number.isSafeInteger(entry.size)
      || entry.size < 0
    ) {
      throw new Error("WeChat DevTools CLI package size entry is invalid");
    }
    names.add(entry.name);
    if (entry.name === "TOTAL") declaredTotal = entry.size;
    else packageTotal += entry.size;
  }
  if (declaredTotal !== total || packageTotal !== total || !names.has("main")) {
    throw new Error("WeChat DevTools CLI package totals do not reconcile");
  }
}

function parseUtcTimestamp(value, label) {
  const normalized = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized)) {
    throw new Error(`${label} must be an ISO UTC timestamp`);
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

function assertTimestampOrder(entries) {
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index][1] < entries[index - 1][1]) {
      throw new Error(
        `WeChat upload timestamp ordering is invalid: ${entries[index][0]} predates ${entries[index - 1][0]}`,
      );
    }
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function buildTestOnlyWechatTrust(testOnlyTrustedKey) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("test-only WeChat upload verifier is unavailable outside NODE_ENV=test");
  }
  const keyId = String(testOnlyTrustedKey?.keyId || "");
  if (!/^test-only-[A-Za-z0-9_-]+$/.test(keyId)) {
    throw new Error("test-only WeChat upload verifier requires an explicit test-only key ID");
  }
  return {
    allowedRoots: [await realpath(tmpdir())],
    trustedKeys: { [keyId]: createPublicKey(testOnlyTrustedKey.publicKey) },
  };
}

async function extractArchive(archivePath, targetRoot, { gzip }) {
  await mkdir(targetRoot, { recursive: true });
  const listArgs = gzip ? ["-tzf", archivePath] : ["-tf", archivePath];
  const entries = execFileSync("tar", listArgs, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  }).split(/\r?\n/).filter(Boolean);
  for (const entry of entries) {
    const normalized = entry.replace(/\/+$/, "");
    if (
      normalized.startsWith("/")
      || normalized.split("/").some((segment) => segment === "..")
      || normalized.includes("\0")
    ) {
      throw new Error(`unsafe native source archive entry: ${entry}`);
    }
  }
  const extractArgs = gzip
    ? ["-xzf", archivePath, "-C", targetRoot]
    : ["-xf", archivePath, "-C", targetRoot];
  execFileSync("tar", extractArgs, { stdio: ["ignore", "ignore", "pipe"] });
}

async function findSingleMiniprogramRoot(root) {
  const candidates = [];
  const filesOutsideCandidates = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`native source archive may not contain symbolic links: ${relative(root, absolute)}`);
      }
      if (entry.isDirectory()) {
        if (entry.name === "miniprogram") candidates.push(absolute);
        else await visit(absolute);
      } else {
        filesOutsideCandidates.push(absolute);
      }
    }
  }

  await visit(root);
  if (candidates.length !== 1) {
    throw new Error("native source archive must contain exactly one miniprogram directory");
  }
  const miniprogramRoot = candidates[0];
  for (const file of filesOutsideCandidates) {
    if (!isInside(miniprogramRoot, file)) {
      throw new Error(`native source archive contains an unexpected file: ${relative(root, file)}`);
    }
  }
  return miniprogramRoot;
}

async function buildManifest(root) {
  const rootStat = await lstat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`missing miniprogram directory: ${root}`);
  const entries = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`native source archive may not contain symbolic links: ${path}`);
      }
      if (stat.isDirectory()) {
        entries.push({ path, type: "directory" });
        await visit(absolute);
      } else if (stat.isFile()) {
        const content = await readFile(absolute);
        entries.push({
          path,
          type: "file",
          executable: Boolean(stat.mode & 0o111),
          bytes: content.length,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      } else {
        throw new Error(`native source archive contains an unsupported entry: ${path}`);
      }
    }
  }

  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function firstMismatch(expected, actual) {
  const limit = Math.max(expected.length, actual.length);
  for (let index = 0; index < limit; index += 1) {
    if (JSON.stringify(expected[index]) !== JSON.stringify(actual[index])) {
      return `entry ${index + 1} expected ${describe(expected[index])}, received ${describe(actual[index])}`;
    }
  }
  return "manifest differs";
}

function describe(entry) {
  if (!entry) return "(missing)";
  return `${entry.type}:${entry.path}`;
}

function isInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== "..";
}

function isInsideOrEqual(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an exact object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must use the exact key set`);
  }
}

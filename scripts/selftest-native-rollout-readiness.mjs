import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNativeArtifactMatchesCommit,
  verifyNativeCandidateUploadEvidence,
  verifyTestOnlyNativeCandidateUploadEvidence,
} from "./lib/native-candidate-artifact.mjs";
import {
  extractNativeCandidateArtifactPath,
  extractNativeCandidateCommit,
  findForbiddenRuntimeFindings,
  resolveExternalHandoffPath,
  validateNativeCandidateEvidence,
  validateNativeCandidateState,
} from "./lib/native-rollout-readiness-policy.mjs";
import {
  assertNativeRuntimeMatchesCommit,
} from "./lib/native-candidate-artifact.mjs";
import { runNativeRollbackDrill } from "./lib/native-rollout-drill.mjs";
import { CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION } from "./release-candidate.mjs";

process.env.NODE_ENV = "test";

const safeFindings = findForbiddenRuntimeFindings([
  {
    path: "miniprogram/utils/plugin-state.js",
    source: 'const pluginWord = "plugin"; const pluginReady = true; const picker = "plugin://address-picker";',
  },
]);
assert.deepEqual(safeFindings, [], "the ordinary word plugin must not be treated as an ad");

const unsafeFindings = findForbiddenRuntimeFindings([
  {
    path: "api/telemetry-secret.js",
    source: 'const HUMI_TELEMETRY_HASH_SALT = "0123456789abcdef0123456789abcdef";',
  },
  {
    path: "api/camel-secrets.js",
    source: [
      'const telemetryHashSalt = "abcdef0123456789abcdef0123456789";',
      'const wechatAppSecret = "abcdef0123456789abcdef0123456789";',
      'const apiKey = "abcdef0123456789abcdef0123456789";',
    ].join("\n"),
  },
  {
    path: "miniprogram/pages/ads/index.wxml",
    source: '<ad-banner unit-id="candidate-ad"></ad-banner><ad-slot></ad-slot>',
  },
  {
    path: "miniprogram/pages/ads/index.json",
    source: JSON.stringify({
      usingComponents: {
        promotion: "/components/ad-banner/index",
      },
    }),
  },
]);
assert.deepEqual(
  new Set(unsafeFindings.map((finding) => finding.category)),
  new Set(["credential", "ad"]),
  "hash salts, camelCase credential literals, ad-banner/ad-slot, and ad component paths must be rejected",
);
for (const expectedPath of [
  "api/telemetry-secret.js",
  "api/camel-secrets.js",
  "miniprogram/pages/ads/index.wxml",
  "miniprogram/pages/ads/index.json",
]) {
  assert(
    unsafeFindings.some((finding) => finding.path === expectedPath),
    `${expectedPath} must produce a forbidden runtime finding`,
  );
}

assert.equal(
  extractNativeCandidateCommit("- 提交：`d05816c00f6d490a7dcb780a9461880ff44d9cd4`"),
  "d05816c00f6d490a7dcb780a9461880ff44d9cd4",
);
assert.throws(
  () => extractNativeCandidateCommit([
    "- 提交：`d05816c00f6d490a7dcb780a9461880ff44d9cd4`",
    "- 提交：`612dac2c6e6d90de737deac314d6cc6e6a841bc9`",
  ].join("\n")),
  /exactly one candidate commit/,
);
assert.equal(
  extractNativeCandidateArtifactPath([
    "| Version | Role | Path | Size | SHA256 | Status |",
    "| --- | --- | --- | ---: | --- | --- |",
    "| native-shell-uploaded-1.1.74 | 已上传小程序原生源码归档 | /tmp/humi-native-shell-1.1.74-abcd123.tar.gz | 123 | deadbeef | preview |",
    "| native-shell-preview-1.1.74-old | 历史 N4 原生源码归档 | /tmp/humi-native-shell-1.1.74-old.tar.gz | 123 | deadbeef | superseded |",
  ].join("\n"), { expectedVersion: "1.1.74" }),
  "/tmp/humi-native-shell-1.1.74-abcd123.tar.gz",
);
assert.throws(
  () => extractNativeCandidateArtifactPath([
    "| Version | Role | Path | Size | SHA256 | Status |",
    "| --- | --- | --- | ---: | --- | --- |",
    "| native-shell-uploaded-1.1.74-a | 已上传小程序原生源码归档 | /tmp/a.tar.gz | 123 | deadbeef | preview |",
    "| native-shell-uploaded-1.1.74-b | 已上传小程序原生源码归档 | /tmp/b.tar.gz | 123 | deadbeef | preview |",
  ].join("\n"), { expectedVersion: "1.1.74" }),
  /exactly one current uploaded native source archive/,
);
assert.equal(
  resolveExternalHandoffPath({
    handoffPath: "  /tmp/humi-native-handoff.md  ",
    localContractOnly: false,
  }),
  "/tmp/humi-native-handoff.md",
);
assert.equal(
  resolveExternalHandoffPath({ handoffPath: "", localContractOnly: true }),
  "",
);
assert.throws(
  () => resolveExternalHandoffPath({ handoffPath: "", localContractOnly: false }),
  /HUMI_NATIVE_HANDOFF_PATH is required/,
);

const immutableUploadEvidenceFixture = {
  schemaVersion: 1,
  candidate: {
    version: "1.1.75",
    status: "uploaded-experience",
    runtimeCommit: "a".repeat(40),
    archive: {
      path: "/tmp/humi-native-shell-1.1.75.tar.gz",
      sha256: "b".repeat(64),
      sizeBytes: 140710,
    },
    uploadEvidence: { rawEvidenceSha256: "c".repeat(64) },
    uploadReceiptRef: "private://n5b/upload-attestation-1.1.75",
    actions: {
      productionApiDeployed: true,
      h5Deployed: true,
      miniprogramUploaded: true,
      wechatReviewSubmitted: false,
      wechatReleased: false,
      nativeAllowlistEnabled: false,
    },
    trueDeviceEvidence: { passed: 0, required: 56 },
  },
};
assert.equal(
  validateNativeCandidateEvidence(immutableUploadEvidenceFixture, { expectedVersion: "1.1.75" }).archive.sizeBytes,
  140710,
  "an uploaded candidate must retain its immutable archive byte count",
);
assert.throws(
  () => validateNativeCandidateEvidence({
    ...immutableUploadEvidenceFixture,
    candidate: {
      ...immutableUploadEvidenceFixture.candidate,
      uploadEvidence: { rawEvidenceSha256: "not-a-sha" },
    },
  }, { expectedVersion: "1.1.75" }),
  /rawEvidenceSha256/,
  "an uploaded candidate must reject an unpinned raw CLI evidence hash",
);

const n4CandidateYaml = [
  "```yaml",
  "native_shell_candidate:",
  "  status: preview",
  "  package_version: 1.1.74",
  "  ads: excluded",
  "  production_api_deployed: false",
  "  h5_deployed: false",
  "  miniprogram_uploaded: false",
  "  wechat_review_submitted: false",
  "  wechat_released: false",
  "  native_allowlist_enabled: false",
  "  true_device_evidence: 0/56",
  "```",
].join("\n");
const n4ExternalActions = {
  production_api_deployed: false,
  h5_deployed: false,
  miniprogram_uploaded: false,
  wechat_review_submitted: false,
  wechat_released: false,
  native_allowlist_enabled: false,
};
assert.deepEqual(validateNativeCandidateState(n4CandidateYaml, {
  expectedExternalActions: n4ExternalActions,
  expectedTrueDeviceEvidence: "0/56",
}), {
  status: "preview",
  package_version: "1.1.74",
  ads: "excluded",
  production_api_deployed: false,
  h5_deployed: false,
  miniprogram_uploaded: false,
  wechat_review_submitted: false,
  wechat_released: false,
  native_allowlist_enabled: false,
  true_device_evidence: "0/56",
});
const n5bCandidateYaml = n4CandidateYaml
  .replace("  production_api_deployed: false", "  production_api_deployed: true")
  .replace("  h5_deployed: false", "  h5_deployed: true")
  .replace("  miniprogram_uploaded: false", "  miniprogram_uploaded: true")
  .replace("  true_device_evidence: 0/56", "  true_device_evidence: 0/36");
const n5bExternalActions = {
  ...n4ExternalActions,
  production_api_deployed: true,
  h5_deployed: true,
  miniprogram_uploaded: true,
};
assert.deepEqual(
  validateNativeCandidateState(n5bCandidateYaml, {
    expectedExternalActions: n5bExternalActions,
    expectedTrueDeviceEvidence: "0/36",
  }).miniprogram_uploaded,
  true,
);
const currentCandidateYaml = n4CandidateYaml
  .replace("  status: preview", "  status: local-candidate")
  .replace("  package_version: 1.1.74", "  package_version: 1.1.75")
  .replace("  production_api_deployed: false", "  production_api_deployed: true")
  .replace("  h5_deployed: false", "  h5_deployed: true");
const currentCandidateActions = {
  ...n4ExternalActions,
  production_api_deployed: true,
  h5_deployed: true,
};
assert.deepEqual(
  validateNativeCandidateState(currentCandidateYaml, {
    expectedPackageVersion: "1.1.75",
    expectedStatus: "local-candidate",
    expectedExternalActions: currentCandidateActions,
    expectedTrueDeviceEvidence: "0/56",
  }).miniprogram_uploaded,
  false,
  "the current 1.1.75 candidate must remain explicitly unuploaded",
);
assert.throws(
  () => validateNativeCandidateState(`${n4CandidateYaml}\n${n4CandidateYaml}`, {
    expectedExternalActions: n4ExternalActions,
  }),
  /exactly one native_shell_candidate block/,
);
assert.throws(
  () => validateNativeCandidateState(n4CandidateYaml.replace(
    "  h5_deployed: false",
    "  h5_deployed: false\n  h5_deployed: true",
  ), { expectedExternalActions: n4ExternalActions }),
  /duplicate candidate key/,
);
assert.throws(
  () => validateNativeCandidateState(n5bCandidateYaml.replace(
    "  wechat_released: false",
    "  wechat_released: true",
  ), { expectedExternalActions: n5bExternalActions }),
  /wechat_released must equal false/,
);
assert.throws(
  () => validateNativeCandidateState(n4CandidateYaml.replace(
    "  true_device_evidence: 0/56",
    "  true_device_evidence: 0/56\n  unreviewed_release_state: true",
  ), { expectedExternalActions: n4ExternalActions }),
  /unexpected candidate key/,
  "candidate state must use the exact reviewed key set",
);
assert.throws(
  () => validateNativeCandidateState([
    n4CandidateYaml,
    "```yaml",
    "native_shell_candidate: { status: approved, miniprogram_uploaded: true }",
    "```",
  ].join("\n"), { expectedExternalActions: n4ExternalActions }),
  /noncanonical YAML syntax/,
  "a second flow-style candidate mapping must not hide an approved/uploaded state",
);
assert.throws(
  () => validateNativeCandidateState([
    n4CandidateYaml,
    "```yaml",
    "release: { miniprogram_uploaded: true }",
    "```",
  ].join("\n"), { expectedExternalActions: n4ExternalActions }),
  /noncanonical YAML syntax/,
  "a flow-style release mapping must not hide an uploaded state",
);
assert.throws(
  () => validateNativeCandidateState([
    n4CandidateYaml,
    "```yaml",
    "release:",
    "  miniprogram_uploaded: true",
    "```",
  ].join("\n"), { expectedExternalActions: n4ExternalActions }),
  /candidate key outside canonical block/,
);
assert.throws(
  () => validateNativeCandidateState([
    n4CandidateYaml,
    "```yaml",
    "release:",
    "  status: approved",
    "```",
  ].join("\n"), { expectedExternalActions: n4ExternalActions }),
  /(?:candidate key outside canonical block|unexpected structured YAML outside canonical block)/,
);
for (const maliciousYaml of [
  "defaults: &uploaded",
  "release: *uploaded",
  "release: !uploaded true",
  "release: !<tag:example.com,2026:uploaded> true",
  "release: |\n  miniprogram_uploaded: true",
  "release: >-\n  miniprogram_uploaded: true",
  "release:\tfalse",
  "release: [miniprogram_uploaded, true]",
]) {
  assert.throws(
    () => validateNativeCandidateState(`${n4CandidateYaml}\n\`\`\`yaml\n${maliciousYaml}\n\`\`\``, {
      expectedExternalActions: n4ExternalActions,
    }),
    /noncanonical YAML syntax/,
    `noncanonical YAML must fail closed: ${maliciousYaml}`,
  );
}

const artifactFixture = await mkdtemp(join(tmpdir(), "humi-native-artifact-selftest-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: artifactFixture });
  execFileSync("git", ["config", "user.name", "Humi Selftest"], { cwd: artifactFixture });
  execFileSync("git", ["config", "user.email", "humi-selftest@example.invalid"], { cwd: artifactFixture });
  await mkdir(join(artifactFixture, "miniprogram"), { recursive: true });
  await writeFile(join(artifactFixture, "miniprogram", "app.js"), "module.exports = 'old';\n");
  execFileSync("git", ["add", "miniprogram"], { cwd: artifactFixture });
  execFileSync("git", ["commit", "-q", "-m", "old candidate"], { cwd: artifactFixture });
  const oldCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: artifactFixture, encoding: "utf8" }).trim();
  const oldArchive = join(artifactFixture, "old.tar.gz");
  execFileSync("git", [
    "archive",
    "--format=tar.gz",
    "--prefix=humi-native-shell-1.1.74/",
    `--output=${oldArchive}`,
    oldCommit,
    "miniprogram",
  ], { cwd: artifactFixture });

  await writeFile(join(artifactFixture, "miniprogram", "app.js"), "module.exports = 'new';\n");
  execFileSync("git", ["add", "miniprogram"], { cwd: artifactFixture });
  execFileSync("git", ["commit", "-q", "-m", "new candidate"], { cwd: artifactFixture });
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: artifactFixture, encoding: "utf8" }).trim();
  const currentArchive = join(artifactFixture, "current.tar.gz");
  execFileSync("git", [
    "archive",
    "--format=tar.gz",
    "--prefix=humi-native-shell-1.1.75/",
    `--output=${currentArchive}`,
    currentCommit,
    "miniprogram",
  ], { cwd: artifactFixture });

  await assertNativeArtifactMatchesCommit({
    artifactPath: currentArchive,
    repoRoot: artifactFixture,
    commit: currentCommit,
  });
  const currentArchiveSha256 = execFileSync("shasum", ["-a", "256", currentArchive], {
    encoding: "utf8",
  }).trim().split(/\s+/)[0];
  const uploadReceiptRef = "private://n5c/upload-receipt-1.1.75";
  const uploadReceiptPath = join(artifactFixture, "wechat-upload-receipt.json");
  await writeFile(uploadReceiptPath, JSON.stringify({
    schemaVersion: 1,
    source: "wechat-mp-console-upload-receipt",
    receiptRef: uploadReceiptRef,
    appId: "wx4040b89f3b363416",
    candidate: {
      version: "1.1.75",
      runtimeCommit: currentCommit,
      archiveSha256: currentArchiveSha256,
    },
    uploadedAt: "2026-07-28T08:00:00.000Z",
  }, null, 2));
  await assert.rejects(
    verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: currentCommit,
        archive: { path: currentArchive, sha256: currentArchiveSha256 },
        uploadReceiptRef,
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
    }),
    /upload receipt/i,
    "a local archive and boolean must not prove a WeChat upload",
  );
  await assert.rejects(
    verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: currentCommit,
        archive: { path: currentArchive, sha256: currentArchiveSha256 },
        uploadReceiptRef,
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadReceiptPath,
      allowTestReceiptFixture: true,
    }),
    /trusted machine attestation|authenticity cannot be verified/i,
    "a hand-authored metadata receipt must not advance the upload checkpoint even in fixture mode",
  );
  const uploadedCandidate = {
    version: "1.1.75",
    status: "uploaded-experience",
    runtimeCommit: currentCommit,
    archive: { path: currentArchive, sha256: currentArchiveSha256 },
    uploadReceiptRef,
    actions: { miniprogramUploaded: true },
  };
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const machineEvidence = await writeTestOnlyUploadMachineAttestation({
    directory: artifactFixture,
    candidate: uploadedCandidate,
    privateKey,
    keyId: "test-only-ed25519-selftest",
  });
  assert.deepEqual(
    await verifyTestOnlyNativeCandidateUploadEvidence({
      candidate: uploadedCandidate,
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: machineEvidence.attestationPath,
      testOnlyTrustedKey: {
        keyId: "test-only-ed25519-selftest",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
    }),
    {
      uploaded: true,
      version: "1.1.75",
      runtimeCommit: currentCommit,
      artifactPath: currentArchive,
      sha256: currentArchiveSha256,
      uploadReceiptRef,
      rawEvidenceSha256: machineEvidence.rawEvidenceSha256,
      attestationKeyId: "test-only-ed25519-selftest",
    },
    "a cryptographically bound machine-output fixture keeps the positive contract testable",
  );
  const devtoolsMachineEvidence = await writeTestOnlyDevtoolsUploadMachineAttestation({
    directory: artifactFixture,
    candidate: uploadedCandidate,
    privateKey,
    keyId: "test-only-ed25519-selftest",
  });
  assert.deepEqual(
    await verifyTestOnlyNativeCandidateUploadEvidence({
      candidate: uploadedCandidate,
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: devtoolsMachineEvidence.attestationPath,
      testOnlyTrustedKey: {
        keyId: "test-only-ed25519-selftest",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
    }),
    {
      uploaded: true,
      version: "1.1.75",
      runtimeCommit: currentCommit,
      artifactPath: currentArchive,
      sha256: currentArchiveSha256,
      uploadReceiptRef,
      rawEvidenceSha256: devtoolsMachineEvidence.rawEvidenceSha256,
      attestationKeyId: "test-only-ed25519-selftest",
    },
    "a signed official WeChat DevTools CLI info-output must prove the uploaded candidate",
  );
  await assert.rejects(
    verifyNativeCandidateUploadEvidence({
      candidate: uploadedCandidate,
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: machineEvidence.attestationPath,
    }),
    /trusted machine attestation|authenticity cannot be verified/i,
    "the production verifier must not trust the test-only attestation key",
  );
  const reordered = {
    ...machineEvidence.attestation,
    capturedAt: new Date(Date.parse(machineEvidence.rawEvidence.uploadCompletedAt) - 1).toISOString(),
  };
  await writeSignedTestAttestation(machineEvidence.attestationPath, reordered, privateKey);
  await assert.rejects(
    verifyTestOnlyNativeCandidateUploadEvidence({
      candidate: uploadedCandidate,
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: machineEvidence.attestationPath,
      testOnlyTrustedKey: {
        keyId: "test-only-ed25519-selftest",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
    }),
    /timestamp ordering/i,
    "attestation capture must not predate the official upload completion output",
  );
  await writeSignedTestAttestation(
    machineEvidence.attestationPath,
    machineEvidence.attestation,
    privateKey,
  );
  await writeFile(machineEvidence.rawEvidencePath, `${JSON.stringify(machineEvidence.rawEvidence)}\n `);
  await assert.rejects(
    verifyTestOnlyNativeCandidateUploadEvidence({
      candidate: uploadedCandidate,
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: machineEvidence.attestationPath,
      testOnlyTrustedKey: {
        keyId: "test-only-ed25519-selftest",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
    }),
    /raw evidence SHA-256/i,
    "post-attestation edits to the raw WeChat output must be detected",
  );
  await writeFile(machineEvidence.rawEvidencePath, machineEvidence.rawEvidenceBytes);
  assert.deepEqual(
    await verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "local-candidate",
        runtimeCommit: null,
        archive: null,
        uploadReceiptRef: null,
        actions: { miniprogramUploaded: false },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
    }),
    { uploaded: false, version: "1.1.75" },
  );
  await assert.rejects(
    verifyTestOnlyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: oldCommit,
        archive: { path: currentArchive, sha256: currentArchiveSha256 },
        uploadReceiptRef,
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: machineEvidence.attestationPath,
      testOnlyTrustedKey: {
        keyId: "test-only-ed25519-selftest",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
    }),
    /machine attestation commit does not match candidate/i,
  );
  await assert.rejects(
    verifyTestOnlyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: currentCommit,
        archive: { path: currentArchive, sha256: "b".repeat(64) },
        uploadReceiptRef,
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
      uploadAttestationPath: machineEvidence.attestationPath,
      testOnlyTrustedKey: {
        keyId: "test-only-ed25519-selftest",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
      },
    }),
    /sha256 mismatch/,
  );
  await assertNativeRuntimeMatchesCommit({
    repoRoot: artifactFixture,
    commit: currentCommit,
  });
  await writeFile(join(artifactFixture, "docs.md"), "post-upload documentation\n");
  execFileSync("git", ["add", "docs.md"], { cwd: artifactFixture });
  execFileSync("git", ["commit", "-q", "-m", "docs after upload"], { cwd: artifactFixture });
  await assertNativeRuntimeMatchesCommit({
    repoRoot: artifactFixture,
    commit: currentCommit,
  });
  await writeFile(join(artifactFixture, "miniprogram", "app.js"), "module.exports = 'changed-after-upload';\n");
  await assert.rejects(
    assertNativeRuntimeMatchesCommit({
      repoRoot: artifactFixture,
      commit: currentCommit,
    }),
    /current miniprogram runtime differs from uploaded commit/,
  );
  await assert.rejects(
    assertNativeArtifactMatchesCommit({
      artifactPath: oldArchive,
      repoRoot: artifactFixture,
      commit: currentCommit,
    }),
    /does not match candidate commit/,
    "a handoff with the new commit line and an old archive must fail closed",
  );
} finally {
  await rm(artifactFixture, { recursive: true, force: true });
}

const rolloutFixture = await mkdtemp(join(tmpdir(), "humi-native-rollout-fixture-"));
try {
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const runtimeCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const archivePath = join(rolloutFixture, `humi-native-shell-${CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION}.tar.gz`);
  execFileSync("git", [
    "archive",
    "--format=tar.gz",
    `--prefix=humi-native-shell-${CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION}/`,
    `--output=${archivePath}`,
    runtimeCommit,
    "miniprogram",
  ], { cwd: repoRoot });
  const sha256 = execFileSync("shasum", ["-a", "256", archivePath], {
    encoding: "utf8",
  }).trim().split(/\s+/)[0];
  const uploadReceiptRef = `private://n5c/upload-receipt-${CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION}`;
  const archiveSizeBytes = (await stat(archivePath)).size;
  const validEvidence = currentCandidateEvidence({
    runtimeCommit,
    archivePath,
    sha256,
    archiveSizeBytes,
    uploadReceiptRef,
  });
  const evidencePath = join(rolloutFixture, "candidate.json");
  const receiptPath = join(rolloutFixture, "wechat-upload-receipt.json");

  await writeFile(evidencePath, JSON.stringify(validEvidence, null, 2));
  const archiveOnlyReport = runRolloutChecker(repoRoot, evidencePath);
  assert.notEqual(archiveOnlyReport.status, 0, "local archive evidence without a private WeChat receipt must fail");
  assert(
    archiveOnlyReport.json.failures.some((failure) => /trusted private attestation/.test(failure.name)),
    JSON.stringify(archiveOnlyReport.json.failures),
  );
  await writeFile(receiptPath, JSON.stringify(wechatUploadReceipt({
    runtimeCommit,
    sha256,
    uploadReceiptRef,
  }), null, 2));
  const fabricatedReceiptReport = runRolloutChecker(repoRoot, evidencePath, receiptPath);
  assert.notEqual(
    fabricatedReceiptReport.status,
    0,
    "a hand-authored receipt must not make the production rollout checker pass",
  );
  assert.equal(
    fabricatedReceiptReport.json.currentCandidate.uploadStatus,
    "uploaded",
    "a fabricated receipt must not rewrite the recorded uploaded experience state",
  );
  assert(
    fabricatedReceiptReport.json.failures.some((failure) => /trusted private attestation/.test(failure.name)),
    JSON.stringify(fabricatedReceiptReport.json.failures),
  );

  for (const [label, mutate, failurePattern] of [
    ["wrong version", (value) => { value.candidate.version = "1.1.74"; }, /candidate state/],
    ["wrong commit", (value) => { value.candidate.runtimeCommit = "4eb3fbeb6aba886930b3fda652be96e9246eac9e"; }, /trusted private attestation/],
    ["wrong archive sha", (value) => { value.candidate.archive.sha256 = "c".repeat(64); }, /trusted private attestation/],
    ["wrong archive size", (value) => { value.candidate.archive.sizeBytes += 1; }, /archive size matches immutable candidate evidence/],
  ]) {
    const evidence = structuredClone(validEvidence);
    mutate(evidence);
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    const failed = runRolloutChecker(repoRoot, evidencePath, receiptPath);
    assert.notEqual(failed.status, 0, `${label} evidence must fail`);
    assert(
      failed.json.failures.some((failure) => failurePattern.test(failure.name)),
      `${label} must fail at the current-candidate state boundary before untrusted receipt metadata can advance the current candidate: ${JSON.stringify(failed.json.failures)}`,
    );
  }

  const defaultReport = runRolloutChecker(repoRoot);
  assert.equal(defaultReport.status, 0, "the repository local candidate contract must remain valid before upload");
  assert.deepEqual(defaultReport.json.failures, []);
  assert.equal(defaultReport.json.currentCandidate.uploadStatus, "not_uploaded");
  assert(
    defaultReport.json.blockers.some((blocker) => blocker.includes(CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION)),
    "the local candidate must explicitly require a separately authorized upload",
  );
} finally {
  await rm(rolloutFixture, { recursive: true, force: true });
}

const rollback = await runNativeRollbackDrill({
  root: resolve(fileURLToPath(new URL("..", import.meta.url))),
});
assert.equal(rollback.serverStarted, true, "the drill must start a real local HTTP bootstrap server");
assert.equal(rollback.requestCount, 2, "each boot must fetch a fresh bootstrap envelope");
assert.deepEqual(
  rollback.bootstrapCapabilities,
  [true, false],
  "the same server fixture must flip only nativeShellEnabled",
);
assert.deepEqual(
  rollback.authorizationHeaders,
  ["Bearer session-rollout", "Bearer session-rollout"],
  "both real bootstrap requests must use the restored Humi session",
);
assert.equal(rollback.bootExecutions, 2, "the real Boot Page controller must execute before and after rollback");
assert.deepEqual(rollback.switchTabRoutes, ["/pages/tonight/index"]);
assert.deepEqual(rollback.relaunchRoutes, ["/pages/legacy/index"]);
assert.deepEqual(
  [...rollback.removedKeys].sort(),
  [
    "humi:bootstrap:last-household:v1:user-rollout",
    "humi:household-cache:v1:user-rollout:household-rollout",
  ],
  "rollback must clear exactly the current bootstrap pointer and its one household cache",
);
assert.equal(rollback.productCachePreserved, true, "MealRun data must survive the real boot rollback");
assert.equal(rollback.serverFixtureMutations, 1, "only the mock nativeShellEnabled provider may change");
assert.equal(rollback.householdFixture, "household-rollout");
assert.equal(rollback.allowlistPreserved, true, "the rollback must not mutate the household allowlist");

console.log("Native rollout readiness selftest passed.");

function currentCandidateEvidence({ runtimeCommit, archivePath, sha256, archiveSizeBytes, uploadReceiptRef }) {
  return {
    schemaVersion: 1,
    candidate: {
      version: CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
      status: "uploaded-experience",
      runtimeCommit,
      archive: { path: archivePath, sha256, sizeBytes: archiveSizeBytes },
      uploadEvidence: { rawEvidenceSha256: "c".repeat(64) },
      uploadReceiptRef,
      actions: {
        productionApiDeployed: true,
        h5Deployed: true,
        miniprogramUploaded: true,
        wechatReviewSubmitted: false,
        wechatReleased: false,
        nativeAllowlistEnabled: false,
      },
      trueDeviceEvidence: { passed: 0, required: 56 },
    },
  };
}

function wechatUploadReceipt({ runtimeCommit, sha256, uploadReceiptRef }) {
  return {
    schemaVersion: 1,
    source: "wechat-mp-console-upload-receipt",
    receiptRef: uploadReceiptRef,
    appId: "wx4040b89f3b363416",
    candidate: {
      version: CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
      runtimeCommit,
      archiveSha256: sha256,
    },
    uploadedAt: "2026-07-28T08:00:00.000Z",
  };
}

function runRolloutChecker(repoRoot, evidencePath = "", receiptPath = "") {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-native-rollout-readiness.mjs", "--local-contract-only"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...(evidencePath ? { HUMI_NATIVE_CANDIDATE_EVIDENCE_PATH: evidencePath } : {}),
        ...(receiptPath ? { HUMI_WECHAT_UPLOAD_RECEIPT_PATH: receiptPath } : {}),
        ...(receiptPath ? {
          HUMI_WECHAT_UPLOAD_RECEIPT_FIXTURE_MODE: "1",
          NODE_ENV: "test",
        } : {}),
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
      timeout: 120_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: JSON.parse(result.stdout),
  };
}

async function writeTestOnlyUploadMachineAttestation({
  directory,
  candidate,
  privateKey,
  keyId,
}) {
  const commitAt = Date.parse(execFileSync(
    "git",
    ["show", "-s", "--format=%cI", candidate.runtimeCommit],
    { cwd: directory, encoding: "utf8" },
  ).trim());
  const rawEvidence = {
    schemaVersion: 1,
    source: "wechat-miniprogram-ci-upload-output",
    operation: "upload",
    appId: "wx4040b89f3b363416",
    version: candidate.version,
    invocationStartedAt: new Date(commitAt + 1_000).toISOString(),
    uploadCompletedAt: new Date(commitAt + 2_000).toISOString(),
    result: {
      subPackageInfo: [{ name: "__APP__", size: 1024 }],
    },
  };
  const rawEvidenceBytes = `${JSON.stringify(rawEvidence, null, 2)}\n`;
  const rawEvidencePath = join(directory, "wechat-miniprogram-ci-upload-output.json");
  await writeFile(rawEvidencePath, rawEvidenceBytes);
  const rawEvidenceSha256 = createHash("sha256").update(rawEvidenceBytes).digest("hex");
  const attestation = {
    schemaVersion: 1,
    source: "humi-wechat-upload-machine-attestation",
    attestationRef: candidate.uploadReceiptRef,
    keyId,
    appId: "wx4040b89f3b363416",
    candidate: {
      version: candidate.version,
      runtimeCommit: candidate.runtimeCommit,
      archiveSha256: candidate.archive.sha256,
    },
    rawEvidence: {
      kind: rawEvidence.source,
      path: "wechat-miniprogram-ci-upload-output.json",
      sha256: rawEvidenceSha256,
    },
    capturedAt: new Date(commitAt + 3_000).toISOString(),
    attestedAt: new Date(commitAt + 4_000).toISOString(),
  };
  const attestationPath = join(directory, "wechat-upload-machine-attestation.json");
  await writeSignedTestAttestation(attestationPath, attestation, privateKey);
  return {
    attestation,
    attestationPath,
    rawEvidence,
    rawEvidenceBytes,
    rawEvidencePath,
    rawEvidenceSha256,
  };
}

async function writeTestOnlyDevtoolsUploadMachineAttestation({
  directory,
  candidate,
  privateKey,
  keyId,
}) {
  const commitAt = Date.parse(execFileSync(
    "git",
    ["show", "-s", "--format=%cI", candidate.runtimeCommit],
    { cwd: directory, encoding: "utf8" },
  ).trim());
  const rawEvidence = {
    schemaVersion: 1,
    source: "wechat-devtools-cli-upload-output",
    operation: "upload",
    appId: "wx4040b89f3b363416",
    version: candidate.version,
    description: "Humi 原生骨架完整候选（fbb4938）",
    invocationStartedAt: new Date(commitAt + 1_000).toISOString(),
    uploadCompletedAt: new Date(commitAt + 2_000).toISOString(),
    exitCode: 0,
    stdout: "package size table\n",
    stderr: "- 初始化\n- 上传\n✔ upload\n",
    infoOutput: {
      size: {
        total: 1536,
        packages: [
          { name: "TOTAL", size: 1536 },
          { name: "main", size: 1024 },
          { name: "/packageFamily/", size: 512 },
        ],
      },
    },
  };
  const rawEvidenceBytes = `${JSON.stringify(rawEvidence, null, 2)}\n`;
  const rawEvidencePath = join(directory, "wechat-devtools-cli-upload-output.json");
  await writeFile(rawEvidencePath, rawEvidenceBytes);
  const rawEvidenceSha256 = createHash("sha256").update(rawEvidenceBytes).digest("hex");
  const attestation = {
    schemaVersion: 1,
    source: "humi-wechat-upload-machine-attestation",
    attestationRef: candidate.uploadReceiptRef,
    keyId,
    appId: "wx4040b89f3b363416",
    candidate: {
      version: candidate.version,
      runtimeCommit: candidate.runtimeCommit,
      archiveSha256: candidate.archive.sha256,
    },
    rawEvidence: {
      kind: rawEvidence.source,
      path: "wechat-devtools-cli-upload-output.json",
      sha256: rawEvidenceSha256,
    },
    capturedAt: new Date(commitAt + 3_000).toISOString(),
    attestedAt: new Date(commitAt + 4_000).toISOString(),
  };
  const attestationPath = join(directory, "wechat-devtools-upload-machine-attestation.json");
  await writeSignedTestAttestation(attestationPath, attestation, privateKey);
  return {
    attestationPath,
    rawEvidenceSha256,
  };
}

async function writeSignedTestAttestation(path, unsigned, privateKey) {
  const payload = canonicalTestJson(unsigned);
  const signature = sign(null, Buffer.from(payload), privateKey).toString("base64url");
  await writeFile(path, `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`);
}

function canonicalTestJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalTestJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalTestJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

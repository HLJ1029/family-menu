import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNativeArtifactMatchesCommit,
  verifyNativeCandidateUploadEvidence,
} from "./lib/native-candidate-artifact.mjs";
import {
  extractNativeCandidateArtifactPath,
  extractNativeCandidateCommit,
  findForbiddenRuntimeFindings,
  resolveExternalHandoffPath,
  validateNativeCandidateState,
} from "./lib/native-rollout-readiness-policy.mjs";
import {
  assertNativeRuntimeMatchesCommit,
} from "./lib/native-candidate-artifact.mjs";
import { runNativeRollbackDrill } from "./lib/native-rollout-drill.mjs";

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
  assert.deepEqual(
    await verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: currentCommit,
        archive: { path: currentArchive, sha256: currentArchiveSha256 },
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
    }),
    {
      uploaded: true,
      version: "1.1.75",
      runtimeCommit: currentCommit,
      artifactPath: currentArchive,
      sha256: currentArchiveSha256,
    },
  );
  assert.deepEqual(
    await verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "local-candidate",
        runtimeCommit: null,
        archive: null,
        actions: { miniprogramUploaded: false },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
    }),
    { uploaded: false, version: "1.1.75" },
  );
  await assert.rejects(
    verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: oldCommit,
        archive: { path: currentArchive, sha256: currentArchiveSha256 },
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
    }),
    /does not match candidate commit|differs from uploaded commit/,
  );
  await assert.rejects(
    verifyNativeCandidateUploadEvidence({
      candidate: {
        version: "1.1.75",
        status: "uploaded-experience",
        runtimeCommit: currentCommit,
        archive: { path: currentArchive, sha256: "b".repeat(64) },
        actions: { miniprogramUploaded: true },
      },
      repoRoot: artifactFixture,
      evidenceBaseDir: artifactFixture,
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
  const fixtureIndex = join(rolloutFixture, "git-index");
  const gitEnv = { ...process.env, GIT_INDEX_FILE: fixtureIndex };
  execFileSync("git", ["read-tree", "HEAD"], { cwd: repoRoot, env: gitEnv });
  execFileSync("git", ["add", "miniprogram"], { cwd: repoRoot, env: gitEnv });
  const tree = execFileSync("git", ["write-tree"], {
    cwd: repoRoot,
    env: gitEnv,
    encoding: "utf8",
  }).trim();
  const runtimeCommit = execFileSync("git", ["commit-tree", tree, "-p", "HEAD"], {
    cwd: repoRoot,
    env: {
      ...gitEnv,
      GIT_AUTHOR_NAME: "Humi selftest",
      GIT_AUTHOR_EMAIL: "selftest@invalid.local",
      GIT_COMMITTER_NAME: "Humi selftest",
      GIT_COMMITTER_EMAIL: "selftest@invalid.local",
    },
    input: "bind current 1.1.75 runtime\n",
    encoding: "utf8",
  }).trim();
  const archivePath = join(rolloutFixture, "humi-native-shell-1.1.75.tar.gz");
  execFileSync("git", [
    "archive",
    "--format=tar.gz",
    "--prefix=humi-native-shell-1.1.75/",
    `--output=${archivePath}`,
    runtimeCommit,
    "miniprogram",
  ], { cwd: repoRoot });
  const sha256 = execFileSync("shasum", ["-a", "256", archivePath], {
    encoding: "utf8",
  }).trim().split(/\s+/)[0];
  const validEvidence = currentCandidateEvidence({ runtimeCommit, archivePath, sha256 });
  const evidencePath = join(rolloutFixture, "candidate.json");

  await writeFile(evidencePath, JSON.stringify(validEvidence, null, 2));
  const validReport = runRolloutChecker(repoRoot, evidencePath);
  assert.equal(validReport.status, 0, validReport.stderr || validReport.stdout);
  assert.equal(validReport.json.contractOk, true);
  assert.equal(validReport.json.currentCandidate.uploadStatus, "uploaded");

  for (const [label, mutate, failurePattern] of [
    ["wrong version", (value) => { value.candidate.version = "1.1.74"; }, /candidate state/],
    ["wrong commit", (value) => { value.candidate.runtimeCommit = "4eb3fbeb6aba886930b3fda652be96e9246eac9e"; }, /candidate state/],
    ["wrong archive sha", (value) => { value.candidate.archive.sha256 = "c".repeat(64); }, /candidate state/],
  ]) {
    const evidence = structuredClone(validEvidence);
    mutate(evidence);
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    const failed = runRolloutChecker(repoRoot, evidencePath);
    assert.notEqual(failed.status, 0, `${label} evidence must fail`);
    assert(
      failed.json.failures.some((failure) => failurePattern.test(failure.name)),
      `${label} must identify the structured current candidate failure: ${JSON.stringify(failed.json.failures)}`,
    );
  }

  const defaultReport = runRolloutChecker(repoRoot);
  assert.notEqual(defaultReport.status, 0, "the repository default must remain an unuploaded candidate");
  assert.deepEqual(
    defaultReport.json.failures.map((failure) => failure.name),
    ["current 1.1.75 candidate has immutable upload evidence"],
    "the current default must fail only because 1.1.75 has not been uploaded",
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

function currentCandidateEvidence({ runtimeCommit, archivePath, sha256 }) {
  return {
    schemaVersion: 1,
    candidate: {
      version: "1.1.75",
      status: "uploaded-experience",
      runtimeCommit,
      archive: { path: archivePath, sha256 },
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

function runRolloutChecker(repoRoot, evidencePath = "") {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-native-rollout-readiness.mjs", "--local-contract-only"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...(evidencePath ? { HUMI_NATIVE_CANDIDATE_EVIDENCE_PATH: evidencePath } : {}),
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

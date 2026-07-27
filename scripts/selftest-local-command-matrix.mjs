import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildAuthoritativeCommandMatrix,
  classifyMatrixResult,
  DEFAULT_EVIDENCE_ROOT,
} from "./lib/local-command-matrix.mjs";
import { REQUIRED_SCENARIOS } from "./check-humi-true-device-evidence.mjs";

const execFileAsync = promisify(execFile);
const PRODUCT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = join(PRODUCT_ROOT, "scripts/run-local-command-matrix.mjs");
const VERIFIER = join(PRODUCT_ROOT, "scripts/verify-local-command-matrix.mjs");
const FIXTURE_HELPER = join(PRODUCT_ROOT, "scripts/local-command-matrix-fixture.mjs");
const HELPER_SCRATCH_NAME = ".selftest-scratch";
const HELPER_RUN_PATTERN = /^run-\d{13}-\d+-[a-f0-9-]{36}$/;
const root = await mkdtemp(join(tmpdir(), "humi-local-matrix-selftest-"));

try {
  if (process.argv.includes("--short-smoke")) {
    await shortSmoke();
    console.log("Immutable local command matrix short smoke passed.");
  } else if (process.argv.includes("--blocker-focused")) {
    testExternalBlockerClassificationIsExact();
    console.log("Immutable local command matrix blocker classification selftest passed.");
  } else {
    await testAuthoritativeCommandMatrixContract();
    testExternalBlockerClassificationIsExact();
    await testGuardRejectsUnsafeInjection();
    await testGuardRejectsSymlinkEscape();
    await testGuardRejectsArbitraryExternalMutation();
    await testFixtureHelperRejectsUnsafeDirectInvocation();
    await testAllPassAndDeterministicOrder();
    await testFailureContinues();
    await testPerCommandHarnessFailuresContinue();
    await testTimeout();
    await testRedactionAndHashVerification();
    await testCollisionRefusesOverwrite();
    await testAtomicPartialManifest();
    await testRepositoryMutation();
    await testExpectedExternalBlockerNeverPasses();
    console.log("Immutable local command matrix selftests passed.");
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function testExternalBlockerClassificationIsExact() {
  const missingRows = REQUIRED_SCENARIOS
    .map((scenario) => `${scenario}\tmissing\tscenario_missing`)
    .join("\n");
  const rolloutCommand = { expectedBlockerPolicy: "current-candidate-upload-missing", nonzeroClassification: "fail" };
  const trueDeviceCommand = buildAuthoritativeCommandMatrix()
    .find((entry) => entry.id === "validate:true-device-evidence");
  const expectedRollout = processResult({
    code: 1,
    stdout: JSON.stringify({
      failures: [{ name: "current 1.1.75 candidate has immutable upload evidence", message: "archive missing" }],
    }),
  });
  assert.equal(classifyMatrixResult(rolloutCommand, expectedRollout), "blocker");
  const mixedRollout = processResult({
    code: 1,
    stdout: JSON.stringify({
      failures: [
        { name: "current 1.1.75 candidate has immutable upload evidence", message: "archive missing" },
        { name: "repository rollout defaults remain off", message: "flag changed" },
      ],
    }),
  });
  assert.equal(classifyMatrixResult(rolloutCommand, mixedRollout), "fail");
  assert.equal(classifyMatrixResult(
    { expectedBlockerPolicy: "startup-evidence-missing", nonzeroClassification: "fail" },
    processResult({ code: 0, stdout: JSON.stringify({
      overallStatus: "blocked",
      externalEvidence: { status: "blocked", reason: "true_device_performance_evidence_missing" },
    }) }),
  ), "blocker");
  assert.equal(classifyMatrixResult(
    trueDeviceCommand,
    processResult({
      code: 1,
      stdout: [
        "> family-menu@1.1.0 validate:true-device-evidence",
        "> node scripts/check-humi-true-device-evidence.mjs",
        "True-device evidence blocked: 0/56.",
        "",
      ].join("\n"),
      stderr: `${missingRows}\n`,
    }),
  ), "blocker");
  assert.equal(classifyMatrixResult(
    trueDeviceCommand,
    processResult({
      code: 1,
      stdout: `> unrelated failure disguised as preamble\nTrue-device evidence blocked: 0/56.\n`,
      stderr: `${missingRows}\n`,
    }),
  ), "fail");
  assert.equal(classifyMatrixResult(
    trueDeviceCommand,
    processResult({
      code: 1,
      stdout: "True-device evidence blocked: 0/56.\n",
      stderr: `${missingRows}\nunrelated_local_failure\n`,
    }),
  ), "fail");
  assert.equal(classifyMatrixResult(
    trueDeviceCommand,
    processResult({ code: null, signal: "SIGTERM", stdout: "True-device evidence blocked: 0/56.\n" }),
  ), "fail");
}

function processResult({ code, signal = null, stdout = "", stderr = "", timedOut = false }) {
  return {
    code,
    signal,
    timedOut,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
  };
}

async function testAuthoritativeCommandMatrixContract() {
  const packageJson = JSON.parse(await readFile(join(PRODUCT_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["release:local-matrix"],
    "node scripts/run-local-command-matrix.mjs",
  );
  assert.equal(
    packageJson.scripts["release:local-matrix:selftest"],
    "node scripts/selftest-local-command-matrix.mjs",
  );
  assert.equal(
    packageJson.scripts["release:local-matrix:smoke"],
    "node scripts/selftest-local-command-matrix.mjs --short-smoke",
  );
  assert.equal(
    packageJson.scripts["release:local-matrix:verify"],
    "node scripts/verify-local-command-matrix.mjs",
  );
  const matrix = buildAuthoritativeCommandMatrix();
  assert.equal(matrix.length, 41);
  assert.deepEqual(matrix.map((entry) => entry.id), [
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
    "release:candidate:privacy:check",
    "release:wechat:privacy:check",
    "release:security:audit",
    "validate:true-device-evidence:selftest",
    "validate:true-device-evidence",
    "build",
    "release:native-shell:check:local",
    "release:native-shell:check",
    "git-diff-check",
    "ai-hq-secret-scan",
  ]);
  assert.equal(matrix.find((entry) => entry.id === "validate:startup-performance").expectedBlockerPolicy, "startup-evidence-missing");
  assert.equal(matrix.find((entry) => entry.id === "validate:true-device-evidence").expectedBlockerPolicy, "true-device-evidence-missing");
  assert.equal(matrix.find((entry) => entry.id === "release:native-shell:check").expectedBlockerPolicy, "current-candidate-upload-missing");
}

async function shortSmoke() {
  const fixture = await makeFixture("short-smoke");
  const commands = [
    fixtureCommand("first", "pass"),
    fixtureCommand("second", "pass"),
  ];
  const result = await runMatrix(fixture, commands, "short-smoke");
  assert.equal(result.code, 0, result.stderr);
  const manifest = await readManifest(fixture, "short-smoke");
  assert.equal(manifest.overallResult, "passed");
  assert.deepEqual(manifest.results.map((entry) => entry.id), ["first", "second"]);
  await verifyManifest(fixture, "short-smoke");
}

async function testGuardRejectsUnsafeInjection() {
  const fixture = await makeFixture("guard");
  const commandFile = await writeCommands(fixture, [fixtureCommand("guard", "pass")]);
  const result = await invoke([
    "--test-repo", fixture.repo,
    "--test-evidence-root", fixture.evidenceRoot,
    "--test-command-file", commandFile,
    "--test-run-id", "guard",
  ], { testGuard: false });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /test-only matrix injection refused/i);
  await assert.rejects(stat(join(fixture.evidenceRoot, "guard")));
}

async function testGuardRejectsSymlinkEscape() {
  const fixture = await makeFixture("symlink-escape");
  const repoLink = join(fixture.fixtureRoot, "repo-link");
  await symlink(PRODUCT_ROOT, repoLink, "dir");
  const commandFile = await writeCommands(fixture, [fixtureCommand("guard", "pass")]);
  const result = await invoke([
    "--test-repo", repoLink,
    "--test-evidence-root", fixture.evidenceRoot,
    "--test-command-file", commandFile,
    "--test-run-id", "symlink-escape",
  ]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /test-only matrix injection refused/i);
  await assert.rejects(stat(join(fixture.evidenceRoot, "symlink-escape")));
}

async function testGuardRejectsArbitraryExternalMutation() {
  const fixture = await makeFixture("arbitrary-command");
  const outside = join(fixture.fixtureRoot, "outside-controlled.txt");
  const commandFile = await writeCommands(fixture, [{
    id: "arbitrary",
    executable: process.execPath,
    args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(outside)}, 'mutated')`],
    timeoutMs: 5_000,
  }]);
  const result = await invoke([
    "--test-repo", fixture.repo,
    "--test-evidence-root", fixture.evidenceRoot,
    "--test-command-file", commandFile,
    "--test-run-id", "arbitrary-command",
  ]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /test-only matrix command list/i);
  await assert.rejects(stat(outside));
}

async function testFixtureHelperRejectsUnsafeDirectInvocation() {
  const startingGitStatus = repositoryStatus(PRODUCT_ROOT);
  const scratch = await createPrivateHelperScratch();
  try {
    assert.equal(repositoryStatus(PRODUCT_ROOT), startingGitStatus);
    assert.equal(gitWorktreeRoot(scratch.runRoot), null);
    const outsideResult = await invokeFixtureHelper(PRODUCT_ROOT, scratch.evidence);
    assert.notEqual(outsideResult.code, 0);
    await assert.rejects(stat(join(scratch.evidence, "continued.txt")));
    assert.equal(outsideResult.stderr.includes(PRODUCT_ROOT), false);
    assert.equal(outsideResult.stderr.includes(scratch.evidence), false);
    assert.equal(repositoryStatus(PRODUCT_ROOT), startingGitStatus);

    const fixture = await makeFixture("helper-symlink-escape");
    const evidenceLink = join(fixture.fixtureRoot, "evidence-link");
    assert.equal(repositoryStatus(PRODUCT_ROOT), startingGitStatus);
    await symlink(scratch.target, evidenceLink, "dir");
    const symlinkResult = await invokeFixtureHelper(fixture.repo, evidenceLink);
    assert.notEqual(symlinkResult.code, 0);
    await assert.rejects(stat(join(scratch.target, "continued.txt")));
    assert.equal(symlinkResult.stderr.includes(scratch.target), false);
    assert.equal(symlinkResult.stderr.includes(evidenceLink), false);
    assert.equal(repositoryStatus(PRODUCT_ROOT), startingGitStatus);
  } finally {
    await rm(scratch.runRoot, { recursive: true, force: true });
  }
  assert.equal(repositoryStatus(PRODUCT_ROOT), startingGitStatus);
}

async function createPrivateHelperScratch() {
  await mkdir(DEFAULT_EVIDENCE_ROOT, { recursive: true, mode: 0o700 });
  const [canonicalHome, canonicalTemp, canonicalEvidenceRoot] = await Promise.all([
    realpath(homedir()),
    realpath(tmpdir()),
    realpath(DEFAULT_EVIDENCE_ROOT),
  ]);
  if (!isStrictChildPath(canonicalHome, canonicalEvidenceRoot)
    || isStrictChildPath(canonicalTemp, canonicalEvidenceRoot)
    || gitWorktreeRoot(canonicalEvidenceRoot) !== null) {
    throw new Error("local matrix helper selftest refused unsafe private scratch parent");
  }

  const scratchRoot = join(canonicalEvidenceRoot, HELPER_SCRATCH_NAME);
  try {
    const existing = await lstat(scratchRoot);
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error("local matrix helper selftest refused unsafe private scratch root");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(scratchRoot, { mode: 0o700 });
  }
  await chmod(scratchRoot, 0o700);
  const canonicalScratchRoot = await realpath(scratchRoot);
  if (!isStrictChildPath(canonicalEvidenceRoot, canonicalScratchRoot)
    || isStrictChildPath(canonicalTemp, canonicalScratchRoot)
    || gitWorktreeRoot(canonicalScratchRoot) !== null) {
    throw new Error("local matrix helper selftest refused unsafe private scratch root");
  }

  await removeStaleHelperScratchRuns(canonicalScratchRoot);
  const runName = `run-${Date.now()}-${process.pid}-${randomUUID()}`;
  if (!HELPER_RUN_PATTERN.test(runName)) throw new Error("invalid helper selftest run name");
  const runRoot = checkedHelperRunPath(canonicalScratchRoot, runName);
  try {
    await mkdir(runRoot, { mode: 0o700 });
    await writeFile(join(runRoot, "fixture-owner"), `${runName}\n`, { mode: 0o600 });
    const evidence = join(runRoot, "evidence");
    const target = join(runRoot, "target");
    await mkdir(evidence, { mode: 0o700 });
    await mkdir(target, { mode: 0o700 });
    return { runRoot, evidence, target };
  } catch (error) {
    await rm(runRoot, { recursive: true, force: true });
    throw error;
  }
}

async function removeStaleHelperScratchRuns(scratchRoot) {
  for (const entry of await readdir(scratchRoot, { withFileTypes: true })) {
    if (!HELPER_RUN_PATTERN.test(entry.name)) continue;
    const stalePath = checkedHelperRunPath(scratchRoot, entry.name);
    if (entry.isDirectory()) await rm(stalePath, { recursive: true, force: true });
    else if (entry.isSymbolicLink() || entry.isFile()) await rm(stalePath, { force: true });
  }
}

function checkedHelperRunPath(scratchRoot, runName) {
  if (!HELPER_RUN_PATTERN.test(runName)) throw new Error("invalid helper selftest run name");
  const path = resolve(scratchRoot, runName);
  if (!isStrictChildPath(scratchRoot, path)) throw new Error("unsafe helper selftest run path");
  return path;
}

function isStrictChildPath(rootPath, candidatePath) {
  const relation = relative(rootPath, candidatePath);
  return Boolean(relation) && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function gitWorktreeRoot(directory) {
  try {
    return execFileSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function testAllPassAndDeterministicOrder() {
  const fixture = await makeFixture("ordered");
  const append = (value) => fixtureCommand(value, "append-order");
  const result = await runMatrix(fixture, [append("alpha"), append("beta"), append("gamma")], "ordered");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(join(fixture.evidenceRoot, "ordered", "artifacts", "fixture-order.txt"), "utf8"), "alpha\nbeta\ngamma\n");
  const manifest = await readManifest(fixture, "ordered");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.state, "complete");
  assert.equal(manifest.repository.start.clean, true);
  assert.equal(manifest.repository.changedDuringRun, false);
  assert.equal(manifest.candidate.reviewPackageVersion, "1.1.75");
  assert.equal(manifest.candidate.uploadedRuntimeCommit, "4eb3fbeb6aba886930b3fda652be96e9246eac9e");
  assert.deepEqual(manifest.matrix.map((entry) => entry.id), ["alpha", "beta", "gamma"]);
  assert.deepEqual(manifest.results.map((entry) => entry.classification), ["pass", "pass", "pass"]);
  assert.deepEqual(manifest.aggregate, { total: 3, pass: 3, fail: 0, blocker: 0, timeout: 0 });
  assert.match(manifest.integrity.manifestSha256, /^[a-f0-9]{64}$/);
  await verifyManifest(fixture, "ordered");
  const runDir = join(fixture.evidenceRoot, "ordered");
  const sidecarPath = join(runDir, "manifest.sha256");
  const sidecar = await readFile(sidecarPath, "utf8");
  await rm(sidecarPath);
  const missingSidecar = await invokeVerifier(join(runDir, "manifest.json"));
  assert.notEqual(missingSidecar.code, 0);
  assert.match(missingSidecar.stderr, /sidecar.*required|ENOENT/i);
  await writeFile(sidecarPath, "0".repeat(64) + "  manifest.json\n");
  const tamperedSidecar = await invokeVerifier(join(runDir, "manifest.json"));
  assert.notEqual(tamperedSidecar.code, 0);
  assert.match(tamperedSidecar.stderr, /manifest file hash mismatch/i);
  await writeFile(sidecarPath, sidecar);
}

async function testFailureContinues() {
  const fixture = await makeFixture("failure");
  const commands = [
    fixtureCommand("fails", "fail", { exitCode: 7 }),
    fixtureCommand("continues", "write-marker"),
  ];
  const result = await runMatrix(fixture, commands, "failure");
  assert.notEqual(result.code, 0);
  assert.equal(await readFile(join(fixture.evidenceRoot, "failure", "artifacts", "continued.txt"), "utf8"), "yes");
  const manifest = await readManifest(fixture, "failure");
  assert.deepEqual(manifest.results.map((entry) => entry.classification), ["fail", "pass"]);
  assert.equal(manifest.results[0].exit.code, 7);
  assert.equal(manifest.overallResult, "failed");
}

async function testPerCommandHarnessFailuresContinue() {
  const fixture = await makeFixture("harness-failures");
  const commands = [
    fixtureCommand("unsafe-link", "artifact-symlink"),
    fixtureCommand("after-link", "pass"),
    fixtureCommand("oversize", "artifact-oversize"),
    fixtureCommand("after-oversize", "pass"),
    fixtureCommand("artifact-batch", "artifact-batch-unsafe"),
    fixtureCommand("after-artifact-batch", "pass"),
    fixtureCommand("observe", "observation-failure"),
    fixtureCommand("after-observe", "pass"),
    fixtureCommand("log-write", "log-write-failure"),
    fixtureCommand("after-log-write", "pass"),
  ];
  const result = await runMatrix(fixture, commands, "harness-failures");
  assert.notEqual(result.code, 0);
  const manifest = await readManifest(fixture, "harness-failures");
  assert.equal(manifest.state, "complete");
  assert.deepEqual(
    manifest.results.map((entry) => entry.classification),
    ["fail", "pass", "fail", "pass", "fail", "pass", "fail", "pass", "fail", "pass"],
  );
  assert.deepEqual(
    manifest.results.filter((entry) => entry.runnerErrors?.length).map((entry) => entry.runnerErrors[0].code),
    ["artifact_sanitization_failed", "artifact_sanitization_failed", "artifact_sanitization_failed", "repository_observation_failed", "log_persistence_failed"],
  );
  assert.deepEqual(
    manifest.results.find((entry) => entry.id === "artifact-batch").artifactSanitization.errorCodes,
    ["artifact_symlink_rejected", "artifact_text_oversize_rejected"],
  );
  const artifactRoot = join(fixture.evidenceRoot, "harness-failures", "artifacts");
  await assert.rejects(stat(join(artifactRoot, "00-symlink")));
  await assert.rejects(stat(join(artifactRoot, "01-oversize")));
  assert.equal((await readPersistedText(artifactRoot)).includes(["matrix", "batch", "secret"].join("_")), false);
  assert.match(await readFile(join(fixture.evidenceRoot, "harness-failures", "logs", "006-after-artifact-batch.stdout.log"), "utf8"), /after-artifact-batch/);
  assert.equal(manifest.overallResult, "failed");
  assert.match(await readFile(join(fixture.evidenceRoot, "harness-failures", "manifest.sha256"), "utf8"), /^[a-f0-9]{64}  manifest\.json\n$/);
  await verifyManifest(fixture, "harness-failures");
}

async function testTimeout() {
  const fixture = await makeFixture("timeout");
  const command = fixtureCommand("times-out", "timeout", { timeoutMs: 100 });
  const result = await runMatrix(fixture, [command], "timeout");
  assert.notEqual(result.code, 0);
  const manifest = await readManifest(fixture, "timeout");
  assert.equal(manifest.results[0].classification, "timeout");
  assert.equal(manifest.results[0].exit.timedOut, true);
  assert.equal(manifest.aggregate.timeout, 1);
}

async function testRedactionAndHashVerification() {
  const fixture = await makeFixture("redaction");
  const auth = ["Bearer", "matrix_test_authorization_value"].join(" ");
  const token = ["matrix", "test", "token", "value"].join("_");
  const ticket = ["matrix", "test", "ticket", "value"].join("_");
  const email = ["matrix.private", "example.test"].join("@");
  const phone = ["138", "0013", "8000"].join("");
  const openId = ["o_", "matrix_test_openid_value"].join("");
  const unionId = ["u_", "matrix_test_unionid_value"].join("");
  const salt = ["matrix", "test", "telemetry", "salt"].join("_");
  const secret = ["matrix", "test", "app", "secret"].join("_");
  const jsonToken = ["matrix", "test", "json", "access", "token"].join("_");
  const basicCredential = ["matrix", "test", "basic", "credential"].join("_");
  const plainTicket = ["matrix", "test", "plain", "ticket"].join("_");
  const jsonTicket = ["matrix", "test", "json", "ticket"].join("_");
  const digestCredential = ["matrix", "test", "digest", "credential"].join("_");
  const command = fixtureCommand("redacts", "redact-output-and-artifact");
  const result = await runMatrix(fixture, [command], "redaction");
  assert.equal(result.code, 0, result.stderr);
  const runDir = join(fixture.evidenceRoot, "redaction");
  const persisted = await readPersistedText(runDir);
  for (const unsafe of [auth, token, ticket, email, phone, openId, unionId, salt, secret, jsonToken, basicCredential, plainTicket, jsonTicket, digestCredential, fixture.evidenceRoot]) {
    assert.equal(persisted.includes(unsafe), false, `persisted evidence leaked ${unsafe.length} bytes`);
  }
  assert.match(persisted, /\[REDACTED/);
  const manifest = await readManifest(fixture, "redaction");
  assert.ok(manifest.results[0].redactions.total >= 16);
  await verifyManifest(fixture, "redaction");

  const stdoutPath = join(runDir, manifest.results[0].logs.stdout.path);
  await writeFile(stdoutPath, "tampered\n", { mode: 0o600 });
  const verification = await invokeVerifier(join(runDir, "manifest.json"));
  assert.notEqual(verification.code, 0);
  assert.match(verification.stderr, /hash mismatch/i);
}

async function testCollisionRefusesOverwrite() {
  const fixture = await makeFixture("collision");
  const commands = [fixtureCommand("once", "pass")];
  const first = await runMatrix(fixture, commands, "collision");
  assert.equal(first.code, 0, first.stderr);
  const manifestPath = join(fixture.evidenceRoot, "collision", "manifest.json");
  const before = sha256(await readFile(manifestPath));
  const second = await runMatrix(fixture, commands, "collision");
  assert.notEqual(second.code, 0);
  assert.match(second.stderr, /refusing to overwrite/i);
  assert.equal(sha256(await readFile(manifestPath)), before);
}

async function testAtomicPartialManifest() {
  const fixture = await makeFixture("partial");
  const commands = [
    fixtureCommand("first", "pass"),
    fixtureCommand("waiting", "wait", { delayMs: 900 }),
  ];
  const commandFile = await writeCommands(fixture, commands);
  const child = spawn(process.execPath, [
    RUNNER,
    "--test-repo", fixture.repo,
    "--test-evidence-root", fixture.evidenceRoot,
    "--test-command-file", commandFile,
    "--test-run-id", "partial",
  ], {
    env: testEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectChild(child);
  const manifestPath = join(fixture.evidenceRoot, "partial", "manifest.json");
  const partial = await waitFor(async () => {
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
      return parsed.state === "running"
        && parsed.results.length === 1
        && parsed.currentCommand?.id === "waiting"
        ? parsed
        : null;
    } catch {
      return null;
    }
  });
  assert.equal(partial.results[0].id, "first");
  assert.equal(partial.currentCommand.id, "waiting");
  const partialVerification = await invokeVerifier(manifestPath);
  assert.notEqual(partialVerification.code, 0);
  assert.match(partialVerification.stderr, /manifest is not complete/i);
  const completed = await output;
  assert.equal(completed.code, 0, completed.stderr);
  const leftovers = (await readdir(join(fixture.evidenceRoot, "partial")))
    .filter((name) => name.includes(".tmp"));
  assert.deepEqual(leftovers, []);
}

async function testRepositoryMutation() {
  const fixture = await makeFixture("mutation");
  const command = fixtureCommand("mutates-repo", "mutate-repo");
  const result = await runMatrix(fixture, [command], "mutation");
  assert.notEqual(result.code, 0);
  const manifest = await readManifest(fixture, "mutation");
  assert.equal(manifest.repository.changedDuringRun, true);
  assert.equal(manifest.repository.final.clean, false);
  assert.equal(manifest.overallResult, "failed");
  assert.ok(manifest.repository.observations.some((entry) => entry.afterCommand === "mutates-repo" && !entry.clean));
}

async function testExpectedExternalBlockerNeverPasses() {
  const fixture = await makeFixture("blocker");
  const commands = [fixtureCommand("external", "pass", {
    expectedExternalBlocker: true,
  })];
  const result = await runMatrix(fixture, commands, "blocker");
  assert.notEqual(result.code, 0);
  const manifest = await readManifest(fixture, "blocker");
  assert.equal(manifest.results[0].exit.code, 0);
  assert.equal(manifest.results[0].classification, "blocker");
  assert.equal(manifest.overallResult, "blocked");
}

async function makeFixture(name) {
  const fixtureRoot = join(root, name);
  const repo = join(fixtureRoot, "repo");
  const evidenceRoot = join(fixtureRoot, "evidence");
  await mkdir(repo, { recursive: true });
  await mkdir(evidenceRoot, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "matrix-test@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Matrix Selftest"], { cwd: repo });
  await writeFile(join(repo, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: repo });
  return { repo, evidenceRoot, fixtureRoot };
}

function fixtureCommand(id, action, overrides = {}) {
  return {
    id,
    action,
    timeoutMs: 5_000,
    ...overrides,
  };
}

async function writeCommands(fixture, commands) {
  const commandFile = join(fixture.fixtureRoot, `commands-${Date.now()}-${Math.random()}.json`);
  await writeFile(commandFile, `${JSON.stringify(commands, null, 2)}\n`);
  return commandFile;
}

async function runMatrix(fixture, commands, runId) {
  const commandFile = await writeCommands(fixture, commands);
  return invoke([
    "--test-repo", fixture.repo,
    "--test-evidence-root", fixture.evidenceRoot,
    "--test-command-file", commandFile,
    "--test-run-id", runId,
  ]);
}

async function invoke(args, { testGuard = true } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [RUNNER, ...args], {
      cwd: PRODUCT_ROOT,
      env: testGuard ? testEnv() : { ...process.env },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

function invokeVerifier(manifestPath) {
  return invokeExecutable(process.execPath, [VERIFIER, manifestPath]);
}

async function verifyManifest(fixture, runId) {
  const result = await invokeVerifier(join(fixture.evidenceRoot, runId, "manifest.json"));
  assert.equal(result.code, 0, result.stderr);
}

async function invokeExecutable(executable, args) {
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: PRODUCT_ROOT,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

async function invokeFixtureHelper(cwd, evidenceRoot) {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [FIXTURE_HELPER, "write-marker", "direct"],
      {
        cwd,
        env: {
          NODE_ENV: "test",
          HUMI_LOCAL_MATRIX_TEST_MODE: "1",
          HUMI_PRIVATE_EVIDENCE_DIR: evidenceRoot,
        },
        timeout: 5_000,
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

function collectChild(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
  });
}

async function waitFor(operation, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await operation();
    if (value) return value;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  throw new Error("timed out waiting for partial manifest");
}

async function readManifest(fixture, runId) {
  return JSON.parse(await readFile(join(fixture.evidenceRoot, runId, "manifest.json"), "utf8"));
}

async function readPersistedText(directory) {
  const chunks = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else chunks.push(await readFile(path, "utf8"));
    }
  }
  await visit(directory);
  return chunks.join("\n");
}

function testEnv() {
  return {
    ...process.env,
    NODE_ENV: "test",
    HUMI_LOCAL_MATRIX_TEST_MODE: "1",
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repositoryStatus(directory) {
  return execFileSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd: directory,
    encoding: "utf8",
  });
}

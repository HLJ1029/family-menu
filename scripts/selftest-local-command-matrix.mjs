import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildAuthoritativeCommandMatrix,
  classifyMatrixResult,
} from "./lib/local-command-matrix.mjs";

const execFileAsync = promisify(execFile);
const PRODUCT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RUNNER = join(PRODUCT_ROOT, "scripts/run-local-command-matrix.mjs");
const VERIFIER = join(PRODUCT_ROOT, "scripts/verify-local-command-matrix.mjs");
const root = await mkdtemp(join(tmpdir(), "humi-local-matrix-selftest-"));

try {
  if (process.argv.includes("--short-smoke")) {
    await shortSmoke();
    console.log("Immutable local command matrix short smoke passed.");
  } else {
    await testAuthoritativeCommandMatrixContract();
    testExternalBlockerClassificationIsExact();
    await testGuardRejectsUnsafeInjection();
    await testAllPassAndDeterministicOrder();
    await testFailureContinues();
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
  const rolloutCommand = { expectedBlockerPolicy: "current-candidate-upload-missing", nonzeroClassification: "fail" };
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
    { expectedBlockerPolicy: "true-device-evidence-missing", nonzeroClassification: "fail" },
    processResult({ code: 1, stdout: "True-device evidence blocked: 0/56.\n" }),
  ), "blocker");
  assert.equal(classifyMatrixResult(
    { expectedBlockerPolicy: "true-device-evidence-missing", nonzeroClassification: "fail" },
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
    nodeCommand("first", "console.log('first')"),
    nodeCommand("second", "console.error('second')"),
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
  const commandFile = await writeCommands(fixture, [nodeCommand("guard", "")]);
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

async function testAllPassAndDeterministicOrder() {
  const fixture = await makeFixture("ordered");
  const orderPath = join(fixture.fixtureRoot, ".order");
  const append = (value) => nodeCommand(
    value,
    `require('node:fs').appendFileSync(${JSON.stringify(orderPath)}, ${JSON.stringify(`${value}\n`)})`,
  );
  const result = await runMatrix(fixture, [append("alpha"), append("beta"), append("gamma")], "ordered");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(await readFile(orderPath, "utf8"), "alpha\nbeta\ngamma\n");
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
}

async function testFailureContinues() {
  const fixture = await makeFixture("failure");
  const marker = join(fixture.fixtureRoot, ".continued");
  const commands = [
    nodeCommand("fails", "process.exit(7)"),
    nodeCommand("continues", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes')`),
  ];
  const result = await runMatrix(fixture, commands, "failure");
  assert.notEqual(result.code, 0);
  assert.equal(await readFile(marker, "utf8"), "yes");
  const manifest = await readManifest(fixture, "failure");
  assert.deepEqual(manifest.results.map((entry) => entry.classification), ["fail", "pass"]);
  assert.equal(manifest.results[0].exit.code, 7);
  assert.equal(manifest.overallResult, "failed");
}

async function testTimeout() {
  const fixture = await makeFixture("timeout");
  const command = nodeCommand("times-out", "setInterval(() => {}, 1000)", { timeoutMs: 100 });
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
  const payload = [
    `Authorization: ${auth}`,
    `https://example.test/callback?token=${token}&ticket=${ticket}`,
    `email=${email}`,
    `phone=${phone}`,
    `openid=${openId}`,
    `UnionID=${unionId}`,
    `HUMI_TELEMETRY_HASH_SALT=${salt}`,
    `WECHAT_APP_SECRET=${secret}`,
    JSON.stringify({ accessToken: jsonToken, appSecret: secret, openId, unionId }),
    fixture.evidenceRoot,
  ].join("\n");
  const command = nodeCommand(
    "redacts",
    `const fs=require('node:fs'); const p=require('node:path'); const d=p.join(process.env.HUMI_PRIVATE_EVIDENCE_DIR,'nested'); fs.mkdirSync(d,{recursive:true}); fs.writeFileSync(p.join(d,'manifest.json'),${JSON.stringify(payload)}); process.stdout.write(${JSON.stringify(payload)}); process.stderr.write(${JSON.stringify(payload)})`,
  );
  const result = await runMatrix(fixture, [command], "redaction");
  assert.equal(result.code, 0, result.stderr);
  const runDir = join(fixture.evidenceRoot, "redaction");
  const persisted = await readPersistedText(runDir);
  for (const unsafe of [auth, token, ticket, email, phone, openId, unionId, salt, secret, jsonToken, fixture.evidenceRoot]) {
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
  const commands = [nodeCommand("once", "console.log('once')")];
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
    nodeCommand("first", "console.log('first')"),
    nodeCommand("waiting", "setTimeout(() => console.log('second'), 900)"),
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
      return parsed.state === "running" && parsed.results.length === 1 ? parsed : null;
    } catch {
      return null;
    }
  });
  assert.equal(partial.results[0].id, "first");
  assert.equal(partial.currentCommand.id, "waiting");
  const completed = await output;
  assert.equal(completed.code, 0, completed.stderr);
  const leftovers = (await readdir(join(fixture.evidenceRoot, "partial")))
    .filter((name) => name.includes(".tmp"));
  assert.deepEqual(leftovers, []);
}

async function testRepositoryMutation() {
  const fixture = await makeFixture("mutation");
  const tracked = join(fixture.repo, "README.md");
  const command = nodeCommand(
    "mutates-repo",
    `require('node:fs').writeFileSync(${JSON.stringify(tracked)}, ${JSON.stringify("changed\n")})`,
  );
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
  const commands = [nodeCommand("external", "console.log('no evidence')", {
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

function nodeCommand(id, source, overrides = {}) {
  return {
    id,
    executable: process.execPath,
    args: ["-e", source],
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

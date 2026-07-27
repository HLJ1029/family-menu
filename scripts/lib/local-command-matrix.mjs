import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
  LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
  LAST_UPLOADED_EXPERIENCE_VERSION,
} from "../release-candidate.mjs";
import { REQUIRED_SCENARIOS } from "../check-humi-true-device-evidence.mjs";

export const PRODUCT_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PACKAGE_MANIFEST = JSON.parse(readFileSync(join(PRODUCT_ROOT, "package.json"), "utf8"));
export const DEFAULT_EXTERNAL_HANDOFF = "/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/native-shell/HANDOFF.md";
export const DEFAULT_EVIDENCE_ROOT = join(
  homedir(),
  ".humi-release-evidence",
  "HUMI-2026-001",
  "local-command-matrix",
);
export const SECRET_SCAN = "/Users/honglijie/AI-HQ/scripts/secret-scan.sh";
const MANIFEST_NAME = "manifest.json";
const MANIFEST_HASH_SCOPE = "manifest-json-with-integrity-omitted";
const FIXTURE_HELPER = resolve(fileURLToPath(new URL("../local-command-matrix-fixture.mjs", import.meta.url)));
const TEST_ACTION_KEYS = new Set(["id", "action", "timeoutMs", "exitCode", "delayMs", "expectedExternalBlocker"]);
const TEST_ACTIONS = new Set([
  "pass", "fail", "timeout", "wait", "append-order", "write-marker", "mutate-repo",
  "redact-output-and-artifact", "artifact-symlink", "artifact-oversize", "artifact-batch-unsafe",
  "observation-failure", "log-write-failure",
]);
let atomicCounter = 0;

export async function runLocalCommandMatrix(options = {}) {
  const repoRoot = await realpath(options.repoRoot || PRODUCT_ROOT);
  const evidenceRoot = resolve(options.evidenceRoot || DEFAULT_EVIDENCE_ROOT);
  await assertRepository(repoRoot, { fixed: !options.testMode });
  await assertEvidenceOutsideRepository(repoRoot, evidenceRoot);

  const startState = await readRepositoryState(repoRoot);
  if (!startState.clean) {
    throw new Error("local matrix requires a clean fixed worktree");
  }

  const npmVersion = (await captureProcess("npm", ["--version"], {
    cwd: repoRoot,
    timeoutMs: 30_000,
  })).stdout.toString("utf8").trim();
  const runId = options.runId || `${compactUtc(new Date())}-${startState.head.slice(0, 12)}`;
  assertSafeRunId(runId);
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  await chmod(evidenceRoot, 0o700);
  const runDir = join(evidenceRoot, runId);
  try {
    await mkdir(runDir, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`refusing to overwrite existing local matrix run: ${runId}`);
    }
    throw error;
  }
  const logsDir = join(runDir, "logs");
  const artifactsDir = join(runDir, "artifacts");
  await mkdir(logsDir, { mode: 0o700 });
  await mkdir(artifactsDir, { mode: 0o700 });

  const commands = options.commands || buildAuthoritativeCommandMatrix({
    repoRoot,
    artifactsDir,
    trueDeviceEvidenceDir: options.trueDeviceEvidenceDir,
    candidateCommit: options.candidateCommit,
  });
  validateCommands(commands, { testMode: options.testMode });
  const privatePaths = [evidenceRoot, runDir, artifactsDir, options.trueDeviceEvidenceDir]
    .filter(Boolean)
    .map((value) => resolve(value));
  const manifest = {
    schemaVersion: 1,
    runId,
    state: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    repository: {
      path: repoRoot,
      start: publicRepositoryState(startState),
      final: null,
      changedDuringRun: false,
      observations: [],
    },
    candidate: {
      reviewPackageVersion: CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
      uploadedRuntimeVersion: LAST_UPLOADED_EXPERIENCE_VERSION,
      uploadedRuntimeCommit: LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
    },
    runtime: {
      node: process.version,
      npm: npmVersion,
    },
    matrix: commands.map((command, index) => publicCommand(command, index, privatePaths)),
    currentCommand: null,
    results: [],
    aggregate: aggregateResults([]),
    overallResult: "running",
    runnerErrors: [],
    integrity: null,
  };
  await persistManifest(runDir, manifest);

  for (let index = 0; index < commands.length; index += 1) {
    const command = commands[index];
    const sequence = index + 1;
    manifest.currentCommand = { sequence, id: command.id, startedAt: new Date().toISOString() };
    await persistManifest(runDir, manifest);
    console.log(`[local-matrix] ${sequence}/${commands.length} start ${command.id}`);
    const startedMs = Date.now();
    const startedAt = new Date(startedMs);
    const execution = await captureProcess(command.executable, command.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        HUMI_PRIVATE_EVIDENCE_DIR: artifactsDir,
        ...command.env,
      },
      timeoutMs: command.timeoutMs,
    });
    const stdout = redactOutput(execution.stdout.toString("utf8"), privatePaths);
    const stderr = redactOutput(execution.stderr.toString("utf8"), privatePaths);
    const runnerErrors = [];
    let artifactSanitization = { files: 0, redactions: 0, errorCodes: [], status: "passed" };
    try {
      const artifactReport = await sanitizeArtifactText(artifactsDir, privatePaths);
      artifactSanitization = {
        ...artifactReport,
        status: artifactReport.errorCodes.length ? "failed" : "passed",
      };
      if (artifactReport.errorCodes.length) {
        runnerErrors.push({
          code: "artifact_sanitization_failed",
          stage: "artifact_sanitization",
          errorCodes: artifactReport.errorCodes,
        });
      }
    } catch {
      artifactSanitization = {
        files: 0,
        redactions: 0,
        errorCodes: ["artifact_scan_failed"],
        status: "failed",
      };
      runnerErrors.push({ code: "artifact_sanitization_failed", stage: "artifact_sanitization" });
    }
    const logStem = `${String(sequence).padStart(3, "0")}-${command.id}`;
    if (command.testFixtureAction === "log-write-failure") {
      await mkdir(join(logsDir, `${logStem}.stdout.log`), { mode: 0o700 });
    }
    const stdoutPersisted = await persistLogWithBoundary(logsDir, `${logStem}.stdout.log`, stdout.text);
    const stderrPersisted = await persistLogWithBoundary(logsDir, `${logStem}.stderr.log`, stderr.text);
    if (stdoutPersisted.error) runnerErrors.push(stdoutPersisted.error);
    if (stderrPersisted.error) runnerErrors.push(stderrPersisted.error);
    let observed = null;
    try {
      if (command.testFixtureAction === "observation-failure") throw new Error("controlled observation failure");
      observed = await readRepositoryState(repoRoot);
      manifest.repository.observations.push({
        afterCommand: command.id,
        ...publicRepositoryState(observed),
      });
      if (!sameRepositoryState(startState, observed)) manifest.repository.changedDuringRun = true;
    } catch {
      manifest.repository.changedDuringRun = true;
      manifest.repository.observations.push({
        afterCommand: command.id,
        available: false,
        errorCode: "repository_observation_failed",
      });
      runnerErrors.push({ code: "repository_observation_failed", stage: "repository_observation" });
    }
    const finishedMs = Date.now();
    const finishedAt = new Date(finishedMs);
    const classification = runnerErrors.length ? "fail" : classifyResult(command, execution);
    manifest.results.push({
      ...publicCommand(command, index, privatePaths),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedMs - startedMs),
      exit: {
        code: execution.code,
        signal: execution.signal,
        timedOut: execution.timedOut,
      },
      logs: {
        stdout: stdoutPersisted.record,
        stderr: stderrPersisted.record,
      },
      redactions: {
        stdout: stdout.count,
        stderr: stderr.count,
        total: stdout.count + stderr.count,
      },
      artifactSanitization,
      runnerErrors,
      classification,
    });
    manifest.currentCommand = null;
    manifest.aggregate = aggregateResults(manifest.results);
    await persistManifest(runDir, manifest);
    console.log(`[local-matrix] ${sequence}/${commands.length} ${classification} ${command.id}`);
  }

  try {
    const finalState = await readRepositoryState(repoRoot);
    manifest.repository.final = publicRepositoryState(finalState);
    if (!sameRepositoryState(startState, finalState)) manifest.repository.changedDuringRun = true;
  } catch {
    manifest.repository.final = {
      ...publicRepositoryState(startState),
      clean: false,
      available: false,
      errorCode: "final_repository_observation_failed",
    };
    manifest.repository.changedDuringRun = true;
    manifest.runnerErrors.push({
      code: "final_repository_observation_failed",
      stage: "final_repository_observation",
    });
  }
  manifest.state = "complete";
  manifest.finishedAt = new Date().toISOString();
  manifest.currentCommand = null;
  manifest.aggregate = aggregateResults(manifest.results);
  manifest.overallResult = manifest.repository.changedDuringRun
    ? "failed"
    : manifest.aggregate.fail > 0 || manifest.aggregate.timeout > 0
      ? "failed"
      : manifest.aggregate.blocker > 0
        ? "blocked"
        : "passed";
  const persisted = await persistManifest(runDir, manifest);
  const fileSha256 = sha256(persisted);
  await atomicWrite(
    join(runDir, "manifest.sha256"),
    `${fileSha256}  ${MANIFEST_NAME}\n`,
    0o600,
  );
  console.log(`[local-matrix] evidence directory: ${runDir}`);
  console.log(`[local-matrix] manifest canonical SHA-256: ${manifest.integrity.manifestSha256}`);
  console.log(`[local-matrix] manifest file SHA-256: ${fileSha256}`);
  return {
    runDir,
    manifestPath: join(runDir, MANIFEST_NAME),
    manifestCanonicalSha256: manifest.integrity.manifestSha256,
    manifestFileSha256: fileSha256,
    overallResult: manifest.overallResult,
    exitCode: manifest.overallResult === "passed" ? 0 : 1,
  };
}

export function buildAuthoritativeCommandMatrix({
  repoRoot = PRODUCT_ROOT,
  artifactsDir = "<PRIVATE_EVIDENCE_DIR>",
  trueDeviceEvidenceDir,
  candidateCommit,
} = {}) {
  if (Boolean(trueDeviceEvidenceDir) !== Boolean(candidateCommit)) {
    throw new Error("true-device evidence directory and candidate commit must be supplied together");
  }
  if (trueDeviceEvidenceDir && (!isAbsolute(trueDeviceEvidenceDir) || !/^[a-f0-9]{40}$/.test(candidateCommit))) {
    throw new Error("true-device evidence must use an absolute directory and full candidate commit");
  }
  const standard = [
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
  ].map((script) => npmCommand(script, script, {
    env: script === "validate:h5-entry"
      ? { HUMI_H5_ENTRY_EVIDENCE_DIR: join(artifactsDir, "h5-entry") }
      : undefined,
  }));
  const evidenceEnv = trueDeviceEvidenceDir
    ? {
      HUMI_TRUE_DEVICE_EVIDENCE_DIR: resolve(trueDeviceEvidenceDir),
      HUMI_TRUE_DEVICE_CANDIDATE_COMMIT: candidateCommit,
    }
    : undefined;
  const startup = npmCommand("validate:startup-performance", "validate:startup-performance", {
    env: evidenceEnv,
    expectedBlockerPolicy: !trueDeviceEvidenceDir ? "startup-evidence-missing" : null,
  });
  const tail = [
    npmCommand("smoke:native-shell-ui", "smoke:native-shell-ui"),
    npmCommand("release:product:review", "release:product:review"),
    npmCommand("release:product:smoke", "release:product:smoke", { timeoutMs: 15 * 60_000 }),
    npmCommand("release:collaboration:smoke", "release:collaboration:smoke", { timeoutMs: 15 * 60_000 }),
    npmCommand("validate:supabase-retirement", "validate:supabase-retirement"),
    npmCommand("release:candidate:privacy:check", "release:candidate:privacy:check"),
    npmCommand("release:wechat:privacy:check", "release:wechat:privacy:check"),
    npmCommand("release:security:audit", "release:security:audit", { timeoutMs: 3 * 60_000 }),
    npmCommand("validate:true-device-evidence:selftest", "validate:true-device-evidence:selftest", { timeoutMs: 15 * 60_000 }),
    npmCommand("validate:true-device-evidence", "validate:true-device-evidence", {
      env: evidenceEnv,
      expectedBlockerPolicy: !trueDeviceEvidenceDir ? "true-device-evidence-missing" : null,
    }),
    npmCommand("build", "build"),
    npmCommand("release:native-shell:check:local", "release:native-shell:check:local", {
      expectedBlockerPolicy: "current-candidate-upload-missing",
    }),
    npmCommand("release:native-shell:check", "release:native-shell:check", {
      env: { HUMI_NATIVE_HANDOFF_PATH: DEFAULT_EXTERNAL_HANDOFF },
      expectedBlockerPolicy: "current-candidate-upload-missing",
      timeoutMs: 10 * 60_000,
    }),
    command("git-diff-check", "git", ["diff", "--check"], { timeoutMs: 60_000 }),
    command("ai-hq-secret-scan", SECRET_SCAN, [], {
      env: { HUMI_REPO: repoRoot },
      timeoutMs: 5 * 60_000,
    }),
  ];
  return [...standard, startup, ...tail];
}

export async function verifyLocalCommandMatrix(manifestPath) {
  const absoluteManifest = resolve(manifestPath);
  const runDir = dirname(absoluteManifest);
  const bytes = await readFile(absoluteManifest);
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.state !== "complete" || typeof manifest.finishedAt !== "string"
    || manifest.currentCommand !== null || !manifest.repository?.final
    || !Array.isArray(manifest.matrix) || !Array.isArray(manifest.results)
    || manifest.results.length !== manifest.matrix.length) {
    throw new Error("manifest is not complete");
  }
  for (let index = 0; index < manifest.matrix.length; index += 1) {
    if (manifest.matrix[index]?.sequence !== index + 1
      || manifest.results[index]?.sequence !== index + 1
      || manifest.matrix[index]?.id !== manifest.results[index]?.id) {
      throw new Error("manifest command results are incomplete or out of order");
    }
  }
  const declaredIntegrity = manifest.integrity;
  assertIntegrityShape(declaredIntegrity);
  const canonical = canonicalManifestBytes(manifest);
  const canonicalSha256 = sha256(canonical);
  if (canonicalSha256 !== declaredIntegrity.manifestSha256) {
    throw new Error("manifest canonical hash mismatch");
  }
  for (const result of manifest.results || []) {
    for (const stream of ["stdout", "stderr"]) {
      const record = result.logs?.[stream];
      if (record?.status === "unavailable") {
        if (record.path !== null || record.bytes !== 0 || record.sha256 !== null
          || !result.runnerErrors?.some((entry) => entry.code === "log_persistence_failed")) {
          throw new Error(`invalid unavailable ${stream} log record for ${result.id}`);
        }
        continue;
      }
      if (!record || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isInteger(record.bytes)) {
        throw new Error(`invalid ${stream} log record for ${result.id}`);
      }
      const logPath = safeChildPath(runDir, record.path);
      const logBytes = await readFile(logPath);
      if (logBytes.byteLength !== record.bytes || sha256(logBytes) !== record.sha256) {
        throw new Error(`${stream} log hash mismatch for ${result.id}`);
      }
    }
  }
  const sidecarPath = join(runDir, "manifest.sha256");
  let sidecar;
  try {
    sidecar = (await readFile(sidecarPath, "utf8")).trim();
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("manifest SHA-256 sidecar is required");
    throw error;
  }
  const expectedFileSha = sidecar.match(/^([a-f0-9]{64})  manifest\.json$/)?.[1];
  if (!expectedFileSha || expectedFileSha !== sha256(bytes)) {
    throw new Error("manifest file hash mismatch");
  }
  return {
    manifestCanonicalSha256: canonicalSha256,
    manifestFileSha256: sha256(bytes),
    commands: manifest.results?.length || 0,
  };
}

function npmCommand(id, script, options = {}) {
  const scriptCommand = PACKAGE_MANIFEST.scripts?.[script];
  if (typeof scriptCommand !== "string" || !scriptCommand) {
    throw new Error(`package script is unavailable: ${script}`);
  }
  return command(id, "npm", ["run", script], {
    scriptIdentity: script,
    expectedNpmPreamble: [
      `> ${PACKAGE_MANIFEST.name}@${PACKAGE_MANIFEST.version} ${script}`,
      `> ${scriptCommand}`,
    ],
    timeoutMs: 10 * 60_000,
    ...options,
  });
}

function command(id, executable, args, options = {}) {
  return {
    id,
    executable,
    args,
    timeoutMs: options.timeoutMs || 5 * 60_000,
    scriptIdentity: options.scriptIdentity || null,
    env: options.env || {},
    expectedExternalBlocker: options.expectedExternalBlocker === true,
    expectedBlockerPolicy: options.expectedBlockerPolicy || null,
    expectedNpmPreamble: options.expectedNpmPreamble || null,
    nonzeroClassification: options.nonzeroClassification || "fail",
  };
}

function validateCommands(commands, { testMode }) {
  if (!Array.isArray(commands) || commands.length === 0) throw new Error("local matrix command list is empty");
  const ids = new Set();
  for (const item of commands) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("invalid matrix command");
    if (testMode) {
      if (item.executable !== process.execPath || item.args?.[0] !== FIXTURE_HELPER || item.scriptIdentity !== "controlled-test-fixture") {
        throw new Error("test-only matrix command list must use the controlled fixture helper");
      }
    }
    if (!/^[a-z0-9][a-z0-9:._-]{0,79}$/.test(item.id) || ids.has(item.id)) {
      throw new Error(`invalid or duplicate matrix command id: ${item.id}`);
    }
    ids.add(item.id);
    if (typeof item.executable !== "string" || !item.executable || !Array.isArray(item.args)
      || item.args.some((arg) => typeof arg !== "string")) {
      throw new Error(`invalid argv for ${item.id}`);
    }
    if (!Number.isInteger(item.timeoutMs) || item.timeoutMs < 50 || item.timeoutMs > 30 * 60_000) {
      throw new Error(`invalid timeout for ${item.id}`);
    }
    if (!new Set(["fail", "blocker"]).has(item.nonzeroClassification)) {
      throw new Error(`invalid nonzero classification for ${item.id}`);
    }
  }
}

function publicCommand(commandEntry, index, privatePaths) {
  const argv = [commandEntry.executable, ...commandEntry.args];
  const identity = {
    executable: commandEntry.executable,
    args: commandEntry.args,
    env: commandEntry.env || {},
  };
  return {
    sequence: index + 1,
    id: commandEntry.id,
    executable: redactOutput(commandEntry.executable, privatePaths).text,
    argv: argv.map((value) => redactOutput(value, privatePaths).text),
    argvSha256: sha256(JSON.stringify(identity)),
    scriptIdentity: commandEntry.scriptIdentity || null,
    environmentKeys: Object.keys(commandEntry.env || {}).sort(),
    timeoutMs: commandEntry.timeoutMs,
    expectedExternalBlocker: commandEntry.expectedExternalBlocker === true || Boolean(commandEntry.expectedBlockerPolicy),
    blockerPolicy: commandEntry.expectedBlockerPolicy || null,
    nonzeroClassification: commandEntry.nonzeroClassification,
  };
}

export function classifyMatrixResult(commandEntry, execution) {
  if (execution.timedOut) return "timeout";
  if (execution.signal || execution.code === null) return "fail";
  if (commandEntry.expectedBlockerPolicy) {
    if (matchesExpectedBlocker(commandEntry, execution)) return "blocker";
    return execution.code === 0 ? "pass" : "fail";
  }
  if (commandEntry.expectedExternalBlocker) return "blocker";
  if (execution.code === 0) return "pass";
  return commandEntry.nonzeroClassification === "blocker" ? "blocker" : "fail";
}

function classifyResult(commandEntry, execution) {
  return classifyMatrixResult(commandEntry, execution);
}

function matchesExpectedBlocker(commandEntry, execution) {
  const policy = commandEntry.expectedBlockerPolicy;
  const stdout = execution.stdout.toString("utf8");
  if (policy === "true-device-evidence-missing") {
    const stdoutLines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
    const finalLine = stdoutLines.pop();
    const expectedStderr = REQUIRED_SCENARIOS
      .map((scenario) => `${scenario}\tmissing\tscenario_missing`);
    const stderrLines = execution.stderr.toString("utf8").trim().split(/\r?\n/).filter(Boolean);
    return execution.code === 1
      && finalLine === `True-device evidence blocked: 0/${REQUIRED_SCENARIOS.length}.`
      && Array.isArray(commandEntry.expectedNpmPreamble)
      && stdoutLines.length === commandEntry.expectedNpmPreamble.length
      && stdoutLines.every((line, index) => line === commandEntry.expectedNpmPreamble[index])
      && stderrLines.length === expectedStderr.length
      && stderrLines.every((line, index) => line === expectedStderr[index]);
  }
  const report = extractJsonReport(stdout);
  if (policy === "startup-evidence-missing") {
    return execution.code === 0
      && report?.overallStatus === "blocked"
      && report?.externalEvidence?.status === "blocked"
      && report?.externalEvidence?.reason === "true_device_performance_evidence_missing";
  }
  if (policy === "current-candidate-upload-missing") {
    return execution.code === 1
      && Array.isArray(report?.failures)
      && report.failures.length === 1
      && report.failures[0]?.name === "current 1.1.75 candidate has immutable upload evidence";
  }
  return false;
}

function extractJsonReport(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function captureProcess(executable, args, { cwd, env = process.env, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let settled = false;
    let forceTimer = null;
    const child = spawn(executable, args, {
      cwd,
      env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child, "SIGTERM");
      forceTimer = setTimeout(() => terminateChild(child, "SIGKILL"), 1_000);
      forceTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.once("error", (error) => {
      stderr.push(Buffer.from(`process spawn failed: ${error.code || "unknown"}\n`));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      resolvePromise({
        code: Number.isInteger(code) ? code : null,
        signal: signal || null,
        timedOut,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
  });
}

function terminateChild(child, signal) {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

export function redactOutput(input, privatePaths = []) {
  let text = String(input);
  let count = 0;
  const replace = (pattern, replacement) => {
    text = text.replace(pattern, (...args) => {
      count += 1;
      if (typeof replacement === "function") return replacement(...args);
      return replacement.replace(/\$(\d+)/g, (_token, index) => args[Number(index)] ?? "");
    });
  };
  for (const privatePath of [...privatePaths].sort((a, b) => b.length - a.length)) {
    if (!privatePath) continue;
    replace(new RegExp(escapeRegExp(privatePath), "g"), "[REDACTED_PRIVATE_EVIDENCE_PATH]");
  }
  replace(/(authorization\s*:\s*)[^\r\n]+/gi, "$1[REDACTED_AUTHORIZATION]");
  replace(
    /((?:\\?["'])authorization(?:\\?["'])\s*:\s*(?:\\?["']))[^\\\r\n"']+(?=(?:\\?["']))/gi,
    "$1[REDACTED_AUTHORIZATION]",
  );
  replace(/\bbearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED_TOKEN]");
  replace(/([?&](?:access_token|refresh_token|token|ticket|auth|authorization|code|openid|unionid)=)[^&#\s"']+/gi, "$1[REDACTED_QUERY_VALUE]");
  replace(
    /((?:\\?["'])?(?:(?:wechat_?)?app_?secret|humi_session_secret|humi_telemetry_hash_salt|telemetry_salt|api_?key|access_?token|refresh_?token|id_?token|session_?token|ticket|authorization)(?:\\?["'])?\s*[=:]\s*(?:\\?["'])?)[^\s,\\"']+/gi,
    "$1[REDACTED_SECRET]",
  );
  replace(
    /((?:\\?["'])?(?:openid|unionid|open_id|union_id)(?:\\?["'])?\s*[=:]\s*(?:\\?["'])?)[A-Za-z0-9_-]+/gi,
    "$1[REDACTED_IDENTIFIER]",
  );
  replace(/\b(?:1[3-9]\d{9}|\+?86[- ]?1[3-9]\d{9})\b/g, "[REDACTED_PHONE]");
  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  return { text, count };
}

async function persistLog(logsDir, filename, text) {
  const bytes = Buffer.from(text, "utf8");
  const path = join(logsDir, filename);
  await atomicWrite(path, bytes, 0o600);
  return {
    path: join("logs", filename),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function persistLogWithBoundary(logsDir, filename, text) {
  try {
    return { record: await persistLog(logsDir, filename, text), error: null };
  } catch {
    const exactPath = join(logsDir, filename);
    try {
      await rm(exactPath, { recursive: true, force: true });
      const record = await persistLog(logsDir, filename, "[RUNNER_ERROR: log persistence recovered]\n");
      return {
        record,
        error: { code: "log_persistence_failed", stage: "log_persistence" },
      };
    } catch {
      return {
        record: { status: "unavailable", path: null, bytes: 0, sha256: null },
        error: { code: "log_persistence_failed", stage: "log_persistence" },
      };
    }
  }
}

async function sanitizeArtifactText(root, privatePaths) {
  const report = { files: 0, redactions: 0, errorCodes: [] };
  const record = (code) => {
    if (!report.errorCodes.includes(code)) report.errorCodes.push(code);
  };
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      record("artifact_directory_read_failed");
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          await rm(path, { force: true });
          record("artifact_symlink_rejected");
        } catch {
          record("artifact_symlink_removal_failed");
        }
        continue;
      }
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      let info;
      try {
        info = await stat(path);
      } catch {
        record("artifact_stat_failed");
        continue;
      }
      if (info.size > 8 * 1024 * 1024) {
        try {
          const bytes = await readFile(path);
          if (decodeControlledText(bytes.subarray(0, 64 * 1024)) !== null) {
            await rm(path, { force: true });
            record("artifact_text_oversize_rejected");
          }
        } catch {
          record("artifact_oversize_inspection_failed");
        }
        continue;
      }
      let bytes;
      try {
        bytes = await readFile(path);
      } catch {
        record("artifact_read_failed");
        continue;
      }
      const original = decodeControlledText(bytes);
      if (original === null) continue;
      const sanitized = redactOutput(original, privatePaths);
      report.files += 1;
      report.redactions += sanitized.count;
      try {
        if (sanitized.text !== original) await atomicWrite(path, sanitized.text, 0o600);
        else await chmod(path, 0o600);
      } catch {
        record("artifact_write_failed");
      }
    }
  }
  await visit(root);
  return report;
}

function decodeControlledText(bytes) {
  if (bytes.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let controls = 0;
    for (const character of text) {
      const code = character.charCodeAt(0);
      if (code < 32 && !new Set([9, 10, 13]).has(code)) controls += 1;
    }
    return controls > Math.max(4, text.length / 100) ? null : text;
  } catch {
    return null;
  }
}

async function persistManifest(runDir, manifest) {
  const canonical = canonicalManifestBytes(manifest);
  manifest.integrity = {
    algorithm: "sha256",
    scope: MANIFEST_HASH_SCOPE,
    manifestSha256: sha256(canonical),
  };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await atomicWrite(join(runDir, MANIFEST_NAME), bytes, 0o600);
  return bytes;
}

function canonicalManifestBytes(manifest) {
  const copy = structuredClone(manifest);
  delete copy.integrity;
  return Buffer.from(`${JSON.stringify(copy, null, 2)}\n`, "utf8");
}

async function atomicWrite(path, value, mode) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${atomicCounter += 1}.tmp`);
  await writeFile(temporary, value, { mode, flag: "wx" });
  await rename(temporary, path);
  await chmod(path, mode);
}

async function assertRepository(repoRoot, { fixed }) {
  const probe = await captureProcess("git", ["rev-parse", "--show-toplevel"], {
    cwd: repoRoot,
    timeoutMs: 30_000,
  });
  if (probe.code !== 0) throw new Error("local matrix repository is not a Git worktree");
  const top = await realpath(probe.stdout.toString("utf8").trim());
  if (top !== repoRoot) throw new Error("local matrix repository path is not the worktree root");
  if (fixed && repoRoot !== await realpath(PRODUCT_ROOT)) {
    throw new Error("local matrix must run in its fixed product worktree");
  }
}

async function assertEvidenceOutsideRepository(repoRoot, evidenceRoot) {
  const relation = relative(repoRoot, evidenceRoot);
  if (!relation || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    throw new Error("private evidence directory must be outside Git");
  }
}

async function readRepositoryState(repoRoot) {
  const [head, tree, statusResult] = await Promise.all([
    git(repoRoot, ["rev-parse", "HEAD"]),
    git(repoRoot, ["rev-parse", "HEAD^{tree}"]),
    git(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  const status = statusResult.trimEnd();
  return {
    head: head.trim(),
    tree: tree.trim(),
    clean: status.length === 0,
    statusEntries: status ? status.split("\n").length : 0,
    statusSha256: sha256(status),
  };
}

async function git(repoRoot, args) {
  const result = await captureProcess("git", args, { cwd: repoRoot, timeoutMs: 30_000 });
  if (result.code !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.toString("utf8");
}

function publicRepositoryState(state) {
  return {
    head: state.head,
    tree: state.tree,
    clean: state.clean,
    statusEntries: state.statusEntries,
    statusSha256: state.statusSha256,
  };
}

function sameRepositoryState(left, right) {
  return left.head === right.head
    && left.tree === right.tree
    && left.clean === right.clean
    && left.statusSha256 === right.statusSha256;
}

function aggregateResults(results) {
  const aggregate = { total: results.length, pass: 0, fail: 0, blocker: 0, timeout: 0 };
  for (const result of results) aggregate[result.classification] += 1;
  return aggregate;
}

function compactUtc(date) {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function assertSafeRunId(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(runId)) throw new Error("invalid local matrix run id");
}

function assertIntegrityShape(integrity) {
  if (integrity?.algorithm !== "sha256" || integrity.scope !== MANIFEST_HASH_SCOPE
    || !/^[a-f0-9]{64}$/.test(integrity.manifestSha256 || "")) {
    throw new Error("invalid manifest integrity record");
  }
}

function safeChildPath(root, child) {
  if (typeof child !== "string" || isAbsolute(child)) throw new Error("unsafe log path");
  const absolute = resolve(root, child);
  const relation = relative(root, absolute);
  if (!relation || relation.startsWith(`..${sep}`) || relation === "..") throw new Error("unsafe log path");
  return absolute;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function loadTestCommands(commandFile) {
  const bytes = await readFile(commandFile);
  if (bytes.byteLength > 256 * 1024) throw new Error("test command file is too large");
  const actions = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(actions) || actions.length === 0) throw new Error("test-only matrix command list must contain controlled actions");
  return actions.map((entry) => compileTestAction(entry));
}

export async function assertTestInjectionGuard({ repoRoot, evidenceRoot, commandFile }) {
  const enabled = process.env.NODE_ENV === "test" && process.env.HUMI_LOCAL_MATRIX_TEST_MODE === "1";
  if (!enabled) throw new Error("test-only matrix injection refused: explicit test guards are required");
  const tempRoot = await realpath(tmpdir());
  const canonicalPaths = [];
  for (const path of [repoRoot, evidenceRoot, commandFile]) {
    if (!isAbsolute(path)) throw new Error("test-only matrix injection refused: paths must be absolute");
    const canonical = await realpath(path);
    const relation = relative(tempRoot, canonical);
    if (relation.startsWith(`..${sep}`) || relation === ".." || !relation) {
      throw new Error("test-only matrix injection refused: paths must stay under the system temporary directory");
    }
    canonicalPaths.push(canonical);
  }
  const commandInfo = await stat(canonicalPaths[2]);
  if (!commandInfo.isFile()) throw new Error("test-only matrix command list must be a file");
  return {
    repoRoot: canonicalPaths[0],
    evidenceRoot: canonicalPaths[1],
    commandFile: canonicalPaths[2],
  };
}

function compileTestAction(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("test-only matrix command list contains an invalid action");
  }
  const extra = Object.keys(entry).filter((key) => !TEST_ACTION_KEYS.has(key));
  if (extra.length || !TEST_ACTIONS.has(entry.action) || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(entry.id || "")) {
    throw new Error("test-only matrix command list contains an unsupported action");
  }
  const timeoutMs = entry.timeoutMs ?? 5_000;
  let value = "";
  if (entry.action === "fail") {
    if (!Number.isInteger(entry.exitCode) || entry.exitCode < 1 || entry.exitCode > 125) {
      throw new Error("test-only matrix command list contains an invalid failure action");
    }
    value = String(entry.exitCode);
  } else if (entry.action === "wait") {
    if (!Number.isInteger(entry.delayMs) || entry.delayMs < 1 || entry.delayMs > 2_000) {
      throw new Error("test-only matrix command list contains an invalid wait action");
    }
    value = String(entry.delayMs);
  } else if (entry.exitCode !== undefined || entry.delayMs !== undefined) {
    throw new Error("test-only matrix command list contains unexpected action parameters");
  }
  return {
    id: entry.id,
    executable: process.execPath,
    args: [FIXTURE_HELPER, entry.action, entry.id, value],
    timeoutMs,
    scriptIdentity: "controlled-test-fixture",
    env: {},
    expectedExternalBlocker: entry.expectedExternalBlocker === true,
    expectedBlockerPolicy: null,
    nonzeroClassification: "fail",
    testFixtureAction: entry.action,
  };
}

import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION } from "./release-candidate.mjs";

const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const candidateTime = Date.parse(execFileSync(
  "git",
  ["show", "-s", "--format=%cI", candidateCommit],
  { encoding: "utf8" },
).trim());

function run(args = []) {
  return spawnSync(process.execPath, ["scripts/check-startup-performance.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function parseReport(runResult) {
  assert.ok(runResult.stdout.trim(), runResult.stderr);
  return JSON.parse(runResult.stdout);
}

async function writePerformanceFixture(root, {
  durations = [400, 1000, 2500],
  packageVersion = CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
  manifestVersion = 3,
  descriptorVersion = 2,
  unsafeMediaPath = false,
} = {}) {
  const scenarios = [
    ["performance_cached_first_paint", ["cached_summary_present", "first_paint_observed", "fresh_bootstrap_pending"]],
    ["performance_warm_bootstrap", ["valid_session_present", "bootstrap_measured", "native_page_ready"]],
    ["performance_cold_authenticated_bootstrap", ["cold_authenticated_start", "session_exchange_completed", "native_page_ready"]],
  ];
  const startedAt = new Date(Math.max(candidateTime + 1000, Date.now() - 120_000)).toISOString();
  const finishedAt = new Date(Math.max(candidateTime + 2000, Date.now() - 60_000)).toISOString();
  const entries = {};
  const hashes = [];
  await mkdir(join(root, "descriptors"), { recursive: true });
  for (let index = 0; index < scenarios.length; index += 1) {
    const [scenario, checks] = scenarios[index];
    const mediaPath = unsafeMediaPath && index === 0 ? "../outside.png" : `${scenario}.png`;
    if (!mediaPath.startsWith("..")) {
      const target = join(root, mediaPath);
      execFileSync(
        "/usr/bin/sips",
        ["--cropToHeightWidth", `${480 - index}`, `${480 - index}`, resolve("public/icons/humi-icon-512.png"), "--out", target],
        { stdio: "ignore" },
      );
      hashes.push(createHash("sha256").update(await readFile(target)).digest("hex"));
    }
    const descriptorPath = `descriptors/${scenario}.json`;
    await writeFile(join(root, descriptorPath), `${JSON.stringify({
      schemaVersion: descriptorVersion,
      scenarioId: scenario,
      redacted: true,
      checks: Object.fromEntries(checks.map((check) => [check, true])),
      metrics: { durationMs: durations[index] },
      mediaPaths: [mediaPath],
    }, null, 2)}\n`);
    entries[scenario] = {
      device: "iPhone 15 Pro",
      platform: "iOS",
      wechatVersion: "8.0.56",
      packageVersion,
      householdFixture: "owner-household",
      startedAt,
      finishedAt,
      result: "pass",
      evidencePath: descriptorPath,
    };
  }
  assert.equal(new Set(hashes).size, hashes.length, "performance media fixtures must be unique");
  await writeFile(join(root, "manifest.json"), `${JSON.stringify({
    schemaVersion: manifestVersion,
    scenarios: entries,
  }, null, 2)}\n`);
}

const missingRun = run();
assert.equal(missingRun.status, 0, missingRun.stderr || missingRun.stdout);
const missingReport = parseReport(missingRun);
assert.equal(missingReport.contractOk, true, "local deterministic contracts should be reported separately");
assert.equal(missingReport.deviceBudgetsVerified, false, "device budgets require explicit evidence");
assert.equal(missingReport.overallStatus, "blocked");
assert.equal(Object.prototype.hasOwnProperty.call(missingReport, "ok"), false);
assert.equal(missingReport.externalEvidence.reason, "true_device_performance_evidence_missing");

const root = await mkdtemp(join(tmpdir(), "humi-startup-performance-"));
try {
  await writePerformanceFixture(root);
  const validRun = run(["--evidence-dir", root, "--candidate-commit", candidateCommit]);
  assert.equal(validRun.status, 0, validRun.stderr || validRun.stdout);
  const validReport = parseReport(validRun);
  assert.equal(validReport.deviceBudgetsVerified, true);
  assert.equal(validReport.overallStatus, "passed");
  assert.deepEqual(
    validReport.externalEvidence.measurements.map(({ scenarioId, durationMs }) => ({ scenarioId, durationMs })),
    [
      { scenarioId: "performance_cached_first_paint", durationMs: 400 },
      { scenarioId: "performance_warm_bootstrap", durationMs: 1000 },
      { scenarioId: "performance_cold_authenticated_bootstrap", durationMs: 2500 },
    ],
  );
  for (const measurement of validReport.externalEvidence.measurements) {
    assert.match(measurement.descriptorSha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.prototype.hasOwnProperty.call(measurement, "descriptorPath"), false);
  }
  assert.equal(JSON.stringify(validReport).includes("descriptors/"), false);

  for (const durations of [
    [401, 1000, 2500],
    [400, 1001, 2500],
    [400, 1000, 2501],
  ]) {
    await writePerformanceFixture(root, { durations });
    const overBudgetRun = run(["--evidence-dir", root, "--candidate-commit", candidateCommit]);
    assert.notEqual(overBudgetRun.status, 0);
    assert.equal(
      parseReport(overBudgetRun).externalEvidence.reason,
      "performance_evidence_invalid_or_over_budget",
    );
  }

  await writePerformanceFixture(root, { packageVersion: "9.9.9" });
  const wrongVersionRun = run(["--evidence-dir", root, "--candidate-commit", candidateCommit]);
  assert.notEqual(wrongVersionRun.status, 0);
  assert.equal(parseReport(wrongVersionRun).externalEvidence.reason, "performance_evidence_invalid_or_over_budget");

  await writePerformanceFixture(root, { unsafeMediaPath: true });
  const unsafeRun = run(["--evidence-dir", root, "--candidate-commit", candidateCommit]);
  assert.notEqual(unsafeRun.status, 0);
  assert.equal(parseReport(unsafeRun).externalEvidence.reason, "performance_evidence_invalid_or_over_budget");

  await writePerformanceFixture(root, { manifestVersion: 2 });
  const legacyRun = run(["--evidence-dir", root, "--candidate-commit", candidateCommit]);
  assert.notEqual(legacyRun.status, 0);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Startup performance evidence ingestion self-test passed.");

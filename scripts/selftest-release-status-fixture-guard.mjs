import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateReleaseStatusFixtureMode } from "./lib/release-status-fixture-guard.mjs";

const root = await mkdtemp(join(tmpdir(), "humi-release-status-guard-"));
try {
  const evidencePath = join(root, "evidence.md");
  await writeFile(evidencePath, "fixture\n", { mode: 0o600 });
  const requested = {
    HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY: "1",
    HUMI_RELEASE_STATUS_SKIP_PRODUCT_SMOKE: "1",
    HUMI_RELEASE_STATUS_SKIP_CANDIDATE_PREPARE_SELFTEST: "1",
  };
  for (const [name, env] of [
    ["normal environment", { ...requested }],
    ["missing fixture flag", { ...requested, NODE_ENV: "test" }],
    ["relative evidence", { ...requested, NODE_ENV: "test", HUMI_RELEASE_STATUS_FIXTURE_MODE: "1", HUMI_EVIDENCE_LOG_PATH: "relative.md" }],
    ["outside evidence", { ...requested, NODE_ENV: "test", HUMI_RELEASE_STATUS_FIXTURE_MODE: "1", HUMI_EVIDENCE_LOG_PATH: "/etc/hosts" }],
  ]) {
    const result = validateReleaseStatusFixtureMode(env);
    assert.equal(result.authorized, false, name);
    assert.equal(result.skipRequested, true, name);
  }

  assert.deepEqual(
    validateReleaseStatusFixtureMode({
      ...requested,
      NODE_ENV: "test",
      HUMI_RELEASE_STATUS_FIXTURE_MODE: "1",
      HUMI_EVIDENCE_LOG_PATH: evidencePath,
    }),
    {
      authorized: true,
      skipRequested: true,
      evidencePath,
      reason: "authorized_test_fixture",
    },
  );

  assert.throws(
    () => execFileSync(process.execPath, ["scripts/check-release-status.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, HUMI_RELEASE_STATUS_SKIP_PRODUCT_SMOKE: "1" },
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "pipe"],
    }),
    (error) => {
      const report = JSON.parse(String(error.stdout || ""));
      return report.ok === false
        && report.releaseStatusFixtureGuard?.authorized === false
        && report.releaseStatusFixtureGuard?.reason === "NODE_ENV_must_be_test";
    },
    "normal release:status must reject skip variables before running the matrix",
  );
  for (const [script, variable] of [
    ["scripts/check-api-deploy-readiness.mjs", "HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY"],
    ["scripts/prepare-candidate-validation-packet.mjs", "HUMI_CANDIDATE_PREPARE_SELFTEST"],
    ["scripts/print-release-next-action.mjs", "HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY"],
  ]) {
    assert.throws(
      () => execFileSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: { ...process.env, [variable]: "1" },
        encoding: "utf8",
        timeout: 5_000,
        stdio: ["ignore", "pipe", "pipe"],
      }),
      (error) => {
        const report = JSON.parse(String(error.stdout || ""));
        return report.ok === false
          && report.releaseStatusFixtureGuard?.authorized === false
          && report.releaseStatusFixtureGuard?.reason === "NODE_ENV_must_be_test";
      },
      `${script} must reject ${variable} before any work`,
    );
  }

  const fixtureOutput = execFileSync(process.execPath, ["scripts/check-release-status.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...requested,
      NODE_ENV: "test",
      HUMI_RELEASE_STATUS_FIXTURE_MODE: "1",
      HUMI_EVIDENCE_LOG_PATH: evidencePath,
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 8,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const fixtureReport = parseLastJson(fixtureOutput);
  assert.equal(fixtureReport.releaseStatusFixtureGuard.authorized, true);
  for (const command of [
    "release:check:online",
    "monitor:prod",
    "deploy:api:check",
    "release:product:smoke",
    "release:collaboration:smoke",
  ]) {
    const check = fixtureReport.checks.find((entry) => entry.name === command);
    assert.equal(check?.data?.skipped, true, `${command} must not run in fixture mode`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Release status fixture guard selftest passed.");

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  return JSON.parse(jsonStart >= 0 ? text.slice(jsonStart + 1) : text);
}

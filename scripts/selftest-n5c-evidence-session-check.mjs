import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildN5cAllocation, createN5cSessionFiles, N5C_APP_ID } from "./lib/n5c-evidence-session.mjs";
import { checkN5cSession } from "./lib/n5c-evidence-recorder.mjs";
import { parseCheckN5cArgs } from "./check-n5c-evidence-session.mjs";
import {
  PERFORMANCE_BUDGETS_MS,
  REQUIRED_SCENARIOS,
  SCENARIO_CHECKS,
  SHARE_SCENARIOS,
} from "./check-humi-true-device-evidence.mjs";

process.env.NODE_ENV = "test";
process.env.HUMI_N5C_FIXTURE_MODE = "1";

const root = await mkdtemp(join(tmpdir(), "humi-n5c-check-"));
try {
  const session = {
    schemaVersion: 1,
    sessionId: "n5c-1.1.78-20260802T143920Z-deadbeef",
    createdAt: "2026-08-02T14:39:02.982Z",
    appId: N5C_APP_ID,
    packageVersion: "1.1.78",
    runtimeCommit: "7606aadcd03dafe9925885b7fef5c308ecfb73e0",
    archiveSha256: "4cd91aa53673664b1bb05612b6766b41f393811604111f25280c8db326ce9cc7",
    uploadAttestationRef: "private://HUMI-2026-001/n5b-1.1.78-20260802T140601Z/wechat-upload-machine-attestation.json",
    uploadRawEvidenceSha256: "12475c024ba4096a2d0dee33a4582245eb9e7def0b8982b74f854388e554c6f3",
    status: "prepared",
  };
  const sessionDir = join(root, session.sessionId);
  await createN5cSessionFiles({ sessionDir, session, allocation: buildN5cAllocation() });
  const report = await checkN5cSession({ sessionDir, repoRoot: process.cwd(), verifyCandidate: false });
  assert.equal(report.ok, false);
  assert.equal(report.passed, 0);
  assert.equal(report.required, 56);
  assert.deepEqual(report.counts, { pass: 0, pending: 0, blocked: 0, fail: 0, missing: 56 });
  assert.equal(report.issues.filter((issue) => issue.code === "scenario_missing").length, 56);
  assert.equal(report.issues.filter((issue) => issue.code === "viewport_390x844_missing").length, 2);

  assert.deepEqual(parseCheckN5cArgs(["--session", sessionDir]), { session: sessionDir });
  assert.throws(() => parseCheckN5cArgs([]), (error) => error.code === "arguments_invalid");
  assert.throws(
    () => parseCheckN5cArgs(["--session", sessionDir, "--skip-media", "1"]),
    (error) => error.code === "arguments_invalid",
  );

  const completeSession = { ...session, sessionId: "n5c-1.1.78-20260802T143921Z-deadbeef" };
  const completeDir = join(root, completeSession.sessionId);
  const allocation = buildN5cAllocation();
  await createN5cSessionFiles({ sessionDir: completeDir, session: completeSession, allocation });
  await writeCompleteFixture(completeDir, allocation);
  const complete = await checkN5cSession({
    sessionDir: completeDir,
    repoRoot: process.cwd(),
    verifyCandidate: false,
  });
  assert.equal(complete.ok, true, JSON.stringify(complete.issues));
  assert.equal(complete.passed, 56);
  assert.equal(complete.performance.measurements.length, 3);
  assert.deepEqual(complete.counts, { pass: 56, pending: 0, blocked: 0, fail: 0, missing: 0 });
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("N5c evidence session check selftest passed.");

async function writeCompleteFixture(sessionDir, allocation) {
  const generated = join(sessionDir, "drafts", "base-390x844.png");
  execFileSync("/usr/bin/sips", [
    "--resampleHeightWidth", "844", "390",
    "public/icons/humi-icon-512.png",
    "--out", generated,
  ], { stdio: "ignore" });
  await chmod(generated, 0o600);
  const baseBytes = await readFile(generated);
  const scenarios = {};
  const baseTime = Date.now() - 3 * 60 * 60 * 1000;
  let uniqueIndex = 0;
  for (const scenarioId of REQUIRED_SCENARIOS) {
    const assignment = allocation.scenarios[scenarioId];
    const platform = assignment.deviceSlot === "ios-primary" ? "iOS" : "Android";
    const rotation = Number(scenarioId.match(/rotation_(\d+)$/)?.[1] || 1);
    const startedAt = new Date(baseTime + (scenarioId.startsWith("recommendation_") ? rotation * 3 * 60_000 : 0));
    const finishedAt = new Date(startedAt.getTime() + 60_000);
    const mediaRoles = SHARE_SCENARIOS.includes(scenarioId) ? ["sender", "recipient"] : ["evidence"];
    const mediaPaths = [];
    for (const role of mediaRoles) {
      uniqueIndex += 1;
      const mediaPath = `media/${scenarioId}/${role}-${uniqueIndex}.png`;
      await mkdir(join(sessionDir, "media", scenarioId), { recursive: true, mode: 0o700 });
      await writeFile(
        join(sessionDir, mediaPath),
        Buffer.concat([baseBytes, Buffer.from(`humi-n5c-${uniqueIndex}`)]),
        { mode: 0o600 },
      );
      mediaPaths.push(mediaPath);
    }
    const descriptor = {
      schemaVersion: 2,
      scenarioId,
      redacted: true,
      checks: Object.fromEntries(SCENARIO_CHECKS[scenarioId].map((check) => [check, true])),
      metrics: Object.hasOwn(PERFORMANCE_BUDGETS_MS, scenarioId)
        ? { durationMs: PERFORMANCE_BUDGETS_MS[scenarioId] }
        : {},
      mediaPaths,
    };
    await writeFile(
      join(sessionDir, `descriptors/${scenarioId}.json`),
      `${JSON.stringify(descriptor, null, 2)}\n`,
      { mode: 0o600 },
    );
    scenarios[scenarioId] = {
      device: platform === "iOS" ? "iPhone 15 Pro" : "Pixel 9",
      platform,
      wechatVersion: "8.0.60",
      packageVersion: "1.1.78",
      householdFixture: fixtureFor(scenarioId),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      result: "pass",
      evidencePath: `descriptors/${scenarioId}.json`,
    };
  }
  await writeFile(
    join(sessionDir, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 3, scenarios }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function fixtureFor(scenarioId) {
  if (["fresh_guest_start", "logout_to_guest"].includes(scenarioId)) return "guest";
  if (scenarioId === "owner_cooking_flow") return "owner-household";
  if (scenarioId === "member_cooking_flow") return "member-household";
  if (
    SHARE_SCENARIOS.includes(scenarioId)
    || ["multi_household_switch", "household_owner_member_permissions", "meal_task_identity_claim_complete"].includes(scenarioId)
  ) return "owner-member-household";
  return "owner-household";
}

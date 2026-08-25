import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  N5C_APP_ID,
  buildN5cAllocation,
  createN5cSessionFiles,
  validateN5cAllocation,
  validateN5cSessionRecord,
} from "./lib/n5c-evidence-session.mjs";
import { REQUIRED_SCENARIOS, SHARE_SCENARIOS } from "./check-humi-true-device-evidence.mjs";
import { parsePrepareN5cArgs } from "./prepare-n5c-evidence-session.mjs";

process.env.NODE_ENV = "test";
process.env.HUMI_N5C_FIXTURE_MODE = "1";

const root = await mkdtemp(join(tmpdir(), "humi-n5c-prepare-"));
try {
  const allocation = buildN5cAllocation();
  assert.equal(Object.keys(allocation.scenarios).length, 56);
  assert.deepEqual(Object.keys(allocation.scenarios), [...REQUIRED_SCENARIOS]);
  for (const scenarioId of SHARE_SCENARIOS) {
    const assignment = allocation.scenarios[scenarioId];
    assert.equal(assignment.recipientSlot, "recipient-primary");
    assert.notEqual(assignment.deviceSlot, assignment.recipientSlot);
  }

  const session = fixtureSession();
  const sessionDir = join(root, session.sessionId);
  await createN5cSessionFiles({ sessionDir, session, allocation });
  assert.deepEqual(
    JSON.parse(await readFile(join(sessionDir, "manifest.json"), "utf8")),
    { schemaVersion: 3, scenarios: {} },
  );
  assert.deepEqual(await readdir(join(sessionDir, "descriptors")), []);
  assert.deepEqual(await readdir(join(sessionDir, "media")), []);
  assert.deepEqual(await readdir(join(sessionDir, "drafts")), []);
  assert.equal((await stat(sessionDir)).mode & 0o077, 0);
  for (const file of ["session.json", "allocation.json", "manifest.json", "run-sheet.md"]) {
    assert.equal((await stat(join(sessionDir, file))).mode & 0o077, 0, file);
  }
  const sheet = await readFile(join(sessionDir, "run-sheet.md"), "utf8");
  assert.match(sheet, /初始事实：`0\/56`/);
  assert.match(sheet, /从微信体验版打开 1\.1\.78/);
  assert.doesNotMatch(sheet, /1[3-9]\d{9}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  await assert.rejects(
    createN5cSessionFiles({ sessionDir, session, allocation }),
    (error) => error.code === "session_target_exists",
  );

  const wrongAllocation = structuredClone(allocation);
  delete wrongAllocation.scenarios.fresh_guest_start;
  assert.throws(
    () => validateN5cAllocation(wrongAllocation),
    (error) => error.code === "allocation_scenarios_invalid",
  );

  const sameShareSlot = structuredClone(allocation);
  sameShareSlot.scenarios[SHARE_SCENARIOS[0]].recipientSlot = sameShareSlot.scenarios[SHARE_SCENARIOS[0]].deviceSlot;
  assert.throws(
    () => validateN5cAllocation(sameShareSlot),
    (error) => error.code === "allocation_recipient_slot_invalid",
  );

  const tamperedSession = { ...session, appId: "wxwrong" };
  assert.throws(
    () => validateN5cSessionRecord(tamperedSession),
    (error) => error.code === "session_schema_invalid",
  );

  const symlinkTarget = join(root, "outside");
  await writeFile(symlinkTarget, "not a directory\n", { mode: 0o600 });
  await symlink(symlinkTarget, join(root, "n5c-1.1.78-20260802T143903Z-deadbeef"));
  await assert.rejects(
    createN5cSessionFiles({
      sessionDir: join(root, "n5c-1.1.78-20260802T143903Z-deadbeef"),
      session: { ...session, sessionId: "n5c-1.1.78-20260802T143903Z-deadbeef" },
      allocation,
    }),
    (error) => error.code === "session_target_exists",
  );

  assert.deepEqual(
    parsePrepareN5cArgs([
      "--candidate-commit", "a".repeat(40),
      "--attestation", "/private/evidence.json",
      "--output-root", "/private/root",
      "--open",
    ]),
    {
      candidateCommit: "a".repeat(40),
      attestation: "/private/evidence.json",
      outputRoot: "/private/root",
      open: true,
    },
  );
  for (const args of [
    [],
    ["--candidate-commit", "a".repeat(40)],
    ["--candidate-commit", "a".repeat(40), "--attestation"],
    ["--force-pass"],
  ]) {
    assert.throws(() => parsePrepareN5cArgs(args), (error) => error.code === "arguments_invalid");
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("N5c evidence session prepare selftest passed.");

function fixtureSession() {
  return {
    schemaVersion: 1,
    sessionId: "n5c-1.1.78-20260802T143902Z-deadbeef",
    createdAt: "2026-08-02T14:39:02.982Z",
    appId: N5C_APP_ID,
    packageVersion: "1.1.78",
    runtimeCommit: "7606aadcd03dafe9925885b7fef5c308ecfb73e0",
    archiveSha256: "4cd91aa53673664b1bb05612b6766b41f393811604111f25280c8db326ce9cc7",
    uploadAttestationRef: "private://HUMI-2026-001/n5b-1.1.78-20260802T140601Z/wechat-upload-machine-attestation.json",
    uploadRawEvidenceSha256: "12475c024ba4096a2d0dee33a4582245eb9e7def0b8982b74f854388e554c6f3",
    status: "prepared",
  };
}

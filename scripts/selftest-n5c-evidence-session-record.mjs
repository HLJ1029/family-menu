import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createN5cSessionFiles, buildN5cAllocation, N5C_APP_ID } from "./lib/n5c-evidence-session.mjs";
import { recordN5cScenario } from "./lib/n5c-evidence-recorder.mjs";
import { SCENARIO_CHECKS } from "./check-humi-true-device-evidence.mjs";
import { parseRecordN5cArgs } from "./record-n5c-evidence-scenario.mjs";

process.env.NODE_ENV = "test";
process.env.HUMI_N5C_FIXTURE_MODE = "1";

const root = await mkdtemp(join(tmpdir(), "humi-n5c-record-"));
try {
  const session = fixtureSession("20260729T000010Z");
  const sessionDir = join(root, session.sessionId);
  await createN5cSessionFiles({ sessionDir, session, allocation: buildN5cAllocation() });

  const pendingRow = rowFor("fresh_guest_start", "pending", { offsetMinutes: -8 });
  const pendingPath = await writeDraft(sessionDir, "fresh-pending-row.json", pendingRow);
  const pending = await recordN5cScenario({
    sessionDir,
    scenarioId: "fresh_guest_start",
    rowPath: pendingPath,
    repoRoot: process.cwd(),
    verifyCandidate: false,
  });
  assert.equal(pending.result, "pending");
  assert.equal(pending.passed, 0);

  const mediaPath = "media/fresh_guest_start/evidence-1.png";
  await createScreenshot(join(sessionDir, mediaPath));
  const passRow = rowFor("fresh_guest_start", "pass", { offsetMinutes: -5 });
  const passPath = await writeDraft(sessionDir, "fresh-pass-row.json", passRow);
  const descriptorPath = await writeDraft(
    sessionDir,
    "fresh-pass-descriptor.json",
    descriptorFor("fresh_guest_start", [mediaPath]),
  );
  const passed = await recordN5cScenario({
    sessionDir,
    scenarioId: "fresh_guest_start",
    rowPath: passPath,
    descriptorPath,
    repoRoot: process.cwd(),
    verifyCandidate: false,
  });
  assert.equal(passed.result, "pass");
  assert.equal(passed.passed, 1);

  const manifestPath = join(sessionDir, "manifest.json");
  const immutableManifest = await readFile(manifestPath);
  await assert.rejects(
    recordN5cScenario({
      sessionDir,
      scenarioId: "fresh_guest_start",
      rowPath: passPath,
      descriptorPath,
      repoRoot: process.cwd(),
      verifyCandidate: false,
    }),
    (error) => error.code === "scenario_pass_immutable",
  );
  assert.equal((await readFile(manifestPath)).equals(immutableManifest), true);

  const invalidMedia = "media/explicit_wechat_login/evidence-1.png";
  await createScreenshot(join(sessionDir, invalidMedia));
  const invalidRowPath = await writeDraft(
    sessionDir,
    "login-row.json",
    rowFor("explicit_wechat_login", "pass", { platform: "Android", fixture: "owner-household", offsetMinutes: -4 }),
  );
  const invalidDescriptor = descriptorFor("explicit_wechat_login", [invalidMedia]);
  delete invalidDescriptor.checks.login_completed;
  const invalidDescriptorPath = await writeDraft(sessionDir, "login-descriptor.json", invalidDescriptor);
  const beforeInvalid = await readFile(manifestPath);
  await assert.rejects(
    recordN5cScenario({
      sessionDir,
      scenarioId: "explicit_wechat_login",
      rowPath: invalidRowPath,
      descriptorPath: invalidDescriptorPath,
      repoRoot: process.cwd(),
      verifyCandidate: false,
    }),
    (error) => error.code === "evidence_checks_incomplete",
  );
  assert.equal((await readFile(manifestPath)).equals(beforeInvalid), true, "failed record must not mutate manifest");

  const shareScenario = "menu_share_send_and_recipient_open";
  const shareRowPath = await writeDraft(
    sessionDir,
    "share-row.json",
    rowFor(shareScenario, "pass", { platform: "Android", fixture: "owner-member-household", offsetMinutes: -3 }),
  );
  const shareMedia = `media/${shareScenario}/sender-1.png`;
  await createScreenshot(join(sessionDir, shareMedia));
  const shareDescriptorPath = await writeDraft(
    sessionDir,
    "share-descriptor.json",
    descriptorFor(shareScenario, [shareMedia]),
  );
  await assert.rejects(
    recordN5cScenario({
      sessionDir,
      scenarioId: shareScenario,
      rowPath: shareRowPath,
      descriptorPath: shareDescriptorPath,
      repoRoot: process.cwd(),
      verifyCandidate: false,
    }),
    (error) => error.code === "share_endpoint_media_incomplete",
  );

  assert.deepEqual(
    parseRecordN5cArgs(["--session", "/private/session", "--scenario", "fresh_guest_start", "--row", "/private/row.json"]),
    { session: "/private/session", scenario: "fresh_guest_start", row: "/private/row.json" },
  );
  assert.throws(
    () => parseRecordN5cArgs(["--force-pass", "1"]),
    (error) => error.code === "arguments_invalid",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("N5c evidence session record selftest passed.");

function fixtureSession(stamp) {
  return {
    schemaVersion: 1,
    sessionId: `n5c-1.1.78-${stamp}-deadbeef`,
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

function rowFor(scenarioId, result, { platform = "iOS", fixture = "guest", offsetMinutes = -5 } = {}) {
  const startedAt = new Date(Date.now() + offsetMinutes * 60_000);
  const finishedAt = new Date(startedAt.getTime() + 30_000);
  return {
    device: platform === "iOS" ? "iPhone 15 Pro" : "Pixel 9",
    platform,
    wechatVersion: "8.0.60",
    packageVersion: "1.1.78",
    householdFixture: fixture,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    result,
    evidencePath: `descriptors/${scenarioId}.json`,
  };
}

function descriptorFor(scenarioId, mediaPaths) {
  return {
    schemaVersion: 2,
    scenarioId,
    redacted: true,
    checks: Object.fromEntries(SCENARIO_CHECKS[scenarioId].map((check) => [check, true])),
    metrics: {},
    mediaPaths,
  };
}

async function writeDraft(sessionDir, name, value) {
  const path = join(sessionDir, "drafts", name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

async function createScreenshot(path) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  execFileSync("/usr/bin/sips", [
    "--resampleHeightWidth", "844", "390",
    "public/icons/humi-icon-512.png",
    "--out", path,
  ], { stdio: "ignore" });
  await chmod(path, 0o600);
}

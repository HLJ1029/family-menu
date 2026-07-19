import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "humi-migration-check-"));
const input = join(root, "input.json");
const dryRunOutput = join(root, "must-not-exist.json");
const dryRunReport = join(root, "dry-run-report.json");
const firstOutput = join(root, "first.json");
const firstReport = join(root, "first-report.json");
const secondOutput = join(root, "second.json");
const secondReport = join(root, "second-report.json");

const fixtureSecrets = [
  "openid-private-alpha",
  "13800138000",
  "完整姓名私密值",
  "household-private-name",
  "session-token-private-value",
];

const fixture = {
  users: [
    { id: "user-complete", displayName: fixtureSecrets[2], profileStatus: "complete", avatarKey: "humi-avatar-family-f-01" },
    { id: "user-legacy", displayName: "微信用户", phoneNumber: fixtureSecrets[1] },
    { id: "user-missing-status", displayName: "" },
  ],
  identities: [
    { id: "identity-1", userId: "user-complete", provider: "wechat_miniprogram", providerUserId: fixtureSecrets[0] },
  ],
  households: [
    {
      id: "household-1",
      name: fixtureSecrets[3],
      ownerId: "user-complete",
      members: [
        { memberId: "user-complete", nickname: "old", status: "formal", role: "owner" },
        { memberId: "user-legacy", nickname: "legacy", status: "formal", role: "member" },
      ],
    },
  ],
  activeHouseholds: { "user-complete": "household-1", "user-legacy": "household-1" },
  profiles: {},
  states: { "user-complete": { retained: true } },
  householdStates: { "household-1": { householdId: "household-1", retained: "state-value" } },
  collaborationEvents: [{ id: "event-1", displayNameSnapshot: "guest-private", token: fixtureSecrets[4] }],
};
await writeFile(input, `${JSON.stringify(fixture, null, 2)}\n`);

const run = (args) => spawnSync(process.execPath, ["scripts/migrate-humi-identity-households.mjs", ...args], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
});
const runAudit = (args) => spawnSync(process.execPath, ["scripts/audit-humi-migration-readiness.mjs", ...args], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
});

const dryRun = run(["--input", input, "--dry-run", "--report", dryRunReport, "--output", dryRunOutput]);
assert.equal(dryRun.status, 1, "dry-run must reject --output");
await assert.rejects(stat(dryRunOutput));

const validDryRun = run(["--input", input, "--dry-run", "--report", dryRunReport]);
assert.equal(validDryRun.status, 0, validDryRun.stderr);
await assert.rejects(stat(dryRunOutput));
const dryReportText = await readFile(dryRunReport, "utf8");
const dryReport = JSON.parse(dryReportText);
assert.deepEqual(dryReport.counts, { users: 3, identities: 1, households: 1, householdStates: 1, collaborationEvents: 1 });
assert.equal(dryReport.fatalCount, 0);
assert.match(dryReport.inputSha256, /^[a-f0-9]{64}$/);
for (const secret of fixtureSecrets) assert.equal(`${validDryRun.stdout}${validDryRun.stderr}${dryReportText}`.includes(secret), false);

const first = run(["--input", input, "--apply", "--output", firstOutput, "--report", firstReport]);
assert.equal(first.status, 0, first.stderr);
const migrated = JSON.parse(await readFile(firstOutput, "utf8"));
assert.equal(migrated.users[0].profileStatus, "complete");
assert.equal(migrated.users[1].profileStatus, "incomplete");
assert.equal(migrated.users[2].profileStatus, "incomplete");
assert.match(migrated.users[1].avatarKey, /^humi-avatar-/);
assert.equal(migrated.households[0].members[0].nickname, fixtureSecrets[2]);
assert.equal(migrated.households[0].members[1].nickname, "微信用户");
assert.equal(migrated.householdStates["household-1"].retained, "state-value");
assert.deepEqual(migrated.collaborationEvents, fixture.collaborationEvents);
assert.equal(migrated.migrationMeta.identityHouseholdV1.toolVersion, 1);
assert.match(migrated.migrationMeta.identityHouseholdV1.appliedAt, /^\d{4}-\d{2}-\d{2}T/);

const second = run(["--input", firstOutput, "--apply", "--output", secondOutput, "--report", secondReport]);
assert.equal(second.status, 0, second.stderr);
assert.equal(await readFile(secondOutput, "utf8"), await readFile(firstOutput, "utf8"), "second apply must be byte-idempotent");

for (const [name, mutate, code] of [
  ["duplicate-user", (data) => data.users.push({ ...data.users[0] }), "duplicate_user_id"],
  ["duplicate-identity", (data) => data.identities.push({ ...data.identities[0], id: "identity-2" }), "duplicate_identity_provider_subject"],
  ["owner-missing", (data) => { data.households[0].ownerId = "missing"; }, "household_owner_missing"],
  ["member-missing", (data) => data.households[0].members.push({ memberId: "missing", status: "formal" }), "household_member_user_missing"],
  ["orphan-state", (data) => { data.householdStates.orphan = { householdId: "orphan" }; }, "household_state_without_household"],
  ["active-not-member", (data) => { data.activeHouseholds["user-missing-status"] = "household-1"; }, "active_household_not_member"],
]) {
  const invalid = structuredClone(fixture);
  mutate(invalid);
  const invalidInput = join(root, `${name}.json`);
  const invalidOutput = join(root, `${name}-out.json`);
  const invalidReport = join(root, `${name}-report.json`);
  await writeFile(invalidInput, `${JSON.stringify(invalid, null, 2)}\n`);
  const result = run(["--input", invalidInput, "--apply", "--output", invalidOutput, "--report", invalidReport]);
  assert.equal(result.status, 2, `${name}: ${result.stderr}`);
  await assert.rejects(stat(invalidOutput));
  const report = JSON.parse(await readFile(invalidReport, "utf8"));
  assert.ok(report.fatalCodes[code] >= 1, `${name} must report ${code}`);
}

const auditReport = join(root, "audit-report.json");
const audit = runAudit(["--input", input, "--report", auditReport]);
assert.equal(audit.status, 0, audit.stderr);
const auditText = await readFile(auditReport, "utf8");
const auditJson = JSON.parse(auditText);
assert.deepEqual(auditJson.counts, dryReport.counts);
assert.match(auditJson.inputSha256, /^[a-f0-9]{64}$/);
assert.equal(auditJson.ready, true);
for (const secret of fixtureSecrets) assert.equal(`${audit.stdout}${audit.stderr}${auditText}`.includes(secret), false);

for (const forbiddenArgs of [
  ["--input", input, "--report", join(root, "audit-apply.json"), "--apply"],
  ["--input", input, "--report", join(root, "audit-output.json"), "--output", join(root, "audit-data.json")],
]) {
  const result = runAudit(forbiddenArgs);
  assert.equal(result.status, 1, "audit must refuse write-capable arguments");
}

const fatalAuditReport = join(root, "fatal-audit-report.json");
const fatalAudit = runAudit(["--input", join(root, "orphan-state.json"), "--report", fatalAuditReport]);
assert.equal(fatalAudit.status, 2);
assert.ok(JSON.parse(await readFile(fatalAuditReport, "utf8")).fatalCodes.household_state_without_household >= 1);

console.log("Humi migration checks passed.");

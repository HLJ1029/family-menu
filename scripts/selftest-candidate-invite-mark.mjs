import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-invite-"));

await writePacket(packetDir);

const dryRun = await runInvite(packetDir, ["--from-dispatch", "2026-07-07", "--dry-run"]);
let anonymous = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");
assert(dryRun.users.length === 2, "dry-run should select two dispatch users");
assert(anonymous.includes("U001,待定,待填,待邀请,"), "dry-run should not update U001");

const unconfirmed = await runInviteRaw(packetDir, ["--from-dispatch", "2026-07-07"]);
anonymous = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");
assert(unconfirmed.failed, "non-dry invite should require sent confirmation");
assert(unconfirmed.stderr.includes("--sent-confirmed") || unconfirmed.stdout.includes("--sent-confirmed"), "unconfirmed failure should mention --sent-confirmed");
assert(anonymous.includes("U001,待定,待填,待邀请,"), "unconfirmed invite should not update U001");

const outOfDispatch = await runInviteRaw(packetDir, ["--users", "U003", "--date", "2026-07-07", "--sent-confirmed"]);
anonymous = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");
assert(outOfDispatch.failed, "manual invite should stay inside the dispatch list");
assert(outOfDispatch.stderr.includes("outside candidate-dispatch-2026-07-07.json") || outOfDispatch.stdout.includes("outside candidate-dispatch-2026-07-07.json"), "out-of-dispatch failure should name the dispatch guard");
assert(anonymous.includes("U003,待定,待填,待邀请,"), "out-of-dispatch invite should not update U003");

const result = await runInvite(packetDir, ["--from-dispatch", "2026-07-07", "--sent-confirmed"]);
anonymous = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");

assert(result.ok, "invite command did not return ok=true");
assert(result.users.join(",") === "U001,U002", "invite command should update dispatch users");
assert(anonymous.includes("U001,待定,待填,已邀请,"), "U001 should be marked invited");
assert(anonymous.includes("U002,待定,待填,已邀请,"), "U002 should be marked invited");
assert(anonymous.includes("U003,待定,待填,待邀请,"), "U003 should remain unchanged");
assert(!anonymous.includes("联系人"), "anonymous-users.csv should not gain real contact fields");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "rejects-unconfirmed-invite-write",
      ok: true,
    },
    {
      name: "rejects-out-of-dispatch-manual-user",
      ok: true,
    },
    {
      name: "mark-invites-from-dispatch",
      ok: true,
      users: result.users,
    },
  ],
}, null, 2));

async function runInvite(dir, args) {
  const result = await runInviteRaw(dir, args);
  if (result.failed) {
    throw new Error(`invite command failed unexpectedly: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

async function runInviteRaw(dir, args) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [
      "scripts/mark-candidate-invites.mjs",
      ...args,
    ], {
      env: {
        ...process.env,
        HUMI_CANDIDATE_VALIDATION_DIR: dir,
      },
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    return { stdout, stderr, failed: false };
  } catch (error) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      failed: true,
    };
  }
}

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      "U001,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U002,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U003,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.json"), JSON.stringify({
      ok: true,
      users: [
        { id: "U001", hasMessage: true },
        { id: "U002", hasMessage: true },
      ],
    }, null, 2), { mode: 0o600 }),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

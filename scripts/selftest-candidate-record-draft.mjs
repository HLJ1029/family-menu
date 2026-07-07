import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-record-draft-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("npm", [
  "run",
  "release:candidate:record:draft",
  "--",
  "--user",
  "U001",
  "--date",
  "2026-07-07",
  "--entry",
  "问问大家小程序卡片",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024 * 2,
});

const result = parseLastJson(stdout);
const draft = await readFile(result.draftPath, "utf8");
const anonymous = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");
const mode = (await stat(result.draftPath)).mode & 0o777;

assert(result.ok === true, "record draft should return ok=true");
assert(result.user === "U001", "record draft should target U001");
assert(result.inviteStatus === "已邀请", "record draft should read invite status");
assert(result.draftPath === join(packetDir, "candidate-record-draft-U001-2026-07-07.md"), "draft path should be inside packet");
assert(mode === 0o600, `draft mode expected 600, got ${mode.toString(8)}`);
assert(draft.includes("Humi 1.1 候选反馈回填草稿 U001"), "draft missing title");
assert(draft.includes("当前邀请状态：已邀请"), "draft missing invite status");
assert(draft.includes("不要原样运行"), "draft should warn against running placeholders");
assert(draft.includes("--tonight \"yes|no\""), "draft missing quoted tonight placeholder");
assert(draft.includes("--recommendation \"1-5|没试\""), "draft missing quoted skipped-score placeholder");
assert(draft.includes("--severity \"P0|P1|P2|建议|通过\""), "draft missing quoted severity placeholder");
assert(draft.includes("--evidence private://candidate/U001"), "draft should prefill anonymous private evidence pointer");
assert(draft.includes("这份草稿不会写入 anonymous-users.csv"), "draft should state it does not write feedback");
assert(draft.includes("已邀请不等于已体验"), "draft should preserve invite versus experience guard");
assert(anonymous.includes("U001,待定,待填,已邀请,"), "draft generation should not mutate anonymous-users.csv");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  draftPath: result.draftPath,
  cases: [
    {
      name: "candidate-record-draft",
      ok: true,
      mode: "600",
      user: result.user,
      inviteStatus: result.inviteStatus,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await writeFile(join(dir, "anonymous-users.csv"), [
    "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
    "U001,待定,待填,已邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
    "U002,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
  ].join("\n"), { mode: 0o600 });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

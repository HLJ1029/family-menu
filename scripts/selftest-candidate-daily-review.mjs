import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-daily-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("node", [
  "scripts/record-candidate-daily-review.mjs",
  "--date", "2026-07-07",
  "--label", "Day 1",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const result = JSON.parse(stdout);
const daily = await readFile(join(packetDir, "daily-review.csv"), "utf8");

assert(result.ok, "daily review command did not return ok=true");
assert(result.summary.newExperienceUsers === 2, "daily review did not count new users");
assert(result.summary.completedTonight === 2, "daily review did not count tonight completion");
assert(result.summary.completedGrocery === 1, "daily review did not count grocery completion");
assert(result.summary.triedCollaboration === 1, "daily review did not count collaboration samples");
assert(result.summary.p1Count === 1, "daily review did not count P1 rows");
assert(daily.includes("Day 1,2,2,1,1,0,1,出现 P1，先判断是否提审前修复,先 triage P1，必要时进入 1.1.x"), "daily-review.csv was not updated");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "record-day-1-summary",
      ok: true,
      summary: result.summary,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      "U001,待定,iPhone 15 / WeChat 9,已体验,2026-07-07,是,是,问问大家,5,5,4,待观察,建议,private://candidate/U001,清单有用",
      "U002,待定,Android / WeChat 9,已体验,2026-07-07,是,否,没有,4,3,没试,待观察,P1,private://candidate/U002,清单卡住",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), [
      "用户编号,设备与微信版本,体验日期,入口,完成今晚菜单,完成清单,协作类型,推荐评分,清单评分,分享评分,卡住的位置,用户原话摘要,私有截图/录屏位置,问题等级,是否进入1.1.x,处理状态",
      "U002,Android / WeChat 9,2026-07-07,清单,是,否,没有,4,3,没试,找不到清单按钮,清单入口不明显,private://candidate/U002,P1,待观察,新反馈",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "daily-review.csv"), [
      "日期,新体验人数,完成今晚菜单,完成清单,尝试协作,P0数,P1数,今日结论,下一步",
      "Day 1,待填,待填,待填,待填,待填,待填,待填,待填",
      "",
    ].join("\n"), { mode: 0o600 }),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

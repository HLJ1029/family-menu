import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-record-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("node", [
  "scripts/record-candidate-feedback.mjs",
  "--user", "U001",
  "--date", "2026-07-07",
  "--device", "iPhone 15 / WeChat 9",
  "--entry", "今晚",
  "--tonight", "yes",
  "--grocery", "yes",
  "--collaboration", "ask",
  "--recommendation", "5",
  "--grocery-score", "5",
  "--share-score", "4",
  "--note", "清单有用",
  "--stuck", "无",
  "--severity", "建议",
  "--evidence", "private://candidate/U001",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const result = JSON.parse(stdout);
const anonymous = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");
const feedback = await readFile(join(packetDir, "feedback-template.csv"), "utf8");

assert(result.ok, "record command did not return ok=true");
assert(result.appendedFeedback === true, "record command did not append feedback");
assert(anonymous.includes("U001,待定,iPhone 15 / WeChat 9,已体验,2026-07-07,是,是,问问大家,5,5,4,待观察,建议,private://candidate/U001,清单有用"), "anonymous-users.csv was not updated");
assert(feedback.includes("U001,iPhone 15 / WeChat 9,2026-07-07,今晚,是,是,问问大家,5,5,4,无,清单有用,private://candidate/U001,建议,否,新反馈"), "feedback-template.csv was not appended");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "record-u001-feedback",
      ok: true,
      appendedFeedback: result.appendedFeedback,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      "U001,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), [
      "用户编号,设备与微信版本,体验日期,入口,完成今晚菜单,完成清单,协作类型,推荐评分,清单评分,分享评分,卡住的位置,用户原话摘要,私有截图/录屏位置,问题等级,是否进入1.1.x,处理状态",
      "",
    ].join("\n"), { mode: 0o600 }),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-dispatch-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("node", [
  "scripts/print-candidate-dispatch-pack.mjs",
  "--date", "2026-07-07",
  "--batch-size", "2",
  "--json",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  },
  timeout: 60_000,
  maxBuffer: 1024 * 1024 * 4,
});

const result = JSON.parse(stdout);
const dispatch = await readFile(join(packetDir, "candidate-dispatch-2026-07-07.md"), "utf8");

assert(result.ok, "dispatch command did not return ok=true");
assert(result.users.length === 2, "dispatch should include two planned users");
assert(result.users[0].id === "U001", "dispatch should include U001 first");
assert(result.users[0].entryTask === "crave-card", "U001 should cover the crave mini program card");
assert(result.users[1].entryTask === "invite-card", "U002 should cover the invite mini program card");
assert(result.users[0].hasMessage, "dispatch should include U001 message");
assert(dispatch.includes("Humi 1.1 候选内测今日分发单"), "dispatch markdown missing title");
assert(dispatch.includes("U001：问问大家小程序卡片"), "dispatch should label U001 mini program card task");
assert(dispatch.includes("入口任务：问问大家小程序卡片"), "dispatch missing entry task detail");
assert(dispatch.includes("入口任务：邀请家人小程序卡片"), "dispatch missing invite card task detail");
assert(dispatch.includes("0. 入口任务：问问大家小程序卡片"), "tester copy should include the assigned entry task");
assert(dispatch.includes("0. 入口任务：邀请家人小程序卡片"), "tester copy should include the invite entry task");
assert(dispatch.includes("点卡片进入后"), "dispatch should tell testers to enter from mini program cards");
assert(dispatch.includes("我给你留了一个 Humi 内测编号：U001。"), "dispatch missing U001 message");
assert(dispatch.includes("npm run release:candidate:record -- --user U001 --entry \"分享卡片\""), "dispatch missing record command with share-card entry");
assert(dispatch.includes("--collaboration ask|none|grocery|invite"), "dispatch should put the assigned collaboration command first without duplicates");
assert(dispatch.includes("npm run release:candidate:invite -- --from-dispatch 2026-07-07"), "dispatch missing invite mark command");
assert(dispatch.includes("不要原样运行这条模板"), "dispatch should warn against running placeholder command as-is");
assert(dispatch.includes("--recommendation 1-5|没试"), "dispatch should require real recommendation score replacement");
assert(dispatch.includes("--note \"替换成真实匿名摘要\""), "dispatch should require real anonymous note replacement");
assert(!dispatch.includes("--recommendation 5 --grocery-score 5"), "dispatch should not default to positive feedback scores");
assert(!dispatch.includes("--note \"清单有用\""), "dispatch should not default to positive feedback notes");
assert(dispatch.includes("npm run release:candidate:day:close -- --date 2026-07-07"), "dispatch missing closeout command");
assert(dispatch.includes("不把真实姓名、手机号、微信号、聊天截图或录屏写进仓库"), "dispatch missing privacy warning");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "dispatch-pack-selects-planned-users",
      ok: true,
      users: result.users,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      "U001,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U002,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U003,待定,待填,候补,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), "用户编号,设备与微信版本,体验日期,入口,完成今晚菜单,完成清单,协作类型,推荐评分,清单评分,分享评分,卡住的位置,用户原话摘要,私有截图/录屏位置,问题等级,是否进入1.1.x,处理状态\n", { mode: 0o600 }),
    writeFile(join(dir, "daily-review.csv"), "日期,新体验人数,完成今晚菜单,完成清单,尝试协作,P0数,P1数,今日结论,下一步\n", { mode: 0o600 }),
    writeFile(join(dir, "issue-triage.csv"), "编号,问题,来源用户编号,等级,是否复现,是否阻塞审核,是否进入1.1.x,Owner,处理状态,结论\n", { mode: 0o600 }),
    writeFile(join(dir, "outreach-batch.md"), [
      "# Humi 1.1 U001-U020 批量邀请清单",
      "",
      "## U001",
      "",
      "```text",
      "我给你留了一个 Humi 内测编号：U001。",
      "请试一下今晚推荐和清单。",
      "使用路径：",
      "1. 打开 Humi 小程序",
      "```",
      "",
      "## U002",
      "",
      "```text",
      "我给你留了一个 Humi 内测编号：U002。",
      "请试一下今晚推荐和清单。",
      "使用路径：",
      "1. 打开 Humi 小程序",
      "```",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "tester-feedback-form.md"), [
      "# Humi 1.1 体验者反馈单",
      "",
      "## 3. 只需要回答这些",
      "",
      "- 推荐里有没有你今晚真的愿意做的菜？1 / 2 / 3 / 4 / 5",
      "- 买菜清单有没有减少你想买什么的负担？1 / 2 / 3 / 4 / 5",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "host-run-sheet.md"), [
      "# Humi 1.1 主厨记录单",
      "",
      "## 2. 现场观察",
      "",
      "- 是否能发现新菜并补进今晚：",
      "- 是否完成清单：",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "candidate-feedback-import.csv"), "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit\n", { mode: 0o600 }),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

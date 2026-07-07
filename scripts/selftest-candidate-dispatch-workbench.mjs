import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-workbench-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("npm", [
  "run",
  "release:candidate:dispatch:workbench",
  "--",
  "--date",
  "2026-07-07",
  "--json",
  "--no-open",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
    HUMI_CANDIDATE_WORKBENCH_NO_OPEN: "1",
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024 * 2,
});

const result = parseLastJson(stdout);
const html = await readFile(result.workbenchPath, "utf8");
const mode = (await stat(result.workbenchPath)).mode & 0o777;

assert(result.ok === true, "workbench did not return ok=true");
assert(result.workbenchPath === join(packetDir, "candidate-dispatch-workbench-2026-07-07.html"), "workbench path should be inside packet");
assert(result.users.length === 2, "workbench should parse two users");
assert(result.users[0].id === "U001", "workbench should parse U001");
assert(result.users[0].entryLabel === "问问大家小程序卡片", "workbench should preserve U001 entry label");
assert(result.users[0].inviteStatus === "已邀请", "workbench should read U001 invite status");
assert(result.users[1].inviteStatus === "待邀请", "workbench should read U002 invite status");
assert(result.users[0].hasTesterMessage, "workbench should include tester message");
assert(result.users[0].hasDraftCommand, "workbench should include record draft command");
assert(result.users[0].hasRecordCommand, "workbench should include record command");
assert(mode === 0o600, `workbench mode expected 600, got ${mode.toString(8)}`);
assert(html.includes('data-workbench-kind="humi-candidate-dispatch"'), "workbench missing stable marker");
assert(html.includes("发送状态：<strong>1</strong> 已发送/已体验，<strong>1</strong> 待发送"), "workbench should summarize sent and pending counts");
assert(html.includes("问问大家小程序卡片 / 优先跑协作 / 已邀请"), "workbench should show invited status in summary");
assert(html.includes("今晚发现新菜 / 普通路径 / 待邀请"), "workbench should show pending status in summary");
assert(html.includes("复制体验者文案"), "workbench should expose copy buttons for tester messages");
assert(html.includes("复制本 U 已发送登记命令"), "workbench should expose per-user sent mark commands");
assert(html.includes("复制待发送标记命令"), "workbench should expose pending-only batch command when some users were already invited");
assert(html.includes("npm run release:candidate:invite -- --users U001 --date 2026-07-07 --sent-confirmed"), "workbench missing per-user U001 invite command");
assert(html.includes("npm run release:candidate:invite -- --users U002 --date 2026-07-07 --sent-confirmed"), "workbench missing per-user U002 invite command");
assert(html.includes("npm run release:candidate:invite -- --users U002 --date 2026-07-07 --sent-confirmed"), "workbench missing pending-only batch invite command");
assert(!html.includes("npm run release:candidate:invite -- --from-dispatch 2026-07-07 --sent-confirmed"), "workbench should not expose all-dispatch command when some users are already invited");
assert(html.includes("复制回填草稿命令"), "workbench should expose copy buttons for record draft commands");
assert(html.includes("npm run release:candidate:record:draft -- --user U001 --date 2026-07-07 --entry &quot;问问大家小程序卡片&quot;"), "workbench missing U001 record draft command");
assert(html.includes("复制回填模板"), "workbench should expose copy buttons for record templates");
assert(html.includes("npm run release:candidate:day:close -- --date 2026-07-07"), "workbench missing day close command");
assert(html.includes("不会发送微信消息"), "workbench should state it does not send messages");
assert(html.includes("避免重复打扰"), "workbench should warn against resending invited users");
assert(html.includes("不进入微信公众平台审核动作"), "workbench should preserve review guard");
assert(html.includes("navigator.clipboard.writeText"), "workbench should support copy buttons");
assert(!html.includes("--recommendation 5 --grocery-score 5"), "workbench should not include default positive scores");
assert(!html.includes("--note &quot;清单有用&quot;"), "workbench should not include default positive notes");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  workbenchPath: result.workbenchPath,
  cases: [
    {
      name: "candidate-dispatch-workbench-html",
      ok: true,
      mode: "600",
      users: result.users,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      "U001,待定,待填,已邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U002,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.json"), JSON.stringify({
      ok: true,
      date: "2026-07-07",
      users: [
        {
          id: "U001",
          collaborationTarget: true,
          entryTask: "crave-card",
          entryLabel: "问问大家小程序卡片",
          hasMessage: true,
        },
        {
          id: "U002",
          collaborationTarget: false,
          entryTask: "today-discovery",
          entryLabel: "今晚发现新菜",
          hasMessage: true,
        },
      ],
    }, null, 2), { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.md"), [
      "# Humi 1.1 候选内测今日分发单",
      "",
      "## 逐个发送",
      "",
      "### U001 / 协作目标",
      "",
      "入口任务：问问大家小程序卡片",
      "",
      "```text",
      "我会把【问问大家】小程序卡片发给你。",
      "```",
      "",
      "复制给体验者：",
      "",
      "```text",
      "我给你留了一个 Humi 内测编号：U001。",
      "0. 入口任务：问问大家小程序卡片。",
      "```",
      "",
      "收到反馈后的回填命令模板：",
      "",
      "先替换所有选项和摘要；不要原样运行这条模板。",
      "",
      "```text",
      "npm run release:candidate:record -- --user U001 --entry \"分享卡片\" --tonight yes|no --grocery yes|no --collaboration ask|none|grocery|invite --recommendation 1-5|没试 --grocery-score 1-5|没试 --share-score 1-5|没试 --severity P0|P1|P2|建议|通过 --note \"替换成真实匿名摘要\"",
      "```",
      "",
      "### U002",
      "",
      "入口任务：今晚发现新菜",
      "",
      "```text",
      "请从【今晚】进入选菜/发现新菜。",
      "```",
      "",
      "复制给体验者：",
      "",
      "```text",
      "我给你留了一个 Humi 内测编号：U002。",
      "0. 入口任务：今晚发现新菜。",
      "```",
      "",
      "收到反馈后的回填命令模板：",
      "",
      "先替换所有选项和摘要；不要原样运行这条模板。",
      "",
      "```text",
      "npm run release:candidate:record -- --user U002 --entry \"今晚\" --tonight yes|no --grocery yes|no --collaboration none|ask|grocery|invite --recommendation 1-5|没试 --grocery-score 1-5|没试 --share-score 1-5|没试 --severity P0|P1|P2|建议|通过 --note \"替换成真实匿名摘要\"",
      "```",
      "",
      "## 隐私和审核护栏",
      "",
      "- 不把真实姓名、手机号、微信号、聊天截图或录屏写进仓库。",
      "",
    ].join("\n"), { mode: 0o600 }),
  ]);
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

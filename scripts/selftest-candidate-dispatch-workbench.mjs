import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
    HUMI_PRIVATE_EVIDENCE_DIR: packetDir,
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
assert(result.shareEvidenceDir === join(packetDir, "miniprogram-share-card-preview-20260707T000000"), "workbench should expose latest share evidence dir");
assert(result.users.length === 6, "workbench should parse five card tasks and one non-card task");
assert(result.users[0].id === "U001", "workbench should parse U001");
assert(result.users[0].entryLabel === "问问大家小程序卡片", "workbench should preserve U001 entry label");
assert(result.users[0].inviteStatus === "已邀请", "workbench should read U001 invite status");
assert(result.users[5].inviteStatus === "待邀请", "workbench should read U006 invite status");
assert(result.users[0].hasTesterMessage, "workbench should include tester message");
assert(result.users[0].hasShareCardGuide, "workbench should include share card guide for card tasks");
assert(result.users[0].shareCardQrReady === true, "workbench should mark existing share QR ready for card tasks");
assert(result.users[0].hasShareCardQrImage === true, "workbench should expose share QR image when direct-preview exists");
for (const user of result.users.slice(0, 5)) {
  assert(user.hasShareCardGuide, `${user.id} should include a share card guide`);
  assert(user.shareCardQrReady === true, `${user.id} should mark its direct-preview QR ready`);
  assert(user.hasShareCardQrImage === true, `${user.id} should expose its direct-preview QR image`);
}
assert(!result.users[5].hasShareCardGuide, "workbench should not show share card guide for non-card tasks");
assert(result.users[5].shareCardQrReady === null, "workbench should not report QR readiness for non-card tasks");
assert(result.users[5].hasShareCardQrImage === false, "workbench should not expose QR image for non-card tasks");
assert(result.users[0].hasDraftCommand, "workbench should include record draft command");
assert(result.users[0].hasRecordCommand, "workbench should include record command");
assert(mode === 0o600, `workbench mode expected 600, got ${mode.toString(8)}`);
assert(html.includes('data-workbench-kind="humi-candidate-dispatch"'), "workbench missing stable marker");
assert(html.includes("发送状态：<strong>1</strong> 已发送/已体验，<strong>5</strong> 待发送"), "workbench should summarize sent and pending counts");
assert(html.includes("问问大家小程序卡片 / 优先跑协作 / 已邀请"), "workbench should show invited status in summary");
assert(html.includes("普通打开小程序 / 普通路径 / 待邀请"), "workbench should show pending non-card status in summary");
assert(html.includes("复制体验者文案"), "workbench should expose copy buttons for tester messages");
assert(html.includes("小程序卡片发送确认"), "workbench should expose mini program share card send guidance");
assert(html.includes("小程序卡片证据目录"), "workbench should expose mini program share evidence directory");
assert(html.includes("pages/share/index?type=crave&amp;token=&lt;真实征集token&gt;&amp;householdName=&lt;家庭名&gt;"), "workbench should show crave share confirmation path template");
assert(html.includes("/pages/index/index?crave=&lt;真实征集token&gt;"), "workbench should show crave landing path template");
assert(html.includes("pages/share/index?type=invite&amp;token=&lt;真实邀请token&gt;"), "workbench should show invite share confirmation path template");
assert(html.includes("pages/share/index?type=grocery&amp;token=&lt;真实清单token&gt;"), "workbench should show grocery share confirmation path template");
assert(html.includes("pages/share/index?type=wish&amp;token=&lt;真实想吃token&gt;"), "workbench should show wish share confirmation path template");
assert(html.includes("pages/share/index?type=menu&amp;token=&lt;真实菜单token&gt;"), "workbench should show menu share confirmation path template");
assert(html.includes("/pages/index/index?wishShare=&lt;真实想吃token&gt;"), "workbench should show wish landing path template");
assert(html.includes("/pages/index/index?menuShare=&lt;真实菜单token&gt;"), "workbench should show menu landing path template");
assert(html.includes("必须看到真实微信联系人面板"), "workbench should require the real contact picker");
assert(html.includes("选择家人发清单"), "workbench should show the grocery second-step button");
assert(html.includes("选择家人发菜单"), "workbench should show the menu second-step button");
assert(html.includes("npm run release:wechat:share:direct-previews"), "workbench should expose DevTools direct-preview command");
assert(html.includes("direct-preview/crave-preview-qr.png"), "workbench should show crave direct-preview QR file");
assert(html.includes("direct-preview/invite-preview-qr.png"), "workbench should show invite direct-preview QR file");
assert(html.includes("direct-preview/grocery-preview-qr.png"), "workbench should show grocery direct-preview QR file");
assert(html.includes("direct-preview/wish-preview-qr.png"), "workbench should show wish direct-preview QR file");
assert(html.includes("direct-preview/menu-preview-qr.png"), "workbench should show menu direct-preview QR file");
assert(html.includes("复制直达二维码路径"), "workbench should expose copy buttons for direct-preview QR paths");
assert(html.includes(`${packetDir}/miniprogram-share-card-preview-20260707T000000/direct-preview/crave-preview-qr.png`), "workbench should show absolute crave direct-preview QR path");
assert(html.includes('data-share-qr="ready"'), "workbench should render ready share QR image");
assert(html.includes(`src="file://${packetDir}/miniprogram-share-card-preview-20260707T000000/direct-preview/crave-preview-qr.png"`), "workbench should render crave direct-preview QR as file image");
assert(html.includes("可扫码直达"), "workbench should explain QR can be scanned directly");
assert(html.includes("直达二维码状态"), "workbench should show direct-preview QR readiness status");
assert(html.includes("<strong>已找到</strong>"), "workbench should show existing direct-preview QR as ready");
assert(html.includes("复制本 U 已发送登记命令"), "workbench should expose per-user sent mark commands");
assert(html.includes("复制待发送标记命令"), "workbench should expose pending-only batch command when some users were already invited");
assert(html.includes("npm run release:candidate:invite -- --users U001 --date 2026-07-07 --sent-confirmed"), "workbench missing per-user U001 invite command");
assert(html.includes("npm run release:candidate:invite -- --users U006 --date 2026-07-07 --sent-confirmed"), "workbench missing per-user U006 invite command");
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
  const shareDir = join(dir, "miniprogram-share-card-preview-20260707T000000", "direct-preview");
  const users = [
    { id: "U001", task: "crave-card", label: "问问大家小程序卡片", collaboration: true, status: "已邀请" },
    { id: "U002", task: "invite-card", label: "邀请家人小程序卡片", collaboration: true, status: "待邀请" },
    { id: "U003", task: "grocery-card", label: "买菜清单小程序卡片", collaboration: true, status: "待邀请" },
    { id: "U004", task: "wish-card", label: "最近想吃小程序卡片", collaboration: true, status: "待邀请" },
    { id: "U005", task: "menu-card", label: "今晚菜单小程序卡片", collaboration: true, status: "待邀请" },
    { id: "U006", task: "normal-open", label: "普通打开小程序", collaboration: false, status: "待邀请" },
  ];
  await mkdir(shareDir, { recursive: true, mode: 0o700 });
  await Promise.all([
    ...["crave", "invite", "grocery", "wish", "menu"].map((key) => (
      writeFile(join(shareDir, `${key}-preview-qr.png`), "fake-png-bytes", { mode: 0o600 })
    )),
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      ...users.map((user) => `${user.id},待定,待填,${user.status},待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,`),
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.json"), JSON.stringify({
      ok: true,
      date: "2026-07-07",
      users: users.map((user) => ({
        id: user.id,
        collaborationTarget: user.collaboration,
        entryTask: user.task,
        entryLabel: user.label,
        hasMessage: true,
      })),
    }, null, 2), { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.md"), buildDispatchMarkdown(users), { mode: 0o600 }),
  ]);
}

function buildDispatchMarkdown(users) {
  const lines = ["# Humi 1.1 候选内测今日分发单", "", "## 逐个发送", ""];
  for (const user of users) {
    lines.push(`### ${user.id}${user.collaboration ? " / 协作目标" : ""}`);
    lines.push("", `入口任务：${user.label}`, "", "```text");
    lines.push(`请完成${user.label}任务。`, "```", "", "复制给体验者：", "", "```text");
    lines.push(`我给你留了一个 Humi 内测编号：${user.id}。`, `0. 入口任务：${user.label}。`, "```", "");
    lines.push("收到反馈后的回填命令模板：", "", "先替换所有选项和摘要；不要原样运行这条模板。", "", "```text");
    lines.push(`npm run release:candidate:record -- --user ${user.id} --entry \"${user.collaboration ? "分享卡片" : "今晚"}\" --tonight yes|no --grocery yes|no --collaboration none|ask|grocery|invite|wish|menu --recommendation 1-5|没试 --grocery-score 1-5|没试 --share-score 1-5|没试 --severity P0|P1|P2|建议|通过 --note \"替换成真实匿名摘要\"`);
    lines.push("```", "");
  }
  lines.push("## 隐私和审核护栏", "", "- 不把真实姓名、手机号、微信号、聊天截图或录屏写进仓库。", "");
  return lines.join("\n");
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

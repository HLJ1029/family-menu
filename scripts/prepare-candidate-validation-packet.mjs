import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || join(privateBaseDir, `candidate-validation-${stamp}`);
const shouldOpen = process.env.HUMI_CANDIDATE_VALIDATION_NO_OPEN !== "1";

const [gitState, candidate, status] = await Promise.all([
  readGitState(),
  runJsonScript("release:candidate:check"),
  runJsonScript("release:status"),
]);

await mkdir(packetDir, { recursive: true, mode: 0o700 });

const files = [
  ["README.md", buildReadme({ git: gitState, candidate, status })],
  ["anonymous-users.csv", buildAnonymousUsersCsv()],
  ["feedback-template.csv", buildFeedbackTemplateCsv()],
  ["daily-review.csv", buildDailyReviewCsv()],
  ["issue-triage.csv", buildIssueTriageCsv()],
  ["invite-copy.md", buildInviteCopy()],
  ["outreach-batch.md", buildOutreachBatch()],
  ["tester-feedback-form.md", buildTesterFeedbackForm()],
  ["host-run-sheet.md", buildHostRunSheet()],
];

for (const [file, content] of files) {
  await writeFile(join(packetDir, file), content, { mode: 0o600 });
}

if (shouldOpen) {
  await openPath(packetDir);
  await openPath(join(packetDir, "README.md"));
}

const result = {
  ok: Boolean(candidate.ok && status.release?.engineeringGatesReady),
  checkedAt: new Date().toISOString(),
  packetDir,
  git: gitState,
  release: {
    statusOk: Boolean(status.ok),
    engineeringGatesReady: Boolean(status.release?.engineeringGatesReady),
    candidateValidationReady: Boolean(status.release?.candidateValidationReady),
    candidateHardeningReady: Boolean(status.release?.candidateHardeningReady),
    productReviewReady: Boolean(status.release?.productReviewReady),
    uploadedVersion: status.release?.miniProgramUploadedVersion,
    uploadDescription: status.release?.miniProgramUploadDescription,
  },
  files: files.map(([file]) => join(packetDir, file)),
  nextActions: [
    "Fill anonymous-users.csv with U001-U020 only; keep real contacts in private chat/docs.",
    "Use outreach-batch.md to copy one anonymous U001-U010 message per tester.",
    "Use tester-feedback-form.md for user-facing feedback and host-run-sheet.md for operator notes.",
    "Use npm run release:candidate:record -- ... to transfer summarized results into anonymous-users.csv and feedback-template.csv.",
    "Update daily-review.csv at the end of each validation day.",
    "Run npm run release:candidate:doctor to inspect missing validation counts before rerunning release:candidate:review.",
    "Record P0/P1 findings in docs/humi-1.1-pre-review-hardening.md before WeChat review.",
  ],
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);

async function readGitState() {
  const [head, originMain, status] = await Promise.all([
    runGit(["rev-parse", "--short", "HEAD"]),
    runGit(["rev-parse", "--short", "origin/main"]),
    runGit(["status", "--short", "--branch"]),
  ]);
  return {
    head,
    originMain,
    clean: !status.split("\n").some((line) => line && !line.startsWith("## ")),
    branchStatus: status,
  };
}

async function runGit(args) {
  const { stdout } = await execFileAsync("git", args, { timeout: 15_000 });
  return stdout.trim();
}

async function runJsonScript(scriptName) {
  const { stdout } = await execFileAsync("npm", ["run", scriptName], {
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 12,
  });
  return parseLastJson(stdout);
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  return JSON.parse(candidate);
}

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

function buildReadme({ git, candidate, status }) {
  return [
    "# Humi 1.1 生产候选内测执行包",
    "",
    `生成时间：${new Date().toISOString()}`,
    `产品提交：${git.head} / origin/main ${git.originMain}`,
    `小程序版本：${status.release?.miniProgramUploadedVersion} / ${status.release?.miniProgramUploadDescription}`,
    "",
    "## 使用边界",
    "",
    "- 本目录是私有执行包，不提交到仓库。",
    "- 仓库内只使用 U001-U020 匿名编号；真实姓名、手机号、微信号、截图和录屏放在私有聊天或私有文档。",
    "- 当前阶段是生产候选完善与内测验证，暂不进入微信审核。",
    "- 发现 P0/P1 后，先回到代码和 `docs/humi-1.1-pre-review-hardening.md` 收口，再重新跑 release gates。",
    "",
    "## 文件",
    "",
    "- `anonymous-users.csv`：U001-U020 匿名名单和完成状态。",
    "- `feedback-template.csv`：单次用户反馈记录。",
    "- `daily-review.csv`：Day 1-Day 3 每日复盘。",
    "- `issue-triage.csv`：P0/P1/P2/建议分级和是否进入 1.1.x。",
    "- `invite-copy.md`：可以手动发给内测用户的邀请文案。",
    "- `outreach-batch.md`：U001-U010 可复制发送的匿名邀请消息。",
    "- `tester-feedback-form.md`：体验者可直接照着回答的反馈单。",
    "- `host-run-sheet.md`：主厨/执行人记录每次体验、卡点和回填字段的单据。",
    "- `npm run release:candidate:record -- ...`：把单个用户结果安全回填到本私有包。",
    "",
    "## 执行顺序",
    "",
    "1. 从 `anonymous-users.csv` 里选 10-20 个匿名编号。",
    "2. 用 `outreach-batch.md` 手动复制发送 U001-U010 邀请，不在仓库记录真实联系方式。",
    "3. 发 `tester-feedback-form.md` 的问题给体验者；执行人自己用 `host-run-sheet.md` 记录现场观察。",
    "4. 每个用户至少跑一次【今晚】推荐、今晚菜单、清单，尽量再跑一次问问大家/邀请家人/买菜认领。",
    "5. 把单个用户结果汇总到 `feedback-template.csv`，用 `daily-review.csv` 做每天汇总。",
    "   推荐用 `npm run release:candidate:record -- --user U001 --tonight yes --grocery yes --collaboration ask --recommendation 5 --grocery-score 5 --share-score 4 --note \"清单有用\"` 回填。",
    "6. 任一 P0 或多个用户同一核心链路卡住，先暂停审核准备，进入修复。",
    "7. 每轮回填后运行 `npm run release:candidate:doctor` 看还差哪些样本。",
    "8. 内测无 P0/P1 且 `npm run release:candidate:review` 通过后，再由用户明确确认是否进入微信审核。",
    "",
    "## 候选复盘最低通过标准",
    "",
    "- 默认至少 10 个真实体验样本。",
    "- 至少 8 个样本完成【今晚】菜单。",
    "- 至少 8 个样本完成清单。",
    "- 至少 3 个样本尝试问问大家、邀请家人或买菜认领任一协作路径。",
    "- 阈值可用 `HUMI_CANDIDATE_MIN_EXPERIENCED_USERS`、`HUMI_CANDIDATE_MIN_COMPLETED_TONIGHT`、`HUMI_CANDIDATE_MIN_COMPLETED_GROCERY`、`HUMI_CANDIDATE_MIN_TRIED_COLLABORATION` 临时调整；默认值按 10-20 个家庭灰度目标执行。",
    "",
    "## 当前机器检查",
    "",
    `- release:status ok=${Boolean(status.ok)}`,
    `- engineeringGatesReady=${Boolean(status.release?.engineeringGatesReady)}`,
    `- candidateValidationReady=${Boolean(status.release?.candidateValidationReady)}`,
    `- release:candidate:check ok=${Boolean(candidate.ok)}`,
    `- candidateHardeningReady=${Boolean(status.release?.candidateHardeningReady)}`,
    `- productReviewReady=${Boolean(status.release?.productReviewReady)}`,
    "",
  ].join("\n");
}

function buildAnonymousUsersCsv() {
  const rows = [["用户编号", "家庭类型", "设备/微信版本", "邀请状态", "首次体验日期", "完成今晚菜单", "完成清单", "尝试协作", "推荐评分", "清单评分", "分享评分", "复访状态", "当前等级", "私有证据位置", "备注"]];
  for (let index = 1; index <= 20; index += 1) {
    const id = `U${String(index).padStart(3, "0")}`;
    rows.push([id, index <= 10 ? "待定" : "候补", "待填", index <= 8 ? "待邀请" : "候补", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""]);
  }
  return toCsv(rows);
}

function buildFeedbackTemplateCsv() {
  return toCsv([
    ["用户编号", "设备与微信版本", "体验日期", "入口", "完成今晚菜单", "完成清单", "协作类型", "推荐评分", "清单评分", "分享评分", "卡住的位置", "用户原话摘要", "私有截图/录屏位置", "问题等级", "是否进入1.1.x", "处理状态"],
    ["U001", "待填", "待填", "今晚/自己挑/想连排几天/清单/我的家/分享卡片", "是/否", "是/否", "问问大家/邀请家人/买菜认领/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
  ]);
}

function buildDailyReviewCsv() {
  return toCsv([
    ["日期", "新体验人数", "完成今晚菜单", "完成清单", "尝试协作", "P0数", "P1数", "今日结论", "下一步"],
    ["Day 1", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
    ["Day 2", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
    ["Day 3", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
  ]);
}

function buildIssueTriageCsv() {
  return toCsv([
    ["编号", "问题", "来源用户编号", "等级", "是否复现", "是否阻塞审核", "是否进入1.1.x", "Owner", "处理状态", "结论"],
    ["P0-001", "待收集", "U000", "P0/P1/P2/建议", "待观察", "待判断", "待观察", "codex@mbp-m5pro", "新反馈", ""],
  ]);
}

function buildInviteCopy() {
  return [
    "# Humi 1.1 内测邀请文案",
    "",
    "## 简短版",
    "",
    "我做了一个家庭吃饭安排小程序 Humi，想请你帮忙试一下。",
    "",
    "它主要解决“今晚吃什么”：打开后可以先拿到晚饭推荐，也能问问家人想吃什么，自动生成买菜清单。",
    "",
    "你试 5 分钟就行，重点帮我看：",
    "1. 推荐的菜想不想吃",
    "2. 买菜清单有没有用",
    "3. 问家人/分享清单这一步有没有顺",
    "4. 哪一步让你困惑或卡住",
    "",
    "有问题直接截图发我，越真实越好。",
    "",
    "## 使用路径",
    "",
    "打开小程序 -> 看【今晚】推荐 -> 今晚就做/换一组 -> 问问大家想吃啥 -> 看【清单】 -> 分享或认领买菜。",
    "",
    "它不是专业营养或医疗建议，只是帮家庭把今晚吃什么、买什么、谁来买整理清楚。",
    "",
  ].join("\n");
}

function buildOutreachBatch() {
  const messages = [];
  for (let index = 1; index <= 10; index += 1) {
    const id = `U${String(index).padStart(3, "0")}`;
    messages.push([
      `## ${id}`,
      "",
      "```text",
      `我给你留了一个 Humi 内测编号：${id}。`,
      "",
      "想请你帮我试一下这个家庭吃饭安排小程序，大概 5 分钟。",
      "",
      "使用路径：",
      "1. 打开 Humi 小程序",
      "2. 看【今晚】推荐",
      "3. 点“今晚就做”或换一组后选一个想做的菜",
      "4. 看【清单】里要买什么",
      "5. 有空的话试一下【我的家】里的问问大家，或把清单分享给家人认领",
      "",
      "试完后直接回我这几句就行：",
      "1. 推荐里有没有你今晚真的愿意做的菜？1-5 分",
      "2. 买菜清单有没有减少负担？1-5 分",
      "3. 问问大家/邀请家人/清单分享顺不顺？1-5 分或没试",
      "4. 哪一步最困惑或最卡？",
      "5. 明天你还会不会再打开？为什么？",
      "",
      "如果卡住，可以直接给我截图或录屏。不要在反馈里写手机号、真实姓名或家庭隐私。",
      "```",
      "",
    ].join("\n"));
  }

  return [
    "# Humi 1.1 U001-U010 批量邀请清单",
    "",
    "本文件用于手动复制给 10 个候选体验者。不要把真实姓名、手机号、微信号或聊天截图写回仓库。",
    "",
    "发送后，在 `anonymous-users.csv` 中把对应用户的邀请状态改为 `已邀请`；体验完成后再改为 `已体验`。",
    "",
    ...messages,
  ].join("\n");
}

function buildTesterFeedbackForm() {
  return [
    "# Humi 1.1 体验者反馈单",
    "",
    "这张单只记录匿名体验结果。请不要在这里写手机号、微信号、真实姓名或家庭隐私。",
    "",
    "## 1. 基本信息",
    "",
    "- 用户编号：U___",
    "- 设备与微信版本：",
    "- 体验日期：",
    "- 家庭场景：一个人 / 两人 / 多人 / 有孩子 / 给父母做饭 / 其他",
    "",
    "## 2. 按这条路径试一次",
    "",
    "1. 打开 Humi 小程序。",
    "2. 看【今晚】推荐。",
    "3. 点“今晚就做”或换一组后选一个想做的菜。",
    "4. 看【清单】里是否知道要买什么。",
    "5. 有空的话试一下【我的家】里的问问大家，或把清单分享给家人认领。",
    "",
    "## 3. 只需要回答这些",
    "",
    "- 推荐里有没有你今晚真的愿意做的菜？1 / 2 / 3 / 4 / 5",
    "- 买菜清单有没有减少你想买什么的负担？1 / 2 / 3 / 4 / 5",
    "- 问问大家、邀请家人或清单分享顺不顺？1 / 2 / 3 / 4 / 5 / 没试",
    "- 哪一步最困惑或最卡？",
    "- 哪道菜你觉得不该推荐？为什么？",
    "- 有没有一个地方让你觉得“这个对我家有用”？",
    "- 明天你还会不会再打开？会 / 不会 / 看情况。原因：",
    "",
    "## 4. 截图",
    "",
    "如果卡住，请把截图或录屏发给执行人。执行人只把私有位置写进 CSV，不把图片放进仓库。",
    "",
  ].join("\n");
}

function buildHostRunSheet() {
  return [
    "# Humi 1.1 主厨记录单",
    "",
    "这张单给执行人使用，用来把真实体验转成 `feedback-template.csv` 和 `anonymous-users.csv` 的字段。",
    "",
    "## 单个用户记录",
    "",
    "- 用户编号：U___",
    "- 邀请状态：待邀请 / 已邀请 / 已体验 / 未响应",
    "- 首次体验日期：",
    "- 完成【今晚】菜单：是 / 否",
    "- 完成清单：是 / 否",
    "- 尝试协作：问问大家 / 邀请家人 / 买菜认领 / 没有",
    "- 推荐评分：1 / 2 / 3 / 4 / 5",
    "- 清单评分：1 / 2 / 3 / 4 / 5",
    "- 分享评分：1 / 2 / 3 / 4 / 5 / 没试",
    "- 复访状态：第二天打开 / 未复访 / 待观察",
    "- 当前等级：通过 / P0 / P1 / P2 / 建议 / 待观察",
    "- 私有证据位置：private://",
    "",
    "## 观察重点",
    "",
    "- 是否能不解释就理解【今晚】主按钮。",
    "- 是否能发现新菜并补进今晚。",
    "- 是否能看懂清单里谁在买、谁买到了。",
    "- 【我的家】问问大家是否留在本页完成，不跳错位置。",
    "- 分享卡片进入后是否知道自己要点什么。",
    "- 有无登录失败、清单回传失败、加入家庭失败、菜单丢失。",
    "",
    "## 回填规则",
    "",
    "- 真实体验后，把 `anonymous-users.csv` 的邀请状态改为 `已体验`。",
    "- 完成【今晚】菜单和完成清单只填 `是` 或 `否`。",
    "- 用户说了明确卡点或建议，就在 `feedback-template.csv` 增加一行。",
    "- P0/P1 同步写入 `issue-triage.csv`，并回到产品修复，不进入审核。",
    "- 每天结束时汇总 `daily-review.csv`。",
    "- 每轮回填后运行 `npm run release:candidate:doctor`。",
    "",
  ].join("\n");
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

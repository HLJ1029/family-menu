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

const [git, candidate, status] = await Promise.all([
  readGitState(),
  runJsonScript("release:candidate:check"),
  runJsonScript("release:status"),
]);

await mkdir(packetDir, { recursive: true, mode: 0o700 });

const files = [
  ["README.md", buildReadme({ git, candidate, status })],
  ["anonymous-users.csv", buildAnonymousUsersCsv()],
  ["feedback-template.csv", buildFeedbackTemplateCsv()],
  ["daily-review.csv", buildDailyReviewCsv()],
  ["issue-triage.csv", buildIssueTriageCsv()],
  ["invite-copy.md", buildInviteCopy()],
];

for (const [file, content] of files) {
  await writeFile(join(packetDir, file), content, { mode: 0o600 });
}

if (shouldOpen) {
  await openPath(packetDir);
  await openPath(join(packetDir, "README.md"));
}

const result = {
  ok: Boolean(candidate.ok && status.ok),
  checkedAt: new Date().toISOString(),
  packetDir,
  git,
  release: {
    statusOk: Boolean(status.ok),
    candidateHardeningReady: Boolean(status.release?.candidateHardeningReady),
    productReviewReady: Boolean(status.release?.productReviewReady),
    uploadedVersion: status.release?.miniProgramUploadedVersion,
    uploadDescription: status.release?.miniProgramUploadDescription,
  },
  files: files.map(([file]) => join(packetDir, file)),
  nextActions: [
    "Fill anonymous-users.csv with U001-U020 only; keep real contacts in private chat/docs.",
    "Send invite-copy.md text manually to selected testers.",
    "Collect feedback-template.csv and daily-review.csv during internal validation.",
    "Record P0/P1 findings in docs/humi-1.1-pre-review-hardening.md before WeChat review.",
  ],
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);

async function readGitState() {
  const [head, originMain, status] = await Promise.all([
    git(["rev-parse", "--short", "HEAD"]),
    git(["rev-parse", "--short", "origin/main"]),
    git(["status", "--short", "--branch"]),
  ]);
  return {
    head,
    originMain,
    clean: !status.split("\n").some((line) => line && !line.startsWith("## ")),
    branchStatus: status,
  };
}

async function git(args) {
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
    "",
    "## 执行顺序",
    "",
    "1. 从 `anonymous-users.csv` 里选 10-20 个匿名编号。",
    "2. 用 `invite-copy.md` 手动发送邀请，不在仓库记录真实联系方式。",
    "3. 每个用户至少跑一次【今晚】推荐、今晚菜单、清单，尽量再跑一次问问大家/邀请家人/买菜认领。",
    "4. 用 `feedback-template.csv` 收单个反馈，用 `daily-review.csv` 做每天汇总。",
    "5. 任一 P0 或多个用户同一核心链路卡住，先暂停审核准备，进入修复。",
    "6. 内测无 P0/P1 后，再由用户明确确认是否进入微信审核。",
    "",
    "## 当前机器检查",
    "",
    `- release:status ok=${Boolean(status.ok)}`,
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

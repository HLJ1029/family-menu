import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildCandidateFormsPreviewHtml, CANDIDATE_FORMS_PREVIEW_FILE } from "./lib/candidate-forms-preview.mjs";

const execFileAsync = promisify(execFile);

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || join(privateBaseDir, `candidate-validation-${stamp}`);
const shouldOpen = process.env.HUMI_CANDIDATE_VALIDATION_NO_OPEN !== "1";
const selftestMode = process.env.HUMI_CANDIDATE_PREPARE_SELFTEST === "1";

const [gitState, candidate, status] = await Promise.all([
  readGitState(),
  runJsonScript("release:candidate:check"),
  runJsonScript("release:status"),
]);

await mkdir(packetDir, { recursive: true, mode: 0o700 });

const testerFeedbackForm = buildTesterFeedbackForm();
const hostRunSheet = buildHostRunSheet();
const candidateFeedbackImportCsv = buildCandidateFeedbackImportCsv();
const dailyReviewCsv = buildDailyReviewCsv();

const files = [
  ["README.md", buildReadme({ git: gitState, candidate, status })],
  ["anonymous-users.csv", buildAnonymousUsersCsv()],
  ["feedback-template.csv", buildFeedbackTemplateCsv()],
  ["candidate-feedback-import.csv", candidateFeedbackImportCsv],
  ["daily-review.csv", dailyReviewCsv],
  ["issue-triage.csv", buildIssueTriageCsv()],
  ["invite-copy.md", buildInviteCopy()],
  ["outreach-batch.md", buildOutreachBatch()],
  ["tester-feedback-form.md", testerFeedbackForm],
  ["host-run-sheet.md", hostRunSheet],
  [CANDIDATE_FORMS_PREVIEW_FILE, buildCandidateFormsPreviewHtml({
    generatedAt: new Date().toISOString(),
    packetDir,
    testerFeedbackForm,
    hostRunSheet,
    importHeader: firstLine(candidateFeedbackImportCsv),
    dailyReviewHeader: firstLine(dailyReviewCsv),
  })],
];

for (const [file, content] of files) {
  await writeFile(join(packetDir, file), content, { mode: 0o600 });
}

if (shouldOpen) {
  await openPath(packetDir);
  await openPath(join(packetDir, "README.md"));
  await openPath(join(packetDir, CANDIDATE_FORMS_PREVIEW_FILE));
}

const result = {
  ok: Boolean(candidate.ok && (status.release?.engineeringGatesReady || selftestMode)),
  checkedAt: new Date().toISOString(),
  selftestMode,
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
    "Use outreach-batch.md to copy one anonymous U001-U020 message per tester.",
    "Use tester-feedback-form.md for user-facing feedback and host-run-sheet.md for operator notes.",
    "Open candidate-forms-preview.html to confirm the tester form and host run sheet layout before sending.",
    "Use npm run release:candidate:plan to generate candidate-day-plan.md before inviting each batch.",
    "Use npm run release:candidate:dispatch -- --date YYYY-MM-DD to generate today's send list and placeholder record templates.",
    "Use npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD to open the copy-friendly private HTML workbench for today's batch.",
    "After sending, use npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed to mark anonymous U ids as 已邀请.",
    "Use npm run release:candidate:desk to print today's private files, copyable commands, and do-not-do reminders.",
    "Use npm run release:candidate:desk:selftest to confirm the execution desk still reads a private packet correctly.",
    "Use npm run release:candidate:record -- ... only after replacing placeholders with real anonymous feedback.",
    "Use candidate-feedback-import.csv with npm run release:candidate:record -- --import candidate-feedback-import.csv when importing several users at once.",
    "Use npm run release:candidate:day:close -- --date YYYY-MM-DD at the end of each validation day.",
    "Use npm run release:candidate:daily -- --date YYYY-MM-DD only when you need to update daily-review.csv separately.",
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
    "- `candidate-feedback-import.csv`：批量回填多位用户的导入模板，字段名与 `release:candidate:record` 参数一致。",
    "- `daily-review.csv`：Day 1-Day 3 每日复盘。",
    "- `issue-triage.csv`：P0/P1/P2/建议分级和是否进入 1.1.x。",
    "- `invite-copy.md`：可以手动发给内测用户的邀请文案。",
    "- `outreach-batch.md`：U001-U020 可复制发送的匿名邀请消息。",
    "- `tester-feedback-form.md`：体验者可直接照着回答的反馈单。",
    "- `host-run-sheet.md`：主厨/执行人记录每次体验、卡点和回填字段的单据。",
    "- `candidate-forms-preview.html`：体验者反馈单、主厨记录单、导入字段和每日复盘规则的可视化预览。",
    "- `candidate-day-plan.md`：运行 `npm run release:candidate:plan` 后生成的当日邀请编号、追问编号和路径重点。",
    "- `candidate-dispatch-YYYY-MM-DD.md/json`：运行 `npm run release:candidate:dispatch -- --date YYYY-MM-DD` 后生成的当日发送对象、邀请文案和回填模板。",
    "- `candidate-dispatch-workbench-YYYY-MM-DD.html`：运行 `npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD` 后生成的当日复制工作台，不发送消息、不标记邀请。",
    "- `npm run release:candidate:record -- ...`：把单个用户结果安全回填到本私有包。",
    "- `npm run release:candidate:plan`：按当前缺口生成今天该邀哪些 U 编号、哪些人优先跑协作。",
    "- `npm run release:candidate:dispatch -- --date YYYY-MM-DD`：按日计划抽取当天 U 编号和回填模板；模板必须先替换真实匿名反馈，不能原样运行。",
    "- `npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD`：把当天分发单转成私有 HTML 工作台，方便逐个复制体验者文案和回填模板；不会发送消息或提交审核。",
    "- `npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed`：发送当天分发单后，把对应匿名 U 编号标为已邀请；不记录真实联系人；未带确认参数时不会写入。",
    "- `npm run release:candidate:desk`：打印今天要打开的私有包文件、回填命令和不要做的事。",
    "- `npm run release:candidate:desk:selftest`：用临时私有包确认执行台可读包、可打印今日动作和隐私/审核护栏。",
    "- `npm run release:candidate:forms:preview`：重新生成并打开 `candidate-forms-preview.html`，用于确认单据设计。",
    "- 仓库内模板锚点：`docs/humi-1.1-candidate-validation-forms.md`。",
    "",
    "## 执行顺序",
    "",
    "1. 从 `anonymous-users.csv` 里选 10-20 个匿名编号。",
    "2. 打开 `candidate-forms-preview.html`，确认体验者反馈单和主厨记录单可读后，再发给真实体验者。",
    "3. 用 `outreach-batch.md` 手动复制发送 U001-U020 邀请，不在仓库记录真实联系方式。",
    "4. 运行 `npm run release:candidate:plan` 生成 `candidate-day-plan.md`，先看今天该邀哪些编号、哪些人优先跑协作。",
    "5. 运行 `npm run release:candidate:dispatch -- --date YYYY-MM-DD` 生成今日分发单；只复制当天 U 编号对应的邀请文案。",
    "6. 运行 `npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD` 生成私有 HTML 工作台，用它逐个复制体验者文案和回填模板。",
    "7. 发送后运行 `npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed`，把当天 U 编号标为已邀请。",
    "8. 运行 `npm run release:candidate:desk`，确认今天要打开的私有文件和可复制命令。",
    "9. 运行 `npm run release:candidate:desk:selftest`，确认执行台工具本身仍可读取临时私有包。",
    "10. 发 `tester-feedback-form.md` 的问题给体验者；执行人自己用 `host-run-sheet.md` 记录现场观察。",
    "11. 每个用户至少跑一次【今晚】推荐、今晚菜单、清单，尽量再跑一次问问大家/邀请家人/买菜认领。",
    "11. 把单个用户结果汇总到 `feedback-template.csv`，并在每天结束时用 `npm run release:candidate:day:close -- --date YYYY-MM-DD` 自动写 `daily-review.csv` 和私有收尾报告。",
    "   分发单里的 `release:candidate:record` 是模板，必须把 `yes|no`、`1-5|没试`、问题等级和真实匿名摘要替换后再运行，不能原样运行。",
    "   多位用户一起回填时，先填 `candidate-feedback-import.csv`，再运行 `npm run release:candidate:record -- --import candidate-feedback-import.csv`。",
    "12. 任一 P0 或多个用户同一核心链路卡住，先暂停审核准备，进入修复。",
    "13. 每轮回填后运行 `npm run release:candidate:doctor` 看还差哪些样本。",
    "14. 内测无 P0/P1 且 `npm run release:candidate:review` 通过后，再由用户明确确认是否进入微信审核。",
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
    rows.push([id, index <= 10 ? "待定" : "候补", "待填", index <= 10 ? "待邀请" : "候补", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""]);
  }
  return toCsv(rows);
}

function buildFeedbackTemplateCsv() {
  return toCsv([
    ["用户编号", "设备与微信版本", "体验日期", "入口", "完成今晚菜单", "完成清单", "协作类型", "推荐评分", "清单评分", "分享评分", "卡住的位置", "用户原话摘要", "私有截图/录屏位置", "问题等级", "是否进入1.1.x", "处理状态"],
    ["U001", "待填", "待填", "今晚/完整菜品页/清单/我的家/五类分享卡片/菜单海报/清单海报", "是/否", "是/否", "问问大家/邀请家人/买菜认领/最近想吃/今晚菜单/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
  ]);
}

function buildCandidateFeedbackImportCsv() {
  return toCsv([
    ["user", "date", "device", "entry", "tonight", "grocery", "collaboration", "recommendation", "grocery-score", "share-score", "stuck", "note", "severity", "evidence", "revisit"],
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
  for (let index = 1; index <= 20; index += 1) {
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
    "# Humi 1.1 U001-U020 批量邀请清单",
    "",
    "本文件用于手动复制给 20 个候选体验者。不要把真实姓名、手机号、微信号或聊天截图写回仓库。",
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
    "- 入口任务：普通打开小程序 / 五类小程序卡片 / 发现新菜 / 清单理解 / 菜单海报 / 清单海报",
    "- 家庭场景：一个人 / 两人 / 多人 / 有孩子 / 给父母做饭 / 其他",
    "",
    "## 2. 按这条路径试一次",
    "",
    "1. 按执行人给你的入口任务打开 Humi。分享卡片任务必须点‘选择家人…’，看到真实微信联系人面板并发给另一台微信。",
    "2. 看【今晚】推荐。",
    "3. 点“今晚就做”或换一组后选一个想做的菜。",
    "4. 看【清单】里是否知道要买什么。",
    "5. 按分配任务完成一种分享卡片或海报；只有提示成功、没有联系人面板或实际图片都不算完成。",
    "",
    "## 3. 只需要回答这些",
    "",
    "- 推荐里有没有你今晚真的愿意做的菜？1 / 2 / 3 / 4 / 5",
    "- 买菜清单有没有减少你想买什么的负担？1 / 2 / 3 / 4 / 5",
    "- 这次分配的小程序卡片或海报分享顺不顺？1 / 2 / 3 / 4 / 5 / 没试",
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
    "- 入口任务：问问大家 / 邀请家人 / 买菜认领 / 最近想吃 / 今晚菜单小程序卡片 / 普通打开 / 完整菜品页 / 买菜清单 / 菜单海报 / 清单海报",
    "- 完成【今晚】菜单：是 / 否",
    "- 完成清单：是 / 否",
    "- 尝试协作：问问大家 / 邀请家人 / 买菜认领 / 最近想吃 / 今晚菜单 / 没有",
    "- 推荐评分：1 / 2 / 3 / 4 / 5 / 没试",
    "- 清单评分：1 / 2 / 3 / 4 / 5 / 没试",
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
    "- 小程序卡片进入后是否知道自己在帮家里做什么。",
    "- 五类卡片是否都经过原生发送页，并在第二次点击后出现真实微信联系人面板。",
    "- 菜单和清单海报是否能生成完整图片，并能实际分享或保存，不把提示当成成功。",
    "- 【我的家】问问大家是否留在本页完成，不跳错位置。",
    "- 分享卡片进入后是否知道自己要点什么。",
    "- 有无登录失败、清单回传失败、加入家庭失败、菜单丢失。",
    "",
    "## 回填规则",
    "",
    "- 真实体验后，把 `anonymous-users.csv` 的邀请状态改为 `已体验`。",
    "- 完成【今晚】菜单和完成清单只填 `是` 或 `否`。",
    "- 如果用户没打开成功、没走完今晚或清单，且推荐/清单/分享评分都是 `没试`，这条记录保留为卡点反馈，但不会计入真实体验样本。",
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

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

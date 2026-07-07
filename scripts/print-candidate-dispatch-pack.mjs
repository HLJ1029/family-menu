import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const date = args.date || new Date().toISOString().slice(0, 10);
const batchSize = args.batchSize || process.env.HUMI_CANDIDATE_PLAN_BATCH_SIZE || "6";
const dryRun = Boolean(args.dryRun);
const plan = await runPlan({ date, batchSize });
const outreach = await readFile(join(packetDir, "outreach-batch.md"), "utf8");
const feedbackForm = await readFile(join(packetDir, "tester-feedback-form.md"), "utf8");
const hostRunSheet = await readFile(join(packetDir, "host-run-sheet.md"), "utf8");
const inviteIds = plan.plan?.recommendedInviteUsers ?? [];
const collaborationIds = new Set(plan.plan?.collaborationUsers ?? []);

let collaborationTaskIndex = 0;
const users = inviteIds.map((id, index) => {
  const collaborationTarget = collaborationIds.has(id);
  const entryTask = assignEntryTask({ index, collaborationTarget, collaborationTaskIndex });
  if (collaborationTarget) collaborationTaskIndex += 1;
  return {
    id,
    collaborationTarget,
    entryTask,
    message: buildTesterMessage({
      baseMessage: extractOutreachMessage(outreach, id),
      entryTask,
    }),
    recordCommand: buildRecordCommand(id, {
      collaboration: collaborationTarget ? entryTask.collaborationCommand : "none",
      entry: entryTask.recordEntry,
    }),
  };
});

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  dryRun,
  packetDir,
  date,
  batchSize: Number(batchSize),
  dispatchMarkdownPath: dryRun ? null : join(packetDir, `candidate-dispatch-${date}.md`),
  dispatchJsonPath: dryRun ? null : join(packetDir, `candidate-dispatch-${date}.json`),
  users: users.map((user) => ({
    id: user.id,
    collaborationTarget: user.collaborationTarget,
    entryTask: user.entryTask.key,
    entryLabel: user.entryTask.label,
    hasMessage: Boolean(user.message),
  })),
  missingMessages: users.filter((user) => !user.message).map((user) => user.id),
  files: {
    plan: plan.files?.plan,
    outreachBatch: join(packetDir, "outreach-batch.md"),
    testerFeedbackForm: join(packetDir, "tester-feedback-form.md"),
    hostRunSheet: join(packetDir, "host-run-sheet.md"),
    candidateFeedbackImport: join(packetDir, "candidate-feedback-import.csv"),
  },
  nextActions: [
    `Run npm run release:candidate:dispatch:workbench -- --date ${date} to open the copy-friendly private HTML workbench for this batch.`,
    "Copy each user section from candidate-dispatch-YYYY-MM-DD.md into the private chat for that tester.",
    `After sending, run npm run release:candidate:invite -- --from-dispatch ${date} --sent-confirmed to mark anonymous IDs as 已邀请.`,
    "After feedback arrives, replace every placeholder in the generated release:candidate:record template before running it.",
    "Run npm run release:candidate:privacy:check, npm run release:candidate:doctor, and npm run release:candidate:day:close -- --date YYYY-MM-DD after each batch.",
  ],
};

const markdown = buildMarkdown({ result, users, feedbackForm, hostRunSheet });

if (!dryRun) {
  await Promise.all([
    writeFile(result.dispatchMarkdownPath, markdown, { mode: 0o600 }),
    writeFile(result.dispatchJsonPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }),
  ]);
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(markdown);
}

if (result.missingMessages.length) process.exit(1);

async function findLatestPacketDir() {
  const entries = await readdir(privateBaseDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("candidate-validation-"))
    .map((entry) => entry.name)
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error(`No candidate-validation-* directory found under ${privateBaseDir}. Run npm run release:candidate:prepare first.`);
  }
  return join(privateBaseDir, latest);
}

async function runPlan({ date, batchSize }) {
  const { stdout } = await execFileAsync("node", [
    "scripts/plan-candidate-validation-day.mjs",
    "--date",
    date,
    "--batch-size",
    String(batchSize),
    "--json",
    "1",
  ], {
    env: {
      ...process.env,
      HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
    },
    timeout: 60_000,
    maxBuffer: 1024 * 1024 * 4,
  });
  return JSON.parse(stdout);
}

function extractOutreachMessage(markdown, userId) {
  const pattern = new RegExp(`^## ${escapeRegExp(userId)}\\n\\n\\\`\\\`\\\`text\\n([\\s\\S]*?)\\n\\\`\\\`\\\``, "m");
  const match = markdown.match(pattern);
  return match ? match[1].trim() : "";
}

function buildTesterMessage({ baseMessage, entryTask }) {
  if (!baseMessage) return "";
  const lines = baseMessage.split("\n");
  const pathIndex = lines.findIndex((line) => line.trim() === "使用路径：");
  if (pathIndex < 0) {
    return [
      baseMessage,
      "",
      `这次请按这个入口任务试：${entryTask.label}。`,
      entryTask.instruction,
    ].join("\n");
  }
  return [
    ...lines.slice(0, pathIndex + 1),
    `0. 入口任务：${entryTask.label}。${entryTask.instruction}`,
    ...lines.slice(pathIndex + 1),
  ].join("\n");
}

function assignEntryTask({ index, collaborationTarget, collaborationTaskIndex }) {
  const collaborationTasks = [
    {
      key: "crave-card",
      label: "问问大家小程序卡片",
      instruction: "我会把【问问大家】小程序卡片发给你；点卡片进入后，帮忙看能不能免登录表达今晚想吃什么。",
      recordEntry: "分享卡片",
      collaborationCommand: "ask",
    },
    {
      key: "invite-card",
      label: "邀请家人小程序卡片",
      instruction: "我会把【邀请家人】小程序卡片发给你；点卡片进入后，帮忙看加入这个家、看到家庭菜单和清单是否顺。",
      recordEntry: "分享卡片",
      collaborationCommand: "invite",
    },
    {
      key: "grocery-card",
      label: "买菜清单小程序卡片",
      instruction: "我会把【买菜清单】小程序卡片发给你；点卡片进入后，帮忙看认领/标记买到是否看得懂。",
      recordEntry: "分享卡片",
      collaborationCommand: "grocery",
    },
  ];
  if (collaborationTarget) {
    return collaborationTasks[collaborationTaskIndex % collaborationTasks.length];
  }
  const normalTasks = [
    {
      key: "normal-open",
      label: "普通打开小程序",
      instruction: "请从微信里直接打开 Humi 小程序，重点看【今晚】推荐、发现新菜和清单是否自然。",
      recordEntry: "今晚",
      collaborationCommand: "none",
    },
    {
      key: "today-discovery",
      label: "今晚发现新菜",
      instruction: "请从【今晚】进入选菜/发现新菜，重点看是否能找到完整菜品页和愿意做的新菜。",
      recordEntry: "今晚",
      collaborationCommand: "none",
    },
    {
      key: "grocery-list",
      label: "清单理解",
      instruction: "请从【清单】看今晚要买什么，重点看食材、已有项和谁在买是否容易理解。",
      recordEntry: "清单",
      collaborationCommand: "none",
    },
  ];
  return normalTasks[index % normalTasks.length];
}

function buildRecordCommand(userId, { collaboration, entry }) {
  const collaborationValues = ["none", "ask", "grocery", "invite"];
  const collaborationChoices = [
    collaboration,
    ...collaborationValues.filter((value) => value !== collaboration),
  ].join("|");
  return `npm run release:candidate:record -- --user ${userId} --entry "${entry}" --tonight yes|no --grocery yes|no --collaboration ${collaborationChoices} --recommendation 1-5|没试 --grocery-score 1-5|没试 --share-score 1-5|没试 --severity P0|P1|P2|建议|通过 --note "替换成真实匿名摘要"`;
}

function buildMarkdown({ result, users, feedbackForm, hostRunSheet }) {
  const lines = [];
  lines.push("# Humi 1.1 候选内测今日分发单");
  lines.push("");
  lines.push(`日期：${result.date}`);
  lines.push(`生成时间：${result.checkedAt}`);
  lines.push(`私有执行包：${result.packetDir}`);
  lines.push("");
  lines.push("## 今日发送对象");
  lines.push("");
  if (users.length) {
    for (const user of users) {
      lines.push(`- ${user.id}：${user.entryTask.label}${user.collaborationTarget ? "（优先跑协作）" : ""}`);
    }
  } else {
    lines.push("- 暂无。");
  }
  lines.push("");
  lines.push("## 逐个发送");
  lines.push("");
  lines.push(`先运行 \`npm run release:candidate:dispatch:workbench -- --date ${result.date}\` 可打开私有 HTML 工作台，逐个复制体验者文案和回填模板；工作台不会发送消息或标记邀请。`);
  lines.push("");
  for (const user of users) {
    lines.push(`### ${user.id}${user.collaborationTarget ? " / 协作目标" : ""}`);
    lines.push("");
    lines.push(`入口任务：${user.entryTask.label}`);
    lines.push("");
    lines.push("```text");
    lines.push(user.entryTask.instruction);
    lines.push("```");
    lines.push("");
    lines.push("复制给体验者：");
    lines.push("");
    lines.push("```text");
    lines.push(user.message || `缺少 ${user.id} 的邀请文案，请检查 outreach-batch.md。`);
    lines.push("```");
    lines.push("");
    lines.push("收到反馈后的回填命令模板：");
    lines.push("");
    lines.push("先替换所有选项和摘要；不要原样运行这条模板。");
    lines.push("");
    lines.push("```text");
    lines.push(user.recordCommand);
    lines.push("```");
    lines.push("");
  }
  lines.push("## 体验者反馈单摘要");
  lines.push("");
  lines.push("```text");
  lines.push(extractFeedbackQuestions(feedbackForm));
  lines.push("```");
  lines.push("");
  lines.push("## 执行人记录重点");
  lines.push("");
  lines.push("```text");
  lines.push(extractHostChecklist(hostRunSheet));
  lines.push("```");
  lines.push("");
  lines.push("## 批次收尾");
  lines.push("");
  lines.push("```bash");
  lines.push(`npm run release:candidate:invite -- --from-dispatch ${result.date} --sent-confirmed`);
  lines.push("npm run release:candidate:privacy:check");
  lines.push("npm run release:candidate:doctor");
  lines.push(`npm run release:candidate:day:close -- --date ${result.date}`);
  lines.push("npm run release:candidate:review");
  lines.push("```");
  lines.push("");
  lines.push("## 不要做");
  lines.push("");
  lines.push("- 不把真实姓名、手机号、微信号、聊天截图或录屏写进仓库。");
  lines.push("- 不把体验者真实联系人和 U 编号映射表写进候选包。");
  lines.push("- 不用假反馈把候选复盘刷绿。");
  lines.push("- 候选复盘达标前不进入微信公众平台审核动作。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function extractFeedbackQuestions(content) {
  const marker = "## 3. 只需要回答这些";
  const start = content.indexOf(marker);
  if (start < 0) return content.trim();
  const after = content.indexOf("\n", start);
  const next = content.indexOf("\n## ", after + 1);
  return content.slice(after + 1, next < 0 ? undefined : next).trim();
}

function extractHostChecklist(content) {
  const marker = "## 2. 现场观察";
  const start = content.indexOf(marker);
  if (start < 0) return content.trim();
  const after = content.indexOf("\n", start);
  const next = content.indexOf("\n## ", after + 1);
  return content.slice(after + 1, next < 0 ? undefined : next).trim();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = camelCase(arg.slice(2));
    if (key === "dryRun" || key === "help" || key === "json") {
      parsed[key] = true;
    } else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function helpText() {
  return [
    "Usage:",
    "  npm run release:candidate:dispatch -- --date 2026-07-07 --batch-size 6",
    "  npm run release:candidate:dispatch -- --date 2026-07-07 --dry-run",
    "",
    "This command writes a private candidate-dispatch-YYYY-MM-DD.md/json for the users selected by release:candidate:plan.",
    "It does not send messages, does not submit WeChat review, and does not store real contacts.",
  ].join("\n");
}

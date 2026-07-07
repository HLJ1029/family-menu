import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const date = args.date || new Date().toISOString().slice(0, 10);
const noOpen = Boolean(args.noOpen) || process.env.HUMI_CANDIDATE_TODAY_NO_OPEN === "1";
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findOrPreparePacketDir();

await assertPacketReady(packetDir);

const plan = await runNodeJson(["scripts/plan-candidate-validation-day.mjs", "--date", date, "--json", "1"], {
  HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
});
const formsPreview = await runNodeJson(["scripts/print-candidate-forms-preview.mjs", ...(noOpen ? ["--no-open"] : [])], {
  HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  HUMI_CANDIDATE_FORMS_PREVIEW_NO_OPEN: noOpen ? "1" : "",
});
const dispatch = await runNodeJson(["scripts/print-candidate-dispatch-pack.mjs", "--date", date, "--json"], {
  HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
});
const workbench = await runNodeJson(["scripts/print-candidate-dispatch-workbench.mjs", "--date", date, "--json", ...(noOpen ? ["--no-open"] : [])], {
  HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  HUMI_CANDIDATE_WORKBENCH_NO_OPEN: noOpen ? "1" : "",
});
const privacy = await runNodeJson(["scripts/check-candidate-privacy.mjs"], {
  HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
});
const doctor = await runNodeText(["scripts/doctor-candidate-validation.mjs"], {
  HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
});

const result = {
  ok: Boolean(plan.ok && formsPreview.ok && dispatch.ok && workbench.ok && privacy.ok),
  checkedAt: new Date().toISOString(),
  date,
  packetDir,
  noOpen,
  files: {
    dayPlan: join(packetDir, "candidate-day-plan.md"),
    formsPreview: formsPreview.previewPath,
    dispatchMarkdown: dispatch.dispatchMarkdownPath,
    dispatchJson: dispatch.dispatchJsonPath,
    workbench: workbench.workbenchPath,
    testerFeedbackForm: join(packetDir, "tester-feedback-form.md"),
    hostRunSheet: join(packetDir, "host-run-sheet.md"),
    feedbackImport: join(packetDir, "candidate-feedback-import.csv"),
    dayClose: join(packetDir, `candidate-day-close-${date}.md`),
  },
  today: {
    recommendedInviteUsers: plan.plan?.recommendedInviteUsers ?? [],
    followUpUsers: plan.plan?.followUpUsers ?? [],
    collaborationUsers: plan.plan?.collaborationUsers ?? [],
    dispatchUsers: dispatch.users ?? [],
    pendingUsers: (workbench.users ?? []).filter((user) => !["已邀请", "已体验"].includes(user.inviteStatus)),
    shareCardQrReadyUsers: (workbench.users ?? []).filter((user) => user.shareCardQrReady === true).map((user) => user.id),
    privacyFindings: privacy.findings ?? [],
  },
  nextActions: [
    `打开 ${workbench.workbenchPath}，只发送今日工作台里的待发送 U 编号。`,
    `真实发送后运行 npm run release:candidate:invite -- --from-dispatch ${date} --sent-confirmed，标记匿名 U 编号已邀请。`,
    "收到反馈后先运行 release:candidate:record:draft，再把 record 占位模板替换成真实匿名反馈。",
    `今天结束运行 npm run release:candidate:day:close -- --date ${date}。`,
  ],
  guardrails: [
    "不会发送消息",
    "不会标记邀请",
    "不会写反馈",
    "不会提交审核",
  ],
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(buildText(result, doctor.stdout));
}

if (!result.ok) process.exit(1);

async function findOrPreparePacketDir() {
  const existing = await findLatestPacketDir();
  if (existing) return existing;
  const prepared = await runNodeJson(["scripts/prepare-candidate-validation-packet.mjs"], {
    HUMI_CANDIDATE_VALIDATION_NO_OPEN: "1",
  });
  return prepared.packetDir;
}

async function findLatestPacketDir() {
  try {
    const entries = await readdir(privateBaseDir, { withFileTypes: true });
    const latest = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("candidate-validation-"))
      .map((entry) => entry.name)
      .sort()
      .at(-1);
    return latest ? join(privateBaseDir, latest) : "";
  } catch {
    return "";
  }
}

async function assertPacketReady(dir) {
  await Promise.all([
    "anonymous-users.csv",
    "tester-feedback-form.md",
    "host-run-sheet.md",
    "candidate-feedback-import.csv",
  ].map((file) => access(join(dir, file))));
}

async function runNodeJson(nodeArgs, env = {}) {
  const { stdout } = await execFileAsync("node", nodeArgs, {
    env: cleanEnv({ ...process.env, ...env }),
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return parseLastJson(stdout);
}

async function runNodeText(nodeArgs, env = {}) {
  const { stdout } = await execFileAsync("node", nodeArgs, {
    env: cleanEnv({ ...process.env, ...env }),
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return { stdout };
}

function cleanEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
}

function buildText(data, doctorText) {
  const lines = [];
  lines.push("Humi 1.1 候选内测今日开工面板");
  lines.push("");
  lines.push(`日期：${data.date}`);
  lines.push(`检查时间：${data.checkedAt}`);
  lines.push(`私有执行包：${data.packetDir}`);
  lines.push("");
  lines.push("今天对象：");
  if (data.today.dispatchUsers.length) {
    for (const user of data.today.dispatchUsers) {
      const suffix = user.collaborationTarget ? "（优先跑协作）" : "";
      lines.push(`- ${user.id}: ${user.entryLabel}${suffix}`);
    }
  } else {
    lines.push("- 暂无今日分发对象。");
  }
  lines.push("");
  lines.push("今天打开这些：");
  lines.push(`- 单据发送前确认：${data.files.formsPreview}`);
  lines.push(`- 今日分发单：${data.files.dispatchMarkdown}`);
  lines.push(`- 今日分发工作台：${data.files.workbench}`);
  lines.push(`- 体验者反馈单：${data.files.testerFeedbackForm}`);
  lines.push(`- 主厨记录单：${data.files.hostRunSheet}`);
  lines.push("");
  lines.push("当前确认：");
  lines.push(`- 小程序卡片二维码可扫码 U：${formatIds(data.today.shareCardQrReadyUsers)}`);
  lines.push(`- 隐私扫描：${data.today.privacyFindings.length ? `${data.today.privacyFindings.length} 个发现，先清理` : "通过"}`);
  lines.push(`- 待发送 U：${formatIds(data.today.pendingUsers.map((user) => user.id))}`);
  lines.push("");
  lines.push("下一步：");
  data.nextActions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  lines.push("");
  lines.push("固定护栏：");
  for (const item of data.guardrails) lines.push(`- ${item}`);
  lines.push("");
  lines.push("doctor 摘要：");
  lines.push(trimDoctor(doctorText));
  return `${lines.join("\n")}\n`;
}

function trimDoctor(value) {
  const lines = String(value || "").trim().split(/\r?\n/);
  return lines.slice(0, 22).join("\n");
}

function formatIds(ids) {
  return ids.length ? ids.join("、") : "暂无";
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  return JSON.parse(candidate);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--no-open") parsed.noOpen = true;
    else if (arg === "--date") parsed.date = argv[index += 1];
    else if (arg.startsWith("--date=")) parsed.date = arg.slice("--date=".length);
  }
  return parsed;
}

import { execFile } from "node:child_process";
import { readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const date = args.date || new Date().toISOString().slice(0, 10);
const dryRun = Boolean(args.dryRun);
const closeMarkdownPath = join(packetDir, `candidate-day-close-${date}.md`);
const closeJsonPath = join(packetDir, `candidate-day-close-${date}.json`);

const privacy = await runJson("scripts/check-candidate-privacy.mjs", []);
const daily = await runJson("scripts/record-candidate-daily-review.mjs", [
  "--date",
  date,
  ...(args.label ? ["--label", args.label] : []),
  ...(args.conclusion ? ["--conclusion", args.conclusion] : []),
  ...(args.next ? ["--next", args.next] : []),
  ...(dryRun ? ["--dry-run"] : []),
]);
const review = await runJson("scripts/review-candidate-validation-packet.mjs", [], { allowFailure: true });
const doctor = await runText("scripts/doctor-candidate-validation.mjs", [], { allowFailure: true });

const fatalFailures = [
  privacy.ok ? null : "candidate-privacy",
  daily.ok ? null : "candidate-daily-review",
].filter(Boolean);

const result = {
  ok: fatalFailures.length === 0,
  checkedAt: new Date().toISOString(),
  dryRun,
  packetDir,
  date,
  closeMarkdownPath: dryRun ? null : closeMarkdownPath,
  closeJsonPath: dryRun ? null : closeJsonPath,
  privacyOk: Boolean(privacy.data?.ok),
  dailyReviewOk: Boolean(daily.data?.ok),
  candidateValidationReady: Boolean(review.data?.ok),
  fatalFailures,
  dailySummary: daily.data?.summary ?? null,
  candidateSummary: review.data?.summary ?? null,
  missingToThresholds: review.data?.missingToThresholds ?? null,
  blockers: review.data?.blockers ?? [],
  recommendation: review.data?.recommendation ?? "unknown",
  nextActions: buildNextActions({
    fatalFailures,
    review: review.data,
    privacy: privacy.data,
    date,
  }),
};

const markdown = buildMarkdown(result, doctor.stdout);

if (!dryRun) {
  await Promise.all([
    writeFile(closeJsonPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }),
    writeFile(closeMarkdownPath, markdown, { mode: 0o600 }),
  ]);
}

console.log(JSON.stringify(result, null, 2));

if (fatalFailures.length) process.exit(1);

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

async function runJson(script, scriptArgs, options = {}) {
  const result = await runText(script, scriptArgs, options);
  return {
    ...result,
    data: parseLastJson(result.stdout),
  };
}

async function runText(script, scriptArgs, { allowFailure = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [script, ...scriptArgs], {
      env: {
        ...process.env,
        HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
      },
      timeout: 90_000,
      maxBuffer: 1024 * 1024 * 6,
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    if (!allowFailure) {
      return {
        ok: false,
        stdout: String(error.stdout || ""),
        stderr: String(error.stderr || ""),
        error: error.message,
      };
    }
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
      error: error.message,
    };
  }
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function buildNextActions({ fatalFailures, review, privacy, date }) {
  if (fatalFailures.includes("candidate-privacy")) {
    return [
      "先清理候选私有包里的手机号、邮箱、微信号或真实姓名，再继续收尾。",
      "不要把敏感值贴到聊天、仓库或提交记录里。",
    ];
  }
  if (fatalFailures.includes("candidate-daily-review")) {
    return [
      "先修复 daily-review.csv 或候选日复盘脚本，再重新运行当天收尾。",
    ];
  }
  if (review?.ok) {
    return [
      "候选复盘已达标；仍需用户动作当下确认后，才进入微信审核准备。",
      "运行 npm run release:closure 和 npm run release:wechat:check 做最终只读核对。",
    ];
  }
  const reviewActions = review?.nextActions?.length ? review.nextActions : [
    "继续补真实候选反馈，不要用假反馈刷绿。",
  ];
  return [
    `今天的候选收尾已完成；${date} 的 daily-review.csv 已更新。`,
    ...(privacy?.ok ? ["隐私扫描通过，继续保持真实联系方式和截图在仓库外。"] : []),
    ...reviewActions,
    "每轮新增反馈后继续运行 npm run release:candidate:privacy:check、npm run release:candidate:doctor 和 npm run release:candidate:day:close。",
  ];
}

function buildMarkdown(result, doctorOutput) {
  const lines = [];
  lines.push("# Humi 1.1 候选内测日收尾");
  lines.push("");
  lines.push(`日期：${result.date}`);
  lines.push(`生成时间：${result.checkedAt}`);
  lines.push(`私有执行包：${result.packetDir}`);
  lines.push("");
  lines.push("## 收尾状态");
  lines.push("");
  lines.push(`- 隐私扫描：${result.privacyOk ? "通过" : "未通过"}`);
  lines.push(`- 每日复盘写入：${result.dailyReviewOk ? "通过" : "未通过"}`);
  lines.push(`- 候选复盘达标：${result.candidateValidationReady ? "是" : "否"}`);
  lines.push(`- 建议状态：${result.recommendation}`);
  lines.push("");
  lines.push("## 当日汇总");
  lines.push("");
  if (result.dailySummary) {
    lines.push(`- 新体验人数：${result.dailySummary.newExperienceUsers}`);
    lines.push(`- 完成【今晚】菜单：${result.dailySummary.completedTonight}`);
    lines.push(`- 完成清单：${result.dailySummary.completedGrocery}`);
    lines.push(`- 尝试协作：${result.dailySummary.triedCollaboration}`);
    lines.push(`- P0/P1：${result.dailySummary.p0Count}/${result.dailySummary.p1Count}`);
  } else {
    lines.push("- 今日汇总不可用，请检查 daily-review.csv。");
  }
  lines.push("");
  lines.push("## 总体缺口");
  lines.push("");
  if (result.candidateSummary && result.missingToThresholds) {
    lines.push(`- 真实体验：${result.candidateSummary.experiencedUsers}，还差 ${result.missingToThresholds.experiencedUsers}`);
    lines.push(`- 完成【今晚】菜单：${result.candidateSummary.completedTonight}，还差 ${result.missingToThresholds.completedTonight}`);
    lines.push(`- 完成清单：${result.candidateSummary.completedGrocery}，还差 ${result.missingToThresholds.completedGrocery}`);
    lines.push(`- 尝试协作：${result.candidateSummary.triedCollaboration}，还差 ${result.missingToThresholds.triedCollaboration}`);
    lines.push(`- P0/P1：${result.candidateSummary.p0Count}/${result.candidateSummary.p1Count}`);
  } else {
    lines.push("- 总体缺口不可用，请运行 npm run release:candidate:review。");
  }
  lines.push("");
  lines.push("## 阻塞项");
  lines.push("");
  if (result.blockers.length) {
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker.key}: ${blocker.title}`);
    }
  } else {
    lines.push("- 暂无。");
  }
  lines.push("");
  lines.push("## 下一步");
  lines.push("");
  for (const action of result.nextActions) {
    lines.push(`- ${action}`);
  }
  lines.push("");
  lines.push("## Doctor 摘要");
  lines.push("");
  lines.push("```text");
  lines.push(String(doctorOutput || "").trim() || "doctor output unavailable");
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = camelCase(arg.slice(2));
    if (key === "dryRun" || key === "help") {
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

function helpText() {
  return [
    "Usage:",
    "  npm run release:candidate:day:close -- --date 2026-07-07",
    "  npm run release:candidate:day:close -- --date 2026-07-07 --dry-run",
    "  npm run release:candidate:day:close -- --date 2026-07-07 --conclusion \"继续候选验证\" --next \"明天补 U007-U012\"",
    "",
    "This command does not create fake feedback and does not submit WeChat review.",
    "It privacy-checks the private packet, updates daily-review.csv, writes a private close report, and reports whether candidate validation is ready.",
  ].join("\n");
}

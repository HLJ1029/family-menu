import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();

const files = {
  anonymousUsers: join(packetDir, "anonymous-users.csv"),
  feedback: join(packetDir, "feedback-template.csv"),
  dailyReview: join(packetDir, "daily-review.csv"),
  issueTriage: join(packetDir, "issue-triage.csv"),
};

const [anonymousUsers, feedback, dailyReview, issueTriage] = await Promise.all([
  readCsv(files.anonymousUsers),
  readCsv(files.feedback),
  readCsv(files.dailyReview),
  readCsv(files.issueTriage),
]);

const userRows = anonymousUsers.rows.filter((row) => isRealUserRow(row["用户编号"]));
const activeUsers = userRows.filter((row) => !isPlaceholder(row["首次体验日期"]) || ["已体验", "已邀请", "未响应"].includes(row["邀请状态"]));
const experiencedUsers = userRows.filter((row) => row["邀请状态"] === "已体验" || !isPlaceholder(row["首次体验日期"]));
const completedTonight = experiencedUsers.filter((row) => isYes(row["完成今晚菜单"]));
const completedGrocery = experiencedUsers.filter((row) => isYes(row["完成清单"]));
const triedCollaboration = experiencedUsers.filter((row) => !isPlaceholder(row["尝试协作"]) && row["尝试协作"] !== "没有");
const p0Users = userRows.filter((row) => row["当前等级"] === "P0");
const p1Users = userRows.filter((row) => row["当前等级"] === "P1");

const feedbackRows = feedback.rows.filter((row) => isRealFeedbackRow(row));
const p0Feedback = feedbackRows.filter((row) => row["问题等级"] === "P0");
const p1Feedback = feedbackRows.filter((row) => row["问题等级"] === "P1");
const p0Issues = issueTriage.rows.filter((row) => row["等级"] === "P0" && !isPlaceholder(row["问题"]));
const p1Issues = issueTriage.rows.filter((row) => row["等级"] === "P1" && !isPlaceholder(row["问题"]));
const blockingIssues = issueTriage.rows.filter((row) => isYes(row["是否阻塞审核"]));
const dailyRows = dailyReview.rows.filter((row) => !isPlaceholder(row["新体验人数"]) || !isPlaceholder(row["今日结论"]));

const blockers = [];
if (experiencedUsers.length === 0 && feedbackRows.length === 0 && dailyRows.length === 0) {
  blockers.push({
    key: "no-real-validation",
    title: "候选内测执行包尚未填入真实反馈",
    details: ["Fill anonymous-users.csv, feedback-template.csv, or daily-review.csv with anonymous U001-U020 results."],
  });
}
if (p0Users.length || p0Feedback.length || p0Issues.length) {
  blockers.push({
    key: "p0",
    title: "存在 P0 反馈或问题",
    details: [...ids(p0Users), ...ids(p0Feedback), ...ids(p0Issues)],
  });
}
if (p1Users.length || p1Feedback.length || p1Issues.length) {
  blockers.push({
    key: "p1",
    title: "存在 P1 反馈或问题",
    details: [...ids(p1Users), ...ids(p1Feedback), ...ids(p1Issues)],
  });
}
if (blockingIssues.length) {
  blockers.push({
    key: "blocking-issue",
    title: "问题分级表标记了阻塞审核项",
    details: ids(blockingIssues),
  });
}

const result = {
  ok: blockers.length === 0,
  checkedAt: new Date().toISOString(),
  packetDir,
  files,
  summary: {
    candidateUsers: userRows.length,
    activeUsers: activeUsers.length,
    experiencedUsers: experiencedUsers.length,
    completedTonight: completedTonight.length,
    completedGrocery: completedGrocery.length,
    triedCollaboration: triedCollaboration.length,
    feedbackRows: feedbackRows.length,
    dailyReviewRows: dailyRows.length,
    p0Count: p0Users.length + p0Feedback.length + p0Issues.length,
    p1Count: p1Users.length + p1Feedback.length + p1Issues.length,
  },
  blockers,
  recommendation: recommendation(blockers),
  nextActions: nextActions(blockers),
};

await writeFile(join(packetDir, "candidate-review.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(packetDir, "candidate-review.md"), buildMarkdown(result), { mode: 0o600 });

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);

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

async function readCsv(path) {
  const content = await readFile(path, "utf8");
  const rows = parseCsv(content);
  const [headers, ...data] = rows;
  return {
    path,
    headers,
    rows: data
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))),
  };
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function isRealUserRow(id) {
  return /^U\d{3}$/.test(String(id || ""));
}

function isRealFeedbackRow(row) {
  return isRealUserRow(row["用户编号"])
    && (!isPlaceholder(row["体验日期"]) || !isPlaceholder(row["卡住的位置"]) || !isPlaceholder(row["用户原话摘要"]));
}

function isPlaceholder(value) {
  const text = String(value || "").trim();
  return !text || ["待填", "待观察", "待判断", "P0/P1/P2/建议", "是/否", "是/否/待观察", "1-5", "private://", "待收集"].includes(text);
}

function isYes(value) {
  return ["是", "已完成", "已体验", "true", "TRUE", "1"].includes(String(value || "").trim());
}

function ids(rows) {
  return rows.map((row) => row["用户编号"] || row["来源用户编号"] || row["编号"] || "unknown").filter(Boolean);
}

function recommendation(blockers) {
  if (blockers.some((item) => item.key === "no-real-validation")) {
    return "wait-for-validation-input";
  }
  if (blockers.some((item) => ["p0", "blocking-issue"].includes(item.key))) {
    return "stop-and-fix-before-review";
  }
  if (blockers.some((item) => item.key === "p1")) {
    return "triage-p1-before-review";
  }
  return "candidate-validation-clear";
}

function nextActions(blockers) {
  const rec = recommendation(blockers);
  if (rec === "wait-for-validation-input") {
    return [
      "Fill the private candidate-validation CSV files with anonymous U001-U020 results.",
      "Keep real contact details and screenshots outside the repository.",
      "Rerun npm run release:candidate:review after at least one real validation entry is recorded.",
    ];
  }
  if (rec === "stop-and-fix-before-review") {
    return [
      "Do not enter WeChat review.",
      "Fix reproducible P0/blocking issues first and record the fix in docs/humi-1.1-pre-review-hardening.md.",
      "Regenerate or update the private validation packet, then rerun release:candidate:review.",
    ];
  }
  if (rec === "triage-p1-before-review") {
    return [
      "Review P1 issues and decide whether they must be fixed before WeChat review.",
      "If any P1 affects core retention, fix it before review.",
      "If accepted for later 1.1.x, document the decision in the private packet and AI-HQ status.",
    ];
  }
  return [
    "Candidate validation has no P0/P1 blockers in the private packet.",
    "Continue product review and only enter WeChat review after explicit user confirmation.",
  ];
}

function buildMarkdown(result) {
  return [
    "# Humi 1.1 候选内测复盘",
    "",
    `生成时间：${result.checkedAt}`,
    `私有目录：\`${result.packetDir}\``,
    "",
    "## 结论",
    "",
    `- ok: ${result.ok}`,
    `- recommendation: ${result.recommendation}`,
    "",
    "## 汇总",
    "",
    ...Object.entries(result.summary).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## 阻塞项",
    "",
    ...(result.blockers.length ? result.blockers.flatMap((item) => [
      `### ${item.title}`,
      "",
      ...item.details.map((detail) => `- ${detail}`),
      "",
    ]) : ["无 P0/P1/blocking 阻塞项。", ""]),
    "## 下一步",
    "",
    ...result.nextActions.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

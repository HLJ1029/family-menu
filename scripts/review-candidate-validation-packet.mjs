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

const thresholds = {
  minExperiencedUsers: readThreshold("HUMI_CANDIDATE_MIN_EXPERIENCED_USERS", 10),
  minCompletedTonight: readThreshold("HUMI_CANDIDATE_MIN_COMPLETED_TONIGHT", 8),
  minCompletedGrocery: readThreshold("HUMI_CANDIDATE_MIN_COMPLETED_GROCERY", 8),
  minTriedCollaboration: readThreshold("HUMI_CANDIDATE_MIN_TRIED_COLLABORATION", 3),
};
const requiredShareTypes = ["问问大家", "邀请家人", "买菜认领", "最近想吃", "今晚菜单"];
const requiredPosterEntries = ["菜单海报", "清单海报"];

const [anonymousUsers, feedback, dailyReview, issueTriage] = await Promise.all([
  readCsv(files.anonymousUsers),
  readCsv(files.feedback),
  readCsv(files.dailyReview),
  readCsv(files.issueTriage),
]);

const userRows = anonymousUsers.rows.filter((row) => isRealUserRow(row["用户编号"]));
const activeUsers = userRows.filter((row) => !isPlaceholder(row["首次体验日期"]) || ["已体验", "已邀请", "未响应"].includes(row["邀请状态"]));
const experiencedUsers = userRows.filter((row) => hasCompletedExperience(row));
const completedTonight = experiencedUsers.filter((row) => isYes(row["完成今晚菜单"]));
const completedGrocery = experiencedUsers.filter((row) => isYes(row["完成清单"]));
const triedCollaboration = experiencedUsers.filter((row) => !isPlaceholder(row["尝试协作"]) && row["尝试协作"] !== "没有");
const p0Users = userRows.filter((row) => row["当前等级"] === "P0");
const p1Users = userRows.filter((row) => row["当前等级"] === "P1");

const feedbackRows = feedback.rows.filter((row) => isRealFeedbackRow(row));
const coveredShareTypes = requiredShareTypes.filter((type) => (
  triedCollaboration.some((row) => String(row["尝试协作"] || "").trim() === type)
));
const missingShareTypes = requiredShareTypes.filter((type) => !coveredShareTypes.includes(type));
const coveredPosterEntries = requiredPosterEntries.filter((entry) => (
  feedbackRows.some((row) => String(row["入口"] || "").trim() === entry)
));
const missingPosterEntries = requiredPosterEntries.filter((entry) => !coveredPosterEntries.includes(entry));
const p0Feedback = feedbackRows.filter((row) => row["问题等级"] === "P0");
const p1Feedback = feedbackRows.filter((row) => row["问题等级"] === "P1");
const p0Issues = issueTriage.rows.filter((row) => row["等级"] === "P0" && !isPlaceholder(row["问题"]));
const p1Issues = issueTriage.rows.filter((row) => row["等级"] === "P1" && !isPlaceholder(row["问题"]));
const blockingIssues = issueTriage.rows.filter((row) => isYes(row["是否阻塞审核"]));
const dailyRows = dailyReview.rows.filter((row) => !isPlaceholder(row["新体验人数"]) || !isPlaceholder(row["今日结论"]));
const dailyEvidenceRows = dailyRows.filter((row) => [
  "新体验人数",
  "完成今晚菜单",
  "完成清单",
  "尝试协作",
  "P0数",
  "P1数",
].some((key) => numericValue(row[key]) > 0));

const blockers = [];
if (experiencedUsers.length === 0 && feedbackRows.length === 0 && dailyEvidenceRows.length === 0) {
  blockers.push({
    key: "no-real-validation",
    title: "候选内测执行包尚未填入真实反馈",
    details: ["请在 anonymous-users.csv、feedback-template.csv 或 daily-review.csv 中填入 U001-U020 的真实匿名体验结果。"],
  });
}
if (!blockers.some((item) => item.key === "no-real-validation")) {
  if (experiencedUsers.length < thresholds.minExperiencedUsers) {
    blockers.push({
      key: "insufficient-validation-sample",
      title: "真实体验样本数不足",
      details: [`experiencedUsers=${experiencedUsers.length}; required>=${thresholds.minExperiencedUsers}`],
    });
  }
  if (completedTonight.length < thresholds.minCompletedTonight || completedGrocery.length < thresholds.minCompletedGrocery) {
    blockers.push({
      key: "insufficient-core-completion",
      title: "核心路径完成数不足",
      details: [
        `completedTonight=${completedTonight.length}; required>=${thresholds.minCompletedTonight}`,
        `completedGrocery=${completedGrocery.length}; required>=${thresholds.minCompletedGrocery}`,
      ],
    });
  }
  if (triedCollaboration.length < thresholds.minTriedCollaboration) {
    blockers.push({
      key: "insufficient-collaboration-sample",
      title: "协作路径样本数不足",
      details: [`triedCollaboration=${triedCollaboration.length}; required>=${thresholds.minTriedCollaboration}`],
    });
  }
  if (missingShareTypes.length) {
    blockers.push({
      key: "insufficient-share-type-coverage",
      title: "五类小程序卡片尚未逐类完成真机验证",
      details: missingShareTypes.map((type) => `missing=${type}`),
    });
  }
  if (missingPosterEntries.length) {
    blockers.push({
      key: "insufficient-poster-coverage",
      title: "菜单与清单海报尚未逐类完成真机验证",
      details: missingPosterEntries.map((entry) => `missing=${entry}`),
    });
  }
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

const summary = {
  candidateUsers: userRows.length,
  activeUsers: activeUsers.length,
  experiencedUsers: experiencedUsers.length,
  completedTonight: completedTonight.length,
  completedGrocery: completedGrocery.length,
  triedCollaboration: triedCollaboration.length,
  coveredShareTypes,
  missingShareTypes,
  coveredPosterEntries,
  missingPosterEntries,
  feedbackRows: feedbackRows.length,
  dailyReviewRows: dailyRows.length,
  dailyEvidenceRows: dailyEvidenceRows.length,
  p0Count: p0Users.length + p0Feedback.length + p0Issues.length,
  p1Count: p1Users.length + p1Feedback.length + p1Issues.length,
};
const thresholdProgress = buildThresholdProgress(summary, thresholds);

const result = {
  ok: blockers.length === 0,
  checkedAt: new Date().toISOString(),
  packetDir,
  files,
  summary,
  thresholds,
  thresholdProgress,
  missingToThresholds: Object.fromEntries(thresholdProgress.map((item) => [item.key, item.missing])),
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

function hasCompletedExperience(row) {
  if (isYes(row["完成今晚菜单"]) || isYes(row["完成清单"])) return true;
  if (isValidScore(row["推荐评分"]) || isValidScore(row["清单评分"]) || isValidScore(row["分享评分"])) return true;
  return hasTriedCollaboration(row["尝试协作"]);
}

function hasTriedCollaboration(value) {
  const text = String(value || "").trim();
  return !isPlaceholder(text) && !["没有", "没试"].includes(text);
}

function isValidScore(value) {
  return /^[1-5]$/.test(String(value || "").trim());
}

function isYes(value) {
  return ["是", "已完成", "已体验", "true", "TRUE", "1"].includes(String(value || "").trim());
}

function numericValue(value) {
  const number = Number(String(value || "").trim());
  return Number.isFinite(number) ? number : 0;
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
  if (blockers.some((item) => item.key.startsWith("insufficient-"))) {
    return "wait-for-more-validation";
  }
  return "candidate-validation-clear";
}

function nextActions(blockers) {
  const rec = recommendation(blockers);
  if (rec === "wait-for-validation-input") {
    return [
      "把 U001-U020 的真实匿名体验结果填入私有候选 CSV。",
      "默认通过线是 10 个真实体验、8 个完成【今晚】菜单、8 个完成清单、3 个协作样本。",
      "同时逐类完成五种小程序卡片的真实联系人发送/接收落地，以及菜单、清单两种海报的实际生成和分享/保存。",
      "真实联系方式和截图继续留在仓库外。",
      "至少录入一条真实体验后，重新运行 npm run release:candidate:review。",
    ];
  }
  if (rec === "stop-and-fix-before-review") {
    return [
      "不要进入微信审核。",
      "先修复可复现的 P0 或阻塞项，并把修复记录写入 docs/humi-1.1-pre-review-hardening.md。",
      "更新私有候选执行包后，重新运行 npm run release:candidate:review。",
    ];
  }
  if (rec === "triage-p1-before-review") {
    return [
      "先判断 P1 是否必须在微信审核前修复。",
      "任何影响核心留存的 P1 都先修复。",
      "若接受进入后续 1.1.x，请把决策写入私有候选执行包和 AI-HQ 状态。",
    ];
  }
  if (rec === "wait-for-more-validation") {
    return [
      "继续候选内测，不进入微信审核。",
      "先补足配置的真实样本数、核心路径完成数、五类卡片覆盖和双海报覆盖。",
      "补入更多 U001-U020 匿名结果后，重新运行 npm run release:candidate:review。",
    ];
  }
  return [
    "私有候选执行包里没有 P0/P1 阻塞项。",
    "继续做产品复核；只有用户明确确认后才进入微信审核。",
  ];
}

function buildThresholdProgress(summary, thresholds) {
  return [
    {
      key: "experiencedUsers",
      label: "真实体验样本",
      current: summary.experiencedUsers,
      required: thresholds.minExperiencedUsers,
    },
    {
      key: "completedTonight",
      label: "完成【今晚】菜单",
      current: summary.completedTonight,
      required: thresholds.minCompletedTonight,
    },
    {
      key: "completedGrocery",
      label: "完成清单",
      current: summary.completedGrocery,
      required: thresholds.minCompletedGrocery,
    },
    {
      key: "triedCollaboration",
      label: "尝试协作路径",
      current: summary.triedCollaboration,
      required: thresholds.minTriedCollaboration,
    },
  ].map((item) => ({
    ...item,
    missing: Math.max(0, item.required - item.current),
    ok: item.current >= item.required,
  }));
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
    "## 最低样本要求",
    "",
    ...Object.entries(result.thresholds).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## 达标进度",
    "",
    ...result.thresholdProgress.map((item) => `- ${item.label}: ${item.current}/${item.required}${item.ok ? "，已达标" : `，还差 ${item.missing}`}`),
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

function readThreshold(envName, fallback) {
  const value = Number(process.env[envName]);
  if (Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const dryRun = Boolean(args.dryRun);

const files = {
  anonymousUsers: join(packetDir, "anonymous-users.csv"),
  feedback: join(packetDir, "feedback-template.csv"),
  issueTriage: join(packetDir, "issue-triage.csv"),
};

const anonymous = await readCsv(files.anonymousUsers);
const feedback = await readCsv(files.feedback);
const issueTriage = await readCsv(files.issueTriage);
const records = args.import
  ? await readImportRecords(args.import)
  : [buildRecordFromInput(args)];

const piiFindings = records.flatMap((record) => scanRecordForPii(record));
if (piiFindings.length) {
  console.log(JSON.stringify({
    ok: false,
    checkedAt: new Date().toISOString(),
    packetDir,
    findings: piiFindings,
    nextActions: [
      "Remove phone numbers, email addresses, WeChat IDs, and real names before writing candidate feedback.",
      "Keep real contacts and screenshots outside candidate CSV files; use U001-U020 and private:// evidence pointers only.",
      "Do not paste sensitive values into chat or commits.",
    ],
  }, null, 2));
  process.exit(1);
}

const applied = records.map((record) => applyRecord({ anonymous, feedback, issueTriage, record }));

const result = {
  ok: true,
  dryRun,
  checkedAt: new Date().toISOString(),
  packetDir,
  user: applied.length === 1 ? applied[0].user : undefined,
  importedRecords: applied.length,
  users: applied.map((item) => item.user),
  updatedAnonymousUsers: files.anonymousUsers,
  appendedFeedback: applied.some((item) => item.appendedFeedback),
  appendedIssues: applied.filter((item) => item.appendedIssue).length,
  feedbackFile: files.feedback,
  issueTriageFile: files.issueTriage,
  nextActions: [
    "Run npm run release:candidate:doctor to inspect updated thresholds.",
    "If severity is P0/P1, triage before WeChat review.",
    "Keep real names, phone numbers, WeChat IDs, screenshots, and recordings outside the repository.",
  ],
};

if (!dryRun) {
  await writeFile(files.anonymousUsers, toCsv(anonymous.headers, anonymous.rows), { mode: 0o600 });
  await writeFile(files.feedback, toCsv(feedback.headers, feedback.rows), { mode: 0o600 });
  await writeFile(files.issueTriage, toCsv(issueTriage.headers, issueTriage.rows), { mode: 0o600 });
}

console.log(JSON.stringify(result, null, 2));

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
    headers,
    rows: data
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))),
  };
}

async function readImportRecords(importArg) {
  const importPath = isAbsolute(importArg) ? importArg : join(packetDir, importArg);
  const imported = await readCsv(importPath);
  const rows = imported.rows.filter((row) => String(row.user || row["用户编号"] || "").trim());
  if (!rows.length) {
    throw new Error(`${importPath} does not contain any feedback rows.`);
  }
  return rows.map((row) => buildRecordFromInput(row));
}

function buildRecordFromInput(input) {
  const userId = String(field(input, "user", "用户编号") || "").trim().toUpperCase();
  if (!/^U\d{3}$/.test(userId)) {
    throw new Error("Missing or invalid --user. Example: --user U001");
  }
  return {
    userId,
    today: field(input, "date", "体验日期") || new Date().toISOString().slice(0, 10),
    completedTonight: yesNo(field(input, "tonight", "完成今晚菜单")),
    completedGrocery: yesNo(field(input, "grocery", "完成清单")),
    collaboration: normalizeCollaboration(field(input, "collaboration", "协作类型")),
    recommendationScore: normalizeScore(field(input, "recommendation", "推荐评分"), "recommendation"),
    groceryScore: normalizeScore(field(input, "groceryScore", "grocery-score", "清单评分"), "grocery-score"),
    shareScore: normalizeScore(field(input, "shareScore", "share-score", "分享评分"), "share-score", { allowSkipped: true }),
    severity: normalizeSeverity(field(input, "severity", "问题等级") || "建议"),
    note: String(field(input, "note", "用户原话摘要") || "").trim(),
    stuck: String(field(input, "stuck", "卡住的位置") || "无").trim(),
    evidence: String(field(input, "evidence", "私有截图/录屏位置") || "private://").trim() || "private://",
    device: String(field(input, "device", "设备与微信版本") || "待填").trim() || "待填",
    entry: String(field(input, "entry", "入口") || "今晚").trim() || "今晚",
    revisit: String(field(input, "revisit", "复访状态") || "待观察").trim() || "待观察",
    forceFeedback: Boolean(input.forceFeedback || input["force-feedback"] || input["强制追加反馈"]),
  };
}

function field(input, ...keys) {
  for (const key of keys) {
    if (Object.hasOwn(input, key) && String(input[key] ?? "").trim() !== "") {
      return input[key];
    }
  }
  return "";
}

function applyRecord({ anonymous, feedback, issueTriage, record }) {
  const userIndex = anonymous.rows.findIndex((row) => row["用户编号"] === record.userId);
  if (userIndex < 0) {
    throw new Error(`${record.userId} is not present in ${files.anonymousUsers}`);
  }

  anonymous.rows[userIndex] = {
    ...anonymous.rows[userIndex],
    "设备/微信版本": record.device,
    "邀请状态": "已体验",
    "首次体验日期": record.today,
    "完成今晚菜单": record.completedTonight,
    "完成清单": record.completedGrocery,
    "尝试协作": record.collaboration,
    "推荐评分": record.recommendationScore,
    "清单评分": record.groceryScore,
    "分享评分": record.shareScore,
    "复访状态": record.revisit,
    "当前等级": record.severity === "建议" ? "建议" : record.severity,
    "私有证据位置": record.evidence,
    "备注": record.note,
  };

  const shouldAppendFeedback = Boolean(record.note || record.stuck !== "无" || record.severity !== "建议" || record.forceFeedback);
  if (shouldAppendFeedback) {
    feedback.rows.push({
      "用户编号": record.userId,
      "设备与微信版本": record.device,
      "体验日期": record.today,
      "入口": record.entry,
      "完成今晚菜单": record.completedTonight,
      "完成清单": record.completedGrocery,
      "协作类型": record.collaboration,
      "推荐评分": record.recommendationScore,
      "清单评分": record.groceryScore,
      "分享评分": record.shareScore,
      "卡住的位置": record.stuck,
      "用户原话摘要": record.note || "无",
      "私有截图/录屏位置": record.evidence,
      "问题等级": record.severity,
      "是否进入1.1.x": record.severity === "P0" || record.severity === "P1" ? "待观察" : "否",
      "处理状态": "新反馈",
    });
  }

  let appendedIssue = false;
  if (record.severity === "P0" || record.severity === "P1") {
    issueTriage.rows.push({
      "编号": nextIssueId(issueTriage.rows, record.severity),
      "问题": record.stuck === "无" ? record.note || "候选反馈需复核" : record.stuck,
      "来源用户编号": record.userId,
      "等级": record.severity,
      "是否复现": "待判断",
      "是否阻塞审核": "是",
      "是否进入1.1.x": "待判断",
      "Owner": "codex@mbp-m5pro",
      "处理状态": "新反馈",
      "结论": "",
    });
    appendedIssue = true;
  }

  return {
    user: record.userId,
    appendedFeedback: shouldAppendFeedback,
    appendedIssue,
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

function toCsv(headers, rows) {
  return `${[
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = camelCase(arg.slice(2));
    if (key === "dryRun" || key === "forceFeedback" || key === "help") {
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

function yesNo(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["yes", "y", "true", "1", "是", "已完成"].includes(text)) return "是";
  if (["no", "n", "false", "0", "否"].includes(text)) return "否";
  throw new Error("Expected yes/no for --tonight and --grocery.");
}

function normalizeCollaboration(value) {
  const text = String(value || "没有").trim();
  const map = {
    ask: "问问大家",
    invite: "邀请家人",
    grocery: "买菜认领",
    none: "没有",
    no: "没有",
  };
  return map[text.toLowerCase()] || text;
}

function normalizeScore(value, label, { allowSkipped = false } = {}) {
  const text = String(value || "").trim();
  if (allowSkipped && ["没试", "skip", "skipped"].includes(text)) return "没试";
  const score = Number(text);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error(`Expected 1-5 for --${label}${allowSkipped ? " or 没试" : ""}.`);
  }
  return String(score);
}

function normalizeSeverity(value) {
  const text = String(value || "").trim();
  if (["P0", "P1", "P2", "建议", "通过", "待观察"].includes(text)) return text;
  throw new Error("Expected --severity as P0, P1, P2, 建议, 通过, or 待观察.");
}

function nextIssueId(rows, severity) {
  const prefix = `${severity}-`;
  const next = rows
    .map((row) => String(row["编号"] || ""))
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((number) => Number.isInteger(number))
    .reduce((max, number) => Math.max(max, number), 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function scanRecordForPii(record) {
  const fields = [
    ["device", record.device],
    ["entry", record.entry],
    ["note", record.note],
    ["stuck", record.stuck],
    ["evidence", record.evidence],
    ["revisit", record.revisit],
  ];
  const findings = [];
  for (const [fieldName, value] of fields) {
    findings.push(...scanText(fieldName, value));
  }
  return findings.map((item) => ({
    user: record.userId,
    ...item,
  }));
}

function scanText(fieldName, value) {
  const text = String(value || "");
  const checks = [
    {
      type: "phone",
      pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    },
    {
      type: "email",
      pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    },
    {
      type: "wechat-id",
      pattern: /(?:微信号|微信ID|wechat id|wechat_id)\s*[:：]\s*[A-Za-z][A-Za-z0-9_-]{5,19}/gi,
    },
    {
      type: "real-name",
      pattern: /(?:真实姓名|姓名|联系人)\s*[:：]\s*[\u4e00-\u9fa5]{2,4}/g,
    },
  ];
  const findings = [];
  for (const check of checks) {
    if (check.pattern.test(text)) {
      findings.push({ field: fieldName, type: check.type });
    }
  }
  return findings;
}

function helpText() {
  return [
    "Usage:",
    "  npm run release:candidate:record -- --user U001 --tonight yes --grocery yes --collaboration ask --recommendation 5 --grocery-score 5 --share-score 4 --note \"清单有用\"",
    "  npm run release:candidate:record -- --import candidate-feedback-import.csv",
    "",
    "Options:",
    "  --user U001",
    "  --date 2026-07-07",
    "  --device \"iPhone 15 / WeChat 9\"",
    "  --entry 今晚",
    "  --revisit 待观察",
    "  --tonight yes|no",
    "  --grocery yes|no",
    "  --collaboration ask|invite|grocery|none",
    "  --recommendation 1-5",
    "  --grocery-score 1-5",
    "  --share-score 1-5|没试",
    "  --stuck \"无\"",
    "  --note \"用户原话摘要\"",
    "  --severity P0|P1|P2|建议|通过|待观察",
    "  --evidence private://...",
    "  --import candidate-feedback-import.csv",
    "  --dry-run",
  ].join("\n");
}

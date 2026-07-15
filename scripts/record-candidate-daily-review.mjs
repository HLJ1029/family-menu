import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const reviewDate = args.date || new Date().toISOString().slice(0, 10);
const label = args.label || reviewDate;
const dryRun = Boolean(args.dryRun);

const files = {
  anonymousUsers: join(packetDir, "anonymous-users.csv"),
  feedback: join(packetDir, "feedback-template.csv"),
  dailyReview: join(packetDir, "daily-review.csv"),
};

const [anonymous, feedback, daily] = await Promise.all([
  readCsv(files.anonymousUsers),
  readCsv(files.feedback),
  readCsv(files.dailyReview),
]);

const usersForDate = anonymous.rows.filter((row) => row["首次体验日期"] === reviewDate);
const feedbackForDate = feedback.rows.filter((row) => row["体验日期"] === reviewDate);
const completedTonight = usersForDate.filter((row) => isYes(row["完成今晚菜单"]));
const completedGrocery = usersForDate.filter((row) => isYes(row["完成清单"]));
const triedCollaboration = usersForDate.filter((row) => !isBlank(row["尝试协作"]) && row["尝试协作"] !== "没有");
const p0Rows = [
  ...usersForDate.filter((row) => row["当前等级"] === "P0"),
  ...feedbackForDate.filter((row) => row["问题等级"] === "P0"),
];
const p1Rows = [
  ...usersForDate.filter((row) => row["当前等级"] === "P1"),
  ...feedbackForDate.filter((row) => row["问题等级"] === "P1"),
];
const p0Count = uniqueUserIds(p0Rows).length;
const p1Count = uniqueUserIds(p1Rows).length;

const row = {
  "日期": label,
  "新体验人数": String(usersForDate.length),
  "完成今晚菜单": String(completedTonight.length),
  "完成清单": String(completedGrocery.length),
  "尝试协作": String(triedCollaboration.length),
  "P0数": String(p0Count),
  "P1数": String(p1Count),
  "今日结论": args.conclusion || defaultConclusion({ p0Rows, p1Rows, usersForDate }),
  "下一步": args.next || defaultNext({ p0Rows, p1Rows, usersForDate }),
};

const existingIndex = daily.rows.findIndex((item) => item["日期"] === label);
if (existingIndex >= 0) {
  daily.rows[existingIndex] = row;
} else {
  daily.rows.push(row);
}

const result = {
  ok: true,
  dryRun,
  checkedAt: new Date().toISOString(),
  packetDir,
  date: reviewDate,
  label,
  updatedDailyReview: files.dailyReview,
  summary: {
    newExperienceUsers: usersForDate.length,
    completedTonight: completedTonight.length,
    completedGrocery: completedGrocery.length,
    triedCollaboration: triedCollaboration.length,
    p0Count,
    p1Count,
  },
  nextActions: [
    "Run npm run release:candidate:doctor to inspect updated candidate validation progress.",
    "Run npm run release:candidate:review before any WeChat review preparation.",
    "Keep real names, phone numbers, WeChat IDs, screenshots, and recordings outside the repository.",
  ],
};

if (!dryRun) {
  await writeFile(files.dailyReview, toCsv(daily.headers, daily.rows), { mode: 0o600 });
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

function isYes(value) {
  return ["是", "已完成", "true", "TRUE", "1", "yes"].includes(String(value || "").trim());
}

function isBlank(value) {
  const text = String(value || "").trim();
  return !text || ["待填", "待观察", "没有"].includes(text);
}

function uniqueUserIds(rows) {
  return [...new Set(rows.map((row) => row["用户编号"] || row["来源用户编号"] || row["编号"]).filter(Boolean))];
}

function defaultConclusion({ p0Rows, p1Rows, usersForDate }) {
  if (p0Rows.length) return "出现 P0，暂停审核准备";
  if (p1Rows.length) return "出现 P1，先判断是否提审前修复";
  if (!usersForDate.length) return "今日暂无新增真实体验";
  return "继续候选验证";
}

function defaultNext({ p0Rows, p1Rows, usersForDate }) {
  if (p0Rows.length) return "先修复 P0，再重新候选复盘";
  if (p1Rows.length) return "先 triage P1，必要时进入 1.1.x";
  if (!usersForDate.length) return "继续邀请 U001-U020 真实体验";
  return "继续补足 10 个真实体验、8 个今晚菜单、8 个清单和 3 个协作样本";
}

function helpText() {
  return [
    "Usage:",
    "  npm run release:candidate:daily -- --date 2026-07-07",
    "  npm run release:candidate:daily -- --date 2026-07-07 --conclusion \"继续候选验证\" --next \"明天补 U006-U010\"",
    "",
    "Options:",
    "  --date 2026-07-07",
    "  --label Day 1",
    "  --conclusion \"今日结论\"",
    "  --next \"下一步\"",
    "  --dry-run",
  ].join("\n");
}

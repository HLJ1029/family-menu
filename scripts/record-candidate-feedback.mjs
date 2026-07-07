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
const userId = String(args.user || "").trim().toUpperCase();
if (!/^U\d{3}$/.test(userId)) {
  throw new Error("Missing or invalid --user. Example: --user U001");
}

const today = args.date || new Date().toISOString().slice(0, 10);
const completedTonight = yesNo(args.tonight);
const completedGrocery = yesNo(args.grocery);
const collaboration = normalizeCollaboration(args.collaboration);
const recommendationScore = normalizeScore(args.recommendation, "recommendation");
const groceryScore = normalizeScore(args.groceryScore, "grocery-score");
const shareScore = normalizeScore(args.shareScore, "share-score", { allowSkipped: true });
const severity = normalizeSeverity(args.severity || "建议");
const note = String(args.note || "").trim();
const stuck = String(args.stuck || "无").trim();
const evidence = String(args.evidence || "private://").trim() || "private://";
const device = String(args.device || "待填").trim() || "待填";
const entry = String(args.entry || "今晚").trim() || "今晚";
const revisit = String(args.revisit || "待观察").trim() || "待观察";
const dryRun = Boolean(args.dryRun);

const files = {
  anonymousUsers: join(packetDir, "anonymous-users.csv"),
  feedback: join(packetDir, "feedback-template.csv"),
};

const anonymous = await readCsv(files.anonymousUsers);
const feedback = await readCsv(files.feedback);

const userIndex = anonymous.rows.findIndex((row) => row["用户编号"] === userId);
if (userIndex < 0) {
  throw new Error(`${userId} is not present in ${files.anonymousUsers}`);
}

const userRow = {
  ...anonymous.rows[userIndex],
  "设备/微信版本": device,
  "邀请状态": "已体验",
  "首次体验日期": today,
  "完成今晚菜单": completedTonight,
  "完成清单": completedGrocery,
  "尝试协作": collaboration,
  "推荐评分": recommendationScore,
  "清单评分": groceryScore,
  "分享评分": shareScore,
  "复访状态": revisit,
  "当前等级": severity === "建议" ? "建议" : severity,
  "私有证据位置": evidence,
  "备注": note,
};
anonymous.rows[userIndex] = userRow;

const shouldAppendFeedback = Boolean(note || stuck !== "无" || severity !== "建议" || args.forceFeedback);
if (shouldAppendFeedback) {
  feedback.rows.push({
    "用户编号": userId,
    "设备与微信版本": device,
    "体验日期": today,
    "入口": entry,
    "完成今晚菜单": completedTonight,
    "完成清单": completedGrocery,
    "协作类型": collaboration,
    "推荐评分": recommendationScore,
    "清单评分": groceryScore,
    "分享评分": shareScore,
    "卡住的位置": stuck,
    "用户原话摘要": note || "无",
    "私有截图/录屏位置": evidence,
    "问题等级": severity,
    "是否进入1.1.x": severity === "P0" || severity === "P1" ? "待观察" : "否",
    "处理状态": "新反馈",
  });
}

const result = {
  ok: true,
  dryRun,
  checkedAt: new Date().toISOString(),
  packetDir,
  user: userId,
  updatedAnonymousUsers: files.anonymousUsers,
  appendedFeedback: shouldAppendFeedback,
  feedbackFile: files.feedback,
  nextActions: [
    "Run npm run release:candidate:doctor to inspect updated thresholds.",
    "If severity is P0/P1, triage before WeChat review.",
    "Keep real names, phone numbers, WeChat IDs, screenshots, and recordings outside the repository.",
  ],
};

if (!dryRun) {
  await writeFile(files.anonymousUsers, toCsv(anonymous.headers, anonymous.rows), { mode: 0o600 });
  await writeFile(files.feedback, toCsv(feedback.headers, feedback.rows), { mode: 0o600 });
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

function helpText() {
  return [
    "Usage:",
    "  npm run release:candidate:record -- --user U001 --tonight yes --grocery yes --collaboration ask --recommendation 5 --grocery-score 5 --share-score 4 --note \"清单有用\"",
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
    "  --dry-run",
  ].join("\n");
}

import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const dryRun = Boolean(args.dryRun);
const inviteDate = args.date || args.fromDispatch || new Date().toISOString().slice(0, 10);
const users = await resolveUsers();
const file = join(packetDir, "anonymous-users.csv");
const csv = await readCsv(file);
const missing = users.filter((user) => !csv.rows.some((row) => row["用户编号"] === user));

if (!users.length) {
  throw new Error("No users provided. Use --users U001,U002 or --from-dispatch YYYY-MM-DD.");
}

if (missing.length) {
  throw new Error(`Unknown candidate user(s): ${missing.join(", ")}`);
}

const updated = [];
for (const row of csv.rows) {
  if (!users.includes(row["用户编号"])) continue;
  if (row["邀请状态"] !== "已体验") {
    row["邀请状态"] = "已邀请";
  }
  updated.push(row["用户编号"]);
}

if (!dryRun) {
  await writeFile(file, toCsv(csv.headers, csv.rows), { mode: 0o600 });
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  dryRun,
  packetDir,
  date: inviteDate,
  users: updated,
  updatedAnonymousUsers: file,
  fromDispatch: args.fromDispatch ? join(packetDir, `candidate-dispatch-${args.fromDispatch}.json`) : undefined,
  nextActions: [
    "Send only the anonymous invitation messages; keep real contacts outside this packet.",
    "After feedback arrives, replace placeholders in release:candidate:record templates with real anonymous results.",
    "Run npm run release:candidate:doctor to inspect current invitation and validation gaps.",
  ],
}, null, 2));

async function resolveUsers() {
  const explicitUsers = parseUsers(args.users);
  if (explicitUsers.length) return explicitUsers;
  if (!args.fromDispatch) return [];

  const path = join(packetDir, `candidate-dispatch-${args.fromDispatch}.json`);
  const dispatch = JSON.parse(await readFile(path, "utf8"));
  return (dispatch.users || [])
    .map((user) => String(user.id || "").trim().toUpperCase())
    .filter(Boolean);
}

function parseUsers(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .map((item) => {
      if (!/^U\d{3}$/.test(item)) {
        throw new Error(`Invalid candidate user id: ${item}`);
      }
      return item;
    });
}

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

function helpText() {
  return [
    "Usage:",
    "  npm run release:candidate:invite -- --from-dispatch 2026-07-07",
    "  npm run release:candidate:invite -- --users U001,U002,U003 --date 2026-07-07",
    "",
    "Marks anonymous U ids as 已邀请 in the latest private candidate packet.",
    "This command does not store real contacts and does not create validation feedback.",
  ].join("\n");
}

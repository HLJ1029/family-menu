import { access, chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const user = String(args.user || "").trim().toUpperCase();
const date = args.date || new Date().toISOString().slice(0, 10);
const entry = String(args.entry || "待替换入口").trim() || "待替换入口";

if (!/^U\d{3}$/.test(user)) {
  throw new Error("Missing or invalid --user. Example: npm run release:candidate:record:draft -- --user U001 --date 2026-07-07");
}

const anonymousPath = join(packetDir, "anonymous-users.csv");
const users = await readAnonymousUsers(anonymousPath);
const target = users.find((item) => item.id === user);
if (!target) {
  throw new Error(`${user} is not present in ${anonymousPath}`);
}

const draftPath = join(packetDir, `candidate-record-draft-${user}-${date}.md`);
const command = [
  "npm run release:candidate:record --",
  `--user ${user}`,
  `--date ${date}`,
  `--entry "${entry}"`,
  "--tonight \"yes|no\"",
  "--grocery \"yes|no\"",
  "--collaboration \"none|ask|grocery|invite\"",
  "--recommendation \"1-5|没试\"",
  "--grocery-score \"1-5|没试\"",
  "--share-score \"1-5|没试\"",
  "--severity \"P0|P1|P2|建议|通过\"",
  "--stuck \"替换成卡住位置或无\"",
  "--note \"替换成真实匿名摘要\"",
  `--evidence private://candidate/${user}`,
].join(" ");

const markdown = [
  `# Humi 1.1 候选反馈回填草稿 ${user}`,
  "",
  `日期：${date}`,
  `私有执行包：${packetDir}`,
  `匿名编号：${user}`,
  `当前邀请状态：${target.inviteStatus || "待确认"}`,
  `建议入口：${entry}`,
  "",
  "## 先填这张小表",
  "",
  "| 字段 | 只能填什么 | 当前值 |",
  "| --- | --- | --- |",
  "| 完成今晚菜单 | yes / no | 待替换 |",
  "| 完成清单 | yes / no | 待替换 |",
  "| 协作类型 | none / ask / grocery / invite | 待替换 |",
  "| 推荐评分 | 1-5 / 没试 | 待替换 |",
  "| 清单评分 | 1-5 / 没试 | 待替换 |",
  "| 分享评分 | 1-5 / 没试 | 待替换 |",
  "| 问题等级 | P0 / P1 / P2 / 建议 / 通过 | 待替换 |",
  "| 卡住的位置 | 没卡住时填 无 | 待替换 |",
  "| 真实匿名摘要 | 不写姓名、手机号、微信号 | 待替换 |",
  `| 私有证据位置 | private://...，不要放截图本体 | private://candidate/${user} |`,
  "",
  "## 可复制回填命令模板",
  "",
  "不要原样运行。先把 yes|no、1-5|没试、问题等级、卡住位置和真实匿名摘要全部替换掉。",
  "",
  "```text",
  command,
  "```",
  "",
  "## 护栏",
  "",
  "- 这份草稿不会写入 anonymous-users.csv、feedback-template.csv 或 issue-triage.csv。",
  "- 真实姓名、手机号、微信号、截图和录屏不能写入这份草稿，也不能提交到仓库。",
  "- 如果问题等级是 P0/P1，回填后会自动进入 issue-triage.csv，先处理或明确进入 1.1.x，再考虑审核。",
  "- 已邀请不等于已体验；只有真实反馈回填后，candidate review 才可能计入样本。",
  "",
].join("\n");

await writeFile(draftPath, markdown, { mode: 0o600 });
await chmod(draftPath, 0o600);

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  user,
  date,
  entry,
  inviteStatus: target.inviteStatus || "待确认",
  draftPath,
  nextActions: [
    "Open the draft, replace every placeholder with real anonymous feedback, then run the generated release:candidate:record command.",
    "Run npm run release:candidate:privacy:check before candidate review.",
    "Run npm run release:candidate:doctor to inspect updated validation gaps after writing feedback.",
  ],
}, null, 2));

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

async function readAnonymousUsers(path) {
  await access(path);
  const content = await readFile(path, "utf8");
  const rows = parseCsv(content);
  const [headers, ...data] = rows;
  const idIndex = headers.indexOf("用户编号");
  const statusIndex = headers.indexOf("邀请状态");
  if (idIndex < 0) {
    throw new Error(`${path} is missing 用户编号 column.`);
  }
  return data
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row) => ({
      id: String(row[idIndex] || "").trim().toUpperCase(),
      inviteStatus: statusIndex >= 0 ? String(row[statusIndex] || "").trim() : "",
    }));
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = camelCase(arg.slice(2));
    if (key === "help") {
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
    "  npm run release:candidate:record:draft -- --user U001 --date 2026-07-07 --entry \"问问大家小程序卡片\"",
    "",
    "Writes candidate-record-draft-U001-YYYY-MM-DD.md into the private candidate packet.",
    "The draft is a copy-and-fill aid only; it does not write feedback, mark invites, or submit WeChat review.",
  ].join("\n");
}

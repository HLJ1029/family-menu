import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const date = args.date || new Date().toISOString().slice(0, 10);
const batchSize = readPositiveInteger(args["batch-size"] || process.env.HUMI_CANDIDATE_PLAN_BATCH_SIZE, 6);
const shouldWrite = args.write !== "0" && args["no-write"] !== "1";

const [anonymousUsers, review] = await Promise.all([
  readCsv(join(packetDir, "anonymous-users.csv")),
  runReview(packetDir),
]);

const userRows = anonymousUsers.rows.filter((row) => /^U\d{3}$/.test(row["用户编号"] || ""));
const experiencedUsers = userRows.filter((row) => isExperienced(row));
const followUpUsers = userRows
  .filter((row) => !isExperienced(row) && ["已体验", "已邀请", "未响应"].includes(row["邀请状态"]))
  .map((row) => row["用户编号"]);
const inviteableUsers = userRows
  .filter((row) => !isExperienced(row) && ["待邀请", "候补", ""].includes(row["邀请状态"] || ""))
  .sort((a, b) => invitePriority(a) - invitePriority(b))
  .map((row) => row["用户编号"]);

const missing = review.data?.missingToThresholds ?? {};
const recommendedInviteUsers = inviteableUsers.slice(0, Math.min(batchSize, Math.max(missing.experiencedUsers ?? batchSize, 0) || batchSize));
const collaborationTargetCount = Math.min(recommendedInviteUsers.length, Math.max(missing.triedCollaboration ?? 0, 0));
const collaborationUsers = recommendedInviteUsers.slice(0, collaborationTargetCount);
const tonightUsers = recommendedInviteUsers.slice(0, Math.min(recommendedInviteUsers.length, Math.max(missing.completedTonight ?? 0, 0) || recommendedInviteUsers.length));
const groceryUsers = recommendedInviteUsers.slice(0, Math.min(recommendedInviteUsers.length, Math.max(missing.completedGrocery ?? 0, 0) || recommendedInviteUsers.length));

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  date,
  batchSize,
  reviewRecommendation: review.data?.recommendation ?? "unknown",
  currentProgress: review.data?.thresholdProgress ?? [],
  summary: review.data?.summary ?? {},
  plan: {
    followUpUsers,
    recommendedInviteUsers,
    tonightUsers,
    groceryUsers,
    collaborationUsers,
  },
  files: {
    plan: join(packetDir, "candidate-day-plan.md"),
    outreachBatch: join(packetDir, "outreach-batch.md"),
    testerFeedbackForm: join(packetDir, "tester-feedback-form.md"),
    hostRunSheet: join(packetDir, "host-run-sheet.md"),
    importCsv: join(packetDir, "candidate-feedback-import.csv"),
  },
  nextActions: [
    "Send outreach-batch.md messages only to the recommended anonymous IDs for this batch.",
    "Ask every invited tester to complete Tonight and grocery list; use stable U001-U005 dispatch tasks to cover all five native share cards and require the real contact picker.",
    "Record only U001-U020 anonymous summaries in the candidate CSV files; keep real contacts and screenshots outside the repository.",
    "After feedback arrives, use release:candidate:record or candidate-feedback-import.csv, then run release:candidate:privacy:check and release:candidate:review.",
  ],
};

const markdown = buildMarkdown(result);
if (shouldWrite) {
  await writeFile(result.files.plan, markdown, { mode: 0o600 });
}

if (args.json === "1") {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(markdown);
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

async function runReview(dir) {
  try {
    const { stdout } = await execFileAsync("node", ["scripts/review-candidate-validation-packet.mjs"], {
      env: { ...process.env, HUMI_CANDIDATE_VALIDATION_DIR: dir },
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return { exitCode: 0, data: parseLastJson(stdout) };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      data: parseLastJson(error.stdout || ""),
    };
  }
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

function buildMarkdown(data) {
  const lines = [];
  lines.push("# Humi 1.1 候选内测日计划");
  lines.push("");
  lines.push(`日期：${data.date}`);
  lines.push(`生成时间：${data.checkedAt}`);
  lines.push(`私有执行包：${data.packetDir}`);
  lines.push("");
  lines.push("## 今天目标");
  lines.push("");
  lines.push(`- 建议新邀请：${formatIds(data.plan.recommendedInviteUsers)}`);
  lines.push(`- 需要追问：${formatIds(data.plan.followUpUsers)}`);
  lines.push(`- 必跑【今晚】菜单：${formatIds(data.plan.tonightUsers)}`);
  lines.push(`- 必跑清单：${formatIds(data.plan.groceryUsers)}`);
  lines.push(`- 优先跑协作：${formatIds(data.plan.collaborationUsers)}`);
  lines.push("- 五类卡片固定任务：U001、U002、U003、U004、U005（每类都必须出现真实微信联系人面板并完成接收落地）");
  lines.push("- 双海报固定任务：U009 菜单海报、U010 清单海报（必须生成图片并实际分享或保存）");
  lines.push("");
  lines.push("## 当前缺口");
  lines.push("");
  for (const item of data.currentProgress) {
    lines.push(`- ${item.label}: ${item.current}/${item.required}，还差 ${item.missing}`);
  }
  lines.push("");
  lines.push("## 执行顺序");
  lines.push("");
  lines.push("1. 运行 `npm run release:candidate:dispatch -- --date YYYY-MM-DD`，只抽今天建议编号的邀请文案。");
  lines.push("2. 发送后运行 `npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed`，把匿名 U 编号标为已邀请。");
  lines.push("3. 给每位体验者发 `tester-feedback-form.md`，让对方只按轻量问题回答。");
  lines.push("4. 执行人用 `host-run-sheet.md` 记录是否能发现新菜、完成今晚菜单、生成清单和走完协作。");
  lines.push("5. 收到反馈后，替换分发单里的 record 模板，或用 `candidate-feedback-import.csv` 回填真实匿名汇总。");
  lines.push("6. 每轮回填后运行 `npm run release:candidate:privacy:check` 和 `npm run release:candidate:doctor`。");
  lines.push("7. 一天结束优先运行 `npm run release:candidate:day:close -- --date YYYY-MM-DD`，写入每日复盘和私有收尾报告。");
  lines.push("");
  lines.push("## 不要做");
  lines.push("");
  lines.push("- 不写真实姓名、手机号、微信号、截图或录屏到仓库或候选 CSV。");
  lines.push("- 不用假反馈把候选复盘刷绿。");
  lines.push("- 候选复盘达标前不进入微信公众平台审核动作。");
  lines.push("");
  lines.push("## 可复制命令");
  lines.push("");
  lines.push("```bash");
  lines.push(`npm run release:candidate:dispatch -- --date ${data.date}`);
  lines.push(`npm run release:candidate:invite -- --from-dispatch ${data.date} --sent-confirmed`);
  lines.push("npm run release:candidate:record -- --import candidate-feedback-import.csv");
  lines.push("npm run release:candidate:privacy:check");
  lines.push(`npm run release:candidate:day:close -- --date ${data.date}`);
  lines.push(`npm run release:candidate:daily -- --date ${data.date}`);
  lines.push("npm run release:candidate:review");
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      parsed[key] = argv[index + 1];
      index += 1;
    } else {
      parsed[key] = "1";
    }
  }
  return parsed;
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isExperienced(row) {
  if (isYes(row["完成今晚菜单"]) || isYes(row["完成清单"])) return true;
  if (isValidScore(row["推荐评分"]) || isValidScore(row["清单评分"]) || isValidScore(row["分享评分"])) return true;
  const collaboration = String(row["尝试协作"] || "").trim();
  return !isPlaceholder(collaboration) && !["没有", "没试"].includes(collaboration);
}

function isPlaceholder(value) {
  const text = String(value || "").trim();
  return !text || ["待填", "待观察", "待判断", "P0/P1/P2/建议", "是/否", "是/否/待观察", "1-5", "private://", "待收集"].includes(text);
}

function isYes(value) {
  return ["是", "已完成", "已体验", "true", "TRUE", "1"].includes(String(value || "").trim());
}

function isValidScore(value) {
  return /^[1-5]$/.test(String(value || "").trim());
}

function invitePriority(row) {
  const status = row["邀请状态"] || "";
  if (status === "待邀请") return 0;
  if (status === "候补") return 1;
  return 2;
}

function formatIds(ids) {
  return ids.length ? ids.join("、") : "暂无";
}

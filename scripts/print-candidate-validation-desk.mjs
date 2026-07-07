import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const today = new Date().toISOString().slice(0, 10);
const review = await runReview();
const dispatch = await readDispatchSummary(packetDir, today);

await assertPacketFiles(packetDir);

const result = review.data;
const lines = [];

lines.push("Humi 1.1 候选内测执行台");
lines.push("");
lines.push(`检查时间：${new Date().toISOString()}`);
lines.push(`私有执行包：${packetDir}`);
if (result?.summary) {
  lines.push(`真实体验：${result.summary.experiencedUsers}/${result.thresholds?.minExperiencedUsers ?? 10}`);
  lines.push(`完成【今晚】菜单：${result.summary.completedTonight}/${result.thresholds?.minCompletedTonight ?? 8}`);
  lines.push(`完成清单：${result.summary.completedGrocery}/${result.thresholds?.minCompletedGrocery ?? 8}`);
  lines.push(`尝试协作：${result.summary.triedCollaboration}/${result.thresholds?.minTriedCollaboration ?? 3}`);
  lines.push(`P0/P1：${result.summary.p0Count}/${result.summary.p1Count}`);
}
lines.push("");

if (dispatch) {
  lines.push("今日分发单已生成：");
  lines.push(`- 分发单: ${dispatch.markdownPath}`);
  if (dispatch.users.length) {
    for (const user of dispatch.users) {
      const suffix = user.collaborationTarget ? "（优先跑协作）" : "";
      lines.push(`- ${user.id}: ${user.entryLabel}${suffix}`);
    }
  } else {
    lines.push("- 暂无今日发送对象。");
  }
  lines.push("");
}

lines.push("今天先做：");
lines.push("1. 先运行 `npm run release:candidate:plan`，再打开 `candidate-day-plan.md` 看今天建议邀请、追问和优先协作的 U 编号。");
if (dispatch) {
  lines.push(`2. 打开 \`candidate-dispatch-${today}.md\`，逐条复制 U 编号对应的入口任务和体验者文案。`);
} else {
  lines.push("2. 运行 `npm run release:candidate:dispatch -- --date YYYY-MM-DD` 生成今日分发单；若还没有分发单，才打开 `outreach-batch.md` 只复制今天建议编号的邀请文案。");
}
lines.push("3. 给体验者发 `tester-feedback-form.md`，只让对方按轻量问题回答，不暴露工程门禁。");
lines.push("4. 执行人自己用 `host-run-sheet.md` 记录观察，尤其看发现新菜、今晚菜单、清单和协作路径。");
lines.push("5. 收到反馈后优先用 `release:candidate:record` 或 `candidate-feedback-import.csv` 回填匿名结果。");
lines.push(`6. 今天结束运行 \`npm run release:candidate:day:close -- --date ${today}\`，一次完成隐私扫描、每日复盘、doctor、candidate review 和私有收尾报告。`);
lines.push("7. 需要单独补写 daily-review.csv 时，再运行 `npm run release:candidate:daily -- --date YYYY-MM-DD`。");
lines.push("");

lines.push("今天不要做：");
lines.push("- 不把真实姓名、手机号、微信号、截图或录屏写进仓库。");
lines.push("- 不用假反馈把候选复盘刷绿。");
lines.push("- 不在候选复盘达标前进入微信公众平台审核动作。");
lines.push("");

lines.push("要打开的私有文件：");
for (const item of candidateFiles(packetDir)) {
  lines.push(`- ${item.label}: ${item.path}`);
}
lines.push("");

lines.push("仓库内模板锚点：");
lines.push("- docs/humi-1.1-candidate-validation-forms.md");
lines.push("");

lines.push("可复制命令：");
lines.push("- HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare");
lines.push("- npm run release:candidate:plan");
lines.push(`- npm run release:candidate:dispatch -- --date ${today}`);
lines.push(`- npm run release:candidate:invite -- --from-dispatch ${today} --sent-confirmed`);
lines.push("- npm run release:candidate:doctor");
lines.push("- npm run release:candidate:record -- --user U001 ...  # 先替换分发单模板里的真实匿名反馈");
lines.push("- npm run release:candidate:record -- --import candidate-feedback-import.csv");
lines.push(`- npm run release:candidate:day:close -- --date ${today}`);
lines.push(`- npm run release:candidate:daily -- --date ${today}`);
lines.push("- npm run release:candidate:review");
lines.push("");

lines.push("通过线：");
lines.push("- 10 个真实体验、8 个完成今晚菜单、8 个完成清单、3 个协作样本，且没有 P0/P1。");
lines.push("- 达标后仍需用户动作当下确认，才进入微信审核准备。");

console.log(lines.join("\n"));

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

async function runReview() {
  try {
    const { stdout } = await execFileAsync("node", ["scripts/review-candidate-validation-packet.mjs"], {
      env: { ...process.env, HUMI_CANDIDATE_VALIDATION_DIR: packetDir },
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return { data: parseLastJson(stdout) };
  } catch (error) {
    return { data: parseLastJson(error.stdout || "") };
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

async function assertPacketFiles(dir) {
  await Promise.all(requiredCandidateFiles(dir).map((item) => access(item.path)));
}

function candidateFiles(dir) {
  return [
    ["候选内测日计划", "candidate-day-plan.md"],
    dispatch ? ["今日分发单", `candidate-dispatch-${today}.md`] : null,
    dispatch ? ["今日分发 JSON", `candidate-dispatch-${today}.json`] : null,
    ...requiredCandidateFiles(dir).map((item) => [item.label, item.file]),
  ].filter(Boolean).map(([label, file]) => ({
    label,
    path: `${dir}/${file}`,
  }));
}

function requiredCandidateFiles(dir) {
  return [
    ["邀请文案", "invite-copy.md"],
    ["U001-U020 批量邀请清单", "outreach-batch.md"],
    ["体验者反馈单", "tester-feedback-form.md"],
    ["主厨记录单", "host-run-sheet.md"],
    ["批量反馈导入模板", "candidate-feedback-import.csv"],
    ["匿名用户进度表", "anonymous-users.csv"],
    ["单条反馈回填表", "feedback-template.csv"],
    ["每日复盘表", "daily-review.csv"],
    ["P0/P1 问题分级表", "issue-triage.csv"],
  ].map(([label, file]) => ({
    label,
    file,
    path: `${dir}/${file}`,
  }));
}

async function readDispatchSummary(dir, date) {
  const jsonPath = `${dir}/candidate-dispatch-${date}.json`;
  const markdownPath = `${dir}/candidate-dispatch-${date}.md`;
  try {
    const content = await readFile(jsonPath, "utf8");
    await access(markdownPath);
    const parsed = JSON.parse(content);
    return {
      markdownPath,
      jsonPath,
      users: Array.isArray(parsed.users) ? parsed.users : [],
    };
  } catch {
    return null;
  }
}

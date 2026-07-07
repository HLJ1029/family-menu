import { execFile } from "node:child_process";
import { access, chmod, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");

if (args.help) {
  console.log(helpText());
  process.exit(0);
}

const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const date = args.date || new Date().toISOString().slice(0, 10);
const noOpen = Boolean(args.noOpen) || process.env.HUMI_CANDIDATE_WORKBENCH_NO_OPEN === "1";
const markdownPath = join(packetDir, `candidate-dispatch-${date}.md`);
const jsonPath = join(packetDir, `candidate-dispatch-${date}.json`);
const workbenchPath = join(packetDir, `candidate-dispatch-workbench-${date}.html`);

await ensureDispatchExists();

const [markdown, dispatchJson] = await Promise.all([
  readFile(markdownPath, "utf8"),
  readDispatchJson(),
]);
const users = parseDispatchUsers(markdown);
const html = buildWorkbenchHtml({
  packetDir,
  date,
  checkedAt: new Date().toISOString(),
  markdownPath,
  jsonPath,
  users,
  dispatchJson,
});

await writeFile(workbenchPath, html, { mode: 0o600 });
await chmod(workbenchPath, 0o600);

if (!noOpen) await openPath(workbenchPath);

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  date,
  workbenchPath,
  sourceMarkdown: markdownPath,
  sourceJson: jsonPath,
  users: users.map((user) => ({
    id: user.id,
    entryLabel: user.entryLabel,
    collaborationTarget: user.collaborationTarget,
    hasTesterMessage: Boolean(user.testerMessage),
    hasRecordCommand: Boolean(user.recordCommand),
  })),
  nextActions: [
    "Open candidate-dispatch-workbench-YYYY-MM-DD.html and copy each tester message into the private chat for that U id.",
    `After the messages or mini program cards are actually sent, run npm run release:candidate:invite -- --from-dispatch ${date} --sent-confirmed.`,
    "After feedback arrives, copy the record command template, replace every placeholder with real anonymous feedback, then run it.",
    `End the day with npm run release:candidate:day:close -- --date ${date}.`,
  ],
};

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log([
    "Humi 1.1 候选分发工作台",
    "",
    `日期：${date}`,
    `私有执行包：${packetDir}`,
    `工作台：${workbenchPath}`,
    `来源分发单：${markdownPath}`,
    "",
    "今日对象：",
    ...result.users.map((user) => `- ${user.id}: ${user.entryLabel}${user.collaborationTarget ? "（优先跑协作）" : ""}`),
    "",
    "下一步：打开 HTML 工作台逐个复制体验者文案；真实发送后再运行带 --sent-confirmed 的 invite 命令。",
    "",
    JSON.stringify(result, null, 2),
  ].join("\n"));
}

if (users.some((user) => !user.testerMessage || !user.recordCommand)) process.exit(1);

async function ensureDispatchExists() {
  try {
    await Promise.all([access(markdownPath), access(jsonPath)]);
  } catch {
    await execFileAsync("node", [
      "scripts/print-candidate-dispatch-pack.mjs",
      "--date",
      date,
      "--json",
    ], {
      env: {
        ...process.env,
        HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
      },
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
    });
  }
}

async function readDispatchJson() {
  try {
    return JSON.parse(await readFile(jsonPath, "utf8"));
  } catch {
    return null;
  }
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

function parseDispatchUsers(markdown) {
  const users = [];
  const sectionPattern = /^### (U\d{3})([^\n]*)\n([\s\S]*?)(?=^### U\d{3}|\n## 体验者反馈单摘要|\n## 主厨记录单摘要|\n## 收尾命令|\n## 隐私和审核护栏|(?![\s\S]))/gm;
  for (const match of markdown.matchAll(sectionPattern)) {
    const id = match[1];
    const headingSuffix = match[2] || "";
    const body = match[3] || "";
    const fences = [...body.matchAll(/```text\n([\s\S]*?)\n```/g)].map((item) => item[1].trim());
    const entryLabel = body.match(/入口任务：([^\n]+)/)?.[1]?.trim() || "待确认入口任务";
    users.push({
      id,
      collaborationTarget: headingSuffix.includes("协作目标"),
      entryLabel,
      instruction: fences[0] || "",
      testerMessage: fences[1] || "",
      recordCommand: fences[2] || "",
    });
  }
  return users;
}

function buildWorkbenchHtml({ packetDir, date, checkedAt, markdownPath, jsonPath, users, dispatchJson }) {
  const summaryUsers = dispatchJson?.users ?? [];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Humi 1.1 候选分发工作台 ${escapeHtml(date)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #101010;
      --muted: #676767;
      --line: #dedede;
      --paper: #ffffff;
      --soft: #f6f6f3;
      --accent: #0f766e;
      --warn: #9f1239;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--soft);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header, main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 24px;
    }
    header {
      display: grid;
      gap: 16px;
      padding-top: 32px;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.12;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 21px;
      letter-spacing: 0;
    }
    h3 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
    }
    .meta, .guard, .grid, .user-card, .command-bar {
      border: 1px solid var(--line);
      background: var(--paper);
      border-radius: 8px;
    }
    .meta {
      display: grid;
      gap: 8px;
      padding: 16px;
      color: var(--muted);
      font-size: 14px;
    }
    .command-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 14px;
      align-items: center;
    }
    .command-bar code, .meta code {
      overflow-wrap: anywhere;
    }
    button {
      border: 1px solid var(--ink);
      background: var(--ink);
      color: #fff;
      border-radius: 999px;
      min-height: 38px;
      padding: 8px 14px;
      font-size: 14px;
      cursor: pointer;
    }
    button.secondary {
      background: #fff;
      color: var(--ink);
    }
    .grid {
      display: grid;
      gap: 12px;
      padding: 16px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .summary-card {
      border-left: 4px solid var(--accent);
      padding: 10px 12px;
      background: #fbfbfa;
    }
    .summary-card strong { display: block; }
    .summary-card span { color: var(--muted); font-size: 14px; }
    .user-list {
      display: grid;
      gap: 16px;
    }
    .user-card {
      padding: 16px;
      display: grid;
      gap: 14px;
    }
    .user-head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 13px;
      color: var(--muted);
      background: #fff;
    }
    .copy-block {
      display: grid;
      gap: 8px;
    }
    .copy-head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
    }
    pre {
      margin: 0;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfbfa;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 13px;
    }
    .guard {
      padding: 16px;
      border-color: #f0c7d0;
      color: var(--warn);
    }
    .guard ul { margin: 8px 0 0; padding-left: 20px; }
    @media (max-width: 640px) {
      header, main { padding: 18px; }
      h1 { font-size: 28px; }
      .command-bar { align-items: stretch; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <header data-workbench-kind="humi-candidate-dispatch">
    <h1>Humi 1.1 候选分发工作台</h1>
    <section class="meta" aria-label="工作台信息">
      <div>日期：<strong>${escapeHtml(date)}</strong></div>
      <div>生成时间：${escapeHtml(checkedAt)}</div>
      <div>私有执行包：<code>${escapeHtml(packetDir)}</code></div>
      <div>来源分发单：<code>${escapeHtml(markdownPath)}</code></div>
      <div>来源 JSON：<code>${escapeHtml(jsonPath)}</code></div>
    </section>
    <section class="command-bar" aria-label="批次命令">
      <button data-copy="${escapeAttribute(`npm run release:candidate:invite -- --from-dispatch ${date} --sent-confirmed`)}">复制已发送标记命令</button>
      <button class="secondary" data-copy="${escapeAttribute(`npm run release:candidate:privacy:check`)}">复制隐私扫描命令</button>
      <button class="secondary" data-copy="${escapeAttribute(`npm run release:candidate:day:close -- --date ${date}`)}">复制今日收尾命令</button>
    </section>
  </header>
  <main>
    <section class="grid" aria-label="今日对象">
      ${summaryCards(summaryUsers.length ? summaryUsers : users)}
    </section>
    <section class="user-list" aria-label="逐个发送">
      ${users.map(renderUser).join("\n")}
    </section>
    <section class="guard" aria-label="护栏">
      <h2>固定护栏</h2>
      <ul>
        <li>这个工作台不会发送微信消息，不记录真实联系人，也不会标记已邀请。</li>
        <li>消息或小程序卡片真实发出后，才运行带 <code>--sent-confirmed</code> 的 invite 命令。</li>
        <li>回填命令必须替换 <code>yes|no</code>、<code>1-5|没试</code>、问题等级和真实匿名摘要；不要原样运行模板。</li>
        <li>手机号、邮箱、微信号、真实姓名、截图和录屏只放在仓库外私有位置。</li>
        <li>候选复盘达标并由用户当下确认前，不进入微信公众平台审核动作。</li>
      </ul>
    </section>
  </main>
  <script>
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const text = button.getAttribute("data-copy") || "";
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = "已复制";
        } catch {
          window.prompt("复制这段内容", text);
        }
      });
    });
  </script>
</body>
</html>`;
}

function summaryCards(users) {
  if (!users.length) return '<div class="summary-card"><strong>暂无今日对象</strong><span>先运行 release:candidate:dispatch</span></div>';
  return users.map((user) => {
    const id = user.id || "U___";
    const label = user.entryLabel || user.entryTask || "待确认入口";
    const suffix = user.collaborationTarget ? "优先跑协作" : "普通路径";
    return `<div class="summary-card"><strong>${escapeHtml(id)}</strong><span>${escapeHtml(label)} / ${escapeHtml(suffix)}</span></div>`;
  }).join("\n");
}

function renderUser(user) {
  return `<article class="user-card" id="${escapeAttribute(user.id)}">
  <div class="user-head">
    <h2>${escapeHtml(user.id)}</h2>
    <span class="tag">${escapeHtml(user.entryLabel)}${user.collaborationTarget ? " / 优先跑协作" : ""}</span>
  </div>
  <div class="copy-block">
    <div class="copy-head">
      <h3>入口任务</h3>
      <button class="secondary" data-copy="${escapeAttribute(user.instruction)}">复制入口任务</button>
    </div>
    <pre>${escapeHtml(user.instruction)}</pre>
  </div>
  <div class="copy-block">
    <div class="copy-head">
      <h3>复制给体验者</h3>
      <button data-copy="${escapeAttribute(user.testerMessage)}">复制体验者文案</button>
    </div>
    <pre>${escapeHtml(user.testerMessage)}</pre>
  </div>
  <div class="copy-block">
    <div class="copy-head">
      <h3>收到反馈后的回填模板</h3>
      <button class="secondary" data-copy="${escapeAttribute(user.recordCommand)}">复制回填模板</button>
    </div>
    <pre>${escapeHtml(user.recordCommand)}</pre>
  </div>
</article>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

async function openPath(path) {
  if (process.platform !== "darwin") return;
  await execFileAsync("open", [path], { timeout: 15_000 }).catch(() => {});
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--no-open") parsed.noOpen = true;
    else if (arg === "--date") parsed.date = argv[index += 1];
    else if (arg.startsWith("--date=")) parsed.date = arg.slice("--date=".length);
  }
  return parsed;
}

function helpText() {
  return [
    "Usage: npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD",
    "",
    "Generates candidate-dispatch-workbench-YYYY-MM-DD.html inside the private candidate packet.",
    "The workbench is a copy-and-check surface only; it does not send messages, mark invites, or submit WeChat review.",
  ].join("\n");
}

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
const shareEvidenceDir = await findLatestShareEvidenceDir();

await ensureDispatchExists();

const [markdown, dispatchJson] = await Promise.all([
  readFile(markdownPath, "utf8"),
  readDispatchJson(),
]);
const inviteStatuses = await readInviteStatuses(packetDir);
const dispatchUsersById = buildDispatchUsersById(dispatchJson);
const users = parseDispatchUsers(markdown).map((user) => ({
  ...user,
  ...dispatchUsersById.get(user.id),
  inviteStatus: inviteStatuses.get(user.id) || "待确认",
})).map((user) => ({
  ...user,
  shareCardGuide: buildShareCardGuide(user, shareEvidenceDir),
}));
const pendingUsers = users.filter((user) => !isAlreadySent(user.inviteStatus));
const batchInviteCommand = pendingUsers.length === 0
  ? "npm run release:candidate:doctor"
  : pendingUsers.length < users.length
    ? `npm run release:candidate:invite -- --users ${pendingUsers.map((user) => user.id).join(",")} --date ${date} --sent-confirmed`
    : `npm run release:candidate:invite -- --from-dispatch ${date} --sent-confirmed`;
const html = buildWorkbenchHtml({
  packetDir,
  date,
  checkedAt: new Date().toISOString(),
  markdownPath,
  jsonPath,
  shareEvidenceDir,
  users,
  pendingUsers,
  batchInviteCommand,
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
  shareEvidenceDir,
  users: users.map((user) => ({
    id: user.id,
    entryLabel: user.entryLabel,
    collaborationTarget: user.collaborationTarget,
    inviteStatus: user.inviteStatus,
    hasTesterMessage: Boolean(user.testerMessage),
    hasShareCardGuide: Boolean(user.shareCardGuide),
    hasDraftCommand: Boolean(user.draftCommand),
    hasRecordCommand: Boolean(user.recordCommand),
  })),
  nextActions: [
    "Open candidate-dispatch-workbench-YYYY-MM-DD.html and copy each tester message into the private chat for that U id.",
    pendingUsers.length
      ? `After the pending messages or mini program cards are actually sent, run ${batchInviteCommand}.`
      : "All users in this dispatch are already marked sent/experienced; wait for feedback and avoid resending.",
    "After feedback arrives, copy the record draft command for that U id, fill the private draft, then replace the record template with real anonymous feedback.",
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
    `待发送：${pendingUsers.length}/${users.length}`,
    "",
    "今日对象：",
    ...result.users.map((user) => `- ${user.id}: ${user.entryLabel}${user.collaborationTarget ? "（优先跑协作）" : ""} / ${user.inviteStatus}`),
    "",
    pendingUsers.length
      ? "下一步：打开 HTML 工作台，只发送待邀请对象；真实发送后再运行带 --sent-confirmed 的 invite 命令。"
      : "下一步：今天分发单对象都已标记发送；等待真实反馈，避免重复发送。",
    "",
    JSON.stringify(result, null, 2),
  ].join("\n"));
}

if (users.some((user) => !user.testerMessage || !user.draftCommand || !user.recordCommand)) process.exit(1);

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

async function readInviteStatuses(dir) {
  try {
    const content = await readFile(join(dir, "anonymous-users.csv"), "utf8");
    const rows = parseCsv(content);
    const [headers, ...data] = rows;
    const idIndex = headers.indexOf("用户编号");
    const statusIndex = headers.indexOf("邀请状态");
    const statuses = new Map();
    if (idIndex < 0 || statusIndex < 0) return statuses;
    for (const row of data) {
      const id = String(row[idIndex] || "").trim().toUpperCase();
      if (/^U\d{3}$/.test(id)) {
        statuses.set(id, String(row[statusIndex] || "").trim() || "待确认");
      }
    }
    return statuses;
  } catch {
    return new Map();
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

async function findLatestShareEvidenceDir() {
  try {
    const entries = await readdir(privateBaseDir, { withFileTypes: true });
    const latest = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("miniprogram-share-card-preview-"))
      .map((entry) => entry.name)
      .sort()
      .at(-1);
    return latest ? join(privateBaseDir, latest) : null;
  } catch {
    return null;
  }
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
      draftCommand: `npm run release:candidate:record:draft -- --user ${id} --date ${dispatchDateFromMarkdownOrToday()} --entry ${quoteCliValue(entryLabel)}`,
      recordCommand: fences[2] || "",
    });
  }
  return users;
}

function buildWorkbenchHtml({ packetDir, date, checkedAt, markdownPath, jsonPath, shareEvidenceDir, users, pendingUsers, batchInviteCommand }) {
  const alreadySentCount = users.length - pendingUsers.length;
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
    .tag.sent {
      border-color: #a7d8c9;
      color: #0f766e;
      background: #eef8f4;
    }
    .tag.pending {
      border-color: #f1c27d;
      color: #92400e;
      background: #fff7ed;
    }
    .copy-block {
      display: grid;
      gap: 8px;
    }
    .guide-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
      font-size: 14px;
    }
    .guide-list code {
      color: var(--ink);
      overflow-wrap: anywhere;
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
      <div>小程序卡片证据目录：<code>${escapeHtml(shareEvidenceDir || "未找到；需要连调时先运行 npm run release:wechat:share:prepare")}</code></div>
      <div>发送状态：<strong>${escapeHtml(String(alreadySentCount))}</strong> 已发送/已体验，<strong>${escapeHtml(String(pendingUsers.length))}</strong> 待发送</div>
    </section>
    <section class="command-bar" aria-label="批次命令">
      <button data-copy="${escapeAttribute(batchInviteCommand)}">${pendingUsers.length === 0 ? "复制候选进度检查命令" : pendingUsers.length < users.length ? "复制待发送标记命令" : "复制已发送标记命令"}</button>
      <button class="secondary" data-copy="${escapeAttribute(`npm run release:candidate:privacy:check`)}">复制隐私扫描命令</button>
      <button class="secondary" data-copy="${escapeAttribute(`npm run release:candidate:day:close -- --date ${date}`)}">复制今日收尾命令</button>
    </section>
  </header>
  <main>
    <section class="grid" aria-label="今日对象">
      ${summaryCards(users)}
    </section>
    <section class="user-list" aria-label="逐个发送">
      ${users.map((user) => renderUser(user, date)).join("\n")}
    </section>
    <section class="guard" aria-label="护栏">
      <h2>固定护栏</h2>
      <ul>
        <li>这个工作台不会发送微信消息，不记录真实联系人，也不会标记已邀请。</li>
        <li>只给“待邀请/候补/待确认”的 U 编号发送；已邀请或已体验的 U 编号等待反馈，避免重复打扰。</li>
        <li>消息或小程序卡片真实发出后，才运行带 <code>--sent-confirmed</code> 的 invite 命令。</li>
        <li>收到反馈后先生成回填草稿，再替换 <code>yes|no</code>、<code>1-5|没试</code>、问题等级和真实匿名摘要；不要原样运行模板。</li>
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
    const status = user.inviteStatus || "待确认";
    return `<div class="summary-card"><strong>${escapeHtml(id)}</strong><span>${escapeHtml(label)} / ${escapeHtml(suffix)} / ${escapeHtml(status)}</span></div>`;
  }).join("\n");
}

function renderUser(user, date) {
  const markInviteCommand = `npm run release:candidate:invite -- --users ${user.id} --date ${date} --sent-confirmed`;
  const sent = isAlreadySent(user.inviteStatus);
  return `<article class="user-card" id="${escapeAttribute(user.id)}">
  <div class="user-head">
    <h2>${escapeHtml(user.id)}</h2>
    <span class="tag">${escapeHtml(user.entryLabel)}${user.collaborationTarget ? " / 优先跑协作" : ""}</span>
    <span class="tag ${sent ? "sent" : "pending"}">${escapeHtml(user.inviteStatus)}</span>
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
  ${renderShareCardGuide(user.shareCardGuide)}
  <div class="copy-block">
    <div class="copy-head">
      <h3>${sent ? "已发送，等待反馈" : "真实发送后登记"}</h3>
      <button class="secondary" data-copy="${escapeAttribute(markInviteCommand)}">复制本 U 已发送登记命令</button>
    </div>
    <pre>${escapeHtml(markInviteCommand)}</pre>
  </div>
  <div class="copy-block">
    <div class="copy-head">
      <h3>收到反馈后先生成草稿</h3>
      <button class="secondary" data-copy="${escapeAttribute(user.draftCommand)}">复制回填草稿命令</button>
    </div>
    <pre>${escapeHtml(user.draftCommand)}</pre>
  </div>
  <div class="copy-block">
    <div class="copy-head">
      <h3>草稿确认后的回填模板</h3>
      <button class="secondary" data-copy="${escapeAttribute(user.recordCommand)}">复制回填模板</button>
    </div>
    <pre>${escapeHtml(user.recordCommand)}</pre>
  </div>
</article>`;
}

function renderShareCardGuide(guide) {
  if (!guide) return "";
  return `<div class="copy-block">
    <div class="copy-head">
      <h3>小程序卡片发送确认</h3>
      <button class="secondary" data-copy="${escapeAttribute(guide.devtoolsCommand)}">复制 DevTools 连调命令</button>
      <button class="secondary" data-copy="${escapeAttribute(guide.directPreviewPath)}">复制直达二维码路径</button>
    </div>
    <ul class="guide-list">
      <li>真实发送优先从 Humi 小程序内触发「${escapeHtml(guide.actionLabel)}」，进入原生确认页后点「发送给家人」。</li>
      <li>确认页路径模板：<code>${escapeHtml(guide.sharePageTemplate)}</code></li>
      <li>卡片落地参数：<code>${escapeHtml(guide.landingPathTemplate)}</code></li>
      <li>需要小程序卡片连调时运行：<code>${escapeHtml(guide.devtoolsCommand)}</code>，扫码打开 <code>${escapeHtml(guide.directPreviewPath)}</code> 后再点「发送给家人」。</li>
      <li>卡片真实发出后，才运行本 U 的已发送登记命令；工作台不会替你发送或标记。</li>
    </ul>
  </div>`;
}

function buildDispatchUsersById(dispatchJson) {
  const users = Array.isArray(dispatchJson?.users) ? dispatchJson.users : [];
  return new Map(users.map((user) => {
    const id = String(user.id || "").trim().toUpperCase();
    return [id, {
      entryTaskKey: user.entryTask,
      entryLabel: user.entryLabel,
      collaborationTarget: Boolean(user.collaborationTarget),
    }];
  }).filter(([id]) => /^U\d{3}$/.test(id)));
}

function buildShareCardGuide(user, shareEvidenceDir) {
  const key = user.entryTaskKey || inferEntryTaskKey(user.entryLabel);
  const guides = {
    "crave-card": {
      actionLabel: "问问大家",
      sharePageTemplate: "pages/share/index?type=crave&token=<真实征集token>&householdName=<家庭名>",
      landingPathTemplate: "/pages/index/index?crave=<真实征集token>",
      directPreviewFile: "direct-preview/crave-preview-qr.png",
    },
    "invite-card": {
      actionLabel: "邀请家人",
      sharePageTemplate: "pages/share/index?type=invite&token=<真实邀请token>&householdName=<家庭名>&inviterName=<邀请人>",
      landingPathTemplate: "/pages/index/index?invite=<真实邀请token>",
      directPreviewFile: "direct-preview/invite-preview-qr.png",
    },
    "grocery-card": {
      actionLabel: "买菜清单",
      sharePageTemplate: "pages/share/index?type=grocery&token=<真实清单token>&householdName=<家庭名>&initiatorName=<发起人>&itemCount=<清单项数>",
      landingPathTemplate: "/pages/index/index?grocery=<真实清单token>",
      directPreviewFile: "direct-preview/grocery-preview-qr.png",
    },
  };
  const guide = guides[key];
  if (!guide) return null;
  return {
    ...guide,
    devtoolsCommand: "npm run release:wechat:share:direct-previews",
    directPreviewPath: shareEvidenceDir ? join(shareEvidenceDir, guide.directPreviewFile) : guide.directPreviewFile,
  };
}

function inferEntryTaskKey(label) {
  const text = String(label || "");
  if (text.includes("问问大家")) return "crave-card";
  if (text.includes("邀请家人")) return "invite-card";
  if (text.includes("买菜清单小程序卡片")) return "grocery-card";
  return "";
}

function dispatchDateFromMarkdownOrToday() {
  return args.date || new Date().toISOString().slice(0, 10);
}

function quoteCliValue(value) {
  return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function isAlreadySent(status) {
  return ["已邀请", "已体验"].includes(String(status || "").trim());
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

export const CANDIDATE_FORMS_PREVIEW_FILE = "candidate-forms-preview.html";

export function buildCandidateFormsPreviewHtml({
  generatedAt = new Date().toISOString(),
  packetDir = "",
  testerFeedbackForm,
  hostRunSheet,
  importHeader,
  dailyReviewHeader,
}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Humi 1.1 候选内测单据预览</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #171717;
      --muted: #6f6f6f;
      --line: #e7e2dc;
      --paper: #fffdf9;
      --soft: #f6f1e9;
      --accent: #111111;
      --warm: #d86c38;
      --green: #377a5b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--soft);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    main {
      width: min(980px, calc(100% - 28px));
      margin: 0 auto;
      padding: 28px 0 42px;
    }
    .hero {
      padding: 24px 0 18px;
      border-bottom: 1px solid var(--line);
    }
    .eyebrow {
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 34px;
      line-height: 1.08;
      letter-spacing: 0;
    }
    .summary {
      margin: 12px 0 0;
      max-width: 720px;
      color: #4a4a4a;
      font-size: 16px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 18px 0 0;
    }
    .meta span {
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.7);
      color: var(--muted);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin: 18px 0 0;
    }
    section {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      overflow: hidden;
    }
    .sheet-head {
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--line);
      background: #fff8ef;
    }
    .sheet-head.host { background: #eef8f1; }
    .sheet-head.ops { background: #f4f4f4; }
    .sheet-head h2 {
      margin: 0;
      font-size: 21px;
      line-height: 1.18;
      letter-spacing: 0;
    }
    .sheet-head p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }
    .sheet-body {
      padding: 16px 18px 18px;
    }
    .md h1, .md h2, .md h3 {
      margin: 18px 0 8px;
      line-height: 1.22;
      letter-spacing: 0;
    }
    .md h1:first-child, .md h2:first-child, .md h3:first-child { margin-top: 0; }
    .md h1 { font-size: 22px; }
    .md h2 { font-size: 17px; }
    .md h3 { font-size: 15px; }
    .md p, .md li {
      font-size: 14px;
      overflow-wrap: anywhere;
    }
    .md p { margin: 8px 0; }
    .md ul, .md ol {
      margin: 8px 0 12px;
      padding-left: 22px;
    }
    .md pre {
      margin: 10px 0 14px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfaf7;
      color: #2d2d2d;
      font-size: 13px;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .md code {
      padding: 1px 5px;
      border-radius: 5px;
      background: #f1eee8;
      color: #313131;
      font-size: 0.95em;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 14px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #111;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
    }
    .pill.alt { background: var(--warm); }
    .pill.ok { background: var(--green); }
    .wide { grid-column: 1 / -1; }
    .ops-list {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .metric strong {
      display: block;
      margin-bottom: 4px;
      font-size: 20px;
    }
    .metric span {
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 760px) {
      main { width: min(100% - 20px, 520px); padding-top: 18px; }
      h1 { font-size: 28px; }
      .meta, .grid, .ops-list { grid-template-columns: 1fr; }
      .sheet-body, .sheet-head { padding-left: 14px; padding-right: 14px; }
    }
    @media print {
      body { background: #fff; }
      main { width: 100%; padding: 0; }
      section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main data-preview-kind="humi-candidate-forms">
    <div class="hero">
      <p class="eyebrow">Humi Candidate Validation</p>
      <h1>Humi 1.1 候选内测单据预览</h1>
      <p class="summary">这份 HTML 用来确认体验者反馈单、主厨记录单、批量导入字段和每日复盘规则的可读性。真实姓名、手机号、微信号、截图和录屏继续留在仓库外。</p>
      <div class="meta">
        <span>生成时间：${escapeHtml(generatedAt)}</span>
        <span>私有包：${escapeHtml(packetDir || "未指定")}</span>
        <span>状态：生产候选内测，不进入微信审核</span>
      </div>
    </div>

    <div class="grid">
      <section data-form="tester">
        <div class="sheet-head">
          <h2>体验者反馈单</h2>
          <p>给真实体验者看的轻量问题，只问今晚、清单、协作和卡点。</p>
        </div>
        <div class="sheet-body md">
          <div class="pill-row">
            <span class="pill">5 分钟</span>
            <span class="pill alt">匿名 U 编号</span>
            <span class="pill ok">不写隐私</span>
          </div>
          ${renderMarkdown(testerFeedbackForm)}
        </div>
      </section>

      <section data-form="host">
        <div class="sheet-head host">
          <h2>主厨记录单</h2>
          <p>给执行人使用，把真实观察转成匿名 CSV 字段和问题分级。</p>
        </div>
        <div class="sheet-body md">
          <div class="pill-row">
            <span class="pill">今晚菜单</span>
            <span class="pill alt">买菜清单</span>
            <span class="pill ok">分享协作</span>
          </div>
          ${renderMarkdown(hostRunSheet)}
        </div>
      </section>

      <section class="wide" data-form="ops">
        <div class="sheet-head ops">
          <h2>回填与每日复盘</h2>
          <p>私有执行包里的 CSV 字段必须保持稳定，避免真实反馈回填时漏字段。</p>
        </div>
        <div class="sheet-body">
          <div class="ops-list">
            <div class="metric"><strong>10</strong><span>真实体验样本</span></div>
            <div class="metric"><strong>8</strong><span>完成【今晚】菜单</span></div>
            <div class="metric"><strong>8</strong><span>完成清单</span></div>
            <div class="metric"><strong>3</strong><span>尝试协作路径</span></div>
          </div>
          <div class="md">
            <h3>批量导入字段</h3>
            <pre>${escapeHtml(importHeader || "")}</pre>
            <h3>每日复盘字段</h3>
            <pre>${escapeHtml(dailyReviewHeader || "")}</pre>
            <p>回填前运行 <code>npm run release:candidate:privacy:check</code>；候选复盘达标且用户动作当下确认前，不进入微信公众平台审核。</p>
          </div>
        </div>
      </section>
    </div>
  </main>
</body>
</html>
`;
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^-\s+(.+)$/);
    if (bullet) {
      openList("ul");
      html.push(`<li>${formatInline(bullet[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${formatInline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  }

  if (inCode) html.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`);
  closeList();
  return html.join("\n");

  function openList(type) {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  }

  function closeList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }
}

function formatInline(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

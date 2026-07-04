import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const OUT_DIR_NAME = `crave-template-visuals-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}`;
const evidenceDir = process.env.HUMI_CRAVE_TEMPLATE_EVIDENCE_DIR
  || join(process.env.HUMI_PRIVATE_EVIDENCE_DIR || DEFAULT_PRIVATE_DIR, OUT_DIR_NAME);

const rootDir = process.cwd();
const entryPath = join(evidenceDir, "crave-template-visual-entry.jsx");
const states = [
  { key: "starter", title: "主厨发起" },
  { key: "collecting-empty", title: "主厨等待" },
  { key: "vote", title: "家人投票" },
  { key: "submitted", title: "投票完成" },
  { key: "closed", title: "征集结束" },
];

await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
await writeFile(entryPath, buildEntrySource(rootDir), { mode: 0o600 });

const vite = await createViteServer({
  root: rootDir,
  logLevel: "error",
  appType: "custom",
  server: {
    middlewareMode: true,
    host: "127.0.0.1",
    fs: { allow: [rootDir, evidenceDir] },
  },
});

const server = createHttpServer((req, res) => {
  if (req.url?.split("?")[0] === "/__humi_crave_template_visuals") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end([
      "<!doctype html>",
      "<html>",
      "<head>",
      "<meta charset=\"UTF-8\" />",
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "<title>Humi Crave Template Visual Evidence</title>",
      "</head>",
      "<body>",
      [
        "<script type=\"module\">",
        "import RefreshRuntime from '/@react-refresh';",
        "RefreshRuntime.injectIntoGlobalHook(window);",
        "window.$RefreshReg$ = () => {};",
        "window.$RefreshSig$ = () => (type) => type;",
        "window.__vite_plugin_react_preamble_installed__ = true;",
        "</script>",
      ].join(""),
      `<script type="module" src="/@fs/${entryPath}"></script>`,
      "</body>",
      "</html>",
    ].join(""));
    return;
  }
  vite.middlewares(req, res);
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

const address = server.address();
const port = typeof address === "object" && address ? address.port : 5173;
const url = `http://127.0.0.1:${port}/__humi_crave_template_visuals`;

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: "networkidle" });
  try {
    await page.waitForSelector("[data-crave-state='closed']", { timeout: 30_000 });
  } catch (error) {
    const content = await page.locator("body").innerText().catch(() => "");
    throw new Error([
      error.message,
      pageErrors.length ? `Page errors: ${pageErrors.join(" | ")}` : "",
      content ? `Page body: ${content.slice(0, 1000)}` : "",
    ].filter(Boolean).join("\n"));
  }

  const screenshots = [];
  for (const state of states) {
    const path = join(evidenceDir, `${state.key}.png`);
    await page.locator(`[data-crave-state="${state.key}"]`).screenshot({ path });
    screenshots.push(await inspectScreenshot({ ...state, path }));
  }

  const manifest = {
    ok: screenshots.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    evidenceDir,
    viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    source: "src/components/CraveSheet.jsx",
    screenshots,
    nextActions: [
      "Open the PNG files in this private evidence directory and visually confirm the five crave sheet states.",
      "Run npm run validate:crave-template to keep the static copy/template gate green.",
    ],
  };

  await writeFile(join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(evidenceDir, "README.md"), buildReadme(manifest), { mode: 0o600 });

  console.log(JSON.stringify(manifest, null, 2));
  if (!manifest.ok) process.exit(1);
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
  await vite.close();
}

function buildEntrySource(rootDir) {
  const componentPath = resolve(rootDir, "src/components/CraveSheet.jsx");
  const stylesPath = resolve(rootDir, "src/styles.css");
  return `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "/@fs/${stylesPath}";
import {
  CraveClosedSheet,
  CraveCollectingSheet,
  CraveStarterSheet,
  CraveSubmittedSheet,
  CraveVoteSheet,
} from "/@fs/${componentPath}";

const request = {
  id: "crave-template-preview",
  householdName: "Humi 家",
  initiatorName: "主厨",
  createdAt: new Date().toISOString(),
  deadlineAt: new Date(Date.now() + 18 * 60 * 1000).toISOString(),
  votes: [
    { id: "v1", memberName: "妈妈", feelingTag: "想喝汤", note: "清淡一点" },
    { id: "v2", memberName: "小朋友", feelingTag: "快一点", note: "想吃番茄鸡蛋" },
  ],
  resultSummary: {
    dishes: [
      { id: "tomato-egg", name: "西红柿炒鸡蛋", timeMinutes: 15 },
      { id: "seaweed-egg-soup", name: "紫菜蛋花汤", timeMinutes: 10 },
    ],
  },
};

function VisualHarness() {
  const [feeling, setFeeling] = useState("想喝汤");
  const [name, setName] = useState("家人");
  const [note, setNote] = useState("今晚想吃清淡点");
  return (
    <main className="min-h-screen bg-white px-4 py-5 text-ink">
      <div className="mx-auto grid max-w-[390px] gap-5">
        <PreviewState state="starter" title="主厨发起">
          <CraveStarterSheet
            selectedFeeling={feeling}
            onSelectFeeling={setFeeling}
            onStart={() => {}}
            onDecideAlone={() => {}}
          />
        </PreviewState>
        <PreviewState state="collecting-empty" title="主厨等待">
          <CraveCollectingSheet
            request={{ ...request, votes: [] }}
            onCopyCraveLink={() => {}}
            onRefreshCraveRequest={() => {}}
            onGenerateFromCrave={() => {}}
          />
        </PreviewState>
        <PreviewState state="vote" title="家人投票">
          <CraveVoteSheet
            request={request}
            selectedFeeling={feeling}
            onSelectFeeling={setFeeling}
            memberName={name}
            onMemberNameChange={(event) => setName(event.target.value)}
            note={note}
            onNoteChange={(event) => setNote(event.target.value)}
            status="点完就可以关掉，不用登录。"
            onSubmit={(event) => event.preventDefault()}
          />
        </PreviewState>
        <PreviewState state="submitted" title="投票完成">
          <CraveSubmittedSheet
            request={request}
            status="你的感觉已经交给主厨。"
            onJoinHousehold={() => {}}
            onClose={() => {}}
          />
        </PreviewState>
        <PreviewState state="closed" title="征集结束">
          <CraveClosedSheet
            request={request}
            status="今晚菜单已经同步。"
            onClose={() => {}}
          />
        </PreviewState>
      </div>
    </main>
  );
}

function PreviewState({ state, title, children }) {
  return (
    <section data-crave-state={state} className="rounded-[28px] bg-white p-3">
      <p className="mb-2 px-1 text-xs font-black text-ink/38">{title}</p>
      {children}
    </section>
  );
}

createRoot(document.getElementById("root") || document.body.appendChild(document.createElement("div"))).render(<VisualHarness />);
`;
}

async function inspectScreenshot(item) {
  const [fileStat, bytes] = await Promise.all([
    stat(item.path),
    readFile(item.path),
  ]);
  const png = inspectPng(bytes);
  const ok = fileStat.isFile() && fileStat.size >= 20_000 && png.ok && png.width >= 320 && png.height >= 240;
  return {
    key: item.key,
    title: item.title,
    path: item.path,
    ok,
    size: fileStat.size,
    image: png,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function inspectPng(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    return { ok: false, format: "unknown", width: 0, height: 0 };
  }
  let width = 0;
  let height = 0;
  let hasIhdr = false;
  let hasIend = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > bytes.length) break;
    if (type === "IHDR" && length >= 13) {
      width = bytes.readUInt32BE(dataOffset);
      height = bytes.readUInt32BE(dataOffset + 4);
      hasIhdr = true;
    }
    if (type === "IEND") {
      hasIend = true;
      break;
    }
    offset = nextOffset;
  }
  return {
    ok: hasIhdr && hasIend,
    format: "png",
    width,
    height,
    complete: hasIend,
  };
}

function buildReadme(manifest) {
  const rows = manifest.screenshots
    .map((item) => `| ${item.ok ? "OK" : "FAIL"} | ${item.title} | \`${item.path}\` | ${item.image.width}x${item.image.height} | ${item.size} | \`${item.sha256}\` |`)
    .join("\n");
  return [
    "# Humi 1.1 今晚征集单视觉证据",
    "",
    `生成时间：${manifest.checkedAt}`,
    `来源组件：\`${manifest.source}\``,
    "",
    "| 状态 | 标题 | 文件 | 尺寸 | 字节 | SHA256 |",
    "| --- | --- | --- | --- | ---: | --- |",
    rows,
    "",
    "这些截图保存在本机私有证据目录，不进入仓库。",
    "",
  ].join("\n");
}

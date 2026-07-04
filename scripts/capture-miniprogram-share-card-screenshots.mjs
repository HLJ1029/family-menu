import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";
const CARD_FILES = [
  {
    key: "crave",
    file: "crave-card.png",
    description: "crave 小程序分享卡片预览截图",
    trigger: [
      "进入【我的家】或【今晚】里的“问问大家/今晚征集单”。",
      "选择一个感觉并生成征集单卡片。",
      "点击页面分享动作，或点右上角菜单转发。",
      "确认预览标题包含“今晚征集口味，点一下就行”，path 带 ?crave= token。",
    ],
  },
  {
    key: "invite",
    file: "invite-card.png",
    description: "invite 小程序分享卡片预览截图",
    trigger: [
      "进入【我的家】。",
      "点击邀请家人的分享动作，生成邀请卡片。",
      "点击页面分享动作，或点右上角菜单转发。",
      "确认预览标题是“某某邀请你加入某个家”的语义，path 带 ?invite= token。",
    ],
  },
  {
    key: "grocery",
    file: "grocery-card.png",
    description: "grocery 小程序分享卡片预览截图",
    trigger: [
      "进入【清单】，确保今晚菜单已有待买食材。",
      "点击清单页的买菜分享动作。",
      "点击页面分享动作，或点右上角菜单转发。",
      "确认预览标题是“某某发来买菜清单/若干项买菜清单”的语义，path 带 ?grocery= token。",
    ],
  },
];

const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const previewQr = join(evidenceDir, "preview-qr.png");
const checklist = join(evidenceDir, "share-card-qa-checklist.md");
const dryRun = process.env.HUMI_SHARE_CARD_CAPTURE_DRY_RUN === "1" || process.argv.includes("--dry-run");
const captureMode = resolveCaptureMode();
const shouldOpenHelpers = !dryRun && process.env.HUMI_SHARE_CARD_CAPTURE_NO_OPEN !== "1";

const missingCards = [];
for (const item of CARD_FILES) {
  const path = join(evidenceDir, item.file);
  const ok = await fileExists(path);
  if (!ok) missingCards.push({ ...item, path });
}

if (shouldOpenHelpers) {
  await openPath(evidenceDir);
  await openPath(previewQr);
  await openPath(checklist);
}

if (!missingCards.length) {
  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    evidenceDir,
    message: "All share card screenshots are already present.",
  }, null, 2));
  process.exit(0);
}

const intro = [
  "Humi 1.1 小程序原生分享卡片截图辅助",
  "",
  `私有证据目录：${evidenceDir}`,
  `预览二维码：${previewQr}`,
  `截图模式：${captureMode}`,
  "",
  "当前只处理缺失的 card 图：",
  ...missingCards.map((item) => `- ${item.file}：${item.description}`),
  "",
  "每张 card 的触发步骤：",
  ...missingCards.flatMap((item) => [
    `- ${item.file}`,
    ...item.trigger.map((step, index) => `  ${index + 1}. ${step}`),
  ]),
  "",
  "每一步请先在微信开发者工具或真机里让对应分享卡片预览停在屏幕上，再回到终端按回车。",
  captureMode === "interactive"
    ? "脚本会启动 macOS 框选截图，请只框选分享卡片区域；截图保存在私有目录，不进仓库。"
    : "脚本会保存整屏 PNG 到正确文件名；截图保存在私有目录，不进仓库。可加 --interactive 改为框选卡片区域。",
].join("\n");

console.log(intro);

if (dryRun) {
  console.log(JSON.stringify({
    ok: false,
    dryRun: true,
    evidenceDir,
    missingFiles: missingCards.map((item) => item.file),
  }, null, 2));
  process.exit(0);
}

const rl = createInterface({ input, output });
const captures = [];

try {
  for (const item of missingCards) {
    console.log("");
    console.log(`准备截图：${item.file}`);
    for (const [index, step] of item.trigger.entries()) {
      console.log(`${index + 1}. ${step}`);
    }
    const answer = await rl.question("卡片预览已经停在屏幕上后，按回车截图；输入 skip 跳过：");
    if (answer.toLowerCase() === "skip") {
      captures.push({ ...item, ok: false, skipped: true });
      continue;
    }
    await captureScreenshot(item.path);
    captures.push(await inspectFile(item));
  }
} finally {
  rl.close();
}

const failed = captures.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  evidenceDir,
  captures,
  nextActions: failed.length
    ? ["Rerun this command for skipped or failed card screenshots."]
    : ["Run npm run release:wechat:share:evidence to verify all card and landing screenshots."],
}, null, 2));

if (failed.length) process.exit(1);

function resolveCaptureMode() {
  if (process.argv.includes("--interactive")) return "interactive";
  if (process.argv.includes("--fullscreen")) return "fullscreen";
  const mode = process.env.HUMI_SHARE_CARD_CAPTURE_MODE?.trim().toLowerCase();
  if (mode === "interactive" || mode === "fullscreen") return mode;
  return "fullscreen";
}

async function captureScreenshot(path) {
  if (captureMode === "interactive") {
    await execFileAsync("screencapture", ["-i", "-x", path], { timeout: 120_000 });
    return;
  }
  await execFileAsync("screencapture", ["-x", path], { timeout: 20_000 });
}

async function findLatestEvidenceDir() {
  const baseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || DEFAULT_PRIVATE_DIR;
  const entries = await readdir(baseDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(EVIDENCE_PREFIX))
    .map((entry) => entry.name)
    .sort();
  const latest = candidates[candidates.length - 1];
  if (!latest) {
    throw new Error(`No ${EVIDENCE_PREFIX}* directory found under ${baseDir}.`);
  }
  return join(baseDir, latest);
}

async function fileExists(path) {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function inspectFile(item) {
  const bytes = await readFile(item.path);
  const fileStat = await stat(item.path);
  const png = inspectPng(bytes);
  const ok = fileStat.isFile() && fileStat.size >= 8_000 && png.ok && png.width >= 240 && png.height >= 160;
  return {
    key: item.key,
    file: item.file,
    path: item.path,
    ok,
    size: fileStat.size,
    image: png,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    error: ok ? undefined : `${basename(item.path)} was captured but does not look like a valid card screenshot.`,
  };
}

function inspectPng(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    return { ok: false, format: "unknown", width: 0, height: 0 };
  }
  return {
    ok: true,
    format: "png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

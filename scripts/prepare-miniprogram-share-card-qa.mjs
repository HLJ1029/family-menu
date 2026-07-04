import { execFile } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";
const REQUIRED_SCREENSHOTS = [
  ["crave-card.png", "crave 小程序分享卡片预览截图"],
  ["crave-landing.png", "crave token 打开后的免登录投票落地页截图"],
  ["invite-card.png", "invite 小程序分享卡片预览截图"],
  ["invite-landing.png", "invite token 打开后的加入家庭落地页截图"],
  ["grocery-card.png", "grocery 小程序分享卡片预览截图"],
  ["grocery-landing.png", "grocery token 打开后的免登录认领落地页截图"],
];
const CARD_SCREENSHOTS = REQUIRED_SCREENSHOTS.filter(([file]) => file.endsWith("-card.png"));

const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const previewQr = join(evidenceDir, "preview-qr.png");
const shareExpectations = await loadShareExpectations();
const screenshotRows = await evidenceStatusRows(evidenceDir);
const expectedJson = join(evidenceDir, "share-card-expected.json");
const checklistPath = join(evidenceDir, "share-card-qa-checklist.md");

await writeFile(expectedJson, JSON.stringify(shareExpectations, null, 2));
await writeFile(checklistPath, buildChecklist({ evidenceDir, previewQr, shareExpectations, screenshotRows }));

if (process.env.HUMI_SHARE_QA_NO_OPEN !== "1") {
  await openPath(evidenceDir);
  await openPath(previewQr);
  await openPath(checklistPath);
}

const lines = [
  "Humi 1.1 小程序分享卡片复核准备好了",
  "",
  `私有证据目录：${evidenceDir}`,
  `预览二维码：${previewQr}`,
  `核对清单：${checklistPath}`,
  `预期数据：${expectedJson}`,
  "",
  "当前流程：",
  "1. H5 landing 图可用 npm run release:wechat:share:landings 自动生成。",
  "2. 微信原生 card 图需要开发者工具或真机实际调出，可用 npm run release:wechat:share:cards:capture 辅助保存，或用 npm run release:wechat:share:cards:import 导入已有截图。",
  "3. 截图齐全后运行 evidence 和 complete 完成 P1 收口。",
  "",
  "原生 card 截图文件名：",
  ...CARD_SCREENSHOTS.map(([file, description], index) => `${index + 1}. ${file}：${description}`),
  "",
  "补齐后运行：",
  "npm run release:wechat:share:evidence",
  "npm run release:wechat:share:complete",
  "npm run release:closure",
  "",
  "关联文档：docs/humi-1.1-miniprogram-share-card-qa.md",
].join("\n");

console.log(lines);

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

async function evidenceStatusRows(evidenceDir) {
  return Promise.all(REQUIRED_SCREENSHOTS.map(async ([file, description]) => {
    try {
      const fileStat = await stat(join(evidenceDir, file));
      return `| ${fileStat.isFile() && fileStat.size > 0 ? "[x]" : "[ ]"} | \`${file}\` | ${description} | ${fileStat.size} bytes |`;
    } catch {
      return `| [ ] | \`${file}\` | ${description} | missing |`;
    }
  }));
}

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

async function loadShareExpectations() {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/check-miniprogram-share-cards.mjs"], {
    timeout: 20_000,
  });
  return JSON.parse(stdout);
}

function buildChecklist({ evidenceDir, previewQr, shareExpectations, screenshotRows }) {
  const expectedRows = shareExpectations.results
    .map((item) => `| ${item.name} | ${item.title} | \`${item.path}\` | \`${item.launchUrl}\` |`)
    .join("\n");
  return [
    "# Humi 1.1 小程序分享卡片 QA 清单",
    "",
    `生成时间：${new Date().toISOString()}`,
    `私有证据目录：\`${evidenceDir}\``,
    `预览二维码：\`${previewQr}\``,
    "",
    "## 预期分享数据",
    "",
    "| 类型 | 标题 | 小程序 path | H5 落地 URL |",
    "| --- | --- | --- | --- |",
    expectedRows,
    "",
    "## 截图清单",
    "",
    "| 完成 | 文件名 | 内容 | 当前状态 |",
    "| --- | --- | --- | --- |",
    screenshotRows.join("\n"),
    "",
    "## 视觉通过标准",
    "",
    "- 分享卡片标题与上表一致，且卡片打开后带对应 token。",
    "- 落地页不被登录墙挡住，能免登录参与 crave/grocery，invite 能进入加入家庭流程。",
    "- 截图保存为 PNG，文件名必须与截图清单完全一致。",
    "- H5 landing 图可用 `npm run release:wechat:share:landings` 自动补齐。",
    "- 微信原生 card 图用 `npm run release:wechat:share:cards:capture` 辅助保存。",
    "- 已有截图可用 `npm run release:wechat:share:cards:import -- --source-dir /path/to/screenshots` 导入。",
    "- 补齐后运行 `npm run release:wechat:share:evidence`，确认每张图输出 size、尺寸和 SHA256。",
    "- 人工视觉确认三张原生 card 后，运行 `npm run release:wechat:share:complete` 勾选提审前 P1。",
    "- 最后运行 `npm run release:closure` 确认是否进入微信审核准备。",
    "",
  ].join("\n");
}

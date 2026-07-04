import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";

const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const previewQr = join(evidenceDir, "preview-qr.png");

await openPath(evidenceDir);
await openPath(previewQr);

const lines = [
  "Humi 1.1 小程序分享卡片复核准备好了",
  "",
  `私有证据目录：${evidenceDir}`,
  `预览二维码：${previewQr}`,
  "",
  "请用微信开发者工具或真机补齐下面 6 张截图，保存到私有证据目录：",
  "1. crave-card.png：crave 小程序分享卡片预览截图",
  "2. crave-landing.png：crave token 打开后的免登录投票落地页截图",
  "3. invite-card.png：invite 小程序分享卡片预览截图",
  "4. invite-landing.png：invite token 打开后的加入家庭落地页截图",
  "5. grocery-card.png：grocery 小程序分享卡片预览截图",
  "6. grocery-landing.png：grocery token 打开后的免登录认领落地页截图",
  "",
  "补齐后运行：",
  "npm run release:wechat:share:evidence",
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

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

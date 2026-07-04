import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";

const requiredFiles = [
  {
    key: "crave-card",
    file: "crave-card.png",
    description: "crave 小程序分享卡片预览截图",
  },
  {
    key: "crave-landing",
    file: "crave-landing.png",
    description: "crave token 打开后的免登录投票落地页截图",
  },
  {
    key: "invite-card",
    file: "invite-card.png",
    description: "invite 小程序分享卡片预览截图",
  },
  {
    key: "invite-landing",
    file: "invite-landing.png",
    description: "invite token 打开后的加入家庭落地页截图",
  },
  {
    key: "grocery-card",
    file: "grocery-card.png",
    description: "grocery 小程序分享卡片预览截图",
  },
  {
    key: "grocery-landing",
    file: "grocery-landing.png",
    description: "grocery token 打开后的免登录认领落地页截图",
  },
];

const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const files = await Promise.all(requiredFiles.map((item) => inspectEvidenceFile(evidenceDir, item)));
const missing = files.filter((item) => !item.ok);

const result = {
  ok: missing.length === 0,
  checkedAt: new Date().toISOString(),
  evidenceDir,
  requiredFiles: files,
  nextActions: missing.length
    ? [
      `Open the preview QR in ${evidenceDir}/preview-qr.png with WeChat or WeChat DevTools.`,
      "Trigger and screenshot crave, invite, and grocery share cards.",
      "Save screenshots using the exact required filenames, then rerun npm run release:wechat:share:evidence.",
    ]
    : [
      "All mini program share card evidence files are present.",
      "Mark the P1 item in docs/humi-1.1-pre-review-hardening.md as complete if the screenshots visually match the expected card and landing behavior.",
    ],
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

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

async function inspectEvidenceFile(evidenceDir, item) {
  const path = join(evidenceDir, item.file);
  try {
    const [fileStat, bytes] = await Promise.all([
      stat(path),
      readFile(path),
    ]);
    return {
      ...item,
      path,
      ok: fileStat.isFile() && fileStat.size > 0,
      size: fileStat.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    return {
      ...item,
      path,
      ok: false,
      error: `${basename(path)} missing or unreadable: ${error.message}`,
    };
  }
}

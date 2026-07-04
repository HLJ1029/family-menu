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
    minWidth: 240,
    minHeight: 160,
    minBytes: 8_000,
  },
  {
    key: "crave-landing",
    file: "crave-landing.png",
    description: "crave token 打开后的免登录投票落地页截图",
    minWidth: 320,
    minHeight: 568,
    minBytes: 16_000,
  },
  {
    key: "invite-card",
    file: "invite-card.png",
    description: "invite 小程序分享卡片预览截图",
    minWidth: 240,
    minHeight: 160,
    minBytes: 8_000,
  },
  {
    key: "invite-landing",
    file: "invite-landing.png",
    description: "invite token 打开后的加入家庭落地页截图",
    minWidth: 320,
    minHeight: 568,
    minBytes: 16_000,
  },
  {
    key: "grocery-card",
    file: "grocery-card.png",
    description: "grocery 小程序分享卡片预览截图",
    minWidth: 240,
    minHeight: 160,
    minBytes: 8_000,
  },
  {
    key: "grocery-landing",
    file: "grocery-landing.png",
    description: "grocery token 打开后的免登录认领落地页截图",
    minWidth: 320,
    minHeight: 568,
    minBytes: 16_000,
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
  missingFiles: missing.map((item) => item.file),
  nextActions: missing.length
    ? [
      `Missing evidence files: ${missing.map((item) => item.file).join(", ")}.`,
      `Open the preview QR in ${evidenceDir}/preview-qr.png with WeChat or WeChat DevTools.`,
      "Trigger and screenshot only the missing share cards or landing pages listed above.",
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
    const png = inspectPng(bytes);
    const ok = fileStat.isFile()
      && fileStat.size > 0
      && fileStat.size >= item.minBytes
      && png.ok
      && png.width >= item.minWidth
      && png.height >= item.minHeight;
    return {
      ...item,
      path,
      ok,
      size: fileStat.size,
      image: png,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      error: ok
        ? undefined
        : buildImageError(item, fileStat, png),
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

function buildImageError(item, fileStat, png) {
  if (!fileStat.isFile() || fileStat.size <= 0) return `${item.file} is empty or not a file.`;
  if (fileStat.size < item.minBytes) return `${item.file} is too small: ${fileStat.size} bytes, expected at least ${item.minBytes} bytes.`;
  if (!png.ok) return `${item.file} is not a complete PNG screenshot.`;
  return `${item.file} is too small: ${png.width}x${png.height}, expected at least ${item.minWidth}x${item.minHeight}.`;
}

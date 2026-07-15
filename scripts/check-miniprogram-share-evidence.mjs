import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    visualMarkers: ["征集口味", "今晚征集", "想吃"],
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
    visualMarkers: ["邀请你加入", "邀请", "加入"],
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
    visualMarkers: ["买菜清单", "买菜", "清单"],
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
const inspectedFiles = await Promise.all(requiredFiles.map((item) => inspectEvidenceFile(evidenceDir, item)));
const cardOcr = await recognizeCardScreenshots(inspectedFiles.filter((item) => item.key.endsWith("-card") && item.ok));
const files = inspectedFiles.map((item) => applyVisualEvidenceCheck(item, cardOcr.get(item.path)));
const missing = files.filter((item) => !item.ok);
const missingCards = missing.filter((item) => item.key.endsWith("-card"));
const missingLandings = missing.filter((item) => item.key.endsWith("-landing"));

const result = {
  ok: missing.length === 0,
  checkedAt: new Date().toISOString(),
  evidenceDir,
  requiredFiles: files,
  missingFiles: missing.map((item) => item.file),
  nextActions: missing.length
    ? buildNextActions({ evidenceDir, missing, missingCards, missingLandings })
    : [
      "All mini program share card evidence files are present and contain the expected native send-dialog text.",
      "The three card screenshots show the DevTools virtual recipient, send action, and their crave/invite/grocery semantics.",
    ],
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

function buildNextActions({ evidenceDir, missing, missingCards, missingLandings }) {
  const actions = [
    `Missing or invalid evidence files: ${missing.map((item) => item.file).join(", ")}.`,
  ];
  if (missingLandings.length) {
    actions.push("Run npm run release:wechat:share:landings to regenerate missing H5 landing screenshots.");
  }
  if (missingCards.length) {
    actions.push("Run npm run release:wechat:share:doctor to verify WeChat DevTools CLI, evidence directory, desktop activity, and missing files.");
    actions.push("Run npm run release:wechat:share:devtools to open WeChat DevTools, the preview QR, and the QA checklist.");
    actions.push("Run npm run release:wechat:share:direct-previews to generate direct QR codes for the native pages/share/index confirmation page.");
    actions.push(`Open the preview QR in ${evidenceDir}/preview-qr.png with WeChat or WeChat DevTools if you prefer scanning manually.`);
    actions.push("Run npm run release:wechat:share:cards:capture -- --interactive to capture the missing native mini program share card screenshots with exact filenames.");
    actions.push("Or run npm run release:wechat:share:cards:import -- --source-dir /path/to/card-screenshots if the card screenshots already exist.");
  }
  actions.push("Rerun npm run release:wechat:share:evidence after adding the missing files.");
  return actions;
}

async function recognizeCardScreenshots(cardFiles) {
  if (cardFiles.length === 0) return new Map();
  if (process.platform !== "darwin") {
    return new Map(cardFiles.map((item) => [item.path, { ok: false, error: "Native screenshot OCR requires macOS Vision." }]));
  }
  const helper = resolve("scripts/recognize-screenshot-text.swift");
  try {
    const { stdout } = await execFileAsync("swift", [helper, ...cardFiles.map((item) => item.path)], {
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const records = JSON.parse(stdout);
    return new Map(records.map((record) => [record.path, {
      ok: !record.error && Boolean(record.text),
      text: record.text || "",
      error: record.error || undefined,
    }]));
  } catch (error) {
    return new Map(cardFiles.map((item) => [item.path, { ok: false, text: "", error: error.message }]));
  }
}

function applyVisualEvidenceCheck(item, ocr) {
  if (!item.key.endsWith("-card")) return item;
  const text = ocr?.text || "";
  const marker = item.visualMarkers?.find((candidate) => text.includes(candidate));
  const hasVirtualRecipient = text.includes("虚拟好友");
  const hasSendAction = text.includes("发送");
  const visualOk = Boolean(ocr?.ok && marker && hasVirtualRecipient && hasSendAction);
  return {
    ...item,
    ok: item.ok && visualOk,
    visual: {
      ok: visualOk,
      matchedSemanticMarker: marker,
      hasVirtualRecipient,
      hasSendAction,
      recognizedText: text,
      error: ocr?.error,
    },
    error: item.ok && !visualOk
      ? `${item.file} does not show a DevTools native send dialog with the expected ${item.key.replace("-card", "")} semantics.`
      : item.error,
  };
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

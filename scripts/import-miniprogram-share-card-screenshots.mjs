import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";
const CARD_FILES = [
  {
    key: "crave",
    file: "crave-card.png",
    description: "crave 小程序分享卡片预览截图",
    env: "HUMI_CRAVE_CARD_SCREENSHOT",
    aliases: ["crave-card", "crave", "征集", "口味"],
  },
  {
    key: "invite",
    file: "invite-card.png",
    description: "invite 小程序分享卡片预览截图",
    env: "HUMI_INVITE_CARD_SCREENSHOT",
    aliases: ["invite-card", "invite", "邀请"],
  },
  {
    key: "grocery",
    file: "grocery-card.png",
    description: "grocery 小程序分享卡片预览截图",
    env: "HUMI_GROCERY_CARD_SCREENSHOT",
    aliases: ["grocery-card", "grocery", "清单", "买菜"],
  },
  {
    key: "wish",
    file: "wish-card.png",
    description: "wish 小程序分享卡片预览截图",
    env: "HUMI_WISH_CARD_SCREENSHOT",
    aliases: ["wish-card", "wish", "想吃"],
  },
  {
    key: "menu",
    file: "menu-card.png",
    description: "menu 小程序分享卡片预览截图",
    env: "HUMI_MENU_CARD_SCREENSHOT",
    aliases: ["menu-card", "menu", "菜单"],
  },
];

const args = parseArgs(process.argv.slice(2));
const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || args.evidenceDir || await findLatestEvidenceDir();
const sourceDir = process.env.HUMI_SHARE_CARD_SOURCE_DIR || args.sourceDir;
const dryRun = process.env.HUMI_SHARE_CARD_IMPORT_DRY_RUN === "1" || args.dryRun;

if (!sourceDir && !CARD_FILES.some((item) => process.env[item.env] || args[item.key])) {
  console.error([
    "Missing source screenshots.",
    "",
    "Use one of:",
    "  npm run release:wechat:share:cards:import -- --source-dir /path/to/screenshots",
    "  HUMI_SHARE_CARD_SOURCE_DIR=/path/to/screenshots npm run release:wechat:share:cards:import",
    "  HUMI_CRAVE_CARD_SCREENSHOT=/path/crave.png HUMI_INVITE_CARD_SCREENSHOT=/path/invite.png HUMI_GROCERY_CARD_SCREENSHOT=/path/grocery.png HUMI_WISH_CARD_SCREENSHOT=/path/wish.png HUMI_MENU_CARD_SCREENSHOT=/path/menu.png npm run release:wechat:share:cards:import",
  ].join("\n"));
  process.exit(1);
}

await mkdir(evidenceDir, { recursive: true });

const imports = [];
for (const item of CARD_FILES) {
  const explicit = process.env[item.env] || args[item.key];
  const source = explicit ? resolve(explicit) : await findSourceInDir(sourceDir, item);
  if (!source) {
    imports.push({
      key: item.key,
      file: item.file,
      ok: false,
      error: `No source screenshot found for ${item.file}.`,
    });
    continue;
  }

  const inspection = await inspectSource(source, item);
  const target = join(evidenceDir, item.file);
  if (inspection.ok && !dryRun) {
    await copyFile(source, target);
  }
  imports.push({
    ...inspection,
    target,
    copied: inspection.ok && !dryRun,
  });
}

const failed = imports.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  dryRun,
  checkedAt: new Date().toISOString(),
  evidenceDir,
  imports,
  nextActions: failed.length
    ? [
      "Fix failed source screenshots and rerun this import command.",
      "Expected complete PNG screenshots, at least 240x160 and 8 KB.",
    ]
    : [
      "Run npm run release:wechat:share:evidence to verify all card and landing screenshots.",
      "Run npm run release:wechat:share:complete after visual confirmation.",
      "Run npm run release:closure to see whether the release can advance to WeChat review preparation.",
    ],
}, null, 2));

if (failed.length) process.exit(1);

function parseArgs(argv) {
  const result = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--source-dir") {
      result.sourceDir = next;
      index += 1;
    } else if (arg === "--evidence-dir") {
      result.evidenceDir = next;
      index += 1;
    } else if (arg === "--crave") {
      result.crave = next;
      index += 1;
    } else if (arg === "--invite") {
      result.invite = next;
      index += 1;
    } else if (arg === "--grocery") {
      result.grocery = next;
      index += 1;
    } else if (arg === "--wish") {
      result.wish = next;
      index += 1;
    } else if (arg === "--menu") {
      result.menu = next;
      index += 1;
    }
  }
  return result;
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

async function findSourceInDir(sourceDir, item) {
  if (!sourceDir) return null;
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".png")
    .map((entry) => entry.name);

  const exact = files.find((file) => file === item.file);
  if (exact) return resolve(sourceDir, exact);

  const fuzzy = files.find((file) => {
    const lower = file.toLowerCase();
    return item.aliases.some((alias) => lower.includes(alias.toLowerCase()));
  });
  return fuzzy ? resolve(sourceDir, fuzzy) : null;
}

async function inspectSource(source, item) {
  try {
    const [fileStat, bytes] = await Promise.all([
      stat(source),
      readFile(source),
    ]);
    const png = inspectPng(bytes);
    const ok = fileStat.isFile() && fileStat.size >= 8_000 && png.ok && png.width >= 240 && png.height >= 160;
    return {
      key: item.key,
      file: item.file,
      description: item.description,
      source,
      ok,
      size: fileStat.size,
      image: png,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      error: ok ? undefined : `${basename(source)} does not look like a valid native share card screenshot.`,
    };
  } catch (error) {
    return {
      key: item.key,
      file: item.file,
      description: item.description,
      source,
      ok: false,
      error: error.message,
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

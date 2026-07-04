import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const privateDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || DEFAULT_PRIVATE_DIR;
const dashboardDir = process.env.HUMI_PRE_REVIEW_EVIDENCE_DASHBOARD_DIR
  || join(privateDir, `pre-review-evidence-dashboard-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}`);
const shouldOpen = process.env.HUMI_PRE_REVIEW_DASHBOARD_NO_OPEN !== "1";

const craveTemplateFiles = [
  ["starter.png", "主厨发起"],
  ["collecting-empty.png", "主厨等待"],
  ["vote.png", "家人投票"],
  ["submitted.png", "投票完成"],
  ["closed.png", "征集结束"],
];
const shareFiles = [
  ["crave-card.png", "crave 微信原生分享卡片", "native-card"],
  ["crave-landing.png", "crave 免登录投票落地页", "h5-landing"],
  ["invite-card.png", "invite 微信原生分享卡片", "native-card"],
  ["invite-landing.png", "invite 加入家庭落地页", "h5-landing"],
  ["grocery-card.png", "grocery 微信原生分享卡片", "native-card"],
  ["grocery-landing.png", "grocery 免登录买菜认领落地页", "h5-landing"],
];

const [gitState, hardening, latestCraveDir, latestShareDir] = await Promise.all([
  readGitState(),
  readHardeningState(),
  findLatestDir("crave-template-visuals-"),
  findLatestDir("miniprogram-share-card-preview-"),
]);

const [craveTemplateEvidence, shareEvidence] = await Promise.all([
  inspectGroup(latestCraveDir, craveTemplateFiles, { minWidth: 320, minHeight: 240, minBytes: 20_000 }),
  inspectGroup(latestShareDir, shareFiles, { minWidth: 240, minHeight: 160, minBytes: 8_000 }),
]);

const missingShareNativeCards = shareEvidence.files
  .filter((item) => item.kind === "native-card" && !item.ok)
  .map((item) => item.file);

const result = {
  ok: hardening.openItems.length === 0 && missingShareNativeCards.length === 0,
  checkedAt: new Date().toISOString(),
  dashboardDir,
  git: gitState,
  hardening,
  craveTemplateEvidence,
  shareEvidence,
  missingShareNativeCards,
  nextActions: buildNextActions(missingShareNativeCards),
};

await mkdir(dashboardDir, { recursive: true, mode: 0o700 });
await writeFile(join(dashboardDir, "dashboard.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(dashboardDir, "README.md"), buildReadme(result), { mode: 0o600 });

if (shouldOpen) {
  await openPath(dashboardDir);
  await openPath(join(dashboardDir, "README.md"));
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

async function readGitState() {
  const [head, originMain, status] = await Promise.all([
    git(["rev-parse", "--short", "HEAD"]),
    git(["rev-parse", "--short", "origin/main"]),
    git(["status", "--short", "--branch"]),
  ]);
  return {
    head,
    originMain,
    clean: !status.split("\n").some((line) => line && !line.startsWith("## ")),
    branchStatus: status,
  };
}

async function readHardeningState() {
  const path = "docs/humi-1.1-pre-review-hardening.md";
  const text = await readFile(path, "utf8");
  const openItems = text
    .split("\n")
    .filter((line) => line.startsWith("- [ ] P0") || line.startsWith("- [ ] P1"));
  const completedItems = text
    .split("\n")
    .filter((line) => line.startsWith("- [x] P0") || line.startsWith("- [x] P1"));
  return {
    path,
    ok: openItems.length === 0,
    completedItems,
    openItems,
  };
}

async function findLatestDir(prefix) {
  try {
    const entries = await readdir(privateDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
      .map((entry) => entry.name)
      .sort();
    const latest = candidates[candidates.length - 1];
    return latest ? join(privateDir, latest) : null;
  } catch {
    return null;
  }
}

async function inspectGroup(dir, fileDefs, thresholds) {
  const files = await Promise.all(fileDefs.map(async ([file, label, kind]) => {
    const inspected = await inspectPngFile(dir, file, thresholds);
    return { file, label, kind: kind || "visual", ...inspected };
  }));
  return {
    ok: Boolean(dir) && files.every((item) => item.ok),
    dir,
    files,
  };
}

async function inspectPngFile(dir, file, thresholds) {
  if (!dir) {
    return { ok: false, path: null, error: "Evidence directory not found." };
  }
  const path = join(dir, file);
  try {
    const [fileStat, bytes] = await Promise.all([stat(path), readFile(path)]);
    const png = inspectPng(bytes);
    const ok = fileStat.isFile()
      && fileStat.size >= thresholds.minBytes
      && png.ok
      && png.width >= thresholds.minWidth
      && png.height >= thresholds.minHeight;
    return {
      ok,
      path,
      size: fileStat.size,
      image: png,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      error: ok ? undefined : buildPngError(file, fileStat, png, thresholds),
    };
  } catch (error) {
    return {
      ok: false,
      path,
      error: `${basename(path)} missing or unreadable: ${error.message}`,
    };
  }
}

function inspectPng(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) {
    return { ok: false, format: "unknown", width: 0, height: 0, complete: false };
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
  return { ok: hasIhdr && hasIend, format: "png", width, height, complete: hasIend };
}

function buildPngError(file, fileStat, png, thresholds) {
  if (!fileStat.isFile() || fileStat.size <= 0) return `${file} is empty or not a file.`;
  if (fileStat.size < thresholds.minBytes) return `${file} is too small: ${fileStat.size} bytes.`;
  if (!png.ok) return `${file} is not a complete PNG.`;
  return `${file} is ${png.width}x${png.height}; expected at least ${thresholds.minWidth}x${thresholds.minHeight}.`;
}

function buildNextActions(missingShareNativeCards) {
  if (!missingShareNativeCards.length) {
    return [
      "Run npm run release:wechat:share:evidence.",
      "Run npm run release:wechat:share:complete and visually confirm the native share cards.",
      "Run npm run release:closure.",
    ];
  }
  return [
    `Missing native mini program share cards: ${missingShareNativeCards.join(", ")}.`,
    "Run npm run release:wechat:share:doctor to verify WeChat DevTools CLI, evidence directory, desktop activity, and missing files.",
    "Run npm run release:wechat:share:devtools to open WeChat DevTools, preview QR, and checklist.",
    "Run npm run release:wechat:share:cards:capture -- --interactive to capture exact card regions.",
    "Or run npm run release:wechat:share:cards:import -- --source-dir /path/to/card-screenshots if the files already exist.",
    "Rerun npm run release:pre-review:evidence after adding the screenshots.",
  ];
}

function buildReadme(result) {
  return [
    "# Humi 1.1 提审前证据总览",
    "",
    `生成时间：${result.checkedAt}`,
    `产品提交：\`${result.git.head}\` / origin \`${result.git.originMain}\` / ${result.git.clean ? "clean" : "dirty"}`,
    "",
    "## P0/P1 打磨项",
    "",
    `完成：${result.hardening.completedItems.length} 项`,
    `未完成：${result.hardening.openItems.length} 项`,
    "",
    ...(result.hardening.openItems.length ? result.hardening.openItems : ["- 当前没有未完成 P0/P1。"]),
    "",
    "## 征集单模板视觉证据",
    "",
    `目录：\`${result.craveTemplateEvidence.dir || "missing"}\``,
    "",
    tableFor(result.craveTemplateEvidence.files),
    "",
    "## 小程序分享证据",
    "",
    `目录：\`${result.shareEvidence.dir || "missing"}\``,
    "",
    tableFor(result.shareEvidence.files),
    "",
    "## 下一步",
    "",
    ...result.nextActions.map((item) => `- ${item}`),
    "",
    "## 判断",
    "",
    result.ok
      ? "提审前证据总览已完整。继续执行分享卡片 complete 和 release closure。"
      : "提审前证据仍未完整。当前不会进入微信审核。 ",
    "",
  ].join("\n");
}

function tableFor(files) {
  return [
    "| 状态 | 文件 | 说明 | 尺寸 | 字节 | 路径 |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...files.map((item) => {
      const size = item.image ? `${item.image.width}x${item.image.height}` : "-";
      const bytes = item.size ?? "-";
      return `| ${item.ok ? "OK" : "缺失"} | \`${item.file}\` | ${item.label} | ${size} | ${bytes} | \`${item.path || "-"}\` |`;
    }),
  ].join("\n");
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { timeout: 10_000 });
  return stdout.trim();
}

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

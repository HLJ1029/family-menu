import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { directPreviewFixtures } from "./lib/native-share-qa-fixtures.mjs";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const DEFAULT_WECHAT_CLI = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";

const root = resolve(new URL("..", import.meta.url).pathname);
const projectDir = resolve(root, "miniprogram");
const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const outputDir = join(evidenceDir, "direct-preview");
const cliPath = process.env.HUMI_WECHAT_DEVTOOLS_CLI || DEFAULT_WECHAT_CLI;
const dryRun = process.env.HUMI_SHARE_DIRECT_PREVIEW_DRY_RUN === "1" || process.argv.includes("--dry-run");

const previews = directPreviewFixtures.map((fixture) => ({
  ...fixture,
  query: buildQuery(fixture.query),
}));

await assertFile(cliPath, "WeChat DevTools CLI");
await assertDirectory(projectDir, "mini program project");
await mkdir(outputDir, { recursive: true });

const results = [];
for (const item of previews) {
  const qrOutput = join(outputDir, `${item.key}-preview-qr.png`);
  const infoOutput = join(outputDir, `${item.key}-preview-info.json`);
  const compileCondition = JSON.stringify({
    pathName: item.pathName,
    query: item.query,
  });
  const args = [
    "preview",
    "--project",
    projectDir,
    "--compile-condition",
    compileCondition,
    "--qr-format",
    "image",
    "--qr-output",
    qrOutput,
    "--info-output",
    infoOutput,
  ];

  if (!dryRun) {
    await execFileAsync(cliPath, args, { timeout: 60_000 });
  }

  results.push({
    key: item.key,
    pathName: item.pathName,
    query: item.query,
    compileCondition,
    qrOutput,
    infoOutput,
    expectedTitle: item.expectedTitle,
    expectedPath: item.expectedPath,
    qr: dryRun ? { ok: false, dryRun: true } : await inspectFile(qrOutput),
    info: dryRun ? { ok: false, dryRun: true } : await inspectFile(infoOutput),
  });
}

if (!dryRun) {
  await openPath(outputDir);
}

console.log(JSON.stringify({
  ok: dryRun || results.every((item) => item.qr.ok && item.info.ok),
  checkedAt: new Date().toISOString(),
  dryRun,
  projectDir,
  evidenceDir,
  outputDir,
  results,
  nextActions: [
    "Scan each direct-preview/*-preview-qr.png with WeChat or open it in WeChat DevTools.",
    "Each QR should land on pages/share/index and show the native share confirmation card.",
    "Tap the black share button and confirm that each of the five flows opens the native WeChat contact picker.",
    "Capture crave-card.png, invite-card.png, grocery-card.png, wish-card.png, and menu-card.png before running the evidence check.",
  ],
}, null, 2));

function buildQuery(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
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

async function assertFile(path, label) {
  if (!(await isFile(path))) {
    throw new Error(`${label} not found: ${path}`);
  }
}

async function assertDirectory(path, label) {
  try {
    const fileStat = await stat(path);
    if (!fileStat.isDirectory()) throw new Error();
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

async function inspectFile(path) {
  try {
    const fileStat = await stat(path);
    return {
      ok: fileStat.isFile() && fileStat.size > 0,
      size: fileStat.size,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function isFile(path) {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

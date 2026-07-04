import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const DEFAULT_WECHAT_CLI = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";
const HELPER_FILES = [
  "preview-qr.png",
  "share-card-qa-checklist.md",
  "share-card-expected.json",
];

const root = resolve(new URL("..", import.meta.url).pathname);
const projectDir = resolve(root, "miniprogram");
const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const cliPath = process.env.HUMI_WECHAT_DEVTOOLS_CLI || DEFAULT_WECHAT_CLI;
const dryRun = process.env.HUMI_SHARE_DEVTOOLS_DRY_RUN === "1" || process.argv.includes("--dry-run");

await assertFile(cliPath, "WeChat DevTools CLI");
await assertDirectory(projectDir, "mini program project");
await assertDirectory(evidenceDir, "share card evidence directory");

const helperPaths = [];
for (const file of HELPER_FILES) {
  const path = join(evidenceDir, file);
  if (await isFile(path)) helperPaths.push(path);
}

const command = {
  cli: cliPath,
  args: ["open", "--project", projectDir],
};

if (!dryRun) {
  await execFileAsync(command.cli, command.args, { timeout: 30_000 });
  await openPath(evidenceDir);
  for (const helperPath of helperPaths) {
    await openPath(helperPath);
  }
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  dryRun,
  projectDir,
  evidenceDir,
  wechatDevtoolsCommand: `${command.cli} ${command.args.map((arg) => quoteArg(arg)).join(" ")}`,
  openedHelpers: helperPaths,
  nextActions: [
    "In WeChat DevTools, use the opened mini program project or scan preview-qr.png with WeChat.",
    "Trigger crave, invite, and grocery share card previews one by one.",
    "Run npm run release:wechat:share:cards:capture to save the three card screenshots.",
    "Run npm run release:wechat:share:evidence after all card screenshots are present.",
  ],
}, null, 2));

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

function quoteArg(value) {
  return value.includes(" ") ? `"${value.replaceAll('"', '\\"')}"` : value;
}

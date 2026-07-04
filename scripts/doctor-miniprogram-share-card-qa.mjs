import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRIVATE_DIR = "/Users/honglijie/.humi-release-evidence";
const DEFAULT_WECHAT_CLI = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const EVIDENCE_PREFIX = "miniprogram-share-card-preview-";
const NATIVE_CARDS = ["crave-card.png", "invite-card.png", "grocery-card.png"];
const H5_LANDINGS = ["crave-landing.png", "invite-landing.png", "grocery-landing.png"];

const root = resolve(new URL("..", import.meta.url).pathname);
const projectDir = resolve(root, "miniprogram");
const evidenceDir = process.env.HUMI_MINIPROGRAM_SHARE_EVIDENCE_DIR || await findLatestEvidenceDir();
const cliPath = process.env.HUMI_WECHAT_DEVTOOLS_CLI || DEFAULT_WECHAT_CLI;

const [cli, project, desktop, nativeCards, h5Landings] = await Promise.all([
  inspectPath(cliPath, "file"),
  inspectPath(projectDir, "directory"),
  inspectDesktopActivity(),
  inspectFiles(NATIVE_CARDS),
  inspectFiles(H5_LANDINGS),
]);

const missingNativeCards = nativeCards.filter((item) => !item.ok).map((item) => item.file);
const missingH5Landings = h5Landings.filter((item) => !item.ok).map((item) => item.file);
const ok = cli.ok && project.ok && missingNativeCards.length === 0 && missingH5Landings.length === 0;

console.log(JSON.stringify({
  ok,
  checkedAt: new Date().toISOString(),
  projectDir,
  evidenceDir,
  wechatDevtoolsCli: cli,
  miniProgramProject: project,
  desktop,
  nativeCards,
  h5Landings,
  nextActions: buildNextActions({ cli, project, desktop, missingNativeCards, missingH5Landings }),
}, null, 2));

if (!ok) process.exit(1);

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

async function inspectFiles(files) {
  return Promise.all(files.map(async (file) => {
    const path = join(evidenceDir, file);
    const result = await inspectPath(path, "file");
    return { file, path, ...result };
  }));
}

async function inspectPath(path, kind) {
  try {
    const fileStat = await stat(path);
    const ok = kind === "directory" ? fileStat.isDirectory() : fileStat.isFile() && fileStat.size > 0;
    return {
      ok,
      path,
      size: fileStat.size,
      error: ok ? undefined : `${path} is not a ${kind}.`,
    };
  } catch (error) {
    return {
      ok: false,
      path,
      error: error.message,
    };
  }
}

async function inspectDesktopActivity() {
  try {
    const { stdout } = await execFileAsync("pmset", ["-g", "assertions"], { timeout: 10_000 });
    const match = stdout.match(/^\s*UserIsActive\s+(\d+)/m);
    const userIsActive = match ? match[1] === "1" : null;
    return {
      ok: userIsActive !== false,
      userIsActive,
      warning: userIsActive === false
        ? "macOS reports UserIsActive=0. If the screen is locked, unlock the Mac before running devtools/capture."
        : undefined,
    };
  } catch (error) {
    return {
      ok: true,
      userIsActive: null,
      warning: `Unable to inspect desktop activity: ${error.message}`,
    };
  }
}

function buildNextActions({ cli, project, desktop, missingNativeCards, missingH5Landings }) {
  const actions = [];
  if (!cli.ok) actions.push("Install or open WeChat DevTools, or set HUMI_WECHAT_DEVTOOLS_CLI to its CLI path.");
  if (!project.ok) actions.push("Ensure the miniprogram project directory exists before opening WeChat DevTools.");
  if (desktop.userIsActive === false) actions.push("Unlock the Mac screen before relying on WeChat DevTools windows or interactive screenshots.");
  if (missingH5Landings.length) actions.push(`Run npm run release:wechat:share:landings to generate missing H5 landing screenshots: ${missingH5Landings.join(", ")}.`);
  if (missingNativeCards.length) {
    actions.push(`Run npm run release:wechat:share:devtools, then trigger and capture missing native cards: ${missingNativeCards.join(", ")}.`);
    actions.push("Use npm run release:wechat:share:cards:capture -- --interactive for fresh screenshots, or release:wechat:share:cards:import for existing PNGs.");
  }
  if (!actions.length) actions.push("Run npm run release:wechat:share:evidence, then npm run release:wechat:share:complete after visual confirmation.");
  return actions;
}

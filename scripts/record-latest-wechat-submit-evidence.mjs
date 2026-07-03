import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const baseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const versionPrefix = process.env.HUMI_WECHAT_SUBMIT_DIR_PREFIX || "wechat-submit-1.1.55-";
const submitter = process.env.HUMI_WECHAT_SUBMITTER?.trim() || process.env.USER || "honglijie";
const submitTime = process.env.HUMI_WECHAT_SUBMIT_TIME?.trim() || formatHumanTime(new Date());
const reviewStatus = process.env.HUMI_WECHAT_REVIEW_STATUS?.trim() || "审核中";

const sessionDir = await findLatestSubmitDir(baseDir, versionPrefix);
const evidenceFiles = await listEvidenceFiles(sessionDir);

if (!evidenceFiles.length && process.env.HUMI_ALLOW_EMPTY_WECHAT_SUBMIT_EVIDENCE !== "1") {
  console.error(`Latest WeChat submit evidence directory has no evidence files yet: ${sessionDir}`);
  console.error("Put WeChat platform screenshots or recordings in that directory first.");
  console.error("Expected examples: humi-1.1.55-version-list.png, humi-review-submit-note.png, humi-review-submitted.png");
  console.error("If you intentionally need a dry run without files, set HUMI_ALLOW_EMPTY_WECHAT_SUBMIT_EVIDENCE=1.");
  process.exit(1);
}

const { stdout } = await execFileAsync("npm", ["run", "release:evidence:record:submit"], {
  env: {
    ...process.env,
    HUMI_WECHAT_SUBMIT_TIME: submitTime,
    HUMI_WECHAT_SUBMITTER: submitter,
    HUMI_WECHAT_REVIEW_STATUS: reviewStatus,
    HUMI_WECHAT_EVIDENCE_LOCATION: `private://${sessionDir}`,
  },
  timeout: 60_000,
  maxBuffer: 1024 * 1024,
});

console.log(stdout.trim());

async function findLatestSubmitDir(root, prefix) {
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();

  if (!dirs.length) {
    throw new Error(`No WeChat submit evidence directories found under ${root} with prefix ${prefix}`);
  }

  return join(root, dirs.at(-1));
}

async function listEvidenceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === "README.md" || entry.name.startsWith(".")) continue;
    const filePath = join(dir, entry.name);
    const info = await stat(filePath);
    if (info.size > 0) files.push(filePath);
  }
  return files.sort();
}

function formatHumanTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute} CST`;
}

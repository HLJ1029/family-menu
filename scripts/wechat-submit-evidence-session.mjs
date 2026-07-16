import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const WECHAT_SUBMIT_VERSION = "1.1.68";
export const WECHAT_SUBMIT_DESCRIPTION = "修复分享并优化应用文案";
export const DEFAULT_WECHAT_SUBMIT_DIR_PREFIX = `wechat-submit-${WECHAT_SUBMIT_VERSION}-`;

export function getEvidenceBaseDir() {
  return process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
}

export function getWechatSubmitDirPrefix() {
  return process.env.HUMI_WECHAT_SUBMIT_DIR_PREFIX || DEFAULT_WECHAT_SUBMIT_DIR_PREFIX;
}

export async function findLatestWechatSubmitDir({
  baseDir = getEvidenceBaseDir(),
  prefix = getWechatSubmitDirPrefix(),
} = {}) {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();

  return dirs.length ? join(baseDir, dirs.at(-1)) : "";
}

export async function listWechatSubmitEvidenceFiles(sessionDir) {
  if (!sessionDir) return [];

  const entries = await readdir(sessionDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === "README.md" || entry.name.startsWith(".")) continue;
    const filePath = join(sessionDir, entry.name);
    const info = await stat(filePath);
    if (info.size > 0) files.push(filePath);
  }
  return files.sort();
}

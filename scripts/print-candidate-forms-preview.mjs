import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildCandidateFormsPreviewHtml, CANDIDATE_FORMS_PREVIEW_FILE } from "./lib/candidate-forms-preview.mjs";

const execFileAsync = promisify(execFile);
const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();
const shouldOpen = process.env.HUMI_CANDIDATE_FORMS_PREVIEW_NO_OPEN !== "1";

const [testerFeedbackForm, hostRunSheet, importCsv, dailyReviewCsv] = await Promise.all([
  readFile(join(packetDir, "tester-feedback-form.md"), "utf8"),
  readFile(join(packetDir, "host-run-sheet.md"), "utf8"),
  readFile(join(packetDir, "candidate-feedback-import.csv"), "utf8"),
  readFile(join(packetDir, "daily-review.csv"), "utf8"),
]);

const previewPath = join(packetDir, CANDIDATE_FORMS_PREVIEW_FILE);
await writeFile(previewPath, buildCandidateFormsPreviewHtml({
  generatedAt: new Date().toISOString(),
  packetDir,
  testerFeedbackForm,
  hostRunSheet,
  importHeader: firstLine(importCsv),
  dailyReviewHeader: firstLine(dailyReviewCsv),
}), { mode: 0o600 });

if (shouldOpen) await openPath(previewPath);

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  previewPath,
  sections: [
    "tester-feedback-form.md",
    "host-run-sheet.md",
    "candidate-feedback-import.csv",
    "daily-review.csv",
  ],
  nextActions: [
    "Open candidate-forms-preview.html to review the tester-facing form, host run sheet, import fields, and daily review thresholds.",
    "Keep real contacts, screenshots, and recordings outside the repository and outside this preview.",
  ],
}, null, 2));

async function findLatestPacketDir() {
  const entries = await readdir(privateBaseDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("candidate-validation-"))
    .map((entry) => entry.name)
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error(`No candidate-validation-* directory found under ${privateBaseDir}. Run npm run release:candidate:prepare first.`);
  }
  return join(privateBaseDir, latest);
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

async function openPath(path) {
  try {
    await execFileAsync("open", [path], { timeout: 10_000 });
  } catch (error) {
    console.warn(`Unable to open ${path}: ${error.message}`);
  }
}

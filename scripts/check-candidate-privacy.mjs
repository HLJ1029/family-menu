import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const packetDir = process.env.HUMI_CANDIDATE_VALIDATION_DIR || await findLatestPacketDir();

if (!packetDir) {
  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    packetDir: null,
    skipped: true,
    reason: "No candidate-validation-* directory found yet. Run npm run release:candidate:prepare before real validation.",
    findings: [],
  }, null, 2));
  process.exit(0);
}

const files = [
  "README.md",
  "anonymous-users.csv",
  "feedback-template.csv",
  "candidate-feedback-import.csv",
  "daily-review.csv",
  "issue-triage.csv",
  "invite-copy.md",
  "outreach-batch.md",
  "tester-feedback-form.md",
  "host-run-sheet.md",
  "candidate-forms-preview.html",
  "candidate-day-plan.md",
  "candidate-review.md",
  "candidate-review.json",
  ...await dispatchPackFiles(packetDir),
  ...await dispatchWorkbenchFiles(packetDir),
  ...await closeReportFiles(packetDir),
];

const findings = [];

for (const file of files) {
  let content = "";
  try {
    content = await readFile(join(packetDir, file), "utf8");
  } catch {
    continue;
  }
  findings.push(...scanContent(file, content));
}

const result = {
  ok: findings.length === 0,
  checkedAt: new Date().toISOString(),
  packetDir,
  scannedFiles: files,
  findings,
  nextActions: findings.length
    ? [
      "Remove real names, phone numbers, email addresses, and WeChat IDs from the private candidate packet.",
      "Keep only U001-U020 anonymous IDs and private:// evidence pointers in candidate CSV/Markdown files.",
      "Do not paste the sensitive values into chat or commits while fixing them.",
    ]
    : [
      "Candidate packet privacy scan is clean.",
      "Continue keeping real contacts and screenshots outside the repository and out of candidate CSV/Markdown files.",
    ],
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

async function findLatestPacketDir() {
  try {
    const entries = await readdir(privateBaseDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("candidate-validation-"))
      .map((entry) => entry.name)
      .sort();
    const latest = candidates.at(-1);
    return latest ? join(privateBaseDir, latest) : "";
  } catch {
    return "";
  }
}

async function closeReportFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^candidate-day-close-\d{4}-\d{2}-\d{2}\.(md|json)$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function dispatchPackFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^candidate-dispatch-\d{4}-\d{2}-\d{2}\.(md|json)$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function dispatchWorkbenchFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^candidate-dispatch-workbench-\d{4}-\d{2}-\d{2}\.html$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function scanContent(file, content) {
  const findings = [];
  const checks = [
    {
      type: "phone",
      pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    },
    {
      type: "email",
      pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    },
    {
      type: "wechat-id",
      pattern: /(?:微信号|微信ID|wechat id|wechat_id)\s*[:：]\s*[A-Za-z][A-Za-z0-9_-]{5,19}/gi,
    },
    {
      type: "real-name",
      pattern: /(?:真实姓名|姓名|联系人)\s*[:：]\s*[\u4e00-\u9fa5]{2,4}/g,
    },
  ];

  for (const check of checks) {
    for (const match of content.matchAll(check.pattern)) {
      findings.push({
        file,
        type: check.type,
        line: lineForIndex(content, match.index ?? 0),
      });
    }
  }
  return findings;
}

function lineForIndex(content, index) {
  return content.slice(0, index).split("\n").length;
}

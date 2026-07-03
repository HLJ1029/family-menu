import { readFile, writeFile } from "node:fs/promises";

const evidencePath = "docs/humi-1.1-release-evidence-log.md";
const required = {
  HUMI_WECHAT_SUBMIT_TIME: "提交时间，例如 2026-07-03 14:30 CST",
  HUMI_WECHAT_SUBMITTER: "提交人，例如 honglijie",
  HUMI_WECHAT_REVIEW_STATUS: "审核单状态，例如 审核中",
  HUMI_WECHAT_EVIDENCE_LOCATION: "私有证据位置，例如 飞书私有文件夹链接或本机私有目录",
};

const missing = Object.keys(required).filter((key) => !process.env[key]?.trim());
if (missing.length) {
  printUsage(missing);
  process.exit(1);
}

const values = {
  submitTime: process.env.HUMI_WECHAT_SUBMIT_TIME.trim(),
  submitter: process.env.HUMI_WECHAT_SUBMITTER.trim(),
  reviewStatus: process.env.HUMI_WECHAT_REVIEW_STATUS.trim(),
  evidenceLocation: process.env.HUMI_WECHAT_EVIDENCE_LOCATION.trim(),
  noteVersion: process.env.HUMI_WECHAT_REVIEW_NOTE_VERSION?.trim() || "docs/wechat-submit-copy-packet.md / 2026-07-03",
};

const replacements = new Map([
  ["提交时间", values.submitTime],
  ["提交人", values.submitter],
  ["提交版本", "`1.1.54`"],
  ["审核备注版本", values.noteVersion],
  ["审核单状态", values.reviewStatus],
  ["证据原件位置", values.evidenceLocation],
]);

let content = await readFile(evidencePath, "utf8");
const section = getSection(content, "## 4. 微信公众平台提交审核证据");
if (!section) {
  throw new Error("Unable to find section 4 in release evidence log.");
}

let nextSection = section;
for (const [field, value] of replacements) {
  nextSection = replaceField(nextSection, field, value);
}

const preservedLocation = values.evidenceLocation;
nextSection = nextSection
  .replace("| 上传版本 `1.1.54` 列表 | 待填 | 待填 |  |", `| 上传版本 \`1.1.54\` 列表 | 已留存 | ${preservedLocation} |  |`)
  .replace("| request 合法域名 `api.humi-home.com` | 待填 | 待填 |  |", `| request 合法域名 \`api.humi-home.com\` | 已留存 | ${preservedLocation} |  |`)
  .replace("| web-view 业务域名 `www.humi-home.com` | 待填 | 待填 |  |", `| web-view 业务域名 \`www.humi-home.com\` | 已留存 | ${preservedLocation} |  |`)
  .replace("| 隐私保护指引关键项 | 待填 | 待填 |  |", `| 隐私保护指引关键项 | 已留存 | ${preservedLocation} |  |`)
  .replace("| 审核备注/提交页 | 待填 | 待填 |  |", `| 审核备注/提交页 | 已留存 | ${preservedLocation} |  |`)
  .replace("| 提交成功/审核中状态 | 待填 | 待填 |  |", `| 提交成功/审核中状态 | 已留存 | ${preservedLocation} | ${values.reviewStatus} |`);

const updated = content.replace(section, nextSection);

const report = {
  ok: true,
  dryRun: process.env.HUMI_EVIDENCE_DRY_RUN === "1",
  evidenceLog: evidencePath,
  updatedSection: "## 4. 微信公众平台提交审核证据",
  submitTime: values.submitTime,
  submitter: values.submitter,
  reviewStatus: values.reviewStatus,
  evidenceLocation: values.evidenceLocation,
  nextActions: [
    "Wait for WeChat review result.",
    "After approval or rejection, fill section 5 in docs/humi-1.1-release-evidence-log.md.",
    "If approved, publish 1.1.54, run real-device P0 checks, then fill sections 6-8.",
  ],
};

if (report.dryRun) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

await writeFile(evidencePath, updated);
console.log(JSON.stringify(report, null, 2));

function replaceField(markdown, field, value) {
  const pattern = new RegExp(`\\| ${escapeRegExp(field)} \\| .*? \\|`);
  const replacement = `| ${field} | ${value} |`;
  if (!pattern.test(markdown)) {
    throw new Error(`Unable to find evidence field: ${field}`);
  }
  return markdown.replace(pattern, replacement);
}

function getSection(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const next = markdown.indexOf("\n## ", start + heading.length);
  return next < 0 ? markdown.slice(start) : markdown.slice(start, next);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printUsage(missingKeys) {
  console.error("Missing required environment variables:");
  for (const key of missingKeys) {
    console.error(`- ${key}: ${required[key]}`);
  }
  console.error("");
  console.error("Example:");
  console.error("HUMI_WECHAT_SUBMIT_TIME='2026-07-03 14:30 CST' \\");
  console.error("HUMI_WECHAT_SUBMITTER='honglijie' \\");
  console.error("HUMI_WECHAT_REVIEW_STATUS='审核中' \\");
  console.error("HUMI_WECHAT_EVIDENCE_LOCATION='private://humi/wechat-submit-20260703' \\");
  console.error("npm run release:evidence:record:submit");
}

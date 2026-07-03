import { readFile } from "node:fs/promises";

const evidencePath = "docs/humi-1.1-release-evidence-log.md";
const content = await readFile(evidencePath, "utf8");

const sections = [
  "## 4. 微信公众平台提交审核证据",
  "## 5. 审核结果证据",
  "## 6. 审核通过后发布证据",
  "## 7. 发布后 P0 真机验收证据",
  "## 8. 24 小时监控证据",
];

const missing = [];

for (const section of sections) {
  const body = getSection(content, section);
  if (!body) {
    missing.push({
      section,
      missing: ["section not found"],
    });
    continue;
  }

  const placeholders = [...body.matchAll(/待填/g)].length;
  const todoResults = [...body.matchAll(/\|\s*待填\s*\|/g)].length;
  if (placeholders > 0 || todoResults > 0) {
    missing.push({
      section,
      missing: [
        ...(placeholders ? [`${placeholders} placeholder(s) still say 待填`] : []),
        ...(todoResults ? [`${todoResults} table result cell(s) still say 待填`] : []),
      ],
    });
  }
}

const report = {
  ok: missing.length === 0,
  checkedAt: new Date().toISOString(),
  evidenceLog: evidencePath,
  scope: [
    "WeChat platform submit evidence",
    "WeChat review result",
    "WeChat publish evidence",
    "real-device P0 acceptance",
    "24-hour production monitoring",
  ],
  missing,
  nextActions: missing.length
    ? [
      "Do not mark Humi 1.1 fully released yet.",
      "Complete the WeChat platform action, real-device P0 checks, and 24-hour monitoring entries in docs/humi-1.1-release-evidence-log.md.",
      "Keep private screenshots outside the repository; record only timestamps, conclusions, and private evidence locations.",
    ]
    : [
      "Run npm run release:status and npm run monitor:prod one final time.",
      "Update AI-HQ Humi STATUS with final release time, P0 result, and 24-hour monitoring conclusion.",
    ],
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

function getSection(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start < 0) return "";
  const next = markdown.indexOf("\n## ", start + heading.length);
  return next < 0 ? markdown.slice(start) : markdown.slice(start, next);
}

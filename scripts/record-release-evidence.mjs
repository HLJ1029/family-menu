import { readFile, writeFile } from "node:fs/promises";

const evidencePath = process.env.HUMI_EVIDENCE_LOG_PATH || "docs/humi-1.1-release-evidence-log.md";
const mode = process.argv[2];
const dryRun = process.env.HUMI_EVIDENCE_DRY_RUN === "1";

const modes = {
  review: {
    section: "## 5. 审核结果证据",
    required: {
      HUMI_WECHAT_REVIEW_RESULT: "审核结果，例如 通过 或 驳回",
      HUMI_WECHAT_REVIEW_RESULT_TIME: "结果时间，例如 2026-07-04 10:15 CST",
      HUMI_WECHAT_REVIEW_REASON: "后台原始原因摘要；通过可填 无",
      HUMI_WECHAT_REVIEW_SEVERITY: "分级，例如 无问题 / P0 / P1 / P2",
      HUMI_WECHAT_REVIEW_NEEDS_PATCH: "是否需要 1.1.x，例如 否 或 是",
      HUMI_WECHAT_REVIEW_HANDLING: "处理记录，例如 等待发布 / 已写入 1.1.x 修复池",
    },
    fields: {
      "审核结果": "HUMI_WECHAT_REVIEW_RESULT",
      "结果时间": "HUMI_WECHAT_REVIEW_RESULT_TIME",
      "后台原始原因": "HUMI_WECHAT_REVIEW_REASON",
      "分级": "HUMI_WECHAT_REVIEW_SEVERITY",
      "是否需要 1.1.x": "HUMI_WECHAT_REVIEW_NEEDS_PATCH",
      "处理记录": "HUMI_WECHAT_REVIEW_HANDLING",
    },
    nextActions: [
      "If review approved, publish 1.1.64 in WeChat public platform.",
      "After publishing, run npm run release:evidence:record:publish.",
      "If rejected, record the fix in docs/launch-feedback-and-101-backlog.md before uploading any 1.1.x.",
    ],
  },
  publish: {
    section: "## 6. 审核通过后发布证据",
    required: {
      HUMI_WECHAT_PUBLISH_TIME: "发布时间，例如 2026-07-04 11:00 CST",
      HUMI_WECHAT_PUBLISHER: "发布人，例如 honglijie",
      HUMI_WECHAT_PUBLISH_SCREENSHOT: "发布状态截图私有位置",
      HUMI_WECHAT_P0_DEVICE: "首次真机验证设备，例如 iPhone 15 / WeChat 8.x",
      HUMI_WECHAT_ROLLBACK_STATUS: "是否需要回滚/暂停扩散，例如 否",
    },
    fields: {
      "发布时间": "HUMI_WECHAT_PUBLISH_TIME",
      "发布人": "HUMI_WECHAT_PUBLISHER",
      "发布版本": "constant:1.1.64",
      "发布状态截图位置": "HUMI_WECHAT_PUBLISH_SCREENSHOT",
      "首次真机验证设备": "HUMI_WECHAT_P0_DEVICE",
      "是否需要回滚/暂停扩散": "HUMI_WECHAT_ROLLBACK_STATUS",
    },
    nextActions: [
      "Run real-device P0 checks from docs/launch-day-runbook.md.",
      "After P0 passes, run npm run release:evidence:record:p0.",
      "Continue T+2h/T+6h/T+12h/T+24h monitoring, then run npm run release:evidence:record:monitor.",
    ],
  },
  p0: {
    section: "## 7. 发布后 P0 真机验收证据",
    required: {
      HUMI_WECHAT_P0_DEVICE: "真机和微信版本，例如 iPhone 15 / WeChat 8.x",
      HUMI_WECHAT_P0_RESULT: "统一验收结果，例如 通过",
      HUMI_WECHAT_P0_NOTE: "统一备注，例如 全部 P0 路径通过，证据见 private://...",
    },
    nextActions: [
      "Continue 24-hour monitoring.",
      "After monitoring windows are filled, run npm run release:evidence:record:monitor.",
      "Run npm run release:evidence:check before marking Humi 1.1 complete.",
    ],
  },
  monitor: {
    section: "## 8. 24 小时监控证据",
    required: {
      HUMI_MONITOR_H5: "H5 监控结论，例如 正常",
      HUMI_MONITOR_API: "API health 监控结论，例如 正常",
      HUMI_MONITOR_RECOMMENDATION: "推荐监控结论，例如 正常",
      HUMI_MONITOR_SHARE: "分享卡片监控结论，例如 正常",
      HUMI_MONITOR_LOGIN: "登录同步监控结论，例如 正常",
      HUMI_MONITOR_FEEDBACK: "反馈等级，例如 无 P0/P1",
      HUMI_MONITOR_HANDLING: "处理，例如 无需处理",
    },
    nextActions: [
      "Run npm run release:evidence:check.",
      "If it passes, run npm run release:status and update AI-HQ Humi STATUS with final release conclusions.",
    ],
  },
};

if (!modes[mode]) {
  printModeUsage();
  process.exit(1);
}

const config = modes[mode];
const missing = Object.keys(config.required).filter((key) => !process.env[key]?.trim());
if (missing.length) {
  printEnvUsage(config, missing);
  process.exit(1);
}

let content = await readFile(evidencePath, "utf8");
const section = getSection(content, config.section);
if (!section) throw new Error(`Unable to find section: ${config.section}`);

let nextSection = section;
if (mode === "p0") {
  nextSection = recordAllP0Rows(nextSection);
} else if (mode === "monitor") {
  nextSection = recordAllMonitorRows(nextSection);
} else {
  for (const [field, source] of Object.entries(config.fields)) {
    const value = source.startsWith("constant:")
      ? `\`${source.slice("constant:".length)}\``
      : process.env[source].trim();
    nextSection = replaceField(nextSection, field, value);
  }
}

const updated = content.replace(section, nextSection);
const report = {
  ok: true,
  dryRun,
  mode,
  evidenceLog: evidencePath,
  updatedSection: config.section,
  nextActions: config.nextActions,
};

if (!dryRun) {
  await writeFile(evidencePath, updated);
}

console.log(JSON.stringify(report, null, 2));

function recordAllP0Rows(markdown) {
  const device = process.env.HUMI_WECHAT_P0_DEVICE.trim();
  const result = process.env.HUMI_WECHAT_P0_RESULT.trim();
  const note = process.env.HUMI_WECHAT_P0_NOTE.trim();
  return markdown.replace(/\| (?!P0 路径|---)(.+?) \| 待填 \| 待填 \|  \|/g, (_match, path) => {
    return `| ${path} | ${device} | ${result} | ${note} |`;
  });
}

function recordAllMonitorRows(markdown) {
  const values = [
    process.env.HUMI_MONITOR_H5.trim(),
    process.env.HUMI_MONITOR_API.trim(),
    process.env.HUMI_MONITOR_RECOMMENDATION.trim(),
    process.env.HUMI_MONITOR_SHARE.trim(),
    process.env.HUMI_MONITOR_LOGIN.trim(),
    process.env.HUMI_MONITOR_FEEDBACK.trim(),
    process.env.HUMI_MONITOR_HANDLING.trim(),
  ];
  return markdown.replace(/\| (T\+\d+h) \| 待填 \| 待填 \| 待填 \| 待填 \| 待填 \| 待填 \| 待填 \|/g, (_match, window) => {
    return `| ${window} | ${values.join(" | ")} |`;
  });
}

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

function printModeUsage() {
  console.error("Usage:");
  console.error("npm run release:evidence:record:review");
  console.error("npm run release:evidence:record:publish");
  console.error("npm run release:evidence:record:p0");
  console.error("npm run release:evidence:record:monitor");
}

function printEnvUsage(config, missingKeys) {
  console.error(`Missing required environment variables for ${mode}:`);
  for (const key of missingKeys) {
    console.error(`- ${key}: ${config.required[key]}`);
  }
}

import { WECHAT_SUBMIT_VERSION } from "./wechat-submit-evidence-session.mjs";

const requestedStage = process.argv[2] || "all";

const stages = {
  submit: {
    title: "提交微信审核后",
    note: "把微信公众平台显示的提交时间、审核中状态和私有截图位置替换进去。",
    command: [
      `# 如果截图已放入最新 wechat-submit-${WECHAT_SUBMIT_VERSION}-* 私有目录，可直接运行：`,
      "npm run release:evidence:record:submit:latest",
      "",
      "# 或手动指定提交时间和证据位置：",
      "HUMI_WECHAT_SUBMIT_TIME='2026-07-03 14:30 CST' \\",
      "HUMI_WECHAT_SUBMITTER='honglijie' \\",
      "HUMI_WECHAT_REVIEW_STATUS='审核中' \\",
      "HUMI_WECHAT_EVIDENCE_LOCATION='private://humi/wechat-submit-20260703' \\",
      "npm run release:evidence:record:submit",
    ],
  },
  review: {
    title: "微信审核结果回来后",
    note: "审核通过按示例填；若驳回，把后台原因摘要写入 HUMI_WECHAT_REVIEW_REASON，并同步修复池。",
    command: [
      "HUMI_WECHAT_REVIEW_RESULT='通过' \\",
      "HUMI_WECHAT_REVIEW_RESULT_TIME='2026-07-04 10:15 CST' \\",
      "HUMI_WECHAT_REVIEW_REASON='无' \\",
      "HUMI_WECHAT_REVIEW_SEVERITY='无问题' \\",
      "HUMI_WECHAT_REVIEW_NEEDS_PATCH='否' \\",
      "HUMI_WECHAT_REVIEW_HANDLING='等待发布' \\",
      "npm run release:evidence:record:review",
    ],
  },
  publish: {
    title: "审核通过并点击发布后",
    note: "发布状态截图只记录私有位置，不把后台截图提交进仓库。",
    command: [
      "HUMI_WECHAT_PUBLISH_TIME='2026-07-04 11:00 CST' \\",
      "HUMI_WECHAT_PUBLISHER='honglijie' \\",
      "HUMI_WECHAT_PUBLISH_SCREENSHOT='private://humi/wechat-publish-20260704' \\",
      "HUMI_WECHAT_P0_DEVICE='iPhone 15 / WeChat 8.x' \\",
      "HUMI_WECHAT_ROLLBACK_STATUS='否' \\",
      "npm run release:evidence:record:publish",
    ],
  },
  p0: {
    title: "发布后真机 P0 验收通过后",
    note: "按 docs/launch-day-runbook.md 跑完主路径后再登记。",
    command: [
      "HUMI_WECHAT_P0_DEVICE='iPhone 15 / WeChat 8.x' \\",
      "HUMI_WECHAT_P0_RESULT='通过' \\",
      "HUMI_WECHAT_P0_NOTE='全部 P0 路径通过，证据见 private://humi/p0-20260704' \\",
      "npm run release:evidence:record:p0",
    ],
  },
  monitor: {
    title: "24 小时监控完成后",
    note: "T+2h/T+6h/T+12h/T+24h 的结论一致时可一次性登记。",
    command: [
      "HUMI_MONITOR_H5='正常' \\",
      "HUMI_MONITOR_API='正常' \\",
      "HUMI_MONITOR_RECOMMENDATION='正常' \\",
      "HUMI_MONITOR_SHARE='正常' \\",
      "HUMI_MONITOR_LOGIN='正常' \\",
      "HUMI_MONITOR_FEEDBACK='无 P0/P1' \\",
      "HUMI_MONITOR_HANDLING='无需处理' \\",
      "npm run release:evidence:record:monitor",
    ],
  },
};

if (requestedStage !== "all" && !stages[requestedStage]) {
  console.error("Usage:");
  console.error("npm run release:evidence:commands");
  console.error("npm run release:evidence:commands -- submit");
  console.error("npm run release:evidence:commands -- review");
  console.error("npm run release:evidence:commands -- publish");
  console.error("npm run release:evidence:commands -- p0");
  console.error("npm run release:evidence:commands -- monitor");
  process.exit(1);
}

const order = requestedStage === "all"
  ? ["submit", "review", "publish", "p0", "monitor"]
  : [requestedStage];

const lines = [];
lines.push("Humi 1.1 发布证据登记命令");
lines.push("");
lines.push("注意：截图、后台账号、手机号、真实家庭名单和登录态不要写进仓库；只记录时间、结论和私有证据位置。");
lines.push("");

for (const stage of order) {
  const item = stages[stage];
  lines.push(`## ${item.title}`);
  lines.push(item.note);
  lines.push("");
  lines.push("```bash");
  lines.push(...item.command);
  lines.push("```");
  lines.push("");
}

lines.push("登记后检查：");
lines.push("```bash");
lines.push("npm run release:next");
lines.push("npm run release:closure");
lines.push("npm run release:evidence:check");
lines.push("npm run release:status");
lines.push("```");

console.log(lines.join("\n"));

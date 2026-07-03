import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const tempDir = await mkdtemp(join(tmpdir(), "humi-release-next-"));
const tempEvidence = join(tempDir, "evidence.md");

try {
  await copyFile("docs/humi-1.1-release-evidence-log.md", tempEvidence);

  await assertNext("工程侧已可提交微信审核，下一步是平台提交审核");

  await run("release:evidence:record:submit", {
    HUMI_WECHAT_SUBMIT_TIME: "2026-07-03 14:30 CST",
    HUMI_WECHAT_SUBMITTER: "codex-selftest",
    HUMI_WECHAT_REVIEW_STATUS: "审核中",
    HUMI_WECHAT_EVIDENCE_LOCATION: "private://selftest/wechat-submit",
  });
  await assertNext("微信审核已提交，下一步是等待并登记审核结果");

  await run("release:evidence:record:review", {
    HUMI_WECHAT_REVIEW_RESULT: "通过",
    HUMI_WECHAT_REVIEW_RESULT_TIME: "2026-07-04 10:15 CST",
    HUMI_WECHAT_REVIEW_REASON: "无",
    HUMI_WECHAT_REVIEW_SEVERITY: "无问题",
    HUMI_WECHAT_REVIEW_NEEDS_PATCH: "否",
    HUMI_WECHAT_REVIEW_HANDLING: "等待发布",
  });
  await assertNext("微信审核结果已登记，下一步是发布审核通过版本");

  await run("release:evidence:record:publish", {
    HUMI_WECHAT_PUBLISH_TIME: "2026-07-04 11:00 CST",
    HUMI_WECHAT_PUBLISHER: "codex-selftest",
    HUMI_WECHAT_PUBLISH_SCREENSHOT: "private://selftest/wechat-publish",
    HUMI_WECHAT_P0_DEVICE: "selftest device / WeChat",
    HUMI_WECHAT_ROLLBACK_STATUS: "否",
  });
  await assertNext("1.1.54 已发布，下一步是真机 P0 验收");

  await run("release:evidence:record:p0", {
    HUMI_WECHAT_P0_DEVICE: "selftest device / WeChat",
    HUMI_WECHAT_P0_RESULT: "通过",
    HUMI_WECHAT_P0_NOTE: "selftest P0 evidence",
  });
  await assertNext("真机 P0 已登记，下一步是完成 24 小时监控");

  await run("release:evidence:record:monitor", {
    HUMI_MONITOR_H5: "正常",
    HUMI_MONITOR_API: "正常",
    HUMI_MONITOR_RECOMMENDATION: "正常",
    HUMI_MONITOR_SHARE: "正常",
    HUMI_MONITOR_LOGIN: "正常",
    HUMI_MONITOR_FEEDBACK: "无 P0/P1",
    HUMI_MONITOR_HANDLING: "无需处理",
  });
  await assertNext("外部证据区块已填完，下一步是最终状态复核", {
    alternative: "1.1 已完成发布证据闭环",
  });

  console.log(JSON.stringify({
    ok: true,
    tempEvidence,
    checkedStages: [
      "submit",
      "review",
      "publish",
      "p0",
      "monitor",
      "final",
    ],
  }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function assertNext(expected, options = {}) {
  const { stdout } = await execFileAsync("npm", ["run", "release:next"], {
    env: {
      ...process.env,
      HUMI_EVIDENCE_LOG_PATH: tempEvidence,
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (!stdout.includes(expected) && (!options.alternative || !stdout.includes(options.alternative))) {
    throw new Error(`release:next did not include expected stage: ${expected}\n\n${stdout}`);
  }
}

async function run(script, extraEnv) {
  await execFileAsync("npm", ["run", script], {
    env: {
      ...process.env,
      ...extraEnv,
      HUMI_EVIDENCE_LOG_PATH: tempEvidence,
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 8,
  });
}

import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const tempDir = await mkdtemp(join(tmpdir(), "humi-release-evidence-"));
const tempEvidence = join(tempDir, "evidence.md");

try {
  await copyFile("docs/humi-1.1-release-evidence-log.md", tempEvidence);

  await run("release:evidence:record:submit", {
    HUMI_WECHAT_SUBMIT_TIME: "2026-07-03 14:30 CST",
    HUMI_WECHAT_SUBMITTER: "codex-selftest",
    HUMI_WECHAT_REVIEW_STATUS: "审核中",
    HUMI_WECHAT_EVIDENCE_LOCATION: "private://selftest/wechat-submit",
  });

  await run("release:evidence:record:review", {
    HUMI_WECHAT_REVIEW_RESULT: "通过",
    HUMI_WECHAT_REVIEW_RESULT_TIME: "2026-07-04 10:15 CST",
    HUMI_WECHAT_REVIEW_REASON: "无",
    HUMI_WECHAT_REVIEW_SEVERITY: "无问题",
    HUMI_WECHAT_REVIEW_NEEDS_PATCH: "否",
    HUMI_WECHAT_REVIEW_HANDLING: "等待发布",
  });

  await run("release:evidence:record:publish", {
    HUMI_WECHAT_PUBLISH_TIME: "2026-07-04 11:00 CST",
    HUMI_WECHAT_PUBLISHER: "codex-selftest",
    HUMI_WECHAT_PUBLISH_SCREENSHOT: "private://selftest/wechat-publish",
    HUMI_WECHAT_P0_DEVICE: "selftest device / WeChat",
    HUMI_WECHAT_ROLLBACK_STATUS: "否",
  });

  await run("release:evidence:record:p0", {
    HUMI_WECHAT_P0_DEVICE: "selftest device / WeChat",
    HUMI_WECHAT_P0_RESULT: "通过",
    HUMI_WECHAT_P0_NOTE: "selftest P0 evidence",
  });

  await run("release:evidence:record:monitor", {
    HUMI_MONITOR_H5: "正常",
    HUMI_MONITOR_API: "正常",
    HUMI_MONITOR_RECOMMENDATION: "正常",
    HUMI_MONITOR_SHARE: "正常",
    HUMI_MONITOR_LOGIN: "正常",
    HUMI_MONITOR_FEEDBACK: "无 P0/P1",
    HUMI_MONITOR_HANDLING: "无需处理",
  });

  const check = await execFileAsync("npm", ["run", "release:evidence:check"], {
    env: {
      ...process.env,
      HUMI_EVIDENCE_LOG_PATH: tempEvidence,
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 6,
  });

  const finalEvidence = await readFile(tempEvidence, "utf8");
  const left = [...finalEvidence.matchAll(/待填/g)].length;
  if (left !== 0) {
    throw new Error(`Selftest evidence still has ${left} 待填 placeholder(s).`);
  }

  console.log(JSON.stringify({
    ok: true,
    tempEvidence,
    evidenceCheck: parseLastJson(check.stdout),
  }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function run(script, extraEnv) {
  await execFileAsync("npm", ["run", script], {
    env: {
      ...process.env,
      ...extraEnv,
      HUMI_EVIDENCE_LOG_PATH: tempEvidence,
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 6,
  });
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

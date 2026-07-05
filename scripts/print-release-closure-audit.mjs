import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WECHAT_SUBMIT_VERSION } from "./wechat-submit-evidence-session.mjs";

const execFileAsync = promisify(execFile);

const status = await runJsonScript("release:status", { allowFailure: true });
const shareEvidence = await runJsonScript("release:wechat:share:evidence", { allowFailure: true });
const next = await runTextScript("release:next", { allowFailure: true });

const release = status?.release ?? {};
const git = status?.git ?? {};
const releaseEvidenceCheck = status?.checks?.find((check) => check.name === "release:evidence:check");
const missingReleaseEvidence = releaseEvidenceCheck?.data?.missing ?? [];
const missingSections = missingReleaseEvidence.map((item) => item.section);
const openHardeningItems = release.preReviewHardeningOpenItems ?? [];

const currentPhase = determineCurrentPhase({
  release,
  openHardeningItems,
  missingSections,
  statusOk: Boolean(status?.ok),
});

const blockers = buildBlockers({
  git,
  release,
  openHardeningItems,
  shareEvidence,
  missingReleaseEvidence,
});

const report = {
  ok: Boolean(release.releaseComplete),
  checkedAt: new Date().toISOString(),
  currentPhase,
  commit: {
    head: git.head ?? "unknown",
    originMain: git.originMain ?? "unknown",
    clean: Boolean(git.clean),
    syncedToOriginMain: Boolean(git.syncedToOriginMain),
  },
  gates: {
    specAcceptanceAuditReady: Boolean(release.specAcceptanceAuditReady),
    preReviewHardeningReady: Boolean(release.preReviewHardeningReady),
    shareCardEvidenceReady: Boolean(shareEvidence?.ok),
    platformSubmitReady: Boolean(status?.ok),
    apiDeployReady: Boolean(release.apiDeployReady),
    securityAuditReady: Boolean(release.securityAuditReady),
    releaseEvidenceReady: Boolean(release.releaseEvidenceReady),
    releaseComplete: Boolean(release.releaseComplete),
  },
  miniProgram: {
    uploadedVersion: release.miniProgramUploadedVersion ?? "unknown",
    uploadDescription: release.miniProgramUploadDescription ?? "unknown",
    remainingNativeShareCards: shareEvidence?.missingFiles?.filter((file) => file.endsWith("-card.png")) ?? [],
  },
  blockers,
  nextCommands: currentPhase.nextCommands,
  userConfirmationsRequired: currentPhase.userConfirmationsRequired,
  authoritativeDocs: [
    "docs/humi-1.1-spec-acceptance-audit.md",
    "docs/humi-1.1-pre-review-hardening.md",
    "docs/humi-1.1-miniprogram-share-card-qa.md",
    "docs/humi-1.1-release-operator-handoff.md",
    "docs/miniprogram-platform-submit-runbook.md",
    "docs/launch-day-runbook.md",
    "docs/humi-1.1-release-evidence-log.md",
    "docs/humi-1.1-gray-release-tracker.md",
  ],
  releaseNextSummary: extractCurrentStage(next.stdout),
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exit(1);

function determineCurrentPhase({ release, openHardeningItems, missingSections, statusOk }) {
  if (release.releaseComplete) {
    return {
      key: "complete",
      title: "1.1 发布证据闭环已完成",
      description: "可以把 Humi 1.1 标记为正式完成，并进入灰度反馈复盘。",
      nextCommands: [
        "npm run release:complete:check",
        "npm run release:status",
      ],
      userConfirmationsRequired: [],
    };
  }

  if (openHardeningItems.length) {
    return {
      key: "pre-review-hardening",
      title: "提审前产品打磨",
      description: "三份策划书主体已收口，但 P0/P1 hardening 尚未全部完成，不能提交微信审核。",
      nextCommands: [
        "npm run release:pre-review:evidence",
        "npm run release:wechat:share:doctor",
        "npm run release:wechat:share:devtools",
        "npm run release:wechat:share:direct-previews",
        "npm run release:wechat:share:cards:capture -- --interactive",
        "npm run release:wechat:share:cards:import -- --source-dir /path/to/card-screenshots",
        "npm run release:wechat:share:evidence",
        "npm run release:wechat:share:complete",
        "npm run release:next",
      ],
      userConfirmationsRequired: [
        "视觉确认三张微信原生分享卡片确实符合 crave/invite/grocery 预期。",
      ],
    };
  }

  if (!statusOk) {
    return {
      key: "engineering-gate",
      title: "工程提审门禁未通过",
      description: "P0/P1 已完成，但工程状态、线上状态、API 预检、安全审计或发布材料仍有失败项。",
      nextCommands: [
        "npm run release:status",
        "npm run release:spec:audit",
        "npm run release:security:audit",
        "npm run release:check:online",
        "npm run monitor:prod",
        "npm run deploy:api:check",
      ],
      userConfirmationsRequired: [],
    };
  }

  if (missingSections.includes("## 4. 微信公众平台提交审核证据")) {
    return {
      key: "wechat-submit",
      title: "等待微信公众平台提交审核",
      description: "本地工程已可进入提交准备，但提交审核会改变外部平台状态，需要用户动作级确认。",
      nextCommands: [
        "npm run release:wechat:start-submit",
        "npm run release:wechat:prepare-submit",
        "npm run release:wechat:check",
        "npm run release:wechat:copy",
        "npm run release:evidence:record:submit:latest",
      ],
      userConfirmationsRequired: [
        `确认在微信公众平台提交 ${WECHAT_SUBMIT_VERSION} 审核。`,
        "确认提交审核后登记私有证据目录。",
      ],
    };
  }

  if (missingSections.includes("## 5. 审核结果证据")) {
    return {
      key: "wechat-review",
      title: "等待微信审核结果",
      description: "提交审核证据已登记后，下一步是等待审核通过或驳回，并登记结果。",
      nextCommands: [
        "npm run release:evidence:commands -- review",
        "npm run release:next",
      ],
      userConfirmationsRequired: [
        "确认微信后台审核结果和原始驳回/通过信息。",
      ],
    };
  }

  if (missingSections.includes("## 6. 审核通过后发布证据")) {
    return {
      key: "wechat-publish",
      title: "等待审核通过后发布",
      description: "发布会改变线上小程序状态，需要用户动作级确认。",
      nextCommands: [
        "npm run release:evidence:commands -- publish",
        "npm run release:next",
      ],
      userConfirmationsRequired: [
        `确认在微信公众平台发布审核通过的 ${WECHAT_SUBMIT_VERSION}。`,
      ],
    };
  }

  if (missingSections.includes("## 7. 发布后 P0 真机验收证据")) {
    return {
      key: "real-device-p0",
      title: "等待发布后 P0 真机验收",
      description: "小程序发布后必须用真实微信验证普通启动和三类协作卡片。",
      nextCommands: [
        "npm run release:evidence:commands -- p0",
        "npm run release:next",
      ],
      userConfirmationsRequired: [
        "确认发布后真机 P0 路径全部通过，或记录 P0/P1 问题。",
      ],
    };
  }

  if (missingSections.includes("## 8. 24 小时监控证据")) {
    return {
      key: "monitoring",
      title: "等待 24 小时监控证据",
      description: "发布后仍需登记 24 小时线上监控结论，才能宣布 1.1 完成。",
      nextCommands: [
        "npm run monitor:prod",
        "npm run release:evidence:commands -- monitor",
        "npm run release:complete:check",
      ],
      userConfirmationsRequired: [
        "确认 24 小时内没有 P0/P1 发布事故，或记录处理结论。",
      ],
    };
  }

  return {
    key: "unknown",
    title: "状态未能归类",
    description: "请查看 release:status 和 release:next 的原始输出。",
    nextCommands: [
      "npm run release:status",
      "npm run release:next",
      "npm run release:complete:check",
    ],
    userConfirmationsRequired: [],
  };
}

function buildBlockers({ git, release, openHardeningItems, shareEvidence, missingReleaseEvidence }) {
  const blockers = [];
  if (!git.clean || !git.syncedToOriginMain) {
    blockers.push({
      key: "git",
      title: "产品仓库未干净同步",
      details: [`clean=${Boolean(git.clean)}`, `syncedToOriginMain=${Boolean(git.syncedToOriginMain)}`],
    });
  }
  if (openHardeningItems.length) {
    blockers.push({
      key: "pre-review-hardening",
      title: "提审前 P0/P1 尚未完成",
      details: openHardeningItems,
    });
  }
  if (shareEvidence?.missingFiles?.length) {
    blockers.push({
      key: "share-card-evidence",
      title: "小程序分享截图证据未齐",
      details: shareEvidence.missingFiles,
    });
  }
  if (!release.apiDeployReady) {
    blockers.push({
      key: "api-deploy",
      title: "API 部署预检未通过",
      details: ["Run npm run deploy:api:check for details."],
    });
  }
  if (!release.securityAuditReady) {
    blockers.push({
      key: "security-audit",
      title: "依赖安全审计未通过",
      details: ["Run npm run release:security:audit for details."],
    });
  }
  if (missingReleaseEvidence.length) {
    blockers.push({
      key: "release-evidence",
      title: "外部审核/发布/真机/监控证据未齐",
      details: missingReleaseEvidence.map((item) => item.section),
    });
  }
  return blockers;
}

function hasArtifact(status, name) {
  return Boolean(status?.requiredArtifacts?.find((item) => item.name === name && item.ok));
}

async function runJsonScript(scriptName, { allowFailure }) {
  const result = await runTextScript(scriptName, { allowFailure });
  return parseLastJson(result.stdout);
}

async function runTextScript(scriptName, { allowFailure }) {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName], {
      env: process.env,
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 12,
    });
    return { stdout, stderr };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
    };
  }
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractCurrentStage(output) {
  const line = String(output || "")
    .split("\n")
    .find((item) => item.startsWith("当前阶段："));
  return line ? line.replace("当前阶段：", "").trim() : "unknown";
}

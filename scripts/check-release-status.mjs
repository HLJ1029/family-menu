import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runNpmScript(scriptName) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      name: scriptName,
      ok: true,
      ms: Date.now() - startedAt,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      data: parseLastJson(stdout),
    };
  } catch (error) {
    return {
      name: scriptName,
      ok: false,
      ms: Date.now() - startedAt,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
      error: error.message,
      data: parseLastJson(error.stdout || ""),
    };
  }
}

async function gitInfo() {
  const [branch, head, originHead, status] = await Promise.all([
    run("git", ["branch", "--show-current"]),
    run("git", ["rev-parse", "--short", "HEAD"]),
    run("git", ["rev-parse", "--short", "origin/main"]),
    run("git", ["status", "--porcelain"]),
  ]);
  return {
    branch: branch.stdout,
    head: head.stdout,
    originMain: originHead.stdout,
    clean: status.stdout.length === 0,
    syncedToOriginMain: head.stdout === originHead.stdout,
  };
}

async function run(command, args) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
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

const [
  git,
  online,
  production,
  apiDeploy,
  securityAudit,
  docsFreshness,
  wechatSubmitWorkspaceGuard,
  specAudit,
  releaseEvidence,
] = await Promise.all([
  gitInfo(),
  runNpmScript("release:check:online"),
  runNpmScript("monitor:prod"),
  runNpmScript("deploy:api:check"),
  runNpmScript("release:security:audit"),
  runNpmScript("release:docs:check"),
  runNpmScript("release:wechat:prepare-submit:selftest"),
  runNpmScript("release:spec:audit"),
  runNpmScript("release:evidence:check"),
]);
const artifacts = await requiredArtifactInfo();
const preReviewHardening = await preReviewHardeningInfo();

const apiDeployFailedChecks = apiDeploy.data?.checks?.filter((item) => !item.ok) ?? [];
const apiDeployOnlySshBlocked = apiDeployFailedChecks.length === 1 && apiDeployFailedChecks[0]?.name === "ssh-access";
const productionOk = Boolean(production.data?.ok);
const onlineOk = online.ok;
const artifactsOk = artifacts.every((item) => item.ok);
const securityAuditOk = securityAudit.ok;
const docsFreshnessOk = docsFreshness.ok;
const wechatSubmitWorkspaceGuardOk = wechatSubmitWorkspaceGuard.ok;
const specAuditOk = specAudit.ok;
const preReviewHardeningReady = preReviewHardening.ok;
const platformSubmitReady = git.clean && git.syncedToOriginMain && onlineOk && productionOk && artifactsOk && securityAuditOk && docsFreshnessOk && wechatSubmitWorkspaceGuardOk && specAuditOk;
const apiDeployReady = apiDeploy.ok;
const releaseEvidenceReady = releaseEvidence.ok;
const releaseComplete = platformSubmitReady && apiDeployReady && preReviewHardeningReady && releaseEvidenceReady;

const nextActions = [];
if (!git.clean || !git.syncedToOriginMain) {
  nextActions.push("Clean and sync local main with origin/main.");
}
if (!onlineOk || !productionOk) {
  nextActions.push("Fix H5/API online readiness before submitting the mini program.");
}
if (!artifactsOk) {
  nextActions.push("Restore missing release runbooks/templates before platform submission.");
}
if (!securityAuditOk) {
  nextActions.push("Resolve npm audit advisories before WeChat review.");
}
if (!docsFreshnessOk) {
  nextActions.push("Fix stale release-doc wording before relying on the release action map.");
}
if (!wechatSubmitWorkspaceGuardOk) {
  nextActions.push("Restore release:wechat:prepare-submit confirmation guard before relying on WeChat review preparation.");
}
if (!specAuditOk) {
  nextActions.push("Fix docs/humi-1.1-spec-acceptance-audit.md coverage before claiming the 1.1 spec scope is implemented.");
}
if (!preReviewHardeningReady) {
  nextActions.push("Finish docs/humi-1.1-pre-review-hardening.md P0/P1 product hardening before WeChat review.");
}
if (apiDeployOnlySshBlocked) {
  nextActions.push("Restore SSH access to api.humi-home.com, then run npm run deploy:api:check and docs/humi-api-production-deploy-runbook.md.");
} else if (!apiDeployReady) {
  nextActions.push("Resolve deploy:api:check failures before API deployment.");
}
if (platformSubmitReady && preReviewHardeningReady) {
  nextActions.push("Engineering gates are ready for WeChat review preparation; wait for user confirmation before any platform submit action.");
}
if (!releaseEvidenceReady) {
  nextActions.push("After user-confirmed WeChat submit, approval, publish, real-device P0 checks, and 24h monitoring, fill docs/humi-1.1-release-evidence-log.md and rerun npm run release:evidence:check.");
}
if (releaseComplete) {
  nextActions.push("Humi 1.1 release evidence is complete. Update AI-HQ Humi STATUS with final release and monitoring conclusions.");
}

console.log(JSON.stringify({
  ok: platformSubmitReady && apiDeployReady && preReviewHardeningReady,
  checkedAt: new Date().toISOString(),
  git,
  release: {
    onlineReady: onlineOk,
    productionMonitorOk: productionOk,
    apiDeployReady,
    apiDeployOnlySshBlocked,
    securityAuditReady: securityAuditOk,
    docsFreshnessReady: docsFreshnessOk,
    wechatSubmitWorkspaceGuardReady: wechatSubmitWorkspaceGuardOk,
    specAcceptanceAuditReady: specAuditOk,
    preReviewHardeningReady,
    preReviewHardeningOpenItems: preReviewHardening.openItems,
    artifactsReady: artifactsOk,
    releaseEvidenceReady,
    releaseComplete,
    miniProgramUploadedVersion: "1.1.59",
    miniProgramUploadDescription: "原生分享确认页",
  },
  requiredArtifacts: artifacts,
  preReviewHardening,
  checks: [
    summarizeCheck(online),
    summarizeCheck(production),
    summarizeCheck(apiDeploy),
    summarizeCheck(securityAudit),
    summarizeCheck(docsFreshness),
    summarizeCheck(wechatSubmitWorkspaceGuard),
    summarizeCheck(specAudit),
    summarizeCheck(releaseEvidence),
  ],
  nextActions,
}, null, 2));

function summarizeCheck(check) {
  return {
    name: check.name,
    ok: check.ok,
    ms: check.ms,
    error: check.ok ? undefined : check.error,
    data: check.data,
  };
}

async function preReviewHardeningInfo() {
  const path = process.env.HUMI_PRE_REVIEW_HARDENING_PATH || "docs/humi-1.1-pre-review-hardening.md";
  try {
    const content = await readFile(path, "utf8");
    const openItems = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^- \[ \] P[01]\b/.test(line));
    return {
      path,
      ok: openItems.length === 0,
      openItems,
    };
  } catch (error) {
    return {
      path,
      ok: false,
      openItems: ["P0 pre-review hardening checklist is missing."],
      error: error.message,
    };
  }
}

async function requiredArtifactInfo() {
  const required = [
    {
      name: "specAcceptanceAudit",
      path: "docs/humi-1.1-spec-acceptance-audit.md",
    },
    {
      name: "closureMap",
      path: "docs/humi-1.1-closure-map.md",
    },
    {
      name: "apiDeployRunbook",
      path: "docs/humi-api-production-deploy-runbook.md",
    },
    {
      name: "miniProgramSubmitRunbook",
      path: "docs/miniprogram-platform-submit-runbook.md",
    },
    {
      name: "wechatSubmitCopyPacket",
      path: "docs/wechat-submit-copy-packet.md",
    },
    {
      name: "miniProgramShareCardQa",
      path: "docs/humi-1.1-miniprogram-share-card-qa.md",
    },
    {
      name: "grayReleaseTracker",
      path: "docs/humi-1.1-gray-release-tracker.md",
    },
    {
      name: "releaseOperatorHandoff",
      path: "docs/humi-1.1-release-operator-handoff.md",
    },
    {
      name: "releaseEvidenceLog",
      path: "docs/humi-1.1-release-evidence-log.md",
    },
    {
      name: "launchDayRunbook",
      path: "docs/launch-day-runbook.md",
    },
    {
      name: "feedbackBacklog",
      path: "docs/launch-feedback-and-101-backlog.md",
    },
  ];
  return Promise.all(required.map(async (item) => {
    try {
      await access(item.path);
      return { ...item, ok: true };
    } catch (error) {
      return { ...item, ok: false, error: error.message };
    }
  }));
}

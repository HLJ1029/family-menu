import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
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

const [git, online, production, apiDeploy, releaseEvidence] = await Promise.all([
  gitInfo(),
  runNpmScript("release:check:online"),
  runNpmScript("monitor:prod"),
  runNpmScript("deploy:api:check"),
  runNpmScript("release:evidence:check"),
]);
const artifacts = await requiredArtifactInfo();

const apiDeployFailedChecks = apiDeploy.data?.checks?.filter((item) => !item.ok) ?? [];
const apiDeployOnlySshBlocked = apiDeployFailedChecks.length === 1 && apiDeployFailedChecks[0]?.name === "ssh-access";
const productionOk = Boolean(production.data?.ok);
const onlineOk = online.ok;
const artifactsOk = artifacts.every((item) => item.ok);
const platformSubmitReady = git.clean && git.syncedToOriginMain && onlineOk && productionOk && artifactsOk;
const apiDeployReady = apiDeploy.ok;
const releaseEvidenceReady = releaseEvidence.ok;
const releaseComplete = platformSubmitReady && apiDeployReady && releaseEvidenceReady;

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
if (apiDeployOnlySshBlocked) {
  nextActions.push("Restore SSH access to api.humi-home.com, then run npm run deploy:api:check and docs/humi-api-production-deploy-runbook.md.");
} else if (!apiDeployReady) {
  nextActions.push("Resolve deploy:api:check failures before API deployment.");
}
if (platformSubmitReady) {
  nextActions.push("Use docs/miniprogram-platform-submit-runbook.md to submit WeChat review; final platform action requires user confirmation.");
}
if (!releaseEvidenceReady) {
  nextActions.push("After WeChat approval, publish 1.1.54, run real-device P0 checks, fill docs/humi-1.1-release-evidence-log.md, then rerun npm run release:evidence:check.");
}
if (releaseComplete) {
  nextActions.push("Humi 1.1 release evidence is complete. Update AI-HQ Humi STATUS with final release and monitoring conclusions.");
}

console.log(JSON.stringify({
  ok: platformSubmitReady && apiDeployReady,
  checkedAt: new Date().toISOString(),
  git,
  release: {
    onlineReady: onlineOk,
    productionMonitorOk: productionOk,
    apiDeployReady,
    apiDeployOnlySshBlocked,
    artifactsReady: artifactsOk,
    releaseEvidenceReady,
    releaseComplete,
    miniProgramUploadedVersion: "1.1.54",
    miniProgramUploadDescription: "征集加入状态同步",
  },
  requiredArtifacts: artifacts,
  checks: [
    summarizeCheck(online),
    summarizeCheck(production),
    summarizeCheck(apiDeploy),
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

async function requiredArtifactInfo() {
  const required = [
    {
      name: "specAcceptanceAudit",
      path: "docs/humi-1.1-spec-acceptance-audit.md",
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

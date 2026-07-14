import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const completionSelftestAllowDirty = process.env.HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY === "1" && Boolean(process.env.HUMI_EVIDENCE_LOG_PATH);
const skipCandidatePrepareSelftest = process.env.HUMI_CANDIDATE_PREPARE_SELFTEST === "1" || process.env.HUMI_RELEASE_STATUS_SKIP_CANDIDATE_PREPARE_SELFTEST === "1";
const skipProductSmoke = completionSelftestAllowDirty || process.env.HUMI_RELEASE_STATUS_SKIP_PRODUCT_SMOKE === "1";

async function runNpmScript(scriptName, { timeoutMs = 60_000 } = {}) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName], {
      timeout: timeoutMs,
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

async function runOptionalNpmScript(scriptName, { skip, reason, timeoutMs }) {
  if (skip) {
    return {
      name: scriptName,
      ok: true,
      ms: 0,
      stdout: "",
      stderr: "",
      skipped: true,
      data: {
        ok: true,
        skipped: true,
        reason,
      },
    };
  }
  return runNpmScript(scriptName, { timeoutMs });
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
    clean: status.stdout.length === 0 || completionSelftestAllowDirty,
    cleanOverride: status.stdout.length === 0 ? undefined : completionSelftestAllowDirty ? "completion-selftest" : undefined,
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
  paletteValidation,
  productReview,
  productSmoke,
  collaborationSmoke,
  candidateHardening,
  candidateValidationReview,
  candidatePrepareSelftest,
  candidateFormsPreviewSelftest,
  candidatePlanSelftest,
  candidateDispatchSelftest,
  candidateDispatchWorkbenchSelftest,
  candidateInviteSelftest,
  candidateDeskSelftest,
  candidateRecordDraftSelftest,
  candidateRecordSelftest,
  candidateDailySelftest,
  candidateDayCloseSelftest,
  candidatePrivacyCheck,
  candidatePrivacySelftest,
  candidateReviewSelftest,
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
  runNpmScript("validate:palette"),
  runNpmScript("release:product:review"),
  runOptionalNpmScript("release:product:smoke", {
    skip: skipProductSmoke,
    reason: "skip production H5 Playwright smoke during release completion selftests",
    timeoutMs: 150_000,
  }),
  runOptionalNpmScript("release:collaboration:smoke", {
    skip: skipProductSmoke,
    reason: "skip production H5 collaboration landing smoke during release completion selftests",
  }),
  runNpmScript("release:candidate:check"),
  runNpmScript("release:candidate:review"),
  runOptionalNpmScript("release:candidate:prepare:selftest", {
    skip: skipCandidatePrepareSelftest,
    reason: "skip candidate prepare selftest while candidate prepare is calling release:status",
    timeoutMs: 150_000,
  }),
  runNpmScript("release:candidate:forms:preview:selftest"),
  runNpmScript("release:candidate:plan:selftest"),
  runNpmScript("release:candidate:dispatch:selftest"),
  runNpmScript("release:candidate:dispatch:workbench:selftest"),
  runNpmScript("release:candidate:invite:selftest"),
  runNpmScript("release:candidate:desk:selftest"),
  runNpmScript("release:candidate:record:draft:selftest"),
  runNpmScript("release:candidate:record:selftest"),
  runNpmScript("release:candidate:daily:selftest"),
  runNpmScript("release:candidate:day:close:selftest"),
  runNpmScript("release:candidate:privacy:check"),
  runNpmScript("release:candidate:privacy:selftest"),
  runNpmScript("release:candidate:review:selftest"),
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
const paletteValidationOk = paletteValidation.ok;
const productReviewOk = productReview.ok;
const productSmokeOk = productSmoke.ok;
const collaborationSmokeOk = collaborationSmoke.ok;
const candidateHardeningOk = candidateHardening.ok;
const candidateValidationReady = candidateValidationReview.ok;
const candidatePrepareSelftestOk = candidatePrepareSelftest.ok;
const candidateFormsPreviewSelftestOk = candidateFormsPreviewSelftest.ok;
const candidatePlanSelftestOk = candidatePlanSelftest.ok;
const candidateDispatchSelftestOk = candidateDispatchSelftest.ok;
const candidateDispatchWorkbenchSelftestOk = candidateDispatchWorkbenchSelftest.ok;
const candidateInviteSelftestOk = candidateInviteSelftest.ok;
const candidateDeskSelftestOk = candidateDeskSelftest.ok;
const candidateRecordDraftSelftestOk = candidateRecordDraftSelftest.ok;
const candidateRecordSelftestOk = candidateRecordSelftest.ok;
const candidateDailySelftestOk = candidateDailySelftest.ok;
const candidateDayCloseSelftestOk = candidateDayCloseSelftest.ok;
const candidatePrivacyOk = candidatePrivacyCheck.ok;
const candidatePrivacySelftestOk = candidatePrivacySelftest.ok;
const candidateReviewSelftestOk = candidateReviewSelftest.ok;
const wechatSubmitWorkspaceGuardOk = wechatSubmitWorkspaceGuard.ok;
const specAuditOk = specAudit.ok;
const preReviewHardeningReady = preReviewHardening.ok;
const engineeringGatesReady = git.clean && git.syncedToOriginMain && onlineOk && productionOk && artifactsOk && securityAuditOk && docsFreshnessOk && paletteValidationOk && productReviewOk && productSmokeOk && collaborationSmokeOk && candidateHardeningOk && candidatePrepareSelftestOk && candidateFormsPreviewSelftestOk && candidatePlanSelftestOk && candidateDispatchSelftestOk && candidateDispatchWorkbenchSelftestOk && candidateInviteSelftestOk && candidateDeskSelftestOk && candidateRecordDraftSelftestOk && candidateRecordSelftestOk && candidateDailySelftestOk && candidateDayCloseSelftestOk && candidatePrivacyOk && candidatePrivacySelftestOk && candidateReviewSelftestOk && wechatSubmitWorkspaceGuardOk && specAuditOk;
const platformSubmitReady = engineeringGatesReady && candidateValidationReady;
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
if (!paletteValidationOk) {
  nextActions.push("Remove non-neutral UI colors before treating the 1.1 design system as closed.");
}
if (!productReviewOk) {
  nextActions.push("Fix release:product:review failures before claiming the 1.1 product review anchors are covered.");
}
if (!productSmokeOk) {
  nextActions.push("Fix release:product:smoke failures before relying on the production H5 discovery and user-center collaboration entrypoints.");
}
if (!collaborationSmokeOk) {
  nextActions.push("Fix release:collaboration:smoke failures before relying on guest crave, grocery, and invite landing flows.");
}
if (!candidateHardeningOk) {
  nextActions.push("Fix release:candidate:check failures before claiming the 1.1 production candidate is ready for internal validation.");
}
if (!candidatePrepareSelftestOk) {
  nextActions.push("Fix release:candidate:prepare:selftest before relying on private candidate packet generation.");
}
if (!candidateFormsPreviewSelftestOk) {
  nextActions.push("Fix release:candidate:forms:preview:selftest before relying on candidate form design previews.");
}
if (!candidatePlanSelftestOk) {
  nextActions.push("Fix release:candidate:plan:selftest before relying on candidate day planning.");
}
if (!candidateDispatchSelftestOk) {
  nextActions.push("Fix release:candidate:dispatch:selftest before relying on candidate daily dispatch packs.");
}
if (!candidateDispatchWorkbenchSelftestOk) {
  nextActions.push("Fix release:candidate:dispatch:workbench:selftest before relying on the private candidate dispatch workbench.");
}
if (!candidateInviteSelftestOk) {
  nextActions.push("Fix release:candidate:invite:selftest before relying on candidate invitation status updates.");
}
if (!candidateDeskSelftestOk) {
  nextActions.push("Fix release:candidate:desk:selftest before relying on the private candidate execution desk.");
}
if (!candidateRecordDraftSelftestOk) {
  nextActions.push("Fix release:candidate:record:draft:selftest before relying on private candidate feedback draft generation.");
}
if (!candidateRecordSelftestOk) {
  nextActions.push("Fix release:candidate:record:selftest before relying on private candidate feedback writeback.");
}
if (!candidateDailySelftestOk) {
  nextActions.push("Fix release:candidate:daily:selftest before relying on private candidate daily review writeback.");
}
if (!candidateDayCloseSelftestOk) {
  nextActions.push("Fix release:candidate:day:close:selftest before relying on private candidate day closeout.");
}
if (!candidatePrivacyOk) {
  nextActions.push("Remove PII from the private candidate validation packet before continuing internal validation.");
}
if (!candidatePrivacySelftestOk) {
  nextActions.push("Fix release:candidate:privacy:selftest before relying on private candidate packet privacy checks.");
}
if (!candidateReviewSelftestOk) {
  nextActions.push("Fix release:candidate:review:selftest before relying on private candidate validation review results.");
}
if (!candidateValidationReady) {
  const recommendation = candidateValidationReview.data?.recommendation;
  if (recommendation === "wait-for-validation-input") {
    nextActions.push("Fill the private candidate validation packet with real anonymous U001-U020 feedback before WeChat review preparation.");
  } else if (recommendation === "wait-for-more-validation") {
    nextActions.push("Continue candidate validation until it reaches 10 experienced users, 8 completed Tonight menus, 8 completed grocery lists, and 3 collaboration samples.");
  } else if (recommendation === "stop-and-fix-p0" || recommendation === "triage-p1-before-review") {
    nextActions.push("Fix or explicitly triage candidate P0/P1 findings before WeChat review preparation.");
  } else {
    nextActions.push("Run npm run release:candidate:prepare and npm run release:candidate:review before WeChat review preparation.");
  }
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
if (engineeringGatesReady && preReviewHardeningReady && candidateValidationReady) {
  nextActions.push("Engineering and candidate validation gates are ready for WeChat review preparation; wait for user confirmation before any platform submit action.");
} else if (engineeringGatesReady && preReviewHardeningReady && !candidateValidationReady) {
  nextActions.push("Engineering gates are healthy, but real candidate validation is not complete; keep 1.1 in production-candidate validation.");
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
    neutralPaletteReady: paletteValidationOk,
    engineeringGatesReady,
    productReviewReady: productReviewOk,
    productSmokeReady: productSmokeOk,
    collaborationSmokeReady: collaborationSmokeOk,
    candidateHardeningReady: candidateHardeningOk,
    candidateValidationReady,
    candidatePrepareSelftestReady: candidatePrepareSelftestOk,
    candidateFormsPreviewSelftestReady: candidateFormsPreviewSelftestOk,
    candidatePlanSelftestReady: candidatePlanSelftestOk,
    candidateDispatchSelftestReady: candidateDispatchSelftestOk,
    candidateDispatchWorkbenchSelftestReady: candidateDispatchWorkbenchSelftestOk,
    candidateInviteSelftestReady: candidateInviteSelftestOk,
    candidateDeskSelftestReady: candidateDeskSelftestOk,
    candidateRecordDraftSelftestReady: candidateRecordDraftSelftestOk,
    candidateRecordSelftestReady: candidateRecordSelftestOk,
    candidateDailySelftestReady: candidateDailySelftestOk,
    candidateDayCloseSelftestReady: candidateDayCloseSelftestOk,
    candidatePrivacyReady: candidatePrivacyOk,
    candidatePrivacySelftestReady: candidatePrivacySelftestOk,
    candidateReviewSelftestReady: candidateReviewSelftestOk,
    wechatSubmitWorkspaceGuardReady: wechatSubmitWorkspaceGuardOk,
    specAcceptanceAuditReady: specAuditOk,
    preReviewHardeningReady,
    preReviewHardeningOpenItems: preReviewHardening.openItems,
    artifactsReady: artifactsOk,
    releaseEvidenceReady,
    releaseComplete,
    miniProgramUploadedVersion: "1.1.61",
    miniProgramUploadDescription: "核心菜单与家庭协作验收版",
  },
  requiredArtifacts: artifacts,
  preReviewHardening,
  checks: [
    summarizeCheck(online),
    summarizeCheck(production),
    summarizeCheck(apiDeploy),
    summarizeCheck(securityAudit),
    summarizeCheck(docsFreshness),
    summarizeCheck(paletteValidation),
    summarizeCheck(productReview),
    summarizeCheck(productSmoke),
    summarizeCheck(collaborationSmoke),
    summarizeCheck(candidateHardening),
    summarizeCheck(candidateValidationReview),
    summarizeCheck(candidatePrepareSelftest),
    summarizeCheck(candidateFormsPreviewSelftest),
    summarizeCheck(candidatePlanSelftest),
    summarizeCheck(candidateDispatchSelftest),
    summarizeCheck(candidateDispatchWorkbenchSelftest),
    summarizeCheck(candidateInviteSelftest),
    summarizeCheck(candidateDeskSelftest),
    summarizeCheck(candidateRecordDraftSelftest),
    summarizeCheck(candidateRecordSelftest),
    summarizeCheck(candidateDailySelftest),
    summarizeCheck(candidateDayCloseSelftest),
    summarizeCheck(candidatePrivacyCheck),
    summarizeCheck(candidatePrivacySelftest),
    summarizeCheck(candidateReviewSelftest),
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

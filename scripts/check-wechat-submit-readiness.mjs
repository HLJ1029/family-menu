import { CURRENT_MINIPROGRAM_VERSION } from "./release-candidate.mjs";
import { runWechatReleaseStatus } from "./lib/wechat-submit-readiness-runner.mjs";

const execution = await runWechatReleaseStatus();
if (!execution.ok) {
  console.log(JSON.stringify({
    ok: false,
    checkedAt: new Date().toISOString(),
    code: execution.code,
    releaseStatusOk: false,
  }, null, 2));
  process.exit(1);
}
const status = execution.status;

const ready = Boolean(
  status.ok
    && status.release?.onlineReady
    && status.release?.productionMonitorOk
    && status.release?.apiDeployReady
    && status.release?.artifactsReady,
);
const submitReady = Boolean(
  status.ok
    && status.release?.currentCandidateUploaded
    && status.git?.clean
    && status.git?.syncedToOriginMain
    && status.release?.onlineReady
    && status.release?.productionMonitorOk
    && status.release?.apiDeployReady
    && status.release?.preReviewHardeningReady
    && status.release?.productReviewReady
    && status.release?.candidateValidationReady
    && status.release?.wechatPrivacyContractReady
    && status.release?.wechatPrivacyContractSelftestReady
    && status.release?.wechatSubmitWorkspaceGuardReady
    && status.release?.artifactsReady,
);

const packet = {
  ok: submitReady,
  checkedAt: new Date().toISOString(),
  version: status.release?.miniProgramCandidateVersion ?? status.release?.miniProgramUploadedVersion,
  uploadDescription: status.release?.miniProgramUploadDescription,
  warnings: [
    ...(status.git?.clean ? [] : ["Local working tree is dirty; commit or stash engineering changes before tagging final release evidence."]),
    ...(status.git?.syncedToOriginMain ? [] : ["Local main is not synced with origin/main; push or pull before WeChat review preparation."]),
    ...(ready ? [] : ["release:status is not fully green; see releaseStatusOk=false and warnings before final release bookkeeping."]),
    ...(status.release?.preReviewHardeningReady ? [] : ["Pre-review P0/P1 hardening is not complete; do not submit WeChat review yet."]),
    ...(status.release?.productReviewReady ? [] : ["Product review anchors are not complete; run npm run release:product:review before WeChat review."]),
    ...(status.release?.candidateValidationReady ? [] : ["Real candidate validation has not passed; run npm run release:candidate:review after filling anonymous U001-U020 feedback."]),
    ...(status.release?.wechatPrivacyContractReady && status.release?.wechatPrivacyContractSelftestReady
      ? []
      : ["Native runtime and WeChat privacy declaration contract are not aligned; do not prepare review submission."]),
    ...(status.release?.wechatSubmitWorkspaceGuardReady ? [] : ["WeChat submit workspace confirmation guard is not covered; do not prepare review submission."]),
    ...(status.release?.currentCandidateUploaded
      ? []
      : status.release?.currentCandidateUploadRecorded
        ? [`Version ${CURRENT_MINIPROGRAM_VERSION} upload is recorded but this process has not verified its trusted private attestation; provide the attestation path and do not upload again.`]
        : [`Version ${CURRENT_MINIPROGRAM_VERSION} has not been uploaded; package and upload it under separate authorization before review preparation.`]),
  ],
  releaseStatusOk: ready,
  submitMaterials: [
    "docs/wechat-submit-copy-packet.md",
    "docs/miniprogram-platform-submit-runbook.md",
    "docs/miniprogram-review-materials.md",
  ],
  evidenceLog: "docs/humi-1.1-release-evidence-log.md",
  requiredPlatformChecks: [
    `Version ${CURRENT_MINIPROGRAM_VERSION} is visible in WeChat Mini Program version management.`,
    "request valid domain includes https://api.humi-home.com.",
    "web-view business domain includes https://www.humi-home.com.",
    "Privacy guide matches docs/wechat-submit-copy-packet.md.",
    "Review note uses docs/wechat-submit-copy-packet.md section 4.",
  ],
  nextActions: submitReady
    ? [
      "Wait for user confirmation before changing WeChat platform state.",
      `After confirmation, open WeChat public platform and prepare version ${CURRENT_MINIPROGRAM_VERSION} for review.`,
      "Store private screenshots outside the repo.",
      "Only after the platform submit action is completed, record submit time, submitter, review status, and private evidence location in docs/humi-1.1-release-evidence-log.md.",
    ]
    : status.nextActions,
};

console.log(JSON.stringify(packet, null, 2));

if (!submitReady) process.exit(1);

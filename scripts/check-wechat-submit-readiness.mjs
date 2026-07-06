import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync("npm", ["run", "release:status"], {
  timeout: 90_000,
  maxBuffer: 1024 * 1024 * 4,
});

const status = parseLastJson(stdout);
if (!status) {
  throw new Error("Unable to parse release:status output.");
}

const ready = Boolean(
  status.ok
    && status.release?.onlineReady
    && status.release?.productionMonitorOk
    && status.release?.apiDeployReady
    && status.release?.artifactsReady,
);
const submitReady = Boolean(
  status.ok
    && status.git?.clean
    && status.git?.syncedToOriginMain
    && status.release?.onlineReady
    && status.release?.productionMonitorOk
    && status.release?.apiDeployReady
    && status.release?.preReviewHardeningReady
    && status.release?.productReviewReady
    && status.release?.candidateValidationReady
    && status.release?.wechatSubmitWorkspaceGuardReady
    && status.release?.artifactsReady,
);

const packet = {
  ok: submitReady,
  checkedAt: new Date().toISOString(),
  version: status.release?.miniProgramUploadedVersion,
  uploadDescription: status.release?.miniProgramUploadDescription,
  warnings: [
    ...(status.git?.clean ? [] : ["Local working tree is dirty; commit or stash engineering changes before tagging final release evidence."]),
    ...(status.git?.syncedToOriginMain ? [] : ["Local main is not synced with origin/main; push or pull before WeChat review preparation."]),
    ...(ready ? [] : ["release:status is not fully green; see releaseStatusOk=false and warnings before final release bookkeeping."]),
    ...(status.release?.preReviewHardeningReady ? [] : ["Pre-review P0/P1 hardening is not complete; do not submit WeChat review yet."]),
    ...(status.release?.productReviewReady ? [] : ["Product review anchors are not complete; run npm run release:product:review before WeChat review."]),
    ...(status.release?.candidateValidationReady ? [] : ["Real candidate validation has not passed; run npm run release:candidate:review after filling anonymous U001-U020 feedback."]),
    ...(status.release?.wechatSubmitWorkspaceGuardReady ? [] : ["WeChat submit workspace confirmation guard is not covered; do not prepare review submission."]),
  ],
  releaseStatusOk: ready,
  submitMaterials: [
    "docs/wechat-submit-copy-packet.md",
    "docs/miniprogram-platform-submit-runbook.md",
    "docs/miniprogram-review-materials.md",
  ],
  evidenceLog: "docs/humi-1.1-release-evidence-log.md",
  requiredPlatformChecks: [
    "Version 1.1.59 is visible in WeChat Mini Program version management.",
    "request valid domain includes https://api.humi-home.com.",
    "web-view business domain includes https://www.humi-home.com.",
    "Privacy guide matches docs/wechat-submit-copy-packet.md.",
    "Review note uses docs/wechat-submit-copy-packet.md section 4.",
  ],
  nextActions: submitReady
    ? [
      "Wait for user confirmation before changing WeChat platform state.",
      "After confirmation, open WeChat public platform and prepare version 1.1.59 for review.",
      "Store private screenshots outside the repo.",
      "Only after the platform submit action is completed, record submit time, submitter, review status, and private evidence location in docs/humi-1.1-release-evidence-log.md.",
    ]
    : status.nextActions,
};

console.log(JSON.stringify(packet, null, 2));

if (!submitReady) process.exit(1);

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

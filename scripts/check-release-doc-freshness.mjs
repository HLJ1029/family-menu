import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import {
  CURRENT_MINIPROGRAM_DESCRIPTION,
  CURRENT_MINIPROGRAM_VERSION,
  CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
  CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION,
  CURRENT_UPLOADED_EXPERIENCE_VERSION,
  LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
  LAST_UPLOADED_EXPERIENCE_VERSION,
  NATIVE_SHELL_EXPERIENCE_DESCRIPTION,
  NATIVE_SHELL_PREVIEW_VERSION,
} from "./release-candidate.mjs";

const checks = [
  {
    path: "miniprogram/README.md",
    forbidden: ["隐私保护指引已填写"],
    required: ["隐私保护指引仍待在微信后台填写并留证"],
  },
  {
    path: "docs/miniprogram-platform-submit-runbook.md",
    forbidden: [
      "当前仍处于提审前产品打磨阶段",
      "三张微信原生分享卡片截图证据补齐并完成 P1 后",
      "以 `npm run release:wechat:prepare-submit` 输出为准",
    ],
    required: [
      "真实候选复盘尚未通过",
      "npm run release:candidate:review",
      "release.candidateValidationReady",
      "真实候选复盘未通过时它必须失败",
    ],
  },
  {
    path: "docs/humi-1.1-closure-map.md",
    forbidden: [
      "H5 部署：GitHub Pages run `",
      "GitHub Pages run `28726626647` 成功",
      "GitHub Pages run `28726737462` 成功",
      "GitHub Pages run `28744383941` 成功",
      "最后再由用户确认是否进入微信公众平台审核",
    ],
    required: [
      "真实候选复盘达标后",
      "release.candidateValidationReady",
      "npm run release:candidate:review",
      "待候选复盘达标后用户确认",
    ],
  },
  {
    path: "docs/humi-1.1-release-operator-handoff.md",
    forbidden: [
      "当前已知最新 GitHub Pages run `",
      "当前已知最新 GitHub Pages run `28726626647`",
      "当前已知最新 GitHub Pages run `28726737462`",
      "当前已知最新 GitHub Pages run `28744383941`",
      "重新运行 `npm run release:wechat:prepare-submit`",
    ],
    required: [
      "release.candidateValidationReady=false",
      "npm run release:candidate:review",
      "npm run release:candidate:plan",
      "npm run release:candidate:privacy:check",
      "候选复盘达标前",
      "不能把微信审核准备视为可执行",
    ],
  },
  {
    path: "docs/humi-1.1-release-evidence-log.md",
    forbidden: [
      "| GitHub Pages run | `",
      "| GitHub Pages run | `28726626647` / success / 1.1.59 H5 已部署 |",
      "| GitHub Pages run | `28726737462` / success / 1.1.59 H5 已部署 |",
      "| GitHub Pages run | `28744383941` / success / 1.1.59 H5 已部署 |",
      "工程侧已可准备提交微信审核",
    ],
  },
  {
    path: "docs/humi-1.1-pre-review-hardening.md",
    forbidden: [
      "确认当前处于等待用户确认的微信审核准备",
    ],
    required: [
      "release.candidateValidationReady=true",
      "npm run release:product:smoke",
      "npm run release:candidate:review",
      "候选复盘达标后",
    ],
  },
  {
    path: "docs/miniprogram-launch-readiness.md",
    forbidden: [
      "状态停在用户确认是否进入微信公众平台审核",
      "后续由用户确认后再进入微信公众平台审核",
    ],
    required: [
      "release.candidateValidationReady=false",
      "候选复盘达标后",
      "npm run release:candidate:review",
    ],
  },
  {
    path: "docs/humi-1.1-candidate-validation-forms.md",
    forbidden: [
      "真实姓名、手机号、微信号、截图和录屏可以放进仓库",
      "跳过候选内测直接进入微信审核",
    ],
    required: [
      "Humi 1.1 候选内测单据模板",
      "Humi 1.1 体验者反馈单",
      "Humi 1.1 主厨记录单",
      "candidate-feedback-import.csv",
      "daily-review.csv",
      "npm run release:candidate:plan",
      "npm run release:candidate:dispatch -- --date YYYY-MM-DD",
      "npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD",
      "npm run release:candidate:record:draft",
      "npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed",
      "npm run release:candidate:daily -- --date YYYY-MM-DD",
      "npm run release:candidate:day:close -- --date YYYY-MM-DD",
      "npm run release:candidate:privacy:check",
      "写入前会拒绝手机号、邮箱、微信号或真实姓名",
    ],
  },
];

const failures = [];
const docFixtureTarget = process.env.NODE_ENV === "test"
  ? String(process.env.HUMI_RELEASE_DOC_FIXTURE_TARGET || "")
  : "";
const docFixturePath = process.env.NODE_ENV === "test"
  ? String(process.env.HUMI_RELEASE_DOC_FIXTURE_PATH || "")
  : "";
const staleCurrentStatePhrases = [
  "当前 1.1.78 尚未封包或上传",
  "当前 1.1.75 尚未封包或上传",
];
const staleHistoricalUploadPattern = /(?:最近|当前)已上传(?:体验版)?(?:[：:\s]|是|为)*`?1\.1\.(?:74|75)(?:@[a-f0-9]{7,8})?`?/;
const currentRuntimeShort = CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT.slice(0, 7);

const currentCandidateDocs = [
  {
    path: "docs/humi-1.1-closure-map.md",
    required: [
      `当前体验版 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` 已从不可变归档上传`,
      CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
      `上一历史体验版：\`${LAST_UPLOADED_EXPERIENCE_VERSION}\``,
      "微信审核、正式发布、开关和白名单均未触发",
    ],
  },
  {
    path: "docs/humi-1.1-release-evidence-log.md",
    required: [
      `| 小程序版本 | \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` |`,
      `| 小程序描述 | \`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\` |`,
      `| 当前已上传体验版 | \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` / \`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\` / \`${CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT}\` |`,
      `| 上一历史体验版 | \`${LAST_UPLOADED_EXPERIENCE_VERSION}\` / \`Humi 原生骨架体验版 N5b（4eb3fbeb）\` / \`${LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT}\` |`,
      "未执行 preview、未提审、未发布、未开启任何开关或白名单",
    ],
  },
  {
    path: "docs/humi-1.1-release-operator-handoff.md",
    required: [
      `当前已上传体验版：\`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\`，描述 \`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\``,
      `当前体验版：\`${CURRENT_MINIPROGRAM_VERSION}\`，描述 \`${CURRENT_MINIPROGRAM_DESCRIPTION}\``,
      `上一历史体验版：\`${LAST_UPLOADED_EXPERIENCE_VERSION}\``,
      "status: uploaded-experience",
      "miniprogram_uploaded: true",
      "wechat_review_submitted: false",
      "wechat_released: false",
      "native_allowlist_enabled: false",
      "true_device_evidence: 0/56",
      CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
      LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
      "历史兼容/生产基线是 `1.1.73`",
      "平台隐私保护指引也仍待最终填写和留证",
      "private://HUMI-2026-001/n5b-1.1.78-20260802T140601Z/wechat-upload-machine-attestation.json",
      "private://HUMI-2026-001/n5c-1.1.78-20260802T143902Z-db4ca4ed",
      "当前已上传 `1.1.78`，未执行 preview、未提交审核、未发布",
    ],
  },
  {
    path: "docs/miniprogram-platform-submit-runbook.md",
    required: [
      `当前已上传体验版：\`${CURRENT_UPLOADED_EXPERIENCE_VERSION}@${currentRuntimeShort}\``,
      `上一历史体验版：\`${LAST_UPLOADED_EXPERIENCE_VERSION}\``,
      `版本描述：\`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\``,
      `wechat-submit-${CURRENT_UPLOADED_EXPERIENCE_VERSION}-*`,
      `进入版本管理选择 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` 提交审核`,
      "不等于可提审",
    ],
  },
  {
    path: "docs/wechat-submit-copy-packet.md",
    required: [
      `| 上传版本 | \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` |`,
      `| 版本描述 | \`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\` |`,
      `当前 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}@${currentRuntimeShort}\` 已从不可变归档上传为体验版`,
      `\`${LAST_UPLOADED_EXPERIENCE_VERSION}@4eb3fbeb\` 是上一历史体验版`,
      `提交版本：\`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\``,
    ],
  },
  {
    path: "docs/humi-wechat-true-device-acceptance.md",
    required: [
      `n5c-${CURRENT_UPLOADED_EXPERIENCE_VERSION}-<UTC>-<random>`,
      "private://HUMI-2026-001/n5c-1.1.78-20260802T143902Z-db4ca4ed",
      CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
    ],
  },
  {
    path: "docs/humi-1.1-candidate-validation-forms.md",
    required: [
      `当前微信体验版 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` 入口`,
      `"packageVersion": "${CURRENT_UPLOADED_EXPERIENCE_VERSION}"`,
      "入口版本来自唯一发布常量",
    ],
  },
  {
    path: "scripts/print-candidate-dispatch-workbench.mjs",
    required: [
      "CURRENT_UPLOADED_EXPERIENCE_VERSION",
      "EXPERIENCE_ENTRY",
      "历史二维码已禁用",
    ],
  },
  {
    path: "scripts/prepare-candidate-today.mjs",
    required: [
      "CURRENT_UPLOADED_EXPERIENCE_VERSION",
      "历史二维码已禁用",
    ],
  },
  {
    path: "docs/miniprogram-launch-readiness.md",
    required: [
      `小程序体验版 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\`（\`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\`）已从不可变归档上传`,
      `上一历史体验版为 \`${LAST_UPLOADED_EXPERIENCE_VERSION}@4eb3fbeb\``,
    ],
  },
  {
    path: "docs/humi-1.1-spec-acceptance-audit.md",
    required: [
      `当前已上传体验版：\`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` / \`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\``,
      `上一历史体验版为 \`${LAST_UPLOADED_EXPERIENCE_VERSION}@4eb3fbeb\``,
    ],
  },
  {
    path: "docs/humi-1.1-pre-review-hardening.md",
    required: [
      `小程序候选 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}@${currentRuntimeShort}\` 已从不可变归档上传为体验版`,
      `\`${LAST_UPLOADED_EXPERIENCE_VERSION}@4eb3fbeb\` 只作为历史证据`,
    ],
  },
  {
    path: "docs/launch-day-runbook.md",
    required: [
      `当前体验版：\`${CURRENT_MINIPROGRAM_VERSION}@${currentRuntimeShort}\``,
      `当前版本描述：\`${CURRENT_MINIPROGRAM_DESCRIPTION}\``,
    ],
  },
  {
    path: "docs/humi-api-production-deploy-runbook.md",
    required: [
      `当前已上传体验版：\`${CURRENT_UPLOADED_EXPERIENCE_VERSION}\` / \`${CURRENT_UPLOADED_EXPERIENCE_DESCRIPTION}\``,
      "未提审、未发布、未开启原生开关或白名单",
      "历史 pre-N5a 模板（仅保留作历史记录，不适用于当前 N5b-1.1.78 验证）",
      CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
      "当前 N5b-1.1.78 使用签名 attestation 验证",
      "production_api_deployed=true`、`h5_deployed=true`、`miniprogram_uploaded=true",
      "wechat-upload-machine-attestation.json",
    ],
  },
  {
    path: "docs/humi-api-contract.md",
    required: [
      `当前已上传体验版 \`${CURRENT_UPLOADED_EXPERIENCE_VERSION}@${currentRuntimeShort}\` 均使用本合同`,
      `上一历史体验版 ${LAST_UPLOADED_EXPERIENCE_VERSION}`,
      "历史兼容基线 1.1.73",
    ],
  },
];

for (const doc of currentCandidateDocs) {
  const content = await readReleaseDoc(doc.path);
  for (const phrase of doc.required) {
    if (!content.includes(phrase)) {
      failures.push({ path: doc.path, phrase: `missing ${phrase}` });
    }
  }
  for (const phrase of staleCurrentStatePhrases) {
    if (content.includes(phrase)) {
      failures.push({ path: doc.path, phrase: `stale current-state: ${phrase}` });
    }
  }
  if (staleHistoricalUploadPattern.test(content)) {
    failures.push({
      path: doc.path,
      phrase: "stale current-state: 1.1.74 must be historical rather than recent/current upload",
    });
  }
}

const staleCurrentN5bStatements = [
  {
    path: "docs/humi-api-production-deploy-runbook.md",
    pattern: /^(?!> \*\*历史 pre-N5a 模板).*当前[^\n]*(?:候选提交[^\n]*当前 `HEAD`|production_api_deployed=false[^\n]*h5_deployed=false[^\n]*miniprogram_uploaded=false)/m,
    phrase: "stale current-state: pre-N5a current-HEAD/all-false template",
  },
  {
    path: "docs/humi-1.1-release-operator-handoff.md",
    pattern: /(?:当前上传证据目录|当前[^\n]*CLI)[^\n]*1\.1\.71/,
    phrase: "stale current-state: 1.1.71 must be historical rather than current upload",
  },
];
for (const stale of staleCurrentN5bStatements) {
  const content = await readReleaseDoc(stale.path);
  if (stale.pattern.test(content)) failures.push({ path: stale.path, phrase: stale.phrase });
}

const candidateEvidence = JSON.parse(await readFile("docs/native-candidate-evidence.json", "utf8"));
const candidate = candidateEvidence?.candidate;
if (
  candidateEvidence?.schemaVersion !== 1
  || candidate?.version !== CURRENT_MINIPROGRAM_VERSION
  || candidate?.status !== "uploaded-experience"
  || candidate?.runtimeCommit !== CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT
  || candidate?.archive?.sizeBytes !== 147102
  || candidate?.archive?.sha256 !== "4cd91aa53673664b1bb05612b6766b41f393811604111f25280c8db326ce9cc7"
  || candidate?.uploadEvidence?.rawEvidenceSha256 !== "12475c024ba4096a2d0dee33a4582245eb9e7def0b8982b74f854388e554c6f3"
  || candidate?.uploadReceiptRef !== "private://HUMI-2026-001/n5b-1.1.78-20260802T140601Z/wechat-upload-machine-attestation.json"
  || candidate?.actions?.miniprogramUploaded !== true
  || candidate?.actions?.wechatReviewSubmitted !== false
  || candidate?.actions?.wechatReleased !== false
  || candidate?.actions?.nativeAllowlistEnabled !== false
  || candidate?.trueDeviceEvidence?.passed !== 0
  || candidate?.trueDeviceEvidence?.required !== 56
) {
  failures.push({
    path: "docs/native-candidate-evidence.json",
    phrase: `current ${CURRENT_MINIPROGRAM_VERSION} evidence must bind the uploaded runtime without claiming review, release, or rollout actions`,
  });
}

const uploadedExperienceEvidence = JSON.parse(
  await readFile("docs/native-uploaded-experience-evidence.json", "utf8"),
);
const uploadedExperience = uploadedExperienceEvidence?.candidate;
if (
  uploadedExperienceEvidence?.schemaVersion !== 1
  || uploadedExperience?.version !== CURRENT_UPLOADED_EXPERIENCE_VERSION
  || uploadedExperience?.status !== "uploaded-experience"
  || uploadedExperience?.runtimeCommit !== CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT
  || uploadedExperience?.archive?.sizeBytes !== 147102
  || uploadedExperience?.archive?.sha256 !== "4cd91aa53673664b1bb05612b6766b41f393811604111f25280c8db326ce9cc7"
  || uploadedExperience?.uploadEvidence?.rawEvidenceSha256 !== "12475c024ba4096a2d0dee33a4582245eb9e7def0b8982b74f854388e554c6f3"
  || uploadedExperience?.actions?.miniprogramUploaded !== true
  || uploadedExperience?.actions?.wechatReviewSubmitted !== false
  || uploadedExperience?.actions?.wechatReleased !== false
  || uploadedExperience?.actions?.nativeAllowlistEnabled !== false
  || uploadedExperience?.trueDeviceEvidence?.passed !== 0
  || uploadedExperience?.trueDeviceEvidence?.required !== 56
) {
  failures.push({
    path: "docs/native-uploaded-experience-evidence.json",
    phrase: "uploaded 1.1.78 evidence must retain its immutable N5b-only action boundaries",
  });
}

const miniProgramConfig = await readFile("miniprogram/utils/config.js", "utf8");
if (!miniProgramConfig.includes(`h5v=${NATIVE_SHELL_PREVIEW_VERSION}`)) {
  failures.push({
    path: "miniprogram/utils/config.js",
    phrase: `missing h5v=${NATIVE_SHELL_PREVIEW_VERSION}`,
  });
}

try {
  execFileSync(process.execPath, ["scripts/check-wechat-privacy-contract.mjs"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  failures.push({
    path: "docs/wechat-privacy-declaration.json",
    phrase: `runtime privacy contract failed: ${String(error.message || error)}`,
  });
}

for (const check of checks) {
  const content = await readReleaseDoc(check.path);
  for (const phrase of check.forbidden) {
    if (content.includes(phrase)) {
      failures.push({ path: check.path, phrase });
    }
  }
  for (const phrase of check.required ?? []) {
    if (!content.includes(phrase)) {
      failures.push({ path: check.path, phrase: `missing ${phrase}` });
    }
  }
}

async function readReleaseDoc(path) {
  if (docFixtureTarget === path && docFixturePath) {
    return readFile(docFixturePath, "utf8");
  }
  return readFile(path, "utf8");
}

const releaseMap = await readFile("scripts/print-release-map.mjs", "utf8");
if (!releaseMap.includes("release:product:review")) {
  failures.push({
    path: "scripts/print-release-map.mjs",
    phrase: "missing release:product:review in release map review commands",
  });
}
if (!releaseMap.includes("release:candidate:check")) {
  failures.push({
    path: "scripts/print-release-map.mjs",
    phrase: "missing release:candidate:check in release map review commands",
  });
}

const releaseNext = await readFile("scripts/print-release-next-action.mjs", "utf8");
if (!releaseNext.includes("release:candidate:check")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:check in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:prepare")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:prepare in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:prepare:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:prepare:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:forms:preview")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:forms:preview in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:forms:preview:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:forms:preview:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:doctor")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:doctor in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:plan")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:plan in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:plan:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:plan:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:dispatch")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:dispatch in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:dispatch:workbench")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:dispatch:workbench in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:dispatch:workbench:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:dispatch:workbench:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:invite")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:invite in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:desk")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:desk in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:desk:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:desk:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:record:draft")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:record:draft in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:record:draft:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:record:draft:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:review")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:review in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:review:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:review:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:privacy:check")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:privacy:check in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:privacy:selftest")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:privacy:selftest in candidate-stage action card",
  });
}
if (!releaseNext.includes("release:candidate:day:close")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing release:candidate:day:close in candidate-stage action card",
  });
}
if (!releaseNext.includes("docs/humi-1.1-candidate-validation-forms.md")) {
  failures.push({
    path: "scripts/print-release-next-action.mjs",
    phrase: "missing candidate validation forms doc in candidate-stage action card",
  });
}

const releaseStatus = await readFile("scripts/check-release-status.mjs", "utf8");
if (!releaseStatus.includes("candidateHardeningReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateHardeningReady in release status",
  });
}
if (!releaseStatus.includes("candidateReviewSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateReviewSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateDeskSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateDeskSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateRecordDraftSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateRecordDraftSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidatePrepareSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidatePrepareSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateFormsPreviewSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateFormsPreviewSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidatePlanSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidatePlanSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateDispatchSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateDispatchSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateDispatchWorkbenchSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateDispatchWorkbenchSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateDayCloseSelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateDayCloseSelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidatePrivacyReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidatePrivacyReady in release status",
  });
}
if (!releaseStatus.includes("candidatePrivacySelftestReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidatePrivacySelftestReady in release status",
  });
}
if (!releaseStatus.includes("candidateValidationReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing candidateValidationReady in release status",
  });
}
if (!releaseStatus.includes("release:candidate:review")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing real release:candidate:review in release status",
  });
}
if (!releaseStatus.includes("release:product:smoke")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing release:product:smoke in release status",
  });
}
if (!releaseStatus.includes("productSmokeReady")) {
  failures.push({
    path: "scripts/check-release-status.mjs",
    phrase: "missing productSmokeReady in release status",
  });
}

const evidenceCommands = await readFile("scripts/print-release-evidence-commands.mjs", "utf8");
for (const command of ["release:next", "release:closure", "release:evidence:check", "release:status"]) {
  if (!evidenceCommands.includes(command)) {
    failures.push({
      path: "scripts/print-release-evidence-commands.mjs",
      phrase: `missing ${command} in post-evidence checks`,
    });
  }
}

const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  scope: [
    ...checks.map((check) => check.path),
    ...currentCandidateDocs.map((doc) => doc.path),
    "miniprogram/utils/config.js",
    "scripts/print-release-map.mjs",
    "scripts/print-release-next-action.mjs",
    "scripts/check-release-status.mjs",
    "scripts/print-release-evidence-commands.mjs",
  ],
  failures,
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);

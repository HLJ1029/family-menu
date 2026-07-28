import { fileURLToPath } from "node:url";

export const PRODUCTION_COMPATIBILITY_BASELINE_VERSION = "1.1.73";
export const PRODUCTION_COMPATIBILITY_BASELINE_DESCRIPTION = "修复身份完善入口";
export const LAST_UPLOADED_EXPERIENCE_VERSION = "1.1.74";
export const LAST_UPLOADED_EXPERIENCE_DESCRIPTION = "Humi 原生骨架体验版 N5b（4eb3fbeb）";
export const LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT = "4eb3fbeb6aba886930b3fda652be96e9246eac9e";
export const CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION = "1.1.75";
export const CURRENT_LOCAL_REVIEW_CANDIDATE_DESCRIPTION = "Humi 原生骨架完整候选（fbb4938）";
export const CURRENT_UPLOADED_EXPERIENCE_RUNTIME_COMMIT = "fbb4938200ef0137c468bd37f3868b94b64b738b";

// Backward-compatible names used by release tooling point to the current
// experience candidate, never to the historical production/uploaded baselines.
export const CURRENT_MINIPROGRAM_VERSION = CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION;
export const CURRENT_MINIPROGRAM_DESCRIPTION = CURRENT_LOCAL_REVIEW_CANDIDATE_DESCRIPTION;
export const NATIVE_SHELL_PREVIEW_VERSION = CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION;
export const NATIVE_SHELL_EXPERIENCE_DESCRIPTION = CURRENT_LOCAL_REVIEW_CANDIDATE_DESCRIPTION;

export function releaseCandidateSummary() {
  return {
    productionCompatibilityBaseline: {
      version: PRODUCTION_COMPATIBILITY_BASELINE_VERSION,
      description: PRODUCTION_COMPATIBILITY_BASELINE_DESCRIPTION,
    },
    lastUploadedExperienceRuntime: {
      version: LAST_UPLOADED_EXPERIENCE_VERSION,
      description: LAST_UPLOADED_EXPERIENCE_DESCRIPTION,
      runtimeCommit: LAST_UPLOADED_EXPERIENCE_RUNTIME_COMMIT,
      reviewSubmitted: false,
      released: false,
    },
    currentLocalReviewCandidate: {
      version: CURRENT_LOCAL_REVIEW_CANDIDATE_VERSION,
      description: CURRENT_LOCAL_REVIEW_CANDIDATE_DESCRIPTION,
      uploadStatus: "uploaded",
      reviewSubmitted: false,
      released: false,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  console.log(JSON.stringify(releaseCandidateSummary(), null, 2));
}

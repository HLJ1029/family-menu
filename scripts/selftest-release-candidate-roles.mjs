import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const { stdout: candidateStdout } = await execFileAsync(
  process.execPath,
  ["scripts/release-candidate.mjs"],
  { maxBuffer: 1024 * 1024 },
);
const candidate = JSON.parse(candidateStdout);

assert.deepEqual(candidate, {
  productionCompatibilityBaseline: {
    version: "1.1.73",
    description: "修复身份完善入口",
  },
  lastUploadedExperienceRuntime: {
    version: "1.1.74",
    description: "Humi 原生骨架体验版 N5b（4eb3fbeb）",
    runtimeCommit: "4eb3fbeb6aba886930b3fda652be96e9246eac9e",
    reviewSubmitted: false,
    released: false,
  },
  currentUploadedExperience: {
    version: "1.1.75",
    description: "Humi 原生骨架完整候选（fbb4938）",
    runtimeCommit: "fbb4938200ef0137c468bd37f3868b94b64b738b",
    evidenceSource: "docs/native-candidate-evidence.json",
    recordedUploadStatus: "uploaded-experience",
    verificationStatus: "requires_runtime_attestation",
    reviewSubmitted: false,
    released: false,
  },
  currentLocalReviewCandidate: {
    compatibilityAliasFor: "currentUploadedExperience",
    version: "1.1.75",
    description: "Humi 原生骨架完整候选（fbb4938）",
    runtimeCommit: "fbb4938200ef0137c468bd37f3868b94b64b738b",
    evidenceSource: "docs/native-candidate-evidence.json",
    recordedUploadStatus: "uploaded-experience",
    verificationStatus: "requires_runtime_attestation",
    reviewSubmitted: false,
    released: false,
  },
});
assert.equal(
  Object.hasOwn(candidate.currentUploadedExperience, "uploadStatus"),
  false,
  "recorded upload state must remain distinct from runtime attestation verification",
);

const { stdout: copyStdout } = await execFileAsync(
  process.execPath,
  ["scripts/print-wechat-submit-copy.mjs"],
  { maxBuffer: 1024 * 1024 },
);
assert.match(copyStdout, /1\.1\.75/);
assert.match(copyStdout, /Humi 原生骨架完整候选（fbb4938）/);
assert.doesNotMatch(copyStdout, /提交版本[\s\S]{0,80}1\.1\.(?:73|74)/);

const submitSession = await import("./wechat-submit-evidence-session.mjs");
assert.equal(submitSession.WECHAT_SUBMIT_VERSION, "1.1.75");
assert.equal(
  submitSession.WECHAT_SUBMIT_DESCRIPTION,
  "Humi 原生骨架完整候选（fbb4938）",
);

console.log("Release candidate roles selftest passed.");

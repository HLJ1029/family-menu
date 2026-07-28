import assert from "node:assert/strict";
import {
  deriveNativeReleaseState,
  validateNativeCandidateEvidence,
  validateWechatPlatformEvidence,
} from "./lib/native-rollout-readiness-policy.mjs";

const unuploadedReleaseState = deriveNativeReleaseState({
  currentCandidate: {
    version: "1.1.75",
    uploadStatus: "not_uploaded",
    immutableArchivePresent: false,
    runtimeCommit: null,
  },
  externalActions: { miniprogram_uploaded: false, native_allowlist_enabled: false },
  platformEvidence: {
    trueDevicePassed: 0,
    trueDeviceRequired: 56,
    webViewDomainVerified: false,
    privacyDeclarationVerified: false,
  },
}, { expectedVersion: "1.1.75" });
assert.equal(unuploadedReleaseState.currentCandidateUploaded, false);
assert.equal(unuploadedReleaseState.nativeCheckpoint, "N5b_refresh_packaging_authorization");

const uploadedReleaseState = deriveNativeReleaseState({
  currentCandidate: {
    version: "1.1.75",
    uploadStatus: "uploaded",
    immutableArchivePresent: true,
    runtimeCommit: "a".repeat(40),
  },
  externalActions: { miniprogram_uploaded: true, native_allowlist_enabled: false },
  platformEvidence: {
    trueDevicePassed: 12,
    trueDeviceRequired: 56,
    webViewDomainVerified: true,
    privacyDeclarationVerified: false,
  },
}, { expectedVersion: "1.1.75" });
assert.deepEqual(uploadedReleaseState, {
  miniProgramUploadedVersion: "1.1.75",
  currentCandidateUploaded: true,
  nativeCheckpoint: "N5c_true_device_platform_evidence",
  trueDeviceEvidence: "12/56",
  nativeAllowlistEnabled: false,
  platformPrivacyDeclaration: "pending",
  webViewDomainEvidence: "verified",
});

for (const mutate of [
  (value) => { value.currentCandidate.version = "1.1.74"; },
  (value) => { value.currentCandidate.immutableArchivePresent = false; },
  (value) => { value.externalActions.miniprogram_uploaded = false; },
]) {
  const value = {
    currentCandidate: { ...uploadedReleaseState, version: "1.1.75", uploadStatus: "uploaded", immutableArchivePresent: true, runtimeCommit: "a".repeat(40) },
    externalActions: { miniprogram_uploaded: true, native_allowlist_enabled: false },
    platformEvidence: { trueDevicePassed: 0, trueDeviceRequired: 56 },
  };
  mutate(value);
  assert.equal(
    deriveNativeReleaseState(value, { expectedVersion: "1.1.75" }).currentCandidateUploaded,
    false,
  );
}

const currentUnuploaded = {
  schemaVersion: 1,
  candidate: {
    version: "1.1.75",
    status: "local-candidate",
    runtimeCommit: null,
    archive: null,
    uploadEvidence: null,
    uploadReceiptRef: null,
    actions: {
      productionApiDeployed: true,
      h5Deployed: true,
      miniprogramUploaded: false,
      wechatReviewSubmitted: false,
      wechatReleased: false,
      nativeAllowlistEnabled: false,
    },
    trueDeviceEvidence: { passed: 0, required: 56 },
  },
};

assert.deepEqual(
  validateNativeCandidateEvidence(currentUnuploaded, { expectedVersion: "1.1.75" }),
  currentUnuploaded.candidate,
);

const futureUploaded = structuredClone(currentUnuploaded);
futureUploaded.candidate.status = "uploaded-experience";
futureUploaded.candidate.runtimeCommit = "0123456789abcdef0123456789abcdef01234567";
futureUploaded.candidate.archive = {
  path: "/private/humi-native-shell-1.1.75.tar.gz",
  sha256: "a".repeat(64),
  sizeBytes: 140710,
};
futureUploaded.candidate.uploadEvidence = {
  rawEvidenceSha256: "c".repeat(64),
};
futureUploaded.candidate.uploadReceiptRef = "private://n5c/upload-receipt-1.1.75";
futureUploaded.candidate.actions.miniprogramUploaded = true;
assert.equal(
  validateNativeCandidateEvidence(futureUploaded, { expectedVersion: "1.1.75" }).actions.miniprogramUploaded,
  true,
);

for (const [name, mutate, message] of [
  ["wrong version", (value) => { value.candidate.version = "1.1.74"; }, /version must be 1\.1\.75/],
  ["uploaded without archive", (value) => { value.candidate.archive = null; }, /uploaded candidate requires archive/],
  ["uploaded archive without size", (value) => { delete value.candidate.archive.sizeBytes; }, /uploaded candidate archive must use the exact key set/],
  ["uploaded archive with invalid size", (value) => { value.candidate.archive.sizeBytes = 0; }, /uploaded candidate requires archive path, sha256, and sizeBytes/],
  ["uploaded without commit", (value) => { value.candidate.runtimeCommit = null; }, /uploaded candidate requires runtimeCommit/],
  ["uploaded without raw evidence hash", (value) => { value.candidate.uploadEvidence = null; }, /uploaded candidate requires uploadEvidence/],
  ["uploaded raw evidence hash invalid", (value) => { value.candidate.uploadEvidence.rawEvidenceSha256 = "not-a-sha"; }, /uploaded candidate requires rawEvidenceSha256/],
  ["uploaded without receipt ref", (value) => { value.candidate.uploadReceiptRef = null; }, /uploaded candidate requires uploadReceiptRef/],
  ["review already submitted", (value) => { value.candidate.actions.wechatReviewSubmitted = true; }, /wechatReviewSubmitted must remain false/],
  ["extra field", (value) => { value.candidate.extra = true; }, /exact key set/],
]) {
  const value = structuredClone(futureUploaded);
  mutate(value);
  assert.throws(
    () => validateNativeCandidateEvidence(value, { expectedVersion: "1.1.75" }),
    message,
    name,
  );
}

const platformEvidence = {
  schemaVersion: 1,
  checks: {
    requestDomain: { verified: true, status: "verified", ref: "private://n5b/request-domain" },
    downloadFileDomain: { verified: true, status: "verified", ref: "private://n5b/download-domain" },
    webViewDomain: { verified: false, status: "pending", ref: null },
    privacyDeclaration: { verified: false, status: "pending", ref: null },
    devtoolsAuthenticated: { verified: false, status: "pending", ref: null },
    productionLegacyH5Smoke: { verified: true, status: "verified", ref: "private://n5a/h5-smoke" },
  },
};

assert.deepEqual(validateWechatPlatformEvidence(platformEvidence), {
  requestDomainVerified: true,
  downloadFileDomainVerified: true,
  webViewDomainVerified: false,
  privacyDeclarationVerified: false,
  wechatDevtoolsAuthenticated: false,
  productionLegacyH5SmokeVerified: true,
});

for (const [status, verified] of [
  ["未通过", true],
  ["失败", true],
  ["blocked", true],
  ["pending", true],
  ["verified", false],
]) {
  const value = structuredClone(platformEvidence);
  value.checks.webViewDomain = { verified, status, ref: verified ? "private://bad" : null };
  assert.throws(() => validateWechatPlatformEvidence(value), /status|verified/, `${status}/${verified}`);
}

for (const mutate of [
  (value) => { value.checks.extra = { verified: false, status: "pending", ref: null }; },
  (value) => { delete value.checks.requestDomain.ref; },
  (value) => { value.schemaVersion = 2; },
]) {
  const value = structuredClone(platformEvidence);
  mutate(value);
  assert.throws(() => validateWechatPlatformEvidence(value), /schemaVersion|exact key set/);
}

console.log("Structured release evidence selftest passed.");

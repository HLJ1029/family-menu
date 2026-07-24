import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCandidateVersionIsUnused,
  extractNativeCandidateCommit,
  findForbiddenRuntimeFindings,
  resolveExternalHandoffPath,
  validateNativeCandidateState,
} from "./lib/native-rollout-readiness-policy.mjs";
import { runNativeRollbackDrill } from "./lib/native-rollout-drill.mjs";

const safeFindings = findForbiddenRuntimeFindings([
  {
    path: "miniprogram/utils/plugin-state.js",
    source: 'const pluginWord = "plugin"; const pluginReady = true; const picker = "plugin://address-picker";',
  },
]);
assert.deepEqual(safeFindings, [], "the ordinary word plugin must not be treated as an ad");

const unsafeFindings = findForbiddenRuntimeFindings([
  {
    path: "api/telemetry-secret.js",
    source: 'const HUMI_TELEMETRY_HASH_SALT = "0123456789abcdef0123456789abcdef";',
  },
  {
    path: "api/camel-secrets.js",
    source: [
      'const telemetryHashSalt = "abcdef0123456789abcdef0123456789";',
      'const wechatAppSecret = "abcdef0123456789abcdef0123456789";',
      'const apiKey = "abcdef0123456789abcdef0123456789";',
    ].join("\n"),
  },
  {
    path: "miniprogram/pages/ads/index.wxml",
    source: '<ad-banner unit-id="candidate-ad"></ad-banner><ad-slot></ad-slot>',
  },
  {
    path: "miniprogram/pages/ads/index.json",
    source: JSON.stringify({
      usingComponents: {
        promotion: "/components/ad-banner/index",
      },
    }),
  },
]);
assert.deepEqual(
  new Set(unsafeFindings.map((finding) => finding.category)),
  new Set(["credential", "ad"]),
  "hash salts, camelCase credential literals, ad-banner/ad-slot, and ad component paths must be rejected",
);
for (const expectedPath of [
  "api/telemetry-secret.js",
  "api/camel-secrets.js",
  "miniprogram/pages/ads/index.wxml",
  "miniprogram/pages/ads/index.json",
]) {
  assert(
    unsafeFindings.some((finding) => finding.path === expectedPath),
    `${expectedPath} must produce a forbidden runtime finding`,
  );
}

assert.equal(assertCandidateVersionIsUnused("1.1.74", "1.1.73"), true);
assert.throws(
  () => assertCandidateVersionIsUnused("1.1.73", "1.1.73"),
  /must be newer than uploaded production history/,
);
assert.throws(
  () => assertCandidateVersionIsUnused("1.1.72", "1.1.73"),
  /must be newer than uploaded production history/,
);
assert.equal(
  extractNativeCandidateCommit("- 提交：`d05816c00f6d490a7dcb780a9461880ff44d9cd4`"),
  "d05816c00f6d490a7dcb780a9461880ff44d9cd4",
);
assert.throws(
  () => extractNativeCandidateCommit([
    "- 提交：`d05816c00f6d490a7dcb780a9461880ff44d9cd4`",
    "- 提交：`612dac2c6e6d90de737deac314d6cc6e6a841bc9`",
  ].join("\n")),
  /exactly one candidate commit/,
);
assert.equal(
  resolveExternalHandoffPath({
    handoffPath: "  /tmp/humi-native-handoff.md  ",
    localContractOnly: false,
  }),
  "/tmp/humi-native-handoff.md",
);
assert.equal(
  resolveExternalHandoffPath({ handoffPath: "", localContractOnly: true }),
  "",
);
assert.throws(
  () => resolveExternalHandoffPath({ handoffPath: "", localContractOnly: false }),
  /HUMI_NATIVE_HANDOFF_PATH is required/,
);

const candidateYaml = [
  "```yaml",
  "native_shell_candidate:",
  "  status: preview",
  "  package_version: 1.1.74",
  "  ads: excluded",
  "  production_api_deployed: false",
  "  h5_deployed: false",
  "  miniprogram_uploaded: false",
  "  wechat_review_submitted: false",
  "  wechat_released: false",
  "  native_allowlist_enabled: false",
  "  true_device_evidence: 0/36",
  "```",
].join("\n");
assert.deepEqual(validateNativeCandidateState(candidateYaml), {
  status: "preview",
  package_version: "1.1.74",
  ads: "excluded",
  production_api_deployed: false,
  h5_deployed: false,
  miniprogram_uploaded: false,
  wechat_review_submitted: false,
  wechat_released: false,
  native_allowlist_enabled: false,
  true_device_evidence: "0/36",
});
assert.throws(
  () => validateNativeCandidateState(`${candidateYaml}\n${candidateYaml}`),
  /exactly one native_shell_candidate block/,
);
assert.throws(
  () => validateNativeCandidateState(candidateYaml.replace(
    "  h5_deployed: false",
    "  h5_deployed: false\n  h5_deployed: true",
  )),
  /duplicate candidate key/,
);
assert.throws(
  () => validateNativeCandidateState(candidateYaml.replace(
    "  wechat_released: false",
    "  wechat_released: true",
  )),
  /must remain false/,
);
assert.throws(
  () => validateNativeCandidateState(candidateYaml.replace(
    "  true_device_evidence: 0/36",
    "  true_device_evidence: 0/36\n  unreviewed_release_state: true",
  )),
  /unexpected candidate key/,
  "candidate state must use the exact reviewed key set",
);
assert.throws(
  () => validateNativeCandidateState([
    candidateYaml,
    "```yaml",
    "native_shell_candidate: { status: approved, miniprogram_uploaded: true }",
    "```",
  ].join("\n")),
  /noncanonical YAML syntax/,
  "a second flow-style candidate mapping must not hide an approved/uploaded state",
);
assert.throws(
  () => validateNativeCandidateState([
    candidateYaml,
    "```yaml",
    "release: { miniprogram_uploaded: true }",
    "```",
  ].join("\n")),
  /noncanonical YAML syntax/,
  "a flow-style release mapping must not hide an uploaded state",
);
assert.throws(
  () => validateNativeCandidateState([
    candidateYaml,
    "```yaml",
    "release:",
    "  miniprogram_uploaded: true",
    "```",
  ].join("\n")),
  /candidate key outside canonical block/,
);
assert.throws(
  () => validateNativeCandidateState([
    candidateYaml,
    "```yaml",
    "release:",
    "  status: approved",
    "```",
  ].join("\n")),
  /(?:candidate key outside canonical block|unexpected structured YAML outside canonical block)/,
);
for (const maliciousYaml of [
  "defaults: &uploaded",
  "release: *uploaded",
  "release: !uploaded true",
  "release: !<tag:example.com,2026:uploaded> true",
  "release: |\n  miniprogram_uploaded: true",
  "release: >-\n  miniprogram_uploaded: true",
  "release:\tfalse",
  "release: [miniprogram_uploaded, true]",
]) {
  assert.throws(
    () => validateNativeCandidateState(`${candidateYaml}\n\`\`\`yaml\n${maliciousYaml}\n\`\`\``),
    /noncanonical YAML syntax/,
    `noncanonical YAML must fail closed: ${maliciousYaml}`,
  );
}

const rollback = await runNativeRollbackDrill({
  root: resolve(fileURLToPath(new URL("..", import.meta.url))),
});
assert.equal(rollback.serverStarted, true, "the drill must start a real local HTTP bootstrap server");
assert.equal(rollback.requestCount, 2, "each boot must fetch a fresh bootstrap envelope");
assert.deepEqual(
  rollback.bootstrapCapabilities,
  [true, false],
  "the same server fixture must flip only nativeShellEnabled",
);
assert.deepEqual(
  rollback.authorizationHeaders,
  ["Bearer session-rollout", "Bearer session-rollout"],
  "both real bootstrap requests must use the restored Humi session",
);
assert.equal(rollback.bootExecutions, 2, "the real Boot Page controller must execute before and after rollback");
assert.deepEqual(rollback.switchTabRoutes, ["/pages/tonight/index"]);
assert.deepEqual(rollback.relaunchRoutes, ["/pages/legacy/index"]);
assert.deepEqual(
  [...rollback.removedKeys].sort(),
  [
    "humi:bootstrap:last-household:v1:user-rollout",
    "humi:household-cache:v1:user-rollout:household-rollout",
  ],
  "rollback must clear exactly the current bootstrap pointer and its one household cache",
);
assert.equal(rollback.productCachePreserved, true, "MealRun data must survive the real boot rollback");
assert.equal(rollback.serverFixtureMutations, 1, "only the mock nativeShellEnabled provider may change");
assert.equal(rollback.householdFixture, "household-rollout");
assert.equal(rollback.allowlistPreserved, true, "the rollback must not mutate the household allowlist");

console.log("Native rollout readiness selftest passed.");

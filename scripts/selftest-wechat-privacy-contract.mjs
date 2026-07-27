import assert from "node:assert/strict";
import {
  auditWechatPrivacyBehaviorConsistency,
  auditWechatPrivacyContract,
  detectRuntimeCapabilities,
} from "./lib/wechat-privacy-contract.mjs";

const runtimeFiles = [
  { path: "miniprogram/app.js", source: "wx.login({ success() {} });" },
  {
    path: "miniprogram/pages/identity/index.wxml",
    source: '<button open-type="chooseAvatar">头像</button><button open-type="getPhoneNumber">手机号</button>',
  },
  {
    path: "miniprogram/pages/identity/index.js",
    source: 'request({ path: "/identity/profile", method: "PUT", data: { nickname, avatarUrl } });',
  },
  {
    path: "miniprogram/pages/poster/index.js",
    source: "await callWxApi(wx.saveImageToPhotosAlbum, { filePath });",
  },
  {
    path: "miniprogram/pages/reminder/index.js",
    source: "wx.requestSubscribeMessage({ tmplIds });",
  },
];

const canonicalDeclaration = {
  schemaVersion: 1,
  platformDeclarationStatus: "pending",
  capabilities: [
    {
      id: "wechat_identity",
      access: "collect",
      trigger: "explicit_user_action",
      purpose: ["login", "session", "family_collaboration"],
    },
    {
      id: "nickname_avatar",
      access: "collect_and_upload",
      trigger: "explicit_user_action",
      purpose: ["family_recognition"],
    },
    {
      id: "phone_number",
      access: "optional_collect",
      trigger: "explicit_user_tap",
      purpose: ["account_binding", "account_recovery", "collaboration_security"],
    },
    {
      id: "photo_album",
      access: "write_only",
      trigger: "explicit_save",
      purpose: ["save_generated_poster"],
    },
    {
      id: "subscription_message",
      access: "one_time_request",
      trigger: "explicit_schedule_confirmation",
      purpose: ["meal_reminder"],
      rejectionBehavior: "no_schedule_no_repeat_prompt",
    },
  ],
  productData: [
    "household_membership",
    "menu_and_meal_runs",
    "grocery_and_claims",
    "preferences_allergies_feedback",
    "privacy_safe_product_events",
  ],
  absentCapabilities: [
    "location",
    "contacts",
    "camera",
    "microphone",
    "payments",
    "supabase_runtime",
    "advertising",
    "photo_album_read",
  ],
};

const verifiedBehavior = {
  ok: true,
  verifiedTriggers: {
    wechat_identity: "explicit_user_action",
    nickname_avatar: "explicit_user_action",
    photo_album: "explicit_save",
    subscription_message: "explicit_schedule_confirmation",
  },
};
assert.deepEqual(
  auditWechatPrivacyBehaviorConsistency({
    declaration: canonicalDeclaration,
    behavior: verifiedBehavior,
  }),
  { ok: true, findings: [] },
);
const contradictoryIdentityTrigger = structuredClone(canonicalDeclaration);
contradictoryIdentityTrigger.capabilities.find((item) => item.id === "wechat_identity").trigger = "automatic_login";
assertFinding(
  auditWechatPrivacyBehaviorConsistency({
    declaration: contradictoryIdentityTrigger,
    behavior: verifiedBehavior,
  }),
  "behavior_trigger_mismatch",
);

assert.deepEqual(
  auditWechatPrivacyContract({ runtimeFiles, declaration: canonicalDeclaration }),
  {
    ok: true,
    detectedCapabilities: [
      "nickname_avatar",
      "phone_number",
      "photo_album",
      "subscription_message",
      "wechat_identity",
    ],
    findings: [],
  },
);

const withoutSubscription = structuredClone(canonicalDeclaration);
withoutSubscription.capabilities = withoutSubscription.capabilities.filter(
  (item) => item.id !== "subscription_message",
);
assertFinding(
  auditWechatPrivacyContract({ runtimeFiles, declaration: withoutSubscription }),
  "undeclared_runtime_capability",
);

const bypassFixtures = [
  ["identity bracket", "const run = wx['login']; run({});", "wechat_identity"],
  ["location alias", "const sdk = wx; sdk.getLocation({});", "location"],
  ["contacts destructure", "const { chooseContact: select } = wx; select({});", "contacts"],
  ["camera property", "const camera = wx.createCameraContext; camera();", "camera"],
  ["microphone newline", "wx\n  .getRecorderManager();", "microphone"],
  ["payment bracket", "wx[`requestPayment`]({});", "payments"],
  ["album read alias", "const media = wx.chooseMedia; media({});", "photo_album_read"],
  ["advertising destructure", "const { createBannerAd } = wx; createBannerAd({});", "advertising"],
  ["identity chained function alias", "const {login:first}=wx; const second=first; second();", "wechat_identity"],
  ["payment computed string variable", "const key='requestPayment'; wx[key]();", "payments"],
];
for (const [name, source, expected] of bypassFixtures) {
  const detected = detectRuntimeCapabilities([{ path: `${name}.js`, source }]);
  assert(detected.forbidden.has(expected) || detected.capabilities.has(expected), `${name}: ${expected}`);
}

const unknownDynamicProperty = detectRuntimeCapabilities([{
  path: "unknown-dynamic-property.js",
  source: "const key = getRuntimeKey(); wx[key]();",
}]);
assert(
  unknownDynamicProperty.parseErrors.some((finding) => (
    finding.path === "unknown-dynamic-property.js"
    && finding.reason === "indeterminate_wx_property"
  )),
  "unknown dynamic wx properties must fail closed as indeterminate",
);

const overwrittenComputedProperty = detectRuntimeCapabilities([{
  path: "overwritten-computed-property.js",
  source: "let key='safeMethod'; key=getRuntimeKey(); wx[key]();",
}]);
assert(
  overwrittenComputedProperty.parseErrors.some((finding) => (
    finding.path === "overwritten-computed-property.js"
    && finding.reason === "indeterminate_wx_property"
  )),
  "a dynamic reassignment must invalidate the old static wx property key",
);

const overwrittenFunctionAlias = detectRuntimeCapabilities([{
  path: "overwritten-function-alias.js",
  source: "let invoke=wx.requestPayment; invoke=getRuntimeFunction(); invoke();",
}]);
assert(
  overwrittenFunctionAlias.parseErrors.some((finding) => (
    finding.path === "overwritten-function-alias.js"
    && finding.reason === "indeterminate_wx_function_alias"
  )),
  "a dynamic reassignment must invalidate the old wx function alias",
);

for (const tag of ["<ad></ad>", "<ad-custom />", "<AD-BANNER></AD-BANNER>", "<ad-slot></ad-slot>"]) {
  const detected = detectRuntimeCapabilities([{ path: "ad.wxml", source: tag }]);
  assert(detected.forbidden.has("advertising"), `ad tag variant must be detected: ${tag}`);
}

const contradictoryDocs = structuredClone(canonicalDeclaration);
contradictoryDocs.absentCapabilities.push("wechat_identity");
assertFinding(
  auditWechatPrivacyContract({ runtimeFiles, declaration: contradictoryDocs }),
  "false_absence_claim",
);

const falseAbsence = structuredClone(canonicalDeclaration);
falseAbsence.absentCapabilities.push("nickname_avatar");
assertFinding(
  auditWechatPrivacyContract({ runtimeFiles, declaration: falseAbsence }),
  "false_absence_claim",
);

const missingPurpose = structuredClone(canonicalDeclaration);
missingPurpose.capabilities.find((item) => item.id === "phone_number").purpose = [];
assertFinding(
  auditWechatPrivacyContract({ runtimeFiles, declaration: missingPurpose }),
  "missing_purpose",
);

const missingTrigger = structuredClone(canonicalDeclaration);
delete missingTrigger.capabilities.find((item) => item.id === "photo_album").trigger;
assertFinding(
  auditWechatPrivacyContract({ runtimeFiles, declaration: missingTrigger }),
  "missing_trigger",
);

const excessiveAlbumAccess = structuredClone(canonicalDeclaration);
excessiveAlbumAccess.capabilities.find((item) => item.id === "photo_album").access = "read_write";
assertFinding(
  auditWechatPrivacyContract({ runtimeFiles, declaration: excessiveAlbumAccess }),
  "excessive_capability",
);

assertFinding(
  auditWechatPrivacyContract({
    runtimeFiles: [
      ...runtimeFiles,
      { path: "miniprogram/pages/nearby/index.js", source: "wx.getLocation({ type: 'gcj02' });" },
    ],
    declaration: canonicalDeclaration,
  }),
  "forbidden_runtime_capability",
);

console.log("WeChat privacy contract selftest passed.");

function assertFinding(report, code) {
  assert.equal(report.ok, false);
  assert(
    report.findings.some((finding) => finding.code === code),
    `expected finding ${code}: ${JSON.stringify(report.findings)}`,
  );
}

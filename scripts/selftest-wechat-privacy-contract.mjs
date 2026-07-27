import assert from "node:assert/strict";
import { auditWechatPrivacyContract } from "./lib/wechat-privacy-contract.mjs";

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
      trigger: "automatic_login",
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

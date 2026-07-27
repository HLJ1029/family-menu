const REQUIRED_PRODUCT_DATA = Object.freeze([
  "household_membership",
  "menu_and_meal_runs",
  "grocery_and_claims",
  "preferences_allergies_feedback",
  "privacy_safe_product_events",
]);

const REQUIRED_ABSENCES = Object.freeze([
  "location",
  "contacts",
  "camera",
  "microphone",
  "payments",
  "supabase_runtime",
  "advertising",
  "photo_album_read",
]);

const CAPABILITY_CONTRACTS = Object.freeze({
  wechat_identity: {
    access: "collect",
    trigger: "automatic_login",
    purpose: ["login", "session", "family_collaboration"],
  },
  nickname_avatar: {
    access: "collect_and_upload",
    trigger: "explicit_user_action",
    purpose: ["family_recognition"],
  },
  phone_number: {
    access: "optional_collect",
    trigger: "explicit_user_tap",
    purpose: ["account_binding", "account_recovery", "collaboration_security"],
  },
  photo_album: {
    access: "write_only",
    trigger: "explicit_save",
    purpose: ["save_generated_poster"],
  },
  subscription_message: {
    access: "one_time_request",
    trigger: "explicit_schedule_confirmation",
    purpose: ["meal_reminder"],
    rejectionBehavior: "no_schedule_no_repeat_prompt",
  },
});

const CAPABILITY_PATTERNS = Object.freeze({
  wechat_identity: [/\bwx\.login\s*\(/],
  nickname_avatar: [
    /open-type\s*=\s*["']chooseAvatar["']/i,
    /type\s*=\s*["']nickname["']/i,
    /\/identity\/avatar\b/,
  ],
  phone_number: [/open-type\s*=\s*["']getPhoneNumber["']/i],
  photo_album: [/\bwx\.saveImageToPhotosAlbum\b/],
  subscription_message: [/\bwx\.requestSubscribeMessage\s*\(/],
});

const FORBIDDEN_RUNTIME_PATTERNS = Object.freeze({
  location: [/\bwx\.(?:getLocation|chooseLocation|startLocationUpdate)\s*\(/],
  contacts: [/\bwx\.(?:addPhoneContact|chooseContact)\s*\(/],
  camera: [/\bwx\.(?:createCameraContext|chooseMedia|chooseImage)\s*\(/, /<camera\b/i],
  microphone: [/\bwx\.(?:getRecorderManager|startRecord)\s*\(/],
  payments: [/\bwx\.requestPayment\s*\(/],
  photo_album_read: [/\bwx\.(?:chooseImage|chooseMedia)\s*\(/],
  supabase_runtime: [/@supabase\//i, /supabase\.co/i],
  advertising: [/\bwx\.create(?:Banner|Interstitial|RewardedVideo|Custom)Ad\s*\(/, /<ad(?:\s|>)/i],
});

export function auditWechatPrivacyContract({ runtimeFiles = [], declaration = {} } = {}) {
  const findings = [];
  const sources = runtimeFiles.map((file) => ({
    path: String(file?.path || ""),
    source: String(file?.source || ""),
  }));
  const detected = Object.entries(CAPABILITY_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => sources.some((file) => pattern.test(file.source))))
    .map(([id]) => id)
    .sort();
  const declared = new Map(
    (Array.isArray(declaration.capabilities) ? declaration.capabilities : [])
      .map((item) => [String(item?.id || ""), item]),
  );
  const absent = new Set(Array.isArray(declaration.absentCapabilities) ? declaration.absentCapabilities : []);

  if (declaration.platformDeclarationStatus !== "pending") {
    findings.push({ code: "platform_status_must_remain_pending" });
  }

  for (const capability of detected) {
    if (!declared.has(capability)) {
      findings.push({ code: "undeclared_runtime_capability", capability });
      continue;
    }
    if (absent.has(capability)) {
      findings.push({ code: "false_absence_claim", capability });
    }
  }

  for (const [capability, expected] of Object.entries(CAPABILITY_CONTRACTS)) {
    const item = declared.get(capability);
    if (!item) {
      if (!detected.includes(capability)) {
        findings.push({ code: "missing_required_declaration", capability });
      }
      continue;
    }
    if (!String(item.trigger || "").trim()) {
      findings.push({ code: "missing_trigger", capability });
    } else if (item.trigger !== expected.trigger) {
      findings.push({ code: "excessive_capability", capability, field: "trigger" });
    }
    if (!Array.isArray(item.purpose) || item.purpose.length === 0) {
      findings.push({ code: "missing_purpose", capability });
    } else if (!sameStringSet(item.purpose, expected.purpose)) {
      findings.push({ code: "excessive_capability", capability, field: "purpose" });
    }
    if (item.access !== expected.access) {
      findings.push({ code: "excessive_capability", capability, field: "access" });
    }
    if (
      Object.hasOwn(expected, "rejectionBehavior")
      && item.rejectionBehavior !== expected.rejectionBehavior
    ) {
      findings.push({ code: "excessive_capability", capability, field: "rejectionBehavior" });
    }
  }

  for (const [capability, patterns] of Object.entries(FORBIDDEN_RUNTIME_PATTERNS)) {
    const file = sources.find((entry) => patterns.some((pattern) => pattern.test(entry.source)));
    if (file) {
      findings.push({ code: "forbidden_runtime_capability", capability, path: file.path });
    }
  }

  for (const capability of REQUIRED_ABSENCES) {
    if (!absent.has(capability)) findings.push({ code: "missing_absence_declaration", capability });
  }
  for (const item of REQUIRED_PRODUCT_DATA) {
    if (!declaration.productData?.includes(item)) findings.push({ code: "missing_product_data", item });
  }

  return {
    ok: findings.length === 0,
    detectedCapabilities: detected,
    findings,
  };
}

export {
  CAPABILITY_CONTRACTS,
  REQUIRED_ABSENCES,
  REQUIRED_PRODUCT_DATA,
};

function sameStringSet(actual, expected) {
  return JSON.stringify([...new Set(actual.map(String))].sort())
    === JSON.stringify([...expected].sort());
}

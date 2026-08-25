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
    trigger: "explicit_user_action",
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

const WX_API_CAPABILITIES = Object.freeze({
  login: ["wechat_identity"],
  saveImageToPhotosAlbum: ["photo_album"],
  requestSubscribeMessage: ["subscription_message"],
});

const WX_API_FORBIDDEN = Object.freeze({
  getLocation: ["location"],
  chooseLocation: ["location"],
  startLocationUpdate: ["location"],
  addPhoneContact: ["contacts"],
  chooseContact: ["contacts"],
  createCameraContext: ["camera"],
  chooseMedia: ["camera", "photo_album_read"],
  chooseImage: ["camera", "photo_album_read"],
  getRecorderManager: ["microphone"],
  startRecord: ["microphone"],
  requestPayment: ["payments"],
  createBannerAd: ["advertising"],
  createInterstitialAd: ["advertising"],
  createRewardedVideoAd: ["advertising"],
  createCustomAd: ["advertising"],
});

export function auditWechatPrivacyContract({ runtimeFiles = [], declaration = {} } = {}) {
  const findings = [];
  const sources = runtimeFiles.map((file) => ({
    path: String(file?.path || ""),
    source: String(file?.source || ""),
  }));
  const detection = detectRuntimeCapabilities(sources);
  const detected = [...detection.capabilities].sort();
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

  for (const capability of [...detection.forbidden].sort()) {
    findings.push({
      code: "forbidden_runtime_capability",
      capability,
      path: detection.paths.get(capability) || "unknown",
    });
  }
  for (const parseError of detection.parseErrors) {
    findings.push({ code: "capability_parse_failed", path: parseError.path });
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

export function auditWechatPrivacyBehaviorConsistency({ declaration = {}, behavior = {} } = {}) {
  const findings = [];
  const declared = new Map(
    (Array.isArray(declaration.capabilities) ? declaration.capabilities : [])
      .map((item) => [String(item?.id || ""), item]),
  );
  const verifiedTriggers = behavior?.verifiedTriggers || {};
  for (const capability of [
    "wechat_identity",
    "nickname_avatar",
    "photo_album",
    "subscription_message",
  ]) {
    const actual = verifiedTriggers[capability];
    if (!actual) {
      findings.push({ code: "behavior_trigger_unverified", capability });
      continue;
    }
    const declaredTrigger = declared.get(capability)?.trigger;
    if (declaredTrigger !== actual) {
      findings.push({
        code: "behavior_trigger_mismatch",
        capability,
        declaredTrigger: declaredTrigger || null,
        verifiedTrigger: actual,
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

export function detectRuntimeCapabilities(runtimeFiles = []) {
  const capabilities = new Set();
  const forbidden = new Set();
  const paths = new Map();
  const parseErrors = [];
  const record = (collection, id, path) => {
    collection.add(id);
    if (!paths.has(id)) paths.set(id, path);
  };

  for (const file of runtimeFiles) {
    const path = String(file?.path || "");
    const source = String(file?.source || "");
    if (/\.wxml$/i.test(path)) {
      for (const tag of source.matchAll(/<\s*([A-Za-z][A-Za-z0-9:_-]*)\b/g)) {
        const normalized = tag[1].toLowerCase();
        if (normalized === "camera") record(forbidden, "camera", path);
        if (normalized === "ad" || normalized.startsWith("ad-")) record(forbidden, "advertising", path);
      }
      if (/open-type\s*=\s*["']chooseAvatar["']/i.test(source) || /type\s*=\s*["']nickname["']/i.test(source)) {
        record(capabilities, "nickname_avatar", path);
      }
      if (/open-type\s*=\s*["']getPhoneNumber["']/i.test(source)) {
        record(capabilities, "phone_number", path);
      }
      continue;
    }
    if (/\/identity\/avatar\b/.test(source)) record(capabilities, "nickname_avatar", path);
    if (/@supabase\//i.test(source) || /supabase\.co/i.test(source)) {
      record(forbidden, "supabase_runtime", path);
    }
    if (!/\.(?:js|mjs|cjs|jsx|ts|tsx)$/i.test(path)) continue;
    let ast;
    try {
      ast = parse(source, {
        sourceType: "unambiguous",
        allowReturnOutsideFunction: true,
        plugins: ["jsx", "optionalChaining", "objectRestSpread", "typescript"],
      });
    } catch {
      parseErrors.push({ path });
      continue;
    }
    const initialAliases = buildAliasState(ast);
    const dynamicOverwrites = findDynamicOverwrites(ast, initialAliases);
    const { objectAliases, functionAliases, staticStrings } = buildAliasState(ast, {
      blockedTargets: dynamicOverwrites,
    });
    const apiNames = new Set();
    let hasIndeterminateWxProperty = false;
    let hasIndeterminateObjectAlias = false;
    let hasIndeterminateFunctionAlias = false;
    walkAst(ast, (node) => {
      const api = memberApiName(node, objectAliases, staticStrings);
      if (api) apiNames.add(api);
      if (
        new Set(["MemberExpression", "OptionalMemberExpression"]).has(node.type)
        && node.object?.type === "Identifier"
        && initialAliases.objectAliases.has(node.object.name)
        && !objectAliases.has(node.object.name)
      ) {
        hasIndeterminateObjectAlias = true;
      }
      if (
        new Set(["MemberExpression", "OptionalMemberExpression"]).has(node.type)
        && node.object?.type === "Identifier"
        && objectAliases.has(node.object.name)
        && node.computed
        && !staticPropertyName(node, staticStrings)
      ) {
        hasIndeterminateWxProperty = true;
      }
      if (
        (node.type === "CallExpression" || node.type === "OptionalCallExpression")
        && node.callee?.type === "Identifier"
      ) {
        if (functionAliases.has(node.callee.name)) {
          apiNames.add(functionAliases.get(node.callee.name));
        } else if (initialAliases.functionAliases.has(node.callee.name)) {
          hasIndeterminateFunctionAlias = true;
        }
      }
    });
    if (hasIndeterminateWxProperty) {
      parseErrors.push({ path, reason: "indeterminate_wx_property" });
    }
    if (hasIndeterminateObjectAlias) {
      parseErrors.push({ path, reason: "indeterminate_wx_object_alias" });
    }
    if (hasIndeterminateFunctionAlias) {
      parseErrors.push({ path, reason: "indeterminate_wx_function_alias" });
    }
    for (const api of apiNames) {
      for (const id of WX_API_CAPABILITIES[api] || []) record(capabilities, id, path);
      for (const id of WX_API_FORBIDDEN[api] || []) record(forbidden, id, path);
    }
  }
  return { capabilities, forbidden, paths, parseErrors };
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

function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((entry) => walkAst(entry, visit));
    else if (value && typeof value === "object" && typeof value.type === "string") walkAst(value, visit);
  }
}

function buildAliasState(ast, { blockedTargets = new Set() } = {}) {
  const objectAliases = new Set(["wx"]);
  const functionAliases = new Map();
  const staticStrings = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    walkAst(ast, (node) => {
      if (node.type !== "VariableDeclarator" && node.type !== "AssignmentExpression") return;
      const target = node.type === "VariableDeclarator" ? node.id : node.left;
      const value = node.type === "VariableDeclarator" ? node.init : node.right;
      if (!target || !value) return;
      if (target.type === "Identifier" && blockedTargets.has(target.name)) return;
      if (target.type === "Identifier" && value.type === "Identifier") {
        if (objectAliases.has(value.name)) {
          if (!objectAliases.has(target.name)) { objectAliases.add(target.name); changed = true; }
          return;
        }
        if (functionAliases.has(value.name)) {
          const api = functionAliases.get(value.name);
          if (functionAliases.get(target.name) !== api) {
            functionAliases.set(target.name, api);
            changed = true;
          }
          return;
        }
        if (staticStrings.has(value.name)) {
          const staticValue = staticStrings.get(value.name);
          if (staticStrings.get(target.name) !== staticValue) {
            staticStrings.set(target.name, staticValue);
            changed = true;
          }
          return;
        }
      }
      if (target.type === "Identifier") {
        const staticValue = evaluateStaticString(value, staticStrings);
        if (staticValue !== "" && staticStrings.get(target.name) !== staticValue) {
          staticStrings.set(target.name, staticValue);
          changed = true;
        }
        const api = memberApiName(value, objectAliases, staticStrings);
        if (api && functionAliases.get(target.name) !== api) {
          functionAliases.set(target.name, api);
          changed = true;
        }
        return;
      }
      if (target.type === "ObjectPattern" && value.type === "Identifier" && objectAliases.has(value.name)) {
        for (const property of target.properties || []) {
          if (property.type !== "ObjectProperty" || property.value?.type !== "Identifier") continue;
          if (blockedTargets.has(property.value.name)) continue;
          const api = staticPropertyName(property, staticStrings);
          if (api && functionAliases.get(property.value.name) !== api) {
            functionAliases.set(property.value.name, api);
            changed = true;
          }
        }
      }
    });
  }
  return { objectAliases, functionAliases, staticStrings };
}

function findDynamicOverwrites(ast, aliases) {
  const blockedTargets = new Set();
  walkAst(ast, (node) => {
    if (node.type !== "AssignmentExpression" || node.left?.type !== "Identifier") return;
    const value = node.right;
    const resolvable = value?.type === "Identifier" && (
      aliases.objectAliases.has(value.name)
      || aliases.functionAliases.has(value.name)
      || aliases.staticStrings.has(value.name)
    );
    if (
      !resolvable
      && evaluateStaticString(value, aliases.staticStrings) === ""
      && !memberApiName(value, aliases.objectAliases, aliases.staticStrings)
    ) {
      blockedTargets.add(node.left.name);
    }
  });
  return blockedTargets;
}

function memberApiName(node, objectAliases, staticStrings = new Map()) {
  if (!node || !new Set(["MemberExpression", "OptionalMemberExpression"]).has(node.type)) return "";
  if (node.object?.type !== "Identifier" || !objectAliases.has(node.object.name)) return "";
  return staticPropertyName(node, staticStrings);
}

function staticPropertyName(node, staticStrings = new Map()) {
  const property = node?.key || node?.property;
  if (!property) return "";
  if (!node.computed && property.type === "Identifier") return property.name;
  if (property.type === "StringLiteral") return property.value;
  if (property.type === "Identifier" && node.computed && staticStrings.has(property.name)) {
    return staticStrings.get(property.name);
  }
  if (property.type === "TemplateLiteral" && property.expressions?.length === 0) {
    return property.quasis?.[0]?.value?.cooked || "";
  }
  return "";
}

function evaluateStaticString(node, staticStrings = new Map()) {
  if (!node) return "";
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "Identifier") return staticStrings.get(node.name) || "";
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) {
    return node.quasis?.[0]?.value?.cooked || "";
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = evaluateStaticString(node.left, staticStrings);
    const right = evaluateStaticString(node.right, staticStrings);
    return left && right ? `${left}${right}` : "";
  }
  return "";
}
import { parse } from "@babel/parser";

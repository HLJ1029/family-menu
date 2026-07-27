const EXTERNAL_ACTION_KEYS = Object.freeze([
  "production_api_deployed",
  "h5_deployed",
  "miniprogram_uploaded",
  "wechat_review_submitted",
  "wechat_released",
  "native_allowlist_enabled",
]);
const CANDIDATE_KEYS = Object.freeze([
  "status",
  "package_version",
  "ads",
  ...EXTERNAL_ACTION_KEYS,
  "true_device_evidence",
]);
const CANDIDATE_KEY_SET = new Set(CANDIDATE_KEYS);
const NATIVE_EVIDENCE_KEYS = Object.freeze(["schemaVersion", "candidate"]);
const NATIVE_CANDIDATE_EVIDENCE_KEYS = Object.freeze([
  "version",
  "status",
  "runtimeCommit",
  "archive",
  "uploadReceiptRef",
  "actions",
  "trueDeviceEvidence",
]);
const NATIVE_ACTION_KEYS = Object.freeze([
  "productionApiDeployed",
  "h5Deployed",
  "miniprogramUploaded",
  "wechatReviewSubmitted",
  "wechatReleased",
  "nativeAllowlistEnabled",
]);
const PLATFORM_CHECK_KEYS = Object.freeze([
  "requestDomain",
  "downloadFileDomain",
  "webViewDomain",
  "privacyDeclaration",
  "devtoolsAuthenticated",
  "productionLegacyH5Smoke",
]);

const SUPABASE_PATTERNS = Object.freeze([
  /@supabase\//i,
  /supabase\.co/i,
  /\b(?:VITE_)?SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY)\b/i,
  /(?:from\s+|require\s*\()\s*["'][^"']*supabase/i,
]);

const CREDENTIAL_NAME = String.raw`(?:HUMI_TELEMETRY_HASH_SALT|HUMI_SESSION_SECRET|WECHAT_APP_SECRET|DEEPSEEK_API_KEY|ARK_API_KEY|[A-Za-z][A-Za-z0-9]*(?:ApiKey|AppSecret|SecretKey|HashSalt|PrivateKey|AccessKey)|apiKey|appSecret|secretKey|hashSalt|privateKey|accessKey)`;
const QUOTED_CREDENTIAL_LITERAL = new RegExp(
  String.raw`\b${CREDENTIAL_NAME}\b\s*(?:=|:)\s*(["'\x60])([^\r\n]*?)\1`,
  "g",
);
const ENV_CREDENTIAL_LITERAL = new RegExp(
  String.raw`^\s*${CREDENTIAL_NAME}\s*=\s*([^\s#]+)\s*$`,
  "gmi",
);
const GENERIC_CREDENTIAL_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
]);

export function findForbiddenRuntimeFindings(files = []) {
  const findings = [];
  for (const file of files) {
    const path = String(file?.path || "");
    const source = String(file?.source || "");
    if (hasAdRuntime(source, path)) findings.push({ category: "ad", path });
    if (SUPABASE_PATTERNS.some((pattern) => pattern.test(source))) {
      findings.push({ category: "supabase", path });
    }
    if (hasCredentialLiteral(source)) findings.push({ category: "credential", path });
  }
  return uniqueFindings(findings);
}

export function validateNativeCandidateEvidence(evidence, { expectedVersion } = {}) {
  assertExactObjectKeys(evidence, NATIVE_EVIDENCE_KEYS, "native candidate evidence");
  if (evidence.schemaVersion !== 1) throw new Error("native candidate evidence schemaVersion must be 1");
  const candidate = evidence.candidate;
  assertExactObjectKeys(candidate, NATIVE_CANDIDATE_EVIDENCE_KEYS, "native candidate");
  assertExactObjectKeys(candidate.actions, NATIVE_ACTION_KEYS, "native candidate actions");
  assertExactObjectKeys(candidate.trueDeviceEvidence, ["passed", "required"], "native candidate trueDeviceEvidence");
  if (candidate.version !== expectedVersion) {
    throw new Error(`native candidate version must be ${expectedVersion}`);
  }
  if (!new Set(["local-candidate", "uploaded-experience"]).has(candidate.status)) {
    throw new Error("native candidate status is invalid");
  }
  for (const key of NATIVE_ACTION_KEYS) {
    if (typeof candidate.actions[key] !== "boolean") throw new Error(`${key} must be boolean`);
  }
  if (candidate.actions.productionApiDeployed !== true) throw new Error("productionApiDeployed must remain true");
  if (candidate.actions.h5Deployed !== true) throw new Error("h5Deployed must remain true");
  if (candidate.actions.wechatReviewSubmitted !== false) throw new Error("wechatReviewSubmitted must remain false");
  if (candidate.actions.wechatReleased !== false) throw new Error("wechatReleased must remain false");
  if (candidate.actions.nativeAllowlistEnabled !== false) throw new Error("nativeAllowlistEnabled must remain false");
  if (
    !Number.isInteger(candidate.trueDeviceEvidence.passed)
    || !Number.isInteger(candidate.trueDeviceEvidence.required)
    || candidate.trueDeviceEvidence.passed < 0
    || candidate.trueDeviceEvidence.required !== 56
    || candidate.trueDeviceEvidence.passed > candidate.trueDeviceEvidence.required
  ) {
    throw new Error("native candidate trueDeviceEvidence is invalid");
  }
  if (candidate.actions.miniprogramUploaded) {
    if (candidate.status !== "uploaded-experience") throw new Error("uploaded candidate status must be uploaded-experience");
    if (!/^[0-9a-f]{40}$/.test(String(candidate.runtimeCommit || ""))) {
      throw new Error("uploaded candidate requires runtimeCommit");
    }
    if (!candidate.archive) throw new Error("uploaded candidate requires archive");
    assertExactObjectKeys(candidate.archive, ["path", "sha256"], "uploaded candidate archive");
    if (!String(candidate.archive.path || "").trim() || !/^[0-9a-f]{64}$/.test(String(candidate.archive.sha256 || ""))) {
      throw new Error("uploaded candidate requires archive path and sha256");
    }
    if (!/^private:\/\/[A-Za-z0-9_./-]+$/.test(String(candidate.uploadReceiptRef || ""))) {
      throw new Error("uploaded candidate requires uploadReceiptRef");
    }
  } else {
    if (candidate.status !== "local-candidate") throw new Error("unuploaded candidate status must be local-candidate");
    if (
      candidate.runtimeCommit !== null
      || candidate.archive !== null
      || candidate.uploadReceiptRef !== null
    ) {
      throw new Error("unuploaded candidate must not claim runtimeCommit, archive, or upload receipt");
    }
  }
  return candidate;
}

export function validateWechatPlatformEvidence(evidence) {
  assertExactObjectKeys(evidence, ["schemaVersion", "checks"], "WeChat platform evidence");
  if (evidence.schemaVersion !== 1) throw new Error("WeChat platform evidence schemaVersion must be 1");
  assertExactObjectKeys(evidence.checks, PLATFORM_CHECK_KEYS, "WeChat platform checks");
  const result = {};
  const outputKeys = {
    requestDomain: "requestDomainVerified",
    downloadFileDomain: "downloadFileDomainVerified",
    webViewDomain: "webViewDomainVerified",
    privacyDeclaration: "privacyDeclarationVerified",
    devtoolsAuthenticated: "wechatDevtoolsAuthenticated",
    productionLegacyH5Smoke: "productionLegacyH5SmokeVerified",
  };
  for (const key of PLATFORM_CHECK_KEYS) {
    const check = evidence.checks[key];
    assertExactObjectKeys(check, ["verified", "status", "ref"], `WeChat platform check ${key}`);
    if (typeof check.verified !== "boolean") throw new Error(`${key}.verified must be boolean`);
    if (check.verified) {
      if (check.status !== "verified") throw new Error(`${key}.status must be verified`);
      if (!/^private:\/\/[A-Za-z0-9_./-]+$/.test(String(check.ref || ""))) {
        throw new Error(`${key}.ref must be a private evidence reference`);
      }
    } else if (check.status !== "pending" || check.ref !== null) {
      throw new Error(`${key}.status must be pending and ref must be null when not verified`);
    }
    result[outputKeys[key]] = check.verified;
  }
  return result;
}

export function deriveNativeReleaseState(nativeRollout, { expectedVersion } = {}) {
  const candidate = nativeRollout?.currentCandidate || {};
  const externalActions = nativeRollout?.externalActions || {};
  const platform = nativeRollout?.platformEvidence || {};
  const uploaded = candidate.version === expectedVersion
    && candidate.uploadStatus === "uploaded"
    && candidate.immutableArchivePresent === true
    && /^[0-9a-f]{40}$/.test(String(candidate.runtimeCommit || ""))
    && externalActions.miniprogram_uploaded === true;
  const passed = Number.isInteger(platform.trueDevicePassed) ? platform.trueDevicePassed : 0;
  const required = Number.isInteger(platform.trueDeviceRequired) ? platform.trueDeviceRequired : 56;
  return {
    miniProgramUploadedVersion: uploaded ? expectedVersion : null,
    currentCandidateUploaded: uploaded,
    nativeCheckpoint: uploaded
      ? "N5c_true_device_platform_evidence"
      : "N5b_refresh_packaging_authorization",
    trueDeviceEvidence: `${passed}/${required}`,
    nativeAllowlistEnabled: externalActions.native_allowlist_enabled === true,
    platformPrivacyDeclaration: platform.privacyDeclarationVerified === true ? "verified" : "pending",
    webViewDomainEvidence: platform.webViewDomainVerified === true ? "verified" : "pending",
  };
}

export function extractNativeCandidateCommit(markdown) {
  const matches = [...String(markdown || "").matchAll(/^- 提交：`([a-f0-9]{40})`[ \t]*$/gmi)];
  if (matches.length !== 1) {
    throw new Error("expected exactly one candidate commit in the native handoff");
  }
  return matches[0][1].toLowerCase();
}

export function extractNativeCandidateArtifactPath(markdown, {
  expectedVersion = "1.1.74",
} = {}) {
  const rows = String(markdown || "")
    .split(/\r?\n/)
    .filter((line) => /^\|.*\.tar\.gz.*\|[ \t]*$/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, "")))
    .filter((cells) => cells.length === 6)
    .map(([version, role, path, size, sha256, status]) => ({
      version,
      role,
      path,
      size,
      sha256,
      status: status.toLowerCase(),
    }));
  const matches = rows.filter((row) => (
    row.version.includes(`uploaded-${expectedVersion}`)
    && row.role.includes("已上传")
    && row.status !== "superseded"
  ));
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one current uploaded native source archive for ${expectedVersion}`,
    );
  }
  return matches[0].path;
}

export function resolveExternalHandoffPath({
  handoffPath = "",
  localContractOnly = false,
} = {}) {
  const normalized = String(handoffPath || "").trim();
  if (normalized) return normalized;
  if (localContractOnly) return "";
  throw new Error(
    "HUMI_NATIVE_HANDOFF_PATH is required; use --local-contract-only only for an explicit non-release local check",
  );
}

export function validateNativeCandidateState(markdown, {
  expectedPackageVersion = "1.1.74",
  expectedStatus = "preview",
  expectedExternalActions,
  expectedTrueDeviceEvidence = "0/56",
} = {}) {
  assertExpectedExternalActions(expectedExternalActions);
  const yamlBlocks = [...String(markdown || "").matchAll(/```ya?ml[ \t]*\r?\n([\s\S]*?)```/gi)]
    .map((match) => match[1]);
  for (const yamlBlock of yamlBlocks) assertCanonicalYamlSyntax(yamlBlock);
  const candidateBlocks = yamlBlocks.filter((block) => (
    block.split(/\r?\n/).some((line) => line.trim() === "native_shell_candidate:")
  ));
  if (candidateBlocks.length !== 1) {
    throw new Error("expected exactly one native_shell_candidate block");
  }
  const block = candidateBlocks[0];
  for (const yamlBlock of yamlBlocks) {
    if (yamlBlock === block) continue;
    if (yamlBlock.split(/\r?\n/).some((line) => (
      CANDIDATE_KEY_SET.has(line.trimStart().split(":")[0])
    ))) {
      throw new Error("candidate key outside canonical block");
    }
  }
  if (yamlBlocks.length !== 1) {
    throw new Error("unexpected structured YAML outside canonical block");
  }
  const state = {};
  let insideCandidate = false;
  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    if (rawLine.trim() === "native_shell_candidate:") {
      if (rawLine !== "native_shell_candidate:") {
        throw new Error("noncanonical YAML syntax: native_shell_candidate indentation");
      }
      if (insideCandidate) throw new Error("expected exactly one native_shell_candidate block");
      insideCandidate = true;
      continue;
    }
    if (!insideCandidate) throw new Error("unexpected structured YAML outside canonical block");
    const match = rawLine.match(/^ {2}([a-z][a-z0-9_]*):[ \t]*(.*?)\s*$/);
    if (!match) throw new Error(`invalid native_shell_candidate line: ${rawLine.trim()}`);
    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      throw new Error(`duplicate candidate key: ${key}`);
    }
    if (!CANDIDATE_KEY_SET.has(key)) throw new Error(`unexpected candidate key: ${key}`);
    state[key] = parseYamlScalar(rawValue);
  }

  const missingKeys = CANDIDATE_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(state, key));
  if (missingKeys.length || Object.keys(state).length !== CANDIDATE_KEYS.length) {
    throw new Error(`candidate key set must be exact; missing: ${missingKeys.join(", ")}`);
  }
  for (const key of EXTERNAL_ACTION_KEYS) {
    const count = yamlBlocks.reduce((total, yamlBlock) => (
      total + yamlBlock.split(/\r?\n/).filter((line) => line.trimStart().startsWith(`${key}:`)).length
    ), 0);
    if (count !== 1) throw new Error(`${key} must occur exactly once in structured YAML`);
  }

  if (state.status !== expectedStatus) {
    throw new Error(`native candidate status must remain ${expectedStatus}`);
  }
  if (state.package_version !== expectedPackageVersion) {
    throw new Error(`native candidate package_version must be ${expectedPackageVersion}`);
  }
  if (state.ads !== "excluded") throw new Error("native candidate ads must remain excluded");
  for (const key of EXTERNAL_ACTION_KEYS) {
    if (state[key] !== expectedExternalActions[key]) {
      throw new Error(`${key} must equal ${expectedExternalActions[key]}`);
    }
  }
  if (state.true_device_evidence !== expectedTrueDeviceEvidence) {
    throw new Error(
      `native candidate true_device_evidence must equal ${expectedTrueDeviceEvidence}`,
    );
  }
  return state;
}

function assertExpectedExternalActions(expectedExternalActions) {
  if (!expectedExternalActions || typeof expectedExternalActions !== "object") {
    throw new Error("expectedExternalActions must be supplied explicitly");
  }
  const keys = Object.keys(expectedExternalActions).sort();
  const expectedKeys = [...EXTERNAL_ACTION_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("expectedExternalActions must use the exact external action key set");
  }
  for (const key of EXTERNAL_ACTION_KEYS) {
    if (typeof expectedExternalActions[key] !== "boolean") {
      throw new Error(`${key} expectation must be boolean`);
    }
  }
}

function assertCanonicalYamlSyntax(block) {
  for (const rawLine of String(block || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (
      rawLine.includes("\t")
      || /[{}\[\]]/.test(rawLine)
      || /(^|[\s:])(?:[&*][^\s]+|!(?:<[^>]+>|[^\s]+))/.test(rawLine)
      || /:\s*[|>][+-]?\s*(?:#.*)?$/.test(rawLine)
      || /^(?:---|\.\.\.|%|<<:|\? )/.test(line)
    ) {
      throw new Error(`noncanonical YAML syntax: ${line}`);
    }
  }
}

function hasAdRuntime(source, path) {
  if (/<\s*(?:ad|ad-custom|ad-banner|ad-slot)(?:\s|\/|>)/i.test(source)) return true;
  if (/\bwx\.create(?:Banner|Interstitial|RewardedVideo|Custom)Ad\b/.test(source)) return true;
  if (/\b(?:adUnitId|adunit|unit-id)\b/i.test(source)) return true;
  for (const match of source.matchAll(/plugin:\/\/[A-Za-z0-9_./-]+/g)) {
    if (isExplicitAdToken(match[0])) return true;
  }
  if (/\.json$/i.test(path)) {
    try {
      const json = JSON.parse(source);
      for (const [name, componentPath] of Object.entries(json?.usingComponents || {})) {
        if (isExplicitAdToken(name) || isExplicitAdToken(String(componentPath))) return true;
      }
    } catch {
      // Invalid JSON is rejected by the normal build/config gates.
    }
  }
  return false;
}

function isExplicitAdToken(value) {
  const normalized = String(value || "").toLowerCase();
  return /(?:^|[/:_-])(?:ad|ads|advert|advertising)[_-]?(?:banner|slot|custom|unit|interstitial|rewarded|video)(?:$|[/:_-])/.test(normalized)
    || /(?:^|[/:_-])(?:banner|slot|custom|interstitial|rewarded|video)[_-]?ad(?:$|[/:_-])/.test(normalized);
}

function hasCredentialLiteral(source) {
  for (const pattern of GENERIC_CREDENTIAL_PATTERNS) {
    if (pattern.test(source)) return true;
  }
  QUOTED_CREDENTIAL_LITERAL.lastIndex = 0;
  for (const match of source.matchAll(QUOTED_CREDENTIAL_LITERAL)) {
    if (isConcreteCredentialValue(match[2])) return true;
  }
  ENV_CREDENTIAL_LITERAL.lastIndex = 0;
  for (const match of source.matchAll(ENV_CREDENTIAL_LITERAL)) {
    if (isConcreteCredentialValue(match[1])) return true;
  }
  return false;
}

function isConcreteCredentialValue(value) {
  const normalized = String(value || "").trim();
  return normalized.length >= 12
    && !/^(?:your_|replace_with_|example|placeholder|test[-_])/i.test(normalized)
    && !/^(?:process\.env\.|\$\{|<)/.test(normalized);
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const identity = `${finding.category}:${finding.path}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function assertExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object with the exact key set`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must use the exact key set`);
  }
}

function parseYamlScalar(value) {
  const normalized = String(value || "").trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

export { EXTERNAL_ACTION_KEYS };

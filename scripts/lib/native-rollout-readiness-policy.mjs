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

export function assertCandidateVersionIsUnused(candidateVersion, uploadedVersion) {
  const candidate = parseVersion(candidateVersion);
  const uploaded = parseVersion(uploadedVersion);
  const isNewer = candidate.some((part, index) => (
    part > uploaded[index]
    && candidate.slice(0, index).every((previous, previousIndex) => previous === uploaded[previousIndex])
  ));
  if (!isNewer) {
    throw new Error(
      `candidate ${candidateVersion} must be newer than uploaded production history ${uploadedVersion}`,
    );
  }
  return true;
}

export function validateNativeCandidateState(markdown, {
  expectedPackageVersion = "1.1.74",
} = {}) {
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

  if (state.status !== "preview") throw new Error("native candidate status must remain preview");
  if (state.package_version !== expectedPackageVersion) {
    throw new Error(`native candidate package_version must be ${expectedPackageVersion}`);
  }
  if (state.ads !== "excluded") throw new Error("native candidate ads must remain excluded");
  for (const key of EXTERNAL_ACTION_KEYS) {
    if (state[key] !== false) throw new Error(`${key} must remain false`);
  }
  if (state.true_device_evidence !== "0/36") {
    throw new Error("native candidate true_device_evidence must remain 0/36");
  }
  return state;
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

function parseVersion(value) {
  if (!/^\d+\.\d+\.\d+$/.test(String(value || ""))) {
    throw new Error(`invalid semantic version: ${value}`);
  }
  return String(value).split(".").map(Number);
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

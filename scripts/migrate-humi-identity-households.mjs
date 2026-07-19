import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_VERSION = 1;
const DEFAULT_AVATAR_KEYS = [
  "humi-avatar-dev-front-m-01",
  "humi-avatar-dev-side-m-01",
  "humi-avatar-dev-thinking-m-01",
  "humi-avatar-dev-laptop-m-01",
  "humi-avatar-family-f-01",
  "humi-avatar-family-m-01",
  "humi-avatar-parent-f-01",
  "humi-avatar-parent-m-01",
];
const ARRAY_KEYS = [
  "users",
  "identities",
  "households",
  "craveRequests",
  "householdInvites",
  "groceryShares",
  "groceryShareRequests",
  "menuShareRequests",
  "wishShareRequests",
  "collaborationEvents",
  "revokedTokens",
  "h5Tickets",
];
const MAP_KEYS = ["activeHouseholds", "profiles", "states", "householdStates"];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeTopLevel(input) {
  const data = isRecord(input) ? structuredClone(input) : {};
  for (const key of ARRAY_KEYS) data[key] = Array.isArray(data[key]) ? data[key] : [];
  for (const key of MAP_KEYS) data[key] = isRecord(data[key]) ? data[key] : {};
  return data;
}

export function auditHumiData(input) {
  const data = normalizeTopLevel(input);
  const fatalCodes = {};
  const addFatal = (code) => { fatalCodes[code] = (fatalCodes[code] ?? 0) + 1; };

  const userIds = new Set();
  for (const user of data.users) {
    const id = cleanString(user?.id);
    if (id && userIds.has(id)) addFatal("duplicate_user_id");
    if (id) userIds.add(id);
  }

  const identitySubjects = new Set();
  for (const identity of data.identities) {
    const provider = cleanString(identity?.provider);
    const subject = cleanString(identity?.providerUserId);
    if (!provider || !subject) continue;
    const key = `${provider}\u0000${subject}`;
    if (identitySubjects.has(key)) addFatal("duplicate_identity_provider_subject");
    identitySubjects.add(key);
  }

  const householdsById = new Map();
  for (const household of data.households) {
    const householdId = cleanString(household?.id);
    if (householdId && !householdsById.has(householdId)) householdsById.set(householdId, household);
    const formalMemberIds = new Set((Array.isArray(household?.members) ? household.members : [])
      .filter((member) => member?.status === "formal")
      .map((member) => cleanString(member?.memberId))
      .filter(Boolean));
    const ownerId = cleanString(household?.ownerId);
    if (!ownerId || !userIds.has(ownerId) || !formalMemberIds.has(ownerId)) addFatal("household_owner_missing");
    for (const memberId of formalMemberIds) {
      if (!userIds.has(memberId)) addFatal("household_member_user_missing");
    }
  }

  for (const [stateKey, state] of Object.entries(data.householdStates)) {
    const householdId = cleanString(state?.householdId) || stateKey;
    if (!householdsById.has(householdId)) addFatal("household_state_without_household");
  }

  for (const [userId, householdIdValue] of Object.entries(data.activeHouseholds)) {
    const household = householdsById.get(cleanString(householdIdValue));
    const isFormalMember = household?.members?.some((member) => (
      member?.status === "formal" && cleanString(member?.memberId) === userId
    ));
    if (!isFormalMember) addFatal("active_household_not_member");
  }

  return {
    data,
    counts: {
      users: data.users.length,
      identities: data.identities.length,
      households: data.households.length,
      householdStates: Object.keys(data.householdStates).length,
      collaborationEvents: data.collaborationEvents.length,
    },
    fatalCodes: Object.fromEntries(Object.entries(fatalCodes).sort(([a], [b]) => a.localeCompare(b))),
    fatalCount: Object.values(fatalCodes).reduce((sum, count) => sum + count, 0),
  };
}

export function migrateHumiData(input, { appliedAt = new Date().toISOString(), sourceSha256 = "" } = {}) {
  const audited = auditHumiData(input);
  const data = audited.data;
  const changeCounts = {
    topLevelCollectionsNormalized: ARRAY_KEYS.filter((key) => !Array.isArray(input?.[key])).length
      + MAP_KEYS.filter((key) => !isRecord(input?.[key])).length,
    usersMarkedIncomplete: 0,
    userAvatarsAdded: 0,
    householdMembersProjected: 0,
    migrationMetadataAdded: 0,
  };

  const usersById = new Map();
  for (const user of data.users) {
    if (!isRecord(user)) continue;
    const displayName = cleanString(user.displayName);
    const isComplete = user.profileStatus === "complete" && displayName && displayName !== "微信用户";
    const nextStatus = isComplete ? "complete" : "incomplete";
    if (user.profileStatus !== nextStatus && nextStatus === "incomplete") changeCounts.usersMarkedIncomplete += 1;
    user.profileStatus = nextStatus;
    if (!cleanString(user.avatarKey)) {
      user.avatarKey = defaultAvatarKey(user.id);
      changeCounts.userAvatarsAdded += 1;
    }
    if (user.avatarUrl == null) user.avatarUrl = "";
    const id = cleanString(user.id);
    if (id && !usersById.has(id)) usersById.set(id, user);
  }

  for (const household of data.households) {
    if (!Array.isArray(household?.members)) household.members = [];
    for (const member of household.members) {
      if (member?.status !== "formal") continue;
      const user = usersById.get(cleanString(member.memberId));
      if (!user) continue;
      const projected = {
        nickname: cleanString(user.displayName) || "微信用户",
        avatarKey: user.avatarKey,
        avatarUrl: cleanString(user.avatarUrl),
      };
      if (member.nickname !== projected.nickname || member.avatarKey !== projected.avatarKey || cleanString(member.avatarUrl) !== projected.avatarUrl) {
        changeCounts.householdMembersProjected += 1;
      }
      member.nickname = projected.nickname;
      member.avatarKey = projected.avatarKey;
      member.avatarUrl = projected.avatarUrl;
    }
  }

  const existingMeta = isRecord(data.migrationMeta?.identityHouseholdV1)
    ? data.migrationMeta.identityHouseholdV1
    : null;
  data.migrationMeta = isRecord(data.migrationMeta) ? data.migrationMeta : {};
  if (!existingMeta) changeCounts.migrationMetadataAdded = 1;
  data.migrationMeta.identityHouseholdV1 = existingMeta ?? {
    appliedAt,
    sourceSha256,
    toolVersion: TOOL_VERSION,
  };

  return { ...audited, data, changeCounts };
}

function defaultAvatarKey(userId) {
  const digest = createHash("sha256").update(String(userId ?? "")).digest();
  return DEFAULT_AVATAR_KEYS[digest.readUInt32BE(0) % DEFAULT_AVATAR_KEYS.length];
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--dry-run", "--apply"].includes(arg)) {
      options[arg.slice(2).replace("-", "")] = true;
      continue;
    }
    if (["--input", "--output", "--report"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input || !options.report) throw new Error("--input and --report are required.");
  if (Boolean(options.dryrun) === Boolean(options.apply)) throw new Error("Choose exactly one of --dry-run or --apply.");
  if (options.dryrun && options.output) throw new Error("--dry-run refuses --output.");
  if (options.apply && !options.output) throw new Error("--apply requires --output.");
  if (options.output === options.input || options.report === options.input || options.report === options.output) {
    throw new Error("Input, output and report paths must be distinct.");
  }
  return options;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Migration arguments invalid: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const inputText = await readFile(options.input, "utf8");
    const input = JSON.parse(inputText);
    const inputSha256 = sha256(inputText);
    const result = migrateHumiData(input, { sourceSha256: inputSha256 });
    const outputText = `${JSON.stringify(result.data, null, 2)}\n`;
    const report = {
      schemaVersion: 1,
      toolVersion: TOOL_VERSION,
      mode: options.apply ? "apply" : "dry-run",
      ready: result.fatalCount === 0,
      counts: result.counts,
      changeCounts: result.changeCounts,
      fatalCount: result.fatalCount,
      fatalCodes: result.fatalCodes,
      inputSha256,
      outputSha256: sha256(outputText),
    };
    await writeJson(options.report, report);
    if (result.fatalCount > 0) {
      console.error("Migration blocked by fatal invariant codes. Review the privacy-safe report.");
      process.exitCode = 2;
      return;
    }
    if (options.apply) await writeJson(options.output, result.data);
    console.log(options.apply ? "Migration copy written." : "Migration dry-run ready.");
  } catch (error) {
    console.error(`Migration failed: ${error.code === "EEXIST" ? "destination already exists" : error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

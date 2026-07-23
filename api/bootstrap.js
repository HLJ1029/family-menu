import { createHash } from "node:crypto";

const PRIVATE_STATE_KEY = /(?:token|secret|openid|open_id|unionid|union_id|phone_?(?:hash|number|masked|verified(?:_at)?))/i;

export function computeStateVersion(value) {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("base64url");
}

export function buildBootstrapEnvelope({ user, households, activeHousehold, state, mealRun, flags }) {
  const householdState = sanitizeHouseholdState(state);
  const publicHouseholds = (households ?? []).map((household) => toBootstrapHousehold(household, user?.id));
  const currentMealRun = sanitizeValue(mealRun);
  const capabilities = {
    nativeShellEnabled: Boolean(flags?.nativeShellEnabled),
    mealExecutionEnabled: Boolean(flags?.mealExecutionEnabled),
    reminderEnabled: Boolean(flags?.reminderEnabled),
  };

  return {
    schemaVersion: 1,
    stateVersion: computeStateVersion({
      householdState,
      activeHousehold: toStateVersionHousehold(activeHousehold, user?.id),
      currentMealRun,
      capabilities,
    }),
    generatedAt: new Date().toISOString(),
    user: toBootstrapUser(user),
    households: publicHouseholds,
    activeHouseholdId: activeHousehold?.id || "",
    householdState,
    currentMealRun,
    capabilities,
  };
}

function toBootstrapUser(user = {}) {
  return {
    id: user.id || "",
    displayName: user.displayName || "微信用户",
    avatarKey: user.avatarKey || "humi-avatar-family-m-01",
    avatarUrl: user.avatarUrl || "",
    profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
  };
}

function toBootstrapHousehold(household = {}, userId = "") {
  const currentMember = (household.members ?? []).find((member) => member.memberId === userId);
  return {
    id: household.id || "",
    name: household.name || "",
    ownerId: household.ownerId || "",
    role: currentMember?.role || "member",
    members: (household.members ?? []).map((member) => ({
      id: member.memberId || "",
      displayName: member.nickname || "家人",
      avatarKey: member.avatarKey || "humi-avatar-family-m-01",
      avatarUrl: member.avatarUrl || "",
      role: member.role === "owner" ? "owner" : "member",
    })),
  };
}

function toStateVersionHousehold(household, userId) {
  if (!household) return null;
  const currentMember = (household.members ?? []).find((member) => member.memberId === userId);
  return {
    id: household.id || "",
    ownerId: household.ownerId || "",
    role: currentMember?.role || "member",
    members: (household.members ?? []).map((member) => ({
      id: member.memberId || "",
      role: member.role === "owner" ? "owner" : "member",
      status: member.status || "",
    })),
  };
}

function sanitizeHouseholdState(value) {
  if (!value || typeof value !== "object") return null;
  return sanitizeValue(value);
}

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_STATE_KEY.test(key))
    .map(([key, child]) => [key, sanitizeValue(child)]));
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return "null";
}

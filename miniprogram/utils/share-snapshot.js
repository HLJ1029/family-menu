const { requestHumi } = require("./request");
const { buildNativeSharePayload } = require("./share-routing");
const { trackEvent } = require("./telemetry");

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const SUPPORTED_TYPES = new Set(["menu", "grocery", "invite", "meal_task"]);
const prepared = new Map();
const pending = new Map();

function snapshotKey(type, context = {}) {
  const normalizedType = normalizeType(type);
  return [
    normalizedType,
    keyPart(context.householdId),
    keyPart(context.stateVersion),
    keyPart(context.mealRunId),
  ].join(":");
}

async function prepareShareSnapshot(type, context = {}) {
  const key = snapshotKey(type, context);
  const now = Date.now();
  const cached = prepared.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) prepared.delete(key);
  if (pending.has(key)) return pending.get(key);
  const creator = typeof context.createSnapshot === "function"
    ? context.createSnapshot
    : () => createSnapshot(type, context);

  const creation = Promise.resolve()
    .then(creator)
    .then((value) => {
      const expiresAt = normalizedExpiry(value?.expiresAt, now);
      const normalized = {
        ...value,
        expiresAt,
      };
      prepared.set(key, { value: normalized, expiresAt });
      pending.delete(key);
      return normalized;
    })
    .catch((error) => {
      pending.delete(key);
      prepared.delete(key);
      throw error;
    });
  pending.set(key, creation);
  return creation;
}

async function createSnapshot(type, context) {
  const normalizedType = normalizeType(type);
  if (normalizedType === "meal_task" && context.token) {
    return snapshotValue(normalizedType, context.token, context);
  }
  const options = requestOptions(normalizedType, context);
  const response = await requestHumi(options);
  const record = response?.request || response?.invite || response?.snapshot || response?.task;
  const token = String(record?.token || "");
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) throw new Error("share_snapshot_token_missing");
  trackEvent("share_snapshot_created", {
    page: telemetryPage(context.page),
    shareSource: normalizedType,
    householdId: safeTelemetryId(context.householdId),
    mealRunId: safeTelemetryId(context.mealRunId),
    count: 1,
  });
  return snapshotValue(normalizedType, token, {
    ...context,
    record,
  });
}

function requestOptions(type, context) {
  const data = context.data && typeof context.data === "object" ? context.data : {};
  const idempotencyKey = snapshotKey(type, context);
  if (type === "menu") {
    return { path: "/menu-share-requests", method: "POST", data: { ...data, idempotencyKey }, idempotencyKey };
  }
  if (type === "grocery") {
    return { path: "/grocery-share-requests", method: "POST", data: { ...data, idempotencyKey }, idempotencyKey };
  }
  if (type === "invite") {
    return { path: "/household-invites", method: "POST", data: { ...data, idempotencyKey }, idempotencyKey };
  }
  if (type === "meal_task") {
    const taskId = keyPart(context.taskId);
    if (!taskId) throw new Error("meal_task_id_missing");
    return {
      path: `/meal-tasks/${encodeURIComponent(taskId)}/share`,
      method: "POST",
      data: { idempotencyKey },
      idempotencyKey,
    };
  }
  throw new Error("share_snapshot_creator_missing");
}

function snapshotValue(type, token, context) {
  return {
    token,
    record: context.record || null,
    expiresAt: parseExpiry(context.record?.cacheExpiresAt || context.record?.expiresAt),
    payload: buildNativeSharePayload(type, {
      token,
      title: context.title || context.record?.title,
      householdName: context.householdName || context.record?.householdName,
      inviterName: context.inviterName || context.record?.inviterName,
      label: context.label || context.record?.label,
      itemCount: context.itemCount,
    }),
  };
}

function parseExpiry(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number(value);
  return Number.isFinite(parsed) && parsed > Date.now() ? parsed : Date.now() + DEFAULT_TTL_MS;
}

function getPreparedShare(type, context = {}) {
  const key = snapshotKey(type, context);
  const cached = prepared.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    prepared.delete(key);
    return null;
  }
  return cached.value;
}

function clearPreparedShares() {
  prepared.clear();
  pending.clear();
}

function normalizeType(type) {
  const value = String(type || "");
  if (!SUPPORTED_TYPES.has(value)) throw new Error("share_snapshot_type_invalid");
  return value;
}

function keyPart(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 96);
}

function normalizedExpiry(value, now) {
  const expiry = Number(value);
  return Number.isFinite(expiry) && expiry > now ? expiry : now + DEFAULT_TTL_MS;
}

function telemetryPage(value) {
  return ["tonight", "grocery", "family", "share"].includes(value) ? value : "share";
}

function safeTelemetryId(value) {
  const normalized = String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return normalized || undefined;
}

module.exports = {
  clearPreparedShares,
  getPreparedShare,
  prepareShareSnapshot,
  snapshotKey,
};

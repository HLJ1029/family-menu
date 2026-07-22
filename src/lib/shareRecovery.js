const SHARE_RECOVERY_KEY = "humi:share-session-recovery:v1";
const SHARE_RECOVERY_TTL_MS = 5 * 60 * 1000;
const RECOVERABLE_ACTIONS = new Set(["today_menu", "grocery"]);

export function queueShareRecovery(action, storage = getStorage(), now = Date.now()) {
  if (!storage || !RECOVERABLE_ACTIONS.has(action)) return false;
  const current = readRecovery(storage, now);
  if (current) return false;
  storage.setItem(SHARE_RECOVERY_KEY, JSON.stringify({
    action,
    attempts: 1,
    state: "pending",
    createdAt: now,
  }));
  return true;
}

export function beginShareRecoveryReplay(storage = getStorage(), now = Date.now()) {
  if (!storage) return null;
  const current = readRecovery(storage, now);
  if (!current || current.state !== "pending") return null;
  storage.setItem(SHARE_RECOVERY_KEY, JSON.stringify({ ...current, state: "replaying" }));
  return { action: current.action, attempts: current.attempts };
}

export function clearShareRecovery(storage = getStorage()) {
  storage?.removeItem(SHARE_RECOVERY_KEY);
}

export function getShareRecovery(storage = getStorage(), now = Date.now()) {
  if (!storage) return null;
  const current = readRecovery(storage, now);
  return current ? { action: current.action, attempts: current.attempts, state: current.state } : null;
}

export function isShareRecoveryActive(storage = getStorage(), now = Date.now()) {
  return Boolean(getShareRecovery(storage, now));
}

function readRecovery(storage, now) {
  try {
    const value = JSON.parse(storage.getItem(SHARE_RECOVERY_KEY) || "null");
    const valid = RECOVERABLE_ACTIONS.has(value?.action)
      && value?.attempts === 1
      && ["pending", "replaying"].includes(value?.state)
      && Number.isFinite(value?.createdAt)
      && now - value.createdAt >= 0
      && now - value.createdAt <= SHARE_RECOVERY_TTL_MS;
    if (valid) return value;
  } catch {
    // Invalid recovery data is discarded below.
  }
  storage.removeItem(SHARE_RECOVERY_KEY);
  return null;
}

function getStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

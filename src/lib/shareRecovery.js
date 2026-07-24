const SHARE_RECOVERY_KEY = "humi:share-session-recovery:v1";
const SHARE_RECOVERY_TTL_MS = 5 * 60 * 1000;
const RECOVERABLE_ACTIONS = new Set(["today_menu", "grocery", "invite", "poster_share", "poster_save"]);

export function queueShareRecovery(action, storage = getStorage(), now = Date.now(), context = null) {
  if (!storage || !RECOVERABLE_ACTIONS.has(action)) return false;
  const current = readRecovery(storage, now);
  if (current) return false;
  const recoveryContext = normalizeRecoveryContext(action, context);
  if (action.startsWith("poster_") && !recoveryContext) return false;
  storage.setItem(SHARE_RECOVERY_KEY, JSON.stringify({
    action,
    attempts: 1,
    state: "pending",
    createdAt: now,
    context: recoveryContext,
  }));
  return true;
}

export function beginShareRecoveryReplay(storage = getStorage(), now = Date.now()) {
  if (!storage) return null;
  const current = readRecovery(storage, now);
  if (!current || current.state !== "pending") return null;
  storage.setItem(SHARE_RECOVERY_KEY, JSON.stringify({ ...current, state: "replaying" }));
  return { action: current.action, attempts: current.attempts, context: current.context };
}

export function clearShareRecovery(storage = getStorage()) {
  storage?.removeItem(SHARE_RECOVERY_KEY);
}

export function getShareRecovery(storage = getStorage(), now = Date.now()) {
  if (!storage) return null;
  const current = readRecovery(storage, now);
  return current
    ? {
        action: current.action,
        attempts: current.attempts,
        state: current.state,
        context: current.context,
      }
    : null;
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
    const context = normalizeRecoveryContext(value?.action, value?.context);
    const contextValid = !String(value?.action || "").startsWith("poster_") || Boolean(context);
    if (valid && contextValid) return { ...value, context };
  } catch {
    // Invalid recovery data is discarded below.
  }
  storage.removeItem(SHARE_RECOVERY_KEY);
  return null;
}

function normalizeRecoveryContext(action, context) {
  if (!String(action || "").startsWith("poster_")) return null;
  const posterType = String(context?.posterType || "").trim();
  const styleId = context?.styleId === "theme" ? "theme" : "default";
  const stateVersion = String(context?.stateVersion || "").trim();
  if (
    !["today_menu", "grocery_list", "week_plan"].includes(posterType)
    || !/^[A-Za-z0-9:_-]{1,180}$/.test(stateVersion)
  ) return null;
  return { posterType, styleId, stateVersion };
}

function getStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

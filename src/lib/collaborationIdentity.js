const GUEST_PARTICIPANT_PREFIX = "humi:collaboration-guest";

export function getGuestParticipantId(requestType, token) {
  if (typeof window === "undefined") return "";
  const key = guestParticipantStorageKey(requestType, token);
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = createGuestParticipantId();
  window.localStorage.setItem(key, next);
  return next;
}

export function clearGuestParticipantId(requestType, token) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(guestParticipantStorageKey(requestType, token));
}

function guestParticipantStorageKey(requestType, token) {
  return `${GUEST_PARTICIPANT_PREFIX}:${String(requestType || "").trim()}:${String(token || "").trim()}`;
}

function createGuestParticipantId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const random = Math.random().toString(36).slice(2, 14);
  return `guest-${Date.now().toString(36)}-${random}`;
}

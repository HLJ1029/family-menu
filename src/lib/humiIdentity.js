const HUMI_SESSION_KEY = "humi:identity-session:v1";
const HUMI_SESSION_EXPIRED_KEY = "humi:identity-session-expired:v1";

export function readHumiSession() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(HUMI_SESSION_KEY);
    if (!value) return null;
    const normalized = normalizeHumiSession(JSON.parse(value));
    if (!normalized.accessToken || !Number.isFinite(normalized.expiresAt) || normalized.expiresAt <= Date.now()) {
      window.localStorage.removeItem(HUMI_SESSION_KEY);
      window.sessionStorage?.setItem(HUMI_SESSION_EXPIRED_KEY, "1");
      return null;
    }
    return normalized;
  } catch {
    window.localStorage.removeItem(HUMI_SESSION_KEY);
    return null;
  }
}

export function saveHumiSession(session) {
  if (typeof window === "undefined" || !session) return null;
  const normalized = normalizeHumiSession(session);
  window.localStorage.setItem(HUMI_SESSION_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearHumiSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HUMI_SESSION_KEY);
}

export function takeHumiSessionExpiredNotice() {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const fromNative = url.searchParams.get("humiExpired") === "1";
    if (fromNative) {
      url.searchParams.delete("humiExpired");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const fromStorage = window.sessionStorage?.getItem(HUMI_SESSION_EXPIRED_KEY) === "1";
    window.sessionStorage?.removeItem(HUMI_SESSION_EXPIRED_KEY);
    return fromNative || fromStorage;
  } catch {
    return false;
  }
}

export function takeHumiTicketFromUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const ticket = url.searchParams.get("humiTicket") || "";
  const hadSensitiveAuth = ticket || url.searchParams.has("humiSession") || url.searchParams.has("humiLogin");
  url.searchParams.delete("humiTicket");
  url.searchParams.delete("humiSession");
  url.searchParams.delete("humiLogin");
  if (hadSensitiveAuth) {
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return ticket;
}

export function requestWechatLoginFromMiniProgram({ reuseSession = false, onFailure, confirmationMs = 600 } = {}) {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram) return false;

  const fallbackToLegacyBridge = () => {
    if (!miniProgram.postMessage) {
      onFailure?.();
      return false;
    }
    try {
      miniProgram.postMessage({
        data: {
          type: "humi:wechat-login",
          requestedAt: Date.now(),
        },
      });
      return true;
    } catch {
      onFailure?.();
      return false;
    }
  };

  const url = reuseSession ? "/pages/identity/index" : "/pages/identity/index?action=login";
  const attempts = [
    miniProgram.navigateTo,
    miniProgram.redirectTo,
    miniProgram.reLaunch,
  ].filter((method) => typeof method === "function");
  if (attempts.length === 0) return fallbackToLegacyBridge();

  let settled = false;
  let attemptTimer = null;
  let attemptSequence = 0;
  const documentRef = window.document;
  const supportsPageConfirmation = Boolean(documentRef?.addEventListener && window.addEventListener);
  const cleanup = () => {
    window.clearTimeout(attemptTimer);
    if (supportsPageConfirmation) {
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", finish);
      window.removeEventListener("beforeunload", finish);
    }
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };
  const handleVisibilityChange = () => {
    if (documentRef.visibilityState === "hidden") finish();
  };
  const fallback = () => {
    if (settled) return;
    finish();
    fallbackToLegacyBridge();
  };
  const runAttempt = (index) => {
    if (settled) return;
    const method = attempts[index];
    if (!method) {
      fallback();
      return;
    }
    const attemptId = ++attemptSequence;
    const advance = () => {
      if (settled || attemptId !== attemptSequence) return;
      window.clearTimeout(attemptTimer);
      runAttempt(index + 1);
    };
    attemptTimer = window.setTimeout(advance, confirmationMs);
    try {
      method.call(miniProgram, { url, success: finish, fail: advance });
    } catch {
      advance();
    }
  };
  if (supportsPageConfirmation) {
    documentRef.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", finish);
    window.addEventListener("beforeunload", finish);
  }
  runAttempt(0);
  return true;
}

export function requestPhoneBindFromMiniProgram() {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram) return false;
  if (miniProgram?.navigateTo) {
    miniProgram.navigateTo({ url: "/pages/phone-bind/index" });
    return true;
  }
  return false;
}

export function requestMiniProgramLogout({ expired = false } = {}) {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.reLaunch) return false;
  try {
    const url = expired
      ? "/pages/index/index?humiLogout=1&humiExpired=1"
      : "/pages/index/index?humiLogout=1";
    miniProgram.reLaunch({ url });
    return true;
  } catch {
    return false;
  }
}

function normalizeHumiSession(session) {
  const user = session.user ?? {};
  return {
    accessToken: session.accessToken ?? session.token ?? "",
    refreshToken: session.refreshToken ?? "",
    expiresAt: Number(session.expiresAt) || null,
    user: {
      id: user.id ?? session.userId ?? "",
      displayName: user.displayName ?? "微信用户",
      provider: user.provider ?? "wechat",
      profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
      avatarKey: user.avatarKey ?? "humi-avatar-family-m-01",
      avatarUrl: user.avatarUrl ?? "",
      phoneVerified: Boolean(user.phoneVerified),
      phoneMasked: user.phoneMasked ?? "",
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
    },
  };
}

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

export function requestWechatLoginFromMiniProgram() {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.navigateTo) return false;
  try {
    miniProgram.navigateTo({ url: "/pages/identity/index?action=login" });
    return true;
  } catch {
    return false;
  }
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

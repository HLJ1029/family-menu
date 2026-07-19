const HUMI_SESSION_KEY = "humi:identity-session:v1";

export function readHumiSession() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(HUMI_SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
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
  if (!miniProgram?.postMessage) return false;
  miniProgram.postMessage({
    data: {
      type: "humi:wechat-login",
      requestedAt: Date.now(),
    },
  });
  return true;
}

export function requestPhoneBindFromMiniProgram() {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram) return false;
  if (miniProgram.navigateTo) {
    miniProgram.navigateTo({ url: "/pages/phone-bind/index" });
    return true;
  }
  if (!miniProgram.postMessage) return false;
  miniProgram.postMessage({
    data: {
      type: "humi:phone-bind",
      requestedAt: Date.now(),
    },
  });
  return true;
}

export function requestMiniProgramLogout() {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.postMessage) return false;
  miniProgram.postMessage({ data: { type: "humi:logout" } });
  return true;
}

function normalizeHumiSession(session) {
  const user = session.user ?? {};
  return {
    accessToken: session.accessToken ?? session.token ?? "",
    refreshToken: session.refreshToken ?? "",
    expiresAt: session.expiresAt ?? null,
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

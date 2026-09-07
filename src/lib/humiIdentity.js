import { requestMiniProgramPage } from "./runtime.js";

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

export function requestWechatLoginFromMiniProgram({
  reuseSession = false,
  onFailure,
  onHandoff,
  onResume,
  onStage,
  timeoutMs,
  confirmationMs,
} = {}) {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  const methods = ["navigateTo", "redirectTo", "reLaunch"];
  let failureReported = false;
  let lastErrorCode = "bridge_unavailable";
  const reportFailure = (failure = { errorCode: lastErrorCode }) => {
    if (failureReported) return;
    failureReported = true;
    void Promise.resolve()
      .then(() => onFailure?.(failure))
      .catch(() => {});
  };
  if (!methods.some((methodName) => typeof miniProgram?.[methodName] === "function")) {
    reportFailure({ errorCode: lastErrorCode });
    return false;
  }
  void requestMiniProgramPage(
    reuseSession ? "/pages/identity/index" : "/pages/identity/index?action=login",
    {
      methods,
      timeoutMs,
      confirmationMs,
      onStage(event) {
        if (getBridgeErrorPriority(event.errorCode) > getBridgeErrorPriority(lastErrorCode)) {
          lastErrorCode = event.errorCode;
        }
        onStage?.(event);
      },
    },
  )
    .then((status) => {
      if (status === "handoff") {
        watchForMiniProgramPageResume(onResume);
        void Promise.resolve()
          .then(() => onHandoff?.())
          .catch(() => {});
        return;
      }
      reportFailure({ errorCode: lastErrorCode });
    })
    .catch(() => reportFailure({ errorCode: "bridge_failed" }));
  return true;
}

function watchForMiniProgramPageResume(onResume) {
  if (typeof onResume !== "function") return;
  const documentRef = window.document;
  let reported = false;
  const cleanup = () => {
    documentRef?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    window.removeEventListener?.("pageshow", reportResume);
  };
  const reportResume = () => {
    if (reported) return;
    reported = true;
    cleanup();
    void Promise.resolve()
      .then(() => onResume())
      .catch(() => {});
  };
  const handleVisibilityChange = () => {
    if (documentRef?.visibilityState === "visible") reportResume();
  };
  documentRef?.addEventListener?.("visibilitychange", handleVisibilityChange);
  window.addEventListener?.("pageshow", reportResume);
}

function getBridgeErrorPriority(errorCode) {
  return {
    page_not_found: 4,
    permission_denied: 3,
    page_stack_limit: 3,
    bridge_failed: 2,
    bridge_unknown: 1,
    unconfirmed: 1,
  }[errorCode] || 0;
}

export function getWechatLoginFailureMessage(
  failure,
  fallback = "没有打开微信身份页，请重新进入小程序后重试。",
) {
  const errorCode = String(failure?.errorCode || "");
  if (errorCode === "page_not_found") {
    return "当前小程序版本不支持微信登录，请更新到最新版本后重试。";
  }
  if (errorCode === "page_stack_limit") {
    return "小程序打开的页面太多，请返回首页后重新登录。";
  }
  if (errorCode === "permission_denied") {
    return "微信没有允许打开身份页，请退出小程序后重新进入。";
  }
  if (errorCode === "bridge_unavailable") {
    return "当前页面无法连接小程序，请从微信里的 Humi 重新进入。";
  }
  return fallback;
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

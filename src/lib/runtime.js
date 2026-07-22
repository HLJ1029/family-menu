export function getLaunchChannel() {
  if (typeof window === "undefined") return "h5";
  const params = new URLSearchParams(window.location.search);
  return params.get("channel") || "h5";
}

export function isWechatMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  return getLaunchChannel() === "wechat-miniprogram" || window.__wxjs_environment === "miniprogram";
}

export function isWechatLoginEnabled() {
  return import.meta.env?.VITE_HUMI_WECHAT_LOGIN_ENABLED === "1";
}

export function buildMiniProgramShareUrl(payload = {}) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `/pages/share/index?${query}` : "/pages/share/index";
}

export function requestMiniProgramShare(payload = {}, options = {}) {
  if (typeof window === "undefined" || !isWechatMiniProgramWebView()) return Promise.resolve("unavailable");
  if (!String(payload.token || "").trim()) return Promise.resolve("unavailable");
  return requestMiniProgramPage(buildMiniProgramShareUrl(payload), options);
}

export function buildMiniProgramPosterUrl(payload = {}) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `/pages/poster/index?${query}` : "/pages/poster/index";
}

export function requestMiniProgramPoster(payload = {}, options = {}) {
  if (typeof window === "undefined" || !isWechatMiniProgramWebView()) return Promise.resolve("unavailable");
  if (!String(payload.token || "").trim()) return Promise.resolve("unavailable");
  return requestMiniProgramPage(buildMiniProgramPosterUrl(payload), options);
}

export function buildMiniProgramReminderUrl(payload = {}) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `/pages/reminder/index?${query}` : "/pages/reminder/index";
}

export function requestMiniProgramReminder(payload = {}, options = {}) {
  if (typeof window === "undefined" || !isWechatMiniProgramWebView()) return Promise.resolve("unavailable");
  if (!String(payload.scheduledAt || "").trim()) return Promise.resolve("unavailable");
  return requestMiniProgramPage(buildMiniProgramReminderUrl(payload), options);
}

function requestMiniProgramPage(url, options = {}) {
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.redirectTo && !miniProgram?.navigateTo && !miniProgram?.reLaunch) {
    return Promise.resolve("unavailable");
  }

  const timeoutMs = options.timeoutMs ?? 2400;
  const confirmationMs = options.confirmationMs ?? 600;
  return new Promise((resolve) => {
    let settled = false;
    let timeoutTimer = null;
    let attemptTimer = null;
    let attemptSequence = 0;
    const documentRef = window.document;
    const supportsPageConfirmation = Boolean(documentRef?.addEventListener && window.addEventListener);
    const finish = (status) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutTimer);
      window.clearTimeout(attemptTimer);
      if (supportsPageConfirmation) {
        documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("pagehide", handlePageLeave);
        window.removeEventListener("beforeunload", handlePageLeave);
      }
      resolve(status);
    };
    const handlePageLeave = () => finish("handoff");
    const handleVisibilityChange = () => {
      if (documentRef.visibilityState === "hidden") finish("handoff");
    };
    if (supportsPageConfirmation) {
      documentRef.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pagehide", handlePageLeave);
      window.addEventListener("beforeunload", handlePageLeave);
    }
    timeoutTimer = window.setTimeout(() => finish("unavailable"), timeoutMs);

    const attempts = [
      ["navigateTo", miniProgram.navigateTo],
      ["redirectTo", miniProgram.redirectTo],
      ["reLaunch", miniProgram.reLaunch],
    ].filter(([, method]) => typeof method === "function");

    const runAttempt = (index) => {
      if (settled) return;
      const [, method] = attempts[index] ?? [];
      if (!method) {
        finish("unavailable");
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
        method.call(miniProgram, {
          url,
          success: () => finish("handoff"),
          fail: advance,
        });
      } catch {
        advance();
      }
    };

    runAttempt(0);
  });
}

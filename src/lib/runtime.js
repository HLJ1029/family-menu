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
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.redirectTo && !miniProgram?.navigateTo) return Promise.resolve("unavailable");

  const timeoutMs = options.timeoutMs ?? 1800;
  const confirmationMs = options.confirmationMs ?? 420;
  const url = buildMiniProgramShareUrl(payload);
  return new Promise((resolve) => {
    let settled = false;
    let attemptTimer = null;
    let timeoutTimer = null;
    const documentRef = window.document;
    const supportsPageConfirmation = Boolean(documentRef?.addEventListener && window.addEventListener);
    const finish = (status) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(attemptTimer);
      window.clearTimeout(timeoutTimer);
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
      ["redirectTo", miniProgram.redirectTo],
      ["navigateTo", miniProgram.navigateTo],
    ].filter(([, method]) => typeof method === "function");

    const runAttempt = (index) => {
      if (settled) return;
      const [, method] = attempts[index] ?? [];
      if (!method) {
        finish("unavailable");
        return;
      }
      try {
        method.call(miniProgram, {
          url,
          success: () => {
            if (!supportsPageConfirmation) {
              finish("handoff");
              return;
            }
            window.clearTimeout(attemptTimer);
            attemptTimer = window.setTimeout(() => runAttempt(index + 1), confirmationMs);
          },
          fail: () => runAttempt(index + 1),
        });
      } catch {
        runAttempt(index + 1);
      }
    };

    runAttempt(0);
  });
}

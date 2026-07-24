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

export function requestMiniProgramIdentity({ reuseSession = false, ...options } = {}) {
  if (typeof window === "undefined") return Promise.resolve("unavailable");
  const url = reuseSession ? "/pages/identity/index" : "/pages/identity/index?action=login";
  return requestMiniProgramPage(url, options);
}

function requestMiniProgramPage(url, options = {}) {
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.redirectTo && !miniProgram?.navigateTo && !miniProgram?.reLaunch) {
    return Promise.resolve("unavailable");
  }

  const timeoutMs = options.timeoutMs ?? 2400;
  const confirmationMs = options.confirmationMs ?? 600;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let timeoutTimer = null;
    let attemptTimer = null;
    let attemptSequence = 0;
    let activeMethod = "";
    const documentRef = window.document;
    const supportsPageConfirmation = Boolean(documentRef?.addEventListener && window.addEventListener);
    const mark = (stage, method = "", errorCode = "") => {
      if (typeof options.onStage !== "function") return;
      try {
        options.onStage({
          stage,
          method,
          errorCode,
          elapsedMs: Math.max(0, Date.now() - startedAt),
        });
      } catch {
        // Diagnostics must never interrupt the user's navigation attempt.
      }
    };
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
    const handlePageLeave = () => {
      mark("page_hidden", activeMethod);
      finish("handoff");
    };
    const handleVisibilityChange = () => {
      if (documentRef.visibilityState === "hidden") handlePageLeave();
    };
    if (supportsPageConfirmation) {
      documentRef.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("pagehide", handlePageLeave);
      window.addEventListener("beforeunload", handlePageLeave);
    }
    timeoutTimer = window.setTimeout(() => {
      mark("handoff_unavailable", activeMethod, "handoff_timeout");
      finish("unavailable");
    }, timeoutMs);

    const attempts = [
      ["navigateTo", miniProgram.navigateTo],
      ["redirectTo", miniProgram.redirectTo],
      ["reLaunch", miniProgram.reLaunch],
    ].filter(([, method]) => typeof method === "function");

    const runAttempt = (index) => {
      if (settled) return;
      const [methodName, method] = attempts[index] ?? [];
      if (!method) {
        mark("handoff_unavailable", activeMethod, "fallback_exhausted");
        finish("unavailable");
        return;
      }
      activeMethod = methodName;
      mark("attempt_started", methodName);
      const attemptId = ++attemptSequence;
      const advance = (errorCode = "unconfirmed") => {
        if (settled || attemptId !== attemptSequence) return;
        window.clearTimeout(attemptTimer);
        if (errorCode === "unconfirmed") mark("attempt_unconfirmed", methodName, errorCode);
        runAttempt(index + 1);
      };
      attemptTimer = window.setTimeout(advance, confirmationMs);
      try {
        method.call(miniProgram, {
          url,
          success: () => mark("callback_received", methodName),
          fail: (error) => {
            const errorCode = normalizeBridgeError(error);
            mark("callback_failed", methodName, errorCode);
            advance(errorCode);
          },
        });
      } catch (error) {
        const errorCode = normalizeBridgeError(error);
        mark("callback_failed", methodName, errorCode);
        advance(errorCode);
      }
    };

    runAttempt(0);
  });
}

function normalizeBridgeError(error) {
  const message = String(error?.errMsg || error?.message || error || "").toLowerCase();
  if (message.includes("page stack")) return "page_stack_limit";
  if (message.includes("not found")) return "page_not_found";
  if (message.includes("permission") || message.includes("deny")) return "permission_denied";
  if (message) return "bridge_failed";
  return "bridge_unknown";
}

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
  return requestMiniProgramPage(buildMiniProgramShareUrl(payload), {
    ...options,
    methods: ["navigateTo", "redirectTo"],
  });
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

export function requestMiniProgramPage(url, options = {}) {
  if (typeof window === "undefined") return Promise.resolve("unavailable");
  const windowRef = window;
  const methodNames = Array.isArray(options.methods)
    ? options.methods
    : ["navigateTo", "redirectTo", "reLaunch"];
  const timeoutMs = options.timeoutMs ?? 2400;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let timeoutTimer = null;
    let attemptSequence = 0;
    let activeMethod = "";
    let accepted = false;
    const documentRef = windowRef.document;
    const supportsPageConfirmation = Boolean(documentRef?.addEventListener && windowRef.addEventListener);
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
      windowRef.clearTimeout(timeoutTimer);
      removeReadinessListeners();
      if (supportsPageConfirmation) {
        documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
        windowRef.removeEventListener("pagehide", handlePageLeave);
        windowRef.removeEventListener("beforeunload", handlePageLeave);
      }
      resolve(status);
    };
    const handlePageLeave = () => {
      if (!activeMethod || settled) return;
      mark("page_hidden", activeMethod);
      finish("handoff");
    };
    const handleVisibilityChange = () => {
      if (documentRef.visibilityState === "hidden") handlePageLeave();
    };
    if (supportsPageConfirmation) {
      documentRef.addEventListener("visibilitychange", handleVisibilityChange);
      windowRef.addEventListener("pagehide", handlePageLeave);
      windowRef.addEventListener("beforeunload", handlePageLeave);
    }
    timeoutTimer = windowRef.setTimeout(() => {
      const errorCode = accepted ? "handoff_unconfirmed" : activeMethod ? "handoff_timeout" : "bridge_unavailable";
      mark(accepted ? "handoff_unconfirmed" : "handoff_unavailable", activeMethod, errorCode);
      finish(accepted ? "accepted" : "unavailable");
    }, timeoutMs);

    const runAttempt = (miniProgram, attempts, index) => {
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
      const failAttempt = (error) => {
        if (settled || accepted || attemptId !== attemptSequence) return;
        mark("callback_failed", methodName, normalizeBridgeError(error));
        runAttempt(miniProgram, attempts, index + 1);
      };
      try {
        method.call(miniProgram, {
          url,
          success: () => {
            if (settled || attemptId !== attemptSequence) return;
            accepted = true;
            mark("callback_received", methodName);
          },
          fail: failAttempt,
        });
      } catch (error) {
        failAttempt(error);
      }
    };

    function removeReadinessListeners() {
      documentRef?.removeEventListener?.("WeixinJSBridgeReady", startWhenReady);
      documentRef?.removeEventListener?.("load", startWhenReady, true);
      windowRef.removeEventListener?.("load", startWhenReady);
    }
    function startWhenReady() {
      if (settled || activeMethod || typeof windowRef.WeixinJSBridge?.invoke !== "function") return;
      const miniProgram = windowRef.wx?.miniProgram;
      const attempts = methodNames
        .map((methodName) => [methodName, miniProgram?.[methodName]])
        .filter(([, method]) => typeof method === "function");
      if (attempts.length === 0) return;
      removeReadinessListeners();
      mark("bridge_ready");
      runAttempt(miniProgram, attempts, 0);
    }

    // The SDK queues its own callbacks until BridgeReady. Do not enter that queue:
    // a timed-out request must never perform delayed navigation after user retry.
    documentRef?.addEventListener?.("WeixinJSBridgeReady", startWhenReady);
    documentRef?.addEventListener?.("load", startWhenReady, true);
    windowRef.addEventListener?.("load", startWhenReady);
    startWhenReady();
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

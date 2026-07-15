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
  if (!miniProgram?.navigateTo) return Promise.resolve("unavailable");

  const timeoutMs = options.timeoutMs ?? 1200;
  const url = buildMiniProgramShareUrl(payload);
  postMiniProgramSharePayload(miniProgram, payload);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(status);
    };
    const timer = window.setTimeout(() => finish("unavailable"), timeoutMs);
    const tryRedirect = () => {
      if (!miniProgram.redirectTo) {
        finish("unavailable");
        return;
      }
      try {
        miniProgram.redirectTo({
          url,
          success: () => finish("opened"),
          fail: () => finish("unavailable"),
        });
      } catch {
        finish("unavailable");
      }
    };

    try {
      miniProgram.navigateTo({
        url,
        success: () => finish("opened"),
        fail: tryRedirect,
      });
    } catch {
      tryRedirect();
    }
  });
}

function postMiniProgramSharePayload(miniProgram, payload = {}) {
  if (!miniProgram?.postMessage) return;
  try {
    const messageType = {
      crave: "humi:share-crave",
      grocery: "humi:share-grocery",
      invite: "humi:share-household-invite",
      menu: "humi:share-menu",
      today_menu: "humi:share-menu",
      wish: "humi:share-wish",
    }[payload.type] || "humi:share";
    miniProgram.postMessage({
      data: {
        ...payload,
        type: messageType,
      },
    });
  } catch {
    // Best-effort bridge: native share page navigation below is still the primary path.
  }
}

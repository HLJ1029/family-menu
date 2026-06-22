export function getLaunchChannel() {
  if (typeof window === "undefined") return "h5";
  const params = new URLSearchParams(window.location.search);
  return params.get("channel") || "h5";
}

export function isWechatMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  return getLaunchChannel() === "wechat-miniprogram";
}

export function isWechatLoginEnabled() {
  return import.meta.env?.VITE_HUMI_WECHAT_LOGIN_ENABLED === "1";
}

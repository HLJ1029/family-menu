const WECHAT_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";

export async function exchangeWechatCode({ code, appId, appSecret, mock = false }) {
  if (!code) {
    throw createWechatError("missing_code", "wx.login code is required.");
  }

  if (mock) {
    return {
      openid: `mock-openid-${code}`,
      unionid: null,
      session_key: "mock-session-key",
    };
  }

  if (!appId || !appSecret) {
    throw createWechatError("missing_config", "WECHAT_APP_ID and WECHAT_APP_SECRET are required.");
  }

  const url = new URL(WECHAT_CODE2SESSION_URL);
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    throw createWechatError("wechat_code2session_failed", data.errmsg || "WeChat code2Session failed.", data);
  }
  if (!data.openid) {
    throw createWechatError("wechat_openid_missing", "WeChat response did not include openid.", data);
  }
  return data;
}

function createWechatError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

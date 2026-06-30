const WECHAT_CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
const WECHAT_ACCESS_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const WECHAT_PHONE_NUMBER_URL = "https://api.weixin.qq.com/wxa/business/getuserphonenumber";

let cachedAccessToken = null;

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

export async function exchangeWechatPhoneNumber({ code, appId, appSecret, mock = false }) {
  if (!code) {
    throw createWechatError("missing_phone_code", "getPhoneNumber code is required.");
  }

  if (mock) {
    return {
      phoneNumber: "13800001234",
      purePhoneNumber: "13800001234",
      countryCode: "86",
    };
  }

  const accessToken = await getWechatAccessToken({ appId, appSecret });
  const url = new URL(WECHAT_PHONE_NUMBER_URL);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!response.ok || data.errcode) {
    throw createWechatError("wechat_phone_number_failed", data.errmsg || "WeChat phone number exchange failed.", data);
  }
  if (!data.phone_info?.purePhoneNumber) {
    throw createWechatError("wechat_phone_number_missing", "WeChat response did not include phone number.", data);
  }
  return data.phone_info;
}

async function getWechatAccessToken({ appId, appSecret }) {
  if (!appId || !appSecret) {
    throw createWechatError("missing_config", "WECHAT_APP_ID and WECHAT_APP_SECRET are required.");
  }

  if (cachedAccessToken?.token && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const url = new URL(WECHAT_ACCESS_TOKEN_URL);
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    throw createWechatError("wechat_access_token_failed", data.errmsg || "WeChat access token failed.", data);
  }
  if (!data.access_token) {
    throw createWechatError("wechat_access_token_missing", "WeChat response did not include access_token.", data);
  }
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000,
  };
  return cachedAccessToken.token;
}

function createWechatError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 502;
  error.details = details;
  return error;
}

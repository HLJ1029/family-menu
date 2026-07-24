const { HumiRequestError } = require("./errors");
const { HUMI_NATIVE_SESSION_KEY } = require("./config");

function restoreSession(candidate = wx.getStorageSync(HUMI_NATIVE_SESSION_KEY)) {
  if (candidate?.accessToken && Number(candidate.expiresAt) > Date.now()) return candidate;
  if (candidate && arguments.length === 0) wx.removeStorageSync(HUMI_NATIVE_SESSION_KEY);
  return null;
}

function getSession() {
  return restoreSession();
}

function saveSession(session) {
  if (!session?.accessToken || Number(session.expiresAt) <= Date.now()) {
    throw new HumiRequestError(0, "invalid_session");
  }
  wx.setStorageSync(HUMI_NATIVE_SESSION_KEY, session);
  return session;
}

function clearSession() {
  wx.removeStorageSync(HUMI_NATIVE_SESSION_KEY);
}

function callWxLogin() {
  return new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
}

async function loginWithWechat() {
  let result;
  try {
    result = await callWxLogin();
  } catch (error) {
    throw new HumiRequestError(0, "wechat_login_failed");
  }
  if (!result?.code) throw new HumiRequestError(0, "wechat_login_failed");
  const { rawRequest } = require("./request");
  const session = await rawRequest({ path: "/auth/wechat/login", method: "POST", data: { code: result.code } });
  if (!session?.accessToken || !session?.expiresAt) throw new HumiRequestError(0, "wechat_login_failed");
  return saveSession(session);
}

let refreshPromise = null;

function refreshSessionOnce() {
  if (!refreshPromise) {
    refreshPromise = loginWithWechat().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

module.exports = {
  restoreSession,
  getSession,
  saveSession,
  clearSession,
  loginWithWechat,
  refreshSessionOnce
};

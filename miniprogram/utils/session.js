const { HumiRequestError } = require("./errors");
const { HUMI_NATIVE_SESSION_KEY } = require("./config");
const HUMI_NATIVE_SESSION_HISTORY_KEY = `${HUMI_NATIVE_SESSION_KEY}:history`;

function restoreSession(candidate = wx.getStorageSync(HUMI_NATIVE_SESSION_KEY)) {
  const readsStorage = arguments.length === 0;
  if (candidate?.accessToken && Number(candidate.expiresAt) > Date.now()) {
    if (readsStorage) rememberSessionHistory();
    return candidate;
  }
  if (candidate && readsStorage) {
    rememberSessionHistory();
    wx.removeStorageSync(HUMI_NATIVE_SESSION_KEY);
  }
  return null;
}

function getSession() {
  return restoreSession();
}

function hasSessionHistory() {
  if (wx.getStorageSync(HUMI_NATIVE_SESSION_HISTORY_KEY) === true) return true;
  const stored = wx.getStorageSync(HUMI_NATIVE_SESSION_KEY);
  if (!stored?.accessToken) return false;
  rememberSessionHistory();
  return true;
}

function rememberSessionHistory() {
  wx.setStorageSync(HUMI_NATIVE_SESSION_HISTORY_KEY, true);
}

function saveSession(session) {
  if (!session?.accessToken || Number(session.expiresAt) <= Date.now()) {
    throw new HumiRequestError(0, "invalid_session");
  }
  wx.setStorageSync(HUMI_NATIVE_SESSION_KEY, session);
  rememberSessionHistory();
  return session;
}

function clearSession() {
  wx.removeStorageSync(HUMI_NATIVE_SESSION_KEY);
  wx.removeStorageSync(HUMI_NATIVE_SESSION_HISTORY_KEY);
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
  hasSessionHistory,
  saveSession,
  clearSession,
  loginWithWechat,
  refreshSessionOnce
};

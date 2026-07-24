const { HumiRequestError } = require("./errors");
const { getHumiApiBaseUrl } = require("./config");
const session = require("./session");

function normalizePath(path) {
  return String(path || "").startsWith("/") ? path : `/${path || ""}`;
}

function toRequestError(statusCode, data) {
  const status = Number(statusCode) || 0;
  const body = data && typeof data === "object" ? data : {};
  return new HumiRequestError(status, body.error || body.code || "request_failed", {
    latestStateVersion: body.latestStateVersion || body.stateVersion,
    latestEnvelope: body.latestEnvelope || body.envelope
  });
}

function rawRequest(options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { "content-type": "application/json" };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.idempotencyKey) headers["X-Humi-Idempotency-Key"] = options.idempotencyKey;
  if (options.stateVersion) headers["If-Match"] = options.stateVersion;
  return new Promise((resolve, reject) => wx.request({
    url: `${getHumiApiBaseUrl()}${normalizePath(options.path)}`,
    method,
    data: options.data,
    header: headers,
    timeout: Number(options.timeoutMs) || 8000,
    success: ({ statusCode, data }) => {
      if (statusCode >= 200 && statusCode < 300) resolve(data);
      else reject(toRequestError(statusCode, data));
    },
    fail: () => reject(new HumiRequestError(0, "network_error"))
  }));
}

function authenticatedRequest(options) {
  const activeSession = session.getSession();
  if (!activeSession) return Promise.reject(new HumiRequestError(401, "invalid_session", { retryable: false }));
  return rawRequest({ ...options, accessToken: activeSession.accessToken });
}

function getActiveApp() {
  try {
    return typeof getApp === "function" ? getApp() : null;
  } catch (_) {
    return null;
  }
}

function syncAppSession(activeSession) {
  const app = getActiveApp();
  if (typeof app?.setHumiSession === "function") app.setHumiSession(activeSession);
}

function clearActiveSession() {
  const app = getActiveApp();
  if (typeof app?.clearHumiSession === "function") app.clearHumiSession();
  else session.clearSession();
}

async function requestHumi(options = {}) {
  const requestOptions = { ...options, method: String(options.method || "GET").toUpperCase() };
  if (requestOptions.expectedUserId && session.getSession()?.user?.id !== requestOptions.expectedUserId) {
    throw new HumiRequestError(401, "session_owner_changed", { retryable: false });
  }
  const canReplay = requestOptions.method === "GET" || Boolean(requestOptions.idempotencyKey);
  try {
    return await authenticatedRequest(requestOptions);
  } catch (error) {
    if (error.status !== 401 || requestOptions.retry401 === false || !canReplay) throw error;
  }

  try {
    const refreshedSession = await session.refreshSessionOnce();
    syncAppSession(refreshedSession);
  } catch (error) {
    if (error.status !== 401) throw error;
    clearActiveSession();
    throw new HumiRequestError(401, "invalid_session", { retryable: false });
  }
  if (requestOptions.expectedUserId && session.getSession()?.user?.id !== requestOptions.expectedUserId) {
    throw new HumiRequestError(401, "session_owner_changed", { retryable: false });
  }
  try {
    return await authenticatedRequest({ ...requestOptions, retry401: false });
  } catch (error) {
    if (error.status !== 401) throw error;
    clearActiveSession();
    throw new HumiRequestError(401, "invalid_session", { retryable: false });
  }
}

module.exports = { rawRequest, requestHumi };

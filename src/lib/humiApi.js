const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";
const HUMI_API_TIMEOUT_MS = 12_000;

export function isHumiApiSession(session) {
  return Boolean(session?.accessToken && session?.user?.provider === "wechat");
}

export async function loadHumiState(session) {
  const data = await humiApiRequest("/state", { session });
  return data.state ?? null;
}

export async function saveHumiState(session, state) {
  const data = await humiApiRequest("/state", {
    method: "PUT",
    session,
    body: { state },
  });
  return data.state ?? null;
}

export async function logoutHumiSession(session) {
  if (!session?.accessToken) return;
  await humiApiRequest("/auth/logout", {
    method: "POST",
    session,
  });
}

export async function createCraveRequest(payload) {
  return humiPublicRequest("/crave-requests", {
    method: "POST",
    body: payload,
  });
}

export async function loadCraveRequest(token) {
  if (!token) throw new Error("征集链接不完整。");
  return humiPublicRequest(`/crave-requests/${encodeURIComponent(token)}`);
}

export async function submitCraveVote(token, vote) {
  if (!token) throw new Error("征集链接不完整。");
  return humiPublicRequest(`/crave-requests/${encodeURIComponent(token)}/votes`, {
    method: "POST",
    body: vote,
  });
}

export async function closeCraveRequest(token, ownerSecret) {
  if (!token) throw new Error("征集链接不完整。");
  return humiPublicRequest(`/crave-requests/${encodeURIComponent(token)}/close`, {
    method: "POST",
    body: { ownerSecret },
  });
}

async function humiApiRequest(path, { method = "GET", session, body } = {}) {
  if (!session?.accessToken) throw new Error("微信登录已失效，请重新进入小程序。");
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), HUMI_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${getHumiApiBaseUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Humi 账号同步暂时不可用。");
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("同步连接超时，请检查网络后重试。");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function humiPublicRequest(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), HUMI_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${getHumiApiBaseUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Humi 协作暂时不可用。");
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("协作连接超时，请检查网络后重试。");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function getHumiApiBaseUrl() {
  return (import.meta.env?.VITE_HUMI_API_BASE_URL || DEFAULT_HUMI_API_BASE_URL).replace(/\/$/, "");
}

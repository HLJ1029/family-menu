const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";
const HUMI_API_TIMEOUT_MS = 12_000;

export function isHumiApiSession(session) {
  return Boolean(session?.accessToken && session?.user?.provider === "wechat");
}

export async function loadHumiState(session) {
  return humiApiRequest("/state", { session });
}

export async function saveHumiState(session, state) {
  return humiApiRequest("/state", {
    method: "PUT",
    session,
    body: { state },
  });
}

export async function loadHumiHouseholds(session) {
  return humiApiRequest("/households", { session });
}

export async function createHumiHousehold(session, payload) {
  return humiApiRequest("/households", {
    method: "POST",
    session,
    body: payload,
  });
}

export async function switchHumiHousehold(session, householdId) {
  return humiApiRequest("/households/active", {
    method: "POST",
    session,
    body: { householdId },
  });
}

export async function createHouseholdInvite(session, payload) {
  return humiApiRequest("/household-invites", {
    method: "POST",
    session,
    body: payload,
  });
}

export async function loadHouseholdInvite(token) {
  if (!token) throw new Error("家庭邀请不完整。");
  return humiPublicRequest(`/household-invites/${encodeURIComponent(token)}`);
}

export async function joinHouseholdInvite(token, session, payload = {}) {
  if (!token) throw new Error("家庭邀请不完整。");
  return humiApiRequest(`/household-invites/${encodeURIComponent(token)}/join`, {
    method: "POST",
    session,
    body: payload,
  });
}

export async function logoutHumiSession(session) {
  if (!session?.accessToken) return;
  await humiApiRequest("/auth/logout", {
    method: "POST",
    session,
  });
}

export async function createCraveRequest(payload, session = null) {
  if (isHumiApiSession(session)) {
    return humiApiRequest("/crave-requests", {
      method: "POST",
      session,
      body: payload,
    });
  }
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

export async function joinCraveRequest(token, session, payload) {
  if (!token) throw new Error("征集链接不完整。");
  return humiApiRequest(`/crave-requests/${encodeURIComponent(token)}/join`, {
    method: "POST",
    session,
    body: payload,
  });
}

export async function closeCraveRequest(token, ownerSecret, payload = {}) {
  if (!token) throw new Error("征集链接不完整。");
  return humiPublicRequest(`/crave-requests/${encodeURIComponent(token)}/close`, {
    method: "POST",
    body: { ownerSecret, ...payload },
  });
}

export async function createGroceryShare(session, payload) {
  return humiApiRequest("/grocery-shares", {
    method: "POST",
    session,
    body: payload,
  });
}

export async function loadGroceryShare(token) {
  if (!token) throw new Error("买菜清单不完整。");
  return humiPublicRequest(`/grocery-shares/${encodeURIComponent(token)}`);
}

export async function claimGroceryShareItem(token, payload, session = null) {
  if (!token) throw new Error("买菜清单不完整。");
  if (isHumiApiSession(session)) {
    return humiApiRequest(`/grocery-shares/${encodeURIComponent(token)}/claims`, {
      method: "POST",
      session,
      body: payload,
    });
  }
  return humiPublicRequest(`/grocery-shares/${encodeURIComponent(token)}/claims`, {
    method: "POST",
    body: payload,
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

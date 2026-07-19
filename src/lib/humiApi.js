const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";
const HUMI_API_TIMEOUT_MS = 12_000;

export function isHumiApiSession(session) {
  return Boolean(session?.accessToken && session?.user?.provider === "wechat");
}

export function normalizeHumiApiError(error, context = "collaboration") {
  if (error?.name === "AbortError") {
    return new Error(context === "sync"
      ? "同步连接超时，请检查网络后重试。"
      : "协作连接超时，请检查网络后重试。");
  }
  const message = String(error?.message || "");
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) {
    return new Error(context === "sync"
      ? "同步连接失败，请检查网络后重试。"
      : "协作连接失败，请检查网络后重试。");
  }
  return error instanceof Error
    ? error
    : new Error(context === "sync" ? "Humi 账号同步暂时不可用。" : "Humi 协作暂时不可用。");
}

export async function exchangeHumiTicket(ticket) {
  if (!ticket) throw new Error("登录链接不完整。");
  return humiPublicRequest("/auth/h5/exchange", {
    method: "POST",
    body: { ticket },
  });
}

export async function loadHumiState(session) {
  const data = await loadHumiStateEnvelope(session);
  return data.state ?? null;
}

export function loadHumiStateEnvelope(session) {
  return humiApiRequest("/state", { session });
}

export async function saveHumiState(session, state, householdId = state?.householdId) {
  const data = await humiApiRequest("/state", {
    method: "PUT",
    session,
    body: { state, householdId },
  });
  return data.state ?? null;
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

export async function submitHouseholdInviteWant(token, payload = {}) {
  if (!token) throw new Error("家庭邀请不完整。");
  return humiPublicRequest(`/household-invites/${encodeURIComponent(token)}/wants`, {
    method: "POST",
    body: payload,
  });
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
    return humiApiRequest("/crave-requests", { method: "POST", session, body: payload });
  }
  return humiPublicRequest("/crave-requests", { method: "POST", body: payload });
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

export async function closeCraveRequest(token, ownerSecret, payload = {}, session = null) {
  if (!token) throw new Error("征集链接不完整。");
  const requester = session ? humiApiRequest : humiPublicRequest;
  return requester(`/crave-requests/${encodeURIComponent(token)}/close`, {
    method: "POST",
    ...(session ? { session } : {}),
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

// Compatibility contract for the user's batch-claim UI. The API keeps these
// routes while newer clients can use the item-level grocery share functions above.
export async function createGroceryShareRequest(payload, session = null) {
  if (isHumiApiSession(session)) {
    return humiApiRequest("/grocery-share-requests", { method: "POST", session, body: payload });
  }
  return humiPublicRequest("/grocery-share-requests", { method: "POST", body: payload });
}

export async function loadGroceryShareRequest(token) {
  if (!token) throw new Error("清单链接不完整。");
  return humiPublicRequest(`/grocery-share-requests/${encodeURIComponent(token)}`);
}

export async function submitGroceryShareClaim(token, claim) {
  if (!token) throw new Error("清单链接不完整。");
  return humiPublicRequest(`/grocery-share-requests/${encodeURIComponent(token)}/claims`, {
    method: "POST",
    body: claim,
  });
}

export async function updateGroceryShareItemChecked(token, itemId, checked) {
  if (!token) throw new Error("清单链接不完整。");
  if (!itemId) throw new Error("食材不完整。");
  return humiPublicRequest(`/grocery-share-requests/${encodeURIComponent(token)}/items/${encodeURIComponent(itemId)}/check`, {
    method: "POST",
    body: { checked },
  });
}

export function joinGroceryShareRequest(token, session, payload) {
  if (!token) throw new Error("清单链接不完整。");
  return humiApiRequest(`/grocery-share-requests/${encodeURIComponent(token)}/join`, {
    method: "POST",
    session,
    body: payload,
  });
}

export async function createMenuShareRequest(payload, session = null) {
  if (isHumiApiSession(session)) {
    return humiApiRequest("/menu-share-requests", { method: "POST", session, body: payload });
  }
  return humiPublicRequest("/menu-share-requests", { method: "POST", body: payload });
}

export async function loadMenuShareRequest(token) {
  if (!token) throw new Error("菜单链接不完整。");
  return humiPublicRequest(`/menu-share-requests/${encodeURIComponent(token)}`);
}

export async function uploadPosterShare(session, blob) {
  if (!session?.accessToken) throw new Error("微信登录已失效，请重新进入小程序。");
  if (!(blob instanceof Blob) || !["image/jpeg", "image/png"].includes(blob.type)) {
    throw new Error("海报图片没有准备完整，请重新生成。");
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${getHumiApiBaseUrl()}/poster-shares`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type,
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: blob,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "海报暂时没传到微信，请稍后再试。");
    }
    return data;
  } catch (error) {
    throw normalizeHumiApiError(error, "collaboration");
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function createWishShareRequest(payload, session = null) {
  if (isHumiApiSession(session)) {
    return humiApiRequest("/wish-share-requests", { method: "POST", session, body: payload });
  }
  return humiPublicRequest("/wish-share-requests", { method: "POST", body: payload });
}

export async function loadWishShareRequest(token) {
  if (!token) throw new Error("想吃入口不完整。");
  return humiPublicRequest(`/wish-share-requests/${encodeURIComponent(token)}`);
}

export async function submitWishShareEntry(token, wish) {
  if (!token) throw new Error("想吃入口不完整。");
  return humiPublicRequest(`/wish-share-requests/${encodeURIComponent(token)}/wishes`, {
    method: "POST",
    body: wish,
  });
}

export function joinWishShareRequest(token, session, payload) {
  if (!token) throw new Error("想吃入口不完整。");
  return humiApiRequest(`/wish-share-requests/${encodeURIComponent(token)}/join`, {
    method: "POST",
    session,
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
      const error = new Error(data.message || "Humi 账号同步暂时不可用。");
      error.status = response.status;
      error.code = data.error || "";
      throw error;
    }
    return data;
  } catch (error) {
    throw normalizeHumiApiError(error, "sync");
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
    throw normalizeHumiApiError(error, "collaboration");
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function getHumiApiBaseUrl() {
  return (import.meta.env?.VITE_HUMI_API_BASE_URL || DEFAULT_HUMI_API_BASE_URL).replace(/\/$/, "");
}

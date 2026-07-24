const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";
const HUMI_API_TIMEOUT_MS = 12_000;
const sessionInvalidListeners = new Set();

export function subscribeHumiSessionInvalid(listener) {
  if (typeof listener !== "function") return () => {};
  sessionInvalidListeners.add(listener);
  return () => {
    sessionInvalidListeners.delete(listener);
  };
}

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

export function createHumiMealRun(session, payload) {
  return humiApiRequest("/meal-runs", { method: "POST", session, body: payload });
}

export function requestDinnerRecommendation(session, payload) {
  return humiApiRequest("/recommendations/dinner", {
    method: "POST",
    session,
    body: payload,
  });
}

export function loadCurrentHumiMealRun(session, {
  householdId,
  dateKey,
  mealSlot = "dinner",
  mealRunId = "",
}) {
  const params = new URLSearchParams({ householdId, dateKey, mealSlot });
  if (mealRunId) params.set("mealRunId", mealRunId);
  return humiApiRequest(`/meal-runs/current?${params.toString()}`, { session });
}

export function startHumiMealRun(session, mealRunId) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/start`, { method: "POST", session, body: {} });
}

export function updateHumiMealRunProgress(session, mealRunId, payload) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/progress`, { method: "PUT", session, body: payload });
}

export function completeHumiMealRun(session, mealRunId, payload = {}) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/complete`, { method: "POST", session, body: payload });
}

export function downgradeHumiMealRun(session, mealRunId, action) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/downgrade`, { method: "POST", session, body: { action } });
}

export function abandonHumiMealRun(session, mealRunId, reason) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/abandon`, { method: "POST", session, body: { reason } });
}

export function updateHumiMealRunFeedback(session, mealRunId, value) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/feedback`, { method: "PUT", session, body: { value } });
}

export function createHumiMealTask(session, mealRunId, payload) {
  return humiApiRequest(`/meal-runs/${encodeURIComponent(mealRunId)}/tasks`, { method: "POST", session, body: payload });
}

export function claimHumiMealTask(session, token) {
  return humiApiRequest(`/meal-tasks/${encodeURIComponent(token)}/claim`, { method: "POST", session, body: {} });
}

export function loadHumiMealTask(session, token) {
  return humiApiRequest(`/meal-tasks/${encodeURIComponent(token)}`, { session });
}

export function completeHumiMealTask(session, token) {
  return humiApiRequest(`/meal-tasks/${encodeURIComponent(token)}/complete`, { method: "POST", session, body: {} });
}

export function loadHumiMealReminderConfig(session) {
  return humiApiRequest("/meal-reminders/config", { session });
}

export function createHumiMealReminder(session, payload) {
  return humiApiRequest("/meal-reminders", { method: "POST", session, body: payload });
}

export function cancelHumiMealReminder(session, reminderId) {
  return humiApiRequest(`/meal-reminders/${encodeURIComponent(reminderId)}`, { method: "DELETE", session });
}

export function recordHumiProductEvent(session, payload) {
  return humiApiRequest("/product-events", { method: "POST", session, body: payload });
}

export function updateHumiIdentityProfile(session, profile) {
  return humiApiRequest("/identity/profile", {
    method: "PUT",
    session,
    body: profile,
  });
}

export async function loadHumiHouseholds(session) {
  return humiApiRequest("/households", { session });
}

export function loadHouseholdCollaborations(session, householdId, limit = 50, options = {}) {
  if (!householdId) throw new Error("家庭信息不完整，请返回后重试。");
  const safeLimit = normalizeCollaborationHistoryLimit(limit);
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}/collaborations?limit=${safeLimit}`, {
    session,
    signal: options.signal,
  });
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

export function updateHumiHousehold(session, householdId, patch) {
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}`, {
    method: "PATCH", session, body: patch,
  });
}

export function removeHumiHouseholdMember(session, householdId, memberId) {
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE", session,
  });
}

export function transferHumiHouseholdOwnership(session, householdId, memberId) {
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}/owner`, {
    method: "POST", session, body: { memberId },
  });
}

export function leaveHumiHousehold(session, householdId) {
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}/leave`, {
    method: "POST", session,
  });
}

export async function createHouseholdInvite(session, payload, options = {}) {
  return humiApiRequest("/household-invites", {
    method: "POST",
    session,
    body: {
      ...payload,
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    },
    notifySessionInvalid: options.notifySessionInvalid,
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

export async function submitCraveVote(token, vote, session = null) {
  if (!token) throw new Error("征集链接不完整。");
  if (isHumiApiSession(session)) {
    return humiApiRequest(`/crave-requests/${encodeURIComponent(token)}/votes`, {
      method: "POST",
      session,
      body: vote,
    });
  }
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
export async function createGroceryShareRequest(payload, session = null, options = {}) {
  if (isHumiApiSession(session)) {
    return humiApiRequest("/grocery-share-requests", {
      method: "POST",
      session,
      body: {
        ...payload,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      },
      notifySessionInvalid: options.notifySessionInvalid,
    });
  }
  return humiPublicRequest("/grocery-share-requests", { method: "POST", body: payload });
}

export async function loadGroceryShareRequest(token) {
  if (!token) throw new Error("清单链接不完整。");
  return humiPublicRequest(`/grocery-share-requests/${encodeURIComponent(token)}`);
}

export async function submitGroceryShareClaim(token, claim, session = null) {
  if (!token) throw new Error("清单链接不完整。");
  if (isHumiApiSession(session)) {
    return humiApiRequest(`/grocery-share-requests/${encodeURIComponent(token)}/claims`, {
      method: "POST",
      session,
      body: claim,
    });
  }
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

export async function createMenuShareRequest(payload, session = null, options = {}) {
  if (isHumiApiSession(session)) {
    return humiApiRequest("/menu-share-requests", {
      method: "POST",
      session,
      body: {
        ...payload,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      },
      notifySessionInvalid: options.notifySessionInvalid,
    });
  }
  return humiPublicRequest("/menu-share-requests", { method: "POST", body: payload });
}

export async function loadMenuShareRequest(token) {
  if (!token) throw new Error("菜单链接不完整。");
  return humiPublicRequest(`/menu-share-requests/${encodeURIComponent(token)}`);
}

export async function uploadPosterShare(session, blob, options = {}) {
  if (!session?.accessToken) throw new Error("微信登录已失效，请重新进入小程序。");
  if (!(blob instanceof Blob) || !["image/jpeg", "image/png"].includes(blob.type)) {
    throw new Error("海报图片没有准备完整，请重新生成。");
  }
  const styleId = options.styleId === "theme" ? "theme" : "default";
  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (idempotencyKey.length > 100) {
    throw new Error("海报版本标识无效，请重新生成海报。");
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${getHumiApiBaseUrl()}/poster-shares`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type,
        Authorization: `Bearer ${session.accessToken}`,
        "X-Humi-Poster-Style": styleId,
        ...(idempotencyKey ? { "X-Humi-Idempotency-Key": idempotencyKey } : {}),
      },
      body: blob,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "海报暂时没传到微信，请稍后再试。");
      error.status = response.status;
      error.code = data.error || "";
      throw error;
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

export async function submitWishShareEntry(token, wish, session = null) {
  if (!token) throw new Error("想吃入口不完整。");
  if (isHumiApiSession(session)) {
    return humiApiRequest(`/wish-share-requests/${encodeURIComponent(token)}/wishes`, {
      method: "POST",
      session,
      body: wish,
    });
  }
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

async function humiApiRequest(path, { method = "GET", session, body, signal, notifySessionInvalid = true } = {}) {
  if (!session?.accessToken) throw new Error("微信登录已失效，请重新进入小程序。");
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), HUMI_API_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.("abort", abortFromCaller, { once: true });

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
      if (notifySessionInvalid && (response.status === 401 || error.code === "invalid_session")) {
        for (const listener of sessionInvalidListeners) {
          try {
            listener(error);
          } catch {
            // Session cleanup must not replace the original API error.
          }
        }
      }
      throw error;
    }
    return data;
  } catch (error) {
    throw normalizeHumiApiError(error, "sync");
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener?.("abort", abortFromCaller);
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

function normalizeCollaborationHistoryLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}

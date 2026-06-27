const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";

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

async function humiApiRequest(path, { method = "GET", session, body } = {}) {
  if (!session?.accessToken) throw new Error("微信登录已失效，请重新进入小程序。");
  const response = await fetch(`${getHumiApiBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Humi 账号同步暂时不可用。");
  }
  return data;
}

function getHumiApiBaseUrl() {
  return (import.meta.env?.VITE_HUMI_API_BASE_URL || DEFAULT_HUMI_API_BASE_URL).replace(/\/$/, "");
}

// 前端只调用 Humi 自建 AI 端点，由服务端统一执行身份、额度与付费闸门。
import { readHumiSession } from "./humiIdentity";

const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";

function getHumiApiBaseUrl() {
  return (import.meta.env?.VITE_HUMI_API_BASE_URL || DEFAULT_HUMI_API_BASE_URL).replace(/\/$/, "");
}

async function postJson(path, body) {
  const session = readHumiSession();
  const headers = { "Content-Type": "application/json" };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

  const response = await fetch(`${getHumiApiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP_${response.status}`);
  }
  return data;
}

export async function recommendMealsViaApi(context) {
  return postJson("/recommend", context);
}

export async function explainRecommendationViaApi(recommendation) {
  const data = await postJson("/explain", { recommendation });
  return data?.text ?? recommendation.reason;
}

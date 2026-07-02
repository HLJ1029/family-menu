// 前端调用自建 AI 端点（/recommend、/explain），替代 Supabase Edge Function。
// 精准模式需要登录主厨身份，并由服务端统一执行家庭额度与付费闸门。
// 由 VITE_HUMI_AI_VIA_API==="1" 开启；未开启时调用方继续走 Supabase（见 aiRecommendation/aiExplanation）。
import { readHumiSession } from "./humiIdentity";

const DEFAULT_HUMI_API_BASE_URL = "https://api.humi-home.com";

export const isHumiAiViaApiEnabled = import.meta.env?.VITE_HUMI_AI_VIA_API === "1";

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

// 与 supabase/aiRecommendation.recommendMeals 返回同构：{ recipeIds, reason, explanation, source }
export async function recommendMealsViaApi(context) {
  return postJson("/recommend", context);
}

// 与 supabase/aiExplanation.explainRecommendation 返回同构：string
export async function explainRecommendationViaApi(recommendation) {
  const data = await postJson("/explain", { recommendation });
  return data?.text ?? recommendation.reason;
}

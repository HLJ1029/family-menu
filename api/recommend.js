// 自建 AI 推荐：从 Supabase Edge Function `recommend-meals` 忠实移植到自建后端。
// 设计为纯模块 + 可注入 fetch，便于单测与在 api/server.js 中作为新增路由挂载。
// 激活需在服务端配置 DEEPSEEK_API_KEY；未配置时调用方应回退到本地规则推荐。

const SYSTEM_PROMPT =
  "你是 Humi 的家庭晚饭推荐助手。你的目标不是炫技，而是给出用户今晚真的愿意照做的晚饭组合。" +
  "必须优先参考 compactFamilyPrompt、familyProfile 和 recentFeedback；如果用户刚反馈太麻烦、家里没材料、想清淡点或想吃肉，下一组要明显避开这个问题。" +
  "必须只从候选菜谱中选择，不能创造新菜。优先考虑：1. 忌口和过敏绝对禁止；2. 买菜勾选里顺手记下、家里可能还有的主食材；3. 避开近期重复菜；4. 总耗时尽量不超过45分钟；" +
  "5. 主食材缺口尽量不超过3项，调料和可跳过项不要算成主要缺口；6. 尽量一荤/蛋白搭配一蔬菜/汤/清爽类。" +
  '输出 JSON，格式为 {"recipeIds":["id1","id2"],"reason":"...","pantry":"...","preference":"...","grocery":"..."}。' +
  "recipeIds 必须包含 1-2 个候选 id，不能返回菜名。推荐理由要生活化，不提 AI、模型或算法。";

export class RecommendError extends Error {
  constructor(message, status = 500, code = "recommend_error") {
    super(message);
    this.name = "RecommendError";
    this.status = status;
    this.code = code;
  }
}

/**
 * 生成晚饭推荐。与原 Edge Function 输入/输出契约保持一致。
 * @param {object} payload 前端传入的推荐上下文（candidates 必填）。
 * @param {object} options
 * @param {string} options.apiKey DeepSeek API key（必填）。
 * @param {string} [options.model]
 * @param {string} [options.baseUrl]
 * @param {typeof fetch} [options.fetchImpl] 可注入，便于测试。
 * @returns {Promise<{recipeIds:string[],reason:string,explanation:object,source:string}>}
 */
export async function generateMealRecommendation(payload, options = {}) {
  const { apiKey, model = "deepseek-v4-flash", baseUrl = "https://api.deepseek.com", fetchImpl = fetch } = options;

  if (!apiKey) {
    throw new RecommendError("DEEPSEEK_API_KEY is not configured.", 500, "deepseek_not_configured");
  }
  if (!Array.isArray(payload?.candidates) || payload.candidates.length === 0) {
    throw new RecommendError("Missing recommendation candidates.", 400, "missing_candidates");
  }

  const candidates = payload.candidates;
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const candidateList = candidates
    .map((candidate) => `${candidate.id}=${candidate.name ?? candidate.id}`)
    .join("; ");

  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            validCandidateIds: [...candidateIds],
            candidateIdMap: candidateList,
            candidates: payload.candidates,
            pantryItems: payload.pantryItems,
            familyProfile: payload.familyProfile,
            compactFamilyPrompt: payload.compactFamilyPrompt,
            familyPreferences: payload.familyPreferences,
            recentRecipeIds: payload.recentRecipeIds,
            recentFeedback: payload.recentFeedback,
            currentMissingItems: payload.currentMissingItems,
            acceptanceRules: payload.acceptanceRules,
            ruleFallback: payload.ruleFallback,
          }),
        },
      ],
      temperature: 0.3,
      max_tokens: 320,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new RecommendError(data?.error?.message ?? "DeepSeek request failed.", response.status || 502, "deepseek_failed");
  }

  const parsed = parseJson(extractText(data));
  const recipeIds = resolveRecipeIds({
    parsed,
    candidates,
    candidateIds,
    fallbackIds: payload.ruleFallback?.recipeIds,
  });

  return {
    recipeIds,
    reason: String(parsed.reason ?? payload.ruleFallback?.reason ?? "已按家庭情况和偏好生成推荐。"),
    explanation: {
      pantry: String(parsed.pantry ?? "已参考家里可能还有的食材。"),
      preference: String(parsed.preference ?? "已参考家庭偏好。"),
      grocery: String(parsed.grocery ?? "已参考采购缺口。"),
    },
    source: "deepseek",
  };
}

const EXPLAIN_SYSTEM_PROMPT =
  "你是 Humi 的家庭饮食解释助手。你只解释推荐结果，不重新决定菜单。输出中文，简短、具体、可执行。";

/**
 * 生成推荐解释文案。与原 Edge Function explain-recommendation 契约一致。
 * @returns {Promise<{text:string,source:string}>}
 */
export async function generateRecommendationExplanation(payload, options = {}) {
  const { apiKey, model = "deepseek-v4-flash", baseUrl = "https://api.deepseek.com", fetchImpl = fetch } = options;

  if (!apiKey) {
    throw new RecommendError("DEEPSEEK_API_KEY is not configured.", 500, "deepseek_not_configured");
  }
  const ruleResult = payload?.recommendation;
  if (!ruleResult?.recipes?.length) {
    throw new RecommendError("Missing recommendation payload.", 400, "missing_recommendation");
  }

  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            recipes: ruleResult.recipes.map((recipe) => ({
              name: recipe.name,
              categories: recipe.categories,
              timeMinutes: recipe.timeMinutes,
            })),
            reason: ruleResult.reason,
            explanation: ruleResult.explanation,
            missingItems: ruleResult.missingItems,
            inventoryHits: ruleResult.inventoryHits,
            expiringHits: ruleResult.expiringHits,
            preferenceHits: ruleResult.preferenceHits,
            nutrition: ruleResult.nutrition,
          }),
        },
      ],
      temperature: 0.4,
      max_tokens: 220,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new RecommendError(data?.error?.message ?? "DeepSeek request failed.", response.status || 502, "deepseek_failed");
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  return { text: text || ruleResult.reason, source: "deepseek" };
}

export function extractText(data) {
  return data?.choices?.[0]?.message?.content?.trim() ?? "{}";
}

export function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

export function resolveRecipeIds({ parsed, candidates, candidateIds, fallbackIds }) {
  const byNormalizedKey = new Map();
  candidates.forEach((candidate) => {
    byNormalizedKey.set(normalizeCandidateKey(candidate.id), candidate.id);
    if (candidate.name) byNormalizedKey.set(normalizeCandidateKey(candidate.name), candidate.id);
  });

  const rawIds = collectRecipeSignals(parsed);
  const resolved = rawIds
    .map((value) => resolveRecipeId(value, candidateIds, byNormalizedKey))
    .filter((id) => Boolean(id));

  const fallback = Array.isArray(fallbackIds)
    ? fallbackIds.filter((id) => typeof id === "string" && candidateIds.has(id))
    : [];

  return [...new Set([...resolved, ...fallback])].slice(0, 2);
}

function collectRecipeSignals(parsed) {
  const values = [parsed.recipeIds, parsed.recipes, parsed.recipeId, parsed.recipeNames, parsed.names];
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          return [item.id, item.recipeId, item.name].filter((entry) => typeof entry === "string");
        }
        return [];
      });
    }
    return typeof value === "string" ? [value] : [];
  });
}

function resolveRecipeId(value, candidateIds, byNormalizedKey) {
  if (candidateIds.has(value)) return value;
  return byNormalizedKey.get(normalizeCandidateKey(value));
}

function normalizeCandidateKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-+，,、。.[\]【】（）()]/g, "");
}

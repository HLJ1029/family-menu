const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    const model = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-v4-flash";
    const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";

    if (!apiKey) {
      return jsonResponse({ error: "DEEPSEEK_API_KEY is not configured." }, 500);
    }

    const payload = await request.json();
    if (!Array.isArray(payload?.candidates) || payload.candidates.length === 0) {
      return jsonResponse({ error: "Missing recommendation candidates." }, 400);
    }
    const candidates = payload.candidates as Array<{ id: string; name?: string }>;
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const candidateList = candidates.map((candidate) => `${candidate.id}=${candidate.name ?? candidate.id}`).join("; ");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是 Humi 的家庭晚饭推荐助手。你的目标不是炫技，而是给出用户今晚真的愿意照做的晚饭组合。必须优先参考 compactFamilyPrompt、familyProfile 和 recentFeedback；如果用户刚反馈太麻烦、家里没材料、想清淡点或想吃肉，下一组要明显避开这个问题。必须只从候选菜谱中选择，不能创造新菜。优先考虑：1. 忌口和过敏绝对禁止；2. 快到期和家里已有的主食材；3. 避开近期重复菜；4. 总耗时尽量不超过45分钟；5. 主食材缺口尽量不超过3项，调料和常备项不要算成主要缺口；6. 尽量一荤/蛋白搭配一蔬菜/汤/清爽类。输出 JSON，格式为 {\"recipeIds\":[\"id1\",\"id2\"],\"reason\":\"...\",\"pantry\":\"...\",\"preference\":\"...\",\"grocery\":\"...\"}。recipeIds 必须包含 1-2 个候选 id，不能返回菜名。推荐理由要生活化，不提 AI、模型或算法。",
          },
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
      return jsonResponse({ error: data?.error?.message ?? "DeepSeek request failed." }, response.status);
    }

    const parsed = parseJson(extractText(data));
    const recipeIds = resolveRecipeIds({ parsed, candidates, candidateIds, fallbackIds: payload.ruleFallback?.recipeIds });

    return jsonResponse({
      recipeIds,
      reason: String(parsed.reason ?? payload.ruleFallback?.reason ?? "已按家庭库存和偏好生成推荐。"),
      explanation: {
        pantry: String(parsed.pantry ?? "已参考厨房库存。"),
        preference: String(parsed.preference ?? "已参考家庭偏好。"),
        grocery: String(parsed.grocery ?? "已参考采购缺口。"),
      },
      source: "deepseek",
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});

function extractText(data: { choices?: Array<{ message?: { content?: string } }> }) {
  return data.choices?.[0]?.message?.content?.trim() ?? "{}";
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function resolveRecipeIds({
  parsed,
  candidates,
  candidateIds,
  fallbackIds,
}: {
  parsed: Record<string, unknown>;
  candidates: Array<{ id: string; name?: string }>;
  candidateIds: Set<string>;
  fallbackIds?: unknown;
}) {
  const byNormalizedKey = new Map<string, string>();
  candidates.forEach((candidate) => {
    byNormalizedKey.set(normalizeCandidateKey(candidate.id), candidate.id);
    if (candidate.name) byNormalizedKey.set(normalizeCandidateKey(candidate.name), candidate.id);
  });

  const rawIds = collectRecipeSignals(parsed);
  const resolved = rawIds
    .map((value) => resolveRecipeId(value, candidateIds, byNormalizedKey))
    .filter((id): id is string => Boolean(id));

  const fallback = Array.isArray(fallbackIds)
    ? fallbackIds.filter((id): id is string => typeof id === "string" && candidateIds.has(id))
    : [];

  return [...new Set([...resolved, ...fallback])].slice(0, 2);
}

function collectRecipeSignals(parsed: Record<string, unknown>) {
  const values = [parsed.recipeIds, parsed.recipes, parsed.recipeId, parsed.recipeNames, parsed.names];
  return values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return [record.id, record.recipeId, record.name].filter((entry): entry is string => typeof entry === "string");
        }
        return [];
      });
    }
    return typeof value === "string" ? [value] : [];
  });
}

function resolveRecipeId(value: string, candidateIds: Set<string>, byNormalizedKey: Map<string, string>) {
  if (candidateIds.has(value)) return value;
  return byNormalizedKey.get(normalizeCandidateKey(value));
}

function normalizeCandidateKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-+，,、。.\[\]【】（）()]/g, "");
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

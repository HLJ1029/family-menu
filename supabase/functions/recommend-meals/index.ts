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
              "你是 FamilyOS 的家庭饮食推荐助手。你必须只从候选菜谱中选择，不能创造新菜。输出 JSON，格式为 {\"recipeIds\":[\"id1\",\"id2\"],\"reason\":\"...\",\"pantry\":\"...\",\"preference\":\"...\",\"grocery\":\"...\"}。recipeIds 必须包含 1-2 个候选 id。",
          },
          {
            role: "user",
            content: JSON.stringify({
              candidates: payload.candidates,
              pantryItems: payload.pantryItems,
              familyPreferences: payload.familyPreferences,
              recentRecipeIds: payload.recentRecipeIds,
              currentMissingItems: payload.currentMissingItems,
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
    const candidateIds = new Set(payload.candidates.map((candidate: { id: string }) => candidate.id));
    const recipeIds = Array.isArray(parsed.recipeIds)
      ? parsed.recipeIds.filter((id: unknown) => typeof id === "string" && candidateIds.has(id)).slice(0, 2)
      : [];

    if (recipeIds.length === 0) {
      return jsonResponse({ error: "DeepSeek did not return valid candidate recipe ids." }, 422);
    }

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

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL");

    if (!apiKey) {
      return jsonResponse({ error: "OPENAI_API_KEY is not configured." }, 500);
    }
    if (!model) {
      return jsonResponse({ error: "OPENAI_MODEL is not configured." }, 500);
    }

    const payload = await request.json();
    const ruleResult = payload?.recommendation;

    if (!ruleResult?.recipes?.length) {
      return jsonResponse({ error: "Missing recommendation payload." }, 400);
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "你是 FamilyOS 的家庭饮食解释助手。你只解释规则推荐结果，不重新决定菜单。输出中文，简短、具体、可执行。",
          },
          {
            role: "user",
            content: JSON.stringify({
              recipes: ruleResult.recipes.map((recipe: Record<string, unknown>) => ({
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
        max_output_tokens: 220,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonResponse({ error: data?.error?.message ?? "OpenAI request failed." }, response.status);
    }

    return jsonResponse({
      text: extractText(data) || ruleResult.reason,
      source: "openai",
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});

function extractText(data: { output_text?: string; output?: Array<Record<string, unknown>> }) {
  if (data.output_text) return data.output_text;

  return data.output
    ?.flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (typeof content === "object" && content && "text" in content) {
        return String(content.text);
      }
      return "";
    })
    .join("")
    .trim();
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

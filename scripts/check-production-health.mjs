const checks = [];

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    checks.push({
      name,
      ok: true,
      ms: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      ms: Date.now() - startedAt,
      error: error.message,
    });
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 200);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { status: response.status, data };
}

await check("h5", async () => {
  const response = await fetch("https://www.humi-home.com/?channel=wechat-miniprogram");
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  if (!text.includes("<div id=\"root\">")) throw new Error("H5 root container missing.");
  return { status: response.status };
});

await check("api-health", async () => {
  const { status, data } = await fetchJson("https://api.humi-home.com/health");
  if (data?.ok !== true || data?.service !== "humi-api") {
    throw new Error(`Unexpected health payload: ${JSON.stringify(data)}`);
  }
  return { status, service: data.service };
});

await check("api-recommend", async () => {
  const { status, data } = await fetchJson("https://api.humi-home.com/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidates: [
        {
          id: "tomato-egg",
          name: "西红柿炒鸡蛋",
          categories: ["家常菜", "省时菜"],
          tags: ["15分钟"],
          timeMinutes: 15,
          difficulty: "简单",
          ingredients: ["西红柿", "鸡蛋"],
        },
        {
          id: "steamed-white-rice",
          name: "白米饭",
          categories: ["主食"],
          tags: ["基础"],
          timeMinutes: 30,
          difficulty: "简单",
          ingredients: ["大米"],
        },
      ],
      pantryItems: [{ name: "鸡蛋", amount: "3个" }],
      familyProfile: { familySize: 2 },
      compactFamilyPrompt: "2人晚餐，偏家常。",
      ruleFallback: {
        recipeIds: ["tomato-egg", "steamed-white-rice"],
        reason: "本地兜底推荐。",
      },
    }),
  });
  if (data?.source !== "deepseek") {
    throw new Error(`Expected source=deepseek, got ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { status, source: data.source, recipeIds: data.recipeIds };
});

const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  checks,
}, null, 2));

if (failed.length > 0) process.exit(1);

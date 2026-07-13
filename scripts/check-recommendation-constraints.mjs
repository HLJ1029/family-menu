import { createServer } from "vite";

const vite = await createServer({
  logLevel: "silent",
  server: { middlewareMode: true },
});

const { buildTodayRecommendation } = await vite.ssrLoadModule("/src/lib/recommendation/rules.js");

const scenarios = [
  {
    name: "海鲜忌口不应推荐鱼虾海鲜",
    profile: { familySize: 2, dislikes: ["海鲜"], allergies: [] },
    forbidden: ["海鲜", "鱼", "虾", "贝", "蟹"],
  },
  {
    name: "鸡蛋过敏不应推荐鸡蛋菜",
    profile: { familySize: 2, dislikes: [], allergies: ["鸡蛋"] },
    forbidden: ["鸡蛋", "蛋类"],
  },
  {
    name: "太辣不应推荐辣味菜",
    profile: { familySize: 2, dislikes: ["太辣"], allergies: [] },
    forbidden: ["辣"],
  },
];

for (const scenario of scenarios) {
  const recommendation = buildTodayRecommendation({ familyProfile: scenario.profile });
  for (const recipe of recommendation.recipes) {
    const haystack = [
      recipe.name,
      recipe.description,
      ...recipe.categories,
      ...recipe.tags,
      ...recipe.ingredients.map((item) => item.name),
    ].join(" ");
    const forbiddenHit = scenario.forbidden.find((signal) => haystack.includes(signal));
    if (forbiddenHit) {
      throw new Error(`${scenario.name}: ${recipe.name} 命中了 ${forbiddenHit}`);
    }
  }
}

const soupRecommendation = buildTodayRecommendation({
  familyProfile: { familySize: 2, dislikes: [], allergies: [] },
  craveVotes: [{ feelingTag: "想喝汤" }],
});
const hasSoup = soupRecommendation.recipes.some((recipe) => {
  const haystack = [
    recipe.name,
    recipe.description,
    ...recipe.categories,
    ...recipe.tags,
  ].join(" ");
  return /汤|粥/.test(haystack);
});
if (!hasSoup || soupRecommendation.feelingHits <= 0) {
  throw new Error("感觉征集想喝汤时，推荐应优先照顾汤/粥类菜品。");
}

const historyBaseline = buildTodayRecommendation({
  familyProfile: { familySize: 2, dislikes: [], allergies: [] },
});
const historyDate = "2026-07-01";
const withMealHistory = buildTodayRecommendation({
  familyProfile: { familySize: 2, dislikes: [], allergies: [] },
  mealLogs: {
    [historyDate]: {
      confirmation: "all",
      consumedEntries: historyBaseline.recipes.map((recipe) => ({ recipeId: recipe.id, quantity: 1 })),
    },
  },
});
const repeatedHistoryCount = withMealHistory.recipes.filter((recipe) => (
  historyBaseline.recipes.some((previous) => previous.id === recipe.id)
)).length;
if (repeatedHistoryCount >= historyBaseline.recipes.length) {
  throw new Error("推荐应降低最近已吃菜品的排名，不能完整重复上一组。");
}
const isolatedBaseline = buildTodayRecommendation({
  familyProfile: { familySize: 2, dislikes: [], allergies: [] },
});
if (isolatedBaseline.title !== historyBaseline.title) {
  throw new Error("不同家庭/请求的最近菜品集合不得跨调用污染。");
}

await vite.close();

console.log("Recommendation hard constraints check passed.");

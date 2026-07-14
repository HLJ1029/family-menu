import { createServer } from "vite";

const vite = await createServer({
  logLevel: "silent",
  server: { middlewareMode: true },
});

const { buildTodayRecommendation } = await vite.ssrLoadModule("/src/lib/recommendation/rules.js");
const { collectLearnedCraveVotes } = await vite.ssrLoadModule("/src/lib/collaboration.js");
const { recipes } = await vite.ssrLoadModule("/src/lib/recipes.js");

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

const learnedVotes = collectLearnedCraveVotes([
  { token: "closed", status: "closed", votes: [{ feelingTag: "想喝汤" }, { feelingTag: "随便都行" }] },
  { token: "open", status: "open", votes: [{ feelingTag: "辣一点" }] },
  { feelingTag: "清淡点" },
]);
if (learnedVotes.length !== 2 || !learnedVotes.some((vote) => vote.feelingTag === "想喝汤") || !learnedVotes.some((vote) => vote.feelingTag === "清淡点")) {
  throw new Error("只有已结束征集和旧本地感觉可以沉淀为后续推荐信号。");
}

const categoryGroups = new Map();
recipes.forEach((recipe) => {
  recipe.categories.forEach((category) => {
    categoryGroups.set(category, [...(categoryGroups.get(category) ?? []), recipe]);
  });
});
const historyGroup = [...categoryGroups.values()].find((items) => items.length >= 4);
if (!historyGroup) throw new Error("菜谱数据需要至少一个可用于历史口味验证的公共分类。");
const historyTasteRecommendation = buildTodayRecommendation({
  familyProfile: { familySize: 2, dislikes: [], allergies: [] },
  mealLogs: {
    "2026-07-02": {
      confirmation: "all",
      consumedEntries: historyGroup.slice(0, 2).map((recipe) => ({ recipeId: recipe.id, quantity: 1 })),
    },
  },
});
if (historyTasteRecommendation.mealHistorySampleCount !== 2 || historyTasteRecommendation.mealHistoryHits <= 0) {
  throw new Error("确认做过的菜应沉淀为类型偏好，同时由近期重复惩罚避免原菜循环。");
}

await vite.close();

console.log("Recommendation hard constraints check passed.");

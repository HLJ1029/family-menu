import { BarChart3, CalendarDays, ChefHat, ListChecks, ShoppingBasket, Sparkles } from "lucide-react";
import { formatDateKey } from "../lib/date";
import { getRecipe, nutritionFor } from "../lib/recipes";
import { getNutritionSummary, NutritionRings } from "./CalendarPage";
import { Card } from "./ui/Card";
import { DoodleArrow } from "./ui/Doodles";
import { BalanceRow, StatBlock } from "./ui/StatsBlocks";

export function StatsPage({ todayRecipes, plannedRecipes, groceryItems, weekPlan, mealCalendar, onViewChange }) {
  const currentMonth = formatDateKey(new Date()).slice(0, 7);
  const monthRecipes = Object.entries(mealCalendar ?? {})
    .filter(([dateKey]) => dateKey.startsWith(currentMonth))
    .flatMap(([, recipeIds]) => recipeIds.map((recipeId) => getRecipe(recipeId)).filter(Boolean));
  const allRecipes = monthRecipes.length > 0 ? monthRecipes : [...todayRecipes, ...plannedRecipes];
  const totalMeals = monthRecipes.length > 0
    ? monthRecipes.length
    : Object.values(weekPlan).reduce((total, recipeIds) => total + recipeIds.length, 0);
  const nutrition = allRecipes.reduce(
    (summary, recipe) => {
      const item = nutritionFor(recipe);
      return {
        caloriesKcal: summary.caloriesKcal + item.caloriesKcal,
        proteinG: summary.proteinG + item.proteinG,
        fatG: summary.fatG + item.fatG,
        carbsG: summary.carbsG + item.carbsG,
      };
    },
    { caloriesKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
  const categoryCounts = allRecipes.reduce((counts, recipe) => {
    recipe.categories.forEach((category) => {
      counts[category] = (counts[category] ?? 0) + 1;
    });
    return counts;
  }, {});
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const averageTime =
    allRecipes.length > 0
      ? Math.round(allRecipes.reduce((total, recipe) => total + recipe.timeMinutes, 0) / allRecipes.length)
      : 0;
  const proteinRecipes = allRecipes.filter((recipe) =>
    recipe.categories.some((category) => ["肉类", "蛋类", "豆制品", "海鲜"].includes(category)),
  ).length;
  const vegetableRecipes = allRecipes.filter((recipe) =>
    recipe.categories.some((category) => ["蔬菜", "清爽", "素食"].includes(category)),
  ).length;
  const maxCategoryCount = Math.max(...topCategories.map(([, count]) => count), 1);
  const monthSummary = getNutritionSummary(allRecipes);

  return (
    <section className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[30px] bg-ink p-6 text-white shadow-lift md:p-8">
          <div className="absolute right-8 top-8 hidden md:block">
            <DoodleArrow />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Nutrition</p>
          <h2 className="mt-4 max-w-xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            本月营养视图
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
            先按本月菜单做轻量估算，帮你看一眼最近吃得偏向哪里。
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <StatBlock label="本月餐次" value={String(totalMeals)} />
            <StatBlock label="平均时长" value={`${averageTime} min`} />
            <StatBlock label="待买食材" value={String(groceryItems.length)} />
          </div>
        </section>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Balance</p>
              <h3 className="card-title">饮食平衡</h3>
            </div>
            <BarChart3 size={22} />
          </div>
          <div className="mt-6 grid gap-3">
            <BalanceRow label="蔬菜相关" value={vegetableRecipes} total={Math.max(allRecipes.length, 1)} />
            <BalanceRow label="蛋白质相关" value={proteinRecipes} total={Math.max(allRecipes.length, 1)} />
            <BalanceRow
              label="省时菜"
              value={allRecipes.filter((recipe) => recipe.timeMinutes <= 20).length}
              total={Math.max(allRecipes.length, 1)}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">本月估算</p>
              <h3 className="card-title">营养粗览</h3>
            </div>
            <NutritionRings summary={monthSummary} size="sm" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NutritionTile label="热量" value={`${Math.round(nutrition.caloriesKcal)} kcal`} />
            <NutritionTile label="蛋白质" value={`${Math.round(nutrition.proteinG)} g`} />
            <NutritionTile label="脂肪" value={`${Math.round(nutrition.fatG)} g`} />
            <NutritionTile label="碳水" value={`${Math.round(nutrition.carbsG)} g`} />
          </div>
          <p className="mt-4 text-xs font-bold leading-5 text-ink/42">
            这是按菜谱估算的家庭参考值，不作为医学或健康诊断。
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Category mix</p>
              <h3 className="card-title">菜品分类分布</h3>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="mt-6 grid gap-4">
            {topCategories.length > 0 ? (
              topCategories.map(([category, count]) => (
                <div key={category}>
                  <div className="mb-2 flex items-center justify-between text-sm font-black">
                    <span>{category}</span>
                    <span className="text-ink/45">{count} 次</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-acid"
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold text-ink/50">
                暂无统计数据。先回首页安排晚饭，或在一周计划里安排菜品。
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">接着安排</p>
              <h3 className="card-title">继续优化菜单</h3>
            </div>
            <ListChecks size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => onViewChange("planner")}
              className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
            >
              <CalendarDays size={20} />
              <p className="mt-3 font-black">调整计划</p>
              <p className="mt-1 text-xs font-bold text-ink/50">补齐一周餐次</p>
            </button>
            <button
              type="button"
              onClick={() => onViewChange("grocery")}
              className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
            >
              <ShoppingBasket size={20} />
              <p className="mt-3 font-black">查看食材</p>
              <p className="mt-1 text-xs font-bold text-ink/50">确认采购清单</p>
            </button>
            <button
              type="button"
              onClick={() => onViewChange("library")}
              className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
            >
              <ChefHat size={20} />
              <p className="mt-3 font-black">添加菜品</p>
              <p className="mt-1 text-xs font-bold text-ink/50">丰富本周口味</p>
            </button>
          </div>
        </Card>
      </div>
    </section>
  );
}

function NutritionTile({ label, value }) {
  return (
    <div className="rounded-[18px] bg-canvas p-4">
      <p className="text-xs font-black text-ink/38">{label}</p>
      <p className="mt-2 text-lg font-black tracking-[-0.03em]">{value}</p>
    </div>
  );
}

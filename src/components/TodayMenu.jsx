import { useMemo, useState } from "react";
import { Minus, Plus, Search, Share2, ShoppingBasket, Trash2, Utensils } from "lucide-react";
import { nutritionFor, photoFor, recipes } from "../lib/recipes";
import { CloudInlineStatus } from "./system/CloudInlineStatus";
import { Card } from "./ui/Card";

export function TodayMenu({
  todayRecipes,
  groceryItems,
  onAddToday,
  onUpdateQuantity,
  onOpenRecipe,
  onViewChange,
  cloudSync,
  onShare,
}) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const totalDishes = todayRecipes.reduce((total, recipe) => total + (recipe.menuQuantity ?? 1), 0);
  const nutrition = todayRecipes.reduce(
    (summary, recipe) => {
      const quantity = recipe.menuQuantity ?? 1;
      const itemNutrition = nutritionFor(recipe);
      return {
        caloriesKcal: summary.caloriesKcal + itemNutrition.caloriesKcal * quantity,
        proteinG: summary.proteinG + itemNutrition.proteinG * quantity,
        fatG: summary.fatG + itemNutrition.fatG * quantity,
        carbsG: summary.carbsG + itemNutrition.carbsG * quantity,
      };
    },
    { caloriesKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );

  if (todayRecipes.length === 0) {
    return (
      <section className="grid gap-5">
        <div className="rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Today menu</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            今晚菜单还是空的。
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
            先选一道菜，食间会顺手把要买什么和怎么做整理好。
          </p>
        </div>
        <QuickAddRecipes
          todayRecipes={todayRecipes}
          onAddToday={onAddToday}
          onOpenRecipe={onOpenRecipe}
        />
        <CloudInlineStatus
          {...cloudSync}
          localLabel="本机今晚菜单"
          pendingLabel="今晚菜单待保存"
          enabledLabel="已保存今晚菜单"
          migrateLabel={cloudSync?.enabled ? "重新保存本机菜单" : "保存今晚菜单"}
        />
      </section>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-5">
        <div className="rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Today menu</p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
                今晚准备做 {todayRecipes.length} 道菜。
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
                调整份数后，买菜清单会跟着变。做饭时点菜卡，就能看步骤。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowAddPanel((current) => !current)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Plus size={18} />
                添加菜品
              </button>
              <button
                type="button"
                onClick={() => onViewChange("grocery")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                <ShoppingBasket size={18} />
                看看还要买什么
              </button>
              <button
                type="button"
                onClick={onShare}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/10 px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                <Share2 size={18} />
                分享菜单
              </button>
            </div>
          </div>
        </div>

        {showAddPanel && (
          <QuickAddRecipes
            todayRecipes={todayRecipes}
            onAddToday={onAddToday}
            onOpenRecipe={onOpenRecipe}
          />
        )}

        <CloudInlineStatus
          {...cloudSync}
          localLabel="本机今晚菜单"
          pendingLabel="今晚菜单待保存"
          enabledLabel="已保存今晚菜单"
          migrateLabel={cloudSync?.enabled ? "重新保存本机菜单" : "保存今晚菜单"}
        />

        <div className="grid gap-4">
          {todayRecipes.map((recipe) => (
            <article
              key={recipe.id}
              className="grid gap-4 rounded-[26px] border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-ink/20 md:grid-cols-[170px_1fr]"
            >
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                className="overflow-hidden rounded-[22px] bg-canvas"
                aria-label={`查看 ${recipe.name} 菜谱`}
              >
                <img
                  src={photoFor(recipe, { variant: "thumb" })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] h-full w-full object-cover"
                />
              </button>

              <div className="grid gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
                      {recipe.categories[0]} · {recipe.timeMinutes} min
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">{recipe.name}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/56">{recipe.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas p-1">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(recipe.id, -1)}
                      className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink transition hover:bg-ink hover:text-white"
                      aria-label={`减少 ${recipe.name}`}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="min-w-9 text-center text-sm font-black">{recipe.menuQuantity ?? 1}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(recipe.id, 1)}
                      className="grid h-10 w-10 place-items-center rounded-full bg-acid text-ink transition hover:scale-105"
                      aria-label={`增加 ${recipe.name}`}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
                  >
                    <Utensils size={16} className="text-acid" />
                    查看做法
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(recipe.id, -(recipe.menuQuantity ?? 1))}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-canvas px-4 text-sm font-black text-ink/58 transition hover:border-ink/20 hover:text-ink"
                  >
                    <Trash2 size={16} />
                    移除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="grid content-start gap-5">
        <Card>
          <p className="eyebrow">Menu summary</p>
          <h3 className="card-title">今日概览</h3>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SummaryTile label="菜品" value={`${todayRecipes.length} 道`} />
            <SummaryTile label="份数" value={`${totalDishes} 份`} />
            <SummaryTile label="待买" value={`${groceryItems.length} 项`} />
            <SummaryTile label="热量" value={`${Math.round(nutrition.caloriesKcal)} kcal`} />
          </div>
        </Card>

        <Card>
          <p className="eyebrow">Nutrition</p>
          <h3 className="card-title">营养粗览</h3>
          <div className="mt-5 grid gap-3">
            <NutritionRow label="蛋白质" value={nutrition.proteinG} unit="g" />
            <NutritionRow label="脂肪" value={nutrition.fatG} unit="g" />
            <NutritionRow label="碳水" value={nutrition.carbsG} unit="g" />
          </div>
          <p className="mt-4 text-xs font-bold leading-5 text-ink/45">
            按菜谱每人份估算，仅用于家庭菜单搭配参考。
          </p>
        </Card>
      </aside>
    </section>
  );
}

function QuickAddRecipes({ todayRecipes, onAddToday, onOpenRecipe }) {
  const [keyword, setKeyword] = useState("");
  const todayRecipeIds = useMemo(() => new Set(todayRecipes.map((recipe) => recipe.id)), [todayRecipes]);
  const visibleRecipes = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return recipes
      .filter((recipe) => {
        if (!normalizedKeyword) return true;
        return [
          recipe.name,
          recipe.description,
          ...recipe.categories,
          ...recipe.tags,
          ...recipe.ingredients.map((item) => item.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      })
      .slice(0, 12);
  }, [keyword]);

  return (
    <section className="rounded-[28px] border border-line bg-white p-4 shadow-card md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Add dishes</p>
          <h3 className="mt-1 text-2xl font-black">添加到今晚菜单</h3>
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-canvas px-4 md:w-72">
          <Search size={17} className="text-ink/38" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-ink/35"
            placeholder="搜索菜名、食材"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleRecipes.map((recipe) => {
          const inTodayMenu = todayRecipeIds.has(recipe.id);
          return (
            <article
              key={recipe.id}
              className="grid grid-cols-[76px_1fr] gap-3 rounded-[20px] border border-line bg-canvas p-2"
            >
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                className="overflow-hidden rounded-[16px] bg-white"
                aria-label={`查看 ${recipe.name} 菜谱`}
              >
                <img
                  src={photoFor(recipe, { variant: "thumb" })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-20 w-full object-cover"
                />
              </button>
              <div className="min-w-0 py-1 pr-1">
                <p className="truncate text-base font-black">{recipe.name}</p>
                <p className="mt-1 truncate text-xs font-bold text-ink/45">
                  {recipe.categories[0]} · {recipe.timeMinutes} min
                </p>
                <button
                  type="button"
                  onClick={() => onAddToday(recipe.id)}
                  className={`mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-full px-3 text-xs font-black transition ${
                    inTodayMenu
                      ? "border border-line bg-white text-ink hover:border-ink/20"
                      : "bg-ink text-white hover:-translate-y-0.5"
                  }`}
                >
                  <Plus size={14} className={inTodayMenu ? "text-ink/45" : "text-acid"} />
                  {inTodayMenu ? "再加一份" : "加入今晚"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-[20px] border border-line bg-canvas p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/35">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function NutritionRow({ label, value, unit }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-canvas px-4 py-3">
      <span className="text-sm font-black text-ink/58">{label}</span>
      <span className="text-sm font-black">
        {Math.round(value)}
        {unit}
      </span>
    </div>
  );
}

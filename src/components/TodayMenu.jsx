import { ImageIcon, Minus, Plus, Share2, ShoppingBasket, Trash2, Utensils } from "lucide-react";
import { nutritionFor } from "../lib/recipes";
import { DinnerLogPanel } from "./Dashboard";
import { CloudInlineStatus } from "./system/CloudInlineStatus";
import { Card } from "./ui/Card";
import { DishImage } from "./ui/DishImage";
import { HumiPeek } from "./ui/HumiBrandIllustration";

export function TodayMenu({
  todayRecipes,
  groceryItems,
  onUpdateQuantity,
  onOpenRecipe,
  onViewChange,
  onOpenRecipeLibrary,
  cloudSync,
  onShare,
  onCreatePoster,
  shareMode = "poster",
  mealLog,
  mealLogs,
  onSetDinnerSource,
  onSetDinnerConfirmation,
  onToggleConsumedRecipe,
  canManageHousehold = true,
}) {
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
  const hasStaple = todayRecipes.some((recipe) => recipe.categories.includes("主食") || recipe.tags?.includes("主食"));

  if (todayRecipes.length === 0) {
    return (
      <section className="grid gap-5">
        <Card>
          <p className="eyebrow">今晚菜单</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">今晚可以从这里开始</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            让 Humi 先给一组，或者直接去全部菜品挑一道。
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {canManageHousehold && <button
              type="button"
              onClick={() => onViewChange("dashboard")}
              className="min-h-12 rounded-full bg-ink px-5 text-sm font-black text-white"
            >
              回到今晚推荐
            </button>}
            <button
              type="button"
              onClick={() => onOpenRecipeLibrary?.()}
              className="min-h-12 rounded-full border border-ink bg-white px-5 text-sm font-black text-ink"
            >
              自己挑菜
            </button>
          </div>
        </Card>
        <DinnerLogPanel
          mealLog={mealLog}
          mealLogs={mealLogs}
          onSetDinnerSource={onSetDinnerSource}
          onSetDinnerConfirmation={onSetDinnerConfirmation}
          onToggleConsumedRecipe={onToggleConsumedRecipe}
          todayRecipes={todayRecipes}
          showConfirmation={false}
          dinnerReady={false}
          onViewChange={onViewChange}
          canManageHousehold={canManageHousehold}
        />
        {canManageHousehold && <CloudInlineStatus
          {...cloudSync}
          localLabel="本机今晚菜单"
          pendingLabel="今晚菜单待保存"
          enabledLabel="已保存今晚菜单"
          migrateLabel={cloudSync?.enabled ? "重新保存本机菜单" : "保存今晚菜单"}
        />}
      </section>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-5">
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-white p-6 pr-24 text-ink shadow-card md:p-8 md:pr-36">
          <HumiPeek
            variant="dinner-ready"
            size="lg"
            className="absolute -bottom-6 -right-4 opacity-95"
            contextKey="today-ready-peek"
          />
          <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">今晚菜单</p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-3xl text-3xl font-black tracking-[-0.04em] md:text-5xl">
                {todayRecipes.map((recipe) => recipe.name).join(" + ")}
              </h2>
              <p className="mt-3 max-w-xl text-sm font-bold leading-7 text-ink/52">
                {todayRecipes.length} 道 · {totalDishes} 份 · 待买 {groceryItems.length} 项
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageHousehold && <button
                type="button"
                onClick={() => onViewChange("grocery")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                <ShoppingBasket size={18} />
                查看采购清单
              </button>}
              <button
                type="button"
                onClick={() => onOpenRecipe(todayRecipes[0]?.id)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Utensils size={18} />
                开始做饭
              </button>
              <button
                type="button"
                onClick={onShare}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                {shareMode === "mini" ? <Share2 size={18} /> : <ImageIcon size={18} />}
                {shareMode === "mini" ? "分享菜单给家人" : "生成菜单海报"}
              </button>
              {shareMode === "mini" && (
                <button
                  type="button"
                  onClick={onCreatePoster}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
                >
                  <ImageIcon size={18} />
                  生成菜单海报
                </button>
              )}
            </div>
          </div>
        </div>

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
                <DishImage
                  recipe={recipe}
                  variant="thumb"
                  alt=""
                  loading="lazy"
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
                  {canManageHousehold && <div className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas p-1">
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
                      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-ink"
                      aria-label={`增加 ${recipe.name}`}
                    >
                      <Plus size={17} />
                    </button>
                  </div>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManageHousehold && <button
                    type="button"
                    onClick={() => onOpenRecipe(recipe.id)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
                  >
                    <Utensils size={16} />
                    查看做法
                  </button>}
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

        <OpenRecipeLibraryPanel
          hasStaple={hasStaple}
          onOpenRecipeLibrary={onOpenRecipeLibrary}
        />

        {canManageHousehold && <CloudInlineStatus
          {...cloudSync}
          localLabel="本机今晚菜单"
          pendingLabel="今晚菜单待保存"
          enabledLabel="已保存今晚菜单"
          migrateLabel={cloudSync?.enabled ? "重新保存本机菜单" : "保存今晚菜单"}
        />}

        <DinnerLogPanel
          mealLog={mealLog}
          mealLogs={mealLogs}
          onSetDinnerSource={onSetDinnerSource}
          onSetDinnerConfirmation={onSetDinnerConfirmation}
          onToggleConsumedRecipe={onToggleConsumedRecipe}
          todayRecipes={todayRecipes}
          showConfirmation
          dinnerReady
          onViewChange={onViewChange}
          canManageHousehold={canManageHousehold}
        />

      </div>

      <aside className="hidden content-start gap-5 xl:grid">
        <Card>
          <p className="eyebrow">Menu summary</p>
          <h3 className="card-title">今日概览</h3>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <SummaryTile label="菜品" value={`${todayRecipes.length} 道`} />
            <SummaryTile label="份数" value={`${totalDishes} 份`} />
            <SummaryTile label="待买" value={`${groceryItems.length} 项`} />
            <SummaryTile label="热量" value={`${Math.round(nutrition.caloriesKcal)} kcal`} />
            <SummaryTile label="主食" value={hasStaple ? "已包含" : "还没有"} />
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

function OpenRecipeLibraryPanel({ hasStaple, onOpenRecipeLibrary }) {
  return (
    <section className="rounded-[28px] border border-line bg-white p-4 shadow-card md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Dish library</p>
          <h3 className="mt-1 text-2xl font-black">去全部菜品挑</h3>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-ink/52">
            菜品库会完整展示所有菜，已安排的菜会置顶，方便边看边调整。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenRecipeLibrary?.()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
          >
            <Plus size={18} />
            全部菜品库
          </button>
          {!hasStaple && (
            <button
              type="button"
              onClick={() => onOpenRecipeLibrary?.("主食")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
            >
              <Plus size={18} />
              挑主食
            </button>
          )}
        </div>
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

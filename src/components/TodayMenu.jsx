import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, Share2, ShoppingBasket, Trash2, Utensils } from "lucide-react";
import { nutritionFor, recipes } from "../lib/recipes";
import { DinnerLogPanel } from "./Dashboard";
import { CloudInlineStatus } from "./system/CloudInlineStatus";
import { Card } from "./ui/Card";
import { DishImage } from "./ui/DishImage";
import { HumiBrandIllustration, HumiPeek } from "./ui/HumiBrandIllustration";

export function TodayMenu({
  todayRecipes,
  groceryItems,
  onAddToday,
  onUpdateQuantity,
  onOpenRecipe,
  onViewChange,
  cloudSync,
  onShare,
  mealLog,
  mealLogs,
  onSetDinnerSource,
  onSetDinnerConfirmation,
  onQuickDinnerConfirm,
  onToggleConsumedRecipe,
}) {
  const [showAddPanel, setShowAddPanel] = useState(true);
  const [quickAddPreset, setQuickAddPreset] = useState("all");
  const addPanelRef = useRef(null);
  const logPanelRef = useRef(null);
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

  function showAddPreset(preset) {
    setShowAddPanel(true);
    setQuickAddPreset(preset ?? "all");
    window.setTimeout(() => {
      addPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  function scrollToLog() {
    logPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (todayRecipes.length === 0) {
    return (
      <section className="grid gap-5">
        <div className="rounded-[32px] border border-line bg-white p-6 text-ink shadow-card md:p-8">
          <div className="grid gap-5 md:grid-cols-[1fr_150px] md:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">Today menu</p>
              <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
                今晚还没定。
              </h2>
              <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-ink/58">
                回到【今晚】点“今晚就做”，Humi 会先给你凑好一组。
              </p>
            </div>
            <div className="rounded-[26px] border border-line bg-canvas p-4 text-center">
              <HumiBrandIllustration
                variant="dinner-decision"
                size="lg"
                className="mx-auto"
                title="空菜单生活场景"
                contextKey="today-empty-menu"
              />
              <p className="mt-2 text-xs font-black text-ink/56">晚饭先空着</p>
            </div>
          </div>
        </div>
        <QuickAddRecipes
          todayRecipes={todayRecipes}
          onAddToday={onAddToday}
          onOpenRecipe={onOpenRecipe}
        />
        <DinnerLogPanel
          mealLog={mealLog}
          mealLogs={mealLogs}
          onSetDinnerSource={onSetDinnerSource}
          onSetDinnerConfirmation={onSetDinnerConfirmation}
          onQuickDinnerConfirm={onQuickDinnerConfirm}
          onToggleConsumedRecipe={onToggleConsumedRecipe}
          todayRecipes={todayRecipes}
          showConfirmation={false}
          dinnerReady={false}
          onViewChange={onViewChange}
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
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-white p-6 pr-24 text-ink shadow-card md:p-8 md:pr-36">
          <HumiPeek
            variant="dinner-ready"
            size="lg"
            className="absolute -bottom-6 -right-4 opacity-95"
            contextKey="today-ready-peek"
          />
          <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">Today menu</p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
                今晚安排完成。
              </h2>
              <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-ink/58">
                {todayRecipes.map((recipe) => recipe.name).join("、")}，预计已经同步到连排计划。还可以继续加菜或加主食。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onViewChange("grocery")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                <ShoppingBasket size={18} />
                查看采购清单
              </button>
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
                onClick={() => showAddPreset("all")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Plus size={18} />
                加一道菜
              </button>
              <button
                type="button"
                onClick={() => showAddPreset("staple")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Plus size={18} />
                加主食
              </button>
              <button
                type="button"
                onClick={scrollToLog}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Utensils size={18} />
                记录这顿
              </button>
              <button
                type="button"
                onClick={onShare}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Share2 size={18} />
                生成海报
              </button>
            </div>
          </div>
        </div>

        {showAddPanel && (
          <QuickAddRecipes
            ref={addPanelRef}
            forcedPreset={quickAddPreset}
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

        <div ref={logPanelRef}>
          <DinnerLogPanel
            mealLog={mealLog}
            mealLogs={mealLogs}
            onSetDinnerSource={onSetDinnerSource}
            onSetDinnerConfirmation={onSetDinnerConfirmation}
            onQuickDinnerConfirm={onQuickDinnerConfirm}
            onToggleConsumedRecipe={onToggleConsumedRecipe}
            todayRecipes={todayRecipes}
            showConfirmation
            dinnerReady
            onViewChange={onViewChange}
          />
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
                      className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white transition hover:scale-105"
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
                    <Utensils size={16} className="text-white" />
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

const QuickAddRecipes = forwardRef(function QuickAddRecipes({ todayRecipes, onAddToday, onOpenRecipe, forcedPreset }, ref) {
  const [keyword, setKeyword] = useState("");
  const [activePreset, setActivePreset] = useState("all");
  const todayRecipeIds = useMemo(() => new Set(todayRecipes.map((recipe) => recipe.id)), [todayRecipes]);
  const hasStaple = useMemo(
    () => todayRecipes.some((recipe) => recipe.categories.includes("主食") || recipe.tags?.includes("主食")),
    [todayRecipes],
  );
  const stapleRecipes = useMemo(
    () => recipes
      .filter((recipe) => recipe.categories.includes("主食") || recipe.tags?.includes("主食"))
      .slice(0, 4),
    [],
  );
  const visibleRecipes = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return recipes
      .filter((recipe) => {
        if (activePreset === "staple" && !recipe.categories.includes("主食") && !recipe.tags?.includes("主食")) return false;
        if (activePreset === "quick" && recipe.timeMinutes > 25) return false;
        if (activePreset === "protein" && !recipe.categories.some((category) => ["肉类", "鱼虾", "蛋类"].includes(category))) return false;
        if (!normalizedKeyword) return true;
        return [
          recipe.name,
          recipe.description,
          ...recipe.categories,
          ...(recipe.tags ?? []),
          ...recipe.ingredients.map((item) => item.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);
      })
      .slice(0, 30);
  }, [activePreset, keyword]);

  useEffect(() => {
    if (forcedPreset) setActivePreset(forcedPreset);
  }, [forcedPreset]);

  return (
    <section
      ref={ref}
      className="scroll-mt-24 rounded-[28px] border border-line bg-white p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] shadow-card md:p-5 md:pb-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="eyebrow">Pick dishes</p>
          <h3 className="mt-1 text-2xl font-black">逛逛今晚还能加什么</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            家常菜、快手菜、汤菜都在这里，看到想吃的就顺手加进今晚。
          </p>
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

      {!hasStaple && stapleRecipes.length > 0 && (
        <div className="mt-4 rounded-[22px] border border-line bg-canvas p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">Staple</p>
              <p className="mt-1 text-sm font-black">补一个主食，营养统计会一起计入</p>
            </div>
            <button
              type="button"
              onClick={() => setActivePreset("staple")}
              className="shrink-0 rounded-full bg-ink px-3 py-2 text-xs font-black text-white"
            >
              看主食
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {stapleRecipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onAddToday(recipe.id)}
                className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] bg-white px-3 text-left text-sm font-black transition hover:-translate-y-0.5"
              >
                <span className="truncate">{recipe.name}</span>
                <span className="rounded-full bg-ink px-2.5 py-1 text-xs text-white">加入</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          ["all", "全部"],
          ["staple", "主食"],
          ["quick", "25分钟内"],
          ["protein", "蛋白类"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActivePreset(id)}
            className={`rounded-full border px-3 py-2 text-xs font-black transition ${
              activePreset === id
                ? "border-ink bg-ink text-white"
                : "border-line bg-canvas text-ink/54 hover:border-ink/20 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:gap-5">
        {visibleRecipes.map((recipe) => {
          const inTodayMenu = todayRecipeIds.has(recipe.id);
          return (
            <article
              key={recipe.id}
              className="group cursor-pointer overflow-hidden rounded-[24px] border border-line bg-white shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-lift"
              onClick={() => onOpenRecipe(recipe.id)}
            >
              <button
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                className="block w-full text-left"
                aria-label={`查看 ${recipe.name} 菜谱`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-canvas">
                  <DishImage
                    recipe={recipe}
                    variant="thumb"
                    alt={recipe.name}
                    loading="lazy"
                    sizes="(min-width: 1024px) 33vw, 50vw"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/76 via-ink/20 to-transparent" />
                  <div className="absolute left-3 top-3 rounded-full bg-white/92 px-3 py-1 text-[11px] font-black text-ink shadow-card backdrop-blur">
                    {recipe.categories[0]}
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h4 className="line-clamp-2 text-lg font-black leading-tight tracking-[-0.03em]">
                      {recipe.name}
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black text-white/84">
                      <span className="rounded-full bg-white/18 px-2 py-1 backdrop-blur">
                        {recipe.timeMinutes} min
                      </span>
                      <span className="rounded-full bg-white/18 px-2 py-1 backdrop-blur">
                        {recipe.difficulty}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
              <div className="grid gap-3 p-3">
                <p className="line-clamp-2 min-h-10 text-xs font-bold leading-5 text-ink/54">
                  {recipe.description}
                </p>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAddToday(recipe.id);
                  }}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-full px-3 text-sm font-black transition ${
                    inTodayMenu
                      ? "border border-line bg-white text-ink hover:border-ink/20"
                      : "bg-ink text-white hover:-translate-y-0.5"
                  }`}
                >
                  <Plus size={14} className={inTodayMenu ? "text-ink/45" : "text-white"} />
                  {inTodayMenu ? "再加一份" : "补进今晚"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
});

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

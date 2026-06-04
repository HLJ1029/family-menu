import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Minus, Plus, Sparkles, X } from "lucide-react";
import { formatRawAmount } from "../lib/grocery";
import { nutritionFor, photoFor } from "../lib/recipes";

export function RecipeDetailDrawer({
  recipe,
  cookingStep,
  setCookingStep,
  onClose,
  onAddToday,
  todayEntry,
  onUpdateTodayQuantity,
}) {
  const [targetServings, setTargetServings] = useState(recipe?.servings ?? 2);

  useEffect(() => {
    if (recipe) {
      setTargetServings(recipe.servings);
    }
  }, [recipe]);

  const servingMultiplier = recipe ? targetServings / recipe.servings : 1;
  const scaledIngredients = useMemo(
    () => scaleRecipeItems(recipe?.ingredients ?? [], servingMultiplier),
    [recipe, servingMultiplier],
  );
  const scaledSeasonings = useMemo(
    () => scaleRecipeItems(recipe?.seasonings ?? [], servingMultiplier),
    [recipe, servingMultiplier],
  );

  if (!recipe) return null;

  const isFirstStep = cookingStep === 0;
  const isLastStep = cookingStep === recipe.steps.length - 1;
  const currentStep = recipe.steps[cookingStep];
  const nutrition = nutritionFor(recipe);

  function previousStep() {
    setCookingStep((step) => Math.max(0, step - 1));
  }

  function nextStep() {
    setCookingStep((step) => Math.min(recipe.steps.length - 1, step + 1));
  }

  function updateServings(delta) {
    setTargetServings((current) => Math.min(12, Math.max(1, current + delta)));
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-ink/38 backdrop-blur-sm"
        aria-label="关闭菜谱详情"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-canvas shadow-lift md:w-[560px] md:rounded-l-[32px]">
        <div className="relative h-56 shrink-0 overflow-hidden md:h-64">
          <img
            src={photoFor(recipe)}
            alt={recipe.name}
            decoding="async"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/72 via-ink/10 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur transition hover:scale-105"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
          <div className="absolute bottom-5 left-5 right-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-acid">Recipe detail</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] md:text-4xl">{recipe.name}</h2>
            <p className="mt-2 hidden text-sm leading-6 text-white/72 sm:block">{recipe.description}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-5 md:px-6">
          <div className="grid grid-cols-3 gap-2">
            <InfoPill label="时间" value={`${recipe.timeMinutes} min`} />
            <InfoPill label="难度" value={recipe.difficulty} />
            <InfoPill label="原始份量" value={`${recipe.servings} 人份`} />
          </div>

          <section className="mt-5 rounded-[26px] border border-line bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="eyebrow">People</p>
                <h3 className="card-title">家里几个人吃</h3>
                <p className="mt-2 text-sm font-bold text-ink/50">
                  调整人数后，食材用量会跟着变；调料还是按口味来。
                </p>
              </div>
              <div className="grid grid-cols-[44px_88px_44px] items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateServings(-1)}
                  disabled={targetServings <= 1}
                  className="grid h-11 place-items-center rounded-full border border-line bg-canvas transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="减少人数"
                >
                  <Minus size={17} />
                </button>
                <div className="rounded-full bg-ink px-4 py-3 text-center text-sm font-black text-white">
                  {targetServings} 人份
                </div>
                <button
                  type="button"
                  onClick={() => updateServings(1)}
                  disabled={targetServings >= 12}
                  className="grid h-11 place-items-center rounded-full bg-acid transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="增加人数"
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-4 md:grid-cols-2">
            <IngredientPanel title="食材" items={scaledIngredients} />
            <IngredientPanel title="调料" items={scaledSeasonings} />
          </section>

          <section className="mt-5 rounded-[26px] border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Nutrition</p>
                <h3 className="card-title">每人份营养</h3>
              </div>
              <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black text-ink/52">
                estimated
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NutritionStat label="热量" value={`${nutrition.caloriesKcal} kcal`} />
              <NutritionStat label="蛋白质" value={`${nutrition.proteinG} g`} />
              <NutritionStat label="脂肪" value={`${nutrition.fatG} g`} />
              <NutritionStat label="碳水" value={`${nutrition.carbsG} g`} />
              <NutritionStat label="膳食纤维" value={`${nutrition.fiberG} g`} />
              <NutritionStat label="钠" value={`${nutrition.sodiumMg} mg`} />
            </div>
          </section>

          <section className="mt-5 rounded-[26px] border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Cooking mode</p>
                <h3 className="card-title">跟做步骤</h3>
              </div>
              <span className="rounded-full bg-acid px-3 py-1 text-xs font-black">
                {cookingStep + 1}/{recipe.steps.length}
              </span>
            </div>

            <div className="rounded-[24px] bg-ink p-5 text-white">
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/14">
                <div
                  className="h-full rounded-full bg-acid transition-all duration-300"
                  style={{ width: `${((cookingStep + 1) / recipe.steps.length) * 100}%` }}
                />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-acid">
                Step {String(cookingStep + 1).padStart(2, "0")}
              </p>
              <p className="mt-3 text-2xl font-black leading-snug tracking-[-0.03em]">
                {currentStep}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isFirstStep}
                  onClick={previousStep}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 text-sm font-black text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowLeft size={17} />
                  上一步
                </button>
                <button
                  type="button"
                  disabled={isLastStep}
                  onClick={nextStep}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid text-sm font-black text-ink transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  下一步
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>

            <ol className="mt-4 grid gap-2">
              {recipe.steps.map((step, index) => (
                <li key={step}>
                  <button
                    type="button"
                    onClick={() => setCookingStep(index)}
                    className={`grid w-full grid-cols-[34px_1fr] gap-3 rounded-[18px] border p-3 text-left transition ${
                      index === cookingStep
                        ? "border-ink bg-canvas"
                        : "border-line bg-white hover:border-ink/18"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                        index === cookingStep ? "bg-ink text-acid" : "bg-canvas text-ink/45"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold leading-6 text-ink/72">{step}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {recipe.tips && (
            <section className="mt-5 rounded-[24px] border border-line bg-white p-5 shadow-card">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-acid">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-black">Chef note</p>
                  <p className="mt-1 text-sm leading-6 text-ink/56">{recipe.tips}</p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-line bg-white/92 p-4 backdrop-blur-xl">
          {todayEntry ? (
            <div className="grid grid-cols-[52px_1fr_52px] items-center gap-3">
              <button
                type="button"
                onClick={() => onUpdateTodayQuantity(recipe.id, -1)}
                className="grid h-12 place-items-center rounded-full border border-line bg-canvas"
                aria-label="减少份数"
              >
                <Minus size={18} />
              </button>
              <div className="rounded-full bg-ink px-5 py-4 text-center text-sm font-black text-white shadow-card">
                今晚菜单 · {todayEntry.quantity} 份
              </div>
              <button
                type="button"
                onClick={() => onUpdateTodayQuantity(recipe.id, 1)}
                className="grid h-12 place-items-center rounded-full bg-acid"
                aria-label="增加份数"
              >
                <Plus size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAddToday(recipe.id)}
              className="flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-black text-white shadow-card transition hover:-translate-y-0.5"
            >
              <Plus size={18} className="text-acid" />
              加入今晚菜单
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function scaleRecipeItems(items, multiplier) {
  return items.map((item) => {
    if (typeof item.amount !== "number") return item;
    const amount = Math.round(item.amount * multiplier * 10) / 10;
    return { ...item, amount };
  });
}

function InfoPill({ label, value }) {
  return (
    <div className="rounded-[20px] border border-line bg-white p-4 shadow-card">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink/35">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function IngredientPanel({ title, items }) {
  return (
    <div className="rounded-[24px] border border-line bg-white p-5 shadow-card">
      <h3 className="text-lg font-black tracking-[-0.03em]">{title}</h3>
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={`${title}-${item.name}-${item.unit}`} className="flex items-center justify-between gap-3">
            <span className="font-bold text-ink/72">
              {item.name}
              {item.required === false && <em className="ml-2 text-xs not-italic text-ink/35">可选</em>}
              {item.pantryItem && <em className="ml-2 text-xs not-italic text-ink/35">常备</em>}
            </span>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black">{formatRawAmount(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NutritionStat({ label, value }) {
  return (
    <div className="rounded-[18px] bg-canvas p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/35">{label}</p>
      <p className="mt-1 text-lg font-black tracking-[-0.03em]">{value}</p>
    </div>
  );
}

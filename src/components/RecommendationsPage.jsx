import { CheckCircle2, RefreshCw, ShoppingBasket, Utensils } from "lucide-react";
import { DishImage } from "./ui/DishImage";
import { HumiBrandCallout, HumiBrandIllustration, HumiPeek } from "./ui/HumiBrandIllustration";

const rejectReasons = [
  { id: "too_much_work", label: "太麻烦" },
  { id: "family_dislikes", label: "家里没人吃" },
  { id: "hard_to_buy", label: "买不到食材" },
  { id: "wrong_taste", label: "太清淡/太重口" },
  { id: "not_dinner", label: "不像晚饭" },
];

export function RecommendationsPage({
  recommendation,
  aiRecommendationLoading,
  onRefresh,
  onAccept,
  onReject,
  onOpenRecipe,
  onViewChange,
}) {
  const items = getRecommendationItems(recommendation);
  const totalMinutes = items.reduce((total, item) => total + item.recipe.timeMinutes, 0);
  const hasStaple = items.some((item) => item.recipe.categories.includes("主食") || item.recipe.tags?.includes("主食"));

  return (
    <section className="grid min-w-0 grid-cols-1 gap-5">
      <section className="overflow-hidden rounded-[32px] border border-line bg-white text-ink shadow-card">
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_180px] md:items-end md:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/40">Humi 推荐</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-6xl">
              今晚先看这组。
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-ink/58">
              适合 {recommendation.familySize ?? 2} 人 · {items.length} 道 · 预计 {totalMinutes || 25} 分钟 · {hasStaple ? "已有主食" : "建议补主食"}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={onAccept}
                className="col-span-2 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white sm:col-span-1"
              >
                <Utensils size={19} />
                今晚就做
              </button>
              <button
                type="button"
                onClick={onRefresh}
                disabled={aiRecommendationLoading}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                <RefreshCw size={18} className={aiRecommendationLoading ? "animate-spin" : ""} />
                换一组
              </button>
              <button
                type="button"
                onClick={() => onViewChange("grocery")}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-ink/18 bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <ShoppingBasket size={18} />
                看清单
              </button>
            </div>
          </div>
          <div className="rounded-[28px] border border-line bg-canvas p-4 text-center">
            <HumiBrandIllustration
              variant={aiRecommendationLoading ? "recommendation-loading" : "recommendation"}
              size="xl"
              className="mx-auto"
              title="推荐生活场景"
              contextKey={aiRecommendationLoading ? "recommendation-loading" : "recommendation-hero"}
            />
            <p className="mt-2 text-sm font-black text-ink">
              {aiRecommendationLoading ? "重新核对中" : "先用家里已有"}
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
              推荐先看家里现有、再看今晚时间，真实菜品仍然是主视觉。
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {items.map(({ recipe, quantity }) => (
          <article key={recipe.id} className="overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
            <button type="button" onClick={() => onOpenRecipe(recipe.id)} className="block w-full text-left">
              <div className="relative aspect-[4/3] bg-canvas">
                <DishImage recipe={recipe} variant="hero" alt="" loading="eager" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <h3 className="text-2xl font-black tracking-[-0.04em]">{recipe.name}</h3>
                  <p className="mt-2 text-sm font-bold text-white/76">
                    {recipe.timeMinutes} min · {recipe.categories[0]}{quantity > 1 ? ` · ${quantity} 份` : ""}
                  </p>
                </div>
              </div>
            </button>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
        <p className="eyebrow">为什么推荐</p>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">安排依据</h3>
        <HumiBrandCallout
          variant={hasStaple ? "menu-accepted" : "fridge-priority"}
          title={hasStaple ? "主食已经带上了" : "这组可能还要补主食"}
          text="推荐依据会优先解释家里已有、需要补买和做饭时长。"
          className="mt-4"
          compact
          contextKey={hasStaple ? "recommendation-staple" : "recommendation-missing"}
        />
        <p className="mt-3 text-sm font-bold leading-7 text-ink/56">
          {recommendation.reason}
        </p>
        {recommendation.missingItems?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {recommendation.missingItems.slice(0, 6).map((item) => (
              <span key={item.name} className="rounded-full bg-canvas px-3 py-2 text-xs font-black text-ink/54">
                缺 {item.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="relative overflow-hidden rounded-[28px] border border-line bg-white p-5 pr-24 shadow-card">
        <HumiPeek
          variant="menu-rejected"
          size="md"
          className="absolute -right-4 bottom-2 opacity-90"
          contextKey="recommendation-reject-peek"
        />
        <p className="eyebrow">不合适就告诉 Humi</p>
        <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">这组为什么不想吃？</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {rejectReasons.map((reason) => (
            <button
              key={reason.id}
              type="button"
              onClick={() => onReject(reason)}
              className="rounded-full bg-ink px-4 py-2 text-xs font-black text-white"
            >
              {reason.label}
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function getRecommendationItems(recommendation) {
  if (Array.isArray(recommendation?.items) && recommendation.items.length > 0) {
    return recommendation.items
      .filter((item) => item?.recipe)
      .map((item) => ({ ...item, quantity: item.quantity ?? 1 }));
  }
  return (recommendation?.recipes ?? []).map((recipe) => ({ recipe, quantity: 1 }));
}

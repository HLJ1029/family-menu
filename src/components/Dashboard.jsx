import { CalendarDays, ClipboardList, ShoppingBasket, Sparkles, Utensils } from "lucide-react";
import { Card } from "./ui/Card";
import { DoodleArrow } from "./ui/Doodles";
import { MiniMeal } from "./ui/MiniMeal";

export function Dashboard({
  todayRecipes,
  recommendation,
  aiRecommendationStatus,
  aiRecommendationLoading,
  onViewChange,
  onOpenRecipe,
  onAddRecommended,
  onRequestAiRecommendation,
}) {
  const missingSummary = recommendation.missingItems.length > 0
    ? recommendation.missingItems.map((item) => item.name).join("、")
    : "主食材基本够了";
  const dinnerReady = todayRecipes.length > 0;

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
        <div className="absolute right-8 top-7 hidden md:block">
          <DoodleArrow />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">食间</p>
        <h2 className="mt-4 max-w-2xl text-5xl font-black tracking-[-0.05em] md:text-7xl">
          今晚吃什么？
        </h2>
        <p className="mt-4 max-w-xl text-sm font-bold leading-7 text-white/62">
          不用从头想。食间先给你安排一组能落地的晚饭。
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <button
            type="button"
            onClick={onRequestAiRecommendation}
            disabled={aiRecommendationLoading}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-acid px-6 text-base font-black text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Sparkles size={19} />
            {aiRecommendationLoading ? "正在想" : "帮我安排晚饭"}
          </button>
          {dinnerReady && (
            <button
              type="button"
              onClick={() => onViewChange("today")}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/14 bg-white/10 px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
            >
              看今晚菜单
            </button>
          )}
        </div>
        <p className="mt-4 max-w-xl text-xs font-bold leading-5 text-white/42">{aiRecommendationStatus}</p>
      </section>

      <section>
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">今晚推荐</p>
              <h3 className="card-title">{recommendation.title}</h3>
            </div>
            <span className="inline-flex w-fit rounded-full bg-acid px-3 py-1 text-xs font-black text-ink">
              {recommendation.recipes.reduce((total, recipe) => total + recipe.timeMinutes, 0)} 分钟内
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recommendation.recipes.map((recipe) => (
              <MiniMeal key={recipe.id} recipe={recipe} onClick={() => onOpenRecipe(recipe.id)} />
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <SimpleNote title="为什么这组" text={recommendation.reason} />
            <SimpleNote title="还差这些" text={missingSummary} />
          </div>

          <button
            type="button"
            onClick={onAddRecommended}
            className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white transition hover:-translate-y-0.5"
          >
            <Utensils size={19} className="text-acid" />
            就吃这组
          </button>
        </Card>
      </section>

      <section>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">下一步</p>
              <h3 className="card-title">接下来安排</h3>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <FlowAction
              icon={ClipboardList}
              title="今晚菜单"
              note="看做法和份数"
              onClick={() => onViewChange("today")}
            />
            <FlowAction
              icon={CalendarDays}
              title="这周怎么吃"
              note="自动放进最近空位"
              onClick={() => onViewChange("planner")}
            />
            <FlowAction
              icon={ShoppingBasket}
              title="还要买什么"
              note="买菜前看一眼"
              onClick={() => onViewChange("grocery")}
            />
          </div>
        </Card>
      </section>
    </div>
  );
}

function SimpleNote({ title, text }) {
  return (
    <div className="rounded-[20px] bg-canvas p-4">
      <p className="text-xs font-black text-ink/38">{title}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-ink/62">{text}</p>
    </div>
  );
}

function FlowAction({ icon: Icon, title, note, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
    >
      <Icon size={20} />
      <p className="mt-3 font-black">{title}</p>
      <p className="mt-1 text-xs font-bold text-ink/50">{note}</p>
    </button>
  );
}

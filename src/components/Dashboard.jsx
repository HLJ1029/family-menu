import { BarChart3, CalendarDays, ClipboardList, PackageCheck, ShoppingBasket, Sparkles, Utensils, X } from "lucide-react";
import { AccountAvatar } from "./AppShell";
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
  onOpenRecommendationFeedback,
  feedbackOpen,
  onSubmitRecommendationFeedback,
  onCloseRecommendationFeedback,
  session,
  onOpenUserCenter,
}) {
  const missingSummary = recommendation.missingItems.length > 0
    ? recommendation.missingItems.map((item) => item.name).join("、")
    : "主食材基本够了";
  const dinnerReady = todayRecipes.length > 0;

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
        <div className="absolute right-5 top-5 z-10">
          <AccountAvatar session={session} onClick={onOpenUserCenter} compact />
        </div>
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

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={onAddRecommended}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white transition hover:-translate-y-0.5"
            >
              <Utensils size={19} className="text-acid" />
              就吃这组
            </button>
            <button
              type="button"
              onClick={onOpenRecommendationFeedback}
              disabled={aiRecommendationLoading}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-line bg-canvas px-5 text-sm font-black text-ink/62 transition hover:-translate-y-0.5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles size={17} />
              {aiRecommendationLoading ? "正在换" : "换一组"}
            </button>
          </div>

          {feedbackOpen && (
            <RecommendationFeedbackPanel
              loading={aiRecommendationLoading}
              onSubmit={onSubmitRecommendationFeedback}
              onSkip={() => onSubmitRecommendationFeedback(null)}
              onClose={onCloseRecommendationFeedback}
            />
          )}
        </Card>
      </section>

      <section>
        <div className="grid grid-cols-3 gap-3 rounded-[26px] border border-line bg-white p-3 shadow-card sm:grid-cols-6">
            <QuickAppIcon
              icon={ClipboardList}
              title="今晚"
              onClick={() => onViewChange("today")}
            />
            <QuickAppIcon
              icon={CalendarDays}
              title="本周"
              onClick={() => onViewChange("planner")}
            />
            <QuickAppIcon
              icon={ShoppingBasket}
              title="清单"
              onClick={() => onViewChange("grocery")}
            />
            <QuickAppIcon
              icon={PackageCheck}
              title="库存"
              onClick={() => onViewChange("inventory")}
            />
            <QuickAppIcon
              icon={BarChart3}
              title="营养"
              onClick={() => onViewChange("stats")}
            />
            <QuickAppIcon
              icon={CalendarDays}
              title="月历"
              onClick={() => onViewChange("calendar")}
            />
        </div>
      </section>
    </div>
  );
}

const feedbackReasons = [
  { id: "too_hard", label: "太麻烦" },
  { id: "not_craving", label: "不想吃这个" },
  { id: "missing_ingredients", label: "家里没材料" },
  { id: "lighter", label: "想清淡点" },
  { id: "more_meat", label: "想吃肉" },
  { id: "less_meat", label: "想少吃肉" },
];

function RecommendationFeedbackPanel({ loading, onSubmit, onSkip, onClose }) {
  return (
    <div className="mt-4 rounded-[22px] border border-line bg-canvas p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">这组哪里不合适？</p>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
            选一个原因，食间下次会避开类似情况。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink/45 transition hover:text-ink"
          aria-label="关闭换一组原因"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {feedbackReasons.map((reason) => (
          <button
            key={reason.id}
            type="button"
            onClick={() => onSubmit(reason)}
            disabled={loading}
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-black text-ink/62 transition hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            {reason.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={loading}
        className="mt-3 min-h-11 w-full rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
      >
        先直接换一组
      </button>
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

function QuickAppIcon({ icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-[82px] place-items-center rounded-[20px] bg-canvas px-2 py-3 text-center transition hover:-translate-y-0.5 hover:bg-acid"
    >
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-ink shadow-card">
        <Icon size={19} />
      </span>
      <p className="mt-2 text-xs font-black text-ink/62">{title}</p>
    </button>
  );
}

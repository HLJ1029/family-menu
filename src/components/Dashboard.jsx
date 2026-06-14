import { CalendarDays, CheckCircle2, ClipboardList, Sparkles, Utensils } from "lucide-react";
import { formatProfileSummary, getProfileCompletedCount } from "../lib/profile";
import { photoFor } from "../lib/recipes";
import { AccountAvatar } from "./AppShell";
import { Card } from "./ui/Card";

export function Dashboard({
  todayRecipes,
  weekPlan,
  recommendation,
  aiRecommendationStatus,
  aiRecommendationLoading,
  onViewChange,
  onOpenRecipe,
  onAddRecommended,
  onRequestAiRecommendation,
  session,
  onOpenUserCenter,
  familyProfile,
  onPlanRecommendedWeek,
}) {
  const profileReady = getProfileCompletedCount(familyProfile) >= 4;
  const weekDishCount = Object.values(weekPlan ?? {}).reduce((total, recipeIds) => total + recipeIds.length, 0);
  const dinnerReady = todayRecipes.length > 0;
  const heroRecipe = todayRecipes[0] ?? recommendation.recipes[0];
  const nextAction = getNextAction({
    profileReady,
    weekDishCount,
    dinnerReady,
    onOpenUserCenter,
    onPlanRecommendedWeek,
    onAddRecommended,
    onViewChange,
  });
  const NextActionIcon = nextAction.icon;

  return (
    <div className="grid gap-5">
      <section className="relative min-h-[520px] overflow-hidden rounded-[32px] bg-ink text-white shadow-lift">
        {heroRecipe && (
          <img
            src={photoFor(heroRecipe)}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/54 to-ink/12" />
        <div className="absolute left-5 top-5 z-10">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-acid">HUMI</p>
        </div>
        <div className="absolute right-5 top-5 z-10">
          <AccountAvatar session={session} onClick={onOpenUserCenter} compact />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Today</p>
          <h2 className="mt-3 max-w-2xl text-5xl font-black tracking-[-0.05em] md:text-7xl">
            {dinnerReady ? "今晚已经安排好。" : "先把今天安排好。"}
          </h2>
          <p className="mt-4 max-w-lg text-sm font-bold leading-7 text-white/72">
            {formatProfileSummary(familyProfile)}
          </p>
          <button
            type="button"
            onClick={nextAction.onClick}
            disabled={nextAction.disabled}
            className="mt-7 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-acid px-7 text-base font-black text-ink transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <NextActionIcon size={19} />
            {nextAction.label}
          </button>
          <p className="mt-4 max-w-xl text-xs font-bold leading-5 text-white/54">{nextAction.hint}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          icon={CalendarDays}
          title="本周计划"
          value={weekDishCount > 0 ? `${weekDishCount} 道菜` : "未生成"}
          text={weekDishCount > 0 ? "已经有一周菜单框架，可以继续微调。" : "先生成一份本周计划，再确认清单。"}
          onClick={() => onViewChange("planner")}
        />
        <StatusCard
          icon={Utensils}
          title="今晚菜单"
          value={dinnerReady ? `${todayRecipes.length} 道菜` : "未安排"}
          text={dinnerReady ? todayRecipes.map((recipe) => recipe.name).join("、") : "从计划或推荐里安排今晚。"}
          onClick={() => onViewChange("today")}
        />
        <StatusCard
          icon={ClipboardList}
          title="采购清单"
          value={weekDishCount > 0 || dinnerReady ? "可查看" : "待生成"}
          text="菜单确定后，清单会跟着汇总。"
          onClick={() => onViewChange("grocery")}
        />
      </section>

      {!dinnerReady && recommendation.recipes.length > 0 && (
        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="eyebrow">今晚建议</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.03em]">{recommendation.title}</h3>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-ink/52">
                {recommendation.reason}
              </p>
              <p className="mt-2 text-xs font-bold leading-5 text-ink/38">{aiRecommendationStatus}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onAddRecommended}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
              >
                <CheckCircle2 size={17} className="text-acid" />
                安排今晚
              </button>
              <button
                type="button"
                onClick={() => onRequestAiRecommendation(null)}
                disabled={aiRecommendationLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-canvas px-5 text-sm font-black text-ink/58 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Sparkles size={16} />
                {aiRecommendationLoading ? "正在换" : "换一组"}
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {recommendation.recipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                className="rounded-full border border-line bg-canvas px-4 py-2 text-xs font-black text-ink/58 transition hover:text-ink"
              >
                {recipe.name}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function getNextAction({ profileReady, weekDishCount, dinnerReady, onOpenUserCenter, onPlanRecommendedWeek, onAddRecommended, onViewChange }) {
  if (!profileReady) {
    return {
      label: "完善饮食偏好",
      hint: "先告诉 Humi 你家的饮食目标和忌口。",
      icon: Sparkles,
      onClick: onOpenUserCenter,
    };
  }
  if (weekDishCount === 0) {
    return {
      label: "生成本周计划",
      hint: "先得到一周菜单，再进入清单确认。",
      icon: CalendarDays,
      onClick: onPlanRecommendedWeek,
    };
  }
  if (!dinnerReady) {
    return {
      label: "安排今晚",
      hint: "把当前建议放进今晚菜单，清单会自动更新。",
      icon: Utensils,
      onClick: onAddRecommended,
    };
  }
  return {
    label: "查看今晚菜单",
    hint: "今晚菜单已经有内容，可以看做法或调整份数。",
    icon: CheckCircle2,
    onClick: () => onViewChange("today"),
  };
}

function StatusCard({ icon: Icon, title, value, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[26px] border border-line bg-white p-5 text-left shadow-card transition hover:-translate-y-1 hover:border-ink/20"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-acid">
        <Icon size={20} />
      </span>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-ink/35">{title}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.03em]">{value}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-ink/50">{text}</p>
    </button>
  );
}

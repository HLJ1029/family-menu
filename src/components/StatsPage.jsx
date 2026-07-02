import { BarChart3, CalendarDays, ChefHat, ListChecks, ShoppingBasket, Sparkles, Target } from "lucide-react";
import { buildMealInsights } from "../lib/insights";
import { getNutritionSummary, NutritionRings } from "./CalendarPage";
import { Card } from "./ui/Card";
import { HumiIllustrationPanel, HumiPeek } from "./ui/HumiBrandIllustration";
import { StatBlock } from "./ui/StatsBlocks";

export function StatsPage({
  todayRecipes,
  plannedRecipes,
  groceryItems,
  weekPlan,
  mealCalendar,
  mealPlan,
  mealLogs = {},
  familyProfile,
  nutritionGoals,
  pantryItems = [],
  onViewChange,
}) {
  const insights = buildMealInsights({
    mealLogs,
    mealCalendar,
    pantryItems,
    familyProfile,
    nutritionGoals,
    todayRecipes,
    plannedRecipes,
    weekPlan,
    mealPlan,
  });
  const averageTime =
    insights.analysisRecipes.length > 0
      ? Math.round(insights.analysisRecipes.reduce((total, recipe) => total + recipe.timeMinutes, 0) / insights.analysisRecipes.length)
      : 0;
  const monthSummary = getNutritionSummary(insights.analysisRecipes);
  const maxCategoryCount = Math.max(...insights.categoryMix.map((item) => item.count), 1);

  return (
    <section className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[30px] bg-ink p-6 text-white shadow-lift md:p-8">
          <div className="absolute right-5 top-5 hidden md:block">
            <HumiIllustrationPanel
              variant="family-taste-talk"
              size="md"
              tone="dark"
              contextKey="stats-hero"
            />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-white">Nutrition goals</p>
          <h2 className="mt-4 max-w-xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            {insights.goals.label}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
            按早餐、午餐、晚餐一起做目标管理；已确认的餐次优先纳入营养目标。
          </p>
          {!insights.hasConfirmedMeals && (
            <p className="mt-4 inline-flex rounded-full border border-white/14 bg-white/10 px-4 py-2 text-xs font-black text-white/72">
              样本不足，当前先用今日菜单和最近三餐计划做弱参考
            </p>
          )}
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <StatBlock label="已确认餐次" value={String(insights.confirmedMeals.length)} />
            <StatBlock label="平均时长" value={`${averageTime} min`} />
            <StatBlock label="待买食材" value={String(groceryItems.length)} />
          </div>
        </section>

        <Card className="relative overflow-hidden pr-24">
          <HumiPeek
            variant="profile"
            size="md"
            className="absolute -bottom-4 -right-4 opacity-90"
            contextKey="stats-portrait-peek"
          />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Goal progress</p>
              <h3 className="card-title">目标完成度</h3>
            </div>
            <Target size={22} />
          </div>
          <div className="mt-6 grid gap-3">
            {insights.targetProgress.slice(0, 4).map((item) => (
              <TargetRow key={item.key} item={item} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">每顿参考</p>
              <h3 className="card-title">营养目标看板</h3>
            </div>
            <NutritionRings summary={monthSummary} size="sm" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NutritionTile label="热量" value={`${Math.round(insights.nutritionAverages.caloriesKcal)} kcal`} />
            <NutritionTile label="蛋白质" value={`${Math.round(insights.nutritionAverages.proteinG)} g`} />
            <NutritionTile label="脂肪" value={`${Math.round(insights.nutritionAverages.fatG)} g`} />
            <NutritionTile label="碳水" value={`${Math.round(insights.nutritionAverages.carbsG)} g`} />
          </div>
          <div className="mt-5 grid gap-3">
            {insights.targetProgress.slice(4).map((item) => (
              <TargetRow key={item.key} item={item} compact />
            ))}
          </div>
          <p className="mt-4 text-xs font-bold leading-5 text-ink/42">
            这是按菜谱估算的家庭参考值，不作为医学或健康诊断。
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Diet portrait</p>
              <h3 className="card-title">本月饮食画像</h3>
            </div>
            <ChefHat size={22} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {insights.sourceBreakdown.items.map((item) => (
              <NutritionTile key={item.id} label={item.label} value={`${item.count} 次`} />
            ))}
          </div>
          <div className="mt-5 grid gap-2">
            {insights.narrativeInsights.map((item) => (
              <p key={item} className="rounded-[18px] bg-canvas p-3 text-sm font-bold leading-6 text-ink/58">
                {item}
              </p>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Category mix</p>
              <h3 className="card-title">菜品分类分布</h3>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="mt-6 grid gap-4">
            {insights.categoryMix.length > 0 ? (
              insights.categoryMix.map((item) => (
                <div key={item.category}>
                  <div className="mb-2 flex items-center justify-between text-sm font-black">
                    <span>{item.category}</span>
                    <span className="text-ink/45">{item.count} 次</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${(item.count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold text-ink/50">
                暂无统计数据。先回【今晚】安排一顿，或在“想连排几天”里轻量补几餐。
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Next action</p>
              <h3 className="card-title">下一步建议</h3>
            </div>
            <ListChecks size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ActionButton icon={CalendarDays} title="调整计划" text="补齐目标短板" onClick={() => onViewChange("planner")} />
            <ActionButton icon={ShoppingBasket} title="查看食材" text="确认采购清单" onClick={() => onViewChange("grocery")} />
            <ActionButton icon={BarChart3} title="修改目标" text="去我的家设置" onClick={() => onViewChange("user")} />
          </div>
        </Card>
      </div>
    </section>
  );
}

function TargetRow({ item, compact = false }) {
  const value = item.unit === "%" ? `${Math.round(item.value * 100)}%` : `${Math.round(item.value)}${item.unit}`;
  const target = item.unit === "%" ? `${Math.round(item.target * 100)}%` : `${Math.round(item.target)}${item.unit}`;
  return (
    <div className={`rounded-[18px] bg-canvas ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3 text-sm font-black">
        <span>{item.label}</span>
        <span className={item.ok ? "text-ink/45" : "text-ink"}>{value} / {target}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full ${item.ok ? "bg-ink" : "bg-ink"}`}
          style={{ width: `${Math.min(item.percent, 1) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-bold text-ink/45">{item.hint}</p>
    </div>
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

function ActionButton({ icon: Icon, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-ink"
    >
      <Icon size={20} />
      <p className="mt-3 font-black">{title}</p>
      <p className="mt-1 text-xs font-bold text-ink/50">{text}</p>
    </button>
  );
}

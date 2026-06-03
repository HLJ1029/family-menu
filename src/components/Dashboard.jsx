import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  ListChecks,
  PackageCheck,
  ShoppingBasket,
  Sparkles,
  UserRound,
  Users,
  Utensils,
} from "lucide-react";
import { Card } from "./ui/Card";
import { DoodleArrow } from "./ui/Doodles";
import { MetricCard } from "./ui/StatsBlocks";
import { MiniMeal } from "./ui/MiniMeal";

const fallbackFamilyMembers = [
  { name: "Alex", note: "低油、偏清淡", mood: "Clean" },
  { name: "Mia", note: "爱吃番茄和鸡蛋", mood: "Comfort" },
  { name: "Noah", note: "少辣、高蛋白", mood: "Fit" },
];

export function Dashboard({
  todayRecipes,
  weekPlan,
  groceryItems,
  pantryItems,
  pantryExpirySummary,
  recommendation,
  familyMembers,
  aiRecommendationStatus,
  aiRecommendationLoading,
  aiExplanation,
  aiExplanationStatus,
  aiExplanationLoading,
  onViewChange,
  onOpenRecipe,
  onAddRecommended,
  onPlanRecommended,
  onCompleteRecommendedGrocery,
  onRequestAiRecommendation,
  onRequestAiExplanation,
}) {
  const weekCoverage = Object.values(weekPlan).filter((items) => items.length > 0).length;
  const displayedMembers = familyMembers.length > 0
    ? familyMembers.map(formatFamilyMember)
    : fallbackFamilyMembers;
  const missingSummary = recommendation.missingItems.length > 0
    ? recommendation.missingItems.map((item) => item.name).join("、")
    : "不需要额外买主食材";
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
        <div className="absolute right-8 top-7 hidden md:block">
          <DoodleArrow />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">食间</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
          {todayRecipes.length > 0 ? "今晚菜单已经准备好。" : "今晚吃什么？"}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          {todayRecipes.length > 0
            ? "看一眼今晚吃什么，再顺手把要买的东西理清楚。"
            : "今天的晚饭，我们先帮你想一组。"}
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {todayRecipes.length > 0 ? (
            todayRecipes.map((recipe) => (
              <MiniMeal key={recipe.id} recipe={recipe} dark onClick={() => onOpenRecipe(recipe.id)} />
            ))
          ) : (
            <button
              type="button"
              onClick={() => onViewChange("today")}
              className="flex min-h-24 items-center justify-center rounded-[22px] border border-white/12 bg-white/8 px-5 text-sm font-black text-white transition hover:bg-white/12 md:col-span-2"
            >
              先选一道菜
            </button>
          )}
        </div>
        {todayRecipes.length > 0 && (
          <button
            type="button"
            onClick={() => onViewChange("today")}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-acid px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
          >
            看今晚菜单
          </button>
        )}
      </section>

      <section className="grid gap-5">
        <MetricCard
          icon={Sparkles}
          label="今晚推荐"
          value={recommendation.title}
          note={recommendation.reason}
          action="去看看菜"
          onClick={() => onViewChange("library")}
        />
        <div className="grid grid-cols-2 gap-5">
          <MetricCard
            icon={CalendarDays}
            label="这周怎么吃"
            value={`${weekCoverage}/7`}
            note="天已有安排"
            onClick={() => onViewChange("planner")}
          />
          <MetricCard
            icon={ListChecks}
            label="还要买"
            value={String(groceryItems.length)}
            note="买菜前看一眼"
            onClick={() => onViewChange("grocery")}
          />
        </div>
        <MetricCard
          icon={PackageCheck}
          label="家里现有"
          value={`${pantryItems.length} 项`}
          note={formatPantryNote(pantryItems.length, pantryExpirySummary)}
          onClick={() => onViewChange("inventory")}
        />
      </section>

      <section className="xl:col-span-2">
        <Card>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow">今晚</p>
              <h3 className="card-title">今晚适合吃</h3>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                先看家里有什么，再照顾口味和这周安排，给你配一组能落地的晚饭。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:max-w-xl">
              <SummaryPill label="家里现有" value={`${recommendation.inventoryHits} 项`} note="能用上家里的菜" />
              <SummaryPill label="先吃掉" value={`${recommendation.expiringHits ?? 0} 项`} note="快到期的优先安排" />
              <SummaryPill label="你的口味" value={`${recommendation.preferenceHits ?? 0} 项`} note="尽量贴合家里人" />
              <SummaryPill label="还差这些" value={`${recommendation.missingItems.length} 项`} note="买菜前看一眼" />
            </div>
          </div>
          <div className="mt-4 rounded-[20px] border border-line bg-canvas p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">今晚建议</p>
                <p className="mt-1 text-sm font-bold leading-6 text-ink/56">{aiRecommendationStatus}</p>
              </div>
              <button
                type="button"
                onClick={onRequestAiRecommendation}
                disabled={aiRecommendationLoading}
                className="min-h-11 shrink-0 rounded-full bg-acid px-4 text-xs font-black text-ink transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {aiRecommendationLoading ? "正在想" : "换一组晚饭"}
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recommendation.recipes.map((recipe) => (
              <MiniMeal key={recipe.id} recipe={recipe} onClick={() => onOpenRecipe(recipe.id)} />
            ))}
          </div>
          <div className="mt-4 rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/56">
            {recommendation.missingItems.length > 0
              ? `还差这些：${missingSummary}`
              : "这组和家里现有的东西挺搭，可以直接安排。"}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {Object.entries(recommendation.explanation ?? {}).map(([key, text]) => (
              <div key={key} className="rounded-[18px] border border-line bg-canvas p-3 text-xs font-bold leading-5 text-ink/52">
                {text}
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[20px] border border-line bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">为什么推荐这组</p>
                <p className="mt-1 text-sm font-bold leading-6 text-ink/56">
                  {aiExplanation || recommendation.reason}
                </p>
                <p className="mt-2 text-xs font-bold leading-5 text-ink/40">{aiExplanationStatus}</p>
              </div>
              <button
                type="button"
                onClick={onRequestAiExplanation}
                disabled={aiExplanationLoading}
                className="min-h-11 shrink-0 rounded-full border border-line bg-canvas px-4 text-xs font-black text-ink/62 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                {aiExplanationLoading ? "正在想" : "看看为什么这样搭"}
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-[22px] border border-line bg-canvas p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <RecommendationAction
                icon={Utensils}
                label="就吃这一组"
                note="放进今晚菜单"
                primary
                onClick={onAddRecommended}
              />
              <RecommendationAction
                icon={CalendarPlus}
                label="放进这周"
                note="安排到最近空位"
                onClick={onPlanRecommended}
              />
              <RecommendationAction
                icon={ShoppingBasket}
                label="看看还要买什么"
                note={recommendation.missingItems.length > 0 ? `${recommendation.missingItems.length} 项缺口` : "查看清单"}
                onClick={onCompleteRecommendedGrocery}
              />
            </div>
            <p className="mt-3 text-xs font-bold leading-5 text-ink/42">
              选定之后，{missingSummary} 会自动放进买菜清单。
            </p>
          </div>
        </Card>
      </section>

      <section className="xl:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">接着安排</p>
              <h3 className="card-title">接着安排</h3>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <DashboardTool
              icon={ClipboardList}
              title="今晚菜单"
              note="调整份数、进入做法"
              ariaLabel="打开今晚菜单"
              onClick={() => onViewChange("today")}
            />
            <DashboardTool
              icon={CalendarDays}
              title="日历"
              note="哪天吃什么"
              ariaLabel="打开日历"
              onClick={() => onViewChange("calendar")}
            />
            <DashboardTool
              icon={BarChart3}
              title="统计"
              note="看看最近吃得怎样"
              ariaLabel="打开统计"
              onClick={() => onViewChange("stats")}
            />
            <DashboardTool
              icon={PackageCheck}
              title="家中库存"
              note={formatPantryNote(pantryItems.length, pantryExpirySummary)}
              ariaLabel="打开家中库存"
              onClick={() => onViewChange("inventory")}
            />
            <DashboardTool
              icon={UserRound}
              title="我的家"
              note="保存菜单和家人口味"
              ariaLabel="打开我的家"
              onClick={() => onViewChange("user")}
            />
          </div>
        </Card>
      </section>

      <section className="xl:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">口味</p>
              <h3 className="card-title">家人口味</h3>
            </div>
            <Users size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {displayedMembers.map((member) => (
              <div key={member.name} className="rounded-[20px] border border-line bg-canvas p-4">
                <p className="text-lg font-black">{member.name}</p>
                <p className="mt-1 text-sm text-ink/56">{member.note}</p>
                <span className="mt-4 inline-flex rounded-full bg-acid px-3 py-1 text-xs font-black">
                  {member.mood}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function formatFamilyMember(member) {
  const preference = member.preference ?? {};
  const signals = [
    ...(preference.likes ?? []).slice(0, 2),
    ...(preference.goals ?? []).slice(0, 2),
  ];
  const cautions = [...(preference.dislikes ?? []), ...(preference.allergies ?? [])].slice(0, 2);

  return {
    name: member.email?.split("@")[0] ?? "家庭成员",
    note: signals.length > 0 ? signals.join("、") : "口味待补充",
    mood: cautions.length > 0 ? `避开 ${cautions.join("、")}` : member.role,
  };
}

function formatPantryNote(count, summary = {}) {
  if (summary.expiredCount > 0) return `${count} 项在家 · ${summary.expiredCount} 项过期`;
  if (summary.expiringCount > 0) return `${count} 项在家 · ${summary.expiringCount} 项快到期`;
  return `${count} 项在家`;
}

function SummaryPill({ label, value, note }) {
  return (
    <div className="min-h-[104px] rounded-[18px] bg-canvas p-3">
      <p className="text-xs font-black text-ink/42">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-2 text-xs font-bold leading-5 text-ink/45">{note}</p>
    </div>
  );
}

function RecommendationAction({ icon: Icon, label, note, primary = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[74px] items-center gap-3 rounded-[18px] px-3 text-left transition hover:-translate-y-0.5 ${
        primary ? "bg-ink text-white" : "border border-line bg-white text-ink hover:border-ink/22"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${primary ? "bg-acid text-ink" : "bg-acid/70"}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black">{label}</span>
        <span className={`mt-1 block text-xs font-bold leading-4 ${primary ? "text-white/58" : "text-ink/45"}`}>{note}</span>
      </span>
    </button>
  );
}

function DashboardTool({ icon: Icon, title, note, ariaLabel, onClick }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
    >
      <Icon size={20} />
      <p className="mt-3 font-black">{title}</p>
      <p className="mt-1 text-xs font-bold text-ink/50">{note}</p>
    </button>
  );
}

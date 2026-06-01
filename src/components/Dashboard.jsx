import { BarChart3, CalendarDays, ClipboardList, ListChecks, PackageCheck, Sparkles, UserRound, Users } from "lucide-react";
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
  onViewChange,
  onOpenRecipe,
  onAddRecommended,
}) {
  const weekCoverage = Object.values(weekPlan).filter((items) => items.length > 0).length;
  const displayedMembers = familyMembers.length > 0
    ? familyMembers.map(formatFamilyMember)
    : fallbackFamilyMembers;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
        <div className="absolute right-8 top-7 hidden md:block">
          <DoodleArrow />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Decision center</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
          {todayRecipes.length > 0 ? "今日菜单已经准备好。" : "今天吃什么，交给 FamilyOS。"}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          {todayRecipes.length > 0
            ? "用一个移动端决策中心管住菜单、库存、购物清单和家庭偏好。"
            : "先从规则推荐开始，结合库存、计划和营养粗览，逐步升级到 AI 饮食管家。"}
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
              添加今日第一道菜
            </button>
          )}
        </div>
        {todayRecipes.length > 0 && (
          <button
            type="button"
            onClick={() => onViewChange("today")}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-acid px-5 text-sm font-black text-ink transition hover:-translate-y-0.5"
          >
            管理今日菜单
          </button>
        )}
      </section>

      <section className="grid gap-5">
        <MetricCard
          icon={Sparkles}
          label="今日推荐"
          value={recommendation.title}
          note={recommendation.reason}
          action="去菜单库确认"
          onClick={() => onViewChange("library")}
        />
        <div className="grid grid-cols-2 gap-5">
          <MetricCard
            icon={CalendarDays}
            label="本周计划"
            value={`${weekCoverage}/7`}
            note="餐次已规划"
            onClick={() => onViewChange("planner")}
          />
          <MetricCard
            icon={ListChecks}
            label="待购买"
            value={String(groceryItems.length)}
            note="自动合并食材"
            onClick={() => onViewChange("grocery")}
          />
        </div>
      </section>

      <section className="xl:col-span-2">
        <Card>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow">Rule engine</p>
              <h3 className="card-title">规则推荐结果</h3>
              <p className="mt-3 text-sm font-bold leading-6 text-ink/52">
                当前推荐先由规则引擎生成，后续会交给 Supabase Edge Function 调用 AI 做解释表达。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SummaryPill label="库存命中" value={`${recommendation.inventoryHits} 项`} />
              <SummaryPill label="临期命中" value={`${recommendation.expiringHits ?? 0} 项`} />
              <SummaryPill label="偏好命中" value={`${recommendation.preferenceHits ?? 0} 项`} />
              <SummaryPill label="缺少食材" value={`${recommendation.missingItems.length} 项`} />
              <SummaryPill label="蛋白质" value={`${Math.round(recommendation.nutrition.proteinG)} g`} />
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recommendation.recipes.map((recipe) => (
              <MiniMeal key={recipe.id} recipe={recipe} onClick={() => onOpenRecipe(recipe.id)} />
            ))}
          </div>
          <div className="mt-4 rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/56">
            {recommendation.missingItems.length > 0
              ? `采购提醒：${recommendation.missingItems.map((item) => item.name).join("、")}`
              : "当前推荐与可用库存匹配度不错，可以直接加入今日菜单。"}
          </div>
          <button
            type="button"
            onClick={onAddRecommended}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
          >
            加入今日菜单
          </button>
        </Card>
      </section>

      <section className="xl:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">More tools</p>
              <h3 className="card-title">更多功能</h3>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <DashboardTool
              icon={ClipboardList}
              title="今日菜单"
              note="调整份数、进入做法"
              ariaLabel="打开今日菜单"
              onClick={() => onViewChange("today")}
            />
            <DashboardTool
              icon={CalendarDays}
              title="日历"
              note="按日期安排饮食"
              ariaLabel="打开日历"
              onClick={() => onViewChange("calendar")}
            />
            <DashboardTool
              icon={BarChart3}
              title="统计"
              note="查看饮食结构"
              ariaLabel="打开统计"
              onClick={() => onViewChange("stats")}
            />
            <DashboardTool
              icon={PackageCheck}
              title="家庭库存"
              note={formatPantryNote(pantryItems.length, pantryExpirySummary)}
              ariaLabel="打开家庭库存"
              onClick={() => onViewChange("grocery")}
            />
            <DashboardTool
              icon={UserRound}
              title="用户中心"
              note="登录、家庭和云同步"
              ariaLabel="打开用户中心"
              onClick={() => onViewChange("user")}
            />
          </div>
        </Card>
      </section>

      <section className="xl:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Family taste</p>
              <h3 className="card-title">家庭成员偏好</h3>
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
    note: signals.length > 0 ? signals.join("、") : "偏好待补充",
    mood: cautions.length > 0 ? `避开 ${cautions.join("、")}` : member.role,
  };
}

function formatPantryNote(count, summary = {}) {
  if (summary.expiredCount > 0) return `${count} 项已有 · ${summary.expiredCount} 项已过期`;
  if (summary.expiringCount > 0) return `${count} 项已有 · ${summary.expiringCount} 项临期`;
  return `${count} 项已有材料`;
}

function SummaryPill({ label, value }) {
  return (
    <div className="rounded-[18px] bg-canvas p-3">
      <p className="text-xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-ink/38">{label}</p>
    </div>
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

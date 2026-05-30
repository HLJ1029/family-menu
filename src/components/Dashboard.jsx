import { BarChart3, CalendarDays, ClipboardList, ListChecks, Sparkles, Users } from "lucide-react";
import { Card } from "./ui/Card";
import { DoodleArrow } from "./ui/Doodles";
import { MetricCard } from "./ui/StatsBlocks";
import { MiniMeal } from "./ui/MiniMeal";

const familyMembers = [
  { name: "Alex", note: "低油、偏清淡", mood: "Clean" },
  { name: "Mia", note: "爱吃番茄和鸡蛋", mood: "Comfort" },
  { name: "Noah", note: "少辣、高蛋白", mood: "Fit" },
];

export function Dashboard({ todayRecipes, weekPlan, groceryItems, onViewChange, onOpenRecipe }) {
  const weekCoverage = Object.values(weekPlan).filter((items) => items.length > 0).length;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
        <div className="absolute right-8 top-7 hidden md:block">
          <DoodleArrow />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Today board</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
          {todayRecipes.length > 0 ? "今日菜单已经准备好。" : "今天想吃什么？"}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          {todayRecipes.length > 0
            ? "用一个轻量 dashboard 管住菜单、购物清单和家庭偏好。克制一点，生活就顺一点。"
            : "直接在今日菜单里选菜，系统会同步到今天计划和食材清单。"}
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
          label="AI 推荐"
          value="番茄牛腩 + 青菜"
          note="基于本周口味，偏清爽但不寡淡。"
          action="看推荐"
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
              onClick={() => onViewChange("today")}
            />
            <DashboardTool
              icon={CalendarDays}
              title="日历"
              note="按日期安排饮食"
              onClick={() => onViewChange("calendar")}
            />
            <DashboardTool
              icon={BarChart3}
              title="统计"
              note="查看饮食结构"
              onClick={() => onViewChange("stats")}
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
            {familyMembers.map((member) => (
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

function DashboardTool({ icon: Icon, title, note, onClick }) {
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

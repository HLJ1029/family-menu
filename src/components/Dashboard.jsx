import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useState } from "react";
import { formatProfileSummary, getProfileCompletedCount } from "../lib/profile";
import { photoFor } from "../lib/recipes";
import { AccountAvatar } from "./AppShell";

const dinnerSources = [
  { id: "home", label: "在家做" },
  { id: "delivery", label: "点外卖" },
  { id: "outside", label: "外面吃" },
  { id: "skip", label: "不记录" },
];

const dinnerConfirmations = [
  { id: "all", label: "全部吃了" },
  { id: "partial", label: "吃了一部分" },
  { id: "missed", label: "没做" },
];

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
  groceryItemCount = 0,
  mealLog,
  onSetDinnerSource,
  onSetDinnerConfirmation,
}) {
  const [arranging, setArranging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const profileReady = getProfileCompletedCount(familyProfile) >= 4;
  const dinnerReady = todayRecipes.length > 0;
  const recommendedItems = getRecommendationItems(recommendation);
  const recommendedRecipes = recommendedItems.map((item) => item.recipe);
  const visibleDinnerItems = dinnerReady
    ? todayRecipes.map((recipe) => ({ recipe, quantity: recipe.menuQuantity ?? 1 }))
    : recommendedItems;
  const heroRecipe = dinnerReady ? todayRecipes[0] : recommendedRecipes[0];
  const activeRecipes = dinnerReady ? todayRecipes : recommendedRecipes;
  const totalMinutes = activeRecipes.reduce((total, recipe) => total + recipe.timeMinutes, 0);
  const totalRecommendationPortions = recommendedItems.reduce((total, item) => total + item.quantity, 0);
  const weekDishCount = Object.values(weekPlan ?? {}).reduce((total, recipeIds) => total + recipeIds.length, 0);
  const recentPlan = Object.entries(weekPlan ?? {})
    .filter(([, recipeIds]) => recipeIds.length > 0)
    .slice(0, 3);

  function arrangeTonight() {
    setArranging(true);
    onAddRecommended();
    window.setTimeout(() => onViewChange("today"), 520);
  }

  const purchaseCount = dinnerReady ? groceryItemCount : recommendation.missingItems.length;
  const coreSummary = `预计 ${totalMinutes || 25} 分钟 · 需购买 ${purchaseCount} 项食材`;

  return (
    <div className="grid gap-5">
      <section className="relative min-h-[min(720px,calc(100vh-2rem))] overflow-hidden rounded-[32px] bg-ink text-white shadow-lift">
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
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/18" />
        <div className="absolute left-5 top-5 z-10">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-acid">HUMI</p>
        </div>
        <div className="absolute right-5 top-5 z-10">
          <AccountAvatar session={session} onClick={onOpenUserCenter} compact />
        </div>
        {arranging && (
          <div className="arrange-flight-layer pointer-events-none absolute inset-0 z-20">
            {recommendedItems.slice(0, 4).map(({ recipe }, index) => (
              <span
                key={recipe.id}
                className="arrange-flight-chip"
                style={{ "--flight-index": index }}
              >
                <img src={photoFor(recipe, { variant: "thumb" })} alt="" />
              </span>
            ))}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-10 p-5 md:p-8">
          <div className="max-w-4xl">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">今晚吃什么</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-black tracking-[-0.04em] md:text-7xl">
              {dinnerReady ? "今晚安排好了。" : recommendation.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-white/72">
              {coreSummary}
            </p>
          </div>

          <div className="tonight-card-swap mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" key={recommendation.title}>
            {visibleDinnerItems.map(({ recipe, quantity }) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                className="grid grid-cols-[76px_1fr] gap-3 rounded-[24px] border border-white/14 bg-white/12 p-3 text-left backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/16"
              >
                <img
                  src={photoFor(recipe, { variant: "thumb" })}
                  alt=""
                  className="h-20 w-20 rounded-[18px] object-cover"
                />
                <span className="min-w-0 py-1">
                  <span className="block truncate text-lg font-black">{recipe.name}</span>
                  <span className="mt-2 flex flex-wrap gap-2 text-xs font-black text-white/70">
                    <span className="rounded-full bg-white/12 px-2.5 py-1">{recipe.timeMinutes} min</span>
                    <span className="rounded-full bg-white/12 px-2.5 py-1">{recipe.categories[0]}</span>
                    {quantity > 1 && <span className="portion-pop rounded-full bg-acid px-2.5 py-1 text-ink">x{quantity} 份</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={dinnerReady ? () => onViewChange("today") : arrangeTonight}
              className="tonight-arrange-button inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-acid px-7 text-base font-black text-ink transition hover:-translate-y-1"
            >
              {dinnerReady ? <CheckCircle2 size={19} /> : <Utensils size={19} />}
              {dinnerReady ? "查看今晚菜单" : "安排今晚"}
            </button>
            <button
              type="button"
              onClick={dinnerReady ? () => onViewChange("grocery") : () => onRequestAiRecommendation()}
              disabled={!dinnerReady && aiRecommendationLoading}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/16 bg-white/10 px-7 text-base font-black text-white transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-60"
            >
              {dinnerReady ? (
                <ShoppingBasket size={18} />
              ) : (
                <RefreshCw size={18} className={aiRecommendationLoading ? "animate-spin" : ""} />
              )}
              {dinnerReady ? "查看清单" : "换一组"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            className="mt-4 text-xs font-black text-white/58 underline decoration-white/20 underline-offset-4 transition hover:text-white"
          >
            {detailsOpen ? "收起安排依据" : "展开安排依据"}
          </button>
          {detailsOpen && (
            <div className="tonight-detail-panel mt-4 rounded-[24px] border border-white/14 bg-white/10 p-4 backdrop-blur-xl">
              <div className="flex flex-wrap gap-2">
                <StatusPill icon={Clock3} label="预计" value={`${totalMinutes || 25} 分钟`} />
                <StatusPill icon={ShoppingBasket} label="待买" value={`${purchaseCount} 项`} />
                {!dinnerReady && (
                  <StatusPill icon={Utensils} label="份量" value={`${recommendedRecipes.length} 道 / ${totalRecommendationPortions} 份`} />
                )}
                <StatusPill icon={CalendarDays} label="本周" value={`${weekDishCount} 道菜`} />
              </div>
              {!dinnerReady && recommendation.missingItems.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {recommendation.missingItems.slice(0, 5).map((item) => (
                    <span
                      key={item.name}
                      className="rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-xs font-black text-white/70"
                    >
                      缺 {item.name}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 max-w-2xl text-xs font-bold leading-5 text-white/58">
                {dinnerReady
                  ? "今晚菜单已同步进本周计划，采购清单会自动汇总。"
                  : `${recommendation.reason || formatProfileSummary(familyProfile)} ${aiRecommendationStatus}`}
              </p>
              {!profileReady && (
                <button
                  type="button"
                  onClick={onOpenUserCenter}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/16 bg-white/10 px-4 text-xs font-black text-white transition hover:-translate-y-0.5"
                >
                  <Sparkles size={15} className="text-acid" />
                  设置饮食偏好
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <DinnerLogPanel
        mealLog={mealLog}
        onSetDinnerSource={onSetDinnerSource}
        onSetDinnerConfirmation={onSetDinnerConfirmation}
        showConfirmation={dinnerReady}
        dinnerReady={dinnerReady}
        onViewChange={onViewChange}
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">最近安排</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">今晚之后，顺手看本周</h2>
            </div>
            <button
              type="button"
              onClick={() => onViewChange("planner")}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-4 text-xs font-black text-white transition hover:-translate-y-0.5"
            >
              <CalendarDays size={15} className="text-acid" />
              本周计划
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {recentPlan.length > 0 ? (
              recentPlan.map(([day, recipeIds]) => (
                <div key={day} className="rounded-[22px] bg-canvas p-4">
                  <p className="text-xs font-black text-ink/38">{day}</p>
                  <p className="mt-2 text-lg font-black">{recipeIds.length} 道菜</p>
                </div>
              ))
            ) : (
              <p className="rounded-[22px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/52 sm:col-span-3">
                先安排今晚，Humi 会把今天同步进本周计划。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-line bg-white p-5 shadow-card">
          <p className="eyebrow">本周进度</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">计划、清单、自己挑</h2>
          <div className="mt-4 grid gap-2">
            <QuickLink icon={ShoppingBasket} label={`清单已汇总 ${groceryItemCount} 项`} onClick={() => onViewChange("grocery")} />
            <QuickLink icon={ChefHat} label="自己挑一道换口味" onClick={() => onViewChange("library")} />
          </div>
        </div>
      </section>
    </div>
  );
}

export function DinnerLogPanel({
  mealLog,
  onSetDinnerSource,
  onSetDinnerConfirmation,
  showConfirmation,
  dinnerReady = false,
  onViewChange,
}) {
  const sourceResult = getDinnerSourceResult(mealLog?.source, dinnerReady);
  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">晚餐记录</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">今天这顿从哪里来</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            每天只记一次。没在家做饭也可以打开 Humi，饮食画像会更真实。
          </p>
        </div>
        {mealLog?.confirmation === "all" && (
          <span className="inline-flex items-center gap-2 rounded-full bg-acid px-4 py-2 text-xs font-black text-ink">
            <CheckCircle2 size={15} />
            已计入饮食画像
          </span>
        )}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-black text-ink/38">晚餐来源</p>
          <div className="grid grid-cols-2 gap-2">
            {dinnerSources.map((source) => (
              <ChoiceButton
                key={source.id}
                active={mealLog?.source === source.id}
                label={source.label}
                onClick={() => onSetDinnerSource(source.id)}
              />
            ))}
          </div>
        </div>
        {showConfirmation && (
          <div>
            <p className="mb-2 text-xs font-black text-ink/38">今晚最后吃了吗</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {dinnerConfirmations.map((item) => (
                <ChoiceButton
                  key={item.id}
                  active={mealLog?.confirmation === item.id}
                  label={item.label}
                  onClick={() => onSetDinnerConfirmation(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {sourceResult && (
        <div className="dinner-result-enter mt-4 rounded-[22px] border border-line bg-canvas p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">结果</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em]">{sourceResult.title}</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">{sourceResult.text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sourceResult.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => onViewChange?.(action.view)}
                className={action.primary
                  ? "inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 text-xs font-black text-white"
                  : "inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-white px-4 text-xs font-black text-ink/60"}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function getDinnerSourceResult(source, dinnerReady) {
  if (source === "home") {
    return {
      title: dinnerReady ? "今晚安排完成" : "已记录在家做",
      text: dinnerReady
        ? "菜单已同步到本周计划，采购清单已经自动汇总。"
        : "先回首页安排今晚菜单，再继续生成采购清单。",
      actions: dinnerReady
        ? [
            { label: "查看采购清单", view: "grocery", primary: true },
            { label: "开始做饭", view: "today" },
          ]
        : [{ label: "返回首页", view: "dashboard", primary: true }],
    };
  }
  if (source === "delivery") {
    return {
      title: "今晚记为外卖",
      text: "已同步饮食记录。它会进入饮食画像，但不会计入营养目标完成率。",
      actions: [
        { label: "返回首页", view: "dashboard", primary: true },
        { label: "查看饮食画像", view: "stats" },
      ],
    };
  }
  if (source === "outside") {
    return {
      title: "今晚记为外食",
      text: "已同步饮食记录。Humi 会保留这次来源，让本周画像更真实。",
      actions: [{ label: "返回首页", view: "dashboard", primary: true }],
    };
  }
  if (source === "skip") {
    return {
      title: "今天先不记录",
      text: "今晚不会进入饮食画像，也不会影响后续推荐统计。",
      actions: [{ label: "返回首页", view: "dashboard", primary: true }],
    };
  }
  return null;
}

function StatusPill({ icon: Icon, label, value }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-4 py-2 text-xs font-black text-white/76 backdrop-blur">
      <Icon size={14} className="text-acid" />
      {label} · {value}
    </span>
  );
}

function ChoiceButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-black transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink/58 hover:border-ink/20 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function QuickLink({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 items-center gap-3 rounded-[18px] bg-canvas px-4 text-left text-sm font-black text-ink/62 transition hover:-translate-y-0.5 hover:bg-acid hover:text-ink"
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function getRecommendationItems(recommendation) {
  if (Array.isArray(recommendation?.items) && recommendation.items.length > 0) {
    return recommendation.items
      .map((item) => {
        const recipe = item.recipe;
        if (!recipe) return null;
        return {
          recipe,
          quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        };
      })
      .filter(Boolean);
  }
  return (recommendation?.recipes ?? []).map((recipe) => ({ recipe, quantity: 1 }));
}

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircleHeart,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Utensils,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getExpiryState } from "../lib/pantry";
import { formatProfileSummary, getProfileCompletedCount } from "../lib/profile";
import { mealSlots } from "../lib/mealPlan";
import { getRecipe } from "../lib/recipes";
import { formatCraveReason, summarizeCraveVotes } from "../lib/collaboration";
import { AccountAvatar } from "./AppShell";
import { CraveCollectingSheet, CraveStarterSheet } from "./CraveSheet";
import { DishImage } from "./ui/DishImage";
import { HumiBrandIllustration } from "./ui/HumiBrandIllustration";

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
  todayMeals = {},
  weekPlan,
  recommendation,
  recommendationAccess,
  aiRecommendationStatus,
  aiRecommendationLoading,
  onViewChange,
  onOpenRecipe,
  onAddRecommended,
  onRequestAiRecommendation,
  onRequestPreciseRecommendation,
  onOpenRecommendationFeedback,
  feedbackOpen,
  onSubmitRecommendationFeedback,
  onCloseRecommendationFeedback,
  onStartCraveRequest,
  onDecideAlone,
  activeCraveRequest,
  cravePromptSignal,
  onCopyCraveLink,
  onRefreshCraveRequest,
  onGenerateFromCrave,
  onRecordBreakfast,
  onSetLunchSource,
  session,
  onOpenUserCenter,
  familyProfile,
  groceryItemCount = 0,
  mealLog,
  mealLogs,
  onSetDinnerSource,
  onSetDinnerConfirmation,
  onQuickDinnerConfirm,
  onToggleConsumedRecipe,
  pantryItems = [],
  onRemovePantryItem,
}) {
  const [arranging, setArranging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [craveOpen, setCraveOpen] = useState(false);
  const [dismissedPantryChecks, setDismissedPantryChecks] = useState({});
  const [selectedCraveRecipeIds, setSelectedCraveRecipeIds] = useState([]);
  const [selectedFeeling, setSelectedFeeling] = useState("随便都行");
  const cravePanelRef = useRef(null);
  const profileReady = getProfileCompletedCount(familyProfile) >= 4;
  const dinnerReady = todayRecipes.length > 0;

  useEffect(() => {
    if (!cravePromptSignal) return;
    setCraveOpen(true);
  }, [cravePromptSignal]);
  useEffect(() => {
    if (!craveOpen) return;
    window.setTimeout(() => cravePanelRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
  }, [craveOpen]);
  const recommendedItems = getRecommendationItems(recommendation);
  const recommendedRecipes = recommendedItems.map((item) => item.recipe);
  const visibleDinnerItems = dinnerReady
    ? todayRecipes.map((recipe) => ({ recipe, quantity: recipe.menuQuantity ?? 1 }))
    : recommendedItems;
  const heroRecipe = dinnerReady ? todayRecipes[0] : recommendedRecipes[0];
  const activeRecipes = dinnerReady ? todayRecipes : recommendedRecipes;
  const craveSelectionMode = !dinnerReady && recommendation.source === "crave";
  useEffect(() => {
    if (!craveSelectionMode) {
      setSelectedCraveRecipeIds([]);
      return;
    }
    setSelectedCraveRecipeIds(recommendedRecipes.map((recipe) => recipe.id));
  }, [craveSelectionMode, recommendation.title]);
  const hasStaple = activeRecipes.some((recipe) => recipe.categories.includes("主食") || recipe.tags?.includes("主食"));
  const totalMinutes = activeRecipes.reduce((total, recipe) => total + recipe.timeMinutes, 0);
  const totalRecommendationPortions = recommendedItems.reduce((total, item) => total + item.quantity, 0);
  const todayMealSummaries = mealSlots.map((slot) => {
    const entries = todayMeals[slot.id] ?? [];
    const recipes = entries.map((entry) => getRecipe(entry.recipeId)).filter(Boolean);
    return {
      ...slot,
      entries,
      recipes,
      count: recipes.length,
    };
  });
  const breakfastSummary = todayMealSummaries.find((slot) => slot.id === "breakfast");
  const lunchSummary = todayMealSummaries.find((slot) => slot.id === "lunch");
  const lunchLog = mealLog?.meals?.lunch ?? {};
  function arrangeTonight() {
    if (craveSelectionMode && selectedCraveRecipeIds.length === 0) return;
    setArranging(true);
    onAddRecommended(craveSelectionMode ? selectedCraveRecipeIds : null);
    window.setTimeout(() => onViewChange("today"), 520);
  }

  function submitFeeling() {
    onStartCraveRequest?.(selectedFeeling);
  }

  function decideAlone() {
    onDecideAlone?.(selectedFeeling);
    setCraveOpen(false);
  }

  const purchaseCount = dinnerReady ? groceryItemCount : recommendation.missingItems.length;
  const coreSummary = `适合 ${recommendation.familySize ?? familyProfile.familySize ?? 2} 人 · ${activeRecipes.length} 道 · 预计 ${totalMinutes || 25} 分钟 · 需购买 ${purchaseCount} 项`;
  const decisionSummary = hasStaple ? "已有主食" : "建议补主食";
  const preciseTrialRemaining = Math.max(0, Number.parseInt(recommendationAccess?.preciseTrialRemaining, 10) || 0);
  const preciseEnabled = recommendationAccess?.plan === "plus" || preciseTrialRemaining > 0;
  const pantryCheckItem = buildPantryCheckItem({ recipes: activeRecipes, pantryItems, dismissedPantryChecks });
  const craveVoteSummary = summarizeCraveVotes(activeCraveRequest?.votes ?? []);
  const selectedCraveCount = selectedCraveRecipeIds.length;

  function toggleCraveRecipe(recipeId) {
    setSelectedCraveRecipeIds((current) =>
      current.includes(recipeId)
        ? current.filter((id) => id !== recipeId)
        : [...current, recipeId],
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 overflow-hidden">
      <section className="relative min-w-0 overflow-hidden rounded-[32px] border border-line bg-canvas p-5 text-ink shadow-card md:p-8">
        <div className="absolute left-5 top-5 z-10">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-ink">HUMI</p>
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
                <DishImage recipe={recipe} variant="thumb" alt="" />
              </span>
            ))}
          </div>
        )}

        <div className="relative z-10 pt-16">
          <div className="grid gap-4 md:grid-cols-[1fr_180px] md:items-end">
            <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ink/42">今晚吃什么</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl md:text-6xl">
              {dinnerReady ? todayRecipes.map((recipe) => recipe.name).join(" + ") : recommendation.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-ink/58">
              {coreSummary}
            </p>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-ink/58">
              {aiRecommendationLoading
                ? "正在重新核对家里现有、时间和忌口线索。"
                : dinnerReady
                  ? "菜单已落位，买菜清单会跟着更新。"
                  : "先按家里已有食材和今晚时间，给你一组能落地的晚饭。"}
            </p>
            <MealRhythmPanel
              breakfastSummary={breakfastSummary}
              lunchSummary={lunchSummary}
              lunchLog={lunchLog}
              onRecordBreakfast={onRecordBreakfast}
              onSetLunchSource={onSetLunchSource}
            />
            </div>
            <div className="justify-self-center md:justify-self-end">
              <HumiBrandIllustration
                variant={dinnerReady ? "dinner-ready" : aiRecommendationLoading ? "recommendation-loading" : "dashboard-recommendation"}
                size="2xl"
                className="shrink-0"
                title="今晚菜单生活场景"
                contextKey={dinnerReady ? "dashboard-dinner-ready" : "dashboard-dinner-decision"}
              />
            </div>
          </div>

          <div className="tonight-card-swap mt-6 grid gap-4 md:mt-8 md:grid-cols-2" key={recommendation.title}>
            {visibleDinnerItems.map(({ recipe, quantity }) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => {
                  if (craveSelectionMode) {
                    toggleCraveRecipe(recipe.id);
                    return;
                  }
                  onOpenRecipe(recipe.id);
                }}
                className={`rounded-[28px] border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-ink md:p-6 ${
                  craveSelectionMode && selectedCraveRecipeIds.includes(recipe.id)
                    ? "border-ink ring-2 ring-ink/10"
                    : "border-line"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="block min-w-0 text-2xl font-black tracking-[-0.03em]">{recipe.name}</span>
                  {craveSelectionMode && (
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${
                        selectedCraveRecipeIds.includes(recipe.id)
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-canvas text-ink/35"
                      }`}
                      aria-hidden="true"
                    >
                      {selectedCraveRecipeIds.includes(recipe.id) ? "✓" : ""}
                    </span>
                  )}
                </span>
                <span className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink/52">
                    <span>{recipe.timeMinutes} min</span>
                    <span>{recipe.categories[0]}</span>
                    {recipe.categories.includes("主食") && <span>主食</span>}
                    {quantity > 1 && <span className="portion-pop">x{quantity} 份</span>}
                  </span>
                <span className="mt-4 block rounded-[18px] bg-canvas px-4 py-3 text-sm font-bold leading-6 text-ink/56">
                  {buildDishReason({
                    recipe,
                    recommendation,
                    craveVoteSummary,
                    pantryItems,
                    familyProfile,
                  })}
                </span>
              </button>
            ))}
          </div>

          {!dinnerReady && pantryCheckItem && (
            <div className="mt-5 flex flex-col gap-3 rounded-[22px] border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-ink">家里还有 {pantryCheckItem.name} 吗？</p>
                <p className="mt-1 text-xs font-bold leading-5 text-ink/48">
                  这组推荐把它当作加分项；不在了也没关系，我会从后台已有里轻轻拿掉。
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDismissedPantryChecks((current) => ({
                      ...current,
                      [pantryCheckItem.key]: true,
                    }))
                  }
                  className="min-h-10 rounded-full border border-line bg-canvas px-4 text-xs font-black text-ink/58"
                >
                  还有
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRemovePantryItem?.(pantryCheckItem.key);
                    setDismissedPantryChecks((current) => ({
                      ...current,
                      [pantryCheckItem.key]: true,
                    }));
                  }}
                  className="min-h-10 rounded-full bg-ink px-4 text-xs font-black text-white"
                >
                  没了
                </button>
              </div>
            </div>
          )}

          {!dinnerReady && recommendation.source === "crave" && (
            <div className="mt-5 rounded-[22px] border border-line bg-white p-4">
              <p className="text-sm font-black text-ink">已揉合家人的感觉</p>
              <p className="mt-1 text-sm font-bold leading-6 text-ink/52">
                点卡片勾选今晚真要做的菜，再落进今晚菜单；买菜清单会跟着自动生成。
              </p>
            </div>
          )}

          <div className="mt-6 grid min-w-0 grid-cols-2 gap-3 sm:mt-8 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={dinnerReady ? () => onViewChange("today") : arrangeTonight}
              disabled={craveSelectionMode && selectedCraveCount === 0}
              className="tonight-arrange-button col-span-2 inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white transition hover:-translate-y-1 sm:col-span-1 sm:px-7"
            >
              {dinnerReady ? <CheckCircle2 size={19} /> : <Utensils size={19} />}
              {dinnerReady
                ? "查看今晚菜单"
                : craveSelectionMode
                  ? selectedCraveCount > 0
                    ? `就做选中的 ${selectedCraveCount} 道`
                    : "先勾一道"
                  : "今晚就做"}
            </button>
            <button
              type="button"
              onClick={dinnerReady ? () => onViewChange("grocery") : () => onRequestAiRecommendation()}
              disabled={!dinnerReady && aiRecommendationLoading}
              className="inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-transparent px-4 text-sm font-black text-ink transition hover:-translate-y-1 disabled:cursor-wait disabled:opacity-60 sm:px-7 sm:text-base"
            >
              {dinnerReady ? (
                <ShoppingBasket size={18} />
              ) : (
                <RefreshCw size={18} className={aiRecommendationLoading ? "animate-spin" : ""} />
              )}
              {dinnerReady ? "查看清单" : "换一组"}
            </button>
            {!dinnerReady && (
              <button
                type="button"
                onClick={craveSelectionMode
                  ? () => onRequestAiRecommendation({ id: "crave_reject_all", label: "都不想吃" })
                  : onOpenRecommendationFeedback}
                className="inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-transparent px-4 text-sm font-black text-ink transition hover:-translate-y-1 sm:px-7 sm:text-base"
              >
                {craveSelectionMode ? "都不想吃" : "不想吃"}
              </button>
            )}
            {!dinnerReady && (
              <button
                type="button"
                onClick={onRequestPreciseRecommendation}
                disabled={aiRecommendationLoading || !preciseEnabled}
                className="col-span-2 inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink/42 sm:col-span-1 sm:px-7 sm:text-base"
              >
                <Sparkles size={18} />
                {recommendationAccess?.plan === "plus"
                  ? "精准推荐"
                  : preciseTrialRemaining > 0
                    ? `精准推荐 · 余 ${preciseTrialRemaining}`
                    : "精准推荐已用完"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setCraveOpen((current) => !current)}
              className="col-span-2 inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-transparent px-4 text-sm font-black text-ink transition hover:-translate-y-1 sm:col-span-1 sm:px-7 sm:text-base"
            >
              <MessageCircleHeart size={18} />
              问问大家想吃啥
            </button>
          </div>
          {craveOpen && (
            <div ref={cravePanelRef} className="mt-5 scroll-mb-32">
              {activeCraveRequest?.token ? (
                <CraveCollectingSheet
                  request={activeCraveRequest}
                  onCopyCraveLink={onCopyCraveLink}
                  onRefreshCraveRequest={onRefreshCraveRequest}
                  onGenerateFromCrave={onGenerateFromCrave}
                />
              ) : (
                <CraveStarterSheet
                  selectedFeeling={selectedFeeling}
                  onSelectFeeling={setSelectedFeeling}
                  onStart={submitFeeling}
                  onDecideAlone={decideAlone}
                />
              )}
            </div>
          )}
          {!dinnerReady && feedbackOpen && (
            <div className="mt-4 rounded-[24px] border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">Feedback</p>
                  <p className="mt-1 text-sm font-black text-ink">这组为什么不适合今晚？</p>
                </div>
                <button
                  type="button"
                  onClick={onCloseRecommendationFeedback}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-black text-ink/60"
                >
                  关闭
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {recommendationRejectReasons.map((reason) => (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => onSubmitRecommendationFeedback(reason)}
                    className="rounded-full bg-white px-3 py-2 text-xs font-black text-ink transition hover:-translate-y-0.5"
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            className="mt-5 text-xs font-black text-ink/58 underline decoration-ink/20 underline-offset-4 transition hover:text-ink"
          >
            {detailsOpen ? "收起安排依据" : "展开安排依据"}
          </button>
          {detailsOpen && (
            <div className="tonight-detail-panel mt-4 rounded-[24px] border border-line bg-white p-4">
              <div className="flex flex-wrap gap-2">
                <StatusPill icon={Clock3} label="预计" value={`${totalMinutes || 25} 分钟`} />
                <StatusPill icon={ShoppingBasket} label="待买" value={`${purchaseCount} 项`} />
                {!dinnerReady && (
                  <StatusPill icon={Utensils} label="份量" value={`${recommendedRecipes.length} 道 / ${totalRecommendationPortions} 份`} />
                )}
              </div>
              {!dinnerReady && recommendation.missingItems.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-black text-ink/70">
                    适合 {recommendation.familySize ?? familyProfile.familySize ?? 2} 人
                  </span>
                  <span className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-black text-ink/70">
                    {decisionSummary}
                  </span>
                  {recommendation.missingItems.slice(0, 5).map((item) => (
                    <span
                      key={item.name}
                      className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-black text-ink/70"
                    >
                      缺 {item.name}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 max-w-2xl text-xs font-bold leading-5 text-ink/58">
                {dinnerReady
                  ? "今晚菜单已同步进连排计划，采购清单会自动汇总。"
                  : `${recommendation.reason || formatProfileSummary(familyProfile)} ${aiRecommendationStatus}`}
              </p>
              {!dinnerReady && (
                <p className="mt-3 max-w-2xl text-xs font-bold leading-5 text-ink/48">
                  “换一组”走基础规则，不限次数；“精准推荐”才会调用高成本 API，缓存命中不消耗尝鲜额度。
                </p>
              )}
              {!profileReady && (
                <button
                  type="button"
                  onClick={onOpenUserCenter}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-xs font-black text-ink transition hover:-translate-y-0.5"
                >
                  <Sparkles size={15} className="text-white" />
                  设置忌口
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <DinnerLogPanel
        mealLog={mealLog}
        mealLogs={mealLogs}
        onSetDinnerSource={onSetDinnerSource}
        onSetDinnerConfirmation={onSetDinnerConfirmation}
        onQuickDinnerConfirm={onQuickDinnerConfirm}
        onToggleConsumedRecipe={onToggleConsumedRecipe}
        todayRecipes={todayRecipes}
        showConfirmation={dinnerReady}
        dinnerReady={dinnerReady}
        onViewChange={onViewChange}
      />
    </div>
  );
}

function MealRhythmPanel({
  breakfastSummary,
  lunchSummary,
  lunchLog,
  onRecordBreakfast,
  onSetLunchSource,
}) {
  const breakfastNames = breakfastSummary?.recipes?.map((recipe) => recipe.name).join("、");
  const lunchNames = lunchSummary?.recipes?.map((recipe) => recipe.name).join("、");
  const lunchSourceLabels = {
    home: "在家吃",
    delivery: "外卖",
    outside: "外面吃",
    skip: "不记录",
  };
  const lunchSource = lunchLog?.source;
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2">
      <div className="rounded-[20px] border border-line bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">早餐</span>
            <span className="mt-2 block truncate text-sm font-black">
              {breakfastNames || "点一下记早餐"}
            </span>
          </div>
          {breakfastSummary?.count > 0 && (
            <span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-[11px] font-black text-ink/45">已记</span>
          )}
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onRecordBreakfast?.()}
            className="min-h-9 w-full rounded-full bg-ink px-3 text-xs font-black text-white"
          >
            {breakfastSummary?.count > 0 ? "换早餐" : "选早餐吃什么"}
          </button>
        </div>
      </div>

      <div className="rounded-[20px] border border-line bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">午餐</span>
            <span className="mt-2 block truncate text-sm font-black">
              {lunchNames || lunchSourceLabels[lunchSource] || "今天怎么吃"}
            </span>
          </div>
          {lunchSource && (
            <span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-[11px] font-black text-ink/45">
              {lunchSourceLabels[lunchSource]}
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSetLunchSource?.("home")}
            className={`min-h-9 rounded-full px-3 text-xs font-black ${
              lunchSource === "home" ? "bg-ink text-white" : "border border-line bg-canvas text-ink/58"
            }`}
          >
            在家做
          </button>
          <button
            type="button"
            onClick={() => onSetLunchSource?.("delivery")}
            className={`min-h-9 rounded-full px-3 text-xs font-black ${
              lunchSource === "delivery" ? "bg-ink text-white" : "border border-line bg-canvas text-ink/58"
            }`}
          >
            外卖
          </button>
          <button
            type="button"
            onClick={() => onSetLunchSource?.("outside")}
            className={`min-h-9 rounded-full px-3 text-xs font-black ${
              lunchSource === "outside" ? "bg-ink text-white" : "border border-line bg-canvas text-ink/58"
            }`}
          >
            外面吃
          </button>
          <button
            type="button"
            onClick={() => onSetLunchSource?.("skip")}
            className={`min-h-9 rounded-full px-3 text-xs font-black ${
              lunchSource === "skip" ? "bg-ink text-white" : "border border-line bg-canvas text-ink/58"
            }`}
          >
            不记录
          </button>
        </div>
      </div>
    </div>
  );
}

const recommendationRejectReasons = [
  { id: "too_much_work", label: "太麻烦" },
  { id: "family_dislikes", label: "家里没人吃" },
  { id: "hard_to_buy", label: "买不到食材" },
  { id: "wrong_taste", label: "太清淡/太重口" },
  { id: "not_dinner", label: "不像晚饭" },
];

export function DinnerLogPanel({
  mealLog,
  mealLogs = {},
  onSetDinnerSource,
  onSetDinnerConfirmation,
  onQuickDinnerConfirm,
  onToggleConsumedRecipe,
  todayRecipes = [],
  showConfirmation,
  dinnerReady = false,
  onViewChange,
}) {
  const sourceStats = buildSourceStats(mealLogs);
  const sourceResult = getDinnerSourceResult(mealLog?.source, dinnerReady, sourceStats);
  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">晚间轻确认</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">今晚安排了，做了吗？</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            点一下就够了。做了会默认把今晚菜单计入画像；换了也没关系。
          </p>
        </div>
        {mealLog?.confirmation === "all" && (
          <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-black text-white">
            <CheckCircle2 size={15} />
            已计入饮食画像
          </span>
        )}
      </div>
      {showConfirmation && (
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <QuickConfirmButton
            active={mealLog?.confirmation === "all"}
            title="做了"
            text="按今晚菜单计入画像"
            onClick={() => onQuickDinnerConfirm?.("done")}
          />
          <QuickConfirmButton
            active={mealLog?.confirmation === "changed"}
            title="换了别的"
            text="不把原菜单算进去"
            onClick={() => onQuickDinnerConfirm?.("changed")}
          />
          <QuickConfirmButton
            active={mealLog?.source === "outside" || mealLog?.confirmation === "outside"}
            title="出去吃了"
            text="只记录来源"
            onClick={() => onQuickDinnerConfirm?.("outside")}
          />
          <QuickConfirmButton
            active={mealLog?.source === "skip" || mealLog?.confirmation === "skip"}
            title="不记录"
            text="今晚先跳过"
            onClick={() => onQuickDinnerConfirm?.("skip")}
          />
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-black text-ink/38">晚餐来源</p>
          <div className="grid grid-cols-2 gap-2">
            {dinnerSources.map((source) => (
              <ChoiceButton
                key={source.id}
                active={mealLog?.source === source.id}
                label={source.label}
                onClick={() => {
                  onSetDinnerSource(source.id);
                  if (source.id === "home") window.setTimeout(() => onViewChange?.("today"), 160);
                }}
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
      {mealLog?.source === "home" && todayRecipes.length > 0 && (
        <div className="mt-4 rounded-[22px] border border-line bg-canvas p-4">
          <p className="text-xs font-black text-ink/38">今天吃过的菜</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {todayRecipes.map((recipe) => {
              const selectedEntries = mealLog?.consumedEntries ?? todayRecipes.map((item) => ({
                recipeId: item.id,
                quantity: item.menuQuantity ?? 1,
              }));
              const checked = selectedEntries.some((entry) => entry.recipeId === recipe.id);
              return (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => onToggleConsumedRecipe?.(recipe.id)}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-full border px-4 text-left text-sm font-black transition ${
                    checked ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/58"
                  }`}
                >
                  <span className="truncate">{recipe.name}</span>
                  <span className={checked ? "text-white" : "text-ink/35"}>
                    {checked ? "已计入" : "不计入"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-ink/42">
            营养统计只使用这里勾选的菜品和份量，主食加入今晚菜单后也会一起计算。
          </p>
        </div>
      )}
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

function QuickConfirmButton({ active, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[76px] rounded-[18px] border px-4 py-3 text-left transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink hover:border-ink/20"
      }`}
    >
      <span className="block text-base font-black">{title}</span>
      <span className={`mt-1 block text-xs font-bold leading-5 ${active ? "text-white/68" : "text-ink/45"}`}>
        {text}
      </span>
    </button>
  );
}

function getDinnerSourceResult(source, dinnerReady, sourceStats) {
  if (source === "home") {
    return {
      title: dinnerReady ? "今晚安排完成" : "已记录在家做",
      text: dinnerReady
        ? `已同步营养统计。最近在家做 ${sourceStats.home} 次，采购清单已经自动汇总。`
        : "先回【今晚】安排菜单，再继续生成采购清单。",
      actions: dinnerReady
        ? [
            { label: "查看采购清单", view: "grocery", primary: true },
            { label: "开始做饭", view: "today" },
          ]
        : [{ label: "回到今晚", view: "dashboard", primary: true }],
    };
  }
  if (source === "delivery") {
    return {
      title: `今晚记为外卖 · 最近第 ${sourceStats.delivery} 次`,
      text: `${sourceStats.awayStreak >= 2 ? `连续 ${sourceStats.awayStreak} 天在外吃/点外卖。` : "已同步饮食画像。"} 明天建议安排一组清淡在家做菜单，比如番茄鸡蛋类 + 一道绿叶菜。`,
      actions: [
        { label: "回到今晚", view: "dashboard", primary: true },
        { label: "查看饮食画像", view: "stats" },
      ],
    };
  }
  if (source === "outside") {
    return {
      title: `今晚记为外食 · 最近第 ${sourceStats.outside} 次`,
      text: "饮食画像已更新。明天回来打开 Humi，可以直接继续安排一组省时晚饭。",
      actions: [
        { label: "回到今晚", view: "dashboard", primary: true },
        { label: "查看饮食画像", view: "stats" },
      ],
    };
  }
  if (source === "skip") {
    return {
      title: "今天先不记录",
      text: "今晚不会进入饮食画像，也不会影响后续推荐统计。",
      actions: [{ label: "回到今晚", view: "dashboard", primary: true }],
    };
  }
  return null;
}

function buildSourceStats(mealLogs) {
  const logs = Object.entries(mealLogs ?? {})
    .sort(([a], [b]) => a.localeCompare(b));
  const latestSeven = logs.slice(-7).map(([, log]) => log);
  const summary = latestSeven.reduce(
    (current, log) => {
      if (log?.source === "home") current.home += 1;
      if (log?.source === "delivery") current.delivery += 1;
      if (log?.source === "outside") current.outside += 1;
      return current;
    },
    { home: 0, delivery: 0, outside: 0, awayStreak: 0 },
  );
  for (let index = latestSeven.length - 1; index >= 0; index -= 1) {
    const source = latestSeven[index]?.source;
    if (source === "delivery" || source === "outside") summary.awayStreak += 1;
    else if (source) break;
  }
  return summary;
}

function StatusPill({ icon: Icon, label, value }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-xs font-black text-ink/76">
      <Icon size={14} className="text-ink" />
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
      className="flex min-h-12 items-center gap-3 rounded-[18px] bg-canvas px-4 text-left text-sm font-black text-ink/62 transition hover:-translate-y-0.5 hover:bg-ink hover:text-ink"
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

function buildPantryCheckItem({ recipes = [], pantryItems = [], dismissedPantryChecks = {} }) {
  const recipeIngredientNames = new Set(
    recipes.flatMap((recipe) => recipe.ingredients.map((item) => normalizeName(item.name))),
  );
  return pantryItems.find(
    (item) =>
      item?.key &&
      !dismissedPantryChecks[item.key] &&
      getExpiryState(item.expiresOn) !== "expired" &&
      recipeIngredientNames.has(normalizeName(item.name)),
  );
}

function normalizeName(value = "") {
  return value.trim().toLowerCase();
}

function buildDishReason({ recipe, recommendation, craveVoteSummary = [], pantryItems = [], familyProfile = {} }) {
  const matchedFeelings = craveVoteSummary
    .map((item) => item.tag)
    .filter((tag) => tag !== "随便都行" && recipeMatchesFeeling(recipe, tag))
    .slice(0, 2);
  if (matchedFeelings.length > 0) {
    return `照顾到：${matchedFeelings.join(" · ")}`;
  }

  const matchedPantry = pantryItems
    .filter((item) => getExpiryState(item.expiresOn) !== "expired")
    .find((item) => recipe.ingredients.some((ingredient) => normalizeName(ingredient.name) === normalizeName(item.name)));
  if (matchedPantry) {
    return `用上家里现有的 ${matchedPantry.name}，少补一点菜。`;
  }

  if (recommendation?.source === "crave" && Array.isArray(recommendation?.craveVotes)) {
    return formatCraveReason(recommendation.craveVotes);
  }

  const avoidRules = [
    ...(familyProfile.dislikes ?? []),
    ...(familyProfile.allergies ?? []),
  ].filter(Boolean);
  if (avoidRules.length > 0) {
    return `避开：${avoidRules.slice(0, 2).join("、")}。`;
  }

  if (recipe.timeMinutes <= 20) return "快手省事，适合今晚直接开火。";
  if (recipe.categories.includes("汤")) return "补一点汤水，让这顿饭更完整。";
  if (recipe.categories.includes("肉菜") || recipe.categories.includes("蛋类") || recipe.categories.includes("豆制品")) {
    return "补足蛋白，搭配蔬菜会更稳。";
  }
  if (recipe.tags?.some((tag) => ["清淡", "低脂", "清爽"].includes(tag))) {
    return "口味轻一点，适合和下饭菜搭配。";
  }
  return "这道菜和今晚组合不打架，能顺手补齐一顿饭。";
}

function recipeMatchesFeeling(recipe, feelingTag) {
  const categories = new Set(recipe.categories ?? []);
  const tags = new Set(recipe.tags ?? []);
  const haystack = [...categories, ...tags, recipe.name].join(" ");
  if (feelingTag === "辣一点") return /辣|麻婆|鱼香/.test(haystack);
  if (feelingTag === "清淡点") return /清淡|清爽|低脂|汤|蒸|白灼/.test(haystack);
  if (feelingTag === "想喝汤") return categories.has("汤") || /汤|粥/.test(haystack);
  if (feelingTag === "想吃肉") return /肉|鸡|牛|排骨|鱼|虾|蛋/.test(haystack) || categories.has("肉菜");
  if (feelingTag === "想吃素") return categories.has("素菜") || /豆腐|蔬|青菜|西兰花|土豆|茄子/.test(haystack);
  if (feelingTag === "不想动") return recipe.timeMinutes <= 25 || /省时|快手|10分钟|15分钟|20分钟/.test(haystack);
  if (feelingTag === "想暖胃") return /汤|粥|炖|暖|冬瓜|番茄/.test(haystack);
  if (feelingTag === "开胃 / 酸") return /酸|番茄|鱼香|醋|柠檬/.test(haystack);
  return false;
}

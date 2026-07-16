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
import { feelingTags } from "../lib/collaboration";
import { formatProfileSummary, getProfileCompletedCount } from "../lib/profile";
import { mealSlots } from "../lib/mealPlan";
import { getRecipe } from "../lib/recipes";
import { AccountAvatar } from "./AppShell";
import { BreakfastQuickPicker } from "./BreakfastQuickPicker";
import { CraveAudiencePicker } from "./CraveAudiencePicker";
import { DishImage } from "./ui/DishImage";
import { HumiPeek } from "./ui/HumiBrandIllustration";
import { HumiScene } from "./ui/HumiScene";

const dinnerSources = [
  { id: "home", label: "在家做" },
  { id: "delivery", label: "点外卖" },
  { id: "outside", label: "外面吃" },
  { id: "skip", label: "不记录" },
];

const dinnerConfirmations = [
  { id: "all", label: "全部做了" },
  { id: "partial", label: "吃了一部分" },
  { id: "missed", label: "换了别的" },
];

const mealSourceOptions = [
  { id: "home", label: "在家做" },
  { id: "delivery", label: "点外卖" },
  { id: "outside", label: "外面吃" },
  { id: "skip", label: "不记录" },
];

const mealSourceLabels = Object.fromEntries(mealSourceOptions.map((item) => [item.id, item.label]));

export function Dashboard({
  todayRecipes,
  todayMeals = {},
  weekPlan,
  recommendation,
  aiRecommendationStatus,
  aiRecommendationLoading,
  onViewChange,
  onOpenRecipe,
  onAddRecommended,
  onAcceptCraveSelection,
  onRequestAiRecommendation,
  onOpenRecommendationFeedback,
  feedbackOpen,
  onSubmitRecommendationFeedback,
  onCloseRecommendationFeedback,
  onStartCraveRequest,
  activeCraveRequest,
  craveRequestPending,
  craveRequestStatus,
  onShareCraveRequest,
  onRefreshCraveRequest,
  onFinishCraveRequest,
  onRestartCraveRequest,
  cravePanelOpenSignal,
  onConfirmPantryItem,
  pantryItemCount = 0,
  onAddPantryHints,
  onPickForMeal,
  breakfastChoices = [],
  onChooseBreakfast,
  onOpenRecipeLibrary,
  householdMembers = [],
  session,
  onOpenUserCenter,
  familyProfile,
  groceryItemCount = 0,
  mealLog,
  mealLogs,
  onSetDinnerSource,
  onSetMealSource,
  onSetDinnerConfirmation,
  onToggleConsumedRecipe,
  canManageHousehold = true,
}) {
  const [arranging, setArranging] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [craveOpen, setCraveOpen] = useState(false);
  const [mealSourceSlotOpen, setMealSourceSlotOpen] = useState(null);
  const [breakfastPickerOpen, setBreakfastPickerOpen] = useState(false);
  const [selectedFeeling, setSelectedFeeling] = useState("随便都行");
  const [selectedCraveRecipeIds, setSelectedCraveRecipeIds] = useState([]);
  const [selectedCraveAudience, setSelectedCraveAudience] = useState([]);
  const autoFinishedCraveRef = useRef("");
  const profileReady = getProfileCompletedCount(familyProfile) >= 4;
  const dinnerReady = todayRecipes.length > 0;
  const recommendedItems = getRecommendationItems(recommendation);
  const recommendedRecipes = recommendedItems.map((item) => item.recipe);
  const recommendedRecipeIds = recommendedRecipes.map((recipe) => recipe.id).join("|");
  const visibleDinnerItems = dinnerReady
    ? todayRecipes.map((recipe) => ({ recipe, quantity: recipe.menuQuantity ?? 1 }))
    : recommendedItems;
  const heroRecipe = dinnerReady ? todayRecipes[0] : recommendedRecipes[0];
  const activeRecipes = dinnerReady ? todayRecipes : recommendedRecipes;
  const hasStaple = activeRecipes.some((recipe) => recipe.categories.includes("主食") || recipe.tags?.includes("主食"));
  const totalMinutes = activeRecipes.reduce((total, recipe) => total + recipe.timeMinutes, 0);
  const totalRecommendationPortions = recommendedItems.reduce((total, item) => total + item.quantity, 0);
  const todayMealSummaries = mealSlots.map((slot) => {
    const source = mealLog?.mealSources?.[slot.id];
    const recipes = (todayMeals[slot.id] ?? []).map((entry) => getRecipe(entry.recipeId)).filter(Boolean);
    const sourceIsAwayFromHome = Boolean(source && source !== "home");
    const visibleRecipes = sourceIsAwayFromHome ? [] : recipes;
    return {
      ...slot,
      source,
      recipes,
      visibleRecipes,
      count: visibleRecipes.length,
    };
  });
  const mealLabelById = Object.fromEntries(todayMealSummaries.map((slot) => [slot.id, slot.label]));
  function arrangeTonight() {
    setArranging(true);
    onAddRecommended();
    window.setTimeout(() => onViewChange("today"), 520);
  }

  function submitFeeling() {
    onStartCraveRequest?.(selectedFeeling, { audience: selectedCraveAudience });
  }

  useEffect(() => {
    if (cravePanelOpenSignal) setCraveOpen(true);
  }, [cravePanelOpenSignal]);

  useEffect(() => {
    if (activeCraveRequest?.token) setCraveOpen(true);
  }, [activeCraveRequest?.token]);

  useEffect(() => {
    if (!activeCraveRequest || dinnerReady) return;
    setSelectedCraveRecipeIds(recommendedRecipes.map((recipe) => recipe.id));
  }, [activeCraveRequest?.token, activeCraveRequest?.status, dinnerReady, recommendedRecipeIds]);

  useEffect(() => {
    if (!activeCraveRequest || dinnerReady || craveRequestPending || activeCraveRequest.status !== "open") return;
    const deadlineTime = getCraveDeadlineTime(activeCraveRequest);
    if (!deadlineTime) return;
    const autoFinishKey = `${activeCraveRequest.token}:${deadlineTime}`;
    const msUntilDeadline = deadlineTime - Date.now();
    if (msUntilDeadline <= 0) {
      if (autoFinishedCraveRef.current === autoFinishKey) return;
      autoFinishedCraveRef.current = autoFinishKey;
      onFinishCraveRequest?.(activeCraveRequest.starterFeeling || selectedFeeling || "随便都行");
      return;
    }
    const timer = window.setTimeout(() => {
      if (autoFinishedCraveRef.current === autoFinishKey) return;
      autoFinishedCraveRef.current = autoFinishKey;
      onFinishCraveRequest?.(activeCraveRequest.starterFeeling || selectedFeeling || "随便都行");
    }, msUntilDeadline);
    return () => window.clearTimeout(timer);
  }, [
    activeCraveRequest?.token,
    activeCraveRequest?.status,
    activeCraveRequest?.deadlineAt,
    activeCraveRequest?.createdAt,
    activeCraveRequest?.starterFeeling,
    craveRequestPending,
    dinnerReady,
    selectedFeeling,
    onFinishCraveRequest,
  ]);

  const craveMenuReady = Boolean(activeCraveRequest && !dinnerReady && activeCraveRequest.status === "closed");
  const craveVotes = activeCraveRequest?.votes ?? [];
  const pantryConfirmations = !dinnerReady ? (recommendation.matchedPantryItems ?? []).slice(0, 3) : [];
  const craveDeadline = activeCraveRequest
    ? formatCraveDeadline(activeCraveRequest)
    : "约 30 分钟后也可以直接出菜单";

  const purchaseCount = dinnerReady ? groceryItemCount : recommendation.missingItems.length;
  const coreSummary = `适合 ${recommendation.familySize ?? familyProfile.familySize ?? 2} 人 · ${activeRecipes.length} 道 · 预计 ${totalMinutes || 25} 分钟 · 需购买 ${purchaseCount} 项`;
  const decisionSummary = hasStaple ? "已有主食" : "建议补主食";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 overflow-hidden">
      <section data-testid="tonight-hero" className="relative min-w-0 overflow-hidden rounded-[32px] border border-line bg-canvas p-5 text-ink shadow-card md:p-8">
        <div className="absolute left-5 top-5 z-10">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-ink">HUMI</p>
        </div>
        <div className="absolute right-5 top-5 z-30">
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
            <PrimaryDinnerActions
              dinnerReady={dinnerReady}
              craveMenuReady={craveMenuReady}
              aiRecommendationLoading={aiRecommendationLoading}
              onViewChange={onViewChange}
              arrangeTonight={arrangeTonight}
              onRequestAiRecommendation={onRequestAiRecommendation}
              onOpenRecommendationFeedback={onOpenRecommendationFeedback}
              onToggleCrave={() => setCraveOpen((current) => !current)}
              onOpenRecipeLibrary={onOpenRecipeLibrary}
              canManageHousehold={canManageHousehold}
            />
            {!dinnerReady && aiRecommendationStatus && (
              <div className="mt-4 rounded-[20px] border border-line bg-white px-4 py-3 text-xs font-black leading-5 text-ink/58 shadow-card">
                {aiRecommendationStatus}
              </div>
            )}
            </div>
            <div className="justify-self-center md:justify-self-end">
              <HumiScene
                scene={dinnerReady ? "feedbackFull" : aiRecommendationLoading ? "loadingMenu" : "dashboard"}
                size="xl"
                className="shrink-0"
                eager
              />
            </div>
          </div>

          <div className="tonight-card-swap mt-6 grid gap-4 md:mt-8 md:grid-cols-2" key={recommendation.title}>
            {visibleDinnerItems.map(({ recipe, quantity }) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onOpenRecipe(recipe.id)}
                className="rounded-[28px] border border-line bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-ink md:p-6"
              >
                <span className="block text-2xl font-black tracking-[-0.03em]">{recipe.name}</span>
                <span className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink/52">
                    <span>{recipe.timeMinutes} min</span>
                    <span>{recipe.categories[0]}</span>
                    {recipe.categories.includes("主食") && <span>主食</span>}
                    {quantity > 1 && <span className="portion-pop">x{quantity} 份</span>}
                  </span>
              </button>
            ))}
          </div>

          <SecondaryMealStrip
            mealSummaries={todayMealSummaries}
            onPickForMeal={onPickForMeal}
            onOpenBreakfastPicker={() => setBreakfastPickerOpen(true)}
            mealSourceSlotOpen={mealSourceSlotOpen}
            setMealSourceSlotOpen={setMealSourceSlotOpen}
            mealLabelById={mealLabelById}
            mealLog={mealLog}
            onSetMealSource={onSetMealSource}
            canManageHousehold={canManageHousehold}
          />
          {canManageHousehold && pantryConfirmations.length > 0 && (
            <PantryUseConfirmation
              items={pantryConfirmations}
              onConfirm={onConfirmPantryItem}
            />
          )}
          {canManageHousehold && !dinnerReady && pantryItemCount === 0 && (
            <PantryQuickHint onAdd={onAddPantryHints} />
          )}
          {canManageHousehold && !dinnerReady && craveOpen && (
            <div className="relative mt-5 overflow-hidden rounded-[24px] border border-line bg-white p-4 pr-24">
              <HumiPeek
                variant="share-to-family"
                size="md"
                className="absolute right-4 top-4 opacity-90"
                contextKey="dashboard-crave-panel"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">今晚感觉</p>
                  <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">
                    {activeCraveRequest ? "大家点了什么感觉" : "先发一张征集单"}
                  </h3>
                  <p className="mt-1 text-sm font-bold leading-6 text-ink/52">
                    {activeCraveRequest
                      ? "家人点完后回到这里刷新；没人回也可以直接让 Humi 出菜单。"
                      : "家人不用登录，点开卡片只要选一个感觉。没人回也可以按“随便都行”出菜单。"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={submitFeeling}
                  disabled={craveRequestPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-5 text-sm font-black text-ink disabled:opacity-50"
                >
                  {craveRequestPending ? "正在准备" : activeCraveRequest ? "重新发起" : "生成征集单"}
                </button>
              </div>
              {activeCraveRequest ? (
                <div className="mt-4 grid gap-3">
                  <CraveWaitingPanel
                    request={activeCraveRequest}
                    votes={craveVotes}
                    deadlineLabel={craveDeadline}
                  />
                  {craveRequestStatus && <p className="text-xs font-bold leading-5 text-ink/45">{craveRequestStatus}</p>}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={onShareCraveRequest}
                      className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:opacity-50"
                    >
                      分享征集单
                    </button>
                    <button
                      type="button"
                      onClick={onRefreshCraveRequest}
                      disabled={craveRequestPending}
                      className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:opacity-50"
                    >
                      刷新回复
                    </button>
                    <button
                      type="button"
                      onClick={onFinishCraveRequest}
                      disabled={craveRequestPending}
                      className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:opacity-50"
                    >
                      就这些，出菜单
                    </button>
                  </div>
                  {craveMenuReady && (
                    <CraveMenuConfirmation
                      items={recommendedItems}
                      selectedRecipeIds={selectedCraveRecipeIds}
                      onToggle={(recipeId) => {
                        setSelectedCraveRecipeIds((current) =>
                          current.includes(recipeId)
                            ? current.filter((id) => id !== recipeId)
                            : [...current, recipeId],
                        );
                      }}
                      onOpenRecipe={onOpenRecipe}
                      onAccept={() => onAcceptCraveSelection?.(selectedCraveRecipeIds)}
                      onRefresh={() => onRequestAiRecommendation()}
                      onReject={onRestartCraveRequest}
                      onOpenLibrary={onOpenRecipeLibrary}
                      votes={craveVotes}
                      recommendationReason={recommendation.reason}
                      pending={craveRequestPending}
                    />
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  <CraveAudiencePicker
                    members={householdMembers}
                    onChange={setSelectedCraveAudience}
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {feelingTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedFeeling(tag)}
                        className={`min-h-11 rounded-full border px-3 text-sm font-black transition ${
                          selectedFeeling === tag
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-white text-ink hover:border-ink/30"
                        } ${tag === "随便都行" ? "col-span-2 sm:col-span-3" : ""}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onFinishCraveRequest?.(selectedFeeling);
                      setCraveOpen(false);
                    }}
                    disabled={craveRequestPending}
                    className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:opacity-50"
                  >
                    我自己做主，直接出菜单
                  </button>
                </div>
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
                  ? "今晚菜单已同步进本周计划，采购清单会自动汇总。"
                  : `${recommendation.reason || formatProfileSummary(familyProfile)} ${aiRecommendationStatus}`}
              </p>
              {canManageHousehold && !profileReady && (
                <button
                  type="button"
                  onClick={onOpenUserCenter}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-xs font-black text-ink transition hover:-translate-y-0.5"
                >
                  <Sparkles size={15} className="text-white" />
                  设置饮食偏好
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
        onToggleConsumedRecipe={onToggleConsumedRecipe}
        todayRecipes={todayRecipes}
        showConfirmation={dinnerReady}
        dinnerReady={dinnerReady}
        onViewChange={onViewChange}
        canManageHousehold={canManageHousehold}
      />
      <BreakfastQuickPicker
        open={breakfastPickerOpen}
        recipes={breakfastChoices}
        selectedRecipeIds={(todayMeals.breakfast ?? []).map((entry) => entry.recipeId)}
        onSelect={(recipeId) => {
          onChooseBreakfast?.(recipeId);
          setBreakfastPickerOpen(false);
        }}
        onBrowseAll={() => {
          setBreakfastPickerOpen(false);
          onPickForMeal?.("breakfast", "早餐");
        }}
        onClose={() => setBreakfastPickerOpen(false)}
      />
    </div>
  );
}

function PrimaryDinnerActions({
  dinnerReady,
  craveMenuReady,
  aiRecommendationLoading,
  onViewChange,
  arrangeTonight,
  onRequestAiRecommendation,
  onOpenRecommendationFeedback,
  onToggleCrave,
  onOpenRecipeLibrary,
  canManageHousehold,
}) {
  const showPrimaryDinnerAction = dinnerReady || !craveMenuReady;
  return (
    <div className="mt-5 grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      {showPrimaryDinnerAction && (
        <button
          type="button"
          data-testid="tonight-primary-action"
          onClick={dinnerReady ? () => onViewChange("today") : arrangeTonight}
          disabled={!canManageHousehold && !dinnerReady}
          className="tonight-arrange-button col-span-2 inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-black text-white transition hover:-translate-y-1 sm:col-span-1 sm:px-7"
        >
          {dinnerReady ? <CheckCircle2 size={19} /> : <Utensils size={19} />}
          {dinnerReady ? "查看今晚菜单" : canManageHousehold ? "今晚就做" : "等主厨安排"}
        </button>
      )}
      {(canManageHousehold || dinnerReady) && <button
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
      </button>}
      {canManageHousehold && !dinnerReady && (
        <button
          type="button"
          onClick={onOpenRecommendationFeedback}
          className="inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-transparent px-4 text-sm font-black text-ink transition hover:-translate-y-1 sm:px-7 sm:text-base"
        >
          不想吃
        </button>
      )}
      {canManageHousehold && !dinnerReady && (
        <button
          type="button"
          onClick={onToggleCrave}
          className="col-span-2 inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-transparent px-4 text-sm font-black text-ink transition hover:-translate-y-1 sm:col-span-1 sm:px-7 sm:text-base"
        >
          <MessageCircleHeart size={18} />
          问问大家想吃啥
        </button>
      )}
      <button
        type="button"
        data-testid="dashboard-library-entry"
        onClick={onOpenRecipeLibrary}
        className="col-span-2 inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink transition hover:-translate-y-1 sm:col-span-1 sm:px-7 sm:text-base"
      >
        <Sparkles size={18} />
        <span data-testid="dashboard-library-entry-label">全部菜品库</span>
      </button>
    </div>
  );
}

function SecondaryMealStrip({
  mealSummaries,
  onPickForMeal,
  onOpenBreakfastPicker,
  mealSourceSlotOpen,
  setMealSourceSlotOpen,
  mealLabelById,
  mealLog,
  onSetMealSource,
  canManageHousehold,
}) {
  return (
    <section data-testid="meal-rhythm-panel" className="mt-5 rounded-[24px] border border-line bg-white/72 p-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">早午餐轻记录</p>
        <span className="text-xs font-bold text-ink/42">不催，不默认写入</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {mealSummaries.filter((slot) => slot.id !== "dinner").map((slot) => {
          const source = slot.source;
          const shouldPickDirectly = slot.id === "breakfast" && slot.count === 0 && (!source || source === "home");
          const MealSummaryElement = canManageHousehold ? "button" : "div";
          return (
            <MealSummaryElement
              key={slot.id}
              type={canManageHousehold ? "button" : undefined}
              onClick={canManageHousehold ? () => {
                if (shouldPickDirectly) {
                  onOpenBreakfastPicker?.();
                  return;
                }
                setMealSourceSlotOpen((current) => (current === slot.id ? null : slot.id));
              } : undefined}
              className="rounded-[20px] border border-line bg-white p-3 text-left transition hover:border-ink/30"
            >
              <span className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{slot.label}</span>
              <span className="mt-2 block truncate text-sm font-black">
                {slot.count > 0
                  ? slot.visibleRecipes.map((recipe) => recipe.name).join("、")
                      : source === "home"
                        ? "在家做 · 去选菜"
                        : source
                          ? mealSourceLabels[source] ?? "已记录"
                          : slot.id === "breakfast" ? "选早餐吃什么" : "记录午餐来源"}
              </span>
            </MealSummaryElement>
          );
        })}
      </div>
      {canManageHousehold && mealSourceSlotOpen && (
        <MealSourcePanel
          slotLabel={mealLabelById[mealSourceSlotOpen] ?? "这一餐"}
          source={mealLog?.mealSources?.[mealSourceSlotOpen]}
          onSetSource={(source) => onSetMealSource?.(mealSourceSlotOpen, source)}
          onPickMeal={() => onPickForMeal?.(mealSourceSlotOpen)}
        />
      )}
    </section>
  );
}

function PantryUseConfirmation({ items, onConfirm }) {
  return (
    <section className="mt-4 rounded-[22px] border border-line bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">顺手确认</p>
          <h3 className="mt-1 text-lg font-black tracking-[-0.03em]">这几样家里还在吗？</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            只在推荐用到时问一下；不准也没关系，点“没了”就会回到清单里。
          </p>
        </div>
        <span className="w-fit rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/54">
          {items.length} 项
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((name) => (
          <div key={name} className="flex items-center justify-between gap-3 rounded-[18px] bg-canvas px-3 py-3">
            <span className="min-w-0 truncate text-sm font-black">{name}</span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onConfirm?.(name, true)}
                className="min-h-9 rounded-full bg-ink px-3 text-xs font-black text-white"
              >
                有
              </button>
              <button
                type="button"
                onClick={() => onConfirm?.(name, false)}
                className="min-h-9 rounded-full border border-line bg-white px-3 text-xs font-black text-ink/58"
              >
                没了
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PantryQuickHint({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  function submit(event) {
    event.preventDefault();
    const addedCount = onAdd?.(value) ?? 0;
    if (addedCount > 0) {
      setValue("");
      setOpen(false);
    }
  }

  return (
    <div className="mt-3 px-1">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-ink/56 underline decoration-ink/24 underline-offset-4 transition hover:text-ink"
        >
          <ShoppingBasket size={16} />
          想更准？告诉我家里有啥
        </button>
      ) : (
        <form className="flex flex-col gap-2 rounded-[20px] border border-line bg-white p-3 sm:flex-row" onSubmit={submit}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">家里现有食材</span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="min-h-11 w-full rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
              placeholder="比如：豆腐、鸡蛋"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-full bg-ink px-5 text-sm font-black text-white sm:flex-none">
              记住
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 flex-1 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/56 sm:flex-none">
              跳过
            </button>
          </div>
        </form>
      )}
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

function getCraveDeadlineTime(request = {}) {
  const explicitDeadlineTime = new Date(request.deadlineAt).getTime();
  if (Number.isFinite(explicitDeadlineTime)) return explicitDeadlineTime;
  const createdTime = new Date(request.createdAt).getTime();
  if (!Number.isFinite(createdTime)) return null;
  return createdTime + 30 * 60 * 1000;
}

function formatCraveDeadline(request = {}) {
  const deadlineTime = getCraveDeadlineTime(request);
  if (!deadlineTime) return "约 30 分钟后也可以直接出菜单";
  const minutesLeft = Math.ceil((deadlineTime - Date.now()) / 60000);
  if (minutesLeft <= 0) return "等待时间到了，正在出菜单";
  return `约 ${minutesLeft} 分钟后自动出菜单`;
}

function getVoteInitial(vote = {}) {
  const name = String(vote.memberName || "家人").trim();
  return name.slice(0, 1) || "家";
}

function formatAudienceLabel(request = {}) {
  const names = Array.isArray(request.targetParticipantNames) && request.targetParticipantNames.length > 0
    ? request.targetParticipantNames
    : Array.isArray(request.audience)
      ? request.audience.map((person) => person?.name).filter(Boolean)
      : [];
  return names.length > 0 ? names.join("、") : "家人";
}

function buildCraveDishReason(recipe, votes = [], fallbackReason = "") {
  const voteHits = votes
    .map((vote) => matchVoteToRecipe(vote, recipe))
    .filter(Boolean)
    .slice(0, 2);
  if (voteHits.length > 0) return `为什么推它：${voteHits.join(" · ")}`;
  if (fallbackReason) return `为什么推它：${fallbackReason.split("。")[0]}。`;
  if (recipe.timeMinutes <= 25) return "为什么推它：做起来快，适合今晚少折腾。";
  return `为什么推它：${recipe.categories[0]}能补上这一餐的搭配。`;
}

function matchVoteToRecipe(vote = {}, recipe) {
  const name = vote.memberName || "家人";
  const feeling = vote.feelingTag || "随便都行";
  const dishWish = String(vote.dishWish || "").trim();
  if (dishWish && recipe.name.includes(dishWish)) return `${name}提到${dishWish}`;
  if (dishWish && dishWish.length >= 2 && recipe.description?.includes(dishWish)) return `${name}提到${dishWish}`;
  if (feeling === "想喝汤" && recipe.categories.includes("汤")) return `${name}想喝汤`;
  if (feeling === "想吃肉" && (recipe.categories.includes("肉菜") || recipe.tags?.includes("肉菜"))) return `${name}想吃肉`;
  if (feeling === "想吃素" && recipe.categories.includes("素菜")) return `${name}想吃素`;
  if (feeling === "不想动" && recipe.timeMinutes <= 25) return `${name}想省事`;
  if (feeling === "清淡点" && (recipe.tags?.includes("清淡") || recipe.categories.includes("汤") || recipe.categories.includes("素菜"))) return `${name}想清淡点`;
  if (feeling === "辣一点" && (recipe.tags?.includes("微辣") || recipe.tags?.includes("辣") || recipe.name.includes("辣") || recipe.name.includes("麻婆"))) return `${name}想辣一点`;
  if (feeling === "想暖胃" && (recipe.categories.includes("汤") || recipe.tags?.includes("暖胃") || recipe.name.includes("汤"))) return `${name}想暖胃`;
  if (feeling === "开胃 / 酸" && (recipe.tags?.includes("酸") || recipe.name.includes("酸") || recipe.name.includes("番茄") || recipe.name.includes("西红柿"))) return `${name}想开胃`;
  if (feeling === "随便都行") return `${name}随便都行，选这道稳妥`;
  return "";
}

function MealSourcePanel({ slotLabel, source, onSetSource, onPickMeal }) {
  return (
    <section className="mt-3 rounded-[22px] border border-line bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">{slotLabel}来源</p>
          <h4 className="mt-1 text-lg font-black tracking-[-0.03em]">在家做就先去选菜</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            Humi 不会替你默认写入某一道菜；点在家做会进入完整菜品库，由你选择。
          </p>
        </div>
        {source && (
          <span className="w-fit rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/58">
            已记：{mealSourceLabels[source] ?? "已记录"}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {mealSourceOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "home") {
                onPickMeal?.();
                return;
              }
              onSetSource(item.id);
            }}
            className={`min-h-10 rounded-full border px-3 text-xs font-black transition ${
              source === item.id
                ? "border-ink bg-ink text-white"
                : "border-line bg-canvas text-ink/58 hover:border-ink/20 hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {source === "home" && (
        <button
          type="button"
          onClick={onPickMeal}
          className="mt-3 min-h-11 w-full rounded-full bg-ink px-4 text-sm font-black text-white"
        >
          在家做，去选{slotLabel}菜
        </button>
      )}
    </section>
  );
}

function CraveWaitingPanel({ request, votes = [], deadlineLabel }) {
  const hasVotes = votes.length > 0;
  const audienceLabel = formatAudienceLabel(request);
  return (
    <section className="rounded-[22px] border border-line bg-canvas p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">
            {request.status === "closed" ? "征集已结束" : "等大家回复"}
          </p>
          <h4 className="mt-1 text-lg font-black tracking-[-0.03em]">
            {hasVotes ? `收到 ${votes.length} 个感觉` : "征集单已经准备好"}
          </h4>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            {request.status === "closed"
              ? "Humi 会照顾这些回复来安排菜单；你还可以去掉不想做的菜。"
              : "家人点完会出现在这里；没人回复也可以随时让 Humi 出菜单。"}
          </p>
          <p className="mt-1 text-xs font-black text-ink/38">目标家人：{audienceLabel}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/54">
          <Clock3 size={13} />
          {deadlineLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {hasVotes ? (
          votes.map((vote) => (
            <div key={vote.id || vote.participantKey || vote.createdAt || vote.memberName} className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-3 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-black text-white">
                  {getVoteInitial(vote)}
                </span>
                <span className="min-w-0 truncate text-sm font-black">{vote.memberName || "家人"}</span>
              </div>
              <span className="shrink-0 rounded-full bg-canvas px-3 py-2 text-xs font-black text-ink/62">
                {vote.dishWish ? `${vote.feelingTag || "随便都行"} · ${vote.dishWish}` : vote.feelingTag || "随便都行"}
              </span>
            </div>
          ))
        ) : (
          <div className="rounded-[18px] bg-white px-4 py-3 text-sm font-bold leading-6 text-ink/52">
            分享出去以后，家人免登录点一个感觉；你回到这里刷新就能看到。
          </div>
        )}
      </div>
    </section>
  );
}

function CraveMenuConfirmation({
  items,
  selectedRecipeIds,
  onToggle,
  onOpenRecipe,
  onAccept,
  onRefresh,
  onReject,
  onOpenLibrary,
  votes = [],
  recommendationReason = "",
  pending,
}) {
  const selectedCount = selectedRecipeIds.length;
  return (
    <section className="rounded-[22px] border border-line bg-canvas p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">确认菜单</p>
          <h4 className="mt-1 text-lg font-black tracking-[-0.03em]">Humi 照着大家的回复安排了这组</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            勾中就是今晚要做的菜；确认后会自动进入今晚菜单和买菜清单。
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/62">
          已选 {selectedCount}/{items.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map(({ recipe, quantity }) => {
          const selected = selectedRecipeIds.includes(recipe.id);
          const dishReason = buildCraveDishReason(recipe, votes, recommendationReason);
          return (
            <article
              key={recipe.id}
              className={`grid grid-cols-[64px_1fr] gap-3 rounded-[18px] border p-2 transition ${
                selected ? "border-ink bg-white" : "border-line bg-white/58"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenRecipe?.(recipe.id)}
                className="overflow-hidden rounded-[14px] bg-canvas"
                aria-label={`查看 ${recipe.name}`}
              >
                <DishImage recipe={recipe} variant="thumb" alt="" className="h-16 w-full object-cover" />
              </button>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenRecipe?.(recipe.id)}
                  className="block w-full truncate text-left text-sm font-black"
                >
                  {recipe.name}
                </button>
                <p className="mt-1 truncate text-xs font-bold text-ink/45">
                  {recipe.categories[0]} · {recipe.timeMinutes} min{quantity > 1 ? ` · ${quantity} 份` : ""}
                </p>
                <p className="mt-2 rounded-[14px] bg-canvas px-3 py-2 text-xs font-bold leading-5 text-ink/58">
                  {dishReason}
                </p>
                <button
                  type="button"
                  onClick={() => onToggle(recipe.id)}
                  className={`mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-full border px-3 text-xs font-black transition ${
                    selected ? "border-ink bg-white text-ink" : "border-line bg-canvas text-ink/58"
                  }`}
                >
                  {selected ? "已选这道" : "这道先不做"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={pending || selectedCount === 0}
          className="min-h-11 rounded-full bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          就做这些
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={pending}
          className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          换一组
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          className="min-h-11 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-1"
        >
          都不想吃，重选感觉
        </button>
        <button
          type="button"
          onClick={() => onOpenLibrary?.()}
          disabled={pending}
          className="min-h-11 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-1"
        >
          我自己挑
        </button>
      </div>
    </section>
  );
}

export function DinnerLogPanel({
  mealLog,
  mealLogs = {},
  onSetDinnerSource,
  onSetDinnerConfirmation,
  onToggleConsumedRecipe,
  todayRecipes = [],
  showConfirmation,
  dinnerReady = false,
  onViewChange,
  canManageHousehold = true,
}) {
  const sourceStats = buildSourceStats(mealLogs);
  const sourceResult = getDinnerSourceResult(mealLog?.source, dinnerReady, sourceStats);
  const arrangedDishNames = todayRecipes.map((recipe) => recipe.name).join("、");
  const title = dinnerReady && arrangedDishNames
    ? `今晚安排了${arrangedDishNames}，做了吗？`
    : "今天这顿从哪里来";
  const helperText = dinnerReady
    ? "点一下就够了。Humi 会记住今晚最后吃了什么；换了或出去吃也没关系。"
    : "没安排晚饭也可以顺手记一下从哪里吃；不想记就跳过。";

  if (!canManageHousehold) {
    return (
      <section data-testid="dinner-log-readonly" className="rounded-[28px] border border-line bg-white p-5 shadow-card">
        <p className="eyebrow">晚间轻确认</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">{title}</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
          {dinnerReady ? "主厨安排后，家人可以在这里查看今晚记录。" : "主厨还没有记录这顿晚饭。"}
        </p>
      </section>
    );
  }

  function quickConfirm(action) {
    if (action === "done") {
      onSetDinnerSource?.("home");
      onSetDinnerConfirmation?.("all");
      return;
    }
    if (action === "changed") {
      onSetDinnerSource?.("home");
      onSetDinnerConfirmation?.("missed");
      return;
    }
    if (action === "outside") {
      onSetDinnerSource?.("outside");
      return;
    }
    if (action === "skip") {
      onSetDinnerSource?.("skip");
    }
  }

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">晚间轻确认</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">{title}</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {helperText}
          </p>
        </div>
        {mealLog?.confirmation === "all" && (
          <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-black text-white">
            <CheckCircle2 size={15} />
            已记下今晚吃了什么
          </span>
        )}
      </div>
      {dinnerReady && (
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <ChoiceButton
            active={mealLog?.source === "home" && mealLog?.confirmation === "all"}
            label="做了"
            onClick={() => quickConfirm("done")}
          />
          <ChoiceButton
            active={mealLog?.source === "home" && mealLog?.confirmation === "missed"}
            label="换了别的"
            onClick={() => quickConfirm("changed")}
          />
          <ChoiceButton
            active={mealLog?.source === "outside"}
            label="出去吃了"
            onClick={() => quickConfirm("outside")}
          />
          <ChoiceButton
            active={mealLog?.source === "skip"}
            label="不记录"
            onClick={() => quickConfirm("skip")}
          />
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-black text-ink/38">{dinnerReady ? "细调来源" : "晚餐来源"}</p>
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
            <p className="mb-2 text-xs font-black text-ink/38">菜单完成情况</p>
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

function getDinnerSourceResult(source, dinnerReady, sourceStats) {
  if (source === "home") {
    return {
      title: dinnerReady ? "今晚安排完成" : "已记录在家做",
      text: dinnerReady
        ? `已同步营养统计。本周在家做 ${sourceStats.home} 次，采购清单已经自动汇总。`
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
      title: `今晚记为外卖 · 本周第 ${sourceStats.delivery} 次`,
      text: `${sourceStats.awayStreak >= 2 ? `连续 ${sourceStats.awayStreak} 天在外吃或点外卖。` : "已经记下今晚吃了什么。"} 明天可以安排一组清淡的家常菜，比如番茄鸡蛋配一道绿叶菜。`,
      actions: [
        { label: "返回首页", view: "dashboard", primary: true },
        { label: "看看吃饭习惯", view: "stats" },
      ],
    };
  }
  if (source === "outside") {
    return {
      title: `今晚记为外食 · 本周第 ${sourceStats.outside} 次`,
      text: "已经记下今晚在外面吃。明天打开 Humi，可以继续安排一组省时晚饭。",
      actions: [
        { label: "返回首页", view: "dashboard", primary: true },
        { label: "看看吃饭习惯", view: "stats" },
      ],
    };
  }
  if (source === "skip") {
    return {
      title: "今天先不记录",
      text: "今晚不会留下记录，也不会影响之后的推荐。",
      actions: [{ label: "返回首页", view: "dashboard", primary: true }],
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
      className="flex min-h-12 items-center gap-3 rounded-[18px] border border-line bg-white px-4 text-left text-sm font-black text-ink/62 transition hover:-translate-y-0.5 hover:border-ink hover:bg-ink hover:text-white"
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

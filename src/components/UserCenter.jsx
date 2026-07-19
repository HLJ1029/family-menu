import { useState } from "react";
import { BarChart3, Check, ChefHat, Cloud, Heart, LogOut, MessageCircleHeart, Phone, Plus, Share2, ShieldAlert, ShoppingBasket, SlidersHorizontal, Sparkles, UserRound, Users } from "lucide-react";
import { feelingTags } from "../lib/collaboration";
import { getDefaultNutritionGoals, normalizeNutritionGoals } from "../lib/insights";
import { formatHardProfileSummary, profileOptions } from "../lib/profile";
import { getRecipe } from "../lib/recipes";
import { buildValidationSummary, readValidationEvents } from "../lib/validationEvents";
import { CloudSyncPanel } from "./system/CloudSyncPanel";
import { CraveAudiencePicker } from "./CraveAudiencePicker";
import { Card } from "./ui/Card";
import { HumiPeek } from "./ui/HumiBrandIllustration";
import { HumiScene } from "./ui/HumiScene";
import { isWechatLoginEnabled, isWechatMiniProgramWebView } from "../lib/runtime";
import { requestPhoneBindFromMiniProgram } from "../lib/humiIdentity";

export function UserCenter({
  authProps,
  cloudMenuProps,
  session,
  humiSession,
  family,
  households = [],
  familyProfile,
  setFamilyProfile,
  mealLogs = {},
  nutritionGoals,
  setNutritionGoals,
  recommendationFeedback = [],
  aiRecommendationStatus = "",
  preciseRecommendationAvailable = false,
  craveSignals = [],
  wishPool = [],
  activeCraveRequest,
  craveRequestPending = false,
  activeGroceryShareRequest,
  groceryClaims: persistedGroceryClaims = {},
  activeWishShareRequest,
  pendingJoinContext,
  onClearPendingJoinContext,
  householdMembers = [],
  activeHouseholdInvite,
  onCreateHousehold,
  onSwitchHousehold,
  onCreateHouseholdInvite,
  onShareHouseholdInvite,
  onAcceptPendingJoin,
  onPlanWish,
  onRemoveWish,
  onExportValidationData,
  onViewChange,
  onOpenRecipeLibrary,
  onAskFamily,
  onStartCraveRequest,
  onShareCraveRequest,
  onRefreshCraveRequest,
  onFinishCraveRequest,
  onRefreshGroceryShare,
  onStartWishShare,
  onShareWishRequest,
  onRefreshWishShare,
  canManageHousehold = true,
  currentMemberId = "",
}) {
  const isWechatMiniProgram = isWechatMiniProgramWebView();
  const wechatLoginEnabled = isWechatLoginEnabled();
  const signedIn = Boolean(humiSession?.user?.profileStatus === "complete");
  const signOutLabel = humiSession ? "退出并重新验证微信登录" : "退出账号";
  const [activeSettings, setActiveSettings] = useState(null);
  const [phoneBindStatus, setPhoneBindStatus] = useState("");
  const [craveComposerOpen, setCraveComposerOpen] = useState(false);
  const [selectedCraveFeeling, setSelectedCraveFeeling] = useState("随便都行");
  const [selectedCraveAudience, setSelectedCraveAudience] = useState([]);
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const phoneVerified = Boolean(humiSession?.user?.phoneVerified);
  const phoneMasked = humiSession?.user?.phoneMasked;
  const sourceSummary = Object.values(mealLogs).reduce(
    (summary, log) => {
      if (log?.source === "home") summary.home += 1;
      if (log?.source === "delivery") summary.delivery += 1;
      if (log?.source === "outside") summary.outside += 1;
      if (log?.confirmation === "all") summary.confirmed += 1;
      if (log?.mealSources?.breakfast && log.mealSources.breakfast !== "skip") summary.breakfast += 1;
      if (log?.mealSources?.lunch && log.mealSources.lunch !== "skip") summary.lunch += 1;
      return summary;
    },
    { home: 0, delivery: 0, outside: 0, confirmed: 0, breakfast: 0, lunch: 0 },
  );
  const validationSummary = buildValidationSummary(readValidationEvents());
  const tasteReflections = buildTasteReflections({
    craveSignals,
    wishPool,
    mealLogs,
    recommendationFeedback,
  });
  const familyPortraitDigest = buildFamilyPortraitDigest({
    tasteReflections,
    sourceSummary,
    activeCraveVotes: activeCraveRequest?.votes ?? [],
    groceryClaims: activeGroceryShareRequest?.claims ?? [],
    wishPool,
    recommendationFeedback,
    validationSummary,
  });
  const experienceTierDigest = buildExperienceTierDigest({
    signedIn,
    humiSession,
    preciseRecommendationAvailable,
    aiRecommendationStatus,
  });
  const activeCraveVotes = activeCraveRequest?.votes ?? [];
  const groceryClaims = mergeGroceryClaims(activeGroceryShareRequest?.claims, persistedGroceryClaims);
  const groceryItems = activeGroceryShareRequest?.items ?? [];
  const wishShareWishes = activeWishShareRequest?.wishes ?? [];
  const householdParticipants = buildHouseholdParticipants({
    session,
    humiSession,
    signedIn,
    activeCraveRequest,
    activeGroceryShareRequest,
    activeWishShareRequest,
    pendingJoinContext,
    householdMembers,
    craveSignals,
  });
  const checkedGroceryItems = groceryItems.filter((item) => item.checked).length;
  const declinedGroceryClaims = groceryClaims.filter((claim) => claim.status === "declined").length;
  const claimedGroceryClaims = groceryClaims.filter((claim) => claim.status === "claimed").length;
  const checkedGroceryNames = groceryItems.filter((item) => item.checked).map((item) => item.name);
  const pendingGroceryNames = groceryItems.filter((item) => !item.checked).map((item) => item.name);
  const homeHero = buildHomeHeroState({
    signedIn,
    family,
    pendingJoinContext,
    activeCraveVotes,
    groceryItems,
    checkedGroceryItems,
    claimedGroceryClaims,
    declinedGroceryClaims,
    wishPool,
    wishShareWishes,
    sourceSummary,
    householdParticipants,
  });
  const familyPulseRows = buildFamilyPulseRows({
    tasteReflections,
    sourceSummary,
    activeCraveVotes,
    groceryClaims,
    wishPool,
    householdParticipants,
  });
  const familyActivity = [
    ...buildActiveCraveActivities(activeCraveRequest),
    ...groceryClaims.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.status === "claimed"
        ? item.itemName
          ? `${item.memberName || "家人"}在买 ${item.itemName}`
          : `${item.memberName || "家人"}来买 ${Array.isArray(item.itemIds) && item.itemIds.length > 0 ? `${item.itemIds.length} 项` : "菜"}`
        : `${item.memberName || "家人"}暂时买不了`,
      meta: formatGroceryClaimMeta(activeGroceryShareRequest, item),
    })),
    ...(activeWishShareRequest?.wishes ?? []).slice(0, 3).map((item) => ({
      id: item.id,
      title: `${item.memberName || "家人"}想吃：${item.dishName || "一道菜"}`,
      meta: item.note ? `最近想吃 · ${item.note}` : "家人写下的想吃",
    })),
    ...buildMealLogActivities(mealLogs),
    ...craveSignals.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.feelingTag === "随便都行" ? "有人说随便都行" : `有人想要：${item.feelingTag}`,
      meta: "问问大家",
    })),
    ...recommendationFeedback.slice(0, 2).map((item) => ({
      id: item.id,
      title: `不想吃：${item.reasonLabel}`,
      meta: "晚饭反馈",
    })),
    ...wishPool.slice(0, 2).map((item) => ({
      id: item.id,
      title: `想吃：${item.name}`,
      meta: item.source ? `最近想吃 · ${item.source}` : "最近想吃",
    })),
  ].slice(0, 5);

  function handleBindPhone() {
    if (!isWechatMiniProgram || !humiSession) {
      setPhoneBindStatus("手机号绑定只在微信小程序内通过用户主动授权完成。");
      return;
    }
    if (requestPhoneBindFromMiniProgram()) {
      setPhoneBindStatus("正在唤起微信手机号授权。拒绝授权也不影响继续使用 Humi。");
      return;
    }
    setPhoneBindStatus("当前环境暂时无法唤起手机号授权，请在微信小程序内重试。");
  }

  function openCraveComposer() {
    setCraveComposerOpen(true);
  }

  function startCraveFromHome() {
    setCraveComposerOpen(true);
    onStartCraveRequest?.(selectedCraveFeeling, { audience: selectedCraveAudience });
  }

  async function finishCraveFromHome(feeling = selectedCraveFeeling) {
    await onFinishCraveRequest?.(feeling);
    setCraveComposerOpen(false);
    onViewChange("dashboard");
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
      <div className="grid gap-5">
        <section className="grid gap-4 overflow-hidden rounded-[28px] border border-line bg-white p-5 text-ink shadow-card md:grid-cols-[1fr_250px] md:items-center md:p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-ink/42">我的家</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.04em] sm:text-4xl md:text-6xl">
              {homeHero.title}
            </h2>
            <p className="mt-3 max-w-xl text-sm font-bold leading-7 text-ink/58">
              {homeHero.subtitle}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {homeHero.stats.map((item) => (
                <div key={item.label} className="rounded-[16px] bg-canvas p-2 sm:p-3">
                  <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-ink/38 sm:text-[11px]">{item.label}</p>
                  <p className="mt-1 truncate text-sm font-black text-ink sm:text-base">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {canManageHousehold && <button
                type="button"
                onClick={openCraveComposer}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/18 bg-canvas px-5 text-sm font-black text-ink"
              >
                问问大家
              </button>}
              <button
                type="button"
                onClick={() => onViewChange("dashboard")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/18 bg-white px-5 text-sm font-black text-ink"
              >
                {canManageHousehold ? "继续安排今晚" : "查看今晚安排"}
              </button>
            </div>
          </div>
          <HumiScene scene="user" size="page" className="mx-auto" eager />
        </section>

        {pendingJoinContext?.type && (
          <PendingJoinCard
            context={pendingJoinContext}
            signedIn={signedIn}
            onClear={onClearPendingJoinContext}
            onAccept={onAcceptPendingJoin}
          />
        )}
        <section className="rounded-[24px] border border-line bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">今晚一起商量</p>
              <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">家里现在有什么动静</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/48">
                {familyPortraitDigest.evidenceCount > 0
                  ? `已经记下 ${familyPortraitDigest.evidenceCount} 次选择，今晚会${familyPortraitDigest.nextMove}`
                  : "还没有新消息，先问问大家今晚想吃什么"}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <HomeActionTile
              label="今晚想吃什么"
              value={activeCraveRequest?.token ? `${activeCraveVotes.length} 个回复` : "还没问大家"}
              actionLabel={activeCraveRequest?.token ? "看看新回复" : canManageHousehold ? "去问问" : "等主厨发起"}
              onClick={activeCraveRequest?.token ? onRefreshCraveRequest : canManageHousehold ? openCraveComposer : undefined}
              disabled={!activeCraveRequest?.token && !canManageHousehold}
            />
            <HomeActionTile
              label="买菜进度"
              value={activeGroceryShareRequest?.token ? `已买 ${checkedGroceryItems}/${groceryItems.length}` : "还没有共享清单"}
              actionLabel={activeGroceryShareRequest?.token ? "看看进度" : "打开清单"}
              onClick={activeGroceryShareRequest?.token ? onRefreshGroceryShare : () => onViewChange("grocery")}
            />
            <HomeActionTile
              label="最近想吃"
              value={activeWishShareRequest?.token ? `${wishShareWishes.length} 个想吃` : `${wishPool.length} 道`}
              actionLabel={activeWishShareRequest?.token ? "看看新想法" : canManageHousehold ? "问问家人" : "去添加"}
              onClick={activeWishShareRequest?.token ? onRefreshWishShare : canManageHousehold ? onStartWishShare : onOpenRecipeLibrary}
            />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onViewChange("dashboard")}
              className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-line bg-canvas px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-ink/35">Humi 记住了什么</span>
                <span className="mt-1 block truncate text-sm font-black text-ink">
                  {familyPortraitDigest.evidenceCount > 0
                    ? `${familyPortraitDigest.evidenceCount} 次选择 · 下一顿${familyPortraitDigest.nextMove}`
                    : "还没有记录，先安排今晚"}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/58">
                用它安排
              </span>
            </button>
            <button
              type="button"
              onClick={onOpenRecipeLibrary}
              className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-line bg-canvas px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-ink/35">全部菜品库</span>
                <span className="mt-1 block truncate text-sm font-black text-ink">推荐外的完整菜品库</span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/58">去挑</span>
            </button>
          </div>
        </section>
        {canManageHousehold && craveComposerOpen && (
          <FamilyCraveComposer
            activeRequest={activeCraveRequest}
            votes={activeCraveVotes}
            pending={craveRequestPending}
            selectedFeeling={selectedCraveFeeling}
            onSelectFeeling={setSelectedCraveFeeling}
            audienceMembers={householdMembers}
            onAudienceChange={setSelectedCraveAudience}
            onStart={startCraveFromHome}
            onShare={onShareCraveRequest}
            onRefresh={onRefreshCraveRequest}
            onFinish={finishCraveFromHome}
            onClose={() => setCraveComposerOpen(false)}
          />
        )}
        {activeGroceryShareRequest?.token && (
          <GroceryCollaborationSummary
            request={activeGroceryShareRequest}
            checkedNames={checkedGroceryNames}
            pendingNames={pendingGroceryNames}
            onRefresh={onRefreshGroceryShare}
          />
        )}
        {activeWishShareRequest?.token && (
          <WishShareSummary
            request={activeWishShareRequest}
            onRefresh={onRefreshWishShare}
            onShare={onShareWishRequest}
          />
        )}
        {familyPortraitDigest.evidenceCount > 0 && (
          <PortraitReceiptPreview
            digest={familyPortraitDigest}
            tierDigest={experienceTierDigest}
            onViewChange={onViewChange}
          />
        )}
        {familyPortraitDigest.evidenceCount > 0 && (
        <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">这周家里的饭</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">Humi 正在记住这些变化</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                家人想吃什么、谁去买菜和最近吃过什么，Humi 都会慢慢记住。
              </p>
            </div>
            {canManageHousehold && <button
              type="button"
              onClick={() => onViewChange("dashboard")}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-5 text-sm font-black text-ink"
            >
              继续安排今晚
            </button>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {familyPulseRows.map((row) => (
              <FamilyPulseCard key={row.id} row={row} />
            ))}
          </div>
        </section>
        )}
        {familyActivity.length > 0 && (
        <section data-testid="family-activity-section" className="relative overflow-hidden rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">家庭动态</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">最近大家怎么想吃</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                家人的回复、三餐记录和买菜进度都会留在这里。
              </p>
            </div>
            {canManageHousehold && <button
              type="button"
              onClick={openCraveComposer}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-5 text-sm font-black text-ink"
            >
              问问大家
            </button>}
            {activeGroceryShareRequest?.token && (
              <button
                type="button"
                onClick={onRefreshGroceryShare}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-5 text-sm font-black text-ink"
              >
                刷新买菜
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-3">
            {familyActivity.length > 0 ? (
              familyActivity.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-canvas p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">{item.title}</p>
                    <p className="mt-1 text-xs font-bold text-ink/42">{item.meta}</p>
                  </div>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-ink" />
                </div>
              ))
            ) : null}
          </div>
        </section>
        )}
        {(wishPool.length > 0 || activeWishShareRequest?.token) && (
        <section data-testid="want-to-eat-section" className="relative overflow-hidden rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">最近想吃</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">平时想吃的，先放这里</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                在全部菜品里点“想吃”，以后安排晚饭时可以直接从这里选。
              </p>
            </div>
            {canManageHousehold && <button
              type="button"
              onClick={activeWishShareRequest?.token ? onShareWishRequest : onStartWishShare}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink bg-white px-5 text-sm font-black text-ink"
            >
              {activeWishShareRequest?.token ? "分享想吃入口" : "让家人写想吃"}
            </button>}
          </div>
          <div className="mt-4 grid gap-3">
            {wishPool.length > 0 ? (
              wishPool.slice(0, 6).map((item) => (
                <div key={item.id} data-testid="want-to-eat-row" className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-canvas p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-ink">{item.name}</p>
                    <p className="mt-1 text-xs font-bold text-ink/42">{item.source || "全部菜品"}</p>
                  </div>
                  {(canManageHousehold || item.memberId === currentMemberId) && <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => onPlanWish?.(item)}
                      className="rounded-full bg-ink px-3 py-2 text-xs font-black text-white"
                    >
                      {canManageHousehold ? item.recipeId ? "今晚做" : "去挑菜" : "标记安排"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveWish?.(item.id)}
                      className="rounded-full bg-white px-3 py-2 text-xs font-black text-ink/52"
                    >
                      移除
                    </button>
                  </div>}
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-line bg-canvas p-4 text-sm font-bold leading-6 text-ink/52">
                还没有想吃的菜。去全部菜品逛一逛，看到想吃的先点一下心形。
              </div>
            )}
          </div>
        </section>
        )}
        <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">家庭成员</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">谁正在参与这顿饭</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                主厨负责菜单和家庭设置；通过分享卡片参与的人，也可以之后加入这个家。
              </p>
            </div>
            <span className="w-fit rounded-full bg-canvas px-3 py-2 text-xs font-black text-ink/52">
              {householdParticipants.length} 人
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {householdParticipants.map((participant) => (
              <ParticipantRow key={participant.id} participant={participant} />
            ))}
          </div>
          {signedIn && family && (
            <HouseholdActions
              family={family}
              households={households}
              activeInvite={activeHouseholdInvite}
              newHouseholdName={newHouseholdName}
              onNameChange={setNewHouseholdName}
              onCreate={() => {
                onCreateHousehold?.(newHouseholdName || "另一个家");
                setNewHouseholdName("");
              }}
              onSwitch={onSwitchHousehold}
              onCreateInvite={onCreateHouseholdInvite}
              onShareInvite={onShareHouseholdInvite}
            />
          )}
        </section>

        {signedIn && !family && (
          <section data-testid="create-household-section" className="rounded-[28px] border border-line bg-white p-5 shadow-card">
            <p className="eyebrow">建立我的家</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">给这个家起个名字</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
              创建后可以邀请成员、保存菜单和清单；不会因为登录而自动替你创建。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={authProps?.familyName || ""}
                onChange={(event) => authProps?.setFamilyName?.(event.target.value)}
                placeholder="例如：我们家"
                className="min-h-12 rounded-full border border-line bg-canvas px-5 text-sm font-black text-ink outline-none transition focus:border-ink/30"
              />
              <button
                type="button"
                onClick={authProps?.onCreateFamily}
                disabled={authProps?.cloudLoading}
                className="min-h-12 rounded-full bg-ink px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                创建我的家
              </button>
            </div>
            {authProps?.authStatus && <p className="mt-3 text-xs font-bold text-ink/48">{authProps.authStatus}</p>}
          </section>
        )}

        <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">设置</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">需要改时再进入</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
                忌口和营养目标需要改时再进来；软口味会从日常协作里学习。
              </p>
            </div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black text-ink/45">
              {formatHardProfileSummary(familyProfile)}
            </span>
          </div>
          {canManageHousehold ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <UtilityButton icon={UserRound} label="家庭信息与忌口" ariaLabel="修改忌口" onClick={() => setActiveSettings(activeSettings === "profile" ? null : "profile")} />
            <UtilityButton icon={SlidersHorizontal} label="调整营养目标" onClick={() => setActiveSettings(activeSettings === "goals" ? null : "goals")} />
          </div> : (
            <div data-testid="family-constraints-readonly" className="mt-4 rounded-[20px] border border-line bg-canvas p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">家庭饮食约束</p>
              <p className="mt-2 text-sm font-black leading-6 text-ink/68">{formatHardProfileSummary(familyProfile)}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/45">由主厨统一维护，家人查看即可。</p>
            </div>
          )}
        </section>

        {canManageHousehold && activeSettings === "profile" && (
          <FamilyProfilePanel
            session={session}
            signedIn={signedIn}
            profile={familyProfile}
            setProfile={setFamilyProfile}
          />
        )}
        {canManageHousehold && activeSettings === "goals" && (
          <NutritionGoalsPanel
            profile={familyProfile}
            goals={nutritionGoals}
            setGoals={setNutritionGoals}
          />
        )}
        <CloudSyncPanel {...cloudMenuProps} />
      </div>

      <aside className="hidden content-start gap-5 xl:grid">
        <Card className="relative overflow-hidden pr-24">
          <HumiPeek
            variant={family ? "profile" : "family-taste-talk"}
            size="sm"
            className="absolute right-4 top-4 opacity-85"
            contextKey="user-status-card-peek"
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">我的家</p>
              <h3 className="card-title">当前状态</h3>
            </div>
            <UserRound size={22} />
          </div>
          <div className="mt-5 grid gap-3">
            <StatusRow label="登录" value={getIdentityLabel({ session, humiSession })} />
            {humiSession && (
              <StatusRow label="手机号" value={phoneVerified ? phoneMasked || "已绑定" : "未绑定"} />
            )}
            <StatusRow label="我的家" value={family?.name ?? (signedIn ? "待创建" : "未登录")} />
            <StatusRow
              label="保存方式"
              value={isWechatMiniProgram && !family ? "本机游客模式" : getSyncModeLabel({ family, cloudMenuProps, signedIn })}
            />
          </div>
          {signedIn && authProps?.onSignOut && (
            <button
              type="button"
              onClick={authProps.onSignOut}
              disabled={authProps.cloudLoading}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 transition hover:border-ink/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut size={16} />
              {signOutLabel}
            </button>
          )}
          {isWechatMiniProgram && humiSession && !phoneVerified && (
            <button
              type="button"
              onClick={handleBindPhone}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
            >
              <Phone size={16} />
              绑定手机号
            </button>
          )}
          {isWechatMiniProgram && humiSession && phoneVerified && (
            <div className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-canvas px-4 text-sm font-black text-ink/62">
              <Phone size={16} />
              手机号已绑定
            </div>
          )}
          {phoneBindStatus && (
            <p className="mt-3 text-xs font-bold leading-5 text-ink/42">{phoneBindStatus}</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white">
              <Cloud size={20} />
            </span>
            <div>
              <p className="font-black">{humiSession ? "已通过微信登录" : wechatLoginEnabled ? "微信登录" : "游客模式"}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-ink/45">
                {humiSession
                  ? "菜单、口味偏好和清单会优先跟随 Humi 账号。"
                  : wechatLoginEnabled
                  ? "小程序内会使用微信身份登录；游客仍可先完成晚饭安排。"
                  : "首发先不要求登录；核心菜单、计划和清单保存在当前设备。"}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              隐私政策
            </a>
            <a
              href="/terms.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-3 text-xs font-black text-ink/58 transition hover:text-ink"
            >
              用户协议
            </a>
          </div>
        </Card>
      </aside>
    </section>
  );
}

function FamilyProfilePanel({ session, signedIn, profile, setProfile }) {
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState("");
  const hardAvoidCount = (draft.dislikes?.length ?? 0) + (draft.allergies?.length ?? 0);

  function updateValue(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleListValue(key, value) {
    setDraft((current) => {
      const values = new Set(current[key] ?? []);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      return { ...current, [key]: [...values] };
    });
  }

  function saveProfile() {
    setProfile(draft);
    setStatus("忌口已经保存。其他口味会从问问大家、最近想吃和晚饭确认里慢慢了解。");
  }

  return (
    <section data-testid="diet-constraints-panel" className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">家庭信息</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">人数和忌口</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            这里只维护会影响信任的硬信息。喜欢、偏辣、想省事这类软口味，会从自然动作里慢慢长出来。
          </p>
        </div>
        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black text-ink/58">
          {hardAvoidCount > 0 ? `${hardAvoidCount} 项硬避开` : "可随时补充"}
        </span>
      </div>

      {!session?.user && !signedIn && (
        <div className="mt-4 rounded-[20px] bg-canvas p-4 text-sm font-bold leading-6 text-ink/52">
          可以先填写体验；创建我的家后，菜单、清单和口味偏好会一起保存。
        </div>
      )}

      <div className="mt-5 grid gap-4">
        <ProfileStep icon={Users} title="家里几个人吃饭">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((size) => (
              <ChoiceButton
                key={size}
                active={Number(draft.familySize) === size}
                label={size === 4 ? "4人+" : `${size}人`}
                onClick={() => updateValue("familySize", size)}
              />
            ))}
          </div>
          <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-between rounded-[18px] bg-canvas px-4">
            <span className="text-sm font-black">有孩子一起吃</span>
            <input
              type="checkbox"
              checked={Boolean(draft.hasChildren)}
              onChange={(event) => updateValue("hasChildren", event.target.checked)}
              className="h-5 w-5 accent-black"
            />
          </label>
        </ProfileStep>

        <ProfileStep icon={ShieldAlert} title="绝不想吃 / 不能吃">
          <p className="mb-2 text-xs font-bold text-ink/42">这类今晚不要推</p>
          <TagChoices
            options={profileOptions.dislikes}
            values={draft.dislikes}
            onToggle={(value) => toggleListValue("dislikes", value)}
          />
          <p className="mb-2 mt-4 text-xs font-bold text-ink/42">忌口或过敏</p>
          <TagChoices
            options={profileOptions.allergies}
            values={draft.allergies}
            onToggle={(value) => toggleListValue("allergies", value)}
          />
        </ProfileStep>

      </div>

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">软口味来源</p>
        <p className="mt-2 text-sm font-bold leading-6 text-ink/58">
          Humi 会从“问问大家”、最近想吃、换一组的原因和晚饭确认里慢慢了解你家，不需要专门填一张口味表。
        </p>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs font-black text-ink/38">当前家庭信息</p>
        <p className="mt-2 text-sm font-bold leading-6 text-ink/62">{formatHardProfileSummary(draft)}</p>
      </div>

      {status && <p className="mt-3 text-xs font-bold text-ink/45">{status}</p>}

      <button
        type="button"
        onClick={saveProfile}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
      >
        <Check size={17} className="text-white" />
        保存家庭偏好
      </button>
    </section>
  );
}

function NutritionGoalsPanel({ profile, goals, setGoals }) {
  const normalizedGoals = normalizeNutritionGoals(profile, goals);
  const [draft, setDraft] = useState(normalizedGoals);
  const [status, setStatus] = useState("");

  function updateNumber(key, value) {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  }

  function resetToModeDefaults() {
    const defaults = getDefaultNutritionGoals(profile);
    setDraft(defaults);
    setGoals(defaults);
    setStatus("已恢复当前规划模式的默认目标。");
  }

  function saveGoals() {
    const nextGoals = {
      ...draft,
      caloriesKcalMax: Number(draft.caloriesKcalMax),
      proteinGMin: Number(draft.proteinGMin),
      fatGMax: Number(draft.fatGMax),
      carbsGMax: Number(draft.carbsGMax),
      vegetableRatioMin: Number(draft.vegetableRatioMin),
      proteinRatioMin: Number(draft.proteinRatioMin),
      quickRatioMin: Number(draft.quickRatioMin),
      homeCookRatioMin: Number(draft.homeCookRatioMin),
    };
    setGoals(nextGoals);
    setStatus("营养目标已保存在本机。");
  }

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">营养目标</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">每顿晚餐参考目标</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            这里只管理晚餐估算目标，不代表全天摄入，也不替代专业营养建议。
          </p>
        </div>
        <button
          type="button"
          onClick={resetToModeDefaults}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-canvas px-4 text-xs font-black text-ink/62 transition hover:text-ink"
        >
          使用模式默认
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <GoalInput label="热量上限" value={draft.caloriesKcalMax} unit="kcal" min={300} max={900} step={10} onChange={(value) => updateNumber("caloriesKcalMax", value)} />
        <GoalInput label="蛋白质下限" value={draft.proteinGMin} unit="g" min={8} max={50} step={1} onChange={(value) => updateNumber("proteinGMin", value)} />
        <GoalInput label="脂肪上限" value={draft.fatGMax} unit="g" min={8} max={45} step={1} onChange={(value) => updateNumber("fatGMax", value)} />
        <GoalInput label="碳水上限" value={draft.carbsGMax} unit="g" min={30} max={120} step={1} onChange={(value) => updateNumber("carbsGMax", value)} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RatioInput label="蔬菜比例" value={draft.vegetableRatioMin} onChange={(value) => updateNumber("vegetableRatioMin", value)} />
        <RatioInput label="蛋白类比例" value={draft.proteinRatioMin} onChange={(value) => updateNumber("proteinRatioMin", value)} />
        <RatioInput label="省时菜比例" value={draft.quickRatioMin} onChange={(value) => updateNumber("quickRatioMin", value)} />
        <RatioInput label="在家做比例" value={draft.homeCookRatioMin} onChange={(value) => updateNumber("homeCookRatioMin", value)} />
      </div>

      {status && <p className="mt-3 text-xs font-bold text-ink/45">{status}</p>}

      <button
        type="button"
        onClick={saveGoals}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5"
      >
        <Check size={17} className="text-white" />
        保存营养目标
      </button>
    </section>
  );
}

function GoalInput({ label, value, unit, min, max, step, onChange }) {
  return (
    <label className="rounded-[20px] bg-canvas p-4">
      <span className="flex items-center justify-between gap-3 text-sm font-black">
        <span>{label}</span>
        <span className="text-ink/48">{Math.round(value)}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full accent-black"
      />
    </label>
  );
}

function RatioInput({ label, value, onChange }) {
  return (
    <label className="rounded-[20px] bg-canvas p-4">
      <span className="flex items-center justify-between gap-3 text-sm font-black">
        <span>{label}</span>
        <span className="text-ink/48">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={0.1}
        max={0.8}
        step={0.05}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full accent-black"
      />
    </label>
  );
}

function ProfileStep({ icon: Icon, title, children }) {
  return (
    <div className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-canvas text-ink">
          <Icon size={17} />
        </span>
        <p className="font-black">{title}</p>
      </div>
      {children}
    </div>
  );
}

function TagChoices({ options, values = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <ChoiceButton
          key={option}
          active={values.includes(option)}
          label={option}
          onClick={() => onToggle(option)}
        />
      ))}
    </div>
  );
}

function ChoiceButton({ active, label, note, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-black transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/58 hover:text-ink"
      }`}
    >
      {label}
      {note && <span className={`ml-1 text-xs ${active ? "text-white/58" : "text-ink/38"}`}>{note}</span>}
    </button>
  );
}

function getSyncModeLabel({ family, cloudMenuProps, signedIn }) {
  if (!family) return signedIn ? "创建我的家后保存" : "先保存在本机";
  if (cloudMenuProps?.cloudMenuEnabled && cloudMenuProps?.cloudGroceryEnabled) return "已保存到我的家";
  if (cloudMenuProps?.cloudMenuEnabled || cloudMenuProps?.cloudGroceryEnabled) return "部分已保存";
  return "保存到我的家";
}

function getIdentityLabel({ session, humiSession }) {
  if (humiSession?.user) return humiSession.user.displayName ?? "微信用户";
  if (session?.user?.email) return session.user.email;
  return "未登录";
}

function getUserDisplayName({ session, humiSession } = {}) {
  return humiSession?.user?.displayName
    || session?.user?.nickname
    || session?.user?.name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split("@")[0]
    || "我";
}

function buildHomeHeroState({
  signedIn,
  family,
  pendingJoinContext,
  activeCraveVotes = [],
  groceryItems = [],
  checkedGroceryItems = 0,
  claimedGroceryClaims = 0,
  declinedGroceryClaims = 0,
  wishPool = [],
  wishShareWishes = [],
  sourceSummary = {},
  householdParticipants = [],
}) {
  const familyMemberCount = Math.max(0, householdParticipants.length - 1);
  const stats = [
    { label: "家人回复", value: `${activeCraveVotes.length} 个` },
    { label: "买菜进展", value: groceryItems.length > 0 ? `${checkedGroceryItems}/${groceryItems.length} 项` : `${claimedGroceryClaims} 人` },
    { label: "最近想吃", value: `${Math.max(wishPool.length, wishShareWishes.length)} 道` },
  ];

  if (family?.role === "member") {
    return {
      title: `${family.name || "我家"}里的家人`,
      subtitle: "可以看今晚的安排、补充想吃的菜，也可以一起买菜；菜单和忌口由主厨维护。",
      stats,
    };
  }

  if (pendingJoinContext?.type) {
    const name = pendingJoinContext.memberName || "家人";
    return {
      title: `${name}刚刚参与了。`,
      subtitle: buildPendingHeroSubtitle(pendingJoinContext),
      stats,
    };
  }

  if (activeCraveVotes.length > 0) {
    const names = activeCraveVotes
      .slice(0, 3)
      .map((vote) => vote.memberName || "家人")
      .join("、");
    return {
      title: `今晚收到 ${activeCraveVotes.length} 个感觉。`,
      subtitle: `${names}已经点过想吃的感觉；刷新后可以直接按这些回复出菜单。`,
      stats,
    };
  }

  if (claimedGroceryClaims > 0 || checkedGroceryItems > 0) {
    return {
      title: "买菜有人接上了。",
      subtitle: `清单 ${groceryItems.length} 项，已买 ${checkedGroceryItems}/${groceryItems.length || 0}；${claimedGroceryClaims} 人认领${declinedGroceryClaims > 0 ? `，${declinedGroceryClaims} 人买不了` : ""}。`,
      stats,
    };
  }

  if (wishShareWishes.length > 0) {
    return {
      title: `家人写了 ${wishShareWishes.length} 个想吃。`,
      subtitle: "刷新后就能看到这些菜，再决定今晚做哪一道。",
      stats,
    };
  }

  if (wishPool.length > 0) {
    return {
      title: `最近有 ${wishPool.length} 道想吃的菜。`,
      subtitle: `最新是“${wishPool[0]?.name || "一道菜"}”，今晚可以直接拿出来安排。`,
      stats,
    };
  }

  if (sourceSummary.confirmed > 0 || sourceSummary.breakfast > 0 || sourceSummary.lunch > 0) {
    return {
      title: "三餐记录开始成形。",
      subtitle: `早餐 ${sourceSummary.breakfast || 0} 次 · 午餐 ${sourceSummary.lunch || 0} 次 · 晚饭确认 ${sourceSummary.confirmed || 0} 次；Humi 正在慢慢了解你家的节奏。`,
      stats,
    };
  }

  return {
    title: signedIn ? "今晚可以从这里问大家。" : "先把今晚这顿顺起来。",
    subtitle: signedIn
      ? family
        ? `现在家里有 ${familyMemberCount} 位成员。问问大家，回复会留在这里。`
        : "已经登录。创建我的家后，菜单、清单和家人反馈就会一起保存。"
      : "菜单、清单和偏好会先存在本机；想和家人一起用时再登录。",
    stats,
  };
}

function buildPendingHeroSubtitle(context = {}) {
  if (context.type === "wish") {
    return context.dishWish
      ? `${context.memberName || "家人"}写了想吃“${context.dishWish}”，以后安排晚饭时可以直接选。`
      : `${context.memberName || "家人"}写回了一道想吃的菜，可以收进家庭动态。`;
  }
  if (context.type === "crave") {
    return context.dishWish
      ? `${context.memberName || "家人"}点了“${context.feelingTag || "随便都行"}”，还提到“${context.dishWish}”。`
      : `${context.memberName || "家人"}点了“${context.feelingTag || "随便都行"}”，这次感觉会影响今晚菜单。`;
  }
  if (context.claimStatus === "declined") {
    return `${context.memberName || "家人"}这次暂时买不了，主厨刷新后能看到这个状态。`;
  }
  return `${context.memberName || "家人"}说可以去买菜${context.itemCount ? ` · ${context.itemCount} 项` : ""}。`;
}

function buildHouseholdParticipants({
  session,
  humiSession,
  signedIn,
  activeCraveRequest,
  activeGroceryShareRequest,
  activeWishShareRequest,
  pendingJoinContext,
  householdMembers = [],
  craveSignals = [],
}) {
  const rows = [{
    id: "owner",
    name: getUserDisplayName({ session, humiSession }),
    role: "主厨",
    status: signedIn ? "已加入" : "当前设备",
    meta: signedIn ? "可以问大家、定菜单和管理这个家。" : "可以先体验；登录后把这个家保存下来。",
    icon: ChefHat,
    priority: 0,
  }];
  const seen = new Set(["owner"]);

  function addParticipant({ key, name, role = "家人", status = "通过分享参与", meta, icon = UserRound, priority = 10 }) {
    const safeName = String(name || "家人").trim() || "家人";
    const safeKey = key || `${role}:${safeName}`;
    const normalizedKey = safeKey.toLowerCase();
    const existingIndex = rows.findIndex((item) => item.key === normalizedKey);
    if (existingIndex >= 0) {
      const existing = rows[existingIndex];
      rows[existingIndex] = {
        ...existing,
        meta: mergeParticipantMeta(existing.meta, meta),
        icon: existing.icon || icon,
        priority: Math.min(existing.priority ?? priority, priority),
      };
      return;
    }
    if (seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    rows.push({
      id: normalizedKey,
      key: normalizedKey,
      name: safeName,
      role,
      status,
      meta,
      icon,
      priority,
    });
  }

  householdMembers.forEach((member) => {
    addParticipant({
      key: member.participantKey || member.id || `member:${member.name}`,
      name: member.name || "家人",
      role: member.role || "家人",
      status: member.status === "正式成员" || member.status === "formal" ? "已加入" : member.status || "已加入",
      meta: member.lastSignal ? `${member.source || "家庭成员"} · ${member.lastSignal}` : `${member.source || "家庭成员"}加入。`,
      icon: Users,
      priority: 1,
    });
  });

  if (pendingJoinContext?.type) {
    const isCrave = pendingJoinContext.type === "crave";
    const isWish = pendingJoinContext.type === "wish";
    addParticipant({
      key: pendingJoinContext.participantKey || `pending:${pendingJoinContext.type}:${pendingJoinContext.memberName}`,
      name: pendingJoinContext.memberName || "家人",
      role: "家人",
      status: "等待加入",
      meta: isWish
        ? pendingJoinContext.dishWish
          ? `刚才写了想吃“${pendingJoinContext.dishWish}”。`
          : "刚才写了一道想吃的菜。"
        : isCrave
        ? pendingJoinContext.dishWish
          ? `刚才点了“${pendingJoinContext.feelingTag || "随便都行"}”，还提到“${pendingJoinContext.dishWish}”。`
          : `刚才点了“${pendingJoinContext.feelingTag || "随便都行"}”。`
        : pendingJoinContext.claimStatus === "declined"
          ? "刚才表示这次暂时买不了。"
          : `刚才说可以去买菜${pendingJoinContext.itemCount ? ` · ${pendingJoinContext.itemCount} 项` : ""}。`,
      icon: isWish ? Heart : isCrave ? MessageCircleHeart : ShoppingBasket,
      priority: 1,
    });
  }

  (activeCraveRequest?.votes ?? []).forEach((vote) => {
    addParticipant({
      key: vote.participantKey || `crave:${vote.memberName}`,
      name: vote.memberName || "家人",
      role: "家人",
      status: vote.temporary === false ? "已加入" : "通过分享参与",
      meta: vote.dishWish
        ? `点了“${vote.feelingTag || "随便都行"}”，还提到“${vote.dishWish}”。`
        : `点了“${vote.feelingTag || "随便都行"}”。`,
      icon: MessageCircleHeart,
      priority: 2,
    });
  });

  (activeGroceryShareRequest?.claims ?? []).forEach((claim) => {
    addParticipant({
      key: claim.participantKey || `grocery:${claim.memberName}`,
      name: claim.memberName || "家人",
      role: "家人",
      status: claim.temporary === false ? "已加入" : "通过分享参与",
      meta: claim.status === "declined"
        ? claim.note ? `暂时买不了：${claim.note}` : "暂时买不了。"
        : `说可以去买菜${Array.isArray(claim.itemIds) && claim.itemIds.length > 0 ? ` · ${claim.itemIds.length} 项` : ""}。`,
      icon: ShoppingBasket,
      priority: 3,
    });
  });

  (activeWishShareRequest?.wishes ?? []).forEach((wish) => {
    addParticipant({
      key: wish.participantKey || `wish:${wish.memberName}`,
      name: wish.memberName || "家人",
      role: "家人",
      status: wish.temporary === false ? "已加入" : "通过分享参与",
      meta: wish.note
        ? `想吃“${wish.dishName || "一道菜"}”：${wish.note}`
        : `想吃“${wish.dishName || "一道菜"}”。`,
      icon: Heart,
      priority: 4,
    });
  });

  craveSignals.flatMap((signal) => signal.votes ?? []).forEach((vote) => {
    addParticipant({
      key: vote.participantKey || `signal:${vote.memberName}`,
      name: vote.memberName || "家人",
      role: "家人",
      status: vote.temporary === false ? "已加入" : "通过分享参与",
      meta: `之前点过“${vote.feelingTag || "随便都行"}”。`,
      icon: MessageCircleHeart,
      priority: 5,
    });
  });

  return rows.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10)).slice(0, 8);
}

function mergeParticipantMeta(current = "", next = "") {
  if (!next) return current;
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current} ${next}`;
}

function HomeActionTile({ label, value, actionLabel, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-16 items-center justify-between gap-3 rounded-[16px] border border-line bg-canvas p-3 text-left transition hover:border-ink/20 disabled:cursor-default disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase tracking-[0.16em] text-ink/35">{label}</span>
        <span className="mt-1 block truncate text-sm font-black text-ink">{value}</span>
      </span>
      <span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-black text-ink/58">
        {actionLabel}
      </span>
    </button>
  );
}

function StatusRow({ label, value }) {
  return (
    <div className="rounded-[18px] border border-line bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{label}</p>
      <p className="mt-1 break-all text-sm font-black">{value}</p>
    </div>
  );
}

function FamilyPulseCard({ row }) {
  const Icon = row.icon || Sparkles;
  return (
    <article className="rounded-[22px] border border-line bg-canvas p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-ink">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/35">{row.label}</p>
          <h4 className="mt-1 text-lg font-black tracking-[-0.03em]">{row.title}</h4>
          <p className="mt-1 text-sm font-bold leading-6 text-ink/54">{row.text}</p>
        </div>
      </div>
    </article>
  );
}

function PortraitReceiptPreview({ digest, tierDigest, onViewChange }) {
  return (
    <section className="rounded-[24px] border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Humi 记住了什么</p>
          <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">你的日常选择，正在让推荐更懂你家</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {digest.summary}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-black text-white">
          {digest.evidenceCount} 条
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ReceiptPreviewField label="最近记住" value={digest.leadingSignal} />
        <ReceiptPreviewField label="下顿会先考虑" value={digest.nextMove} />
        <ReceiptPreviewField label="推荐状态" value={digest.qualityLayer} />
      </div>
      <div className="mt-3 rounded-[18px] bg-canvas p-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/35">哪些功能可以一直用</p>
        <p className="mt-1 text-sm font-black leading-6 text-ink">
          问问大家、一起买菜、最近想吃、清单和基础推荐都可以一直用。
        </p>
        <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
          更懂你家的推荐：{tierDigest.badge}。{tierDigest.rows.find((row) => row.id === "tier-precise")?.value}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onViewChange("dashboard")}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink bg-white px-4 text-xs font-black text-ink"
        >
          用它安排今晚
        </button>
        <button
          type="button"
          aria-label="营养分析"
          onClick={() => onViewChange("stats")}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-line bg-canvas px-4 text-xs font-black text-ink/58"
        >
          看完整分析
        </button>
      </div>
    </section>
  );
}

function ReceiptPreviewField({ label, value }) {
  return (
    <div className="rounded-[16px] border border-line bg-canvas px-3 py-2">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/35">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-ink">{value}</p>
    </div>
  );
}

function PendingJoinCard({ context, signedIn, onClear, onAccept }) {
  const isCrave = context.type === "crave";
  const isWish = context.type === "wish";
  const title = isWish ? "刚才写的想吃已经保留" : isCrave ? "刚才的感觉已经保留" : "刚才的买菜参与已经保留";
  const detail = isWish
    ? `${context.memberName || "家人"}写了想吃“${context.dishWish || "一道菜"}”。`
    : isCrave
    ? `${context.memberName || "家人"}点了“${context.feelingTag || "随便都行"}”${context.dishWish ? `，还提到“${context.dishWish}”` : ""}。`
    : context.claimStatus === "declined"
      ? `${context.memberName || "家人"}这次暂时买不了。`
      : `${context.memberName || "家人"}认领了 ${context.itemCount || 0} 项买菜。`;
  return (
    <section className="rounded-[28px] border border-line bg-white p-5 shadow-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">加入这个家</p>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">{title}</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {detail}
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {signedIn
              ? "你已经登录 Humi。点“加入这个家”后，刚才的回复会和你的家庭账号放在一起。"
              : "刚才的回复已经保留。登录后加入这个家，以后就能一起看菜单和清单。"}
          </p>
        </div>
        <span className="w-fit rounded-full bg-canvas px-3 py-2 text-xs font-black text-ink/52">
          {context.householdName || "我家"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {signedIn && (
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 text-xs font-black text-white"
          >
            加入这个家
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink bg-white px-4 text-xs font-black text-ink"
        >
          稍后处理
        </button>
      </div>
    </section>
  );
}

function HouseholdActions({
  family,
  households,
  activeInvite,
  newHouseholdName,
  onNameChange,
  onCreate,
  onSwitch,
  onCreateInvite,
  onShareInvite,
}) {
  const visibleHouseholds = households.length > 0 ? households : [family];
  const isOwner = family.role !== "member";

  return (
    <div data-testid="household-switcher" className="mt-5 border-t border-line pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">现在看的家</p>
          <h4 className="mt-1 text-xl font-black tracking-[-0.03em]">{family.name || "我的家"}</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/48">
            {isOwner ? "你是主厨，可以邀请家人；不同家庭的菜单、清单和偏好会分开保存。" : "你是家人，可以看菜单、一起买菜，也能回复想吃什么；邀请新成员由主厨发起。"}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onCreateInvite}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-black text-white"
          >
            <Share2 size={16} />
            邀请家人
          </button>
        )}
      </div>

      {activeInvite?.token && isOwner && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">家庭邀请卡片已准备好</p>
            <p className="mt-1 text-xs font-bold text-ink/42">已加入 {activeInvite.acceptedCount || 0} 人</p>
          </div>
          <button type="button" onClick={onShareInvite} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line px-4 text-xs font-black">
            <Share2 size={14} />
            再分享
          </button>
        </div>
      )}

      {visibleHouseholds.length > 1 && (
        <div className="mt-4">
          <p className="text-xs font-black text-ink/48">切换家庭</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {visibleHouseholds.map((household) => {
              const active = household.id === family.id;
              return (
                <button
                  key={household.id}
                  type="button"
                  onClick={() => !active && onSwitch?.(household.id)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-black ${active ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink"}`}
                >
                  {active ? <Check size={15} /> : <Users size={15} />}
                  {household.name || "我的家"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {onCreate && (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={newHouseholdName}
            onChange={(event) => onNameChange?.(event.target.value)}
            className="min-h-11 min-w-0 rounded-full border border-line bg-canvas px-4 text-sm font-bold outline-none focus:border-ink/30"
            placeholder="例如：爸妈家"
            maxLength={30}
          />
          <button type="button" onClick={onCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink">
            <Plus size={16} />
            新建一个家
          </button>
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ participant }) {
  const Icon = participant.icon || UserRound;
  return (
    <div className="grid grid-cols-[44px_1fr] gap-3 rounded-[20px] border border-line bg-canvas p-4">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-ink">
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-black text-ink">{participant.name}</p>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-ink/54">
            {participant.role}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-ink/54">
            {participant.status}
          </span>
        </div>
        <p className="mt-1 text-xs font-bold leading-5 text-ink/48">{participant.meta}</p>
      </div>
    </div>
  );
}

function UtilityButton({ icon: Icon, label, ariaLabel, onClick }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-black text-ink/62 transition hover:-translate-y-0.5 hover:border-ink hover:bg-ink hover:text-white"
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function FamilyCraveComposer({
  activeRequest,
  votes = [],
  pending,
  selectedFeeling,
  onSelectFeeling,
  audienceMembers = [],
  onAudienceChange,
  onStart,
  onShare,
  onRefresh,
  onFinish,
  onClose,
}) {
  const hasRequest = Boolean(activeRequest?.token);
  const primaryFeelingTags = feelingTags.filter((tag) => tag !== "随便都行");

  return (
    <section className="mt-4 rounded-[24px] border border-line bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/38">问问大家</p>
          <h4 className="mt-1 text-xl font-black tracking-[-0.04em]">
            {hasRequest ? "已经可以发给家人了" : "今晚想先照顾哪种感觉？"}
          </h4>
          <p className="mt-1 text-sm font-bold leading-6 text-ink/52">
            {hasRequest
              ? "家人打开卡片后免登录点一个感觉；回复会回到这里。"
              : "先选一个大致方向。就算没人回复，Humi 也会按这个和家里的忌口来安排。"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-fit rounded-full border border-line bg-canvas px-4 py-2 text-xs font-black text-ink/52"
        >
          收起
        </button>
      </div>

      {!hasRequest && (
        <>
          <CraveAudiencePicker
            members={audienceMembers}
            onChange={onAudienceChange}
            className="mt-4"
          />
          <div className="mt-4 rounded-[20px] border border-line bg-canvas p-3">
            <CraveReceiptTemplate selectedFeeling={selectedFeeling} />
          </div>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={() => onSelectFeeling("随便都行")}
              className={`min-h-12 rounded-[18px] border px-4 text-sm font-black transition ${
                selectedFeeling === "随便都行"
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-canvas text-ink hover:border-ink/30"
              }`}
            >
              随便，都行
            </button>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {primaryFeelingTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectFeeling(tag)}
                  className={`min-h-10 rounded-full border px-3 text-xs font-black transition ${
                    selectedFeeling === tag
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-canvas text-ink/62 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onStart}
              disabled={pending}
              className="min-h-11 rounded-full bg-ink px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? "正在准备" : "发起征集"}
            </button>
            <button
              type="button"
              onClick={() => onFinish?.(selectedFeeling)}
              disabled={pending}
              className="min-h-11 rounded-full border border-ink bg-white px-5 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              我自己做主
            </button>
          </div>
        </>
      )}

      {hasRequest && (
        <div className="mt-4 grid gap-3">
          <CraveReceipt
            request={activeRequest}
            votes={votes}
            fallbackFeeling={selectedFeeling}
          />
          <div className="rounded-[20px] border border-line bg-canvas p-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">
              {activeRequest.status === "closed" ? "征集已结束" : "等待回复"}
            </p>
            <p className="mt-2 text-lg font-black">
              {votes.length > 0 ? `收到 ${votes.length} 个感觉` : "还没人回复，也可以直接出菜单"}
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
              {activeCraveMeta(activeRequest, votes)}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={onShare}
              disabled={pending}
              className="min-h-11 rounded-full bg-ink px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              分享征集单
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={pending}
              className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              刷新回复
            </button>
            <button
              type="button"
              onClick={() => onFinish?.(selectedFeeling)}
              disabled={pending || activeRequest.status === "closed"}
              className="min-h-11 rounded-full border border-ink bg-white px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              就这些，出菜单
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CraveReceiptTemplate({ selectedFeeling }) {
  const fallbackFeeling = selectedFeeling || "随便都行";
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">家人会看到</p>
          <p className="mt-2 text-lg font-black">我家今晚要做饭，你想吃点啥？</p>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            家人点开第一屏就是感觉标签，不需要登录、不需要加入家庭。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink/54">
          待发起
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ReceiptField label="没人回复时" value={fallbackFeeling} />
        <ReceiptField label="家人怎么回" value="不用登录，点一下" />
        <ReceiptField label="你回来后" value="刷新回复，再出菜单" />
      </div>
    </div>
  );
}

function CraveReceipt({ request, votes = [], fallbackFeeling = "随便都行" }) {
  const receiptNo = formatCraveReceiptNo(request);
  const statusLabel = request?.status === "closed" ? "已结束" : "等大家回复";
  const starterFeeling = request?.starterFeeling || fallbackFeeling || "随便都行";
  const audienceLabel = formatAudienceLabel(request);
  const latestVote = votes[0];

  return (
    <section className="rounded-[22px] border border-ink bg-ink p-4 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">今晚问问大家</p>
          <h4 className="mt-2 text-2xl font-black tracking-[-0.04em]">大家今晚想吃什么</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-white/58">
            {receiptNo} · {statusLabel} · {formatCraveReceiptTime(request?.createdAt)}
          </p>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink">
          {votes.length} 个回复
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <ReceiptField dark label="没人回复时" value={starterFeeling} />
        <ReceiptField dark label="问了谁" value={audienceLabel} />
        <ReceiptField dark label="最新回复" value={latestVote ? `${latestVote.memberName || "家人"} · ${latestVote.feelingTag || "随便都行"}` : "等待家人"} />
        <ReceiptField dark label="接下来" value={request?.status === "closed" ? "正在安排菜单" : "随时可以出菜单"} />
      </div>
      <div className="mt-3 rounded-[18px] border border-white/12 bg-white/[0.06] p-3">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/42">回复明细</p>
        <div className="mt-2 grid gap-2">
          {votes.length > 0 ? (
            votes.map((vote) => (
              <div key={vote.id || vote.participantKey || vote.createdAt || vote.memberName} className="flex items-center justify-between gap-3 rounded-[14px] bg-white/[0.08] px-3 py-2">
                <span className="min-w-0 truncate text-sm font-black">{vote.memberName || "家人"}</span>
                <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-ink">
                  {vote.dishWish ? `${vote.feelingTag || "随便都行"} · ${vote.dishWish}` : vote.feelingTag || "随便都行"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm font-bold leading-6 text-white/58">
              家人的回复会一条条出现在这里；没人回也能按你选的方向和忌口出菜单。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ReceiptField({ label, value, dark = false }) {
  return (
    <div className={`rounded-[16px] px-3 py-2 ${dark ? "bg-white/[0.08]" : "bg-white"}`}>
      <p className={`text-[11px] font-black uppercase tracking-[0.14em] ${dark ? "text-white/38" : "text-ink/35"}`}>{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${dark ? "text-white" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function formatCraveReceiptNo(request) {
  const token = String(request?.token || request?.id || "").replace(/\W/g, "").toUpperCase();
  return token ? `CRAVE-${token.slice(0, 6)}` : "CRAVE-DRAFT";
}

function formatCraveReceiptTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "刚刚创建";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function GroceryCollaborationSummary({ request, checkedNames = [], pendingNames = [], onRefresh }) {
  const claims = request?.claims ?? [];
  const claimed = claims.filter((claim) => claim.status === "claimed");
  const declined = claims.filter((claim) => claim.status === "declined");
  return (
    <section className="mt-4 rounded-[22px] border border-line bg-canvas p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">一起买菜</p>
          <h4 className="mt-1 text-lg font-black tracking-[-0.03em]">谁买了，谁买不了</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            {checkedNames.length > 0
              ? `已买：${checkedNames.slice(0, 3).join("、")}${checkedNames.length > 3 ? "…" : ""}`
              : "还没有标记已买的食材。"}
            {pendingNames.length > 0 ? ` 待买：${pendingNames.slice(0, 3).join("、")}${pendingNames.length > 3 ? "…" : ""}` : " 清单已经买齐。"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-10 w-fit items-center justify-center rounded-full bg-white px-4 text-xs font-black text-ink"
        >
          刷新买菜
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        {[...claimed, ...declined].length > 0 ? (
          [...claimed, ...declined].slice(0, 5).map((claim) => (
            <div key={claim.id || claim.participantKey || claim.createdAt} className="rounded-[18px] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-black">{claim.memberName || "家人"}</p>
                <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${
                  claim.status === "declined" ? "bg-canvas text-ink/52" : "bg-ink text-white"
                }`}
                >
                  {claim.status === "declined" ? "这次买不了" : `负责 ${claim.itemIds?.length ?? 0} 项`}
                </span>
              </div>
              <p className="mt-2 text-xs font-bold leading-5 text-ink/45">
                {formatGroceryClaimMeta(request, claim)}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-[18px] bg-white px-4 py-3 text-sm font-bold leading-6 text-ink/52">
            清单发出去后，谁来买、买了什么都会显示在这里。
          </div>
        )}
      </div>
    </section>
  );
}

function WishShareSummary({ request, onRefresh, onShare }) {
  const wishes = request?.wishes ?? [];
  return (
    <section className="mt-4 rounded-[22px] border border-line bg-canvas p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">问问最近想吃什么</p>
          <h4 className="mt-1 text-lg font-black tracking-[-0.03em]">家人正在写想吃的菜</h4>
          <p className="mt-1 text-xs font-bold leading-5 text-ink/52">
            {wishes.length > 0
              ? `已经收到 ${wishes.length} 个回复，刷新后会放进“最近想吃”。`
              : "把入口发给家人，家人免登录写一道菜。"}
          </p>
        </div>
        <div className="flex w-fit flex-wrap gap-2">
          <button
            type="button"
            onClick={onShare}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 text-xs font-black text-white"
          >
            分享入口
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-white px-4 text-xs font-black text-ink"
          >
            刷新想吃
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {wishes.length > 0 ? (
          wishes.slice(0, 5).map((wish) => (
            <div key={wish.id || wish.participantKey || wish.createdAt} className="rounded-[18px] bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-black">{wish.dishName || "一道菜"}</p>
                <span className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/52">
                  {wish.memberName || "家人"}
                </span>
              </div>
              {wish.note && (
                <p className="mt-2 text-xs font-bold leading-5 text-ink/45">{wish.note}</p>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-[18px] bg-white px-4 py-3 text-sm font-bold leading-6 text-ink/52">
            这里会显示家人写回来的菜名，不会直接改今晚菜单。
          </div>
        )}
      </div>
    </section>
  );
}

function mergeGroceryClaims(activeClaims = [], persistedClaims = {}) {
  const merged = [
    ...(Array.isArray(activeClaims) ? activeClaims : []),
    ...(Array.isArray(persistedClaims) ? persistedClaims : Object.values(persistedClaims ?? {})),
  ];
  const seen = new Set();
  return merged.filter((claim) => {
    if (!claim) return false;
    const key = claim.id || `${claim.itemKey || "item"}:${claim.memberId || claim.memberName || "member"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((claim) => ({
    ...claim,
    id: claim.id || `grocery-claim:${claim.itemKey || "item"}:${claim.memberId || claim.memberName || "member"}`,
  }));
}

function formatGroceryClaimMeta(request, claim) {
  if (claim.status === "declined") return claim.note ? `暂时买不了 · ${claim.note}` : "暂时买不了";
  const itemIds = Array.isArray(claim.itemIds) ? claim.itemIds : [];
  const claimedItems = (request?.items ?? []).filter((item) => itemIds.includes(item.id));
  const checkedCount = claimedItems.filter((item) => item.checked).length;
  const progress = claimedItems.length > 0 ? `已买 ${checkedCount}/${claimedItems.length}` : "一起买菜";
  const itemNames = claimedItems.map((item) => item.name).slice(0, 3).join("、");
  const itemText = itemNames ? ` · ${itemNames}${claimedItems.length > 3 ? "…" : ""}` : "";
  return claim.note ? `${progress}${itemText} · ${claim.note}` : `${progress}${itemText}`;
}

function activeCraveMeta(request, votes = []) {
  if (votes.length > 0) {
    return votes
      .slice(0, 3)
      .map((vote) => {
        const name = vote.memberName || "家人";
        const feeling = vote.feelingTag || "随便都行";
        return vote.dishWish ? `${name}：${feeling} / ${vote.dishWish}` : `${name}：${feeling}`;
      })
      .join(" · ");
  }
  return request.status === "closed"
    ? "没人回复也可以按家庭忌口和省心程度出菜单。"
    : "卡片发出去后，回复会自动回到这里。";
}

function formatAudienceLabel(request = {}) {
  const names = Array.isArray(request.targetParticipantNames) && request.targetParticipantNames.length > 0
    ? request.targetParticipantNames
    : Array.isArray(request.audience)
      ? request.audience.map((person) => person?.name).filter(Boolean)
      : [];
  return names.length > 0 ? names.join("、") : "家人";
}

function buildActiveCraveActivities(request) {
  if (!request?.token) return [];
  const votes = request.votes ?? [];
  const statusText = request.status === "closed" ? "已结束" : "征集中";
  return [
    {
      id: `active-crave:${request.token}`,
      title: votes.length > 0 ? `${statusText}：收到 ${votes.length} 个感觉` : `${statusText}：等待家人点感觉`,
      meta: votes.length > 0 ? activeCraveMeta(request, votes) : "问问大家",
    },
    ...votes.slice(0, 3).map((vote) => ({
      id: `active-crave:${request.token}:${vote.id || vote.participantKey || vote.memberName || vote.createdAt}`,
      title: `${vote.memberName || "家人"}想要：${vote.feelingTag || "随便都行"}`,
      meta: vote.dishWish ? `还提到：${vote.dishWish}` : "本次征集回复",
    })),
  ];
}

function buildMealLogActivities(mealLogs = {}) {
  const sourceLabels = {
    home: "在家做",
    delivery: "点外卖",
    outside: "在外吃",
    skip: "先不记",
  };
  return Object.entries(mealLogs ?? {})
    .filter(([, log]) =>
      log?.source ||
      log?.confirmation ||
      log?.consumedEntries?.length ||
      [log?.mealSources?.breakfast, log?.mealSources?.lunch].some((source) => source && source !== "skip"),
    )
    .sort(([dateA, logA], [dateB, logB]) => {
      const timeA = Date.parse(logA?.updatedAt || dateA);
      const timeB = Date.parse(logB?.updatedAt || dateB);
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
    })
    .slice(0, 3)
    .map(([dateKey, log]) => {
      const source = sourceLabels[log?.source] || "晚饭已记录";
      const consumedNames = (log?.consumedEntries ?? [])
        .map((entry) => getRecipe(entry.recipeId)?.name)
        .filter(Boolean)
        .slice(0, 2);
      const confirmationText = log?.confirmation === "all"
        ? consumedNames.length > 0
          ? `做了 ${consumedNames.join("、")}${(log?.consumedEntries?.length ?? 0) > consumedNames.length ? "…" : ""}`
          : "确认做了"
        : log?.confirmation === "missed"
          ? "换了别的"
          : log?.confirmation === "partial"
            ? "吃了一部分"
            : source;
      const mealParts = [];
      if (log?.mealSources?.breakfast && log.mealSources.breakfast !== "skip") {
        mealParts.push(`早餐${sourceLabels[log.mealSources.breakfast] || "已记录"}`);
      }
      if (log?.mealSources?.lunch && log.mealSources.lunch !== "skip") {
        mealParts.push(`午餐${sourceLabels[log.mealSources.lunch] || "已记录"}`);
      }
      if (log?.source || log?.confirmation || consumedNames.length > 0) {
        mealParts.push(`晚饭${confirmationText}`);
      }
      const actor = log?.confirmedBy || log?.recordedBy || log?.actorName || log?.mealRecordedBy?.lunch || log?.mealRecordedBy?.breakfast || "";
      return {
        id: `meal-log:${dateKey}`,
        title: actor ? `${actor}记下了今天吃饭` : "今天吃得怎么样",
        meta: `${formatActivityDateLabel(dateKey)} · ${mealParts.join(" · ")}`,
      };
    });
}

function formatActivityDateLabel(dateKey = "") {
  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  if (dateKey === todayKey) return "今天";
  const parts = String(dateKey).split("-");
  if (parts.length === 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return "最近";
}

function buildFamilyPulseRows({
  tasteReflections = [],
  sourceSummary = {},
  activeCraveVotes = [],
  groceryClaims = [],
  wishPool = [],
  householdParticipants = [],
}) {
  const feelingText = tasteReflections.find((item) => item.id === "feeling")?.value || "还没有家人回复，先从今晚问一次开始。";
  const wishText = tasteReflections.find((item) => item.id === "wish")?.value || "最近还没有记下想吃的菜。";
  const homeCount = Number(sourceSummary.home || 0);
  const awayCount = Number(sourceSummary.delivery || 0) + Number(sourceSummary.outside || 0);
  const confirmedCount = Number(sourceSummary.confirmed || 0);
  const breakfastCount = Number(sourceSummary.breakfast || 0);
  const lunchCount = Number(sourceSummary.lunch || 0);
  const mealRecordCount = breakfastCount + lunchCount + confirmedCount;
  const participantCount = Math.max(0, householdParticipants.length - 1);
  const claimedCount = groceryClaims.filter((claim) => claim.status === "claimed").length;

  return [
    {
      id: "family-feeling",
      icon: MessageCircleHeart,
      label: "最近想吃的感觉",
      title: feelingText.startsWith("还没有") ? "还没形成趋势" : feelingText,
      text: activeCraveVotes.length > 0
        ? `本次已经收到 ${activeCraveVotes.length} 个回复，会影响今晚菜单。`
        : "每次点一个感觉，Humi 都会更了解你家最近想吃什么。",
    },
    {
      id: "family-rhythm",
      icon: BarChart3,
      label: "三餐节奏",
      title: mealRecordCount > 0 ? `已留下 ${mealRecordCount} 条三餐记录` : "还在等第一条记录",
      text: mealRecordCount > 0
        ? `早餐 ${breakfastCount} 次 · 午餐 ${lunchCount} 次 · 晚饭确认 ${confirmedCount} 次；晚饭在家做 ${homeCount} 次，外食/外卖 ${awayCount} 次。`
        : "记一次早餐、午餐或晚饭，Humi 就会慢慢了解你家的吃饭节奏。",
    },
    {
      id: "family-collaboration",
      icon: Users,
      label: "家人参与",
      title: participantCount > 0 ? `${participantCount} 位家人参与过` : "先从一位家人开始",
      text: claimedCount > 0
        ? `已经有 ${claimedCount} 次家人帮忙买菜；通过分享参与的人也可以加入这个家。`
        : "家人的回复、买菜进度和最近想吃都会留在这里。",
    },
    {
      id: "family-wish",
      icon: Heart,
      label: "最近想吃",
      title: wishPool.length > 0 ? `${wishPool.length} 道想吃` : "还没有记下想吃的菜",
      text: wishPool.length > 0 ? wishText : "去全部菜品点心形，下一次安排晚饭时就能直接拿来做。",
    },
  ];
}

function buildFamilyPortraitDigest({
  tasteReflections = [],
  sourceSummary = {},
  activeCraveVotes = [],
  groceryClaims = [],
  wishPool = [],
  recommendationFeedback = [],
  validationSummary = {},
}) {
  const feelingReflection = tasteReflections.find((item) => item.id === "feeling");
  const wishReflection = tasteReflections.find((item) => item.id === "wish");
  const sourceReflection = tasteReflections.find((item) => item.id === "source");
  const feedbackReflection = tasteReflections.find((item) => item.id === "feedback");
  const confirmedCount = Number(sourceSummary.confirmed || 0);
  const breakfastCount = Number(sourceSummary.breakfast || 0);
  const lunchCount = Number(sourceSummary.lunch || 0);
  const mealRecordCount = breakfastCount + lunchCount + confirmedCount;
  const claimedCount = groceryClaims.filter((claim) => claim.status === "claimed").length;
  const evidenceCount = activeCraveVotes.length + wishPool.length + mealRecordCount + claimedCount + recommendationFeedback.length;
  const hasUsefulEvidence = evidenceCount > 0;
  const leadingSignal = activeCraveVotes.length > 0
    ? `${activeCraveVotes.length} 个本次感觉`
    : wishPool.length > 0
      ? `${wishPool.length} 道想吃`
      : mealRecordCount > 0
        ? `${mealRecordCount} 条三餐记录`
        : "还没有记录";
  const nextMove = activeCraveVotes.length > 0
    ? "先照顾本次感觉"
    : wishPool.length > 0
      ? "优先看看最近想吃"
      : mealRecordCount > 0
        ? "延续吃饭节奏"
        : "先给省心组合";
  const summary = hasUsefulEvidence
    ? `Humi 已经记住 ${evidenceCount} 次选择。下次推荐会先看大家这次想吃什么，再参考最近想吃、三餐记录和换菜原因。`
    : "还没有记录也没关系。先安排一顿，问一次大家或确认一次晚饭，Humi 就会慢慢了解你家。";

  return {
    evidenceCount,
    leadingSignal,
    nextMove,
    qualityLayer: validationSummary.rejectedReasonCaptureRate > 0 ? "会避开不喜欢的" : "正在了解你家",
    summary,
    rows: [
      {
        id: "portrait-feeling",
        label: "家人最近的感觉",
        value: feelingReflection?.value || "还没有家人回复，先从今晚问一次开始。",
      },
      {
        id: "portrait-wish",
        label: "最近想吃",
        value: wishReflection?.value || "还没有记下想吃的菜，看到喜欢的先点心形。",
      },
      {
        id: "portrait-rhythm",
        label: "三餐节奏",
        value: sourceReflection?.value || "早餐、午餐来源和晚饭确认会一起形成你家的吃饭节奏。",
      },
      {
        id: "portrait-avoid",
        label: "不太想吃什么",
        value: feedbackReflection?.value || "点过“不想吃”的原因，下次推荐会尽量避开。",
      },
    ],
  };
}

function buildExperienceTierDigest({
  signedIn = false,
  humiSession = null,
  preciseRecommendationAvailable = false,
  aiRecommendationStatus = "",
}) {
  const statusText = String(aiRecommendationStatus || "").trim();
  const preciseBlocked = statusText.includes("尝鲜已用完") || statusText.includes("基础推荐仍可无限使用");
  const preciseState = preciseRecommendationAvailable
    ? "更懂你家的推荐可用"
    : preciseBlocked
      ? "本次尝鲜已用完"
      : signedIn
        ? "可以尝试更准的推荐"
        : "登录后可以尝鲜";
  const summary = preciseRecommendationAvailable
    ? "问问大家、清单和基础推荐都可以一直用；现在也可以试试更懂你家的推荐。"
    : preciseBlocked
      ? "本次更准推荐的尝鲜已经用完；问问大家、一起买菜、最近想吃、清单和基础推荐仍然可以一直用。"
      : "现在可以先用基础推荐。登录后能尝试更懂你家的推荐，其他功能不会受影响。";

  return {
    preciseAvailable: preciseRecommendationAvailable,
    badge: preciseState,
    summary,
    rows: [
      {
        id: "tier-free-collaboration",
        label: "免费无限",
        value: "问问大家、一起买菜、最近想吃、清单、基础推荐",
      },
      {
        id: "tier-precise",
        label: "更懂你家的推荐",
        value: preciseRecommendationAvailable
          ? "已可用：会结合你家的口味、习惯和反馈再检查一遍菜单"
          : preciseBlocked
            ? "尝鲜已用完：继续自动回到基础推荐"
            : signedIn
              ? "已经登录，可以在推荐页尝试"
              : "登录后可以尝鲜，不影响基础功能",
      },
      {
        id: "tier-owner",
        label: "谁来保存这个家",
        value: humiSession?.user ? "主厨可以保存这个家的菜单、偏好和进度" : "家人可以免登录参与；主厨登录后负责保存",
      },
    ],
  };
}

function buildTasteReflections({ craveSignals = [], wishPool = [], mealLogs = {}, recommendationFeedback = [] }) {
  const rows = [];
  const feelingCounts = new Map();
  craveSignals.forEach((signal) => {
    const votes = Array.isArray(signal.votes) && signal.votes.length > 0
      ? signal.votes
      : [{ feelingTag: signal.feelingTag }];
    votes.forEach((vote) => {
      const tag = vote?.feelingTag || "随便都行";
      feelingCounts.set(tag, (feelingCounts.get(tag) ?? 0) + 1);
    });
  });

  const topFeeling = [...feelingCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  rows.push({
    id: "feeling",
    label: "最近想法",
    value: topFeeling
      ? `${topFeeling[0]} · 出现 ${topFeeling[1]} 次`
      : "还没有家人回复，先从今晚问一次开始。",
  });

  rows.push({
    id: "wish",
    label: "最近想吃",
    value: wishPool.length > 0
      ? `${wishPool.length} 道想吃，最新是 ${wishPool[0]?.name ?? "一道菜"}`
      : "还没收藏想吃的菜，去全部菜品点一下心形就会出现在这里。",
  });

  const confirmedLogs = Object.values(mealLogs).filter((log) => log?.confirmation === "all");
  const breakfastCount = Object.values(mealLogs).filter(
    (log) => log?.mealSources?.breakfast && log.mealSources.breakfast !== "skip",
  ).length;
  const lunchCount = Object.values(mealLogs).filter(
    (log) => log?.mealSources?.lunch && log.mealSources.lunch !== "skip",
  ).length;
  const homeCount = confirmedLogs.filter((log) => log?.source === "home").length;
  const deliveryCount = confirmedLogs.filter((log) => log?.source === "delivery").length;
  const outsideCount = confirmedLogs.filter((log) => log?.source === "outside").length;
  const topSource = [
    ["在家做", homeCount],
    ["点外卖", deliveryCount],
    ["外面吃", outsideCount],
  ].sort((a, b) => b[1] - a[1])[0];
  rows.push({
    id: "source",
    label: "三餐节奏",
    value: breakfastCount + lunchCount + confirmedLogs.length > 0
      ? `早餐 ${breakfastCount} 次 · 午餐 ${lunchCount} 次 · 晚饭确认 ${confirmedLogs.length} 次${topSource?.[1] > 0 ? `，晚饭${topSource[0]}最多` : ""}。`
      : "早餐、午餐来源和晚饭确认会一起形成你家的吃饭节奏。",
  });

  const reasonCounts = new Map();
  recommendationFeedback.forEach((item) => {
    const label = item.reasonLabel || "不合适";
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  });
  const topReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  rows.push({
    id: "feedback",
    label: "避雷方向",
    value: topReason
      ? `最近最常避开：${topReason[0]}。`
      : "点过“不想吃”的原因，下次推荐会尽量避开。",
  });

  return rows;
}

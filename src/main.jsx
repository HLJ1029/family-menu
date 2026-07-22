import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthLanding } from "./components/AuthLanding";
import { CalendarPage } from "./components/CalendarPage";
import { CraveLanding } from "./components/CraveLanding";
import { Dashboard } from "./components/Dashboard";
import { GroceryClaimLanding } from "./components/GroceryClaimLanding";
import { GroceryList } from "./components/GroceryList";
import { HumiIdentitySetup } from "./components/HumiIdentitySetup";
import { InviteLanding } from "./components/InviteLanding";
import { Library } from "./components/Library";
import { MenuShareLanding } from "./components/MenuShareLanding";
import { MealTaskLanding } from "./components/MealTaskLanding";
import { Planner } from "./components/Planner";
import { PosterPreview } from "./components/PosterPreview";
import { ProfileOnboarding } from "./components/ProfileOnboarding";
import { RecipeDetailDrawer } from "./components/RecipeDetailDrawer";
import { RecommendationsPage } from "./components/RecommendationsPage";
import { IcpFooter, Sidebar, MobileTabbar, Topbar } from "./components/AppShell";
import { StatsPage } from "./components/StatsPage";
import { TodayMenu } from "./components/TodayMenu";
import { UserCenter } from "./components/UserCenter";
import { WishLanding } from "./components/WishLanding";
import { OfflineStatus } from "./components/system/OfflineStatus";
import { HumiPeek } from "./components/ui/HumiBrandIllustration";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { addDays, formatDateKey, formatDateLabel, getCurrentPlanDay, getWeekKey, getWeekStartDate, parseDateKey } from "./lib/date";
import {
  buildRecipeGroceryGroups,
  buildShoppingListFromEntries,
  formatRawAmount,
  formatShareText,
} from "./lib/grocery";
import { getDefaultNutritionGoals } from "./lib/insights";
import { getExpiryState } from "./lib/pantry";
import {
  createMealPlanFromLegacy,
  getDayMeals,
  mealPlanEntriesForGroceries,
  mealPlanToCalendar,
  mealPlanToWeekPlan,
  mealSlotIds,
  mealSlots,
  normalizeMealEntries,
  normalizeMealPlan,
  removeMealEntry,
  upsertMealEntry,
} from "./lib/mealPlan";
import {
  createGroceryPoster,
  createTodayMenuPoster,
  createWeekMenuPoster,
  downloadPoster,
  preparePosterUploadBlob,
  sharePoster,
} from "./lib/posters";
import {
  createDefaultWeekPlan,
  createInitialMealCalendar,
  getRecipe,
  nutritionFor,
  photoCandidatesFor,
  recipes,
} from "./lib/recipes";
import { buildRecommendationItems, buildTodayRecommendation, getHardAvoidSignals, recipeMatchesHardAvoid } from "./lib/recommendation/rules";
import { buildCompactFamilyPrompt, getProfileCompletedCount, getPlanningMode, withPlanningModeDefaults } from "./lib/profile";
import { clearHumiSession, readHumiSession, requestMiniProgramLogout, requestWechatLoginFromMiniProgram, saveHumiSession, takeHumiSessionExpiredNotice, takeHumiTicketFromUrl } from "./lib/humiIdentity";
import { clearGuestParticipantId } from "./lib/collaborationIdentity";
import {
  abandonHumiMealRun,
  closeCraveRequest,
  completeHumiMealRun,
  createCraveRequest,
  createGroceryShareRequest,
  createHumiHousehold,
  createHumiMealRun,
  createHumiMealTask,
  createHouseholdInvite,
  createMenuShareRequest,
  createWishShareRequest,
  downgradeHumiMealRun,
  exchangeHumiTicket,
  isHumiApiSession,
  joinCraveRequest,
  joinGroceryShareRequest,
  joinWishShareRequest,
  leaveHumiHousehold,
  loadCraveRequest,
  loadCurrentHumiMealRun,
  loadGroceryShareRequest,
  loadHumiState,
  loadHumiStateEnvelope,
  loadWishShareRequest,
  logoutHumiSession,
  recordHumiProductEvent,
  removeHumiHouseholdMember,
  saveHumiState,
  startHumiMealRun,
  subscribeHumiSessionInvalid,
  switchHumiHousehold,
  transferHumiHouseholdOwnership,
  updateHumiHousehold,
  updateHumiMealRunFeedback,
  updateHumiMealRunProgress,
  uploadPosterShare,
} from "./lib/humiApi";
import { completedMealsInWeek, createLocalMealRun, downgradeLocalMealRun, mergeLocalMealRun, transitionLocalMealRun } from "./lib/mealRun";
import { explainRecommendationViaApi as explainRecommendation, recommendMealsViaApi as recommendMeals } from "./lib/aiViaHumiApi";
import { getLaunchChannel, isWechatMiniProgramWebView, requestMiniProgramPoster, requestMiniProgramReminder, requestMiniProgramShare } from "./lib/runtime";
import { exportValidationData, productEvents, trackValidationEvent, validationEvents } from "./lib/validationEvents";
import { registerServiceWorker } from "./registerServiceWorker";
import "./styles.css";

const weekPlanDays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const defaultFamilyProfile = {
  planningMode: "daily_family",
  familySize: 2,
  hasChildren: false,
  tastePreferences: [],
  goals: [],
  dislikes: [],
  allergies: [],
  shoppingTolerance: "medium",
};

registerServiceWorker();

function App() {
  const appOpenTrackedRef = useRef(false);
  const flowMotionTimerRef = useRef(null);
  const humiStateLoadedRef = useRef(false);
  const humiStateHydratingRef = useRef(false);
  const pendingJoinMergeRef = useRef("");
  const mealRunHydrationRef = useRef("");
  const viewHistoryRef = useRef(["dashboard"]);
  const swipeStartRef = useRef(null);
  const [activeView, setActiveView] = useState(() => getInitialView());
  const [landingCraveToken, setLandingCraveToken] = useState(() => getInitialCraveToken());
  const [landingGroceryShareToken, setLandingGroceryShareToken] = useState(() => getInitialGroceryShareToken());
  const [landingMenuShareToken, setLandingMenuShareToken] = useState(() => getInitialMenuShareToken());
  const [landingWishShareToken, setLandingWishShareToken] = useState(() => getInitialWishShareToken());
  const [landingInviteToken, setLandingInviteToken] = useState(() => getInitialInviteToken());
  const [landingMealTaskToken, setLandingMealTaskToken] = useState(() => getInitialMealTaskToken());
  const [entryRedirectView, setEntryRedirectView] = useState("dashboard");
  const [authGateIntent, setAuthGateIntent] = useState("");
  const [libraryMealSlot, setLibraryMealSlot] = useState(null);
  const [libraryParentLabel, setLibraryParentLabel] = useState("今晚菜单");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [todayMenu, setTodayMenu] = useLocalStorageState("family-menu:today-menu", []);
  const [weekPlan, setWeekPlan] = useLocalStorageState("family-menu:week-plan", createDefaultWeekPlan);
  const [mealPlan, setMealPlan] = useLocalStorageState("humi:meal-plan:v1", () => ({}));
  const [activeWeekKey, setActiveWeekKey] = useLocalStorageState("family-menu:active-week-key", null);
  const [mealCalendar, setMealCalendar] = useLocalStorageState(
    "family-menu:meal-calendar",
    createInitialMealCalendar,
  );
  const [mealLogs, setMealLogs] = useLocalStorageState("family-menu:meal-logs:v1", {});
  const [mealExecutionRuns, setMealExecutionRuns] = useLocalStorageState("humi:meal-execution-runs:v1", []);
  const [mealEffortTier, setMealEffortTier] = useLocalStorageState("humi:meal-effort-tier:v1", "quick_15");
  const [mealExecutionQueue, setMealExecutionQueue] = useLocalStorageState("humi:meal-execution-queue:v1", []);
  const [checkedItems, setCheckedItems] = useLocalStorageState("family-menu:checked-items", {});
  const [customItems, setCustomItems] = useLocalStorageState("family-menu:custom-items", []);
  const [newCustomItem, setNewCustomItem] = useState("");
  const [pantryItems, setPantryItems] = useLocalStorageState("family-menu:pantry-items", []);
  const [excludedGroceryKeys, setExcludedGroceryKeys] = useLocalStorageState(
    "family-menu:excluded-grocery-keys",
    [],
  );
  const [draggedRecipeId, setDraggedRecipeId] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [cookingStep, setCookingStep] = useState(0);
  const [notice, setNotice] = useState(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [authStatus, setAuthStatus] = useState("");
  const [humiSession, setHumiSession] = useState(() => readHumiSession());
  const [sessionExpired, setSessionExpired] = useState(() => takeHumiSessionExpiredNotice());
  const [family, setFamily] = useState(null);
  const [humiHouseholds, setHumiHouseholds] = useState([]);
  const [familyName, setFamilyName] = useState("我们家");
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudMenuEnabled, setCloudMenuEnabled] = useLocalStorageState("humi:cloud-menu-enabled", false, {
    legacyKeys: ["familyos:cloud-menu-enabled"],
  });
  const [cloudMenuLoading, setCloudMenuLoading] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("家庭空间创建后，可把本地菜单迁移到云端。");
  const [cloudGroceryEnabled, setCloudGroceryEnabled] = useLocalStorageState("humi:cloud-grocery-enabled", false, {
    legacyKeys: ["familyos:cloud-grocery-enabled"],
  });
  const [cloudGroceryLoading, setCloudGroceryLoading] = useState(false);
  const [cloudGroceryStatus, setCloudGroceryStatus] = useState("菜单保存后，可以继续保存食材清单。");
  const [onboardingComplete, setOnboardingComplete] = useLocalStorageState("humi:onboarding-complete", false);
  const [profileOnboardingComplete, setProfileOnboardingComplete] = useLocalStorageState("humi:profile-onboarding-complete:v1", false);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [familyProfile, setFamilyProfile] = useLocalStorageState("family-menu:family-profile", defaultFamilyProfile);
  const [nutritionGoals, setNutritionGoals] = useLocalStorageState(
    "humi:nutrition-goals:v1",
    () => getDefaultNutritionGoals(defaultFamilyProfile),
  );
  const [recommendationFeedback, setRecommendationFeedback] = useLocalStorageState("family-menu:recommendation-feedback", []);
  const [craveSignals, setCraveSignals] = useLocalStorageState("humi:crave-signals:v1", []);
  const [groceryClaims, setGroceryClaims] = useLocalStorageState("humi:grocery-claims:v1", {});
  const [wishPool, setWishPool] = useLocalStorageState("humi:wish-pool:v1", []);
  const [activeCraveRequest, setActiveCraveRequest] = useLocalStorageState("humi:active-crave-request:v1", null);
  const [activeGroceryShareRequest, setActiveGroceryShareRequest] = useLocalStorageState("humi:active-grocery-share-request:v1", null);
  const [activeWishShareRequest, setActiveWishShareRequest] = useLocalStorageState("humi:active-wish-share-request:v1", null);
  const [activeHouseholdInvite, setActiveHouseholdInvite] = useLocalStorageState("humi:household-invite:v1", null);
  const [householdInvitePending, setHouseholdInvitePending] = useState(false);
  const [pendingJoinContext, setPendingJoinContext] = useLocalStorageState("humi:pending-join-context:v1", null);
  const [householdMembers, setHouseholdMembers] = useLocalStorageState("humi:household-members:v1", []);
  const [craveRequestPending, setCraveRequestPending] = useState(false);
  const [craveRequestStatus, setCraveRequestStatus] = useState("");
  const [cravePanelOpenSignal, setCravePanelOpenSignal] = useState(0);
  const [recommendationFeedbackOpen, setRecommendationFeedbackOpen] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiExplanationStatus, setAiExplanationStatus] = useState("先给你一组搭配理由；Humi 会慢慢记住家里的习惯。");
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiRecommendationStatus, setAiRecommendationStatus] = useState("先按家里现有的食材给你安排；之后会继续参考你家的口味和习惯。");
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(false);
  const [preciseRecommendationBlocked, setPreciseRecommendationBlocked] = useState(false);
  const [posterPreview, setPosterPreview] = useState(null);
  const [posterLoading, setPosterLoading] = useState(false);
  const [entryMotion, setEntryMotion] = useState(false);
  const [flowMotion, setFlowMotion] = useState(null);
  const [mealExecutionCapabilities, setMealExecutionCapabilities] = useState({ mealExecution: false });
  const [mealExecutionPending, setMealExecutionPending] = useState(false);
  const [mealExecutionStatus, setMealExecutionStatus] = useState("");
  const [mealExecutionFallback, setMealExecutionFallback] = useState(false);
  const identityComplete = humiSession?.user?.profileStatus === "complete";
  const signedIn = Boolean(humiSession?.user && identityComplete);
  const preciseRecommendationAvailable = Boolean(humiSession?.accessToken) && identityComplete && !preciseRecommendationBlocked;
  const sharedGuestLanding = isSharedGuestLanding();
  const displaySession = identityComplete ? { user: humiSession.user } : null;
  const currentHouseholdMemberId = family?.currentMemberId || humiSession?.user?.id || displaySession?.user?.id || "";
  const currentHouseholdMemberName = getDisplayName(displaySession) || "家人";
  const canManageHousehold = !isHumiApiSession(humiSession) || family?.role !== "member";
  const todayDateKey = formatDateKey(new Date());
  const mealExecutionPreview = import.meta.env.DEV
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("mealExecutionPreview") === "1";
  const mealExecutionEnabled = mealExecutionPreview || Boolean(mealExecutionCapabilities.mealExecution);
  const mealExecutionHouseholdId = family?.id || "guest";
  const weekDateKeys = useMemo(() => {
    const weekStart = getWeekStartDate();
    return Object.fromEntries(
      weekPlanDays.map((day, index) => [day, formatDateKey(addDays(weekStart, index))]),
    );
  }, [activeWeekKey]);

  useEffect(() => {
    setPreciseRecommendationBlocked(false);
  }, [humiSession?.user?.id]);

  useEffect(() => {
    setMealExecutionFallback(false);
  }, [family?.id, humiSession?.user?.id, mealExecutionCapabilities.mealExecution]);

  const slotLabelsById = useMemo(
    () => Object.fromEntries(mealSlots.map((slot) => [slot.id, slot.label])),
    [],
  );
  const todayMeals = useMemo(() => getDayMeals(mealPlan, todayDateKey), [mealPlan, todayDateKey]);
  const activeMealRun = useMemo(() => {
    const candidates = mealExecutionRuns
      .filter((run) => run?.dateKey === todayDateKey && run?.mealSlot === "dinner" && run.status !== "abandoned")
      .filter((run) => run.householdId === mealExecutionHouseholdId || (!signedIn && run.householdId === "guest"))
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
    return candidates.reduce((selected, candidate) => mergeLocalMealRun(selected, candidate), null);
  }, [mealExecutionHouseholdId, mealExecutionRuns, signedIn, todayDateKey]);
  const mealExecutionRecipeIds = activeMealRun?.recipeIds ?? candidateMealRecipeIds(mealEffortTier, todayMenu);
  const mealExecutionRecipes = useMemo(
    () => mealExecutionRecipeIds.map((recipeId) => getRecipe(recipeId)).filter(Boolean),
    [mealExecutionRecipeIds.join("|")],
  );
  const weeklyCompletedMealCount = useMemo(() => completedMealsInWeek(mealExecutionRuns, {
    householdId: mealExecutionHouseholdId,
    weekStartDateKey: formatDateKey(getWeekStartDate()),
  }), [mealExecutionHouseholdId, mealExecutionRuns]);
  const mealExecutionExperienceEnabled = mealExecutionEnabled && !mealExecutionFallback && (
    Boolean(activeMealRun)
    || todayMenu.length === 0
    || todayMenu.every((entry) => getRecipe(entry.recipeId)?.cookAssist?.status === "certified")
  );
  const breakfastChoices = useMemo(() => buildBreakfastChoices(mealLogs), [mealLogs]);
  const libraryMenuQuantities = useMemo(() => {
    if (libraryMealSlot && libraryMealSlot !== "dinner") {
      return (todayMeals[libraryMealSlot] ?? []).map((entry) => ({
        recipeId: entry.recipeId,
        quantity: entry.quantity ?? 1,
      }));
    }
    return todayMenu;
  }, [libraryMealSlot, todayMeals, todayMenu]);
  const humiStateSnapshot = useMemo(() => ({
    householdId: family?.id || "",
    todayMenu,
    weekPlan,
    mealPlan,
    mealCalendar,
    mealLogs,
    checkedItems,
    customItems,
    excludedGroceryKeys,
    pantryItems,
    familyProfile,
    nutritionGoals,
    recommendationFeedback,
    craveSignals,
    groceryClaims,
    wishPool,
    wantToEatItems: wishPool.map((item) => ({
      ...item,
      title: item.title || item.name,
      memberId: item.memberId || currentHouseholdMemberId,
      memberName: item.memberName || currentHouseholdMemberName,
      status: item.status === "done" ? "done" : "open",
    })),
    activeCraveRequest,
    activeGroceryShareRequest,
    activeWishShareRequest,
    pendingJoinContext,
    householdMembers,
  }), [
    activeCraveRequest,
    activeGroceryShareRequest,
    activeWishShareRequest,
    checkedItems,
    customItems,
    excludedGroceryKeys,
    family?.id,
    familyProfile,
    householdMembers,
    mealPlan,
    mealCalendar,
    mealLogs,
    nutritionGoals,
    pantryItems,
    pendingJoinContext,
    recommendationFeedback,
    craveSignals,
    groceryClaims,
    currentHouseholdMemberId,
    currentHouseholdMemberName,
    wishPool,
    todayMenu,
    weekPlan,
  ]);

  useEffect(() => {
    const ticket = takeHumiTicketFromUrl();
    if (!ticket) return undefined;
    let active = true;
    exchangeHumiTicket(ticket)
      .then((sessionValue) => {
        if (!active) return;
        const normalized = saveHumiSession(sessionValue);
        setHumiSession(normalized);
        setSessionExpired(false);
        setOnboardingComplete(true);
        setAuthStatus("已登录 Humi。");
        setAuthGateIntent("");
        showNotice(`欢迎回来，${normalized.user.displayName}`);
      })
      .catch((error) => {
        if (active) setAuthStatus(error.message || "登录链接已失效，请重新登录。");
      });
    return () => { active = false; };
  }, [setOnboardingComplete]);

  useEffect(() => subscribeHumiSessionInvalid(() => {
    expireHumiIdentity();
  }), []);

  useEffect(() => {
    if (!isHumiApiSession(humiSession) || !identityComplete || humiStateLoadedRef.current) return;
    let active = true;
    let completed = false;
    humiStateLoadedRef.current = true;
    humiStateHydratingRef.current = true;
    setFamily(null);
    setCloudMenuEnabled(true);
    setCloudGroceryEnabled(true);
    setCloudMenuLoading(true);
    setCloudGroceryLoading(true);
    setCloudSyncStatus("正在读取微信账号保存的菜单...");
    setCloudGroceryStatus("正在读取微信账号保存的清单...");

    async function loadWechatState() {
      try {
        const data = await loadHumiStateEnvelope(humiSession);
        if (!active) return;
        applyHumiStateEnvelope(data, { preservePendingJoin: pendingJoinContext });
        completed = true;
      } catch (error) {
        if (active) {
          if (error?.status === 401 || error?.code === "invalid_session") {
            expireHumiIdentity();
            return;
          }
          setCloudSyncStatus(formatCloudSyncError(error));
          setCloudGroceryStatus(formatCloudSyncError(error));
        }
      } finally {
        if (active) {
          setCloudMenuLoading(false);
          setCloudGroceryLoading(false);
          window.setTimeout(() => {
            humiStateHydratingRef.current = false;
          }, 0);
        }
      }
    }

    loadWechatState();
    return () => {
      active = false;
      if (!completed) {
        humiStateLoadedRef.current = false;
        humiStateHydratingRef.current = false;
      }
    };
  }, [
    humiSession,
    identityComplete,
    setCheckedItems,
    setCloudGroceryEnabled,
    setCloudMenuEnabled,
    setCustomItems,
    setExcludedGroceryKeys,
    setFamilyProfile,
    setGroceryClaims,
    setMealCalendar,
    setMealPlan,
    setMealLogs,
    setNutritionGoals,
    setPantryItems,
    setRecommendationFeedback,
    setWishPool,
    setTodayMenu,
    setWeekPlan,
  ]);

  useEffect(() => {
    if (!mealExecutionEnabled || !isHumiApiSession(humiSession) || !family?.id || !online) return undefined;
    const hydrationKey = `${humiSession.user?.id || "user"}:${family.id}:${todayDateKey}`;
    if (mealRunHydrationRef.current === hydrationKey) return undefined;
    mealRunHydrationRef.current = hydrationKey;
    let active = true;

    async function hydrateMealRun() {
      try {
        const remote = await loadCurrentHumiMealRun(humiSession, {
          householdId: family.id,
          dateKey: todayDateKey,
          mealSlot: "dinner",
        });
        if (!active) return;
        if (remote.mealRun) {
          upsertMealExecutionRun(remote.mealRun);
          return;
        }
        const guestRun = mealExecutionRuns.find((run) => (
          run?.householdId === "guest"
          && run.dateKey === todayDateKey
          && run.mealSlot === "dinner"
          && run.status !== "abandoned"
        ));
        if (!guestRun || !canManageHousehold) return;
        const created = await createHumiMealRun(humiSession, {
          householdId: family.id,
          dateKey: guestRun.dateKey,
          mealSlot: "dinner",
          effortTier: guestRun.effortTier,
          recipeIds: guestRun.recipeIds,
          readyStaple: guestRun.readyStaple,
          syncedFromLocalId: guestRun.id,
          idempotencyKey: `guest-merge:${guestRun.id}`,
        });
        let synced = created.mealRun;
        if (["cooking", "completed"].includes(guestRun.status)) {
          synced = (await startHumiMealRun(humiSession, synced.id)).mealRun;
          if (guestRun.status === "cooking" && guestRun.currentStepId) {
            synced = (await updateHumiMealRunProgress(humiSession, synced.id, {
              currentStepId: guestRun.currentStepId,
              timerEndsAt: guestRun.timerEndsAt,
            })).mealRun;
          }
          if (guestRun.status === "completed") synced = (await completeHumiMealRun(humiSession, synced.id)).mealRun;
        }
        const guestFeedback = guestRun.feedback?.at(-1)?.value;
        if (guestFeedback && synced.status === "completed") {
          synced = (await updateHumiMealRunFeedback(humiSession, synced.id, guestFeedback)).mealRun;
        }
        if (active) upsertMealExecutionRun({ ...synced, syncedFromLocalId: guestRun.id }, guestRun.id);
      } catch (error) {
        if (active) {
          mealRunHydrationRef.current = "";
          setMealExecutionStatus(error.message || "做饭记录暂时无法同步，本机仍可继续。" );
          if (!activeMealRun) setMealExecutionFallback(true);
        }
      }
    }

    hydrateMealRun();
    return () => { active = false; };
  }, [canManageHousehold, family?.id, humiSession, mealExecutionEnabled, online, todayDateKey]);

  useEffect(() => {
    if (!mealExecutionEnabled || !online || !isHumiApiSession(humiSession) || mealExecutionQueue.length === 0) return undefined;
    let active = true;

    async function flushMealExecutionQueue() {
      const completedOperationIds = [];
      for (const operation of mealExecutionQueue) {
        if (!active) return;
        try {
          let data;
          if (operation.action === "start") data = await startHumiMealRun(humiSession, operation.mealRunId);
          if (operation.action === "progress") data = await updateHumiMealRunProgress(humiSession, operation.mealRunId, operation.payload);
          if (operation.action === "complete") data = await completeHumiMealRun(humiSession, operation.mealRunId);
          if (operation.action === "abandon") data = await abandonHumiMealRun(humiSession, operation.mealRunId, operation.payload.reason);
          if (operation.action === "downgrade") data = await downgradeHumiMealRun(humiSession, operation.mealRunId, operation.payload.action);
          if (operation.action === "feedback") data = await updateHumiMealRunFeedback(humiSession, operation.mealRunId, operation.payload.value);
          if (data?.mealRun) upsertMealExecutionRun(data.mealRun);
          completedOperationIds.push(operation.id);
        } catch (error) {
          setMealExecutionStatus(error.message || "网络恢复了，但有一项做饭进度还没同步。" );
          break;
        }
      }
      if (active && completedOperationIds.length > 0) {
        const completedSet = new Set(completedOperationIds);
        setMealExecutionQueue((current) => current.filter((item) => !completedSet.has(item.id)));
      }
    }

    flushMealExecutionQueue();
    return () => { active = false; };
  }, [humiSession, mealExecutionEnabled, mealExecutionQueue, online]);

  useEffect(() => {
    if (!isHumiApiSession(humiSession) || !humiStateLoadedRef.current || humiStateHydratingRef.current) return;
    const targetHouseholdId = humiStateSnapshot.householdId;
    const timer = window.setTimeout(async () => {
      if (humiStateHydratingRef.current || !targetHouseholdId || family?.id !== targetHouseholdId) return;
      try {
        await saveHumiState(humiSession, humiStateSnapshot, targetHouseholdId);
        setCloudSyncStatus("今晚菜单和一周计划已保存到微信账号。");
        setCloudGroceryStatus("清单已保存到微信账号。");
      } catch (error) {
        setCloudSyncStatus(formatCloudSyncError(error));
        setCloudGroceryStatus(formatCloudSyncError(error));
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [family?.id, humiSession, humiStateSnapshot]);

  useEffect(() => {
    if (!isHumiApiSession(humiSession) || !pendingJoinContext?.type || !pendingJoinContext?.token || !pendingJoinContext?.guestParticipantId) return undefined;
    const mergeKey = `${pendingJoinContext.type}:${pendingJoinContext.token}:${pendingJoinContext.guestParticipantId}:${humiSession.user?.id || "user"}`;
    let cancelled = false;
    let timer;

    function mergeWhenReady() {
      if (cancelled) return;
      if (!humiStateLoadedRef.current || humiStateHydratingRef.current) {
        timer = window.setTimeout(mergeWhenReady, 100);
        return;
      }
      if (pendingJoinMergeRef.current === mergeKey) return;
      pendingJoinMergeRef.current = mergeKey;
      void acceptPendingJoinAsMember(pendingJoinContext);
    }

    mergeWhenReady();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [humiSession, pendingJoinContext]);

  useEffect(() => {
    if (Object.keys(mealPlan ?? {}).length > 0) return;
    const migratedPlan = createMealPlanFromLegacy({
      mealCalendar,
      weekPlan,
      todayMenu,
      todayDateKey,
      currentDay: getCurrentPlanDay(),
    });
    if (Object.keys(migratedPlan).length === 0) return;
    setMealPlan(migratedPlan);
  }, [mealCalendar, mealPlan, setMealPlan, todayDateKey, todayMenu, weekPlan]);

  useEffect(() => {
    if (Object.keys(mealPlan ?? {}).length === 0) return;
    const nextTodayMenu = getDayMeals(mealPlan, todayDateKey).dinner;
    setTodayMenu(nextTodayMenu);
    setMealCalendar(mealPlanToCalendar(mealPlan));
    setWeekPlan(mealPlanToWeekPlan(mealPlan, weekDateKeys));
  }, [mealPlan, setMealCalendar, setTodayMenu, setWeekPlan, todayDateKey, weekDateKeys]);

  useEffect(() => {
    return () => {
      if (posterPreview?.url) URL.revokeObjectURL(posterPreview.url);
    };
  }, [posterPreview?.url]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const currentWeekKey = getWeekKey();
    if (!activeWeekKey) {
      setActiveWeekKey(currentWeekKey);
      return;
    }
    if (activeWeekKey === currentWeekKey) return;
    const currentWeekEndKey = formatDateKey(addDays(parseDateKey(currentWeekKey), 6));
    setTodayMenu([]);
    setWeekPlan(createDefaultWeekPlan());
    setMealPlan((current) =>
      Object.fromEntries(
        Object.entries(current ?? {}).filter(([dateKey]) => dateKey < currentWeekKey || dateKey > currentWeekEndKey),
      ),
    );
    setCheckedItems({});
    setCustomItems([]);
    setExcludedGroceryKeys([]);
    setMealCalendar((current) =>
      Object.fromEntries(
        Object.entries(current ?? {}).filter(([dateKey]) => dateKey < currentWeekKey || dateKey > currentWeekEndKey),
      ),
    );
    setActiveWeekKey(currentWeekKey);
  }, [
    activeWeekKey,
    setActiveWeekKey,
    setCheckedItems,
    setCustomItems,
    setExcludedGroceryKeys,
    setMealCalendar,
    setMealPlan,
    setTodayMenu,
    setWeekPlan,
  ]);

  useEffect(() => {
    if (appOpenTrackedRef.current) return;
    appOpenTrackedRef.current = true;
    trackValidationEvent(validationEvents.homeViewed, {
      path: window.location.pathname,
      source: getLaunchChannel(),
      online,
    });
    trackValidationEvent(validationEvents.day2Returned, {
      hasMealHistory: Object.keys(mealLogs ?? {}).some((dateKey) => dateKey !== todayDateKey),
      todayDateKey,
    });
    trackValidationEvent(productEvents.appOpen, {
      path: window.location.pathname,
      source: getLaunchChannel(),
      online,
    });
  }, [mealLogs, online, todayDateKey]);

  const categories = useMemo(
    () => ["全部", ...new Set(recipes.flatMap((recipe) => recipe.categories))],
    [],
  );

  const filteredRecipes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const matchesCategory = category === "全部" || recipe.categories.includes(category);
      const haystack = [
        recipe.name,
        recipe.description,
        ...recipe.categories,
        ...recipe.tags,
        ...recipe.ingredients.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!keyword || haystack.includes(keyword));
    });
  }, [category, query]);

  const todayRecipes = todayMenu
    .map((item) => {
      const recipe = getRecipe(item.recipeId);
      return recipe ? { ...recipe, menuQuantity: item.quantity } : null;
    })
    .filter(Boolean);
  const todayMealLog = mealLogs[todayDateKey] ?? {};
  const rawPlannedEntries = mealPlanEntriesForGroceries(mealPlan, ({ dateKey, slotId }) => {
    const day = Object.entries(weekDateKeys).find(([, key]) => key === dateKey)?.[0];
    const dateLabel = day ?? formatDateLabel(dateKey);
    return `${dateLabel}·${slotLabelsById[slotId] ?? "餐次"}`;
  });
  const plannedEntries = rawPlannedEntries.filter((entry) => shouldIncludeMealEntryInGroceries(entry));
  const plannedRecipes = plannedEntries.map((entry) => getRecipe(entry.recipeId)).filter(Boolean);
  const selectedRecipe = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
  const recipeEntries = rawPlannedEntries.length > 0
    ? plannedEntries
    : [
        ...todayMenu.map((item) => ({ ...item, source: "今晚菜单" })),
        ...Object.entries(weekPlan).flatMap(([day, recipeIds]) =>
          recipeIds.map((recipeId) => ({ day, recipeId, quantity: 1, source: day })),
        ),
      ];
  const groceryGroups = useMemo(() => buildRecipeGroceryGroups(recipeEntries), [recipeEntries]);
  const groceryItems = useMemo(
    () => buildShoppingListFromEntries(recipeEntries),
    [recipeEntries],
  );
  const excludedGrocerySet = useMemo(() => new Set(excludedGroceryKeys), [excludedGroceryKeys]);
  const pantryNameSet = useMemo(
    () => new Set(pantryItems.map((item) => normalizeName(item.name))),
    [pantryItems],
  );
  const isGroceryItemOwned = (item) => excludedGrocerySet.has(item.hiddenKey) || pantryNameSet.has(normalizeName(item.name));
  const visibleGroceryGroups = useMemo(
    () =>
      groceryGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !isGroceryItemOwned(item)),
        }))
        .filter((group) => group.items.length > 0),
    [excludedGrocerySet, groceryGroups, pantryNameSet],
  );
  const visibleGroceryItems = useMemo(
    () => groceryItems.filter((item) => !isGroceryItemOwned(item)),
    [excludedGrocerySet, groceryItems, pantryNameSet],
  );
  const excludedGroceryItems = useMemo(
    () => groceryItems.filter((item) => isGroceryItemOwned(item)),
    [excludedGrocerySet, groceryItems, pantryNameSet],
  );
  const learnedCraveVotes = useMemo(
    () => collectLearnedCraveVotes(craveSignals, activeCraveRequest),
    [activeCraveRequest, craveSignals],
  );
  const todayRecommendation = useMemo(
    () => {
      const nextRecommendation = buildTodayRecommendation({
        pantryItems,
        weekPlan,
        mealLogs,
        groceryItems: visibleGroceryItems,
        todayRecipes,
        familyMembers,
        familyProfile,
        wantToEatItems: wishPool,
        craveVotes: learnedCraveVotes,
      });
      const starterFeeling = activeCraveRequest?.status === "closed"
        ? activeCraveRequest.starterFeeling || activeCraveRequest.feelingTag || ""
        : "";
      if (!starterFeeling || starterFeeling === "随便都行" || (activeCraveRequest?.votes?.length ?? 0) > 0) {
        return nextRecommendation;
      }
      return {
        ...nextRecommendation,
        reason: `先按发起时选的“${starterFeeling}”来。 ${nextRecommendation.reason}`,
      };
    },
    [activeCraveRequest, familyMembers, familyProfile, learnedCraveVotes, mealLogs, pantryItems, todayRecipes, visibleGroceryItems, weekPlan, wishPool],
  );

  useEffect(() => {
    const closedCraveVoteCount = activeCraveRequest?.status === "closed" && todayMenu.length === 0
      ? activeCraveRequest.votes?.length ?? 0
      : 0;
    const latestSoloCraveFeeling = !activeCraveRequest && todayMenu.length === 0
      ? craveSignals.find((signal) => (
          signal?.feelingTag &&
          signal.feelingTag !== "随便都行" &&
          Array.isArray(signal.recipeIds) &&
          signal.recipeIds.length > 0
        ))?.feelingTag || ""
      : "";
    setAiExplanation("");
    setAiExplanationStatus(
      closedCraveVoteCount > 0
        ? "这组解释会优先说明家人点过的感觉。"
        : signedIn
        ? "先给你一组搭配理由；Humi 会继续参考家里的习惯。"
        : "先给你一组搭配理由；Humi 会慢慢记住家里的习惯。",
    );
    setAiRecommendation(null);
    const closedStarterFeeling = activeCraveRequest?.status === "closed"
      ? activeCraveRequest.starterFeeling || activeCraveRequest.feelingTag || ""
      : "";
    setAiRecommendationStatus(
      closedCraveVoteCount > 0
        ? `已照着 ${closedCraveVoteCount} 个家人回复安排了一组，勾一下就能加入今晚菜单。`
        : closedStarterFeeling && closedStarterFeeling !== "随便都行"
          ? `已先按“${closedStarterFeeling}”安排了一组。`
        : latestSoloCraveFeeling
          ? `已先按“${latestSoloCraveFeeling}”安排了一组。`
        : signedIn
        ? "先按家里现有的食材给你安排；推荐会继续参考你家的口味和习惯。"
        : "先按家里现有的食材给你安排；之后会继续参考你家的口味和习惯。",
    );
  }, [activeCraveRequest, craveSignals, signedIn, todayMenu.length, todayRecommendation.title]);
  const displayedRecommendation = aiRecommendation ?? todayRecommendation;
  const mealExecutionProps = {
    enabled: mealExecutionExperienceEnabled,
    effortTier: mealEffortTier,
    onSelectEffortTier: selectMealExecutionEffortTier,
    planRecipes: mealExecutionRecipes,
    mealRun: activeMealRun,
    weeklyCompletedCount: weeklyCompletedMealCount,
    canAcceptPlan: !signedIn || canManageHousehold,
    signedIn,
    online,
    pending: mealExecutionPending,
    status: mealExecutionStatus,
    onAcceptPlan: acceptMealExecutionPlan,
    onStart: startMealExecutionRun,
    onProgress: progressMealExecutionRun,
    onComplete: completeMealExecutionRun,
    onAbandon: abandonMealExecutionRun,
    onDowngrade: downgradeMealExecutionRun,
    onFeedback: submitMealExecutionFeedback,
    onCreateTask: createMealExecutionTask,
    onScheduleReminder: scheduleMealExecutionReminder,
  };

  useEffect(() => {
    if (activeView !== "dashboard" || todayMenu.length > 0) return;
    trackValidationEvent(validationEvents.recommendationSeen, {
      title: displayedRecommendation.title,
      recipeIds: displayedRecommendation.recipes.map((recipe) => recipe.id),
      familySize: displayedRecommendation.familySize,
      targetDishCount: displayedRecommendation.targetDishCount,
      missingCount: displayedRecommendation.missingItems.length,
      source: displayedRecommendation.source ?? "rule",
    });
  }, [activeView, displayedRecommendation, todayMenu.length]);

  useEffect(() => {
    if (activeView !== "grocery") return;
    trackValidationEvent(validationEvents.groceryViewed, {
      itemCount: visibleGroceryItems.length,
      checkedCount: Object.values(checkedItems ?? {}).filter(Boolean).length,
    });
  }, [activeView, checkedItems, visibleGroceryItems.length]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const startedAt = window.performance?.timeOrigin ?? Date.now();
    const timer = window.setTimeout(() => {
      const paintEntries = window.performance?.getEntriesByType?.("paint") ?? [];
      const fcp = paintEntries.find((entry) => entry.name === "first-contentful-paint")?.startTime;
      const firstActionAvailable = Date.now() - startedAt;
      trackValidationEvent(validationEvents.performanceMeasured, {
        firstContentfulPaintMs: fcp ? Math.round(fcp) : null,
        firstActionAvailableMs: Math.round(firstActionAvailable),
        activeView,
        hasRecommendation: displayedRecommendation.recipes.length > 0,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    displayedRecommendation.recipes.slice(0, 4).forEach((recipe) => {
      ["hero", "thumb"].forEach((variant) => {
        const image = new Image();
        image.decoding = "async";
        image.src = photoCandidatesFor(recipe, { variant })[0];
      });
    });
  }, [displayedRecommendation]);

  function showNotice(message, options = {}) {
    setNotice({ message, illustration: options.illustration ?? null });
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(null), 1800);
  }

  function requireHouseholdManager() {
    if (canManageHousehold) return true;
    showNotice("只有主厨能修改家庭菜单和计划");
    return false;
  }

  function applyHumiStateEnvelope(data = {}, status = {}) {
    setFamily(data.family ?? null);
    setHumiHouseholds(Array.isArray(data.households) ? data.households : []);
    setMealExecutionCapabilities(data.capabilities ?? { mealExecution: false });
    const formalMembers = (data.family?.members ?? []).map((member) => ({
      id: `member:${member.memberId}`,
      memberId: member.memberId,
      name: member.nickname || "家人",
      role: member.role === "owner" ? "主厨" : "家人",
      status: "正式成员",
      joinedAt: member.joinedAt,
      avatarUrl: member.avatarUrl || "",
    }));
    const state = data.state;
    if (!state && !status.preserveStateWhenMissing) {
      setTodayMenu([]);
      setWeekPlan(createDefaultWeekPlan());
      setMealPlan({});
      setMealCalendar({});
      setMealLogs({});
      setCheckedItems({});
      setCustomItems([]);
      setExcludedGroceryKeys([]);
      setPantryItems([]);
      setFamilyProfile(defaultFamilyProfile);
      setNutritionGoals(getDefaultNutritionGoals(defaultFamilyProfile));
      setRecommendationFeedback([]);
      setCraveSignals([]);
      setGroceryClaims({});
      setWishPool([]);
      setActiveCraveRequest(null);
      setActiveGroceryShareRequest(null);
      setActiveWishShareRequest(null);
      setPendingJoinContext(status.preservePendingJoin ?? null);
      setHouseholdMembers(formalMembers);
      const noFamilyStatus = "创建或加入一个家后，可以和家人同步菜单与清单。";
      setCloudSyncStatus(status.emptyMenu || (data.family ? "这个家还没有保存菜单，可以从今晚开始。" : noFamilyStatus));
      setCloudGroceryStatus(status.emptyGrocery || (data.family ? "这个家还没有保存清单。安排一顿后会自动生成。" : noFamilyStatus));
      return;
    }
    if (!state) {
      setHouseholdMembers((current) => (
        status.preserveStateWhenMissing
          ? [
              ...formalMembers,
              ...current.filter((member) => (
                member?.status !== "formal"
                && member?.status !== "正式成员"
                && !formalMembers.some((formal) => formal.memberId && formal.memberId === member?.memberId)
              )),
            ]
          : formalMembers
      ));
      return;
    }

    const loadedWeekPlan = { ...createDefaultWeekPlan(), ...(state.weekPlan ?? {}) };
    const loadedMealCalendar = state.mealCalendar ?? createInitialMealCalendar();
    const loadedMealPlan = normalizeMealPlan(
      state.mealPlan ?? createMealPlanFromLegacy({
        mealCalendar: loadedMealCalendar,
        weekPlan: loadedWeekPlan,
        todayMenu: state.todayMenu,
        todayDateKey,
        currentDay: getCurrentPlanDay(),
      }),
    );
    const todayDinner = getDayMeals(loadedMealPlan, todayDateKey).dinner;
    setMealPlan(loadedMealPlan);
    setTodayMenu(todayDinner.length > 0 ? todayDinner : Array.isArray(state.todayMenu) ? state.todayMenu : []);
    setWeekPlan(mealPlanToWeekPlan(loadedMealPlan, weekDateKeys));
    setMealCalendar(mealPlanToCalendar(loadedMealPlan));
    setMealLogs(state.mealLogs ?? {});
    setCheckedItems(state.checkedItems ?? {});
    setCustomItems(Array.isArray(state.customItems) ? state.customItems : []);
    setExcludedGroceryKeys(Array.isArray(state.excludedGroceryKeys) ? state.excludedGroceryKeys : []);
    setPantryItems(Array.isArray(state.pantryItems) ? state.pantryItems : []);
    setFamilyProfile({ ...defaultFamilyProfile, ...(state.familyProfile ?? {}) });
    setNutritionGoals(state.nutritionGoals ?? getDefaultNutritionGoals(state.familyProfile ?? defaultFamilyProfile));
    setRecommendationFeedback(Array.isArray(state.recommendationFeedback) ? state.recommendationFeedback : []);
    setCraveSignals(Array.isArray(state.craveSignals) ? state.craveSignals : []);
    setGroceryClaims(state.groceryClaims && typeof state.groceryClaims === "object" ? state.groceryClaims : {});
    setWishPool(normalizeWishPoolState(state));
    setActiveCraveRequest(restoreActiveCraveRequest(state));
    setActiveGroceryShareRequest(state.activeGroceryShareRequest ?? null);
    setActiveWishShareRequest(state.activeWishShareRequest ?? null);
    setPendingJoinContext(status.preservePendingJoin ?? state.pendingJoinContext ?? null);
    const stateMembers = Array.isArray(state.householdMembers) ? state.householdMembers : [];
    setHouseholdMembers([
      ...formalMembers,
      ...stateMembers.filter((member) => !formalMembers.some((formal) => formal.memberId && formal.memberId === member.memberId)),
    ]);
    setCloudSyncStatus(status.loadedMenu || "已读取当前家的今晚菜单和一周计划。");
    setCloudGroceryStatus(status.loadedGrocery || "已读取当前家的食材清单。");
  }

  function trackProductEvent(eventName, payload = {}) {
    trackValidationEvent(eventName, payload);
  }

  function trackMealExecutionEvent(eventType, payload = {}) {
    trackValidationEvent(eventType, payload);
    if (!mealExecutionCapabilities.mealExecution || !isHumiApiSession(humiSession) || !family?.id) return;
    recordHumiProductEvent(humiSession, {
      eventType,
      effortTier: payload.effortTier || mealEffortTier,
      mealRunId: payload.mealRunId || activeMealRun?.id || "",
      recommendationId: payload.recommendationId || "",
    }).catch(() => {});
  }

  function upsertMealExecutionRun(nextRun, replaceRunId = "") {
    if (!nextRun?.id) return;
    setMealExecutionRuns((current) => {
      const nextRuns = [nextRun, ...current.filter((run) => (
        run?.id !== nextRun.id
        && (!replaceRunId || run?.id !== replaceRunId)
        && (!nextRun.syncedFromLocalId || run?.id !== nextRun.syncedFromLocalId)
      ))].slice(0, 200);
      persistMealExecutionValue("humi:meal-execution-runs:v1", nextRuns);
      return nextRuns;
    });
  }

  function setMealExecutionMenu(recipeIds) {
    const entries = recipeIds.map((recipeId) => ({ recipeId, quantity: 1 }));
    setTodayMenu(entries);
    updateMealPlanSlot(todayDateKey, "dinner", () => entries);
  }

  function selectMealExecutionEffortTier(effortTier) {
    setMealEffortTier(effortTier);
    persistMealExecutionValue("humi:meal-effort-tier:v1", effortTier);
    setMealExecutionStatus("");
    trackMealExecutionEvent(productEvents.effortTierSelected, { effortTier });
    trackMealExecutionEvent(productEvents.planPresented, {
      effortTier,
      recommendationId: `${todayDateKey}:${effortTier}`,
    });
  }

  async function acceptMealExecutionPlan() {
    if (mealExecutionRecipeIds.length === 0 || activeMealRun) return;
    setMealExecutionPending(true);
    setMealExecutionStatus("");
    try {
      let nextRun;
      if (isHumiApiSession(humiSession) && family?.id) {
        if (!canManageHousehold) {
          setMealExecutionStatus("主厨选好今晚菜单后，你就可以直接开始。" );
          return;
        }
        const data = await createHumiMealRun(humiSession, {
          householdId: family.id,
          dateKey: todayDateKey,
          mealSlot: "dinner",
          effortTier: mealEffortTier,
          recipeIds: mealExecutionRecipeIds,
          idempotencyKey: `tonight:${family.id}:${todayDateKey}:${mealEffortTier}:${mealExecutionRecipeIds.join("+")}`,
        });
        nextRun = data.mealRun;
      } else {
        nextRun = createLocalMealRun({
          householdId: "guest",
          dateKey: todayDateKey,
          effortTier: mealEffortTier,
          recipeIds: mealExecutionRecipeIds,
        });
      }
      upsertMealExecutionRun(nextRun);
      setMealExecutionMenu(nextRun.recipeIds);
      trackMealExecutionEvent(productEvents.planAccepted, {
        effortTier: nextRun.effortTier,
        mealRunId: nextRun.id,
        recommendationId: `${todayDateKey}:${nextRun.effortTier}`,
      });
      setMealExecutionStatus("今晚就按这套来，想开始时再点开始做。" );
    } catch (error) {
      setMealExecutionStatus(error.message || "这套方案暂时没保存下来，请稍后再试。" );
      if (isHumiApiSession(humiSession)) setMealExecutionFallback(true);
    } finally {
      setMealExecutionPending(false);
    }
  }

  async function startMealExecutionRun() {
    if (!activeMealRun) return;
    await performMealRunTransition("start");
  }

  async function progressMealExecutionRun(step) {
    if (!activeMealRun || !step?.id) return;
    const timerEndsAt = step.attention === "passive" ? step.endsAt : "";
    await performMealRunTransition("progress", { currentStepId: step.id, timerEndsAt });
  }

  async function completeMealExecutionRun() {
    if (!activeMealRun) return;
    const completed = await performMealRunTransition("complete");
    if (!completed) return;
    const entries = completed.recipeIds.map((recipeId) => ({ recipeId, quantity: 1 }));
    const recordedBy = getDisplayName(displaySession) || "我";
    updateTodayMealLog({
      source: "home",
      recordedBy,
      confirmation: "all",
      confirmedBy: recordedBy,
      consumedEntries: entries,
      mealRunId: completed.id,
    });
    trackValidationEvent(validationEvents.mealConfirmed, {
      confirmation: "all",
      consumedCount: entries.length,
      dateKey: todayDateKey,
      source: "meal_execution",
    });
  }

  async function abandonMealExecutionRun(reason) {
    if (!activeMealRun) return;
    await performMealRunTransition("abandon", { reason });
  }

  async function downgradeMealExecutionRun(action) {
    if (!activeMealRun) return;
    setMealExecutionPending(true);
    setMealExecutionStatus("");
    try {
      const data = isHumiApiSession(humiSession) && family?.id && online
        ? await downgradeHumiMealRun(humiSession, activeMealRun.id, action)
        : { mealRun: downgradeLocalMealRun(activeMealRun, action, { userId: currentHouseholdMemberId || "guest" }) };
      const nextRun = online || !isHumiApiSession(humiSession)
        ? data.mealRun
        : { ...data.mealRun, syncStatus: "pending" };
      upsertMealExecutionRun(nextRun);
      if (!online && isHumiApiSession(humiSession) && family?.id) {
        enqueueMealExecutionOperation(activeMealRun.id, "downgrade", { action });
      }
      if (canManageHousehold) setMealExecutionMenu(nextRun.recipeIds);
      setMealExecutionStatus("已经把这顿再减轻一点。" );
    } catch (error) {
      setMealExecutionStatus(error.message || "暂时没能调整方案。" );
    } finally {
      setMealExecutionPending(false);
    }
  }

  async function submitMealExecutionFeedback(value) {
    if (!activeMealRun) return;
    setMealExecutionPending(true);
    try {
      const data = isHumiApiSession(humiSession) && family?.id && online
        ? await updateHumiMealRunFeedback(humiSession, activeMealRun.id, value)
        : { mealRun: transitionLocalMealRun(activeMealRun, "feedback", { value, userId: currentHouseholdMemberId || "guest" }) };
      const nextRun = !online && isHumiApiSession(humiSession)
        ? { ...data.mealRun, syncStatus: "pending" }
        : data.mealRun;
      upsertMealExecutionRun(nextRun);
      if (!online && isHumiApiSession(humiSession) && family?.id) {
        enqueueMealExecutionOperation(activeMealRun.id, "feedback", { value });
      }
      setMealExecutionStatus("记住了，下次推荐会参考这次感受。" );
    } catch (error) {
      setMealExecutionStatus(error.message || "反馈暂时没保存下来。" );
    } finally {
      setMealExecutionPending(false);
    }
  }

  async function createMealExecutionTask(type) {
    if (!activeMealRun) return;
    if (!isHumiApiSession(humiSession) || !family?.id) {
      setMealExecutionStatus("登录并加入家庭后，才能把具体任务发给家人。" );
      return;
    }
    setMealExecutionPending(true);
    try {
      const recipe = mealExecutionRecipes[0];
      const firstIngredient = recipe?.ingredients?.[0]?.name || "晚饭食材";
      const prepStep = activeMealRun.recipeSnapshot
        ?.flatMap((item) => item.cookAssist?.steps ?? [])
        .find((step) => step.phase === "prep");
      const payload = type === "buy"
        ? { type: "buy", ingredientName: firstIngredient }
        : { type: "prep", stepId: prepStep?.id || "" };
      const data = await createHumiMealTask(humiSession, activeMealRun.id, payload);
      const label = type === "buy" ? `请家人买${firstIngredient}` : `请家人${prepStep?.text || "帮忙备菜"}`;
      const nativeStatus = await requestMiniProgramShare({
        type: "meal_task",
        token: data.task.token,
        label,
        householdName: family?.name || "我家",
        initiatorName: getDisplayName(displaySession) || "家人",
      });
      if (nativeStatus !== "handoff") {
        await copyShareUrl(buildMealTaskUrl(data.task.token));
        setMealExecutionStatus(isWechatMiniProgramWebView() ? "发送页暂时没打开，请再试一次。" : "任务链接已复制。" );
      }
    } catch (error) {
      setMealExecutionStatus(error.message || "任务暂时没有生成。" );
    } finally {
      setMealExecutionPending(false);
    }
  }

  async function scheduleMealExecutionReminder(value) {
    if (!signedIn) {
      setMealExecutionStatus("登录后再预约，烹饪不会受影响。" );
      return;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      setMealExecutionStatus("请选择一个有效的下次做饭时间。" );
      return;
    }
    const scheduledAt = date.toISOString();
    const handoff = await requestMiniProgramReminder({
      scheduledAt,
      dateKey: String(value).slice(0, 10),
      effortTier: activeMealRun?.effortTier || mealEffortTier,
      mealRunId: activeMealRun?.id || "",
    });
    if (handoff === "handoff") {
      setMealExecutionStatus(`已选 ${formatReminderDate(value)}，请在微信页确认是否接收一次提醒。`);
      return;
    }
    setMealExecutionStatus("请在微信小程序里预约，网页不会自行索取微信提醒权限。" );
  }

  async function performMealRunTransition(action, payload = {}) {
    setMealExecutionPending(true);
    setMealExecutionStatus("");
    try {
      let nextRun;
      if (isHumiApiSession(humiSession) && family?.id && online) {
        if (action === "start") nextRun = (await startHumiMealRun(humiSession, activeMealRun.id)).mealRun;
        if (action === "progress") nextRun = (await updateHumiMealRunProgress(humiSession, activeMealRun.id, payload)).mealRun;
        if (action === "complete") nextRun = (await completeHumiMealRun(humiSession, activeMealRun.id)).mealRun;
        if (action === "abandon") nextRun = (await abandonHumiMealRun(humiSession, activeMealRun.id, payload.reason)).mealRun;
      } else {
        nextRun = transitionLocalMealRun(activeMealRun, action, {
          ...payload,
          userId: currentHouseholdMemberId || "guest",
        });
        if (isHumiApiSession(humiSession) && family?.id) {
          nextRun = { ...nextRun, syncStatus: "pending" };
          enqueueMealExecutionOperation(activeMealRun.id, action, payload);
        }
      }
      upsertMealExecutionRun(nextRun);
      return nextRun;
    } catch (error) {
      if (isHumiApiSession(humiSession) && family?.id && isMealExecutionNetworkError(error)) {
        const pendingRun = {
          ...transitionLocalMealRun(activeMealRun, action, {
            ...payload,
            userId: currentHouseholdMemberId || "guest",
          }),
          syncStatus: "pending",
        };
        enqueueMealExecutionOperation(activeMealRun.id, action, payload);
        upsertMealExecutionRun(pendingRun);
        setMealExecutionStatus("网络不稳，进度已先保存在本机，恢复后会同步。" );
        return pendingRun;
      }
      setMealExecutionStatus(error.message || "操作暂时没保存，本页不会把这顿算作完成。" );
      return null;
    } finally {
      setMealExecutionPending(false);
    }
  }

  function enqueueMealExecutionOperation(mealRunId, action, payload = {}) {
    setMealExecutionQueue((current) => {
      const nextQueue = [...current, {
        id: `${mealRunId}:${action}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        mealRunId,
        action,
        payload,
      }].slice(-100);
      persistMealExecutionValue("humi:meal-execution-queue:v1", nextQueue);
      return nextQueue;
    });
  }

  function exportLocalValidationData(format = "json") {
    const data = exportValidationData({ mealLogs, familyProfile, recommendationFeedback });
    const isCsv = format === "csv";
    const content = isCsv ? validationEventsToCsv(data.events) : JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: isCsv ? "text/csv;charset=utf-8" : "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `humi-validation-${todayDateKey}.${isCsv ? "csv" : "json"}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showNotice("反馈记录已保存到本机");
  }

  function openRecipe(recipeId) {
    setSelectedRecipeId(recipeId);
    setCookingStep(0);
  }

  function closeRecipe() {
    setSelectedRecipeId(null);
    setCookingStep(0);
  }

  function updateMealPlanSlot(dateKey, slotId, updater) {
    setMealPlan((current) => {
      const currentDayMeals = getDayMeals(current, dateKey);
      const currentEntries = currentDayMeals[slotId] ?? [];
      const nextEntries = normalizeMealEntries(updater(currentEntries));
      return {
        ...current,
        [dateKey]: {
          ...currentDayMeals,
          [slotId]: nextEntries,
        },
      };
    });
  }

  function assignMealRecipe(dateKey, slotId, recipeId, quantity = 1) {
    if (!requireHouseholdManager()) return;
    const recipe = getRecipe(recipeId);
    const slotLabel = slotLabelsById[slotId] ?? "餐次";
    updateMealPlanSlot(dateKey, slotId, (entries) => upsertMealEntry(entries, recipeId, quantity));
    trackProductEvent(productEvents.weekPlanAdd, {
      recipeIds: [recipeId],
      dateKey,
      mealSlot: slotId,
      source: "manual_meal_slot",
    });
    showNotice(`${recipe?.name ?? "菜品"} 已添加到${formatDateLabel(dateKey)}${slotLabel}`);
  }

  function removeMealRecipe(dateKey, slotId, recipeId) {
    if (!requireHouseholdManager()) return;
    updateMealPlanSlot(dateKey, slotId, (entries) => removeMealEntry(entries, recipeId));
    if (dateKey === todayDateKey && slotId === "dinner") {
      const nextMenu = todayMenu.filter((item) => item.recipeId !== recipeId);
      syncHomeMealLogWithMenu(nextMenu);
    }
    showNotice("已从计划中移除");
  }

  function addToday(recipeId, quantity = 1) {
    if (!requireHouseholdManager()) return;
    const recipe = getRecipe(recipeId);
    const currentDay = getCurrentPlanDay();
    const todayKey = formatDateKey(new Date());
    const alreadyInCurrentPlan = (weekPlan[currentDay] ?? []).includes(recipeId);
    const alreadyInTodayPlan = (mealCalendar[todayKey] ?? []).includes(recipeId);
    const safeQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    updateMealPlanSlot(todayKey, "dinner", (entries) => upsertMealEntry(entries, recipeId, quantity));
    setTodayMenu((current) => {
      const existing = current.find((item) => item.recipeId === recipeId);
      if (existing) {
        const nextMenu = current.map((item) =>
          item.recipeId === recipeId ? { ...item, quantity: item.quantity + safeQuantity } : item,
        );
        syncHomeMealLogWithMenu(nextMenu, { defaultSelectedRecipeId: recipeId });
        return nextMenu;
      }
      const nextMenu = [...current, { recipeId, quantity: safeQuantity }];
      syncHomeMealLogWithMenu(nextMenu, { defaultSelectedRecipeId: recipeId });
      return nextMenu;
    });
    if (!alreadyInCurrentPlan) {
      setWeekPlan((current) => {
        const currentDayPlan = current[currentDay] ?? [];
        if (currentDayPlan.includes(recipeId)) return current;
        return { ...current, [currentDay]: [...currentDayPlan, recipeId] };
      });
    }
    if (!alreadyInTodayPlan) {
      setMealCalendar((current) => ({
        ...current,
        [todayKey]: [...(current[todayKey] ?? []), recipeId],
      }));
    }
    if (!alreadyInCurrentPlan || !alreadyInTodayPlan) {
      showNotice(`${recipe?.name ?? "菜品"} 已安排到今晚和${currentDay}`, {
        illustration: "menu-accepted",
      });
      return;
    }
    showNotice(`${recipe?.name ?? "菜品"} 已放进今晚菜单`, {
      illustration: "menu-accepted",
    });
  }

  function addRecommendedToday() {
    if (!requireHouseholdManager()) return;
    acceptRecommendationItems();
  }

  function addSelectedRecommendedToday(recipeIds = []) {
    const selectedIds = new Set(recipeIds);
    if (selectedIds.size === 0) {
      showNotice("先勾选今晚要做的菜");
      return;
    }
    acceptRecommendationItems(selectedIds);
  }

  function acceptRecommendationItems(selectedIds = null) {
    const recommendedItems = getRecommendationItems(displayedRecommendation)
      .filter((item) => !selectedIds || selectedIds.has(item.recipe.id))
      .filter((item) => !todayMenu.some((menuItem) => menuItem.recipeId === item.recipe.id));

    if (recommendedItems.length === 0) {
      showNotice(selectedIds ? "勾选的菜已经在今晚菜单里" : "这组菜已经在今晚菜单里");
      return;
    }

    recommendedItems.forEach((item) => addToday(item.recipe.id, item.quantity));
    trackProductEvent(productEvents.recommendationAccepted, {
      recipeIds: recommendedItems.map((item) => item.recipe.id),
      quantities: recommendedItems.map((item) => ({
        recipeId: item.recipe.id,
        quantity: item.quantity,
      })),
      source: displayedRecommendation.source ?? "rule",
      missingCount: displayedRecommendation.missingItems.length,
      familySize: displayedRecommendation.familySize ?? familyProfile.familySize,
    });
    showNotice(selectedIds ? `已按征集确认 ${recommendedItems.length} 道菜` : `已加入 ${recommendedItems.length} 道推荐菜`, {
      illustration: "menu-accepted",
    });
  }

  async function startCraveRequest(feelingTag, options = {}) {
    if (!signedIn) {
      setEntryRedirectView("dashboard");
      if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
        showNotice("登录后就能发起征集，家人点卡片仍然免登录");
      } else {
        setAuthGateIntent("startCrave");
      }
      return;
    }
    if (isHumiApiSession(humiSession) && family?.role && family.role !== "owner") {
      showNotice("这个家的征集需要主厨发起；家人可以直接点感觉或丢想吃。");
      return;
    }
    const safeFeeling = feelingTag || "随便都行";
    const audience = Array.isArray(options.audience) && options.audience.length > 0
      ? options.audience
      : [{ id: "share-card-family", name: "家人", meta: "通过小程序卡片免登录参与" }];
    setCraveRequestPending(true);
    setCraveRequestStatus("");
    try {
      const data = await createCraveRequest({
        householdId: family?.id ?? "",
        ownerId: humiSession?.user?.id ?? "",
        householdName: family?.name ?? familyName ?? "我家",
        initiatorName: getDisplayName(displaySession) ?? "主厨",
        mealType: "dinner",
        starterFeeling: safeFeeling,
        initialFeelingTag: safeFeeling,
        recipientIds: audience.map((person) => person.id).filter(Boolean),
        targetParticipantNames: audience.map((person) => person.name).filter(Boolean),
      }, isHumiApiSession(humiSession) ? humiSession : null);
      const nextRequest = {
        ...data.request,
        ownerSecret: data.ownerSecret,
        starterFeeling: safeFeeling,
        audience,
        targetParticipantNames: audience.map((person) => person.name).filter(Boolean),
      };
      setActiveCraveRequest(nextRequest);
      setCraveRequestStatus("征集单准备好了，发给家人点一下就行。");
      trackProductEvent(productEvents.share, { type: "crave_request_created", method: "api" });
      void shareCraveRequest(nextRequest);
    } catch (error) {
      setCraveRequestStatus(error.message || "征集单暂时没生成，请稍后再试。");
      showNotice("协作征集暂时没连上");
    } finally {
      setCraveRequestPending(false);
    }
  }

  function applyCraveRecommendation({ request, fallbackFeeling = "随便都行" } = {}) {
    const votes = request?.votes ?? [];
    const primaryVote = votes.find((vote) => vote.feelingTag && vote.feelingTag !== "随便都行");
    const safeFeeling = primaryVote?.feelingTag || request?.starterFeeling || fallbackFeeling || "随便都行";
    const currentCraveVotes = collectLearnedCraveVotes(craveSignals, request, safeFeeling);
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const alternateRuleRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      mealLogs,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      familyProfile,
      wantToEatItems: wishPool,
      craveVotes: currentCraveVotes,
      excludedRecipeIds: safeFeeling === "随便都行" ? [] : currentRecipeIds,
    });
    const voteReason = votes.length > 0
      ? `照顾到：${votes.map(formatCraveVoteSummary).join(" · ")}。`
      : safeFeeling === "随便都行"
        ? "没人回复也没关系，先按忌口和省心程度来。"
        : `先按发起时选的“${safeFeeling}”来。`;
    const nextRecommendation = {
      ...alternateRuleRecommendation,
      source: "rule",
      reason: `${voteReason} ${alternateRuleRecommendation.reason}`,
    };
    upsertCraveSignal({
      request,
      fallbackFeeling: safeFeeling,
      recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
    });
    setAiRecommendation(nextRecommendation);
    setAiRecommendationStatus(
      votes.length > 0
        ? `收到 ${votes.length} 个家人回复，已经安排出一组。`
        : safeFeeling === "随便都行"
          ? "没人回复也没关系。已按家庭忌口和省心程度给一组。"
          : `已先按“${safeFeeling}”安排出一组。`,
    );
    trackProductEvent(productEvents.recommendationRequest, {
      source: "crave_signal",
      feelingTag: safeFeeling,
      voteCount: votes.length,
      recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
    });
    showNotice(votes.length > 0 ? "已按家人感觉出菜单" : safeFeeling === "随便都行" ? "那就 Humi 来做主" : `已按“${safeFeeling}”换一组`);
  }

  function upsertCraveSignal({ request, fallbackFeeling = "随便都行", recipeIds = [] } = {}) {
    const votes = Array.isArray(request?.votes) ? request.votes : [];
    const primaryVote = votes.find((vote) => vote.feelingTag && vote.feelingTag !== "随便都行");
    const safeFeeling = primaryVote?.feelingTag || request?.starterFeeling || fallbackFeeling || "随便都行";
    if (votes.length === 0 && !safeFeeling) return;

    const requestToken = request?.token || "";
    const signalId = requestToken ? `crave:${requestToken}` : `crave:${Date.now()}`;
    const now = new Date().toISOString();
    setCraveSignals((current) => {
      const existing = current.find((item) => item.id === signalId || (requestToken && item.requestToken === requestToken));
      const nextSignal = {
        ...(existing ?? {}),
        id: existing?.id || signalId,
        requestToken,
        householdId: request?.householdId || existing?.householdId || family?.id || "",
        ownerId: request?.ownerId || existing?.ownerId || humiSession?.user?.id || "",
        householdName: request?.householdName || existing?.householdName || family?.name || familyName || "我家",
        initiatorName: request?.initiatorName || existing?.initiatorName || getDisplayName(displaySession) || "主厨",
        feelingTag: safeFeeling,
        voteCount: votes.length,
        votes,
        recipeIds: recipeIds.length > 0 ? recipeIds : existing?.recipeIds ?? [],
        createdAt: existing?.createdAt || request?.createdAt || now,
        updatedAt: now,
      };
      return [
        nextSignal,
        ...current.filter((item) => item.id !== nextSignal.id && (!requestToken || item.requestToken !== requestToken)),
      ].slice(0, 24);
    });
  }

  async function shareCraveRequest(request = activeCraveRequest) {
    if (!request?.token) {
      showNotice("先生成征集单");
      return false;
    }
    const nativeShareStatus = await requestMiniProgramShare({
      type: "crave",
      token: request.token,
      householdName: request.householdName || family?.name || familyName || "我家",
      initiatorName: request.initiatorName || getDisplayName(displaySession) || "主厨",
      voteCount: request.votes?.length ?? 0,
    });
    if (nativeShareStatus === "handoff") {
      return true;
    }
    if (isWechatMiniProgramWebView()) {
      showNotice("没能打开微信发送页，请再试一次");
      return false;
    }
    await copyShareUrl(buildCraveUrl(request.token));
    showNotice("征集链接已复制");
    return true;
  }

  function formatCraveVoteSummary(vote) {
    const name = vote.memberName || "家人";
    const feeling = vote.feelingTag || "随便都行";
    return vote.dishWish
      ? `${name}想要“${feeling}”，还提到“${vote.dishWish}”`
      : `${name}想要“${feeling}”`;
  }

  async function refreshCraveRequest() {
    if (!activeCraveRequest?.token) {
      showNotice("先生成征集单");
      return;
    }
    setCraveRequestPending(true);
    setCraveRequestStatus("");
    try {
      const data = await loadCraveRequest(activeCraveRequest.token);
      const nextRequest = { ...activeCraveRequest, ...data.request };
      setActiveCraveRequest(nextRequest);
      collectGuestDishWishes(nextRequest.votes);
      if ((nextRequest.votes ?? []).length > 0) {
        upsertCraveSignal({ request: nextRequest, fallbackFeeling: nextRequest.starterFeeling || "随便都行" });
      }
      setCraveRequestStatus(data.request.votes?.length > 0 ? `已收到 ${data.request.votes.length} 个回复。` : "还没人回复，可以先出菜单。");
    } catch (error) {
      setCraveRequestStatus(error.message || "刷新失败，请稍后再试。");
    } finally {
      setCraveRequestPending(false);
    }
  }

  async function finishCraveRequest(fallbackFeeling = "随便都行") {
    const safeFallbackFeeling = typeof fallbackFeeling === "string" && fallbackFeeling.trim()
      ? fallbackFeeling.trim()
      : "随便都行";
    const request = activeCraveRequest;
    if (!request?.token) {
      applyCraveRecommendation({ fallbackFeeling: safeFallbackFeeling });
      return;
    }
    setCraveRequestPending(true);
    setCraveRequestStatus("");
    try {
      const latest = await loadCraveRequest(request.token);
      const mergedRequest = { ...request, ...latest.request };
      if ((request.ownerSecret || isHumiApiSession(humiSession)) && mergedRequest.status === "open") {
        await closeCraveRequest(
          request.token,
          request.ownerSecret,
          {},
          isHumiApiSession(humiSession) ? humiSession : null,
        );
      }
      setActiveCraveRequest({ ...mergedRequest, status: "closed" });
      collectGuestDishWishes(mergedRequest.votes);
      applyCraveRecommendation({ request: mergedRequest });
      setCraveRequestStatus("已按这次征集出菜单。");
    } catch (error) {
      setCraveRequestStatus(error.message || "暂时没能生成菜单，先按当前回复在本机安排。");
      setActiveCraveRequest({ ...request, status: "closed" });
      applyCraveRecommendation({ request });
    } finally {
      setCraveRequestPending(false);
    }
  }

  function restartCraveFeelingChoice() {
    setActiveCraveRequest(null);
    setCraveRequestStatus("可以重新选一个感觉，或者直接去全部菜品库自己搭。");
    setCraveRequestPending(false);
  }

  function pickForMeal(slotId, initialCategory = "全部") {
    const slotLabel = slotLabelsById[slotId] ?? "这一餐";
    setLibraryMealSlot(slotId);
    setLibraryParentLabel("今晚菜单");
    setCategory(initialCategory);
    setQuery("");
    navigateTo("library");
    showNotice(`选择${slotLabel}吃什么`);
  }

  function openRecipeLibrary(preferredCategory = "全部") {
    const nextCategory = typeof preferredCategory === "string" && preferredCategory ? preferredCategory : "全部";
    setLibraryMealSlot(null);
    setLibraryParentLabel(getLibraryParentLabel(activeView));
    setCategory(nextCategory);
    setQuery("");
    navigateTo("library");
  }

  function chooseBreakfast(recipeId) {
    const entries = [{ recipeId, quantity: 1 }];
    const now = new Date().toISOString();
    updateMealPlanSlot(todayDateKey, "breakfast", () => entries);
    updateTodayMealLog({
      mealSources: {
        ...(todayMealLog.mealSources ?? {}),
        breakfast: "home",
      },
      meals: {
        ...(todayMealLog.meals ?? {}),
        breakfast: {
          ...(todayMealLog.meals?.breakfast ?? {}),
          source: "home",
          selectionMode: "explicit",
          consumedEntries: entries,
          quickRecordedAt: now,
          updatedAt: now,
        },
      },
      pantryConsumedRecipeIds: consumePantryForMealEntries(entries),
    });
    trackValidationEvent(validationEvents.mealSourceSelected, {
      mealSlot: "breakfast",
      source: "home",
      recipeIds: [recipeId],
      dateKey: todayDateKey,
      interaction: "quick_pick",
    });
    showNotice(`${getRecipe(recipeId)?.name ?? "早餐"} 已记为今天早餐`);
  }

  function addRecipeFromLibrary(recipeId) {
    if (libraryMealSlot && libraryMealSlot !== "dinner") {
      assignMealRecipe(todayDateKey, libraryMealSlot, recipeId);
      markMealSource(libraryMealSlot, "home");
      return;
    }
    addToday(recipeId);
  }

  function updateLibraryQuantity(recipeId, delta) {
    if (libraryMealSlot && libraryMealSlot !== "dinner") {
      if (delta > 0) assignMealRecipe(todayDateKey, libraryMealSlot, recipeId);
      else removeMealRecipe(todayDateKey, libraryMealSlot, recipeId);
      return;
    }
    updateTodayQuantity(recipeId, delta);
  }

  function addRecipeToWishPool(recipeId) {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;
    setWishPool((current) => {
      const memberId = currentHouseholdMemberId;
      if (current.some((item) => item.recipeId === recipeId && (!memberId || item.memberId === memberId))) return current;
      return [
        {
          id: `wish:${Date.now()}:${recipeId}`,
          recipeId,
          name: recipe.name,
          title: recipe.name,
          memberId,
          memberName: currentHouseholdMemberName,
          status: "open",
          createdAt: new Date().toISOString(),
          source: libraryMealSlot ? slotLabelsById[libraryMealSlot] || "这一餐" : "全部菜品",
        },
        ...current,
      ].slice(0, 30);
    });
    showNotice(`已经记下想吃 ${recipe.name}`);
  }

  function collectGuestDishWishes(votes = []) {
    const wishes = votes
      .map((vote) => ({
        name: String(vote.dishWish || "").trim(),
        memberName: vote.memberName || "家人",
      }))
      .filter((item) => item.name);
    if (wishes.length === 0) return;

    setWishPool((current) => {
      const existingKeys = new Set(current.map((item) => normalizeName(item.recipeId || item.name)));
      const additions = wishes
        .map((wish, index) => {
          const matchedRecipe = findRecipeByName(wish.name);
          const key = normalizeName(matchedRecipe?.id || wish.name);
          if (existingKeys.has(key)) return null;
          existingKeys.add(key);
          return {
            id: `wish:guest:${Date.now()}:${index}`,
            recipeId: matchedRecipe?.id || "",
            name: matchedRecipe?.name || wish.name,
            createdAt: new Date().toISOString(),
            source: `${wish.memberName}想吃`,
          };
        })
        .filter(Boolean);
      return additions.length > 0 ? [...additions, ...current].slice(0, 30) : current;
    });
  }

  function collectWishShareEntries(wishes = []) {
    const entries = wishes
      .map((wish) => ({
        name: String(wish.dishName || wish.name || "").trim(),
        memberName: wish.memberName || "家人",
        note: String(wish.note || "").trim(),
        participantKey: wish.participantKey || "",
      }))
      .filter((item) => item.name);
    if (entries.length === 0) return 0;

    let addedCount = 0;
    setWishPool((current) => {
      const existingKeys = new Set(current.map((item) => normalizeName(item.recipeId || item.name)));
      const additions = entries
        .map((wish, index) => {
          const matchedRecipe = findRecipeByName(wish.name);
          const key = normalizeName(matchedRecipe?.id || wish.name);
          if (existingKeys.has(key)) return null;
          existingKeys.add(key);
          addedCount += 1;
          return {
            id: `wish:share:${Date.now()}:${index}`,
            recipeId: matchedRecipe?.id || "",
            name: matchedRecipe?.name || wish.name,
            createdAt: new Date().toISOString(),
            source: `${wish.memberName}想吃${wish.note ? ` · ${wish.note}` : ""}`,
            participantKey: wish.participantKey,
            temporary: true,
          };
        })
        .filter(Boolean);
      return additions.length > 0 ? [...additions, ...current].slice(0, 40) : current;
    });
    return addedCount;
  }

  async function startWishShareRequest() {
    if (!signedIn) {
      setEntryRedirectView("user");
      if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
        showNotice("登录后就能分享想吃入口，家人写菜仍然免登录");
      } else {
        setAuthGateIntent("startCollaboration");
      }
      return;
    }
    if (isHumiApiSession(humiSession) && family?.role && family.role !== "owner") {
      showNotice("这个家的想吃入口需要主厨分享；家人可以直接写想吃。");
      return;
    }
    try {
      const data = await createWishShareRequest({
        householdId: family?.id ?? "",
        ownerId: humiSession?.user?.id ?? "",
        householdName: family?.name ?? familyName ?? "我家",
        initiatorName: getDisplayName(displaySession) || "主厨",
        title: "家里最近想吃什么",
      }, isHumiApiSession(humiSession) ? humiSession : null);
      const nextRequest = {
        ...data.request,
        ownerSecret: data.ownerSecret,
      };
      setActiveWishShareRequest(nextRequest);
      trackProductEvent(productEvents.share, { type: "wish_share_created", method: "api" });
      await shareWishRequest(nextRequest);
    } catch (error) {
      showNotice(error.message || "想吃入口暂时没生成");
    }
  }

  async function shareWishRequest(request = activeWishShareRequest) {
    if (!request?.token) {
      await startWishShareRequest();
      return false;
    }
    const nativeShareStatus = await requestMiniProgramShare({
      type: "wish",
      token: request.token,
      householdName: request.householdName || family?.name || familyName || "我家",
      initiatorName: request.initiatorName || getDisplayName(displaySession) || "主厨",
      wishCount: request.wishes?.length ?? 0,
    });
    if (nativeShareStatus === "handoff") {
      return true;
    }
    if (isWechatMiniProgramWebView()) {
      showNotice("没能打开微信发送页，请再试一次");
      return false;
    }
    await copyShareUrl(buildWishShareUrl(request.token));
    showNotice("想吃入口链接已复制");
    return true;
  }

  async function refreshWishShareRequest() {
    if (!activeWishShareRequest?.token) {
      showNotice("还没有正在征集的想吃入口");
      return;
    }
    try {
      const data = await loadWishShareRequest(activeWishShareRequest.token);
      const nextRequest = { ...activeWishShareRequest, ...data.request };
      setActiveWishShareRequest(nextRequest);
      const addedCount = collectWishShareEntries(nextRequest.wishes);
      const wishCount = nextRequest.wishes?.length ?? 0;
      showNotice(
        addedCount > 0
          ? `已收进 ${addedCount} 道想吃`
          : wishCount > 0
            ? `已收到 ${wishCount} 个想吃回复`
            : "还没有人写想吃的菜",
      );
    } catch (error) {
      showNotice(error.message || "想吃入口暂时刷新失败");
    }
  }

  function removeWishPoolItem(idOrRecipeId) {
    setWishPool((current) => current.filter((item) => {
      const matches = item.id === idOrRecipeId || item.recipeId === idOrRecipeId;
      if (!matches) return true;
      return !canManageHousehold && item.memberId !== currentHouseholdMemberId;
    }));
  }

  function planWishPoolItem(itemOrRecipeId) {
    const wishItem = typeof itemOrRecipeId === "object"
      ? itemOrRecipeId
      : wishPool.find((item) => item.id === itemOrRecipeId || item.recipeId === itemOrRecipeId);
    const recipeId = wishItem?.recipeId || (typeof itemOrRecipeId === "string" ? itemOrRecipeId : "");
    if (!canManageHousehold) {
      if (!wishItem || wishItem.memberId !== currentHouseholdMemberId) return;
      setWishPool((current) => current.map((item) => (
        item.id === wishItem.id
          ? { ...item, status: "done", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : item
      )));
      showNotice(`${wishItem.name || wishItem.title || "这道菜"} 已标记为安排`);
      return;
    }
    if (!recipeId) {
      setCategory("全部");
      setQuery("");
      setLibraryParentLabel("我的家");
      navigateTo("library");
      showNotice("先从全部菜品里挑一道相近的");
      return;
    }
    addToday(recipeId);
    removeWishPoolItem(recipeId);
  }

  function updateTodayMealLog(patch) {
    const updatedAt = new Date().toISOString();
    setMealLogs((current) => ({
      ...current,
      [todayDateKey]: {
        ...(current[todayDateKey] ?? {}),
        ...patch,
        updatedAt,
      },
    }));
  }

  function consumePantryForMealEntries(entries = [], consumedRecipeIds = todayMealLog.pantryConsumedRecipeIds ?? []) {
    const alreadyConsumed = new Set(consumedRecipeIds);
    const nextRecipeIds = entries
      .map((entry) => entry.recipeId)
      .filter((recipeId) => recipeId && !alreadyConsumed.has(recipeId) && getRecipe(recipeId));

    if (nextRecipeIds.length === 0) return [...alreadyConsumed];

    const consumedIngredientNames = new Set(
      nextRecipeIds.flatMap((recipeId) =>
        (getRecipe(recipeId)?.ingredients ?? []).map((ingredient) => normalizeName(ingredient.name)),
      ).filter(Boolean),
    );

    if (consumedIngredientNames.size > 0) {
      setPantryItems((current) =>
        current.filter((item) => !consumedIngredientNames.has(normalizeName(item.name))),
      );
    }

    return [...alreadyConsumed, ...nextRecipeIds];
  }

  function setDinnerSource(source) {
    if (!requireHouseholdManager()) return;
    const recordedBy = getDisplayName(displaySession) || "我";
    if (source === "home") {
      const consumedEntries = todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity }));
      const pantryConsumedRecipeIds = todayMenu.length > 0
        ? consumePantryForMealEntries(consumedEntries)
        : todayMealLog.pantryConsumedRecipeIds ?? [];
      updateTodayMealLog({
        source,
        recordedBy,
        confirmation: todayMenu.length > 0 ? "all" : undefined,
        confirmedBy: todayMenu.length > 0 ? recordedBy : undefined,
        consumedEntries,
        pantryConsumedRecipeIds,
      });
    } else {
      updateTodayMealLog({
        source,
        recordedBy,
        confirmation: undefined,
        confirmedBy: undefined,
        consumedEntries: [],
        pantryConsumedRecipeIds: [],
      });
    }
    const labels = {
      home: "今天在家做饭",
      delivery: "今天点外卖",
      outside: "今天外面吃",
      skip: "今天先不记录",
    };
    trackValidationEvent(validationEvents.dinnerSourceSelected, {
      source,
      hasTodayMenu: todayMenu.length > 0,
      recipeIds: todayMenu.map((item) => item.recipeId),
      dateKey: todayDateKey,
    });
    showNotice(labels[source] ?? "晚餐来源已记录");
  }

  function setMealSource(slotId, source) {
    if (!requireHouseholdManager()) return;
    const slotLabel = slotLabelsById[slotId] ?? "这一餐";
    markMealSource(slotId, source);
    const labels = {
      home: `${slotLabel}记为在家做`,
      delivery: `${slotLabel}记为点外卖`,
      outside: `${slotLabel}记为在外吃`,
      skip: `${slotLabel}先不记录`,
    };
    showNotice(labels[source] ?? `${slotLabel}来源已记录`);
  }

  function markMealSource(slotId, source) {
    if (!requireHouseholdManager()) return;
    const recordedBy = getDisplayName(displaySession) || "我";
    updateTodayMealLog({
      mealSources: {
        ...(todayMealLog.mealSources ?? {}),
        [slotId]: source,
      },
      mealRecordedBy: {
        ...(todayMealLog.mealRecordedBy ?? {}),
        [slotId]: recordedBy,
      },
    });
  }

  function shouldIncludeMealEntryInGroceries(entry) {
    if (!entry?.recipeId) return false;
    if (entry.dateKey !== todayDateKey) return true;
    if (entry.mealSlot === "dinner") {
      return !todayMealLog.source || todayMealLog.source === "home";
    }
    const source = todayMealLog.mealSources?.[entry.mealSlot];
    return !source || source === "home";
  }

  function setDinnerConfirmation(confirmation) {
    if (!requireHouseholdManager()) return;
    const confirmedBy = getDisplayName(displaySession) || "我";
    const consumedEntries = confirmation === "all"
      ? todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity }))
      : confirmation === "missed"
        ? []
        : todayMealLog.consumedEntries ?? [];
    const pantryConsumedRecipeIds = confirmation === "missed"
      ? []
      : consumePantryForMealEntries(consumedEntries);
    updateTodayMealLog({
      confirmation,
      confirmedBy,
      consumedEntries,
      pantryConsumedRecipeIds,
    });
    const labels = {
      all: "已确认今晚吃了",
      partial: "已记录吃了一部分",
      missed: "已记录今晚换了别的",
    };
    trackValidationEvent(validationEvents.mealConfirmed, {
      confirmation,
      consumedCount: consumedEntries.length,
      dateKey: todayDateKey,
    });
    showNotice(labels[confirmation] ?? "晚餐确认已记录");
  }

  function toggleConsumedRecipe(recipeId) {
    if (!requireHouseholdManager()) return;
    const currentEntries = todayMealLog.consumedEntries ?? todayMenu.map((item) => ({
      recipeId: item.recipeId,
      quantity: item.quantity,
    }));
    const exists = currentEntries.some((entry) => entry.recipeId === recipeId);
    const nextEntries = exists
      ? currentEntries.filter((entry) => entry.recipeId !== recipeId)
      : [
          ...currentEntries,
          todayMenu.find((item) => item.recipeId === recipeId) ?? { recipeId, quantity: 1 },
        ];
    const pantryConsumedRecipeIds = exists
      ? (todayMealLog.pantryConsumedRecipeIds ?? []).filter((id) => id !== recipeId)
      : consumePantryForMealEntries(nextEntries);
    updateTodayMealLog({
      consumedEntries: nextEntries,
      confirmation: nextEntries.length === todayMenu.length ? "all" : nextEntries.length > 0 ? "partial" : "missed",
      pantryConsumedRecipeIds,
    });
  }

  function syncHomeMealLogWithMenu(nextMenu, { defaultSelectedRecipeId } = {}) {
    setMealLogs((current) => {
      const currentLog = current[todayDateKey];
      if (currentLog?.source !== "home") return current;
      if (nextMenu.length === 0) {
        const { [todayDateKey]: removedLog, ...rest } = current;
        return rest;
      }

      const nextMenuById = new Map(nextMenu.map((item) => [item.recipeId, item]));
      const existingEntries = currentLog.consumedEntries ?? todayMenu.map((item) => ({
        recipeId: item.recipeId,
        quantity: item.quantity,
      }));
      const existingSelectedIds = new Set(existingEntries.map((entry) => entry.recipeId));
      if (defaultSelectedRecipeId) existingSelectedIds.add(defaultSelectedRecipeId);

      const consumedEntries = nextMenu
        .filter((item) => existingSelectedIds.has(item.recipeId) || currentLog.confirmation === "all")
        .map((item) => ({
          recipeId: item.recipeId,
          quantity: nextMenuById.get(item.recipeId)?.quantity ?? item.quantity,
        }));
      const confirmation = consumedEntries.length === nextMenu.length
        ? "all"
        : consumedEntries.length > 0
          ? "partial"
          : "missed";

      return {
        ...current,
        [todayDateKey]: {
          ...currentLog,
          consumedEntries,
          confirmation,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function planRecommendedWeek() {
    if (!requireHouseholdManager()) return;
    const currentDay = getCurrentPlanDay();
    const orderedDays = orderPlanDaysFrom(currentDay);
    const existingIds = new Set(Object.values(weekPlan).flat());
    const nextWeekPlan = { ...weekPlan };
    const addedRecipeIds = [];
    let addedCount = 0;

    orderedDays.forEach((day) => {
      while ((nextWeekPlan[day] ?? []).length < 2) {
        const recommendation = buildTodayRecommendation({
          pantryItems,
          weekPlan: nextWeekPlan,
          mealLogs,
          groceryItems: visibleGroceryItems,
          todayRecipes: [],
          familyMembers,
          familyProfile,
          wantToEatItems: wishPool,
          craveVotes: learnedCraveVotes,
          excludedRecipeIds: [...existingIds],
        });
        const recipeId = recommendation.recipes.find((recipe) => !existingIds.has(recipe.id))?.id;
        if (!recipeId) break;
        nextWeekPlan[day] = [...(nextWeekPlan[day] ?? []), recipeId];
        existingIds.add(recipeId);
        addedRecipeIds.push(recipeId);
        addedCount += 1;
      }
    });

    if (addedCount > 0) setWeekPlan(nextWeekPlan);
    if (addedCount > 0) {
      trackProductEvent(productEvents.weekPlanAdd, {
        recipeIds: addedRecipeIds,
        addedCount,
        source: "weekly_profile_generation",
        planningMode: familyProfile.planningMode,
      });
    }
    showNotice(addedCount > 0 ? `已安排 ${addedCount} 道菜到本周计划` : "本周计划已经排好了");
  }

  function completeRecommendedGrocery() {
    const missingCount = displayedRecommendation.missingItems.length;
    addRecommendedToday();
    setActiveView("grocery");
    showNotice(missingCount > 0 ? `还差的 ${missingCount} 样已经放进清单` : "这组晚饭已安排，清单也更新了");
  }

  async function requestAiExplanation() {
    if (!preciseRecommendationAvailable) {
      setAiExplanation(displayedRecommendation.reason);
      setAiExplanationStatus(
        signedIn ? "这组先按当前菜单说明，Humi 会继续参考家里的口味。" : "这组先按当前菜单说明，Humi 会慢慢记住家里的口味。",
      );
      return;
    }

    setAiExplanationLoading(true);
    setAiExplanationStatus("正在把这组搭配讲清楚...");
    try {
      const text = await explainRecommendation(displayedRecommendation);
      setAiExplanation(text);
      setAiExplanationStatus("搭配理由已经整理好了。");
    } catch (error) {
      setAiExplanation(displayedRecommendation.reason);
      if (isPreciseTrialUsedError(error)) {
        setPreciseRecommendationBlocked(true);
      }
      setAiExplanationStatus(`${formatAiError(error)} 先用当前搭配理由。`);
    } finally {
      setAiExplanationLoading(false);
    }
  }

  async function requestAiRecommendation(feedbackReason = null) {
    setRecommendationFeedbackOpen(false);
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const alternateRuleRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      mealLogs,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      familyProfile,
      wantToEatItems: wishPool,
      craveVotes: learnedCraveVotes,
      excludedRecipeIds: currentRecipeIds,
    });
    trackProductEvent(productEvents.recommendationRequest, {
      hasFeedback: Boolean(feedbackReason),
      currentRecipeIds,
    });
    trackValidationEvent(validationEvents.recommendationRefreshed, {
      hasFeedback: Boolean(feedbackReason),
      currentRecipeIds,
      reasonId: feedbackReason?.id,
    });
    if (feedbackReason) {
      recordRecommendationFeedback(feedbackReason);
    }

    if (!preciseRecommendationAvailable) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus(
        signedIn ? "已经换成另一组；Humi 会继续参考你家的口味和现有食材。" : "已经换成另一组；之后会继续参考你家的口味和现有食材。",
      );
      trackProductEvent(productEvents.recommendationShown, {
        source: "rule",
        reason: "guest",
        recipeIds: alternateRuleRecommendation.recipes.map((recipe) => recipe.id),
      });
      showNotice("已经换成另一组");
      return;
    }

    setAiRecommendationLoading(true);
    setAiRecommendationStatus("正在重新给你想一组晚饭...");
    try {
      const result = await recommendMeals(
        buildAiRecommendationContext({
          fallbackRecommendation: alternateRuleRecommendation,
          currentRecipeIds,
          feedbackReason,
          cravePreferences: cravePreferencesForRefresh,
        }),
      );
      const nextRecommendation = hydrateAiRecommendation({
        result,
        fallback: alternateRuleRecommendation,
      });
      setAiRecommendation(nextRecommendation);
      setAiExplanation(result.reason ?? nextRecommendation.reason);
      setAiRecommendationStatus(formatPreciseRecommendationStatus(result.entitlement));
      setAiExplanationStatus("已经把这组晚饭的搭配理由放在下面。");
      trackProductEvent(productEvents.recommendationShown, {
        source: nextRecommendation.source ?? "deepseek",
        recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
        missingCount: nextRecommendation.missingItems.length,
      });
      showNotice("晚饭推荐已更新");
    } catch (error) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      if (isPreciseTrialUsedError(error)) {
        setPreciseRecommendationBlocked(true);
        setAiRecommendationStatus("精准推荐尝鲜已用完；已切回基础推荐，基础换一组仍可一直用。");
      } else {
        setAiRecommendationStatus(`${formatAiError(error)} 已先换成另一组。`);
      }
      trackProductEvent(productEvents.recommendationShown, {
        source: "rule",
        reason: "fallback",
        error: error.message,
        recipeIds: alternateRuleRecommendation.recipes.map((recipe) => recipe.id),
      });
      showNotice("已经换成另一组");
    } finally {
      setAiRecommendationLoading(false);
    }
  }

  function recordRecommendationFeedback(reason) {
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    trackProductEvent(productEvents.recommendationFeedback, {
      reasonId: reason.id,
      reasonLabel: reason.label,
      recipeIds: currentRecipeIds,
    });
    trackValidationEvent(validationEvents.recommendationRejected, {
      recipeIds: currentRecipeIds,
      title: displayedRecommendation.title,
    });
    trackValidationEvent(validationEvents.recommendationRejectedReason, {
      reasonId: reason.id,
      reasonLabel: reason.label,
      recipeIds: currentRecipeIds,
      title: displayedRecommendation.title,
    });
    setRecommendationFeedback((current) => [
      {
        id: `feedback:${Date.now()}`,
        reasonId: reason.id,
        reasonLabel: reason.label,
        recipeIds: currentRecipeIds,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 12));
  }

  function updateTodayQuantity(recipeId, delta) {
    if (!requireHouseholdManager()) return;
    const nextMenu = todayMenu
      .map((item) =>
        item.recipeId === recipeId
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item,
      )
      .filter((item) => item.quantity > 0);
    const removedFromMenu = todayMenu.some((item) => item.recipeId === recipeId) &&
      !nextMenu.some((item) => item.recipeId === recipeId);

    updateMealPlanSlot(todayDateKey, "dinner", () => nextMenu);
    setTodayMenu(nextMenu);
    syncHomeMealLogWithMenu(nextMenu);

    if (removedFromMenu) {
      const todayKey = formatDateKey(new Date());
      const currentDay = getCurrentPlanDay();
      setMealCalendar((calendar) => ({
        ...calendar,
        [todayKey]: (calendar[todayKey] ?? []).filter((id) => id !== recipeId),
      }));
      setWeekPlan((plan) => ({
        ...plan,
        [currentDay]: (plan[currentDay] ?? []).filter((id) => id !== recipeId),
      }));
    }

    if (nextMenu.length === 0) {
      setAiRecommendation(null);
      setAiRecommendationStatus(
        signedIn
          ? "今晚菜单已清空。可以重新安排一组，推荐会继续参考你家的口味和习惯。"
          : "今晚菜单已清空。可以重新安排一组，Humi 会慢慢记住家里的口味。",
      );
    }
  }

  function removeFromTodayEverywhere(recipeId) {
    const nextMenu = todayMenu.filter((item) => item.recipeId !== recipeId);
    const todayKey = formatDateKey(new Date());
    const currentDay = getCurrentPlanDay();

    updateMealPlanSlot(todayKey, "dinner", (entries) => removeMealEntry(entries, recipeId));
    setTodayMenu(nextMenu);
    syncHomeMealLogWithMenu(nextMenu);
    setMealCalendar((calendar) => ({
      ...calendar,
      [todayKey]: (calendar[todayKey] ?? []).filter((id) => id !== recipeId),
    }));
    setWeekPlan((plan) => ({
      ...plan,
      [currentDay]: (plan[currentDay] ?? []).filter((id) => id !== recipeId),
    }));

    if (nextMenu.length === 0) {
      setAiRecommendation(null);
      setAiRecommendationStatus(
        signedIn
          ? "今晚菜单已清空。可以重新安排一组，推荐会继续参考你家的口味和习惯。"
          : "今晚菜单已清空。可以重新安排一组，Humi 会慢慢记住家里的口味。",
      );
    }
  }

  function assignPlan(day, recipeId) {
    if (!requireHouseholdManager()) return;
    if ((weekPlan[day] ?? []).includes(recipeId)) {
      showNotice(`已在${day}计划中`);
      return;
    }
    const dateKey = weekDateKeys[day] ?? todayDateKey;
    assignMealRecipe(dateKey, "dinner", recipeId);
    setWeekPlan((current) => {
      const currentDay = current[day] ?? [];
      if (currentDay.includes(recipeId)) return current;
      return { ...current, [day]: [...currentDay, recipeId] };
    });
    trackProductEvent(productEvents.weekPlanAdd, {
      recipeIds: [recipeId],
      day,
      source: "manual",
    });
    showNotice(`已添加到${day}`);
  }

  function removePlanRecipe(day, recipeId) {
    if (!requireHouseholdManager()) return;
    const dateKey = weekDateKeys[day] ?? todayDateKey;
    if (day === getCurrentPlanDay()) {
      removeMealRecipe(dateKey, "dinner", recipeId);
      showNotice("已从今晚安排移除");
      return;
    }
    removeMealRecipe(dateKey, "dinner", recipeId);
    setWeekPlan((current) => ({
      ...current,
      [day]: (current[day] ?? []).filter((id) => id !== recipeId),
    }));
  }

  function assignDatePlan(dateKey, recipeId) {
    if (!requireHouseholdManager()) return;
    const recipe = getRecipe(recipeId);
    if ((mealCalendar[dateKey] ?? []).includes(recipeId)) {
      showNotice(`${recipe?.name ?? "菜品"} 已在该日计划中`);
      return;
    }
    assignMealRecipe(dateKey, "dinner", recipeId);
    setMealCalendar((current) => ({
      ...current,
      [dateKey]: [...(current[dateKey] ?? []), recipeId],
    }));
    showNotice(`已添加到 ${formatDateLabel(dateKey)}`);
  }

  function removeDatePlan(dateKey, recipeId) {
    if (!requireHouseholdManager()) return;
    if (dateKey === formatDateKey(new Date())) {
      removeMealRecipe(dateKey, "dinner", recipeId);
      showNotice("已从今晚安排移除");
      return;
    }
    removeMealRecipe(dateKey, "dinner", recipeId);
    setMealCalendar((current) => ({
      ...current,
      [dateKey]: (current[dateKey] ?? []).filter((id) => id !== recipeId),
    }));
  }

  function addCustomItem(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomItems((current) => [
      ...current,
      { key: `custom:${Date.now()}`, name: trimmed, amount: "自定义", source: "手动添加" },
    ]);
    setNewCustomItem("");
  }

  function removeCustomItem(key) {
    setCustomItems((current) => current.filter((item) => item.key !== key));
  }

  function addGroceryItemToPantry(item, source = "清单完成") {
    if (!item?.name) return false;
    const normalized = normalizeName(item.name);
    if (pantryNameSet.has(normalized)) return false;
    setPantryItems((current) => {
      if (current.some((pantryItem) => normalizeName(pantryItem.name) === normalized)) return current;
      return [
        ...current,
        {
          key: `pantry:${Date.now()}:${item.key ?? normalized}`,
          name: item.name,
          amount: formatRawAmount(item),
          source,
        },
      ];
    });
    showNotice(`${item.name} 已勾选`);
    return true;
  }

  function syncGroceryShareProgress(request) {
    const shareItems = Array.isArray(request?.items) ? request.items : [];
    if (shareItems.length === 0) return { checkedCount: 0, pantryAddedCount: 0 };

    setCheckedItems((current) => {
      let changed = false;
      const next = { ...current };
      shareItems.forEach((item) => {
        if (!item?.id) return;
        const checked = Boolean(item.checked);
        if (Boolean(next[item.id]) !== checked) {
          next[item.id] = checked;
          changed = true;
        }
      });
      return changed ? next : current;
    });

    const existingNames = new Set(pantryItems.map((item) => normalizeName(item.name)));
    const additions = shareItems
      .filter((item) => item?.checked && item.name && !existingNames.has(normalizeName(item.name)))
      .map((item, index) => ({
        key: `pantry:share:${Date.now()}:${item.id || index}`,
        name: item.name,
        amount: item.amount || "",
        source: "家人买菜回传",
      }));

    if (additions.length > 0) {
      setPantryItems((current) => {
        const currentNames = new Set(current.map((item) => normalizeName(item.name)));
        const uniqueAdditions = additions.filter((item) => {
          const normalized = normalizeName(item.name);
          if (currentNames.has(normalized)) return false;
          currentNames.add(normalized);
          return true;
        });
        return uniqueAdditions.length > 0 ? [...current, ...uniqueAdditions] : current;
      });
    }

    return {
      checkedCount: shareItems.filter((item) => item.checked).length,
      pantryAddedCount: additions.length,
    };
  }

  function excludeGroceryItem(itemOrKey) {
    const key = typeof itemOrKey === "string" ? itemOrKey : itemOrKey?.hiddenKey;
    if (!key) return;
    setExcludedGroceryKeys((current) => (current.includes(key) ? current : [...current, key]));
    if (typeof itemOrKey === "object" && itemOrKey?.name) {
      addGroceryItemToPantry(itemOrKey, "本次不用买");
    }
  }

  function restoreGroceryItem(item) {
    setExcludedGroceryKeys((current) => current.filter((itemKey) => itemKey !== item.hiddenKey));
    setPantryItems((current) => current.filter((pantryItem) => normalizeName(pantryItem.name) !== normalizeName(item.name)));
  }

  function restoreAllGroceryItems() {
    const hiddenNames = new Set(excludedGroceryItems.map((item) => normalizeName(item.name)));
    setExcludedGroceryKeys([]);
    setPantryItems((current) => current.filter((item) => !hiddenNames.has(normalizeName(item.name))));
  }

  function confirmPantryItemAvailability(name, available) {
    const normalized = normalizeName(name);
    if (!normalized) return;
    if (available) {
      showNotice(`${name} 还在，今晚会优先用上`);
      return;
    }
    setPantryItems((current) => current.filter((item) => normalizeName(item.name) !== normalized));
    setExcludedGroceryKeys((current) => current.filter((key) => !key.includes(normalized)));
    showNotice(`${name} 已恢复到清单`);
  }

  function addPantryHints(value) {
    const names = [...new Set(
      String(value || "")
        .split(/[，,、\s]+/)
        .map((name) => name.trim())
        .filter(Boolean),
    )].slice(0, 6);
    if (names.length === 0) {
      showNotice("写一两样家里有的食材就行");
      return 0;
    }
    const existingNames = new Set(pantryItems.map((item) => normalizeName(item.name)));
    const additions = names.flatMap((name, index) => {
      const normalized = normalizeName(name);
      if (!normalized || existingNames.has(normalized)) return [];
      existingNames.add(normalized);
      return [{
        key: `pantry:hint:${Date.now()}:${index}`,
        name,
        amount: "",
        source: "顺手告诉 Humi",
      }];
    });
    if (additions.length > 0) setPantryItems((current) => [...additions, ...current]);
    showNotice(additions.length > 0 ? `记住了 ${additions.length} 样，接下来只当加分项` : "这些食材已经记住了");
    return additions.length;
  }

  async function shareGroceryList() {
    if (isWechatMiniProgramWebView()) {
      if (!signedIn) {
        setEntryRedirectView("grocery");
        if (requestWechatLoginFromMiniProgram()) showNotice("登录后就能把清单发给家人，家人打开不用登录");
        else setAuthGateIntent("startCollaboration");
        return;
      }
      if (isHumiApiSession(humiSession) && family?.role && family.role !== "owner") {
        showNotice("这个家的买菜卡片需要主厨分享；家人可以认领和标记买到。");
        return;
      }
      try {
        const data = await createGroceryShareRequest({
          householdId: family?.id ?? "",
          ownerId: humiSession?.user?.id ?? "",
          householdName: family?.name ?? familyName ?? "我家",
          initiatorName: getDisplayName(displaySession) || "主厨",
          title: "Humi 买菜清单",
          items: buildGroceryShareItems(visibleGroceryItems, customItems, checkedItems),
        }, isHumiApiSession(humiSession) ? humiSession : null);
        setActiveGroceryShareRequest(data.request);
        const nativeShareStatus = await requestMiniProgramShare({
          type: "grocery",
          token: data.request.token,
          title: "Humi 买菜清单",
          itemCount: data.request.items?.length ?? 0,
        });
        if (nativeShareStatus === "handoff") {
          return;
        }
        showNotice("没能打开微信发送页，请再试一次");
        return;
      } catch (error) {
        showNotice(error.message || "清单分享暂时不可用");
      }
    }
    await createGroceryListPoster();
  }

  async function createGroceryListPoster() {
    const text = formatShareText(visibleGroceryGroups, customItems);
    await openPosterPreview({
      type: "grocery_list",
      title: "Humi 购物清单",
      filename: "humi-shopping-list.png",
      text,
      createBlob: () => createGroceryPoster({ items: visibleGroceryItems, customItems }),
      fallbackSuccess: "食材清单已复制",
      refreshLabel: "换一种样式",
    });
  }

  async function refreshGroceryShareRequest() {
    if (!activeGroceryShareRequest?.token) {
      showNotice("还没有正在协作的买菜清单");
      return;
    }
    try {
      const data = await loadGroceryShareRequest(activeGroceryShareRequest.token);
      setActiveGroceryShareRequest((current) => ({ ...current, ...data.request }));
      const synced = syncGroceryShareProgress(data.request);
      const claimedCount = (data.request.claims ?? []).filter((claim) => claim.status === "claimed").length;
      showNotice(
        synced.checkedCount > 0
          ? `已同步 ${synced.checkedCount} 项已买`
          : claimedCount > 0
            ? `已经有 ${claimedCount} 位家人愿意去买`
            : "还没有人认领买菜",
      );
    } catch (error) {
      showNotice(error.message || "买菜进度暂时没刷新出来");
    }
  }

  async function shareTodayMenu() {
    if (isWechatMiniProgramWebView()) {
      if (!signedIn) {
        setEntryRedirectView("today");
        if (requestWechatLoginFromMiniProgram()) showNotice("登录后才能分享家庭菜单");
        else setAuthGateIntent("startCollaboration");
        return;
      }
      if (isHumiApiSession(humiSession) && family?.role && family.role !== "owner") {
        showNotice("这个家的菜单卡片需要主厨分享。");
        return;
      }
      try {
        const data = await createMenuShareRequest({
          householdId: family?.id ?? "",
          ownerId: humiSession?.user?.id ?? "",
          householdName: family?.name ?? familyName ?? "我家",
          initiatorName: getDisplayName(displaySession) || "主厨",
          title: todayRecipes.length > 0 ? todayRecipes.map((recipe) => recipe.name).join(" + ") : "Humi 今晚菜单",
          groceryCount: visibleGroceryItems.length,
          dishes: todayRecipes.map((recipe) => ({
            id: recipe.id,
            recipeId: recipe.id,
            name: recipe.name,
            quantity: recipe.menuQuantity ?? 1,
            category: recipe.categories?.[0] || "",
            timeMinutes: recipe.timeMinutes,
          })),
        }, isHumiApiSession(humiSession) ? humiSession : null);
        const nativeShareStatus = await requestMiniProgramShare({
          type: "today_menu",
          token: data.request?.token,
          title: data.request?.title || "Humi 今晚菜单",
          itemCount: visibleGroceryItems.length,
          view: "today",
        });
        if (nativeShareStatus === "handoff") {
          return;
        }
        showNotice("没能打开微信发送页，请再试一次");
        return;
      } catch (error) {
        showNotice(error.message || "菜单分享暂时不可用，先生成海报");
      }
    }
    await createTodayMenuPosterPreview();
  }

  async function createTodayMenuPosterPreview() {
    const text = [
      "Humi 今晚菜单",
      "",
      ...todayRecipes.map((recipe) => `- ${recipe.name} x${recipe.menuQuantity ?? 1}`),
      "",
      `待买食材：${visibleGroceryItems.length} 项`,
    ].join("\n");
    await openPosterPreview({
      type: "today_menu",
      title: "Humi 今晚菜单",
      filename: "humi-tonight-menu.png",
      text,
      createBlob: () => createTodayMenuPoster({ recipes: todayRecipes, groceryCount: visibleGroceryItems.length }),
      fallbackSuccess: "今晚菜单已复制",
      refreshLabel: "重新生成海报",
    });
  }

  async function shareWeekPlan() {
    const text = [
      "Humi 一周计划",
      "",
      ...Object.entries(weekPlan).map(([day, recipeIds]) => {
        const names = recipeIds.map((recipeId) => getRecipe(recipeId)?.name).filter(Boolean);
        return `${day}：${names.length > 0 ? names.join("、") : "未安排"}`;
      }),
    ].join("\n");
    await openPosterPreview({
      type: "week_plan",
      title: "Humi 本周菜单",
      filename: "humi-week-menu.png",
      text,
      createBlob: () => createWeekMenuPoster({ weekPlan, getRecipe }),
      fallbackSuccess: "一周计划已复制",
      refreshLabel: "重新生成海报",
    });
  }

  async function shareText({ type, title, text, success }) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        trackProductEvent(productEvents.share, { type, method: "native" });
        return;
      }
      await navigator.clipboard.writeText(text);
      trackProductEvent(productEvents.share, { type, method: "clipboard" });
      showNotice(success);
    } catch (error) {
      if (error?.name === "AbortError") return;
      showNotice("分享失败，可稍后重试");
    }
  }

  async function openPosterPreview({ type, title, filename, text, createBlob, fallbackSuccess, refreshLabel }) {
    setPosterPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { blob: null, url: "", type, title, filename, text, createBlob, fallbackSuccess, refreshLabel };
    });
    setPosterLoading(true);
    try {
      const blob = await createBlob();
      const url = URL.createObjectURL(blob);
      setPosterPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { blob, url, type, title, filename, text, createBlob, fallbackSuccess, refreshLabel };
      });
      trackProductEvent(productEvents.share, { type, method: "poster_preview" });
      trackValidationEvent(validationEvents.posterGenerated, { type, title });
      showNotice("海报已生成");
    } catch {
      setPosterPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
      await shareText({ type, title, text, success: fallbackSuccess });
    } finally {
      setPosterLoading(false);
    }
  }

  function closePosterPreview() {
    setPosterPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  async function regeneratePosterPreview() {
    if (!posterPreview) return;
    setPosterLoading(true);
    setPosterPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return current ? { ...current, blob: null, url: "", remotePoster: null } : null;
    });
    try {
      const blob = await posterPreview.createBlob();
      const url = URL.createObjectURL(blob);
      setPosterPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return current ? { ...current, blob, url, remotePoster: null } : null;
      });
      showNotice("换好一版海报了");
    } catch {
      showNotice("海报生成失败，可稍后重试");
    } finally {
      setPosterLoading(false);
    }
  }

  async function handoffPosterToMiniProgram(action) {
    if (!isWechatMiniProgramWebView()) return false;
    if (!posterPreview?.blob) {
      showNotice("海报还没准备好");
      return true;
    }
    if (!isHumiApiSession(humiSession)) {
      if (requestWechatLoginFromMiniProgram()) {
        showNotice("登录后重新生成海报，就能保存到相册或发给家人");
      } else {
        showNotice("请先在小程序里登录 Humi");
      }
      return true;
    }

    setPosterLoading(true);
    try {
      let remotePoster = posterPreview.remotePoster;
      if (!remotePoster?.token) {
        const uploadBlob = await preparePosterUploadBlob(posterPreview.blob);
        const data = await uploadPosterShare(humiSession, uploadBlob);
        remotePoster = data.poster;
        setPosterPreview((current) => (
          current?.blob === posterPreview.blob ? { ...current, remotePoster } : current
        ));
      }
      const status = await requestMiniProgramPoster({
        token: remotePoster.token,
        format: remotePoster.format,
        title: posterPreview.title,
        action,
      }, { timeoutMs: 2400 });
      if (status === "handoff") {
        trackProductEvent(productEvents.share, { type: posterPreview.type, method: `poster_mini_${action}` });
        trackValidationEvent(
          action === "save" ? validationEvents.posterSavedAttempted : validationEvents.posterSharedIntent,
          { type: posterPreview.type, method: "mini_program" },
        );
      } else {
        showNotice("没能打开微信海报页，请再试一次");
      }
    } catch (error) {
      showNotice(error.message || "海报暂时没传到微信，请稍后再试");
    } finally {
      setPosterLoading(false);
    }
    return true;
  }

  async function savePosterPreview() {
    if (!posterPreview) return;
    if (await handoffPosterToMiniProgram("save")) return;
    downloadPoster(posterPreview.blob, posterPreview.filename);
    trackProductEvent(productEvents.share, { type: posterPreview.type, method: "poster_save" });
    trackValidationEvent(validationEvents.posterSavedAttempted, { type: posterPreview.type });
    showNotice("浏览器正在保存图片");
  }

  async function sharePosterPreview() {
    if (!posterPreview) return;
    if (await handoffPosterToMiniProgram("share")) return;
    setPosterLoading(true);
    trackValidationEvent(validationEvents.posterSharedIntent, { type: posterPreview.type });
    try {
      const method = await sharePoster({
        blob: posterPreview.blob,
        title: posterPreview.title,
        filename: posterPreview.filename,
        text: posterPreview.text,
      });
      if (method === "cancelled") return;
      trackProductEvent(productEvents.share, {
        type: posterPreview.type,
        method: method === "shared" ? "poster_native" : "poster_download",
      });
      if (method === "downloaded") showNotice("浏览器正在保存图片");
    } catch {
      await shareText({
        type: posterPreview.type,
        title: posterPreview.title,
        text: posterPreview.text,
        success: posterPreview.fallbackSuccess,
      });
    } finally {
      setPosterLoading(false);
    }
  }

  async function createFamily() {
    if (!isHumiApiSession(humiSession)) {
      setAuthStatus("请先完成微信登录，再创建我的家。");
      return;
    }
    const normalizedFamilyName = familyName.trim();
    if (!normalizedFamilyName) {
      setAuthStatus("请填写家庭名称。");
      return;
    }
    setCloudLoading(true);
    setAuthStatus("正在创建我的家...");
    try {
      const data = await createHumiHousehold(humiSession, {
        householdName: normalizedFamilyName,
        memberName: humiSession.user?.displayName || "主厨",
      });
      applyHumiStateEnvelope({ ...data, state: null }, {
        emptyMenu: "我的家已创建，这里还没有保存菜单。",
        emptyGrocery: "我的家已创建，这里还没有保存清单。",
      });
      setCloudMenuEnabled(false);
      setCloudGroceryEnabled(false);
      setAuthStatus("我的家已创建。");
      trackProductEvent(productEvents.familyCreated, {
        familyId: data.family?.id,
        familyName: data.family?.name,
      });
      showNotice(`${data.family?.name || normalizedFamilyName} 已创建`);
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setCloudLoading(false);
    }
  }

  async function handleSignOut() {
    setCloudLoading(true);
    let remoteLogoutFailed = false;
    try {
      if (isHumiApiSession(humiSession)) {
        await logoutHumiSession(humiSession);
      }
    } catch {
      remoteLogoutFailed = true;
    } finally {
      clearHumiSession();
      requestMiniProgramLogout();
      setHumiSession(null);
      setSessionExpired(false);
      humiStateLoadedRef.current = false;
      humiStateHydratingRef.current = false;
      mealRunHydrationRef.current = "";
      setFamily(null);
      setMealExecutionCapabilities({ mealExecution: false });
      setCloudMenuEnabled(false);
      setCloudGroceryEnabled(false);
      setFamilyMembers([]);
      setOnboardingComplete(false);
      setProfileOnboardingComplete(false);
      viewHistoryRef.current = ["dashboard"];
      setActiveView("dashboard");
      setAuthStatus(remoteLogoutFailed ? "已从当前设备退出；远端会话会按有效期自动失效。" : "已退出登录，可以重新验证微信登录。");
      showNotice("已退出登录");
      setCloudLoading(false);
    }
  }

  function expireHumiIdentity() {
    clearHumiSession();
    requestMiniProgramLogout({ expired: true });
    setHumiSession(null);
    setSessionExpired(true);
    humiStateLoadedRef.current = false;
    humiStateHydratingRef.current = false;
    mealRunHydrationRef.current = "";
    setFamily(null);
    setMealExecutionCapabilities({ mealExecution: false });
    setHumiHouseholds([]);
    setCloudMenuEnabled(false);
    setCloudGroceryEnabled(false);
    setFamilyMembers([]);
    setAuthGateIntent("sessionExpired");
    setAuthStatus("登录已过期，请重新微信登录。");
  }

  function buildAiRecommendationContext({
    fallbackRecommendation,
    currentRecipeIds = [],
    feedbackReason = null,
    cravePreferences = [],
  }) {
    const hardAvoidSignals = getHardAvoidSignals({ familyMembers, familyProfile });
    const recentRecipeIds = [
      ...new Set([
        ...Object.values(weekPlan).flat(),
        ...todayMenu.map((item) => item.recipeId),
      ]),
    ].slice(-12);

    return {
      candidates: recipes
        .filter((recipe) => !currentRecipeIds.includes(recipe.id))
        .filter((recipe) => !recipeMatchesHardAvoid(recipe, { familyMembers, familyProfile }))
        .map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          categories: recipe.categories,
          tags: recipe.tags,
          timeMinutes: recipe.timeMinutes,
          difficulty: recipe.difficulty,
          ingredients: recipe.ingredients.map((item) => item.name),
          seasonings: recipe.seasonings.map((item) => item.name),
          nutrition: nutritionFor(recipe),
        })),
      pantryItems: pantryItems.map((item) => ({
        name: item.name,
        amount: item.amount,
        expiresOn: item.expiresOn,
      })),
      familyPreferences: familyMembers.map((member, index) => ({
        member: `家庭成员${index + 1}`,
        preference: member.preference,
      })),
      familyProfile,
      planningMode: getPlanningMode(familyProfile.planningMode),
      compactFamilyPrompt: buildCompactFamilyPrompt(familyProfile),
      recentRecipeIds,
      currentMissingItems: fallbackRecommendation.missingItems.map((item) => item.name),
      currentCraveSignals: cravePreferences,
      recentFeedback: [
        ...(feedbackReason
          ? [{
              reason: feedbackReason.label,
              reasonId: feedbackReason.id,
              recipeIds: currentRecipeIds,
            }]
          : []),
        ...recommendationFeedback.slice(0, 5).map((item) => ({
          reason: item.reasonLabel,
          reasonId: item.reasonId,
          recipeIds: item.recipeIds,
        })),
      ],
      acceptanceRules: [
        "只推荐候选菜谱里的菜，不能创造新菜。",
        hardAvoidSignals.length > 0
          ? `硬性忌口/过敏必须避开：${hardAvoidSignals.join("、")}；候选中已过滤，但返回时仍不能包含相关食材或菜名。`
          : "",
        "优先使用买菜勾选里顺手记下、家里可能还有的主食材。",
        "避开近期已经安排过的菜。",
        "晚饭组合必须按家庭人数落地：1人建议1-2道，2人建议2道，3-4人建议2-3道，5人以上建议3-4道。",
        "如果菜品数量少于家庭人数需要，可用份量补足，但推荐理由要说明份量安排。",
        "主食材缺口尽量不超过 3 项；调料和可跳过项不要当作主要缺口。",
        "组合尽量包含一道蛋白来源和一道蔬菜/汤/清爽类菜。",
        "如果家庭偏好、忌口、过敏与候选冲突，必须优先避开。",
        cravePreferences.length > 0
          ? `这轮会尽量照顾家人刚才的回复：${cravePreferences.join("、")}。`
          : "",
        `当前使用场景是${getPlanningMode(familyProfile.planningMode).label}，需要按该场景调整推荐理由和搭配重点。`,
        "本轮候选已排除用户刚看到的菜，不能重复上一组。",
      ].filter(Boolean),
      ruleFallback: {
        recipeIds: fallbackRecommendation.recipes.map((recipe) => recipe.id),
        items: getRecommendationItems(fallbackRecommendation).map((item) => ({
          recipeId: item.recipe.id,
          quantity: item.quantity,
        })),
        reason: fallbackRecommendation.reason,
      },
    };
  }

  function hydrateAiRecommendation({ result, fallback }) {
    const selectedRecipes = result.recipeIds
      .map((recipeId) => getRecipe(recipeId))
      .filter(Boolean)
      .filter((recipe) => !recipeMatchesHardAvoid(recipe, { familyMembers, familyProfile }));

    if (selectedRecipes.length === 0) return fallback;
    const filledRecipes = [...selectedRecipes];
    for (const fallbackItem of getRecommendationItems(fallback)) {
      if (filledRecipes.length >= (fallback.targetDishCount ?? fallback.recipes.length)) break;
      if (
        !recipeMatchesHardAvoid(fallbackItem.recipe, { familyMembers, familyProfile }) &&
        !filledRecipes.some((recipe) => recipe.id === fallbackItem.recipe.id)
      ) {
        filledRecipes.push(fallbackItem.recipe);
      }
    }

    const selectedIngredientNames = new Set(
      filledRecipes.flatMap((recipe) => recipe.ingredients.map((item) => normalizeName(item.name))),
    );
    const usablePantryNames = new Set(
      pantryItems
        .filter((item) => getExpiryState(item.expiresOn) !== "expired")
        .map((item) => normalizeName(item.name)),
    );
    const expiringPantryNames = new Set(
      pantryItems
        .filter((item) => getExpiryState(item.expiresOn) === "soon")
        .map((item) => normalizeName(item.name)),
    );
    const recommendationItems = buildRecommendationItems(filledRecipes, familyProfile.familySize);
    const missingItems = filledRecipes
      .flatMap((recipe) => recipe.ingredients)
      .filter((item) => item.required !== false && !usablePantryNames.has(normalizeName(item.name)))
      .filter((item, index, items) => items.findIndex((candidate) => normalizeName(candidate.name) === normalizeName(item.name)) === index)
      .slice(0, 5);

    const inventoryHits = [...selectedIngredientNames].filter((name) => usablePantryNames.has(name)).length;
    const expiringHits = [...selectedIngredientNames].filter((name) => expiringPantryNames.has(name)).length;

    return {
      ...fallback,
      recipes: filledRecipes,
      items: recommendationItems,
      familySize: Number.parseInt(familyProfile.familySize, 10) || fallback.familySize,
      title: filledRecipes.map((recipe) => recipe.name).join(" + "),
      reason: result.reason,
      inventoryHits,
      expiringHits,
      missingItems,
      explanation: result.explanation ?? fallback.explanation,
      source: "deepseek",
      nutrition: {
        caloriesKcal: recommendationItems.reduce(
          (total, item) => total + nutritionFor(item.recipe).caloriesKcal * item.quantity,
          0,
        ),
        proteinG: recommendationItems.reduce(
          (total, item) => total + nutritionFor(item.recipe).proteinG * item.quantity,
          0,
        ),
      },
    };
  }

  const authProps = {
    authStatus,
    setAuthStatus,
    family,
    familyName,
    setFamilyName,
    cloudLoading,
    onCreateFamily: createFamily,
    onSignOut: handleSignOut,
    showNotice,
  };

  async function migrateMenusToCloud() {
    if (isHumiApiSession(humiSession)) {
      setCloudMenuLoading(true);
      setCloudSyncStatus("正在保存今晚菜单和一周计划...");
      try {
        await saveHumiState(humiSession, humiStateSnapshot);
        setCloudMenuEnabled(true);
        setCloudGroceryEnabled(true);
        setCloudSyncStatus("今晚菜单和一周计划已保存到微信账号。");
      setCloudGroceryStatus("清单也会继续自动同步。");
        showNotice("菜单已保存到微信账号");
      } catch (error) {
        setCloudSyncStatus(formatCloudSyncError(error));
      } finally {
        setCloudMenuLoading(false);
      }
      return;
    }
    setCloudSyncStatus("请先微信登录并创建我的家。");
  }

  async function refreshCloudMenus() {
    if (isHumiApiSession(humiSession)) {
      try {
        setCloudMenuLoading(true);
        const data = await loadHumiStateEnvelope(humiSession);
        const state = data.state;
        if (data.family) setFamily(data.family);
        if (Array.isArray(data.households)) setHumiHouseholds(data.households);
        const loadedWeekPlan = { ...createDefaultWeekPlan(), ...(state?.weekPlan ?? {}) };
        const loadedMealPlan = normalizeMealPlan(
          state?.mealPlan ?? createMealPlanFromLegacy({
            mealCalendar: state?.mealCalendar,
            weekPlan: loadedWeekPlan,
            todayMenu: state?.todayMenu,
            todayDateKey,
            currentDay: getCurrentPlanDay(),
          }),
        );
        setMealPlan(loadedMealPlan);
        setTodayMenu(getDayMeals(loadedMealPlan, todayDateKey).dinner.length > 0
          ? getDayMeals(loadedMealPlan, todayDateKey).dinner
          : Array.isArray(state?.todayMenu) ? state.todayMenu : []);
        setWeekPlan(mealPlanToWeekPlan(loadedMealPlan, weekDateKeys));
        setCloudSyncStatus("已刷新微信账号保存的菜单。");
        showNotice("微信账号菜单已刷新");
      } catch (error) {
        setCloudSyncStatus(formatCloudSyncError(error));
      } finally {
        setCloudMenuLoading(false);
      }
      return;
    }
    setCloudSyncStatus("请先微信登录并创建我的家。");
  }

  function requireCompleteHumiHouseholdSession() {
    if (isHumiApiSession(humiSession) && identityComplete && family?.id) return true;
    showNotice("请先完成微信登录并进入一个家");
    return false;
  }

  async function renameHumiHousehold(name) {
    const nextName = String(name || "").trim();
    if (!requireCompleteHumiHouseholdSession() || !requireHouseholdManager()) return;
    if (!nextName) {
      showNotice("先给这个家起个名字");
      return;
    }
    try {
      const data = await updateHumiHousehold(humiSession, family.id, { name: nextName });
      applyHumiStateEnvelope(data, { preserveStateWhenMissing: true });
      showNotice(`已将家庭改名为 ${data.family?.name || nextName}`);
    } catch (error) {
      showNotice(error.message || "家庭名称暂时没改成功");
    }
  }

  async function removeCurrentHouseholdMember(memberId) {
    if (!requireCompleteHumiHouseholdSession() || !requireHouseholdManager() || !memberId) return;
    try {
      const data = await removeHumiHouseholdMember(humiSession, family.id, memberId);
      applyHumiStateEnvelope(data, { preserveStateWhenMissing: true });
      showNotice("已将家人移出这个家");
    } catch (error) {
      showNotice(error.message || "暂时无法移除这位家人");
    }
  }

  async function transferHumiHouseholdOwner(memberId) {
    if (!requireCompleteHumiHouseholdSession() || !requireHouseholdManager() || !memberId) return;
    try {
      const data = await transferHumiHouseholdOwnership(humiSession, family.id, memberId);
      applyHumiStateEnvelope(data, { preserveStateWhenMissing: true });
      showNotice("主厨已转让，家庭成员信息已更新");
    } catch (error) {
      showNotice(error.message || "主厨暂时没转让成功");
    }
  }

  async function leaveCurrentHumiHousehold() {
    if (!requireCompleteHumiHouseholdSession()) return;
    try {
      const data = await leaveHumiHousehold(humiSession, family.id);
      applyHumiStateEnvelope(data);
      showNotice("已离开这个家");
    } catch (error) {
      showNotice(error.message || "暂时无法离开这个家");
    }
  }

  async function createAnotherHumiHousehold(name) {
    const nextName = String(name || "").trim();
    if (!nextName) {
      const message = "请填写家庭名称。";
      showNotice(message);
      return { ok: false, message };
    }
    if (!isHumiApiSession(humiSession)) {
      const message = "请先在小程序里登录 Humi";
      showNotice(message);
      return { ok: false, message };
    }
    if (!canManageHousehold) {
      const message = "只有主厨能新建另一个家";
      showNotice(message);
      return { ok: false, message };
    }
    setCloudMenuLoading(true);
    humiStateHydratingRef.current = true;
    try {
      const data = await createHumiHousehold(humiSession, {
        householdName: nextName,
        memberName: humiSession.user?.displayName || "主厨",
      });
      applyHumiStateEnvelope(data, {
        emptyMenu: "已创建新的家。这里还没有保存菜单。",
        emptyGrocery: "这个家的清单和口味偏好会单独保存。",
      });
      showNotice(`已创建 ${data.family?.name || "新的家"}`);
      return { ok: true, family: data.family ?? null };
    } catch (error) {
      const message = error.message || "新的家暂时没创建成功";
      showNotice(message);
      return { ok: false, message };
    } finally {
      setCloudMenuLoading(false);
      window.setTimeout(() => {
        humiStateHydratingRef.current = false;
      }, 0);
    }
  }

  async function switchActiveHumiHousehold(householdId) {
    if (!isHumiApiSession(humiSession) || !householdId || householdId === family?.id) return;
    setCloudMenuLoading(true);
    setCloudGroceryLoading(true);
    humiStateHydratingRef.current = true;
    try {
      const data = await switchHumiHousehold(humiSession, householdId);
      applyHumiStateEnvelope(data, {
        loadedMenu: "已切换并读取当前家的菜单。",
        loadedGrocery: "已切换到这个家，清单和口味偏好也一起换好了。",
        emptyMenu: "已切换到这个家。这里还没有保存菜单。",
        emptyGrocery: "已切换到这个家。这里还没有保存清单。",
      });
      showNotice(`已切换到 ${data.family?.name || "这个家"}`);
    } catch (error) {
      showNotice(error.message || "暂时没切换成功");
    } finally {
      setCloudMenuLoading(false);
      setCloudGroceryLoading(false);
      window.setTimeout(() => {
        humiStateHydratingRef.current = false;
      }, 0);
    }
  }

  async function createFamilyInviteCard() {
    if (householdInvitePending) return;
    if (!isHumiApiSession(humiSession)) {
      if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
        showNotice("登录后就能邀请家人");
      } else {
        showNotice("请先在小程序里登录 Humi");
      }
      return;
    }
    if (family?.role && family.role !== "owner") {
      showNotice("只有主厨能邀请家人加入这个家");
      return;
    }
    setHouseholdInvitePending(true);
    showNotice("正在准备家庭邀请...");
    try {
      const activeHouseholdId = humiHouseholds.some((household) => household.id === family?.id)
        ? family.id
        : "";
      const data = await createHouseholdInvite(humiSession, {
        householdId: activeHouseholdId,
        inviterName: getDisplayName(displaySession) || "主厨",
      });
      setActiveHouseholdInvite(data.invite);
      showNotice("邀请已准备好，请点“选择家人发送”");
    } catch (error) {
      showNotice(error.message || "家庭邀请暂时没生成成功");
    } finally {
      setHouseholdInvitePending(false);
    }
  }

  async function shareHouseholdInvite(invite = activeHouseholdInvite) {
    if (!invite?.token) {
      await createFamilyInviteCard();
      return;
    }
    const nativeStatus = await requestMiniProgramShare({
      type: "invite",
      token: invite.token,
      householdName: invite.householdName || family?.name || "我的家",
      initiatorName: invite.inviterName || getDisplayName(displaySession) || "主厨",
    });
    if (nativeStatus === "handoff") {
      return;
    }
    if (isWechatMiniProgramWebView()) {
      showNotice("没能打开微信发送页，请再试一次");
      return;
    }
    await copyShareUrl(buildHouseholdInviteUrl(invite.token));
    showNotice("家庭邀请链接已复制");
  }

  async function migrateGroceryToCloud() {
    if (isHumiApiSession(humiSession)) {
      setCloudGroceryLoading(true);
      setCloudGroceryStatus("正在保存食材清单...");
      try {
        await saveHumiState(humiSession, humiStateSnapshot);
        setCloudMenuEnabled(true);
        setCloudGroceryEnabled(true);
        setCloudSyncStatus("今晚菜单和一周计划也会继续自动同步。");
        setCloudGroceryStatus("食材清单已保存到微信账号。");
        showNotice("清单已保存到微信账号");
      } catch (error) {
        setCloudGroceryStatus(formatCloudSyncError(error));
      } finally {
        setCloudGroceryLoading(false);
      }
      return;
    }
    setCloudGroceryStatus("请先微信登录并创建我的家。");
  }

  async function refreshCloudGrocery() {
    if (isHumiApiSession(humiSession)) {
      try {
        setCloudGroceryLoading(true);
        const data = await loadHumiStateEnvelope(humiSession);
        const state = data.state;
        if (data.family) setFamily(data.family);
        if (Array.isArray(data.households)) setHumiHouseholds(data.households);
        setCustomItems(Array.isArray(state?.customItems) ? state.customItems : []);
        setCheckedItems(state?.checkedItems ?? {});
        setExcludedGroceryKeys(Array.isArray(state?.excludedGroceryKeys) ? state.excludedGroceryKeys : []);
        setPantryItems(Array.isArray(state?.pantryItems) ? state.pantryItems : []);
        setCloudGroceryStatus("已刷新微信账号保存的清单。");
        showNotice("微信账号清单已刷新");
      } catch (error) {
        setCloudGroceryStatus(formatCloudSyncError(error));
      } finally {
        setCloudGroceryLoading(false);
      }
      return;
    }
    setCloudGroceryStatus("请先微信登录并创建我的家。");
  }

  const cloudMenuProps = {
    family,
    signedIn,
    autoSync: isHumiApiSession(humiSession),
    cloudMenuEnabled,
    cloudMenuLoading,
    cloudSyncStatus,
    onMigrateLocalMenus: migrateMenusToCloud,
    onRefreshCloudMenus: refreshCloudMenus,
    cloudGroceryEnabled,
    cloudGroceryLoading,
    cloudGroceryStatus,
    onMigrateLocalGrocery: migrateGroceryToCloud,
    onRefreshCloudGrocery: refreshCloudGrocery,
  };

  function saveFamilyProfile(nextProfile) {
    const normalizedProfile = {
      ...defaultFamilyProfile,
      ...nextProfile,
      planningMode: getPlanningMode(nextProfile.planningMode).id,
    };
    setFamilyProfile(normalizedProfile);
    setNutritionGoals((current) => (
      current?.modeId === normalizedProfile.planningMode ? current : getDefaultNutritionGoals(normalizedProfile)
    ));
    if (signedIn && getProfileCompletedCount(normalizedProfile) >= 4) {
      setProfileOnboardingComplete(true);
    }
    trackProductEvent(productEvents.profileSaved, {
      type: "family_profile",
      completedCount: getProfileCompletedCount(normalizedProfile),
    });
  }

  function completeProfileOnboarding(nextProfile, options = {}) {
    const normalizedProfile = {
      ...defaultFamilyProfile,
      ...nextProfile,
      planningMode: getPlanningMode(nextProfile.planningMode).id,
    };
    setFamilyProfile(normalizedProfile);
    setNutritionGoals(getDefaultNutritionGoals(normalizedProfile));
    if (!options.stayOnboarding) {
      setProfileOnboardingComplete(true);
      setActiveView("dashboard");
      showNotice("家庭偏好已保存，开始安排菜单");
    }
  }

  function selectPlanningMode(modeId) {
    const nextProfile = withPlanningModeDefaults(familyProfile, modeId);
    setFamilyProfile(nextProfile);
    setNutritionGoals(getDefaultNutritionGoals(nextProfile));
    setAiRecommendation(null);
    setAiRecommendationStatus(`${getPlanningMode(modeId).label}模式已切换，推荐会按这个场景来。`);
    showNotice(`已切换到${getPlanningMode(modeId).label}`);
  }

  function navigateTo(nextView, options = {}) {
    if (!nextView || nextView === activeView) return;
    if (options.replace) {
      viewHistoryRef.current = [...viewHistoryRef.current.slice(0, -1), nextView];
    } else {
      viewHistoryRef.current = [...viewHistoryRef.current, nextView].slice(-12);
    }
    setFlowMotion(getFlowMotion(activeView, nextView));
    setActiveView(nextView);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    window.clearTimeout(flowMotionTimerRef.current);
    flowMotionTimerRef.current = window.setTimeout(() => setFlowMotion(null), 760);
  }

  function goBack() {
    const history = viewHistoryRef.current;
    const previousView = history.length > 1 ? history[history.length - 2] : "dashboard";
    viewHistoryRef.current = history.length > 1 ? history.slice(0, -1) : ["dashboard"];
    if (previousView === activeView) return;
    setFlowMotion(getFlowMotion(activeView, previousView));
    setActiveView(previousView);
    window.clearTimeout(flowMotionTimerRef.current);
    flowMotionTimerRef.current = window.setTimeout(() => setFlowMotion(null), 760);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch || touch.clientX > 36) return;
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }

  function handleTouchEnd(event) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    if (dx > 72 && dy < 70 && Date.now() - start.time < 800) {
      if (selectedRecipeId) {
        closeRecipe();
        return;
      }
      if (activeView === "dashboard") return;
      goBack();
    }
  }

  function continueAsGuest() {
    setAuthGateIntent("");
    setSessionExpired(false);
    setEntryMotion(true);
    window.setTimeout(() => {
      const nextView = entryRedirectView || "dashboard";
      setOnboardingComplete(true);
      setActiveView(nextView);
      viewHistoryRef.current = [nextView];
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
      showNotice(nextView === "user" ? "可以先看看我的家" : "先从今晚吃什么开始");
      setEntryRedirectView("dashboard");
    }, 760);
    window.setTimeout(() => setEntryMotion(false), 1360);
  }

  function openFamilyCravePanel() {
    setActiveView("dashboard");
    viewHistoryRef.current = ["dashboard"];
    setCravePanelOpenSignal(Date.now());
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    showNotice("可以开始问问大家了");
  }

  function closeSharedLanding(paramName) {
    if (paramName === "crave") setLandingCraveToken("");
    if (paramName === "groceryShare") setLandingGroceryShareToken("");
    if (paramName === "menuShare") setLandingMenuShareToken("");
    if (paramName === "wishShare") setLandingWishShareToken("");
    if (paramName === "invite") setLandingInviteToken("");
    if (paramName === "mealTask") setLandingMealTaskToken("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete(paramName);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  function bindParticipationFromSharedLanding(paramName, context = null) {
    const nextContext = context?.type ? {
      ...context,
      createdAt: new Date().toISOString(),
    } : null;
    if (context?.type) {
      setPendingJoinContext(nextContext);
    }
    closeSharedLanding(paramName);
    setEntryRedirectView("user");
    setActiveView("user");
    viewHistoryRef.current = ["user"];
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    if (!signedIn && isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
      showNotice("正在唤起微信登录，登录后会合并刚才的参与");
      return;
    }
    showNotice(signedIn ? "已打开 Humi；这次参与只会绑定到你的身份" : "登录后会把刚才的参与绑定到你的身份");
  }

  async function acceptPendingJoinAsMember(context = pendingJoinContext) {
    if (!context?.type) {
      showNotice("没有待合并的参与记录");
      return;
    }
    if (![
      "crave",
      "grocery",
      "wish",
    ].includes(context.type)) {
      showNotice("这次参与记录类型无法识别，暂时不会合并");
      return;
    }
    if (!signedIn) {
      if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) {
        showNotice("正在唤起微信登录");
      } else {
        showNotice("登录后会把刚才的参与绑定到你的身份");
      }
      return;
    }
    if (isHumiApiSession(humiSession) && context.token && context.guestParticipantId) {
      try {
        const payload = {
          guestParticipantId: context.guestParticipantId,
        };
        const data = context.type === "crave"
          ? await joinCraveRequest(context.token, humiSession, payload)
          : context.type === "grocery"
            ? await joinGroceryShareRequest(context.token, humiSession, payload)
            : await joinWishShareRequest(context.token, humiSession, payload);
        if (context.type === "crave" && data.request) setActiveCraveRequest((current) => ({ ...current, ...data.request }));
        if (context.type === "grocery" && data.request) setActiveGroceryShareRequest((current) => ({ ...current, ...data.request }));
        if (context.type === "wish" && data.request) setActiveWishShareRequest((current) => ({ ...current, ...data.request }));
        mergeTemporaryParticipationIntoMember(context, data.participant);
        clearGuestParticipantId(context.type, context.token);
        setPendingJoinContext(null);
        pendingJoinMergeRef.current = "";
        showNotice("刚才的参与已绑定到你的身份；家庭关系保持不变");
        return;
      } catch (error) {
        pendingJoinMergeRef.current = "";
        showNotice(error.message || "参与合并暂时没完成，请稍后重试");
        return;
      }
    }
    mergeTemporaryParticipationIntoMember(context);
    setPendingJoinContext(null);
    showNotice("刚才的参与已在本机合并；这不会创建家庭成员关系");
  }

  function mergeTemporaryParticipationIntoMember(context = {}, participant = null) {
    const participantKey = String(context.guestParticipantId || "").trim();
    const actionId = String(context.actionId || "").trim();
    const memberName = String(participant?.displayName || "").trim();
    if (!participantKey || !actionId || !memberName) return;
    const avatar = String(participant?.avatar || "").trim();
    const now = new Date().toISOString();
    const matchesPendingAction = (requestToken, entry) => (
      requestToken === context.token && entry?.id === actionId
    );

    if (context.type === "crave") setActiveCraveRequest((current) => {
      if (!current?.votes?.length) return current;
      let changed = false;
      const votes = current.votes.map((vote) => {
        if (!matchesPendingAction(current.token, vote)) return vote;
        changed = true;
        const { participantKey: _participantKey, ...safeVote } = vote;
        return {
          ...safeVote,
          memberName,
          avatar,
          temporary: false,
          mergedAt: now,
        };
      });
      return changed ? { ...current, votes } : current;
    });

    if (context.type === "crave") setCraveSignals((current) => {
      let changed = false;
      const nextSignals = current.map((signal) => {
        const votes = Array.isArray(signal.votes) ? signal.votes : [];
        let signalChanged = false;
        const nextVotes = votes.map((vote) => {
          if (!matchesPendingAction(signal.requestToken, vote)) return vote;
          changed = true;
          signalChanged = true;
          const { participantKey: _participantKey, ...safeVote } = vote;
          return {
            ...safeVote,
            memberName,
            avatar,
            temporary: false,
            mergedAt: now,
          };
        });
        return signalChanged ? {
          ...signal,
          votes: nextVotes,
          updatedAt: now,
        } : signal;
      });
      return changed ? nextSignals : current;
    });

    if (context.type === "grocery") setActiveGroceryShareRequest((current) => {
      if (!current?.claims?.length) return current;
      let changed = false;
      const claims = current.claims.map((claim) => {
        if (!matchesPendingAction(current.token, claim)) return claim;
        changed = true;
        const { participantKey: _participantKey, ...safeClaim } = claim;
        return {
          ...safeClaim,
          memberName,
          avatar,
          temporary: false,
          mergedAt: now,
        };
      });
      return changed ? { ...current, claims } : current;
    });

    if (context.type === "wish") setActiveWishShareRequest((current) => {
      if (!current?.wishes?.length) return current;
      let changed = false;
      const wishes = current.wishes.map((wish) => {
        if (!matchesPendingAction(current.token, wish)) return wish;
        changed = true;
        const { participantKey: _participantKey, ...safeWish } = wish;
        return {
          ...safeWish,
          memberName,
          avatar,
          temporary: false,
          mergedAt: now,
        };
      });
      return changed ? { ...current, wishes } : current;
    });

  }

  if (landingCraveToken) {
    return (
      <CraveLanding
        token={landingCraveToken}
        humiSession={humiSession}
        onClose={() => closeSharedLanding("crave")}
        onBindParticipation={(context) => bindParticipationFromSharedLanding("crave", context)}
      />
    );
  }

  if (landingGroceryShareToken) {
    return (
      <GroceryClaimLanding
        token={landingGroceryShareToken}
        humiSession={humiSession}
        onClose={() => closeSharedLanding("groceryShare")}
        onBindParticipation={(context) => bindParticipationFromSharedLanding("groceryShare", context)}
      />
    );
  }

  if (landingMenuShareToken) {
    return (
      <MenuShareLanding
        token={landingMenuShareToken}
        onClose={() => closeSharedLanding("menuShare")}
      />
    );
  }

  if (landingWishShareToken) {
    return (
      <WishLanding
        token={landingWishShareToken}
        humiSession={humiSession}
        onClose={() => closeSharedLanding("wishShare")}
        onBindParticipation={(context) => bindParticipationFromSharedLanding("wishShare", context)}
      />
    );
  }

  if (landingInviteToken) {
    return (
      <InviteLanding
        token={landingInviteToken}
        humiSession={humiSession}
        onJoined={(data) => {
          applyHumiStateEnvelope(data, {
            loadedMenuStatus: "已加入这个家，并读取这个家的今晚菜单和征集记录。",
            loadedGroceryStatus: "已加入这个家，并读取这个家的清单和后台已有。",
            emptyMenuStatus: "已加入这个家。这个家还没有保存菜单。",
            emptyGroceryStatus: "已加入这个家。这个家还没有保存清单和后台已有。",
          });
          setOnboardingComplete(true);
          setProfileOnboardingComplete(true);
        }}
        onClose={() => {
          closeSharedLanding("invite");
          setOnboardingComplete(true);
          setActiveView("user");
          viewHistoryRef.current = ["user"];
        }}
      />
    );
  }

  if (landingMealTaskToken) {
    return (
      <MealTaskLanding
        token={landingMealTaskToken}
        humiSession={humiSession}
        onLogin={() => {
          if (isWechatMiniProgramWebView() && requestWechatLoginFromMiniProgram()) return;
          setAuthStatus("请从微信小程序打开这张任务卡并完成微信登录。" );
        }}
        onClose={() => closeSharedLanding("mealTask")}
      />
    );
  }

  if (humiSession?.user && !identityComplete && !sharedGuestLanding) {
    return (
      <HumiIdentitySetup
        session={humiSession}
        onComplete={(user) => {
          const normalized = saveHumiSession({ ...humiSession, user: { ...humiSession.user, ...user } });
          setHumiSession(normalized);
          setOnboardingComplete(true);
          setAuthStatus("身份已完善，欢迎回来。");
        }}
      />
    );
  }

  if (!signedIn && (sessionExpired || authGateIntent || !onboardingComplete) && !sharedGuestLanding) {
    return (
      <>
        <AuthLanding
          onContinueGuest={continueAsGuest}
          entryIntent={authGateIntent || (sessionExpired ? "sessionExpired" : entryRedirectView === "user" ? "joinFamily" : "")}
        />
        {entryMotion && <EntryTableMotion />}
      </>
    );
  }

  if (signedIn && !profileOnboardingComplete) {
    return (
      <ProfileOnboarding
        profile={familyProfile}
        onComplete={completeProfileOnboarding}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <OfflineStatus online={online} />
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:py-6">
        <Sidebar activeView={activeView} onChange={navigateTo} />
        <main
          className="min-w-0 flex-1 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeView !== "dashboard" && (
              <Topbar
                activeView={activeView}
                titleOverride={activeView === "library"
                  ? libraryMealSlot ? `给${slotLabelsById[libraryMealSlot] ?? "这一餐"}选菜` : undefined
                  : undefined}
                query={query}
                setQuery={setQuery}
                session={displaySession}
              onOpenUserCenter={() => navigateTo("user")}
              onBack={activeView === "grocery" || activeView === "user" ? undefined : goBack}
            />
          )}
          <div key={activeView} className={`view-enter ${flowMotion ? `flow-motion-${flowMotion}` : ""}`}>
            {activeView === "dashboard" && (
              <Dashboard
                todayRecipes={todayRecipes}
                todayMeals={todayMeals}
                weekPlan={weekPlan}
                recommendation={displayedRecommendation}
                aiRecommendationStatus={aiRecommendationStatus}
                aiRecommendationLoading={aiRecommendationLoading}
                onViewChange={navigateTo}
                onOpenRecipe={openRecipe}
                onAddRecommended={addRecommendedToday}
                onAcceptCraveSelection={addSelectedRecommendedToday}
                onRequestAiRecommendation={requestAiRecommendation}
                onOpenRecommendationFeedback={() => setRecommendationFeedbackOpen(true)}
                feedbackOpen={recommendationFeedbackOpen}
                onSubmitRecommendationFeedback={(reason) => requestAiRecommendation(reason)}
                onCloseRecommendationFeedback={() => setRecommendationFeedbackOpen(false)}
                onStartCraveRequest={startCraveRequest}
                activeCraveRequest={activeCraveRequest}
                craveRequestPending={craveRequestPending}
                craveRequestStatus={craveRequestStatus}
                onShareCraveRequest={() => shareCraveRequest()}
                onRefreshCraveRequest={refreshCraveRequest}
                onFinishCraveRequest={finishCraveRequest}
                onRestartCraveRequest={restartCraveFeelingChoice}
                cravePanelOpenSignal={cravePanelOpenSignal}
                onConfirmPantryItem={confirmPantryItemAvailability}
                pantryItemCount={pantryItems.length}
                onAddPantryHints={addPantryHints}
                onPickForMeal={pickForMeal}
                breakfastChoices={breakfastChoices}
                onChooseBreakfast={chooseBreakfast}
                onOpenRecipeLibrary={openRecipeLibrary}
                householdMembers={householdMembers}
                session={displaySession}
                onOpenUserCenter={() => navigateTo("user")}
                familyProfile={familyProfile}
                groceryItemCount={visibleGroceryItems.length}
                onSelectPlanningMode={selectPlanningMode}
                onPlanRecommendedWeek={planRecommendedWeek}
                mealLog={todayMealLog}
                mealLogs={mealLogs}
                onSetDinnerSource={setDinnerSource}
                onSetMealSource={setMealSource}
                onSetDinnerConfirmation={setDinnerConfirmation}
                onToggleConsumedRecipe={toggleConsumedRecipe}
                canManageHousehold={canManageHousehold}
                mealExecution={mealExecutionProps}
              />
            )}
            {activeView === "library" && (
              <Library
                categories={categories}
                category={category}
                setCategory={setCategory}
                recipes={filteredRecipes}
                allRecipes={recipes}
                onAdd={addRecipeFromLibrary}
                onUpdateQuantity={updateLibraryQuantity}
                menuQuantities={libraryMenuQuantities}
                cravedRecipeIds={wishPool.map((item) => item.recipeId).filter(Boolean)}
                onCraveRecipe={addRecipeToWishPool}
                parentLabel={libraryParentLabel}
                targetMealSlot={libraryMealSlot}
                targetMealLabel={libraryMealSlot ? slotLabelsById[libraryMealSlot] : ""}
                onClearTargetMeal={() => setLibraryMealSlot(null)}
                onOpenRecipe={openRecipe}
                onDragStart={setDraggedRecipeId}
                canManageHousehold={canManageHousehold}
              />
            )}
            {activeView === "recommendations" && (
              <RecommendationsPage
                recommendation={displayedRecommendation}
                aiRecommendationLoading={aiRecommendationLoading}
                preciseRecommendationEnabled={preciseRecommendationAvailable}
                onRefresh={() => requestAiRecommendation()}
                onAccept={() => {
                  addRecommendedToday();
                  navigateTo("today");
                }}
                onReject={(reason) => requestAiRecommendation(reason)}
                onOpenRecipe={openRecipe}
                onOpenRecipeLibrary={openRecipeLibrary}
                onViewChange={navigateTo}
                canManageHousehold={canManageHousehold}
              />
            )}
            {activeView === "planner" && (
              <Planner
                weekPlan={weekPlan}
                mealPlan={mealPlan}
                weekDateKeys={weekDateKeys}
                draggedRecipeId={draggedRecipeId}
                onAssign={assignPlan}
                onAssignMeal={assignMealRecipe}
                onRemove={removePlanRecipe}
                onRemoveMeal={removeMealRecipe}
                onShare={shareWeekPlan}
                onViewChange={navigateTo}
                groceryItemCount={visibleGroceryItems.length}
                onGenerateWeek={planRecommendedWeek}
                canManageHousehold={canManageHousehold}
                cloudSync={{
                  family,
                  signedIn,
                  autoSync: isHumiApiSession(humiSession),
                  enabled: cloudMenuEnabled,
                  loading: cloudMenuLoading,
                  status: cloudSyncStatus,
                  onMigrate: migrateMenusToCloud,
                  onRefresh: refreshCloudMenus,
                  onOpenUserCenter: () => navigateTo("user"),
                }}
              />
            )}
            {activeView === "today" && (
              <TodayMenu
                todayRecipes={todayRecipes}
                groceryItems={visibleGroceryItems}
                onAddToday={addToday}
                onUpdateQuantity={updateTodayQuantity}
                onOpenRecipe={openRecipe}
                onViewChange={navigateTo}
                onShare={shareTodayMenu}
                onCreatePoster={createTodayMenuPosterPreview}
                shareMode={isWechatMiniProgramWebView() ? "mini" : "poster"}
                mealLog={todayMealLog}
                mealLogs={mealLogs}
                onSetDinnerSource={setDinnerSource}
                onSetDinnerConfirmation={setDinnerConfirmation}
                onToggleConsumedRecipe={toggleConsumedRecipe}
                onOpenRecipeLibrary={openRecipeLibrary}
                canManageHousehold={canManageHousehold}
                cloudSync={{
                  family,
                  signedIn,
                  autoSync: isHumiApiSession(humiSession),
                  enabled: cloudMenuEnabled,
                  loading: cloudMenuLoading,
                  status: cloudSyncStatus,
                  onMigrate: migrateMenusToCloud,
                  onRefresh: refreshCloudMenus,
                  onOpenUserCenter: () => navigateTo("user"),
                }}
              />
            )}
            {activeView === "calendar" && (
              <CalendarPage
                mealCalendar={mealCalendar}
                onAssign={assignDatePlan}
                onRemove={removeDatePlan}
                onOpenRecipe={openRecipe}
                canManageHousehold={canManageHousehold}
              />
            )}
            {activeView === "grocery" && (
              <GroceryList
                items={visibleGroceryItems}
                groups={visibleGroceryGroups}
                customItems={customItems}
                newCustomItem={newCustomItem}
                setNewCustomItem={setNewCustomItem}
                onAddCustomItem={addCustomItem}
                onRemoveCustomItem={removeCustomItem}
                onExcludeItem={excludeGroceryItem}
                onRestoreItem={restoreGroceryItem}
                onRestoreAllItems={restoreAllGroceryItems}
                excludedItems={excludedGroceryItems}
                onShare={shareGroceryList}
                onCreatePoster={createGroceryListPoster}
                checkedItems={checkedItems}
                setCheckedItems={setCheckedItems}
                onGroceryItemChecked={({ key, checked, item }) => {
                  trackValidationEvent(validationEvents.groceryItemChecked, { key, checked });
                  if (checked) addGroceryItemToPantry(item);
                }}
                activeShareRequest={activeGroceryShareRequest}
                onRefreshShare={refreshGroceryShareRequest}
                cloudSync={{
                  family,
                  signedIn,
                  autoSync: isHumiApiSession(humiSession),
                  enabled: cloudGroceryEnabled,
                  loading: cloudGroceryLoading,
                  status: cloudGroceryStatus,
                  onMigrate: migrateGroceryToCloud,
                  onRefresh: refreshCloudGrocery,
                }}
                onOpenUserCenter={() => navigateTo("user")}
                onPlanDinner={() => navigateTo("dashboard")}
                shareMode={isWechatMiniProgramWebView() ? "mini" : "poster"}
              />
            )}
            {activeView === "stats" && (
              <StatsPage
                todayRecipes={todayRecipes}
                plannedRecipes={plannedRecipes}
                groceryItems={visibleGroceryItems}
                weekPlan={weekPlan}
                mealCalendar={mealCalendar}
                mealPlan={mealPlan}
                mealLogs={mealLogs}
                familyProfile={familyProfile}
                nutritionGoals={nutritionGoals}
                pantryItems={pantryItems}
                onViewChange={navigateTo}
              />
            )}
            {activeView === "user" && (
              <UserCenter
                authProps={authProps}
                cloudMenuProps={cloudMenuProps}
                session={displaySession}
                humiSession={humiSession}
                family={family}
                households={humiHouseholds}
                familyProfile={familyProfile}
                setFamilyProfile={saveFamilyProfile}
                mealLogs={mealLogs}
                nutritionGoals={nutritionGoals}
                setNutritionGoals={setNutritionGoals}
                recommendationFeedback={recommendationFeedback}
                aiRecommendationStatus={aiRecommendationStatus}
                preciseRecommendationAvailable={preciseRecommendationAvailable}
                craveSignals={craveSignals}
                wishPool={wishPool}
                activeCraveRequest={activeCraveRequest}
                craveRequestPending={craveRequestPending}
                activeGroceryShareRequest={activeGroceryShareRequest}
                groceryClaims={groceryClaims}
                activeWishShareRequest={activeWishShareRequest}
                pendingJoinContext={pendingJoinContext}
                onClearPendingJoinContext={() => setPendingJoinContext(null)}
                householdMembers={householdMembers}
                activeHouseholdInvite={activeHouseholdInvite}
                householdInvitePending={householdInvitePending}
                onCreateHousehold={createAnotherHumiHousehold}
                onSwitchHousehold={switchActiveHumiHousehold}
                onRenameHousehold={renameHumiHousehold}
                onRemoveMember={removeCurrentHouseholdMember}
                onTransferOwnership={transferHumiHouseholdOwner}
                onLeaveHousehold={leaveCurrentHumiHousehold}
                onSaveFamilyProfile={saveFamilyProfile}
                onCreateHouseholdInvite={createFamilyInviteCard}
                onShareHouseholdInvite={() => shareHouseholdInvite()}
                onAcceptPendingJoin={() => acceptPendingJoinAsMember()}
                onPlanWish={planWishPoolItem}
                onRemoveWish={removeWishPoolItem}
                onExportValidationData={exportLocalValidationData}
                onViewChange={navigateTo}
                onOpenRecipeLibrary={openRecipeLibrary}
                onAskFamily={openFamilyCravePanel}
                onStartCraveRequest={startCraveRequest}
                onShareCraveRequest={() => shareCraveRequest()}
                onRefreshCraveRequest={refreshCraveRequest}
                onFinishCraveRequest={finishCraveRequest}
                onRefreshGroceryShare={refreshGroceryShareRequest}
                onStartWishShare={startWishShareRequest}
                onShareWishRequest={() => shareWishRequest()}
                onRefreshWishShare={refreshWishShareRequest}
                canManageHousehold={canManageHousehold}
                currentMemberId={currentHouseholdMemberId}
              />
            )}
          </div>
        </main>
      </div>
      <IcpFooter />
      <MobileTabbar activeView={activeView} onChange={navigateTo} />
      {entryMotion && <EntryTableMotion />}
      {notice && (
        <div className="toast-enter fixed left-1/2 top-5 z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-2 pl-2 pr-5 text-sm font-black text-white shadow-lift">
          {notice.illustration && (
            <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
              <HumiPeek
                variant={notice.illustration}
                size="sm"
                className="scale-95"
                contextKey={`notice-${notice.illustration}`}
                preferGender="f"
              />
            </span>
          )}
          <span className="whitespace-nowrap">{notice.message}</span>
        </div>
      )}
      <PosterPreview
        poster={posterPreview}
        loading={posterLoading}
        onClose={closePosterPreview}
        onSave={savePosterPreview}
        onShare={sharePosterPreview}
        onRegenerate={regeneratePosterPreview}
      />
      <RecipeDetailDrawer
        recipe={selectedRecipe}
        cookingStep={cookingStep}
        setCookingStep={setCookingStep}
        onClose={closeRecipe}
        onAddToday={addToday}
        todayEntry={todayMenu.find((item) => item.recipeId === selectedRecipeId)}
        onUpdateTodayQuantity={updateTodayQuantity}
      />
    </div>
  );
}

function getInitialCraveToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("crave") || "";
}

function getInitialGroceryShareToken() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("groceryShare") || params.get("grocery") || "";
}

function getInitialMenuShareToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("menuShare") || "";
}

function getInitialWishShareToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("wishShare") || "";
}

function getInitialInviteToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("invite") || "";
}

function getInitialMealTaskToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("mealTask") || "";
}

function candidateMealRecipeIds(effortTier, todayMenu = []) {
  const currentDinner = todayMenu.map((entry) => entry.recipeId).filter((recipeId) => getRecipe(recipeId)?.cookAssist?.status === "certified");
  if (effortTier === "normal" && currentDinner.length > 0 && currentDinner.length === todayMenu.length) return currentDinner;
  if (effortTier === "easy_30") return ["tomato-tofu-shrimp-soup", "vinegar-cabbage"];
  if (effortTier === "normal") return ["cola-wings", "spinach-tofu-egg-drop-soup"];
  return ["tomato-egg"];
}

function getInitialView() {
  if (typeof window === "undefined") return "dashboard";
  const view = new URLSearchParams(window.location.search).get("view");
  const allowedViews = new Set(["dashboard", "today", "grocery", "user", "library", "recommendations", "planner", "calendar", "stats"]);
  return allowedViews.has(view) ? view : "dashboard";
}

function isSharedGuestLanding() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("groceryShare") || params.get("menuShare") || params.get("wishShare") || params.get("mealTask") || params.get("shareSource") || params.get("view") === "grocery" || params.get("view") === "today");
}

function getDisplayName(session) {
  return session?.user?.nickname
    || session?.user?.name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split("@")[0]
    || "";
}

function getLibraryParentLabel(activeView) {
  if (activeView === "user") return "我的家";
  if (activeView === "today") return "今晚菜单";
  if (activeView === "planner") return "计划";
  return "发现";
}

function buildCraveUrl(token) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("crave", token);
  return url.toString();
}

function buildHouseholdInviteUrl(token) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  url.searchParams.set("shareSource", "invite");
  return url.toString();
}

function buildWishShareUrl(token) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("wishShare", token);
  url.searchParams.set("shareSource", "wish");
  return url.toString();
}

function buildMenuShareUrl(token) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("menuShare", token);
  url.searchParams.set("shareSource", "today_menu");
  return url.toString();
}

function buildMealTaskUrl(token) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("mealTask", token);
  url.searchParams.set("shareSource", "meal_task");
  return url.toString();
}

function formatReminderDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "下次做饭时间";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function persistMealExecutionValue(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current screen remains usable if private browsing blocks local persistence.
  }
}

function isMealExecutionNetworkError(error) {
  const message = String(error?.message || "");
  return error instanceof TypeError || /网络|连接|fetch|load failed|timeout/i.test(message);
}

function buildGroceryShareItems(groceryItems = [], customItems = [], checkedItems = {}) {
  const recipeItems = groceryItems.map((item) => ({
    id: item.key,
    name: item.name,
    amount: formatRawAmount(item),
    category: item.category || item.type || "",
    checked: Boolean(checkedItems[item.key]),
  }));
  const manualItems = customItems.map((item) => ({
    id: item.key,
    name: item.name,
    amount: item.amount || "自定义",
    category: "顺手买",
    checked: Boolean(checkedItems[item.key]),
  }));
  return [...recipeItems, ...manualItems].slice(0, 80);
}

async function copyShareUrl(url, successMessage) {
  if (!url || typeof navigator === "undefined") return;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("humi:copied-share-url", { detail: { successMessage } }));
  }
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function findRecipeByName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  return recipes.find((recipe) => {
    const recipeName = normalizeName(recipe.name);
    return recipeName === normalized || recipeName.includes(normalized) || normalized.includes(recipeName);
  }) ?? null;
}

function formatCloudSyncError(error) {
  const message = error?.message ?? "";
  if (!message) return "暂时没连上我的家，稍后再试一次。";
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("Load failed")) {
    return "网络或服务器暂时连不上，已保留本机数据，稍后可以重试。";
  }
  if (message.includes("401") || message.includes("UNAUTHORIZED") || message.includes("登录")) {
    return "登录状态可能过期了，请到我的家重新登录后再同步。";
  }
  if (message.includes("timeout") || message.includes("超时")) {
    return "同步等待超时，本机数据还在，稍后可以再点刷新。";
  }
  return message;
}

function buildBreakfastChoices(logs = {}) {
  const recentRecipeIds = Object.entries(logs)
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([, log]) => log?.meals?.breakfast?.consumedEntries ?? [])
    .map((entry) => entry?.recipeId)
    .filter(Boolean);
  const quickBreakfastRecipeIds = recipes
    .filter((recipe) => recipe.categories.includes("早餐"))
    .sort((left, right) => left.timeMinutes - right.timeMinutes)
    .map((recipe) => recipe.id);
  return [...new Set([...recentRecipeIds, ...quickBreakfastRecipeIds])]
    .map((recipeId) => getRecipe(recipeId))
    .filter(Boolean)
    .slice(0, 6);
}

function collectLearnedCraveVotes(signals = [], activeRequest = null, fallbackFeeling = "") {
  const activeVotes = Array.isArray(activeRequest?.votes) ? activeRequest.votes : [];
  const signalVotes = (Array.isArray(signals) ? signals : []).flatMap((signal) => {
    if (Array.isArray(signal?.votes) && signal.votes.length > 0) return signal.votes;
    return signal?.feelingTag ? [{ feelingTag: signal.feelingTag }] : [];
  });
  const starterFeeling = activeRequest?.starterFeeling || activeRequest?.feelingTag || fallbackFeeling;
  const combined = [
    ...activeVotes,
    ...(starterFeeling ? [{ feelingTag: starterFeeling }] : []),
    ...signalVotes,
  ];
  const seen = new Set();
  return combined.filter((vote) => {
    const feelingTag = String(vote?.feelingTag || "").trim();
    if (!feelingTag || feelingTag === "随便都行") return false;
    const key = `${feelingTag}:${String(vote?.dishWish || "").trim()}:${String(vote?.note || "").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function validationEventsToCsv(events = []) {
  const headers = ["createdAt", "eventName", "sessionId", "payload"];
  const rows = events.map((event) => [
    event.createdAt,
    event.eventName,
    event.sessionId,
    JSON.stringify(event.payload ?? {}),
  ]);
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
}

function EntryTableMotion() {
  return (
    <div className="entry-table-motion fixed inset-0 z-[90] overflow-hidden bg-white text-ink">
      <div className="entry-decision-copy">
        <p className="entry-decision-line entry-decision-line--one">今天吃什么？</p>
        <div className="entry-decision-options">
          <span>炒菜</span>
          <span>面条</span>
          <span>外卖</span>
          <span>火锅</span>
        </div>
        <p className="entry-decision-line entry-decision-line--two">不用纠结</p>
        <p className="entry-decision-line entry-decision-line--three">Humi 帮你安排</p>
      </div>
      <div className="entry-table-motion__plate">
        <span className="entry-table-motion__dish entry-table-motion__dish--one" />
        <span className="entry-table-motion__dish entry-table-motion__dish--two" />
      </div>
      <div className="entry-final-copy">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-ink">HUMI</p>
        <p className="mt-3 text-2xl font-black tracking-[-0.04em]">今晚安排好了</p>
        <p className="mt-2 text-sm font-bold text-ink/54">肉末蒸蛋 · 青椒豆腐</p>
      </div>
    </div>
  );
}

function getFlowMotion(currentView, nextView) {
  if (currentView === nextView) return null;
  if (currentView === "dashboard" && nextView === "today") return "dish-to-menu";
  if ((currentView === "planner" || currentView === "today") && nextView === "grocery") return "ingredients";
  if (currentView === "grocery" && nextView === "user") return "pantry";
  if (nextView === "user" || nextView === "stats") return "portrait";
  return "soft";
}

function getRecommendationItems(recommendation) {
  if (Array.isArray(recommendation?.items) && recommendation.items.length > 0) {
    return recommendation.items
      .map((item) => {
        const recipe = item.recipe ?? getRecipe(item.recipeId);
        if (!recipe) return null;
        return {
          recipe,
          quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
          targetServings: item.targetServings,
        };
      })
      .filter(Boolean);
  }
  return (recommendation?.recipes ?? []).map((recipe) => ({ recipe, quantity: 1, targetServings: recipe.servings }));
}

function orderPlanDaysFrom(startDay) {
  const startIndex = Math.max(weekPlanDays.indexOf(startDay), 0);
  return [...weekPlanDays.slice(startIndex), ...weekPlanDays.slice(0, startIndex)];
}

function formatPreciseRecommendationStatus(entitlement) {
  if (entitlement?.cached) return "这次复用了已算好的精准推荐，没有消耗尝鲜额度。";
  if (entitlement?.paid) return "给你重新想好了一组。";
  if (Number.isFinite(entitlement?.trialRemaining)) {
    return entitlement.trialRemaining > 0
      ? `给你重新想好了一组。精准尝鲜还剩 ${entitlement.trialRemaining} 次。`
      : "给你重新想好了一组。精准尝鲜已用完，之后会自动回到基础推荐。";
  }
  return "给你重新想好了一组。";
}

function isPreciseTrialUsedError(error) {
  const message = String(error?.message || "");
  return message.includes("precise_trial_used") || message.includes("精准推荐尝鲜额度已用完");
}

function formatAiError(error) {
  const message = error?.message ?? "今晚建议暂时没想好。";
  if (isPreciseTrialUsedError(error)) {
    return "精准推荐尝鲜已用完；基础推荐仍可无限使用。";
  }
  if (message.includes("DEEPSEEK_API_KEY")) {
    return "今晚建议还没准备好。";
  }
  if (message.includes("UNAUTHORIZED") || message.includes("JWT")) {
    return "登录状态过期了，想保存家里的习惯可以重新登录。";
  }
  if (message.toLowerCase().includes("model")) {
    return "今晚建议暂时没想好。";
  }
  if (message.toLowerCase().includes("quota") || message.includes("余额") || message.toLowerCase().includes("balance")) {
    return "今晚建议暂时排队中。";
  }
  if (message.includes("FunctionsHttpError") || message.includes("Edge Function")) {
    return "今晚建议暂时没想好。";
  }
  return message;
}

function normalizeWishPoolState(state = {}) {
  const items = Array.isArray(state.wantToEatItems)
    ? state.wantToEatItems
    : Array.isArray(state.wishPool)
      ? state.wishPool
      : [];
  return items.map((item) => ({
    ...item,
    name: item.name || item.title || "一道菜",
    title: item.title || item.name || "一道菜",
    status: item.status === "done" ? "done" : "open",
  }));
}

function restoreActiveCraveRequest(state = {}) {
  if (state.activeCraveRequest?.token) return state.activeCraveRequest;
  const signal = (Array.isArray(state.craveSignals) ? state.craveSignals : [])
    .find((item) => item?.status !== "closed" && (item?.token || item?.requestToken));
  if (!signal) return null;
  return {
    ...signal,
    token: signal.token || signal.requestToken,
    starterFeeling: signal.starterFeeling || signal.feelingTag || "随便都行",
    status: signal.status || "open",
  };
}

createRoot(document.getElementById("root")).render(<App />);

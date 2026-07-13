import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthLanding } from "./components/AuthLanding";
import { CalendarPage } from "./components/CalendarPage";
import { CraveLanding } from "./components/CraveLanding";
import { Dashboard } from "./components/Dashboard";
import { GroceryList } from "./components/GroceryList";
import { GroceryShareLanding } from "./components/GroceryShareLanding";
import { InviteLanding } from "./components/InviteLanding";
import { Library } from "./components/Library";
import { Planner } from "./components/Planner";
import { PosterPreview } from "./components/PosterPreview";
import { ProfileOnboarding } from "./components/ProfileOnboarding";
import { RecipeDetailDrawer } from "./components/RecipeDetailDrawer";
import { RecommendationsPage } from "./components/RecommendationsPage";
import { IcpFooter, Sidebar, MobileTabbar, Topbar } from "./components/AppShell";
import { StatsPage } from "./components/StatsPage";
import { TodayMenu } from "./components/TodayMenu";
import { UserCenter } from "./components/UserCenter";
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
import { buildRecommendationItems, buildTodayRecommendation, recipeViolatesHardAvoid } from "./lib/recommendation/rules";
import { collectLearnedCraveVotes } from "./lib/collaboration";
import { buildCompactFamilyPrompt, getProfileCompletedCount, getPlanningMode, withPlanningModeDefaults } from "./lib/profile";
import { clearHumiSession, consumeHumiSessionFromUrl, readHumiSession } from "./lib/humiIdentity";
import {
  closeCraveRequest,
  createGroceryShare,
  createCraveRequest,
  createHumiHousehold,
  createHouseholdInvite,
  isHumiApiSession,
  loadCraveRequest,
  loadHumiState,
  logoutHumiSession,
  saveHumiState,
  switchHumiHousehold,
} from "./lib/humiApi";
import { getLaunchChannel } from "./lib/runtime";
import { appEvents, trackAppEvent } from "./lib/supabase/appEvents";
import { exportValidationData, trackValidationEvent, validationEvents } from "./lib/validationEvents";
import { explainRecommendation } from "./lib/supabase/aiExplanation";
import { recommendMeals } from "./lib/supabase/aiRecommendation";
import {
  createFamilySpace,
  getCurrentSession,
  loadPrimaryFamily,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
} from "./lib/supabase/family";
import {
  draftToPreference,
  inviteFamilyMember,
  loadFamilyPreferences,
  preferenceToDraft,
  saveMemberPreference,
} from "./lib/supabase/familyPreferences";
import {
  loadGrocerySync,
  migrateLocalGroceryToCloud,
  saveGrocerySync,
} from "./lib/supabase/grocerySync";
import {
  loadMenuSync,
  migrateLocalMenusToCloud,
  saveTodayMenu,
  saveWeekPlan,
} from "./lib/supabase/menuSync";
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
const defaultRecommendationAccess = {
  plan: "free",
  preciseTrialRemaining: 3,
  preciseUsed: 0,
};
const CRAVE_AUTO_GENERATE_MS = 30 * 60 * 1000;
const PRECISE_RECOMMENDATION_CACHE_LIMIT = 24;
const PRECISE_RECOMMENDATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

registerServiceWorker();

function App() {
  const appOpenTrackedRef = useRef(false);
  const flowMotionTimerRef = useRef(null);
  const humiStateLoadedRef = useRef(false);
  const humiStateHydratingRef = useRef(false);
  const viewHistoryRef = useRef(["dashboard"]);
  const swipeStartRef = useRef(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [craveLandingToken, setCraveLandingToken] = useState(() => getCraveTokenFromUrl());
  const [householdInviteToken, setHouseholdInviteToken] = useState(() => getHouseholdInviteTokenFromUrl());
  const [groceryShareToken, setGroceryShareToken] = useState(() => getGroceryShareTokenFromUrl());
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
  const [checkedItems, setCheckedItems] = useLocalStorageState("family-menu:checked-items", {});
  const [groceryClaims, setGroceryClaims] = useLocalStorageState("humi:grocery-claims:v1", {});
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
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [session, setSession] = useState(null);
  const [humiSession, setHumiSession] = useState(() => readHumiSession());
  const [family, setFamily] = useState(null);
  const [humiHouseholds, setHumiHouseholds] = useState([]);
  const [familyName, setFamilyName] = useState("我的家庭");
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
  const [cloudGroceryStatus, setCloudGroceryStatus] = useState("菜单保存后，食材清单也会跟着保存。");
  const [onboardingComplete, setOnboardingComplete] = useLocalStorageState("humi:onboarding-complete", false);
  const [profileOnboardingComplete, setProfileOnboardingComplete] = useLocalStorageState("humi:profile-onboarding-complete:v1", false);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [preferenceDraft, setPreferenceDraft] = useState({});
  const [familyProfile, setFamilyProfile] = useLocalStorageState("family-menu:family-profile", defaultFamilyProfile);
  const [nutritionGoals, setNutritionGoals] = useLocalStorageState(
    "humi:nutrition-goals:v1",
    () => getDefaultNutritionGoals(defaultFamilyProfile),
  );
  const [wantToEatItems, setWantToEatItems] = useLocalStorageState("humi:want-to-eat:v1", []);
  const [recommendationFeedback, setRecommendationFeedback] = useLocalStorageState("family-menu:recommendation-feedback", []);
  const [recommendationAccess, setRecommendationAccess] = useLocalStorageState("humi:recommendation-access:v1", defaultRecommendationAccess);
  const [preciseRecommendationCache, setPreciseRecommendationCache] = useLocalStorageState("humi:precise-recommendation-cache:v1", {});
  const [craveSignals, setCraveSignals] = useLocalStorageState("humi:crave-signals:v1", []);
  const [activeHouseholdInvite, setActiveHouseholdInvite] = useLocalStorageState("humi:household-invite:v1", null);
  const [cravePromptSignal, setCravePromptSignal] = useState(0);
  const [recommendationFeedbackOpen, setRecommendationFeedbackOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesStatus, setPreferencesStatus] = useState("创建家庭空间后，可同步家庭成员忌口。");
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiExplanationStatus, setAiExplanationStatus] = useState("先给你一组搭配理由；Humi 会慢慢记住家里的习惯。");
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiRecommendationStatus, setAiRecommendationStatus] = useState("先按家里现有情况给你安排；之后会继续参考家庭画像、食材线索和行为反馈。");
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(false);
  const [posterPreview, setPosterPreview] = useState(null);
  const [posterLoading, setPosterLoading] = useState(false);
  const [entryMotion, setEntryMotion] = useState(false);
  const [flowMotion, setFlowMotion] = useState(null);
  const signedIn = Boolean(session?.user || humiSession?.user);
  const displaySession = session ?? (humiSession ? { user: humiSession.user } : null);
  const todayDateKey = formatDateKey(new Date());
  const weekDateKeys = useMemo(() => {
    const weekStart = getWeekStartDate();
    return Object.fromEntries(
      weekPlanDays.map((day, index) => [day, formatDateKey(addDays(weekStart, index))]),
    );
  }, [activeWeekKey]);
  const slotLabelsById = useMemo(
    () => Object.fromEntries(mealSlots.map((slot) => [slot.id, slot.label])),
    [],
  );
  const todayMeals = useMemo(() => getDayMeals(mealPlan, todayDateKey), [mealPlan, todayDateKey]);
  const libraryMenuQuantities = useMemo(
    () => libraryMealSlot && libraryMealSlot !== "dinner" ? todayMeals[libraryMealSlot] ?? [] : todayMenu,
    [libraryMealSlot, todayMeals, todayMenu],
  );
  const humiStateSnapshot = useMemo(() => ({
    todayMenu,
    weekPlan,
    mealPlan,
    mealCalendar,
    mealLogs,
    checkedItems,
    groceryClaims,
    customItems,
    excludedGroceryKeys,
    pantryItems,
    familyProfile,
    nutritionGoals,
    wantToEatItems,
    recommendationAccess,
    recommendationFeedback,
    craveSignals,
  }), [
    checkedItems,
    groceryClaims,
    customItems,
    excludedGroceryKeys,
    familyProfile,
    mealPlan,
    mealCalendar,
    mealLogs,
    nutritionGoals,
    pantryItems,
    wantToEatItems,
    recommendationAccess,
    recommendationFeedback,
    craveSignals,
    todayMenu,
    weekPlan,
  ]);

  useEffect(() => {
    const nextHumiSession = consumeHumiSessionFromUrl();
    if (!nextHumiSession) return;
    setHumiSession(nextHumiSession);
    setOnboardingComplete(true);
    setProfileOnboardingComplete(true);
    setAuthStatus("已通过微信登录 Humi。");
    setAiExplanationStatus("已登录。Humi 会继续根据你的家庭画像和晚饭反馈调整说明。");
    setAiRecommendationStatus("已登录。推荐会继续参考家庭画像、食材线索和晚饭反馈。");
    showNotice("已登录 Humi");
  }, [setOnboardingComplete, setProfileOnboardingComplete]);

  useEffect(() => {
    if (!isHumiApiSession(humiSession)) {
      humiStateLoadedRef.current = false;
      humiStateHydratingRef.current = false;
      return undefined;
    }
    let active = true;
    humiStateLoadedRef.current = false;
    humiStateHydratingRef.current = true;
    setFamily(createHumiSessionFamily(humiSession));
    setCloudMenuEnabled(true);
    setCloudGroceryEnabled(true);
    setCloudMenuLoading(true);
    setCloudGroceryLoading(true);
    setCloudSyncStatus("正在读取微信账号保存的菜单...");
    setCloudGroceryStatus("正在读取微信账号保存的食材清单...");

    async function loadWechatState() {
      try {
        const data = await loadHumiState(humiSession);
        if (!active) return;
        applyHumiStateEnvelope(data, {
          loadedMenuStatus: "已读取微信账号保存的今晚菜单和连排计划。",
          loadedGroceryStatus: "已读取微信账号保存的食材清单。",
          emptyMenuStatus: "微信账号保存已开启，今晚菜单会自动保存。",
          emptyGroceryStatus: "微信账号保存已开启，食材清单会自动保存。",
        });
        humiStateLoadedRef.current = true;
      } catch (error) {
        if (active) {
          setCloudSyncStatus(error.message);
          setCloudGroceryStatus(error.message);
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
    };
  }, [humiSession?.accessToken]);

  useEffect(() => {
    if (!isHumiApiSession(humiSession) || !humiStateLoadedRef.current || humiStateHydratingRef.current) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveHumiState(humiSession, humiStateSnapshot);
        setCloudSyncStatus("今晚菜单和连排计划已保存到微信账号。");
        setCloudGroceryStatus("食材清单已保存到微信账号。");
      } catch (error) {
        setCloudSyncStatus(error.message);
        setCloudGroceryStatus(error.message);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [humiSession, humiStateSnapshot]);

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
    void trackAppEvent({
      eventName: appEvents.appOpen,
      payload: {
        path: window.location.pathname,
        source: getLaunchChannel(),
        online,
      },
    });
  }, [mealLogs, online, todayDateKey]);

  useEffect(() => {
    if (!session?.user || !family?.id || !cloudMenuEnabled) return;
    let active = true;

    async function loadCloudMenus() {
      setCloudMenuLoading(true);
      setCloudSyncStatus("正在从云端读取菜单...");
      try {
        const cloudMenus = await loadMenuSync(family.id);
        if (!active) return;
        setTodayMenu(cloudMenus.todayMenu);
        setWeekPlan(cloudMenus.weekPlan);
        setMealPlan(createMealPlanFromLegacy({
          weekPlan: cloudMenus.weekPlan,
          todayMenu: cloudMenus.todayMenu,
          todayDateKey,
          currentDay: getCurrentPlanDay(),
        }));
        setCloudSyncStatus("已读取我的家里保存的今晚菜单和连排计划。");
      } catch (error) {
        if (active) setCloudSyncStatus(error.message);
      } finally {
        if (active) setCloudMenuLoading(false);
      }
    }

    loadCloudMenus();
    return () => {
      active = false;
    };
  }, [cloudMenuEnabled, family?.id, session?.user, setMealPlan, setTodayMenu, setWeekPlan, todayDateKey]);

  useEffect(() => {
    if (!session?.user || !family?.id || !cloudMenuEnabled || cloudMenuLoading) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveTodayMenu(family.id, todayMenu);
        setCloudSyncStatus("今晚菜单已保存到我的家。");
      } catch (error) {
        setCloudSyncStatus(error.message);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [cloudMenuEnabled, cloudMenuLoading, family?.id, session?.user, todayMenu]);

  useEffect(() => {
    if (!session?.user || !family?.id || !cloudMenuEnabled || cloudMenuLoading) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveWeekPlan(family.id, weekPlan);
        setCloudSyncStatus("连排计划已保存到我的家。");
      } catch (error) {
        setCloudSyncStatus(error.message);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [cloudMenuEnabled, cloudMenuLoading, family?.id, session?.user, weekPlan]);

  useEffect(() => {
    if (!session?.user || !family?.id || !cloudGroceryEnabled) return;
    let active = true;

    async function loadCloudGrocery() {
      setCloudGroceryLoading(true);
      setCloudGroceryStatus("正在从云端读取食材清单...");
      try {
        const cloudGrocery = await loadGrocerySync(family.id);
        if (!active) return;
        setCustomItems(cloudGrocery.customItems);
        setCheckedItems(cloudGrocery.checkedItems);
        setExcludedGroceryKeys(cloudGrocery.excludedGroceryKeys);
        setPantryItems(cloudGrocery.pantryItems);
        setCloudGroceryStatus("已从云端读取食材清单。");
      } catch (error) {
        if (active) setCloudGroceryStatus(error.message);
      } finally {
        if (active) setCloudGroceryLoading(false);
      }
    }

    loadCloudGrocery();
    return () => {
      active = false;
    };
  }, [
    cloudGroceryEnabled,
    family?.id,
    session?.user,
    setCheckedItems,
    setCustomItems,
    setExcludedGroceryKeys,
    setPantryItems,
  ]);

  useEffect(() => {
    if (!session?.user || !family?.id || !cloudGroceryEnabled || cloudGroceryLoading) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveGrocerySync({
          familyId: family.id,
          customItems,
          checkedItems,
          excludedGroceryKeys,
          pantryItems,
        });
        setCloudGroceryStatus("食材清单已保存到我的家。");
      } catch (error) {
        setCloudGroceryStatus(error.message);
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    checkedItems,
    cloudGroceryEnabled,
    cloudGroceryLoading,
    customItems,
    excludedGroceryKeys,
    family?.id,
    pantryItems,
    session?.user,
  ]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    async function bootCloud() {
      try {
        const currentSession = await getCurrentSession();
        if (!active) return;
        setSession(currentSession);
        if (currentSession?.user) {
          setOnboardingComplete(true);
          setCloudLoading(true);
          const currentFamily = await loadPrimaryFamily(currentSession.user);
          if (active) setFamily(currentFamily);
        }
      } catch (error) {
        if (active) setAuthStatus(error.message);
      } finally {
        if (active) setCloudLoading(false);
      }

      unsubscribe = await subscribeToAuthChanges(async (nextSession) => {
        setSession(nextSession);
        if (!nextSession?.user) {
          if (!readHumiSession()) setFamily(null);
          return;
        }
        setFamily(null);
        setOnboardingComplete(true);
        setCloudLoading(true);
        try {
          const currentFamily = await loadPrimaryFamily(nextSession.user);
          setFamily(currentFamily);
        } catch (error) {
          setAuthStatus(error.message);
        } finally {
          setCloudLoading(false);
        }
      });
    }

    bootCloud();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user || !family?.id) {
      setFamilyMembers([]);
      setPreferenceDraft({});
      setInviteEmail("");
      setPreferencesStatus("创建家庭空间后，可同步家庭成员忌口。");
      return;
    }

    let active = true;
    loadPreferencesForFamily({ active: () => active });
    return () => {
      active = false;
    };
  }, [family?.id, session?.user]);

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
  const plannedEntries = mealPlanEntriesForGroceries(mealPlan, ({ dateKey, slotId }) => {
    const day = Object.entries(weekDateKeys).find(([, key]) => key === dateKey)?.[0];
    const dateLabel = day ?? formatDateLabel(dateKey);
    return `${dateLabel}·${slotLabelsById[slotId] ?? "餐次"}`;
  });
  const plannedRecipes = plannedEntries.map((entry) => getRecipe(entry.recipeId)).filter(Boolean);
  const selectedRecipe = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
  const recipeEntries = plannedEntries.length > 0
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
    () => collectLearnedCraveVotes(craveSignals),
    [craveSignals],
  );
  const todayRecommendation = useMemo(
    () =>
      buildTodayRecommendation({
        pantryItems,
        weekPlan,
        mealLogs,
        groceryItems: visibleGroceryItems,
        todayRecipes,
        familyMembers,
        familyProfile,
        wantToEatItems,
        craveVotes: learnedCraveVotes,
      }),
    [familyMembers, familyProfile, learnedCraveVotes, mealLogs, pantryItems, todayRecipes, visibleGroceryItems, wantToEatItems, weekPlan],
  );

  useEffect(() => {
    setAiExplanation("");
    setAiExplanationStatus(
      signedIn
        ? "先给你一组搭配理由；Humi 会继续参考家里的习惯。"
        : "先给你一组搭配理由；Humi 会慢慢记住家里的习惯。",
    );
    setAiRecommendation((current) => current?.source === "crave" ? current : null);
    setAiRecommendationStatus(
      signedIn
        ? "先按家里现有情况给你安排；推荐会继续参考家庭画像、食材线索和晚饭反馈。"
        : "先按家里现有情况给你安排；之后会继续参考家庭画像、食材线索和行为反馈。",
    );
  }, [signedIn, todayRecommendation.title]);
  const displayedRecommendation = aiRecommendation ?? todayRecommendation;
  const activeCraveRequest = craveSignals.find((item) => item.token && item.status !== "closed") ?? null;

  useEffect(() => {
    if (!activeCraveRequest?.token || todayMenu.length > 0) return undefined;
    const deadlineTime = getCraveDeadlineTime(activeCraveRequest);
    if (!Number.isFinite(deadlineTime)) return undefined;
    const remainingMs = deadlineTime - Date.now();
    if (remainingMs <= 0) {
      generateFromCraveRequest({ automatic: true });
      return undefined;
    }
    const timer = window.setTimeout(() => generateFromCraveRequest({ automatic: true }), remainingMs);
    return () => window.clearTimeout(timer);
  }, [activeCraveRequest?.token, activeCraveRequest?.deadlineAt, activeCraveRequest?.createdAt, todayMenu.length]);

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

  function requireHouseholdOwnerAction() {
    if (!isHumiApiSession(humiSession) || family?.role === "owner") return true;
    showNotice(family?.role === "member"
      ? "只有主厨能修改菜单和家庭设置；你仍可以点感觉、认领买菜或丢想吃。"
      : "正在确认你在这个家的身份，请稍后再试。",
    );
    return false;
  }

  function trackProductEvent(eventName, payload = {}) {
    trackValidationEvent(eventName, payload);
    void trackAppEvent({
      eventName,
      userId: session?.user?.id,
      familyId: family?.id,
      payload,
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

  function assignMealRecipe(dateKey, slotId, recipeId, quantity = 1, { silent = false } = {}) {
    if (!requireHouseholdOwnerAction()) return;
    const recipe = getRecipe(recipeId);
    const slotLabel = slotLabelsById[slotId] ?? "餐次";
    updateMealPlanSlot(dateKey, slotId, (entries) => upsertMealEntry(entries, recipeId, quantity));
    trackProductEvent(appEvents.weekPlanAdd, {
      recipeIds: [recipeId],
      dateKey,
      mealSlot: slotId,
      source: "manual_meal_slot",
    });
    if (!silent) showNotice(`${recipe?.name ?? "菜品"} 已添加到${formatDateLabel(dateKey)}${slotLabel}`);
  }

  function removeMealRecipe(dateKey, slotId, recipeId) {
    if (!requireHouseholdOwnerAction()) return;
    updateMealPlanSlot(dateKey, slotId, (entries) => removeMealEntry(entries, recipeId));
    if (dateKey === todayDateKey && slotId === "dinner") {
      const nextMenu = todayMenu.filter((item) => item.recipeId !== recipeId);
      syncHomeMealLogWithMenu(nextMenu);
    }
    showNotice("已从计划中移除");
  }

  function addToday(recipeId, quantity = 1) {
    if (!requireHouseholdOwnerAction()) return;
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

  function addWantToEatItem({ title, recipeId = "", note = "" }) {
    const trimmedTitle = String(title ?? "").trim();
    if (!trimmedTitle) {
      showNotice("先写一个想吃的");
      return;
    }
    const actor = getHouseholdActor({ humiSession, family, fallbackSession: displaySession });
    const now = new Date().toISOString();
    setWantToEatItems((current) => [
      {
        id: `want:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        title: trimmedTitle.slice(0, 40),
        recipeId,
        note: String(note ?? "").trim().slice(0, 80),
        memberId: actor.memberId,
        memberName: actor.memberName,
        status: "open",
        createdAt: now,
      },
      ...current,
    ].slice(0, 80));
    showNotice(`${trimmedTitle} 已放进想吃池子`);
  }

  function syncCraveVotesToWantPool(request) {
    const candidates = buildWantItemsFromCraveRequest(request);
    if (candidates.length === 0) return;
    setWantToEatItems((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      const existingOpenTitles = new Set(
        current
          .filter((item) => item.status !== "done")
          .map((item) => normalizeName(item.title)),
      );
      const additions = candidates.filter((item) => (
        !existingIds.has(item.id) && !existingOpenTitles.has(normalizeName(item.title))
      ));
      if (additions.length === 0) return current;
      return [...additions, ...current].slice(0, 80);
    });
  }

  function addWantRecipe(recipeId) {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;
    addWantToEatItem({ title: recipe.name, recipeId });
  }

  function addWantToToday(item) {
    if (!item) return;
    if (!requireHouseholdOwnerAction()) return;
    if (item.recipeId) {
      addToday(item.recipeId);
      completeWantToEatItem(item.id);
      return;
    }
    const matchedRecipe = recipes.find((recipe) => recipe.name === item.title)
      ?? recipes.find((recipe) => recipe.name.includes(item.title) || item.title.includes(recipe.name));
    if (matchedRecipe) {
      addToday(matchedRecipe.id);
      completeWantToEatItem(item.id);
      return;
    }
    showNotice("这条还没匹配到菜谱，先去菜谱库挑一道");
    navigateTo("library");
  }

  function completeWantToEatItem(itemId) {
    if (!canManageWantToEatItem(itemId)) return;
    const now = new Date().toISOString();
    setWantToEatItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, status: "done", completedAt: now } : item
    )));
  }

  function completeMatchedWantItems(matchedRecipes = []) {
    if (matchedRecipes.length === 0) return;
    const now = new Date().toISOString();
    setWantToEatItems((current) => current.map((item) => (
      item.status === "done" || !matchedRecipes.some((recipe) => recipeMatchesWantItem(recipe, item))
        ? item
        : { ...item, status: "done", completedAt: now }
    )));
  }

  function removeWantToEatItem(itemId) {
    if (!canManageWantToEatItem(itemId)) return;
    setWantToEatItems((current) => current.filter((item) => item.id !== itemId));
    showNotice("已从想吃池子移除");
  }

  function canManageWantToEatItem(itemId) {
    if (!isHumiApiSession(humiSession) || family?.role === "owner") return true;
    if (family?.role === "pending") {
      showNotice("正在确认你在这个家的身份，请稍后再试。");
      return false;
    }
    const item = wantToEatItems.find((candidate) => candidate.id === itemId);
    if (item?.memberId === humiSession.user?.id) return true;
    showNotice("家人只能维护自己放进想吃池子的内容。");
    return false;
  }

  function addRecommendedToday(selectedRecipeIds = null) {
    if (!requireHouseholdOwnerAction()) return;
    const selectedIds = Array.isArray(selectedRecipeIds) ? new Set(selectedRecipeIds) : null;
    const recommendedItems = getRecommendationItems(displayedRecommendation)
      .filter((item) => !selectedIds || selectedIds.has(item.recipe.id))
      .filter((item) => !todayMenu.some((menuItem) => menuItem.recipeId === item.recipe.id));

    if (recommendedItems.length === 0) {
      showNotice(selectedIds ? "选中的菜已经在今晚菜单里" : "这组菜已经在今晚菜单里");
      return;
    }

    recommendedItems.forEach((item) => addToday(item.recipe.id, item.quantity));
    completeMatchedWantItems(recommendedItems.map((item) => item.recipe));
    trackProductEvent(appEvents.recommendationAccepted, {
      recipeIds: recommendedItems.map((item) => item.recipe.id),
      quantities: recommendedItems.map((item) => ({
        recipeId: item.recipe.id,
        quantity: item.quantity,
      })),
      source: displayedRecommendation.source ?? "rule",
      missingCount: displayedRecommendation.missingItems.length,
      familySize: displayedRecommendation.familySize ?? familyProfile.familySize,
    });
    showNotice(`已加入 ${recommendedItems.length} 道推荐菜`, {
      illustration: "menu-accepted",
    });
  }

  async function startCraveRequest(feelingTag, recipientIds = []) {
    if (!isHumiApiSession(humiSession)) {
      showNotice("登录主厨账号后，就能把征集卡片分享给家人。");
      navigateTo("user");
      return null;
    }
    if (family?.role && family.role !== "owner") {
      showNotice("这个家的征集需要主厨发起；家人可以直接点感觉或丢想吃。");
      return null;
    }
    const safeFeeling = feelingTag || "随便都行";
    let createdShareRequest = false;
    let createdRequest = null;
    try {
      const data = await createCraveRequest({
        householdName: family?.name || familyName || "我家",
        initiatorName: displaySession?.user?.displayName || "主厨",
        mealType: "dinner",
        initialFeelingTag: safeFeeling,
        recipientIds,
      }, humiSession);
      const request = data.request;
      if (request?.token) {
        createdShareRequest = true;
        createdRequest = request;
        postCraveShareToMiniProgram({
          token: request.token,
          householdName: request.householdName,
          initiatorName: request.initiatorName,
          title: `${request.householdName || "我家"}今晚征集口味，点一下就行`,
        });
        setCraveSignals((current) => [
          {
            id: request.id || `crave:${Date.now()}`,
            token: request.token,
            ownerSecret: data.ownerSecret,
            householdName: request.householdName,
            initiatorName: request.initiatorName,
            recipientCount: request.recipientCount,
            mealType: request.mealType || "dinner",
            feelingTag: request.initialFeelingTag || safeFeeling,
            status: request.status,
            votes: request.votes ?? [],
            deadlineAt: request.deadlineAt,
            createdAt: request.createdAt || new Date().toISOString(),
            recipeIds: displayedRecommendation.recipes.map((recipe) => recipe.id),
          },
          ...current.filter((item) => item.token !== request.token),
        ].slice(0, 24));
        showNotice("邀请卡片已准备好，请点右上角分享");
      }
    } catch (error) {
      showNotice(error.message || "协作链接暂时没生成成功");
    }
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const alternateRuleRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      mealLogs,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      familyProfile,
      wantToEatItems,
      craveVotes: [
        ...(safeFeeling === "随便都行" ? [] : [{ feelingTag: safeFeeling }]),
        ...learnedCraveVotes,
      ],
      excludedRecipeIds: safeFeeling === "随便都行" ? [] : currentRecipeIds,
    });
    const nextRecommendation = {
      ...alternateRuleRecommendation,
      source: "rule",
      reason: safeFeeling === "随便都行"
        ? `${alternateRuleRecommendation.reason} 家人说随便都行，先按忌口和家里习惯来。`
        : `${alternateRuleRecommendation.reason} 这次会优先照顾“${safeFeeling}”这个感觉。`,
    };
    if (!createdShareRequest) {
      setCraveSignals((current) => [
        {
          id: `crave:${Date.now()}`,
          feelingTag: safeFeeling,
          createdAt: new Date().toISOString(),
          recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
        },
        ...current,
      ].slice(0, 24));
    }
    setAiRecommendation(nextRecommendation);
    setAiRecommendationStatus(
      safeFeeling === "随便都行"
        ? "收到“随便都行”。已按家庭忌口和省心程度重新给一组。"
        : `收到“${safeFeeling}”。已先用本地规则揉合出一组。`,
    );
    trackProductEvent(appEvents.recommendationRequest, {
      source: "crave_signal",
      feelingTag: safeFeeling,
      recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
    });
    showNotice(safeFeeling === "随便都行" ? "那就 Humi 来做主" : `已按“${safeFeeling}”换一组`);
    return createdRequest;
  }

  function decideAloneFromCrave(feelingTag) {
    if (!requireHouseholdOwnerAction()) return;
    const safeFeeling = feelingTag || "随便都行";
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const nextRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      mealLogs,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      familyProfile,
      wantToEatItems,
      craveVotes: [
        ...(safeFeeling === "随便都行" ? [] : [{ feelingTag: safeFeeling }]),
        ...learnedCraveVotes,
      ],
      excludedRecipeIds: safeFeeling === "随便都行" ? [] : currentRecipeIds,
    });
    setAiRecommendation({
      ...nextRecommendation,
      source: "rule",
      reason: safeFeeling === "随便都行"
        ? `${nextRecommendation.reason} 这次先跳过征集，由 Humi 直接做主。`
        : `${nextRecommendation.reason} 这次先按“${safeFeeling}”这个感觉直接安排。`,
    });
    setAiRecommendationStatus("已跳过征集，先按你家的忌口、食材线索和饭线索出一组。");
    trackProductEvent(appEvents.recommendationRequest, {
      source: "crave_decide_alone",
      feelingTag: safeFeeling,
      recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
    });
    showNotice("已直接出一组今晚菜单");
    if (activeView !== "dashboard") navigateTo("dashboard");
  }

  async function refreshCraveRequest() {
    if (!activeCraveRequest?.token) return;
    try {
      const data = await loadCraveRequest(activeCraveRequest.token);
      const request = data.request;
      syncCraveVotesToWantPool(request);
      setCraveSignals((current) => current.map((item) => (
        item.token === request.token
          ? { ...item, ...request, ownerSecret: item.ownerSecret, feelingTag: item.feelingTag }
          : item
      )));
      showNotice(`已刷新，收到 ${(request.votes ?? []).length} 个回复`);
    } catch (error) {
      showNotice(error.message || "刷新失败");
    }
  }

  function copyCraveLink() {
    if (!requireHouseholdOwnerAction()) return;
    if (!activeCraveRequest?.token) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("crave", activeCraveRequest.token);
    navigator.clipboard?.writeText(url.toString());
    const openedMiniProgramShare = postCraveShareToMiniProgram({
      token: activeCraveRequest.token,
      householdName: activeCraveRequest.householdName || family?.name || familyName || "我家",
      initiatorName: activeCraveRequest.initiatorName || displaySession?.user?.displayName || "主厨",
      title: `${activeCraveRequest.householdName || family?.name || familyName || "我家"}今晚征集口味，点一下就行`,
    });
    showNotice(openedMiniProgramShare ? "已打开小程序分享卡片" : "邀请链接已复制，小程序分享卡片也已准备好");
  }

  function generateFromCraveRequest(options = {}) {
    if (!activeCraveRequest) return;
    if (!requireHouseholdOwnerAction()) return;
    const automatic = Boolean(options.automatic);
    const votes = activeCraveRequest.votes ?? [];
    syncCraveVotesToWantPool(activeCraveRequest);
    const voteFeeling = votes.find((vote) => vote.feelingTag && vote.feelingTag !== "随便都行")?.feelingTag
      ?? activeCraveRequest.feelingTag
      ?? activeCraveRequest.initialFeelingTag
      ?? "随便都行";
    const initiatorVote = voteFeeling === "随便都行"
      ? []
      : [{
          memberName: activeCraveRequest.initiatorName || "主厨",
          feelingTag: voteFeeling,
          initiator: true,
        }];
    const effectiveCraveVotes = [
      ...initiatorVote,
      ...votes,
      ...collectLearnedCraveVotes(craveSignals, { excludeToken: activeCraveRequest.token }),
    ];
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const nextRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      mealLogs,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      familyProfile,
      wantToEatItems,
      craveVotes: effectiveCraveVotes,
      excludedRecipeIds: voteFeeling === "随便都行" ? [] : currentRecipeIds,
    });
    const nextCraveRecommendation = {
      ...nextRecommendation,
      source: "crave",
      craveVotes: effectiveCraveVotes,
      reason: votes.length > 0
        ? `${nextRecommendation.reason} 已揉合 ${votes.length} 个家人回复。`
        : `${nextRecommendation.reason} 还没人回复，先让 Humi 做主。`,
    };
    setAiRecommendation(nextCraveRecommendation);
    const generatedAt = new Date().toISOString();
    setCraveSignals((current) => current.map((item) => (
      item.token === activeCraveRequest.token
        ? { ...item, status: "closed", generatedAt, resultSummary: buildCraveResultSummary(nextCraveRecommendation, generatedAt) }
        : item
    )));
    if (activeCraveRequest.token && (activeCraveRequest.ownerSecret || isHumiApiSession(humiSession))) {
      closeCraveRequest(activeCraveRequest.token, activeCraveRequest.ownerSecret, {
        resultSummary: buildCraveResultSummary(nextCraveRecommendation, generatedAt),
      }, humiSession).catch(() => {});
    }
    setAiRecommendationStatus(
      votes.length > 0
        ? "已按家人感觉揉合出一组。"
        : automatic
          ? "征集已到 30 分钟，没人回复也先按家庭画像出一组。"
          : "还没人回复，已先按家庭画像出一组。",
    );
    showNotice(automatic ? "征集到点，已自动出菜单" : "已按这次征集出菜单");
    if (activeView !== "dashboard") {
      navigateTo("dashboard");
    }
  }
  function pickForMeal(slotId) {
    const slotLabel = slotLabelsById[slotId] ?? "这一餐";
    setLibraryMealSlot(slotId);
    setLibraryParentLabel("今晚");
    setQuery("");
    setCategory("全部");
    navigateTo("library");
    showNotice(`选择${slotLabel}吃什么`);
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

  function currentMealActorFields() {
    const actor = getHouseholdActor({ humiSession, family, fallbackSession: displaySession });
    return {
      actorMemberId: actor.memberId,
      actorName: actor.memberName,
    };
  }

  function recordMealSlot(slotId, patch) {
    const updatedAt = new Date().toISOString();
    setMealLogs((current) => {
      const currentLog = current[todayDateKey] ?? {};
      return {
        ...current,
        [todayDateKey]: {
          ...currentLog,
          meals: {
            ...(currentLog.meals ?? {}),
            [slotId]: {
              ...(currentLog.meals?.[slotId] ?? {}),
              ...patch,
              updatedAt,
            },
          },
          updatedAt,
        },
      };
    });
  }

  function recordBreakfast() {
    if (!requireHouseholdOwnerAction()) return;
    pickForMeal("breakfast");
  }

  function setLunchSource(source) {
    if (!requireHouseholdOwnerAction()) return;
    const now = new Date().toISOString();
    if (source === "home") {
      pickForMeal("lunch");
      return;
    }
    updateMealPlanSlot(todayDateKey, "lunch", () => []);
    recordMealSlot("lunch", {
      source,
      consumedEntries: [],
      quickRecordedAt: now,
    });
    trackValidationEvent(validationEvents.mealSourceSelected, {
      mealSlot: "lunch",
      source,
      recipeIds: [],
      dateKey: todayDateKey,
    });
    const labels = {
      delivery: "午餐已记为外卖",
      outside: "午餐已记为外面吃",
      skip: "午餐今天先不记录",
    };
    showNotice(labels[source] ?? "午餐来源已记录");
  }

  function setDinnerSource(source) {
    if (!requireHouseholdOwnerAction()) return;
    if (source === "home") {
      const consumedEntries = todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity }));
      updateTodayMealLog({
        source,
        confirmation: todayMenu.length > 0 ? "all" : undefined,
        consumedEntries,
        ...currentMealActorFields(),
      });
      consumePantryForEntries(consumedEntries);
    } else {
      updateTodayMealLog({ source, confirmation: undefined, consumedEntries: [], ...currentMealActorFields() });
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

  function setDinnerConfirmation(confirmation) {
    if (!requireHouseholdOwnerAction()) return;
    const consumedEntries = confirmation === "all"
      ? todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity }))
      : todayMealLog.consumedEntries ?? [];
    updateTodayMealLog({
      confirmation,
      consumedEntries,
      ...currentMealActorFields(),
    });
    if (confirmation === "all" || confirmation === "partial") {
      consumePantryForEntries(consumedEntries);
    }
    const labels = {
      all: "已确认今晚吃了",
      partial: "已记录吃了一部分",
      missed: "已记录今晚没做",
    };
    trackValidationEvent(validationEvents.mealConfirmed, {
      confirmation,
      consumedCount: confirmation === "all" ? todayMenu.length : todayMealLog.consumedEntries?.length ?? 0,
      dateKey: todayDateKey,
    });
    showNotice(labels[confirmation] ?? "晚餐确认已记录");
  }

  function quickConfirmDinner(result) {
    if (!requireHouseholdOwnerAction()) return;
    const now = new Date().toISOString();
    if (result === "done") {
      const consumedEntries = todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity }));
      updateTodayMealLog({
        source: "home",
        confirmation: "all",
        consumedEntries,
        quickConfirmedAt: now,
        ...currentMealActorFields(),
      });
      consumePantryForEntries(consumedEntries);
      trackValidationEvent(validationEvents.mealConfirmed, {
        confirmation: "all",
        consumedCount: todayMenu.length,
        dateKey: todayDateKey,
        quick: true,
      });
      showNotice("今晚已确认做了");
      return;
    }
    if (result === "changed") {
      updateTodayMealLog({
        source: "home",
        confirmation: "changed",
        consumedEntries: [],
        plannedEntries: todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity })),
        quickConfirmedAt: now,
        ...currentMealActorFields(),
      });
      trackValidationEvent(validationEvents.mealConfirmed, {
        confirmation: "changed",
        consumedCount: 0,
        dateKey: todayDateKey,
        quick: true,
      });
      showNotice("已记录今晚换了别的");
      return;
    }
    if (result === "outside") {
      updateTodayMealLog({
        source: "outside",
        confirmation: "outside",
        consumedEntries: [],
        plannedEntries: todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity })),
        quickConfirmedAt: now,
        ...currentMealActorFields(),
      });
      trackValidationEvent(validationEvents.mealConfirmed, {
        confirmation: "outside",
        consumedCount: 0,
        dateKey: todayDateKey,
        quick: true,
      });
      showNotice("已记录今晚出去吃了");
      return;
    }
    if (result === "skip") {
      updateTodayMealLog({
        source: "skip",
        confirmation: "skip",
        consumedEntries: [],
        plannedEntries: todayMenu.map((item) => ({ recipeId: item.recipeId, quantity: item.quantity })),
        quickConfirmedAt: now,
        ...currentMealActorFields(),
      });
      trackValidationEvent(validationEvents.mealConfirmed, {
        confirmation: "skip",
        consumedCount: 0,
        dateKey: todayDateKey,
        quick: true,
      });
      showNotice("今晚先不记录");
    }
  }

  function toggleConsumedRecipe(recipeId) {
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
    updateTodayMealLog({
      consumedEntries: nextEntries,
      confirmation: nextEntries.length === todayMenu.length ? "all" : nextEntries.length > 0 ? "partial" : "missed",
    });
    consumePantryForEntries(nextEntries);
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
    if (!requireHouseholdOwnerAction()) return;
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
          wantToEatItems,
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
      trackProductEvent(appEvents.weekPlanAdd, {
        recipeIds: addedRecipeIds,
        addedCount,
        source: "weekly_profile_generation",
        planningMode: familyProfile.planningMode,
      });
    }
    showNotice(addedCount > 0 ? `已安排 ${addedCount} 道菜到连排计划` : "这几天已经排好了");
  }

  function completeRecommendedGrocery() {
    const missingCount = displayedRecommendation.missingItems.length;
    addRecommendedToday();
    setActiveView("grocery");
    showNotice(missingCount > 0 ? `还差的 ${missingCount} 样已经放进清单` : "这组晚饭已安排，清单也更新了");
  }

  async function requestAiExplanation() {
    if (!session?.user) {
      setAiExplanation(displayedRecommendation.reason);
      setAiExplanationStatus(
        signedIn ? "这组先按当前菜单说明，Humi 会继续参考家里的晚饭反馈。" : "这组先按当前菜单说明，Humi 会慢慢记住家里的习惯。",
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
      setAiExplanationStatus(`${formatAiError(error)} 先用当前搭配理由。`);
    } finally {
      setAiExplanationLoading(false);
    }
  }

  async function requestAiRecommendation(feedbackReason = null, mode = "basic") {
    setRecommendationFeedbackOpen(false);
    const preciseMode = mode === "precise";
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const alternateRuleRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      mealLogs,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      familyProfile,
      wantToEatItems,
      craveVotes: learnedCraveVotes,
      excludedRecipeIds: currentRecipeIds,
    });
    trackProductEvent(appEvents.recommendationRequest, {
      hasFeedback: Boolean(feedbackReason),
      currentRecipeIds,
      mode: preciseMode ? "precise" : "basic",
    });
    trackValidationEvent(validationEvents.recommendationRefreshed, {
      hasFeedback: Boolean(feedbackReason),
      currentRecipeIds,
      reasonId: feedbackReason?.id,
      mode: preciseMode ? "precise" : "basic",
    });
    if (feedbackReason) {
      recordRecommendationFeedback(feedbackReason);
    }

    if (!preciseMode) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus("基础推荐已换一组；这条不消耗精准 API。");
      trackProductEvent(appEvents.recommendationShown, {
        source: "rule",
        reason: "basic",
        recipeIds: alternateRuleRecommendation.recipes.map((recipe) => recipe.id),
      });
      showNotice("已经换成另一组");
      return;
    }

    if (!signedIn) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus("精准推荐需要先登录主厨账号；基础推荐仍可无限使用。");
      showNotice("先登录后再体验精准推荐");
      return;
    }

    const preciseContext = buildAiRecommendationContext({
      fallbackRecommendation: alternateRuleRecommendation,
      currentRecipeIds,
      feedbackReason,
      mode: "precise",
    });
    const preciseCacheKey = buildPreciseRecommendationCacheKey(preciseContext);
    const cachedResult = readPreciseRecommendationCache(preciseRecommendationCache, preciseCacheKey);
    if (cachedResult) {
      const nextRecommendation = hydrateAiRecommendation({
        result: cachedResult,
        fallback: alternateRuleRecommendation,
      });
      setAiRecommendation({ ...nextRecommendation, source: "deepseek_cache" });
      setAiExplanation(cachedResult.reason ?? nextRecommendation.reason);
      setAiRecommendationStatus("已复用相同条件下的精准推荐，不消耗新的 API 尝鲜额度。");
      setAiExplanationStatus("这组搭配理由来自上次相同条件的精准推荐。");
      trackProductEvent(appEvents.recommendationShown, {
        source: "deepseek_cache",
        mode: "precise_cache",
        recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
        missingCount: nextRecommendation.missingItems.length,
      });
      showNotice("已复用精准推荐缓存");
      return;
    }

    if (!canUsePreciseRecommendation(recommendationAccess)) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus("精准尝鲜已用完；基础推荐仍可无限使用。");
      showNotice("精准推荐已到升级节点");
      return;
    }

    setAiRecommendationLoading(true);
    setAiRecommendationStatus("正在用精准推荐重新揉合家庭画像、食材线索和晚饭反馈...");
    try {
      const result = await recommendMeals(preciseContext);
      const nextRecommendation = hydrateAiRecommendation({
        result,
        fallback: alternateRuleRecommendation,
      });
      setAiRecommendation(nextRecommendation);
      setAiExplanation(result.reason ?? nextRecommendation.reason);
      setAiRecommendationStatus("精准推荐已给你重新想好一组。");
      setAiExplanationStatus("已经把这组晚饭的搭配理由放在下面。");
      setRecommendationAccess((current) => (
        result.recommendationAccess
          ? normalizeRecommendationAccess(result.recommendationAccess)
          : consumePreciseRecommendation(current)
      ));
      setPreciseRecommendationCache((current) => writePreciseRecommendationCache(current, preciseCacheKey, result));
      trackProductEvent(appEvents.recommendationShown, {
        source: nextRecommendation.source ?? "deepseek",
        mode: "precise",
        recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
        missingCount: nextRecommendation.missingItems.length,
      });
      showNotice("晚饭推荐已更新");
    } catch (error) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus(`${formatAiError(error)} 已先换成基础推荐。`);
      trackProductEvent(appEvents.recommendationShown, {
        source: "rule",
        reason: "fallback",
        mode: "precise_fallback",
        error: error.message,
        recipeIds: alternateRuleRecommendation.recipes.map((recipe) => recipe.id),
      });
      showNotice("精准推荐暂不可用，已用基础推荐");
    } finally {
      setAiRecommendationLoading(false);
    }
  }

  function recordRecommendationFeedback(reason) {
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    trackProductEvent(appEvents.recommendationFeedback, {
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
    if (!requireHouseholdOwnerAction()) return;
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
          ? "今晚菜单已清空。可以重新安排一组，推荐会继续参考家庭画像、食材线索和晚饭反馈。"
          : "今晚菜单已清空。可以重新安排一组，Humi 会慢慢记住家里的习惯。",
      );
    }
  }

  function removeFromTodayEverywhere(recipeId) {
    if (!requireHouseholdOwnerAction()) return;
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
          ? "今晚菜单已清空。可以重新安排一组，推荐会继续参考家庭画像、食材线索和晚饭反馈。"
          : "今晚菜单已清空。可以重新安排一组，Humi 会慢慢记住家里的习惯。",
      );
    }
  }

  function assignPlan(day, recipeId) {
    if (!requireHouseholdOwnerAction()) return;
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
    trackProductEvent(appEvents.weekPlanAdd, {
      recipeIds: [recipeId],
      day,
      source: "manual",
    });
    showNotice(`已添加到${day}`);
  }

  function removePlanRecipe(day, recipeId) {
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
    if (!requireHouseholdOwnerAction()) return;
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
    if (!requireHouseholdOwnerAction()) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setCustomItems((current) => [
      ...current,
      { key: `custom:${Date.now()}`, name: trimmed, amount: "自定义", source: "手动添加" },
    ]);
    setNewCustomItem("");
  }

  function removeCustomItem(key) {
    if (!requireHouseholdOwnerAction()) return;
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
    showNotice(`已记住家里有 ${item.name}`);
    return true;
  }

  function removePantryItem(key) {
    setPantryItems((current) => current.filter((item) => item.key !== key));
  }

  function consumePantryForEntries(entries = []) {
    const ingredientNames = new Set(
      entries
        .map((entry) => getRecipe(entry.recipeId))
        .filter(Boolean)
        .flatMap((recipe) => recipe.ingredients ?? [])
        .map((ingredient) => normalizeName(ingredient.name))
        .filter(Boolean),
    );
    if (ingredientNames.size === 0) return;
    setPantryItems((current) => current.filter((item) => !ingredientNames.has(normalizeName(item.name))));
  }

  function excludeGroceryItem(itemOrKey) {
    if (!requireHouseholdOwnerAction()) return;
    const key = typeof itemOrKey === "string" ? itemOrKey : itemOrKey?.hiddenKey;
    if (!key) return;
    setExcludedGroceryKeys((current) => (current.includes(key) ? current : [...current, key]));
    if (typeof itemOrKey === "object" && itemOrKey?.name) {
      addGroceryItemToPantry(itemOrKey, "这次不用买");
    }
  }

  function restoreGroceryItem(item) {
    if (!requireHouseholdOwnerAction()) return;
    setExcludedGroceryKeys((current) => current.filter((itemKey) => itemKey !== item.hiddenKey));
    setPantryItems((current) => current.filter((pantryItem) => normalizeName(pantryItem.name) !== normalizeName(item.name)));
  }

  function restoreAllGroceryItems() {
    if (!requireHouseholdOwnerAction()) return;
    const hiddenNames = new Set(excludedGroceryItems.map((item) => normalizeName(item.name)));
    setExcludedGroceryKeys([]);
    setPantryItems((current) => current.filter((item) => !hiddenNames.has(normalizeName(item.name))));
  }

  function toggleGroceryClaim(item) {
    if (!item?.key) return;
    if (!isHumiApiSession(humiSession)) {
      showNotice("登录后家人才能一起认领清单");
      navigateTo("user");
      return;
    }
    const actor = getGroceryClaimActor({ humiSession, family });
    if (!actor?.memberId) {
      showNotice("正在读取家庭成员身份，请稍后再试");
      return;
    }
    const currentClaim = groceryClaims[item.key];
    const now = new Date().toISOString();
    if (!currentClaim) {
      setGroceryClaims((current) => ({
        ...current,
        [item.key]: {
          itemKey: item.key,
          itemName: item.name,
          memberId: actor.memberId,
          memberName: actor.memberName,
          status: "claimed",
          claimedAt: now,
        },
      }));
      showNotice(`${actor.memberName}认领了 ${item.name}`);
      return;
    }
    if (currentClaim.memberId !== actor.memberId) {
      showNotice(`${currentClaim.memberName || "家人"}已经在买 ${item.name}`);
      return;
    }
    if (currentClaim.status !== "done") {
      setGroceryClaims((current) => ({
        ...current,
        [item.key]: {
          ...currentClaim,
          status: "done",
          completedAt: now,
        },
      }));
      setCheckedItems((current) => ({ ...current, [item.key]: true }));
      addGroceryItemToPantry(item, "家人买回");
      showNotice(`${item.name} 已标记买到`);
      return;
    }
    setGroceryClaims((current) => {
      const next = { ...current };
      delete next[item.key];
      return next;
    });
    showNotice(`已取消 ${item.name} 的认领`);
  }

  async function shareGroceryList() {
    const text = formatShareText(visibleGroceryGroups, customItems);
    if (!isHumiApiSession(humiSession)) {
      showNotice("登录主厨账号后，就能分享可认领的买菜卡片。");
      navigateTo("user");
      return;
    }
    if (family?.role && family.role !== "owner") {
      showNotice("这个家的买菜卡片需要主厨分享；家人可以认领和标记买到。");
      return;
    }
    try {
      const data = await createGroceryShare(humiSession, {
          householdName: family?.name || familyName || "我家",
          initiatorName: displaySession?.user?.displayName || humiSession.user?.displayName || "主厨",
          items: [
            ...visibleGroceryItems.map((item) => ({
              key: item.key,
              name: item.name,
              amount: formatRawAmount(item) || "适量",
              type: item.type,
              source: item.source || "",
            })),
            ...customItems.map((item) => ({
              key: item.key,
              name: item.name,
              amount: item.amount || "按需",
              type: "custom",
              source: "顺手买",
            })),
          ],
      });
      if (data.share?.token && postGroceryShareToMiniProgram(data.share)) {
        showNotice("已打开买菜分享卡片");
        return;
      }
    } catch (error) {
      showNotice(error.message || "买菜卡片暂时没生成成功，先给你海报");
    }
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

  async function shareTodayMenu() {
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
      "Humi 连排几天",
      "",
      ...Object.entries(weekPlan).map(([day, recipeIds]) => {
        const names = recipeIds.map((recipeId) => getRecipe(recipeId)?.name).filter(Boolean);
        return `${day}：${names.length > 0 ? names.join("、") : "先空着"}`;
      }),
    ].join("\n");
    await openPosterPreview({
      type: "week_plan",
      title: "Humi 连排几天",
      filename: "humi-week-menu.png",
      text,
      createBlob: () => createWeekMenuPoster({ weekPlan, getRecipe }),
      fallbackSuccess: "连排计划已复制",
      refreshLabel: "重新生成海报",
    });
  }

  async function shareText({ type, title, text, success }) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        trackProductEvent(appEvents.share, { type, method: "native" });
        showNotice("清单已打开分享面板");
        return;
      }
      await navigator.clipboard.writeText(text);
      trackProductEvent(appEvents.share, { type, method: "clipboard" });
      showNotice(success);
    } catch {
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
      trackProductEvent(appEvents.share, { type, method: "poster_preview" });
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
      return current ? { ...current, blob: null, url: "" } : null;
    });
    try {
      const blob = await posterPreview.createBlob();
      const url = URL.createObjectURL(blob);
      setPosterPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return current ? { ...current, blob, url } : null;
      });
      showNotice("换好一版海报了");
    } catch {
      showNotice("海报生成失败，可稍后重试");
    } finally {
      setPosterLoading(false);
    }
  }

  function savePosterPreview() {
    if (!posterPreview) return;
    downloadPoster(posterPreview.blob, posterPreview.filename);
    trackProductEvent(appEvents.share, { type: posterPreview.type, method: "poster_save" });
    trackValidationEvent(validationEvents.posterSavedAttempted, { type: posterPreview.type });
    showNotice("海报已保存到下载");
  }

  async function sharePosterPreview() {
    if (!posterPreview) return;
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
      trackProductEvent(appEvents.share, {
        type: posterPreview.type,
        method: method === "shared" ? "poster_native" : "poster_download",
      });
      showNotice(method === "shared" ? "海报已打开分享面板" : "海报已保存到下载");
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
    if (!session?.user) {
      setAuthStatus("请先通过邮箱登录，再创建家庭空间。");
      return;
    }
    setCloudLoading(true);
    setAuthStatus("正在创建家庭空间...");
    try {
      const nextFamily = await createFamilySpace({ user: session.user, name: familyName });
      setFamily(nextFamily);
      setCloudMenuEnabled(false);
      setCloudGroceryEnabled(false);
      setAuthStatus("家庭空间已创建。");
      void trackAppEvent({
        eventName: appEvents.familyCreated,
        userId: session.user.id,
        familyId: nextFamily.id,
        payload: { familyName: nextFamily.name },
      });
      showNotice(`${nextFamily.name} 已创建`);
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setCloudLoading(false);
    }
  }

  async function handlePasswordAuth(mode) {
    const email = authEmail.trim();
    if (!email || !authPassword) {
      setAuthStatus("请输入邮箱和密码。");
      return;
    }

    setCloudLoading(true);
    setAuthStatus(mode === "signup" ? "正在创建账号..." : "正在登录...");
    try {
      let currentFamily = null;
      const nextSession =
        mode === "signup"
          ? await signUpWithPassword({ email, password: authPassword })
          : await signInWithPassword({ email, password: authPassword });
      setSession(nextSession);
      if (nextSession?.user) {
        currentFamily = await loadPrimaryFamily(nextSession.user);
        setFamily(currentFamily);
      }
      setAuthStatus(
        mode === "signup"
          ? "账号已创建。如果项目要求邮箱确认，请先去邮箱点确认链接。"
          : "已登录 Humi。",
      );
      setAiExplanationStatus("已登录。Humi 会继续根据你的家庭画像和晚饭反馈调整说明。");
      setAiRecommendationStatus("已登录。推荐会继续参考家庭画像、食材线索和晚饭反馈。");
      setOnboardingComplete(true);
      void trackAppEvent({
        eventName: appEvents.auth,
        userId: nextSession?.user?.id,
        familyId: currentFamily?.id,
        payload: { mode, success: true },
      });
      showNotice(mode === "signup" ? "账号已创建" : "已登录 Humi");
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setCloudLoading(false);
    }
  }

  async function handleSignOut() {
    setCloudLoading(true);
    try {
      if (isHumiApiSession(humiSession)) {
        await logoutHumiSession(humiSession);
      }
      if (session?.user) {
        await signOut();
      }
      setSession(null);
      clearHumiSession();
      setHumiSession(null);
      humiStateLoadedRef.current = false;
      humiStateHydratingRef.current = false;
      setFamily(null);
      setHumiHouseholds([]);
      setCloudMenuEnabled(false);
      setCloudGroceryEnabled(false);
      setFamilyMembers([]);
      setPreferenceDraft({});
      setInviteEmail("");
      setOnboardingComplete(false);
      setProfileOnboardingComplete(false);
      viewHistoryRef.current = ["dashboard"];
      setActiveView("dashboard");
      setAuthStatus("已退出登录，可以重新验证微信登录。");
      showNotice("已退出登录");
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setCloudLoading(false);
    }
  }

  async function loadPreferencesForFamily({ active = () => true } = {}) {
    if (!session?.user || !family?.id) return;

    setPreferencesLoading(true);
    setPreferencesStatus("正在读取家庭成员忌口...");
    try {
      const members = await loadFamilyPreferences(family.id);
      if (!active()) return;
      setFamilyMembers(members);
      setPreferenceDraft(
        members.reduce(
          (drafts, member) => ({
            ...drafts,
            [member.id]: preferenceToDraft(member.preference),
          }),
          {},
        ),
      );
      setPreferencesStatus("家庭成员忌口已读取。");
    } catch (error) {
      if (active()) setPreferencesStatus(error.message);
    } finally {
      if (active()) setPreferencesLoading(false);
    }
  }

  function updatePreferenceDraft(memberId, key, value) {
    setPreferenceDraft((current) => ({
      ...current,
      [memberId]: {
        ...current[memberId],
        [key]: value,
      },
    }));
  }

  async function savePreference(memberId) {
    if (!session?.user || !family?.id) {
      setPreferencesStatus("请先登录并创建家庭空间。");
      return;
    }

    setPreferencesLoading(true);
    setPreferencesStatus("正在保存家庭成员忌口...");
    try {
      await saveMemberPreference({
        familyId: family.id,
        memberId,
        preference: draftToPreference(preferenceDraft[memberId] ?? {}),
      });
      setPreferencesStatus("家庭成员忌口已保存。");
      trackProductEvent(appEvents.profileSaved, { type: "member_preference" });
      showNotice("成员忌口已保存");
      await loadPreferencesForFamily();
    } catch (error) {
      setPreferencesStatus(error.message);
    } finally {
      setPreferencesLoading(false);
    }
  }

  async function inviteMember() {
    if (!session?.user || !family?.id) {
      setPreferencesStatus("请先登录并创建家庭空间。");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setPreferencesStatus("请输入要邀请的邮箱。");
      return;
    }
    if (familyMembers.some((member) => member.email?.toLowerCase() === email)) {
      setPreferencesStatus("这个邮箱已经在家庭成员列表中。");
      return;
    }

    setPreferencesLoading(true);
    setPreferencesStatus("正在添加家庭成员邀请...");
    try {
      await inviteFamilyMember({ familyId: family.id, email });
      setInviteEmail("");
      setPreferencesStatus("家庭成员邀请已添加。");
      showNotice("成员邀请已添加");
      await loadPreferencesForFamily();
    } catch (error) {
      setPreferencesStatus(error.message);
    } finally {
      setPreferencesLoading(false);
    }
  }

  function buildAiRecommendationContext({
    fallbackRecommendation,
    currentRecipeIds = [],
    feedbackReason = null,
    mode = "basic",
  }) {
    const recentRecipeIds = [
      ...new Set([
        ...Object.values(weekPlan).flat(),
        ...getRecentMealLogRecipeIds(mealLogs),
        ...todayMenu.map((item) => item.recipeId),
      ]),
    ].slice(-12);

    return {
      mode,
      candidates: recipes
        .filter((recipe) => !currentRecipeIds.includes(recipe.id))
        .filter((recipe) => !recipeViolatesHardAvoid(recipe, { familyMembers, familyProfile }))
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
        preference: {
          dislikes: member.preference?.dislikes ?? [],
          allergies: member.preference?.allergies ?? [],
        },
      })),
      familyProfile,
      planningMode: getPlanningMode(familyProfile.planningMode),
      compactFamilyPrompt: buildCompactFamilyPrompt(familyProfile),
      recentRecipeIds,
      currentMissingItems: fallbackRecommendation.missingItems.map((item) => item.name),
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
        "优先使用快到期或家里现有的主食材。",
        "避开近期已经安排过的菜。",
        "晚饭组合必须按家庭人数落地：1人建议1-2道，2人建议2道，3-4人建议2-3道，5人以上建议3-4道。",
        "如果菜品数量少于家庭人数需要，可用份量补足，但推荐理由要说明份量安排。",
        "主食材缺口尽量不超过 3 项；调料和常备项不要当作主要缺口。",
        "组合尽量包含一道蛋白来源和一道蔬菜/汤/清爽类菜。",
        "如果家庭偏好、忌口、过敏与候选冲突，必须优先避开。",
        `当前使用场景是${getPlanningMode(familyProfile.planningMode).label}，需要按该场景调整推荐理由和搭配重点。`,
        "本轮候选已排除用户刚看到的菜，不能重复上一组。",
      ],
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
      .filter(Boolean);

    if (selectedRecipes.length === 0) return fallback;
    const filledRecipes = [...selectedRecipes];
    for (const fallbackItem of getRecommendationItems(fallback)) {
      if (filledRecipes.length >= (fallback.targetDishCount ?? fallback.recipes.length)) break;
      if (!filledRecipes.some((recipe) => recipe.id === fallbackItem.recipe.id)) {
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
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authStatus,
    setAuthStatus,
    session,
    family,
    familyName,
    setFamilyName,
    cloudLoading,
    onPasswordAuth: handlePasswordAuth,
    onCreateFamily: createFamily,
    onSignOut: handleSignOut,
    showNotice,
  };

  function applyHumiStateEnvelope(data, {
    loadedMenuStatus = "已读取当前家的菜单。",
    loadedGroceryStatus = "已读取当前家的食材清单。",
    emptyMenuStatus = "当前家还没有保存菜单，之后会自动保存。",
    emptyGroceryStatus = "当前家还没有保存食材清单，之后会自动保存。",
  } = {}) {
    const state = data?.state;
    if (data?.family) setFamily(data.family);
    if (Array.isArray(data?.households)) setHumiHouseholds(data.households);
    if (!state) {
      setCloudSyncStatus(emptyMenuStatus);
      setCloudGroceryStatus(emptyGroceryStatus);
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
    setGroceryClaims(state.groceryClaims ?? {});
    setCustomItems(Array.isArray(state.customItems) ? state.customItems : []);
    setExcludedGroceryKeys(Array.isArray(state.excludedGroceryKeys) ? state.excludedGroceryKeys : []);
    setPantryItems(Array.isArray(state.pantryItems) ? state.pantryItems : []);
    setFamilyProfile({ ...defaultFamilyProfile, ...(state.familyProfile ?? {}) });
    setNutritionGoals(state.nutritionGoals ?? getDefaultNutritionGoals(state.familyProfile ?? defaultFamilyProfile));
    setWantToEatItems(Array.isArray(state.wantToEatItems) ? state.wantToEatItems : []);
    if (state.recommendationAccess) {
      setRecommendationAccess(normalizeRecommendationAccess(state.recommendationAccess));
    }
    setRecommendationFeedback(Array.isArray(state.recommendationFeedback) ? state.recommendationFeedback : []);
    setCraveSignals(Array.isArray(state.craveSignals) ? state.craveSignals : []);
    setCloudSyncStatus(loadedMenuStatus);
    setCloudGroceryStatus(loadedGroceryStatus);
  }

  async function migrateMenusToCloud() {
    if (isHumiApiSession(humiSession)) {
      setCloudMenuLoading(true);
      setCloudSyncStatus("正在保存今晚菜单和连排计划...");
      try {
        await saveHumiState(humiSession, humiStateSnapshot);
        setCloudMenuEnabled(true);
        setCloudGroceryEnabled(true);
        setCloudSyncStatus("今晚菜单和连排计划已保存到微信账号。");
        setCloudGroceryStatus("食材清单也会继续自动同步。");
        showNotice("菜单已保存到微信账号");
      } catch (error) {
        setCloudSyncStatus(error.message);
      } finally {
        setCloudMenuLoading(false);
      }
      return;
    }
    if (!family?.id) {
      setCloudSyncStatus("请先登录并创建家庭空间。");
      return;
    }

    setCloudMenuLoading(true);
    setCloudSyncStatus("正在迁移本地菜单...");
    try {
      await migrateLocalMenusToCloud({ familyId: family.id, todayMenu, weekPlan });
      setCloudMenuEnabled(true);
      setCloudSyncStatus("本机今晚菜单和连排计划已保存到我的家。");
      showNotice("菜单已保存到我的家");
    } catch (error) {
      setCloudSyncStatus(error.message);
    } finally {
      setCloudMenuLoading(false);
    }
  }

  async function refreshCloudMenus() {
    if (isHumiApiSession(humiSession)) {
      try {
        setCloudMenuLoading(true);
        const data = await loadHumiState(humiSession);
        applyHumiStateEnvelope(data, {
          loadedMenuStatus: "已刷新当前家保存的菜单。",
          loadedGroceryStatus: "已刷新当前家保存的食材清单。",
          emptyMenuStatus: "当前家还没有保存菜单。",
          emptyGroceryStatus: "当前家还没有保存食材清单。",
        });
        showNotice("微信账号菜单已刷新");
      } catch (error) {
        setCloudSyncStatus(error.message);
      } finally {
        setCloudMenuLoading(false);
      }
      return;
    }
    if (!family?.id) {
      setCloudSyncStatus("请先登录并创建家庭空间。");
      return;
    }

    setCloudMenuLoading(true);
    setCloudSyncStatus("正在从云端刷新...");
    try {
      const cloudMenus = await loadMenuSync(family.id);
      setTodayMenu(cloudMenus.todayMenu);
      setWeekPlan(cloudMenus.weekPlan);
      setMealPlan(createMealPlanFromLegacy({
        weekPlan: cloudMenus.weekPlan,
        todayMenu: cloudMenus.todayMenu,
        todayDateKey,
        currentDay: getCurrentPlanDay(),
      }));
      setCloudMenuEnabled(true);
      setCloudSyncStatus("已刷新我的家里保存的今晚菜单和连排计划。");
      showNotice("云端菜单已刷新");
    } catch (error) {
      setCloudSyncStatus(error.message);
    } finally {
      setCloudMenuLoading(false);
    }
  }

  async function createAnotherHumiHousehold(name) {
    if (!isHumiApiSession(humiSession)) {
      showNotice("请先在小程序里登录 Humi");
      return;
    }
    setCloudMenuLoading(true);
    try {
      const data = await createHumiHousehold(humiSession, {
        householdName: name || "另一个家",
        memberName: humiSession.user?.displayName || "主厨",
      });
      if (data.family) setFamily(data.family);
      if (Array.isArray(data.households)) setHumiHouseholds(data.households);
      setCloudSyncStatus("已创建并切换到新的家。");
      setCloudGroceryStatus("这个家的菜单、清单和画像会单独保存。");
      showNotice(`已创建 ${data.family?.name || "新的家"}`);
    } catch (error) {
      setCloudSyncStatus(error.message);
      showNotice(error.message);
    } finally {
      setCloudMenuLoading(false);
    }
  }

  async function switchActiveHumiHousehold(householdId) {
    if (!isHumiApiSession(humiSession) || !householdId || householdId === family?.id) return;
    setCloudMenuLoading(true);
    setCloudGroceryLoading(true);
    try {
      const data = await switchHumiHousehold(humiSession, householdId);
      applyHumiStateEnvelope(data, {
        loadedMenuStatus: "已切换并读取当前家的菜单。",
        loadedGroceryStatus: "已切换并读取当前家的食材清单。",
        emptyMenuStatus: "已切换到这个家。这里还没有保存菜单。",
        emptyGroceryStatus: "已切换到这个家。这里还没有保存食材清单。",
      });
      showNotice(`已切换到 ${data.family?.name || "这个家"}`);
    } catch (error) {
      setCloudSyncStatus(error.message);
      setCloudGroceryStatus(error.message);
      showNotice(error.message);
    } finally {
      setCloudMenuLoading(false);
      setCloudGroceryLoading(false);
    }
  }

  async function createFamilyInviteCard() {
    if (!isHumiApiSession(humiSession)) {
      showNotice("请先在小程序里登录 Humi");
      return;
    }
    if (!family?.id) {
      showNotice("先创建我的家，再邀请家人");
      return;
    }
    if (!requireHouseholdOwnerAction()) return;
    try {
      const data = await createHouseholdInvite(humiSession, {
        householdId: family.id,
        inviterName: displaySession?.user?.displayName || humiSession.user?.displayName || "主厨",
      });
      if (data.invite?.token) {
        setActiveHouseholdInvite(data.invite);
        const openedMiniProgramShare = postHouseholdInviteShareToMiniProgram(data.invite);
        showNotice(openedMiniProgramShare ? "已打开家庭邀请卡片" : "家庭邀请卡片已准备好，请点右上角分享");
      }
    } catch (error) {
      showNotice(error.message || "家庭邀请暂时没生成成功");
    }
  }

  async function migrateGroceryToCloud() {
    if (isHumiApiSession(humiSession)) {
      setCloudGroceryLoading(true);
      setCloudGroceryStatus("正在保存食材清单...");
      try {
        await saveHumiState(humiSession, humiStateSnapshot);
        setCloudMenuEnabled(true);
        setCloudGroceryEnabled(true);
        setCloudSyncStatus("今晚菜单和连排计划也会继续自动同步。");
        setCloudGroceryStatus("食材清单已保存到微信账号。");
        showNotice("食材清单已保存到微信账号");
      } catch (error) {
        setCloudGroceryStatus(error.message);
      } finally {
        setCloudGroceryLoading(false);
      }
      return;
    }
    if (!family?.id) {
      setCloudGroceryStatus("请先登录并创建家庭空间。");
      return;
    }

    setCloudGroceryLoading(true);
    setCloudGroceryStatus("正在迁移食材清单...");
    try {
      await migrateLocalGroceryToCloud({
        familyId: family.id,
        customItems,
        checkedItems,
        excludedGroceryKeys,
        pantryItems,
      });
      setCloudGroceryEnabled(true);
      setCloudGroceryStatus("本地食材清单已迁移到家庭空间。");
      showNotice("食材清单已迁移到云端");
    } catch (error) {
      setCloudGroceryStatus(error.message);
    } finally {
      setCloudGroceryLoading(false);
    }
  }

  async function refreshCloudGrocery() {
    if (isHumiApiSession(humiSession)) {
      try {
        setCloudGroceryLoading(true);
        const data = await loadHumiState(humiSession);
        applyHumiStateEnvelope(data, {
          loadedMenuStatus: "已刷新当前家保存的菜单。",
          loadedGroceryStatus: "已刷新当前家保存的食材清单。",
          emptyMenuStatus: "当前家还没有保存菜单。",
          emptyGroceryStatus: "当前家还没有保存食材清单。",
        });
        showNotice("微信账号清单已刷新");
      } catch (error) {
        setCloudGroceryStatus(error.message);
      } finally {
        setCloudGroceryLoading(false);
      }
      return;
    }
    if (!family?.id) {
      setCloudGroceryStatus("请先登录并创建家庭空间。");
      return;
    }

    setCloudGroceryLoading(true);
    setCloudGroceryStatus("正在从云端刷新食材清单...");
    try {
      const cloudGrocery = await loadGrocerySync(family.id);
      setCustomItems(cloudGrocery.customItems);
      setCheckedItems(cloudGrocery.checkedItems);
      setExcludedGroceryKeys(cloudGrocery.excludedGroceryKeys);
      setPantryItems(cloudGrocery.pantryItems);
      setCloudGroceryEnabled(true);
      setCloudGroceryStatus("已刷新云端食材清单。");
      showNotice("云端食材清单已刷新");
    } catch (error) {
      setCloudGroceryStatus(error.message);
    } finally {
      setCloudGroceryLoading(false);
    }
  }

  const cloudMenuProps = {
    family,
    signedIn,
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

  const preferenceProps = {
    family,
    members: familyMembers,
    draft: preferenceDraft,
    loading: preferencesLoading,
    status: preferencesStatus,
    inviteEmail,
    setInviteEmail,
    onDraftChange: updatePreferenceDraft,
    onInviteMember: inviteMember,
    onSavePreference: savePreference,
    onRefreshPreferences: () => loadPreferencesForFamily(),
  };

  function saveFamilyProfile(nextProfile) {
    if (!requireHouseholdOwnerAction()) return;
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
    trackProductEvent(appEvents.profileSaved, {
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
      showNotice("画像已保存，开始安排菜单");
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

  function openFullRecipeLibrary(parentLabel = "今晚菜单") {
    setLibraryMealSlot(null);
    setLibraryParentLabel(parentLabel);
    setQuery("");
    setCategory("全部");
    if (activeView === "library") {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
      return;
    }
    navigateTo("library");
  }

  function addRecipeFromLibrary(recipeId) {
    if (!requireHouseholdOwnerAction()) return;
    if (!libraryMealSlot || libraryMealSlot === "dinner") {
      addToday(recipeId);
      return;
    }
    const nextEntries = upsertMealEntry(todayMeals[libraryMealSlot] ?? [], recipeId, 1);
    assignMealRecipe(todayDateKey, libraryMealSlot, recipeId, 1, { silent: true });
    recordMealSlot(libraryMealSlot, {
      source: "home",
      consumedEntries: nextEntries,
      quickRecordedAt: new Date().toISOString(),
    });
    consumePantryForEntries(nextEntries);
    trackValidationEvent(validationEvents.mealSourceSelected, {
      mealSlot: libraryMealSlot,
      source: "home",
      recipeIds: nextEntries.map((item) => item.recipeId),
      dateKey: todayDateKey,
    });
    showNotice(`${getRecipe(recipeId)?.name ?? "菜品"} 已记到${slotLabelsById[libraryMealSlot] ?? "这一餐"}`);
  }

  function updateLibraryQuantity(recipeId, delta) {
    if (!requireHouseholdOwnerAction()) return;
    if (!libraryMealSlot || libraryMealSlot === "dinner") {
      updateTodayQuantity(recipeId, delta);
      return;
    }
    const nextEntries = (todayMeals[libraryMealSlot] ?? [])
      .map((entry) => entry.recipeId === recipeId ? { ...entry, quantity: Math.max(0, entry.quantity + delta) } : entry)
      .filter((entry) => entry.quantity > 0);
    updateMealPlanSlot(todayDateKey, libraryMealSlot, () => nextEntries);
    recordMealSlot(libraryMealSlot, {
      source: nextEntries.length > 0 ? "home" : undefined,
      consumedEntries: nextEntries,
      quickRecordedAt: new Date().toISOString(),
    });
  }

  function askFamilyFromHome() {
    startCraveRequest("随便都行");
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
    setEntryMotion(true);
    window.setTimeout(() => {
      setOnboardingComplete(true);
      setActiveView("dashboard");
      viewHistoryRef.current = ["dashboard"];
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
      showNotice("先从今晚吃什么开始");
    }, 760);
    window.setTimeout(() => setEntryMotion(false), 1360);
  }

  if (craveLandingToken) {
    return (
      <CraveLanding
        token={craveLandingToken}
        humiSession={humiSession}
        onJoined={(data) => {
          applyHumiStateEnvelope(data, {
            loadedMenuStatus: "已加入这个家，并读取这个家的今晚菜单和征集记录。",
            loadedGroceryStatus: "已加入这个家，并读取这个家的食材清单。",
            emptyMenuStatus: "已加入这个家。这个家还没有保存菜单。",
            emptyGroceryStatus: "已加入这个家。这个家还没有保存食材清单。",
          });
          setOnboardingComplete(true);
          setProfileOnboardingComplete(true);
        }}
        onClose={() => {
          clearCraveTokenFromUrl();
          setCraveLandingToken("");
          setOnboardingComplete(true);
          setActiveView("dashboard");
        }}
      />
    );
  }

  if (householdInviteToken) {
    return (
      <InviteLanding
        token={householdInviteToken}
        humiSession={humiSession}
        onJoined={(data) => {
          applyHumiStateEnvelope(data, {
            loadedMenuStatus: "已加入这个家，并读取这个家的今晚菜单和连排计划。",
            loadedGroceryStatus: "已加入这个家，并读取这个家的食材清单。",
            emptyMenuStatus: "已加入这个家。这个家还没有保存菜单。",
            emptyGroceryStatus: "已加入这个家。这个家还没有保存食材清单。",
          });
          setOnboardingComplete(true);
          setProfileOnboardingComplete(true);
        }}
        onClose={() => {
          clearHouseholdInviteTokenFromUrl();
          setHouseholdInviteToken("");
          setOnboardingComplete(true);
          setActiveView("user");
        }}
      />
    );
  }

  if (groceryShareToken) {
    return (
      <GroceryShareLanding
        token={groceryShareToken}
        humiSession={humiSession}
        onClose={() => {
          clearGroceryShareTokenFromUrl();
          setGroceryShareToken("");
          setOnboardingComplete(true);
          setActiveView("grocery");
        }}
      />
    );
  }

  if (!signedIn && !onboardingComplete) {
    return (
      <>
        <AuthLanding
          authProps={authProps}
          onContinueGuest={continueAsGuest}
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
          className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activeView !== "dashboard" && (
            <Topbar
              activeView={activeView}
              query={query}
              setQuery={setQuery}
              session={displaySession}
              onOpenUserCenter={() => navigateTo("dashboard")}
              onBack={goBack}
            />
          )}
          <div key={activeView} className={`view-enter ${flowMotion ? `flow-motion-${flowMotion}` : ""}`}>
            {activeView === "dashboard" && (
              <Dashboard
                todayRecipes={todayRecipes}
                todayMeals={todayMeals}
                weekPlan={weekPlan}
                recommendation={displayedRecommendation}
                recommendationAccess={normalizeRecommendationAccess(recommendationAccess)}
                aiRecommendationStatus={aiRecommendationStatus}
                aiRecommendationLoading={aiRecommendationLoading}
                onViewChange={navigateTo}
                onOpenRecipe={openRecipe}
                onAddRecommended={addRecommendedToday}
                onRequestAiRecommendation={requestAiRecommendation}
                onRequestPreciseRecommendation={() => requestAiRecommendation(null, "precise")}
                onOpenRecommendationFeedback={() => setRecommendationFeedbackOpen(true)}
                feedbackOpen={recommendationFeedbackOpen}
                onSubmitRecommendationFeedback={(reason) => requestAiRecommendation(reason)}
                onCloseRecommendationFeedback={() => setRecommendationFeedbackOpen(false)}
                onStartCraveRequest={startCraveRequest}
                onDecideAlone={decideAloneFromCrave}
                activeCraveRequest={activeCraveRequest}
                cravePromptSignal={cravePromptSignal}
                onCopyCraveLink={copyCraveLink}
                onRefreshCraveRequest={refreshCraveRequest}
                onGenerateFromCrave={generateFromCraveRequest}
                onRecordBreakfast={recordBreakfast}
                onSetLunchSource={setLunchSource}
                session={displaySession}
                onOpenUserCenter={() => navigateTo("dashboard")}
                householdMembers={family?.members ?? []}
                currentMemberId={humiSession?.user?.id || displaySession?.user?.id || ""}
                canManageHousehold={!isHumiApiSession(humiSession) || family?.role === "owner"}
                familyProfile={familyProfile}
                groceryItemCount={visibleGroceryItems.length}
                onSelectPlanningMode={selectPlanningMode}
                onPlanRecommendedWeek={planRecommendedWeek}
                mealLog={todayMealLog}
                mealLogs={mealLogs}
                onSetDinnerSource={setDinnerSource}
                onSetDinnerConfirmation={setDinnerConfirmation}
                onQuickDinnerConfirm={quickConfirmDinner}
                onToggleConsumedRecipe={toggleConsumedRecipe}
                pantryItems={pantryItems}
                onRemovePantryItem={removePantryItem}
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
                parentLabel={libraryParentLabel}
                targetMealSlot={libraryMealSlot}
                targetMealLabel={libraryMealSlot ? slotLabelsById[libraryMealSlot] : ""}
                onClearTargetMeal={() => setLibraryMealSlot(null)}
                onOpenRecipe={openRecipe}
                onDragStart={setDraggedRecipeId}
              />
            )}
            {activeView === "recommendations" && (
              <RecommendationsPage
                recommendation={displayedRecommendation}
                aiRecommendationLoading={aiRecommendationLoading}
                onRefresh={() => requestAiRecommendation()}
                onAccept={() => {
                  addRecommendedToday();
                  navigateTo("today");
                }}
                onReject={(reason) => requestAiRecommendation(reason)}
                onOpenRecipe={openRecipe}
                onViewChange={navigateTo}
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
                onGenerateWeek={planRecommendedWeek}
                cloudSync={{
                  family,
                  signedIn,
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
                onOpenLibraryDiscovery={() => openFullRecipeLibrary("今晚菜单")}
                onShare={shareTodayMenu}
                mealLog={todayMealLog}
                mealLogs={mealLogs}
                onSetDinnerSource={setDinnerSource}
                onSetDinnerConfirmation={setDinnerConfirmation}
                onQuickDinnerConfirm={quickConfirmDinner}
                onToggleConsumedRecipe={toggleConsumedRecipe}
                cloudSync={{
                  family,
                  signedIn,
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
                checkedItems={checkedItems}
                groceryClaims={groceryClaims}
                setCheckedItems={setCheckedItems}
                onToggleClaim={toggleGroceryClaim}
                currentMemberId={humiSession?.user?.id}
                onGroceryItemChecked={({ key, checked, item }) => {
                  trackValidationEvent(validationEvents.groceryItemChecked, { key, checked });
                  if (checked) addGroceryItemToPantry(item);
                }}
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
                preferenceProps={preferenceProps}
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
                recommendationAccess={normalizeRecommendationAccess(recommendationAccess)}
                wantToEatItems={wantToEatItems}
                craveSignals={craveSignals}
                groceryClaims={groceryClaims}
                activeCraveRequest={activeCraveRequest}
                onCopyCraveLink={copyCraveLink}
                onRefreshCraveRequest={refreshCraveRequest}
                onGenerateFromCrave={generateFromCraveRequest}
                onStartCraveRequest={startCraveRequest}
                onDecideAlone={decideAloneFromCrave}
                onCreateHousehold={createAnotherHumiHousehold}
                onSwitchHousehold={switchActiveHumiHousehold}
                activeHouseholdInvite={activeHouseholdInvite}
                onCreateHouseholdInvite={createFamilyInviteCard}
                onShareHouseholdInvite={() => activeHouseholdInvite && postHouseholdInviteShareToMiniProgram(activeHouseholdInvite)}
                onExportValidationData={exportLocalValidationData}
                onViewChange={navigateTo}
                onOpenRecipeLibrary={() => openFullRecipeLibrary("我的家")}
                onAskFamily={askFamilyFromHome}
                onAddWantToEat={addWantToEatItem}
                onAddWantRecipe={addWantRecipe}
                onAddWantToToday={addWantToToday}
                onCompleteWantToEat={completeWantToEatItem}
                onRemoveWantToEat={removeWantToEatItem}
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

function getCraveTokenFromUrl() {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("crave") || "";
}

function getHouseholdInviteTokenFromUrl() {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("invite") || "";
}

function getGroceryShareTokenFromUrl() {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("grocery") || "";
}

function clearCraveTokenFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("crave");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function getCraveDeadlineTime(request) {
  const explicitTime = new Date(request?.deadlineAt || "").getTime();
  if (Number.isFinite(explicitTime)) return explicitTime;
  const createdTime = new Date(request?.createdAt || "").getTime();
  if (!Number.isFinite(createdTime)) return NaN;
  return createdTime + CRAVE_AUTO_GENERATE_MS;
}

function clearHouseholdInviteTokenFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function clearGroceryShareTokenFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("grocery");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function postCraveShareToMiniProgram(payload) {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.postMessage) return false;
  miniProgram.postMessage({
    data: {
      type: "humi:share-crave",
      ...payload,
      requestedAt: Date.now(),
    },
  });
  return navigateToMiniProgramShare("crave", payload);
}

function postHouseholdInviteShareToMiniProgram(payload) {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.postMessage) return false;
  miniProgram.postMessage({
    data: {
      type: "humi:share-household-invite",
      token: payload.token,
      householdName: payload.householdName || "我的家",
      inviterName: payload.inviterName || "主厨",
      requestedAt: Date.now(),
    },
  });
  return navigateToMiniProgramShare("invite", payload);
}

function postGroceryShareToMiniProgram(payload) {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.postMessage) return false;
  miniProgram.postMessage({
    data: {
      type: "humi:share-grocery",
      token: payload.token,
      householdName: payload.householdName || "我家",
      initiatorName: payload.initiatorName || "主厨",
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      requestedAt: Date.now(),
    },
  });
  return navigateToMiniProgramShare("grocery", {
    ...payload,
    itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
  });
}

function navigateToMiniProgramShare(type, payload = {}) {
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.navigateTo) return true;
  const params = new URLSearchParams();
  params.set("type", type);
  params.set("token", payload.token || "");
  if (payload.householdName) params.set("householdName", payload.householdName);
  if (payload.initiatorName) params.set("initiatorName", payload.initiatorName);
  if (payload.inviterName) params.set("inviterName", payload.inviterName);
  if (payload.title) params.set("title", payload.title);
  if (payload.itemCount !== undefined) params.set("itemCount", String(payload.itemCount));
  miniProgram.navigateTo({ url: `/pages/share/index?${params.toString()}` });
  return true;
}

function getGroceryClaimActor({ humiSession, family }) {
  const memberId = humiSession?.user?.id || "";
  if (!memberId) return null;
  const familyMember = family?.members?.find((member) => member.memberId === memberId);
  return {
    memberId,
    memberName: familyMember?.nickname || humiSession.user?.displayName || "家人",
  };
}

function getHouseholdActor({ humiSession, family, fallbackSession }) {
  const memberId = humiSession?.user?.id || fallbackSession?.user?.id || "guest";
  const familyMember = family?.members?.find((member) => member.memberId === memberId);
  return {
    memberId,
    memberName: familyMember?.nickname || humiSession?.user?.displayName || fallbackSession?.user?.displayName || "家人",
  };
}

function normalizeRecommendationAccess(access = {}) {
  return {
    ...defaultRecommendationAccess,
    ...access,
    plan: access.plan === "plus" ? "plus" : "free",
    preciseTrialRemaining: Math.max(0, Number.parseInt(access.preciseTrialRemaining, 10) || 0),
    preciseUsed: Math.max(0, Number.parseInt(access.preciseUsed, 10) || 0),
  };
}

function canUsePreciseRecommendation(access = {}) {
  const normalized = normalizeRecommendationAccess(access);
  return normalized.plan === "plus" || normalized.preciseTrialRemaining > 0;
}

function consumePreciseRecommendation(access = {}) {
  const normalized = normalizeRecommendationAccess(access);
  if (normalized.plan === "plus") {
    return { ...normalized, preciseUsed: normalized.preciseUsed + 1 };
  }
  return {
    ...normalized,
    preciseTrialRemaining: Math.max(0, normalized.preciseTrialRemaining - 1),
    preciseUsed: normalized.preciseUsed + 1,
  };
}

function buildPreciseRecommendationCacheKey(context) {
  return `precise:${hashString(stableStringify({
    mode: context?.mode,
    candidateIds: context?.candidates?.map((recipe) => recipe.id),
    pantryItems: context?.pantryItems,
    familyProfile: context?.familyProfile,
    planningMode: context?.planningMode?.id,
    recentRecipeIds: context?.recentRecipeIds,
    currentMissingItems: context?.currentMissingItems,
    recentFeedback: context?.recentFeedback,
    ruleFallback: context?.ruleFallback,
  }))}`;
}

function getRecentMealLogRecipeIds(mealLogs = {}) {
  return Object.entries(mealLogs)
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 14)
    .flatMap(([, log]) => [
      ...(log?.consumedEntries ?? []),
      ...(log?.plannedEntries ?? []),
      ...Object.values(log?.meals ?? {}).flatMap((meal) => [
        ...(meal?.consumedEntries ?? []),
        ...(meal?.plannedEntries ?? []),
      ]),
    ])
    .map((entry) => entry?.recipeId)
    .filter(Boolean);
}

function readPreciseRecommendationCache(cache = {}, cacheKey) {
  const entry = cache?.[cacheKey];
  if (!entry?.result || !entry.createdAt) return null;
  const createdTime = new Date(entry.createdAt).getTime();
  if (Number.isNaN(createdTime) || Date.now() - createdTime > PRECISE_RECOMMENDATION_CACHE_TTL_MS) return null;
  return entry.result;
}

function writePreciseRecommendationCache(cache = {}, cacheKey, result) {
  if (!cacheKey || !result?.recipeIds?.length) return cache;
  const now = new Date().toISOString();
  const next = {
    ...cache,
    [cacheKey]: {
      result: {
        recipeIds: result.recipeIds,
        reason: result.reason,
        explanation: result.explanation,
        source: result.source,
      },
      createdAt: now,
    },
  };
  return Object.fromEntries(
    Object.entries(next)
      .filter(([, entry]) => {
        const createdTime = new Date(entry?.createdAt).getTime();
        return !Number.isNaN(createdTime) && Date.now() - createdTime <= PRECISE_RECOMMENDATION_CACHE_TTL_MS;
      })
      .sort(([, a], [, b]) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, PRECISE_RECOMMENDATION_CACHE_LIMIT),
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function recipeMatchesWantItem(recipe, item) {
  if (!recipe || !item) return false;
  if (item.recipeId && item.recipeId === recipe.id) return true;
  const signals = [item.title, item.note]
    .map((value) => normalizeName(String(value ?? "")))
    .filter((value) => value.length > 1);
  if (signals.length === 0) return false;
  const haystack = [
    recipe.id,
    recipe.name,
    recipe.description,
    ...(recipe.categories ?? []),
    ...(recipe.tags ?? []),
    ...(recipe.ingredients ?? []).map((ingredient) => ingredient.name),
  ]
    .map((value) => normalizeName(String(value ?? "")))
    .join(" ");
  const recipeName = normalizeName(recipe.name);
  return signals.some((signal) => haystack.includes(signal) || signal.includes(recipeName));
}

function buildWantItemsFromCraveRequest(request) {
  const votes = request?.votes ?? [];
  return votes
    .map((vote) => {
      const title = extractWantTitleFromCraveVote(vote);
      if (!title) return null;
      const matchedRecipe = recipes.find((recipe) => normalizeName(recipe.name) === normalizeName(title));
      return {
        id: `want:crave:${vote.id || vote.participantKey || hashString(`${title}:${vote.createdAt || ""}`)}`,
        title,
        recipeId: matchedRecipe?.id ?? "",
        note: vote.feelingTag && vote.feelingTag !== "随便都行" ? `来自征集：${vote.feelingTag}` : "来自感觉征集",
        memberId: vote.memberId || vote.participantKey || "",
        memberName: vote.memberName || "家人",
        status: "open",
        createdAt: vote.createdAt || request.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function extractWantTitleFromCraveVote(vote) {
  const note = String(vote?.note ?? "").trim();
  if (note.length < 2) return "";
  const normalizedNote = note.replace(/[。！？!?]/g, " ").replace(/\s+/g, " ").trim();
  const explicitMatch = normalizedNote.match(/想吃\s*([^,，、;；\s]{2,16})/);
  if (explicitMatch?.[1]) return explicitMatch[1].trim();
  const matchedRecipe = recipes.find((recipe) => {
    const name = normalizeName(recipe.name);
    const text = normalizeName(normalizedNote);
    return name.length > 1 && (text.includes(name) || name.includes(text));
  });
  return matchedRecipe?.name ?? "";
}

function normalizeName(value) {
  return value.trim().toLowerCase();
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
      <div className="entry-table-motion__glow" />
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

function buildCraveResultSummary(recommendation, generatedAt = new Date().toISOString()) {
  return {
    dishes: getRecommendationItems(recommendation)
      .map(({ recipe }) => ({
        name: recipe.name,
        timeMinutes: recipe.timeMinutes,
      }))
      .slice(0, 4),
    reason: recommendation?.reason || "",
    generatedAt,
  };
}

function orderPlanDaysFrom(startDay) {
  const startIndex = Math.max(weekPlanDays.indexOf(startDay), 0);
  return [...weekPlanDays.slice(startIndex), ...weekPlanDays.slice(0, startIndex)];
}

function formatAiError(error) {
  const message = error?.message ?? "今晚建议暂时没想好。";
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
  if (message.includes("Supabase is not configured")) {
    return "暂时只能保存在本机。";
  }
  return message;
}

function createHumiSessionFamily(humiSession) {
  if (!humiSession?.user?.id) return null;
  return {
    id: `humi:${humiSession.user.id}`,
    name: "我的家",
    role: "pending",
    provider: "wechat",
  };
}

createRoot(document.getElementById("root")).render(<App />);

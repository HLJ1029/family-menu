import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarPage } from "./components/CalendarPage";
import { Dashboard } from "./components/Dashboard";
import { GroceryList } from "./components/GroceryList";
import { InventoryPage } from "./components/InventoryPage";
import { Library } from "./components/Library";
import { Planner } from "./components/Planner";
import { PosterPreview } from "./components/PosterPreview";
import { RecipeDetailDrawer } from "./components/RecipeDetailDrawer";
import { Sidebar, MobileTabbar, Topbar } from "./components/AppShell";
import { StatsPage } from "./components/StatsPage";
import { TodayMenu } from "./components/TodayMenu";
import { UserCenter } from "./components/UserCenter";
import { OfflineStatus } from "./components/system/OfflineStatus";
import { DoodleWash } from "./components/ui/Doodles";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { formatDateKey, formatDateLabel, getCurrentPlanDay } from "./lib/date";
import {
  buildRecipeGroceryGroups,
  buildShoppingListFromEntries,
  formatRawAmount,
  formatShareText,
} from "./lib/grocery";
import { getExpiryState } from "./lib/pantry";
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
  recipes,
} from "./lib/recipes";
import { buildTodayRecommendation } from "./lib/recommendation/rules";
import { getLaunchChannel } from "./lib/runtime";
import { appEvents, trackAppEvent } from "./lib/supabase/appEvents";
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
  const [activeView, setActiveView] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [todayMenu, setTodayMenu] = useLocalStorageState("family-menu:today-menu", []);
  const [weekPlan, setWeekPlan] = useLocalStorageState("family-menu:week-plan", createDefaultWeekPlan);
  const [mealCalendar, setMealCalendar] = useLocalStorageState(
    "family-menu:meal-calendar",
    createInitialMealCalendar,
  );
  const [checkedItems, setCheckedItems] = useLocalStorageState("family-menu:checked-items", {});
  const [customItems, setCustomItems] = useLocalStorageState("family-menu:custom-items", []);
  const [newCustomItem, setNewCustomItem] = useState("");
  const [pantryItems, setPantryItems] = useLocalStorageState("family-menu:pantry-items", []);
  const [newPantryItem, setNewPantryItem] = useState("");
  const [newPantryAmount, setNewPantryAmount] = useState("");
  const [newPantryExpiresOn, setNewPantryExpiresOn] = useState("");
  const [excludedGroceryKeys, setExcludedGroceryKeys] = useLocalStorageState(
    "family-menu:excluded-grocery-keys",
    [],
  );
  const [draggedRecipeId, setDraggedRecipeId] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [cookingStep, setCookingStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [session, setSession] = useState(null);
  const [family, setFamily] = useState(null);
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
  const [cloudGroceryStatus, setCloudGroceryStatus] = useState("菜单保存后，可以继续保存食材清单和库存。");
  const [familyMembers, setFamilyMembers] = useState([]);
  const [preferenceDraft, setPreferenceDraft] = useState({});
  const [familyProfile, setFamilyProfile] = useLocalStorageState("family-menu:family-profile", defaultFamilyProfile);
  const [recommendationFeedback, setRecommendationFeedback] = useLocalStorageState("family-menu:recommendation-feedback", []);
  const [recommendationFeedbackOpen, setRecommendationFeedbackOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesStatus, setPreferencesStatus] = useState("创建家庭空间后，可维护家庭成员偏好。");
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiExplanationStatus, setAiExplanationStatus] = useState("先给你一组搭配理由；想记住家里的习惯，再去我的家登录。");
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState(null);
  const [aiRecommendationStatus, setAiRecommendationStatus] = useState("先按家里现有情况给你安排；登录后会参考家庭画像、库存和口味。");
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(false);
  const [posterPreview, setPosterPreview] = useState(null);
  const [posterLoading, setPosterLoading] = useState(false);

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
    if (appOpenTrackedRef.current) return;
    appOpenTrackedRef.current = true;
    void trackAppEvent({
      eventName: appEvents.appOpen,
      payload: {
        path: window.location.pathname,
        source: getLaunchChannel(),
        online,
      },
    });
  }, [online]);

  useEffect(() => {
    if (!family?.id || !cloudMenuEnabled) return;
    let active = true;

    async function loadCloudMenus() {
      setCloudMenuLoading(true);
      setCloudSyncStatus("正在从云端读取菜单...");
      try {
        const cloudMenus = await loadMenuSync(family.id);
        if (!active) return;
        setTodayMenu(cloudMenus.todayMenu);
        setWeekPlan(cloudMenus.weekPlan);
        setCloudSyncStatus("已读取我的家里保存的今晚菜单和一周计划。");
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
  }, [cloudMenuEnabled, family?.id, setTodayMenu, setWeekPlan]);

  useEffect(() => {
    if (!family?.id || !cloudMenuEnabled || cloudMenuLoading) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveTodayMenu(family.id, todayMenu);
        setCloudSyncStatus("今晚菜单已保存到我的家。");
      } catch (error) {
        setCloudSyncStatus(error.message);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [cloudMenuEnabled, cloudMenuLoading, family?.id, todayMenu]);

  useEffect(() => {
    if (!family?.id || !cloudMenuEnabled || cloudMenuLoading) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveWeekPlan(family.id, weekPlan);
        setCloudSyncStatus("一周计划已保存到我的家。");
      } catch (error) {
        setCloudSyncStatus(error.message);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [cloudMenuEnabled, cloudMenuLoading, family?.id, weekPlan]);

  useEffect(() => {
    if (!family?.id || !cloudGroceryEnabled) return;
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
        setCloudGroceryStatus("已从云端读取食材清单和厨房库存。");
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
    setCheckedItems,
    setCustomItems,
    setExcludedGroceryKeys,
    setPantryItems,
  ]);

  useEffect(() => {
    if (!family?.id || !cloudGroceryEnabled || cloudGroceryLoading) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveGrocerySync({
          familyId: family.id,
          customItems,
          checkedItems,
          excludedGroceryKeys,
          pantryItems,
        });
        setCloudGroceryStatus("食材清单和家中库存已保存到我的家。");
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
        setFamily(null);
        if (!nextSession?.user) return;
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
    if (!family?.id) {
      setFamilyMembers([]);
      setPreferenceDraft({});
      setInviteEmail("");
      setPreferencesStatus("创建家庭空间后，可维护家庭成员偏好。");
      return;
    }

    let active = true;
    loadPreferencesForFamily({ active: () => active });
    return () => {
      active = false;
    };
  }, [family?.id]);

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
  const plannedEntries = Object.entries(weekPlan).flatMap(([day, recipeIds]) =>
    recipeIds.map((recipeId) => ({ day, recipeId, quantity: 1 })),
  );
  const plannedRecipes = plannedEntries.map((entry) => getRecipe(entry.recipeId)).filter(Boolean);
  const selectedRecipe = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
  const recipeEntries = [
    ...todayMenu.map((item) => ({ ...item, source: "今晚菜单" })),
    ...plannedEntries.map((item) => ({ ...item, source: item.day })),
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
  const pantryExpirySummary = useMemo(() => {
    const expiringItems = pantryItems.filter((item) => {
      const state = getExpiryState(item.expiresOn);
      return state === "expired" || state === "soon";
    });
    return {
      expiringCount: expiringItems.length,
      expiredCount: expiringItems.filter((item) => getExpiryState(item.expiresOn) === "expired").length,
    };
  }, [pantryItems]);
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
  const todayRecommendation = useMemo(
    () =>
      buildTodayRecommendation({
        pantryItems,
        weekPlan,
        groceryItems: visibleGroceryItems,
        todayRecipes,
        familyMembers,
      }),
    [familyMembers, pantryItems, todayRecipes, visibleGroceryItems, weekPlan],
  );

  useEffect(() => {
    setAiExplanation("");
    setAiExplanationStatus("先给你一组搭配理由；想记住家里的习惯，再去我的家登录。");
    setAiRecommendation(null);
    setAiRecommendationStatus("先按家里现有情况给你安排；登录后会参考家庭画像、库存和口味。");
  }, [todayRecommendation.title]);
  const displayedRecommendation = aiRecommendation ?? todayRecommendation;

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(""), 1800);
  }

  function trackProductEvent(eventName, payload = {}) {
    void trackAppEvent({
      eventName,
      userId: session?.user?.id,
      familyId: family?.id,
      payload,
    });
  }

  function openRecipe(recipeId) {
    setSelectedRecipeId(recipeId);
    setCookingStep(0);
  }

  function closeRecipe() {
    setSelectedRecipeId(null);
    setCookingStep(0);
  }

  function addToday(recipeId) {
    const recipe = getRecipe(recipeId);
    const currentDay = getCurrentPlanDay();
    const todayKey = formatDateKey(new Date());
    const alreadyInCurrentPlan = (weekPlan[currentDay] ?? []).includes(recipeId);
    const alreadyInTodayPlan = (mealCalendar[todayKey] ?? []).includes(recipeId);
    setTodayMenu((current) => {
      const existing = current.find((item) => item.recipeId === recipeId);
      if (existing) {
        return current.map((item) =>
          item.recipeId === recipeId ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...current, { recipeId, quantity: 1 }];
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
      showNotice(`${recipe?.name ?? "菜品"} 已安排到今晚和${currentDay}`);
      return;
    }
    showNotice(`${recipe?.name ?? "菜品"} 已放进今晚菜单`);
  }

  function addRecommendedToday() {
    const recommendedIds = displayedRecommendation.recipes
      .map((recipe) => recipe.id)
      .filter((recipeId) => !todayMenu.some((item) => item.recipeId === recipeId));

    if (recommendedIds.length === 0) {
      showNotice("这组菜已经在今晚菜单里");
      return;
    }

    recommendedIds.forEach(addToday);
    trackProductEvent(appEvents.recommendationAccepted, {
      recipeIds: recommendedIds,
      source: displayedRecommendation.source ?? "rule",
      missingCount: displayedRecommendation.missingItems.length,
    });
    showNotice(`已加入 ${recommendedIds.length} 道推荐菜`);
  }

  function planRecommendedWeek() {
    const recommendedIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const currentDay = getCurrentPlanDay();
    const orderedDays = orderPlanDaysFrom(currentDay);
    const existingIds = new Set(Object.values(weekPlan).flat());
    const nextWeekPlan = { ...weekPlan };
    let addedCount = 0;

    recommendedIds.forEach((recipeId) => {
      if (existingIds.has(recipeId)) return;
      const targetDay =
        orderedDays.find((day) => (nextWeekPlan[day] ?? []).length < 2) ??
        orderedDays.find((day) => (nextWeekPlan[day] ?? []).length < 3) ??
        currentDay;
      nextWeekPlan[targetDay] = [...(nextWeekPlan[targetDay] ?? []), recipeId];
      existingIds.add(recipeId);
      addedCount += 1;
    });

    if (addedCount > 0) setWeekPlan(nextWeekPlan);
    if (addedCount > 0) {
      trackProductEvent(appEvents.weekPlanAdd, {
        recipeIds: recommendedIds,
        addedCount,
        source: "recommendation",
      });
    }
    showNotice(addedCount > 0 ? `已安排 ${addedCount} 道推荐菜到本周计划` : "推荐菜已在本周计划中");
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
      setAiExplanationStatus("这组先按当前菜单说明；登录后，Humi 会慢慢记住家里的口味。");
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

  async function requestAiRecommendation(feedbackReason = null) {
    setRecommendationFeedbackOpen(false);
    const currentRecipeIds = displayedRecommendation.recipes.map((recipe) => recipe.id);
    const alternateRuleRecommendation = buildTodayRecommendation({
      pantryItems,
      weekPlan,
      groceryItems: visibleGroceryItems,
      todayRecipes,
      familyMembers,
      excludedRecipeIds: currentRecipeIds,
    });
    trackProductEvent(appEvents.recommendationRequest, {
      hasFeedback: Boolean(feedbackReason),
      currentRecipeIds,
    });
    if (feedbackReason) {
      recordRecommendationFeedback(feedbackReason);
    }

    if (!session?.user) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus("已经换成另一组；登录后，Humi 还会参考家庭画像和库存。");
      trackProductEvent(appEvents.recommendationShown, {
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
        }),
      );
      const nextRecommendation = hydrateAiRecommendation({
        result,
        fallback: alternateRuleRecommendation,
      });
      setAiRecommendation(nextRecommendation);
      setAiExplanation(result.reason ?? nextRecommendation.reason);
      setAiRecommendationStatus("给你重新想好了一组。");
      setAiExplanationStatus("已经把这组晚饭的搭配理由放在下面。");
      trackProductEvent(appEvents.recommendationShown, {
        source: nextRecommendation.source ?? "deepseek",
        recipeIds: nextRecommendation.recipes.map((recipe) => recipe.id),
        missingCount: nextRecommendation.missingItems.length,
      });
      showNotice("晚饭推荐已更新");
    } catch (error) {
      setAiRecommendation({ ...alternateRuleRecommendation, source: "rule" });
      setAiRecommendationStatus(`${formatAiError(error)} 已先换成另一组。`);
      trackProductEvent(appEvents.recommendationShown, {
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
    trackProductEvent(appEvents.recommendationFeedback, {
      reasonId: reason.id,
      reasonLabel: reason.label,
      recipeIds: currentRecipeIds,
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
    setTodayMenu((current) =>
      current
        .map((item) =>
          item.recipeId === recipeId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function assignPlan(day, recipeId) {
    if ((weekPlan[day] ?? []).includes(recipeId)) {
      showNotice(`已在${day}计划中`);
      return;
    }
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
    setMealCalendar((current) => ({
      ...current,
      [dateKey]: [...(current[dateKey] ?? []), recipeId],
    }));
    showNotice(`已添加到 ${formatDateLabel(dateKey)}`);
  }

  function removeDatePlan(dateKey, recipeId) {
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

  function addPantryItem({ name, amount, expiresOn }) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const normalized = normalizeName(trimmed);
    setPantryItems((current) => {
      if (current.some((item) => normalizeName(item.name) === normalized)) return current;
      return [
        ...current,
        {
          key: `pantry:${Date.now()}`,
          name: trimmed,
          amount: amount.trim() || undefined,
          expiresOn: expiresOn || undefined,
        },
      ];
    });
    setNewPantryItem("");
    setNewPantryAmount("");
    setNewPantryExpiresOn("");
    showNotice(`${trimmed} 已加入厨房库存`);
  }

  function removePantryItem(key) {
    setPantryItems((current) => current.filter((item) => item.key !== key));
  }

  function excludeGroceryItem(itemOrKey) {
    const key = typeof itemOrKey === "string" ? itemOrKey : itemOrKey?.hiddenKey;
    if (!key) return;
    setExcludedGroceryKeys((current) => (current.includes(key) ? current : [...current, key]));
    if (typeof itemOrKey === "object" && itemOrKey?.name) {
      const normalized = normalizeName(itemOrKey.name);
      setPantryItems((current) => {
        if (current.some((item) => normalizeName(item.name) === normalized)) return current;
        return [
          ...current,
          {
            key: `pantry:${Date.now()}`,
            name: itemOrKey.name,
            amount: formatRawAmount(itemOrKey),
          },
        ];
      });
      showNotice(`${itemOrKey.name} 已加入厨房库存`);
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

  function markPantryItemsOwned() {
    const pantryItemsToAdd = visibleGroceryItems.filter((item) => item.pantryItem);
    if (pantryItemsToAdd.length === 0) {
      showNotice("当前没有常备项需要处理");
      return;
    }
    setPantryItems((current) => {
      const currentNames = new Set(current.map((item) => normalizeName(item.name)));
      const additions = pantryItemsToAdd
        .filter((item) => !currentNames.has(normalizeName(item.name)))
        .map((item, index) => ({ key: `pantry:${Date.now()}:${index}`, name: item.name, amount: formatRawAmount(item) }));
      return [...current, ...additions];
    });
    showNotice(`已把 ${pantryItemsToAdd.length} 个常备项加入厨房库存`);
  }

  async function shareGroceryList() {
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

  async function shareInventorySummary() {
    const expiredItems = pantryItems.filter((item) => getExpiryState(item.expiresOn) === "expired");
    const expiringItems = pantryItems.filter((item) => getExpiryState(item.expiresOn) === "soon");
    const freshItems = pantryItems.filter((item) => !["expired", "soon"].includes(getExpiryState(item.expiresOn)));
    const text = [
      "Humi 家中库存",
      "",
      `全部库存：${pantryItems.length} 项`,
      `临期：${expiringItems.length} 项`,
      `已过期：${expiredItems.length} 项`,
      "",
      formatInventoryShareSection("临期优先处理", expiringItems),
      formatInventoryShareSection("已过期", expiredItems),
      formatInventoryShareSection("家里现有", freshItems),
    ].join("\n");
    await shareText({ type: "inventory", title: "Humi 家中库存", text, success: "库存摘要已复制" });
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
    showNotice("海报已保存到下载");
  }

  async function sharePosterPreview() {
    if (!posterPreview) return;
    setPosterLoading(true);
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
      await signOut();
      setSession(null);
      setFamily(null);
      setCloudMenuEnabled(false);
      setCloudGroceryEnabled(false);
      setFamilyMembers([]);
      setPreferenceDraft({});
      setInviteEmail("");
      setAuthStatus("已退出登录，本地模式仍可继续使用。");
    } catch (error) {
      setAuthStatus(error.message);
    } finally {
      setCloudLoading(false);
    }
  }

  async function loadPreferencesForFamily({ active = () => true } = {}) {
    if (!family?.id) return;

    setPreferencesLoading(true);
    setPreferencesStatus("正在读取家庭成员偏好...");
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
      setPreferencesStatus("家庭成员偏好已读取。");
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
    if (!family?.id) {
      setPreferencesStatus("请先登录并创建家庭空间。");
      return;
    }

    setPreferencesLoading(true);
    setPreferencesStatus("正在保存家庭成员偏好...");
    try {
      await saveMemberPreference({
        familyId: family.id,
        memberId,
        preference: draftToPreference(preferenceDraft[memberId] ?? {}),
      });
      setPreferencesStatus("家庭成员偏好已保存。");
      trackProductEvent(appEvents.profileSaved, { type: "member_preference" });
      showNotice("成员偏好已保存");
      await loadPreferencesForFamily();
    } catch (error) {
      setPreferencesStatus(error.message);
    } finally {
      setPreferencesLoading(false);
    }
  }

  async function inviteMember() {
    if (!family?.id) {
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
  }) {
    const recentRecipeIds = [
      ...new Set([
        ...Object.values(weekPlan).flat(),
        ...todayMenu.map((item) => item.recipeId),
      ]),
    ].slice(-12);

    return {
      candidates: recipes
        .filter((recipe) => !currentRecipeIds.includes(recipe.id))
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
        "优先使用快到期或家里已有的主食材。",
        "避开近期已经安排过的菜。",
        "晚饭组合建议 1-2 道，总耗时尽量控制在 45 分钟内。",
        "主食材缺口尽量不超过 3 项；调料和常备项不要当作主要缺口。",
        "组合尽量包含一道蛋白来源和一道蔬菜/汤/清爽类菜。",
        "如果家庭偏好、忌口、过敏与候选冲突，必须优先避开。",
        "本轮候选已排除用户刚看到的菜，不能重复上一组。",
      ],
      ruleFallback: {
        recipeIds: fallbackRecommendation.recipes.map((recipe) => recipe.id),
        reason: fallbackRecommendation.reason,
      },
    };
  }

  function hydrateAiRecommendation({ result, fallback }) {
    const selectedRecipes = result.recipeIds
      .map((recipeId) => getRecipe(recipeId))
      .filter(Boolean);

    if (selectedRecipes.length === 0) return fallback;

    const selectedIngredientNames = new Set(
      selectedRecipes.flatMap((recipe) => recipe.ingredients.map((item) => normalizeName(item.name))),
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
    const missingItems = selectedRecipes
      .flatMap((recipe) => recipe.ingredients)
      .filter((item) => item.required !== false && !usablePantryNames.has(normalizeName(item.name)))
      .filter((item, index, items) => items.findIndex((candidate) => normalizeName(candidate.name) === normalizeName(item.name)) === index)
      .slice(0, 5);

    const inventoryHits = [...selectedIngredientNames].filter((name) => usablePantryNames.has(name)).length;
    const expiringHits = [...selectedIngredientNames].filter((name) => expiringPantryNames.has(name)).length;

    return {
      ...fallback,
      recipes: selectedRecipes,
      title: selectedRecipes.map((recipe) => recipe.name).join(" + "),
      reason: result.reason,
      inventoryHits,
      expiringHits,
      missingItems,
      explanation: result.explanation ?? fallback.explanation,
      source: "deepseek",
      nutrition: {
        caloriesKcal: selectedRecipes.reduce((total, recipe) => total + nutritionFor(recipe).caloriesKcal, 0),
        proteinG: selectedRecipes.reduce((total, recipe) => total + nutritionFor(recipe).proteinG, 0),
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

  async function migrateMenusToCloud() {
    if (!family?.id) {
      setCloudSyncStatus("请先登录并创建家庭空间。");
      return;
    }

    setCloudMenuLoading(true);
    setCloudSyncStatus("正在迁移本地菜单...");
    try {
      await migrateLocalMenusToCloud({ familyId: family.id, todayMenu, weekPlan });
      setCloudMenuEnabled(true);
      setCloudSyncStatus("本机今晚菜单和一周计划已保存到我的家。");
      showNotice("菜单已保存到我的家");
    } catch (error) {
      setCloudSyncStatus(error.message);
    } finally {
      setCloudMenuLoading(false);
    }
  }

  async function refreshCloudMenus() {
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
      setCloudMenuEnabled(true);
      setCloudSyncStatus("已刷新我的家里保存的今晚菜单和一周计划。");
      showNotice("云端菜单已刷新");
    } catch (error) {
      setCloudSyncStatus(error.message);
    } finally {
      setCloudMenuLoading(false);
    }
  }

  async function migrateGroceryToCloud() {
    if (!family?.id) {
      setCloudGroceryStatus("请先登录并创建家庭空间。");
      return;
    }

    setCloudGroceryLoading(true);
    setCloudGroceryStatus("正在迁移食材清单和库存...");
    try {
      await migrateLocalGroceryToCloud({
        familyId: family.id,
        customItems,
        checkedItems,
        excludedGroceryKeys,
        pantryItems,
      });
      setCloudGroceryEnabled(true);
      setCloudGroceryStatus("本地食材清单和厨房库存已迁移到家庭空间。");
      showNotice("食材清单已迁移到云端");
    } catch (error) {
      setCloudGroceryStatus(error.message);
    } finally {
      setCloudGroceryLoading(false);
    }
  }

  async function refreshCloudGrocery() {
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
      setCloudGroceryStatus("已刷新云端食材清单和厨房库存。");
      showNotice("云端食材清单已刷新");
    } catch (error) {
      setCloudGroceryStatus(error.message);
    } finally {
      setCloudGroceryLoading(false);
    }
  }

  const cloudMenuProps = {
    family,
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
    setFamilyProfile(nextProfile);
    trackProductEvent(appEvents.profileSaved, {
      type: "family_profile",
      completedCount: getFamilyProfileCompletedCount(nextProfile),
    });
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <DoodleWash />
      <OfflineStatus online={online} />
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:py-6">
        <Sidebar activeView={activeView} onChange={setActiveView} />
        <main className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
          {activeView !== "dashboard" && (
            <Topbar
              activeView={activeView}
              query={query}
              setQuery={setQuery}
              session={session}
              onOpenUserCenter={() => setActiveView("user")}
            />
          )}
          <div key={activeView} className="view-enter">
            {activeView === "dashboard" && (
              <Dashboard
                todayRecipes={todayRecipes}
                recommendation={displayedRecommendation}
                aiRecommendationStatus={aiRecommendationStatus}
                aiRecommendationLoading={aiRecommendationLoading}
                onViewChange={setActiveView}
                onOpenRecipe={openRecipe}
                onAddRecommended={addRecommendedToday}
                onRequestAiRecommendation={requestAiRecommendation}
                onOpenRecommendationFeedback={() => setRecommendationFeedbackOpen(true)}
                feedbackOpen={recommendationFeedbackOpen}
                onSubmitRecommendationFeedback={(reason) => requestAiRecommendation(reason)}
                onCloseRecommendationFeedback={() => setRecommendationFeedbackOpen(false)}
                session={session}
                onOpenUserCenter={() => setActiveView("user")}
              />
            )}
            {activeView === "library" && (
              <Library
                categories={categories}
                category={category}
                setCategory={setCategory}
                recipes={filteredRecipes}
                onAdd={addToday}
                onUpdateQuantity={updateTodayQuantity}
                menuQuantities={todayMenu}
                onOpenRecipe={openRecipe}
                onDragStart={setDraggedRecipeId}
              />
            )}
            {activeView === "planner" && (
              <Planner
                weekPlan={weekPlan}
                draggedRecipeId={draggedRecipeId}
                onAssign={assignPlan}
                onRemove={removePlanRecipe}
                onShare={shareWeekPlan}
                cloudSync={{
                  family,
                  enabled: cloudMenuEnabled,
                  loading: cloudMenuLoading,
                  status: cloudSyncStatus,
                  onMigrate: migrateMenusToCloud,
                  onRefresh: refreshCloudMenus,
                  onOpenUserCenter: () => setActiveView("user"),
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
                onViewChange={setActiveView}
                onShare={shareTodayMenu}
                cloudSync={{
                  family,
                  enabled: cloudMenuEnabled,
                  loading: cloudMenuLoading,
                  status: cloudSyncStatus,
                  onMigrate: migrateMenusToCloud,
                  onRefresh: refreshCloudMenus,
                  onOpenUserCenter: () => setActiveView("user"),
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
                pantryItems={pantryItems}
                pantryExpirySummary={pantryExpirySummary}
                newPantryItem={newPantryItem}
                setNewPantryItem={setNewPantryItem}
                newPantryAmount={newPantryAmount}
                setNewPantryAmount={setNewPantryAmount}
                newPantryExpiresOn={newPantryExpiresOn}
                setNewPantryExpiresOn={setNewPantryExpiresOn}
                onAddCustomItem={addCustomItem}
                onRemoveCustomItem={removeCustomItem}
                onAddPantryItem={addPantryItem}
                onRemovePantryItem={removePantryItem}
                onExcludeItem={excludeGroceryItem}
                onRestoreItem={restoreGroceryItem}
                onRestoreAllItems={restoreAllGroceryItems}
                onMarkPantryItemsOwned={markPantryItemsOwned}
                excludedItems={excludedGroceryItems}
                onShare={shareGroceryList}
                checkedItems={checkedItems}
                setCheckedItems={setCheckedItems}
                cloudSync={{
                  family,
                  enabled: cloudGroceryEnabled,
                  loading: cloudGroceryLoading,
                  status: cloudGroceryStatus,
                  onMigrate: migrateGroceryToCloud,
                  onRefresh: refreshCloudGrocery,
                }}
                onOpenUserCenter={() => setActiveView("user")}
                onOpenInventory={() => setActiveView("inventory")}
                onOpenStats={() => setActiveView("stats")}
              />
            )}
            {activeView === "inventory" && (
              <InventoryPage
                pantryItems={pantryItems}
                pantryExpirySummary={pantryExpirySummary}
                newPantryItem={newPantryItem}
                setNewPantryItem={setNewPantryItem}
                newPantryAmount={newPantryAmount}
                setNewPantryAmount={setNewPantryAmount}
                newPantryExpiresOn={newPantryExpiresOn}
                setNewPantryExpiresOn={setNewPantryExpiresOn}
                onAddPantryItem={addPantryItem}
                onRemovePantryItem={removePantryItem}
                onShare={shareInventorySummary}
                cloudSync={{
                  family,
                  enabled: cloudGroceryEnabled,
                  loading: cloudGroceryLoading,
                  status: cloudGroceryStatus,
                  onMigrate: migrateGroceryToCloud,
                  onRefresh: refreshCloudGrocery,
                }}
                onOpenUserCenter={() => setActiveView("user")}
              />
            )}
            {activeView === "stats" && (
              <StatsPage
                todayRecipes={todayRecipes}
                plannedRecipes={plannedRecipes}
                groceryItems={visibleGroceryItems}
                weekPlan={weekPlan}
                mealCalendar={mealCalendar}
                onViewChange={setActiveView}
              />
            )}
            {activeView === "user" && (
              <UserCenter
                authProps={authProps}
                cloudMenuProps={cloudMenuProps}
                preferenceProps={preferenceProps}
                session={session}
                family={family}
                familyProfile={familyProfile}
                setFamilyProfile={saveFamilyProfile}
              />
            )}
          </div>
        </main>
      </div>
      <MobileTabbar activeView={activeView} onChange={setActiveView} />
      {notice && (
        <div className="toast-enter fixed left-1/2 top-5 z-[70] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-black text-white shadow-lift">
          {notice}
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

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function orderPlanDaysFrom(startDay) {
  const startIndex = Math.max(weekPlanDays.indexOf(startDay), 0);
  return [...weekPlanDays.slice(startIndex), ...weekPlanDays.slice(0, startIndex)];
}

function getFamilyProfileCompletedCount(profile = {}) {
  return [
    profile.familySize,
    profile.tastePreferences?.length,
    profile.goals?.length,
    profile.dislikes?.length || profile.allergies?.length,
    profile.shoppingTolerance,
  ].filter(Boolean).length;
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

function formatInventoryShareSection(title, items) {
  if (items.length === 0) return `${title}\n- 无`;
  return `${title}\n${items.map((item) => `- ${item.name}${item.amount ? ` ${item.amount}` : ""}${item.expiresOn ? ` 到期 ${item.expiresOn}` : ""}`).join("\n")}`;
}

function buildCompactFamilyPrompt(profile = {}) {
  const parts = [
    `${profile.familySize ?? 2}人吃饭`,
    profile.hasChildren ? "有孩子一起吃" : "",
    listPart("口味", profile.tastePreferences),
    listPart("目标", profile.goals),
    listPart("不喜欢", profile.dislikes),
    listPart("不能吃", profile.allergies),
    shoppingToleranceLabel(profile.shoppingTolerance),
  ].filter(Boolean);
  return parts.join("；");
}

function listPart(label, values = []) {
  return Array.isArray(values) && values.length > 0 ? `${label}:${values.join("、")}` : "";
}

function shoppingToleranceLabel(value) {
  if (value === "low") return "少买菜，优先用库存";
  if (value === "high") return "愿意专门买菜";
  return "可买2-3样主食材";
}


createRoot(document.getElementById("root")).render(<App />);

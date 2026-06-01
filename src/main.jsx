import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthLanding } from "./components/AuthLanding";
import { CalendarPage } from "./components/CalendarPage";
import { Dashboard } from "./components/Dashboard";
import { GroceryList } from "./components/GroceryList";
import { Library } from "./components/Library";
import { Planner } from "./components/Planner";
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
import {
  createDefaultWeekPlan,
  createInitialMealCalendar,
  getRecipe,
  recipes,
} from "./lib/recipes";
import { buildTodayRecommendation } from "./lib/recommendation/rules";
import { explainRecommendation } from "./lib/supabase/aiExplanation";
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

registerServiceWorker();

function App() {
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
  const [guestMode, setGuestMode] = useLocalStorageState("familyos:guest-mode", false);
  const [cloudMenuEnabled, setCloudMenuEnabled] = useLocalStorageState("familyos:cloud-menu-enabled", false);
  const [cloudMenuLoading, setCloudMenuLoading] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState("家庭空间创建后，可把本地菜单迁移到云端。");
  const [cloudGroceryEnabled, setCloudGroceryEnabled] = useLocalStorageState("familyos:cloud-grocery-enabled", false);
  const [cloudGroceryLoading, setCloudGroceryLoading] = useState(false);
  const [cloudGroceryStatus, setCloudGroceryStatus] = useState("菜单同步后，可继续迁移食材清单和库存。");
  const [familyMembers, setFamilyMembers] = useState([]);
  const [preferenceDraft, setPreferenceDraft] = useState({});
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesStatus, setPreferencesStatus] = useState("创建家庭空间后，可维护家庭成员偏好。");
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiExplanationStatus, setAiExplanationStatus] = useState("AI 解释会在 Edge Function 配置后启用。");
  const [aiExplanationLoading, setAiExplanationLoading] = useState(false);
  const isMobileViewport = useIsMobileViewport();

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
        setCloudSyncStatus("已从云端读取今日菜单和一周计划。");
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
        setCloudSyncStatus("今日菜单已同步到家庭空间。");
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
        setCloudSyncStatus("一周计划已同步到家庭空间。");
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
        setCloudGroceryStatus("食材清单和厨房库存已同步到家庭空间。");
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
    ...todayMenu.map((item) => ({ ...item, source: "今日菜单" })),
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
    setAiExplanationStatus("AI 解释会在 Edge Function 配置后启用。");
  }, [todayRecommendation.title]);

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(""), 1800);
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
      showNotice(`${recipe?.name ?? "菜品"} 已加入今日菜单和${currentDay}计划`);
      return;
    }
    showNotice(`${recipe?.name ?? "菜品"} 已加入今日菜单`);
  }

  function addRecommendedToday() {
    const recommendedIds = todayRecommendation.recipes
      .map((recipe) => recipe.id)
      .filter((recipeId) => !todayMenu.some((item) => item.recipeId === recipeId));

    if (recommendedIds.length === 0) {
      showNotice("推荐菜品已在今日菜单中");
      return;
    }

    recommendedIds.forEach(addToday);
    showNotice(`已加入 ${recommendedIds.length} 道推荐菜`);
  }

  async function requestAiExplanation() {
    setAiExplanationLoading(true);
    setAiExplanationStatus("正在生成 AI 解释...");
    try {
      const text = await explainRecommendation(todayRecommendation);
      setAiExplanation(text);
      setAiExplanationStatus("AI 解释已生成。");
    } catch (error) {
      setAiExplanation(todayRecommendation.reason);
      setAiExplanationStatus(`${error.message} 已回退到规则解释。`);
    } finally {
      setAiExplanationLoading(false);
    }
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

  function excludeGroceryItem(key) {
    setExcludedGroceryKeys((current) => (current.includes(key) ? current : [...current, key]));
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
    try {
      if (navigator.share) {
        await navigator.share({ title: "家庭菜单食材清单", text });
        showNotice("清单已打开分享面板");
        return;
      }
      await navigator.clipboard.writeText(text);
      showNotice("食材清单已复制");
    } catch {
      showNotice("分享失败，可稍后重试");
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
      const nextSession =
        mode === "signup"
          ? await signUpWithPassword({ email, password: authPassword })
          : await signInWithPassword({ email, password: authPassword });
      setSession(nextSession);
      if (nextSession?.user) {
        const currentFamily = await loadPrimaryFamily(nextSession.user);
        setFamily(currentFamily);
      }
      setAuthStatus(
        mode === "signup"
          ? "账号已创建。如果项目要求邮箱确认，请先去邮箱点确认链接。"
          : "已登录 FamilyOS。",
      );
      showNotice(mode === "signup" ? "账号已创建" : "已登录 FamilyOS");
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
      setGuestMode(false);
      setCloudMenuEnabled(false);
      setCloudGroceryEnabled(false);
      setFamilyMembers([]);
      setPreferenceDraft({});
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
      showNotice("成员偏好已保存");
      await loadPreferencesForFamily();
    } catch (error) {
      setPreferencesStatus(error.message);
    } finally {
      setPreferencesLoading(false);
    }
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
      setCloudSyncStatus("本地今日菜单和一周计划已迁移到家庭空间。");
      showNotice("菜单已迁移到云端");
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
      setCloudSyncStatus("已刷新云端今日菜单和一周计划。");
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
    onDraftChange: updatePreferenceDraft,
    onSavePreference: savePreference,
    onRefreshPreferences: () => loadPreferencesForFamily(),
  };

  if (isMobileViewport && !session?.user && !guestMode) {
    return (
      <>
        <DoodleWash />
        <OfflineStatus online={online} />
        <AuthLanding
          authProps={authProps}
          onContinueGuest={() => {
            setGuestMode(true);
            showNotice("已进入本地体验模式");
          }}
        />
        {notice && (
          <div className="fixed left-1/2 top-5 z-[70] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-black text-white shadow-lift">
            {notice}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <DoodleWash />
      <OfflineStatus online={online} />
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:py-6">
        <Sidebar activeView={activeView} onChange={setActiveView} />
        <main className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Topbar query={query} setQuery={setQuery} />
          {activeView === "dashboard" && (
            <Dashboard
              todayRecipes={todayRecipes}
              weekPlan={weekPlan}
              groceryItems={groceryItems}
              pantryItems={pantryItems}
              pantryExpirySummary={pantryExpirySummary}
              recommendation={todayRecommendation}
              familyMembers={familyMembers}
              aiExplanation={aiExplanation}
              aiExplanationStatus={aiExplanationStatus}
              aiExplanationLoading={aiExplanationLoading}
              onViewChange={setActiveView}
              onOpenRecipe={openRecipe}
              onAddRecommended={addRecommendedToday}
              onRequestAiExplanation={requestAiExplanation}
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
            />
          )}
          {activeView === "stats" && (
            <StatsPage
              todayRecipes={todayRecipes}
              plannedRecipes={plannedRecipes}
              groceryItems={visibleGroceryItems}
              weekPlan={weekPlan}
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
            />
          )}
        </main>
      </div>
      <MobileTabbar activeView={activeView} onChange={setActiveView} />
      {notice && (
        <div className="fixed left-1/2 top-5 z-[70] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-black text-white shadow-lift">
          {notice}
        </div>
      )}
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

function getExpiryState(expiresOn) {
  if (!expiresOn) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiresOn}T00:00:00`);
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 3) return "soon";
  return "fresh";
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobile(query.matches);
    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

createRoot(document.getElementById("root")).render(<App />);

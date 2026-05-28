import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarPage } from "./components/CalendarPage";
import { Dashboard } from "./components/Dashboard";
import { GroceryList } from "./components/GroceryList";
import { Library } from "./components/Library";
import { Planner } from "./components/Planner";
import { RecipeDetailDrawer } from "./components/RecipeDetailDrawer";
import { Sidebar, MobileTabbar, Topbar } from "./components/AppShell";
import { StatsPage } from "./components/StatsPage";
import { TodayMenu } from "./components/TodayMenu";
import { DoodleWash } from "./components/ui/Doodles";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { formatDateKey, formatDateLabel, getCurrentPlanDay } from "./lib/date";
import {
  buildRecipeGroceryGroups,
  buildShoppingListFromEntries,
  formatShareText,
} from "./lib/grocery";
import {
  createDefaultWeekPlan,
  createInitialMealCalendar,
  getRecipe,
  recipes,
} from "./lib/recipes";
import "./styles.css";

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
  const [excludedGroceryKeys, setExcludedGroceryKeys] = useLocalStorageState(
    "family-menu:excluded-grocery-keys",
    [],
  );
  const [draggedRecipeId, setDraggedRecipeId] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [cookingStep, setCookingStep] = useState(0);
  const [notice, setNotice] = useState("");

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
  const visibleGroceryGroups = useMemo(
    () =>
      groceryGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !excludedGrocerySet.has(item.hiddenKey)),
        }))
        .filter((group) => group.items.length > 0),
    [excludedGrocerySet, groceryGroups],
  );
  const visibleGroceryItems = useMemo(
    () => groceryItems.filter((item) => !excludedGrocerySet.has(item.hiddenKey)),
    [excludedGrocerySet, groceryItems],
  );
  const excludedGroceryItems = useMemo(
    () => groceryItems.filter((item) => excludedGrocerySet.has(item.hiddenKey)),
    [excludedGrocerySet, groceryItems],
  );

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

  function excludeGroceryItem(key) {
    setExcludedGroceryKeys((current) => (current.includes(key) ? current : [...current, key]));
  }

  function restoreGroceryItem(key) {
    setExcludedGroceryKeys((current) => current.filter((itemKey) => itemKey !== key));
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

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <DoodleWash />
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] gap-6 px-4 py-4 md:px-6 lg:py-6">
        <Sidebar activeView={activeView} onChange={setActiveView} />
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          <Topbar query={query} setQuery={setQuery} />
          {activeView === "dashboard" && (
            <Dashboard
              todayRecipes={todayRecipes}
              weekPlan={weekPlan}
              groceryItems={groceryItems}
              onViewChange={setActiveView}
              onOpenRecipe={openRecipe}
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
            />
          )}
          {activeView === "today" && (
            <TodayMenu
              todayRecipes={todayRecipes}
              groceryItems={visibleGroceryItems}
              onUpdateQuantity={updateTodayQuantity}
              onOpenRecipe={openRecipe}
              onViewChange={setActiveView}
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
              onRestoreAllItems={() => setExcludedGroceryKeys([])}
              excludedItems={excludedGroceryItems}
              onShare={shareGroceryList}
              checkedItems={checkedItems}
              setCheckedItems={setCheckedItems}
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

createRoot(document.getElementById("root")).render(<App />);

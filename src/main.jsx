import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChefHat,
  Clock3,
  Copy,
  Heart,
  Home,
  ListChecks,
  Minus,
  Plus,
  Search,
  Settings,
  Share2,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import recipes from "../data/recipes.json";
import "./styles.css";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "library", label: "菜单库", icon: ChefHat },
  { id: "planner", label: "一周计划", icon: CalendarDays },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "grocery", label: "食材清单", icon: ShoppingBasket },
  { id: "stats", label: "统计", icon: BarChart3 },
];

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const calendarWeekdays = ["日", "一", "二", "三", "四", "五", "六"];

const familyMembers = [
  { name: "Alex", note: "低油、偏清淡", mood: "Clean" },
  { name: "Mia", note: "爱吃番茄和鸡蛋", mood: "Comfort" },
  { name: "Noah", note: "少辣、高蛋白", mood: "Fit" },
];

const photoByAccent = {
  tomato:
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
  green:
    "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80",
  soup:
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80",
  broccoli:
    "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=900&q=80",
  meat:
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80",
  spicy:
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  fresh:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
  soup2:
    "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?auto=format&fit=crop&w=900&q=80",
  rice:
    "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80",
  eggplant:
    "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
};

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [todayMenu, setTodayMenu] = useState([]);
  const [weekPlan, setWeekPlan] = useState(() => ({
    周一: [recipes[0].id, recipes[1].id],
    周二: [recipes[4].id, recipes[6].id],
    周三: [recipes[10].id, recipes[11].id],
    周四: [recipes[12].id],
    周五: [recipes[15].id, recipes[16].id],
    周六: [recipes[20].id, recipes[21].id],
    周日: [recipes[24].id],
  }));
  const [mealCalendar, setMealCalendar] = useState(() => createInitialMealCalendar());
  const [checkedItems, setCheckedItems] = useState({});
  const [customItems, setCustomItems] = useState([]);
  const [newCustomItem, setNewCustomItem] = useState("");
  const [excludedGroceryKeys, setExcludedGroceryKeys] = useState([]);
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
          items: group.items.filter((item) => !excludedGrocerySet.has(item.key)),
        }))
        .filter((group) => group.items.length > 0),
    [excludedGrocerySet, groceryGroups],
  );
  const visibleGroceryItems = useMemo(
    () => groceryItems.filter((item) => !excludedGrocerySet.has(item.key)),
    [excludedGrocerySet, groceryItems],
  );
  const excludedGroceryItems = useMemo(
    () => groceryGroups.flatMap((group) => group.items.filter((item) => excludedGrocerySet.has(item.key))),
    [excludedGrocerySet, groceryGroups],
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

function Sidebar({ activeView, onChange }) {
  return (
    <aside className="sticky top-6 hidden h-[calc(100vh-48px)] w-72 shrink-0 flex-col rounded-[28px] border border-line/80 bg-white/78 p-5 shadow-card backdrop-blur-xl lg:flex">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-acid">
          <ChefHat size={22} />
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em]">Family</p>
          <p className="-mt-1 text-2xl font-black tracking-tight">Menu</p>
        </div>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`group flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left text-sm font-bold transition ${
                active ? "bg-ink text-white" : "text-ink/62 hover:bg-ink/[0.04] hover:text-ink"
              }`}
            >
              <Icon size={19} className={active ? "text-acid" : "text-ink/48 group-hover:text-ink"} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-[24px] border border-line bg-canvas p-4">
        <DoodlePot />
        <p className="mt-4 text-sm font-black">Smart pantry beta</p>
        <p className="mt-1 text-xs leading-5 text-ink/52">
          当前版本用 30 道菜测试菜单、计划和购物清单体验。
        </p>
      </div>
    </aside>
  );
}

function Topbar({ query, setQuery }) {
  return (
    <header className="mb-5 flex flex-col gap-4 lg:mb-7 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-ink/45">
          <span className="h-2 w-2 rounded-full bg-acid" />
          Urban family kitchen
        </div>
        <h1 className="mt-2 max-w-3xl text-5xl font-black tracking-[-0.04em] md:text-7xl">
          Eat well, plan lightly.
        </h1>
      </div>
      <div className="flex items-center gap-3 rounded-[22px] border border-line bg-white px-4 py-3 shadow-card lg:w-[390px]">
        <Search size={18} className="text-ink/38" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-ink/35"
          placeholder="搜索菜名、食材、标签"
        />
        <div className="hidden h-9 w-9 place-items-center rounded-full bg-ink text-xs font-black text-white sm:grid">
          H
        </div>
      </div>
    </header>
  );
}

function Dashboard({ todayRecipes, weekPlan, groceryItems, onViewChange, onOpenRecipe }) {
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
            : "先去菜单库选一道菜，系统会同步到今日菜单、今天计划和食材清单。"}
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {todayRecipes.length > 0 ? (
            todayRecipes.map((recipe) => (
              <MiniMeal key={recipe.id} recipe={recipe} dark onClick={() => onOpenRecipe(recipe.id)} />
            ))
          ) : (
            <button
              type="button"
              onClick={() => onViewChange("library")}
              className="flex min-h-24 items-center justify-center rounded-[22px] border border-white/12 bg-white/8 px-5 text-sm font-black text-white transition hover:bg-white/12 md:col-span-2"
            >
              去菜单库添加今日第一道菜
            </button>
          )}
        </div>
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

      <section className="grid gap-5 xl:col-span-2 xl:grid-cols-[0.85fr_1.15fr]">
        <button
          type="button"
          onClick={() => onViewChange("stats")}
          className="rounded-[20px] border border-line bg-white p-5 text-left shadow-card transition hover:-translate-y-1 hover:shadow-lift"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Dining stats</p>
              <h3 className="card-title">饮食统计</h3>
            </div>
            <BarChart3 size={22} />
          </div>
          <div className="mt-7 grid grid-cols-3 gap-3">
            <Stat label="蔬菜" value="42%" />
            <Stat label="蛋白质" value="31%" />
            <Stat label="汤粥" value="18%" />
          </div>
        </button>
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

function Library({
  categories,
  category,
  setCategory,
  recipes: visibleRecipes,
  onAdd,
  onUpdateQuantity,
  menuQuantities,
  onOpenRecipe,
  onDragStart,
}) {
  const quantityByRecipe = Object.fromEntries(menuQuantities.map((item) => [item.recipeId, item.quantity]));

  return (
    <section>
      <div className="mb-5 flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${
              category === item
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink/58 hover:border-ink/20 hover:text-ink"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visibleRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onAdd={onAdd}
            onUpdateQuantity={onUpdateQuantity}
            quantity={quantityByRecipe[recipe.id] ?? 0}
            onOpen={onOpenRecipe}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </section>
  );
}

function RecipeCard({ recipe, onAdd, onUpdateQuantity, quantity, onOpen, onDragStart }) {
  return (
    <article
      draggable
      onDragStart={() => onDragStart(recipe.id)}
      onClick={() => onOpen(recipe.id)}
      className="group cursor-pointer overflow-hidden rounded-[20px] border border-line bg-white shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative h-52 overflow-hidden">
        <img
          src={photoFor(recipe)}
          alt={recipe.name}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute left-4 top-4 rounded-full bg-white/88 px-3 py-1 text-xs font-black backdrop-blur">
          {recipe.categories[0]}
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.03em]">{recipe.name}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink/56">{recipe.description}</p>
          </div>
          {quantity > 0 ? (
            <div
              className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas p-1"
              onClick={(event) => event.stopPropagation()}
              aria-label={`${recipe.name} 已加入 ${quantity} 份`}
            >
              <button
                type="button"
                onClick={() => onUpdateQuantity(recipe.id, -1)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink transition hover:bg-ink hover:text-white"
                aria-label={`减少 ${recipe.name}`}
              >
                <Minus size={16} />
              </button>
              <span className="min-w-7 text-center text-sm font-black">{quantity}</span>
              <button
                type="button"
                onClick={() => onUpdateQuantity(recipe.id, 1)}
                className="grid h-9 w-9 place-items-center rounded-full bg-acid text-ink transition hover:scale-105"
                aria-label={`增加 ${recipe.name}`}
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAdd(recipe.id);
              }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-acid text-ink transition hover:scale-105"
              aria-label={`加入 ${recipe.name}`}
            >
              <Plus size={20} />
            </button>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black text-ink/58">
          <span className="pill">
            <Clock3 size={14} />
            {recipe.timeMinutes} min
          </span>
          <span className="pill">{recipe.difficulty}</span>
          <span className="pill">{recipe.servings} 人份</span>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(recipe.id);
          }}
          className="mt-5 w-full rounded-full border border-ink/10 bg-ink px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5"
        >
          {quantity > 0 ? `今日菜单 ${quantity} 份 · 查看详情` : "查看详情"}
        </button>
      </div>
    </article>
  );
}

function Planner({ weekPlan, draggedRecipeId, onAssign, onRemove }) {
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id ?? "");
  const [pickerDay, setPickerDay] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const selectedRecipe = getRecipe(selectedRecipeId);
  const currentDay = getCurrentPlanDay();
  const pickerRecipes = recipes.filter((recipe) => {
    const keyword = pickerQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [recipe.name, recipe.description, ...recipe.categories, ...recipe.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  function addSelectedRecipe() {
    if (!selectedDay || !selectedRecipeId) return;
    onAssign(selectedDay, selectedRecipeId);
  }

  function openPicker(day) {
    setPickerDay(day);
    setPickerQuery("");
  }

  function closePicker() {
    setPickerDay(null);
    setPickerQuery("");
  }

  function chooseRecipe(recipeId) {
    if (!pickerDay) return;
    onAssign(pickerDay, recipeId);
    closePicker();
  }

  return (
    <section className="grid gap-5">
      <Card>
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow">Weekly planning</p>
            <h3 className="card-title">快速安排</h3>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/55">
              今天是{currentDay}。从菜单库第一次加入今日菜单时，会自动同步到{currentDay}计划；你也可以在下面每一天点“添加菜品”单独安排。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => openPicker(day)}
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${
                    day === currentDay
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-canvas text-ink/58 hover:border-ink/20 hover:text-ink"
                  }`}
                >
                  {day}加菜
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-line bg-canvas p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/38">Quick add</p>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-black text-ink/42">菜品</span>
                <select
                  value={selectedRecipeId}
                  onChange={(event) => setSelectedRecipeId(event.target.value)}
                  className="h-12 rounded-full border border-line bg-white px-4 text-sm font-black outline-none focus:border-ink/30"
                >
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(event.target.value)}
                  className="h-12 rounded-full border border-line bg-white px-4 text-sm font-black outline-none focus:border-ink/30"
                >
                  {days.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addSelectedRecipe}
                  className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
                >
                  <Plus size={16} className="text-acid" />
                  添加
                </button>
              </div>
            </div>
            {selectedRecipe && (
              <div className="mt-3 flex items-center gap-3 rounded-[18px] bg-white p-2">
                <img src={photoFor(selectedRecipe)} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                <div>
                  <p className="text-sm font-black">{selectedRecipe.name}</p>
                  <p className="text-xs font-bold text-ink/45">
                    {selectedRecipe.timeMinutes} min · {selectedRecipe.difficulty}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4">
        {days.map((day) => {
          const dayRecipes = (weekPlan[day] ?? []).map((id) => getRecipe(id)).filter(Boolean);
          return (
            <div
              key={day}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => draggedRecipeId && onAssign(day, draggedRecipeId)}
              className="grid gap-4 rounded-[24px] border border-line bg-white p-4 shadow-card transition hover:border-ink/20 md:grid-cols-[132px_1fr]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-ink/38">{day}</p>
                  {day === currentDay && (
                    <span className="rounded-full bg-acid px-2 py-1 text-[10px] font-black">今天</span>
                  )}
                </div>
                <p className="mt-2 text-xs font-bold text-ink/42">
                  {dayRecipes.length} 道菜
                </p>
                <button
                  type="button"
                  onClick={() => openPicker(day)}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-ink px-3 text-xs font-black text-white transition hover:-translate-y-0.5"
                >
                  <Plus size={14} className="text-acid" />
                  添加菜品
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {dayRecipes.length > 0 ? (
                  dayRecipes.map((recipe) => (
                    <div key={`${day}-${recipe.id}`} className="relative">
                      <MiniMeal recipe={recipe} />
                      <button
                        type="button"
                        onClick={() => onRemove(day, recipe.id)}
                        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow-card"
                        aria-label={`移除 ${recipe.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[20px] bg-canvas p-4 text-sm font-bold text-ink/45">
                    未安排。点击左侧“添加菜品”开始计划，也可以拖一道菜到这里。
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pickerDay && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-ink/38 backdrop-blur-sm"
            aria-label="关闭添加菜品"
            onClick={closePicker}
          />
          <aside className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-hidden rounded-t-[30px] bg-canvas shadow-lift md:inset-y-6 md:left-auto md:right-6 md:w-[520px] md:rounded-[30px]">
            <div className="border-b border-line bg-white/90 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">{pickerDay}</p>
                  <h3 className="card-title">添加菜品</h3>
                  <p className="mt-2 text-sm font-bold text-ink/50">选择一道菜加入这一天的计划。</p>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink"
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-3">
                <Search size={17} className="text-ink/38" />
                <input
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                  placeholder="搜索菜名、分类或口味"
                />
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-5">
              <div className="grid gap-3">
                {pickerRecipes.map((recipe) => {
                  const alreadyAdded = (weekPlan[pickerDay] ?? []).includes(recipe.id);
                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => chooseRecipe(recipe.id)}
                      disabled={alreadyAdded}
                      className="flex items-center gap-3 rounded-[20px] border border-line bg-white p-3 text-left transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <img src={photoFor(recipe)} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-black">{recipe.name}</span>
                        <span className="mt-1 block text-xs font-bold text-ink/45">
                          {recipe.timeMinutes} min · {recipe.difficulty} · {recipe.categories[0]}
                        </span>
                      </span>
                      <span className={`rounded-full px-3 py-2 text-xs font-black ${
                        alreadyAdded ? "bg-canvas text-ink/45" : "bg-acid text-ink"
                      }`}>
                        {alreadyAdded ? "已添加" : "加入"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function CalendarPage({ mealCalendar, onAssign, onRemove, onOpenRecipe }) {
  const todayKey = formatDateKey(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [visibleMonthKey, setVisibleMonthKey] = useState(todayKey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const visibleMonthDate = parseDateKey(visibleMonthKey);
  const calendarDates = useMemo(() => getCalendarMonthDates(visibleMonthDate), [visibleMonthKey]);
  const selectedRecipeIds = mealCalendar[selectedDateKey] ?? [];
  const selectedRecipes = selectedRecipeIds.map((id) => getRecipe(id)).filter(Boolean);
  const selectedIsPast = selectedDateKey < todayKey;
  const selectedIsToday = selectedDateKey === todayKey;
  const pickerRecipes = recipes.filter((recipe) => {
    const keyword = pickerQuery.trim().toLowerCase();
    if (!keyword) return true;
    return [recipe.name, recipe.description, ...recipe.categories, ...recipe.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });

  function openPicker() {
    setPickerOpen(true);
    setPickerQuery("");
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerQuery("");
  }

  function chooseRecipe(recipeId) {
    onAssign(selectedDateKey, recipeId);
    closePicker();
  }

  function changeMonth(delta) {
    const nextMonth = addMonths(visibleMonthDate, delta);
    setVisibleMonthKey(formatDateKey(nextMonth));
  }

  function selectDate(dateKey) {
    setSelectedDateKey(dateKey);
    setVisibleMonthKey(dateKey);
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Meal calendar</p>
            <h3 className="card-title">{formatMonthTitle(visibleMonthKey)}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-canvas transition hover:bg-ink hover:text-white"
              aria-label="上个月"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDateKey(todayKey);
                setVisibleMonthKey(todayKey);
              }}
              className="rounded-full bg-acid px-4 py-2 text-xs font-black"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-canvas transition hover:bg-ink hover:text-white"
              aria-label="下个月"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarWeekdays.map((weekday) => (
            <div key={weekday} className="py-2 text-center text-xs font-black text-ink/35">
              {weekday}
            </div>
          ))}
          {calendarDates.map((date) => {
            const dateKey = formatDateKey(date);
            const itemCount = mealCalendar[dateKey]?.length ?? 0;
            const isSelected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;
            const isPast = dateKey < todayKey;
            const isCurrentMonth = date.getMonth() === parseDateKey(selectedDateKey).getMonth();
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => selectDate(dateKey)}
                className={`min-h-[88px] rounded-[18px] border p-3 text-left transition hover:-translate-y-0.5 ${
                  isSelected
                    ? "border-ink bg-ink text-white shadow-lift"
                    : "border-line bg-white text-ink hover:border-ink/20"
                } ${!isCurrentMonth ? "opacity-35" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-black">{date.getDate()}</span>
                  {isToday && (
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                      isSelected ? "bg-acid text-ink" : "bg-acid text-ink"
                    }`}>
                      今天
                    </span>
                  )}
                </div>
                <p className={`mt-3 text-xs font-bold ${isSelected ? "text-white/58" : "text-ink/42"}`}>
                  {isPast ? "记录" : "计划"} · {itemCount} 道菜
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5">
        <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <div className="bg-ink p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-acid">
              {selectedIsPast ? "History" : "Planning"}
            </p>
            <h3 className="mt-2 text-3xl font-black tracking-[-0.04em]">
              {formatDateLabel(selectedDateKey)}
            </h3>
            <p className="mt-2 text-sm font-bold text-white/55">
              {selectedIsPast
                ? "过去日期展示饮食记录，不再编辑。"
                : selectedIsToday
                  ? "今天可以继续补充菜单，也会影响食材清单。"
                  : "未来日期可以提前规划食谱。"}
            </p>
          </div>

          <div className="grid gap-3 p-5">
            {selectedRecipes.length > 0 ? (
              selectedRecipes.map((recipe) => (
                <div key={`${selectedDateKey}-${recipe.id}`} className="relative">
                  <MiniMeal recipe={recipe} onClick={() => onOpenRecipe(recipe.id)} />
                  {!selectedIsPast && (
                    <button
                      type="button"
                      onClick={() => onRemove(selectedDateKey, recipe.id)}
                      className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink shadow-card"
                      aria-label={`移除 ${recipe.name}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-[22px] bg-canvas p-5 text-sm font-bold leading-6 text-ink/50">
                {selectedIsPast ? "这一天还没有饮食记录。" : "这一天还没有规划菜品。"}
              </div>
            )}

            {!selectedIsPast && (
              <button
                type="button"
                onClick={openPicker}
                className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
              >
                <Plus size={17} />
                为这一天添加菜品
              </button>
            )}
          </div>
        </section>

        <Card>
          <p className="eyebrow">How it works</p>
          <h3 className="card-title">日历规则</h3>
          <div className="mt-4 grid gap-3 text-sm font-bold leading-6 text-ink/55">
            <p>点击过去日期：查看当天饮食记录。</p>
            <p>点击今天或未来日期：提前规划菜品。</p>
            <p>当前版本先使用本地测试数据，后续接数据库后会保存真实历史。</p>
          </div>
        </Card>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-ink/38 backdrop-blur-sm"
            aria-label="关闭添加菜品"
            onClick={closePicker}
          />
          <aside className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-hidden rounded-t-[30px] bg-canvas shadow-lift md:inset-y-6 md:left-auto md:right-6 md:w-[520px] md:rounded-[30px]">
            <div className="border-b border-line bg-white/90 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">{formatDateLabel(selectedDateKey)}</p>
                  <h3 className="card-title">规划食谱</h3>
                  <p className="mt-2 text-sm font-bold text-ink/50">选择一道菜加入这一天。</p>
                </div>
                <button
                  type="button"
                  onClick={closePicker}
                  className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-ink"
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-full border border-line bg-canvas px-4 py-3">
                <Search size={17} className="text-ink/38" />
                <input
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                  placeholder="搜索菜名、分类或口味"
                />
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-5">
              <div className="grid gap-3">
                {pickerRecipes.map((recipe) => {
                  const alreadyAdded = selectedRecipeIds.includes(recipe.id);
                  return (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => chooseRecipe(recipe.id)}
                      disabled={alreadyAdded}
                      className="flex items-center gap-3 rounded-[20px] border border-line bg-white p-3 text-left transition hover:border-ink/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <img src={photoFor(recipe)} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-black">{recipe.name}</span>
                        <span className="mt-1 block text-xs font-bold text-ink/45">
                          {recipe.timeMinutes} min · {recipe.difficulty} · {recipe.categories[0]}
                        </span>
                      </span>
                      <span className={`rounded-full px-3 py-2 text-xs font-black ${
                        alreadyAdded ? "bg-canvas text-ink/45" : "bg-acid text-ink"
                      }`}>
                        {alreadyAdded ? "已添加" : "加入"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function GroceryList({
  items,
  groups,
  customItems,
  newCustomItem,
  setNewCustomItem,
  onAddCustomItem,
  onRemoveCustomItem,
  onExcludeItem,
  onRestoreItem,
  onRestoreAllItems,
  excludedItems,
  onShare,
  checkedItems,
  setCheckedItems,
}) {
  const visibleItemCount = groups.reduce((total, group) => total + group.items.length, 0);

  function toggle(key) {
    setCheckedItems((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-5">
        {groups.length > 0 ? (
          groups.map((group) => (
            <Card key={group.key}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">{group.source}</p>
                  <h3 className="card-title">{group.recipe.name}</h3>
                </div>
                <span className="rounded-full bg-acid px-3 py-1 text-xs font-black">
                  {group.items.length} 项
                </span>
              </div>
              <div className="grid gap-2">
                {group.items.map((item) => (
                  <GroceryItem
                    key={item.key}
                    item={item}
                    checked={checkedItems[item.key]}
                    onToggle={() => toggle(item.key)}
                    onRemove={() => onExcludeItem(item.key)}
                  />
                ))}
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <p className="eyebrow">Empty list</p>
            <h3 className="card-title">暂无可购买食材</h3>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/55">
              可以先去菜单库加入菜品，或从右侧恢复已隐藏的材料。
            </p>
          </Card>
        )}

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Manual list</p>
              <h3 className="card-title">手动添加</h3>
            </div>
            <Plus size={20} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onAddCustomItem(newCustomItem);
            }}
          >
            <input
              value={newCustomItem}
              onChange={(event) => setNewCustomItem(event.target.value)}
              className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 py-3 text-sm font-bold outline-none focus:border-ink/30"
              placeholder="例如：厨房纸、牛奶、保鲜袋"
            />
            <button type="submit" className="rounded-full bg-ink px-5 text-sm font-black text-white">
              添加
            </button>
          </form>
          <div className="mt-4 grid gap-2">
            {customItems.map((item) => (
              <div key={item.key} className="flex items-center gap-3 rounded-[18px] border border-line bg-canvas p-3">
                <span className="flex-1 font-black">{item.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveCustomItem(item.key)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white text-ink/55 transition hover:text-ink"
                  aria-label={`删除 ${item.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <p className="eyebrow">Auto merged</p>
        <h3 className="card-title">清单摘要</h3>
        <p className="mt-4 text-sm leading-7 text-ink/56">
          系统已把今日菜单和一周计划里的重复食材合并，适合直接用于买菜测试。
        </p>
        <div className="mt-6 rounded-[22px] bg-ink p-5 text-white">
          <p className="text-5xl font-black tracking-[-0.05em]">{visibleItemCount + customItems.length}</p>
          <p className="mt-1 text-sm font-bold text-white/56">total grocery items</p>
        </div>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={onShare}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid px-4 text-sm font-black text-ink transition hover:-translate-y-0.5"
          >
            <Share2 size={17} />
            分享 / 复制清单
          </button>
          <div className="rounded-[20px] border border-line bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Preview card</p>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/62">
              已按每道菜拆分食材，也保留合并摘要，适合发给家人分工采购。
            </p>
          </div>
        </div>
        {excludedItems.length > 0 && (
          <div className="mt-6 rounded-[22px] border border-line bg-canvas p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">Hidden items</p>
                <p className="mt-1 text-sm font-black">已隐藏材料</p>
              </div>
              <button
                type="button"
                onClick={onRestoreAllItems}
                className="rounded-full bg-white px-3 py-2 text-xs font-black text-ink transition hover:-translate-y-0.5"
              >
                全部恢复
              </button>
            </div>
            <div className="grid gap-2">
              {excludedItems.map((item) => (
                <div key={item.key} className="flex items-center gap-2 rounded-[16px] bg-white p-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink/58">
                    {item.name} {formatAmount(item)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestoreItem(item.key)}
                    className="rounded-full bg-acid px-3 py-2 text-xs font-black text-ink"
                  >
                    恢复
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function StatsPage({ todayRecipes, plannedRecipes, groceryItems, weekPlan, onViewChange }) {
  const allRecipes = [...todayRecipes, ...plannedRecipes];
  const totalMeals = Object.values(weekPlan).reduce((total, recipeIds) => total + recipeIds.length, 0);
  const categoryCounts = allRecipes.reduce((counts, recipe) => {
    recipe.categories.forEach((category) => {
      counts[category] = (counts[category] ?? 0) + 1;
    });
    return counts;
  }, {});
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const averageTime =
    allRecipes.length > 0
      ? Math.round(allRecipes.reduce((total, recipe) => total + recipe.timeMinutes, 0) / allRecipes.length)
      : 0;
  const proteinRecipes = allRecipes.filter((recipe) =>
    recipe.categories.some((category) => ["肉类", "蛋类", "豆制品", "海鲜"].includes(category)),
  ).length;
  const vegetableRecipes = allRecipes.filter((recipe) =>
    recipe.categories.some((category) => ["蔬菜", "清爽", "素食"].includes(category)),
  ).length;
  const maxCategoryCount = Math.max(...topCategories.map(([, count]) => count), 1);

  return (
    <section className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[30px] bg-ink p-6 text-white shadow-lift md:p-8">
          <div className="absolute right-8 top-8 hidden md:block">
            <DoodleArrow />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Dining stats</p>
          <h2 className="mt-4 max-w-xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
            本周饮食结构
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
            先用菜单和计划数据做轻量分析，后续可以继续扩展热量、预算、家庭成员偏好和营养目标。
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <StatBlock label="计划餐次" value={String(totalMeals)} />
            <StatBlock label="平均时长" value={`${averageTime} min`} />
            <StatBlock label="待买食材" value={String(groceryItems.length)} />
          </div>
        </section>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Balance</p>
              <h3 className="card-title">饮食平衡</h3>
            </div>
            <BarChart3 size={22} />
          </div>
          <div className="mt-6 grid gap-3">
            <BalanceRow label="蔬菜相关" value={vegetableRecipes} total={Math.max(allRecipes.length, 1)} />
            <BalanceRow label="蛋白质相关" value={proteinRecipes} total={Math.max(allRecipes.length, 1)} />
            <BalanceRow
              label="快速菜"
              value={allRecipes.filter((recipe) => recipe.timeMinutes <= 20).length}
              total={Math.max(allRecipes.length, 1)}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Category mix</p>
              <h3 className="card-title">菜品分类分布</h3>
            </div>
            <Sparkles size={22} />
          </div>
          <div className="mt-6 grid gap-4">
            {topCategories.length > 0 ? (
              topCategories.map(([category, count]) => (
                <div key={category}>
                  <div className="mb-2 flex items-center justify-between text-sm font-black">
                    <span>{category}</span>
                    <span className="text-ink/45">{count} 次</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-acid"
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-[20px] bg-canvas p-4 text-sm font-bold text-ink/50">
                暂无统计数据。先去菜单库添加今日菜单，或在一周计划里安排菜品。
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Next action</p>
              <h3 className="card-title">继续优化菜单</h3>
            </div>
            <ListChecks size={22} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => onViewChange("planner")}
              className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
            >
              <CalendarDays size={20} />
              <p className="mt-3 font-black">调整计划</p>
              <p className="mt-1 text-xs font-bold text-ink/50">补齐一周餐次</p>
            </button>
            <button
              type="button"
              onClick={() => onViewChange("grocery")}
              className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
            >
              <ShoppingBasket size={20} />
              <p className="mt-3 font-black">查看食材</p>
              <p className="mt-1 text-xs font-bold text-ink/50">确认采购清单</p>
            </button>
            <button
              type="button"
              onClick={() => onViewChange("library")}
              className="rounded-[20px] bg-canvas p-4 text-left transition hover:-translate-y-0.5 hover:bg-acid"
            >
              <ChefHat size={20} />
              <p className="mt-3 font-black">添加菜品</p>
              <p className="mt-1 text-xs font-bold text-ink/50">丰富本周口味</p>
            </button>
          </div>
        </Card>
      </div>
    </section>
  );
}

function GroceryItem({ item, checked, onToggle, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] border border-line bg-canvas p-3 transition hover:border-ink/20">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} className="peer sr-only" />
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-ink/18 bg-white peer-checked:border-ink peer-checked:bg-ink peer-checked:text-acid">
          {checked && <Check size={15} />}
        </span>
        <span className={`min-w-0 flex-1 font-black ${checked ? "text-ink/35 line-through" : ""}`}>
          {item.name}
          {item.pantryItem && <em className="ml-2 text-xs not-italic text-ink/38">常备</em>}
          {item.required === false && <em className="ml-2 text-xs not-italic text-ink/38">可选</em>}
        </span>
        <span className="shrink-0 font-black text-ink/66">{formatAmount(item)}</span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink/45 transition hover:bg-ink hover:text-white"
        aria-label={`隐藏 ${item.name}`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function MobileTabbar({ activeView, onChange }) {
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-30 grid rounded-[26px] border border-line bg-white/92 p-2 shadow-lift backdrop-blur-xl lg:hidden"
      style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeView;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`grid place-items-center gap-1 rounded-[20px] py-2 text-[11px] font-black transition ${
              active ? "bg-ink text-white" : "text-ink/45"
            }`}
          >
            <Icon size={18} className={active ? "text-acid" : ""} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function MetricCard({ icon: Icon, label, value, note, action, onClick }) {
  const Wrapper = onClick ? "button" : "section";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-[20px] border border-line bg-white p-5 text-left shadow-card transition ${
        onClick ? "hover:-translate-y-1 hover:shadow-lift" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{label}</p>
          <h3 className="mt-3 text-3xl font-black tracking-[-0.04em]">{value}</h3>
          <p className="mt-2 text-sm leading-6 text-ink/52">{note}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-acid">
          <Icon size={20} />
        </div>
      </div>
      {action && (
        <span className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5">
          {action}
        </span>
      )}
    </Wrapper>
  );
}

function RecipeDetailDrawer({
  recipe,
  cookingStep,
  setCookingStep,
  onClose,
  onAddToday,
  todayEntry,
  onUpdateTodayQuantity,
}) {
  if (!recipe) return null;

  const isFirstStep = cookingStep === 0;
  const isLastStep = cookingStep === recipe.steps.length - 1;
  const currentStep = recipe.steps[cookingStep];

  function previousStep() {
    setCookingStep((step) => Math.max(0, step - 1));
  }

  function nextStep() {
    setCookingStep((step) => Math.min(recipe.steps.length - 1, step + 1));
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-ink/38 backdrop-blur-sm"
        aria-label="关闭菜谱详情"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-canvas shadow-lift md:w-[560px] md:rounded-l-[32px]">
        <div className="relative h-56 shrink-0 overflow-hidden md:h-64">
          <img src={photoFor(recipe)} alt={recipe.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/72 via-ink/10 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink shadow-card backdrop-blur transition hover:scale-105"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
          <div className="absolute bottom-5 left-5 right-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-acid">Recipe detail</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] md:text-4xl">{recipe.name}</h2>
            <p className="mt-2 hidden text-sm leading-6 text-white/72 sm:block">{recipe.description}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-5 md:px-6">
          <div className="grid grid-cols-3 gap-2">
            <InfoPill label="时间" value={`${recipe.timeMinutes} min`} />
            <InfoPill label="难度" value={recipe.difficulty} />
            <InfoPill label="份量" value={`${recipe.servings} 人份`} />
          </div>

          <section className="mt-5 grid gap-4 md:grid-cols-2">
            <IngredientPanel title="食材" items={recipe.ingredients} />
            <IngredientPanel title="调料" items={recipe.seasonings} />
          </section>

          <section className="mt-5 rounded-[26px] border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Cooking mode</p>
                <h3 className="card-title">跟做步骤</h3>
              </div>
              <span className="rounded-full bg-acid px-3 py-1 text-xs font-black">
                {cookingStep + 1}/{recipe.steps.length}
              </span>
            </div>

            <div className="rounded-[24px] bg-ink p-5 text-white">
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/14">
                <div
                  className="h-full rounded-full bg-acid transition-all duration-300"
                  style={{ width: `${((cookingStep + 1) / recipe.steps.length) * 100}%` }}
                />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-acid">
                Step {String(cookingStep + 1).padStart(2, "0")}
              </p>
              <p className="mt-3 text-2xl font-black leading-snug tracking-[-0.03em]">
                {currentStep}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isFirstStep}
                  onClick={previousStep}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 text-sm font-black text-white transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowLeft size={17} />
                  上一步
                </button>
                <button
                  type="button"
                  disabled={isLastStep}
                  onClick={nextStep}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-acid text-sm font-black text-ink transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  下一步
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>

            <ol className="mt-4 grid gap-2">
              {recipe.steps.map((step, index) => (
                <li key={step}>
                  <button
                    type="button"
                    onClick={() => setCookingStep(index)}
                    className={`grid w-full grid-cols-[34px_1fr] gap-3 rounded-[18px] border p-3 text-left transition ${
                      index === cookingStep
                        ? "border-ink bg-canvas"
                        : "border-line bg-white hover:border-ink/18"
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                        index === cookingStep ? "bg-ink text-acid" : "bg-canvas text-ink/45"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold leading-6 text-ink/72">{step}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {recipe.tips && (
            <section className="mt-5 rounded-[24px] border border-line bg-white p-5 shadow-card">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-acid">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-black">Chef note</p>
                  <p className="mt-1 text-sm leading-6 text-ink/56">{recipe.tips}</p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-line bg-white/92 p-4 backdrop-blur-xl">
          {todayEntry ? (
            <div className="grid grid-cols-[52px_1fr_52px] items-center gap-3">
              <button
                type="button"
                onClick={() => onUpdateTodayQuantity(recipe.id, -1)}
                className="grid h-12 place-items-center rounded-full border border-line bg-canvas"
                aria-label="减少份数"
              >
                <Minus size={18} />
              </button>
              <div className="rounded-full bg-ink px-5 py-4 text-center text-sm font-black text-white shadow-card">
                今日菜单 · {todayEntry.quantity} 份
              </div>
              <button
                type="button"
                onClick={() => onUpdateTodayQuantity(recipe.id, 1)}
                className="grid h-12 place-items-center rounded-full bg-acid"
                aria-label="增加份数"
              >
                <Plus size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAddToday(recipe.id)}
              className="flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-black text-white shadow-card transition hover:-translate-y-0.5"
            >
              <Plus size={18} className="text-acid" />
              加入今日菜单
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="rounded-[20px] border border-line bg-white p-4 shadow-card">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-ink/35">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function IngredientPanel({ title, items }) {
  return (
    <div className="rounded-[24px] border border-line bg-white p-5 shadow-card">
      <h3 className="text-lg font-black tracking-[-0.03em]">{title}</h3>
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={`${title}-${item.name}-${item.unit}`} className="flex items-center justify-between gap-3">
            <span className="font-bold text-ink/72">
              {item.name}
              {item.required === false && <em className="ml-2 text-xs not-italic text-ink/35">可选</em>}
              {item.pantryItem && <em className="ml-2 text-xs not-italic text-ink/35">常备</em>}
            </span>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-black">{formatRawAmount(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniMeal({ recipe, dark = false, onClick }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[22px] p-3 text-left transition ${
        dark ? "bg-white/10 text-white" : "border border-line bg-canvas text-ink"
      } ${onClick ? "hover:-translate-y-0.5 hover:bg-white/15" : ""}`}
    >
      <img src={photoFor(recipe)} alt="" className="h-16 w-16 rounded-[18px] object-cover" />
      <div className="min-w-0">
        <p className="truncate font-black">{recipe.name}</p>
        <p className={`mt-1 text-xs font-bold ${dark ? "text-white/55" : "text-ink/45"}`}>
          {recipe.timeMinutes} min · {recipe.difficulty}
          {recipe.menuQuantity > 1 ? ` · ${recipe.menuQuantity} 份` : ""}
        </p>
      </div>
    </Wrapper>
  );
}

function Card({ children }) {
  return <section className="rounded-[20px] border border-line bg-white p-5 shadow-card">{children}</section>;
}

function Stat({ label, value }) {
  return (
    <div className="rounded-[20px] bg-canvas p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-ink/38">{label}</p>
    </div>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="rounded-[22px] bg-white/10 p-4">
      <p className="text-3xl font-black tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
    </div>
  );
}

function BalanceRow({ label, value, total }) {
  const percent = Math.round((value / total) * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-black">
        <span>{label}</span>
        <span className="text-ink/45">{percent}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function DoodleWash() {
  return (
    <div className="pointer-events-none fixed right-8 top-8 hidden opacity-80 xl:block" aria-hidden="true">
      <svg width="128" height="78" viewBox="0 0 128 78" fill="none">
        <path d="M8 49c23-25 48-25 74 0 15 14 27 18 38 11" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path d="M83 15c10 0 16 7 16 15s-6 15-16 15-16-7-16-15 6-15 16-15Z" stroke="#111" strokeWidth="3" />
        <path d="M77 28h.1M90 28h.1M78 36c5 4 10 4 15 0" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DoodleArrow() {
  return (
    <svg width="92" height="64" viewBox="0 0 92 64" fill="none" aria-hidden="true">
      <path d="M9 51c20-30 47-42 72-36" stroke="#D9F06B" strokeWidth="3" strokeLinecap="round" />
      <path d="M69 7l13 8-12 9" stroke="#D9F06B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoodlePot() {
  return (
    <svg width="80" height="54" viewBox="0 0 80 54" fill="none" aria-hidden="true">
      <path d="M18 24h44l-5 20H23l-5-20Z" stroke="#111" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M14 24h52M29 17c-2-5 5-6 3-12M43 17c-2-5 5-6 3-12M56 17c-2-5 5-6 3-12" stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function getCurrentPlanDay() {
  const dayIndex = new Date().getDay();
  const dayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return dayMap[dayIndex] ?? "周一";
}

function createInitialMealCalendar() {
  const today = new Date();
  const calendar = {};
  for (let offset = -10; offset <= 21; offset += 1) {
    const date = addDays(today, offset);
    const dateKey = formatDateKey(date);
    if (offset < 0) {
      const first = Math.abs(offset) % recipes.length;
      const second = (first + 7) % recipes.length;
      calendar[dateKey] = offset % 3 === 0 ? [recipes[first].id] : [recipes[first].id, recipes[second].id];
    }
    if (offset === 1) calendar[dateKey] = [recipes[4].id, recipes[6].id];
    if (offset === 2) calendar[dateKey] = [recipes[10].id];
    if (offset === 5) calendar[dateKey] = [recipes[12].id, recipes[16].id];
  }
  return calendar;
}

function addDays(date, offset) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate;
}

function addMonths(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日 周${calendarWeekdays[date.getDay()]}`;
}

function formatMonthTitle(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function getCalendarMonthDates(anchorDate) {
  const firstDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = addDays(firstDate, -firstDate.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function getRecipe(id) {
  return recipes.find((recipe) => recipe.id === id);
}

function photoFor(recipe) {
  return photoByAccent[recipe.accent] ?? photoByAccent.fresh;
}

function buildRecipeGroceryGroups(entries) {
  return entries
    .map((entry, index) => {
      const recipe = getRecipe(entry.recipeId);
      if (!recipe) return null;
      const items = [
        ...recipe.ingredients.map((item) => ({ ...item, type: "ingredient" })),
        ...recipe.seasonings.map((item) => ({ ...item, type: "seasoning" })),
      ].map((item) => {
        const scaled = scaleItem(item, entry.quantity);
        return {
          ...scaled,
          key: `${entry.source}:${index}:${recipe.id}:${scaled.type}:${scaled.name}:${scaled.unit}`,
        };
      });
      return {
        key: `${entry.source}:${index}:${recipe.id}`,
        source: entry.quantity > 1 ? `${entry.source} · ${entry.quantity} 份` : entry.source,
        recipe,
        items,
      };
    })
    .filter(Boolean);
}

function buildShoppingListFromEntries(entries) {
  const merged = new Map();
  entries.forEach((entry) => {
    const recipe = getRecipe(entry.recipeId);
    if (!recipe) return;
    [
      ...recipe.ingredients.map((item) => ({ ...item, type: "ingredient" })),
      ...recipe.seasonings.map((item) => ({ ...item, type: "seasoning" })),
    ].forEach((rawItem) => {
      const item = scaleItem(rawItem, entry.quantity);
      const key = `${item.type}:${item.name}:${item.unit}:${typeof item.amount}`;
      const current = merged.get(key);
      if (current && typeof current.amount === "number" && typeof item.amount === "number") {
        current.amount += item.amount;
      } else if (current) {
        current.amount = "适量";
      } else {
        merged.set(key, { ...item, key, pantryItem: Boolean(item.pantryItem) });
      }
    });
  });
  return [...merged.values()].sort((a, b) => Number(a.pantryItem) - Number(b.pantryItem));
}

function scaleItem(item, multiplier = 1) {
  if (typeof item.amount !== "number") return { ...item };
  const amount = Math.round(item.amount * multiplier * 10) / 10;
  return { ...item, amount };
}

function formatShareText(groups, customItems) {
  const recipeSections = groups
    .map((group) => {
      const lines = group.items.map((item) => `- ${item.name} ${formatAmount(item)}`);
      return `${group.recipe.name}（${group.source}）\n${lines.join("\n")}`;
    })
    .join("\n\n");
  const customSection =
    customItems.length > 0
      ? `\n\n手动添加\n${customItems.map((item) => `- ${item.name}`).join("\n")}`
      : "";
  return `家庭菜单食材清单\n\n${recipeSections}${customSection}`;
}

function formatAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

function formatRawAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

createRoot(document.getElementById("root")).render(<App />);

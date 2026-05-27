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
  Heart,
  Home,
  ListChecks,
  Plus,
  Search,
  Settings,
  ShoppingBasket,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import recipes from "../data/recipes.json";
import "./styles.css";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "library", label: "菜单库", icon: ChefHat },
  { id: "planner", label: "一周计划", icon: CalendarDays },
  { id: "grocery", label: "食材清单", icon: ShoppingBasket },
];

const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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
  const [todayMenu, setTodayMenu] = useState(() => recipes.slice(0, 3).map((recipe) => recipe.id));
  const [weekPlan, setWeekPlan] = useState(() => ({
    周一: recipes[0].id,
    周二: recipes[4].id,
    周三: recipes[10].id,
    周四: recipes[12].id,
    周五: recipes[15].id,
    周六: recipes[20].id,
    周日: recipes[24].id,
  }));
  const [checkedItems, setCheckedItems] = useState({});
  const [draggedRecipeId, setDraggedRecipeId] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [cookingStep, setCookingStep] = useState(0);

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

  const todayRecipes = todayMenu.map((id) => getRecipe(id)).filter(Boolean);
  const plannedRecipes = Object.values(weekPlan).map((id) => getRecipe(id)).filter(Boolean);
  const selectedRecipe = selectedRecipeId ? getRecipe(selectedRecipeId) : null;
  const groceryItems = useMemo(
    () => buildShoppingList([...todayRecipes, ...plannedRecipes]),
    [todayRecipes, plannedRecipes],
  );

  function openRecipe(recipeId) {
    setSelectedRecipeId(recipeId);
    setCookingStep(0);
  }

  function closeRecipe() {
    setSelectedRecipeId(null);
    setCookingStep(0);
  }

  function addToday(recipeId) {
    setTodayMenu((current) => (current.includes(recipeId) ? current : [...current, recipeId]));
  }

  function removeToday(recipeId) {
    setTodayMenu((current) => current.filter((id) => id !== recipeId));
  }

  function assignPlan(day, recipeId) {
    setWeekPlan((current) => ({ ...current, [day]: recipeId }));
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
              onOpenRecipe={openRecipe}
              onDragStart={setDraggedRecipeId}
            />
          )}
          {activeView === "planner" && (
            <Planner
              weekPlan={weekPlan}
              draggedRecipeId={draggedRecipeId}
              onAssign={assignPlan}
              onDragStart={setDraggedRecipeId}
            />
          )}
          {activeView === "grocery" && (
            <GroceryList
              items={groceryItems}
              checkedItems={checkedItems}
              setCheckedItems={setCheckedItems}
            />
          )}
        </main>
      </div>
      <MobileTabbar activeView={activeView} onChange={setActiveView} />
      <RecipeDetailDrawer
        recipe={selectedRecipe}
        cookingStep={cookingStep}
        setCookingStep={setCookingStep}
        onClose={closeRecipe}
        onAddToday={addToday}
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
  const weekCoverage = Object.values(weekPlan).filter(Boolean).length;
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-lift md:p-8">
        <div className="absolute right-8 top-7 hidden md:block">
          <DoodleArrow />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">Today board</p>
        <h2 className="mt-4 max-w-2xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
          今日菜单已经准备好。
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          用一个轻量 dashboard 管住菜单、购物清单和家庭偏好。克制一点，生活就顺一点。
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {todayRecipes.map((recipe) => (
            <MiniMeal key={recipe.id} recipe={recipe} dark onClick={() => onOpenRecipe(recipe.id)} />
          ))}
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
          <MetricCard icon={CalendarDays} label="本周计划" value={`${weekCoverage}/7`} note="餐次已规划" />
          <MetricCard icon={ListChecks} label="待购买" value={String(groceryItems.length)} note="自动合并食材" />
        </div>
      </section>

      <section className="grid gap-5 xl:col-span-2 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
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
        </Card>
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

function Library({ categories, category, setCategory, recipes: visibleRecipes, onAdd, onOpenRecipe, onDragStart }) {
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
            onOpen={onOpenRecipe}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </section>
  );
}

function RecipeCard({ recipe, onAdd, onOpen, onDragStart }) {
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
          查看详情
        </button>
      </div>
    </article>
  );
}

function Planner({ weekPlan, draggedRecipeId, onAssign, onDragStart }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-4">
        {days.map((day) => {
          const recipe = getRecipe(weekPlan[day]);
          return (
            <div
              key={day}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => draggedRecipeId && onAssign(day, draggedRecipeId)}
              className="grid gap-4 rounded-[24px] border border-line bg-white p-4 shadow-card transition hover:border-ink/20 md:grid-cols-[96px_1fr]"
            >
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-ink/38">{day}</p>
                <p className="mt-2 text-xs font-bold text-ink/42">Drop meal here</p>
              </div>
              {recipe ? <MiniMeal recipe={recipe} /> : <div className="rounded-[20px] bg-canvas p-4">未安排</div>}
            </div>
          );
        })}
      </div>
      <Card>
        <p className="eyebrow">Drag to plan</p>
        <h3 className="card-title">快速安排</h3>
        <div className="mt-5 grid gap-3">
          {recipes.slice(0, 8).map((recipe) => (
            <button
              key={recipe.id}
              draggable
              onDragStart={() => onDragStart(recipe.id)}
              type="button"
              className="flex items-center gap-3 rounded-[18px] border border-line bg-canvas p-2 text-left transition hover:border-ink/20"
            >
              <img src={photoFor(recipe)} alt="" className="h-14 w-14 rounded-2xl object-cover" />
              <span className="font-black">{recipe.name}</span>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}

function GroceryList({ items, checkedItems, setCheckedItems }) {
  const grouped = {
    食材: items.filter((item) => item.type === "ingredient"),
    调料: items.filter((item) => item.type === "seasoning"),
  };

  function toggle(key) {
    setCheckedItems((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="grid gap-5">
        {Object.entries(grouped).map(([title, groupItems]) => (
          <Card key={title}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="card-title">{title}</h3>
              <span className="rounded-full bg-acid px-3 py-1 text-xs font-black">{groupItems.length} items</span>
            </div>
            <div className="grid gap-2">
              {groupItems.map((item) => {
                const checked = checkedItems[item.key];
                return (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-3 rounded-[18px] border border-line bg-canvas p-3 transition hover:border-ink/20"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      onChange={() => toggle(item.key)}
                      className="peer sr-only"
                    />
                    <span className="grid h-6 w-6 place-items-center rounded-lg border border-ink/18 bg-white peer-checked:border-ink peer-checked:bg-ink peer-checked:text-acid">
                      {checked && <Check size={15} />}
                    </span>
                    <span className={`flex-1 font-black ${checked ? "text-ink/35 line-through" : ""}`}>
                      {item.name}
                      {item.pantryItem && <em className="ml-2 text-xs not-italic text-ink/38">家中可能已有</em>}
                    </span>
                    <span className="font-black text-ink/66">{formatAmount(item)}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <p className="eyebrow">Auto merged</p>
        <h3 className="card-title">清单摘要</h3>
        <p className="mt-4 text-sm leading-7 text-ink/56">
          系统已把今日菜单和一周计划里的重复食材合并，适合直接用于买菜测试。
        </p>
        <div className="mt-6 rounded-[22px] bg-ink p-5 text-white">
          <p className="text-5xl font-black tracking-[-0.05em]">{items.length}</p>
          <p className="mt-1 text-sm font-bold text-white/56">total grocery items</p>
        </div>
      </Card>
    </section>
  );
}

function MobileTabbar({ activeView, onChange }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-[26px] border border-line bg-white/92 p-2 shadow-lift backdrop-blur-xl lg:hidden">
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
  return (
    <Card>
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
        <button
          type="button"
          onClick={onClick}
          className="mt-6 rounded-full bg-ink px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5"
        >
          {action}
        </button>
      )}
    </Card>
  );
}

function RecipeDetailDrawer({ recipe, cookingStep, setCookingStep, onClose, onAddToday }) {
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
          <button
            type="button"
            onClick={() => onAddToday(recipe.id)}
            className="flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-black text-white shadow-card transition hover:-translate-y-0.5"
          >
            <Plus size={18} className="text-acid" />
            加入今日菜单
          </button>
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

function getRecipe(id) {
  return recipes.find((recipe) => recipe.id === id);
}

function photoFor(recipe) {
  return photoByAccent[recipe.accent] ?? photoByAccent.fresh;
}

function buildShoppingList(recipeList) {
  const merged = new Map();
  recipeList.forEach((recipe) => {
    [
      ...recipe.ingredients.map((item) => ({ ...item, type: "ingredient" })),
      ...recipe.seasonings.map((item) => ({ ...item, type: "seasoning" })),
    ].forEach((item) => {
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

function formatAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

function formatRawAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

createRoot(document.getElementById("root")).render(<App />);

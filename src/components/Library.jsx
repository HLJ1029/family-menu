import { Minus, Plus } from "lucide-react";
import { DishImage } from "./ui/DishImage";
import { HumiScene } from "./ui/HumiScene";
import { normalizeMealEntries } from "../lib/mealPlan";

export function Library({
  categories,
  category,
  setCategory,
  recipes: visibleRecipes,
  allRecipes = [],
  onAdd,
  onUpdateQuantity,
  menuQuantities,
  parentLabel = "今晚菜单",
  targetMealSlot,
  targetMealLabel,
  onClearTargetMeal,
  onOpenRecipe,
  onDragStart,
  canManageMenu = true,
  actionLabelOverride,
}) {
  const safeMenuQuantities = normalizeMealEntries(menuQuantities);
  const quantityByRecipe = Object.fromEntries(safeMenuQuantities.map((item) => [item.recipeId, item.quantity]));
  const recipeSource = allRecipes.length > 0 ? allRecipes : visibleRecipes;
  const recipeById = Object.fromEntries(recipeSource.map((recipe) => [recipe.id, recipe]));
  const selectedRecipes = safeMenuQuantities
    .map((item) => {
      const recipe = recipeById[item.recipeId];
      return recipe ? { ...recipe, menuQuantity: item.quantity } : null;
    })
    .filter(Boolean);
  const selectedIds = new Set(selectedRecipes.map((recipe) => recipe.id));
  const remainingRecipes = visibleRecipes.filter((recipe) => !selectedIds.has(recipe.id));
  const pickingMeal = Boolean(targetMealSlot && targetMealSlot !== "dinner");
  const actionLabel = actionLabelOverride ?? (pickingMeal ? `加入${targetMealLabel || "这一餐"}` : "补进今晚");

  return (
    <section>
      {selectedRecipes.length > 0 && (
        <SelectedRecipesPanel
          recipes={selectedRecipes}
          title={pickingMeal ? `${targetMealLabel || "这一餐"}已选择` : "今晚已安排"}
          onOpenRecipe={onOpenRecipe}
          onUpdateQuantity={onUpdateQuantity}
          canManageMenu={canManageMenu}
        />
      )}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">
            {parentLabel} · {pickingMeal ? "先选再记录" : "继续发现"}
          </p>
          <h2 className="mt-1 text-xl font-black tracking-normal sm:text-2xl">
            {pickingMeal ? `给${targetMealLabel || "这一餐"}选菜` : selectedRecipes.length > 0 ? "未安排的新菜" : "发现新菜"}
          </h2>
          {pickingMeal && (
            <p className="mt-1 text-xs font-bold leading-5 text-ink/45">只有点选后才会写入这一餐。</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-ink/45">{recipeSource.length} 道</span>
            {pickingMeal && (
              <button type="button" onClick={onClearTargetMeal} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-black text-ink/56">
                改加今晚
              </button>
            )}
          </div>
          <HumiScene scene="discover" size="sm" decorative />
        </div>
      </div>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition ${
              category === item
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-ink/58 hover:border-ink/20 hover:text-ink"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:gap-5">
        {remainingRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onAdd={onAdd}
            onUpdateQuantity={onUpdateQuantity}
            quantity={quantityByRecipe[recipe.id] ?? 0}
            onOpen={onOpenRecipe}
            onDragStart={onDragStart}
            actionLabel={actionLabel}
            canManageMenu={canManageMenu}
          />
        ))}
      </div>
      {remainingRecipes.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-line bg-white p-6 text-center shadow-card">
          <p className="text-lg font-black text-ink">这组条件下还没菜</p>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            {selectedRecipes.length > 0 ? "已选的菜在页面最上方，可以切换分类继续发现。" : "换个分类或点顶部搜索清空关键词，再继续逛。"}
          </p>
          <button
            type="button"
            onClick={() => setCategory("全部")}
            className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-black text-white"
          >
            看全部
          </button>
        </div>
      )}
    </section>
  );
}

function SelectedRecipesPanel({ recipes, title, onOpenRecipe, onUpdateQuantity, canManageMenu }) {
  return (
    <section data-testid="selected-recipes-panel" className="mb-5 rounded-[24px] border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">已安排</p>
          <h3 className="mt-1 text-xl font-black tracking-normal">{title}</h3>
        </div>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-black text-white">{recipes.length} 道</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <article key={recipe.id} className="flex items-center gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <button type="button" onClick={() => onOpenRecipe(recipe.id)} className="h-20 w-20 shrink-0 overflow-hidden rounded-[18px] bg-canvas" aria-label={`查看 ${recipe.name}`}>
              <DishImage recipe={recipe} variant="thumb" alt={recipe.name} className="h-full w-full object-cover" />
            </button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpenRecipe(recipe.id)} className="block w-full truncate text-left text-base font-black">{recipe.name}</button>
              <p className="mt-1 text-xs font-bold text-ink/45">{recipe.categories[0]} · {recipe.timeMinutes} min</p>
              {canManageMenu ? <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => onUpdateQuantity(recipe.id, -1)} className="grid h-8 w-8 place-items-center rounded-full bg-canvas" aria-label={`减少 ${recipe.name}`}><Minus size={14} /></button>
                <span className="min-w-8 text-center text-xs font-black">{recipe.menuQuantity ?? 1} 份</span>
                <button type="button" onClick={() => onUpdateQuantity(recipe.id, 1)} className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white" aria-label={`增加 ${recipe.name}`}><Plus size={14} /></button>
              </div> : <p className="mt-2 text-xs font-bold text-ink/42">主厨已安排 {recipe.menuQuantity ?? 1} 份</p>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecipeCard({ recipe, onAdd, onUpdateQuantity, quantity, onOpen, onDragStart, actionLabel, canManageMenu }) {
  return (
    <article
      data-testid="recipe-card"
      draggable={canManageMenu}
      onDragStart={() => onDragStart(recipe.id)}
      onClick={() => onOpen(recipe.id)}
      className="group cursor-pointer overflow-hidden rounded-[24px] border border-line bg-white shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden bg-canvas sm:aspect-[4/5]">
        <DishImage
          recipe={recipe}
          variant="thumb"
          alt={recipe.name}
          loading="lazy"
          sizes="(min-width: 1024px) 33vw, 50vw"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/72 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-black backdrop-blur sm:left-4 sm:top-4 sm:text-xs">
          {recipe.categories[0]}
        </div>
        <div className="absolute bottom-3 left-3 right-3 text-white sm:bottom-4 sm:left-4 sm:right-4">
          <h3 className="line-clamp-2 text-lg font-black leading-tight tracking-normal sm:text-2xl">
            {recipe.name}
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black text-white/82 sm:text-xs">
            <span className="rounded-full bg-white/18 px-2 py-1 backdrop-blur">
              {recipe.timeMinutes} min
            </span>
            <span className="rounded-full bg-white/18 px-2 py-1 backdrop-blur">
              {recipe.difficulty}
            </span>
          </div>
        </div>
        {canManageMenu && (
          <RecipeQuantityControl
            recipe={recipe}
            quantity={quantity}
            onAdd={onAdd}
            onUpdateQuantity={onUpdateQuantity}
          />
        )}
      </div>
      <div className="grid gap-3 p-3 sm:p-4">
        <p className="line-clamp-2 min-h-10 text-xs font-bold leading-5 text-ink/54 sm:text-sm sm:leading-6">
          {recipe.description}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (canManageMenu && quantity > 0) {
              onOpen(recipe.id);
              return;
            }
            onAdd(recipe.id);
          }}
          className="min-h-11 w-full rounded-full border border-ink/10 bg-ink px-3 text-sm font-black text-white transition hover:-translate-y-0.5"
        >
          {canManageMenu && quantity > 0 ? `已选 ${quantity} 份 · 看做法` : actionLabel}
        </button>
      </div>
    </article>
  );
}

function RecipeQuantityControl({ recipe, quantity, onAdd, onUpdateQuantity }) {
  if (quantity > 0) {
    return (
      <div
        className="quantity-morph absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/92 p-1 shadow-card backdrop-blur"
        onClick={(event) => event.stopPropagation()}
        aria-label={`${recipe.name} 已加入 ${quantity} 份`}
      >
        <button
          type="button"
          onClick={() => onUpdateQuantity(recipe.id, -1)}
          className="grid h-8 w-8 place-items-center rounded-full bg-canvas text-ink transition hover:bg-ink hover:text-white"
          aria-label={`减少 ${recipe.name}`}
        >
          <Minus size={15} />
        </button>
        <span key={quantity} className="quantity-pop min-w-5 text-center text-xs font-black">{quantity}</span>
        <button
          type="button"
          onClick={() => onUpdateQuantity(recipe.id, 1)}
          className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition hover:scale-105"
          aria-label={`增加 ${recipe.name}`}
        >
          <Plus size={15} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onAdd(recipe.id);
      }}
      className="quantity-morph absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-ink text-white shadow-card transition hover:scale-105"
      aria-label={`加入 ${recipe.name}`}
    >
      <Plus size={19} />
    </button>
  );
}

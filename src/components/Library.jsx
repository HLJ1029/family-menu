import { ChevronDown, Heart, Minus, Plus } from "lucide-react";
import { DishImage } from "./ui/DishImage";
import { HumiScene } from "./ui/HumiScene";

export function Library({
  categories,
  category,
  setCategory,
  recipes: visibleRecipes,
  allRecipes,
  onAdd,
  onUpdateQuantity,
  menuQuantities,
  cravedRecipeIds = [],
  onCraveRecipe,
  parentLabel = "今晚菜单",
  targetMealSlot,
  targetMealLabel,
  onClearTargetMeal,
  onOpenRecipe,
  onDragStart,
}) {
  const quantityByRecipe = Object.fromEntries(menuQuantities.map((item) => [item.recipeId, item.quantity]));
  const cravedSet = new Set(cravedRecipeIds);
  const recipeSource = allRecipes?.length ? allRecipes : visibleRecipes;
  const recipeById = Object.fromEntries(recipeSource.map((recipe) => [recipe.id, recipe]));
  const selectedRecipes = menuQuantities
    .map((item) => {
      const recipe = recipeById[item.recipeId];
      return recipe ? { ...recipe, menuQuantity: item.quantity } : null;
    })
    .filter(Boolean);
  const selectedOrder = new Map(selectedRecipes.map((recipe, index) => [recipe.id, index]));
  const sortedRecipes = visibleRecipes.filter((recipe) => !selectedOrder.has(recipe.id));
  const pickingMeal = Boolean(targetMealSlot && targetMealSlot !== "dinner");
  const title = pickingMeal ? `给${targetMealLabel || "这一餐"}选菜` : "全部菜品库";
  const eyebrow = pickingMeal ? `${parentLabel} · 选餐子页面` : `${parentLabel} · 推荐外子页面`;
  const totalRecipeCount = allRecipes?.length || recipeSource.length;
  const hasSelectedRecipes = selectedRecipes.length > 0;

  return (
    <section>
      {hasSelectedRecipes && (
        <SelectedRecipesPanel
          recipes={selectedRecipes}
          label={pickingMeal ? `${targetMealLabel || "这一餐"}已选择` : "今晚已安排"}
          onOpen={onOpenRecipe}
          onUpdateQuantity={onUpdateQuantity}
        />
      )}

      {hasSelectedRecipes ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[20px] border border-line bg-white px-4 py-3 shadow-card">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em]">{title}</h2>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
            <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/56">
              共 {totalRecipeCount} 道
            </span>
            <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/56">
              {pickingMeal ? `加入${targetMealLabel || "这一餐"}` : "推荐外入口"}
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-[20px] border border-line bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">{eyebrow}</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.03em] sm:text-2xl">
                {title}
              </h2>
            </div>
            <HumiScene
              scene="discover"
              size="md"
              className="mr-1 hidden shrink-0 sm:grid"
            />
          </div>
          <div>
            <p className="mt-2 text-xs font-bold leading-5 text-ink/52 sm:text-sm sm:leading-6">
              {pickingMeal
                ? "这里也是完整菜品库。先选菜，再记录；Humi 不会替你想当然地写入某一道。"
                : "这是推荐之外的完整入口。先看上方已安排，再继续像翻卡片一样发现所有新菜。"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/56">
                共 {totalRecipeCount} 道
              </span>
              <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/56">
                当前发现 {sortedRecipes.length} 道
              </span>
              <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-black text-ink/56">
                {pickingMeal ? `加入${targetMealLabel || "这一餐"}` : "推荐外入口"}
              </span>
            </div>
            {pickingMeal && (
              <button
                type="button"
                onClick={onClearTargetMeal}
                className="mt-2 rounded-full border border-line bg-canvas px-4 py-2 text-xs font-black text-ink/58 transition hover:border-ink/20 hover:text-ink"
              >
                改为加入今晚菜单
              </button>
            )}
          </div>
        </div>
      )}

      {hasSelectedRecipes && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">继续发现</p>
            <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">未安排的新菜</h3>
          </div>
          <ChevronDown size={18} className="text-ink/35" />
        </div>
      )}

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
      {sortedRecipes.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:gap-5">
          {sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onAdd={onAdd}
              onUpdateQuantity={onUpdateQuantity}
              quantity={quantityByRecipe[recipe.id] ?? 0}
              craved={cravedSet.has(recipe.id)}
              onCrave={onCraveRecipe}
              onOpen={onOpenRecipe}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-line bg-white p-6 text-center">
          <p className="text-sm font-black text-ink">这个分类暂时没有更多新菜</p>
          <p className="mt-2 text-xs font-bold leading-5 text-ink/48">
            已选的菜在页面最上方，可以切换分类继续发现。
          </p>
        </div>
      )}
    </section>
  );
}

function SelectedRecipesPanel({ recipes, label, onOpen, onUpdateQuantity }) {
  return (
    <section data-testid="selected-recipes-panel" className="mb-5 rounded-[24px] border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">已安排</p>
          <h3 className="mt-1 text-xl font-black tracking-[-0.03em]">{label}</h3>
        </div>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-black text-white">
          {recipes.length} 道
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {recipes.map((recipe) => (
          <article key={recipe.id} className="flex items-center gap-3 rounded-[20px] border border-line bg-canvas p-3">
            <button
              type="button"
              onClick={() => onOpen(recipe.id)}
              className="h-20 w-20 shrink-0 overflow-hidden rounded-[18px] bg-white"
              aria-label={`查看 ${recipe.name}`}
            >
              <DishImage recipe={recipe} variant="thumb" alt={recipe.name} className="h-full w-full object-cover" />
            </button>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpen(recipe.id)}
                className="block w-full truncate text-left text-base font-black"
              >
                {recipe.name}
              </button>
              <p className="mt-1 text-xs font-bold text-ink/45">
                {recipe.categories[0]} · {recipe.timeMinutes} min
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(recipe.id, -1)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink"
                  aria-label={`减少 ${recipe.name}`}
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-8 text-center text-xs font-black">{recipe.menuQuantity ?? 1} 份</span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(recipe.id, 1)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white"
                  aria-label={`增加 ${recipe.name}`}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecipeCard({ recipe, onAdd, onUpdateQuantity, quantity, craved, onCrave, onOpen, onDragStart }) {
  return (
    <article
      data-testid="recipe-card"
      draggable
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
        <div className="absolute left-3 top-14 rounded-full bg-white/90 px-3 py-1 text-[11px] font-black backdrop-blur sm:left-4 sm:top-16 sm:text-xs">
          {recipe.categories[0]}
        </div>
        <div className="absolute bottom-3 left-3 right-3 text-white sm:bottom-4 sm:left-4 sm:right-4">
          <h3 className="line-clamp-2 text-lg font-black leading-tight tracking-[-0.03em] sm:text-2xl">
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
        <RecipeQuantityControl
          recipe={recipe}
          quantity={quantity}
          onAdd={onAdd}
          onUpdateQuantity={onUpdateQuantity}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCrave?.(recipe.id);
          }}
          className={`absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full shadow-card transition hover:scale-105 ${
            craved ? "bg-ink text-white" : "bg-white/92 text-ink"
          }`}
          aria-label={craved ? `${recipe.name} 已在想吃池` : `想吃 ${recipe.name}`}
        >
          <Heart size={18} fill={craved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="grid gap-3 p-3 sm:p-4">
        <p className="line-clamp-2 min-h-10 text-xs font-bold leading-5 text-ink/54 sm:text-sm sm:leading-6">
          {recipe.description}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(recipe.id);
          }}
          className="min-h-11 w-full rounded-full border border-ink/10 bg-ink px-3 text-sm font-black text-white transition hover:-translate-y-0.5"
        >
          {quantity > 0 ? `已选 ${quantity} 份 · 看做法` : "看做法"}
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

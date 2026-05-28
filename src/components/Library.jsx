import { Clock3, Minus, Plus } from "lucide-react";
import { photoFor } from "../lib/recipes";

export function Library({
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

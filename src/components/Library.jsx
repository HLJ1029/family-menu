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
      <div className="mb-5 rounded-[28px] bg-ink p-6 text-white shadow-lift md:p-8">
        <p className="text-sm font-black uppercase tracking-[0.24em] text-acid">自己挑</p>
        <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.04em] md:text-6xl">
          想换一道，就从这里挑。
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/62">
          首页先帮你安排；这里留给想加菜、换口味、临时补一道的时候。
        </p>
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
      <div className="grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
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
      className="group cursor-pointer overflow-hidden rounded-[18px] border border-line bg-white shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-lift sm:rounded-[20px]"
    >
      <div className="relative h-44 overflow-hidden sm:h-52">
        <img
          src={photoFor(recipe, { variant: "thumb" })}
          alt={recipe.name}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute left-4 top-4 rounded-full bg-white/88 px-3 py-1 text-xs font-black backdrop-blur">
          {recipe.categories[0]}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black sm:text-2xl">{recipe.name}</h3>
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
          {quantity > 0 ? `今晚已选 ${quantity} 份 · 看做法` : "看做法"}
        </button>
      </div>
    </article>
  );
}

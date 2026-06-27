import { Minus, Plus } from "lucide-react";
import { DishImage } from "./ui/DishImage";
import { HumiBrandIllustration } from "./ui/HumiBrandIllustration";

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
      <div className="mb-4 rounded-[24px] border border-line bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/35">自己挑</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-4xl">
              想换一道，就从这里挑。
            </h2>
          </div>
          <HumiBrandIllustration
            variant="dinner-decision-hero"
            size="md"
            className="mr-3 shrink-0"
            contextKey="library-hero"
            title="挑一张晚饭卡"
          />
        </div>
        <div>
          <p className="mt-2 text-sm font-bold leading-6 text-ink/52">
            首页先安排；这里留给加菜、换口味、临时补一道。
          </p>
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

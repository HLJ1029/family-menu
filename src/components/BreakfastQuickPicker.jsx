import { Check, ChevronRight, X } from "lucide-react";
import { DishImage } from "./ui/DishImage";

export function BreakfastQuickPicker({
  open,
  recipes = [],
  selectedRecipeIds = [],
  onSelect,
  onBrowseAll,
  onClose,
}) {
  if (!open) return null;
  const selectedIds = new Set(selectedRecipeIds);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/42 px-3 pt-16 backdrop-blur-sm sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="关闭早餐选择" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakfast-picker-title"
        data-testid="breakfast-quick-picker"
        className="relative w-full max-w-xl rounded-t-[28px] border border-line bg-white p-5 shadow-lift sm:rounded-[28px]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">早餐轻记</p>
            <h2 id="breakfast-picker-title" className="mt-2 text-2xl font-black tracking-normal">早餐吃什么</h2>
            <p className="mt-2 text-sm font-bold text-ink/48">从常吃的早餐里点一个。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-canvas text-ink"
            aria-label="关闭早餐选择"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3" data-testid="breakfast-quick-options">
          {recipes.map((recipe) => {
            const selected = selectedIds.has(recipe.id);
            return (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onSelect?.(recipe.id)}
                className={`overflow-hidden rounded-[18px] border text-left transition ${
                  selected ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink hover:border-ink/24"
                }`}
                aria-label={`早餐选择 ${recipe.name}`}
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-white">
                  <DishImage recipe={recipe} variant="thumb" alt={recipe.name} className="h-full w-full object-cover" />
                  {selected && (
                    <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink text-white">
                      <Check size={16} />
                    </span>
                  )}
                </span>
                <span className="block p-3">
                  <span className="block truncate text-sm font-black">{recipe.name}</span>
                  <span className={`mt-1 block text-xs font-bold ${selected ? "text-white/62" : "text-ink/42"}`}>
                    {recipe.timeMinutes} min
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onBrowseAll}
          className="mt-4 flex min-h-12 w-full items-center justify-between rounded-full border border-line bg-white px-5 text-sm font-black text-ink"
        >
          更多早餐选择
          <ChevronRight size={17} />
        </button>
      </section>
    </div>
  );
}

import { photoFor } from "../../lib/recipes";

export function MiniMeal({ recipe, dark = false, onClick }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[22px] p-3 text-left transition ${
        dark ? "bg-white/10 text-white" : "border border-line bg-canvas text-ink"
      } ${onClick ? "hover:-translate-y-0.5 hover:bg-white/15" : ""}`}
    >
      <img
        src={photoFor(recipe, { variant: "thumb" })}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-16 w-16 rounded-[18px] object-cover"
      />
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

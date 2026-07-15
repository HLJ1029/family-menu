import { useEffect, useState } from "react";
import { photoCandidatesFor } from "../../lib/recipes";

export function DishImage({ recipe, variant = "hero", className = "", alt = "", loading = "lazy", fetchPriority }) {
  const candidates = photoCandidatesFor(recipe, { variant });
  const [index, setIndex] = useState(0);
  const src = candidates[Math.min(index, candidates.length - 1)];

  useEffect(() => {
    setIndex(0);
  }, [recipe?.id, variant]);

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      className={`bg-[#ECECEC] ${className}`}
      onError={() => setIndex((current) => Math.min(current + 1, candidates.length - 1))}
    />
  );
}

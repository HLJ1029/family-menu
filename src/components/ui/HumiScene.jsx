import { getHumiBrandScene } from "./brandScenes";

const sizes = {
  sm: "h-20 w-24",
  md: "h-28 w-36",
  lg: "h-36 w-48",
  xl: "h-44 w-60",
  page: "h-28 w-40 md:h-44 md:w-60",
  hero: "h-48 w-full sm:h-56",
};

export function HumiScene({
  scene,
  size = "lg",
  className = "",
  imageClassName = "",
  eager = false,
  decorative = false,
}) {
  const selected = getHumiBrandScene(scene);

  return (
    <span className={`inline-grid place-items-center overflow-hidden ${sizes[size] || sizes.lg} ${className}`}>
      <img
        src={selected.src}
        alt={decorative ? "" : selected.label}
        className={`h-full w-full object-contain object-center ${imageClassName}`}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
      />
    </span>
  );
}

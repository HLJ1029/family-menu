const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
  xl: "h-44 w-44",
};

const illustrationMap = {
  kitchen: "/assets/brand/dinner-planning.webp",
  dinner: "/assets/brand/dinner-planning.webp",
  pantry: "/assets/brand/fridge-inventory.webp",
  recommendation: "/assets/brand/menu-recommendation.webp",
  shopping: "/assets/brand/shopping-list.webp",
  cooking: "/assets/brand/cooking-recipe.webp",
  empty: "/assets/brand/empty-state.webp",
  achievement: "/assets/brand/achievement.webp",
  onboarding: "/assets/brand/onboarding.webp",
  profile: "/assets/brand/family-profile.webp",
};

export function HumiBrandIllustration({
  variant = "kitchen",
  size = "md",
  className = "",
  title = "Humi brand lifestyle illustration",
}) {
  const src = illustrationMap[variant] ?? illustrationMap.kitchen;

  return (
    <span className={`inline-grid place-items-center overflow-hidden ${sizeClasses[size] ?? sizeClasses.md} ${className}`}>
      <img
        src={src}
        alt={title}
        className="h-full w-full object-contain mix-blend-multiply"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

export function HumiBrandCallout({
  variant = "kitchen",
  title,
  text,
  className = "",
  compact = false,
}) {
  return (
    <div className={`flex items-center gap-4 rounded-[24px] border border-line bg-white p-4 ${className}`}>
      <HumiBrandIllustration variant={variant} size={compact ? "sm" : "md"} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-black leading-5 text-ink">{title}</p>
        {text && <p className="mt-1 text-xs font-bold leading-5 text-ink/52">{text}</p>}
      </div>
    </div>
  );
}

export function HumiEmptyState({
  variant = "empty",
  title,
  text,
  action,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-[24px] border border-line bg-white p-5 text-left sm:flex-row sm:items-center ${className}`}>
      <HumiBrandIllustration variant={variant} size="md" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-black text-ink">{title}</p>
        {text && <p className="mt-1 text-sm font-bold leading-6 text-ink/52">{text}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

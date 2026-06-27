import { pickHumiCharacterIllustration } from "./characterIllustrations";

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
  xl: "h-44 w-44",
  "2xl": "h-56 w-56",
};

export function HumiBrandIllustration({
  variant = "kitchen",
  size = "md",
  className = "",
  title = "Humi brand lifestyle illustration",
  seed = "humi",
  contextKey,
  usedIds,
  usedActions,
  preferGender,
}) {
  const illustration = pickHumiCharacterIllustration(variant, {
    seed,
    contextKey,
    usedIds,
    usedActions,
    preferGender,
  });

  return (
    <span className={`inline-grid place-items-center overflow-hidden ${sizeClasses[size] ?? sizeClasses.md} ${className}`}>
      <img
        src={illustration.src}
        alt={title}
        className="h-full w-full object-contain"
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
  seed,
  contextKey,
  preferGender,
}) {
  return (
    <div className={`flex items-center gap-4 rounded-[24px] border border-line bg-white p-4 ${className}`}>
      <HumiBrandIllustration
        variant={variant}
        size={compact ? "sm" : "md"}
        className="shrink-0"
        seed={seed}
        contextKey={contextKey}
        preferGender={preferGender}
      />
      <div className="min-w-0">
        <p className="text-sm font-black leading-5 text-ink">{title}</p>
        {text && <p className="mt-1 text-xs font-bold leading-5 text-ink/52">{text}</p>}
      </div>
    </div>
  );
}

export function HumiIllustrationPanel({
  variant = "kitchen",
  title,
  text,
  className = "",
  imageClassName = "",
  size = "xl",
  tone = "light",
  seed,
  contextKey,
  preferGender,
}) {
  const dark = tone === "dark";

  return (
    <div className={`overflow-hidden rounded-[28px] border p-4 ${dark ? "border-white/12 bg-white text-ink" : "border-line bg-canvas text-ink"} ${className}`}>
      <HumiBrandIllustration
        variant={variant}
        size={size}
        className={`mx-auto ${imageClassName}`}
        seed={seed}
        contextKey={contextKey}
        preferGender={preferGender}
      />
      {(title || text) && (
        <div className="mt-3 text-center">
          {title && <p className="text-sm font-black">{title}</p>}
          {text && <p className="mt-1 text-xs font-bold leading-5 text-ink/52">{text}</p>}
        </div>
      )}
    </div>
  );
}

export function HumiPeek({
  variant = "kitchen",
  className = "",
  size = "md",
  title = "Humi 小助手",
  contextKey,
  seed,
  preferGender,
}) {
  return (
    <HumiBrandIllustration
      variant={variant}
      size={size}
      title={title}
      className={`pointer-events-none select-none ${className}`}
      contextKey={contextKey}
      seed={seed}
      preferGender={preferGender}
    />
  );
}

export function HumiEmptyState({
  variant = "empty",
  title,
  text,
  action,
  className = "",
  seed,
  contextKey,
  preferGender,
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-[24px] border border-line bg-white p-5 text-left sm:flex-row sm:items-center ${className}`}>
      <HumiBrandIllustration
        variant={variant}
        size="md"
        className="shrink-0"
        seed={seed}
        contextKey={contextKey}
        preferGender={preferGender}
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-black text-ink">{title}</p>
        {text && <p className="mt-1 text-sm font-bold leading-6 text-ink/52">{text}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

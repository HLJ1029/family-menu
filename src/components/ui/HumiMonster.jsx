const sizeClasses = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-28 w-28",
  xl: "h-36 w-36",
};

const moodCopy = {
  default: { mouth: "M40 70 Q50 76 60 70", brows: false, blush: true },
  happy: { mouth: "M38 68 Q50 82 62 68", brows: false, blush: true },
  thinking: { mouth: "M42 72 Q50 69 58 72", brows: true, blush: false },
  hungry: { mouth: "M39 67 Q50 78 61 67", brows: false, blush: true },
  success: { mouth: "M37 67 Q50 82 63 67", brows: false, blush: true },
  error: { mouth: "M41 74 Q50 67 59 74", brows: true, blush: false },
};

const accessoryMap = {
  basket: BasketAccessory,
  menu: MenuAccessory,
  spatula: SpatulaAccessory,
  fridge: FridgeAccessory,
};

export function HumiMonster({
  mood = "default",
  size = "md",
  accessory = "none",
  className = "",
  title,
}) {
  const state = moodCopy[mood] ?? moodCopy.default;
  const Accessory = accessoryMap[accessory];
  const eyesClosed = mood === "happy" || mood === "success";
  const eyeFill = mood === "error" ? "#111111" : "#2D2D2A";
  const bodyFill = mood === "error" ? "#FFD76A" : "#F8D84E";

  return (
    <span className={`humi-monster-bob relative inline-grid place-items-center ${sizeClasses[size] ?? sizeClasses.md} ${className}`}>
      <svg viewBox="0 0 100 100" role={title ? "img" : "presentation"} aria-label={title} className="h-full w-full drop-shadow-[0_14px_24px_rgba(17,17,17,0.18)]">
        <path d="M28 21 C22 12 24 5 31 3 C36 8 37 15 34 24" fill="#9FBF55" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path d="M72 21 C78 12 76 5 69 3 C64 8 63 15 66 24" fill="#9FBF55" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M18 43 C15 24 30 12 50 12 C70 12 85 24 82 43 L80 68 C78 86 66 94 50 94 C34 94 22 86 20 68 Z"
          fill={bodyFill}
          stroke="#111"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M25 55 C17 52 12 58 13 66 C18 63 22 61 27 63" fill="#D9F06B" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path d="M75 55 C83 52 88 58 87 66 C82 63 78 61 73 63" fill="#D9F06B" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path d="M33 91 L28 98" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        <path d="M67 91 L72 98" stroke="#111" strokeWidth="3" strokeLinecap="round" />

        <MonsterEye cx="35" cy="43" closed={eyesClosed} fill={eyeFill} />
        <MonsterEye cx="50" cy="38" closed={eyesClosed} fill={eyeFill} />
        <MonsterEye cx="65" cy="43" closed={eyesClosed} fill={eyeFill} />

        {state.brows && (
          <>
            <path d="M29 33 L39 30" stroke="#111" strokeWidth="3" strokeLinecap="round" />
            <path d="M61 30 L71 33" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          </>
        )}
        <path d={state.mouth} fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" />
        {mood === "hungry" && <path d="M46 73 L50 78 L54 73" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {mood === "success" && <path d="M69 26 L74 31 L84 18" fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
        {mood === "error" && <path d="M74 20 L84 30 M84 20 L74 30" stroke="#111" strokeWidth="4" strokeLinecap="round" />}
        {state.blush && (
          <>
            <circle cx="27" cy="59" r="4" fill="#FF8C7A" opacity="0.58" />
            <circle cx="73" cy="59" r="4" fill="#FF8C7A" opacity="0.58" />
          </>
        )}
        {[31, 39, 47, 55, 63, 71].map((x, index) => (
          <path
            key={x}
            d={`M${x} ${index % 2 ? 25 : 29} l-2 5`}
            stroke={index % 3 === 0 ? "#D9F06B" : "#73BCEB"}
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
        {Accessory && <Accessory />}
      </svg>
    </span>
  );
}

export function MonsterBuddy({
  mood = "default",
  accessory = "menu",
  title,
  text,
  className = "",
  compact = false,
}) {
  return (
    <div className={`flex items-center gap-3 rounded-[22px] border border-line bg-canvas p-3 ${className}`}>
      <HumiMonster mood={mood} accessory={accessory} size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <p className="text-sm font-black leading-5 text-ink">{title}</p>
        {text && <p className="mt-1 text-xs font-bold leading-5 text-ink/52">{text}</p>}
      </div>
    </div>
  );
}

export function MonsterEmptyState({
  mood = "thinking",
  accessory = "menu",
  title,
  text,
  action,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-[22px] border border-line bg-canvas p-4 text-left sm:flex-row sm:items-center ${className}`}>
      <HumiMonster mood={mood} accessory={accessory} size="md" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-black text-ink">{title}</p>
        {text && <p className="mt-1 text-sm font-bold leading-6 text-ink/52">{text}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

function MonsterEye({ cx, cy, closed, fill }) {
  if (closed) {
    return <path d={`M${cx - 5} ${cy} Q${cx} ${cy + 5} ${cx + 5} ${cy}`} fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />;
  }
  return (
    <>
      <circle cx={cx} cy={cy} r="8" fill="#FFFDF5" stroke="#111" strokeWidth="3" />
      <circle cx={cx + 1.5} cy={cy + 1} r="3.5" fill={fill} />
    </>
  );
}

function BasketAccessory() {
  return (
    <g transform="translate(58 67)">
      <path d="M4 8 H28 L25 24 H7 Z" fill="#D9F06B" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M10 8 C11 -1 21 -1 22 8" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function MenuAccessory() {
  return (
    <g transform="translate(61 66)">
      <path d="M4 0 H27 V28 H4 Z" fill="#FFFDF5" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M10 8 H21 M10 15 H21 M10 22 H17" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function SpatulaAccessory() {
  return (
    <g transform="translate(10 61) rotate(-18)">
      <path d="M12 4 H26 V16 H12 Z" fill="#CDEBFF" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M19 16 V39" stroke="#111" strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

function FridgeAccessory() {
  return (
    <g transform="translate(62 63)">
      <path d="M4 0 H27 V31 H4 Z" fill="#CDEBFF" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M4 11 H27 M21 5 V8 M21 17 V22" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="12" cy="20" r="3" fill="#D9F06B" stroke="#111" strokeWidth="2" />
    </g>
  );
}

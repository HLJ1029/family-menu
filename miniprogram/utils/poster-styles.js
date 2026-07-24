const POSTER_STYLES = Object.freeze([
  Object.freeze({ id: "default", label: "清单" }),
  Object.freeze({ id: "theme", label: "主题" }),
]);

function normalizeStyleId(value) {
  const candidate = String(value || "").trim();
  return POSTER_STYLES.some((style) => style.id === candidate) ? candidate : "default";
}

function normalizeStyles(styles = POSTER_STYLES) {
  const normalized = [];
  const seen = new Set();
  for (const candidate of Array.isArray(styles) ? styles : []) {
    const id = typeof candidate === "string" ? candidate : candidate?.id || candidate?.styleId;
    const style = POSTER_STYLES.find((item) => item.id === id);
    if (!style || seen.has(style.id)) continue;
    seen.add(style.id);
    normalized.push(style);
  }
  return normalized;
}

function nextStyleId(current, styles = POSTER_STYLES) {
  const available = normalizeStyles(styles);
  if (available.length === 0) return "default";
  if (available.length === 1) return available[0].id;
  const currentIndex = available.findIndex((style) => style.id === current);
  return available[(Math.max(0, currentIndex) + 1) % available.length].id;
}

function styleLabel(styleId) {
  return POSTER_STYLES.find((style) => style.id === styleId)?.label || POSTER_STYLES[0].label;
}

module.exports = {
  POSTER_STYLES,
  nextStyleId,
  normalizeStyleId,
  normalizeStyles,
  styleLabel,
};

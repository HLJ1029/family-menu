export const SHOPPING_POSTER_STYLES = Object.freeze(["default", "theme"]);

export function nextPosterStyle(currentStyle, styles = SHOPPING_POSTER_STYLES) {
  const available = Array.isArray(styles) ? [...new Set(styles.filter(Boolean))] : [];
  if (available.length === 0) return "";
  const currentIndex = available.indexOf(currentStyle);
  return available[(currentIndex + 1 + available.length) % available.length];
}

import rawRecipes from "../../data/recipes.json" with { type: "json" };
import { publicAssetUrl } from "./assets";
import { attachCookAssist } from "./mealExecution";

export const recipes = rawRecipes.map((recipe) => attachCookAssist(recipe));

const APP_BASE_PATH = import.meta.env?.BASE_URL || "/";
const LEGACY_GITHUB_PAGES_BASE = "/family-menu/";

export function createDefaultWeekPlan() {
  return {
    周一: [],
    周二: [],
    周三: [],
    周四: [],
    周五: [],
    周六: [],
    周日: [],
  };
}

export function createInitialMealCalendar() {
  return {};
}

export function getRecipe(id) {
  return recipes.find((recipe) => recipe.id === id);
}

function placeholderPhotoFor(recipe) {
  const title = escapeSvgText(recipe?.name ?? "菜品");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <rect width="640" height="420" fill="#f5f5f5"/>
      <rect x="34" y="34" width="572" height="352" rx="28" fill="#ffffff" stroke="#ececec" stroke-width="3"/>
      <circle cx="320" cy="174" r="76" fill="#ececec"/>
      <circle cx="292" cy="154" r="18" fill="#6b6b6b"/>
      <circle cx="348" cy="154" r="18" fill="#6b6b6b"/>
      <path d="M252 204c36 32 100 32 136 0" fill="none" stroke="#111111" stroke-width="16" stroke-linecap="round"/>
      <text x="320" y="290" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="34" font-weight="700" fill="#111111">${title}</text>
      <text x="320" y="334" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="24" fill="#6b6b6b">待补真实图</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function photoFor(recipe, options = {}) {
  return photoCandidatesFor(recipe, options)[0];
}

export function photoCandidatesFor(recipe, options = {}) {
  const placeholder = placeholderPhotoFor(recipe);
  if (recipe?.image?.status === "needs-photo" || !recipe?.image?.url) return [placeholder];

  const normalizedUrl = localAssetUrlFor(recipe.image.url);
  const heroUrl = publicAssetUrl(optimizedDishUrlFor(normalizedUrl, "hero"));
  const thumbUrl = publicAssetUrl(optimizedDishUrlFor(normalizedUrl, "thumb"));
  const candidates = options.variant === "thumb"
    ? [thumbUrl, heroUrl, normalizedUrl, placeholder]
    : [heroUrl, normalizedUrl, thumbUrl, placeholder];

  return [...new Set(candidates.filter(Boolean))];
}

export function originalPhotoFor(recipe) {
  if (recipe?.image?.status !== "needs-photo" && recipe?.image?.url) {
    return localAssetUrlFor(recipe.image.url);
  }
  return placeholderPhotoFor(recipe);
}

function localAssetUrlFor(url) {
  if (!url.startsWith(LEGACY_GITHUB_PAGES_BASE)) return url;
  return withAppBase(url.slice(LEGACY_GITHUB_PAGES_BASE.length));
}

function withAppBase(relativePath) {
  const base = APP_BASE_PATH.endsWith("/") ? APP_BASE_PATH : `${APP_BASE_PATH}/`;
  return `${base}${relativePath.replace(/^\/+/, "")}`;
}

function optimizedDishUrlFor(url, variant) {
  if (!url.includes("/assets/dishes/") || !url.endsWith(".png")) {
    return url;
  }

  if (variant === "thumb") {
    return url.replace("/assets/dishes/", "/assets/dishes/thumbs/").replace(/\.png$/, ".webp");
  }

  return url.replace("/assets/dishes/", "/assets/dishes/webp/").replace(/\.png$/, ".webp");
}

export function nutritionFor(recipe) {
  return recipe.nutrition ?? {
    caloriesKcal: 0,
    proteinG: 0,
    fatG: 0,
    carbsG: 0,
    fiberG: 0,
    sodiumMg: 0,
  };
}

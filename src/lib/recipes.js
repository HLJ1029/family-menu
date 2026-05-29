import recipes from "../../data/recipes.json";
import { addDays, formatDateKey } from "./date";

export { recipes };

export function createDefaultWeekPlan() {
  return {
    周一: [recipes[0].id, recipes[1].id],
    周二: [recipes[4].id, recipes[6].id],
    周三: [recipes[10].id, recipes[11].id],
    周四: [recipes[12].id],
    周五: [recipes[15].id, recipes[16].id],
    周六: [recipes[20].id, recipes[21].id],
    周日: [recipes[24].id],
  };
}

export function createInitialMealCalendar() {
  const today = new Date();
  const calendar = {};
  for (let offset = -10; offset <= 21; offset += 1) {
    const date = addDays(today, offset);
    const dateKey = formatDateKey(date);
    if (offset < 0) {
      const first = Math.abs(offset) % recipes.length;
      const second = (first + 7) % recipes.length;
      calendar[dateKey] = offset % 3 === 0 ? [recipes[first].id] : [recipes[first].id, recipes[second].id];
    }
    if (offset === 1) calendar[dateKey] = [recipes[4].id, recipes[6].id];
    if (offset === 2) calendar[dateKey] = [recipes[10].id];
    if (offset === 5) calendar[dateKey] = [recipes[12].id, recipes[16].id];
  }
  return calendar;
}

export function getRecipe(id) {
  return recipes.find((recipe) => recipe.id === id);
}

function placeholderPhotoFor(recipe) {
  const title = escapeSvgText(recipe?.name ?? "菜品");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <rect width="640" height="420" fill="#f5f0e8"/>
      <rect x="34" y="34" width="572" height="352" rx="28" fill="#fffaf3" stroke="#d8c8b0" stroke-width="3"/>
      <circle cx="320" cy="174" r="76" fill="#e7d6be"/>
      <circle cx="292" cy="154" r="18" fill="#b96d3a"/>
      <circle cx="348" cy="154" r="18" fill="#4d8061"/>
      <path d="M252 204c36 32 100 32 136 0" fill="none" stroke="#8e6b4b" stroke-width="16" stroke-linecap="round"/>
      <text x="320" y="290" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="34" font-weight="700" fill="#3f3328">${title}</text>
      <text x="320" y="334" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="24" fill="#8a735f">待补真实图</text>
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
  if (recipe?.image?.status !== "needs-photo" && recipe?.image?.url) {
    if (options.variant === "thumb") {
      return thumbnailUrlFor(recipe.image.url);
    }
    return recipe.image.url;
  }
  return placeholderPhotoFor(recipe);
}

function thumbnailUrlFor(url) {
  if (!url.includes("/assets/dishes/") || !url.endsWith(".png")) {
    return url;
  }

  return url.replace("/assets/dishes/", "/assets/dishes/thumbs/").replace(/\.png$/, ".jpg");
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

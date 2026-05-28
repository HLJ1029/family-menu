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

export function photoFor(recipe) {
  return recipe.image?.url ?? "";
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

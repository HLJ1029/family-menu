import recipes from "../../data/recipes.json";
import { addDays, formatDateKey } from "./date";

const photoByAccent = {
  tomato:
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
  green:
    "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80",
  soup:
    "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80",
  broccoli:
    "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=900&q=80",
  meat:
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80",
  spicy:
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  fresh:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
  soup2:
    "https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?auto=format&fit=crop&w=900&q=80",
  rice:
    "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80",
  eggplant:
    "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80",
};

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
  return photoByAccent[recipe.accent] ?? photoByAccent.fresh;
}

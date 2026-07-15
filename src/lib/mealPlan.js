import { createDefaultWeekPlan } from "./recipes.js";
import { normalizeMealEntries } from "./mealState.js";

export { normalizeMealEntries, normalizeMealLogs } from "./mealState.js";

export const mealSlots = [
  { id: "breakfast", label: "早餐", shortLabel: "早" },
  { id: "lunch", label: "午餐", shortLabel: "午" },
  { id: "dinner", label: "晚餐", shortLabel: "晚" },
];

export const mealSlotIds = mealSlots.map((slot) => slot.id);

export function createEmptyDayMeals() {
  return Object.fromEntries(mealSlotIds.map((slotId) => [slotId, []]));
}

export function normalizeDayMeals(dayMeals = {}) {
  return {
    ...createEmptyDayMeals(),
    ...Object.fromEntries(
      mealSlotIds.map((slotId) => [slotId, normalizeMealEntries(dayMeals?.[slotId])]),
    ),
  };
}

export function normalizeMealPlan(mealPlan = {}) {
  return Object.fromEntries(
    Object.entries(mealPlan ?? {}).map(([dateKey, dayMeals]) => [dateKey, normalizeDayMeals(dayMeals)]),
  );
}

export function createMealPlanFromLegacy({ mealCalendar = {}, weekPlan = {}, todayMenu = [], todayDateKey, currentDay }) {
  const nextPlan = {};
  Object.entries(mealCalendar ?? {}).forEach(([dateKey, recipeIds]) => {
    nextPlan[dateKey] = normalizeDayMeals({
      dinner: normalizeMealEntries((recipeIds ?? []).map((recipeId) => ({ recipeId, quantity: 1 }))),
    });
  });

  if (todayDateKey) {
    nextPlan[todayDateKey] = normalizeDayMeals({
      ...(nextPlan[todayDateKey] ?? {}),
      dinner: normalizeMealEntries(todayMenu),
    });
  }

  if (todayDateKey && currentDay && weekPlan?.[currentDay]?.length && !nextPlan[todayDateKey]?.dinner?.length) {
    nextPlan[todayDateKey] = normalizeDayMeals({
      dinner: normalizeMealEntries(weekPlan[currentDay].map((recipeId) => ({ recipeId, quantity: 1 }))),
    });
  }

  return normalizeMealPlan(nextPlan);
}

export function getDayMeals(mealPlan, dateKey) {
  return normalizeDayMeals(mealPlan?.[dateKey]);
}

export function getSlotEntries(mealPlan, dateKey, slotId) {
  return getDayMeals(mealPlan, dateKey)[slotId] ?? [];
}

export function upsertMealEntry(entries, recipeId, quantity = 1) {
  const safeQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const existing = entries.find((entry) => entry.recipeId === recipeId);
  if (existing) {
    return entries.map((entry) =>
      entry.recipeId === recipeId ? { ...entry, quantity: entry.quantity + safeQuantity } : entry,
    );
  }
  return [...entries, { recipeId, quantity: safeQuantity }];
}

export function removeMealEntry(entries, recipeId) {
  return entries.filter((entry) => entry.recipeId !== recipeId);
}

export function mealPlanToWeekPlan(mealPlan, weekDateKeys = {}) {
  const defaultWeekPlan = createDefaultWeekPlan();
  return Object.fromEntries(
    Object.entries(defaultWeekPlan).map(([day]) => {
      const dateKey = weekDateKeys[day];
      const dinnerEntries = dateKey ? getSlotEntries(mealPlan, dateKey, "dinner") : [];
      return [day, dinnerEntries.map((entry) => entry.recipeId)];
    }),
  );
}

export function mealPlanToCalendar(mealPlan) {
  return Object.fromEntries(
    Object.entries(normalizeMealPlan(mealPlan)).map(([dateKey, dayMeals]) => [
      dateKey,
      mealSlotIds.flatMap((slotId) => dayMeals[slotId].map((entry) => entry.recipeId)),
    ]),
  );
}

export function mealPlanEntriesForGroceries(mealPlan, getSourceLabel) {
  return Object.entries(normalizeMealPlan(mealPlan)).flatMap(([dateKey, dayMeals]) =>
    mealSlotIds.flatMap((slotId) =>
      dayMeals[slotId].map((entry) => ({
        ...entry,
        mealSlot: slotId,
        dateKey,
        source: getSourceLabel?.({ dateKey, slotId }) ?? `${dateKey} ${slotId}`,
      })),
    ),
  );
}

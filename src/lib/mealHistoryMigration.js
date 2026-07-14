const LEGACY_AUTOMATIC_RECIPE_ID = "seaweed-egg-soup";
const LEGACY_AUTOMATIC_MEAL_CUTOFF_MS = Date.parse("2026-07-14T12:53:09.000Z");
const LEGACY_AUTOMATIC_MEAL_SLOTS = ["breakfast", "lunch"];

export function migrateLegacyAutomaticMealSelections({ mealPlan = {}, mealLogs = {} } = {}) {
  const nextMealPlan = { ...(mealPlan ?? {}) };
  const nextMealLogs = { ...(mealLogs ?? {}) };
  const removed = [];

  Object.entries(mealLogs ?? {}).forEach(([dateKey, dayLog]) => {
    const legacySlots = LEGACY_AUTOMATIC_MEAL_SLOTS.filter((slotId) => (
      isLegacyAutomaticMealSlot(dayLog?.meals?.[slotId])
    ));
    if (legacySlots.length === 0) return;

    const nextMeals = { ...(dayLog?.meals ?? {}) };
    legacySlots.forEach((slotId) => {
      delete nextMeals[slotId];
      removed.push({ dateKey, slotId, recipeId: LEGACY_AUTOMATIC_RECIPE_ID });
    });

    const nextDayLog = { ...(dayLog ?? {}) };
    if (Object.keys(nextMeals).length > 0) {
      nextDayLog.meals = nextMeals;
    } else {
      delete nextDayLog.meals;
    }
    if (Object.keys(nextDayLog).some((key) => key !== "updatedAt")) {
      nextMealLogs[dateKey] = nextDayLog;
    } else {
      delete nextMealLogs[dateKey];
    }

    const dayPlan = mealPlan?.[dateKey];
    if (!dayPlan) return;
    const nextDayPlan = { ...dayPlan };
    legacySlots.forEach((slotId) => {
      if (isSingleLegacyRecipe(dayPlan?.[slotId])) nextDayPlan[slotId] = [];
    });
    // Keep the date entry so the general legacy-plan importer cannot restore the removed dish.
    nextMealPlan[dateKey] = nextDayPlan;
  });

  return {
    mealPlan: nextMealPlan,
    mealLogs: nextMealLogs,
    changed: removed.length > 0,
    removed,
  };
}

function isLegacyAutomaticMealSlot(slot) {
  if (slot?.selectionMode === "explicit"
    || slot?.source !== "home"
    || !isSingleLegacyRecipe(slot?.consumedEntries)) return false;
  const recordedAtMs = Date.parse(slot.quickRecordedAt);
  return Number.isFinite(recordedAtMs) && recordedAtMs < LEGACY_AUTOMATIC_MEAL_CUTOFF_MS;
}

function isSingleLegacyRecipe(entries) {
  return Array.isArray(entries)
    && entries.length === 1
    && entries[0]?.recipeId === LEGACY_AUTOMATIC_RECIPE_ID;
}

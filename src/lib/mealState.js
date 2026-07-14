export function normalizeMealEntries(entries = []) {
  return Array.isArray(entries)
    ? entries
      .map((entry) => ({
        recipeId: typeof entry?.recipeId === "string" ? entry.recipeId : typeof entry === "string" ? entry : "",
        quantity: Math.max(1, Number.parseInt(entry?.quantity, 10) || 1),
      }))
      .filter((entry) => entry.recipeId)
    : [];
}

export function normalizeMealLogs(mealLogs = {}) {
  if (!mealLogs || typeof mealLogs !== "object" || Array.isArray(mealLogs)) return {};
  return Object.fromEntries(
    Object.entries(mealLogs)
      .filter(([, dayLog]) => dayLog && typeof dayLog === "object" && !Array.isArray(dayLog))
      .map(([dateKey, dayLog]) => [dateKey, normalizeMealLog(dayLog)]),
  );
}

function normalizeMealLog(dayLog) {
  const nextLog = normalizeEntryLists(dayLog);
  if (!dayLog.meals || typeof dayLog.meals !== "object" || Array.isArray(dayLog.meals)) {
    if ("meals" in dayLog) nextLog.meals = {};
    return nextLog;
  }
  nextLog.meals = Object.fromEntries(
    Object.entries(dayLog.meals)
      .filter(([, meal]) => meal && typeof meal === "object" && !Array.isArray(meal))
      .map(([slotId, meal]) => [slotId, normalizeEntryLists(meal)]),
  );
  return nextLog;
}

function normalizeEntryLists(record) {
  const next = { ...record };
  ["consumedEntries", "plannedEntries"].forEach((key) => {
    if (key in record) next[key] = normalizeMealEntries(record[key]);
  });
  return next;
}

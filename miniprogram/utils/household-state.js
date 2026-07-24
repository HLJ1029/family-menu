const { requestHumi } = require("./request");

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function saveHouseholdStatePatch(patch, context = {}) {
  const householdId = safeId(context.householdId);
  const stateVersion = safeVersion(context.stateVersion);
  const idempotencyKey = safeId(context.idempotencyKey);
  if (!householdId || !stateVersion || !idempotencyKey) {
    return Promise.reject(stateError("state_patch_context_invalid"));
  }
  return requestHumi({
    path: "/state",
    method: "PUT",
    data: { householdId, patch },
    stateVersion,
    idempotencyKey,
  });
}

function getActiveHousehold(bootstrap = {}) {
  const householdId = safeId(bootstrap.activeHouseholdId);
  return (Array.isArray(bootstrap.households) ? bootstrap.households : [])
    .find((household) => household?.id === householdId) || null;
}

function getHouseholdRole(bootstrap = {}) {
  const household = getActiveHousehold(bootstrap);
  return household?.role === "owner" ? "owner" : household ? "member" : "guest";
}

function buildMealDays(mealPlan = {}, options = {}) {
  const dateKeys = sevenDateKeys(mealPlan, options.startDate);
  const pantryNames = pantryNameSet(options.pantrySignals);
  return dateKeys.map((dateKey, index) => {
    const day = mealPlan?.[dateKey] && typeof mealPlan[dateKey] === "object" ? mealPlan[dateKey] : {};
    const breakfast = normalizeMealEntries(day.breakfast);
    const lunch = normalizeMealEntries(day.lunch);
    const dinner = normalizeMealEntries(day.dinner);
    const missingIngredients = uniqueStrings(dinner.flatMap((entry) => (
      normalizeIngredients(entry.ingredients)
        .filter((ingredient) => ingredient.required !== false && !pantryNames.has(normalizeName(ingredient.name)))
        .map((ingredient) => ingredient.name)
    )));
    return {
      dateKey,
      label: index === 0 ? "今天" : WEEKDAY_LABELS[parseLocalDate(dateKey).getDay()],
      breakfast,
      lunch,
      dinner,
      dinnerMinutes: dinner.reduce((total, entry) => total + entryMinutes(entry), 0),
      missingIngredients,
      missingIngredientsText: missingIngredients.join("、"),
    };
  });
}

function deriveGroceryItems(mealPlan = {}, pantrySignals = []) {
  const pantryNames = pantryNameSet(pantrySignals);
  const byKey = new Map();
  Object.keys(mealPlan || {}).sort().forEach((dateKey) => {
    normalizeMealEntries(mealPlan?.[dateKey]?.dinner).forEach((entry) => {
      normalizeIngredients(entry.ingredients).forEach((ingredient) => {
        if (!ingredient.name || ingredient.required === false) return;
        const normalizedName = normalizeName(ingredient.name);
        const normalizedUnit = String(ingredient.unit || "").trim();
        const aggregationKey = `${normalizedName}:${normalizedUnit}`;
        const current = byKey.get(aggregationKey) || {
          id: ingredientKey(aggregationKey),
          name: ingredient.name,
          amountValue: 0,
          amountLabels: [],
          unit: normalizedUnit,
          status: pantryNames.has(normalizedName) ? "maybe_home" : "pending",
          sourceRecipeIds: [],
        };
        const numericAmount = Number(ingredient.amount);
        if (Number.isFinite(numericAmount) && numericAmount > 0) {
          current.amountValue += numericAmount * Math.max(1, Number(entry.quantity) || 1);
        } else if (ingredient.amount) {
          current.amountLabels.push(String(ingredient.amount).trim());
        }
        if (entry.recipeId && !current.sourceRecipeIds.includes(entry.recipeId)) {
          current.sourceRecipeIds.push(entry.recipeId);
        }
        byKey.set(aggregationKey, current);
      });
    });
  });
  return [...byKey.values()]
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: formatAmount(item),
      status: item.status,
      sourceRecipeIds: item.sourceRecipeIds,
    }))
    .sort((left, right) => statusOrder(left.status) - statusOrder(right.status) || left.name.localeCompare(right.name, "zh-CN"));
}

function applyGroceryState(items = [], state = {}) {
  const checkedItems = state.checkedItems && typeof state.checkedItems === "object" ? state.checkedItems : {};
  const claims = state.groceryClaims && typeof state.groceryClaims === "object" ? state.groceryClaims : {};
  return items.map((item) => {
    const claim = claims[item.id] || null;
    const checked = checkedItems[item.id] === true || claim?.status === "done";
    return {
      ...item,
      status: checked ? "bought" : item.status,
      checked,
      claimantId: claim?.memberId || "",
      claimantName: claim?.memberName || "",
      claimStatus: claim?.status || "",
    };
  }).sort((left, right) => statusOrder(left.status) - statusOrder(right.status) || left.name.localeCompare(right.name, "zh-CN"));
}

function createMutationId(prefix = "state") {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${safeId(prefix) || "state"}:${time}:${random}`;
}

function normalizeMealEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object" && safeId(entry.recipeId))
    .slice(0, 16)
    .map((entry) => ({
      ...entry,
      recipeId: safeId(entry.recipeId),
      quantity: Math.max(1, Math.min(12, Number.parseInt(entry.quantity, 10) || 1)),
      title: String(entry.title || entry.name || entry.recipeId || "").trim().slice(0, 80),
      minutes: entryMinutes(entry),
      ingredients: normalizeIngredients(entry.ingredients),
    }));
}

function normalizeIngredients(ingredients) {
  return (Array.isArray(ingredients) ? ingredients : [])
    .filter((ingredient) => ingredient && typeof ingredient === "object" && String(ingredient.name || "").trim())
    .slice(0, 40)
    .map((ingredient) => ({
      name: String(ingredient.name).trim().slice(0, 80),
      amount: ingredient.amount,
      unit: String(ingredient.unit || "").trim().slice(0, 24),
      required: ingredient.required !== false,
    }));
}

function entryMinutes(entry = {}) {
  const parsed = Number(entry.minutes ?? entry.timeMinutes ?? entry.cookAssist?.totalMinutes);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(480, Math.round(parsed))) : 0;
}

function sevenDateKeys(mealPlan, startDate) {
  const normalizedStart = startDate ? parseLocalDate(startDate) : new Date();
  if (Number.isNaN(normalizedStart.getTime())) return Object.keys(mealPlan || {}).sort().slice(0, 7);
  normalizedStart.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => formatDateKey(new Date(normalizedStart.getTime() + index * DAY_MS)));
}

function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : new Date(value);
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function pantryNameSet(signals) {
  const values = Array.isArray(signals)
    ? signals
    : signals && typeof signals === "object"
      ? Object.values(signals)
      : [];
  return new Set(values.map((item) => normalizeName(item?.name || item?.itemName || item?.key)).filter(Boolean));
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function ingredientKey(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `ingredient:${(hash >>> 0).toString(36)}`;
}

function formatAmount(item) {
  const pieces = [];
  if (item.amountValue > 0) {
    const value = Number.isInteger(item.amountValue) ? String(item.amountValue) : item.amountValue.toFixed(1);
    pieces.push(`${value}${item.unit ? ` ${item.unit}` : ""}`);
  }
  pieces.push(...uniqueStrings(item.amountLabels));
  return pieces.join(" + ");
}

function statusOrder(status) {
  return { pending: 0, maybe_home: 1, bought: 2 }[status] ?? 3;
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,180}$/.test(value) ? value : "";
}

function safeVersion(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,180}$/.test(value) ? value : "";
}

function stateError(code) {
  const error = new Error(code);
  error.code = code;
  error.retryable = false;
  return error;
}

module.exports = {
  applyGroceryState,
  buildMealDays,
  createMutationId,
  deriveGroceryItems,
  getActiveHousehold,
  getHouseholdRole,
  saveHouseholdStatePatch,
};

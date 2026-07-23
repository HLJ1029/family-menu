const certifiedRecipes = require("../data/certified-recipes");
const legacyRecipes = require("../data/legacy-recipes");
const { requestHumi } = require("./request");

const storagePrefix = "humi:recommendation:v1:";

function buildRecommendationScope(input = {}) {
  const context = recommendationContext(input);
  const householdId = clean(context.householdId || "guest") || "guest";
  const dateKey = clean(context.dateKey);
  const mode = context.mode === "legacy" ? "legacy" : "meal_execution";
  const effortTier = mode === "meal_execution" ? clean(context.effortTier) : clean(context.effortTier || "legacy");
  const contextFingerprint = clean(context.contextFingerprint);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw codedError("date_key_invalid");
  if (mode === "meal_execution" && !["quick_15", "easy_30", "normal"].includes(effortTier)) {
    throw codedError("effort_tier_invalid");
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(contextFingerprint)) throw codedError("context_fingerprint_invalid");
  return [householdId, dateKey, mode, effortTier, contextFingerprint].join(":");
}

function rotateGuestDinner(input = {}) {
  const context = recommendationContext(input);
  const scopeKey = buildRecommendationScope(context);
  const storage = context.storage || wx;
  const storageKey = `${storagePrefix}${scopeKey}`;
  const stored = normalizeRotation(storage.getStorageSync(storageKey), scopeKey, context.householdId || "guest");
  const targetDishCount = Number(context.targetDishCount) || defaultDishCount(context);
  const safe = catalogFor(context).filter((recipe) => matches(recipe, context));
  if (safe.length < targetDishCount) throw codedError("recommendation_candidates_exhausted");
  if ((context.action || "initial") === "initial" && stored.seenRecipeIds.length >= targetDishCount) {
    return toGroup(stored.seenRecipeIds.slice(-targetDishCount), stored, targetDishCount, false, "current_group");
  }

  let cycle = stored.cycle;
  let seen = [...stored.seenRecipeIds];
  let exhausted = false;
  let choices = safe.filter((recipe) => !seen.includes(recipe.id));
  if (choices.length < targetDishCount) {
    cycle += 1;
    exhausted = true;
    seen = [];
    const protectedIds = new Set(stored.recentGroupIds.slice(-2).flatMap((groupId) => groupId.split("+")));
    choices = safe.filter((recipe) => !protectedIds.has(recipe.id));
  }
  const scored = choices
    .map((recipe) => ({ recipe, score: score(recipe, context) }))
    .sort((left, right) => (
      right.score - left.score
      || hash(`${scopeKey}:${cycle}:${left.recipe.id}`) - hash(`${scopeKey}:${cycle}:${right.recipe.id}`)
      || left.recipe.id.localeCompare(right.recipe.id)
    ));
  const best = scored[0]?.score || 0;
  const highScoreWindow = scored.filter((item) => item.score >= best - 12);
  const selected = chooseComplementaryGroup(
    highScoreWindow.length >= targetDishCount ? highScoreWindow : scored,
    targetDishCount,
  );
  const recipeIds = selected.map((item) => item.recipe.id);
  const next = {
    scopeKey,
    householdId: clean(context.householdId || "guest") || "guest",
    seenRecipeIds: [...seen, ...recipeIds],
    recentGroupIds: [...stored.recentGroupIds, [...recipeIds].sort().join("+")].slice(-10),
    cycle,
    updatedAt: new Date().toISOString(),
    upstreamStateVersion: stored.upstreamStateVersion,
  };
  storage.setStorageSync(storageKey, next);
  return toGroup(recipeIds, next, targetDishCount, exhausted, exhausted ? "cycle_reset_recent_protected" : "balanced_unseen");
}

async function recommendDinner(input = {}) {
  const context = recommendationContext({
    ...input,
    mode: "meal_execution",
    contextFingerprint: input.contextFingerprint || buildContextFingerprint(input),
  });
  const canUseServer = Boolean(clean(context.householdId) && context.householdId !== "guest");
  if (!canUseServer) return localRecommendation(context);
  try {
    const group = await requestHumi({
      path: "/recommendations/dinner",
      method: "POST",
      data: {
        householdId: context.householdId,
        dateKey: context.dateKey,
        mode: "meal_execution",
        effortTier: context.effortTier,
        action: normalizeAction(context.action),
        contextFingerprint: context.contextFingerprint,
        stateVersion: clean(context.stateVersion),
      },
      idempotencyKey: [
        "recommendation",
        clean(context.dateKey),
        clean(context.effortTier),
        normalizeAction(context.action),
        clean(context.stateVersion),
      ].filter(Boolean).join(":"),
      expectedUserId: clean(context.expectedUserId),
      timeoutMs: Number(context.timeoutMs) || 4500,
    });
    if (
      !validateRecommendationGroup(group, context)
      || !clean(group.recommendationId)
      || !clean(group.stateVersion)
    ) throw codedError("recommendation_group_invalid");
    try {
      seedLocalDinnerRotation(context, group);
    } catch (_) {
      // A blocked local cursor write must not hide a valid authoritative response.
    }
    return { ...group, source: "server" };
  } catch (error) {
    if (Number(error?.status) === 409 || error?.code === "recommendation_state_conflict" || error?.code === "meal_run_locked") {
      throw error;
    }
    if (!isFallbackError(error)) throw error;
    return localRecommendation(context, error?.code || "request_failed");
  }
}

function localRecommendation(context, fallbackReason = "") {
  const group = rotateGuestDinner({ ...context, storage: context.storage || wx });
  const isAuthenticatedScope = Boolean(clean(context.householdId) && context.householdId !== "guest");
  return {
    ...group,
    stateVersion: isAuthenticatedScope
      ? clean(context.stateVersion) || clean(group.upstreamStateVersion)
      : group.stateVersion,
    source: "local_fallback",
    fallbackReason: clean(fallbackReason),
  };
}

function seedLocalDinnerRotation(input = {}, group = {}) {
  const context = recommendationContext(input);
  const storage = context.storage || wx;
  const scopeKey = buildRecommendationScope(context);
  const storageKey = `${storagePrefix}${scopeKey}`;
  const targetDishCount = Number(context.targetDishCount) || defaultDishCount(context);
  if (!validateRecommendationGroup(group, { ...context, targetDishCount })) {
    throw codedError("recommendation_group_invalid");
  }
  const stored = normalizeRotation(
    storage.getStorageSync(storageKey),
    scopeKey,
    context.householdId || "guest",
  );
  const recipeIds = [...new Set(group.recipeIds.map(clean).filter(Boolean))];
  const groupId = [...recipeIds].sort().join("+");
  const next = {
    scopeKey,
    householdId: clean(context.householdId || "guest") || "guest",
    seenRecipeIds: [
      ...stored.seenRecipeIds.filter((recipeId) => !recipeIds.includes(recipeId)),
      ...recipeIds,
    ].slice(-200),
    recentGroupIds: [
      ...stored.recentGroupIds.filter((recentGroupId) => recentGroupId !== groupId),
      groupId,
    ].slice(-10),
    cycle: stored.cycle,
    updatedAt: new Date().toISOString(),
    upstreamStateVersion: clean(group.stateVersion || stored.upstreamStateVersion),
  };
  storage.setStorageSync(storageKey, next);
  return next;
}

function buildContextFingerprint(input = {}) {
  const context = recommendationContext(input);
  const state = {
    familyProfile: {
      familySize: Number(context.familyProfile?.familySize || 2),
      allergies: normalizedStrings(context.familyProfile?.allergies),
      dislikes: normalizedStrings(context.familyProfile?.dislikes),
    },
    familyMembers: (context.familyMembers || []).map((member) => ({
      id: clean(member?.id || member?.memberId),
      allergies: normalizedStrings(member?.preference?.allergies),
      dislikes: normalizedStrings(member?.preference?.dislikes),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    dislikedRecipeIds: normalizedStrings(context.dislikedRecipeIds),
    pantryItems: normalizedStrings((context.pantryItems || []).map((item) => item?.name || item)),
    wantToEatItems: normalizedStrings((context.wantToEatItems || []).map((item) => item?.name || item?.title || item)),
  };
  const serialized = JSON.stringify(state);
  return [0, 1, 2, 3].map((index) => hash(`${index}:${serialized}`).toString(16).padStart(8, "0")).join("");
}

function normalizeAction(value) {
  return ["initial", "next", "reject"].includes(value) ? value : "initial";
}

function normalizedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))].sort();
}

function isFallbackError(error = {}) {
  return Number(error.status) === 0
    || error.retryable === true
    || ["network_error", "request_timeout", "recommendation_group_invalid", "request_failed"].includes(error.code);
}

function validateRecommendationGroup(group, input = {}) {
  const context = recommendationContext(input);
  if (!Array.isArray(group?.recipeIds) || new Set(group.recipeIds).size !== group.recipeIds.length) return false;
  const targetDishCount = Number(context.targetDishCount) || defaultDishCount(context);
  if (group.recipeIds.length !== targetDishCount) return false;
  const catalog = catalogFor(context);
  return group.recipeIds.every((id) => {
    const recipe = catalog.find((candidate) => candidate.id === id);
    return Boolean(recipe && matches(recipe, context));
  });
}

function recommendationContext(input = {}) {
  const householdState = input.bootstrap?.householdState ?? input.householdState ?? {};
  return {
    ...householdState,
    ...input,
    householdId: input.householdId || input.bootstrap?.activeHouseholdId || householdState.householdId || "guest",
    familyProfile: { ...(householdState.familyProfile ?? {}), ...(input.familyProfile ?? {}) },
    familyMembers: [
      ...(Array.isArray(householdState.familyMembers) ? householdState.familyMembers : []),
      ...(Array.isArray(input.familyMembers) ? input.familyMembers : []),
    ],
  };
}

function defaultDishCount(input = {}) {
  if (input.mode !== "legacy") return input.effortTier === "quick_15" ? 1 : 2;
  const familySize = Math.max(1, Number.parseInt(input.familyProfile?.familySize, 10) || 2);
  return familySize <= 1 ? 1 : familySize >= 5 ? 3 : 2;
}

function catalogFor(input) {
  if (Array.isArray(input.catalog)) return input.catalog;
  return input.mode === "legacy" ? legacyRecipes : certifiedRecipes;
}

function matches(recipe, input) {
  const mode = input.mode === "legacy" ? "legacy" : "meal_execution";
  if (mode === "meal_execution" && (
    recipe.cookAssist?.status !== "certified"
    || recipe.cookAssist.effortTier !== input.effortTier
  )) return false;
  if ((input.dislikedRecipeIds || []).includes(recipe.id)) return false;
  const signals = [
    ...(input.familyProfile?.allergies || []),
    ...(input.familyProfile?.dislikes || []),
    ...(input.allergySignals || []),
    ...(input.dislikeSignals || []),
    ...(input.familyMembers || []).flatMap((member) => [
      ...(member?.preference?.allergies || []),
      ...(member?.preference?.dislikes || []),
    ]),
  ].map((value) => clean(value).toLowerCase()).filter(Boolean);
  const expanded = signals.flatMap(expandHardSignal);
  return !expanded.some((signal) => String(recipe.searchText || "").includes(signal));
}

function expandHardSignal(signal) {
  const normalized = clean(signal).replace(/[，。,.；;、\s]/g, "");
  if (!normalized) return [];
  const groups = [
    ["海鲜", ["海鲜", "鱼", "虾", "贝", "蟹"]],
    ["太辣", ["辣"]],
    ["鸡蛋", ["鸡蛋", "蛋"]],
    ["蛋类", ["鸡蛋", "蛋"]],
    ["豆制品", ["豆腐", "豆浆", "豆皮", "豆制品"]],
    ["坚果", ["坚果", "花生", "核桃", "杏仁", "腰果"]],
    ["乳糖", ["乳糖", "牛奶", "奶酪", "奶"]],
  ];
  const expanded = [];
  for (const [canonical, aliases] of groups) {
    if (normalized.includes(canonical) || aliases.some((alias) => normalized.includes(alias))) expanded.push(...aliases);
  }
  if (expanded.length > 0) return [...new Set(expanded)];
  const stripped = normalized
    .replace(/^(?:我|本人|孩子|小孩|宝宝)?对/, "")
    .replace(/(?:严重)?(?:过敏|不耐受|不能吃|吃不了|忌口|不吃)$/g, "");
  return stripped ? [stripped] : [];
}

function score(recipe, input) {
  let total = (Array.isArray(input.recommendationFeedback) ? input.recommendationFeedback : []).reduce((scoreValue, item) => {
    const ids = [item?.recipeId, ...(Array.isArray(item?.recipeIds) ? item.recipeIds : [])];
    if (!ids.includes(recipe.id)) return scoreValue;
    return scoreValue + feedbackScoreDelta(item.value || item.reasonId);
  }, 100);
  const pantryNames = new Set((input.pantryItems || []).map((item) => clean(item?.name || item).toLowerCase()));
  total += (recipe.ingredients || []).filter((ingredient) => pantryNames.has(clean(ingredient?.name).toLowerCase())).length * 3;
  const wanted = (input.wantToEatItems || []).map((item) => clean(item?.name || item?.title || item).toLowerCase());
  const haystack = clean(recipe.searchText || [
    recipe.name,
    recipe.title,
    recipe.description,
    ...(recipe.categories || []),
    ...(recipe.tags || []),
    ...(recipe.ingredients || []).map((ingredient) => ingredient?.name),
  ].filter(Boolean).join(" ")).toLowerCase();
  if (wanted.some((signal) => signal && haystack.includes(signal))) total += 8;
  if (recipe.cookAssist?.cleanupLevel === "low") total += input.effortTier === "quick_15" ? 4 : 1;
  return total;
}

function feedbackScoreDelta(value) {
  if (value === "want_again") return 12;
  if (["change_it", "change_next_time"].includes(value)) return -7;
  if (["too_hard", "too_much_effort", "too_much_work"].includes(value)) return -12;
  if (["family_dislikes", "hard_to_buy", "wrong_taste", "not_dinner"].includes(value)) return -7;
  return 0;
}

function chooseComplementaryGroup(scored, targetDishCount) {
  const selected = [];
  const categories = new Set();
  for (const item of scored) {
    if (selected.length >= targetDishCount) break;
    const category = item.recipe.categories?.[0] || "";
    if (selected.length > 0 && category && categories.has(category)) continue;
    selected.push(item);
    if (category) categories.add(category);
  }
  if (selected.length < targetDishCount) {
    for (const item of scored) {
      if (selected.length >= targetDishCount) break;
      if (!selected.some((entry) => entry.recipe.id === item.recipe.id)) selected.push(item);
    }
  }
  return selected;
}

function toGroup(recipeIds, rotation, targetDishCount, exhausted, reasonCode) {
  return {
    recommendationId: pseudoUuid(`${rotation.scopeKey}:${rotation.cycle}:${recipeIds.join("+")}`),
    recipeIds,
    cycle: rotation.cycle,
    groupIndex: Math.max(0, Math.floor(rotation.seenRecipeIds.length / targetDishCount) - 1),
    exhausted,
    reasonCode,
    stateVersion: String(hash(JSON.stringify(rotation))),
    upstreamStateVersion: clean(rotation.upstreamStateVersion),
  };
}

function normalizeRotation(value, scopeKey, householdId) {
  if (!value || value.scopeKey !== scopeKey) {
    return {
      scopeKey,
      householdId: clean(householdId || "guest"),
      seenRecipeIds: [],
      recentGroupIds: [],
      cycle: 0,
      updatedAt: "",
      upstreamStateVersion: "",
    };
  }
  return {
    scopeKey,
    householdId: clean(value.householdId || householdId || "guest"),
    seenRecipeIds: [...new Set(Array.isArray(value.seenRecipeIds) ? value.seenRecipeIds.map(clean).filter(Boolean) : [])],
    recentGroupIds: [...new Set(Array.isArray(value.recentGroupIds) ? value.recentGroupIds.map(clean).filter(Boolean) : [])].slice(-10),
    cycle: Math.max(0, Number(value.cycle) || 0),
    updatedAt: clean(value.updatedAt),
    upstreamStateVersion: clean(value.upstreamStateVersion),
  };
}

function clean(value) {
  return String(value || "").trim();
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pseudoUuid(value) {
  const hex = [0, 1, 2, 3].map((index) => hash(`${index}:${value}`).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  buildContextFingerprint,
  buildRecommendationScope,
  recommendDinner,
  rotateGuestDinner,
  seedLocalDinnerRotation,
  validateRecommendationGroup
};

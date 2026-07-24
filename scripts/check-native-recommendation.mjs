import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import vm from "node:vm";
import { createServer as createViteServer } from "vite";

const smokeDirectory = await mkdtemp(join(tmpdir(), "humi-native-recommendation-"));
process.env.HUMI_API_DATA_FILE = join(smokeDirectory, "api.json");
process.env.HUMI_SESSION_SECRET = "humi-native-recommendation-secret";
process.env.HUMI_WECHAT_MOCK = "1";
process.env.HUMI_MEAL_EXECUTION_ENABLED = "1";
process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS = "*";

const {
  buildRecommendationScope,
  selectBalancedDinner,
  validateRecommendationGroup,
  formatBusinessDateKey,
  legacyRecommendationCatalog,
} = await import("../api/recommendation-rotation.js");
const { HumiStore } = await import("../api/store.js");
const { createHumiApiServer } = await import("../api/server.js");
const vite = await createViteServer({ logLevel: "silent", server: { middlewareMode: true } });
const {
  buildLocalBalancedDinner,
  collectDinnerRecommendationFeedback,
  requestBalancedDinnerWithFallback,
  rotateLocalDinner,
  seedLocalDinnerRotation,
  validateDinnerRecommendationIds,
} = await vite.ssrLoadModule("/src/lib/recommendation/rules.js");
const { recipes: h5Recipes } = await vite.ssrLoadModule("/src/lib/recipes.js");
const { formatBusinessDateKey: formatH5BusinessDateKey } = await vite.ssrLoadModule("/src/lib/date.js");
const guestStorage = new Map();
const nativeRuntime = createMiniProgramRuntime(guestStorage);
const certifiedRecipes = nativeRuntime.load(path.resolve("miniprogram/data/certified-recipes.js"));
const nativeRecommendation = nativeRuntime.load(path.resolve("miniprogram/utils/recommendation.js"));
const {
  buildRecommendationScope: buildNativeRecommendationScope,
  rotateGuestDinner,
  seedLocalDinnerRotation: seedNativeDinnerRotation,
} = nativeRecommendation;
const mainSource = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
const nativeLegacyCatalogPath = path.resolve("miniprogram/data/legacy-recipes.js");
const h5StateSnapshotSource = mainSource.slice(
  mainSource.indexOf("const humiStateSnapshot = useMemo"),
  mainSource.indexOf("useEffect(() =>", mainSource.indexOf("const humiStateSnapshot = useMemo")),
);
const h5ApplyStateSource = mainSource.slice(
  mainSource.indexOf("function applyHumiStateEnvelope"),
  mainSource.indexOf("function trackProductEvent"),
);

const contextFingerprint = createHash("sha256").update("safe-family-context").digest("base64url");
const baseInput = {
  householdId: "household-a",
  dateKey: "2026-07-22",
  mode: "meal_execution",
  effortTier: "quick_15",
  contextFingerprint,
  targetDishCount: 2,
  catalog: certifiedRecipes,
  familyProfile: { familySize: 2, allergies: [], dislikes: [] },
  familyMembers: [],
  recommendationFeedback: [],
};

assert.equal(
  (mainSource.match(/void loadMealExecutionRecommendation\(/g) ?? []).length,
  2,
  "meal execution needs one effect-owned initial load and one explicit rotate handler without a duplicate tier request",
);
assert.equal(
  mainSource.includes("if (!signedIn || !family?.id || mealExecutionExperienceEnabled"),
  false,
  "guest legacy Tonight must hydrate a local current group before explicit rotation",
);
assert.equal(
  mainSource.includes("collectDinnerRecommendationFeedback"),
  true,
  "H5 must merge completed MealRun feedback into dinner recommendation scoring",
);
const scopedRequestSource = mainSource.slice(
  mainSource.indexOf("async function requestScopedDinnerRecommendation"),
  mainSource.indexOf("async function loadMealExecutionRecommendation"),
);
assert.equal(
  scopedRequestSource.includes("pantryItems: pantryItems.map"),
  true,
  "the recommendation fingerprint must include normalized pantry scoring input",
);
assert.equal(
  mainSource.includes("legacyRecommendationRequestRef"),
  true,
  "legacy initial, next, and reject responses need a shared stale-response request guard",
);
assert.equal(
  scopedRequestSource.includes("recommendationFeedbackOverride"),
  true,
  "legacy reject must score the just-recorded feedback without starting a second initial request",
);
assert.equal(
  scopedRequestSource.includes('value: item.value || item.reasonId || ""'),
  true,
  "legacy feedback reasons must participate in the H5 recommendation fingerprint",
);
assert.equal(
  mainSource.includes("error: error.message"),
  false,
  "recommendation telemetry must not upload free-text error messages",
);
assert.equal(
  mainSource.includes("const todayDateKey = formatBusinessDateKey(new Date())"),
  true,
  "H5 Today must use the same Asia/Shanghai business date as the server",
);
assert.equal(
  h5StateSnapshotSource.includes("familyMembers: familyMembers.map"),
  true,
  "H5 state saves must write formal memberId and preference records",
);
assert.equal(
  h5ApplyStateSource.includes("state.familyMembers"),
  true,
  "H5 state hydration must read shared formal-member preferences",
);
assert.equal(
  h5ApplyStateSource.includes("setFamilyMembers"),
  true,
  "H5 state hydration must merge canonical household members with shared preferences",
);
assert.equal(certifiedRecipes.length, 30, "native projection must contain exactly 30 certified recipes");
assert.equal(
  fs.existsSync(nativeLegacyCatalogPath),
  true,
  "native legacy guest rotation must ship the complete legacy recipe projection",
);
const nativeLegacyRecipes = nativeRuntime.load(nativeLegacyCatalogPath);
assert.equal(nativeLegacyRecipes.length, 138, "native legacy guest rotation must use all 138 recipes");
assert.equal(legacyRecommendationCatalog.length, 138, "legacy mode must retain the complete 138-recipe catalog");
for (const [familySize, expectedDishCount] of [[1, 1], [2, 2], [5, 3]]) {
  const householdId = `dish-count-household-${familySize}`;
  const countInput = {
    ...baseInput,
    householdId,
    dateKey: `2026-07-${String(10 + familySize).padStart(2, "0")}`,
    mode: "legacy",
    effortTier: "legacy",
    targetDishCount: undefined,
    contextFingerprint: createHash("sha256").update(`dish-count-${familySize}`).digest("base64url"),
    familyProfile: { familySize, allergies: [], dislikes: [] },
    catalog: nativeLegacyRecipes,
  };
  const countStore = new HumiStore(join(smokeDirectory, `dish-count-${familySize}.json`));
  await countStore.load();
  countStore.data.users = [{ id: `dish-count-owner-${familySize}` }];
  countStore.data.households = [{
    id: householdId,
    ownerId: `dish-count-owner-${familySize}`,
    members: [{ memberId: `dish-count-owner-${familySize}`, role: "owner", status: "formal" }],
  }];
  countStore.data.householdStates = {
    [householdId]: { familyProfile: countInput.familyProfile, familyMembers: [] },
  };
  const serverCountGroup = await countStore.rotateDinnerRecommendation(
    `dish-count-owner-${familySize}`,
    countInput,
  );
  const h5CountGroup = buildLocalBalancedDinner({ ...countInput, catalog: h5Recipes });
  const nativeCountGroup = rotateGuestDinner(countInput);
  for (const [runtimeLabel, group] of [
    ["server", serverCountGroup],
    ["H5", h5CountGroup],
    ["native guest", nativeCountGroup],
  ]) {
    assert.equal(
      group.recipeIds.length,
      expectedDishCount,
      `${runtimeLabel} legacy default must recommend ${expectedDishCount} dishes for familySize ${familySize}`,
    );
  }
}
assert.deepEqual(
  Array.from(certifiedRecipes, (recipe) => recipe.id),
  Array.from(certifiedRecipes, (recipe) => recipe.id).sort(),
  "native projection must be deterministic and sorted by recipe id",
);
for (const recipe of certifiedRecipes) {
  assert.equal(recipe.cookAssist.status, "certified");
  assert(recipe.title && recipe.thumbnailUrl);
  assert(Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0);
  assert(Array.isArray(recipe.cookAssist.steps) && recipe.cookAssist.steps.length > 0);
  assert(Array.isArray(recipe.cookAssist.dependencies));
  assert(Array.isArray(recipe.cookAssist.downgradeRecipeIds));
  assert(Array.isArray(recipe.cookAssist.substitutions));
  assert(recipe.cookAssist.readyStaple);
}

for (const effortTier of ["quick_15", "easy_30", "normal"]) {
  let rotation = null;
  const groups = [];
  for (let index = 0; index < 5; index += 1) {
    const result = selectBalancedDinner({
      ...baseInput,
      effortTier,
      action: index === 0 ? "initial" : "next",
      rotation,
    });
    groups.push(result.group);
    rotation = result.rotation;
    assert.equal(
      validateRecommendationGroup(result.group, { ...baseInput, effortTier }),
      true,
      `${effortTier} group ${index + 1} must obey hard constraints`,
    );
  }
  const ids = groups.flatMap((group) => group.recipeIds);
  assert.equal(new Set(ids).size, ids.length, `${effortTier} must produce five groups without a repeated recipe`);

  const refreshed = selectBalancedDinner({ ...baseInput, effortTier, action: "initial", rotation });
  assert.deepEqual(refreshed.group.recipeIds, groups.at(-1).recipeIds, "refresh must return the current group without advancing");
  assert.deepEqual(refreshed.rotation, rotation, "refresh must not mutate the rotation cursor");

  const exhausted = selectBalancedDinner({ ...baseInput, effortTier, action: "next", rotation });
  assert.equal(exhausted.group.cycle, 1, "the sixth group must start a new cycle");
  assert.equal(exhausted.group.exhausted, true, "cycle rollover must be explicit");
  const protectedIds = new Set(groups.slice(-2).flatMap((group) => group.recipeIds));
  assert.equal(
    exhausted.group.recipeIds.some((recipeId) => protectedIds.has(recipeId)),
    false,
    "a new cycle must protect the most recent two groups",
  );
}

const eggSafe = selectBalancedDinner({
  ...baseInput,
  effortTier: "easy_30",
  action: "initial",
  familyProfile: { familySize: 2, allergies: ["鸡蛋"], dislikes: [] },
});
assert.equal(
  validateRecommendationGroup(eggSafe.group, {
    ...baseInput,
    effortTier: "easy_30",
    familyProfile: { familySize: 2, allergies: ["鸡蛋"], dislikes: [] },
  }),
  true,
  "allergy exclusion is a hard constraint",
);
assert.equal(
  eggSafe.group.recipeIds.some((id) => certifiedRecipes.find((recipe) => recipe.id === id).searchText.includes("鸡蛋")),
  false,
);

const dislikedRecipeId = "tomato-egg";
const dislikeSafe = selectBalancedDinner({
  ...baseInput,
  action: "initial",
  dislikedRecipeIds: [dislikedRecipeId],
});
assert.equal(dislikeSafe.group.recipeIds.includes(dislikedRecipeId), false, "explicit recipe dislikes must never be recommended");
assert.equal(
  validateRecommendationGroup({ recipeIds: [dislikedRecipeId] }, { ...baseInput, dislikedRecipeIds: [dislikedRecipeId] }),
  false,
  "invalid server groups must be rejected locally",
);

const scopes = [
  buildRecommendationScope(baseInput),
  buildRecommendationScope({ ...baseInput, householdId: "household-b" }),
  buildRecommendationScope({ ...baseInput, dateKey: "2026-07-23" }),
  buildRecommendationScope({ ...baseInput, effortTier: "easy_30" }),
  buildRecommendationScope({ ...baseInput, contextFingerprint: createHash("sha256").update("other").digest("base64url") }),
];
assert.equal(new Set(scopes).size, scopes.length, "household/date/tier/context scopes must be isolated");

const feedbackCatalog = certifiedRecipes.filter((recipe) => recipe.cookAssist.effortTier === "quick_15");
const feedbackFavorite = feedbackCatalog.at(-1).id;
const feedbackResult = selectBalancedDinner({
  ...baseInput,
  action: "initial",
  recommendationFeedback: [{ recipeId: feedbackFavorite, value: "want_again" }],
});
assert(
  feedbackResult.group.recipeIds.includes(feedbackFavorite),
  "positive feedback must affect ranking inside the high-score window",
);
const feedbackNext = selectBalancedDinner({
  ...baseInput,
  action: "next",
  recommendationFeedback: [{ recipeId: feedbackFavorite, value: "want_again" }],
  rotation: feedbackResult.rotation,
});
assert.equal(
  feedbackNext.group.recipeIds.includes(feedbackFavorite),
  false,
  "feedback must not permit same-cycle repetition",
);

const hardAvoidProbes = [
  {
    label: "free-form nut allergy",
    recipeId: "kung-pao-chicken",
    familyProfile: { allergies: ["坚果过敏"], dislikes: [] },
    familyMembers: [],
  },
  {
    label: "member seafood allergy suffix",
    recipeId: "salt-pepper-shrimp",
    familyProfile: { allergies: [], dislikes: [] },
    familyMembers: [{ preference: { allergies: ["海鲜过敏"], dislikes: [] } }],
  },
  {
    label: "free-form egg allergy prefix and suffix",
    recipeId: "tomato-egg",
    familyProfile: { allergies: ["对鸡蛋过敏"], dislikes: [] },
    familyMembers: [],
  },
  {
    label: "combined seafood and peanut allergy excludes shrimp",
    recipeId: "salt-pepper-shrimp",
    familyProfile: { allergies: ["海鲜和花生过敏"], dislikes: [] },
    familyMembers: [],
  },
  {
    label: "combined seafood and peanut allergy excludes peanuts",
    recipeId: "kung-pao-chicken",
    familyProfile: { allergies: ["海鲜和花生过敏"], dislikes: [] },
    familyMembers: [],
  },
];
for (const probe of hardAvoidProbes) {
  const serverInput = {
    ...baseInput,
    mode: "legacy",
    effortTier: "legacy",
    targetDishCount: 1,
    catalog: legacyRecommendationCatalog,
    familyProfile: probe.familyProfile,
    familyMembers: probe.familyMembers,
  };
  assert.equal(
    validateRecommendationGroup({ recipeIds: [probe.recipeId] }, serverInput),
    false,
    `server must reject ${probe.label}`,
  );
  assert.equal(
    validateDinnerRecommendationIds({ recipeIds: [probe.recipeId] }, {
      ...serverInput,
      catalog: h5Recipes,
    }),
    false,
    `H5 must reject ${probe.label}`,
  );
  assert.equal(
    nativeRuntime.load(path.resolve("miniprogram/utils/recommendation.js")).validateRecommendationGroup(
      { recipeIds: [probe.recipeId] },
      {
        ...serverInput,
        catalog: certifiedRecipes,
      },
    ),
    false,
    `native guest must reject ${probe.label}`,
  );
}

const nativeBootstrapPreferenceInput = {
  ...baseInput,
  mode: "legacy",
  effortTier: "legacy",
  targetDishCount: 1,
  bootstrap: {
    activeHouseholdId: "native-bootstrap-family",
    householdState: {
      familyProfile: { familySize: 2, allergies: [], dislikes: [] },
      familyMembers: [{
        memberId: "formal-native-member",
        preference: { allergies: ["鸡蛋"], dislikes: [] },
      }],
    },
  },
};
assert.equal(
  nativeRecommendation.validateRecommendationGroup(
    { recipeIds: ["tomato-egg"] },
    nativeBootstrapPreferenceInput,
  ),
  false,
  "native guest recommendation must read formal-member preferences from bootstrap household state",
);

const portableRecipe = (id, category, ingredient) => ({
  id,
  name: id,
  title: id,
  description: "",
  categories: [category],
  tags: [],
  ingredients: [{ name: ingredient, required: true }],
  searchText: `${id} ${category} ${ingredient}`,
  cookAssist: {
    status: "certified",
    effortTier: "quick_15",
    cleanupLevel: "medium",
  },
});
const scoringCatalog = [
  portableRecipe("a-no-pantry", "肉菜", "鸡肉"),
  portableRecipe("z-pantry", "素菜", "土豆"),
];
const scoringInput = {
  ...baseInput,
  householdId: "guest",
  contextFingerprint: "f2aaaaaaaaaaaaaa",
  targetDishCount: 1,
  catalog: scoringCatalog,
  pantryItems: [{ name: "土豆" }],
};
assert.deepEqual(
  selectBalancedDinner(scoringInput).group.recipeIds,
  ["z-pantry"],
  "server scoring must prefer a safe pantry match",
);
assert.deepEqual(
  buildLocalBalancedDinner(scoringInput).recipeIds,
  ["z-pantry"],
  "H5 fallback scoring must prefer the same safe pantry match",
);
assert.deepEqual(
  Array.from(rotateGuestDinner(scoringInput).recipeIds),
  ["z-pantry"],
  "native guest scoring must prefer the same safe pantry match",
);

const complementaryCatalog = [
  portableRecipe("a-meat", "肉菜", "鸡肉"),
  portableRecipe("b-meat", "肉菜", "猪肉"),
  portableRecipe("c-veg", "素菜", "青菜"),
];
const complementaryInput = {
  ...baseInput,
  householdId: "guest",
  contextFingerprint: "c1bbbbbbbbbbbbbb",
  targetDishCount: 2,
  catalog: complementaryCatalog,
  recommendationFeedback: [{ recipeId: "a-meat", value: "want_again" }],
};
for (const [runtimeLabel, group] of [
  ["server", selectBalancedDinner(complementaryInput).group],
  ["H5", buildLocalBalancedDinner(complementaryInput)],
  ["native guest", rotateGuestDinner(complementaryInput)],
]) {
  const categories = group.recipeIds.map((id) => complementaryCatalog.find((recipe) => recipe.id === id).categories[0]);
  assert.equal(new Set(categories).size, 2, `${runtimeLabel} must choose a complementary two-dish group`);
}

const feedbackSemanticsCatalog = [
  portableRecipe("feedback-a", "肉菜", "鸡肉"),
  portableRecipe("feedback-b", "素菜", "青菜"),
];
for (const value of ["change_it", "too_hard"]) {
  const input = {
    ...baseInput,
    householdId: "guest",
    contextFingerprint: createHash("sha256").update(`feedback:${value}`).digest("base64url"),
    targetDishCount: 1,
    catalog: feedbackSemanticsCatalog,
    recommendationFeedback: [],
  };
  const serverBaseline = selectBalancedDinner(input).group.recipeIds[0];
  assert.notEqual(
    selectBalancedDinner({
      ...input,
      recommendationFeedback: [{ recipeId: serverBaseline, value }],
    }).group.recipeIds[0],
    serverBaseline,
    `server ${value} must reduce the next-round score`,
  );
  const h5Baseline = buildLocalBalancedDinner(input).recipeIds[0];
  assert.notEqual(
    buildLocalBalancedDinner({
      ...input,
      recommendationFeedback: [{ recipeId: h5Baseline, value }],
    }).recipeIds[0],
    h5Baseline,
    `H5 ${value} must reduce the next-round score`,
  );
  const nativeStorageKey = `humi:recommendation:v1:${buildNativeRecommendationScope(input)}`;
  guestStorage.delete(nativeStorageKey);
  const nativeBaseline = rotateGuestDinner(input).recipeIds[0];
  guestStorage.delete(nativeStorageKey);
  assert.notEqual(
    rotateGuestDinner({
      ...input,
      recommendationFeedback: [{ recipeId: nativeBaseline, value }],
    }).recipeIds[0],
    nativeBaseline,
    `native guest ${value} must reduce the next-round score`,
  );
}

const aggregatedFeedback = collectDinnerRecommendationFeedback({
  recommendationFeedback: [{
    recipeIds: ["legacy-recipe"],
    reasonId: "too_much_work",
  }],
  mealRuns: [
    {
      id: "completed-feedback",
      householdId: "household-a",
      status: "completed",
      recipeIds: ["tomato-egg"],
      feedback: [{ userId: "member-a", value: "change_next_time", updatedAt: "2026-07-22T12:00:00.000Z" }],
    },
    {
      id: "other-household",
      householdId: "household-b",
      status: "completed",
      recipeIds: ["salt-pepper-shrimp"],
      feedback: [{ userId: "member-b", value: "want_again" }],
    },
  ],
  householdId: "household-a",
});
assert.deepEqual(
  aggregatedFeedback.map((item) => ({ recipeIds: item.recipeIds, value: item.value })),
  [
    { recipeIds: ["legacy-recipe"], value: "too_hard" },
    { recipeIds: ["tomato-egg"], value: "change_it" },
  ],
  "H5 feedback aggregation must canonicalize legacy and completed MealRun feedback",
);

assert.equal(
  formatBusinessDateKey(new Date("2026-07-22T16:30:00.000Z"), "Asia/Shanghai"),
  "2026-07-23",
  "server dinner date must cross at Asia/Shanghai midnight, not UTC midnight",
);
assert.equal(
  formatBusinessDateKey(new Date("2026-07-22T15:59:59.000Z"), "Asia/Shanghai"),
  "2026-07-22",
);
assert.equal(
  formatH5BusinessDateKey(new Date("2026-07-22T16:30:00.000Z")),
  "2026-07-23",
  "H5 business date must cross at Asia/Shanghai midnight even when the process TZ is UTC",
);

const guestStorageCountBeforeRotation = guestStorage.size;
const guestGroups = [];
for (let index = 0; index < 5; index += 1) {
  guestGroups.push(rotateGuestDinner({
    ...baseInput,
    householdId: "",
    action: index === 0 ? "initial" : "next",
  }));
}
assert.equal(
  new Set(guestGroups.flatMap((group) => group.recipeIds)).size,
  guestGroups.flatMap((group) => group.recipeIds).length,
  "guest rotation must share the server no-repeat semantics",
);
const guestRefresh = rotateGuestDinner({ ...baseInput, householdId: "", action: "initial" });
assert.equal(
  JSON.stringify(guestRefresh.recipeIds),
  JSON.stringify(guestGroups.at(-1).recipeIds),
  "guest refresh must not advance",
);
assert.equal(
  guestStorage.size,
  guestStorageCountBeforeRotation + 1,
  "guest rotation must persist one scoped cursor",
);

const invalidServerFallback = await requestBalancedDinnerWithFallback({
  requestServer: async () => ({ recipeIds: ["not-certified"] }),
  serverPayload: baseInput,
  localInput: baseInput,
  validateServerGroup: (group) => validateRecommendationGroup(group, baseInput),
});
assert.equal(invalidServerFallback.source, "local_fallback");
assert.equal(validateRecommendationGroup(invalidServerFallback.group, baseInput), true);
const networkFallback = await requestBalancedDinnerWithFallback({
  requestServer: async () => {
    throw new TypeError("Failed to fetch");
  },
  serverPayload: baseInput,
  localInput: baseInput,
  validateServerGroup: (group) => validateRecommendationGroup(group, baseInput),
});
assert.equal(networkFallback.source, "local_fallback", "network failure must immediately use local balanced fallback");
const normalizedNetworkFallback = await requestBalancedDinnerWithFallback({
  requestServer: async () => {
    throw new Error("同步连接失败，请检查网络后重试。");
  },
  serverPayload: baseInput,
  localInput: baseInput,
  validateServerGroup: (group) => validateRecommendationGroup(group, baseInput),
});
assert.equal(
  normalizedNetworkFallback.source,
  "local_fallback",
  "normalized Humi API connectivity errors must also use the local fallback",
);

const h5GuestStorage = createStringStorage();
const h5GuestGroups = [];
for (let index = 0; index < 5; index += 1) {
  h5GuestGroups.push(rotateLocalDinner({
    ...baseInput,
    action: index === 0 ? "initial" : "next",
    storage: h5GuestStorage,
  }));
}
assert.equal(
  new Set(h5GuestGroups.flatMap((group) => group.recipeIds)).size,
  h5GuestGroups.flatMap((group) => group.recipeIds).length,
  "H5 guest fallback must rotate through five groups without same-cycle repetition",
);
assert.equal(
  JSON.stringify(rotateLocalDinner({ ...baseInput, action: "initial", storage: h5GuestStorage }).recipeIds),
  JSON.stringify(h5GuestGroups.at(-1).recipeIds),
  "H5 page refresh must recover the current local group without advancing",
);

assert.equal(
  typeof seedLocalDinnerRotation,
  "function",
  "H5 must expose a scoped server-success cursor merge for local fallback",
);
assert.equal(
  typeof seedNativeDinnerRotation,
  "function",
  "native must expose a scoped server-success cursor merge for local fallback",
);
for (const effortTier of ["quick_15", "easy_30", "normal"]) {
  await verifyH5ServerToOfflineRotation(effortTier);
  await verifyNativeServerToOfflineRotation(effortTier);
}
verifyFallbackScopeIsolation();

const feedbackStoreInput = {
  householdId: "feedback-household",
  dateKey: "2026-07-25",
  mode: "legacy",
  effortTier: "legacy",
  action: "initial",
  contextFingerprint: createHash("sha256").update("completed-meal-feedback").digest("base64url"),
};
const feedbackBaseline = await selectWithCompletedMealFeedback("", "feedback-baseline");
for (const value of ["want_again", "change_it", "too_hard"]) {
  const selected = await selectWithCompletedMealFeedback(value, `feedback-${value}`);
  assert.equal(
    selected.recipeIds.includes(feedbackBaseline.recipeIds[0]),
    value === "want_again",
    `server must apply completed MealRun ${value} to the next recommendation`,
  );
}

const store = new HumiStore(join(smokeDirectory, "rotation-store.json"));
await store.load();
store.data.users = [{ id: "owner-a" }];
store.data.households = [{
  id: "household-a",
  ownerId: "owner-a",
  members: [{ memberId: "owner-a", role: "owner", status: "formal" }],
}];
store.data.householdStates = {
  "household-a": {
    familyProfile: { familySize: 2, allergies: [], dislikes: [] },
    recommendationFeedback: [],
  },
};
const persistedInitial = await store.rotateDinnerRecommendation("owner-a", { ...baseInput, action: "initial" });
const persistedNext = await store.rotateDinnerRecommendation("owner-a", {
  ...baseInput,
  action: "next",
  stateVersion: persistedInitial.stateVersion,
});
assert.notDeepEqual(persistedNext.recipeIds, persistedInitial.recipeIds);
const diskState = JSON.parse(await readFile(join(smokeDirectory, "rotation-store.json"), "utf8"));
assert.equal(diskState.recommendationRotations.length, 1);
assert.deepEqual(
  Object.keys(diskState.recommendationRotations[0]).sort(),
  ["cycle", "householdId", "recentGroupIds", "scopeKey", "seenRecipeIds", "updatedAt"].sort(),
  "rotation persistence must contain only the approved cursor fields",
);
await assert.rejects(
  () => store.rotateDinnerRecommendation("owner-a", {
    ...baseInput,
    action: "next",
    stateVersion: persistedInitial.stateVersion,
  }),
  (error) => error.code === "recommendation_state_conflict",
  "stale rotation writes must not advance the cursor",
);
await assert.rejects(
  () => store.rotateDinnerRecommendation("owner-a", {
    ...baseInput,
    action: "next",
    stateVersion: "",
  }),
  (error) => error.code === "recommendation_state_conflict",
  "an existing server cursor must require its stateVersion before advancing",
);

const concurrentInput = { ...baseInput, dateKey: "2026-07-24", action: "initial" };
const concurrentInitial = await store.rotateDinnerRecommendation("owner-a", concurrentInput);
const concurrentResults = await Promise.allSettled([
  store.rotateDinnerRecommendation("owner-a", {
    ...concurrentInput,
    action: "next",
    stateVersion: concurrentInitial.stateVersion,
  }),
  store.rotateDinnerRecommendation("owner-a", {
    ...concurrentInput,
    action: "next",
    stateVersion: concurrentInitial.stateVersion,
  }),
]);
assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(
  concurrentResults.filter((result) => result.status === "rejected" && result.reason.code === "recommendation_state_conflict").length,
  1,
  "atomic rotation persistence must allow only one concurrent advance for a stateVersion",
);

store.data.recommendationRotations.push({
  scopeKey: "expired",
  householdId: "household-a",
  seenRecipeIds: [],
  recentGroupIds: [],
  cycle: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
});
for (let index = 0; index < 22; index += 1) {
  store.data.recommendationRotations.push({
    scopeKey: `scope-${index}`,
    householdId: "household-a",
    seenRecipeIds: [],
    recentGroupIds: [],
    cycle: 0,
    updatedAt: new Date(Date.now() - index * 1000).toISOString(),
  });
}
store.pruneRecommendationRotations();
assert.equal(
  store.data.recommendationRotations.filter((rotation) => rotation.householdId === "household-a").length,
  20,
  "only the 20 most recent recommendation scopes may remain per household",
);
assert.equal(
  store.data.recommendationRotations.some((rotation) => rotation.scopeKey === "expired"),
  false,
  "recommendation scopes older than 14 days must be pruned",
);

store.data.mealRuns = [{
  id: "cooking-run",
  householdId: "household-a",
  dateKey: baseInput.dateKey,
  mealSlot: "dinner",
  status: "cooking",
}];
await assert.rejects(
  () => store.rotateDinnerRecommendation("owner-a", { ...baseInput, action: "next" }),
  (error) => error.code === "meal_run_locked",
  "active cooking must refuse recommendation replacement",
);
store.data.mealRuns[0].status = "completed";
await assert.rejects(
  () => store.rotateDinnerRecommendation("owner-a", { ...baseInput, action: "next" }),
  (error) => error.code === "meal_run_locked",
  "completed dinner must refuse recommendation replacement",
);

const memberStartInput = {
  ...baseInput,
  dateKey: "2026-07-26",
  contextFingerprint: createHash("sha256").update("formal-member-start-lock").digest("base64url"),
  action: "initial",
};
store.data.households[0].members.push({ memberId: "member-start-a", role: "member", status: "formal" });
const beforeMemberStart = await store.rotateDinnerRecommendation("owner-a", memberStartInput);
const memberStartedRun = await store.createMealRun("owner-a", {
  householdId: "household-a",
  dateKey: memberStartInput.dateKey,
  mealSlot: "dinner",
  effortTier: "quick_15",
  recipeIds: beforeMemberStart.recipeIds,
  idempotencyKey: "formal-member-start-lock-run",
});
await store.startMealRun("member-start-a", memberStartedRun.mealRun.id, {
  version: 1,
  steps: [{
    id: `${beforeMemberStart.recipeIds[0]}:step:1`,
    attention: "active",
    endsAt: "2026-07-26T10:01:00.000Z",
  }],
});
await assert.rejects(
  () => store.rotateDinnerRecommendation("owner-a", {
    ...memberStartInput,
    action: "next",
    stateVersion: beforeMemberStart.stateVersion,
  }),
  (error) => error.code === "meal_run_locked",
  "a formal member starting dinner between display and rotate must lock the owner's stale recommendation",
);

const server = createHumiApiServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const session = await apiRequest(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: "recommendation-owner" },
  });
  const profile = await apiRequest(`${baseUrl}/identity/profile`, {
    method: "PUT",
    session,
    body: { displayName: "推荐主厨", avatarKey: "humi-avatar-family-f-01" },
  });
  session.user = profile.user;
  const household = await apiRequest(`${baseUrl}/households`, {
    method: "POST",
    session,
    body: { householdName: "推荐测试家" },
  });
  const householdId = household.family.id;
  await apiRequest(`${baseUrl}/state`, {
    method: "PUT",
    session,
    body: {
      householdId,
      state: {
        householdId,
        familyProfile: { familySize: 2, allergies: [], dislikes: [] },
        recommendationFeedback: [],
      },
    },
  });
  const payload = { ...baseInput, householdId, action: "initial" };
  const first = await apiRequest(`${baseUrl}/recommendations/dinner`, {
    method: "POST",
    session,
    body: payload,
  });
  assert.match(first.recommendationId, /^[0-9a-f-]{36}$/);
  assert.equal(first.recipeIds.length, 1, "quick_15 server plans must stay a one-dish minimum-action plan");
  const refreshed = await apiRequest(`${baseUrl}/recommendations/dinner`, {
    method: "POST",
    session,
    body: { ...payload, stateVersion: first.stateVersion },
  });
  assert.deepEqual(refreshed.recipeIds, first.recipeIds);
  const next = await apiRequest(`${baseUrl}/recommendations/dinner`, {
    method: "POST",
    session,
    body: { ...payload, action: "next", stateVersion: first.stateVersion },
  });
  assert.notDeepEqual(next.recipeIds, first.recipeIds);
  const mealRun = await apiRequest(`${baseUrl}/meal-runs`, {
    method: "POST",
    session,
    body: {
      householdId,
      dateKey: payload.dateKey,
      mealSlot: "dinner",
      effortTier: "quick_15",
      recipeIds: next.recipeIds,
      idempotencyKey: "recommendation-lock-run",
    },
  });
  const startedMealRun = await apiRequest(`${baseUrl}/meal-runs/${mealRun.mealRun.id}/start`, {
    method: "POST",
    session,
    body: {},
  });
  await assertApiRejected(`${baseUrl}/recommendations/dinner`, {
    method: "POST",
    session,
    body: { ...payload, action: "next", stateVersion: next.stateVersion },
  }, 409, "meal_run_locked");
  await apiRequest(`${baseUrl}/meal-runs/${mealRun.mealRun.id}/complete`, {
    method: "POST",
    session,
    body: { timelineVersion: startedMealRun.mealRun.timelineVersion },
  });
  await assertApiRejected(`${baseUrl}/recommendations/dinner`, {
    method: "POST",
    session,
    body: { ...payload, action: "next", stateVersion: next.stateVersion },
  }, 409, "meal_run_locked");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("Native recommendation rotation check passed.");
await vite.close();
await rm(smokeDirectory, { recursive: true, force: true });

async function apiRequest(url, { method = "GET", session, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

async function assertApiRejected(url, options, status, code) {
  await assert.rejects(
    () => apiRequest(url, options),
    (error) => error.status === status && error.code === code,
    `${options.method || "GET"} ${url} should reject with ${status} ${code}`,
  );
}

function createMiniProgramRuntime(storage, requestHandler = null) {
  const modules = new Map();
  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: (key) => storage.delete(key),
    request: (options) => {
      if (!requestHandler) throw new Error(`Unexpected native request: ${options.url}`);
      Promise.resolve(requestHandler(options)).catch(() => options.fail?.());
    },
  };
  function load(file) {
    const resolved = path.resolve(file);
    if (modules.has(resolved)) return modules.get(resolved).exports;
    const record = { exports: {} };
    modules.set(resolved, record);
    const source = fs.readFileSync(resolved, "utf8");
    const context = vm.createContext({
      module: record,
      exports: record.exports,
      require: (specifier) => load(path.resolve(path.dirname(resolved), `${specifier}.js`)),
      wx,
      console,
      Date,
      JSON,
      Math,
      Set,
      Map,
      structuredClone,
    });
    new vm.Script(source, { filename: resolved }).runInContext(context);
    return record.exports;
  }
  return { load };
}

async function verifyH5ServerToOfflineRotation(effortTier) {
  const storage = createStringStorage();
  const targetDishCount = effortTier === "quick_15" ? 1 : 2;
  const input = {
    ...baseInput,
    householdId: `h5-server-fallback-${effortTier}`,
    effortTier,
    targetDishCount,
    contextFingerprint: createHash("sha256").update(`h5-server-fallback-${effortTier}`).digest("base64url"),
    storage,
  };
  const authoritative = selectBalancedDinner({ ...input, action: "initial" });
  const online = await requestBalancedDinnerWithFallback({
    requestServer: async () => authoritative.group,
    serverPayload: { ...input, action: "initial" },
    localInput: { ...input, action: "initial" },
    validateServerGroup: (group) => validateDinnerRecommendationIds(group, input),
  });
  assert.equal(online.source, "server");

  const refreshed = await requestBalancedDinnerWithFallback({
    requestServer: async () => ({ recipeIds: [...authoritative.group.recipeIds] }),
    serverPayload: { ...input, action: "initial", stateVersion: authoritative.group.stateVersion },
    localInput: { ...input, action: "initial", stateVersion: authoritative.group.stateVersion },
    validateServerGroup: (group) => validateDinnerRecommendationIds(group, input),
  });
  assert.equal(refreshed.source, "local_fallback", "a server group without cursor metadata is invalid");
  assert.deepEqual(
    refreshed.group.recipeIds,
    online.group.recipeIds,
    `H5 ${effortTier} invalid-response refresh must not advance the seeded current group`,
  );

  const groups = [online.group];
  for (let index = 1; index < 5; index += 1) {
    const offline = await requestBalancedDinnerWithFallback({
      requestServer: async () => {
        if (index === 1) throw new TypeError("Failed to fetch");
        return { recipeIds: [...authoritative.group.recipeIds] };
      },
      serverPayload: { ...input, action: "next", stateVersion: authoritative.group.stateVersion },
      localInput: { ...input, action: "next", stateVersion: authoritative.group.stateVersion },
      validateServerGroup: (group) => validateDinnerRecommendationIds(group, input),
    });
    assert.equal(offline.source, "local_fallback");
    groups.push(offline.group);
  }
  const shownIds = groups.flatMap((group) => group.recipeIds);
  assert.equal(
    new Set(shownIds).size,
    shownIds.length,
    `H5 ${effortTier} server→offline must show five groups without repeating a dish`,
  );

  let restoredRequest = null;
  const restoredServer = selectBalancedDinner({
    ...input,
    action: "next",
    rotation: authoritative.rotation,
  }).group;
  const restored = await requestBalancedDinnerWithFallback({
    requestServer: async (payload) => {
      restoredRequest = payload;
      return restoredServer;
    },
    serverPayload: { ...input, action: "next", stateVersion: authoritative.group.stateVersion },
    localInput: { ...input, action: "next", stateVersion: authoritative.group.stateVersion },
    validateServerGroup: (group) => validateDinnerRecommendationIds(group, input),
  });
  assert.equal(restored.source, "local_fallback", `H5 ${effortTier} must keep one local cursor after an authenticated fallback`);
  assert.equal(restoredRequest, null, `H5 ${effortTier} must not resume a stale server cursor inside the same scope`);
}

async function verifyNativeServerToOfflineRotation(effortTier) {
  const storage = new Map();
  storage.set("humi:native-session:v1", {
    accessToken: `native-token-${effortTier}`,
    expiresAt: Date.now() + 60_000,
    user: { id: `native-user-${effortTier}`, provider: "wechat" },
  });
  const targetDishCount = effortTier === "quick_15" ? 1 : 2;
  const input = {
    ...baseInput,
    householdId: `native-server-fallback-${effortTier}`,
    effortTier,
    targetDishCount,
    contextFingerprint: createHash("sha256").update(`native-server-fallback-${effortTier}`).digest("base64url"),
    expectedUserId: `native-user-${effortTier}`,
  };
  const authoritative = selectBalancedDinner({ ...input, action: "initial" });
  let mode = "server";
  let restoredRequest = null;
  const runtime = createMiniProgramRuntime(storage, ({ data, success, fail }) => {
    if (mode === "server") {
      success({ statusCode: 200, data: authoritative.group });
      return;
    }
    if (mode === "invalid") {
      success({ statusCode: 200, data: { recipeIds: [...authoritative.group.recipeIds] } });
      return;
    }
    if (mode === "restored") {
      restoredRequest = data;
      const restoredServer = selectBalancedDinner({
        ...input,
        action: "next",
        rotation: authoritative.rotation,
      }).group;
      success({ statusCode: 200, data: restoredServer });
      return;
    }
    fail(new Error("network down"));
  });
  const { recommendDinner } = runtime.load(path.resolve("miniprogram/utils/recommendation.js"));
  mode = "network";
  const offlineFirst = await recommendDinner({
    ...input,
    dateKey: "2026-07-21",
    contextFingerprint: createHash("sha256").update(`native-offline-first-${effortTier}`).digest("base64url"),
    action: "initial",
    stateVersion: "",
  });
  assert.equal(
    offlineFirst.stateVersion,
    "",
    `native ${effortTier} offline-first fallback must not expose a local hash as an authoritative server cursor`,
  );

  mode = "server";
  const online = await recommendDinner({ ...input, action: "initial", stateVersion: "" });
  assert.equal(online.source, "server");

  mode = "invalid";
  const refreshed = await recommendDinner({
    ...input,
    action: "initial",
    stateVersion: authoritative.group.stateVersion,
  });
  assert.equal(refreshed.source, "local_fallback", "a native server group without cursor metadata is invalid");
  assert.deepEqual(
    Array.from(refreshed.recipeIds),
    Array.from(online.recipeIds),
    `native ${effortTier} invalid-response refresh must not advance the seeded current group`,
  );

  const groups = [online];
  for (let index = 1; index < 5; index += 1) {
    mode = index === 1 ? "network" : "invalid";
    const offline = await recommendDinner({
      ...input,
      action: "next",
      stateVersion: groups.at(-1).stateVersion,
    });
    assert.equal(offline.source, "local_fallback");
    assert.equal(
      offline.stateVersion,
      authoritative.group.stateVersion,
      `native ${effortTier} local fallback must retain the authoritative server stateVersion`,
    );
    groups.push(offline);
  }
  const shownIds = groups.flatMap((group) => Array.from(group.recipeIds));
  assert.equal(
    new Set(shownIds).size,
    shownIds.length,
    `native ${effortTier} server→offline must show five groups without repeating a dish`,
  );

  mode = "restored";
  const restored = await recommendDinner({
    ...input,
    action: "next",
    stateVersion: groups.at(-1).stateVersion,
  });
  assert.equal(restored.source, "local_fallback", `native ${effortTier} must keep one local cursor after an authenticated fallback`);
  assert.equal(restoredRequest, null, `native ${effortTier} must not resume a stale server cursor inside the same scope`);
}

function verifyFallbackScopeIsolation() {
  const dimensions = [
    ["household", { householdId: "scope-other-household" }],
    ["date", { dateKey: "2026-07-23" }],
    ["tier", { effortTier: "easy_30", targetDishCount: 2 }],
    ["context", { contextFingerprint: createHash("sha256").update("scope-other-context").digest("base64url") }],
  ];
  for (const [label, override] of dimensions) {
    const h5Storage = createStringStorage();
    const nativeStorage = new Map();
    const seededInput = {
      ...baseInput,
      householdId: "scope-seeded-household",
      targetDishCount: 1,
      storage: h5Storage,
    };
    const seededGroup = selectBalancedDinner(seededInput).group;
    seedLocalDinnerRotation(seededInput, seededGroup);
    seedNativeDinnerRotation({ ...seededInput, storage: nativeStorageAdapter(nativeStorage) }, seededGroup);

    const isolatedInput = { ...seededInput, ...override };
    const h5Isolated = rotateLocalDinner({ ...isolatedInput, action: "initial" });
    const h5Baseline = rotateLocalDinner({
      ...isolatedInput,
      storage: createStringStorage(),
      action: "initial",
    });
    const nativeIsolated = rotateGuestDinner({
      ...isolatedInput,
      storage: nativeStorageAdapter(nativeStorage),
      action: "initial",
    });
    const nativeBaseline = rotateGuestDinner({
      ...isolatedInput,
      storage: nativeStorageAdapter(new Map()),
      action: "initial",
    });
    assert.deepEqual(
      h5Isolated.recipeIds,
      h5Baseline.recipeIds,
      `H5 ${label} scope must behave like a fresh cursor`,
    );
    assert.deepEqual(
      Array.from(nativeIsolated.recipeIds),
      Array.from(nativeBaseline.recipeIds),
      `native ${label} scope must behave like a fresh cursor`,
    );
  }
}

function nativeStorageAdapter(values) {
  return {
    getStorageSync: (key) => values.get(key),
    setStorageSync: (key, value) => values.set(key, structuredClone(value)),
  };
}

function createStringStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

async function selectWithCompletedMealFeedback(value, fileLabel) {
  const feedbackStore = new HumiStore(join(smokeDirectory, `${fileLabel}.json`));
  await feedbackStore.load();
  feedbackStore.data.users = [{ id: "feedback-owner" }];
  feedbackStore.data.households = [{
    id: feedbackStoreInput.householdId,
    ownerId: "feedback-owner",
    members: [{ memberId: "feedback-owner", role: "owner", status: "formal" }],
  }];
  feedbackStore.data.householdStates = {
    [feedbackStoreInput.householdId]: {
      familyProfile: { familySize: 1, allergies: [], dislikes: [] },
      recommendationFeedback: [],
    },
  };
  if (value) {
    feedbackStore.data.mealRuns = [{
      id: `${fileLabel}-run`,
      householdId: feedbackStoreInput.householdId,
      dateKey: "2026-07-24",
      mealSlot: "dinner",
      status: "completed",
      recipeIds: [feedbackBaseline.recipeIds[0]],
      feedback: [{ userId: "feedback-owner", value }],
      completedAt: "2026-07-24T12:00:00.000Z",
    }];
  }
  return feedbackStore.rotateDinnerRecommendation("feedback-owner", feedbackStoreInput);
}

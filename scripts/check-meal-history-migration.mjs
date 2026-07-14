import assert from "node:assert/strict";
import { migrateLegacyAutomaticMealSelections } from "../src/lib/mealHistoryMigration.js";
import { normalizeMealEntries, normalizeMealLogs } from "../src/lib/mealState.js";

const legacyTimestamp = "2026-07-01T10:30:00.000Z";
const explicitSelectionTimestamp = "2026-07-14T12:53:10.000Z";
const soupEntry = { recipeId: "seaweed-egg-soup", quantity: 1 };
const dinnerEntry = { recipeId: "tomato-egg", quantity: 1 };

assert.deepEqual(normalizeMealEntries([null, undefined, dinnerEntry]), [dinnerEntry]);
assert.deepEqual(normalizeMealLogs({
  "2026-07-14": {
    meals: {
      breakfast: { consumedEntries: [null, soupEntry], plannedEntries: null },
      lunch: null,
    },
  },
}), {
  "2026-07-14": {
    meals: {
      breakfast: { consumedEntries: [soupEntry], plannedEntries: [] },
    },
  },
});

const legacyState = {
  mealPlan: {
    "2026-07-01": {
      breakfast: [soupEntry],
      lunch: [soupEntry],
      dinner: [dinnerEntry],
    },
  },
  mealLogs: {
    "2026-07-01": {
      source: "home",
      confirmation: "all",
      meals: {
        breakfast: { source: "home", consumedEntries: [soupEntry], quickRecordedAt: legacyTimestamp },
        lunch: { source: "home", consumedEntries: [soupEntry], quickRecordedAt: legacyTimestamp },
      },
      updatedAt: legacyTimestamp,
    },
  },
};

const migrated = migrateLegacyAutomaticMealSelections(legacyState);
assert.equal(migrated.changed, true);
assert.deepEqual(migrated.removed.map(({ slotId }) => slotId), ["breakfast", "lunch"]);
assert.deepEqual(migrated.mealPlan["2026-07-01"].breakfast, []);
assert.deepEqual(migrated.mealPlan["2026-07-01"].lunch, []);
assert.deepEqual(migrated.mealPlan["2026-07-01"].dinner, [dinnerEntry]);
assert.equal(migrated.mealLogs["2026-07-01"].meals, undefined);
assert.equal(migrated.mealLogs["2026-07-01"].confirmation, "all");

const realStoredPlanWithoutLegacyLogs = {
  mealPlan: {
    "2026-07-01": {
      breakfast: [soupEntry],
      lunch: [{ ...soupEntry, quantity: 2 }],
      dinner: [dinnerEntry],
    },
    "2026-07-14": {
      breakfast: [{ recipeId: "preserved-egg-pork-congee", quantity: 1 }],
      lunch: [],
      dinner: [],
    },
  },
  mealLogs: {
    "2026-07-14": {
      meals: {
        breakfast: {
          source: "home",
          selectionMode: "explicit",
          consumedEntries: [],
          quickRecordedAt: explicitSelectionTimestamp,
        },
      },
    },
  },
};
const migratedRealStoredPlan = migrateLegacyAutomaticMealSelections(realStoredPlanWithoutLegacyLogs);
assert.equal(migratedRealStoredPlan.changed, true);
assert.deepEqual(migratedRealStoredPlan.removed.map(({ slotId }) => slotId), ["breakfast", "lunch"]);
assert.deepEqual(migratedRealStoredPlan.mealPlan["2026-07-01"].breakfast, []);
assert.deepEqual(migratedRealStoredPlan.mealPlan["2026-07-01"].lunch, []);
assert.deepEqual(migratedRealStoredPlan.mealPlan["2026-07-01"].dinner, [dinnerEntry]);
assert.deepEqual(migratedRealStoredPlan.mealPlan["2026-07-14"], realStoredPlanWithoutLegacyLogs.mealPlan["2026-07-14"]);

const explicitSelection = {
  mealPlan: { "2026-07-14": { breakfast: [soupEntry], lunch: [], dinner: [] } },
  mealLogs: {
    "2026-07-14": {
      meals: {
        breakfast: {
          source: "home",
          selectionMode: "explicit",
          consumedEntries: [soupEntry],
          quickRecordedAt: explicitSelectionTimestamp,
        },
      },
    },
  },
};
assert.deepEqual(migrateLegacyAutomaticMealSelections(explicitSelection), {
  ...explicitSelection,
  changed: false,
  removed: [],
});

const explicitSelectionWithOldTimestamp = structuredClone(explicitSelection);
explicitSelectionWithOldTimestamp.mealLogs["2026-07-14"].meals.breakfast.quickRecordedAt = legacyTimestamp;
assert.equal(migrateLegacyAutomaticMealSelections(explicitSelectionWithOldTimestamp).changed, false);

const ambiguousLegacySelection = {
  mealPlan: { "2026-07-01": { breakfast: [dinnerEntry], lunch: [], dinner: [] } },
  mealLogs: {
    "2026-07-01": {
      meals: {
        breakfast: { source: "home", consumedEntries: [dinnerEntry], quickRecordedAt: legacyTimestamp },
      },
    },
  },
};
assert.equal(migrateLegacyAutomaticMealSelections(ambiguousLegacySelection).changed, false);

const rerun = migrateLegacyAutomaticMealSelections(migrated);
assert.equal(rerun.changed, false);
assert.deepEqual(rerun.mealPlan, migrated.mealPlan);
assert.deepEqual(rerun.mealLogs, migrated.mealLogs);

console.log("Meal history migration checks passed.");

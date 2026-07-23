import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildMealTimeline as buildAuthoritativeTimeline } from "../src/lib/mealExecution.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const certifiedRecipes = loadCommonJs("miniprogram/data/certified-recipes.js");
const {
  buildMealTimeline: buildNativeMealTimeline,
  summarizeMealTimeline,
} = loadCommonJs("miniprogram/utils/meal-timeline.js");
const { buildDinnerPlan } = loadCommonJs("miniprogram/utils/meal-run.js");
const startedAt = "2026-07-23T10:00:00.000Z";
const recipeIdsByTier = new Map();

for (const recipe of certifiedRecipes) {
  const ids = recipeIdsByTier.get(recipe.cookAssist.effortTier) || [];
  ids.push(recipe.id);
  recipeIdsByTier.set(recipe.cookAssist.effortTier, ids);
}

const cases = certifiedRecipes.map((recipe) => [recipe.id]);
for (const ids of recipeIdsByTier.values()) {
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) cases.push([ids[left], ids[right]]);
  }
}
assert.equal(cases.length, 165, "30 singles plus all 135 same-tier pairs must be compared");

for (const recipeIds of cases) {
  const expected = buildAuthoritativeTimeline(recipeIds, { startedAt });
  const actual = buildNativeMealTimeline(recipeIds, { startedAt });
  assert.equal(actual.version, expected.version, label(recipeIds, "version"));
  assert.deepEqual(plain(actual.recipeIds), expected.recipeIds, label(recipeIds, "recipe order"));
  assert.equal(actual.startedAt, expected.startedAt, label(recipeIds, "startedAt"));
  assert.equal(actual.endsAt, expected.endsAt, label(recipeIds, "endsAt"));
  assert.equal(actual.totalSeconds, expected.totalSeconds, label(recipeIds, "totalSeconds"));
  assert.deepEqual(plain(actual.cookware), expected.cookware, label(recipeIds, "cookware"));
  assert.deepEqual(
    plain(actual.steps.map(contractStep)),
    expected.steps.map(contractStep),
    label(recipeIds, "step dependency/resource schedule"),
  );
  const summary = summarizeMealTimeline(actual);
  const expectedActiveSeconds = expected.steps
    .filter((step) => step.attention === "active")
    .reduce((total, step) => total + step.durationSeconds, 0);
  assert.equal(summary.totalSeconds, expected.totalSeconds, label(recipeIds, "summary total"));
  assert.equal(summary.totalMinutes, Math.ceil(expected.totalSeconds / 60), label(recipeIds, "summary total minutes"));
  assert.equal(summary.activeSeconds, expectedActiveSeconds, label(recipeIds, "summary active seconds"));
  assert.equal(summary.activeMinutes, Math.ceil(expectedActiveSeconds / 60), label(recipeIds, "summary active minutes"));
  assert.deepEqual(plain(summary.cookware), expected.cookware, label(recipeIds, "summary cookware"));

  const dinnerPlan = buildDinnerPlan({
    recommendationId: `contract:${recipeIds.join("+")}`,
    recipeIds,
  }, { householdState: { pantryItems: [] } });
  assert.equal(dinnerPlan.timelineVersion, expected.version, label(recipeIds, "DinnerPlan timeline version"));
  assert.equal(dinnerPlan.totalMinutes, Math.ceil(expected.totalSeconds / 60), label(recipeIds, "DinnerPlan total minutes"));
  assert.equal(dinnerPlan.activeMinutes, Math.ceil(expectedActiveSeconds / 60), label(recipeIds, "DinnerPlan active minutes"));
  assert.equal(dinnerPlan.cookwareCount, expected.cookware.length, label(recipeIds, "DinnerPlan cookware count"));
  assert.deepEqual(plain(dinnerPlan.cookware), expected.cookware, label(recipeIds, "DinnerPlan cookware"));
}

console.log(`Native meal timeline matches authoritative ESM schedule for ${cases.length} certified cases.`);

function contractStep(step) {
  return {
    id: step.id,
    recipeId: step.recipeId,
    recipeName: step.recipeName,
    index: step.index,
    phase: step.phase,
    durationSeconds: step.durationSeconds,
    attention: step.attention,
    resources: [...step.resources],
    dependsOn: [...step.dependsOn],
    startOffsetSeconds: step.startOffsetSeconds,
    endOffsetSeconds: step.endOffsetSeconds,
    startsAt: step.startsAt,
    endsAt: step.endsAt,
  };
}

function loadCommonJs(relativePath) {
  const absolutePath = resolveModule(path.join(root, relativePath));
  const module = { exports: {} };
  const source = readFileSync(absolutePath, "utf8");
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    require: (specifier) => loadCommonJs(path.relative(root, resolveModule(path.resolve(path.dirname(absolutePath), specifier)))),
    Date,
    Map,
    Set,
    Math,
    Promise,
    Uint8Array,
    encodeURIComponent,
    console,
    wx: {},
  }, { filename: absolutePath });
  return module.exports;
}

function resolveModule(candidate) {
  for (const option of [candidate, `${candidate}.js`, `${candidate}.json`]) {
    try {
      readFileSync(option);
      return option;
    } catch (_) {
      // Continue.
    }
  }
  return candidate;
}

function label(recipeIds, assertion) {
  return `${recipeIds.join(" + ")}: ${assertion}`;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

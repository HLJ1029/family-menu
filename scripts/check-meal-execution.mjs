import assert from "node:assert/strict";
import recipes from "../data/recipes.json" with { type: "json" };
import cookAssistCatalog from "../data/cook-assist.json" with { type: "json" };
import {
  buildMealTimeline,
  downgradeMealPlan,
  getCertifiedRecipe,
  getCertifiedRecipesForTier,
  remainingTimerSeconds,
} from "../src/lib/mealExecution.js";

const allowedTiers = new Set(["quick_15", "easy_30", "normal"]);
const allowedCookware = new Set(["board", "wok", "pot", "steamer", "rice_cooker"]);
const allowedCleanup = new Set(["low", "medium"]);
const recipeIds = new Set(recipes.map((recipe) => recipe.id));
const certifiedIds = new Set(cookAssistCatalog.map((entry) => entry.id));

assert.equal(cookAssistCatalog.length, 30, "exactly 30 recipes must be cook-assist certified");
assert.equal(certifiedIds.size, 30, "certified recipe ids must be unique");

for (const entry of cookAssistCatalog) {
  assert(recipeIds.has(entry.id), `certified recipe ${entry.id} must exist`);
  assert(allowedTiers.has(entry.effortTier), `${entry.id} has an invalid effort tier`);
  assert(allowedCleanup.has(entry.cleanupLevel), `${entry.id} has an invalid cleanup level`);
  assert(entry.cookware.length >= 1 && entry.cookware.every((item) => allowedCookware.has(item)), `${entry.id} has invalid cookware`);
  assert(entry.stepDurationsSeconds.length >= 1, `${entry.id} needs step timing metadata`);
  assert(entry.stepDurationsSeconds.every((seconds) => Number.isInteger(seconds) && seconds >= 30), `${entry.id} step durations must be positive whole seconds`);
  assert.equal(entry.stepDurationsSeconds.length, recipes.find((recipe) => recipe.id === entry.id).steps.length, `${entry.id} timing count must match recipe steps`);
  assert.equal(entry.stepResources.length, entry.stepDurationsSeconds.length, `${entry.id} resource count must match steps`);
  assert(entry.stepResources.flat().every((item) => allowedCookware.has(item)), `${entry.id} step resources must be valid cookware`);
  assert((entry.downgradeRecipeIds ?? []).every((id) => certifiedIds.has(id)), `${entry.id} downgrade targets must be certified`);
  if (entry.effortTier === "quick_15") assert(entry.totalMinutes <= 15, `${entry.id} must fit the 15-minute tier`);
  if (entry.effortTier === "easy_30") assert(entry.totalMinutes <= 30, `${entry.id} must fit the 30-minute tier`);

  const certified = getCertifiedRecipe(entry.id);
  assert.equal(certified.cookAssist.status, "certified");
  const stepIds = certified.cookAssist.steps.map((step) => step.id);
  assert.equal(new Set(stepIds).size, stepIds.length, `${entry.id} step ids must be unique`);
  const visited = new Set();
  for (const step of certified.cookAssist.steps) {
    assert(step.dependsOn.every((dependency) => visited.has(dependency)), `${entry.id} dependencies must be ordered and acyclic`);
    visited.add(step.id);
  }
}

assert(getCertifiedRecipesForTier("quick_15").length >= 8, "quick tier needs useful choice");
assert(getCertifiedRecipesForTier("easy_30").length >= 8, "easy tier needs useful choice");
assert(getCertifiedRecipesForTier("normal").length >= 8, "normal tier needs useful choice");

const start = "2026-07-22T10:00:00.000Z";
const timeline = buildMealTimeline(["tomato-egg", "seaweed-egg-soup"], { startedAt: start });
assert.equal(timeline.version, 1);
assert.equal(timeline.recipeIds.length, 2);
assert(timeline.steps.length > 0);
assert(timeline.steps.every((step) => Number.isFinite(Date.parse(step.startsAt)) && Number.isFinite(Date.parse(step.endsAt))));

const activeSteps = timeline.steps.filter((step) => step.attention === "active");
for (let index = 1; index < activeSteps.length; index += 1) {
  assert(Date.parse(activeSteps[index].startsAt) >= Date.parse(activeSteps[index - 1].endsAt), "active steps must never overlap");
}

for (let leftIndex = 0; leftIndex < timeline.steps.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < timeline.steps.length; rightIndex += 1) {
    const left = timeline.steps[leftIndex];
    const right = timeline.steps[rightIndex];
    const overlaps = Date.parse(left.startsAt) < Date.parse(right.endsAt) && Date.parse(right.startsAt) < Date.parse(left.endsAt);
    if (!overlaps) continue;
    assert(!left.resources.some((resource) => right.resources.includes(resource)), `overlapping steps may not share ${left.resources.join(",")}`);
  }
}

assert(timeline.steps.some((step, index) => timeline.steps.slice(index + 1).some((candidate) => (
  step.attention === "passive"
  && candidate.attention === "active"
  && Date.parse(candidate.startsAt) < Date.parse(step.endsAt)
  && Date.parse(candidate.endsAt) > Date.parse(step.startsAt)
))), "a passive wait should allow safe active work in parallel");

const timerStep = timeline.steps.find((step) => step.attention === "passive");
assert(timerStep, "timeline must include a passive timer step");
assert.equal(remainingTimerSeconds(timerStep.endsAt, new Date(Date.parse(timerStep.endsAt) - 90_000).toISOString()), 90);
assert.equal(remainingTimerSeconds(timerStep.endsAt, new Date(Date.parse(timerStep.endsAt) + 1_000).toISOString()), 0);

assert.deepEqual(downgradeMealPlan(["tomato-egg", "seaweed-egg-soup"], "remove_optional_side").recipeIds, ["tomato-egg"]);
assert.deepEqual(downgradeMealPlan(["cola-wings"], "lower_effort_recipe").recipeIds, ["tomato-egg"]);
assert.equal(downgradeMealPlan(["tomato-egg"], "ready_staple").readyStaple, "即食米饭");

console.log("Meal execution catalog and timeline checks passed.");

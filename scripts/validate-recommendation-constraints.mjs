import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recipes } from "../src/lib/recipes.js";
import { buildTodayRecommendation, getHardAvoidSignals, recipeMatchesHardAvoid } from "../src/lib/recommendation/rules.js";

assertHardAvoidFromFamilyProfile();
assertHardAvoidFromFamilyMemberPreference();
assertHardAvoidFromFamilyDislikes();
assertHardAvoidFromMemberDislikes();
assertPreciseRecommendationRequiresHumiToken();
assertAiPromptKeepsInventoryInvisible();

console.log("Recommendation hard-avoid validation passed.");

function assertHardAvoidFromFamilyProfile() {
  const context = {
    familyProfile: {
      familySize: 2,
      allergies: ["鸡蛋"],
      dislikes: [],
      tastePreferences: ["家常"],
      goals: ["省时"],
    },
  };
  const hardAvoidSignals = getHardAvoidSignals(context);
  assert.deepEqual(hardAvoidSignals, ["鸡蛋"], "family profile allergies should become hard avoid signals");

  const recommendation = buildTodayRecommendation(context);
  assert(recommendation.recipes.length > 0, "recommendation should still produce safe recipes");
  recommendation.recipes.forEach((recipe) => {
    assert.equal(
      recipeMatchesHardAvoid(recipe, context),
      false,
      `recipe ${recipe.id} should not match hard avoid 鸡蛋`,
    );
  });
  assertNoRecipeContains(recommendation.recipes, "鸡蛋");
}

function assertHardAvoidFromFamilyMemberPreference() {
  const context = {
    familyMembers: [{
      id: "member:1",
      preference: {
        allergies: ["海鲜"],
        dislikes: [],
        likes: [],
        goals: [],
      },
    }],
    familyProfile: {
      familySize: 2,
      allergies: [],
      dislikes: [],
    },
  };
  const hardAvoidSignals = getHardAvoidSignals(context);
  assert.deepEqual(hardAvoidSignals, ["海鲜"], "member allergies should become hard avoid signals");

  const seafoodRecipes = recipes.filter((recipe) => recipeMatchesHardAvoid(recipe, context));
  assert(seafoodRecipes.length > 0, "test data should include seafood recipes to prove filtering");

  const recommendation = buildTodayRecommendation(context);
  assert(recommendation.recipes.length > 0, "recommendation should still produce recipes when seafood is avoided");
  recommendation.recipes.forEach((recipe) => {
    assert.equal(
      recipeMatchesHardAvoid(recipe, context),
      false,
      `recipe ${recipe.id} should not match hard avoid 海鲜`,
    );
  });
}

function assertHardAvoidFromFamilyDislikes() {
  const context = {
    familyProfile: {
      familySize: 2,
      allergies: [],
      dislikes: ["香菜"],
      tastePreferences: ["家常"],
      goals: [],
    },
  };
  const hardAvoidSignals = getHardAvoidSignals(context);
  assert.deepEqual(hardAvoidSignals, ["香菜"], "family profile dislikes should become hard avoid signals");

  const cilantroRecipes = recipes.filter((recipe) => recipeMatchesHardAvoid(recipe, context));
  assert(cilantroRecipes.length > 0, "test data should include cilantro recipes to prove dislike filtering");

  const recommendation = buildTodayRecommendation(context);
  assert(recommendation.recipes.length > 0, "recommendation should still produce recipes when cilantro is avoided");
  recommendation.recipes.forEach((recipe) => {
    assert.equal(
      recipeMatchesHardAvoid(recipe, context),
      false,
      `recipe ${recipe.id} should not match hard avoid 香菜`,
    );
  });
}

function assertHardAvoidFromMemberDislikes() {
  const context = {
    familyMembers: [{
      id: "member:2",
      preference: {
        allergies: [],
        dislikes: ["太辣"],
        likes: [],
        goals: [],
      },
    }],
    familyProfile: {
      familySize: 2,
      allergies: [],
      dislikes: [],
    },
  };
  const hardAvoidSignals = getHardAvoidSignals(context);
  assert.deepEqual(hardAvoidSignals, ["太辣"], "member dislikes should become hard avoid signals");

  const recommendation = buildTodayRecommendation(context);
  assert(recommendation.recipes.length > 0, "recommendation should still produce recipes when spicy food is avoided");
  recommendation.recipes.forEach((recipe) => {
    assert.equal(
      recipeMatchesHardAvoid(recipe, context),
      false,
      `recipe ${recipe.id} should not match hard avoid 太辣`,
    );
  });
}

function assertNoRecipeContains(recipeList, signal) {
  recipeList.forEach((recipe) => {
    const haystack = [
      recipe.name,
      recipe.description,
      ...recipe.categories,
      ...recipe.tags,
      ...recipe.ingredients.map((item) => item.name),
    ].join(" ");
    assert.equal(haystack.includes(signal), false, `recipe ${recipe.id} should not contain ${signal}`);
  });
}

function assertPreciseRecommendationRequiresHumiToken() {
  const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert(
    mainSource.includes("isHumiAiViaApiEnabled && Boolean(humiSession?.accessToken) && !preciseRecommendationBlocked"),
    "precise recommendation availability should require a Humi API access token",
  );
  assert(
    !mainSource.includes("Boolean(session?.user || humiSession?.accessToken) && !preciseRecommendationBlocked"),
    "legacy Supabase session should not unlock Humi API precise recommendations",
  );
}

function assertAiPromptKeepsInventoryInvisible() {
  const recommendSource = readFileSync(new URL("../api/recommend.js", import.meta.url), "utf8");
  ["库存", "常备项"].forEach((forbiddenWord) => {
    assert.equal(
      recommendSource.includes(forbiddenWord),
      false,
      `AI recommendation prompt should not expose ${forbiddenWord} wording`,
    );
  });
}

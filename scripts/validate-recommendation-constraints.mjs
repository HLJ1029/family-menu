import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const vite = await createServer({ logLevel: "silent", server: { middlewareMode: true } });
const { recipes } = await vite.ssrLoadModule("/src/lib/recipes.js");
const {
  buildTodayRecommendation,
  getHardAvoidSignals,
  recipeMatchesHardAvoid,
} = await vite.ssrLoadModule("/src/lib/recommendation/rules.js");

assertHardAvoidFromFamilyProfile();
assertHardAvoidFromFamilyMemberPreference();
assertHardAvoidFromFamilyDislikes();
assertHardAvoidFromMemberDislikes();
assertPreciseRecommendationRequiresHumiToken();
assertAiPromptKeepsInventoryInvisible();
assertUnifiedDinnerRecommendationContract();

console.log("Recommendation hard-avoid validation passed.");
await vite.close();

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
  assert.deepEqual(hardAvoidSignals, ["鸡蛋", "蛋"], "family profile allergies should expand to concrete hard avoid signals");

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
  assert.deepEqual(hardAvoidSignals, ["海鲜", "鱼", "虾", "贝", "蟹"], "member seafood allergy must expand to concrete hard avoid signals");

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
  assert.deepEqual(hardAvoidSignals, ["太辣", "辣"], "spicy dislikes must expand to a concrete hard avoid signal");

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
    mainSource.includes("Boolean(humiSession?.accessToken) && identityComplete && !preciseRecommendationBlocked"),
    "precise recommendation availability should require a Humi API access token",
  );
  assert(
    !mainSource.includes("Boolean(session?.user || humiSession?.accessToken) && !preciseRecommendationBlocked"),
    "legacy Supabase session should not unlock Humi API precise recommendations",
  );
}

function assertAiPromptKeepsInventoryInvisible() {
  const recommendSource = readFileSync(new URL("../api/recommend.js", import.meta.url), "utf8");
  ["库存明细", "库存数量"].forEach((forbiddenWord) => {
    assert.equal(
      recommendSource.includes(forbiddenWord),
      false,
      `AI recommendation prompt should not expose ${forbiddenWord} wording`,
    );
  });
}

function assertUnifiedDinnerRecommendationContract() {
  const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const apiSource = readFileSync(new URL("../src/lib/humiApi.js", import.meta.url), "utf8");
  assert(
    apiSource.includes('humiApiRequest("/recommendations/dinner"'),
    "authenticated H5 dinner rotation must use POST /recommendations/dinner",
  );
  assert(
    mainSource.includes("requestDinnerRecommendation") && mainSource.includes("requestBalancedDinnerWithFallback"),
    "H5 must validate server dinner groups and use an immediate local fallback",
  );
  assert(
    mainSource.includes('mode: "meal_execution"') && mainSource.includes('mode: "legacy"'),
    "effort cards and the legacy Tonight flow must both use the unified contract",
  );
  assert(
    mainSource.includes('action: "initial"') && mainSource.includes('action: "next"'),
    "page hydration must preserve the current group while explicit refresh advances",
  );
  assert(
    mainSource.includes("contextFingerprint") && mainSource.includes("stateVersion"),
    "the H5 caller must send the complete household/date/tier/context rotation scope",
  );
  assert(
    mainSource.includes('result.source === "server" ? result.group.stateVersion'),
    "a local fallback cursor must never be sent back as the authenticated server stateVersion",
  );
  assert(
    !mainSource.includes('if (effortTier === "easy_30") return ["tomato-tofu-shrimp-soup", "vinegar-cabbage"]'),
    "meal execution must not retain fixed A/B recommendation groups",
  );
}

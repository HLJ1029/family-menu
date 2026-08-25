import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const recipes = loadModule("miniprogram/data/certified-recipes.js");
assert.equal(recipes.length, 30, "the native dinner chooser must expose all 30 certified recipes");

const currentDinner = snapshot(recipes[0]);
let bootstrap = buildBootstrap([currentDinner]);
const saves = [];
const plan = loadPage("miniprogram/pages/plan/index.js", {
  "../../utils/store": {
    appStore: {
      getState: () => ({ bootstrap }),
      replaceBootstrap: (next) => { bootstrap = next; },
    },
  },
  "../../utils/native-shell-guard": { guardNativeTab: () => true },
  "../../utils/household-state": {
    buildMealDays: (mealPlan) => [{
      dateKey: "2026-07-28",
      label: "今天",
      breakfast: [],
      lunch: [],
      dinner: mealPlan["2026-07-28"].dinner,
      dinnerMinutes: 15,
      missingIngredientsText: "",
    }],
    createMutationId: () => "plan-editor-save-1",
    getActiveHousehold: () => ({ id: "household-1", name: "测试家" }),
    getHouseholdRole: () => "owner",
    saveHouseholdStatePatch: async (patch, context) => {
      saves.push({ patch, context });
      return buildBootstrap(patch.mealPlan["2026-07-28"].dinner, "state-v2");
    },
  },
  "../../data/certified-recipes": recipes,
});
plan.syncState();
assert.equal(plan.data.menuEditAvailable, true, "a connected owner receives the rendered edit action");

const ownerDay = loadComponent("miniprogram/components/meal-day/index.js", {
  day: plan.data.days[0], canEdit: true, busy: false,
});
ownerDay.bind("choose", (event) => plan.openRecipeChooser(event));
ownerDay.openDinnerChooser();
assert.equal(plan.data.chooserVisible, true, "an owner tap on the rendered day action opens the chooser");
assert.equal(plan.data.recipeChoices.length, 30, "the chooser contains every bundled certified recipe");
assert.equal(plan.data.recipeChoices[0].selected, true, "the current certified dinner is preselected");

plan.toggleRecipe({ currentTarget: { dataset: { recipeId: recipes[1].id } } });
await plan.saveRecipeSelection();
assert.equal(saves.length, 1);
const savedDinner = saves[0].patch.mealPlan["2026-07-28"].dinner;
assert.equal(savedDinner.length, 2, "saving keeps the preselected recipe and adds the new selection");
for (const entry of savedDinner) {
  assert.deepEqual(Object.keys(entry).sort(), ["ingredients", "minutes", "quantity", "recipeId", "title"].sort());
  assert(entry.title, "a saved plan entry keeps its display title");
  assert(entry.minutes > 0, "a saved plan entry keeps its timing");
  assert(entry.ingredients.length > 0, "a saved plan entry keeps ingredients for Grocery derivation");
}
assert.equal(plan.data.chooserVisible, false, "a successful save closes the chooser");

ownerDay.openDinnerChooser();
plan.clearRecipeSelection();
await plan.saveRecipeSelection();
assert.deepEqual(JSON.parse(JSON.stringify(saves[1].patch.mealPlan["2026-07-28"].dinner)), [], "saving an empty selection explicitly removes dinner");

const memberEvents = [];
const memberDay = loadComponent("miniprogram/components/meal-day/index.js", {
  day: plan.data.days[0], canEdit: false, busy: false,
});
memberDay.bind("choose", (event) => memberEvents.push(event));
memberDay.openDinnerChooser();
assert.equal(memberEvents.length, 0, "the rendered member view stays read-only");

const cachedBootstrap = { ...buildBootstrap([currentDinner]), cacheState: "cached" };
const cachedPlan = loadPage("miniprogram/pages/plan/index.js", {
  "../../utils/store": { appStore: { getState: () => ({ bootstrap: cachedBootstrap }), replaceBootstrap() {} } },
  "../../utils/native-shell-guard": { guardNativeTab: () => true },
  "../../utils/household-state": {
    buildMealDays: () => [{ ...plan.data.days[0], dinner: [currentDinner] }],
    createMutationId: () => "cached-must-not-save",
    getActiveHousehold: () => ({ id: "household-1", name: "测试家" }),
    getHouseholdRole: () => "owner",
    saveHouseholdStatePatch: async () => { throw new Error("cached plan must not save"); },
  },
  "../../data/certified-recipes": recipes,
});
cachedPlan.syncState();
assert.equal(cachedPlan.data.menuEditAvailable, false, "a cached owner receives an explicitly read-only rendered state");
const cachedEvents = [];
const cachedDay = loadComponent("miniprogram/components/meal-day/index.js", {
  day: cachedPlan.data.days[0],
  canEdit: cachedPlan.data.menuEditAvailable,
  busy: false,
});
cachedDay.bind("choose", (event) => cachedEvents.push(event));
cachedDay.openDinnerChooser();
assert.equal(cachedEvents.length, 0, "a cached owner sees a rendered read-only day with no edit event");

let conflictBootstrap = buildBootstrap([currentDinner]);
const latestDinner = snapshot(recipes[2]);
const latestEnvelope = buildBootstrap([latestDinner], "state-latest");
let conflictSaves = 0;
const conflictPlan = loadPage("miniprogram/pages/plan/index.js", {
  "../../utils/store": {
    appStore: {
      getState: () => ({ bootstrap: conflictBootstrap }),
      replaceBootstrap: (next) => { conflictBootstrap = next; },
    },
  },
  "../../utils/native-shell-guard": { guardNativeTab: () => true },
  "../../utils/household-state": {
    buildMealDays: (mealPlan) => [{ ...plan.data.days[0], dinner: mealPlan["2026-07-28"].dinner }],
    createMutationId: () => "stale-plan-save",
    getActiveHousehold: () => ({ id: "household-1", name: "测试家" }),
    getHouseholdRole: () => "owner",
    saveHouseholdStatePatch: async () => {
      conflictSaves += 1;
      const error = new Error("state version conflict");
      error.status = 409;
      error.code = "state_version_conflict";
      error.latestEnvelope = latestEnvelope;
      throw error;
    },
  },
  "../../data/certified-recipes": recipes,
});
conflictPlan.syncState();
const conflictDay = loadComponent("miniprogram/components/meal-day/index.js", {
  day: conflictPlan.data.days[0], canEdit: true, busy: false,
});
conflictDay.bind("choose", (event) => conflictPlan.openRecipeChooser(event));
conflictDay.openDinnerChooser();
conflictPlan.toggleRecipe({ currentTarget: { dataset: { recipeId: recipes[1].id } } });
await conflictPlan.saveRecipeSelection();
assert.equal(conflictPlan.data.chooserVisible, false, "a 409 closes the stale chooser and requires an explicit reopen");
assert.equal(conflictPlan.data.recipeChoices.length, 0, "stale recipe choices are discarded after latest-envelope recovery");
assert.equal(conflictPlan.data.days[0].dinner[0].recipeId, recipes[2].id, "the page renders the latest family dinner after conflict");
await conflictPlan.saveRecipeSelection();
assert.equal(conflictSaves, 1, "a stale selection cannot retry and overwrite the latest family update");

console.log("Native Plan rendered recipe chooser checks passed.");

function snapshot(recipe) {
  return {
    recipeId: recipe.id,
    title: recipe.title,
    minutes: recipe.timeMinutes,
    ingredients: recipe.ingredients,
    quantity: 1,
  };
}

function buildBootstrap(dinner, stateVersion = "state-v1") {
  return {
    stateVersion,
    activeHouseholdId: "household-1",
    user: { id: "owner-1" },
    households: [{ id: "household-1", name: "测试家", role: "owner" }],
    householdState: {
      mealPlan: { "2026-07-28": { breakfast: [], lunch: [], dinner } },
      pantryItems: [],
    },
  };
}

function loadPage(relativePath, stubs) {
  let definition;
  evaluate(relativePath, stubs, { Page: (candidate) => { definition = candidate; } });
  assert(definition, `${relativePath} must register a page`);
  return instantiate(definition);
}

function loadComponent(relativePath, properties) {
  let definition;
  evaluate(relativePath, {}, { Component: (candidate) => { definition = candidate; } });
  assert(definition, `${relativePath} must register a component`);
  const listeners = new Map();
  const instance = instantiate(definition);
  instance.properties = { ...instance.properties, ...properties };
  instance.bind = (name, listener) => listeners.set(name, listener);
  instance.triggerEvent = (name, detail) => listeners.get(name)?.({ detail, currentTarget: { dataset: {} } });
  return instance;
}

function loadModule(relativePath) {
  return evaluate(relativePath, {});
}

function evaluate(relativePath, stubs, globals = {}) {
  const filename = path.join(root, relativePath);
  const record = { exports: {} };
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    ...globals,
    module: record,
    exports: record.exports,
    require: (specifier) => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
      throw new Error(`Unexpected require ${specifier} from ${relativePath}`);
    },
    console,
    Date,
    Math,
    Promise,
  }, { filename });
  return record.exports;
}

function instantiate(definition) {
  return {
    ...definition.methods,
    ...Object.fromEntries(Object.entries(definition).filter(([key]) => !["data", "methods", "properties"].includes(key))),
    data: structuredClone(definition.data || {}),
    properties: Object.fromEntries(Object.entries(definition.properties || {}).map(([key, value]) => [key, value.value])),
    setData(patch) { Object.assign(this.data, patch); },
  };
}

import { readFile, writeFile } from "node:fs/promises";

const recipes = JSON.parse(await readFile(new URL("../data/recipes.json", import.meta.url), "utf8"));
const cookAssist = JSON.parse(await readFile(new URL("../data/cook-assist.json", import.meta.url), "utf8"));
const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const cookAssistById = new Map(cookAssist.map((assist) => [assist.id, assist]));
const catalog = cookAssist
  .map((assist) => {
    const recipe = recipesById.get(assist.id);
    if (!recipe) throw new Error(`Certified recipe ${assist.id} is missing from data/recipes.json.`);
    if (!["quick_15", "easy_30", "normal"].includes(assist.effortTier)) {
      throw new Error(`Certified recipe ${assist.id} has an invalid effort tier.`);
    }
    if (!Array.isArray(recipe.steps) || recipe.steps.length !== assist.stepDurationsSeconds?.length) {
      throw new Error(`Certified recipe ${assist.id} step metadata does not match its recipe steps.`);
    }
    const steps = recipe.steps.map((text, index) => {
      const id = `${recipe.id}:step:${index + 1}`;
      return {
        id,
        index,
        text,
        phase: index === 0 ? "prep" : index === recipe.steps.length - 1 ? "finish" : "cook",
        durationSeconds: assist.stepDurationsSeconds[index],
        attention: assist.passiveStepIndexes?.includes(index) ? "passive" : "active",
        resources: [...(assist.stepResources?.[index] ?? [])],
        dependsOn: index === 0 ? [] : [`${recipe.id}:step:${index}`],
        timerLabel: assist.passiveStepIndexes?.includes(index)
          ? `${recipe.name} · ${Math.ceil(assist.stepDurationsSeconds[index] / 60)} 分钟`
          : "",
        rescueTip: index === recipe.steps.length - 1 ? assist.rescueTip : "",
      };
    });
    return {
      id: recipe.id,
      title: recipe.name,
      name: recipe.name,
      description: recipe.description || "",
      categories: [...(recipe.categories ?? [])],
      tags: [...(recipe.tags ?? [])],
      servings: Number(recipe.servings || 2),
      timeMinutes: Number(recipe.timeMinutes || assist.totalMinutes),
      thumbnailUrl: `/assets/dishes/thumbs/${recipe.id}.webp`,
      ingredients: structuredClone(recipe.ingredients ?? []),
      searchText: [
        recipe.name,
        recipe.description,
        ...(recipe.categories ?? []),
        ...(recipe.tags ?? []),
        ...(recipe.ingredients ?? []).map((item) => item.name),
        ...(recipe.seasonings ?? []).map((item) => item.name),
      ].filter(Boolean).join(" ").toLowerCase(),
      cookAssist: {
        status: "certified",
        effortTier: assist.effortTier,
        activeMinutes: assist.activeMinutes,
        totalMinutes: assist.totalMinutes,
        cookware: [...assist.cookware],
        cleanupLevel: assist.cleanupLevel,
        steps,
        dependencies: steps.flatMap((step) => step.dependsOn.map((dependencyId) => ({
          from: dependencyId,
          to: step.id,
        }))),
        downgradeRecipeIds: [...(assist.downgradeRecipeIds ?? [])],
        substitutions: structuredClone(assist.substitutions ?? []),
        readyStaple: assist.readyStaple || "即食米饭",
      },
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

if (catalog.length !== 30 || new Set(catalog.map((recipe) => recipe.id)).size !== 30) {
  throw new Error(`Expected exactly 30 unique certified recipes, received ${catalog.length}.`);
}

const legacyCatalog = recipes
  .map((recipe) => {
    const assist = cookAssistById.get(recipe.id);
    return {
      id: recipe.id,
      title: recipe.name,
      name: recipe.name,
      description: recipe.description || "",
      categories: [...(recipe.categories ?? [])],
      tags: [...(recipe.tags ?? [])],
      ingredients: structuredClone(recipe.ingredients ?? []),
      searchText: [
        recipe.name,
        recipe.description,
        ...(recipe.categories ?? []),
        ...(recipe.tags ?? []),
        ...(recipe.ingredients ?? []).map((item) => item.name),
        ...(recipe.seasonings ?? []).map((item) => item.name),
      ].filter(Boolean).join(" ").toLowerCase(),
      cookAssist: assist ? {
        status: "certified",
        effortTier: assist.effortTier,
        cleanupLevel: assist.cleanupLevel,
      } : null,
    };
  })
  .sort((left, right) => left.id.localeCompare(right.id));

if (legacyCatalog.length !== 138 || new Set(legacyCatalog.map((recipe) => recipe.id)).size !== 138) {
  throw new Error(`Expected exactly 138 unique legacy recipes, received ${legacyCatalog.length}.`);
}

const outputs = [
  {
    url: new URL("../miniprogram/data/certified-recipes.js", import.meta.url),
    label: "native certified recipes",
    value: catalog,
  },
  {
    url: new URL("../miniprogram/data/legacy-recipes.js", import.meta.url),
    label: "native legacy recipes",
    value: legacyCatalog,
  },
];
if (process.argv.includes("--check")) {
  for (const output of outputs) {
    const generated = `// Generated by scripts/generate-native-certified-recipes.mjs. Do not edit.\nmodule.exports = ${JSON.stringify(output.value, null, 2)};\n`;
    const current = await readFile(output.url, "utf8").catch(() => "");
    if (current !== generated) {
      throw new Error(`${output.url.pathname.split("/").at(-1)} is stale; run npm run generate:native-certified-recipes.`);
    }
  }
} else {
  for (const output of outputs) {
    const generated = `// Generated by scripts/generate-native-certified-recipes.mjs. Do not edit.\nmodule.exports = ${JSON.stringify(output.value, null, 2)};\n`;
    await writeFile(output.url, generated, "utf8");
    console.log(`Generated ${output.value.length} ${output.label}.`);
  }
}

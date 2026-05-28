import recipes from "../data/recipes.json" with { type: "json" };

const requiredRecipeFields = [
  "id",
  "name",
  "categories",
  "tags",
  "servings",
  "difficulty",
  "timeMinutes",
  "accent",
  "description",
  "ingredients",
  "seasonings",
  "steps",
  "tips",
];

const requiredItemFields = ["name", "amount", "unit"];
const errors = [];
const warnings = [];
const ids = new Set();

if (!Array.isArray(recipes)) {
  errors.push("data/recipes.json must export an array.");
} else {
  recipes.forEach((recipe, index) => validateRecipe(recipe, index));
}

if (warnings.length > 0) {
  console.warn(formatMessages("Warnings", warnings));
}

if (errors.length > 0) {
  console.error(formatMessages("Recipe validation failed", errors));
  process.exit(1);
}

console.log(`Recipe validation passed: ${recipes.length} recipes, ${ids.size} unique ids.`);

function validateRecipe(recipe, index) {
  const label = recipe?.id || recipe?.name || `recipe at index ${index}`;

  requiredRecipeFields.forEach((field) => {
    if (!hasValue(recipe?.[field])) {
      errors.push(`${label}: missing ${field}.`);
    }
  });

  if (typeof recipe?.id === "string") {
    if (!/^[a-z0-9-]+$/.test(recipe.id)) {
      errors.push(`${label}: id must use lowercase kebab-case.`);
    }
    if (ids.has(recipe.id)) {
      errors.push(`${label}: duplicate id.`);
    }
    ids.add(recipe.id);
  }

  validateStringArray(recipe?.categories, `${label}: categories`);
  validateStringArray(recipe?.tags, `${label}: tags`);
  validatePositiveNumber(recipe?.servings, `${label}: servings`);
  validatePositiveNumber(recipe?.timeMinutes, `${label}: timeMinutes`);
  validateStringArray(recipe?.steps, `${label}: steps`);
  validateItems(recipe?.ingredients, `${label}: ingredients`);
  validateItems(recipe?.seasonings, `${label}: seasonings`);

  if (Array.isArray(recipe?.steps) && recipe.steps.length < 3) {
    warnings.push(`${label}: steps has fewer than 3 items.`);
  }
}

function validateStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      errors.push(`${label}[${index}] must be a non-empty string.`);
    }
  });
}

function validateItems(items, label) {
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(`${label} must be a non-empty array.`);
    return;
  }

  items.forEach((item, index) => {
    requiredItemFields.forEach((field) => {
      if (!Object.hasOwn(item ?? {}, field)) {
        errors.push(`${label}[${index}] missing ${field}.`);
      }
    });

    if (typeof item?.name !== "string" || item.name.trim() === "") {
      errors.push(`${label}[${index}] name must be a non-empty string.`);
    }

    if (!hasValue(item?.amount)) {
      errors.push(`${label}[${index}] amount must not be empty.`);
    }

    if (typeof item?.unit !== "string") {
      errors.push(`${label}[${index}] unit must be a string.`);
    }

    if ("required" in item && typeof item.required !== "boolean") {
      errors.push(`${label}[${index}] required must be boolean when present.`);
    }

    if ("pantryItem" in item && typeof item.pantryItem !== "boolean") {
      errors.push(`${label}[${index}] pantryItem must be boolean when present.`);
    }
  });
}

function validatePositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${label} must be a positive number.`);
  }
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

function formatMessages(title, messages) {
  return [`${title}:`, ...messages.map((message) => `- ${message}`)].join("\n");
}

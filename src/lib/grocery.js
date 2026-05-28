import { getRecipe } from "./recipes";

export function buildRecipeGroceryGroups(entries) {
  return entries
    .map((entry, index) => {
      const recipe = getRecipe(entry.recipeId);
      if (!recipe) return null;
      const items = [
        ...recipe.ingredients.map((item) => ({ ...item, type: "ingredient" })),
        ...recipe.seasonings.map((item) => ({ ...item, type: "seasoning" })),
      ].map((item) => {
        const scaled = scaleItem(item, entry.quantity);
        const hiddenKey = buildGroceryItemKey(scaled);
        return {
          ...scaled,
          hiddenKey,
          key: `${entry.source}:${index}:${recipe.id}:${scaled.type}:${scaled.name}:${scaled.unit}`,
        };
      });
      return {
        key: `${entry.source}:${index}:${recipe.id}`,
        source: entry.quantity > 1 ? `${entry.source} · ${entry.quantity} 份` : entry.source,
        recipe,
        items,
      };
    })
    .filter(Boolean);
}

export function buildShoppingListFromEntries(entries) {
  const merged = new Map();
  entries.forEach((entry) => {
    const recipe = getRecipe(entry.recipeId);
    if (!recipe) return;
    [
      ...recipe.ingredients.map((item) => ({ ...item, type: "ingredient" })),
      ...recipe.seasonings.map((item) => ({ ...item, type: "seasoning" })),
    ].forEach((rawItem) => {
      const item = scaleItem(rawItem, entry.quantity);
      const key = buildGroceryItemKey(item);
      const current = merged.get(key);
      if (current && typeof current.amount === "number" && typeof item.amount === "number") {
        current.amount += item.amount;
      } else if (current) {
        current.amount = "适量";
      } else {
        merged.set(key, { ...item, key, hiddenKey: key, pantryItem: Boolean(item.pantryItem) });
      }
    });
  });
  return [...merged.values()].sort((a, b) => Number(a.pantryItem) - Number(b.pantryItem));
}

export function formatShareText(groups, customItems) {
  const recipeSections = groups
    .map((group) => {
      const lines = group.items.map((item) => `- ${item.name} ${formatAmount(item)}`);
      return `${group.recipe.name}（${group.source}）\n${lines.join("\n")}`;
    })
    .join("\n\n");
  const customSection =
    customItems.length > 0
      ? `\n\n手动添加\n${customItems.map((item) => `- ${item.name}`).join("\n")}`
      : "";
  return `家庭菜单食材清单\n\n${recipeSections}${customSection}`;
}

export function formatAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

export function formatRawAmount(item) {
  if (typeof item.amount !== "number") return item.amount;
  return `${Number.isInteger(item.amount) ? item.amount : item.amount.toFixed(1)}${item.unit || ""}`;
}

function scaleItem(item, multiplier = 1) {
  if (typeof item.amount !== "number") return { ...item };
  const amount = Math.round(item.amount * multiplier * 10) / 10;
  return { ...item, amount };
}

function buildGroceryItemKey(item) {
  return `${item.type}:${item.name}:${item.unit}:${typeof item.amount}`;
}

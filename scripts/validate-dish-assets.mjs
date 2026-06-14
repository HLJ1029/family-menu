import fs from "node:fs/promises";
import path from "node:path";
import recipes from "../data/recipes.json" with { type: "json" };

const ROOT = process.cwd();
const DISH_DIR = path.join(ROOT, "public", "assets", "dishes");
const errors = [];
const warnings = [];

async function main() {
  const localRecipes = recipes.filter((recipe) => recipe.image?.url?.startsWith("/family-menu/assets/dishes/"));
  const manifestPath = path.join(DISH_DIR, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const manifestIds = new Set(manifest.map((item) => item.id));

  for (const recipe of localRecipes) {
    const sourceFilename = path.basename(recipe.image.url);
    const baseName = sourceFilename.replace(/\.png$/, "");
    await expectFile(recipe.id, path.join(DISH_DIR, sourceFilename), "PNG source");
    await expectFile(recipe.id, path.join(DISH_DIR, "webp", `${baseName}.webp`), "hero WebP");
    await expectFile(recipe.id, path.join(DISH_DIR, "thumbs", `${baseName}.webp`), "thumb WebP");
    await expectFile(recipe.id, path.join(DISH_DIR, "thumbs", `${baseName}.jpg`), "legacy JPG thumb");
    if (!manifestIds.has(recipe.id)) {
      errors.push(`${recipe.id}: missing from public/assets/dishes/manifest.json.`);
    }
  }

  if (manifest.length !== localRecipes.length) {
    errors.push(`manifest has ${manifest.length} items, but recipes require ${localRecipes.length} local dish assets.`);
  }

  const totalHeroBytes = await sumFiles(localRecipes, (recipe) => {
    const baseName = path.basename(recipe.image.url).replace(/\.png$/, "");
    return path.join(DISH_DIR, "webp", `${baseName}.webp`);
  });
  const totalThumbBytes = await sumFiles(localRecipes, (recipe) => {
    const baseName = path.basename(recipe.image.url).replace(/\.png$/, "");
    return path.join(DISH_DIR, "thumbs", `${baseName}.webp`);
  });

  if (totalHeroBytes > 25 * 1024 * 1024) {
    warnings.push(`hero WebP total is ${formatBytes(totalHeroBytes)}; consider lowering DISH_WEBP_QUALITY.`);
  }

  if (warnings.length > 0) {
    console.warn(formatMessages("Dish asset warnings", warnings));
  }
  if (errors.length > 0) {
    console.error(formatMessages("Dish asset validation failed", errors));
    process.exit(1);
  }

  console.log(
    `Dish asset validation passed: ${localRecipes.length} recipes, hero WebP ${formatBytes(totalHeroBytes)}, thumb WebP ${formatBytes(totalThumbBytes)}.`,
  );
}

async function expectFile(recipeId, filePath, label) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) errors.push(`${recipeId}: ${label} is not a file at ${path.relative(ROOT, filePath)}.`);
    if (stats.size <= 0) errors.push(`${recipeId}: ${label} is empty at ${path.relative(ROOT, filePath)}.`);
  } catch {
    errors.push(`${recipeId}: missing ${label} at ${path.relative(ROOT, filePath)}.`);
  }
}

async function sumFiles(items, toFilePath) {
  let total = 0;
  for (const item of items) {
    try {
      const stats = await fs.stat(toFilePath(item));
      total += stats.size;
    } catch {
      // Missing files are reported by expectFile.
    }
  }
  return total;
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

function formatMessages(title, messages) {
  return [`${title}:`, ...messages.map((message) => `- ${message}`)].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

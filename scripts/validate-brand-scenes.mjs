import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  humiAvatarScenes,
  humiBrandScenes,
  humiPosterScenes,
  humiSocialScenes,
} from "../src/components/ui/brandScenes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "public/assets/brand/lovart-v2/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const expectedCategories = {
  product: 10,
  avatar: 8,
  collaboration: 11,
  poster: 8,
  social: 6,
  state: 9,
};

if (manifest.count !== 52 || manifest.assets?.length !== 52) {
  throw new Error(`Lovart V2 asset count mismatch: expected 52, got ${manifest.count}`);
}

for (const [category, count] of Object.entries(expectedCategories)) {
  if (manifest.categories?.[category] !== count) {
    throw new Error(`Category ${category} mismatch: expected ${count}, got ${manifest.categories?.[category]}`);
  }
}

const manifestIds = new Set(manifest.assets.map((item) => item.id));
const registeredScenes = [
  ...Object.values(humiBrandScenes),
  ...humiAvatarScenes,
  ...humiPosterScenes,
  ...humiSocialScenes,
];

for (const scene of registeredScenes) {
  if (!manifestIds.has(scene.id)) {
    throw new Error(`Registered scene is missing from manifest: ${scene.id}`);
  }
}

for (const item of manifest.assets) {
  const publicPath = item.src.replace(/^\//, "");
  await access(path.join(root, "public", publicPath.replace(/^assets\//, "assets/")));
}

console.log(
  `Validated ${manifest.count} Lovart V2 assets across ${Object.keys(expectedCategories).length} categories and ${registeredScenes.length} scene registrations.`,
);

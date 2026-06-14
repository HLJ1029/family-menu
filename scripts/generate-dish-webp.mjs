import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import recipes from "../data/recipes.json" with { type: "json" };

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const DISH_DIR = path.join(ROOT, "public", "assets", "dishes");
const HERO_DIR = path.join(DISH_DIR, "webp");
const THUMB_DIR = path.join(DISH_DIR, "thumbs");
const HERO_WIDTH = process.env.DISH_WEBP_WIDTH || "960";
const HERO_QUALITY = process.env.DISH_WEBP_QUALITY || "78";
const THUMB_WIDTH = process.env.DISH_THUMB_WEBP_WIDTH || "512";
const THUMB_QUALITY = process.env.DISH_THUMB_WEBP_QUALITY || "72";

async function main() {
  await fs.mkdir(HERO_DIR, { recursive: true });
  await fs.mkdir(THUMB_DIR, { recursive: true });

  const localRecipes = recipes.filter((recipe) => recipe.image?.url?.startsWith("/family-menu/assets/dishes/"));
  const manifest = [];

  for (const recipe of localRecipes) {
    const sourceFilename = path.basename(recipe.image.url);
    const sourcePath = path.join(DISH_DIR, sourceFilename);
    const baseName = sourceFilename.replace(/\.png$/, "");
    const heroPath = path.join(HERO_DIR, `${baseName}.webp`);
    const thumbPath = path.join(THUMB_DIR, `${baseName}.webp`);
    const jpgThumbPath = path.join(THUMB_DIR, `${baseName}.jpg`);

    await convertWebp({
      sourcePath,
      outputPath: heroPath,
      width: HERO_WIDTH,
      quality: HERO_QUALITY,
    });
    await convertWebp({
      sourcePath,
      outputPath: thumbPath,
      width: THUMB_WIDTH,
      quality: THUMB_QUALITY,
    });

    manifest.push({
      id: recipe.id,
      name: recipe.name,
      image: `/assets/dishes/${sourceFilename}`,
      webp: `/assets/dishes/webp/${baseName}.webp`,
      thumb: `/assets/dishes/thumbs/${baseName}.webp`,
      legacyThumb: `/assets/dishes/thumbs/${baseName}.jpg`,
      bytes: {
        png: await fileSize(sourcePath),
        webp: await fileSize(heroPath),
        thumbWebp: await fileSize(thumbPath),
        thumbJpg: await fileSize(jpgThumbPath),
      },
    });

    console.log(`[webp] ${recipe.id} -> ${path.relative(ROOT, heroPath)}, ${path.relative(ROOT, thumbPath)}`);
  }

  await fs.writeFile(
    path.join(DISH_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const totals = manifest.reduce(
    (summary, item) => ({
      png: summary.png + item.bytes.png,
      webp: summary.webp + item.bytes.webp,
      thumbWebp: summary.thumbWebp + item.bytes.thumbWebp,
    }),
    { png: 0, webp: 0, thumbWebp: 0 },
  );

  console.log(
    `Generated ${manifest.length} dish WebP pairs. PNG ${formatBytes(totals.png)} -> hero WebP ${formatBytes(totals.webp)}, thumb WebP ${formatBytes(totals.thumbWebp)}.`,
  );
}

async function convertWebp({ sourcePath, outputPath, width, quality }) {
  await execFileAsync("cwebp", [
    "-quiet",
    "-resize",
    width,
    "0",
    "-q",
    quality,
    sourcePath,
    "-o",
    outputPath,
  ]);
}

async function fileSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)}MB`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

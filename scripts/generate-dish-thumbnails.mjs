import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "public", "assets", "dishes");
const OUTPUT_DIR = path.join(SOURCE_DIR, "thumbs");
const WIDTH = process.env.DISH_THUMB_WIDTH || "512";
const QUALITY = process.env.DISH_THUMB_QUALITY || "72";

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await fileExists(SOURCE_DIR))) {
    throw new Error(`Missing dish image directory: ${SOURCE_DIR}`);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const entries = await fs.readdir(SOURCE_DIR, { withFileTypes: true });
  const sources = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
    .map((entry) => entry.name)
    .sort();

  if (sources.length === 0) {
    throw new Error(`No PNG dish images found in ${SOURCE_DIR}`);
  }

  for (const filename of sources) {
    const sourcePath = path.join(SOURCE_DIR, filename);
    const outputPath = path.join(OUTPUT_DIR, filename.replace(/\.png$/, ".jpg"));

    await execFileAsync("sips", [
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      QUALITY,
      "--resampleWidth",
      WIDTH,
      sourcePath,
      "--out",
      outputPath,
    ]);

    console.log(`[thumb] ${filename} -> ${path.relative(ROOT, outputPath)}`);
  }

  console.log(`Generated ${sources.length} thumbnails in ${path.relative(ROOT, OUTPUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

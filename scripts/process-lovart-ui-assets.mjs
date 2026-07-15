import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const sourceDir = resolve(process.argv[2] || "");
const outputDir = resolve(process.argv[3] || "public/assets/brand/lovart-v2");

if (!sourceDir || !readdirSync(sourceDir, { withFileTypes: true })) {
  throw new Error("Usage: node scripts/process-lovart-ui-assets.mjs <source-dir> [output-dir]");
}

mkdirSync(outputDir, { recursive: true });

const sourceFiles = readdirSync(sourceDir)
  .filter((file) => file.toLowerCase().endsWith(".png"))
  .sort();

const assets = sourceFiles.map((sourceFile) => {
  const id = basename(sourceFile, ".png");
  const sourcePath = join(sourceDir, sourceFile);
  const outputFile = `${id}.webp`;
  const outputPath = join(outputDir, outputFile);

  execFileSync("magick", [
    sourcePath,
    "-bordercolor", "#f0f0f0",
    "-border", "1",
    "-alpha", "on",
    "-fuzz", "8%",
    "-fill", "none",
    "-draw", "alpha 0,0 floodfill",
    "-shave", "1x1",
    "-trim",
    "+repage",
    "-bordercolor", "none",
    "-border", "24",
    "-resize", "960x960>",
    "-quality", "88",
    outputPath,
  ]);

  return {
    id,
    category: categoryFor(id),
    src: `/assets/brand/lovart-v2/${outputFile}`,
    sourceFile,
    sourceBytes: statSync(sourcePath).size,
    sourceSha256: sha256(sourcePath),
    outputBytes: statSync(outputPath).size,
    outputSha256: sha256(outputPath),
  };
});

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceDir,
  count: assets.length,
  categories: assets.reduce((counts, asset) => {
    counts[asset.category] = (counts[asset.category] || 0) + 1;
    return counts;
  }, {}),
  assets,
};

writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Processed ${assets.length} Lovart assets into ${outputDir}`);

function categoryFor(id) {
  if (id.startsWith("humi-avatar-")) return "avatar";
  if (id.startsWith("humi-poster-")) return "poster";
  if (id.startsWith("humi-social-")) return "social";
  if (id.startsWith("humi-state-")) return "state";
  if (/^humi-(invite|crave|menu-share|wish|grocery-claim|grocery-progress)-/.test(id)) return "collaboration";
  return "product";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

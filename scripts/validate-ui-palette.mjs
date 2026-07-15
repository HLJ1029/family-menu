import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["src/components", "miniprogram"];
const files = ["tailwind.config.js", "src/styles.css", "src/lib/posters.js"];
const extensions = new Set([".js", ".jsx", ".json", ".wxml", ".wxss"]);
const chromaticUtility = /\b(?:bg|border|text|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

for (const root of roots) {
  files.push(...await collectFiles(root));
}

const violations = [];
for (const file of [...new Set(files)].sort()) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/#[\da-fA-F]{3,8}\b/g)) {
    if (!isGrayscaleHex(match[0])) violations.push(`${file}: chromatic hex ${match[0]}`);
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const channels = match.slice(1, 4).map(Number);
    if (!channels.every((value) => value === channels[0])) {
      violations.push(`${file}: chromatic rgb ${match[0]})`);
    }
  }
  for (const match of source.matchAll(chromaticUtility)) {
    violations.push(`${file}: chromatic utility ${match[0]}`);
  }
}

assert.deepEqual(violations, [], `Humi UI must stay black, white, and gray:\n${violations.join("\n")}`);
console.log("Humi grayscale UI palette validation passed.");

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return extensions.has(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

function isGrayscaleHex(value) {
  const hex = value.slice(1);
  const expanded = hex.length === 3 || hex.length === 4
    ? hex.split("").map((character) => character + character).join("")
    : hex;
  const red = expanded.slice(0, 2).toLowerCase();
  const green = expanded.slice(2, 4).toLowerCase();
  const blue = expanded.slice(4, 6).toLowerCase();
  return red === green && green === blue;
}

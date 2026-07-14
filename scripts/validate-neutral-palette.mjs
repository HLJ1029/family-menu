import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOTS = ["src", "miniprogram"];
const FILES = ["tailwind.config.js"];
const TEXT_EXTENSIONS = new Set([".js", ".jsx", ".css", ".wxss", ".json"]);
const COLOR_UTILITY = /\b(?:bg|text|border|outline|ring|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-|\/|\b)/g;

for (const root of ROOTS) {
  FILES.push(...await listTextFiles(root));
}

const findings = [];
for (const path of FILES) {
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const rgb = parseHex(match[0]);
    if (rgb && !isNeutral(rgb)) findings.push({ path, color: match[0], kind: "hex" });
  }
  for (const match of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const rgb = match.slice(1, 4).map(Number);
    if (!isNeutral(rgb)) findings.push({ path, color: match[0], kind: "rgb" });
  }
  for (const match of source.matchAll(COLOR_UTILITY)) {
    findings.push({ path, color: match[0], kind: "utility" });
  }
}

const result = {
  ok: findings.length === 0,
  checkedAt: new Date().toISOString(),
  filesChecked: FILES.length,
  findings,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

async function listTextFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets") continue;
      files.push(...await listTextFiles(path));
      continue;
    }
    if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function parseHex(value) {
  const raw = value.slice(1);
  if (![3, 4, 6, 8].includes(raw.length)) return null;
  const expanded = raw.length <= 4
    ? raw.slice(0, 3).split("").map((part) => `${part}${part}`)
    : [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)];
  return expanded.map((part) => Number.parseInt(part, 16));
}

function isNeutral([red, green, blue]) {
  return red === green && green === blue;
}

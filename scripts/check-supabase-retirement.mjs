import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
if (packageJson.dependencies?.["@supabase/supabase-js"] || packageJson.devDependencies?.["@supabase/supabase-js"]) {
  failures.push("dependency:@supabase/supabase-js");
}

await scanTextTree(resolve(root, "src"), /supabase/i, "source");
await scanOptionalTree(resolve(root, ".github"), /VITE_SUPABASE|SUPABASE_URL|SUPABASE_ANON_KEY/i, "config");
await scanOptionalFile(resolve(root, ".env.example"), /VITE_SUPABASE|SUPABASE_URL|SUPABASE_ANON_KEY/i, "config");
await scanOptionalTree(resolve(root, "dist"), /supabase\.co|@supabase|VITE_SUPABASE/i, "bundle");

if (failures.length > 0) {
  for (const failure of failures.sort()) console.error(`FAIL ${failure}`);
  console.error(`Supabase retirement gate failed: ${failures.length} finding(s).`);
  process.exitCode = 1;
} else {
  console.log("Supabase retirement gate passed.");
}

async function scanOptionalFile(path, pattern, category) {
  try {
    if (pattern.test(await readFile(path, "utf8"))) failures.push(`${category}:${relative(root, path)}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function scanOptionalTree(path, pattern, category) {
  try {
    if (!(await stat(path)).isDirectory()) return;
    await scanTextTree(path, pattern, category);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function scanTextTree(directory, pattern, category) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await scanTextTree(path, pattern, category);
      continue;
    }
    if (!entry.isFile()) continue;
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch {
      continue;
    }
    pattern.lastIndex = 0;
    if (pattern.test(text)) failures.push(`${category}:${relative(root, path)}`);
  }
}

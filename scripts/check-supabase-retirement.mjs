import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_PATTERN = /supabase\.co|@supabase|VITE_SUPABASE|SUPABASE_URL|SUPABASE_ANON_KEY|\bsupabase\b/i;
const LOCKFILE_PATTERN = /node_modules\/@supabase\/|@supabase\/supabase-js/i;

export async function checkSupabaseRetirement(rootPath) {
  const root = resolve(rootPath);
  const failures = new Set();
  const packagePath = resolve(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson.dependencies?.["@supabase/supabase-js"] || packageJson.devDependencies?.["@supabase/supabase-js"]) {
    failures.add("dependency:@supabase/supabase-js");
  }
  await scanOptionalFile(root, resolve(root, "package-lock.json"), LOCKFILE_PATTERN, "lockfile", failures);

  for (const directory of ["src", "api", "miniprogram", "public"]) {
    await scanOptionalTree(root, resolve(root, directory), PROVIDER_PATTERN, "runtime", failures);
  }
  await scanOptionalTree(root, resolve(root, ".github"), PROVIDER_PATTERN, "config", failures);

  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (/^\.env(?:\.|$)/.test(entry.name) || /^(?:vite|webpack|rollup)\.config\./.test(entry.name)) {
      await scanOptionalFile(root, resolve(root, entry.name), PROVIDER_PATTERN, "config", failures);
    }
  }

  const dist = resolve(root, "dist");
  const distStat = await stat(dist).catch(() => null);
  if (!distStat?.isDirectory()) failures.add("bundle:dist-missing");
  else await scanTextTree(root, dist, PROVIDER_PATTERN, "bundle", failures);

  return [...failures].sort();
}

async function scanOptionalFile(root, path, pattern, category, failures) {
  try {
    pattern.lastIndex = 0;
    if (pattern.test(await readFile(path, "utf8"))) failures.add(`${category}:${relative(root, path)}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function scanOptionalTree(root, path, pattern, category, failures) {
  try {
    if (!(await stat(path)).isDirectory()) return;
    await scanTextTree(root, path, pattern, category, failures);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function scanTextTree(root, directory, pattern, category, failures) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await scanTextTree(root, path, pattern, category, failures);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = relative(root, path);
    pattern.lastIndex = 0;
    if (pattern.test(relativePath)) failures.add(`${category}:${relativePath}`);
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch {
      continue;
    }
    pattern.lastIndex = 0;
    if (pattern.test(text)) failures.add(`${category}:${relativePath}`);
  }
}

async function main() {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const failures = await checkSupabaseRetirement(root);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    console.error(`Supabase retirement gate failed: ${failures.length} finding(s).`);
    process.exitCode = 1;
    return;
  }
  console.log("Supabase retirement gate passed.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

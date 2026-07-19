import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSupabaseRetirement } from "./check-supabase-retirement.mjs";

const unsafeRoot = await mkdtemp(join(tmpdir(), "humi-provider-gate-unsafe-"));
await mkdir(join(unsafeRoot, "api"), { recursive: true });
await mkdir(join(unsafeRoot, "src"), { recursive: true });
await writeFile(join(unsafeRoot, "package.json"), '{"dependencies":{},"scripts":{"build":"supabase"}}\n');
await writeFile(join(unsafeRoot, "package-lock.json"), '{"packages":{"node_modules/@supabase/supabase-js":{}}}\n');
await writeFile(join(unsafeRoot, "api", "runtime.js"), 'export const oldEndpoint = "https://legacy.supabase.co";\n');
await writeFile(join(unsafeRoot, ".env.production"), "VITE_SUPABASE_URL=https://example.invalid\n");
await writeFile(join(unsafeRoot, "postcss.config.js"), 'export default { endpoint: "https://legacy.supabase.co" };\n');
const unsafeFindings = await checkSupabaseRetirement(unsafeRoot);
assert.ok(unsafeFindings.some((item) => item.startsWith("lockfile:")), "lockfile residue must fail");
assert.ok(unsafeFindings.some((item) => item === "runtime:api/runtime.js"), "API runtime residue must fail");
assert.ok(unsafeFindings.some((item) => item === "config:.env.production"), "production env residue must fail");
assert.ok(unsafeFindings.some((item) => item === "config:package.json"), "package scripts residue must fail");
assert.ok(unsafeFindings.some((item) => item === "config:postcss.config.js"), "all build config residue must fail");
assert.ok(unsafeFindings.some((item) => item === "bundle:dist-missing"), "missing build output must fail");

const cleanRoot = await mkdtemp(join(tmpdir(), "humi-provider-gate-clean-"));
for (const directory of ["src", "api", "miniprogram", "public", "dist/assets", ".github/workflows"]) {
  await mkdir(join(cleanRoot, directory), { recursive: true });
}
await writeFile(join(cleanRoot, "package.json"), '{"dependencies":{}}\n');
await writeFile(join(cleanRoot, "package-lock.json"), '{"packages":{}}\n');
await writeFile(join(cleanRoot, "src", "main.js"), 'export const runtime = "humi-api";\n');
await writeFile(join(cleanRoot, "dist", "index.html"), "<main>Humi</main>\n");
assert.deepEqual(await checkSupabaseRetirement(cleanRoot), []);

console.log("Supabase retirement gate selftest passed.");

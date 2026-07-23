import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const run = promisify(execFile);
const apiCanonicalPath = "api/data/approved-avatar-keys.json";
const miniProgramProjectionPath = "miniprogram/data/approved-avatar-keys.json";
const deploymentSet = [
  "api",
  "src/lib/mealExecution.js",
  "data/recipes.json",
  "data/cook-assist.json",
  "package.json",
  "package-lock.json"
];

const canonicalKeys = JSON.parse(await readFile(apiCanonicalPath, "utf8"));
const miniProgramKeys = JSON.parse(await readFile(miniProgramProjectionPath, "utf8"));
assert.deepEqual(miniProgramKeys, canonicalKeys, "the miniprogram avatar list must be a byte-for-byte value projection of the API canonical contract");
assert.equal(new Set(canonicalKeys).size, canonicalKeys.length, "approved avatar keys must be unique");

const storeSource = await readFile("api/store.js", "utf8");
assert.match(storeSource, /\.\/data\/approved-avatar-keys\.json/, "API store must load the canonical API-local avatar contract");
assert.doesNotMatch(storeSource, /miniprogram\/data/, "API runtime must not import from the miniprogram package");

const stagingDirectory = await mkdtemp(join(tmpdir(), "humi-api-deploy-set-"));
for (const entry of deploymentSet) {
  const target = join(stagingDirectory, entry);
  await mkdir(dirname(target), { recursive: true });
  await cp(entry, target, { recursive: true });
}
const result = await run(process.execPath, ["--input-type=module", "--eval", "await import('./api/store.js'); await import('./api/server.js');"], {
  cwd: stagingDirectory,
  env: { ...process.env, NODE_ENV: "test", HUMI_WECHAT_MOCK: "1" }
});
assert.equal(result.stderr, "", "the deployment-set runtime import must not emit module resolution failures");

console.log("API deployment-set import contract passed.");

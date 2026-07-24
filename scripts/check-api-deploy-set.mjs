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
  "src/lib/date.js",
  "src/lib/mealExecution.js",
  "data/recipes.json",
  "data/cook-assist.json",
  "scripts/check-native-production-env.mjs",
  "package.json",
  "package-lock.json"
];
const nativeDeploymentMarkers = [
  "HUMI_NATIVE_SHELL_ENABLED=0",
  "HUMI_NATIVE_SHELL_HOUSEHOLDS=",
  "HUMI_TELEMETRY_HASH_SALT",
  "scripts/check-native-production-env.mjs",
  "npm run validate:native-bootstrap-api",
  "npm run validate:meal-execution-api",
  "npm run validate:native-observability",
  "npm run release:native-shell:check",
  "GET /bootstrap",
  "POST /recommendations/dinner",
  "POST /meal-runs",
  "POST /product-events",
  "1.1.74",
];
const nativePreflightMarkers = [
  "1.1.74 bootstrap and rollout flags",
  "1.1.74 dinner recommendation rotation",
  "1.1.74 MealRun, task, and reminder APIs",
  "1.1.74 privacy-safe telemetry",
];

const canonicalKeys = JSON.parse(await readFile(apiCanonicalPath, "utf8"));
const miniProgramKeys = JSON.parse(await readFile(miniProgramProjectionPath, "utf8"));
assert.deepEqual(miniProgramKeys, canonicalKeys, "the miniprogram avatar list must be a byte-for-byte value projection of the API canonical contract");
assert.equal(new Set(canonicalKeys).size, canonicalKeys.length, "approved avatar keys must be unique");

const storeSource = await readFile("api/store.js", "utf8");
assert.match(storeSource, /\.\/data\/approved-avatar-keys\.json/, "API store must load the canonical API-local avatar contract");
assert.doesNotMatch(storeSource, /miniprogram\/data/, "API runtime must not import from the miniprogram package");

const deployRunbook = await readFile("docs/humi-api-production-deploy-runbook.md", "utf8");
for (const marker of nativeDeploymentMarkers) {
  assert(
    deployRunbook.includes(marker),
    `native API deployment runbook must include ${marker}`,
  );
}
const deployPreflight = await readFile("scripts/check-api-deploy-readiness.mjs", "utf8");
for (const marker of nativePreflightMarkers) {
  assert(
    deployPreflight.includes(marker),
    `API deployment preflight must report ${marker}`,
  );
}

const stagingDirectory = await mkdtemp(join(tmpdir(), "humi-api-deploy-set-"));
for (const entry of deploymentSet) {
  const target = join(stagingDirectory, entry);
  await mkdir(dirname(target), { recursive: true });
  await cp(entry, target, { recursive: true });
}
const result = await run(process.execPath, ["--input-type=module", "--eval", "await import('./api/store.js'); await import('./api/server.js');"], {
  cwd: stagingDirectory,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HUMI_SESSION_SECRET: "deploy-set-session-secret-000000000000",
    HUMI_TELEMETRY_HASH_SALT: "deploy-set-telemetry-salt-00000000000",
    HUMI_NATIVE_SHELL_ENABLED: "0",
    HUMI_NATIVE_SHELL_HOUSEHOLDS: "",
    HUMI_MEAL_EXECUTION_ENABLED: "0",
    HUMI_MEAL_EXECUTION_HOUSEHOLDS: "",
  }
});
assert.equal(result.stderr, "", "the production deployment-set runtime import must not emit module resolution failures");

const previewEnv = {
  ...process.env,
  NODE_ENV: "production",
  HUMI_SESSION_SECRET: "deploy-set-session-secret-000000000000",
  HUMI_TELEMETRY_HASH_SALT: "deploy-set-telemetry-salt-00000000000",
  HUMI_NATIVE_SHELL_ENABLED: "0",
  HUMI_NATIVE_SHELL_HOUSEHOLDS: "",
  HUMI_MEAL_EXECUTION_ENABLED: "0",
  HUMI_MEAL_EXECUTION_HOUSEHOLDS: "",
};
const productionPreviewCheck = await run(process.execPath, ["scripts/check-native-production-env.mjs"], {
  cwd: stagingDirectory,
  env: previewEnv,
});
assert.match(productionPreviewCheck.stdout, /Native preview production environment gate passed/);
assert.equal(productionPreviewCheck.stderr, "");

for (const [name, override, expectedMessage] of [
  ["native shell flag", { HUMI_NATIVE_SHELL_ENABLED: "1" }, "HUMI_NATIVE_SHELL_ENABLED must be 0"],
  ["native allowlist", { HUMI_NATIVE_SHELL_HOUSEHOLDS: "home-live" }, "HUMI_NATIVE_SHELL_HOUSEHOLDS must be empty"],
  ["meal execution flag", { HUMI_MEAL_EXECUTION_ENABLED: "1" }, "HUMI_MEAL_EXECUTION_ENABLED must be 0"],
  ["meal allowlist", { HUMI_MEAL_EXECUTION_HOUSEHOLDS: "home-live" }, "HUMI_MEAL_EXECUTION_HOUSEHOLDS must be empty"],
  ["telemetry salt", { HUMI_TELEMETRY_HASH_SALT: "short-secret-value" }, "HUMI_TELEMETRY_HASH_SALT must contain at least 32 characters"],
]) {
  let failure = null;
  try {
    await run(process.execPath, ["scripts/check-native-production-env.mjs"], {
      cwd: stagingDirectory,
      env: { ...previewEnv, ...override },
    });
  } catch (error) {
    failure = error;
  }
  assert(failure, `${name} must fail the production preview environment gate`);
  const output = `${failure.stdout || ""}\n${failure.stderr || ""}`;
  assert.match(output, new RegExp(expectedMessage));
  assert.doesNotMatch(output, /deploy-set-telemetry-salt|short-secret-value/, `${name} failure must not print secret values`);
}

console.log("API deployment-set import contract passed.");

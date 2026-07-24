function requireExactZero(name) {
  if (String(process.env[name] || "").trim() !== "0") {
    throw new Error(`${name} must be 0 for the native preview production deployment.`);
  }
}

function requireEmpty(name) {
  if (String(process.env[name] || "").trim() !== "") {
    throw new Error(`${name} must be empty for the native preview production deployment.`);
  }
}

requireExactZero("HUMI_NATIVE_SHELL_ENABLED");
requireEmpty("HUMI_NATIVE_SHELL_HOUSEHOLDS");
requireExactZero("HUMI_MEAL_EXECUTION_ENABLED");
requireEmpty("HUMI_MEAL_EXECUTION_HOUSEHOLDS");

if (String(process.env.HUMI_TELEMETRY_HASH_SALT || "").length < 32) {
  throw new Error("HUMI_TELEMETRY_HASH_SALT must contain at least 32 characters.");
}

await import("../api/store.js");
await import("../api/server.js");

console.log("Native preview production environment gate passed.");

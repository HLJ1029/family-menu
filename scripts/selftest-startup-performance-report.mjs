import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = spawnSync(process.execPath, ["scripts/check-startup-performance.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert.equal(run.status, 0, run.stderr || run.stdout);
const report = JSON.parse(run.stdout);
assert.equal(report.contractOk, true, "local deterministic contracts should be reported separately");
assert.equal(report.deviceBudgetsVerified, false, "device budgets must remain unverified without DevTools evidence");
assert.equal(report.overallStatus, "blocked", "the overall status must remain blocked until device budgets are verified");
assert.equal(Object.prototype.hasOwnProperty.call(report, "ok"), false, "top-level ok must not imply device-budget acceptance");
assert.equal(report.externalEvidence.reason, "devtools_login_required");

console.log("Startup performance report semantics self-test passed.");

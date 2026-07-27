import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { runWechatPrivacyBehaviorChecks } from "./lib/wechat-privacy-behavior.mjs";

const result = runWechatPrivacyBehaviorChecks({ root: process.cwd() });
assert.deepEqual(
  result.checks.map((check) => ({ id: check.id, ok: check.ok })),
  [
    { id: "identity_explicit_action", ok: true },
    { id: "poster_album_write", ok: true },
    { id: "reminder_explicit_consent", ok: true },
  ],
);
assert.equal(result.ok, true);

const gateOutput = execFileSync(process.execPath, ["scripts/check-wechat-privacy-contract.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
const gate = JSON.parse(gateOutput);
assert.equal(gate.behavior?.ok, true, "the actual privacy gate must consume behavior results");
assert.deepEqual(gate.behavior.checks.map((check) => check.id), [
  "identity_explicit_action",
  "poster_album_write",
  "reminder_explicit_consent",
]);
assert.deepEqual(gate.documentation, {
  ok: true,
  platformDeclarationStatus: "pending",
  readmeClaimsPlatformComplete: false,
});

console.log("WeChat privacy behavior selftest passed.");

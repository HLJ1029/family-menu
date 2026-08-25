import assert from "node:assert/strict";
import {
  WECHAT_RELEASE_STATUS_TIMEOUT_MS,
  parseLastJson,
  runWechatReleaseStatus,
} from "./lib/wechat-submit-readiness-runner.mjs";

assert.equal(WECHAT_RELEASE_STATUS_TIMEOUT_MS, 360_000);

let receivedOptions;
const accepted = await runWechatReleaseStatus({
  runner: async (_command, _args, options) => {
    receivedOptions = options;
    return { stdout: "npm preface\n{\"ok\":true,\"release\":{}}\n", stderr: "" };
  },
});
assert.equal(accepted.ok, true);
assert.equal(accepted.status.ok, true);
assert.equal(receivedOptions.timeout, 360_000);

for (const [error, code] of [
  [Object.assign(new Error("private timeout detail"), { code: "ETIMEDOUT", killed: true }), "release_status_timeout"],
  [Object.assign(new Error("private command detail"), { code: 1 }), "release_status_command_failed"],
]) {
  const report = await runWechatReleaseStatus({ runner: async () => { throw error; } });
  assert.deepEqual(report, { ok: false, code });
  assert.doesNotMatch(JSON.stringify(report), /private .* detail/);
}

assert.deepEqual(
  await runWechatReleaseStatus({ runner: async () => ({ stdout: "not-json", stderr: "" }) }),
  { ok: false, code: "release_status_output_invalid" },
);
assert.deepEqual(parseLastJson("prefix\n{\"ok\":false}\n"), { ok: false });

console.log("WeChat submit readiness runner selftest passed.");

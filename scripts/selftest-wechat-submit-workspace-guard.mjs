import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

try {
  await execFileAsync("npm", ["run", "release:wechat:prepare-submit"], {
    env: {
      ...process.env,
      HUMI_WECHAT_REVIEW_ACTION_CONFIRMED: "",
    },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  throw new Error("release:wechat:prepare-submit unexpectedly succeeded without HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1.");
} catch (error) {
  const stdout = String(error.stdout || "");
  const stderr = String(error.stderr || "");
  const output = `${stdout}\n${stderr}`;
  const expected = [
    "Humi 1.1 微信提审工作台未打开",
    "必须先由用户在动作当下确认",
    "HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit",
  ];

  if (error.message.includes("unexpectedly succeeded")) {
    throw error;
  }

  for (const phrase of expected) {
    if (!output.includes(phrase)) {
      throw new Error(`prepare-submit guard output missing expected phrase: ${phrase}\n\n${output}`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    checkedAt: new Date().toISOString(),
    guard: "release:wechat:prepare-submit requires HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 before opening WeChat platform.",
  }, null, 2));
}

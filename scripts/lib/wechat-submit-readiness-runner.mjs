import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const WECHAT_RELEASE_STATUS_TIMEOUT_MS = 360_000;

export async function runWechatReleaseStatus({
  runner = execFileAsync,
  timeoutMs = WECHAT_RELEASE_STATUS_TIMEOUT_MS,
} = {}) {
  try {
    const result = await runner("npm", ["run", "release:status"], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
    });
    const status = parseLastJson(result.stdout);
    if (!status) return { ok: false, code: "release_status_output_invalid" };
    return { ok: true, status };
  } catch (error) {
    const timedOut = error?.code === "ETIMEDOUT" || error?.killed === true || error?.signal === "SIGTERM";
    return {
      ok: false,
      code: timedOut ? "release_status_timeout" : "release_status_command_failed",
    };
  }
}

export function parseLastJson(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

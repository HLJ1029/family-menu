import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const BEHAVIOR_CHECKS = Object.freeze([
  { id: "identity_explicit_action", script: "scripts/check-identity-runtime.mjs" },
  { id: "poster_album_write", script: "scripts/check-miniprogram-poster-share.mjs" },
  { id: "reminder_explicit_consent", script: "scripts/check-miniprogram-meal-reminder.mjs" },
]);

export function runWechatPrivacyBehaviorChecks({ root } = {}) {
  const repository = resolve(String(root || ""));
  const checks = BEHAVIOR_CHECKS.map(({ id, script }) => {
    try {
      execFileSync(process.execPath, [script], {
        cwd: repository,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
      return { id, ok: true };
    } catch (error) {
      return {
        id,
        ok: false,
        error: String(error?.stderr || error?.message || error).trim().slice(0, 500),
      };
    }
  });
  return { ok: checks.every((check) => check.ok), checks };
}

export { BEHAVIOR_CHECKS };

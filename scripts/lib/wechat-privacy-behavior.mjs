import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const BEHAVIOR_CHECKS = Object.freeze([
  {
    id: "identity_explicit_action",
    script: "scripts/check-identity-runtime.mjs",
    capabilityTriggers: {
      wechat_identity: "explicit_user_action",
      nickname_avatar: "explicit_user_action",
    },
  },
  {
    id: "poster_album_write",
    script: "scripts/check-miniprogram-poster-share.mjs",
    capabilityTriggers: { photo_album: "explicit_save" },
  },
  {
    id: "reminder_explicit_consent",
    script: "scripts/check-miniprogram-meal-reminder.mjs",
    capabilityTriggers: { subscription_message: "explicit_schedule_confirmation" },
  },
]);

export function runWechatPrivacyBehaviorChecks({ root } = {}) {
  const repository = resolve(String(root || ""));
  const checks = BEHAVIOR_CHECKS.map(({ id, script, capabilityTriggers }) => {
    try {
      execFileSync(process.execPath, [script], {
        cwd: repository,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
      return { id, ok: true, capabilityTriggers };
    } catch (error) {
      return {
        id,
        ok: false,
        error: String(error?.stderr || error?.message || error).trim().slice(0, 500),
      };
    }
  });
  return {
    ok: checks.every((check) => check.ok),
    checks,
    verifiedTriggers: Object.assign(
      {},
      ...checks.filter((check) => check.ok).map((check) => check.capabilityTriggers),
    ),
  };
}

export { BEHAVIOR_CHECKS };

# Task 6 Report — Explicit Native Identity Onboarding

## RED

Before implementation, the required contracts failed as intended:

- `npm run validate:identity` failed at `identity API calls must reuse authenticated request retries`; the page still duplicated raw `wx.login` and `wx.request`.
- `npm run validate:native-session` failed at `identity completion needs a user-scoped bootstrap cache reset`; no cache-reset helper existed.

## GREEN changes

- Silent login now uses the Task 4 `loginWithWechat()` session foundation. An incomplete user starts with empty `displayName`, `selectedAvatarKey`, and `avatarUrl`; the server's fallback avatar key is never displayed as an explicit choice.
- Added the approved `avatar-picker` component and required an explicit avatar key or avatar URL plus a trimmed nickname before enabling `保存并进入 Humi`.
- `wx.getUserProfile` is called only by the explicit `使用微信头像和昵称` tap handler. A declined permission still permits manual nickname plus an approved Humi avatar. Remote WeChat avatars download, compress, and upload through the same explicit avatar save path as locally chosen avatars.
- Identity and phone binding reuse `requestHumi`; neither duplicates raw authenticated `wx.request` logic. POST operations keep the existing no-idempotency/no-401-replay rule.
- Identity completion persists the returned user session, clears only that user's last-household pointer and household cache, then reLaunches boot with `reason=identity_complete`.

## No automatic household creation

The identity runtime contract asserts both startup and submit issue zero `/households` requests. It asserts the post-save route is `/pages/boot/index?reason=identity_complete`; boot/bootstrap remains the sole source for deciding whether a household exists. The household and API smoke suites also passed, including the new-user/no-household lifecycle contract.

## Verification output

Fresh final checks exited `0`:

- `npm run validate:identity` — `Identity store checks passed.` / `Identity runtime checks passed.`
- `npm run validate:household` — `Household lifecycle checks passed.`
- `npm run validate:native-session` — `Native session foundation contract passed.`
- `npm run validate:native-shell-routing` — `Native shell routing checks passed.`
- `npm run validate:native-bootstrap-api` — `Native bootstrap API contract passed.`
- `npm run validate:native-offline` — `Native offline, cache, telemetry, and store foundation contract passed.`
- `npm run validate:api` — `Humi API smoke test passed.`
- `npm run build` — completed successfully (existing Rollup large-chunk warning only).
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — `Secret scan passed.`

## Concerns

No unresolved functional concern. The production build retains its pre-existing large-chunk advisory; Task 6 adds no bundle split or deployment change.

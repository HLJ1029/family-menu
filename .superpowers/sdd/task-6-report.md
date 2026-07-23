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

## Review remediation RED/GREEN

- RED: store and API contracts accepted nickname-only identity and therefore converted the server fallback avatar into a completed identity (`Missing expected rejection` / HTTP `200 !== 400`).
- GREEN: `miniprogram/data/approved-avatar-keys.json` is now the single approved-key contract consumed by the picker, identity page, store, and API handler. Incomplete users must provide an approved key in this save or already have a successfully uploaded avatar URL. Empty and arbitrary keys are rejected with stable `avatar_required` and `invalid_avatar_key` codes without changing profile status.
- Runtime tests execute remote and local avatar submit paths: allowed WeChat CDN URL → `downloadFile` → `compressImage` → file read → avatar POST → profile PUT → session/cache/boot; local `wxfile://` skips download. HTTPS host parsing is anchored and rejects HTTP, subdomain, userinfo, and arbitrary-host bypasses.
- Identity and phone-bind map request codes to fixed recoverable Chinese text; raw `invalid_session` and `network_error` are not rendered to the user.

## Second review deployment remediation

- RED: `npm run validate:api-deploy-set` failed with `ENOENT` for `api/data/approved-avatar-keys.json`; API store imported the miniprogram projection, but production rsync copies only the API deployment set.
- GREEN: `api/data/approved-avatar-keys.json` is now canonical. The miniprogram JSON is an explicitly tested value projection. `validate:api-deploy-set` deep-compares both contracts, stages only the documented deployment set in a temporary directory, and successfully imports both `api/store.js` and `api/server.js` there.
- The API deployment runbook now synchronizes and backs up/restores all runtime imports (`api/`, `src/lib/mealExecution.js`, recipe/cook-assist JSON, package manifests), and its production pre-start command resolves real imports after `npm ci`; it is not limited to `node --check`.
- The temporary staging test explicitly creates every copied parent directory before `cp`; the runbook conditions `src`/`data` backup and rollback so an older production layout lacking either directory does not abort the procedure or delete an unrecoverable directory.

## Final regression correction

- RED: `npm run validate:miniprogram-entry` reproducibly failed because its identity-page VM only allowed the pre-Task-6 `../../utils/config` dependency while the page now correctly uses shared session/request/bootstrap/error-message and approved-avatar contracts.
- GREEN: the entry fixture now maps the current dependencies, supplies a counted shared `loginWithWechat` stub with a valid incomplete session, and asserts `action=login` clears stale session, invokes shared login exactly once, persists that session, and issues no raw `/auth/wechat/login` request. This corrects fixture drift without changing production identity behavior or weakening the legacy entry/H5/401 checks.
- `docs/humi-api-contract.md` records the explicit-avatar completion rule and stable `400 avatar_required` / `400 invalid_avatar_key` responses.

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
- `npm run validate:collaboration-identity` — `Collaboration identity checks passed.`
- `npm run release:collaboration:smoke` — completed with `"ok": true`.
- `npm run validate:meal-execution`, `npm run validate:meal-execution-api`, `npm run validate:meal-run-client`, `npm run validate:meal-execution-ui`, and `npm run validate:miniprogram-meal-reminder` — all passed.
- `npm run build` — completed successfully (existing Rollup large-chunk warning only).
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — `Secret scan passed.`

## Concerns

External deployment gate remains unresolved: this code accepts only `https://thirdwx.qlogo.cn` and `https://wx.qlogo.cn` for remote WeChat avatars, but the 微信公众平台 `downloadFile` domain configuration and true-device download have not been performed or verified by this task. The runbook now marks this as a hard pre-release gate, requiring control-panel configuration and real-device evidence for those domains and `https://api.humi-home.com`. The production build also retains its pre-existing large-chunk advisory.

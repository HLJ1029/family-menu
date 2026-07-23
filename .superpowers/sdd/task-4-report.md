# Task 4 — Native Session, Request, Cache, Telemetry, and Offline Foundations

## Status

Implemented on baseline `682ea4cdd1ab5e1201af3c0d94886f2eda4310cd`. Scope is limited to the N1 native platform utilities, lifecycle wiring, package scripts, and their mocked-`wx` contracts. No API, deployment, upload, identity UI, tab/boot page, Supabase, or advertising code was changed.

## TDD evidence

### RED

1. After adding the two contract scripts, ran:

   ```sh
   npm run validate:native-session; native_session_status=$?; npm run validate:native-offline; native_offline_status=$?; exit $(( native_session_status || native_offline_status ))
   ```

   Both scripts failed as intended with `Error: Cannot find module '.../miniprogram/utils/errors.js'`.

2. Added the `product_event` privacy test and ran:

   ```sh
   npm run validate:native-offline
   ```

   It failed with `AssertionError [ERR_ASSERTION]: Missing expected exception`, proving an event carrying `nickname` was still accepted.

3. Added bounded multi-batch flush coverage and ran the same command. It failed with:

   ```text
   AssertionError [ERR_ASSERTION]: flush must drain remaining events in bounded batches
   actual: [20]
   expected: [20, 5]
   ```

### GREEN

After each minimal implementation increment, the focused scripts passed. Final fresh command:

```sh
npm run validate:native-session && npm run validate:native-offline && npm run validate:miniprogram-entry && npm run validate:native-bootstrap-api && /Users/honglijie/AI-HQ/scripts/secret-scan.sh && git diff --check
```

Key output:

```text
Native session foundation contract passed.
Native offline, cache, telemetry, and store foundation contract passed.
Mini-program entrypoint resilience checks passed.
Native bootstrap API contract passed.
Secret scan passed.
```

`validate:miniprogram-entry` intentionally emitted its existing mocked `Humi web-view error { errMsg: 'domain blocked' }` diagnostic before reporting success.

## Implementation

- `miniprogram/utils/errors.js`: typed `HumiRequestError` with status, code, retryability, and conflict envelope/version metadata.
- `miniprogram/utils/session.js` and `request.js`: expiry-safe storage; WeChat login; single-flight refresh; one GET/idempotent replay only; second `401` clears storage and returns `invalid_session`; sensitive request headers are never logged.
- `miniprogram/utils/cache.js`: per-household cache schema v1 with a seven-day TTL. It stores a local read envelope only and is never a shared-state source of truth.
- `miniprogram/utils/telemetry.js`: event and field allowlists, sanitization of identity/secrets/free text, 20-event maximum batches, and the `startSpan("bootstrap", ...)` contract for Task 5.
- `miniprogram/utils/offline-queue.js`: strict action allowlist, ordered household/MealRun replay, 100-action/256-KB bounds, conflict stop, retry stop, and non-retryable dead-letter handling. Queued `product_event` uses the same privacy-safe telemetry allowlist.
- `miniprogram/utils/store.js`: a narrow observable in-memory app store.
- `miniprogram/app.js`: restores session and marks the package as a native-shell candidate during launch; attempts queue flushes on foreground.
- `miniprogram/utils/config.js` and `package.json`: central native constants plus `validate:native-session` and `validate:native-offline` commands.
- `scripts/check-native-session.mjs` and `scripts/check-native-offline-queue.mjs`: mocked-`wx` contract coverage for all foundations above.

## Self-review

- A `401` cannot cause more than one `wx.login` or one authenticated replay. Non-GET requests without an idempotency key do not refresh/replay.
- `Authorization`, `X-Humi-Idempotency-Key`, and `If-Match` are only sent when present and no utility logs request headers.
- Cache key includes schema v1 and household ID; invalid/expired cache is removed before returning `null`.
- Only the six specified offline action types are accepted. Conflicts retain the current action and stop later replay; non-retryable failures are retained only as `{ id, code }` dead letters.
- Telemetry permits declared event/field values only; nickname, token, URL query, note, and arbitrary error-message fields are discarded or rejected for queued product events.
- `git diff --check` and the AI-HQ secret scan are clean.

## Follow-up / concerns

- No blocking concern. Task 5 should supply each queued mutation's explicit API `path`/payload and call `startSpan("bootstrap", ...)`; this foundation deliberately does not invent endpoint mappings.
- This checkpoint does not change legacy page-local request code; migration of those callers belongs to the later native pages/identity work.

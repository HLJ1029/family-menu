# Phase 3 Task 5 Report — Household Collaboration History API and UI

## Delivery

- Implementation commit: `8b5bde8ecba072bbe7bf01c3cd962b129b4a7d17` (`feat: show readable Humi collaboration history`)
- Scope: authenticated household collaboration history API, strict event projection, Humi API client cancellation support, readable history UI, and API/browser/documentation regressions.
- Explicitly excluded: parent-plan checkboxes, Task 6 delivery record, production data/deployment, WeChat provider settings, migrations, and Supabase work.

## RED evidence

1. `npm run validate:api` first failed at the new history authorization regression: unauthenticated `GET /households/:id/collaborations` returned the old generic `404`, while the contract requires `401 missing_token`. The missing route was the direct cause.
2. `npm run release:product:smoke -- --base-url http://127.0.0.1:4173/ --evidence-dir /Users/honglijie/.humi-release-evidence/phase3-task5-red-browser-20260720b` first failed waiting for `小禾想吃番茄炒蛋`. The old `FamilyActivityPage` rendered only Phase 2 local summaries and never loaded the history endpoint.
3. The first post-GREEN browser run exposed a grocery sentence spacing defect and a test listener that incorrectly treated an intentional intercepted `503` as an unhandled page error. The production sentence and the test's page-error boundary were corrected; the retry behavior itself remained covered.

## GREEN contract

- `GET /households/:householdId/collaborations?limit=50` requires an unrevoked bearer and formal membership. Owner/member results are equal; outsider and unknown households receive masked `404 household_not_found`; all rejected reads are byte-for-byte non-mutating.
- The endpoint defaults to 50 and clamps limits to 1..100, reads newest-first through `Store#getHouseholdCollaborationEvents`, and returns only `{ householdId, events }`.
- Each public event is an explicit allowlisted projection: `id`, `requestType`, `actionType`, `createdAt`, `participant: { displayName, avatarUrl }`, and an action-specific payload. Internal request/member/participant identity, merge/claim metadata, secrets, tokens, state/family envelopes and PII are recursively denied by regression.
- `loadHouseholdCollaborations(session, householdId, limit, { signal })` sends authenticated requests and joins caller cancellation to its timeout controller without changing prior caller behavior or session-invalid handling.
- `FamilyActivityPage` reloads on session/household changes, ignores aborted/unmounted responses, presents loading/cloud-empty/error states, retries in place, and renders avatar-or-initial fallback, localized time, and natural Chinese event rows. Phase 2 local summaries appear only after an error under `当前设备记录`.
- The legacy collaboration-flow smoke now correctly asserts the primary server-history row rather than the former local-only summary.

## Verification

- `npm run validate:api` — passed.
- `npm run validate:collaboration-identity` — passed.
- `npm run validate:household` — passed.
- `npm run validate:identity` — passed.
- `npm run validate:h5-entry` — passed.
- `npm run validate:miniprogram-entry` — passed; expected simulated `domain blocked` diagnostic emitted.
- `node scripts/smoke-collaboration-flow.mjs` — passed.
- `npm run release:product:review` — passed.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/ --evidence-dir /Users/honglijie/.humi-release-evidence/phase3-task5-collaboration-browser-20260720` — passed (20 checks).
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4173/ --evidence-dir /Users/honglijie/.humi-release-evidence/phase3-task5-final-browser-20260720` — passed, including history loading, cloud empty, error fallback/retry, stale unmount, privacy, and existing product regressions.
- `npm run build` — passed; existing non-blocking Vite large-chunk warning remains (`index-BPRQZZFu.js`, 865.45 kB).
- `git diff --check` and `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — passed.

## Private evidence

- Product manifest: `/Users/honglijie/.humi-release-evidence/phase3-task5-final-browser-20260720/manifest.json`
- Product manifest SHA-256: `dfae431dcafdce5993f8a84519e144a05379e6332684aecc66543e8e5fb6d22c`
- Collaboration manifest: `/Users/honglijie/.humi-release-evidence/phase3-task5-collaboration-browser-20260720/manifest.json`
- Collaboration manifest SHA-256: `54b5dd84fad3ed93f250a2bcef22a71977d8da62587823320ddbdcc52d04b5f7`
- Screenshots remain private and were not committed.

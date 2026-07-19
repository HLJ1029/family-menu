# Task 7 Report — Phase 2 Product and Evidence Corrections

## Status

Implementation corrections are recorded in candidate commit `b0dc6af` (`fix: close Humi Phase 2 review gaps`), built from baseline `23332ea`. The Task 7 local matrix and durable manifests were green, but the subsequent broad review correctly returned NO-GO: its owner Wish workflow was not behaviorally equivalent to the legacy flow, and its preference summary omitted household size and main tastes. Task 8 supersedes those two claims. No production API, deployment, migration, WeChat action, Supabase operation, or publish action was performed.

## RED evidence

The required regressions were added before implementation.

- `npm run validate:api` failed because `POST /households` accepted a blank name and returned 201 instead of `400 household_name_required`.
- `npm run release:product:review` failed because the family living room lacked role, avatar/count and preference-navigation evidence; the review gate also lacked family-ID route reset, durable collaboration evidence, preservation/privacy and explicit legacy household bootstrap checks.
- The local product smoke failed at the missing family-preference action. Its RED manifest is `/Users/honglijie/.humi-release-evidence/task7-red-product-smoke-20260719T1538Z/manifest.json`.

## Corrections

- The family living room now exposes the current role, formal-member avatar or initials, member count and a clickable preference summary that opens Family Settings.
- New-household drafts default to `我们家`. Blank names are rejected by the client, Store and HTTP API; the client preserves the invalid draft and exposes an accessible error association.
- Family-internal navigation is keyed by `family.id`, so leaving/switching and creating another family renders the new living room synchronously instead of painting stale settings.
- Product evidence now covers meal-log, Crave signal, grocery and Wish preservation across rename/remove/transfer, plus activity-DOM exclusion of tokens, owner secrets, participant keys, household IDs and internal field names.
- Generic Crave, grocery and Wish claim errors consistently describe binding participation rather than joining a family.
- Collaboration-landing evidence defaults to a private timestamped directory under `/Users/honglijie/.humi-release-evidence/`, not `/tmp`.
- The legacy collaboration mega-smoke now completes the owner identity and explicitly creates a household before collaboration. Its prior flows remain executed; obsolete My Home locators were mapped to the approved Phase 2 family-living-room and Tonight entry points.
- Temporary participation binding asserts that the active API vote is claimed, the pending context clears and household membership does not grow. Hydrated historical signals remain available without retaining a temporary participant key.

The prior statement that the mega-smoke diff was a fully equivalent semantic migration was inaccurate. Although the named runner calls remained, Task 7's `verifyWishPoolPlanningFlow` manually seeded `humi:wish-pool:v1`, entered the library directly and never exercised the owner refresh or `onPlanWish` callback from the family living room. Showing an API Wish receipt in collaboration activity did not prove that the owner could collect it into the real Wish pool or plan it for tonight. Task 8 restores that missing end-to-end behavior with a real local API request and guest replies; the other retained runner calls continue unchanged.

## Targeted GREEN evidence

- `npm run validate:api` — exit 0.
- `npm run release:product:review` — exit 0.
- `node scripts/smoke-collaboration-flow.mjs` — exit 0 with all restored legacy calls executing.
- Fresh product smoke passed with `ok: true` and no failed checks at `/Users/honglijie/.humi-release-evidence/task7-final-product-smoke-20260719T160947Z/manifest.json`.
- Fresh durable collaboration landing smoke passed with `ok: true` and no page errors at `/Users/honglijie/.humi-release-evidence/task7-final-collaboration-smoke-20260719T160947Z/manifest.json`.

## Scope and deferrals

- The parent-owned `docs/superpowers/plans/2026-07-19-humi-family-living-room.md` is intentionally excluded from this task's staging.
- WeChat true-device identity, native share, upload, review and publish remain deferred.
- Production migration, production writes and physical Supabase retirement remain deferred and were not touched.

## Final matrix

The following fresh commands passed:

- `npm run validate:household`
- `npm run validate:identity`
- `npm run validate:api`
- `npm run validate:miniprogram-entry`
- `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task7-final-h5-entry-20260719T160947Z npm run validate:h5-entry`
- `npm run release:product:review` — `ok: true`, 38 static product anchors.
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task7-final-product-smoke-20260719T160947Z`
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task7-final-collaboration-smoke-20260719T160947Z`
- `node scripts/smoke-collaboration-flow.mjs` — `Humi collaboration and library meal flow smoke passed.`
- `npm run build` — 1747 modules transformed; only the existing chunk-size warning remains (`dist/assets/index-DyGiKPfC.js`, 858.03 kB).
- `git diff --check`
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh`

The Vite server on port 4176 and all smoke-owned local servers were stopped. This Task 7 matrix did not resolve every final-review finding; Task 8 carries the corrective evidence. Phase 2 remains pending a fresh independent GO and true-device checks.

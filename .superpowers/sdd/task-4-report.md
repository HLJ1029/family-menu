# Task 4 — Members, Settings, Activity and Account Pages

## Status

Completed locally on 2026-07-19. No production API, deployment, WeChat review, or publish action was performed.

## RED → GREEN evidence

- RED: local product smoke against `http://127.0.0.1:4173/` failed at 2026-07-19T14:19:48Z because `household-members-page` did not exist. Evidence: `/Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260719T141908Z/manifest.json`.
- GREEN: local product smoke passed at 2026-07-19T14:32:44Z. Evidence: `/Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260719T143253Z/manifest.json`.
  - It opens all four living-room child pages, returns to the living room, and retains five primary tabs.
  - It checks owner controls and the absence of member invite/remove/transfer and `邀请家人写想吃` controls.
  - It checks settings-based multi-household switching, the valid Dashboard nutrition path, truthful avatar/phone/link display, and metadata-only lifecycle preservation.

## Implementation

- Added focused members, household settings, activity, and account pages, routed inside `UserCenter` so they remain under the existing My Home tab.
- Added complete-session H5 lifecycle callbacks in `main.jsx` for rename, remove, transfer, and leave. They update state only after the Task 2 client returns.
- Added `preserveStateWhenMissing` to the state hydrator. Rename/remove/transfer responses contain household metadata but no state, so their fresh authoritative member data now updates without clearing menu, meal plan, logs, or preferences. The preserve branch keeps only existing non-formal collaborators beside the refreshed formal membership.
- Re-enabled the multi-household, owner-managed household-constraints, and nutrition product-review gates.
- Account/member avatars use server `avatarUrl` when available; the account page uses `phoneVerified` plus `phoneMasked` and honestly displays `未绑定` otherwise. Policy links target `/privacy.html` and `/terms.html`.

## Commit and scope

- `ab6c46d feat: add Humi family management pages`
  - `src/components/HouseholdMembersPage.jsx`
  - `src/components/HouseholdSettingsPage.jsx`
  - `src/components/FamilyActivityPage.jsx`
  - `src/components/HumiAccountPage.jsx`
  - `src/components/UserCenter.jsx`
  - `src/main.jsx`
  - `scripts/smoke-product-entrypoints.mjs`
  - `scripts/check-product-review-readiness.mjs`

The parent-owned `docs/superpowers/plans/2026-07-19-humi-family-living-room.md` change was deliberately not staged or committed.

## Validation

- `npm run release:product:smoke -- --base-url http://127.0.0.1:4173/` — passed.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/` — passed.
- `npm run validate:identity` — passed.
- `npm run release:product:review` — passed with no deferred gates.
- `npm run build` — passed; only the pre-existing Vite chunk-size warning remains.
- `git diff --check` — passed.
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — passed.

## Self-review and concerns

- Reviewed lifecycle responses against `api/server.js`: rename/remove/transfer omit `state`; the explicit preservation branch prevents the prior data-loss behavior while still replacing formal members from the server response.
- The server remains the authorization authority; UI controls only mirror owner/member state and API errors are shown as natural-language notices.
- Device-specific real WeChat account data and real avatar images were not exercised because this task intentionally used local mocked smoke only. The smoke uses data URL avatars and masked phone state to assert rendering paths without contacting production.

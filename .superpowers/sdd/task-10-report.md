# Task 10 — Restore UI-Driven Multi-Household Creation

## Status and scope

Implemented locally on 2026-07-20 from baseline `c77772c`. The exact Task 10 implementation commit is `3045bdc` (`fix: restore Humi multi-household creation`). The complete matrix ran before commit creation against executable product and regression-script content byte-identical to `3045bdc`; the only later pre-commit edits were this report and the delivery record. No production write, deployment, migration, Supabase provider operation, real WeChat login, upload, review or publish action was performed.

The parent-owned `docs/superpowers/plans/2026-07-19-humi-family-living-room.md` remains deliberately unstaged and outside Task 10.

## RED evidence

- Static RED: `npm run release:product:review` exited 1 at 2026-07-20 01:58 CST. Exact missing anchors were the settings-page `onCreateHousehold`, `例如：爸妈家`, `新建一个家`, accessible error/pending validation; `UserCenter` forwarding; `{ ok: false }` / `{ ok: true }` results in `main.jsx`; and removal of the silent `另一个家` fallback.
- Legacy mega-smoke RED: `node scripts/smoke-collaboration-flow.mjs` exited 1 at `verifyHouseholdUserCenterFlow`, timing out while waiting for `getByTestId('household-settings-page').getByPlaceholder('例如：爸妈家')`. The regression had already removed the direct POST path.
- Product smoke RED: the same visible-path locator timed out. Failure manifest: `/tmp/humi-task10-product-red/manifest.json`.

All three RED failures occurred before product implementation changes.

## Implementation

- `UserCenter` accepts `onCreateHousehold` and forwards it only to `HouseholdSettingsPage`.
- `HouseholdSettingsPage` adds an owner-only create card with placeholder `例如：爸妈家` and exact action `新建一个家`. It trims and rejects blank names locally, preserves input on validation/API failure, exposes an inline `role="alert"`, and combines a synchronous in-flight ref with disabled pending UI to prevent double submit.
- `createAnotherHumiHousehold` independently trims/rejects blank input, denies non-owner use, removes the fabricated `另一个家` default, and returns truthful `{ ok, message/family }` results. It mutates no family data before `POST /households` succeeds and consumes only the returned server envelope.
- The existing family-ID route identity sends successful creation directly to the new living room. The existing switcher remains the only switch path.
- The retained legacy mega-smoke now creates the second home exclusively through Family Settings and switches back through the same UI.
- Product smoke intercepts the actual UI POST, checks body/pending/error behavior, proves the new household has empty menu/profile/collaboration state, switches back, and proves the original state returns. A member session proves the create input/button are absent.
- Static product review now requires the prop wiring, owner-only create UI, local/main validation, envelope handling and UI-driven evidence keys.

## Targeted GREEN evidence

- `npm run release:product:review` — exit 0; 49 static gates.
- `node scripts/smoke-collaboration-flow.mjs` — exit 0; visible UI create and switch-back path passes against the local real API.
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /tmp/humi-task10-product-green-4` — exit 0; 121/121 checks.
- The product result records blank input as zero requests, a simulated 503 with preserved input/error, exact success body `{ householdName: "爸妈家", memberName: "主厨" }`, disabled pending action, active new living room, empty new-family state, restored original menu/profile/Crave/grocery/Wish state, member create-control counts `{ input: 0, button: 0 }`, and zero unexpected page errors.

## Complete Phase 2 matrix

- `npm run validate:household` — exit 0; `Household lifecycle checks passed.`
- `npm run validate:identity` — exit 0; store/runtime checks passed.
- `npm run validate:api` — exit 0; `Humi API smoke test passed.`
- `npm run validate:miniprogram-entry` — exit 0; the printed `domain blocked` event is the expected simulated resilience branch.
- `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task10-final-h5-entry-20260720T020712+0800 npm run validate:h5-entry` — exit 0; 11 checks, 2 screenshots.
- `npm run release:product:review` — exit 0; 49 static gates.
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task10-final-product-smoke-20260720T020712+0800` — exit 0; 121 checks, 18 screenshots.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task10-final-collaboration-smoke-20260720T020712+0800` — exit 0; 17 checks, 6 screenshots.
- `node scripts/smoke-collaboration-flow.mjs` — exit 0; `Humi collaboration and library meal flow smoke passed.`
- `npm run build` — exit 0; 1747 modules transformed. The only warning is the existing >500 KiB chunk (`dist/assets/index-4aZSFBVt.js`, 861.94 kB).
- `git diff --check` — exit 0.
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — exit 0; `Secret scan passed.`

All three durable evidence directories are mode `0700`, manifests are mode `0600`, every manifest has `ok: true`, and every referenced screenshot exists. The local Vite service on port 4176 was stopped after the matrix.

## Durable private evidence

- H5: `/Users/honglijie/.humi-release-evidence/task10-final-h5-entry-20260720T020712+0800/manifest.json`
- Product: `/Users/honglijie/.humi-release-evidence/task10-final-product-smoke-20260720T020712+0800/manifest.json`
- Collaboration: `/Users/honglijie/.humi-release-evidence/task10-final-collaboration-smoke-20260720T020712+0800/manifest.json`

## Review notes and deferrals

- The intentional 503 used to prove failure-draft preservation generates one known browser resource-console message; the smoke explicitly observes the 503 and removes only that exact expected message, leaving all other page/console errors fatal.
- The UI mirrors the owner role, while the server remains the authorization authority. The main callback also rejects non-owner use before the API.
- Real-device cold start/login, two-account household lifecycle, native share/download/album, WeChat upload/review/publish, production backup/migration/monitoring and physical Supabase retirement remain external Phase 4 gates. None was inferred from local evidence.

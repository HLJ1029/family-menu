# Task 9 Report — Truthful Collaboration CTA and Evidence Closure

Status: DONE, pending fresh independent task review

Baseline: `9b255fb`

## Implementation

- Renamed generic landing props from `onJoinFamily` to `onBindParticipation` in Crave, grocery and Wish, and renamed the main handler to `bindParticipationFromSharedLanding`.
- All three post-submit actions now say `登录 Humi，保存这次参与` and explain that login only associates the current action with the Humi identity, never creates household membership, and that a separate household invitation is required.
- Kept the backward-compatible `humi:pending-join-context:v1` key and the existing typed Crave/grocery/Wish payloads. `InviteLanding` and authenticated household-invite behavior remain unchanged.
- Expanded the collaboration landing smoke to submit all three guest actions, inspect truthful completion copy, click each identity CTA, validate typed pending contexts, and assert zero auth and household mutation requests.
- Updated the legacy mega-smoke to use the new CTA while retaining API-backed identity-claim and no-formal-membership assertions.
- Replaced the weak two-image family fixture with one visibly valid, dimensioned SVG data-image and one absent-avatar member. Product smoke now proves image decode/non-zero natural dimensions and visible initials fallback.
- The H5 validator now writes a private success/failure manifest containing `ok`, `checkedAt`, `timestamp`, exact 11 checks, two screenshot paths and `evidenceDir`; it enforces directory `0700` and manifest `0600`.

## TDD RED evidence

- `npm run release:product:review` → exit 1. The three components lacked `onBindParticipation`, the exact CTA and explanation; `main.jsx` still used `joinFamilyFromSharedLanding`/`onJoinFamily`. The independent `InviteLanding` membership check already passed.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task9-red-collaboration-2` → exit 1 at the missing exact `登录 Humi，保存这次参与` button. Failure manifest: `/Users/honglijie/.humi-release-evidence/task9-red-collaboration-2/manifest.json`.
- `node scripts/smoke-collaboration-flow.mjs` → exit 1 at `crave identity-binding completion must not promise household membership`.
- `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task9-red-h5 npm run validate:h5-entry` → exit 1 because the required manifest did not exist.
- Product smoke → exit 1 on `family-living-room-shows-member-avatars-and-count`: the old fixture produced two image elements and no missing-avatar fallback. A concurrent initial RED run also logged transient Vite `Outdated Optimize Dep` 504s; the isolated rerun strategy avoided these during GREEN/final evidence.

## Targeted GREEN

- `npm run release:product:review` → exit 0, `ok:true`.
- Collaboration landing smoke → exit 0, all 17 checks green; targeted manifest `/Users/honglijie/.humi-release-evidence/task9-green-collaboration-targeted/manifest.json`.
- `node scripts/smoke-collaboration-flow.mjs` → exit 0, `Humi collaboration and library meal flow smoke passed.`
- H5 entry validation → exit 0; targeted manifest `/Users/honglijie/.humi-release-evidence/task9-green-h5-targeted/manifest.json`.
- Product smoke → exit 0, all 118 checks green; targeted manifest `/Users/honglijie/.humi-release-evidence/task9-green-product-targeted/manifest.json`.

## Final Phase 2 matrix

All commands ran in the isolated worktree against local/temp state only:

- `npm run validate:household` → exit 0.
- `npm run validate:identity` → exit 0.
- `npm run validate:api` → exit 0.
- `npm run validate:miniprogram-entry` → exit 0. The printed `domain blocked` line is the expected simulated resilience branch.
- `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task9-final-h5-entry-20260720T013049+0800 npm run validate:h5-entry` → exit 0.
- `npm run release:product:review` → exit 0; 46 static checks green.
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task9-final-product-smoke-20260720T013049+0800` → exit 0; 118 checks green.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task9-final-collaboration-smoke-20260720T013049+0800` → exit 0; 17 checks green.
- `node scripts/smoke-collaboration-flow.mjs` → exit 0.
- `npm run build` → exit 0; 1747 modules transformed.
- `git diff --check` → exit 0.
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` → exit 0, `Secret scan passed.`

Final manifests:

- `/Users/honglijie/.humi-release-evidence/task9-final-h5-entry-20260720T013049+0800/manifest.json` (`ok:true`, 11 checks, 2 screenshots, mode `0600`; parent directory `0700`).
- `/Users/honglijie/.humi-release-evidence/task9-final-product-smoke-20260720T013049+0800/manifest.json` (`ok:true`, 118 checks, 18 screenshots, mode `0600`; parent directory `0700`).
- `/Users/honglijie/.humi-release-evidence/task9-final-collaboration-smoke-20260720T013049+0800/manifest.json` (`ok:true`, 17 checks, 6 screenshots, mode `0600`; parent directory `0700`).

## Warnings and deferrals

- Build retains the existing single-chunk warning: `dist/assets/index-BqfAHriW.js` is 860.01 kB after minification.
- No production writes, production URL smoke, deployment, data migration, real WeChat login/device operation, upload/review/publish, or Supabase provider operation was performed.
- True-device identity, two-account household lifecycle and native WeChat evidence remain Phase 4/external gates.
- The local Vite service on port 4176 and the mega-smoke API/Vite processes were stopped after validation.

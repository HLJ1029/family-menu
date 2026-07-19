# Task 11 — Null-Body Contract and Versioned AI-HQ Handoff

## Product status and scope

Implemented locally on 2026-07-20 from documentation baseline `33ea283`. The exact product implementation commit is `e75e98a` (`fix: harden Humi household creation contract`). No production write, deployment, migration, Supabase provider operation, real WeChat login, upload, review or publish action was performed.

The parent-owned `docs/superpowers/plans/2026-07-19-humi-family-living-room.md` remains deliberately unstaged and outside Task 11. The documentation commit containing this report and the refreshed Phase 2 delivery record is the candidate that the later AI-HQ `v1` handoff must package from source baseline `95f4978`; the handoff is intentionally generated only after that immutable candidate hash exists.

## TDD evidence

- RED: a real `fetch` request sent `POST /households` with authentication, `Content-Type: application/json` and raw body string `null`. `npm run validate:api` exited 1 because `handleCreateHousehold` dereferenced `null.householdName`; the server returned 500 and the regression reported `500 !== 400`.
- RED log: `/Users/honglijie/.humi-release-evidence/task11-null-contract-tdd-20260720/red-validate-api.log`, 1105 bytes, SHA256 `7fc831526ee2c6dfed14c9cc66956187c3630244fec20c62691d5f289b7e7f5a`.
- Minimal implementation: only `handleCreateHousehold` normalizes the parsed request body with `(await readJson(request)) ?? {}` before reading creation fields. Non-empty names, explicit creation and status 201 behavior are unchanged.
- GREEN: the same raw request now receives exact HTTP 400 with `error: "household_name_required"`; a following authenticated `GET /households` proves `family: null` and `households: []`. `npm run validate:api` exited 0 with `Humi API smoke test passed.`
- GREEN log: `/Users/honglijie/.humi-release-evidence/task11-null-contract-tdd-20260720/green-validate-api.log`, 199 bytes, SHA256 `ed36e87684ed092535f27970e688e831ebfd5d8681782a292b8312001cdf250f`.
- `docs/humi-api-contract.md` now states that missing, blank and whole-body JSON `null` are equivalent and have no household/state side effects.

## Fresh complete Phase 2 matrix

All commands ran against product content byte-identical to implementation commit `e75e98a`; after the matrix only this report and the delivery record changed.

- `npm run validate:household` — exit 0; `Household lifecycle checks passed.`
- `npm run validate:identity` — exit 0; identity store and runtime checks passed.
- `npm run validate:api` — exit 0; includes the literal JSON `null` regression and zero-household follow-up.
- `npm run validate:miniprogram-entry` — exit 0; the printed `domain blocked` message is the expected simulated resilience branch.
- `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task11-final-matrix-20260720T023742+0800/h5-entry npm run validate:h5-entry` — exit 0; 11 checks and 2 screenshots.
- `npm run release:product:review` — exit 0; 49/49 static product gates.
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4177/ --evidence-dir /Users/honglijie/.humi-release-evidence/task11-final-matrix-20260720T023742+0800/product-smoke` — exit 0; 121/121 checks and 18 screenshots.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4177/ --evidence-dir /Users/honglijie/.humi-release-evidence/task11-final-matrix-20260720T023742+0800/collaboration-smoke` — exit 0; 17/17 checks and 6 screenshots.
- `node scripts/smoke-collaboration-flow.mjs` — exit 0; `Humi collaboration and library meal flow smoke passed.`
- `npm run build` — exit 0; 1747 modules transformed. The only warning is the pre-existing 861.94 kB single chunk.
- `git diff --check` — exit 0.
- `HUMI_REPO=/Users/honglijie/agent-worktrees/humi/humi-wechat-identity-startup /Users/honglijie/AI-HQ/scripts/secret-scan.sh` — exit 0; `Secret scan passed.`
- Vite was stopped after the browser smoke; `lsof` confirmed no listener remained on port 4177.

## Durable private evidence

- H5 manifest: `/Users/honglijie/.humi-release-evidence/task11-final-matrix-20260720T023742+0800/h5-entry/manifest.json`, 1153 bytes, SHA256 `8ccc2792ce9b6e493bd4a6ce3ac5aac616ba3c4b3eb06ac20261537c02b3cb8f`.
- Product manifest: `/Users/honglijie/.humi-release-evidence/task11-final-matrix-20260720T023742+0800/product-smoke/manifest.json`, 51734 bytes, SHA256 `55d4226d872ef2accd3250d348ea01a9acc80d9c61a9218a800cc117f4ddec02`.
- Collaboration manifest: `/Users/honglijie/.humi-release-evidence/task11-final-matrix-20260720T023742+0800/collaboration-smoke/manifest.json`, 6065 bytes, SHA256 `871584dc9774130fce2de3c37b6a41569f2af21d670346ec8c328dcf73570639`.
- Each manifest has `ok: true`; evidence directories are mode `0700`, manifests are mode `0600`, and all 26 referenced screenshots exist and are non-empty.

## AI-HQ handoff boundary

After this report's documentation commit exists, Task 11 requires a stable preview handoff at `/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/`. It must use the exact documentation HEAD as candidate, contain a cumulative binary diff for `95f4978..<candidate>`, the copied delivery record and three final manifests, a checksummed evidence index for all private source evidence, and a `v1/manifest.json`. `HANDOFF.md` must name `Current version: v1`, list every stable current-version artifact with exact bytes/SHA256, and remain status `preview`. That post-commit packaging and validator result is not pre-claimed inside this immutable product report.

## Deferrals and warnings

- The Vite chunk-size warning remains a non-blocking performance follow-up; it is not related to the household contract.
- Real-device cold start/login, two-account household lifecycle, native share/download/album, WeChat upload/review/publish, production backup/migration/monitoring and physical Supabase retirement remain external Phase 4 gates.
- Phase 3 remains gated until the AI-HQ handoff passes task/handoff/checksum/secret validation and a fresh independent broad reviewer returns GO.

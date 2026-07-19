# Phase 3 Final Gate Fixes Report

Final local behavior/test correction candidate: `d738f0bcf8f39cc3e38cae69cd8d9b615ef0aad6`; no Phase 4 or external work occurred. The candidate still awaits final independent re-review.

## Preserved NO-GO and correction history

- The first Task 6 candidate `51e0244` remains **NO-GO**: final broad review found public projection, merged-retry, atomicity, type-isolation, legacy truth, Crave GET zero-write, and evidence-manifest failures.
- `123f908`, `4838701`, `e5d66ab`, and `e9c22f6` corrected those behavior and permanent regression findings. The evidence generated on port 4192 belongs to that superseded candidate and must not be used for final GO.
- Parent fresh verification then reproduced the legacy mega-smoke failure at the Grocery collision check. The server state immediately after API seed still contained the temporary Grocery target, but the reused browser page's first successful `/join` response was for the prior Crave scenario; the Grocery server target remained temporary. No token or participant value was emitted while diagnosing this boundary.
- Root cause: one already-loaded page was reused across Crave, Grocery, Wish, and unknown scenarios while its React hydration, pending-merge, local-storage persistence, and 900 ms cloud-save effects were still live. The test crossed scenario boundaries; the Grocery product join was never invoked.
- GREEN in `7cb9ff6`: Crave, Grocery, Wish, and unknown now each use an independent fresh browser context/page. For every supported type the API action and state seed happen before the new page exists; init data supplies the session, typed pending context, exact scoped key, and all three colliding rows. The test observes the exact type endpoint and server response, proves only the target becomes formal, proves the other two states are deep-equal, and proves only the exact scoped key is cleared. Unknown proves zero join, pending/key retention, and unchanged browser plus server state. The public action response intentionally has no token; the test retains the token only from the owner create response.
- A second independent review marked `7cb9ff6` **NO-GO** for one remaining P1: `mutateAndSave` serialized only disk flushes, not snapshot/mutation/rollback, so a rejected A could erase a concurrently fulfilled B. The two independent NO-GO rounds remain preserved: the broad `51e0244` findings and this concurrency finding on the corrected candidate.
- A third independent review marked `fc8e8bc` **NO-GO**: it protected transaction-vs-transaction work, but ordinary Store writers still mutated during a failed transaction and could be erased by its rollback.

## Concurrent transaction correction

- RED: a fresh Store creates Grocery A and Wish B. A owns the first flush, which is delayed and rejected; B is invoked while A is pending. The old implementation produced A rejected and B fulfilled with two flushes, but A's rollback erased B's Wish action and event from both memory and the second disk flush.
- Root-cause refinement: queueing only the `mutateAndSave` body was insufficient because the action/claim methods had captured request/action objects before entry. After A replaced `this.data` with its snapshot, B mutated an orphaned object.
- GREEN in `fc8e8bc`: a dedicated failure-safe transaction queue serializes the complete snapshot → mutation → save → rollback boundary. Crave, Grocery, and Wish action/claim closures re-resolve their targets and re-run claimability checks from current Store state when executed. The permanent test proves A leaves zero business/event rows, B retains exactly one business/event row, memory and JSON file agree, exactly two flushes occur, and the queue accepts a later successful transaction after failure. Ten consecutive fault-regression runs passed.

## Fresh verification

- Targeted legacy verification passed once after the fixture correction, then passed **three consecutive fresh runs**. Each run created fresh API/Vite ports and a fresh data file and ended with `Humi collaboration and library meal flow smoke passed.` An additional post-commit full-matrix legacy run also passed.
- `validate:household`, `validate:collaboration-identity`, `validate:identity`, `validate:api`, `validate:miniprogram-entry`, `validate:miniprogram-poster`, `validate:h5-entry`, and `release:product:review` all exited 0. The mini-program `domain blocked` line is the expected resilience diagnostic.
- Fresh private evidence root: `/Users/honglijie/.humi-release-evidence/phase3-final-collision-20260720-qxlNCT` (`0700`). Product manifest: `/Users/honglijie/.humi-release-evidence/phase3-final-collision-20260720-qxlNCT/product-smoke/manifest.json`, `ok:true`, 125 checks, 20 referenced/20 generated PNGs, no duplicate refs, mode `0600`, SHA-256 `7cd2ca55acbab1aa49d42ee8ade126e47cb6a01c044804f816be50339bf9b37e`. Collaboration manifest: `/Users/honglijie/.humi-release-evidence/phase3-final-collision-20260720-qxlNCT/collaboration-smoke/manifest.json`, `ok:true`, 20 checks, 6 referenced/6 generated PNGs, no duplicate refs, mode `0600`, SHA-256 `e5c3d266832e663b38399ba5204cea6ddfe9c27e81c1f08f72ef55afe997a2d6`. Both smoke directories are `0700`, and every referenced PNG exists exactly once.
- `npm run build` exited 0 with 1748 modules. Existing non-blocking Vite warning: `dist/assets/index-DY6WuDAL.js` 865.64 kB, gzip 197.18 kB.
- `git diff --check eac3021663b34b14a47ab74f4d950532e8afa98c..HEAD` exited 0. The exact AI-HQ secret scan exited 0 with `Secret scan passed.`
- Evidence Vite used only `http://127.0.0.1:4193/`; it was stopped, and `lsof -nP -iTCP:4193 -sTCP:LISTEN` found no listener.

## Exact deferrals

Still deferred and unauthorized: true-device WeChat login/profile/WebView ticket and guest-flow validation; production deployment and writes; migration backup/dry-run/apply/rollback; provider operations; Supabase physical retirement; and final production user/identity/household/state count reconciliation.

## Current `fc8e8bc` verification

- `validate:household`, `validate:collaboration-identity`, `validate:identity`, `validate:api`, `validate:miniprogram-entry`, `validate:miniprogram-poster`, `validate:h5-entry`, and `release:product:review` all exited 0. At least two post-commit fresh legacy mega-smoke processes exited 0.
- Fresh private evidence root `/Users/honglijie/.humi-release-evidence/phase3-final-concurrency-20260720-kcJqlS` and both smoke directories are `0700`. Product manifest is `0600`, `ok:true`, 125 checks, 20 refs/20 PNGs, SHA-256 `ae61545e71a3da5fdc0d83ee4c48ea4c141b7ca0f98a709e727f6689d7d2adae`. Collaboration manifest is `0600`, `ok:true`, 20 checks, 6 refs/6 PNGs, SHA-256 `ecf5a1a00d42833ffa66e961f324df3938f5eb129780efdd8986b52dbfe892ee`. All refs exist exactly once; there are no unreferenced PNGs.
- `npm run build` exited 0 with 1748 modules and the existing non-blocking 865.64 kB chunk warning. `git diff --check eac3021663b34b14a47ab74f4d950532e8afa98c..HEAD` and the exact AI-HQ secret scan exited 0. Evidence Vite port 4194 was stopped and has no listener.
- Status remains `await final independent re-review`; this report does not mark parent boxes or the master spec complete.

## Third-round cross-writer correction: `d738f0b`

- RED used Grocery transaction A with a delayed/rejected first flush and ordinary B while A remained pending. The old candidate let B fulfill then rolled it back to zero. The permanent attack covers ordinary `createWishShareRequest`, `createHouseholdForUser`, and `saveState`, each 10 rounds.
- GREEN waits for the active transaction before normal `load()` returns, and waits for prior ordinary saves before a transaction snapshots. That wait is failure-safe; only transaction-internal `record/merge({ persist:false })` bypasses it, preventing self-deadlock. All six transaction callbacks were audited to use only those helpers.
- Each round proves A rejects, B fulfills, flushes equal two, A leaves zero Grocery claims, B state survives, and serialized JSON equals memory. Wish additionally proves later ordinary and transaction writes remain durable. Targeted API/household/identity/collaboration checks passed.
- Fresh Vite `4200` evidence root `/Users/honglijie/.humi-release-evidence/phase3-cross-writer-20260720` is `0700`. Product manifest is `0600`, `ok:true`, 125 checks/20 refs, SHA-256 `43fddc2626437000edafba25a07f2b4eb33bcb7dbdd6193c17d00021e2b74686`; collaboration manifest is `0600`, `ok:true`, 20 checks/6 refs, SHA-256 `0104d1d63d14f5124286b4d6b5a7f83aa173bd49276f6a4139c537689a62721f`; all 26 refs exist. Full matrix, two fresh legacy smokes, build (only existing 865.64 kB warning), range diff, and exact secret scan passed; port 4200 is stopped.
- Status remains `await final independent re-review`; all three NO-GO rounds remain preserved. No Phase 4, AI-HQ handoff, parent checkbox, production, provider, migration, or Supabase action occurred.

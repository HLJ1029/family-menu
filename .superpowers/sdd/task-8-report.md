# Task 8 Report — Final Wish Workflow and Preference Summary

## Status

Task 8 is implemented from baseline `46bd5fe` in the isolated branch `codex/humi-wechat-identity-startup`. The final local Phase 2 matrix is green and the candidate is ready for a fresh independent review. This is not production, WeChat true-device or release approval. No production write, deployment, real-data migration, WeChat upload/review/publish, real WeChat login or Supabase provider operation was performed.

## TDD RED evidence

Tests were changed before product code.

- `npm run release:product:review` returned `ok: false`. `FamilyLivingRoom.jsx` lacked `onRefreshWishShare`, `onPlanWish` and `今晚做`; `UserCenter.jsx` lacked `wishPool`, both callbacks, formal-member count, `familySize` and `tastePreferences` wiring.
- `node scripts/smoke-collaboration-flow.mjs` exited 1 at `verifyWishPoolPlanningFlow` while waiting for the missing accessible button `刷新最近想吃回复` (line 626). Before that failure the local API had created a real owner Wish request and two real guest replies; no Wish-pool localStorage seed remained.
- Product smoke exited 1 on the same unreachable refresh action. Its durable RED manifest is `/Users/honglijie/.humi-release-evidence/task8-red-product-smoke-20260720T0046Z/manifest.json`.

## Implementation

- `UserCenter` now receives and forwards `wishPool`, `onRefreshWishShare` and `onPlanWish` instead of dropping the callbacks already supplied by `main.jsx`.
- The focused family living room marks the active Wish collaboration, exposes `刷新最近想吃回复` to the owner and renders up to four collected Wish items with accessible `今晚做 <菜名>` actions.
- Refresh still calls the existing `refreshWishShareRequest`; planning still calls the existing `planWishPoolItem`. No reply is fabricated in product code, and no household membership path was added.
- A matched Wish enters tonight's real menu and is removed from the real Wish pool. An unmatched Wish remains in the pool while the existing Discovery/library selection path opens.
- The preference sentence prioritizes the current formal-member count, falls back to `familyProfile.familySize`, includes `tastePreferences`, and combines `dislikes` plus `allergies`. Missing dimensions render truthful `人数待补充`, `待补充` or `暂无` labels.
- The exact product fixture is two formal members with `家常`/`清淡`, `香菜`/`花生`; it asserts `2 位家人 · 主要口味：家常、清淡 · 忌口：香菜、花生`.

## Corrected evidence truth

Task 7's claim that its mega-smoke was an equivalent semantic migration was incorrect. The previous `verifyWishPoolPlanningFlow` manually seeded `humi:wish-pool:v1`, opened the library directly and never called the family-living-room refresh or planning callbacks. API/activity visibility alone did not prove the owner workflow. `.superpowers/sdd/task-7-report.md` and the Phase 2 delivery record now state that regression explicitly.

The repaired legacy flow now:

1. Creates a Wish request through the local authenticated Humi API.
2. Posts guest replies for matched `西红柿炒鸡蛋` and unmatched `外婆的神秘菜` through the public reply API.
3. Hydrates the original empty active request into the authenticated owner's household state.
4. Opens the real family living room and clicks its refresh action.
5. Observes both replies in the actual Wish pool.
6. Clicks `今晚做 西红柿炒鸡蛋`, then asserts `tomato-egg` is in tonight's menu and absent from the Wish pool.
7. Clicks `今晚做 外婆的神秘菜`, then asserts Discovery opens and the unmatched Wish remains.

All existing mega-smoke runner calls remain present.

## Targeted GREEN evidence

- `npm run release:product:review` — exit 0, `ok: true`, 39 checks and zero failures.
- `node scripts/smoke-collaboration-flow.mjs` — exit 0, `Humi collaboration and library meal flow smoke passed.`
- Product smoke — exit 0, 118/118 checks green at `/Users/honglijie/.humi-release-evidence/task8-targeted-green-product-smoke-20260720T0050Z/manifest.json`.

One intermediate targeted product run at `task8-targeted-green-product-smoke-20260720T0049Z` failed an unrelated deterministic Crave expectation because the new taste fixture had been placed in the shared state builder. The fixture was isolated to the family-living-room scenario; the unchanged Crave gate and all new Task 8 checks then passed. No product behavior was weakened to address that diagnostic failure.

## Final Phase 2 matrix

Fresh commands against the final candidate code:

- `npm run validate:household` — exit 0, `Household lifecycle checks passed.`
- `npm run validate:identity` — exit 0, identity store and runtime checks passed.
- `npm run validate:api` — exit 0, `Humi API smoke test passed.`
- `npm run validate:miniprogram-entry` — exit 0. The logged `domain blocked` is the expected simulated resilience branch.
- `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task8-final-h5-entry-20260720T005132+0800 npm run validate:h5-entry` — exit 0, 11 checks; screenshots are in that directory.
- `npm run release:product:review` — exit 0, 39/39 static checks.
- `npm run release:product:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task8-final-product-smoke-20260720T005132+0800` — exit 0; manifest `ok: true`, 118 checks, no failed check and no page error.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task8-final-collaboration-smoke-20260720T005132+0800` — exit 0; manifest `ok: true`, 10 checks and no page error.
- `node scripts/smoke-collaboration-flow.mjs` — exit 0 with the repaired real-API Wish path and all existing runner calls.
- `npm run build` — exit 0, 1747 modules transformed.
- `git diff --check` — exit 0.
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — exit 0.

The first final H5 run exposed a stale test locator, `退出并重新验证微信登录`, which no longer exists after the approved family-living-room redesign. The test now hydrates a real local family, enters `账号设置`, clicks the actual `退出登录` action and verifies the same remote-revocation-failure behavior. Its fresh rerun passed all 11 checks.

## Warnings and deferrals

- Vite retains its existing single-chunk warning: `dist/assets/index-pZ2LSj3w.js` is 859.44 kB (195.30 kB gzip), over 500 kB.
- WeChat true-device identity, native share, upload, review and publish remain deferred.
- Production backup/migration/apply/rollback, production writes and physical Supabase retirement remain deferred.
- Phase 3 remains gated on a fresh independent Phase 2 GO.

The parent-owned `docs/superpowers/plans/2026-07-19-humi-family-living-room.md` remains intentionally unstaged.

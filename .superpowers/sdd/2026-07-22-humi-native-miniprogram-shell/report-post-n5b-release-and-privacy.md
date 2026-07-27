# Post-N5b release and privacy report

Date: 2026-07-27
Scope: release/privacy closeout after N5b; no upload, review, publish, rollout-flag, allowlist, archive, or AI-HQ mutation.

## Outcome

The repository now models four separate release facts without conflating them:

1. Production compatibility baseline: `1.1.73` / `修复身份完善入口`.
2. Last uploaded experience runtime: `1.1.74` / `4eb3fbeb6aba886930b3fda652be96e9246eac9e`.
3. Current local review candidate: `1.1.75` / `Humi 原生骨架完整候选（待上传）`.
4. N5a API/H5 compatibility deployment remains live while review, release, native/meal flags, and both allowlists remain off.

The external AI-HQ handoff and its immutable `1.1.74` archive were verified against `4eb3fbeb`. The current `1.1.75` runtime is intentionally different and is reported as unuploaded. The rollout gate fails closed until a fresh immutable archive and explicit `1.1.75` upload authorization exist. It no longer asks the current runtime to equal the historical uploaded commit.

## Release lifecycle changes

- `miniprogram/utils/config.js` and current release tooling use `1.1.75`, including the H5 cache marker.
- Shared candidate metadata exposes the compatibility baseline, last upload, and current local candidate as separate roles.
- Release status reports `N5b_refresh_packaging_authorization`, `currentCandidateUploaded=false`, last upload `1.1.74@4eb3fbeb`, and current true-device evidence `0/56`.
- `release:next` stops at `1.1.75 候选封包与上传授权`; it does not enter N5c, review, or release.
- Current submit/review packets use `1.1.75` but state clearly that it is not uploaded and cannot be submitted yet.
- The historical N5b upload evidence row remains immutable and continues to identify `1.1.74@4eb3fbeb`.
- Lifecycle selftests use their temporary evidence fixture directly instead of recursively running the complete release-status matrix. Normal operator runs still use real release status.

## Privacy contract

Added `docs/wechat-privacy-declaration.json` as the normalized repository declaration and a runtime/declaration checker with a negative selftest. The contract detects and verifies:

- WeChat identity.
- Nickname/avatar only after explicit user action, including optional compressed upload to Humi API.
- Optional phone-number binding.
- Photo-album write only; no album read.
- One-time subscription reminders with refusal/cancellation not creating a reminder or causing repeated requests.
- Product data needed for household, menu, list, MealRun, task, and reminder features.

The checker forbids undeclared location, contacts, camera, microphone, payment, ad, Supabase, and album-read capabilities. The repository declaration intentionally remains `platformDeclarationStatus=pending`; it does not claim that the WeChat console declaration or screenshot exists.

## RED/GREEN evidence

RED observations that drove the implementation:

- Candidate-role selftest had no independent `1.1.75` local-candidate role.
- Rollout logic compared current `miniprogram/**` to `4eb3fbeb`, incorrectly treating valid post-upload runtime work as corruption.
- Current handoff state said `miniprogram_uploaded=true` for the evolved runtime.
- Release-next initially selected N5c for `1.1.74`.
- Submit evidence recording searched for the historical `1.1.74` row after current tooling moved to `1.1.75`.
- Privacy declaration had no machine-checked runtime capability contract.

GREEN commands:

```text
node scripts/selftest-release-candidate-roles.mjs
node scripts/selftest-native-rollout-readiness.mjs
npm run release:next:selftest
npm run release:docs:check
npm run release:wechat:privacy:check
npm run release:wechat:privacy:selftest
npm run release:candidate:privacy:check
npm run release:candidate:privacy:selftest
npm run validate:identity
npm run validate:miniprogram-poster
npm run validate:miniprogram-meal-reminder
npm run validate:supabase-retirement
npm run release:security:audit
git diff --check
```

Expected fail-closed checks:

```text
npm run release:native-shell:check:local
HUMI_NATIVE_HANDOFF_PATH=/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/native-shell/HANDOFF.md npm run release:native-shell:check
```

Both checks pass all local/runtime/privacy/package/rollback assertions. The external form additionally verifies the historical `1.1.74` immutable archive. Both then fail only because current `1.1.75` has no immutable archive or upload evidence, which is the required stop condition.

## Remaining external work

1. Review and bind the final `1.1.75` candidate commit.
2. Generate a new immutable `1.1.75` archive and record its SHA-256 without overwriting the `1.1.74` archive.
3. Obtain explicit action-level authorization before uploading `1.1.75`.
4. After the upload is recorded, start N5c: 56 real-device rows, cached/warm/cold startup evidence, web-view business-domain screenshot, and final WeChat privacy declaration screenshot.
5. Keep review, release, native/meal flags, and both allowlists off until their separate checkpoints.

No external upload, review, release, archive creation, rollout mutation, or AI-HQ write was performed in this task.

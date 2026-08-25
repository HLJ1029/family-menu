# N5b-1.1.75 Evidence and Documentation Fix Report

Date: 2026-07-28

## Scope

- Corrected the current N5b-1.1.75 upload state in the API deployment runbook and release operator handoff.
- Preserved 1.1.71 and 1.1.74 entries as explicitly historical facts.
- Extended canonical candidate evidence with immutable archive size (`140710`) and raw CLI evidence SHA-256 (`ec77d67f2c24f6f795e27d6439b32ace11c6b79dc4028cfb0c2dc795a52d2938`).
- Extended the exact schema, archive stat check, attestation raw-evidence binding, freshness guard, and dependent selftest fixtures.

## TDD evidence

RED:

- `node scripts/selftest-structured-release-evidence.mjs` failed before the validator change with `native candidate must use the exact key set` after the required archive size and upload evidence fields were introduced to the fixture.
- `node scripts/selftest-native-rollout-readiness.mjs` failed before the validator change for the same missing schema support.
- `node scripts/selftest-release-doc-freshness.mjs` failed before the freshness guard change because the pre-N5a current-HEAD/all-false wording was not rejected.

GREEN:

- `HUMI_WECHAT_UPLOAD_ATTESTATION_PATH=/Users/honglijie/.humi-release-evidence/HUMI-2026-001/n5b-1.1.75-20260728T111436Z/wechat-upload-machine-attestation.json npm run release:native-shell:check:local`
- `npm run release:native-shell:check:selftest`
- `node scripts/selftest-release-doc-freshness.mjs`
- `npm run release:docs:check`
- `npm audit --omit=dev --audit-level=high`
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh`
- `git diff --check`

The signed local verification confirmed the recorded archive is exactly `140710` bytes and that its signed raw CLI evidence hash matches the canonical evidence file.

## External actions

None. No upload, preview, review submission, release, deployment, flag/allowlist action, push, or AI-HQ modification was performed.

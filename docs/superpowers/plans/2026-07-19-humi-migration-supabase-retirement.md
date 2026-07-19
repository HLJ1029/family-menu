# Humi Migration, Supabase Retirement, and Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可审计、幂等、可回滚的迁移工具保护现有 Humi 用户/家庭数据，物理清退仓库内 Supabase 遗留，并建立微信真机与生产迁移的最终发布门禁。

**Architecture:** 本地迁移器只接受显式输入文件并默认 dry-run，生成脱敏统计、变更计划、校验哈希和可选输出副本；永不直接连接生产。仓库清退删除孤立 Supabase 代码、依赖和失效配置，同时以构建扫描证明正式包无 provider。真实生产执行拆为备份、dry-run、人工核对、显式 apply、回滚演练和真机证据，任何外部写入都需要单独授权。

**Tech Stack:** Node.js ESM、JSON、SHA-256、npm/Vite、微信开发者工具/真机证据、AI-HQ secret scan。

## Global Constraints

- 迁移默认 `--dry-run`; 没有 `--apply --input <copy> --output <new-file>` 不写任何文件。
- 工具不得把 OpenID、手机号、token、昵称或明细记录打印到 stdout/report。
- 迁移保留用户、identity、household、householdState 数量；只增加明确迁移元数据或标记旧资料不完整。
- 旧昵称“微信用户”或缺失有效资料的账号标记 `profileStatus: "incomplete"`，不得删除。
- 不自动把 Supabase 数据覆盖进 Humi API；跨 provider 合并必须单独设计和授权。
- 删除仓库代码不等于删除外部 Supabase provider 数据/Secrets；外部删除只能在备份核对和用户明确授权后进行。
- 生产 apply、部署、微信上传/提审和 provider 删除不属于默认本地执行权限。

---

## File Map

- `scripts/migrate-humi-identity-households.mjs`: dry-run/apply-to-copy migration engine。
- `scripts/check-humi-migration.mjs`: fixture、幂等、隐私、回滚 tests。
- `scripts/audit-humi-migration-readiness.mjs`: 输入统计、不变量与脱敏报告。
- `docs/humi-identity-migration-runbook.md`: 生产备份/apply/回滚步骤。
- `docs/humi-wechat-true-device-acceptance.md`: 角色/场景/证据表。
- `src/lib/supabase/*`, `src/components/system/CloudAccount.jsx`: 删除的孤立 legacy runtime。
- `package.json`, `package-lock.json`, `.env.example`, docs: provider 依赖和配置清退。
- `scripts/check-supabase-retirement.mjs`: 源码、构建和依赖门禁。

### Task 1: Idempotent Identity and Household Migration Engine

**Files:**
- Create: `scripts/migrate-humi-identity-households.mjs`
- Create: `scripts/check-humi-migration.mjs`
- Modify: `package.json`

**Interfaces:**
- CLI:

```text
node scripts/migrate-humi-identity-households.mjs --input <path> --dry-run --report <path>
node scripts/migrate-humi-identity-households.mjs --input <path> --apply --output <path> --report <path>
```

- [x] **Step 1: Write failing migration fixture tests**

Fixture includes complete user, legacy `微信用户`, missing `profileStatus`, household member missing avatar, and orphan household-state reference. Assert dry-run writes no output, report contains only counts/codes, apply writes a separate file, a second apply produces byte-equivalent normalized JSON, and orphan/reference problems stop apply with non-zero exit.

- [x] **Step 2: Verify RED**

Run: `npm run validate:migration`

Expected: migration script missing.

- [x] **Step 3: Implement parse and privacy-safe audit**

Accepted top-level shape is the existing Humi store object. Fatal invariants:

```text
duplicate_user_id
duplicate_identity_provider_subject
household_owner_missing
household_member_user_missing
household_state_without_household
active_household_not_member
```

Report includes counts, change counts, fatal code counts and SHA-256 of input/output; it contains no record values.

- [x] **Step 4: Implement deterministic transformations**

- Normalize missing top-level arrays/maps.
- Mark legacy/default-name users incomplete; preserve complete explicit names.
- Ensure user avatarKey is stable by existing `defaultAvatarKey(user.id)` equivalent.
- Project user name/avatar into formal household members without changing membership.
- Preserve every state and collaboration event.
- Add `migrationMeta.identityHouseholdV1 = { appliedAt, sourceSha256, toolVersion: 1 }`; idempotent rerun preserves the first `appliedAt`.

- [x] **Step 5: Verify and commit**

```bash
npm run validate:migration
git add scripts/migrate-humi-identity-households.mjs scripts/check-humi-migration.mjs package.json
git commit -m "feat: add safe Humi identity migration tooling"
```

### Task 2: Read-Only Current Data Audit and Runbook

**Files:**
- Create: `scripts/audit-humi-migration-readiness.mjs`
- Create: `docs/humi-identity-migration-runbook.md`
- Modify: `docs/privacy-data-inventory.md`

- [x] **Step 1: Add a self-contained audit test**

Run the audit on a fixture and assert stdout/report contain counts and hashes but none of fixture OpenID, phone, display name or token values.

- [x] **Step 2: Implement audit CLI**

The CLI is read-only and refuses `--output`/`--apply`. It reuses migration invariant checks and exits 2 on fatal data issues, 0 on ready, 1 on invalid arguments/I/O.

- [x] **Step 3: Write exact production procedure**

Runbook sequence:

1. Stop writes or enter maintenance window.
2. Copy API code, `data.json`, `avatars/` to one timestamped backup.
3. Record SHA-256 and counts.
4. Run audit and dry-run on backup copy.
5. Human compare 18 users/18 identities/7 households/6 states baseline plus legitimate deltas.
6. Run apply to a new file, never in place.
7. Validate new file and start staging API against it.
8. Run identity/household/collaboration smoke.
9. Swap file atomically only with explicit production approval.
10. Roll back code, data and avatars together on P0.

- [x] **Step 4: Verify and commit**

```bash
npm run validate:migration
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
git add scripts/audit-humi-migration-readiness.mjs docs/humi-identity-migration-runbook.md docs/privacy-data-inventory.md
git commit -m "docs: add Humi migration audit and rollback runbook"
```

### Task 3: Physically Remove Supabase from the Repository Runtime

**Files:**
- Delete: `src/lib/supabase/client.js`
- Delete: `src/lib/supabase/family.js`
- Delete: `src/lib/supabase/grocerySync.js`
- Delete: `src/lib/supabase/familyPreferences.js`
- Delete: `src/lib/supabase/appEvents.js`
- Delete: `src/lib/supabase/menuSync.js`
- Delete: `src/components/system/CloudAccount.jsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `scripts/check-supabase-retirement.mjs`
- Modify: relevant active docs that still describe Supabase as current.

- [x] **Step 1: Add failing retirement gate**

Gate fails if:

```js
dependencies["@supabase/supabase-js"]
rg("src", /supabase/i)
rg(".github|.env.example", /VITE_SUPABASE|SUPABASE_URL|SUPABASE_ANON_KEY/)
rg("dist", /supabase\.co|@supabase|VITE_SUPABASE/i)
```

Comments that only state a historical migration source are allowed under `docs/archive/`, not active source.

- [x] **Step 2: Verify RED**

Run: `node scripts/check-supabase-retirement.mjs`

Expected: FAIL on dependency and `src/lib/supabase`.

- [x] **Step 3: Delete orphan source with patches and remove dependency**

Use `npm uninstall @supabase/supabase-js` to update manifests after confirming `rg` has no live imports. Delete only the listed orphan files; preserve user-owned unrelated code.

- [x] **Step 4: Archive or correct active docs**

Move schema/roadmap documents that are purely historical under `docs/archive/supabase/` or add an explicit archived header. Active API/runbooks must state Humi API is the only runtime and external Supabase data remains read-only pending authorized deletion.

- [x] **Step 5: Verify and commit**

```bash
node scripts/check-supabase-retirement.mjs
npm run build
if rg -n "supabase\.co|@supabase|VITE_SUPABASE" dist; then exit 1; fi
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
git add -A src package.json package-lock.json .env.example scripts/check-supabase-retirement.mjs docs
git commit -m "refactor: physically remove Supabase from Humi runtime"
```

### Task 4: WeChat True-Device Acceptance Packet

**Files:**
- Create: `docs/humi-wechat-true-device-acceptance.md`
- Create: `scripts/check-humi-true-device-evidence.mjs`
- Modify: `package.json`

- [x] **Step 1: Define evidence schema and failing checker test**

Evidence directory must contain `manifest.json` plus screenshots/video references. Required scenarios:

```text
fresh_guest_start
explicit_wechat_login
new_identity_profile
legacy_identity_recovery
session_revocation_relogin
create_household
join_household
family_living_room_owner
family_living_room_member
guest_crave
signed_in_crave
guest_grocery
guest_wish
guest_to_user_merge
collaboration_history
logout_to_guest
```

Manifest entry includes device model, WeChat version, mini-program build, tester role, timestamp, result, artifact path and sanitized notes.

- [x] **Step 2: Implement evidence checker**

Checker validates schema, file existence, timestamp after candidate commit and `result: "pass"`; it prints only scenario/status/path, never account identifiers.

- [x] **Step 3: Write operator instructions**

Instructions explain how to use a fresh WeChat test account/device, capture production user count before/after guest start, verify no account/family creation, and capture network/console evidence that `wx.login` follows the click. They explicitly prohibit using real family PII in screenshots.

- [x] **Step 4: Verify and commit**

```bash
npm run validate:true-device-evidence -- --selftest
git add docs/humi-wechat-true-device-acceptance.md scripts/check-humi-true-device-evidence.mjs package.json
git commit -m "docs: add Humi true-device acceptance gate"
```

### Task 5: Final Completion Audit and External Authorization Gate

**Files:**
- Create: `docs/humi-identity-family-collaboration-final-audit.md`
- Modify: `docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md`

- [ ] **Step 1: Run all local gates from a clean tree**

```bash
npm run validate:household
npm run validate:collaboration-identity
npm run validate:migration
npm run validate:identity
npm run validate:api
npm run validate:miniprogram-entry
npm run validate:h5-entry
npm run release:product:smoke -- --base-url http://127.0.0.1:4173/
npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/
node scripts/check-supabase-retirement.mjs
npm run build
git diff --check
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

- [ ] **Step 2: Audit every design acceptance criterion**

For sections 12.1–12.5 of the design, record evidence as `proved`, `contradicted`, `missing`, or `external gate`. A green narrow test cannot prove a broader criterion without corresponding runtime evidence.

- [ ] **Step 3: Stop before unauthorized external changes**

If true-device evidence, production backup/apply, deployment, WeChat upload or external Supabase deletion are not explicitly authorized and evidenced, mark them `external gate`; do not claim the whole production rollout complete and do not perform them.

- [ ] **Step 4: Request the exact remaining authorization**

The checkpoint must separately ask for:

1. WeChat true-device test execution.
2. Production maintenance window and data backup/apply.
3. H5/API deployment and mini-program upload.
4. External Supabase provider data/Secrets deletion after backup verification.

- [ ] **Step 5: Commit the audit**

```bash
git add docs/humi-identity-family-collaboration-final-audit.md docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md
git commit -m "docs: audit Humi identity family collaboration completion"
```

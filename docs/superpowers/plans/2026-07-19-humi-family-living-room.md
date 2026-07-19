# Humi Family Living Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“我的家”重构为用户主动创建/加入后进入的家庭客厅，并提供成员管理、家庭设置、协作记录和账号设置四个可导航页面。

**Architecture:** Humi API 继续作为唯一家庭事实来源；`HumiStore` 新增带角色校验的家庭更新、成员移除、所有权转移和退出操作，HTTP 与 H5 client 只做契约映射。前端把巨型 `UserCenter.jsx` 收敛为家庭页面路由，由小而专一的组件负责无家庭入口、家庭客厅与四个子页面；现有菜单、征集、买菜和偏好数据通过 props 接入，不新增第二套状态。

**Tech Stack:** Node.js HTTP API、JSON `HumiStore`、React 19、Vite 7、Tailwind 3、Playwright smoke、Node `assert`。

## Global Constraints

- 登录不创建家庭；`GET /me`、`GET /state`、`GET /households` 保持无副作用。
- 家庭只能由 `POST /households` 或接受邀请创建成员关系。
- 主厨可邀请、移除成员、改名和转移所有权；普通成员只能查看、退出和维护自己的账号。
- 家庭客厅首页只展示当前家庭、三个家庭操作、正在一起做和家庭偏好摘要。
- AI 模型、额度、验证事件、云同步术语、营养目标和长画像不得出现在家庭客厅首页。
- 家庭设置、成员管理、协作记录和账号设置必须是独立可返回的页面。
- 不执行生产部署、生产写入或外部 provider 修改。

---

## File Map

- `api/store.js`: 家庭生命周期不变量与持久化操作。
- `api/server.js`: 家庭更新、成员、所有权和退出 HTTP handlers。
- `src/lib/humiApi.js`: H5 家庭管理 client functions。
- `src/components/UserCenter.jsx`: 只保留页面选择与既有协作 props 适配。
- `src/components/HouseholdStart.jsx`: 登录无家庭时的创建/邀请入口。
- `src/components/FamilyLivingRoom.jsx`: 四区块家庭客厅首页。
- `src/components/HouseholdMembersPage.jsx`: 成员、角色、邀请、移除和所有权转移。
- `src/components/HouseholdSettingsPage.jsx`: 家庭名称、偏好摘要、切换与退出。
- `src/components/FamilyActivityPage.jsx`: Phase 2 使用现有数据的独立记录页；Phase 3 接入服务端历史。
- `src/components/HumiAccountPage.jsx`: 昵称、头像、手机号、退出与协议。
- `scripts/check-household-lifecycle.mjs`: Store/API 生命周期和权限回归。
- `scripts/smoke-product-entrypoints.mjs`: 移动端家庭客厅与四个子页面验收。

### Task 1: Household Lifecycle Store Invariants

**Files:**
- Create: `scripts/check-household-lifecycle.mjs`
- Modify: `api/store.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `HumiStore.createHouseholdForUser(userId, options)`、`addHouseholdMember(householdId, userId, options)`。
- Produces:
  - `updateHousehold(userId, householdId, { name }) -> Household`
  - `removeHouseholdMember(ownerUserId, householdId, memberId) -> Household`
  - `transferHouseholdOwnership(ownerUserId, householdId, nextOwnerId) -> Household`
  - `leaveHousehold(userId, householdId) -> { household: Household|null, activeHousehold: Household|null }`

- [x] **Step 1: Write the failing lifecycle test**

Create a temporary store with three complete users, then assert:

```js
const household = await store.createHouseholdForUser(owner.id, { householdName: "我们家" });
await store.addHouseholdMember(household.id, member.id);
await store.addHouseholdMember(household.id, secondMember.id);

await assert.rejects(
  store.updateHousehold(member.id, household.id, { name: "越权改名" }),
  (error) => error.code === "forbidden",
);
assert.equal((await store.updateHousehold(owner.id, household.id, { name: "小禾家" })).name, "小禾家");

await assert.rejects(
  store.removeHouseholdMember(owner.id, household.id, owner.id),
  (error) => error.code === "owner_cannot_be_removed",
);
assert.equal((await store.removeHouseholdMember(owner.id, household.id, secondMember.id)).members.length, 2);

const transferred = await store.transferHouseholdOwnership(owner.id, household.id, member.id);
assert.equal(transferred.ownerId, member.id);
assert.equal(transferred.members.find((item) => item.memberId === member.id).role, "owner");
assert.equal(transferred.members.find((item) => item.memberId === owner.id).role, "member");

await assert.rejects(
  store.leaveHousehold(member.id, household.id),
  (error) => error.code === "owner_must_transfer_or_disband",
);
const left = await store.leaveHousehold(owner.id, household.id);
assert.equal(left.household.members.some((item) => item.memberId === owner.id), false);
```

Add `"validate:household": "node scripts/check-household-lifecycle.mjs"` to `package.json`.

- [x] **Step 2: Run the test and verify RED**

Run: `npm run validate:household`

Expected: FAIL because `updateHousehold` is not defined.

- [x] **Step 3: Implement store operations with exact permission rules**

Add methods to `HumiStore`. Every method calls `await this.load()`, resolves only a formal-member household, uses `codedError`, updates `updatedAt`, repairs `activeHouseholds`, and calls `await this.save()` once. Name validation is:

```js
const name = sanitizeText(patch.name, "", 32);
if (!name) throw codedError("household_name_required", "请填写家庭名称。");
```

Ownership transfer must set exactly one `role: "owner"`; leaving deletes only the caller's membership and never deletes household state. If the current owner is the last member, `leaveHousehold` may remove the empty household and its `householdStates` record; if other members remain it must return `owner_must_transfer_or_disband`.

- [x] **Step 4: Run the lifecycle and identity store tests**

Run: `npm run validate:household && npm run validate:identity`

Expected: both exit 0.

- [x] **Step 5: Commit**

```bash
git add api/store.js scripts/check-household-lifecycle.mjs package.json
git commit -m "feat: add Humi household lifecycle rules"
```

### Task 2: Household Lifecycle HTTP Contract

**Files:**
- Modify: `api/server.js`
- Modify: `src/lib/humiApi.js`
- Modify: `scripts/smoke-humi-api.mjs`
- Modify: `docs/humi-api-contract.md`

**Interfaces:**
- Consumes: Task 1 store methods.
- Produces:
  - `PATCH /households/:householdId` body `{ name }`
  - `DELETE /households/:householdId/members/:memberId`
  - `POST /households/:householdId/owner` body `{ memberId }`
  - `POST /households/:householdId/leave`
  - H5 functions `updateHumiHousehold`, `removeHumiHouseholdMember`, `transferHumiHouseholdOwnership`, `leaveHumiHousehold`.

- [x] **Step 1: Add failing API smoke scenarios**

After owner/member login and explicit household creation, assert owner rename succeeds, member rename is 403, owner removal is 409, member removal succeeds, transfer succeeds, and the former owner can leave. Every successful response must contain `{ family, households }`; leaving also contains the new active `state`.

- [x] **Step 2: Verify RED**

Run: `npm run validate:api`

Expected: first new route returns 404.

- [x] **Step 3: Add route matchers and handlers**

Route order must place exact member/owner/leave matchers before the general household matcher. Map codes exactly:

```js
const householdStatus = {
  household_not_found: 404,
  forbidden: 403,
  household_name_required: 400,
  member_not_found: 404,
  owner_cannot_be_removed: 409,
  owner_must_transfer_or_disband: 409,
};
```

Handlers always derive the acting user from `requireAuth`; request bodies cannot supply acting user IDs.

- [x] **Step 4: Add H5 client functions**

```js
export function updateHumiHousehold(session, householdId, patch) {
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}`, {
    method: "PATCH", session, body: patch,
  });
}

export function removeHumiHouseholdMember(session, householdId, memberId) {
  return humiApiRequest(`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE", session,
  });
}
```

Add corresponding ownership and leave functions with the exact routes above.

- [x] **Step 5: Verify and document**

Run: `npm run validate:api && npm run validate:identity`

Expected: exit 0; docs list permissions, 4xx codes and non-destructive state behavior.

- [x] **Step 6: Commit**

```bash
git add api/server.js src/lib/humiApi.js scripts/smoke-humi-api.mjs docs/humi-api-contract.md
git commit -m "feat: expose Humi household management API"
```

### Task 3: No-Household Start Page and Family Living Room

**Files:**
- Create: `src/components/HouseholdStart.jsx`
- Create: `src/components/FamilyLivingRoom.jsx`
- Modify: `src/components/UserCenter.jsx`
- Modify: `scripts/smoke-product-entrypoints.mjs`

**Interfaces:**
- Consumes: existing `family`, `households`, `householdMembers`, active collaboration requests, `familyProfile`, create/invite callbacks.
- Produces: `UserCenter` internal page IDs `home`, `members`, `settings`, `activity`, `account`; `onNavigate(pageId)` never changes the primary five-tab navigation.

- [x] **Step 1: Add failing mobile smoke assertions**

For a signed-in session with `family: null`, assert the first family screen contains `创建我的家`, `通过邀请加入`, and the value copy `共享菜单、一起决定想吃什么、协作买菜`, and contains none of `云同步`, `AI`, `试用额度`.

For a signed-in household, assert `data-testid="family-living-room"` includes:

```text
当前家庭
邀请家人
成员管理
家庭设置
正在一起做
家庭偏好
协作记录
账号设置
```

and does not include validation export, nutrition sliders or cloud status.

- [x] **Step 2: Verify RED**

Run local Vite and: `npm run release:product:smoke -- --base-url http://127.0.0.1:4173/`

Expected: FAIL because `family-living-room` does not exist.

- [x] **Step 3: Implement `HouseholdStart`**

The component receives `{ familyName, onFamilyNameChange, onCreate, pending, status, onOpenInvite }`. It renders one editable name input only after `创建我的家` is selected; `通过邀请加入` explains that an invitation card/link is required and invokes `onOpenInvite` without inventing a token.

- [x] **Step 4: Implement the four-section `FamilyLivingRoom`**

The component receives the current family, formal members, active collaboration summaries and preference summary. Its action buttons call page navigation; `邀请家人` invokes the existing invite callback directly. “正在一起做” uses at most three cards with task, progress and next action. Empty state says `还没有进行中的协作，今晚可以先问问大家。`

- [x] **Step 5: Reduce `UserCenter` to page orchestration**

Remove from the home path: `CloudSyncPanel`, `PortraitReceiptPreview`, nutrition goals, validation export, experience tier, long pulse/portrait sections and duplicate account sidebar. Keep those data utilities outside the family home or delete them if unused. When signed in and `family === null`, render only `HouseholdStart`; when guest, render the existing login/guest explanation without a fake family.

- [x] **Step 6: Verify smoke and build**

Run:

```bash
npm run release:product:smoke -- --base-url http://127.0.0.1:4173/
npm run build
```

Expected: both exit 0.

- [x] **Step 7: Commit**

```bash
git add src/components/HouseholdStart.jsx src/components/FamilyLivingRoom.jsx src/components/UserCenter.jsx scripts/smoke-product-entrypoints.mjs
git commit -m "feat: redesign My Home as a family living room"
```

### Task 4: Members, Settings, Activity and Account Pages

**Files:**
- Create: `src/components/HouseholdMembersPage.jsx`
- Create: `src/components/HouseholdSettingsPage.jsx`
- Create: `src/components/FamilyActivityPage.jsx`
- Create: `src/components/HumiAccountPage.jsx`
- Modify: `src/components/UserCenter.jsx`
- Modify: `src/main.jsx`
- Modify: `scripts/smoke-product-entrypoints.mjs`

**Interfaces:**
- Consumes: Task 2 H5 functions via callbacks owned by `main.jsx`.
- Produces callbacks `onRenameHousehold`, `onRemoveMember`, `onTransferOwnership`, `onLeaveHousehold`; each applies returned envelope through the existing state hydrator.

- [x] **Step 1: Add failing page-navigation smoke checks**

Click each living-room action and assert a distinct `data-testid`:

```text
household-members-page
household-settings-page
family-activity-page
humi-account-page
```

Every page must have `返回家庭客厅`. Member sessions must not see remove/transfer/rename controls. Mobile account page must expose phone state, logout, privacy and terms.

- [x] **Step 2: Verify RED**

Run product smoke against local Vite; expected failure at the first missing page.

- [x] **Step 3: Implement management callbacks in `main.jsx`**

Each callback requires a complete Humi session, calls the Task 2 client, applies `{ state, family, households }`, reports natural-language success/failure, and never performs an optimistic family mutation before the API succeeds.

- [x] **Step 4: Implement focused pages**

- Members: avatar, nickname, role, joined status; owner-only invite/remove/transfer controls.
- Settings: rename, household switch, preference summary, leave; owner with other members sees `先转让主厨后再退出`.
- Activity: Phase 2 renders existing crave/grocery/wish/meal activity, sorted by timestamp, with no token/internal state.
- Account: avatar/name, phone, logout, privacy and terms; no family controls.

- [x] **Step 5: Remove duplicated old panels and verify responsive behavior**

Run:

```bash
npm run release:product:smoke -- --base-url http://127.0.0.1:4173/
npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/
npm run build
```

Expected: all exit 0; the five primary tabs remain visible on child pages because these are internal family pages, not new primary views.

- [x] **Step 6: Commit**

```bash
git add src/components/HouseholdMembersPage.jsx src/components/HouseholdSettingsPage.jsx src/components/FamilyActivityPage.jsx src/components/HumiAccountPage.jsx src/components/UserCenter.jsx src/main.jsx scripts/smoke-product-entrypoints.mjs
git commit -m "feat: add Humi family management pages"
```

### Task 5: Phase 2 Verification and Delivery Record

**Files:**
- Modify: `docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md`
- Create: `docs/humi-family-living-room-phase-2-delivery.md`

**Interfaces:**
- Consumes: all Phase 2 tasks.
- Produces: auditable Phase 2 evidence and Phase 3 entry gate.

- [x] **Step 1: Run the complete Phase 2 matrix**

```bash
npm run validate:household
npm run validate:identity
npm run validate:api
npm run validate:miniprogram-entry
npm run validate:h5-entry
npm run release:product:smoke -- --base-url http://127.0.0.1:4173/
npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/
npm run build
git diff --check
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

Expected: all exit 0; only the existing Vite chunk-size warning may remain.

- [x] **Step 2: Independently review permissions and navigation**

Review must explicitly check owner/member API authorization, last-owner exit invariant, no optimistic success, four child pages, and absence of technical content on the living-room home.

- [x] **Step 3: Record delivery**

The delivery document records commits, exact evidence paths, deferred true-device checks and confirms no production write/deploy.

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md docs/humi-family-living-room-phase-2-delivery.md
git commit -m "docs: record Humi family living room delivery"
```

### Task 6: Final-Review Household Isolation Corrections

**Files:**
- Modify: `api/store.js`
- Modify: `api/server.js`
- Modify: `src/main.jsx`
- Modify: `scripts/check-household-lifecycle.mjs`
- Modify: `scripts/smoke-humi-api.mjs`
- Modify: `docs/humi-api-contract.md`

**Interfaces:**
- Generic Crave, grocery and Wish participation claims bind the action to the authenticated identity but never create formal household membership or return household state.
- Only explicit household creation and authenticated household-invite acceptance create formal membership.
- Removing, voluntarily leaving or deleting the last-owner household retires that user's legacy `states[userId]` bootstrap snapshot.

- [x] **Step 1: Add failing membership and stale-state isolation regressions**

Cover read-only `GET /state` and `GET /households` before creation, all three collaboration claim endpoints without membership growth, explicit invite acceptance as the membership transition, and removed/left/solo-owner users creating a fresh household without former menu/log/profile state.

- [x] **Step 2: Verify RED**

Run `npm run validate:household && npm run validate:api`; expected failure on collaboration-created membership and legacy-state resurrection.

- [x] **Step 3: Separate participation identity from membership**

Remove `addHouseholdMember` from generic collaboration claims. Return only the claimed public request. In H5, merge the authenticated name into that participation, retain the user's own current family state, clear pending merge context and use participation language rather than “加入家庭”. Remove the local fake-formal-member fallback.

- [x] **Step 4: Retire legacy bootstrap snapshots on relationship exit**

Delete the departing/removed user's legacy per-user snapshot on owner removal, voluntary leave and last-owner household deletion. Keep explicit invite acceptance behavior unchanged.

- [x] **Step 5: Verify and document**

Run `validate:household`, `validate:api`, `validate:identity`, both local browser smokes, build, diff check and secret scan. Update the API contract with the exact distinction between participation claim and household invite acceptance.

- [x] **Step 6: Commit**

```bash
git add api/store.js api/server.js src/main.jsx scripts/check-household-lifecycle.mjs scripts/smoke-humi-api.mjs docs/humi-api-contract.md
git commit -m "fix: isolate Humi collaboration from household membership"
```

### Task 7: Final-Review Product and Evidence Corrections

**Files:**
- Modify: `src/components/FamilyLivingRoom.jsx`
- Modify: `src/components/UserCenter.jsx`
- Modify: `src/components/HouseholdStart.jsx`
- Modify: `src/main.jsx`
- Modify: `api/store.js`
- Modify: `api/server.js`
- Modify: `scripts/smoke-product-entrypoints.mjs`
- Modify: `scripts/smoke-humi-api.mjs`
- Modify: `scripts/smoke-collaboration-landings.mjs`
- Modify: `scripts/check-product-review-readiness.mjs`
- Modify: `docs/humi-family-living-room-phase-2-delivery.md`
- Modify: `docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md`

**Interfaces:**
- Current-family card exposes current role, member avatars/count and a preference action that opens Family Settings.
- Family creation requires a non-empty name, defaults the draft to `我们家`, preserves invalid input and always resets internal family navigation to the living room when the active family changes.
- Product evidence directly covers logs/collaboration preservation and activity privacy; collaboration evidence is persisted outside `/tmp`.

- [x] **Step 1: Add failing product/spec regressions**

Cover current role, member avatars, clickable preference summary, blank-name 400, default `我们家`, family-route reset after leave/create, logs and collaboration preservation, activity token/internal-field absence, and durable collaboration evidence output.

- [x] **Step 2: Verify RED**

Run `validate:api`, local product smoke and product-review gate; expected failure on the missing affordances/rules.

- [x] **Step 3: Implement product corrections**

Complete the living-room card and preference action, enforce name validation in Store/server/client, and reset family-internal navigation on `family.id` changes without a stale Settings paint.

- [x] **Step 4: Expand durable evidence**

Assert meal logs, Crave/Wish/grocery collaboration state survive metadata lifecycle mutations; assert activity text excludes token, owner secret, participant key and internal field names. Run collaboration smoke with a private timestamped evidence directory under `/Users/honglijie/.humi-release-evidence/`.

- [x] **Step 5: Rerun full Phase 2 matrix and update delivery truth**

Record correction commits, exact durable manifests, warnings, true-device deferrals and the prior NO-GO resolution. Mark Task 5 complete only after a fresh independent GO review.

- [x] **Step 6: Commit**

```bash
git add src/components/FamilyLivingRoom.jsx src/components/UserCenter.jsx src/components/HouseholdStart.jsx src/main.jsx api/store.js api/server.js scripts/smoke-product-entrypoints.mjs scripts/smoke-humi-api.mjs scripts/smoke-collaboration-landings.mjs scripts/check-product-review-readiness.mjs docs/humi-family-living-room-phase-2-delivery.md docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md
git commit -m "fix: close Humi Phase 2 review gaps"
```

### Task 8: Final Wish Workflow and Preference-Summary Corrections

**Files:**
- Modify: `src/components/UserCenter.jsx`
- Modify: `src/components/FamilyLivingRoom.jsx`
- Modify: `scripts/smoke-collaboration-flow.mjs`
- Modify: `scripts/smoke-product-entrypoints.mjs`
- Modify: `scripts/check-product-review-readiness.mjs`
- Modify: `docs/humi-family-living-room-phase-2-delivery.md`
- Modify: `.superpowers/sdd/task-7-report.md`

**Interfaces:**
- The owner can refresh an active Wish collaboration from the family living room, see collected Wish items, and choose `今晚做`; a matched recipe enters tonight's menu and leaves the Wish pool, while an unmatched Wish opens the existing recipe-selection path.
- The family preference one-liner always describes household size, main tastes, and restrictions using truthful current-family/profile data.

- [x] **Step 1: Restore failing end-to-end regressions**

Restore the legacy owner flow without manual Wish-pool seeding: create a real Wish request and guest reply, hydrate it for the signed-in owner, click the living-room refresh action, verify the reply enters the Wish pool, click `今晚做`, then assert the recipe is in tonight's menu and absent from the Wish pool. Add product assertions for the actionable Wish card and the exact three-part preference summary.

- [x] **Step 2: Verify RED**

Run the legacy collaboration smoke, product smoke and product-review gate. They must fail on the currently unreachable Wish callbacks and incomplete preference summary.

- [x] **Step 3: Restore the owner Wish workflow**

Pass `wishPool`, `onRefreshWishShare`, and `onPlanWish` through `UserCenter`. Render a real action on the active Wish collaboration plus collected Wish items with an accessible per-item `今晚做` action. Do not fabricate replies, bypass API refresh, or add formal household membership.

- [x] **Step 4: Complete the preference summary**

Build one concise sentence from current formal-member count (falling back to profile family size), `tastePreferences`, and combined `dislikes`/`allergies`. Use truthful empty labels such as `待补充`/`暂无` rather than omitting a required dimension.

- [x] **Step 5: Refresh evidence and delivery truth**

Rerun the full Phase 2 matrix with new durable manifests, correct the inaccurate semantic-migration claim, record exact evidence paths and retain all true-device/production deferrals.

- [x] **Step 6: Commit and independently review**

```bash
git add src/components/UserCenter.jsx src/components/FamilyLivingRoom.jsx scripts/smoke-collaboration-flow.mjs scripts/smoke-product-entrypoints.mjs scripts/check-product-review-readiness.mjs docs/humi-family-living-room-phase-2-delivery.md
git add -f .superpowers/sdd/task-7-report.md .superpowers/sdd/task-8-report.md
git commit -m "fix: restore Humi Wish planning workflow"
```

### Task 9: Truthful Collaboration CTA and Evidence Closure

**Files:**
- Modify: `src/components/CraveLanding.jsx`
- Modify: `src/components/GroceryClaimLanding.jsx`
- Modify: `src/components/WishLanding.jsx`
- Modify: `src/main.jsx`
- Modify: `scripts/smoke-collaboration-landings.mjs`
- Modify: `scripts/smoke-collaboration-flow.mjs`
- Modify: `scripts/check-product-review-readiness.mjs`
- Modify: `scripts/smoke-product-entrypoints.mjs`
- Modify: `scripts/check-h5-entrypoint-resilience.mjs`
- Modify: `docs/humi-family-living-room-phase-2-delivery.md`

**Interfaces:**
- Generic collaboration completion offers `登录 Humi，保存这次参与`, explicitly states that it does not join a household, and binds only the participation identity. `加入这个家` remains exclusive to real household invitations.
- Product avatar evidence proves a real image loads and the no-avatar initials fallback renders.
- H5 resilience evidence includes a private machine-readable manifest beside its screenshots.

- [x] **Step 1: Add failing user-facing language and evidence regressions**

After Crave/grocery/Wish submission, assert the CTA and explanation contain no household-membership promise, click the identity-binding CTA, verify the pending participation context, and prove no household mutation request occurs. Add static source gates for all three landings and the internal callback names. Add loaded-image/fallback assertions and an H5 manifest requirement.

- [x] **Step 2: Verify RED**

Run collaboration landing smoke, legacy collaboration smoke, product review/smoke and H5 entry validation. Expected failures are the three stale join CTAs/internal names, weak avatar fixture, and missing H5 manifest.

- [x] **Step 3: Make collaboration language truthful end to end**

Rename generic component props and the main handler to participation-binding language. Use `登录 Humi，保存这次参与`; explain that login associates this action with the user's identity and never automatically joins the household. Keep the actual invite landing's `加入这个家` copy unchanged.

- [x] **Step 4: Close evidence-quality gaps**

Use one visibly valid image fixture plus one absent-avatar initials fallback and assert image decode/natural dimensions. Write an H5 JSON manifest with `ok`, exact checks, screenshots, timestamp, evidence directory and `0600` permissions inside the existing `0700` evidence directory.

- [x] **Step 5: Rerun full Phase 2 matrix and update delivery truth**

Generate new private durable product/collaboration/H5 evidence, record exact paths, warnings and deferrals, and keep all production/true-device gates explicit.

- [x] **Step 6: Commit and independently review**

```bash
git add src/components/CraveLanding.jsx src/components/GroceryClaimLanding.jsx src/components/WishLanding.jsx src/main.jsx scripts/smoke-collaboration-landings.mjs scripts/smoke-collaboration-flow.mjs scripts/check-product-review-readiness.mjs scripts/smoke-product-entrypoints.mjs scripts/check-h5-entrypoint-resilience.mjs docs/humi-family-living-room-phase-2-delivery.md
git add -f .superpowers/sdd/task-9-report.md
git commit -m "fix: clarify Humi participation identity binding"
```

### Task 10: Restore UI-Driven Multi-Household Creation

**Files:**
- Modify: `src/components/UserCenter.jsx`
- Modify: `src/components/HouseholdSettingsPage.jsx`
- Modify: `src/main.jsx`
- Modify: `scripts/smoke-collaboration-flow.mjs`
- Modify: `scripts/smoke-product-entrypoints.mjs`
- Modify: `scripts/check-product-review-readiness.mjs`
- Modify: `docs/humi-family-living-room-phase-2-delivery.md`

**Interfaces:**
- A current household owner can open Family Settings, enter a non-empty name, choose `新建一个家`, and land synchronously in the new family's living room. Existing household switching remains available and all household state stays isolated.

- [x] **Step 1: Restore failing UI-path regressions**

Replace direct API creation inside `verifyHouseholdUserCenterFlow` with the historical visible path: Family Settings → `例如：爸妈家` → `新建一个家`. Extend product smoke/static review to require the same UI creation, new active-family heading, isolated empty state, and switch back to the original family.

- [x] **Step 2: Verify RED**

Run legacy mega-smoke, product smoke and product review. Expected failure is the missing create-household input/button/prop forwarding.

- [x] **Step 3: Restore the creation affordance**

Pass `onCreateHousehold` through `UserCenter` to `HouseholdSettingsPage`. Render an owner-only mobile-friendly create section with a preserved draft, inline natural error and pending safety. Require a non-empty trimmed name in both the settings submit path and `createAnotherHumiHousehold`; do not silently fabricate `另一个家`.

- [x] **Step 4: Verify active-family and isolation behavior**

After successful API response, consume the server envelope so the new family becomes active and internal routing returns to its living room without stale Settings. Assert the new family has empty menu/profile/collaboration state, the old family remains intact, and switching back restores it.

- [x] **Step 5: Rerun full Phase 2 matrix and update delivery truth**

Generate new private durable product/collaboration/H5 evidence, record exact paths, warnings, Task 9 commit `c77772c`, Task 10 candidate provenance and all deferrals.

- [x] **Step 6: Commit and independently review**

```bash
git add src/components/UserCenter.jsx src/components/HouseholdSettingsPage.jsx src/main.jsx scripts/smoke-collaboration-flow.mjs scripts/smoke-product-entrypoints.mjs scripts/check-product-review-readiness.mjs docs/humi-family-living-room-phase-2-delivery.md
git add -f .superpowers/sdd/task-10-report.md
git commit -m "fix: restore Humi multi-household creation"
```

### Task 11: Null-Body Contract and Versioned AI-HQ Handoff

**Files:**
- Modify: `api/server.js`
- Modify: `scripts/smoke-humi-api.mjs`
- Modify: `docs/humi-api-contract.md`
- Modify: `docs/humi-family-living-room-phase-2-delivery.md`
- Create: `/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/HANDOFF.md`
- Create: `/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/v1/**`

**Interfaces:**
- `POST /households` treats an explicit JSON `null` body exactly like a missing/empty household name: `400 household_name_required`, no side effects.
- Cross-agent consumers use only the AI-HQ handoff `current_version`; the preview handoff records task ID, producer, status, version, stable paths, generated time, sizes and SHA256 checksums for the cumulative candidate and evidence indexes.

- [x] **Step 1: Add failing raw-null API regression**

Send raw JSON `null` to authenticated `POST /households`, assert `400 household_name_required`, then prove `GET /households` remains empty.

- [x] **Step 2: Verify RED and implement null normalization**

Run `validate:api`; first confirm the current `500 internal_error`, then normalize the parsed body before dereference and document the contract. Do not broaden household creation or introduce defaults.

- [x] **Step 3: Rerun the complete Phase 2 matrix**

Generate new private durable H5/product/collaboration manifests and run legacy mega-smoke, build, diff check and secret scan.

- [x] **Step 4: Build the versioned preview handoff**

After the exact product commit exists, create a stable `v1` directory under `AI-HQ/deliverables/humi/HUMI-2026-001/` containing the cumulative binary diff, Phase 2 delivery record, copied final evidence manifests and a checksummed screenshot/evidence index. Create `HANDOFF.md` with `Status: preview`, `Producer: codex@mbp-m5pro`, `Current version: v1`, exact paths/sizes/SHA256 and consumer rules. Do not copy bulk screenshots into Git; index their private paths and checksums.

- [x] **Step 5: Validate task, handoff and safety**

Run AI-HQ task validation, handoff validation, checksum verification, AI-HQ secret scan and product secret scan. Cross-agent review must read only `current_version` from the handoff.

- [x] **Step 6: Commit product correction and independently review**

```bash
git add api/server.js scripts/smoke-humi-api.mjs docs/humi-api-contract.md docs/humi-family-living-room-phase-2-delivery.md
git add -f .superpowers/sdd/task-11-report.md
git commit -m "fix: harden Humi household creation contract"
```

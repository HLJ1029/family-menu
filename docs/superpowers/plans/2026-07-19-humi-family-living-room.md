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

- [ ] **Step 1: Write the failing lifecycle test**

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

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run validate:household`

Expected: FAIL because `updateHousehold` is not defined.

- [ ] **Step 3: Implement store operations with exact permission rules**

Add methods to `HumiStore`. Every method calls `await this.load()`, resolves only a formal-member household, uses `codedError`, updates `updatedAt`, repairs `activeHouseholds`, and calls `await this.save()` once. Name validation is:

```js
const name = sanitizeText(patch.name, "", 32);
if (!name) throw codedError("household_name_required", "请填写家庭名称。");
```

Ownership transfer must set exactly one `role: "owner"`; leaving deletes only the caller's membership and never deletes household state. If the current owner is the last member, `leaveHousehold` may remove the empty household and its `householdStates` record; if other members remain it must return `owner_must_transfer_or_disband`.

- [ ] **Step 4: Run the lifecycle and identity store tests**

Run: `npm run validate:household && npm run validate:identity`

Expected: both exit 0.

- [ ] **Step 5: Commit**

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

- [ ] **Step 1: Add failing API smoke scenarios**

After owner/member login and explicit household creation, assert owner rename succeeds, member rename is 403, owner removal is 409, member removal succeeds, transfer succeeds, and the former owner can leave. Every successful response must contain `{ family, households }`; leaving also contains the new active `state`.

- [ ] **Step 2: Verify RED**

Run: `npm run validate:api`

Expected: first new route returns 404.

- [ ] **Step 3: Add route matchers and handlers**

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

- [ ] **Step 4: Add H5 client functions**

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

- [ ] **Step 5: Verify and document**

Run: `npm run validate:api && npm run validate:identity`

Expected: exit 0; docs list permissions, 4xx codes and non-destructive state behavior.

- [ ] **Step 6: Commit**

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

- [ ] **Step 1: Add failing mobile smoke assertions**

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

- [ ] **Step 2: Verify RED**

Run local Vite and: `npm run release:product:smoke -- --base-url http://127.0.0.1:4173/`

Expected: FAIL because `family-living-room` does not exist.

- [ ] **Step 3: Implement `HouseholdStart`**

The component receives `{ familyName, onFamilyNameChange, onCreate, pending, status, onOpenInvite }`. It renders one editable name input only after `创建我的家` is selected; `通过邀请加入` explains that an invitation card/link is required and invokes `onOpenInvite` without inventing a token.

- [ ] **Step 4: Implement the four-section `FamilyLivingRoom`**

The component receives the current family, formal members, active collaboration summaries and preference summary. Its action buttons call page navigation; `邀请家人` invokes the existing invite callback directly. “正在一起做” uses at most three cards with task, progress and next action. Empty state says `还没有进行中的协作，今晚可以先问问大家。`

- [ ] **Step 5: Reduce `UserCenter` to page orchestration**

Remove from the home path: `CloudSyncPanel`, `PortraitReceiptPreview`, nutrition goals, validation export, experience tier, long pulse/portrait sections and duplicate account sidebar. Keep those data utilities outside the family home or delete them if unused. When signed in and `family === null`, render only `HouseholdStart`; when guest, render the existing login/guest explanation without a fake family.

- [ ] **Step 6: Verify smoke and build**

Run:

```bash
npm run release:product:smoke -- --base-url http://127.0.0.1:4173/
npm run build
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

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

- [ ] **Step 1: Add failing page-navigation smoke checks**

Click each living-room action and assert a distinct `data-testid`:

```text
household-members-page
household-settings-page
family-activity-page
humi-account-page
```

Every page must have `返回家庭客厅`. Member sessions must not see remove/transfer/rename controls. Mobile account page must expose phone state, logout, privacy and terms.

- [ ] **Step 2: Verify RED**

Run product smoke against local Vite; expected failure at the first missing page.

- [ ] **Step 3: Implement management callbacks in `main.jsx`**

Each callback requires a complete Humi session, calls the Task 2 client, applies `{ state, family, households }`, reports natural-language success/failure, and never performs an optimistic family mutation before the API succeeds.

- [ ] **Step 4: Implement focused pages**

- Members: avatar, nickname, role, joined status; owner-only invite/remove/transfer controls.
- Settings: rename, household switch, preference summary, leave; owner with other members sees `先转让主厨后再退出`.
- Activity: Phase 2 renders existing crave/grocery/wish/meal activity, sorted by timestamp, with no token/internal state.
- Account: avatar/name, phone, logout, privacy and terms; no family controls.

- [ ] **Step 5: Remove duplicated old panels and verify responsive behavior**

Run:

```bash
npm run release:product:smoke -- --base-url http://127.0.0.1:4173/
npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/
npm run build
```

Expected: all exit 0; the five primary tabs remain visible on child pages because these are internal family pages, not new primary views.

- [ ] **Step 6: Commit**

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

- [ ] **Step 1: Run the complete Phase 2 matrix**

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

- [ ] **Step 2: Independently review permissions and navigation**

Review must explicitly check owner/member API authorization, last-owner exit invariant, no optimistic success, four child pages, and absence of technical content on the living-room home.

- [ ] **Step 3: Record delivery**

The delivery document records commits, exact evidence paths, deferred true-device checks and confirms no production write/deploy.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md docs/humi-family-living-room-phase-2-delivery.md
git commit -m "docs: record Humi family living room delivery"
```

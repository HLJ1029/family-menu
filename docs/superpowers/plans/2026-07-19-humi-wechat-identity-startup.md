# Humi 主动微信登录与身份建立 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Humi 小程序启动从“静默登录并自动建号”改成“用户主动登录或游客体验”，完成一次性昵称头像设置，并用一次性票据安全地把原生登录态交给 H5。

**Architecture:** 微信原生层只在 H5 发出明确登录请求后调用 `wx.login`。Humi API 保存用户身份资料并签发 60 秒、单次消费的 H5 交换票据；H5 只接收票据并换取正式会话，不再把长期 access token 放进 URL。所有读取接口改为无副作用，登录与读取状态都不得自动创建家庭。

**Tech Stack:** 微信小程序原生 JavaScript/WXML/WXSS、React 19、Vite 7、Node.js HTTP API、JSON 文件存储、Playwright、Node `assert`

## Global Constraints

- 实施基线为执行时最新 `origin/main`；必须在独立 worktree 和 `codex/humi-wechat-identity-startup` 分支完成。
- 普通启动不得调用 `wx.login`、`/auth/wechat/login` 或任何创建用户/家庭的接口。
- 游客必须能进入 H5、获得推荐、确认菜单并生成本机清单。
- 只有用户主动点击“微信登录”才允许创建或恢复 Humi 微信用户。
- 微信登录成功不等于资料完成，也不等于创建家庭。
- 昵称必填；头像可选择微信头像或按用户 ID 稳定分配的 Humi 默认头像。
- H5 交换票据有效期固定为 60 秒，只能消费一次；数据文件只保存 SHA-256 哈希，不保存明文票据。
- 自定义头像仅接受 JPEG/PNG，解码后最大 512 KiB；文件名使用不透明随机 token。
- 本阶段要求正式运行路径零 Supabase import、零 client 初始化、零构建变量；暂不删除 `src/lib/supabase/` 源文件、npm 依赖、GitHub Secrets 或 provider 数据，待第 4 阶段完成备份核对后物理清退。
- 任何接口都不得隐式创建家庭；只有用户明确提交 `POST /households` 才能新建家庭，加入有效邀请只能加入目标家庭。读取 `/me`、`/state`、`/households` 在没有家庭时返回 `family: null`、`households: []`。
- 不删除或覆盖现有 18 个用户、18 个身份、7 个家庭和 6 份家庭状态。
- 不执行生产部署、数据库写入或微信版本上传，除非用户在实现验收后再次明确确认。
- 所有新增用户文案使用自然中文，不出现 OpenID、token、Supabase、云同步或内部状态名。

---

## Plan Series

本文件是已批准总设计的第 1/4 份实施计划：

1. 本计划：主动微信登录、身份完善、安全会话交接、运行时 Supabase Auth 退出。
2. 后续计划：家庭生命周期与 A 方案“家庭客厅”。
3. 后续计划：协作参与者身份、游客记录与协作历史。
4. 后续计划：现有数据迁移、Supabase 最终物理清退、真机与生产发布。

第 1 阶段必须独立达到“游客不建号、主动登录可完成身份、现有用户可恢复”的可运行状态，才能进入第 2 阶段。

## File Map

### New files

- `api/avatar.js`：验证、写入和读取持久化用户头像，不处理用户资料或 HTTP 路由。
- `miniprogram/pages/identity/index.js`：一次性身份完善页的状态和 API 调用。
- `miniprogram/pages/identity/index.json`：身份页标题配置。
- `miniprogram/pages/identity/index.wxml`：微信头像选择和昵称输入。
- `miniprogram/pages/identity/index.wxss`：身份页样式。
- `scripts/check-identity-store.mjs`：身份资料、无副作用家庭读取和单次票据的 store 级回归测试。
- `scripts/check-identity-runtime.mjs`：启动链路、票据 URL 和 Supabase Auth 退出的静态门禁。

### Modified files

- `api/store.js`：用户资料字段、默认头像、H5 票据和无副作用家庭读取。
- `api/server.js`：身份资料、头像、H5 票据接口以及 `family: null` 合同。
- `miniprogram/app.js`：安全恢复、保存和清除当前原生 Humi session。
- `miniprogram/app.json`：注册原生身份完善页。
- `miniprogram/pages/index/index.js`：取消启动静默登录，处理主动登录和票据跳转。
- `miniprogram/pages/index/index.wxml`：删除“正在同步”的误导性启动状态。
- `miniprogram/pages/index/index.wxss`：保留错误兜底样式，删除静默登录加载器样式。
- `src/lib/humiIdentity.js`：从 URL 读取一次性票据、保存完整用户资料。
- `src/lib/humiApi.js`：增加 `exchangeHumiTicket(ticket)`。
- `src/lib/aiViaHumiApi.js`：成为唯一的远程 AI 请求实现，不再以 Supabase 为 fallback。
- `src/lib/validationEvents.js`：承接本地产品事件常量，不再向 Supabase 写事件。
- `src/main.jsx`：异步交换票据，不再把登录等同于资料和引导完成；停止 Supabase Auth boot。
- `src/components/AppShell.jsx`：按 `avatarUrl` / `avatarKey` 显示真实且稳定的用户头像。
- `src/components/AuthLanding.jsx`：小程序内明确展示“微信登录”和“先体验 Humi”。
- `src/components/UserCenter.jsx`：移除 Supabase 邮箱账号与成员偏好入口，保留 Humi 身份和本机/自建后端能力。
- `.github/workflows/deploy-pages.yml`：停止向正式 H5 注入 Supabase 变量。
- `scripts/smoke-humi-api.mjs`：覆盖身份资料、头像、单次票据和无家庭合同。
- `scripts/check-miniprogram-entrypoint-resilience.mjs`：证明普通启动不登录、主动点击才登录。
- `scripts/check-h5-entrypoint-resilience.mjs`：证明 H5 可交换票据并清除 URL 参数。
- `package.json`：增加 `validate:identity` 门禁。
- `docs/humi-api-contract.md`：记录新身份和票据合同。
- `docs/humi-api-production-deploy-runbook.md`：把头像目录纳入备份和回滚。

## Interfaces Shared Across Tasks

```js
// api/store.js
store.getActiveHouseholdForUser(userId) -> Household | null
store.requireActiveHouseholdForUser(userId) -> Household | throws household_required
store.requireOwnedHouseholdForUser(userId) -> Household | throws household_required | forbidden
store.updateIdentityProfile(userId, { displayName, avatarKey, avatarUrl }) -> User
store.updateIdentityAvatar(userId, { avatarUrl }) -> User
store.issueH5Ticket(userId, { now, ttlMs }) -> { ticket, expiresAt }
store.consumeH5Ticket(ticket, { now }) -> { userId } | null

// api/avatar.js
decodeAvatarPayload({ mimeType, dataBase64 }, maxBytes) -> { format, bytes }
writeAvatarFile({ directory, bytes, format }) -> { token, format, bytes, path }
readAvatarFile({ directory, token, format }) -> { bytes, size } | null

// HTTP
POST /auth/wechat/login -> NativeSession
POST /auth/h5-ticket (Bearer NativeSession) -> { ticket, expiresAt }
POST /auth/h5/exchange { ticket } -> HumiSession
PUT /identity/profile (Bearer NativeSession) { displayName } -> { user }
POST /identity/avatar (Bearer NativeSession) { mimeType, dataBase64 } -> { user }
GET /avatars/:token.:format -> image bytes

// src/lib/humiApi.js
exchangeHumiTicket(ticket) -> Promise<HumiSession>

// src/lib/humiIdentity.js
takeHumiTicketFromUrl() -> string
saveHumiSession(session) -> NormalizedHumiSession
requestMiniProgramLogout() -> boolean
```

`PublicUser` 和 `NormalizedHumiSession.user` 使用同一字段：

```ts
type PublicUser = {
  id: string;
  displayName: string;
  provider: "wechat";
  profileStatus: "incomplete" | "complete";
  avatarKey: string;
  avatarUrl: string;
  phoneVerified: boolean;
  phoneMasked: string;
  phoneVerifiedAt: string | null;
};
```

---

### Task 1: Store 身份资料、无副作用家庭读取与 H5 单次票据

**Files:**
- Create: `scripts/check-identity-store.mjs`
- Modify: `api/store.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: 现有 `HumiStore(filePath)`、`findOrCreateWechatUser()`、JSON 原子保存队列。
- Produces: 无副作用的家庭读取、显式 `requireActiveHouseholdForUser()` / `requireOwnedHouseholdForUser()`、身份更新、单次票据和完整用户身份字段。

- [x] **Step 1: 写失败的 store 回归测试**

创建 `scripts/check-identity-store.mjs`：

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumiStore } from "../api/store.js";

const directory = await mkdtemp(join(tmpdir(), "humi-identity-store-"));
const dataFile = join(directory, "data.json");
const store = new HumiStore(dataFile);

const user = await store.findOrCreateWechatUser({ openid: "identity-openid", unionid: null });
assert.equal(user.profileStatus, "incomplete");
assert.match(user.avatarKey, /^humi-avatar-/);
assert.equal(await store.getActiveHouseholdForUser(user.id), null);
assert.equal(await store.getHouseholdForUser(user.id), null, "legacy read alias must not create a household");
await assert.rejects(
  store.requireActiveHouseholdForUser(user.id),
  (error) => error.code === "household_required",
);

const avatarOnly = await store.updateIdentityAvatar(user.id, {
  avatarUrl: "https://api.humi-home.com/avatars/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.jpg",
});
assert.equal(avatarOnly.profileStatus, "incomplete", "avatar upload must not complete nickname setup");

const beforeRead = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(beforeRead.households.length, 0, "reading identity must not create a household");

const updated = await store.updateIdentityProfile(user.id, {
  displayName: "小禾",
  avatarKey: user.avatarKey,
  avatarUrl: "",
});
assert.equal(updated.displayName, "小禾");
assert.equal(updated.profileStatus, "complete");

const issued = await store.issueH5Ticket(user.id, { now: 1_000, ttlMs: 60_000 });
assert.match(issued.ticket, /^[A-Za-z0-9_-]{32,}$/);
assert.equal((await store.consumeH5Ticket(issued.ticket, { now: 2_000 }))?.userId, user.id);
assert.equal(await store.consumeH5Ticket(issued.ticket, { now: 2_001 }), null, "ticket must be single-use");

const expired = await store.issueH5Ticket(user.id, { now: 10_000, ttlMs: 60_000 });
assert.equal(await store.consumeH5Ticket(expired.ticket, { now: 70_001 }), null, "expired ticket must fail");

const persisted = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(JSON.stringify(persisted).includes(issued.ticket), false, "raw ticket must not be stored");
console.log("Identity store checks passed.");
```

- [x] **Step 2: 注册测试脚本并确认失败**

在 `package.json` scripts 中加入：

```json
"validate:identity": "node scripts/check-identity-store.mjs && node scripts/check-identity-runtime.mjs"
```

首次只运行 store 测试：

```bash
node scripts/check-identity-store.mjs
```

Expected: FAIL，首个错误为 `user.profileStatus` 不等于 `incomplete` 或 `getActiveHouseholdForUser is not a function`。

- [x] **Step 3: 为新用户补充资料状态和稳定默认头像**

在 `api/store.js` 顶部引入哈希能力并增加常量：

```js
import { createHash, randomBytes, randomUUID } from "node:crypto";

const DEFAULT_AVATAR_KEYS = [
  "humi-avatar-dev-front-m-01",
  "humi-avatar-dev-side-m-01",
  "humi-avatar-dev-thinking-m-01",
  "humi-avatar-dev-laptop-m-01",
  "humi-avatar-family-f-01",
  "humi-avatar-family-m-01",
  "humi-avatar-parent-f-01",
  "humi-avatar-parent-m-01",
];

function defaultAvatarKey(userId) {
  const digest = createHash("sha256").update(userId).digest();
  return DEFAULT_AVATAR_KEYS[digest.readUInt32BE(0) % DEFAULT_AVATAR_KEYS.length];
}
```

新用户对象使用：

```js
const userId = randomUUID();
const user = {
  id: userId,
  displayName: "微信用户",
  provider: "wechat",
  profileStatus: "incomplete",
  avatarKey: defaultAvatarKey(userId),
  avatarUrl: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
```

读取现有用户时只在返回对象中补兼容默认值，不在无关 GET 请求中落盘：

```js
normalizeIdentityUser(user) {
  if (!user) return null;
  return {
    ...user,
    profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
    avatarKey: user.avatarKey || defaultAvatarKey(user.id),
    avatarUrl: user.avatarUrl || "",
  };
}
```

- [x] **Step 4: 增加身份更新和无副作用家庭读取**

在 `HumiStore` 中加入：

```js
async getActiveHouseholdForUser(userId) {
  await this.load();
  return this.findActiveHouseholdByMember(userId);
}

async getHouseholdForUser(userId) {
  return this.getActiveHouseholdForUser(userId);
}

async requireActiveHouseholdForUser(userId) {
  const household = await this.getActiveHouseholdForUser(userId);
  if (household) return household;
  throw codedError("household_required", "请先创建或加入一个家。");
}

async requireOwnedHouseholdForUser(userId) {
  const household = await this.requireActiveHouseholdForUser(userId);
  if (household.ownerId === userId) return household;
  throw codedError("forbidden", "Only the household owner can perform this action.");
}

async updateIdentityProfile(userId, profile = {}) {
  await this.load();
  const user = this.data.users.find((item) => item.id === userId);
  if (!user) return null;
  const displayName = sanitizeText(profile.displayName, "", 32);
  if (!displayName) throw codedError("display_name_required", "displayName is required.");
  user.displayName = displayName;
  user.avatarKey = sanitizeText(profile.avatarKey, user.avatarKey || defaultAvatarKey(user.id), 80);
  user.avatarUrl = sanitizeText(profile.avatarUrl, user.avatarUrl || "", 240);
  user.profileStatus = "complete";
  user.updatedAt = new Date().toISOString();
  await this.save();
  return this.normalizeIdentityUser(user);
}

async updateIdentityAvatar(userId, profile = {}) {
  await this.load();
  const user = this.data.users.find((item) => item.id === userId);
  if (!user) return null;
  const avatarUrl = sanitizeText(profile.avatarUrl, "", 240);
  if (!avatarUrl) throw codedError("avatar_url_required", "avatarUrl is required.");
  user.avatarUrl = avatarUrl;
  user.updatedAt = new Date().toISOString();
  await this.save();
  return this.normalizeIdentityUser(user);
}
```

将 `getUser()` 和 `findOrCreateWechatUser()` 的返回值统一经过 `normalizeIdentityUser()`。

删除 `ensureHouseholdForUser()` 和 `ensureOwnedHouseholdForUser()` 的隐式创建语义，并逐一替换其调用点：

- 纯读取使用 `getActiveHouseholdForUser()`；没有家庭时返回 `null` 或空集合。
- 保存家庭状态、创建家庭邀请和发起家庭协作使用 `requireActiveHouseholdForUser()` 或 `requireOwnedHouseholdForUser()`，没有家庭时抛 `household_required`。
- `addHouseholdMember()` 找不到目标家庭时返回 `null`，不得为加入者另建一个家庭。
- `createHouseholdForUser()` 保持唯一的新建入口；有效邀请的 join 逻辑只向邀请指定家庭增加成员。

完成替换后运行：

```bash
rg -n "ensureHouseholdForUser|ensureOwnedHouseholdForUser" api/store.js
```

Expected: 无输出。

- [x] **Step 5: 增加哈希存储、单次消费的 H5 票据**

在 `DEFAULT_DATA` 增加：

```js
h5Tickets: [],
```

在 `HumiStore` 中加入：

```js
async issueH5Ticket(userId, { now = Date.now(), ttlMs = 60_000 } = {}) {
  await this.load();
  if (!this.data.users.some((item) => item.id === userId)) return null;
  const ticket = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(ticket).digest("hex");
  this.data.h5Tickets = (this.data.h5Tickets ?? [])
    .filter((item) => item.expiresAt > now && !item.consumedAt)
    .slice(-999);
  this.data.h5Tickets.push({ tokenHash, userId, expiresAt: now + ttlMs, consumedAt: null });
  await this.save();
  return { ticket, expiresAt: now + ttlMs };
}

async consumeH5Ticket(ticket, { now = Date.now() } = {}) {
  await this.load();
  const tokenHash = createHash("sha256").update(String(ticket || "")).digest("hex");
  const item = (this.data.h5Tickets ?? []).find((candidate) => candidate.tokenHash === tokenHash);
  if (!item || item.consumedAt || item.expiresAt <= now) return null;
  item.consumedAt = now;
  await this.save();
  return { userId: item.userId };
}
```

- [x] **Step 6: 运行 store 测试并确认通过**

```bash
node scripts/check-identity-store.mjs
```

Expected: `Identity store checks passed.`

- [x] **Step 7: 提交 Task 1**

```bash
git add api/store.js scripts/check-identity-store.mjs package.json
git commit -m "feat: add explicit Humi identity state"
```

---

### Task 2: 身份、头像与 H5 票据 API 合同

**Files:**
- Create: `api/avatar.js`
- Modify: `api/server.js`
- Modify: `scripts/smoke-humi-api.mjs`

**Interfaces:**
- Consumes: Task 1 的 store 方法和现有 Bearer session。
- Produces: `/identity/profile`、`/identity/avatar`、`/auth/h5-ticket`、`/auth/h5/exchange`、公开头像读取，以及 `family: null` 的无副作用读取合同。

- [x] **Step 1: 先把 API smoke 改成新合同并确认失败**

先把 smoke 改成每次使用全新的临时数据目录，避免 `/tmp/humi-api-smoke.json` 的历史数据污染计数。删除文件顶部对 `api/server.js` 的静态 import，改为在环境变量就绪后动态 import：

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const smokeDirectory = await mkdtemp(join(tmpdir(), "humi-api-smoke-"));
const dataFile = join(smokeDirectory, "data.json");
process.env.HUMI_API_DATA_FILE = dataFile;
process.env.HUMI_AVATAR_DIR = join(smokeDirectory, "avatars");
process.env.HUMI_POSTER_DIR = join(smokeDirectory, "posters");
process.env.HUMI_PUBLIC_BASE_URL = "http://127.0.0.1:18787";
const { createHumiApiServer } = await import("../api/server.js");
```

删除文件末尾自定义的 `function assert(condition, message)`；Node strict assert 既支持现有的 `assert(condition, message)`，也支持本计划新增的 `assert.equal()` / `assert.deepEqual()`。

在最外层 `finally` 关闭 server 后执行：

```js
await rm(smokeDirectory, { recursive: true, force: true });
```

先在 smoke 的请求辅助函数附近增加可复用的拒绝断言：

```js
async function assertRejectedRequest(url, options, expectedStatus, expectedCode) {
  const response = await rawRequest(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(options.body ?? {}),
  });
  assert.equal(response.status, expectedStatus);
  assert.equal(response.data?.error, expectedCode);
}
```

再在登录断言后加入：

```js
assert.equal(login.user?.profileStatus, "incomplete");
assert.match(login.user?.avatarKey || "", /^humi-avatar-/);

const firstMe = await request(`${baseUrl}/me`, {
  headers: { Authorization: `Bearer ${login.accessToken}` },
});
assert.equal(firstMe.family, null, "reading /me must not create a household");
assert.deepEqual(firstMe.households, []);

const avatarJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const avatarUpload = await request(`${baseUrl}/identity/avatar`, {
  method: "POST",
  headers: { Authorization: `Bearer ${login.accessToken}` },
  body: { mimeType: "image/jpeg", dataBase64: avatarJpeg.toString("base64") },
});
assert.equal(avatarUpload.user.profileStatus, "incomplete", "avatar alone must not complete identity");
assert.match(avatarUpload.user.avatarUrl, /^http:\/\/127\.0\.0\.1:18787\/avatars\//);
const downloadedAvatar = await rawRequest(avatarUpload.user.avatarUrl);
assert.equal(downloadedAvatar.status, 200);
assert.equal(Buffer.compare(downloadedAvatar.buffer, avatarJpeg), 0);

await assertRejectedRequest(`${baseUrl}/identity/avatar`, {
  method: "POST",
  headers: { Authorization: `Bearer ${login.accessToken}` },
  body: { mimeType: "image/jpeg", dataBase64: Buffer.from("not-an-image").toString("base64") },
}, 415, "invalid_avatar");

await assertRejectedRequest(`${baseUrl}/identity/profile`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${login.accessToken}` },
  body: { displayName: "" },
}, 400, "display_name_required");

await assertRejectedRequest(`${baseUrl}/auth/h5-ticket`, {
  method: "POST",
  headers: { Authorization: `Bearer ${login.accessToken}` },
}, 409, "identity_required");

const identityProfile = await request(`${baseUrl}/identity/profile`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${login.accessToken}` },
  body: { displayName: "小禾" },
});
assert.equal(identityProfile.user.displayName, "小禾");
assert.equal(identityProfile.user.profileStatus, "complete");

const ticket = await request(`${baseUrl}/auth/h5-ticket`, {
  method: "POST",
  headers: { Authorization: `Bearer ${login.accessToken}` },
});
assert.match(ticket.ticket, /^[A-Za-z0-9_-]{32,}$/);

const exchanged = await request(`${baseUrl}/auth/h5/exchange`, {
  method: "POST",
  body: { ticket: ticket.ticket },
});
assert.equal(exchanged.user.id, login.user.id);

await assertRejectedRequest(`${baseUrl}/auth/h5/exchange`, {
  method: "POST",
  body: { ticket: ticket.ticket },
}, 401, "invalid_h5_ticket");
```

删除旧 smoke 中“调用 `/me` 后自动得到 owner family”的断言；改为显式 `POST /households` 后再断言 owner family。

运行：

```bash
npm run validate:api
```

Expected: FAIL，首个失败来自缺少 `profileStatus` 或 `/me` 仍自动建家。

- [x] **Step 2: 创建头像验证与持久化模块**

创建 `api/avatar.js`：

```js
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export function decodeAvatarPayload(payload = {}, maxBytes = 512 * 1024) {
  const mimeType = String(payload.mimeType || "").toLowerCase();
  if (!["image/jpeg", "image/png"].includes(mimeType)) return null;
  const bytes = Buffer.from(String(payload.dataBase64 || ""), "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) return null;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((mimeType === "image/png" && !png) || (mimeType === "image/jpeg" && !jpeg)) return null;
  return { format: png ? "png" : "jpg", bytes };
}

export async function writeAvatarFile({ directory, bytes, format }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString("base64url");
  const path = join(directory, `${token}.${format}`);
  await writeFile(path, bytes, { mode: 0o600 });
  return { token, format, bytes: bytes.length, path };
}

export async function readAvatarFile({ directory, token, format }) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token) || !["jpg", "png"].includes(format)) return null;
  const path = join(directory, `${token}.${format}`);
  const fileInfo = await stat(path).catch(() => null);
  if (!fileInfo?.isFile()) return null;
  return { bytes: await readFile(path), size: fileInfo.size };
}
```

- [x] **Step 3: 增加 server 配置、路由和用户输出字段**

在 `api/server.js` 配置中增加：

```js
avatarDir: process.env.HUMI_AVATAR_DIR || resolve(dirname(process.env.HUMI_API_DATA_FILE || resolve(".humi-api-data.json")), "avatars"),
avatarPublicBaseUrl: (process.env.HUMI_PUBLIC_BASE_URL || "https://api.humi-home.com").replace(/\/$/, ""),
avatarMaxBytes: 512 * 1024,
```

`toPublicUser()` 返回：

```js
function toPublicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName || "微信用户",
    provider: "wechat",
    profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
    avatarKey: user.avatarKey || "humi-avatar-family-m-01",
    avatarUrl: user.avatarUrl || "",
    phoneVerified: Boolean(user.phoneVerifiedAt),
    phoneMasked: user.phoneMasked || "",
    phoneVerifiedAt: user.phoneVerifiedAt || null,
  };
}
```

增加路由：

```js
if (request.method === "PUT" && url.pathname === "/identity/profile") {
  await handleIdentityProfile(request, response);
  return;
}
if (request.method === "POST" && url.pathname === "/identity/avatar") {
  await handleIdentityAvatar(request, response);
  return;
}
if (request.method === "POST" && url.pathname === "/auth/h5-ticket") {
  await handleCreateH5Ticket(request, response);
  return;
}
if (request.method === "POST" && url.pathname === "/auth/h5/exchange") {
  await handleExchangeH5Ticket(request, response);
  return;
}
const avatarMatch = url.pathname.match(/^\/avatars\/([A-Za-z0-9_-]{32})\.(jpg|png)$/);
if ((request.method === "GET" || request.method === "HEAD") && avatarMatch) {
  await handleGetAvatar(request, response, avatarMatch[1], avatarMatch[2]);
  return;
}
```

- [x] **Step 4: 实现资料和票据 handlers**

在 `api/server.js` 增加：

```js
async function handleIdentityProfile(request, response) {
  const auth = await requireAuth(request);
  const body = await readJson(request);
  const displayName = stringValue(body.displayName, 32);
  if (!displayName) throw httpError(400, "display_name_required", "请输入你的昵称。");
  const user = await store.updateIdentityProfile(auth.userId, { displayName });
  if (!user) throw httpError(401, "invalid_session", "登录状态已失效。");
  sendJson(response, 200, { user: toPublicUser(user) });
}

async function handleCreateH5Ticket(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "登录状态已失效。");
  if (user.profileStatus !== "complete") {
    throw httpError(409, "identity_required", "请先完成昵称设置。");
  }
  const issued = await store.issueH5Ticket(auth.userId, { ttlMs: 60_000 });
  if (!issued) throw httpError(401, "invalid_session", "登录状态已失效。");
  sendJson(response, 201, issued);
}

async function handleExchangeH5Ticket(request, response) {
  const body = await readJson(request);
  const consumed = await store.consumeH5Ticket(stringValue(body.ticket, 160));
  if (!consumed) throw httpError(401, "invalid_h5_ticket", "登录链接已失效，请重新登录。");
  const user = await store.getUser(consumed.userId);
  if (!user) throw httpError(401, "invalid_h5_ticket", "登录链接已失效，请重新登录。");
  sendAuthSession(response, user);
}
```

- [x] **Step 5: 实现头像上传和读取 handlers**

```js
async function handleIdentityAvatar(request, response) {
  const auth = await requireAuth(request);
  const body = await readJson(request, 800 * 1024);
  const decoded = decodeAvatarPayload(body, config.avatarMaxBytes);
  if (!decoded) throw httpError(415, "invalid_avatar", "头像需要是 512KB 内的 JPG 或 PNG。");
  const file = await writeAvatarFile({ directory: config.avatarDir, ...decoded });
  const avatarUrl = `${config.avatarPublicBaseUrl}/avatars/${file.token}.${file.format}`;
  const user = await store.updateIdentityAvatar(auth.userId, { avatarUrl });
  if (!user) throw httpError(401, "invalid_session", "登录状态已失效。");
  sendJson(response, 201, { user: toPublicUser(user) });
}

async function handleGetAvatar(request, response, token, format) {
  const file = await readAvatarFile({ directory: config.avatarDir, token, format });
  if (!file) throw httpError(404, "avatar_not_found", "头像不存在。");
  response.writeHead(200, {
    "Content-Type": format === "png" ? "image/png" : "image/jpeg",
    "Content-Length": file.size,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") return response.end();
  response.end(file.bytes);
}
```

把 `readJson` 改为支持显式上限；普通 JSON 路由默认保持现有“不额外限流”的兼容行为，头像路由单独传入 800 KiB：

```js
async function readJson(request, maxBytes = Number.POSITIVE_INFINITY) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw httpError(413, "request_too_large", "提交内容太大。");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "invalid_json", "Request body must be JSON.");
  }
}
```

- [x] **Step 6: 让身份与状态读取不再自动建家**

`handleMe`、`handleGetState`、`handleGetHouseholds` 使用：

```js
const household = await store.getActiveHouseholdForUser(user.id);
const households = await store.getHouseholdsForUser(user.id);
```

`toHumiFamily()` 在没有 household 时返回 `null`：

```js
function toHumiFamily(household, user) {
  if (!household) return null;
  const member = household.members?.find((item) => item.memberId === user.id);
  return {
    id: household.id,
    name: household.name,
    ownerId: household.ownerId,
    currentMemberId: member?.memberId || user.id,
    role: member?.role || "member",
    provider: "wechat",
    members: (household.members ?? []).map((item) => ({
      memberId: item.memberId,
      nickname: item.nickname,
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt,
    })),
  };
}
```

`store.getState()` 只读取当前 active household；没有家庭时返回 `null`。`store.saveState()` 没有家庭时抛出 `household_required`，由 API 返回 HTTP 409，不再隐式建家。

在 server 顶层错误处理里把 store 的家庭前置条件稳定映射为 409，避免未捕获的 `household_required` 变成 500：

```js
const status = error.status || (error.code === "household_required" ? 409 : 500);
```

对应响应保持 `{ error: "household_required", message: "请先创建或加入一个家。" }`；API smoke 必须在新用户登录后直接调用一次 `PUT /state` 和一个家庭协作创建接口，均断言 409，随后再显式 `POST /households`。

- [x] **Step 7: 运行完整 API 验证**

确认 Step 1 已覆盖 4 字节 JPEG 上传、公开读取、错误格式、头像不提前完成身份，以及重复票据消费。运行：

```bash
npm run validate:api
```

Expected: 进程 exit 0；输出包含 Humi API smoke 成功信息，且测试数据中只有显式 `POST /households` 后才出现 household。

- [x] **Step 8: 提交 Task 2**

```bash
git add api/avatar.js api/server.js api/store.js scripts/smoke-humi-api.mjs
git commit -m "feat: add Humi identity API contract"
```

---

### Task 3: 原生微信身份完善页

**Files:**
- Create: `miniprogram/pages/identity/index.js`
- Create: `miniprogram/pages/identity/index.json`
- Create: `miniprogram/pages/identity/index.wxml`
- Create: `miniprogram/pages/identity/index.wxss`
- Modify: `miniprogram/app.js`
- Modify: `miniprogram/app.json`
- Modify: `scripts/check-identity-runtime.mjs`

**Interfaces:**
- Consumes: `app.globalData.humiSession`、`PUT /identity/profile`、`POST /identity/avatar`。
- Produces: 资料完整的原生 session，并 `wx.reLaunch()` 回主页面。

- [x] **Step 1: 创建失败的原生身份页静态门禁**

创建 `scripts/check-identity-runtime.mjs` 的第一部分：

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const appConfig = JSON.parse(fs.readFileSync("miniprogram/app.json", "utf8"));
assert.ok(appConfig.pages.includes("pages/identity/index"));

const identityJs = fs.readFileSync("miniprogram/pages/identity/index.js", "utf8");
const identityWxml = fs.readFileSync("miniprogram/pages/identity/index.wxml", "utf8");
assert.match(identityWxml, /open-type="chooseAvatar"/);
assert.match(identityWxml, /type="nickname"/);
assert.match(identityJs, /\/identity\/profile/);
assert.match(identityJs, /\/identity\/avatar/);
assert.match(identityJs, /wx\.reLaunch/);
```

运行：

```bash
node scripts/check-identity-runtime.mjs
```

Expected: FAIL，缺少 `pages/identity/index`。

- [x] **Step 2: 注册身份页面和可恢复的原生 session**

`miniprogram/app.json` pages 增加：

```json
"pages/identity/index"
```

`miniprogram/app.js` 增加原生 session 存储；只恢复尚未过期的 Humi session：

```js
const NATIVE_SESSION_KEY = "humi:native-session:v1";

App({
  onLaunch() {
    const stored = wx.getStorageSync(NATIVE_SESSION_KEY);
    this.globalData.humiSession = stored?.accessToken && stored?.expiresAt > Date.now()
      ? stored
      : null;
    if (!this.globalData.humiSession) wx.removeStorageSync(NATIVE_SESSION_KEY);
  },
  setHumiSession(session) {
    this.globalData.humiSession = session;
    wx.setStorageSync(NATIVE_SESSION_KEY, session);
  },
  clearHumiSession() {
    this.globalData.humiSession = null;
    wx.removeStorageSync(NATIVE_SESSION_KEY);
  },
  globalData: { humiSession: null, humiIdentityUpdatedAt: 0 }
});
```

把现有 `App({...})` 配置合并进以上结构，不创建第二个 `App()`。

- [x] **Step 3: 创建身份页逻辑**

创建 `miniprogram/pages/identity/index.js`：

```js
const { getHumiApiBaseUrl } = require("../../utils/config");

Page({
  data: {
    displayName: "",
    avatarUrl: "",
    pending: false,
    error: ""
  },

  onLoad() {
    const user = getApp().globalData?.humiSession?.user;
    if (!user) {
      wx.reLaunch({ url: "/pages/index/index" });
      return;
    }
    this.setData({
      displayName: user.displayName === "微信用户" ? "" : user.displayName,
      avatarUrl: user.avatarUrl || ""
    });
  },

  chooseAvatar(event) {
    this.setData({ avatarUrl: event.detail?.avatarUrl || "", error: "" });
  },

  updateNickname(event) {
    this.setData({ displayName: String(event.detail?.value || "").trim(), error: "" });
  },

  submit() {
    if (this.data.pending) return;
    if (!this.data.displayName) {
      this.setData({ error: "请输入你的昵称。" });
      return;
    }
    this.setData({ pending: true, error: "" });
    this.saveIdentity()
      .then(() => {
        getApp().globalData.humiIdentityUpdatedAt = Date.now();
        wx.reLaunch({ url: "/pages/index/index?humiResume=1" });
      })
      .catch((error) => this.setData({ error: error.message || "身份暂时没有保存成功，请重试。" }))
      .finally(() => this.setData({ pending: false }));
  },

  async saveIdentity() {
    const app = getApp();
    const session = app.globalData?.humiSession;
    if (!session?.accessToken) throw new Error("登录状态已失效，请重新登录。");
    let user = session.user;
    if (this.data.avatarUrl && !/^https:\/\//.test(this.data.avatarUrl)) {
      const compressedPath = await compressAvatar(this.data.avatarUrl);
      const dataBase64 = await readBase64(compressedPath);
      const avatar = await apiRequest("/identity/avatar", session, {
        mimeType: detectAvatarMime(dataBase64),
        dataBase64
      });
      user = avatar.user;
    }
    const profile = await apiRequest("/identity/profile", session, { displayName: this.data.displayName }, "PUT");
    app.setHumiSession({ ...session, user: { ...user, ...profile.user } });
  }
});

function apiRequest(path, session, body, method = "POST") {
  return new Promise((resolve, reject) => wx.request({
    url: `${getHumiApiBaseUrl()}${path}`,
    method,
    data: body,
    header: { "content-type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    success: ({ statusCode, data }) => statusCode >= 200 && statusCode < 300
      ? resolve(data)
      : reject(new Error(data?.message || "请求失败，请重试。")),
    fail: () => reject(new Error("网络连接失败，请检查网络后重试。"))
  }));
}

function compressAvatar(src) {
  return new Promise((resolve, reject) => wx.compressImage({
    src,
    quality: 70,
    success: ({ tempFilePath }) => resolve(tempFilePath),
    fail: () => reject(new Error("头像处理失败，请重新选择。"))
  }));
}

function readBase64(path) {
  return new Promise((resolve, reject) => getFileSystemManager().readFile({
    filePath: path,
    encoding: "base64",
    success: ({ data }) => resolve(data),
    fail: () => reject(new Error("头像读取失败，请重新选择。"))
  }));
}

function detectAvatarMime(dataBase64) {
  if (String(dataBase64 || "").startsWith("iVBORw0KGgo")) return "image/png";
  if (String(dataBase64 || "").startsWith("/9j/")) return "image/jpeg";
  throw new Error("头像格式不受支持，请重新选择 JPG 或 PNG。");
}

function getFileSystemManager() {
  return wx.getFileSystemManager();
}
```

- [x] **Step 4: 创建身份页 WXML 与配置**

`miniprogram/pages/identity/index.json`：

```json
{
  "navigationBarTitleText": "你的 Humi 身份"
}
```

`miniprogram/pages/identity/index.wxml`：

```xml
<view class="identity-shell">
  <view class="brand-mark">Humi</view>
  <view class="identity-card">
    <view class="eyebrow">你的 Humi 身份</view>
    <view class="title">以后家人会这样看到你。</view>
    <button class="avatar-button" open-type="chooseAvatar" bindchooseavatar="chooseAvatar">
      <image wx:if="{{avatarUrl}}" class="avatar-image" src="{{avatarUrl}}" mode="aspectFill" />
      <view wx:else class="avatar-placeholder">选择头像</view>
    </button>
    <input
      class="nickname-input"
      type="nickname"
      value="{{displayName}}"
      placeholder="输入你的昵称"
      maxlength="32"
      bindinput="updateNickname"
    />
    <button class="primary-button" bindtap="submit" loading="{{pending}}" disabled="{{pending}}">
      进入 Humi
    </button>
    <view wx:if="{{error}}" class="error-text">{{error}}</view>
  </view>
</view>
```

- [x] **Step 5: 创建身份页样式**

`miniprogram/pages/identity/index.wxss` 使用现有 phone-bind 的白底、黑色主按钮和字体比例；头像必须为 `176rpx × 176rpx` 圆形，昵称输入最小高度 `96rpx`，主按钮最小高度 `104rpx`。加入以下核心样式：

```css
.identity-shell { min-height: 100vh; box-sizing: border-box; padding: 72rpx 44rpx; background: #fff; color: #111; }
.identity-card { padding: 72rpx 0; }
.avatar-button { width: 176rpx; height: 176rpx; margin: 48rpx 0 28rpx; padding: 0; overflow: hidden; border-radius: 999rpx; background: #f2f0ea; }
.avatar-image { width: 100%; height: 100%; }
.avatar-placeholder { display: grid; place-items: center; width: 100%; height: 100%; font-size: 24rpx; font-weight: 800; color: rgba(17,17,17,.48); }
.nickname-input { min-height: 96rpx; padding: 0 32rpx; border-radius: 28rpx; background: #f6f5f1; font-size: 30rpx; font-weight: 800; }
.primary-button { margin-top: 40rpx; min-height: 104rpx; border-radius: 999rpx; background: #111; color: #fff; font-size: 30rpx; font-weight: 900; }
.error-text { margin-top: 24rpx; color: #8a2f24; font-size: 24rpx; font-weight: 700; }
```

- [x] **Step 6: 运行身份页门禁并确认通过**

```bash
node scripts/check-identity-runtime.mjs
```

Expected: 进程 exit 0，暂时无 console 输出要求。

- [x] **Step 7: 提交 Task 3**

```bash
git add miniprogram/app.js miniprogram/app.json miniprogram/pages/identity scripts/check-identity-runtime.mjs
git commit -m "feat: add native Humi identity setup"
```

---

### Task 4: 小程序普通启动、主动登录与票据跳转

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `scripts/check-miniprogram-entrypoint-resilience.mjs`
- Modify: `scripts/check-identity-runtime.mjs`

**Interfaces:**
- Consumes: Task 2 的票据 API、Task 3 的原生身份页。
- Produces: 普通启动游客 URL、H5 主动登录处理、资料不完整跳身份页、资料完整用票据打开 H5。

- [x] **Step 1: 把入口测试改为“普通启动不登录”并确认失败**

将 `scripts/check-miniprogram-entrypoint-resilience.mjs` 第一组断言替换为：

```js
{
  let loginCalls = 0;
  const { page, changes } = createPage({
    login: () => { loginCalls += 1; }
  });
  page.onLoad({});
  assert.equal(loginCalls, 0, "normal startup must not call wx.login");
  assert.equal(changes.filter((patch) => patch.url).length, 1);
  assert.doesNotMatch(page.data.url, /humiSession=|humiTicket=/);
}
```

增加主动登录测试：

```js
{
  let loginCalls = 0;
  const { page } = createPage({
    login: ({ success }) => { loginCalls += 1; success({ code: "wechat-code" }); }
  });
  page.onLoad({});
  page.handleMessage({ detail: { data: [{ type: "humi:wechat-login" }] } });
  assert.equal(loginCalls, 1, "explicit H5 request should call wx.login once");
}
```

再增加两个恢复断言：有效 `profileStatus: "complete"` 原生 session 在普通启动时 `loginCalls === 0` 且只请求一次 `/auth/h5-ticket`；有效 `profileStatus: "incomplete"` session 在普通启动时 `loginCalls === 0` 且导航到 `/pages/identity/index`。测试 harness 的 `createPage()` 增加可注入的 `app.globalData.humiSession` 和 `request` mock，不依赖真实微信 API。

运行：

```bash
npm run validate:miniprogram-entry
```

Expected: FAIL，因为当前普通启动仍调用 `wx.login`。

- [x] **Step 2: 删除启动静默登录和 session URL 拼接**

`onLoad()` 的普通入口先读取 `getApp().globalData.humiSession`，但绝不调用 `wx.login`：资料完整且未过期的 session 可直接换取 H5 ticket；资料不完整的有效 session 直接进入身份页；没有有效 session 才打开游客 H5：

```js
const existingSession = getApp().globalData?.humiSession;
if (existingSession?.accessToken && existingSession.expiresAt > Date.now()) {
  this.setData({ currentSession: existingSession });
  if (existingSession.user?.profileStatus !== "complete") {
    wx.navigateTo({ url: "/pages/identity/index" });
  } else {
    this.openAuthenticatedH5(existingSession);
  }
  return;
}
this.finishInitialLoad();
```

删除 `_initialLoginTimer`、`initial` 登录分支和 `appendSessionToUrl()`。保留分享 token 的游客直达逻辑。

`finishInitialLoad()` 固定打开：

```js
finishInitialLoad() {
  if (this._initialLoadFinished) return;
  this._initialLoadFinished = true;
  this.openWebView(this.buildH5Url());
}
```

- [x] **Step 3: 登录成功后按资料状态分流**

`loginWithWechat()` 成功分支改为：

```js
const app = getApp();
app.setHumiSession(data);
this.setData({ currentSession: data });
if (data.user?.profileStatus !== "complete") {
  wx.navigateTo({ url: "/pages/identity/index" });
  return;
}
this.openAuthenticatedH5(data);
```

增加：

```js
openAuthenticatedH5(session) {
  wx.request({
    url: `${getHumiApiBaseUrl()}/auth/h5-ticket`,
    method: "POST",
    header: { Authorization: `Bearer ${session.accessToken}` },
    success: ({ statusCode, data }) => {
      if (statusCode < 200 || statusCode >= 300 || !data?.ticket) {
        this.setData({ loginError: "登录连接暂时没有准备好，请重试。" });
        return;
      }
      this.openWebView(appendQuery(this.buildH5Url(), { humiTicket: data.ticket }));
    },
    fail: () => this.setData({ loginError: "网络连接失败，请检查网络后重试。" })
  });
}
```

`handleMessage()` 收到 `humi:wechat-login` 时按以下顺序处理：没有原生有效 session 才调用 `loginWithWechat()`；已有 session 但 `profileStatus !== "complete"` 时进入 `/pages/identity/index`；只有资料完整的 session 才调用 `openAuthenticatedH5()`。这样缓存会话也不能绕过昵称确认。

收到 `humi:logout` 时调用 `getApp().clearHumiSession()`、清空 `currentSession` 并打开游客 H5，保证 H5 退出后下次启动不会被原生缓存重新恢复。

- [x] **Step 4: 处理身份页 reLaunch 返回**

`onLoad(options)` 在分享 token 分支之后、普通游客分支之前加入：

```js
const resumedSession = getApp().globalData?.humiSession;
if (options.humiResume === "1" && resumedSession?.accessToken && resumedSession.user?.profileStatus === "complete") {
  this.setData({ currentSession: resumedSession });
  this.openAuthenticatedH5(resumedSession);
  return;
}
```

- [x] **Step 5: 修正原生空白兜底文案**

`index.wxml` 无 URL 状态改为：

```xml
<view wx:else class="login-shell">
  <view class="brand-mark">Humi</view>
  <view class="login-card">
    <view class="eyebrow">准备中</view>
    <view class="title">今晚吃什么，马上就好。</view>
    <view class="body">页面暂时没有打开，可以重新进入 Humi。</view>
    <button class="primary-button" bindtap="retryWebView">进入 Humi</button>
    <view wx:if="{{loginError}}" class="error-text">{{loginError}}</view>
  </view>
</view>
```

删除 `.loading-dot` 和 `@keyframes humi-spin`，避免表现成后台正在静默登录。

- [x] **Step 6: 扩充静态门禁，禁止长期 session 进入 URL**

在 `scripts/check-identity-runtime.mjs` 增加：

```js
const indexSource = fs.readFileSync("miniprogram/pages/index/index.js", "utf8");
assert.doesNotMatch(indexSource, /appendSessionToUrl/);
assert.doesNotMatch(indexSource, /humiSession=/);
assert.match(indexSource, /humiTicket/);
assert.doesNotMatch(indexSource, /loginWithWechat\(\{\s*initial:\s*true/);
assert.match(indexSource, /clearHumiSession/);
```

- [x] **Step 7: 运行入口测试并确认通过**

```bash
npm run validate:miniprogram-entry
node scripts/check-identity-runtime.mjs
```

Expected: 两个命令 exit 0；入口测试输出 `Mini-program entrypoint resilience checks passed.`。

- [x] **Step 8: 提交 Task 4**

```bash
git add miniprogram/pages/index scripts/check-miniprogram-entrypoint-resilience.mjs scripts/check-identity-runtime.mjs
git commit -m "fix: require explicit WeChat login"
```

---

### Task 5: H5 票据交换与正确的资料状态

**Files:**
- Modify: `src/lib/humiApi.js`
- Modify: `src/lib/humiIdentity.js`
- Modify: `src/main.jsx`
- Modify: `src/components/AppShell.jsx`
- Modify: `src/components/AuthLanding.jsx`
- Modify: `scripts/check-h5-entrypoint-resilience.mjs`

**Interfaces:**
- Consumes: `POST /auth/h5/exchange`、`PublicUser`。
- Produces: URL 中只出现短期 `humiTicket`，交换后保存完整 session 并清除 URL 参数。

- [x] **Step 1: 增加失败的 H5 Playwright 票据测试**

在 `scripts/check-h5-entrypoint-resilience.mjs` 的 browser context 中增加：

```js
const ticketPage = await context.newPage();
await ticketPage.route("**/auth/h5/exchange", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      accessToken: "h5-session-token",
      refreshToken: "h5-session-token",
      expiresAt: Date.now() + 60_000,
      user: {
        id: "user-ticket",
        displayName: "小禾",
        provider: "wechat",
        profileStatus: "complete",
        avatarKey: "humi-avatar-family-f-01",
        avatarUrl: "",
        phoneVerified: false,
        phoneMasked: "",
        phoneVerifiedAt: null
      }
    })
  });
});
await ticketPage.route("**/state", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ state: null, family: null, households: [] })
  });
});
await ticketPage.goto(`${baseUrl}?channel=wechat-miniprogram&humiTicket=one-time-ticket`, { waitUntil: "networkidle" });
await ticketPage.waitForFunction(() => localStorage.getItem("humi:identity-session:v1")?.includes("user-ticket"));
assert.equal(new URL(ticketPage.url()).searchParams.has("humiTicket"), false);
```

运行：

```bash
npm run validate:h5-entry
```

Expected: FAIL，因为当前 H5 只支持 `humiSession` URL 参数。

- [x] **Step 2: 增加 H5 票据交换请求**

在 `src/lib/humiApi.js` 增加：

```js
export async function exchangeHumiTicket(ticket) {
  if (!ticket) throw new Error("登录链接不完整。");
  return humiPublicRequest("/auth/h5/exchange", {
    method: "POST",
    body: { ticket }
  });
}
```

- [x] **Step 3: 用 ticket URL reader 替换 session URL reader**

`src/lib/humiIdentity.js` 删除 `consumeHumiSessionFromUrl()`，增加：

```js
export function takeHumiTicketFromUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const ticket = url.searchParams.get("humiTicket") || "";
  if (ticket) {
    url.searchParams.delete("humiTicket");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return ticket;
}
```

扩充 `normalizeHumiSession()`：

```js
profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
avatarKey: user.avatarKey ?? "humi-avatar-family-m-01",
avatarUrl: user.avatarUrl ?? "",
```

- [x] **Step 4: 在 `main.jsx` 异步消费 ticket**

导入 `exchangeHumiTicket` 和 `takeHumiTicketFromUrl`，将旧同步 effect 替换为：

```js
useEffect(() => {
  const ticket = takeHumiTicketFromUrl();
  if (!ticket) return;
  let active = true;
  exchangeHumiTicket(ticket)
    .then((sessionValue) => {
      if (!active) return;
      const normalized = saveHumiSession(sessionValue);
      setHumiSession(normalized);
      setOnboardingComplete(true);
      setAuthStatus("已登录 Humi。");
      setAuthGateIntent("");
      showNotice(`欢迎回来，${normalized.user.displayName}`);
    })
    .catch((error) => {
      if (active) setAuthStatus(error.message || "登录链接已失效，请重新登录。");
    });
  return () => { active = false; };
}, [setOnboardingComplete]);
```

不得在票据交换成功时直接 `setProfileOnboardingComplete(true)`；资料完成状态来自服务端 `user.profileStatus`。本阶段保留原有饮食画像引导逻辑，但它不能再代表身份资料。

- [x] **Step 5: 删除由登录会话伪造的家庭，并正确接收 `family: null`**

删除 `createHumiSessionFamily()` 以及 Humi state effect 中的：

```js
setFamily(createHumiSessionFamily(humiSession));
```

`applyHumiStateEnvelope()` 必须无条件应用服务端的家庭合同，不能因为 `family` 是 `null` 而保留旧值：

```js
setFamily(data.family ?? null);
setHumiHouseholds(Array.isArray(data.households) ? data.households : []);
```

当 `family` 为 `null` 时，状态文案改为“创建或加入一个家后，可以和家人同步菜单与清单。”；本机菜单、推荐和清单继续可用，保存 effect 因 `householdId` 为空不得调用 `PUT /state`。

在 `scripts/check-h5-entrypoint-resilience.mjs` 增加 `import fs from "node:fs";` 和源码门禁：

```js
const mainSource = fs.readFileSync("src/main.jsx", "utf8");
assert.doesNotMatch(mainSource, /createHumiSessionFamily/);
```

- [x] **Step 6: 让 H5 头像使用服务端身份，而不是相同昵称种子**

在 `src/components/AppShell.jsx` 的 `AccountAvatar` 中，优先使用自定义 `avatarUrl`，其次按 `avatarKey` 找到稳定默认头像；旧会话无 key 时才用用户 ID 哈希兜底：

```jsx
const user = session?.user;
const fallbackSeed = user?.id || user?.email || user?.displayName || "guest";
const avatar = user?.avatarUrl
  ? { src: user.avatarUrl }
  : humiAvatarScenes.find((item) => item.id === user?.avatarKey)
    ?? humiAvatarScenes[stableHash(fallbackSeed) % humiAvatarScenes.length];
```

删除把 `displayName` 或固定 `wechat-mini-program` 作为微信用户主要头像种子的逻辑。在 H5 入口门禁中读取 `AppShell.jsx`，断言同时包含 `avatarUrl` 和 `avatarKey`。

- [x] **Step 7: 拦住旧版残留的不完整 H5 session，并同步退出原生缓存**

旧版本在已登录设备的 H5 localStorage 中会留下没有 `profileStatus` 的长期 session。`main.jsx` 对产品登录态使用：

```js
const identityComplete = humiSession?.user?.profileStatus === "complete";
const signedIn = Boolean(humiSession?.user && identityComplete);
```

存在 session 但身份不完整时，不显示“已登录”或默认用户名；在普通 onboarding 判断之前直接渲染 `<AuthLanding entryIntent="completeIdentity" />`。`AuthLanding` 对该 intent 使用“把昵称和头像补完整，家人才知道是你”的文案和“继续完善身份”主按钮；按钮通过现有 `humi:wechat-login` 消息让原生层重新验证并进入原生身份页。这个动作必须由用户点击触发，不得在 effect 中自动调用 `wx.login`。

在 `src/lib/humiIdentity.js` 增加：

```js
export function requestMiniProgramLogout() {
  if (typeof window === "undefined") return false;
  const miniProgram = window.wx?.miniProgram;
  if (!miniProgram?.postMessage) return false;
  miniProgram.postMessage({ data: { type: "humi:logout" } });
  return true;
}
```

`handleSignOut()` 清除 H5 session 后调用 `requestMiniProgramLogout()`。H5 入口测试预置一个 `profileStatus: "incomplete"` 的 legacy session，断言页面不出现“已登录 Humi”；静态门禁断言 `humi:logout` 同时存在于 H5 helper 和小程序 index handler。

- [x] **Step 8: 运行 H5 验证并确认通过**

```bash
npm run validate:h5-entry
npm run build
```

Expected: 两个命令 exit 0；H5 检查输出 JSON `"ok": true`，build 完成且无 unresolved import。

- [x] **Step 9: 提交 Task 5**

```bash
git add src/lib/humiApi.js src/lib/humiIdentity.js src/main.jsx src/components/AppShell.jsx src/components/AuthLanding.jsx scripts/check-h5-entrypoint-resilience.mjs
git commit -m "feat: exchange Humi sessions with one-time tickets"
```

---

### Task 6: 正式运行路径完全退出 Supabase

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/components/AuthLanding.jsx`
- Modify: `src/components/UserCenter.jsx`
- Modify: `src/lib/aiViaHumiApi.js`
- Modify: `src/lib/validationEvents.js`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `.env.example`
- Modify: `scripts/check-identity-runtime.mjs`

**Interfaces:**
- Consumes: Task 5 的 Humi session。
- Produces: 正式 H5 不 import 或初始化任何 Supabase 模块，不显示邮箱开发登录，不注入 Supabase 构建变量。

- [x] **Step 1: 先增加 Supabase Auth 退出门禁并确认失败**

在 `scripts/check-identity-runtime.mjs` 增加：

```js
const mainSource = fs.readFileSync("src/main.jsx", "utf8");
const authLandingSource = fs.readFileSync("src/components/AuthLanding.jsx", "utf8");
const userCenterSource = fs.readFileSync("src/components/UserCenter.jsx", "utf8");
const deployWorkflow = fs.readFileSync(".github/workflows/deploy-pages.yml", "utf8");
assert.doesNotMatch(mainSource, /getCurrentSession|subscribeToAuthChanges/);
assert.doesNotMatch(mainSource, /\.\/lib\/supabase\//);
assert.doesNotMatch(authLandingSource, /CloudAccount|devAuth/);
assert.doesNotMatch(userCenterSource, /CloudAccount|FamilyPreferencesPanel/);
assert.doesNotMatch(deployWorkflow, /VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/);
```

运行：

```bash
node scripts/check-identity-runtime.mjs
```

再运行正式入口 import 检查；不扫描明确保留到第 4 阶段的孤立 legacy 文件：

```bash
rg -n "supabase" src/main.jsx src/components/AuthLanding.jsx src/components/UserCenter.jsx src/lib/aiViaHumiApi.js src/lib/validationEvents.js
```

Expected: 两项检查均 FAIL；至少命中 `main.jsx` 的 Supabase import 或 workflow Supabase 变量。

- [x] **Step 2: 删除 `main.jsx` 全部 Supabase 运行路径**

在 `src/main.jsx`：

- 删除全部 `./lib/supabase/*` import，包括 Auth、家庭、成员偏好、菜单、清单、AI 和事件模块。
- 删除 `session` React state。
- 删除完整的 `bootCloud()` effect。
- `signedIn` 只在 `humiSession.user.profileStatus === "complete"` 时为 true。
- `displaySession` 只向产品 UI 暴露资料完整的 Humi user。
- 删除四组仅服务 Supabase 的菜单/清单 load-save effects；Humi API 的 `loadHumiStateEnvelope()` / `saveHumiState()` effects 保持唯一同步路径。
- 删除 `handlePasswordAuth()` 及所有邮箱 Auth handler props。
- `createFamily()` 改为只调用现有 `createHumiHousehold(humiSession, payload)`；无 Humi session 时提示微信登录。
- `handleSignOut()` 只撤销 Humi session，不调用 Supabase `signOut()`。
- 删除 Supabase 的 `loadPreferencesForFamily()`、`savePreference()`、`inviteMember()` 实现和邮箱邀请 state；家庭成员与邀请由第 2 阶段 Humi API 页面接管。
- 删除 `migrateLocalMenusToCloud()` / `migrateLocalGroceryToCloud()` 分支；现有按钮只调用 Humi API 保存，未登录或无家庭时保留本机数据并给出自然提示。

明确加入：

```js
const identityComplete = humiSession?.user?.profileStatus === "complete";
const signedIn = Boolean(humiSession?.user && identityComplete);
const displaySession = identityComplete ? { user: humiSession.user } : null;
```

把所有产品身份判断统一为 `humiSession?.user`。完成后：

```bash
rg -n '\bsession\?\.user|setSession\(|legacySupabaseSession|\.\/lib\/supabase\/' src/main.jsx
```

Expected: 无输出。

在 `src/components/UserCenter.jsx` 删除 `CloudAccount`、`FamilyPreferencesPanel` import 和渲染分支，同时删除 `preferenceProps` prop。账号设置只展示 `humiSession.user.displayName`、头像、手机号状态和退出按钮；无家庭时保留明确的“创建我的家”动作，不显示邮箱、Supabase 状态、云技术状态或不可用的成员偏好表单。`main.jsx` 同步删除 `authProps` 中的邮箱字段、`onPasswordAuth`，以及不再使用的 `preferenceProps`。

- [x] **Step 3: 把 AI 和产品事件切到自建后端/本地**

在 `src/lib/aiViaHumiApi.js` 删除“未开启时继续走 Supabase”的兼容说明和 feature flag；导出 `recommendMealsViaApi`、`explainRecommendationViaApi` 作为唯一远程实现。`main.jsx` 直接导入并分别命名为 `recommendMeals`、`explainRecommendation`；游客或无可用 session 时继续使用现有规则推荐，不发远程请求。

把 `appEvents` 常量移到 `src/lib/validationEvents.js` 并改名导出为 `productEvents`。`trackProductEvent()` 只调用 `trackValidationEvent()`，删除 `trackAppEvent()`；应用启动事件也写入本机 validation event。这样移除 Supabase 埋点不会丢失本机验收数据。

- [x] **Step 4: 删除普通用户可见的邮箱开发入口**

在 `src/components/AuthLanding.jsx` 删除 `CloudAccount` import、`showDevEmailAuth` 和对应条件分支。`AuthLanding` 始终渲染品牌场景与 `MobileAuthChoices`。

小程序内必须同时显示两个按钮：

```jsx
<button type="button" onClick={handleWechatLogin} className="...">
  <MessageCircle size={19} />
  微信登录
</button>
<button type="button" onClick={onContinueGuest} className="...">
  先体验 Humi
</button>
```

- [x] **Step 5: 停止正式构建注入 Supabase 变量**

从 `.github/workflows/deploy-pages.yml` 的 build env 删除：

```yaml
VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

从 `.env.example` 删除这两个变量。保留 Supabase GitHub Secrets 本身不影响构建；Secrets 的最终删除和 provider-side 撤销在第 4 阶段执行。

- [x] **Step 6: 运行身份门禁、import 检查、构建和 H5 启动测试**

```bash
node scripts/check-identity-runtime.mjs
if rg -l "supabase" src/main.jsx src/components/AuthLanding.jsx src/components/UserCenter.jsx src/lib/aiViaHumiApi.js src/lib/validationEvents.js; then exit 1; fi
npm run validate:h5-entry
npm run build
if rg -n "supabase\\.co|@supabase|VITE_SUPABASE" dist; then exit 1; fi
```

Expected: 五个门禁 exit 0；正式入口与产物中不存在 Supabase 运行代码，workflow 不再注入 Supabase 变量。

- [x] **Step 7: 提交 Task 6**

```bash
git add src/main.jsx src/components/AuthLanding.jsx src/components/UserCenter.jsx src/lib/aiViaHumiApi.js src/lib/validationEvents.js .github/workflows/deploy-pages.yml .env.example scripts/check-identity-runtime.mjs
git commit -m "refactor: retire Supabase runtime"
```

---

### Task 7: 文档、完整验证与阶段交付

**Files:**
- Modify: `docs/humi-api-contract.md`
- Modify: `docs/humi-api-production-deploy-runbook.md`
- Modify: `package.json`
- Test: 本计划列出的全部测试和安全门禁

**Interfaces:**
- Consumes: Tasks 1–6 的完整阶段交付。
- Produces: 可交给独立审阅者验收的 Phase 1 分支；不部署生产。

- [x] **Step 1: 更新 API 合同**

在 `docs/humi-api-contract.md` 明确写入：

```text
普通启动不调用微信登录。POST /auth/wechat/login 只由用户主动点击触发。
新用户返回 profileStatus=incomplete；完成 PUT /identity/profile 后变为 complete。
POST /auth/h5-ticket 返回 60 秒单次票据；POST /auth/h5/exchange 消费后返回 H5 session。
GET /me、GET /state、GET /households 在没有家庭时返回 family:null，不创建家庭。
```

补充头像格式、512 KiB 上限和公开头像 URL 不包含 OpenID、手机号或用户昵称。

- [x] **Step 2: 更新生产备份与回滚 runbook**

在 `docs/humi-api-production-deploy-runbook.md` 的数据备份加入：

```bash
sudo cp -a /var/lib/humi-api/data.json "/opt/humi/backups/$STAMP/data.json"
sudo test ! -d /var/lib/humi-api/avatars || sudo cp -a /var/lib/humi-api/avatars "/opt/humi/backups/$STAMP/avatars"
```

回滚时同时恢复 `data.json` 和 `avatars/`；不得只回滚代码而遗漏身份头像文件。

- [x] **Step 3: 确保 `validate:identity` 覆盖两个脚本**

`package.json` 应为：

```json
"validate:identity": "node scripts/check-identity-store.mjs && node scripts/check-identity-runtime.mjs"
```

- [x] **Step 4: 运行阶段测试矩阵**

按顺序运行：

```bash
npm run validate:identity
npm run validate:api
npm run validate:miniprogram-entry
npm run validate:h5-entry
npm run release:product:smoke
npm run release:collaboration:smoke
npm run build
if rg -n "supabase\\.co|@supabase|VITE_SUPABASE" dist; then exit 1; fi
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

Expected:

- 每个命令 exit 0。
- `validate:identity` 输出 `Identity store checks passed.`。
- `validate:miniprogram-entry` 输出 `Mini-program entrypoint resilience checks passed.`。
- `validate:h5-entry` 输出 JSON `"ok": true`。
- build 无 unresolved import。
- build 产物 Supabase 扫描无输出。
- secret scan 输出 `Secret scan passed.`。

- [x] **Step 5: 让 API smoke 直接断言数据副作用并单独复跑**

在 `scripts/smoke-humi-api.mjs` 启动 API 之前记录显式操作计数：

```js
const explicitWechatOpenIds = new Set();
let explicitHouseholdCreateCount = 0;
```

每次测试主动调用 `POST /auth/wechat/login` 时，把对应 mock OpenID 加入 `explicitWechatOpenIds`；每次测试显式调用 `POST /households` 后执行 `explicitHouseholdCreateCount += 1`。测试结束、关闭 API 进程前，直接读取该 smoke 已创建的 `dataFile`：

```js
const data = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(data.users.length, explicitWechatOpenIds.size);
assert.equal(data.households.length, explicitHouseholdCreateCount);
assert.equal(
  data.h5Tickets.filter((item) => !item.consumedAt && item.expiresAt > Date.now()).length,
  0,
  "smoke must not leave a live H5 ticket"
);
```

再单独复跑；smoke 会自行创建并清理独立临时目录：

```bash
npm run validate:api
```

Expected: 普通启动测试不增加 users；读取 `/me`、`/state`、`/households` 不增加 households。

- [x] **Step 6: 提交文档和最终测试门禁**

```bash
git add docs/humi-api-contract.md docs/humi-api-production-deploy-runbook.md package.json
git commit -m "docs: record Humi identity rollout contract"
```

- [x] **Step 7: 准备阶段验收说明**

验收说明必须包含：

```text
- 分支和基线 commit
- 每个 task 的 commit
- 修改文件列表
- 九条验证命令及真实输出摘要
- 生产数据未修改声明
- 未部署、未上传微信版本声明
- 回滚方式：恢复上一 API 代码与 data.json/avatars 备份
- 下一阶段前置条件：微信真机确认首次打开、游客进入、主动登录、头像昵称和老用户恢复
```

不得在真机证据缺失时声称 Phase 1 已可生产发布。

---

## Phase 1 Review Gate

进入第 2 阶段前，审阅者必须逐项确认：

- 全新用户打开小程序时 API 用户总数不变化。
- H5 登录落地页同时显示“微信登录”和“先体验 Humi”。
- 只有点击微信登录才调用 `wx.login`。
- 新用户完成一次昵称头像设置后不再重复出现身份页。
- 现有“微信用户”账号下次登录进入身份完善，但其家庭状态仍可读取。
- H5 地址栏和 history 中不出现 access token 或序列化 session。
- H5 票据过期、重复消费和伪造时均失败。
- `/me`、`/state`、`/households` 无家庭时不产生写入副作用。
- 正式入口和构建产物不含 Supabase 运行代码，也不注入 Supabase 构建变量。
- 所有自动化验证、secret scan 和微信真机证据通过。

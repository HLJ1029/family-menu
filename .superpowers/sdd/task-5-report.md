# Task 5 — Boot Routing、五个原生 Tab Skeleton 与 H5 回滚页

## Status

已在基线 `84359e52756b2a043027fbc56489424cf2c3cca7` 上完成 N1 dual-shell 路由层。普通启动由非 tab 的 boot 页处理；`nativeShellCandidate` 或服务端 `nativeShellEnabled` 关闭时进入 `pages/legacy/index`，不会创建空 WebView。五个 tab 仅提供共享 loading/cached/empty/error/ready skeleton，不包含 N2/N3 业务。

## RED / GREEN evidence

### RED

先新增 `scripts/check-native-shell-routing.mjs` 和 `validate:native-shell-routing` 后运行：

```sh
npm run validate:native-shell-routing && npm run validate:miniprogram-entry
```

首次实际输出：

```text
AssertionError [ERR_ASSERTION]: boot must be the non-tab entry page
actual: 'pages/index/index'
expected: 'pages/boot/index'
```

注册 boot 和 tab 后，补充每个 tab controller / shared page-state 的断言并再次运行，实际 RED：

```text
AssertionError [ERR_ASSERTION]: pages/tonight/index must have a native page controller
```

历史 `grocery` token 兼容覆盖也先写入路由合同；实现前实际 RED：

```text
actual: null
expected: '/pages/share/index?type=grocery&token=legacy-grocery-token&shareSource=grocery'
```

### GREEN

最终指定回归命令：

```sh
npm run validate:native-shell-routing && npm run validate:miniprogram-entry && npm run validate:share-bridge && npm run build
```

结果全部退出 `0`，关键输出：

```text
Native shell routing checks passed.
Mini-program entrypoint resilience checks passed.
Mini-program share runtime validation passed.
✓ built in 2.02s
```

`validate:miniprogram-entry` 仍会输出已有的 mocked `Humi web-view error { errMsg: 'domain blocked' }` 诊断后通过。`node scripts/check-miniprogram-share-cards.mjs` 也已通过，验证六类 token 新卡片到 `/pages/boot/index`，再由 boot 导入 native share landing。

## Changed files

- 新增 `miniprogram/pages/boot/*`、`miniprogram/utils/bootstrap.js`、五个 tab page、`miniprogram/components/page-state/*` 与 routing contract script。
- 原 `miniprogram/pages/index/index.*` WebView controller 移至 `miniprogram/pages/legacy/index.*`；原路径变为无 WebView、非 tab 的历史 share shim。
- 更新 `app.json`（boot、tabBar、subPackages、legacy 和 shim）、全局样式与 project description。
- 所有新的内部 H5 回退/返回路径指向 boot 或 legacy；更新 identity、poster、reminder、share relay、legacy share 输出和 share-routing 合同。
- 同步 entry/share contracts，及计划 Task 5 Step 3/5 与设计文档的启动/回滚说明。

## Migration and rollback compatibility

- 无 token 的普通启动或未知深链先走 bootstrap；package candidate 关闭或 server flag 关闭均 `reLaunch('/pages/legacy/index')`。tab 只用 `switchTab`，identity、legacy 和 share landing 使用 `reLaunch`。
- 已发历史 `/pages/index/index?...` 卡片由 shim 保留。`crave`、`grocery`/`groceryShare`、`menuShare`、`wishShare`、`invite`、`mealTask` 保留 token 与 `shareSource`，直接进入既有 `/pages/share/index`；这是不读取家庭状态的公共 share 例外，不进入五个 core tabs。
- 新分享路径指向 `/pages/boot/index`；boot 用同一 resolver 保持 token landing。未知旧 query 被原样编码后转发到 legacy H5 shell。

## Self-review

- boot 使用 Task 4 的 `loadBootstrap`、`appStore`、`startSpan`，未复制 request/session/telemetry；span 仅记录 allowlisted `page`、结果、时长和 error code，不带 token、URL 或自由文本。
- error UI 只显示 `重新连接` 和 `进入兼容版`，boot/shim 均无 WebView；未生成或注册任何 tab 图标/视觉资产。
- 未涉及 API、Supabase、生产部署、上传、广告或数据 schema；`git diff --check` 无输出。

## Follow-up / concerns

- 额外运行 `npm run validate:identity` 时，`scripts/check-identity-runtime.mjs:8` 仍静态期待 Task 4 前的 `getStorageSync(NATIVE_SESSION_KEY)`；当前 app 已正确使用 Task 4 的 `restoreSession()`。该预存基础设施断言不在 Task 5 指定回归内，未越界修改。
- `npm run build` 成功但仍给出现有 H5 单 chunk 大于 500 kB 的 Vite warning；本任务未改 H5 chunking。

## Review correction — routing hardening and package legality

### RED

以下合同均在对应最小修正前实际失败：

1. 递归 `app.json` registration 合同报出：

   ```text
   AssertionError [ERR_ASSERTION]: registered subpackage page packageCooking/pages/cooking/index must include index.js
   ```

   这锁定了六个 registered subpackage path 缺失合法页面文件。

2. 将一个 trim 后合法 token 与伪造 `shareSource` 写入合同后，实际输出：

   ```text
   actual: '/pages/share/index?type=crave&token=%20abcdefghijklmnopqrstuvwx%20&shareSource=ignored'
   expected: '/pages/share/index?type=crave&token=abcdefghijklmnopqrstuvwx&shareSource=crave'
   ```

   这证明旧 resolver 信任外部 source、未 trim token；同一合同还覆盖对象、空白、短/超长/非法 token 及多 token key。

3. 用户命名 last-household pointer 合同实际失败：

   ```text
   actual: ['humi:bootstrap:last-household:v1', { householdId: 'household-1', userId: 'user-1' }]
   expected: ['humi:bootstrap:last-household:v1:user-1', 'household-1']
   ```

   随后 user-a/user-b cache fixture 在旧 mock 行为下产生 `Missing expected rejection`，确认必须按当前 session user 的 key 隔离读取。

4. shared guard 合同在实现前因 `miniprogram/utils/native-shell-guard.js` 不存在而 `ENOENT`；合同覆盖五个 tab 的未知 store → boot、server/package disabled → legacy、enabled → 允许。

### GREEN

修正后 fresh validation：

```sh
npm run validate:native-shell-routing && npm run validate:miniprogram-entry && npm run validate:share-bridge && npm run validate:native-session && npm run validate:native-offline && npm run validate:native-bootstrap-api && npm run build
```

全部 exit `0`，输出包括：

```text
Native shell routing checks passed.
Mini-program entrypoint resilience checks passed.
Mini-program share runtime validation passed.
Native session foundation contract passed.
Native offline, cache, telemetry, and store foundation contract passed.
Native bootstrap API contract passed.
✓ built in 1.23s
```

随后运行精确 secret scan 与 diff gate：

```sh
/Users/honglijie/AI-HQ/scripts/secret-scan.sh && git diff --check
```

输出：

```text
Secret scan passed.
```

`git diff --check` 无输出、exit `0`。

### Corrective changes

- 每个 app root/subpackage registration 由 routing contract 递归验证四件套；六个 deferred subpackage path 现在仅为 shared page-state 的“功能将在后续阶段启用”合法占位。Task 9/10/12/15 的 plan 口径同步为 replace/implement placeholders。
- `native-shell-guard` 是五个 core tabs 的唯一直达守卫：无 bootstrap 回 boot；package/server disabled 回 legacy；identity 未完成仍遵循 startup route；完整且 enabled 的 envelope 才允许 tab 绘制。
- 公开 token 必须是 trim 后 `[A-Za-z0-9_-]{24,64}` 的单一字符串。type/shareSource 从 key 固定映射，忽略输入的 `shareSource`；多 token 或无效 token 均进入 safe legacy 路径。
- boot 与历史 shim 共享 `buildLegacyRoute`，仅保留允许的 `view`、固定 `shareSource` 与布尔 Humi compatibility flags；不转发 token、任意 query 或自由文本。
- cache fallback 只接受 `status: 0`、`retryable: true` 的 `network_error`/`request_timeout`；401/403/协议/服务端错误直接抛。last-household pointer 使用当前 user-id 命名 key，避免跨账号缓存读取。

### Revised scope note

tab 的 retry/error 仍只是 shared state-display shell 的占位，不代表 N1 已具备真实数据重试或 N2/N3 业务动作。

## Second review correction — retry continuity, cache scope, and share landing validation

### RED

1. Boot error fixture with `view=today`、`shareSource=today_menu` and all three Humi boolean flags failed after `retry()`:

   ```text
   actual: ['/pages/legacy/index']
   expected: ['/pages/legacy/index?view=today&shareSource=today_menu&humiLogout=1&humiExpired=1&humiResume=1']
   ```

2. Same-household two-user cache fixture failed because user-b overwrote user-a:

   ```text
   actual: { stateVersion: 'state-b', user: { id: 'user-b' } }
   expected: { stateVersion: 'state-a', user: { id: 'user-a' } }
   ```

3. Invalid direct `/pages/share/index` fixture failed with:

   ```text
   AssertionError: invalid direct share entries must never enable the native share menu
   true !== false
   ```

### Corrective changes

- Boot stores only `extractLegacyOptions(options)` on its first load. Retry and `进入兼容版` reuse that audited snapshot, retaining only safe `view`/enum `shareSource`/boolean Humi flags.
- Household cache utilities accept optional `userId` scope while one-argument callers retain their existing key format. Bootstrap writes and reads `userId + householdId` cache keys and rejects cached envelopes whose `user.id` does not equal the active session user.
- `validateShareLandingOptions` is shared by the boot resolver and share page. It accepts only one fixed landing type and a trimmed opaque 24–64 character token; invalid type/token/object/compound input hides the menu, leaves `canShare=false`, and returns no share payload.
- Plan compatibility wording now says unknown input retains only audited compatibility parameters, never arbitrary query values.

### GREEN

Fresh final command:

```sh
npm run validate:native-shell-routing && npm run validate:miniprogram-entry && npm run validate:share-bridge && npm run validate:native-offline && npm run validate:native-session && npm run validate:native-bootstrap-api && npm run build && /Users/honglijie/AI-HQ/scripts/secret-scan.sh && git diff --check
```

All commands exited `0`. Key output:

```text
Native shell routing checks passed.
Mini-program entrypoint resilience checks passed.
Mini-program share runtime validation passed.
Native offline, cache, telemetry, and store foundation contract passed.
Native session foundation contract passed.
Native bootstrap API contract passed.
✓ built in 1.25s
Secret scan passed.
```

`git diff --check` produced no output. The existing Vite large-H5-chunk warning remains informational and unchanged.

## Third review correction — strict share QA fixtures

### RED

`npm run release:wechat:share:selftest` initially failed after the strict direct-landing module was added because its VM fixture did not provide the page's new `../../utils/bootstrap` dependency:

```text
ReferenceError: require is not defined
at miniprogram/pages/share/index.js:1:41
```

The inspection also found five direct-preview dummy tokens shorter than the audited 24-character minimum, legacy `/pages/index/index?...` expected paths, and a workbench `type=menu` template that did not match the strict `today_menu` allowlist.

### Corrective changes

- Added one non-runtime QA fixture module for all five direct previews and five workbench card guides. Every token is 24–64 URL-safe characters; every guide now points to its canonical `/pages/boot/index?...` landing path.
- The workbench now renders `type=today_menu`, and its selftest/readiness checks consume the same fixture contract instead of maintaining a stale `menu` alias.
- The native-shell routing contract dynamically iterates both fixture groups, requires each type/token to pass `validateShareLandingOptions`, and confirms `buildShareData` emits the exact canonical boot path.
- Restored the share-card selftest VM's bootstrap-validator dependency; this only aligns QA execution with the existing strict page dependency and does not add a runtime alias.

### GREEN

Fresh final command:

```sh
npm run validate:native-shell-routing && npm run validate:share-bridge && npm run release:wechat:share:direct-previews -- --dry-run && npm run release:wechat:share:selftest && npm run release:candidate:dispatch:workbench:selftest && npm run release:candidate:check && npm run validate:miniprogram-entry && npm run build && /Users/honglijie/AI-HQ/scripts/secret-scan.sh && git diff --check
```

Actual key output: routing and share bridge passed; direct-preview dry-run returned `ok: true` and listed all five canonical boot paths; share selftest, workbench selftest, and candidate readiness passed; entrypoint resilience passed; build completed with the unchanged large-H5-chunk warning; secret scan passed; `git diff --check` had no output.

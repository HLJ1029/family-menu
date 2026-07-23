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

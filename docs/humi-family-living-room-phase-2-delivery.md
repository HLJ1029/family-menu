# Humi 家庭客厅 Phase 2 交付记录

更新日期：2026-07-19
执行设备：`codex@mbp-m5pro`
分支：`codex/humi-wechat-identity-startup`
验证基线：`e937cfa`

## 交付状态与范围

Phase 2 的本地候选实现及本次完整自动化矩阵均已通过。范围包括显式家庭生命周期、owner/member 权限边界、家庭客厅、成员管理、家庭设置、协作记录、账号设置，以及既有菜单/清单/偏好状态在家庭元数据更新后的保留。

这是一份本地候选交付记录，不是生产验收、微信真机验收或上线批准。新的独立交付审查仍是进入 Phase 3 前的必要门禁。

## 候选提交

| 范围 | 提交 | 说明 |
| --- | --- | --- |
| 家庭 Store 生命周期 | `21d4231` | owner-only 改名/移除/转让、退出与 active household 修复，以及生命周期回归脚本。 |
| 家庭 HTTP/H5 合同 | `3cd923b` | 管理路由、状态码、H5 client 与 API smoke。 |
| 家庭客厅与无家庭入口 | `322d680` | 创建/邀请入口、四区家庭客厅与首页去技术化。 |
| 协作 smoke 门禁恢复 | `cb70166` | 恢复 Phase 2 相关的本地协作 release checks。 |
| 四个家庭子页面 | `ab6c46d` | 成员、设置、记录、账号页面及其回调。 |
| 生命周期元数据保留修复 | `45b3322` | household-only envelope 刷新时保留菜单、餐次、偏好和协作状态。 |
| 生命周期修正记录 | `e937cfa` | Task 4 的修正证据记录。 |

## 完整本地验证矩阵

所有命令均在此 worktree 执行。两项浏览器 smoke 共用本地 Vite 服务 `npm run dev -- --port 4173`，目标均为 `http://127.0.0.1:4173/`；没有使用生产 URL。

| 精确命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run validate:household` | exit 0；`Household lifecycle checks passed.` | `scripts/check-household-lifecycle.mjs`；直接覆盖 member 越权改名、owner 不可移除、转让与 owner 退出限制。 |
| `npm run validate:identity` | exit 0；identity store/runtime checks passed | `scripts/check-identity-store.mjs`、`scripts/check-identity-runtime.mjs`。 |
| `npm run validate:api` | exit 0；`Humi API smoke test passed.` | `scripts/smoke-humi-api.mjs`；临时数据目录由脚本创建并在 finally 清理。 |
| `npm run validate:miniprogram-entry` | exit 0；`Mini-program entrypoint resilience checks passed.` | `scripts/check-miniprogram-entrypoint-resilience.mjs`；其模拟输出 `Humi web-view error { errMsg: 'domain blocked' }` 是韧性分支，不是失败。 |
| `npm run validate:h5-entry` | exit 0 | `scripts/check-h5-entrypoint-resilience.mjs`；该次未设置 `HUMI_H5_ENTRY_EVIDENCE_DIR`，因此没有持久截图目录。 |
| `npm run release:product:smoke -- --base-url http://127.0.0.1:4173/` | manifest `ok: true` | `/Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260719T145238Z/manifest.json`；移动截图同目录。 |
| `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/` | exit 0；manifest `ok: true` | `/tmp/humi-collaboration-smoke/manifest.json`；六张 guest landing 截图同目录。 |
| `npm run build` | exit 0；1747 modules transformed | Vite stdout；仅保留既有的 single chunk 超过 500 KiB 警告（`dist/assets/index-D3qy6TSp.js` 857.62 kB）。 |
| `git diff --check` | exit 0 | 当前 worktree diff；无空白错误。 |
| `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` | exit 0；`Secret scan passed.` | AI-HQ secret-scan stdout。 |

本地 Vite 服务在 smoke 结束后停止；它未承载生产流量。

## 权限、导航与状态保留核对

- API authorization：`api/server.js` 的四个家庭管理 handler 都以 `requireAuth` 得到操作者，随后把该 user ID 传入 Store；请求 body 不可指定 acting user。API smoke 断言成员改名得到 403、owner 移除自己得到 409，并验证 owner 移除其他成员、转让与原 owner 退出的返回 envelope。
- Last-owner invariant：`api/store.js` 在 owner 尚有其他正式成员时返回 `owner_must_transfer_or_disband`；`scripts/check-household-lifecycle.mjs` 直接断言该错误。产品 smoke 也验证设置页以“先转让主厨后再退出”阻止明知会失败的请求。
- No optimistic success：`src/main.jsx` 的 rename/remove/transfer/leave 均先 await H5 API，再用响应 envelope 调用 `applyHumiStateEnvelope`，成功提示位于该调用之后；失败只显示错误提示。
- Four child pages and navigation：产品 smoke manifest 证明 `household-members-page`、`household-settings-page`、`family-activity-page`、`humi-account-page` 均可从客厅进入、都能返回客厅，并保留五个主导航 tab。
- Role boundary：同一 manifest 验证 owner controls 可见，成员没有邀请、移除、转让、家庭想吃邀请、菜单编辑或发起征集能力；成员可进行只读家庭查看与想吃贡献。
- Living-room content：`FamilyLivingRoom.jsx` 只组织当前家庭、家庭操作、正在一起做、家庭偏好。产品 smoke 的 `family-living-room-removes-cloud-ai-nutrition-and-export-clutter=true` 证明首页没有云同步、AI、营养、验证导出等技术内容。
- Metadata lifecycle preservation：rename/remove/transfer 的 API envelope 只刷新 `family`/`households`。`applyHumiStateEnvelope(..., { preserveStateWhenMissing: true })` 保留当前菜单、meal plan、偏好、协作与非正式参与者；产品 smoke 以 `household-lifecycle-metadata-preserves-current-state=true` 和 `household-lifecycle-remove-and-transfer-refresh-members=true` 验证，并确认正式成员、owner role 与头像元数据随返回值刷新。

## 明确延期的真机/外部验证

以下事项没有执行，也不得由本地 smoke 推断为已通过：

- 真机冷启动验证：首次打开不调用 `wx.login`、游客体验不创建真实账号或家庭、点击登录后才发生真实微信授权。
- 真机身份与 WebView 验证：昵称/头像选择、一次性 H5 ticket 交换、地址栏清理、旧用户恢复以及会话失效后的真实微信行为。
- 两个真实微信测试账号的主厨/成员家庭操作：创建/接受邀请、改名、移除、转让、最后 owner 退出、页面返回和状态连续性。
- 微信原生分享、下载、相册、审核、上传体验版、发布与任何生产监控。
- 生产数据迁移、备份/apply/rollback、Supabase 最终物理清退。

这些检查属于后续 Phase 4 真机/生产门禁，或需明确外部授权后才能执行。

## 无生产操作确认

本任务没有执行生产 API 写入、生产部署、生产 URL smoke、微信登录、微信真机操作、微信上传/审核/发布、外部 provider 修改或数据迁移。API 验证使用自己的临时数据目录；浏览器 smoke 使用本机 Vite 和脚本内 mock/intercept 数据。

## Phase 3 入口门禁

可提交给新的独立交付审查：Phase 2 本地矩阵、定向权限/导航核对与 secret scan 证据齐全。未通过该审查前，Phase 3 不应开始；无真机证据时更不得将 Phase 1 或 Phase 2 标为生产就绪或执行部署。

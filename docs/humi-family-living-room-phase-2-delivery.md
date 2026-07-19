# Humi 家庭客厅 Phase 2 交付记录

更新日期：2026-07-20
执行设备：`codex@mbp-m5pro`
分支：`codex/humi-wechat-identity-startup`
候选实现提交：Task 8 候选（基线 `46bd5fe`，提交主题 `fix: restore Humi Wish planning workflow`）
验证说明：完整矩阵针对最终 Task 8 候选代码执行；产品、协作落地与 H5 证据均写入 2026-07-20 的私有持久目录。Task 8 提交后由独立审查者使用实际 HEAD 校验提交范围。

## 交付状态与范围

Phase 2 的本地候选实现及 2026-07-20 末次完整自动化矩阵均已通过。范围包括显式家庭生命周期、owner/member 权限边界、家庭客厅、成员管理、家庭设置、协作记录、账号设置、真实 Wish 回复收取与今晚安排，以及既有菜单、餐次记录、偏好和协作状态在家庭元数据更新后的保留。

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
| 协作与成员关系隔离 | `23332ea` | 通用协作认领只绑定参与身份，不创建正式家庭成员。 |
| 最终产品与证据修正 | `b0dc6af` | 家庭角色/头像/人数、偏好入口、三层建家名称校验、家庭身份路由复位、深度状态保留、活动隐私和持久 smoke 证据。 |
| Wish 安排与偏好摘要修正 | Task 8 候选 | 恢复真实 API Wish 请求/回复 → 客厅刷新 → `今晚做` 闭环，并让偏好一句话始终覆盖家庭人数、主要口味和忌口。 |

## 完整本地验证矩阵

所有命令均在此 worktree 执行。两项浏览器 smoke 共用本地 Vite 服务，目标均为 `http://127.0.0.1:4176/`；没有使用生产 URL。服务已在矩阵结束后停止。

| 精确命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run validate:household` | exit 0；`Household lifecycle checks passed.` | `scripts/check-household-lifecycle.mjs`；直接覆盖 member 越权改名、owner 不可移除、转让与 owner 退出限制。 |
| `npm run validate:identity` | exit 0；identity store/runtime checks passed | `scripts/check-identity-store.mjs`、`scripts/check-identity-runtime.mjs`。 |
| `npm run validate:api` | exit 0；`Humi API smoke test passed.` | `scripts/smoke-humi-api.mjs`；临时数据目录由脚本创建并在 finally 清理。 |
| `npm run validate:miniprogram-entry` | exit 0；`Mini-program entrypoint resilience checks passed.` | `scripts/check-miniprogram-entrypoint-resilience.mjs`；其模拟输出 `Humi web-view error { errMsg: 'domain blocked' }` 是韧性分支，不是失败。 |
| `HUMI_H5_ENTRY_EVIDENCE_DIR=/Users/honglijie/.humi-release-evidence/task8-final-h5-entry-20260720T005132+0800 npm run validate:h5-entry` | exit 0；11 项 H5 韧性检查通过 | 两张截图位于指定持久目录；退出失败用例从真实家庭客厅进入账号设置执行。 |
| `npm run release:product:review` | exit 0；`ok: true`，39 项静态产品锚点全部通过 | 新增 Wish props/动作和三维偏好摘要门禁。 |
| `npm run release:product:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task8-final-product-smoke-20260720T005132+0800` | exit 0；manifest `ok: true`，无失败检查 | `/Users/honglijie/.humi-release-evidence/task8-final-product-smoke-20260720T005132+0800/manifest.json`；含 Wish 刷新/安排和精确偏好摘要检查。 |
| `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4176/ --evidence-dir /Users/honglijie/.humi-release-evidence/task8-final-collaboration-smoke-20260720T005132+0800` | exit 0；manifest `ok: true`，无 page errors | `/Users/honglijie/.humi-release-evidence/task8-final-collaboration-smoke-20260720T005132+0800/manifest.json`；六张 guest landing 截图同目录。 |
| `node scripts/smoke-collaboration-flow.mjs` | exit 0；`Humi collaboration and library meal flow smoke passed.` | 真实本地 API 创建 Wish 请求和两条游客回复；认证主厨从客厅刷新，匹配菜进入今晚菜单并离开 Wish pool，未匹配菜保留并打开既有菜品选择路径；其余 mega-smoke runner 调用继续执行。 |
| `npm run build` | exit 0；1747 modules transformed | Vite stdout；仅保留既有的 single chunk 超过 500 KiB 警告（`dist/assets/index-pZ2LSj3w.js` 859.44 kB）。 |
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
- Living-room identity and route：当前家庭卡直接显示 `主厨`/`家人`、正式成员头像或首字 fallback 及人数；偏好摘要可点击进入设置。内部路由由 `family.id` 约束，产品 smoke 的 route observer 只记录 `start → home`，没有旧家庭 `settings` 瞬时绘制。
- Wish planning workflow：`UserCenter` 不再丢弃 `wishPool`、`onRefreshWishShare` 和 `onPlanWish`。有进行中 Wish 请求时，主厨可从客厅调用既有 API refresh；真实游客回复进入实际 Wish pool。匹配菜逐项 `今晚做` 后进入今晚菜单并离开 pool，未匹配菜仍保留并进入既有菜品选择路径。通用 Wish 参与不会因此成为正式家庭成员。
- Preference summary truth：摘要优先使用当前家庭正式成员数，缺失时才回退到 `familyProfile.familySize`；主要口味来自 `tastePreferences`，忌口合并 `dislikes` 与 `allergies`。产品夹具精确断言 `2 位家人 · 主要口味：家常、清淡 · 忌口：香菜、花生`，空维度使用 `待补充`/`暂无`。
- Household-name truth：建家草稿默认 `我们家`；空白输入在前端不发请求并保留原值，Store 抛出 `household_name_required`，HTTP 返回 400。API smoke 还证明失败后家庭列表仍为空。
- Metadata lifecycle preservation：rename/remove/transfer 的 API envelope 只刷新 `family`/`households`。`applyHumiStateEnvelope(..., { preserveStateWhenMissing: true })` 保留当前菜单、meal plan、meal logs、偏好、Crave signals、active Crave/grocery/Wish 与非正式参与者；产品 smoke 在每个生命周期操作后分别断言这些状态未丢失，并确认正式成员、owner role 与头像元数据随返回值刷新。
- Activity privacy：协作记录只显示自然语言活动。产品 smoke 注入不可渲染的 token、owner secret、participant key 和 household ID 哨兵值，并断言 DOM 同时不含值与内部字段名。
- Participation boundary：legacy mega-smoke 证明游客参与登录后 active API vote 变为 `temporary:false` 并保留 `claimedAt`，pending context 清除，但正式家庭成员数量不增加；云端历史信号保留且不携带 participant key。

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

Task 7 曾错误地把保留 runner 名称与 API/activity 可见性描述为等价的 Wish 端到端覆盖；最终 broad review 因此正确返回 NO-GO。Task 8 已用真实 API 请求/回复和可点击客厅路径恢复该回归，并补齐偏好摘要。上述本地矩阵仍不等同于审查者给出 GO：未获得新的独立 GO 前，Phase 3 不应开始；无真机证据时更不得将 Phase 1 或 Phase 2 标为生产就绪或执行部署。

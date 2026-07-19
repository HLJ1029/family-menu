# Humi 身份、家庭、协作与迁移最终本地审计

日期：2026-07-20  
实现候选：`f81d276`
结论：**本地候选 GO；生产 rollout 尚未完成。**

## 审计边界

本审计覆盖 Phase 1–4 的本地代码、fixture、API/浏览器 smoke、构建、源码/依赖/配置扫描、迁移工具与操作文档。它不包含真实微信账号/真机、生产备份或迁移、部署、微信上传/提审/发布，以及外部 Supabase provider 数据或 Secrets 删除。

状态只使用：

- `proved`：有与标准同等范围的本地运行时或静态证据。
- `contradicted`：证据直接否定标准。
- `missing`：本地范围内应有但没有证据。
- `external gate`：必须在另行授权的真机、生产或 provider 环境验证。

本次没有 `contradicted` 或 `missing` 项。外部门禁不能被本地 green test 改写为 `proved`。

## 本地矩阵

从干净工作树运行并通过：

- `validate:household`
- `validate:collaboration-identity`
- `validate:migration`
- `validate:identity`
- `validate:api`
- `validate:miniprogram-entry`
- `validate:h5-entry`（11 项）
- `validate:true-device-evidence -- --selftest`
- `validate:supabase-retirement`（对抗自测 + 仓库检查）
- `build`（1748 modules；仅保留既有 500 kB chunk 非阻断警告）
- `git diff --check`
- AI-HQ `secret-scan.sh`

本地浏览器证据：

- Product smoke：125/125，20 个截图，`/Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260719T233545Z/manifest.json`
- Collaboration smoke：20/20，6 个截图，`/Users/honglijie/.humi-release-evidence/collaboration-landings-smoke-20260719T233634Z/manifest.json`
- 本地 4173 预览服务已停止。

首次最终 gate review 发现证据 symlink/metadata 检查和 provider scan 覆盖不足，结论为 NO-GO（P1×2、P2×1）。`f81d276` 已用永久 RED/GREEN 回归关闭全部 finding；修复记录见 `.superpowers/sdd/phase4-final-gate-fixes-report.md`。最终状态仍以其后的独立 re-review 为准。

## 12.1 首次进入

| 标准 | 状态 | 证据与限制 |
| --- | --- | --- |
| 全新安装首次打开不调用登录接口，不创建用户，不创建家庭 | external gate | miniprogram entry、landing/API smoke 已证明本地候选无自动登录/建号/建家；“全新安装 + 微信原生请求时序 + 生产计数前后不变”仍需真机和生产只读聚合证据。 |
| 用户看到微信登录和游客体验两个明确入口 | proved | miniprogram entry 与产品身份入口 smoke。 |
| 游客可以完成推荐、确认菜单和生成清单 | proved | Product smoke 的今晚决定、菜单、计划与清单链路。 |

## 12.2 登录与身份

| 标准 | 状态 | 证据与限制 |
| --- | --- | --- |
| 只有点击微信登录才产生微信登录请求 | external gate | 本地入口状态机已通过；实际 `wx.login` 点击前后网络时序需真机证据。 |
| 新登录用户必须确认昵称，头像可选微信头像或 Humi 默认头像 | proved | identity Store/API、miniprogram entry 与 profile onboarding smoke。 |
| 完成资料后，头像昵称在顶部、我的家和协作记录中一致显示 | proved | identity projection、家庭成员同步、product/collaboration smoke。 |
| 老用户会话有效时不重复登录；资料不完整时只补一次资料 | external gate | H5 session/legacy incomplete 本地测试已通过；旧微信账号真实恢复与仅一次补全需真机测试账号验证。 |

## 12.3 家庭

| 标准 | 状态 | 证据与限制 |
| --- | --- | --- |
| 登录本身不创建家庭 | proved | identity/household Store 和 API smoke；读取无副作用。 |
| 无家庭用户只看到“创建或加入家庭” | proved | Product smoke `signed-in-no-household-*`。 |
| 创建成功后展示家庭名称、角色、成员和邀请入口 | proved | Family living room 与 household lifecycle smoke。 |
| 草稿默认“我们家”；空白名称三层拒绝并保留输入 | proved | Product smoke 与 Store/API 合同。 |
| 四个管理入口均为独立可导航页面 | proved | Product smoke 覆盖成员管理、家庭设置、协作记录、账号设置。 |
| 当前家庭身份变化时子页面回到客厅，无旧页瞬时绘制 | proved | `family-identity-route-reset-mobile` 运行时证据。 |
| 家庭首页没有技术术语、算法状态或测试信息 | proved | Product smoke 的 living-room clutter 断言与截图。 |
| 改名、移除、转让只改元数据，不丢协作/三餐状态 | proved | household lifecycle 的跨家庭状态/权限不变量与 product smoke。 |

## 12.4 协作

| 标准 | 状态 | 证据与限制 |
| --- | --- | --- |
| 登录用户自动显示 Humi 昵称和头像 | proved | signed-in collaboration smoke 与身份快照。 |
| 游客零填表参与并获得请求范围别名 | proved | crave/grocery/wish guest landing smoke。 |
| 同一游客动作重试不重复 | proved | API 幂等、并发重试与 merge isolation 测试。 |
| 游客登录后安全合并 | proved | merge ownership、action binding、并发事务和 rollback recovery 测试。 |
| 主厨看懂谁做了什么与最终结果 | proved | 家庭协作历史 UI、product smoke 和 collaboration event 投影。 |
| 不渲染 token/secret/key/household ID/内部字段 | proved | public projection、browser collision matrix 与 UI smoke。 |
| 通用认领不建正式成员；家庭邀请才正式加入 | proved | API/Store 合同、landing 文案与 household lifecycle。 |

## 12.5 后端与迁移

| 标准 | 状态 | 证据与限制 |
| --- | --- | --- |
| 正式 H5 构建不含 Supabase URL、Anon Key 或 Auth 初始化 | proved | 依赖已移除、`src/lib/supabase/` 与 CloudAccount 已删除；源码、配置、lockfile 和 dist gate 通过。 |
| 迁移前后用户、身份、家庭和家庭状态数量一致 | external gate | fixture 已证明 audit/dry-run/apply/幂等/隐私/不变量；生产 18/18/7/6 加合法增量尚未在获批备份上执行。 |
| 当前 6 个家庭云端状态可在新版本读取 | external gate | 本地 household state 保留与读取测试通过；生产 6 个状态需获批备份/staging API 核对。 |
| 生产备份、回滚步骤和 secret scan 均通过 | external gate | secret scan 已通过，runbook 已完成；生产 backup/apply/rollback 演练未授权。 |

## Supabase 结论

仓库候选已经放弃 Supabase runtime：正式源码、依赖、配置与构建均无 provider 初始化或 URL。历史 schema/方案移到 `docs/archive/supabase/`。这不代表外部 Supabase 项目已经删除；外部数据与 Secrets 仍保持未操作状态。

## 剩余四项独立授权

继续 rollout 前必须分别取得，不得合并推定：

1. **微信真机测试授权**：允许使用专用测试账号/设备执行 16 场景并采集脱敏证据。
2. **生产维护窗口与 backup/apply 授权**：允许暂停写入、备份代码/data/avatars、在备份上 audit/dry-run、对新副本 apply，并在明确的第二次批准后原子替换。
3. **H5/API 部署与小程序上传授权**：允许部署候选、上传体验版；提审和发布仍按发布门禁记录。
4. **外部 Supabase provider 数据/Secrets 删除授权**：仅在备份可恢复、迁移稳定并复核外部资产清单后执行。

在以上证据完成前，对外状态必须表述为“本地候选 GO，生产 rollout 待授权”，不得表述为“已上线”“生产迁移完成”或“Supabase 已物理删除”。

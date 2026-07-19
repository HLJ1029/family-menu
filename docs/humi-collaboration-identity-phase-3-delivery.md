# Humi 协作身份与历史 Phase 3 交付记录

更新日期：2026-07-20
执行设备：`codex@mbp-m5pro`
分支：`codex/humi-wechat-identity-startup`
Task 6 起始提交：`184d2d2ae551e7a7bd801c719e0e5424bb13db17`（`docs: close Humi collaboration history`）
当前本地候选：`51e0244ca8113947ce5e7d87dbcfa61442c46f25`（`test: avoid bearer fixture secret scan false positives`）

本记录覆盖 Phase 3 Task 6 的本地候选验证。Tasks 1–5 的功能实现已在本记录之前提交；`51e0244` 仅将测试中的长 Bearer 哨兵改为短哨兵，避免被团队 secret scan 的通用规则误判，未改变产品运行行为或测试断言语义。此后本记录和主规格进度更新会作为独立 documentation commit 提交；Task 6 report 会再以独立提交固定该 documentation commit。

## 状态与范围

Phase 3 本地候选实现及完整自动化矩阵已经通过。本候选交付：

- append/update-safe 的规范协作事件，含请求内游客别名、动作幂等及保留原始时间的登录合并；
- 可信身份边界：正式用户只由有效服务端会话决定，游客只在首次提交时得到请求范围 ID；
- 无姓名/关系表单的三类公开落地页，以及协作类型与 token 均隔离的本地游客 key；
- 精确 action binding 的游客→用户合并，跨请求、已被他人认领和不存在 ID 均拒绝，且不建立家庭成员关系；
- 严格公开投影，拒绝 token、owner secret、内部 participant/member/claim/merge 字段；
- 经认证、正式家庭成员可读的家庭协作历史 API 与自然语言 UI；错误时仅以“当前设备记录”作为明确标识的本地 fallback。

这不是生产验收、微信真机验收或上线批准。Task 6 candidate 仍等待新的独立 Phase 3 broad review；父任务 owner 将在该审查后追加/关闭最终 Phase 3 GO。本记录不授予任何外部操作权限。

## 实现提交与审查修正

| 范围 | 提交 | 说明 |
| --- | --- | --- |
| Task 1：规范事件模型 | `5537dcd3` | 创建 canonical collaboration event、历史查询与合并基础。 |
| Task 1 审查修正 | `1b5f8f2a` | 合并后游客重试仍解析同一事件 ID，保留 `createdAt` 与正式身份快照。 |
| Task 2：动作记录 | `21e7dbe` | Crave、Grocery、Wish 从可信参与者写入规范事件。 |
| Task 3：自动协作身份 | `8b22cb1` | 请求范围 guest storage、零身份表单、登录态提交。 |
| Task 4：安全合并 | `109dc7b` | 精确 guest claim、幂等 repeat、无成员资格副作用。 |
| Task 4 审查修正 | `cdd4ffe` | 严格公开投影和 type/token/actionId 三元精确浏览器绑定。 |
| Task 5：家庭历史 | `8b5bde8` | 鉴权历史 endpoint、allowlisted projection、可读 UI 与 error fallback。 |
| Task 6 测试门禁修正 | `51e0244` | 仅缩短无效 Bearer fixture；修正全量 secret scan 的既有误报。 |

## 最终完整本地矩阵

所有命令在 `51e0244` 上运行。浏览器 smoke 只访问新启动的 `http://127.0.0.1:4191/`，未访问生产 URL；私有证据根目录为 `/Users/honglijie/.humi-release-evidence/phase3-task6-delivery-20260720T051629+0800`。

| 精确命令 | 结果与检查数 | 证据/说明 |
| --- | --- | --- |
| `npm run validate:household` | exit 0 | `Household lifecycle checks passed.` |
| `npm run validate:collaboration-identity` | exit 0 | `Collaboration identity checks passed.`；覆盖别名、幂等、合并、授权和 payload allowlist。 |
| `npm run validate:identity` | exit 0 | Store 与 runtime identity checks 均通过。 |
| `npm run validate:api` | exit 0 | 真实本地 API smoke；覆盖三种动作、伪造正式身份、失效 token、合并滥用、非成员历史读取和公开投影。 |
| `npm run validate:miniprogram-entry` | exit 0 | 韧性检查通过；`Humi web-view error { errMsg: 'domain blocked' }` 是预期模拟诊断，不是失败。 |
| `npm run validate:miniprogram-poster` | exit 0 | `ok:true`；download 3、share 2、save 2、toast 1、modal 1、openSetting 1。 |
| `npm run validate:h5-entry` | exit 0 | `ok:true`；11 项 H5 韧性检查通过。 |
| `npm run release:product:review` | exit 0 | `ok:true`；49 个静态产品 anchors 全部通过。 |
| `node scripts/smoke-collaboration-flow.mjs` | exit 0 | legacy mega-smoke 通过，保留协作/家庭全链路回归。 |
| `npm run release:product:smoke -- --base-url http://127.0.0.1:4191/ --evidence-dir …/product-smoke` | exit 0 | manifest `ok:true`；125 checks、20 张截图；SHA-256 `997cc373915dc878cdc0de3b42ea94b59de3268c3458eb932acab1f760ff68ec`。 |
| `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4191/ --evidence-dir …/collaboration-smoke` | exit 0 | manifest `ok:true`；20 checks、6 张截图；SHA-256 `16103de14b558f98e853ce872d8911e468efa1f35be719a7b7e1917823d4c1c7`。 |
| `npm run build` | exit 0 | 1748 modules transformed；既有非阻断 warning：`dist/assets/index-BPRQZZFu.js` 865.45 kB（gzip 197.12 kB），未视为失败。 |
| `git diff --check` | exit 0 | 无空白错误。 |
| `HUMI_REPO=/Users/honglijie/agent-worktrees/humi/humi-wechat-identity-startup /Users/honglijie/AI-HQ/scripts/secret-scan.sh` | exit 0 | `Secret scan passed.`；不打印或记录 secret 值。 |

两份 manifest 位于上述证据根目录下的 `product-smoke/manifest.json` 与 `collaboration-smoke/manifest.json`。根目录及两个子目录均为 `0700`；两个 manifest 均为 `0600`；检查确认全部 26 个 PNG 截图存在，且 manifest 引用无缺失。Vite PID `12956` 在 smoke 后已停止，`lsof -nP -iTCP:4191 -sTCP:LISTEN` 无输出，端口无 listener。最终运行前后工作树未出现未提交的构建输出；文档写入前 `git diff --check` 与状态均干净。

## 信任、隐私与回归边界

- 正式身份 spoof：公开 body 中的 user ID、昵称、头像和 guest 字段不可信；有效 Bearer 只由服务端 session 决定。API 真实回归断言伪造字段不会进入事件快照。
- 游客范围与 open-only：GET/渲染不生成 guest key 或事件；首次提交才产生 ID。协作类型与 token 改变即获得不同 ID，不跨请求追踪。
- 幂等与 stale/abuse：同一 request/participant/action 重试更新同一业务动作与同一 canonical event；cross-request/cross-type、未知 guest、其他用户已认领均为无写入的 typed rejection；同一正式用户 repeat 返回原 ID 和时间。
- 无成员资格副作用：通用 collaboration `/join` 只关联参与身份；家庭成员资格仍只能由明确的家庭邀请接受 endpoint 建立。浏览器与 API 回归均检查零 household mutation。
- 公开与历史隐私：公开路由、动作响应和 join response 使用 allowlisted projection；历史 API 需要未撤销 bearer 与正式成员资格，外部人和未知家庭均 masked 404。回归递归拒绝 token、owner secret、内部 identity、claim/merge metadata 与家庭状态 envelope。
- UI fallback：家庭协作记录优先使用服务端历史；只有网络错误时才显示明确标识的 `当前设备记录`，并提供原地重试。stale/unmount、cloud empty、error/retry、自然语言行、头像 fallback 与 DOM privacy 都由产品 smoke 覆盖。

## secret scan 纠正记录

初次 Task 6 全量矩阵的精确 secret scan 返回 exit 1，但安全定位显示仅有 5 个既有、已跟踪的测试 fixture 匹配通用 `Bearer <20+ chars>` 规则：API smoke 的四个明确无效 bearer 以及协作 landing smoke 的登录态预期。它们不是真实凭据，但使此前 Phase 3 reports 中“secret scan passed”的表述不能代表当前扫描器的最终全量结果。

经本任务明确授权，`51e0244` 把四个无效 bearer 改为短 `bad` 哨兵，并把协作 landing mock session 改为短 `smoke` 哨兵，同时使 Authorization 预期从同一 session 构造。`validate:api` 与新的本地 collaboration smoke 均通过，证明仍精确覆盖 `401 invalid_token`、零写入和带 Authorization 的登录态身份提交；随后精确 secret scan 通过。没有添加 ignore、例外或扫描器规则，也没有修改产品运行逻辑。

## 生产审计事实与尚未授权事项

此前只读生产审计的聚合事实仍为：18 个用户记录、18 个微信身份、7 个家庭、6 个家庭状态；18 个遗留用户 profile 都是不完整/通用资料。本地候选没有改变生产数据，也不应从本地 smoke 推断生产状态。

仍需单独授权和验收的门禁包括：真实设备上的微信登录、昵称/头像、WebView ticket 与游客流程；生产部署和任何生产读写；迁移 backup/dry-run/apply/rollback；provider 操作；Supabase 物理清退；以及最终生产用户/身份/家庭/家庭状态数量核对。即使之后给出 local GO，它也只会打开 Phase 4 的本地准备工作，不授权任何外部动作。

# Humi 微信真机验收证据包

状态：待外部授权执行，当前 `0/56`。本文件和检查器只定义证据标准，不授权登录微信、使用真实账号、上传体验版、提审、发布、开启开关或配置白名单。

## 执行前准备

- 使用专用测试微信账号和测试家庭，不使用真实家庭成员资料。
- 所有证据必须绑定候选 commit 里的小程序版本，开始时间、结束时间、JSON 描述文件和媒体文件都必须晚于候选 commit，且不得写未来时间。
- 头像、昵称、手机号、OpenID、UnionID、token、二维码、请求头、聊天内容和其他家庭隐私不得出现在 manifest、文件名或未脱敏媒体中。
- 实际 PNG/JPEG/MP4/MOV 只保存在 Git 之外的私有 release evidence 目录；目录建议 `0700`，文件建议 `0600`。不得伪造、复制复用或提交到 Git。
- `1.1.75@fbb4938` 的私有会话保留为历史 `0/56` 空会话，不得继续为已发生变化的运行时补证据。本地 `1.1.76` 与 `1.1.77` 已被后续运行时变更取代，不得上传或创建验收会话；当前 `1.1.78@7606aad` 已完成不可变归档、授权上传和受控验签，现在可从新的上传证明创建独立会话。候选工作台不会自动发现或展示历史开发者工具二维码。

## N5c 私有会话

只有已上传候选才能从已签名的上传证明创建独立会话。下面的命令使用 `1.1.78@7606aad` 的新证明；`1.1.75@fbb4938` 历史空会话不得作为当前验收入口。准备器会交叉验证 AppID、版本、运行时、不可变归档 SHA-256 和原始上传回执 SHA-256，调用方不能覆盖这些值。

```bash
npm run release:n5c:prepare -- \
  --candidate-commit 7606aadcd03dafe9925885b7fef5c308ecfb73e0 \
  --attestation "$HOME/.humi-release-evidence/HUMI-2026-001/n5b-1.1.78-20260802T140601Z/wechat-upload-machine-attestation.json"
```

会话创建在 `~/.humi-release-evidence/HUMI-2026-001/n5c-1.1.75-<UTC>-<random>/`，包含只读候选事实 `session.json`、56 行匿名分工 `allocation.json`、中文执行单和严格为空的 `manifest.json`。`descriptors/`、`media/`、`drafts/` 初始为空，因此创建完成后仍必须真实报告 `0/56`。

连接设备后先运行只读体检。它只报告设备数量与就绪布尔值，不输出设备名称、序列号或 USB 标识；当前矩阵要求一台可生成 `390×844` 证据的真实 iPhone 和一台真实 Android，iPad 或模拟器不能替代：

```bash
npm run release:n5c:doctor -- --session /absolute/private/n5c-session
```

每条真实结果先把九字段 row JSON 放进会话 `drafts/`；`pass` 还要把六字段 descriptor JSON 放进 `drafts/`，并把已人工脱敏的真实媒体放到 `media/<scenarioId>/`。分享场景媒体名必须分别含 `sender-` 和 `recipient-`。随后执行：

```bash
npm run release:n5c:record -- \
  --session /absolute/private/n5c-session \
  --scenario fresh_guest_start \
  --row /absolute/private/n5c-session/drafts/fresh_guest_start-row.json \
  --descriptor /absolute/private/n5c-session/drafts/fresh_guest_start-descriptor.json

npm run release:n5c:check -- --session /absolute/private/n5c-session
```

非 `pass` 结果不提供 descriptor。记录器不支持 force/skip 参数；已有 `pass` 不可覆盖，任何校验失败都保持 `manifest.json` 字节不变。完整检查还要求 iOS、Android 各至少一张精确 `390×844` 图片，五类分享的发送与接收槽不同，三项性能全部达标。

## 权威矩阵

固定 56 行场景 ID、每行的精确检查项和 JSON 示例以 [候选验证表单](./humi-1.1-candidate-validation-forms.md#7-原生骨架真机证据合同) 为准。矩阵覆盖：

- 6 条登录/身份、15 条三档五轮推荐；
- 4 条做饭/恢复/角色、5 条真实分享发送与接收者打开；
- 2 条海报风格、3 条提醒授权、1 条立即回滚；
- 5 个原生主标签、3 条家庭与协作身份；
- 4 条做饭降级与反馈、3 条海报保存恢复、2 条提醒送达；
- 3 条真机性能：缓存首屏 `<=400ms`、暖启动 `<=1000ms`、冷态已登录启动 `<=2500ms`。

推荐每一轮必须证明只包含认证菜谱且满足硬约束；同一家庭/日期/档位周期第 2–5 轮还必须证明没有重复之前的组合。每档五轮作为一个不可拆分周期分配给同一设备，三档整体覆盖 iOS/Android；这是现有权威轮换门禁与双平台覆盖同时成立的唯一分工。五类分享每条至少需要两个互不复用的媒体文件，分别证明真实微信联系人面板/发送和另一台微信接收/打开。

## Manifest 与描述文件

根目录 `manifest.json` 必须严格使用 `schemaVersion: 3`，每个场景行只包含 `device`、`platform`、`wechatVersion`、`packageVersion`、`householdFixture`、`startedAt`、`finishedAt`、`result`、`evidencePath`。`evidencePath` 必须严格为 `descriptors/<scenarioId>.json`；门禁不回显操作员提供的非规范路径。

每个描述文件严格使用 `schemaVersion: 2`，并只包含 `schemaVersion`、`scenarioId`、`redacted`、`checks`、`metrics`、`mediaPaths`。非性能场景的 `metrics` 必须是 `{}`；性能场景只能包含一个有限、非负数字 `durationMs`。预算由检查器自身比较，不接受自报预算或 `budgetMet`。

检查器拒绝旧 schema、缺项/增项、路径穿越、非规范描述路径、软链接、硬链接、复用文件或复用内容、过早/未来时间、错误候选版本、疑似 PII、超大 JSON、无法解码或尺寸不足的媒体，以及超预算性能数据。每档五轮推荐还必须绑定同一家庭夹具、设备、平台、微信/包版本和 Asia/Shanghai 业务日期，并按顺序执行且互不重叠。

## 检查命令

```bash
npm run validate:true-device-evidence:selftest
npm run release:n5c:prepare:selftest
npm run release:n5c:record:selftest
npm run release:n5c:check:selftest
npm run release:n5c:doctor:selftest
npm run validate:true-device-evidence
npm run validate:true-device-evidence -- \
  --evidence-dir /approved/private/evidence/humi-true-device \
  --candidate-commit <candidate-sha>

npm run validate:startup-performance -- \
  --evidence-dir /approved/private/evidence/humi-true-device \
  --candidate-commit <candidate-sha>
```

无证据运行完整门禁必须报告 `0/56` 并以非零状态退出；这是尚未执行外部真机验收的真实状态，不是本地工程失败。启动性能在没有私有证据时保留本地代码/资源检查结果并报告 `blocked`；只有三个性能描述文件全部有效、版本和时间正确且在预算内时，才可报告真机性能已验证。

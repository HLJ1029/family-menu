# Humi 微信真机验收证据包

状态：待外部授权执行，当前 `0/56`。本文件和检查器只定义证据标准，不授权登录微信、使用真实账号、上传体验版、提审、发布、开启开关或配置白名单。

## 执行前准备

- 使用专用测试微信账号和测试家庭，不使用真实家庭成员资料。
- 所有证据必须绑定候选 commit 里的小程序版本，开始时间、结束时间、JSON 描述文件和媒体文件都必须晚于候选 commit，且不得写未来时间。
- 头像、昵称、手机号、OpenID、UnionID、token、二维码、请求头、聊天内容和其他家庭隐私不得出现在 manifest、文件名或未脱敏媒体中。
- 实际 PNG/JPEG/MP4/MOV 只保存在 Git 之外的私有 release evidence 目录；目录建议 `0700`，文件建议 `0600`。不得伪造、复制复用或提交到 Git。

## 权威矩阵

固定 56 行场景 ID、每行的精确检查项和 JSON 示例以 [候选验证表单](./humi-1.1-candidate-validation-forms.md#7-原生骨架真机证据合同) 为准。矩阵覆盖：

- 6 条登录/身份、15 条三档五轮推荐；
- 4 条做饭/恢复/角色、5 条真实分享发送与接收者打开；
- 2 条海报风格、3 条提醒授权、1 条立即回滚；
- 5 个原生主标签、3 条家庭与协作身份；
- 4 条做饭降级与反馈、3 条海报保存恢复、2 条提醒送达；
- 3 条真机性能：缓存首屏 `<=400ms`、暖启动 `<=1000ms`、冷态已登录启动 `<=2500ms`。

推荐每一轮必须证明只包含认证菜谱且满足硬约束；同一家庭/日期/档位周期第 2–5 轮还必须证明没有重复之前的组合。五类分享每条至少需要两个互不复用的媒体文件，分别证明真实微信联系人面板/发送和另一台微信接收/打开。

## Manifest 与描述文件

根目录 `manifest.json` 必须严格使用 `schemaVersion: 3`，每个场景行只包含 `device`、`platform`、`wechatVersion`、`packageVersion`、`householdFixture`、`startedAt`、`finishedAt`、`result`、`evidencePath`。`evidencePath` 必须严格为 `descriptors/<scenarioId>.json`；门禁不回显操作员提供的非规范路径。

每个描述文件严格使用 `schemaVersion: 2`，并只包含 `schemaVersion`、`scenarioId`、`redacted`、`checks`、`metrics`、`mediaPaths`。非性能场景的 `metrics` 必须是 `{}`；性能场景只能包含一个有限、非负数字 `durationMs`。预算由检查器自身比较，不接受自报预算或 `budgetMet`。

检查器拒绝旧 schema、缺项/增项、路径穿越、非规范描述路径、软链接、硬链接、复用文件或复用内容、过早/未来时间、错误候选版本、疑似 PII、超大 JSON、无法解码或尺寸不足的媒体，以及超预算性能数据。每档五轮推荐还必须绑定同一家庭夹具、设备、平台、微信/包版本和 Asia/Shanghai 业务日期，并按顺序执行且互不重叠。

## 检查命令

```bash
npm run validate:true-device-evidence:selftest
npm run validate:true-device-evidence
npm run validate:true-device-evidence -- \
  --evidence-dir /approved/private/evidence/humi-true-device \
  --candidate-commit <candidate-sha>

npm run validate:startup-performance -- \
  --evidence-dir /approved/private/evidence/humi-true-device \
  --candidate-commit <candidate-sha>
```

无证据运行完整门禁必须报告 `0/56` 并以非零状态退出；这是尚未执行外部真机验收的真实状态，不是本地工程失败。启动性能在没有私有证据时保留本地代码/资源检查结果并报告 `blocked`；只有三个性能描述文件全部有效、版本和时间正确且在预算内时，才可报告真机性能已验证。

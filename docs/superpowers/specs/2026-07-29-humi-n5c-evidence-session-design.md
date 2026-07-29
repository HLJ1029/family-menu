# Humi N5c 真机验收会话设计

## 决策

采用独立的 N5c 私有证据会话，不扩展现有 U001–U020 候选反馈包，也不复用历史微信开发者工具预览二维码。

N5c 会话必须绑定当前已上传体验版 `1.1.75`、运行时提交 `fbb4938200ef0137c468bd37f3868b94b64b738b`、AppID `wx4040b89f3b363416`、不可变归档和受控签名上传证明。会话初始状态保持真实 `0/56`；工具不得生成伪造的执行时间、媒体、描述文件或通过结果。

本设计只增加本地私有验收工具、版本绑定和门禁，不授权生成微信预览、发送消息、配置微信后台、提审、发布、部署、开启原生或 MealRun 开关，或修改家庭白名单。

## 背景与问题

N5b 已将 `1.1.75@fbb4938` 上传为体验版，但 N5c 仍为 `0/56`。当前本地工具存在四个执行风险：

- 最新 U001–U020 候选包生成于 2026-07-18，没有绑定 `1.1.75` 或运行时提交；
- 候选工作台按目录名自动选择最近的分享预览，可能把 7 月 18 日的旧二维码显示为可用；
- U001–U020 候选包面向家庭反馈，不包含 N5c 的 56 行场景、设备分工、候选绑定或媒体目录；
- `release:wechat:check` 只等待 `release:status` 90 秒，而当前产品烟测实测约 161 秒，导致预检超时；候选包自测还会进入生产烟测。

代码中的 56 行证据验证器可以拒绝伪造、缺失和不合格材料，但目前缺少一条安全、可重复的证据采集路径。

## 目标

- 为每次 N5c 执行创建不可混用的私有会话，机械绑定候选版本和上传证明；
- 给 56 行场景分配 iOS、Android、家庭角色和真实分享接收设备槽；
- 只有真实执行并通过现有严格验证后，才允许原子写入一行结果；
- 使旧二维码默认不可见、不可扫码，当前 N5c 只从微信体验版入口开始；
- 让本地自测与生产网络烟测隔离，并让完整微信预检拥有足够且一致的超时预算；
- 继续以现有 `check-humi-true-device-evidence.mjs` 为最终 56 行事实门禁，不建立第二套互相冲突的验收规则。

## 非目标

- 不替代微信真机、真实联系人面板、真实发送或接收者打开；
- 不自动操作手机、微信联系人、微信公众平台或开发者工具；
- 不把模拟器、开发者工具截图、旧二维码或本地单测记为真机通过；
- 不把 U001–U020 产品反馈样本等同于 56 行工程验收；
- 不改变小程序运行时 `fbb4938`，也不重新上传 `1.1.75`；
- 不进入 N5d、N5e 或 N5f。

## 私有会话结构

默认目录：

```text
~/.humi-release-evidence/HUMI-2026-001/n5c-1.1.75-<UTC stamp>/
  session.json
  allocation.json
  manifest.json
  run-sheet.md
  descriptors/
  media/
  drafts/
```

- 根目录权限必须为 `0700`；所有文件和子目录内材料必须为 `0600` 或更严格；
- 目录只能创建在明确的私有证据根目录内，拒绝软链接、硬链接、路径穿越和已有非空目标；
- `session.json` 和 `allocation.json` 创建后不可被普通记录命令改写；
- `manifest.json` 初始严格为 `{ "schemaVersion": 3, "scenarios": {} }`，因此权威门禁仍会报告 `0/56`；
- `descriptors/` 和 `media/` 初始为空，工具不创建占位图片或占位描述；
- `drafts/` 只用于操作者准备尚未写入权威 manifest 的受控 JSON 输入。

### `session.json`

只允许以下稳定字段：

```json
{
  "schemaVersion": 1,
  "sessionId": "n5c-1.1.75-20260729T000000Z",
  "createdAt": "2026-07-29T00:00:00.000Z",
  "appId": "wx4040b89f3b363416",
  "packageVersion": "1.1.75",
  "runtimeCommit": "fbb4938200ef0137c468bd37f3868b94b64b738b",
  "archiveSha256": "a1a3a9876e782de8526605d1260c1cf1dd2e70cde85dbb53d051a242c718a0d6",
  "uploadAttestationRef": "private://HUMI-2026-001/n5b-1.1.75-20260728T111436Z/wechat-upload-machine-attestation.json",
  "uploadRawEvidenceSha256": "ec77d67f2c24f6f795e27d6439b32ace11c6b79dc4028cfb0c2dc795a52d2938",
  "status": "prepared"
}
```

准备命令必须从仓库内候选证据、候选提交和受控签名证明读取这些值并交叉验证；调用方不能用参数覆盖 AppID、版本、运行时提交、归档哈希或原始上传回执哈希。

### `allocation.json`

`allocation.json` 只保存匿名设备槽和每个场景的分工，不保存昵称、手机号、微信号、OpenID、UnionID、token、聊天内容或家庭自由文本。

固定设备槽为：

- `ios-primary`：390×844 iOS 微信真机；
- `android-primary`：Android 微信真机；
- `recipient-primary`：与发送账号不同的真实微信账号和接收设备。

56 个场景必须全部出现且恰好一次。iOS 和 Android 都必须覆盖登录、每档至少一轮推荐、烹饪、原生标签、家庭权限、海报或提醒、至少一种真实分享和至少一项性能场景。五类分享必须记录互不相同的发送槽和接收槽；接收槽固定为 `recipient-primary`，发送槽只能是 `ios-primary` 或 `android-primary`。

具体设备型号和微信版本在真实记录时进入现有 manifest 行；准备会话时不猜测、不填占位型号。

## 命令与数据流

### `npm run release:n5c:prepare`

输入：

- `--candidate-commit fbb4938200ef0137c468bd37f3868b94b64b738b`；
- `--attestation /absolute/private/path/wechat-upload-machine-attestation.json`；
- 可选的绝对私有输出根目录。

行为：

1. 验证当前仓库干净且处于隔离分支；
2. 验证候选提交内 `HUMI_PACKAGE_VERSION` 为 `1.1.75`；
3. 验证不可变归档内容等于 `fbb4938` 的 `miniprogram/**`；
4. 使用仓库固定公钥验证上传证明，并核对 AppID、版本、运行时提交、归档哈希和原始回执哈希；
5. 写入私有会话、空 manifest、固定 56 行分工和中文执行单；
6. 默认不打开文件、不调用微信、不生成二维码；只有显式 `--open` 才打开本地 `run-sheet.md`。

重复执行不得覆盖已有会话。相同候选可以创建多次独立会话，但每个会话有不同 `sessionId`。

### `npm run release:n5c:record`

输入：

- `--session <absolute-session-dir>`；
- `--scenario <fixed-scenario-id>`；
- `--row <absolute-private-row-json>`；
- `pass` 时必须同时提供 `--descriptor <absolute-private-descriptor-json>`，并且描述文件引用的真实媒体已经存在于本会话 `media/`。

行为：

1. 验证 session 和 allocation 未被篡改，场景属于固定 56 行；
2. 验证 row 只含现有 manifest 的九个字段，版本、设备槽、平台、家庭夹具和时间均满足合同；
3. `pass` 时验证 descriptor 的六个字段、精确 checks、媒体可解码、大小、时间、内容哈希、不可复用和脱敏确认；
4. 分享场景必须同时满足 `contact_panel`、`sent`、`recipient_open`，且至少有发送端与接收端两个不同媒体；
5. 性能场景只接受一个 `durationMs`，并使用现有 400/1000/2500 ms 预算；
6. 把已验证描述和媒体复制到受控规范路径，再用临时文件加原子 rename 更新 manifest；
7. 已有 `pass` 不可被覆盖；`pending`、`blocked` 或 `fail` 只有在提供新的真实执行时间和材料后才能升级为 `pass`；
8. 任一步失败时不改变权威 manifest。

工具不得接受 `--force-pass`、跳过媒体、跳过脱敏、跳过签名或放宽预算的参数。

### `npm run release:n5c:check`

行为：

1. 校验 session、allocation、文件权限和候选绑定；
2. 调用现有 56 行证据验证器；
3. 调用启动性能检查器；
4. 对每个平台至少一张 390×844 图片做会话级检查；
5. 检查每个分享场景的发送槽与接收槽不同；
6. 输出 `passed / pending / blocked / fail / missing` 聚合，不回显私有媒体内容或用户输入；
7. 只有 56/56、三项性能达标、iOS/Android 覆盖完整且无隐私/权限错误时退出 `0`。

## 微信体验版入口与旧二维码处理

N5c 当前入口固定为微信中的 `1.1.75` 体验版，不生成新的开发者工具预览二维码。

候选分发工作台不再自动采用“按目录名最新”的 `miniprogram-share-card-preview-*`：

- 默认不显示任何历史二维码，也不把二维码标为 ready；
- 当前阶段显示“从微信体验版打开 1.1.75”；
- 不再建议执行 `release:wechat:share:direct-previews`；
- 只有调用方显式指定私有预览目录，并且该目录包含经过验证的候选绑定文件时，未来的独立预览流程才可展示二维码；
- 缺少绑定、版本不是 `1.1.75`、运行时不是 `fbb4938`、生成时间早于本次上传或路径不安全时全部 fail closed。

本轮不实现新的预览生成能力，也不补签历史二维码。

## 预检超时与自测隔离

根因已经由实测确认：`release:product:smoke` 约 161 秒，`release:collaboration:smoke` 约 84 秒，而 `release:wechat:check` 外层只等待 90 秒；`release:status` 对产品烟测的 150 秒预算也低于当前真实耗时。

修复规则：

- 完整 `release:status` 的产品烟测预算提升到 240 秒；
- `release:wechat:check` 等待完整状态的预算提升到 360 秒，且必须大于所有内层单项预算；
- 超时、子进程退出和 JSON 解析失败都返回结构化 `ok=false` 和稳定错误码，不抛出裸 Node 堆栈；
- `HUMI_RELEASE_STATUS_FIXTURE_MODE=1` 的自测路径不运行生产在线检查、产品烟测或协作烟测；
- fixture skip 只能在 `NODE_ENV=test`、现有受控 fixture guard 和临时目录条件同时满足时生效；生产调用不能通过环境变量跳过门禁；
- `release:candidate:today:selftest`、`prepare:selftest` 和 `release:next:selftest` 必须只访问临时目录，不连接生产 H5/API。

完整生产预检仍执行真实在线和烟测，不使用旧结果冒充当前结果。

## 错误处理与隐私

- 任何候选绑定不一致、签名失败、权限错误、路径越界、字段增减、媒体重复、媒体无法解码、时间不合法或 PII 命中都 fail closed；
- 错误输出只包含场景 ID、稳定错误码和安全路径标签，不回显 token、联系人、文件内容或不规范原始路径；
- 操作者必须在写入 `redacted: true` 前人工移除头像、昵称、聊天内容、手机号和家庭隐私；自动检查不能替代人工脱敏；
- 原始媒体持续保存在 Git 之外，Git 只提交规格、工具、测试和匿名状态摘要；
- 会话工具不删除原始媒体，不自动清理失败会话，避免破坏证据；测试临时目录可以在测试结束后清理。

## 测试策略

严格执行 RED → GREEN：

- 准备器：正确绑定、错误 AppID/版本/提交/哈希/签名、已有目录、软链接、权限和不受控输出根；
- 分工：56 行完整唯一、iOS/Android 最小覆盖、分享发送/接收槽不同、无 PII 字段；
- 记录器：真实 `pass`、非通过结果、原子写入、重复写、已有 pass 不可覆盖、故障后 manifest 不变；
- 证据：缺 checks、额外字段、伪媒体、复用媒体、错误尺寸、错误时间、错误预算和分享仅单端证据；
- 旧二维码：自动发现历史目录时必须显示 unavailable，显式错误绑定也必须拒绝；
- 超时：受控延迟进程证明外层等待超过内层预算，受控超时返回结构化错误；
- 自测隔离：fixture 模式使用不可访问的生产 URL 仍能通过本地自测，并证明生产模式没有 skip；
- 回归：现有 56 行自测、启动性能、候选工作台、候选 today/prepare、微信隐私、上传验签、release status/next/check、文档 freshness、安全审计和 secret scan。

测试不能生成可被生产门禁误认的真实 N5c 目录；所有合成媒体只存在于系统临时目录，并使用测试专用候选提交或受控 fixture guard。

## 完成标准

本地实现完成必须同时满足：

- 新建会话后权威状态仍为 `0/56`，且会话与 `1.1.75@fbb4938` 的签名上传证明绑定；
- 56 行运行单与现有 `REQUIRED_SCENARIOS`、`SCENARIO_CHECKS` 和性能预算来自同一导出，不能复制另一套常量；
- 未提供真实媒体时无法写入任何 `pass`；
- 历史二维码不再自动显示为可用；
- 候选自测不连接生产，完整微信预检不再在 90/150 秒处超时；
- 全部聚焦测试、回归、安全审计、secret scan 和独立代码复审通过；
- 小程序运行时仍精确等于 `fbb4938`，开关为 `0`、白名单为空，未发生微信平台外部动作。

N5c 只有在另行授权的真实 iOS/Android 执行完成、56/56 通过、平台 web-view/隐私证据齐全且无 P0/P1 后才完成。本地工具完成不等于 N5c 完成。

## 后续边界

N5c 通过后仍必须停在证据验收边界。N5d 提审、N5e 发布以及 N5f 的每个白名单阶段继续分别消耗新的明确用户授权；本设计不改变这些外部动作边界。

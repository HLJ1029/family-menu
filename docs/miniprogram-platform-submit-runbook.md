# Humi 1.1 微信公众平台提交与发布 Runbook

更新日期：2026-07-03
执行设备：codex@mbp-m5pro

本文档用于把 Humi 1.1.55 从“开发者工具已上传”推进到微信公众平台审核、发布和发布后证据留存。后台页面名称和字段可能随微信平台调整，最终以微信公众平台实时展示为准。

若只想判断“现在下一步该谁做什么”，先看 `docs/humi-1.1-release-operator-handoff.md`。
若已经打开微信公众平台并只想复制填写内容，看 `docs/wechat-submit-copy-packet.md`。

## 1. 当前待发布版本

- 小程序名称：`Humi`
- AppID：`wx4040b89f3b363416`
- 已上传版本：`1.1.55`
- 版本描述：`征集单模板与分享卡片`
- H5：`https://www.humi-home.com/`
- API：`https://api.humi-home.com`
- request 合法域名：`api.humi-home.com`
- web-view 业务域名：`www.humi-home.com`
- 隐私政策：`https://www.humi-home.com/privacy.html`
- 用户协议：`https://www.humi-home.com/terms.html`

## 2. 提交审核前确认

在公众平台提交前，先在本地执行：

```bash
npm run release:wechat:start-submit
npm run release:wechat:prepare-submit
npm run release:wechat:check
npm run release:status
npm run release:check:online
npm run monitor:prod
npm run deploy:api:check
```

判定：

- `release:status` 会汇总线上状态、生产监控、API 部署预检和下一步动作。
- `release:wechat:check` 会确认是否可进入微信公众平台提交，并输出本次提交要打开的材料。
- `release:check:online` 必须通过。
- `monitor:prod` 必须至少证明 H5 200、API health 200、基础推荐可用。
- `deploy:api:check` 当前允许因 SSH 失败而不通过；若失败项只有 `ssh-access`，说明 H5/当前生产 API 健康。1.1.55 不新增 API 端点，仍复用已补部署的 1.1.37-1.1.54 服务端增量。

自动化边界：

- 微信开发者工具 CLI 当前只用于 `preview`、`upload`、`build-npm`、`open`、`login` 等开发工具动作；本机 CLI 不提供提交审核或发布命令。
- `npm run release:wechat:prepare-submit` 只会创建私有证据目录、把审核备注复制到剪贴板、打开微信公众平台和证据目录；它不会提交表单、点击审核按钮或改变微信后台状态。
- 微信公众平台提交审核/发布会改变外部平台状态，必须由有权限的操作者在后台确认后执行。
- 若改用微信开放接口提交审核/发布，必须先有正式授权 token、可用类目和一次动作级确认；不得用聊天记录、后台截图或仓库文件保存 AppSecret/access token。
- 私有证据目录以 `npm run release:wechat:prepare-submit` 输出为准；当前最新目录是 `/Users/honglijie/.humi-release-evidence/wechat-submit-1.1.55-20260704T074420`。后台截图放这里，仓库只记录结论和私有位置。

## 3. 公众平台操作顺序

1. 登录微信公众平台，进入 Humi 小程序。
2. 检查开发管理/版本管理里是否存在上传版本 `1.1.55`，描述为 `征集单模板与分享卡片`。
3. 检查服务器域名：
   - request 合法域名包含 `https://api.humi-home.com`。
   - web-view 业务域名包含 `https://www.humi-home.com`。
4. 检查用户隐私保护指引：
   - 微信身份标识用于账号登录、会话恢复和家庭协作。
   - 手机号仅在用户主动绑定时用于账号绑定、登录验证、账号找回和家庭协作安全。
   - 不声明精确位置、通讯录、相册内容、摄像头、麦克风、支付信息。
5. 进入版本管理，选择 `1.1.55` 提交审核。
6. 填写服务类目。若有多个候选，优先选择工具/生活信息管理相关类目；避免医疗健康、营养治疗、食品销售或外卖类描述。
7. 填写审核备注，使用 `docs/miniprogram-review-materials.md` 第 4 节内容。
8. 若后台要求账号，优先填写“无需账号，打开即可体验核心功能”；若强制测试账号，再创建审核专用账号，不使用私人账号。
9. 提交审核后记录提交时间、提交人、版本号、审核单状态截图。

## 4. 提交审核时可粘贴内容

审核备注使用：

```text
Humi 是一款家庭晚饭安排工具，核心功能无需注册即可体验。

建议审核路径：
1. 打开小程序，进入【今晚】；
2. 点击“今晚就做”把推荐加入今晚菜单；
3. 点击“换一组”或“不想吃”查看推荐反馈；
4. 点击“问问大家想吃啥”查看家庭感觉征集入口；
5. 进入【清单】查看自动生成的食材清单；
6. 进入【我的家】查看家庭成员、饭线索、想吃池子、忌口和隐私协议入口。

推荐服务不可用时，页面会自动使用本地规则给出另一组菜单，不影响核心体验。
本产品仅提供家庭菜单、采购清单和协作整理，不提供医疗诊断或专业营养建议。
```

## 5. 证据留存

提交审核时至少保存以下截图或记录：

| 证据 | 建议文件名 |
| --- | --- |
| 上传版本 `1.1.55` 列表 | `humi-1.1.55-version-list.png` |
| request 合法域名 | `humi-request-domain-api.png` |
| web-view 业务域名 | `humi-webview-domain-www.png` |
| 隐私保护指引关键项 | `humi-privacy-settings.png` |
| 审核备注/提交页 | `humi-review-submit-note.png` |
| 提交成功/审核中状态 | `humi-review-submitted.png` |

证据可先放到本机私有目录，不要把包含登录态、后台账号或个人信息的截图提交进仓库。只把提交时间、版本号、审核状态和结论记录进 AI-HQ Humi 状态，并把证据索引填到 `docs/humi-1.1-release-evidence-log.md`。

提交审核后，可用命令登记证据索引：

```bash
npm run release:evidence:record:submit:latest
npm run release:evidence:commands -- submit
```

如果截图已经放到最新 `wechat-submit-1.1.55-*` 私有目录，优先运行 `release:evidence:record:submit:latest`，它会自动使用最新私有目录登记证据；若目录里只有 README、没有截图或录屏，命令会拒绝登记。`release:evidence:commands -- submit` 会打印手动登记模板；替换时间、提交人、状态和私有证据位置后再运行。
`HUMI_WECHAT_EVIDENCE_LOCATION` 只填私有位置或飞书私有链接，不填截图内容、登录态、手机号或真实家庭名单。

## 6. 审核通过后发布

审核通过后：

1. 进入版本管理，找到审核通过的 `1.1.55`。
2. 点击发布。
3. 等待 3-10 分钟。
4. 用真实微信搜索或扫码打开小程序，不只看开发者工具。
5. 按 `docs/launch-day-runbook.md` 的 P0 验收路径验证。
6. 在 `docs/humi-1.1-release-evidence-log.md` 填写发布、P0 和 24 小时监控证据。
7. 执行 `npm run release:evidence:check`，确认发布证据日志已填完。
8. 在 AI-HQ Humi 状态记录发布时间、执行人、版本、验证结果和是否出现 P0/P1 问题。

## 7. 发布后 P0 真机验收

发布后必须验证：

- 普通打开小程序进入【今晚】，不被登录墙挡住。
- 【今晚】能看到晚饭推荐，`今晚就做` 能进入今晚菜单。
- `换一组` 或 `不想吃` 可正常降级/反馈。
- `问问大家想吃啥` 能生成小程序卡片，家人打开 `crave` 卡片后免登录点感觉。
- 【清单】能看到三餐汇总食材，分享后的 `grocery` 卡片可认领/标记买到，别人已认领项不能被覆盖。
- 【我的家】能看到微信登录状态、家庭成员、饭线索、想吃池子和忌口入口。
- 退出登录后可重新触发微信登录。

## 8. 审核反馈处理

若审核失败：

1. 复制后台原始驳回原因，保留截图。
2. 判断等级：
   - P0：打不开、合规/隐私、登录卡死、核心链路不能体验。
   - P1：说明不清、类目/备注需调整、截图或材料缺失。
   - P2：普通文案或非核心体验建议。
3. 将问题写入 `docs/launch-feedback-and-101-backlog.md`。
4. 只有 P0 或审核要求必须改代码时，才上传新的 1.1.x；普通文案和体验建议先进入修复池。

审核结果回来后先登记结果：

```bash
npm run release:evidence:commands -- review
```

命令会打印审核结果登记模板；替换后台实际结果后再运行。
若审核驳回，把 `HUMI_WECHAT_REVIEW_REASON` 只填后台原因摘要；不要把含隐私信息的截图或账号内容写进仓库。

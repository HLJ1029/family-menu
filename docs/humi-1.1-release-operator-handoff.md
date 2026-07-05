# Humi 1.1 Release Operator Handoff

更新日期：2026-07-05
执行设备：codex@mbp-m5pro

本文档给实际发布操作者使用：不用翻聊天记录，只按这里判断 Humi 1.1 现在在哪、下一步谁做什么、做完后用什么证据收口。只想看当前进度时先看 `docs/humi-1.1-closure-map.md`。

## 1. 当前结论

- 1.1 主体闭环、H5 发布材料、小程序审核材料和规格验收矩阵已具备，但当前不直接进入微信审核。
- 当前阶段是产品复核与提审前完善：`docs/humi-1.1-pre-review-hardening.md` 的 P0/P1 已完成，继续保持工程门禁和体验验收可重复通过；最终进入微信公众平台审核前必须再次由用户确认。
- 当前产品仓库状态以 `npm run release:status` 和 `git log --oneline -1` 为准。
- 最新产品提交以 `git log --oneline -1` 为准；当前已知最新 GitHub Pages run `28744383941`，结论 `success`。
- API 部署提交：`154f379`（`docs: correct humi api deploy target`）；对应 GitHub Pages run `28639333760`，结论 `success`。
- 最新小程序上传：`1.1.59`，描述 `原生分享确认页`，AppID `wx4040b89f3b363416`。
- 当前 H5：`https://www.humi-home.com/`，1.1.59 已部署。
- 当前 API：`https://api.humi-home.com`，`/health` 返回 HTTP 200。
- 生产 API 补部署已完成：备份 `/opt/humi/backups/20260703T045543Z`，`humi-api.service` 已重启，线上 health/monitor/readiness/public smoke 通过。

## 2. 先后顺序

### Step 0：提审前产品打磨

状态：已完成。当前继续做提审前产品复核与完善，最终停点是用户确认是否进入微信审核。

Owner：Codex，涉及视觉/产品方向不确定项时由用户确认。

执行：

```bash
npm run release:next
npm run release:status
npm run release:product:review
```

完成标准：

- `docs/humi-1.1-pre-review-hardening.md` 中 P0/P1 全部勾选。
- `npm run release:status` 里 `release.preReviewHardeningReady: true`。
- `npm run release:product:review` 通过，确认发现新菜、我的家问问大家、征集单模板、小程序卡片证据和微信审核确认护栏仍有源码/文档/证据锚点。
- 用户确认关键体验，尤其是【今晚菜单】选菜发现、【我的家】问问大家、征集单模板和小程序卡片分享。
- 当前已满足；后续如果新增提审前 P0/P1，继续在本步骤完善，不直接跳到审核。

### Step A：生产 API 补部署

状态：已完成。后续只有回滚、补验证或再次发版时需要重跑本节。

Owner：Codex + 具备服务器登录权限的人。

执行：

```bash
npm run deploy:api:check
```

当前生产机需显式指定 SSH key：

```bash
HUMI_API_SSH_TARGETS=ubuntu@api.humi-home.com \
HUMI_API_SSH_KEY="$HOME/.ssh/humi_tencent_lighthouse" \
npm run deploy:api:check
```

如果后续再次部署时仍只有 `ssh-access` 失败，先恢复 `api.humi-home.com` 的 SSH 登录方式。预检通过后按：

```text
docs/humi-api-production-deploy-runbook.md
```

只读探查结论：生产 API 由 `systemd` 管理，unit 为 `humi-api.service`，实际目录是 `/opt/humi`，不是 `/opt/humi/current`。

必须补上的 API 增量：

- `deadlineAt`
- 精准推荐额度闸门
- 精准解释额度闸门
- 征集结果 `resultSummary`
- 家庭邀请 join 返回共享 `state`
- 买菜认领 409 冲突保护
- 主厨权限 403 边界
- 征集 join 返回家庭列表与共享 `state`

完成证据：

- `npm run deploy:api:check` 通过。
- `npm run monitor:prod` 通过。
- `npm run release:check:online` 通过。
- AI-HQ Humi 状态记录部署时间、执行人、备份路径和验证结果。
- `docs/humi-1.1-release-evidence-log.md` 填写 API 补部署证据。

### Step B：微信公众平台提交审核

Owner：用户，Codex 提供材料。

提交前先跑：

```bash
npm run release:wechat:check
```

执行材料：

```text
docs/miniprogram-platform-submit-runbook.md
docs/miniprogram-review-materials.md
docs/wechat-submit-copy-packet.md
```

提交版本：

- 版本：`1.1.59`
- 描述：`原生分享确认页`

提交前必须确认：

- request 合法域名包含 `https://api.humi-home.com`
- web-view 业务域名包含 `https://www.humi-home.com`
- 隐私政策为 `https://www.humi-home.com/privacy.html`
- 用户协议为 `https://www.humi-home.com/terms.html`

完成证据：

- 上传版本列表截图。
- request/web-view 域名截图。
- 隐私保护指引截图。
- 审核备注/提交页截图。
- 提交成功或审核中截图。
- AI-HQ Humi 状态记录提交时间、提交人、版本和审核状态。
- `docs/humi-1.1-release-evidence-log.md` 填写审核提交证据索引。

### Step C：审核通过后发布

Owner：用户。

执行材料：

```text
docs/launch-day-runbook.md
```

完成证据：

- 微信公众平台发布成功状态。
- 真机打开小程序，不只看开发者工具。
- P0 真机路径全部通过，尤其是普通启动、`crave`、`invite`、`grocery` 三类小程序卡片。
- 填写发布、P0 和 24 小时监控证据后，`npm run release:evidence:check` 通过。
- AI-HQ Humi 状态记录发布时间、执行人、验证结果和是否出现 P0/P1 问题。
- `docs/humi-1.1-release-evidence-log.md` 填写发布与 P0 真机验收证据。

### Step D：10-20 家灰度

Owner：用户 + 运营执行。

执行材料：

```text
docs/humi-1.1-gray-release-tracker.md
docs/launch-feedback-and-101-backlog.md
```

要求：

- 真实姓名、手机号、微信号不得进仓库。
- 只记录匿名家庭编号、设备、路径、问题等级和处理结论。
- 只有审核反馈、P0 链路阻塞、隐私合规问题或多个首批用户遇到同一处不可继续问题，才发 1.1.x。

## 3. 当前不要做

- 不要在审核通过前上传新小程序版本覆盖 `1.1.59`，除非审核反馈或 P0 问题要求。
- 不要在 1.1 发布前清退 Supabase、改支付、改登录架构或改数据库存储。
- 不要把微信后台截图、登录态、手机号、真实家庭名单提交到仓库。
- 不要因为 `release:status ok=false` 就误判 H5 不可发；先看失败项是不是只有生产 API SSH。

## 4. 一键状态判断

只想知道“现在下一步做什么”：

```bash
npm run release:next
```

想看“离 1.1 完整上线还差哪几段”：

```bash
npm run release:closure
```

`release:closure` 会汇总规格验收、提审前 P0/P1、小程序分享卡片证据、微信审核/发布证据、真机 P0 和 24 小时监控阶段；它只读状态并输出下一组命令，不会提交审核、不发布、不修改微信后台。

现在 `release:next` 应停在“功能完善与工程门禁已完成，等待用户确认是否进入微信审核”。在用户决定审核前，可以继续做产品复核与细节完善；进入微信公众平台材料前仍需用户动作当下确认：

```bash
npm run release:wechat:start-submit
HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit
npm run release:wechat:copy
```

当前已准备的提交证据目录：

```text
/Users/honglijie/.humi-release-evidence/wechat-submit-1.1.59-20260705T094930
```

后续如果重新运行 `HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit`，以命令最新输出的目录为准。

自动化边界：

- 微信开发者工具 CLI 已完成 `1.1.59` 上传，但本机 CLI 没有提交审核/发布命令。
- `release:wechat:prepare-submit` 必须带 `HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1` 才会打开微信公众平台；未带确认变量时只打印说明并退出。确认后它会复用最新未留证的私有目录；如果最新目录已经有后台截图或录屏，才新建一个提审目录。它只负责复制审核备注、打开公众平台和证据目录；不提交审核、不发布、不撤回，也不调用微信开放接口。
- 微信公众平台 `mp.weixin.qq.com` 不允许本会话用浏览器自动化控制；不得绕过该限制。
- 提交审核、发布、撤回审核、调用微信开放接口提交审核/发布都属于小程序审核关键路径，必须由平台权限操作者在动作当下确认。
- 证据截图只放私有目录或私有链接；仓库内只登记时间、状态、结论和私有位置。

用户确认并完成提交审核后，登记证据日志：

```bash
npm run release:evidence:record:submit:latest
npm run release:evidence:commands -- submit
```

如果最新私有证据目录中没有 README 之外的截图或录屏，`release:evidence:record:submit:latest` 会拒绝登记，避免没有后台证据时误填发布日志。审核结果、发布、P0 和 24 小时监控回来后，继续用：

```bash
npm run release:evidence:commands -- review
npm run release:evidence:commands -- publish
npm run release:evidence:commands -- p0
npm run release:evidence:commands -- monitor
```

这些命令会打印可复制模板；替换时间、执行人、结论和私有证据位置后再运行。需要一次看完全部模板：

```bash
npm run release:evidence:commands
```

需要验证登记命令本身是否还能完整跑通：

```bash
npm run release:evidence:selftest
npm run release:next:selftest
```

需要看完整 JSON 状态：

```bash
npm run release:status
npm run release:evidence:check
npm run release:complete:check
```

读法：

- `release.onlineReady: true`：线上 H5 readiness 通过。
- `release.productionMonitorOk: true`：H5、API health、基础推荐监控通过。
- `release.artifactsReady: true`：发布必备文档齐全。
- `release.preReviewHardeningReady: true`：提审前 P0/P1 产品打磨已全部完成。
- `release.productReviewReady: true`：发现新菜、我的家问问大家、征集单模板、小程序卡片证据和微信审核确认护栏这些产品复核锚点已通过。
- `release.wechatSubmitWorkspaceGuardReady: true`：`release:wechat:prepare-submit` 未带显式确认变量时不会打开微信公众平台。
- `release.apiDeployOnlySshBlocked: true`：只剩生产机 SSH 权限问题。
- `release.apiDeployReady: true`：API 补部署条件已满足。
- `release.releaseEvidenceReady: false`：外部微信提交/审核/发布/真机/24 小时监控证据还没填完。
- `release.releaseComplete: true`：工程侧、微信发布侧、真机 P0 和 24 小时监控证据都完成。
- `release:evidence:check` 通过：微信提交、审核结果、发布、真机 P0 和 24 小时监控证据都已填写。
- `release:complete:check` 通过：可以宣布 Humi 1.1 正式发布完成；未通过时不能宣布完成。

只有 `release.preReviewHardeningReady`、`release.productReviewReady`、`release.wechatSubmitWorkspaceGuardReady`、`release.apiDeployReady`、微信审核发布、真机 P0 和 24 小时监控证据都完成后，1.1 才算正式发布完成。

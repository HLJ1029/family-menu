# Humi 1.1 Release Operator Handoff

更新日期：2026-07-03
执行设备：codex@mbp-m5pro

本文档给实际发布操作者使用：不用翻聊天记录，只按这里判断 Humi 1.1 现在在哪、下一步谁做什么、做完后用什么证据收口。

## 1. 当前结论

- 1.1 产品功能、H5 发布材料、小程序审核材料和规格验收矩阵已收口。
- 当前产品仓库状态以 `npm run release:status` 和 `git log --oneline -1` 为准。
- API 部署提交：`154f379`（`docs: correct humi api deploy target`）；对应 GitHub Pages run `28639333760`，结论 `success`。
- 最新小程序上传：`1.1.54`，描述 `征集加入状态同步`，AppID `wx4040b89f3b363416`。
- 当前 H5：`https://www.humi-home.com/`。
- 当前 API：`https://api.humi-home.com`，`/health` 返回 HTTP 200。
- 生产 API 补部署已完成：备份 `/opt/humi/backups/20260703T045543Z`，`humi-api.service` 已重启，线上 health/monitor/readiness/public smoke 通过。

## 2. 先后顺序

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

执行材料：

```text
docs/miniprogram-platform-submit-runbook.md
docs/miniprogram-review-materials.md
docs/wechat-submit-copy-packet.md
```

提交版本：

- 版本：`1.1.54`
- 描述：`征集加入状态同步`

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

- 不要在审核通过前上传新小程序版本覆盖 `1.1.54`，除非审核反馈或 P0 问题要求。
- 不要在 1.1 发布前清退 Supabase、改支付、改登录架构或改数据库存储。
- 不要把微信后台截图、登录态、手机号、真实家庭名单提交到仓库。
- 不要因为 `release:status ok=false` 就误判 H5 不可发；先看失败项是不是只有生产 API SSH。

## 4. 一键状态判断

```bash
npm run release:status
```

读法：

- `release.onlineReady: true`：线上 H5 readiness 通过。
- `release.productionMonitorOk: true`：H5、API health、基础推荐监控通过。
- `release.artifactsReady: true`：发布必备文档齐全。
- `release.apiDeployOnlySshBlocked: true`：只剩生产机 SSH 权限问题。
- `release.apiDeployReady: true`：API 补部署条件已满足。

只有 `release.apiDeployReady`、微信审核发布、真机 P0 证据都完成后，1.1 才算正式发布完成。

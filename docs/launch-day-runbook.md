# Humi 1.1 小程序发布 Runbook

更新日期：2026-07-14
执行设备：codex@mbp-m5pro

## 1. 当前状态

- 小程序版本：`1.1.65`
- 版本描述：`增加首屏白屏兜底`
- AppID：`wx4040b89f3b363416`
- H5：`https://www.humi-home.com/`
- API：`https://api.humi-home.com`
- 当前状态：H5 与小程序包已上传；提审前 P0/P1 已完成，当前不自动提交审核，需用户确认后进入微信公众平台提交。
- 后端状态：生产 API 已部署 `2c53017c` 并通过线上 health/monitor/readiness；1.1.65 继续复用同一 API 合同，发布前后用 `npm run monitor:prod` 和 `npm run release:status` 复核。
- 操作顺序总览：`docs/humi-1.1-release-operator-handoff.md`。

## 2. 审核通过后立即执行

提交审核前先按 `docs/miniprogram-platform-submit-runbook.md` 完成公众平台字段、隐私保护指引、域名和证据留存检查。

1. 微信公众平台进入“小程序版本管理”。
2. 找到审核通过的当前 1.1 小程序版本。
3. 点击“发布”。
4. 发布后等待 3-10 分钟，再进行真机验证。
5. 在 AI-HQ Humi 状态中记录发布时间、执行人和结果。
6. 在 `docs/humi-1.1-release-evidence-log.md` 填写发布与真机验收证据索引。
7. 填完发布、P0 和 24 小时监控证据后执行：

```bash
npm run release:evidence:check
```

该命令通过后，才说明发布证据日志已经不再依赖口头记忆。

发布后可先用命令登记发布证据：

```bash
HUMI_WECHAT_PUBLISH_TIME='2026-07-04 11:00 CST' \
HUMI_WECHAT_PUBLISHER='honglijie' \
HUMI_WECHAT_PUBLISH_SCREENSHOT='private://humi/wechat-publish-20260704' \
HUMI_WECHAT_P0_DEVICE='iPhone / WeChat version' \
HUMI_WECHAT_ROLLBACK_STATUS='否' \
npm run release:evidence:record:publish
```

## 3. 发布后真机验收

必须用真实微信扫码或搜索小程序验证，不只看开发者工具。

### P0 验收路径

- 打开小程序后可进入 Humi【今晚】，普通启动不被登录墙挡住。
- 【今晚】能看到晚饭推荐菜单。
- 点击“今晚就做”后，菜单进入今日菜单。
- 点击“换一组”后，推荐能更新或本地兜底正常工作。
- 点击“问问大家想吃啥”后，可生成小程序卡片；家人打开 `crave` 卡片后免登录点一个感觉。
- 进入【清单】，可以看到由今晚菜单和三餐轻安排汇总出的食材清单。
- 分享清单后，家人打开 `grocery` 卡片可认领/标记买到；别人已认领的项不能被覆盖。
- 勾选清单食材后，后台已有信号会隐形更新，不出现独立库存维护页。
- 进入【我的家】，能看到微信登录状态、家庭成员、饭线索、想吃池子和忌口入口。
- 点击退出登录后，可以重新触发微信登录。

P0 全部通过后可用命令批量登记：

```bash
HUMI_WECHAT_P0_DEVICE='iPhone / WeChat version' \
HUMI_WECHAT_P0_RESULT='通过' \
HUMI_WECHAT_P0_NOTE='全部 P0 路径通过，证据见 private://humi/p0-20260704' \
npm run release:evidence:record:p0
```

### 生产接口验收

```bash
npm run monitor:prod
npm run release:status
```

期望：

- H5 返回 200。
- API `/health` 返回 `{"ok":true,"service":"humi-api"}`。
- API `/recommend` 返回 `source:"deepseek"`。
- `release:status` 的 `release.engineeringGatesReady` 返回 `true`；只有真实候选复盘也通过后，`release:status ok=true` 才表示可以进入微信审核准备讨论。

## 4. 发布后 24 小时监控

### 每 2-4 小时看一次

- `https://www.humi-home.com/` 是否可打开。
- `https://api.humi-home.com/health` 是否正常。
- 【今晚】推荐是否有明显失败。
- 小程序分享卡片 `crave` / `invite` / `grocery` 是否能直达对应 H5 落地页。
- 是否出现登录后一直“同步中”。
- 是否有用户反馈空白页、打不开、无法提交菜单。

24 小时监控完成后可用命令批量登记：

```bash
HUMI_MONITOR_H5='正常' \
HUMI_MONITOR_API='正常' \
HUMI_MONITOR_RECOMMENDATION='正常' \
HUMI_MONITOR_SHARE='正常' \
HUMI_MONITOR_LOGIN='正常' \
HUMI_MONITOR_FEEDBACK='无 P0/P1' \
HUMI_MONITOR_HANDLING='无需处理' \
npm run release:evidence:record:monitor
```

### 需要立即处理的 P0

- 小程序无法打开 H5。
- 微信登录完全失败，且游客模式无法继续。
- 推荐接口持续失败且本地兜底不可用。
- 菜单/清单核心链路无法完成。
- 隐私、登录、手机号授权相关审核或用户投诉问题。

## 5. 不建议在审核通过前/刚发布后做的事

- 不要上传新版本覆盖当前审核版本，除非审核反馈要求或 P0 链路阻塞。
- 不要清退 Supabase 代码。
- 不要改登录、权限、手机号、生产 API 架构。
- 不要大改 UI 或菜谱数据。
- 不要引入新的审核敏感能力，比如支付、订阅消息、社区、UGC。

## 6. 1.1.x 修复触发条件

出现以下情况才上传新的 1.1.x：

- 审核反馈必须修改。
- P0 核心链路阻塞。
- 明显合规/隐私问题。
- 多个首批用户遇到同一处不可继续的问题。

普通文案、视觉细节、推荐口味不准，先记入 `docs/launch-feedback-and-101-backlog.md`，不急着发版。

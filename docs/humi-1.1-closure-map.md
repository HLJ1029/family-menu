# Humi 1.1 收口地图

更新日期：2026-07-05
执行设备：codex@mbp-m5pro

这页只回答一个问题：现在到底做到哪了，下一步该不该动。

## 当前一句话

Humi 1.1 功能、体验、提审前 P0/P1、生产 API、H5 部署、小程序上传和三类小程序原生分享卡片证据都已完成；当前阶段是继续做 1.1 生产候选完善与内测验证，不自动提交微信审核。只有真实候选复盘达标后，才由用户确认是否进入微信公众平台审核。

## 已完成

- 三份策划书验收矩阵：`npm run release:spec:audit` 通过，27/27 项已完成。
- 提审前 P0/P1：`docs/humi-1.1-pre-review-hardening.md` 全部勾选。
- 小程序上传：`1.1.59` / `原生分享确认页` / AppID `wx4040b89f3b363416`。
- H5 部署：当前 `main` 已由 GitHub Pages 成功部署；最新 run 以 `gh run list --branch main --limit 1` 和 AI-HQ Humi STATUS 为准。
- 生产 API：`https://api.humi-home.com` health/monitor/readiness 通过。
- 分享卡片：`crave-card.png`、`invite-card.png`、`grocery-card.png` 和三张 H5 landing 图均已在私有证据目录校验通过。
- 当前工程门禁：`npm run release:status` 已覆盖文档新鲜度、产品复核锚点、生产候选内测材料、真实候选复盘、复盘脚本自测和提审工作台显式确认护栏；真实候选复盘未通过时 `release.candidateValidationReady=false` 且 `release:status` 应保持 `ok=false`，但 `release.engineeringGatesReady` 可用于判断工程项是否健康。

## 当前停点

不要自动提交审核。当前只做产品复核、体验完善、工程门禁和证据补齐。

最终只有在用户明确确认“进入微信审核”后才执行：

```bash
HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit
```

确认前只做复核：

```bash
npm run release:next
npm run release:product:review
npm run release:candidate:check
npm run release:candidate:review
npm run release:closure
npm run release:wechat:check
```

## 完整上线还差什么

| 阶段 | 当前状态 | 完成证据 |
| --- | --- | --- |
| 10-20 家灰度反馈 | 待真实名单与反馈 | 私有候选执行包、`docs/humi-1.1-gray-release-tracker.md`、`npm run release:candidate:review` |
| 微信公众平台提交审核 | 待候选复盘达标后用户确认 | `docs/humi-1.1-release-evidence-log.md` 第 4 节 |
| 微信审核结果 | 待平台返回 | `docs/humi-1.1-release-evidence-log.md` 第 5 节 |
| 审核通过后发布 | 待审核通过与用户确认 | `docs/humi-1.1-release-evidence-log.md` 第 6 节 |
| 发布后 P0 真机验收 | 待发布后执行 | `docs/humi-1.1-release-evidence-log.md` 第 7 节 |
| 24 小时监控 | 待发布后执行 | `docs/humi-1.1-release-evidence-log.md` 第 8 节 |

## 不再重复做

- 不再重做 1.1 策划书主体功能，除非新测试发现 P0/P1 问题。
- 不再把“问问大家”“发现新菜”“征集单模板”“三类小程序分享卡片”作为开放项。
- 不再用聊天记录判断下一步；以 `npm run release:next`、`npm run release:product:review`、`npm run release:candidate:check`、`npm run release:closure` 和本文件为准。

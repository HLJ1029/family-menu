# Humi 1.1 收口地图

更新日期：2026-07-13
执行设备：codex@mbp-m5pro

这页只回答一个问题：现在到底做到哪了，下一步该不该动。

## 当前一句话

Humi 1.1 已回到“先完成产品功能，再谈审核”的正确顺序。本轮在最新产品分支修复完整菜品库、三餐手选、已安排菜置顶、征集选人、成员写入边界、隐形食材线索、征集跨会话恢复和家庭协作动态，并把小程序分享证据升级为 OCR 语义校验。`docs/humi-1.1-requirement-ledger.md` 现在逐项列出源码和运行证据；家庭订阅是否在 1.1 接入真实支付仍待用户确认，征集与邀请两张微信原生发送框也需重新取证。

## 已完成

- 三份策划书主体矩阵已建立；本轮新增的体验整改以 `npm run release:product:smoke`、`npm run validate:api` 和真机验收共同判断，不再只凭文档行数宣称完成。
- 完整菜品库：138 道菜可从【今晚菜单】或【我的家】进入，已安排菜固定在菜品流上方。
- 三餐选择：早餐与“午餐在家做”先进入完整菜品库，用户点选后才记录。
- 协作分享：主厨创建要求登录，家人首次点感觉/认领买菜仍免登录；产品 smoke 已验证原生分享页调用。
- 征集与权限：发起前先选家庭成员；成员只能改自己的想吃和买菜认领，不能改主厨菜单、画像或权益。
- 游客落地：征集、清单、邀请三类 token 已用全新游客上下文点击验证，不会首屏自动拉起登录。
- 视觉基线：H5、小程序壳和分享页统一为黑白灰，`validate:palette` 防止彩色主题回流。
- 提审前 P0/P1：可本地实现的产品功能已通过自动化；`docs/humi-1.1-pre-review-hardening.md` 仍保留“Plus/家庭订阅范围”和当前候选三张微信原生分享截图开放项。`release:spec:audit` 此时应显示 `localImplementationReady=true`、`specClosureReady=false`。
- 小程序上传：`1.1.59` / `原生分享确认页` / AppID `wx4040b89f3b363416`。
- H5 部署：当前 `main` 已由 GitHub Pages 成功部署；最新 run 以 `gh run list --branch main --limit 1` 和 AI-HQ Humi STATUS 为准。
- 生产 API：`https://api.humi-home.com` health/monitor/readiness 通过。
- 分享卡片：历史买菜卡片曾通过，但不再作为当前候选证据；当前干净证据目录的三张 H5 landing 与三张直达确认页二维码已通过，三类原生发送框都待当前分支重新截取。
- 当前工程门禁：`npm run release:status` 已覆盖文档新鲜度、产品复核锚点、生产候选内测材料、候选包隐私扫描、真实候选复盘、复盘脚本自测和提审工作台显式确认护栏；真实候选复盘未通过时 `release.candidateValidationReady=false` 且 `release:status` 应保持 `ok=false`，但 `release.engineeringGatesReady` 可用于判断工程项是否健康。

## 当前停点

不要自动提交审核。先完成支付范围决策、本轮功能验收、真实微信分享联调和必要修正，再讨论候选内测与审核。
即使工程门禁通过，也只有在真实候选复盘达标后，才由用户决定是否进入微信公众平台审核。

最终只有在用户明确确认“进入微信审核”后才执行：

```bash
HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit
```

确认前只做复核：

```bash
npm run release:next
npm run release:product:review
npm run release:candidate:check
npm run release:candidate:prepare:selftest
npm run release:candidate:desk
npm run release:candidate:desk:selftest
npm run release:candidate:doctor
npm run release:candidate:plan
npm run release:candidate:plan:selftest
npm run release:candidate:dispatch
npm run release:candidate:dispatch:selftest
npm run release:candidate:dispatch:workbench
npm run release:candidate:dispatch:workbench:selftest
npm run release:candidate:invite
npm run release:candidate:invite:selftest
npm run release:candidate:day:close
npm run release:candidate:day:close:selftest
npm run release:candidate:privacy:check
npm run release:candidate:privacy:selftest
npm run release:candidate:review
npm run release:closure
npm run release:wechat:check
```

候选单据模板和设计验收锚点：

```text
docs/humi-1.1-candidate-validation-forms.md
```

## 完整上线还差什么

| 阶段 | 当前状态 | 完成证据 |
| --- | --- | --- |
| 10-20 家灰度反馈 | 待真实名单与反馈 | 私有候选执行包、`docs/humi-1.1-gray-release-tracker.md`、`npm run release:candidate:plan`、`npm run release:candidate:dispatch`、`npm run release:candidate:dispatch:workbench`、`npm run release:candidate:invite`、`npm run release:candidate:day:close`、`npm run release:candidate:privacy:check`、`npm run release:candidate:review` |
| 微信公众平台提交审核 | 待候选复盘达标后用户确认 | `docs/humi-1.1-release-evidence-log.md` 第 4 节 |
| 微信审核结果 | 待平台返回 | `docs/humi-1.1-release-evidence-log.md` 第 5 节 |
| 审核通过后发布 | 待审核通过与用户确认 | `docs/humi-1.1-release-evidence-log.md` 第 6 节 |
| 发布后 P0 真机验收 | 待发布后执行 | `docs/humi-1.1-release-evidence-log.md` 第 7 节 |
| 24 小时监控 | 待发布后执行 | `docs/humi-1.1-release-evidence-log.md` 第 8 节 |

## 不再重复做

- 不再重做 1.1 策划书主体功能，除非新测试发现 P0/P1 问题。
- 不再把“问问大家”“发现新菜”“征集单模板”作为开放项；三类分享代码路径已完成，但征集和邀请原生发送框仍是明确开放证据项。
- 不再用聊天记录判断下一步；以 `npm run release:next`、`npm run release:product:review`、`npm run release:candidate:check`、`docs/humi-1.1-candidate-validation-forms.md`、`npm run release:closure` 和本文件为准。

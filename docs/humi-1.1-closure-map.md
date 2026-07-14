# Humi 1.1 收口地图

更新日期：2026-07-14
执行设备：codex@mbp-m5pro

这页只回答一个问题：现在到底做到哪了，下一步该不该动。

## 当前一句话

Humi 1.1 已形成可供真机验收的生产候选：核心家庭菜单与协作改动已合入 `main`，H5/API 已部署，小程序 `1.1.61` 已上传，线上产品与游客协作 smoke 均为零页面错误。微信审核和正式发布尚未触发；下一步只验证真实微信中的打开、分享和家庭协作，不再扩大 1.1 功能范围。

## 量化进度

下面用固定 100 分衡量“1.1 已经真实发布并可稳定使用”，不按测试命令数量计分。阶段只有达到完成证据才得分，避免用局部完成制造虚假进度。

| 阶段 | 权重 | 当前得分 | 完成证据 / 当前缺口 |
| --- | ---: | ---: | --- |
| 核心家庭菜单与协作功能 | 35 | 35 | 70/70 需求 ID、48/48 规格矩阵、提审前 P0/P1 为 0 |
| 本地生产构建、移动端流程与开发者工具分享验收 | 20 | 20 | 产品 smoke 84/84，三类游客协作通过，`crave`/`invite`/`grocery` 原生虚拟好友卡片通过 OCR 与人工视觉确认 |
| 候选交付到远端并合入发布基线 | 10 | 10 | PR #3、#4 已合并，当前 `origin/main` 为 `88a70abe` |
| 部署 H5/API、上传新小程序候选并完成候选 P0 | 15 | 15 | H5 Pages run `29334784527` 成功；API 已部署并重启；小程序 `1.1.61` 已上传；线上产品与协作 smoke 零错误。真实微信验收进入下一阶段 |
| 真实家庭灰度达到最低样本线 | 10 | 0 | 当前 0/10 真实体验、0/8 完成今晚、0/8 完成清单、0/3 尝试协作 |
| 微信审核、发布与发布后 24 小时监控 | 10 | 0 | 审核、发布、发布后真机和 24 小时监控均未执行，等待候选验收后用户确认 |
| **完整上线总计** | **100** | **80** | **工程与生产候选完成度 100%；完整上线完成度 80%；本轮 H5/API 改动线上可见率 100%，小程序候选已上传但未正式发布** |

剩余 20 分的顺序固定为：真实家庭灰度 10 分 → 用户确认后审核、发布与监控 10 分。任何阶段发现 P0/P1 都回到修复，不跳级计分。

在没有新 P0/P1 的前提下，当前工程候选已可立即真机验收；真实灰度约需 2–5 个自然日，微信平台审核通常还需额外等待。审核和正式发布仍需用户分别确认。

## 已完成

- 三份策划书主体矩阵已建立；本轮新增的体验整改以 `npm run release:product:smoke`、`npm run validate:api` 和真机验收共同判断，不再只凭文档行数宣称完成。
- 完整菜品库：138 道菜可从【今晚菜单】或【我的家】进入，已安排菜固定在菜品流上方。
- 三餐选择：早餐与“午餐在家做”先进入完整菜品库，用户点选后才记录。
- 协作分享：主厨创建要求登录，家人首次点感觉/认领买菜仍免登录；三类分享统一进入原生“发送给家人”子页，桥接成功和失败都有自动化覆盖。
- 征集与权限：发起前先选家庭成员；成员只能改自己的想吃和买菜认领，不能改主厨菜单、画像或权益。
- 游客落地：征集、清单、邀请三类 token 已用全新游客上下文点击验证，不会首屏自动拉起登录。
- 视觉基线：H5、小程序壳和分享页统一为黑白灰，`validate:palette` 防止彩色主题回流。
- 提审前 P0/P1：可本地实现的产品功能已通过自动化，Plus/支付范围已明确列入 1.2，当前候选三张微信原生分享截图也已通过语义与视觉验收；`release:spec:audit` 应显示 `localImplementationReady=true`、`decisionScopeResolved=true`、`specClosureReady=true`。
- 小程序上传：`1.1.61` / `核心菜单与家庭协作验收版` / AppID `wx4040b89f3b363416` / package `20.1 KB`。
- H5 部署：`main` 合并提交 `88a70abe` 已由 GitHub Pages run `29334784527` 成功部署。
- 生产 API：部署提交基线 `2c53017c`，备份 `/opt/humi/backups/20260714T124938Z`，`humi-api.service` 已重启，health/monitor/readiness 通过。
- 分享卡片：当前干净证据目录的三张 H5 landing、三张直达确认页二维码和三类原生发送框均来自当前候选；`release:wechat:share:evidence` 与人工视觉确认已通过。
- 当前工程门禁：`npm run release:status` 已覆盖文档新鲜度、产品复核锚点、生产候选内测材料、候选包隐私扫描、真实候选复盘、复盘脚本自测和提审工作台显式确认护栏；真实候选复盘未通过时 `release.candidateValidationReady=false` 且 `release:status` 应保持 `ok=false`，但 `release.engineeringGatesReady` 可用于判断工程项是否健康。

## 当前停点

先完成产品功能，再谈审核。
先用微信开发者工具或体验版打开 `1.1.61`，完成 1.1 核心菜单与协作真机验收。
不要自动提交审核。真实微信分享联调和必要修正通过后，再讨论候选内测与审核。
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
- 不再把“问问大家”“发现新菜”“征集单模板”和三类原生分享卡片作为开放项；新测试发现 P0/P1 才重新打开。
- 不再用聊天记录判断下一步；以 `npm run release:next`、`npm run release:product:review`、`npm run release:candidate:check`、`docs/humi-1.1-candidate-validation-forms.md`、`npm run release:closure` 和本文件为准。

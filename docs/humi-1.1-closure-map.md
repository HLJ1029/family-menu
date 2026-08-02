# Humi 1.1 收口地图

更新日期：2026-08-02
执行设备：codex@mbp-m5pro

这页只回答一个问题：现在到底做到哪了，下一步该不该动。

## 当前一句话

Humi 1.1 的核心菜单与协作功能已完成工程回归。N5a API 已部署，PR #39 的旧微信 WebView H5 热修复也已完成生产部署；当前体验版 `1.1.78` 已从不可变归档上传，运行时精确绑定 `7606aadcd03dafe9925885b7fef5c308ecfb73e0`。微信审核、正式发布、开关和白名单均未触发，下一检查点是 N5c 的 56 项 iOS/Android 真机证据收集。

## 量化进度

下面用固定 100 分衡量“1.1 已经真实发布并可稳定使用”，不按测试命令数量计分。阶段只有达到完成证据才得分，避免用局部完成制造虚假进度。

| 阶段 | 权重 | 当前得分 | 完成证据 / 当前缺口 |
| --- | ---: | ---: | --- |
| 核心家庭菜单与协作功能 | 35 | 35 | 71/71 需求 ID 均有台账；本地功能完成，`WX-05` 平台/真机证据进行中 |
| 本地生产构建、移动端流程与开发者工具分享验收 | 20 | 20 | 当前产品 smoke、协作 smoke 与核心校验通过；五类 card/landing 证据通过完整性和 OCR 语义门禁 |
| 候选交付到远端并合入发布基线 | 10 | 10 | PR #34 已合入 `main@129da03`；Pages run `29642978938` 成功 |
| 部署 H5/API 并准备新小程序候选 | 10 | 10 | N5a API 与 PR #39 H5 热修复已部署；N5b-1.1.78 已从 `7606aad` 不可变归档上传为体验版，签名机读证据已通过门禁 |
| 用户手机 P0 打开与核心路径 | 5 | 0 | request/downloadFile 真实探测已返回 200；仍需 56 项 iOS/Android 真机、web-view 域名和平台隐私声明证据 |
| 真实家庭灰度达到最低样本线 | 10 | 0 | 当前 0/10 真实体验、0/8 完成今晚、0/8 完成清单、0/3 尝试协作 |
| 微信审核、发布与发布后 24 小时监控 | 10 | 0 | 审核、发布、发布后真机和 24 小时监控均未执行，等待候选验收后用户确认 |
| **完整上线总计** | **100** | **75** | **工程、生产 H5/API 和 1.1.78 体验版上传已完成；剩余是真机证据、web-view/隐私平台证据、真实家庭灰度及用户确认后的审核发布** |

剩余 25 分的顺序固定为：用户手机 P0 5 分 -> 真实家庭灰度 10 分 -> 用户确认后审核、发布与监控 10 分。任何阶段发现 P0/P1 都回到修复，不跳级计分。

当前 request/downloadFile 域名阻塞已解除；剩余 P0 是双海报真机动作和完整 56 项证据未完成。真实灰度约需 2–5 个自然日，微信平台审核通常还需额外等待。审核和正式发布仍需用户分别确认。

## 已完成

- 三份策划书主体矩阵已建立；本轮新增的体验整改以 `npm run release:product:smoke`、`npm run validate:api` 和真机验收共同判断，不再只凭文档行数宣称完成。
- 完整菜品库：138 道菜位于【发现】一级页，【今晚】保留“全部菜品”快捷入口，已安排菜固定在菜品流上方。
- 三餐选择：早餐与“午餐在家做”先进入完整菜品库，用户点选后才记录。
- 升级数据：只清理显式选菜版生产部署前、早餐/午餐中系统自动写入的单条紫菜蛋花汤；晚餐、其他菜和带 `selectionMode=explicit` 的手选记录全部保留。
- 协作分享：主厨创建要求登录，家人首次点感觉/认领买菜仍免登录；`crave`、`invite`、`grocery`、`wish`、`menu` 五类分享统一进入原生“发送给家人”子页，桥接成功、明确失败降级和防重复派发都有自动化覆盖。
- 海报分享：今晚菜单和买菜清单各自保留独立海报入口；H5 生成图片并上传短期临时文件，小程序原生页使用 `wx.showShareImageMenu` 发给家人、使用 `wx.saveImageToPhotosAlbum` 保存相册。产品 smoke 会实际点击两条原生链路。
- 征集与权限：发起前先选家庭成员；成员只能改自己的想吃和买菜认领，不能改主厨菜单、画像或权益。
- 游客落地：征集、清单、想吃可免登录参与；邀请和今晚菜单先展示价值，再按需引导登录。五类 landing 纳入当前证据门禁。
- 视觉基线：H5、小程序壳和分享页统一为黑白灰，`validate:palette` 防止彩色主题回流。
- 提审前 P0/P1：Plus/支付范围已明确列入 1.2；分享 P1 已按当前候选重新关闭，历史三张截图只作为历史记录，当前结论以五张原生发送框和五张 H5 landing 为准。
- 当前已上传体验版：`1.1.78` / `Humi 原生主动登录与家庭协作闭环候选` / AppID `wx4040b89f3b363416` / 精确运行时 `7606aadcd03dafe9925885b7fef5c308ecfb73e0`。
- 上一历史体验版：`1.1.74` / `Humi 原生骨架体验版 N5b（4eb3fbeb）` / 精确运行时 `4eb3fbeb6aba886930b3fda652be96e9246eac9e`。
- 发布基线：PR #34 已合入 `main@129da03`，GitHub Pages run `29642978938` 成功；五类 H5 分享入口各触发一次原生跳转、无降级重复跳转，两张海报可生成；生产产品与协作 smoke、monitor 和 online readiness 通过，页面错误 0。
- 生产 API：部署 `main@129da03`，备份 `/opt/humi/backups/20260718T114140Z`，`humi-api.service` 已重启；health/recommend/monitor/readiness 及短期海报接口 smoke 通过。
- 小程序体验版：`1.1.78` 已从 `7606aadcd03dafe9925885b7fef5c308ecfb73e0` 的不可变归档通过微信开发者工具 CLI 上传，包体 `603694 bytes`；本次未生成预览二维码，未提审、未发布。
- 分享卡片：当前候选已生成五张 H5 landing、五张直达确认页二维码和五类原生发送框；旧三类证据没有复用，当前十张证据均通过门禁。
- 当前工程门禁：`npm run release:status` 已覆盖文档新鲜度、产品复核锚点、生产候选内测材料、候选包隐私扫描、真实候选复盘、复盘脚本自测和提审工作台显式确认护栏；真实候选复盘未通过时 `release.candidateValidationReady=false` 且 `release:status` 应保持 `ok=false`，但 `release.engineeringGatesReady` 可用于判断工程项是否健康。

## 当前停点

先完成产品功能与真机配置，再谈审核。
request/downloadFile 域名已经由正式 AppID、`urlCheck: true` 的真实探测返回 200；仍需在微信后台保存 web-view 业务域名和隐私保护指引截图。
`1.1.78` 已完成不可变归档和体验版上传；下一步需另行授权 N5c，再用真实微信完成 56 项登录、推荐、做饭、家庭、五类分享、双海报、提醒、性能和回滚验收。`1.1.75` 的旧空会话和 `1.1.74` 的旧二维码都不能作为 `1.1.78` 的验收入口，本次 N5b-1.1.78 也未执行 preview。
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
- “问问大家”“发现新菜”和征集单模板继续回归；五类原生分享卡片已因实机问题重新打开，必须按当前候选完成取证。
- 不再用聊天记录判断下一步；以 `npm run release:next`、`npm run release:product:review`、`npm run release:candidate:check`、`docs/humi-1.1-candidate-validation-forms.md`、`npm run release:closure` 和本文件为准。

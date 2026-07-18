# Humi 1.1 收口地图

更新日期：2026-07-18
执行设备：codex@mbp-m5pro

这页只回答一个问题：现在到底做到哪了，下一步该不该动。

## 当前一句话

Humi 1.1 的核心菜单与协作功能已在当前重构 UI 下完成工程回归，本轮小程序候选 `1.1.72` 已合入主线、部署生产并上传体验版。五类分享卡片均进入微信原生发送页，菜单与清单海报也已接入微信原生图片分享和相册保存；当前真机 P0 明确阻断在微信公众平台尚未给 `https://api.humi-home.com` 配置 downloadFile 合法域名。微信审核和正式发布尚未触发。

## 量化进度

下面用固定 100 分衡量“1.1 已经真实发布并可稳定使用”，不按测试命令数量计分。阶段只有达到完成证据才得分，避免用局部完成制造虚假进度。

| 阶段 | 权重 | 当前得分 | 完成证据 / 当前缺口 |
| --- | ---: | ---: | --- |
| 核心家庭菜单与协作功能 | 35 | 35 | 70/70 需求 ID、49/49 规格矩阵、提审前 P0/P1 为 0 |
| 本地生产构建、移动端流程与开发者工具分享验收 | 20 | 20 | 当前产品 smoke、协作 smoke 与核心校验通过；五类 card/landing 证据通过完整性和 OCR 语义门禁 |
| 候选交付到远端并合入发布基线 | 10 | 10 | PR #34 已合入 `main@129da03`；Pages run `29642978938` 成功 |
| 部署 H5/API 并上传新小程序候选 | 10 | 10 | API 已备份并部署 `main@129da03`，生产 smoke 通过；小程序 `1.1.72` 已上传和生成预览二维码 |
| 用户手机 P0 打开与核心路径 | 5 | 0 | DevTools automator 已复现 `downloadFile:fail ... url not in domain list`；先在微信后台添加 downloadFile 合法域名，再扫码确认普通启动、五类卡片、协作回传和双海报原生动作 |
| 真实家庭灰度达到最低样本线 | 10 | 0 | 当前 0/10 真实体验、0/8 完成今晚、0/8 完成清单、0/3 尝试协作 |
| 微信审核、发布与发布后 24 小时监控 | 10 | 0 | 审核、发布、发布后真机和 24 小时监控均未执行，等待候选验收后用户确认 |
| **完整上线总计** | **100** | **75** | **工程、生产部署和 1.1.72 体验版已完成；剩余微信域名配置、手机 P0、真实家庭灰度及用户确认后的审核发布** |

剩余 25 分的顺序固定为：用户手机 P0 5 分 -> 真实家庭灰度 10 分 -> 用户确认后审核、发布与监控 10 分。任何阶段发现 P0/P1 都回到修复，不跳级计分。

在没有新 P0/P1 的前提下，当前工程候选已可立即真机验收；真实灰度约需 2–5 个自然日，微信平台审核通常还需额外等待。审核和正式发布仍需用户分别确认。

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
- 小程序候选：`1.1.72` / `海报原生分享与保存到相册` / AppID `wx4040b89f3b363416`。
- 发布基线：PR #34 已合入 `main@129da03`，GitHub Pages run `29642978938` 成功；五类 H5 分享入口各触发一次原生跳转、无降级重复跳转，两张海报可生成；生产产品与协作 smoke、monitor 和 online readiness 通过，页面错误 0。
- 生产 API：部署 `main@129da03`，备份 `/opt/humi/backups/20260718T114140Z`，`humi-api.service` 已重启；health/recommend/monitor/readiness 及短期海报接口 smoke 通过。
- 小程序体验版：`1.1.72` 已通过微信开发者工具 CLI 上传并生成预览二维码，package 43.1 KB；私有证据 `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.72`。
- 分享卡片：当前候选已生成五张 H5 landing、五张直达确认页二维码和五类原生发送框；旧三类证据没有复用，当前十张证据均通过门禁。
- 当前工程门禁：`npm run release:status` 已覆盖文档新鲜度、产品复核锚点、生产候选内测材料、候选包隐私扫描、真实候选复盘、复盘脚本自测和提审工作台显式确认护栏；真实候选复盘未通过时 `release.candidateValidationReady=false` 且 `release:status` 应保持 `ok=false`，但 `release.engineeringGatesReady` 可用于判断工程项是否健康。

## 当前停点

先完成产品功能与真机配置，再谈审核。
在「小程序后台 -> 开发 -> 开发管理 -> 开发设置 -> 服务器域名」把 `https://api.humi-home.com` 加入 downloadFile 合法域名。微信官方说明每个小程序只能与预先配置的域名通信，开发者工具跳过校验不能作为真机通过证据。
配置生效后重新运行关闭域名跳过选项的 DevTools downloadFile 验证，再用真实微信扫描 `1.1.72` 预览二维码，完成 1.1 核心菜单、五类分享联系人选择与两类海报原生分享/保存验收。
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

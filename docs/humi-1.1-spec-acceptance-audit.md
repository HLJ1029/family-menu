# Humi 1.1 Spec Acceptance Audit

更新日期：2026-07-13
执行设备：codex@mbp-m5pro

本文档把三份 1.1 策划书收敛成验收清单：

- `/Users/honglijie/Downloads/humi 家庭协作 spec.md`
- `/Users/honglijie/Downloads/humi 感觉征集 spec.md`
- `/Users/honglijie/Downloads/humi 结构重构 spec.md`

当前结论：1.1 正在最新 `main` 基线的 `codex/humi-1.1-spec-closure` 分支做功能收口。菜品库、三餐选择、协作发起权限和小程序原生分享动作已有本地点击级证据；支付结算范围仍待产品确认。现在不提交微信审核，也不把历史上传版本当作本轮功能验收结果。

## 1. 当前发布事实

- 当前 `main`、GitHub Pages、线上 readiness 和下一步动作以 `npm run release:status` 输出为准。
- 本轮可验收工作区：`/Users/honglijie/agent-worktrees/humi/humi-1.1-spec-closure`；本地地址：`http://127.0.0.1:4174/`。
- AI-HQ 长期状态账本见 `/Users/honglijie/AI-HQ/projects/humi/STATUS.md`。
- 发布操作者交接单见 `docs/humi-1.1-release-operator-handoff.md`，用于判断下一步和留证要求。
- 发布证据日志见 `docs/humi-1.1-release-evidence-log.md`，用于登记 API 补部署、微信审核、发布和真机 P0 证据索引。
- 最新小程序上传：`1.1.59` / `原生分享确认页` / AppID `wx4040b89f3b363416`。
- 生产 API 健康检查：`https://api.humi-home.com/health` 返回 HTTP 200。
- 生产 API 代码补部署：已完成，备份 `/opt/humi/backups/20260703T045543Z`，`humi-api.service` 已重启，详见 `docs/humi-1.1-release-evidence-log.md`。

## 2. 验收矩阵

| 规格要求 | 当前状态 | 证据 |
| --- | --- | --- |
| 三 tab 定版：【今晚】/【清单】/【我的家】 | 已完成 | `src/components/navigation.js` 只暴露 `dashboard/grocery/user` 作为 `navItems` 和 `mobileNavItems` |
| 发现/自己挑降为辅助页，并保留补菜通路 | 已完成 | `src/components/Library.jsx` 使用小红书式图片卡片，主动作是 `补进今晚`；`navigation.js` 把 `library` 放在 `auxiliaryNavItems` |
| 推荐外提供完整菜品库子页面，已安排菜置顶 | 已完成 | `Library.jsx` 展示全部 138 道菜，将已安排菜从瀑布流移到顶部 `selected-recipes-panel`；`release:product:smoke` 校验置顶顺序与完整数量 |
| 【今晚菜单】加菜不降级为列表 | 已完成 | `src/components/TodayMenu.jsx` 的内嵌选菜区保留图片卡片，并提供 `发现新菜` 入口进入完整【自己挑】菜品页 |
| 周计划降级为【今晚】辅助入口 | 已完成 | `navigation.js` 中 `planner` 为辅助项，展示文案为 `想连排几天` |
| 【今晚】首屏主角是晚饭推荐和 `今晚就做` | 已完成 | `src/components/Dashboard.jsx` 把主行动放在推荐摘要后、菜品细节前；产品 smoke 在 390×844 视口实测主按钮完整位于底部导航上方 |
| 早餐/午餐纳入数据但不抢晚饭主线 | 已完成 | `Dashboard.jsx` 将 `MealRhythmPanel` 放到晚饭决策与确认之后；产品 smoke 校验 DOM 顺序；`src/lib/mealPlan.js` 支持 `breakfast/lunch/dinner` |
| 早餐/午餐在家吃时由用户选菜，不擅自记录默认菜 | 已完成 | `src/main.jsx` 将早餐和午餐在家做入口带到完整菜品库；产品 smoke 证明点选前早餐为空、点选后只写入用户选择的菜，且不会默认写紫菜蛋花汤 |
| 清单汇总三餐食材 | 已完成 | `src/lib/mealPlan.js` 的 `mealPlanEntriesForGroceries` 与 `src/lib/insights.js` 将 `mealPlan` 纳入 grocery 汇总；`validate:api` 覆盖三餐 state |
| 库存完全隐形，不做页面、数量或批量维护 | 已完成 | `InventoryPage.jsx` 已删除；`GroceryList.jsx` 移除“后台已有”面板、数量与批处理；`release:product:smoke` 验证清单页不暴露维护界面 |
| 清单勾选反推后台已有，做饭确认扣减 | 已完成 | `src/main.jsx` 维护 `pantryItems`；`Dashboard.jsx` 提供“家里还有 X 吗”轻确认；AI-HQ 状态记录 1.1.29 闭环 |
| 忌口是硬约束，软口味不做设置表 | 已完成 | `validate:recommendation` 覆盖硬忌口；`UserCenter.jsx` 保留忌口/画像编辑，不再暴露软口味偏好表 |
| 【我的家】从资料页升级为协作主场 | 已完成 | `UserCenter.jsx` 首屏为“家里的饭线索”，包含家庭动态、问问大家、想吃池子、推荐权益 |
| 协作动态沉淀认领、做饭确认和想吃 | 已完成 | `UserCenter.jsx` 的 `groceryActivity/dinnerActivity/wantActivity`；产品 smoke 验证三类动态的用户可见文案 |
| 主厨/家人角色边界 | 已完成 | `api/store.js` 的 owner/member 检查；`validate:api` 覆盖普通成员征集、邀请、清单分享 403；`release:product:smoke` 验证家人点“今晚就做”不会改写菜单 |
| 征集发起先选择家庭成员 | 已完成 | `CraveStarterSheet` 默认勾选当前家庭其他正式成员，并把 `recipientIds` 提交到 API；无成员时仍可生成公开征集卡 |
| 成员只能写自己的参与数据 | 已完成 | `api/store.js` 的 `mergeMemberWritableState` 只合并本人想吃条目和买菜认领；菜单、画像、权益保持主厨版本；界面上家人也只能维护自己的想吃条目 |
| 协作发起必须登录，家人参与仍免登录 | 已完成 | `api/server.js` 对征集与清单创建要求主厨会话并校验 owner；`validate:api` 覆盖匿名 401、家人 403，公开 vote/claim 仍可用 |
| 家人打开分享卡片先免登录参与 | 已完成 | `src/components/CraveLanding.jsx` 与 `GroceryShareLanding.jsx` 支持公开 token 落地与临时参与 |
| 家人点完感觉后再引导加入家庭 | 已完成 | `CraveLanding.jsx` 点感觉后展示结果/加入引导；`/crave-requests/:token/join` 合并临时 vote |
| 感觉标签控制在低思考范围，并包含“随便都行” | 已完成 | `Dashboard.jsx` 和 `CraveLanding.jsx` 提供 `随便都行/辣一点/清淡点/想喝汤/想吃肉/想吃素/不想动/想暖胃/开胃 / 酸` |
| 主厨可“我自己做主”，单人也能走完 | 已完成 | `Dashboard.jsx` 与 `UserCenter.jsx` 的 `onDecideAlone` 路径；无人参与也可出菜单 |
| 等待态可手动出菜单，超时有退路 | 已完成 | `CraveCollectingSheet` 根据 `deadlineAt` 显示倒计时和 `现在出菜单`；API 持久化主厨 `initialFeelingTag`，产品 smoke 验证无人回复超时后仍按主厨感觉出菜单 |
| 征集状态跨会话恢复，超时后主厨身份安全收口 | 已完成 | API 安全保存 `craveSignals` 且去除 owner secret；产品 smoke 从过期持久化征集自动出菜单，并用 Bearer 主厨会话关闭 |
| 家人选填备注默认折叠 | 已完成 | `CraveVoteSheet` 首屏只显示“想补一句？”弱操作；游客 smoke 先确认输入框不存在，展开后仍可提交 |
| 征集结果可勾选收敛到今晚菜单和清单 | 已完成 | `Dashboard.jsx` 的 `craveSelectionMode` 支持勾选菜卡，按钮 `就做选中的 X 道` |
| 每道菜展示“为什么推它” | 已完成 | `Dashboard.jsx` 的 `buildDishReason` 结合家人感觉、后台已有、忌口和推荐来源 |
| 晚间轻确认包含“不记录” | 已完成 | `Dashboard.jsx` 的 `dinnerSources` 包含 `skip/不记录`，晚饭确认区也有 `不记录` |
| 买菜认领可回传，且防重复认领/覆盖 | 已完成 | `GroceryShareLanding.jsx` 与 `api/store.js` claims；`validate:api` 覆盖 409 冲突 |
| 想吃池子可由家人/主厨沉淀并参与推荐 | 已完成 | `UserCenter.jsx` 想吃池子入口；`src/lib/recommendation/rules.js` 使用 `wantToEatItems` 排序 |
| 精准推荐走成本闸门，基础功能免费无限 | 已完成 | `api/server.js` `/recommend` 与 `/explain` 鉴权/402；`UserCenter.jsx` 推荐权益文案；`validate:api` 覆盖 |
| 精准推荐缓存复用 | 已完成 | `src/main.jsx` 的 `buildPreciseRecommendationCacheKey` 与本地缓存路径 |
| 推荐参考本家最近饮食且不跨请求污染 | 已完成 | `collectRecentRecipeIds` 每次从本家周计划与 `mealLogs` 建集；`validate:recommendation` 同时验证降重与请求隔离 |
| 历史感觉和做饭确认会反哺后续推荐 | 已完成 | `collectLearnedCraveVotes` 只读取已结束征集；`collectMealHistoryTaste` 从确认吃过的菜提取常做类型轻加分，同时保留同一道菜近期降权；`validate:recommendation` 覆盖 |
| 推荐权益不可由客户端升级 | 已完成 | `api/store.js` 的 `mergeClientRecommendationAccess` 保持服务端 plan，次数只能消耗不能恢复；`validate:api` 覆盖伪造 Plus 和重置次数 |
| 黑白灰调色板 | 已完成 | H5、小程序壳、分享页和海报去除彩色主题；`npm run validate:palette` 扫描非中性 hex/RGB/Tailwind 颜色 |
| 三类分享落地页游客烟测 | 已完成 | `release:collaboration:smoke` 用新游客上下文验证征集免登录投票、清单免登录认领、邀请先展示价值后登录，且不会自动发起微信登录 |
| 小程序分享路径覆盖 `crave`/`invite`/`grocery` | 已完成 | `miniprogram/pages/index/index.js` 与 H5 落地页组件覆盖三类 token |
| 清单分享与感觉征集确实唤起小程序原生分享页 | 已完成 | `release:product:smoke` 模拟 `wx.miniProgram`，点击验证 `postMessage` 与 `/pages/share/index?type=grocery|crave` 两个动作 |
| 小程序普通启动不被登录墙挡住 | 已完成 | 小程序壳先加载 H5 并后台尝试登录；`docs/launch-day-runbook.md` 把该项列入 P0 真机验收 |
| 发布材料去除旧“首页/周计划/库存管理”主路径口径 | 已完成 | `docs/miniprogram-launch-readiness.md`、`docs/launch-day-runbook.md`、`docs/miniprogram-review-materials.md` 已更新为 1.1 三 tab 口径 |

## 3. 仍未完成或仍需外部确认

| 项目 | 状态 | 下一步 |
| --- | --- | --- |
| 家庭订阅真实支付结算 | 待用户确认 | 确认 1.1 接入微信支付，或明确将结算列入 1.2；当前已完成精准尝鲜、Plus 权益和 API 成本闸门，但没有支付下单闭环 |
| 生产 API 补部署 | 已完成 | `docs/humi-1.1-release-evidence-log.md` 记录备份、重启、monitor、readiness 和 public smoke 证据 |
| 微信公众平台提交审核/发布 | 暂缓 | 候选复盘达标并由用户动作当下确认后，再按 `docs/miniprogram-platform-submit-runbook.md` 提交审核，审核通过后按 `docs/launch-day-runbook.md` 发布并做真机 P0 验收 |
| 10-20 个家庭灰度名单与反馈表 | 模板已准备，待填真实名单 | 使用 `docs/humi-1.1-gray-release-tracker.md` 和 `docs/launch-feedback-and-101-backlog.md` 收集首批反馈 |
| 生产真机全路径证据 | 待小程序发布后验证 | 发布后用真实微信验证普通启动、`crave`、`invite`、`grocery`、微信登录、清单回传，并记录到 `docs/humi-1.1-release-evidence-log.md` |

## 4. 当前建议顺序

1. 以本台账和本地移动端页面完成全部功能闭环；支付范围只保留为用户决策，不用审核材料替代产品功能。
2. 用户确认家庭订阅在 1.1 接入真实微信支付，或明确进入 1.2；未确认前不启动支付工程。
3. 用户在 `http://127.0.0.1:4174/` 验收功能和体验。未通过就继续修，不部署、不上传。
4. 验收通过后再部署 H5/API，并在微信开发者工具中连调普通启动、征集、邀请和清单三类小程序卡片。
5. 开发者工具与真机候选体验通过后，再准备 10–20 个家庭灰度；反馈进入私有候选执行包，不把真实身份信息写进仓库。
6. 灰度无 P0/P1 且用户动作当下确认后，才进入微信公众平台审核；审核通过后发布并登记 24 小时监控与真机证据。

## 5. 验证命令

发布前至少跑：

```bash
npm run release:status
npm run release:spec:audit
npm run build
npm run validate:api
npm run validate:recommendation
npm run release:check
npm run release:check:online
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

生产 API 恢复 SSH 并补部署后，再跑：

```bash
npm run deploy:api:check
npm run monitor:prod
npm run release:check:online
```

# Humi 1.1 Spec Acceptance Audit

更新日期：2026-07-03
执行设备：codex@mbp-m5pro

本文档把三份 1.1 策划书收敛成验收清单：

- `/Users/honglijie/Downloads/humi 家庭协作 spec.md`
- `/Users/honglijie/Downloads/humi 感觉征集 spec.md`
- `/Users/honglijie/Downloads/humi 结构重构 spec.md`

当前结论：产品代码、H5 发布、小程序上传和本地 smoke 已覆盖 1.1 主体闭环；剩余未完成项主要是外部状态，不是继续改 H5 页面本身。

## 1. 当前发布事实

- 最新 `main`：`2d8426c`（Pages retry 空提交；业务/docs 提交 `51015e7`）。
- 最新 GitHub Pages：run `28627642169` / success / `npm run release:check:online` 已通过。
- 最新小程序上传：`1.1.54` / `征集加入状态同步` / AppID `wx4040b89f3b363416`。
- 生产 API 健康检查：`https://api.humi-home.com/health` 返回 HTTP 200。
- 生产 API 代码补部署：未完成，原因是当前设备无法 SSH 登录 `api.humi-home.com`，详见 `docs/humi-api-production-deploy-runbook.md`。

## 2. 验收矩阵

| 规格要求 | 当前状态 | 证据 |
| --- | --- | --- |
| 三 tab 定版：【今晚】/【清单】/【我的家】 | 已完成 | `src/components/navigation.js` 只暴露 `dashboard/grocery/user` 作为 `navItems` 和 `mobileNavItems` |
| 发现/自己挑降为辅助页，并保留补菜通路 | 已完成 | `src/components/Library.jsx` 使用小红书式图片卡片，主动作是 `补进今晚`；`navigation.js` 把 `library` 放在 `auxiliaryNavItems` |
| 周计划降级为【今晚】辅助入口 | 已完成 | `navigation.js` 中 `planner` 为辅助项，展示文案为 `想连排几天` |
| 【今晚】首屏主角是晚饭推荐和 `今晚就做` | 已完成 | `src/components/Dashboard.jsx` 首屏标题来自晚饭推荐/今日菜单，主按钮为 `今晚就做` 或 `查看今晚菜单` |
| 早餐/午餐纳入数据但不抢晚饭主线 | 已完成 | `Dashboard.jsx` 的 `MealRhythmPanel` 处理早餐轻记录、午餐来源；`src/lib/mealPlan.js` 支持 `breakfast/lunch/dinner` |
| 清单汇总三餐食材 | 已完成 | `src/lib/mealPlan.js` 的 `mealPlanEntriesForGroceries` 与 `src/lib/insights.js` 将 `mealPlan` 纳入 grocery 汇总；`validate:api` 覆盖三餐 state |
| 不做独立库存维护页 | 已完成 | `src/components/InventoryPage.jsx` 已删除；`navigation.js` 无 `inventory`；界面使用“后台已有”轻确认 |
| 清单勾选反推后台已有，做饭确认扣减 | 已完成 | `src/main.jsx` 维护 `pantryItems`；`Dashboard.jsx` 提供“家里还有 X 吗”轻确认；AI-HQ 状态记录 1.1.29 闭环 |
| 忌口是硬约束，软口味不做设置表 | 已完成 | `validate:recommendation` 覆盖硬忌口；`UserCenter.jsx` 保留忌口/画像编辑，不再暴露软口味偏好表 |
| 【我的家】从资料页升级为协作主场 | 已完成 | `UserCenter.jsx` 首屏为“家里的饭线索”，包含家庭动态、问问大家、想吃池子、推荐权益 |
| 主厨/家人角色边界 | 已完成 | `api/store.js` 的 owner/member 检查；`validate:api` 覆盖普通成员征集、邀请、清单分享 403 |
| 家人打开分享卡片先免登录参与 | 已完成 | `src/components/CraveLanding.jsx` 与 `GroceryShareLanding.jsx` 支持公开 token 落地与临时参与 |
| 家人点完感觉后再引导加入家庭 | 已完成 | `CraveLanding.jsx` 点感觉后展示结果/加入引导；`/crave-requests/:token/join` 合并临时 vote |
| 感觉标签控制在低思考范围，并包含“随便都行” | 已完成 | `Dashboard.jsx` 和 `CraveLanding.jsx` 提供 `随便都行/辣一点/清淡点/想喝汤/想吃肉/想吃素/不想动/想暖胃/开胃 / 酸` |
| 主厨可“我自己做主”，单人也能走完 | 已完成 | `Dashboard.jsx` 与 `UserCenter.jsx` 的 `onDecideAlone` 路径；无人参与也可出菜单 |
| 等待态可手动出菜单，超时有退路 | 已完成 | `CraveRequestPanel` 根据 `deadlineAt` 显示倒计时和 `就这些，出菜单`；本地逻辑超时出菜单 |
| 征集结果可勾选收敛到今晚菜单和清单 | 已完成 | `Dashboard.jsx` 的 `craveSelectionMode` 支持勾选菜卡，按钮 `就做选中的 X 道` |
| 每道菜展示“为什么推它” | 已完成 | `Dashboard.jsx` 的 `buildDishReason` 结合家人感觉、后台已有、忌口和推荐来源 |
| 晚间轻确认包含“不记录” | 已完成 | `Dashboard.jsx` 的 `dinnerSources` 包含 `skip/不记录`，晚饭确认区也有 `不记录` |
| 买菜认领可回传，且防重复认领/覆盖 | 已完成 | `GroceryShareLanding.jsx` 与 `api/store.js` claims；`validate:api` 覆盖 409 冲突 |
| 想吃池子可由家人/主厨沉淀并参与推荐 | 已完成 | `UserCenter.jsx` 想吃池子入口；`src/lib/recommendation/rules.js` 使用 `wantToEatItems` 排序 |
| 精准推荐走成本闸门，基础功能免费无限 | 已完成 | `api/server.js` `/recommend` 与 `/explain` 鉴权/402；`UserCenter.jsx` 推荐权益文案；`validate:api` 覆盖 |
| 精准推荐缓存复用 | 已完成 | `src/main.jsx` 的 `buildPreciseRecommendationCacheKey` 与本地缓存路径 |
| 小程序分享路径覆盖 `crave`/`invite`/`grocery` | 已完成 | `miniprogram/pages/index/index.js` 与 H5 落地页组件覆盖三类 token |
| 小程序普通启动不被登录墙挡住 | 已完成 | 小程序壳先加载 H5 并后台尝试登录；`docs/launch-day-runbook.md` 把该项列入 P0 真机验收 |
| 发布材料去除旧“首页/周计划/库存管理”主路径口径 | 已完成 | `docs/miniprogram-launch-readiness.md`、`docs/launch-day-runbook.md`、`docs/miniprogram-review-materials.md` 已更新为 1.1 三 tab 口径 |

## 3. 仍未完成或仍需外部确认

| 项目 | 状态 | 下一步 |
| --- | --- | --- |
| 生产 API 补部署 | 阻塞 | 恢复 `api.humi-home.com` SSH 后执行 `docs/humi-api-production-deploy-runbook.md`，部署 1.1.37-1.1.54 后端增量 |
| 微信公众平台提交审核/发布 | 待平台侧操作 | 按 `docs/launch-day-runbook.md` 提交审核，审核通过后点击发布并做真机 P0 验收 |
| 10-20 个家庭灰度名单与反馈表 | 待运营侧准备 | 使用 `docs/launch-feedback-and-101-backlog.md` 收集首批反馈 |
| 生产真机全路径证据 | 待小程序发布后验证 | 发布后用真实微信验证普通启动、`crave`、`invite`、`grocery`、微信登录、清单回传 |

## 4. 当前建议顺序

1. 先恢复生产 API SSH，并补部署 API 增量。
2. 再进入微信公众平台提交审核/发布。
3. 发布后按 `docs/launch-day-runbook.md` 做 P0 真机验收。
4. 灰度给 10-20 个家庭，反馈统一进 `docs/launch-feedback-and-101-backlog.md`，只在 P0/审核问题时发 1.1.x。

## 5. 验证命令

发布前至少跑：

```bash
npm run build
npm run validate:api
npm run validate:recommendation
npm run release:check
npm run release:check:online
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

生产 API 恢复 SSH 并补部署后，再跑：

```bash
npm run monitor:prod
npm run release:check:online
```

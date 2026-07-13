# Humi 1.1 需求完成台账

更新日期：2026-07-13  
执行设备：codex@mbp-m5pro

本台账是三份策划书的逐项完成性记录，不用“有页面”代替“行为已完成”：

- `/Users/honglijie/Downloads/humi 家庭协作 spec.md`
- `/Users/honglijie/Downloads/humi 感觉征集 spec.md`
- `/Users/honglijie/Downloads/humi 结构重构 spec.md`

状态只有三种：

- `已完成`：有对应源码和运行/测试证据。
- `待用户决策`：产品范围未定，不擅自实现。
- `待验收后外部动作`：功能不因此缺失，但线上体验不会在部署/上传前变化。

## 1. 结构与主线

| ID | 策划要求 | 状态 | 权威证据 |
| --- | --- | --- | --- |
| STR-01 | 底部只有【今晚】/【清单】/【我的家】三 tab | 已完成 | `src/components/navigation.js`；`release:spec:audit` |
| STR-02 | 完整菜品库是推荐外的辅助子页，手机端可从【今晚】发现并直接补菜 | 已完成 | 【今晚】首屏提供 `自己挑` 次级入口；`release:product:smoke` 从该入口真实进入双列菜品库，检测 138 道菜，并点击青椒土豆丝 `补进今晚`，验证同步写入今晚菜单与晚餐计划 |
| STR-03 | 今晚已安排菜固定在新菜流上方 | 已完成 | `selected-recipes-panel`；`arranged-dishes-before-library-filters` |
| STR-04 | `今晚就做`/补菜后自动进今晚计划与清单 | 已完成 | 产品 smoke 真实点击 `今晚就做`，验证两道推荐同时写入 `todayMenu`、当日晚餐 `mealPlan`，并自动生成 24 个清单勾选项 |
| STR-05 | 周计划降为“想连排几天”辅助入口 | 已完成 | `navigation.js`、`Dashboard.jsx` |
| STR-06 | 搜索默认收起，需要时再展开 | 已完成 | `AppShell.jsx` 的 `searchOpen` |
| STR-07 | 页级标题不抢主角 Display | 已完成 | `AppShell.jsx` 标题降为 24/30px |

## 2. 三餐、清单与隐形食材线索

| ID | 策划要求 | 状态 | 权威证据 |
| --- | --- | --- | --- |
| MEAL-01 | 晚饭仍是首屏主角，主行动在手机首屏内 | 已完成 | `Dashboard.jsx`；`tonight-primary-action-is-in-first-viewport` 实测按钮底部不进入导航遮挡区，早午餐位于晚饭决策之后 |
| MEAL-02 | 早餐是轻量选择，不擅自记默认菜 | 已完成 | `breakfast-empty-before-user-pick`、`breakfast-does-not-default-to-seaweed-soup` |
| MEAL-03 | 午餐以来源记录为主，在家做才选菜 | 已完成 | 产品 smoke 真实点击午餐“在家做”，验证选择前为空、用户点青椒土豆丝后才写入，且不会默认紫菜蛋花汤 |
| MEAL-04 | 三餐食材统一汇总清单 | 已完成 | `mealPlanEntriesForGroceries`；`validate:api` |
| MEAL-05 | 晚间确认含做了/换了/外食/不记录 | 已完成 | `quickConfirmDinner`、`Dashboard.jsx` |
| LIST-01 | 清单可直接打开、勾选、显示进度和用量 | 已完成 | `GroceryList.jsx`；产品 smoke |
| LIST-02 | 勾选买回与做饭确认在后台反推/扣减食材 | 已完成 | 产品 smoke 真实勾选西红柿后验证隐藏食材线索写入，再点“做了”验证扣减及 `mealLogs` 写入 |
| LIST-03 | 用户不看库存页、数量或批量维护面板 | 已完成 | `GroceryList.jsx` 已移除“后台已有”面板；`inventory-maintenance-is-not-exposed` |
| LIST-04 | 仅在用到时轻问“家里还有 X 吗” | 已完成 | `Dashboard.jsx` 的 `pantryCheckItem` |
| LIST-05 | 营养视图归【我的家】，不占清单入口 | 已完成 | `nutrition-entry-is-not-on-grocery-tab`；`UserCenter.jsx` |
| LIST-06 | 清单空状态中性、无大插图 | 已完成 | `NeutralEmptyState`；`GroceryList.jsx` |

## 3. 家庭协作与身份

| ID | 策划要求 | 状态 | 权威证据 |
| --- | --- | --- | --- |
| COL-01 | Household 多成员共享同一份菜单、清单和画像 | 已完成 | `api/store.js`；`validate:api` 的 owner/member 共享状态 |
| COL-02 | 一人可属于多个家并切换 | 已完成 | `/households`、`/households/active`；`validate:api` |
| COL-03 | 主厨可发起/定菜单/管理家；家人只参与 | 已完成 | `mergeMemberWritableState`；成员 UI/API 点击边界 smoke |
| COL-04 | 家人首次免登录点感觉 | 已完成 | `CraveLanding.jsx`；`release:collaboration:smoke` |
| COL-05 | 投票后再引导登录加入家庭 | 已完成 | `CraveSubmittedSheet`、`joinCraveRequest`；`validate:api` |
| COL-06 | 临时 vote 登录后合并到正式成员 | 已完成 | `claimCraveVote`；`validate:api` |
| COL-07 | 买菜认领免登录、可回传、防重复 | 已完成 | `GroceryShareLanding.jsx`；`release:collaboration:smoke`、`validate:api` |
| COL-08 | 家人可丢想吃，但只能维护自己条目 | 已完成 | 正式成员使用 `WantToEatRow`；临时家人在 `InviteLanding` 免登录提交，`/household-invites/:token/wants` 写入家庭想吃池，加入后归并正式身份；API 与游客 smoke 覆盖 |
| COL-09 | 【我的家】先展示协作动态，设置下沉，征集单按需展开 | 已完成 | 今晚页头像可直达【我的家】；`family-activity-section` 位于账号设置前；默认折叠 `CraveStarterSheet`；产品 smoke 验证入口、买菜/做饭/想吃三类动态和 DOM 顺序 |
| COL-10 | 征集状态能跨登录/设备恢复，且不泄露 owner secret | 已完成 | `sanitizeCraveSignal`、`setCraveSignals`；`validate:api` |

## 4. 感觉征集 A–F

| ID | 策划要求 | 状态 | 权威证据 |
| --- | --- | --- | --- |
| CRV-A1 | 发起前默认全选已加入家人 | 已完成 | `CraveStarterSheet`；`crave-members-default-selected` |
| CRV-A2 | 单人可“我自己做主” | 已完成 | `decideAloneFromCrave`；无成员时仍可生成卡片 |
| CRV-B1 | 卡片第一屏直接感觉标签，无登录墙 | 已完成 | `crave-first-screen-is-guest-usable`、`landings-do-not-auto-login` |
| CRV-B2 | 感觉标签不超过 9 个，“随便都行”最显眼 | 已完成 | `feelingTags`、`FeelingWall` |
| CRV-B3 | 选填备注默认折叠 | 已完成 | `CraveVoteSheet`；`crave-optional-note-is-collapsed` |
| CRV-C1 | 提交后立即反馈，可跳过加入 | 已完成 | `CraveSubmittedSheet`；游客协作 smoke |
| CRV-D1 | 等待态展示回复者和感觉，可手动出菜单 | 已完成 | `CraveCollectingSheet`、`VoteReceiptRow` |
| CRV-D2 | 没人回/到期也按主厨初始感觉自动出菜单 | 已完成 | API 持久化 `initialFeelingTag`；`persisted-crave-auto-generates-after-deadline` 与 `no-reply-crave-keeps-initiator-feeling` |
| CRV-D3 | 主厨登录身份可安全收口，家人不能关闭 | 已完成 | `authenticated owner should close`、成员 403 API smoke |
| CRV-D4 | 推荐优先遵守忌口，再照顾感觉/食材/历史 | 已完成 | `validate:recommendation`；`collectRecentRecipeIds` |
| CRV-D5 | 历史推荐不跨家庭/请求污染 | 已完成 | `validate:recommendation` 历史隔离回归测试 |
| CRV-D6 | 每道菜展示“为什么推它” | 已完成 | `buildDishReason`、`Dashboard.jsx` |
| CRV-E1 | 征集结果勾选后一次落进今晚与清单 | 已完成 | 产品 smoke 在无人回复超时菜单点击 `就做选中的 2 道`，验证两道汤同步进入今晚菜单、晚餐计划并生成 30 个清单勾选项 |
| CRV-E2 | 有换一组/都不想吃退路 | 已完成 | `Dashboard.jsx` 的征集结果操作 |
| CRV-F1 | 晚间轻确认作为记录副产品 | 已完成 | `quickConfirmDinner`、`buildFamilyReflections` |

## 5. 推荐、画像与付费线

| ID | 策划要求 | 状态 | 权威证据 |
| --- | --- | --- | --- |
| REC-01 | 感觉征集、基础推荐、清单和认领免费无限 | 已完成 | 基础路径不走 402/次数闸门；`validate:api` |
| REC-02 | 精准推荐有尝鲜额度与 API 成本闸门 | 已完成 | `/recommend`、`/explain`；`validate:api` |
| REC-03 | 客户端不能伪造 Plus/恢复额度 | 已完成 | `mergeClientRecommendationAccess`；`validate:api` |
| REC-04 | 相同推荐上下文缓存复用 | 已完成 | `buildPreciseRecommendationCacheKey`，已包含 candidates/历史/反馈 |
| REC-05 | 早期数据少也给画像反射 | 已完成 | `buildFamilyReflections` 的感觉/三餐/想吃/初始反射 |
| REC-06 | 历史感觉与确认做过的菜反哺推荐，但不原菜循环 | 已完成 | `collectLearnedCraveVotes`、`collectMealHistoryTaste`；`validate:recommendation` 验证已结束征集沉淀、常做类型轻加分和近期原菜降权 |
| PAY-01 | 1.1 是否接入真实微信支付、订单回调和权益发放 | 待用户决策 | 必须在“1.1 接入”与“明确放到 1.2”中选择；未确认前不动支付 |

## 6. 小程序分享与视觉

| ID | 策划要求 | 状态 | 权威证据 |
| --- | --- | --- | --- |
| WX-01 | `crave`/`invite`/`grocery` 三类小程序卡片路径 | 已完成 | `release:wechat:share:selftest` |
| WX-02 | 清单与征集按钮真实调用 `postMessage + navigateTo` | 已完成 | `release:product:smoke` |
| WX-03 | 三类 token 落地页不自动登录 | 已完成 | `release:collaboration:smoke` |
| UI-01 | 主界面与小程序壳仅使用黑白灰 | 已完成 | `validate:palette` 扫描 76 个文件 |
| UI-02 | 完整菜品库使用双列图片卡片流 | 已完成 | `Library.jsx`；`discovery-mobile.png` |
| UI-03 | 空状态中性、无愧疚和大插图 | 已完成 | 清单与今晚菜单的轻空状态 |
| UI-04 | 主操作保持唯一黑色实心，重复认领/添加降为次级 | 已完成 | `Dashboard.jsx`、`GroceryList.jsx`；移动端截图复验 |

## 7. 当前不做的外部动作

| ID | 项目 | 状态 | 触发条件 |
| --- | --- | --- | --- |
| EXT-01 | 部署本轮 H5/API | 待验收后外部动作 | 用户在 `http://127.0.0.1:4174/` 验收本轮功能后确认 |
| EXT-02 | 上传新小程序版本 | 待验收后外部动作 | H5/API 部署并在开发者工具中连调后由用户确认 |
| EXT-03 | 微信审核/发布 | 待验收后外部动作 | 真实候选验收通过，且用户在动作当下明确确认 |

## 8. 本地完成证明

```bash
npm run build
npm run validate:api
npm run validate:recommendation
npm run validate:crave-template
npm run validate:data
npm run validate:images
npm run validate:characters
npm run validate:palette
npm run release:product:review
npm run release:product:smoke -- --base-url http://127.0.0.1:4174/
npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4174/
npm run release:wechat:share:selftest
npm run release:spec:audit
npm run release:docs:check
npm run release:security:audit
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

本地功能完成不等于线上已变更。用户验收前，不部署、不上传、不提审。

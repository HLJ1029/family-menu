# Humi 1.1 提审前产品打磨清单

更新日期：2026-07-04
执行设备：codex@mbp-m5pro

本文档是 1.1 进入微信审核前的产品收口单。当前策略是先把功能、体验和证据逐步完善，再进入微信公众平台审核；不再把“立即提审”作为默认下一步。

## 当前原则

- 小程序 `1.1.59` 已上传，但暂不提交审核。
- `npm run release:status` 会读取本文件；只要仍有未勾选的 P0/P1 项，就不视为提审就绪。
- `npm run release:pre-review:evidence` 会生成私有证据总览，集中展示征集单模板视觉图、小程序 H5 落地页截图、三张直达原生分享确认页二维码和三张微信原生 card 图缺口。
- `npm run release:product:review` 会机器复核本页最容易反复讨论的产品锚点：发现新菜、我的家问问大家、今晚征集单模板、三类小程序分享卡片证据和微信审核显式确认护栏。
- `npm run release:spec:audit` 会把三份策划书、验收矩阵和当前 P0/P1 gate 做机器复核，防止文档只存在但没有覆盖要求。
- P0/P1 完成后，再重新跑 `npm run release:next`；命令应停在“等待用户确认是否进入微信审核”，不自动推动平台提交。
- P2 可以进入灰度后继续迭代，但不能影响 P0 主路径体验。

## P0/P1 收口项

- [x] P1 自己挑/今晚菜单选菜：从【今晚菜单】进入选菜时，必须保留小红书式图片卡片，并提供清晰入口打开完整【自己挑】菜品页，用于发现新菜。
  - 完成标准：`TodayMenu` 内嵌选菜区有完整菜品页入口；空搜索结果有回退动作；移动端不被底部导航遮挡。
  - 验证：`npm run build`，并用移动端视口查看【今晚菜单】加菜区。
  - 证据：`src/components/TodayMenu.jsx` 增加“发现新菜”入口和空搜索兜底；`src/components/Library.jsx` 标题与空状态回到发现心智。
- [x] P1 我的家协作入口：从【我的家】点“问问大家”不能让用户误以为跳回首页；应在【今晚】或【我的家】内明确展示征集单/等待态。
  - 完成标准：点击后有明确的“今晚征集单”反馈；分享/复制动作可继续触达小程序卡片。
  - 验证：`npm run build`，本地手动点击【我的家】问问大家。
  - 证据：`src/components/UserCenter.jsx` 在家庭动态区显示发起状态并滚动定位；`src/main.jsx` 返回创建的征集请求用于本页反馈。
- [x] P1 征集口味单据模板确认：主厨发起、家人投票、投票完成、主厨等待、生成结果五个状态统一为“今晚征集单”的设计语言。
  - 完成标准：状态名、主按钮、低思考标签和关闭/加入引导一致；不出现旧的临时链接感。
  - 验证：`npm run build`，`npm run validate:api`，`npm run validate:crave-template`，`npm run release:crave-template:visuals`，`npm run release:pre-review:evidence`。
  - 证据：`src/components/CraveSheet.jsx` 五个状态统一使用“今晚征集单”，按钮统一为“分享征集单/提交征集单/回到 Humi 看今晚”等单据语言；`scripts/check-crave-sheet-template.mjs` 已覆盖关键文案；`scripts/capture-crave-template-visuals.mjs` 会把主厨发起、主厨等待、家人投票、投票完成、征集结束五个真实组件状态截图到私有证据目录并输出 PNG 尺寸/SHA。
- [x] P1 小程序卡片分享复核：`crave`、`invite`、`grocery` 三类分享在小程序内都有明确标题、token 落地和免登录参与路径。
  - 完成标准：小程序壳 `onShareAppMessage` 读取 H5 postMessage；普通打开不被登录墙挡住。
  - 验证：`npm run build`，`npm run release:wechat:share:selftest`，`npm run release:wechat:share:landings`，`npm run release:wechat:share:direct-previews`，`npm run release:pre-review:evidence`，`npm run release:wechat:share:devtools`，`npm run release:wechat:share:cards:capture -- --interactive`，`npm run release:wechat:share:evidence`，`npm run release:wechat:share:complete`，`npm run release:wechat:check`，最终用微信开发者工具/真机连调。
  - 证据：`scripts/check-miniprogram-share-cards.mjs` 已覆盖三类卡片标题、path 和落地 URL；微信开发者工具 CLI 预览已生成到私有目录 `/Users/honglijie/.humi-release-evidence/miniprogram-share-card-preview-20260704T0522`；`docs/humi-1.1-miniprogram-share-card-qa.md` 规定最终截图文件名、PNG/尺寸/文件大小要求和视觉标准；`npm run release:wechat:share:landings` 已生成三张 token H5 落地页截图；`npm run release:wechat:share:direct-previews` 已生成三张直达 `pages/share/index` 原生确认页二维码；微信开发者工具已调出三类虚拟好友小程序卡片并保存 `crave-card.png`、`invite-card.png`、`grocery-card.png`；`npm run release:wechat:share:evidence` 已校验六张截图的完整 PNG、尺寸、size 和 SHA256；`HUMI_SHARE_CARD_VISUAL_CONFIRMED=1 npm run release:wechat:share:complete` 已完成本 P1 勾选。
- [x] P1 1.1 文档口径收敛：核心状态文档不得再把“立即提交微信审核”写成当前唯一下一步。
  - 完成标准：P0/P1 完成后，`release:next` 当前阶段为“等待用户确认是否进入微信审核”；AI-HQ 状态同步该策略。
  - 验证：`npm run release:next`，`npm run release:status`，`npm run release:product:review`。
  - 证据：本文件、`docs/humi-1.1-spec-acceptance-audit.md`、`docs/humi-1.1-release-operator-handoff.md`、`scripts/check-release-status.mjs`、`scripts/print-release-next-action.mjs`。

## P2 灰度后可继续项

- [ ] P2 首批 10-20 个家庭的匿名反馈表填充。
- [ ] P2 菜品图风格继续扩充，但不阻塞 1.1 提审。
- [ ] P2 根据真实反馈决定是否拆 1.1.x 小修版本。

## 当前建议顺序

1. 运行 `npm run release:closure` 和 `npm run release:next`，确认当前处于等待用户确认的微信审核准备。
2. 运行 `npm run release:wechat:check`，确认提交审核前材料与域名/隐私核对项仍为通过。
3. 运行 `npm run release:product:review`，确认关键产品体验锚点仍可由源码、文档和证据共同证明。
4. 用户确认后，再按 `docs/miniprogram-platform-submit-runbook.md` 进入微信公众平台提交审核。

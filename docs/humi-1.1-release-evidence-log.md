# Humi 1.1 Release Evidence Log

更新日期：2026-07-18
执行设备：codex@mbp-m5pro

本文档只记录发布证据索引和结论，不保存微信后台截图、登录态、手机号、真实家庭名单或任何个人隐私。截图/录屏原件放在本机私有目录、飞书私有空间或其他受控位置；这里只写匿名路径、时间、执行人和验收结论。

## 1. 当前基线

| 项目 | 当前值 |
| --- | --- |
| 产品仓库 | `HLJ1029/family-menu` |
| 本地 worktree | `/Users/honglijie/agent-worktrees/humi/humi-1.1-release` |
| API 部署提交 | `cae5e14` |
| GitHub Pages deployment | `29641009392` / success / PR #31 merge `7733865` |
| H5 | `https://www.humi-home.com/` |
| API | `https://api.humi-home.com` |
| 小程序版本 | `1.1.71` |
| 小程序描述 | `明确微信发送步骤并消除假成功` |
| AppID | `wx4040b89f3b363416` |
| 当前状态 | 五类 H5 分享入口均只触发一次原生发送页，页面不再把“准备好分享卡片”误报为已经发送；原生页明确提示需再点一次“选择家人发送”。五类 card/landing 与菜单、清单海报证据通过。H5 已部署，小程序 `1.1.71` 已上传并使用 `h5v=1.1.71`；生产产品与协作 smoke 通过，尚未提交微信审核 |

## 2. 发布前命令证据

| 时间 | 执行人 | 命令 | 结论 | 备注 |
| --- | --- | --- | --- | --- |
| 2026-07-03 | codex@mbp-m5pro | `npm run release:status` | H5/API/材料通过，API SSH 失败 | 失败项只有 `ssh-access` 时不代表 H5 不可用 |
| 2026-07-03 | codex@mbp-m5pro | `npm run release:check:online` | 通过 | `Launch readiness check passed.` |
| 2026-07-03 | codex@mbp-m5pro | `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` | 通过 | `Secret scan passed.` |
| 2026-07-03 | codex@mbp-m5pro | `HUMI_API_SSH_TARGETS=ubuntu@api.humi-home.com HUMI_API_SSH_KEY="$HOME/.ssh/humi_tencent_lighthouse" npm run deploy:api:check` | 通过 | SSH target `ubuntu@api.humi-home.com`，host `VM-0-8-ubuntu` |
| 2026-07-03 | codex@mbp-m5pro | `npm run monitor:prod` | 通过 | H5 200、API health 200、基础推荐可用 |
| 2026-07-03 | codex@mbp-m5pro | production public smoke | 通过 | `prod-smoke-1783054717323` / crave token `817e93c8d2c94dc996bb6f25ccb0cfac` |
| 2026-07-04 | codex@mbp-m5pro | `git push origin main` | 通过 | `1d264a6` / Pages run `28687866822` success |
| 2026-07-04 | codex@mbp-m5pro | `git push origin main` | 通过 | `3954f05` / Pages run `28697298347` success / `release:closure` 已纳入总收口审计 |
| 2026-07-04 | codex@mbp-m5pro | `git push origin main` | 通过 | `bdb2ede` / Pages run `28713834307` success / 小程序 `1.1.56` 已上传 |
| 2026-07-04 | codex@mbp-m5pro | 微信开发者工具 CLI upload | 通过 | `1.1.56` / `分享卡片转发兜底` / package `16.4 KB` / private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.56` |
| 2026-07-04 | codex@mbp-m5pro | `npm run release:wechat:check` | 阻止提审 | 当前策略为提审前产品打磨；仍缺三张微信原生分享卡片截图证据 |
| 2026-07-05 | codex@mbp-m5pro | 微信开发者工具 CLI upload | 通过 | `1.1.59` / `原生分享确认页` / package `20.1 KB` / private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.59` |
| 2026-07-05 | codex@mbp-m5pro | `git push origin main` | 通过 | `76dc75d` / Pages run `28726064589` success / 证据总览已纳入 direct-preview 二维码 |
| 2026-07-05 | codex@mbp-m5pro | `npm run release:pre-review:evidence` | 阻止提审 | 征集单视觉图、H5 landing、direct-preview 二维码均 OK；仍缺 `crave-card.png`、`invite-card.png`、`grocery-card.png` |
| 2026-07-05 | codex@mbp-m5pro | `npm run release:wechat:share:evidence` / `npm run release:wechat:share:complete` | 通过 | DevTools 原生分享确认页已复核 `crave`、`invite`、`grocery` 三类虚拟好友小程序卡片；六张截图证据均 OK，private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-share-card-preview-20260704T0522` |
| 2026-07-05 | codex@mbp-m5pro | `git push origin main` | 通过 | `117cd3e` / Pages run `28726626647` success / `release:next` 与 `release:closure` 均停在用户确认点 |
| 2026-07-05 | codex@mbp-m5pro | `git push origin main` | 通过 | `2527e30` / Pages run `28744383941` success / 新增只读 `npm run release:map` 收口地图命令 |
| 2026-07-13 | codex@mbp-m5pro | `npm run release:wechat:share:evidence` | 阻止收口 | 新增 Vision OCR 语义门禁后发现历史证据误判：`grocery-card.png` 有虚拟好友发送框并通过；`crave-card.png` 缺发送框，`invite-card.png` 为无关截图，二者必须重截 |
| 2026-07-13 | codex@mbp-m5pro | `release:wechat:share:landings` / `release:wechat:share:direct-previews` | 当前候选准备完成 | 新建私有目录 `private:///Users/honglijie/.humi-release-evidence/miniprogram-share-card-preview-20260713T1457`；三张 landing、三张直达确认页二维码和通用预览二维码来自当前分支，未复制历史原生卡片，三类发送框均待重截 |
| 2026-07-14 | codex@mbp-m5pro | PR #3 / GitHub Pages | 通过 | PR #3 合并为 `2c53017c`；Pages run `29334137689` success |
| 2026-07-14 | codex@mbp-m5pro | 生产 API 部署 | 通过 | 备份 `/opt/humi/backups/20260714T124938Z`；同步 `2c53017c` API；`humi-api.service` active；monitor/readiness 通过 |
| 2026-07-14 | codex@mbp-m5pro | PR #4 / GitHub Pages | 通过 | PR #4 合并为 `88a70abe`；Pages run `29334784527` success；修复未登录 Supabase 埋点 400 |
| 2026-07-14 | codex@mbp-m5pro | production product/collaboration smoke | 通过 | 产品入口与三类游客协作全部通过，HTTP/页面错误为 0；证据 `private:///Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260714T130324Z` |
| 2026-07-14 | codex@mbp-m5pro | 微信开发者工具 CLI upload | 通过 | `1.1.60` / `核心菜单与家庭协作验收版` / package `20.1 KB` / private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.60` |
| 2026-07-14 | codex@mbp-m5pro | PR #5 / #6 / #7 / GitHub Pages | 通过 | 当前 `main` 为 `470250d`；Pages run `29337705997` success；补充旧自动早餐/午餐记录无损迁移并准备 `1.1.61` |
| 2026-07-14 | codex@mbp-m5pro | production migration/product smoke | 通过 | 旧自动紫菜蛋花汤记录被清理，晚餐和明确手选保留；产品入口全量 smoke 页面错误 0；证据 `private:///Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260714T134729Z` |
| 2026-07-14 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.61` / `核心菜单与家庭协作验收版` / package `20.1 KB` / DevTools `h5v=1.1.61` / Errors 0 / private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.61` |
| 2026-07-14 | codex@mbp-m5pro | 用户真机扫码 / WebView 调试器 | P0 已定位 | `1.1.61` 真机白屏；WebView 报错为存量早餐日志中 `null` 被读取 `recipeId`，开发者工具旧证据不再视为真机通过 |
| 2026-07-14 | codex@mbp-m5pro | PR #10 / #11 / GitHub Pages | 通过 | 壳层单次挂载与错误重试 merge `555d7ad`；存量餐次清洗与 React 恢复页 merge `de0b4d8`；Pages run `29340371940` success |
| 2026-07-14 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.63` / `修复真机存量数据白屏` / package `21.6 KB` / DevTools 保留旧数据打开 `h5v=1.1.63` / Errors 0 / private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.63` |
| 2026-07-14 | codex@mbp-m5pro | production product/collaboration smoke | 通过 | 138 道完整菜品库、已安排置顶、早餐/午餐先选后记、菜单/清单/征集/成员权限/多家庭与三类游客协作全部通过，页面错误 0；证据 `private:///Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260714T142606Z` |
| 2026-07-14 | codex@mbp-m5pro | PR #12 / GitHub Pages / CLI re-upload | 通过 | PR #12 merge `ed18b76`；Pages run `29341674107` success；`1.1.63` 从该主线基线覆盖上传，package `21.6 KB`；新 preview QR 保存在原私有证据目录 |
| 2026-07-14 | codex@mbp-m5pro | PR #14 / GitHub Pages | 通过 | PR #14 merge `864e8c8`；Pages run `29343259367` success；迁移范围扩展到仅存在于 `meal-plan`、没有对应 `meal-log` 的旧自动早餐/午餐记录，晚餐与当前明确手选记录保留 |
| 2026-07-14 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.64` / `清理旧自动餐次记录` / package `21.6 KB` / DevTools 打开 `h5v=1.1.64`、旧早餐/午餐消失、有效晚餐和当前手选早餐保留、Errors 0；preview QR SHA-256 `f62171d0254f20b66aed3d1d4a8389fac4a53ab358685051b9dd79be2cec19da`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.64` |
| 2026-07-14 | codex@mbp-m5pro | production monitor / product smoke | 通过 | H5/API/recommend HTTP 200；138 道菜库、三餐手选、清单、征集、成员权限、多家庭全部通过，页面错误 0；证据 `private:///Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260714T150831Z` |
| 2026-07-14 | codex@mbp-m5pro | PR #16 / GitHub Pages | 通过 | PR #16 merge `4e6119d`；Pages run `29345223275` success；H5 在 React 启动前直接渲染品牌加载页，主脚本失败 6 秒后显示重新加载；`validate:h5-entry` 已进入发布状态工程门禁 |
| 2026-07-14 | codex@mbp-m5pro | production WeChat-UA failure injection | 通过 | 生产 `www.humi-home.com` 主脚本被主动阻断后仍显示 Humi 加载页与重新加载，不出现纯白屏；证据 `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.65/production-wechat-main-script-failed.png` |
| 2026-07-14 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.65` / `增加首屏白屏兜底` / package `21.6 KB` / DevTools 打开 `h5v=1.1.65`、业务页面可见、原生错误页未触发、Errors 0；preview QR SHA-256 `ad717a104f4d110363fcaea4f8fbd88a27b7866cbca4c0a29e1d26a28075bf9c`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.65` |
| 2026-07-14 | codex@mbp-m5pro | production monitor / product smoke | 通过 | H5/API/recommend HTTP 200；138 道菜库、三餐手选、清单、征集、成员权限、多家庭全部通过，页面错误 0；证据 `private:///Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260714T152840Z` |
| 2026-07-15 | codex@mbp-m5pro | PR #18 / #19 / #20 / GitHub Pages | 通过 | 五入口 UI、功能验收门禁和 `h5v=1.1.66` 依次合入；当前 `main` 为 `ff43889`；Pages run `29419413488` success |
| 2026-07-15 | codex@mbp-m5pro | production product/collaboration smoke | 通过 | 产品 smoke 86/86，五个一级入口、138 道菜库、三餐手选、计划清单、征集、成员权限、多家庭和三类游客协作均通过，页面错误 0；证据 `private:///Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260715T133332Z` 与 `private:///Users/honglijie/.humi-release-evidence/collaboration-smoke-20260715-ui-function-closure` |
| 2026-07-15 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.66` / `适配新版五入口与家庭协作` / package `21.6 KB` / DevTools 打开 `h5v=1.1.66`、五个主入口可见、Errors 0；preview QR SHA-256 `157aed0c55b3ee7d71c26c407d8faae55c7facbf979d66ac069a97934c95dfaf`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.66` |
| 2026-07-15 | codex@mbp-m5pro | PR #22 / GitHub Pages | 通过 | 当前重构 UI 下的 1.1 核心菜单与家庭协作合入 `main@537d171`；Pages run `29429284963` success |
| 2026-07-15 | codex@mbp-m5pro | 生产 API 备份 / 部署 / restart | 通过 | 备份 `/opt/humi/backups/20260715T154337Z`；同步 `main@537d171`；`humi-api.service` active；health、monitor、online readiness 通过 |
| 2026-07-15 | codex@mbp-m5pro | production product / collaboration smoke | 通过 | 138 道完整菜库、三餐显式选择、家庭权限、多家庭隔离和协作落地页均通过，页面错误 0；private evidence `private:///Users/honglijie/.humi-release-evidence/product-production-1.1.67-20260715` 与 `private:///Users/honglijie/.humi-release-evidence/collaboration-production-1.1.67-20260715` |
| 2026-07-15 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.67` / `完善家庭菜单与协作功能` / package `24.1 KB` / DevTools 打开 `h5v=1.1.67`、业务首屏与五主入口可见、Errors 0；唯一 warning 为微信基础库 `getSystemInfo` HarmonyOS 兼容提示；preview QR SHA-256 `8027c0683101f830d8c486881692c3a7c9a511786ceda39f23ab648764ed637c`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.67` |
| 2026-07-15 | codex@mbp-m5pro | `npm run release:status` | 工程门禁通过，验收门禁继续阻止审核 | `engineeringGatesReady=true`；`candidateValidationReady=false` 与 `releaseEvidenceReady=false`，原因仅为真实家庭样本、微信审核/发布、发布后 P0 和 24 小时监控尚未执行 |
| 2026-07-16 | codex@mbp-m5pro | PR #25 / GitHub Pages | 通过 | 修复 H5 分享假成功并完成高频机械文案自然化；合入 `main@cae5e14`；Pages run `29496037197` success |
| 2026-07-16 | codex@mbp-m5pro | 生产 API 备份 / 部署 / restart | 通过 | 备份 `/opt/humi/backups/20260716T115336Z`；同步 `main@cae5e14`；`humi-api.service` active；health、recommend、monitor 与 online readiness 通过 |
| 2026-07-16 | codex@mbp-m5pro | production product / collaboration smoke | 通过 | 138 道完整菜库、三餐显式选择、家庭权限、多家庭隔离、原生分享交接和四类游客协作均通过，页面错误 0；private evidence `private:///Users/honglijie/.humi-release-evidence/product-production-1.1.68-20260716` 与 `private:///Users/honglijie/.humi-release-evidence/collaboration-production-1.1.68-20260716` |
| 2026-07-16 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.68` / `修复分享并优化应用文案` / package `26.7 KB` / `h5v=1.1.68`；preview QR SHA-256 `8def81b8dab24425e5fb150c838d365d8d32f6905a8f9482777e7eeb65402d83`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.68`；未提交审核 |
| 2026-07-16 | codex@mbp-m5pro | PR #27 / GitHub Pages | 通过 | 菜单与清单海报入口恢复并纳入产品门禁；合入 `main@c64322f`；Pages run `29497490691` success |
| 2026-07-16 | codex@mbp-m5pro | production product smoke / monitor / online readiness | 通过 | 产品 smoke 89/89；今晚菜单和买菜清单海报入口均可见，两张海报实际生成，页面错误 0；H5/API/recommend 与 online readiness 通过；private evidence `private:///Users/honglijie/.humi-release-evidence/product-production-1.1.69-20260716` |
| 2026-07-16 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.69` / `恢复菜单和清单海报入口` / package `26.7 KB` / `h5v=1.1.69`；preview QR SHA-256 `e02bfcd7851398e54ca3f78b173fb33c7824214925cd891888b42db1aae8ee14`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.69`；未提交审核 |
| 2026-07-18 | codex@mbp-m5pro | PR #29 / GitHub Pages | 通过 | 实机分享桥接、五类分享门禁、海报入口文案与家庭自然语言合入 `main@7cab05c`；Pages run `29640444695` success |
| 2026-07-18 | codex@mbp-m5pro | 五类分享 card / landing 取证 | 通过 | `crave`、`invite`、`grocery`、`wish`、`menu` 五张 H5 landing 与五张 DevTools 原生发送框均通过 PNG 完整性、尺寸和 OCR 语义门禁；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-share-card-preview-20260718Th7nuXe` |
| 2026-07-18 | codex@mbp-m5pro | production product / collaboration smoke | 通过 | 线上核心菜单、138 道菜库、三餐选择、家庭协作、菜单与清单海报和游客回传通过，页面错误 0；H5/API/recommend 与 online readiness 通过；private evidence `private:///Users/honglijie/.humi-release-evidence/product-production-1.1.70-20260718` |
| 2026-07-18 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.70` / `修复实机分享并补齐五类协作` / package `28.8 KB` / `h5v=1.1.70`；preview QR SHA-256 `09413f566be6b2e7068b759587cda7999f5ed3fb14f8c295864b0858bccc5039`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.70`；未提交审核 |
| 2026-07-18 | codex@mbp-m5pro | PR #31 / GitHub Pages | 通过 | 五类分享的第二步微信发送提示、假成功清理与发布版本常量合入 `main@7733865`；Pages run `29641009392` success |
| 2026-07-18 | codex@mbp-m5pro | production product / collaboration smoke | 通过 | 五类 H5 分享入口各自只派发一次原生 `navigateTo`，无 `redirectTo`；菜单与清单海报均真实生成，138 道菜库及核心流程页面错误 0；协作 smoke 通过；private evidence `private:///Users/honglijie/.humi-release-evidence/product-production-1.1.71-rerun-20260718` 与 `private:///Users/honglijie/.humi-release-evidence/collaboration-production-1.1.71-20260718` |
| 2026-07-18 | codex@mbp-m5pro | 微信开发者工具 CLI upload / preview | 通过 | `1.1.71` / `明确微信发送步骤并消除假成功` / package `28.8 KB` / `h5v=1.1.71`；preview QR SHA-256 `feba01ff9043fed1ee118564bf6d3002907a0381e97a414217a40b7473dd8e3a`；private evidence `private:///Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.71`；未提交审核 |

## 3. 生产 API 补部署证据

恢复 SSH 并完成 `docs/humi-api-production-deploy-runbook.md` 后填写。

| 字段 | 记录 |
| --- | --- |
| 执行时间 | 2026-07-16 19:53 CST |
| 执行人 | codex@mbp-m5pro |
| 可用 SSH target | `ubuntu@api.humi-home.com` + `~/.ssh/humi_tencent_lighthouse` |
| 部署前备份路径 | `/opt/humi/backups/20260716T115336Z` |
| 部署提交 | `cae5e14` |
| 服务管理方式 | systemd / `humi-api.service` / `WorkingDirectory=/opt/humi` |
| `npm run deploy:api:check` | 通过 |
| `npm run monitor:prod` | 通过 |
| `npm run release:check:online` | 通过 |
| API smoke 结论 | 通过：health 200、基础推荐 200、生产 monitor 与 online readiness 通过；本次只调整推荐降级文案，不改变 API 合同 |
| 是否回滚 | 否 |

重点 smoke：

| 路径 | 结果 | 备注 |
| --- | --- | --- |
| `crave` 免登录投感觉 | 通过 | production public smoke `prod-smoke-1783054717323` |
| `crave` 登录加入后共享 state | 待真机/微信登录验证 | 需要真实微信授权 |
| `invite` 加入后共享 state | 待真机/微信登录验证 | 需要真实微信授权 |
| `grocery` 认领冲突 409 | 待真机/微信登录验证 | 需要正式家庭清单分享 |
| 普通成员权限 403 | 待真机/微信登录验证 | 需要正式成员账号 |
| 精准推荐/解释额度闸门 | 通过 | 未登录 precise recommendation/explain 均返回 401；402 需登录家庭额度态 |

## 4. 微信公众平台提交审核证据

按 `docs/miniprogram-platform-submit-runbook.md` 提交后填写。

| 字段 | 记录 |
| --- | --- |
| 提交时间 | 待填 |
| 提交人 | 待填 |
| 提交版本 | `1.1.71` |
| 审核备注版本 | 待填 |
| 审核单状态 | 待填 |
| 证据原件位置 | 待填，仅填私有目录或飞书链接，不提交截图 |

| 证据项 | 是否已留存 | 私有位置/编号 | 备注 |
| --- | --- | --- | --- |
| 上传版本 `1.1.71` 列表 | 待填 | 待填 |  |
| request 合法域名 `api.humi-home.com` | 待填 | 待填 |  |
| web-view 业务域名 `www.humi-home.com` | 待填 | 待填 |  |
| 隐私保护指引关键项 | 待填 | 待填 |  |
| 审核备注/提交页 | 待填 | 待填 |  |
| 提交成功/审核中状态 | 待填 | 待填 |  |

## 5. 审核结果证据

| 字段 | 记录 |
| --- | --- |
| 审核结果 | 待填：通过 / 驳回 |
| 结果时间 | 待填 |
| 后台原始原因 | 待填；如含隐私信息，仅写摘要 |
| 分级 | P0 / P1 / P2 / 无问题 |
| 是否需要 1.1.x | 待填 |
| 处理记录 | 待填 |

若审核驳回，把问题同步到 `docs/launch-feedback-and-101-backlog.md` 的 1.1.x 修复池。

## 6. 审核通过后发布证据

按 `docs/launch-day-runbook.md` 发布后填写。

| 字段 | 记录 |
| --- | --- |
| 发布时间 | 待填 |
| 发布人 | 待填 |
| 发布版本 | `1.1.71` |
| 发布状态截图位置 | 待填 |
| 首次真机验证设备 | 待填 |
| 是否需要回滚/暂停扩散 | 否 / 是，原因待填 |

## 7. 发布后 P0 真机验收证据

必须用真实微信验证，不只看开发者工具。

| P0 路径 | 设备/微信版本 | 结果 | 备注 |
| --- | --- | --- | --- |
| 普通打开小程序进入【今晚】，不被登录墙挡住 | 待填 | 待填 |  |
| 【今晚】看到晚饭推荐 | 待填 | 待填 |  |
| `今晚就做` 进入今日菜单 | 待填 | 待填 |  |
| `换一组` 或 `不想吃` 可降级/反馈 | 待填 | 待填 |  |
| `问问大家想吃啥` 生成小程序卡片 | 待填 | 待填 |  |
| 家人打开 `crave` 卡片免登录点感觉 | 待填 | 待填 |  |
| 【清单】展示三餐汇总食材 | 待填 | 待填 |  |
| `grocery` 卡片可认领/标记买到 | 待填 | 待填 |  |
| 已被别人认领的清单项不能覆盖 | 待填 | 待填 |  |
| 【我的家】展示微信登录、成员、饭线索、想吃池子、忌口 | 待填 | 待填 |  |
| 退出登录后可重新触发微信登录 | 待填 | 待填 |  |

## 8. 24 小时监控证据

| 时间 | H5 | API health | 推荐 | 分享卡片 | 登录同步 | 反馈等级 | 处理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T+2h | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| T+6h | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| T+12h | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |
| T+24h | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 | 待填 |

## 9. 灰度证据入口

- 灰度家庭匿名追踪：`docs/humi-1.1-gray-release-tracker.md`
- 首批反馈和 1.1.x 修复池：`docs/launch-feedback-and-101-backlog.md`
- 发布操作交接单：`docs/humi-1.1-release-operator-handoff.md`

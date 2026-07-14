# Humi 1.1 Release Evidence Log

更新日期：2026-07-14
执行设备：codex@mbp-m5pro

本文档只记录发布证据索引和结论，不保存微信后台截图、登录态、手机号、真实家庭名单或任何个人隐私。截图/录屏原件放在本机私有目录、飞书私有空间或其他受控位置；这里只写匿名路径、时间、执行人和验收结论。

## 1. 当前基线

| 项目 | 当前值 |
| --- | --- |
| 产品仓库 | `HLJ1029/family-menu` |
| 本地 worktree | `/Users/honglijie/agent-worktrees/humi/humi-1.1-spec-closure` |
| API 部署提交 | `2c53017c` |
| GitHub Pages deployment | `29340371940` / success / merge `de0b4d8` |
| H5 | `https://www.humi-home.com/` |
| API | `https://api.humi-home.com` |
| 小程序版本 | `1.1.63` |
| 小程序描述 | `修复真机存量数据白屏` |
| AppID | `wx4040b89f3b363416` |
| 当前状态 | 生产 H5/API 已部署、小程序 `1.1.63` 候选已上传；真机白屏根因已修复并通过 WebView/线上自动化复验，等待用户手机复验，尚未提交微信审核 |

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

## 3. 生产 API 补部署证据

恢复 SSH 并完成 `docs/humi-api-production-deploy-runbook.md` 后填写。

| 字段 | 记录 |
| --- | --- |
| 执行时间 | 2026-07-14 20:52 CST |
| 执行人 | codex@mbp-m5pro |
| 可用 SSH target | `ubuntu@api.humi-home.com` + `~/.ssh/humi_tencent_lighthouse` |
| 部署前备份路径 | `/opt/humi/backups/20260714T124938Z` |
| 部署提交 | `2c53017c` |
| 服务管理方式 | systemd / `humi-api.service` / `WorkingDirectory=/opt/humi` |
| `npm run deploy:api:check` | 通过 |
| `npm run monitor:prod` | 通过 |
| `npm run release:check:online` | 通过 |
| API smoke 结论 | 通过：`deadlineAt`、vote、`resultSummary`、public result、basic recommendation、precise 401、explain 401 |
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
| 提交版本 | `1.1.63` |
| 审核备注版本 | 待填 |
| 审核单状态 | 待填 |
| 证据原件位置 | 待填，仅填私有目录或飞书链接，不提交截图 |

| 证据项 | 是否已留存 | 私有位置/编号 | 备注 |
| --- | --- | --- | --- |
| 上传版本 `1.1.63` 列表 | 待填 | 待填 |  |
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
| 发布版本 | `1.1.63` |
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

# Humi 1.1 Release Evidence Log

更新日期：2026-07-03
执行设备：codex@mbp-m5pro

本文档只记录发布证据索引和结论，不保存微信后台截图、登录态、手机号、真实家庭名单或任何个人隐私。截图/录屏原件放在本机私有目录、飞书私有空间或其他受控位置；这里只写匿名路径、时间、执行人和验收结论。

## 1. 当前基线

| 项目 | 当前值 |
| --- | --- |
| 产品仓库 | `HLJ1029/family-menu` |
| 本地 worktree | `/Users/honglijie/agent-worktrees/humi/humi-1.1-release` |
| API 部署提交 | `154f379` |
| GitHub Pages run | 最新结果以 `npm run release:status` 和 GitHub Actions 为准；API 部署时对应 run `28639333760` / success after rerun |
| H5 | `https://www.humi-home.com/` |
| API | `https://api.humi-home.com` |
| 小程序版本 | `1.1.55` |
| 小程序描述 | `征集单模板与分享卡片` |
| AppID | `wx4040b89f3b363416` |
| 当前状态 | 生产 API 补部署已完成，等待微信公众平台提交审核/发布、发布后真机 P0 |

## 2. 发布前命令证据

| 时间 | 执行人 | 命令 | 结论 | 备注 |
| --- | --- | --- | --- | --- |
| 2026-07-03 | codex@mbp-m5pro | `npm run release:status` | H5/API/材料通过，API SSH 失败 | 失败项只有 `ssh-access` 时不代表 H5 不可用 |
| 2026-07-03 | codex@mbp-m5pro | `npm run release:check:online` | 通过 | `Launch readiness check passed.` |
| 2026-07-03 | codex@mbp-m5pro | `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` | 通过 | `Secret scan passed.` |
| 2026-07-03 | codex@mbp-m5pro | `HUMI_API_SSH_TARGETS=ubuntu@api.humi-home.com HUMI_API_SSH_KEY="$HOME/.ssh/humi_tencent_lighthouse" npm run deploy:api:check` | 通过 | SSH target `ubuntu@api.humi-home.com`，host `VM-0-8-ubuntu` |
| 2026-07-03 | codex@mbp-m5pro | `npm run monitor:prod` | 通过 | H5 200、API health 200、基础推荐可用 |
| 2026-07-03 | codex@mbp-m5pro | production public smoke | 通过 | `prod-smoke-1783054717323` / crave token `817e93c8d2c94dc996bb6f25ccb0cfac` |

## 3. 生产 API 补部署证据

恢复 SSH 并完成 `docs/humi-api-production-deploy-runbook.md` 后填写。

| 字段 | 记录 |
| --- | --- |
| 执行时间 | 2026-07-03 12:56 CST |
| 执行人 | codex@mbp-m5pro |
| 可用 SSH target | `ubuntu@api.humi-home.com` + `~/.ssh/humi_tencent_lighthouse` |
| 部署前备份路径 | `/opt/humi/backups/20260703T045543Z` |
| 部署提交 | `154f379` |
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
| 提交版本 | `1.1.55` |
| 审核备注版本 | 待填 |
| 审核单状态 | 待填 |
| 证据原件位置 | 待填，仅填私有目录或飞书链接，不提交截图 |

| 证据项 | 是否已留存 | 私有位置/编号 | 备注 |
| --- | --- | --- | --- |
| 上传版本 `1.1.55` 列表 | 待填 | 待填 |  |
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
| 发布版本 | `1.1.55` |
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

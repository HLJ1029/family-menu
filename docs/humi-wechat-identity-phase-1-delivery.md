# Humi 主动微信登录与身份建立 Phase 1 交付说明

更新日期：2026-07-19  
执行设备：codex@mbp-m5pro  
分支：`codex/humi-wechat-identity-startup`  
基线：`origin/main@22afe7b`

## 交付边界

本阶段完成已确认总设计的第 1 阶段：游客启动不建号、用户主动微信登录、一次性身份完善、安全 H5 会话交接、无副作用家庭读取，以及正式运行路径退出 Supabase。

本阶段没有生产部署、没有写入生产数据、没有上传微信版本，也没有删除旧 Supabase provider 数据、Secrets、依赖或孤立 legacy 源文件。家庭客厅、协作参与者身份历史、旧数据最终迁移与 provider 物理清退属于后续阶段。

## 生产后端只读审计

2026-07-19 通过生产机只读脚本聚合读取 `/var/lib/humi-api/data.json`，没有输出任何 OpenID、手机号、昵称或明细记录：

| 数据 | 数量 |
| --- | ---: |
| Humi 用户 | 18 |
| 微信身份 | 18 |
| 家庭 | 7 |
| 家庭状态 | 6 |

18 个用户的 `profileStatus` 均为旧结构缺失，18 个昵称均为默认“微信用户”。这证明此前看到的“第一次打开就像已登录、没有用户名、头像相同”不是正常完整身份，而是旧启动链路自动建号叠加默认资料造成的体验。

## Task commits

| Task | Commit | 结果 |
| --- | --- | --- |
| 设计与实施计划 | `4e90b3d`, `961a614` | 设计和 Phase 1 计划入库 |
| Store 身份状态 | `01c72f1` | 显式身份状态、稳定默认头像、无副作用家庭读取、哈希票据 |
| API 合同 | `ded59a0` | 身份、头像、票据和家庭前置条件 API |
| 原生身份页 | `982248c` | 微信昵称/头像完善与原生 session 持久化 |
| 主动微信登录 | `dec5ab9` | 普通启动不调用 `wx.login`，退出同步清理原生状态 |
| H5 安全交换 | `6a2f12e` | 单次 ticket 交换、URL 清理、旧 session 拦截 |
| 正式运行时清退 | `b62940d` | 正式入口、AI、事件、家庭与构建不再使用 Supabase |
| 文档与最终门禁 | 本文件所在提交 | API/runbook、生产聚合审计、smoke 副作用断言与全矩阵验收 |

## 主要修改文件

- 后端：`api/store.js`、`api/server.js`、`api/avatar.js`
- 微信原生层：`miniprogram/app.js`、`miniprogram/app.json`、`miniprogram/pages/index/*`、`miniprogram/pages/identity/*`、`miniprogram/pages/phone-bind/index.js`
- H5：`src/main.jsx`、`src/lib/humiApi.js`、`src/lib/humiIdentity.js`、`src/lib/aiViaHumiApi.js`、`src/lib/validationEvents.js`
- UI：`src/components/AppShell.jsx`、`src/components/AuthLanding.jsx`、`src/components/UserCenter.jsx`
- 门禁：`scripts/check-identity-store.mjs`、`scripts/check-identity-runtime.mjs`、`scripts/smoke-humi-api.mjs`、H5/小程序入口脚本
- 配置与文档：`.github/workflows/deploy-pages.yml`、`.env.example`、API 合同与生产 runbook

## 自动化验收矩阵

2026-07-19 最终提交前已重新执行：

1. `npm run validate:identity`
2. `npm run validate:api`
3. `npm run validate:miniprogram-entry`
4. `npm run validate:h5-entry`
5. `npm run release:product:smoke`
6. `npm run release:collaboration:smoke`
7. `npm run build`
8. `rg -n "supabase\\.co|@supabase|VITE_SUPABASE" dist`
9. `/Users/honglijie/AI-HQ/scripts/secret-scan.sh`

API smoke 额外直接读取自己的临时数据文件并断言：用户数等于显式微信登录 code 数，家庭数等于显式 `POST /households` 次数，且没有遗留仍有效的 H5 票据。

真实输出摘要：

- `validate:identity`：`Identity store checks passed.`、`Identity runtime checks passed.`
- `validate:api`：`Humi API smoke test passed.`
- `validate:miniprogram-entry`：`Mini-program entrypoint resilience checks passed.`
- `validate:h5-entry`：`"ok": true`，覆盖票据交换、URL 清理和旧 session 拦截
- `release:product:smoke`：`"ok": true`，生产入口自动化检查全部通过；证据目录 `/Users/honglijie/.humi-release-evidence/product-entrypoint-smoke-20260719T120611Z`
- `release:collaboration:smoke`：`"ok": true`，游客协作落地页不自动登录
- `build`：Vite 完成 1742 个模块构建；仅保留既有单包大于 500 KiB 警告
- 构建产物扫描：无 `supabase.co`、`@supabase` 或 `VITE_SUPABASE` 命中
- AI-HQ secret scan：`Secret scan passed.`

## 回滚

部署前必须把 API 代码、`/var/lib/humi-api/data.json` 和 `/var/lib/humi-api/avatars/` 放入同一个时间戳备份。若身份链路出现 P0，恢复上一 API 代码并同时恢复 `data.json` 与 `avatars/`，重启服务后复验 `/health`、主动登录、老用户恢复和家庭状态读取。

## 进入下一阶段前置条件

自动化通过只证明候选代码可验收，不代表已经生产发布。进入家庭生命周期与 A 方案“家庭客厅”前，还需在微信真机确认：

- 全新设备首次打开可选择游客，生产用户总数不变化。
- 点击“微信登录”后才调用微信登录。
- 新用户只完成一次昵称头像设置，后续可恢复。
- 旧“微信用户”账号进入身份完善，完成后原有家庭和状态仍可读取。
- H5 地址栏与历史中不出现长期 access token 或序列化 session。

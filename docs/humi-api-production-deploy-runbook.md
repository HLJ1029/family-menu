# Humi API 1.1 Production Deploy Runbook

更新日期：2026-07-24
执行设备：codex@mbp-m5pro

本文档记录 Humi API 1.1 服务端增量以及原生骨架 `1.1.74` API 合同的生产部署与复验方法。原生候选部署后仍保持服务端总开关关闭；API/H5 部署、小程序上传、提审、发布和白名单扩张是不同动作。

## 1. 当前事实

- 生产 API：`https://api.humi-home.com`
- 健康检查：`https://api.humi-home.com/health` 当前返回 HTTP 200。
- 当前线上 H5：`https://www.humi-home.com/`
- 当前兼容生产基线：`e66c5f0`；原生骨架候选以当前受审分支 HEAD 与 AI-HQ `native-shell/HANDOFF.md` 为准，尚未部署。
- 最新确认的兼容 H5：GitHub Pages run `29890670549` / success；原生候选 H5 改动尚未部署。
- 最新小程序候选：`1.1.73` / `修复身份完善入口`。短期海报图片上传与公开下载接口已部署；微信后台 downloadFile 合法域名仍需配置后才能完成真机联调。
- 未上传原生骨架 preview：`1.1.74`。其 API/H5 兼容改动部署后也不得自动上传小程序或开启原生白名单。
- 当前 SSH 结论：2026-07-03 已确认 `ubuntu@api.humi-home.com` 可用，需显式使用本机 `~/.ssh/humi_tencent_lighthouse` key；`root@api.humi-home.com` 不可用。
- 当前服务管理：`systemd` unit `humi-api.service`，`WorkingDirectory=/opt/humi`，`ExecStart=/usr/bin/node api/server.js`，`User=ubuntu`。
- 当前数据文件：`HUMI_API_DATA_FILE=/var/lib/humi-api/data.json`。

## 2. 已部署 API 增量

以下已进入 `main`、通过本地 smoke 并部署到生产 API：

- 1.1.37：感觉征集 `deadlineAt` 持久化并公开返回。
- 1.1.38：`/recommend mode=precise` 服务端登录与额度闸门，免费家庭额度用完返回 402。
- 1.1.39：`/explain` 服务端登录与精准额度闸门。
- 1.1.42：感觉征集关闭后公开 `resultSummary`。
- 1.1.51：`/household-invites/:token/join` 返回家庭共享 `state`。
- 1.1.52：买菜认领防覆盖，第二人覆盖别人认领/完成状态时返回 409。
- 1.1.53：普通成员不能代替主厨发起家庭征集或生成买菜分享卡片，返回 403。
- 1.1.54：`/crave-requests/:token/join` 返回家庭列表与共享 `state`。
- 1.1.73：登录用户上传 950KB 内 JPG/PNG 海报，服务端按不透明 token 保存 24 小时，供小程序原生图片分享和相册保存下载。

以下属于 `1.1.74` 原生骨架候选，尚未部署：

- `GET /bootstrap`：返回经过脱敏的用户、家庭、状态版本、当前 MealRun 与能力开关。
- `POST /recommendations/dinner`：三档行动力和服务端轮换游标，硬约束不可放宽。
- `POST /meal-runs` 及 start/progress/downgrade/complete/abandon/feedback/task/reminder 路由：幂等晚餐执行闭环。
- `POST /product-events`：仅接收白名单原生事件；匿名标识在服务端使用 HMAC-SHA256，不保存原值。
- `/recipes`、H5 ticket、原生分享快照与家庭状态版本冲突合同。

原生候选的生产运行环境必须显式满足：

```dotenv
HUMI_NATIVE_SHELL_ENABLED=0
HUMI_NATIVE_SHELL_HOUSEHOLDS=
HUMI_MEAL_EXECUTION_ENABLED=0
HUMI_MEAL_EXECUTION_HOUSEHOLDS=
HUMI_TELEMETRY_HASH_SALT=<通过受控生产配置注入的至少32字符随机值>
```

`HUMI_TELEMETRY_HASH_SALT` 只能存在于生产服务环境或受控 secret 文件，不能进入仓库、任务、日志或部署证据。缺失或短于 32 字符时，生产 API 必须拒绝启动。部署阶段不得把任何原生或 MealRun 开关改成 `1`。

## 3. 本地预检

在产品仓库执行：

```bash
cd /Users/honglijie/agent-worktrees/humi/humi-1.1-release
git fetch origin
git checkout main
git pull --ff-only
npm ci
npm run validate:api
npm run validate:native-bootstrap-api
npm run validate:meal-execution-api
npm run validate:native-observability
npm run validate:api-deploy-set
HUMI_NATIVE_HANDOFF_PATH=/absolute/path/to/HANDOFF.md npm run release:native-shell:check
npm run release:check:online
HUMI_REPO="$PWD" /Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

预检失败时不要部署。先修复并重新走完整验证。`HUMI_NATIVE_HANDOFF_PATH` 必须指向本次候选的 AI‑HQ 交付文件，且其中唯一候选提交必须等于当前 `HEAD`；不得用 `release:native-shell:check:local` 代替部署预检。`release:native-shell:check` 必须继续报告 `production_api_deployed=false`、`h5_deployed=false`、`miniprogram_uploaded=false` 和原生白名单关闭；这一步只证明候选完整，不会改变外部状态。

## 4. 恢复 SSH 后的连接检查

先运行只读部署条件检查：

```bash
npm run deploy:api:check
```

该命令会检查本地 `main` 是否干净且同步到 `origin/main`、生产 API 健康检查是否正常，以及默认 SSH 用户是否可登录。当前生产机需要显式指定可用用户和 key：

```bash
HUMI_API_SSH_TARGETS=ubuntu@api.humi-home.com \
HUMI_API_SSH_KEY="$HOME/.ssh/humi_tencent_lighthouse" \
npm run deploy:api:check
```

如果生产机用户名变化，可临时指定候选：

```bash
HUMI_API_SSH_TARGETS=user@api.humi-home.com,root@api.humi-home.com npm run deploy:api:check
```

也可以手工确认实际可用用户：

```bash
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 ubuntu@api.humi-home.com 'hostname && date'
```

如果仍返回 `Permission denied`，停止部署，先恢复生产机登录方式。不要为了部署把密钥、AppSecret 或 session secret 写进仓库、日志或临时文档。

## 5. 生产机备份

登录生产机后先识别当前服务管理方式：

```bash
systemctl status humi-api --no-pager || true
pm2 list || true
ps aux | grep '[a]pi/server.js' || true
```

再备份当前部署目录与数据文件。时间戳使用 UTC：

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
sudo mkdir -p "/opt/humi/backups/$STAMP"
sudo cp -a /opt/humi/api "/opt/humi/backups/$STAMP/api"
sudo test ! -d /opt/humi/src || sudo cp -a /opt/humi/src "/opt/humi/backups/$STAMP/src"
sudo test ! -d /opt/humi/data || sudo cp -a /opt/humi/data "/opt/humi/backups/$STAMP/data"
sudo cp -a /opt/humi/package.json "/opt/humi/backups/$STAMP/package.json"
sudo cp -a /opt/humi/package-lock.json "/opt/humi/backups/$STAMP/package-lock.json"
sudo cp -a /var/lib/humi-api/data.json "/opt/humi/backups/$STAMP/data.json"
sudo test ! -d /var/lib/humi-api/avatars || sudo cp -a /var/lib/humi-api/avatars "/opt/humi/backups/$STAMP/avatars"
sudo sh -lc 'test -n "$HUMI_API_DATA_FILE" && test -f "$HUMI_API_DATA_FILE" && cp -a "$HUMI_API_DATA_FILE" "/opt/humi/backups/'"$STAMP"'/humi-api-data.json" || true'
sudo sh -lc 'test -f /opt/humi/.humi-api-data.json && cp -a /opt/humi/.humi-api-data.json "/opt/humi/backups/'"$STAMP"'/humi-api-data.local.json" || true'
```

上一轮已记录的生产备份：`/opt/humi/backups/20260701T163948Z`。新部署前仍必须重新备份。身份版本部署后，`data.json` 与 `avatars/` 是同一份身份数据的两个组成部分，必须放在同一个时间戳备份目录中。

## 6. 同步代码

只同步 API 服务所需文件，避免把本地构建产物或无关缓存推到生产机：

```bash
rsync -az --delete --relative \
  -e "ssh -i $HOME/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes" \
  --exclude node_modules \
  --exclude .git \
  api src/lib/date.js src/lib/mealExecution.js data/recipes.json data/cook-assist.json scripts/check-native-production-env.mjs package.json package-lock.json \
  ubuntu@api.humi-home.com:/opt/humi/
```

在重启前先确认生产服务的受控环境文件 `/etc/humi/api.env` 已经提供 `HUMI_TELEMETRY_HASH_SALT`，并保持原生与 MealRun 开关关闭。该文件必须继续为 root-only；检查时只能输出变量是否存在和长度是否合格，不能打印值。生产机先安装依赖并做语法检查：

```bash
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'cd /opt/humi && npm ci --omit=dev && node --check api/server.js && node --check scripts/check-native-production-env.mjs'
```

随后通过一次性 transient systemd unit 复用正式服务的同一个 EnvironmentFile，验证 production import。该命令不打印任何环境值，也不启动监听端口：

```bash
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'sudo systemd-run --quiet --wait --pipe --collect --uid=ubuntu --gid=ubuntu --property=WorkingDirectory=/opt/humi --property=EnvironmentFile=/etc/humi/api.env /usr/bin/env NODE_ENV=production /usr/bin/node scripts/check-native-production-env.mjs'
```

最后一段命令不是语法检查：它会先以 fail-closed 方式断言 `HUMI_NATIVE_SHELL_ENABLED=0`、原生白名单为空、`HUMI_MEAL_EXECUTION_ENABLED=0`、MealRun 白名单为空以及 telemetry salt 长度合格，再真实解析 `api/store.js`、`api/server.js` 及其运行时 JSON/模块依赖。它只输出通过或不合格的变量名，绝不输出变量值。若此处失败，不得重启服务。`api/data/approved-avatar-keys.json` 是 API 的 canonical 身份头像合同；`miniprogram/data/approved-avatar-keys.json` 只是随小程序打包的 projection，服务端不得依赖它。

## 7. 重启服务

按第 5 步识别到的服务管理方式二选一：

```bash
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'sudo systemctl restart humi-api && sudo systemctl status humi-api --no-pager'
```

或：

```bash
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'pm2 restart humi-api --update-env && pm2 status humi-api'
```

## 8. 部署后验证

本地执行：

```bash
curl -fsS https://api.humi-home.com/health
npm run release:check:online
```

生产 API 应返回：

```json
{"ok":true,"service":"humi-api"}
```

再做重点人工 smoke：

- 未登录 `GET /bootstrap` 返回 `401`，不会创建用户、家庭或成员。
- 登录态 `GET /bootstrap` 返回稳定 `stateVersion`，并且 `nativeShellEnabled=false`、`mealExecutionEnabled=false`。
- `POST /recommendations/dinner`、`POST /meal-runs`、MealRun 状态转换、家庭任务和提醒合同继续通过 `npm run validate:native-bootstrap-api` 与 `npm run validate:meal-execution-api`。
- `POST /product-events` 拒绝未知事件、自由文本和伪造服务端事件；生产启动没有泄露 telemetry salt。
- 小程序普通打开后进入【今晚】，不被登录/API 慢挡住。
- `crave` 分享卡片可免登录投感觉，登录加入后立即看到该家庭共享菜单/清单/想吃池子。
- `invite` 分享卡片登录加入后立即同步该家庭共享 state。
- `grocery` 分享卡片中，别人已认领或已买到的项不能被覆盖。
- 普通成员在【我的家】不能代替主厨发起征集或分享买菜卡片。
- 精准推荐/解释额度用完时服务端返回 402，前端可降级。

API 部署后仍不打开原生能力。先验证当前 `1.1.73` 兼容壳和生产 H5，再由后续独立 checkpoint 决定是否上传 `1.1.74`。

## 9. 回滚

如果部署后健康检查失败或 P0 链路不可用，立即恢复最近一次备份：

```bash
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'sudo rm -rf /opt/humi/api && sudo cp -a /opt/humi/backups/<STAMP>/api /opt/humi/api && if sudo test -d /opt/humi/backups/<STAMP>/src; then sudo rm -rf /opt/humi/src && sudo cp -a /opt/humi/backups/<STAMP>/src /opt/humi/src; fi && if sudo test -d /opt/humi/backups/<STAMP>/data; then sudo rm -rf /opt/humi/data && sudo cp -a /opt/humi/backups/<STAMP>/data /opt/humi/data; fi && sudo cp -a /opt/humi/backups/<STAMP>/package.json /opt/humi/package.json && sudo cp -a /opt/humi/backups/<STAMP>/package-lock.json /opt/humi/package-lock.json'
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'sudo cp -a /opt/humi/backups/<STAMP>/data.json /var/lib/humi-api/data.json && if sudo test -d /opt/humi/backups/<STAMP>/avatars; then sudo rm -rf /var/lib/humi-api/avatars && sudo cp -a /opt/humi/backups/<STAMP>/avatars /var/lib/humi-api/avatars; fi'
ssh -i ~/.ssh/humi_tencent_lighthouse -o IdentitiesOnly=yes ubuntu@api.humi-home.com 'sudo systemctl restart humi-api || pm2 restart humi-api --update-env'
curl -fsS https://api.humi-home.com/health
```

不得只回滚 API 代码而遗漏 `data.json` 或 `avatars/`；否则用户资料与头像引用会出现版本不一致。回滚后在 AI-HQ Humi 状态中记录 `<STAMP>`、失败现象、执行人、恢复结果和下一步。

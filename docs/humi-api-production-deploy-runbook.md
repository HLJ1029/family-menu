# Humi API 1.1 Production Deploy Runbook

更新日期：2026-07-03
执行设备：codex@mbp-m5pro

本文档用于恢复生产机 SSH 后，补部署 Humi API 1.1.37-1.1.54 的服务端增量。

## 1. 当前事实

- 生产 API：`https://api.humi-home.com`
- 健康检查：`https://api.humi-home.com/health` 当前返回 HTTP 200。
- 当前线上 H5：`https://www.humi-home.com/`
- 当前 `main` 最新提交：`2d8426c`（Pages retry 空提交；业务/docs 提交 `51015e7`）。
- 最新 GitHub Pages：run `28627642169` / success / `npm run release:check:online` 已通过。
- 最新小程序上传：`1.1.54` / `征集加入状态同步`。
- 当前阻塞：2026-07-03 使用 `root@api.humi-home.com` 与 `ubuntu@api.humi-home.com` 均返回 `Permission denied (publickey,password)`，无法 SSH 登录生产机。

## 2. 待补部署 API 增量

恢复 SSH 后，需要把以下已进入 `main`、已通过本地 smoke 的服务端能力部署到生产 API：

- 1.1.37：感觉征集 `deadlineAt` 持久化并公开返回。
- 1.1.38：`/recommend mode=precise` 服务端登录与额度闸门，免费家庭额度用完返回 402。
- 1.1.39：`/explain` 服务端登录与精准额度闸门。
- 1.1.42：感觉征集关闭后公开 `resultSummary`。
- 1.1.51：`/household-invites/:token/join` 返回家庭共享 `state`。
- 1.1.52：买菜认领防覆盖，第二人覆盖别人认领/完成状态时返回 409。
- 1.1.53：普通成员不能代替主厨发起家庭征集或生成买菜分享卡片，返回 403。
- 1.1.54：`/crave-requests/:token/join` 返回家庭列表与共享 `state`。

## 3. 本地预检

在产品仓库执行：

```bash
cd /Users/honglijie/agent-worktrees/humi/humi-1.1-release
git fetch origin
git checkout main
git pull --ff-only
npm ci
npm run validate:api
npm run release:check:online
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

预检失败时不要部署。先修复并重新走完整验证。

## 4. 恢复 SSH 后的连接检查

先确认实际可用用户，再继续：

```bash
ssh -o BatchMode=yes -o ConnectTimeout=8 root@api.humi-home.com 'hostname && date'
ssh -o BatchMode=yes -o ConnectTimeout=8 ubuntu@api.humi-home.com 'hostname && date'
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
sudo cp -a /opt/humi/current "/opt/humi/backups/$STAMP/current"
sudo sh -lc 'test -n "$HUMI_API_DATA_FILE" && test -f "$HUMI_API_DATA_FILE" && cp -a "$HUMI_API_DATA_FILE" "/opt/humi/backups/'"$STAMP"'/humi-api-data.json" || true'
sudo sh -lc 'test -f /opt/humi/current/.humi-api-data.json && cp -a /opt/humi/current/.humi-api-data.json "/opt/humi/backups/'"$STAMP"'/humi-api-data.current.json" || true'
```

上一轮已记录的生产备份：`/opt/humi/backups/20260701T163948Z`。新部署前仍必须重新备份。

## 6. 同步代码

只同步 API 服务所需文件，避免把本地构建产物或无关缓存推到生产机：

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  api package.json package-lock.json \
  <user>@api.humi-home.com:/opt/humi/current/
```

生产机安装依赖并做语法检查：

```bash
ssh <user>@api.humi-home.com 'cd /opt/humi/current && npm ci --omit=dev && node --check api/server.js'
```

## 7. 重启服务

按第 5 步识别到的服务管理方式二选一：

```bash
ssh <user>@api.humi-home.com 'sudo systemctl restart humi-api && sudo systemctl status humi-api --no-pager'
```

或：

```bash
ssh <user>@api.humi-home.com 'pm2 restart humi-api --update-env && pm2 status humi-api'
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

- 小程序普通打开后进入【今晚】，不被登录/API 慢挡住。
- `crave` 分享卡片可免登录投感觉，登录加入后立即看到该家庭共享菜单/清单/想吃池子。
- `invite` 分享卡片登录加入后立即同步该家庭共享 state。
- `grocery` 分享卡片中，别人已认领或已买到的项不能被覆盖。
- 普通成员在【我的家】不能代替主厨发起征集或分享买菜卡片。
- 精准推荐/解释额度用完时服务端返回 402，前端可降级。

## 9. 回滚

如果部署后健康检查失败或 P0 链路不可用，立即恢复最近一次备份：

```bash
ssh <user>@api.humi-home.com 'sudo rm -rf /opt/humi/current && sudo cp -a /opt/humi/backups/<STAMP>/current /opt/humi/current'
ssh <user>@api.humi-home.com 'sudo systemctl restart humi-api || pm2 restart humi-api --update-env'
curl -fsS https://api.humi-home.com/health
```

回滚后在 AI-HQ Humi 状态中记录 `<STAMP>`、失败现象、执行人、恢复结果和下一步。

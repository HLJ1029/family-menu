# Humi API 首发合同

默认域名：`https://api.humi-home.com`

当前生产状态（2026-07-05）：

- `https://api.humi-home.com/health` 已返回 HTTP 200。
- 健康检查响应：`{"ok":true,"service":"humi-api"}`。
- `npm run release:check:online` 已通过。
- 生产 API 已完成 1.1.37/1.1.38/1.1.39/1.1.42/1.1.51/1.1.52/1.1.53/1.1.54 的服务端增量补部署；备份路径 `/opt/humi/backups/20260703T045543Z`，`humi-api.service` 已重启，`npm run deploy:api:check`、`npm run monitor:prod` 和 `npm run release:check:online` 已通过。1.1.59 为原生分享确认页与 JSSDK/小程序壳更新，不新增 API 端点。

本地启动：

```bash
npm run api:dev
```

本地 smoke：

```bash
npm run validate:api
```

环境变量：

| 变量 | 用途 |
| --- | --- |
| `HUMI_API_PORT` | 本地监听端口，默认 `8787` |
| `HUMI_API_DATA_FILE` | 本地文件存储路径，默认 `.humi-api-data.json` |
| `HUMI_SESSION_SECRET` | Humi session HMAC 密钥，生产必填 |
| `HUMI_ALLOWED_ORIGINS` | CORS 允许来源，逗号分隔 |
| `WECHAT_APP_ID` | 微信小程序 AppID |
| `WECHAT_APP_SECRET` | 微信小程序 AppSecret |
| `HUMI_WECHAT_MOCK` | 仅本地测试使用，`1` 时不请求微信接口 |

## 微信登录

`POST /auth/wechat/login`

请求：

```json
{
  "code": "wx.login 返回的 code"
}
```

响应：

```json
{
  "accessToken": "Humi 会话 token",
  "refreshToken": "刷新 token",
  "expiresAt": 1790000000000,
  "user": {
    "id": "humi_user_id",
    "displayName": "微信用户",
    "provider": "wechat"
  }
}
```

服务端要求：

- 使用小程序 AppID 和 AppSecret 调微信 `code2Session`。
- AppSecret 不得进入前端或小程序包。
- 按 `openid` 创建或恢复 Humi 用户。
- 登录失败返回非 2xx，小程序壳层会停留在登录重试页，不自动进入游客体验。
- 当前仓库实现位于 `api/`，使用 Node HTTP 标准库和本地 JSON 文件存储。正式部署多实例前，需要替换为托管数据库或对象存储。

## 会话

- `POST /auth/session/refresh`：刷新 Humi 会话。
- `POST /auth/logout`：退出登录并失效当前会话。
- `GET /me`：返回当前用户、画像完成状态和家庭空间摘要。
- `POST /profile`：保存用户画像。

## 微信手机号绑定

`POST /auth/wechat/phone`

请求头：

```http
Authorization: Bearer <accessToken>
```

请求：

```json
{
  "code": "button open-type=getPhoneNumber 返回的 code"
}
```

响应：

```json
{
  "accessToken": "Humi 会话 token",
  "refreshToken": "刷新 token",
  "expiresAt": 1790000000000,
  "user": {
    "id": "humi_user_id",
    "displayName": "微信用户",
    "provider": "wechat",
    "phoneVerified": true,
    "phoneMasked": "138****1234",
    "phoneVerifiedAt": "2026-06-29T00:00:00.000Z"
  }
}
```

服务端要求：

- 必须校验当前 Humi session；不得只凭手机号 code 绑定账号。
- 使用服务端 AppSecret 获取微信接口 `access_token`，再调用微信手机号接口换取号码。
- 前端和小程序包不得持有 AppSecret、微信接口 `access_token` 或手机号明文。
- 数据层只保存脱敏手机号、绑定时间、国家码和基于服务端密钥的 HMAC 哈希；不保存手机号明文。
- 用户拒绝手机号授权不影响核心菜单、清单、库存功能。

## 微信账号状态

- `GET /state`：读取当前微信用户所在家庭保存的菜单、计划、清单、后台已有、画像、推荐额度和协作状态。
- `PUT /state`：保存当前微信用户所在家庭的菜单、计划、清单、后台已有、画像、推荐额度和协作状态。

`/state` 使用 `Authorization: Bearer <accessToken>` 鉴权。当前 1.1 使用家庭级共享状态：正式家庭成员读取同一份 `householdStates[householdId]`，切换家庭后状态隔离。

状态字段兼容旧版 `todayMenu`、`weekPlan`、`mealCalendar`，新版新增 `mealPlan`：

```json
{
  "mealPlan": {
    "2026-06-30": {
      "breakfast": [{ "recipeId": "plain-rice-porridge", "quantity": 1 }],
      "lunch": [{ "recipeId": "egg-fried-rice", "quantity": 1 }],
      "dinner": [{ "recipeId": "tomato-egg", "quantity": 1 }]
    }
  }
}
```

## 家庭与邀请

- `GET /households`：读取当前用户加入的家庭列表和当前家庭。
- `POST /households`：创建一个新家庭，并把创建者设为 `owner`。
- `POST /households/active`：切换当前家庭。
- `POST /household-invites`：仅主厨/owner 可创建家庭邀请。
- `GET /household-invites/:token`：公开读取邀请摘要。
- `POST /household-invites/:token/join`：登录后加入家庭，成为正式成员。

家庭角色边界：

- `owner` 可发起家庭邀请、发起征集、管理这个家。
- `member` 可共享菜单、清单、征集记录和买菜认领。
- `member` 不能代替主厨发起这个家的感觉征集或生成这个家的买菜分享卡片；服务端返回 403。
- 免登录临时参与者只能投感觉、认领买菜、丢想吃，不能拥有或管理家庭。

## 感觉征集

`POST /crave-requests`

- 登录主厨调用时绑定当前家庭，返回 `request` 和 `ownerSecret`。
- 登录普通成员调用当前家庭征集会返回 `403 forbidden`；家人只能参与投感觉，不能拥有征集。
- `request.deadlineAt` 必须公开返回，默认 `createdAt + 30 分钟`。
- 小程序分享卡片使用 `request.token` 进入 H5 落地页。

`GET /crave-requests/:token`

- 公开读取征集摘要、公开票数、截止时间和可选的 `resultSummary`。
- 不返回 `ownerSecret`。

`POST /crave-requests/:token/votes`

公开免登录提交临时投票：

```json
{
  "participantKey": "local-temporary-id",
  "memberName": "家人",
  "feelingTag": "想喝汤",
  "note": "想吃紫菜蛋花汤",
  "temporary": true
}
```

`POST /crave-requests/:token/join`

- 登录后把本机 `participantKey` 对应的临时投票合并为正式成员投票。
- 若请求有关联家庭，会把当前用户加入该家庭。

`POST /crave-requests/:token/close`

主厨端用 `ownerSecret` 结束征集，可附带结果摘要：

```json
{
  "ownerSecret": "secret-from-create",
  "resultSummary": {
    "dishes": [{ "name": "番茄炒蛋", "timeMinutes": 15 }],
    "reason": "已揉合 2 个家人回复。",
    "generatedAt": "2026-07-02T00:00:00.000Z"
  }
}
```

公开响应里的 `resultSummary` 只用于家人落地页展示“今晚定了”，不是权威菜单存储；正式菜单仍在家庭 `/state.todayMenu` 和 `/state.mealPlan` 里。

## 买菜协作

- `POST /grocery-shares`：登录用户把当前清单生成可分享 token。
- 当前家庭的普通成员调用 `POST /grocery-shares` 返回 `403 forbidden`；家人只能认领或标记买到清单项。
- `GET /grocery-shares/:token`：公开读取清单摘要。
- `POST /grocery-shares/:token/claims`：免登录或登录成员认领/标记买到某项食材，并同步回家庭 `groceryClaims`。
- 已被其他成员认领或买到的项不能被第二个成员覆盖；服务端返回 `409 grocery_item_claimed` 或 `409 grocery_item_done`，前端应展示“已有人在买/已买到”而不是继续完成。

买菜认领是免费协作能力，不按次数计费。

## 推荐与成本闸门

`POST /recommend`

- `mode !== "precise"`：基础推荐，低成本路径，可公开调用，用本地规则/缓存兜底。
- `mode === "precise"`：必须登录；服务端读取家庭共享 `recommendationAccess`。
- 免费家庭 `preciseTrialRemaining <= 0` 时返回 HTTP `402 precise_trial_exhausted`。
- Plus 家庭不限精准次数。
- 成功调用真实 DeepSeek 后，服务端更新并返回最新 `recommendationAccess`。

`POST /explain`

- 精准解释复用同一套登录与额度闸门。
- 当前前端默认展示已有本地/精准理由，不主动消耗 DeepSeek 解释额度。

成本原则：

- 感觉征集、买菜认领、清单、基础推荐永远免费不限次数。
- 高成本精准 API 才进入尝鲜额度/Plus 家庭版。

## 发布前平台配置

- request 合法域名：`api.humi-home.com`
- WebView 业务域名：`www.humi-home.com`
- 微信后台隐私保护指引需声明微信身份标识用于账号登录和恢复。
- 如启用手机号绑定，微信后台隐私保护指引需声明手机号用于账号绑定、登录验证、账号找回和家庭协作安全。

## 生产部署闸门

生产环境必须满足：

- `NODE_ENV=production`。
- `HUMI_SESSION_SECRET` 已配置为足够长的随机密钥。
- `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 使用正式小程序配置。
- `HUMI_ALLOWED_ORIGINS` 至少包含 `https://www.humi-home.com`。
- `https://api.humi-home.com/health` 返回 200。
- 微信公众平台 request 合法域名已配置 `api.humi-home.com`。

首发实现当前使用本地 JSON 文件存储，适合单实例验证。若部署到多实例或无持久磁盘环境，必须先把 `HumiStore` 替换为托管数据库或对象存储，否则微信登录用户、profile 和失效 token 可能丢失或分裂。

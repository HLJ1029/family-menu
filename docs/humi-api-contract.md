# Humi API 首发合同

默认域名：`https://api.humi-home.com`

当前生产状态（2026-06-24）：

- `https://api.humi-home.com/health` 已返回 HTTP 200。
- 健康检查响应：`{"ok":true,"service":"humi-api"}`。
- `npm run release:check:online` 已通过。

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

- `GET /state`：读取当前微信用户保存的菜单、计划、清单、库存、画像和反馈。
- `PUT /state`：保存当前微信用户的菜单、计划、清单、库存、画像和反馈。

`/state` 使用 `Authorization: Bearer <accessToken>` 鉴权。首发用于小程序审核闭环：用户通过微信登录后，今晚菜单、购物清单、家中库存和基础画像会保存到 Humi API，换设备或重新进入小程序可恢复。

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

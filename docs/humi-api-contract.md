# Humi API 首发合同

默认域名：`https://api.humi-home.com`

当前生产状态（2026-07-14）：

- `https://api.humi-home.com/health` 已返回 HTTP 200。
- 健康检查响应：`{"ok":true,"service":"humi-api"}`。
- `npm run release:check:online` 已通过。
- 小程序 1.1.72 使用本合同，并包含多家庭定向保存、五类协作分享、协作状态持久化、临时身份隐私收口与短期海报图片交接。

2026-07-19 身份改造分支说明：本分支已实现主动微信登录、身份资料完善、一次性 H5 票据和无副作用家庭读取，但尚未部署生产或上传微信版本。普通启动不得调用微信登录；`POST /auth/wechat/login` 只允许由用户主动点击触发。

同日对生产 `/var/lib/humi-api/data.json` 做了只读聚合审计：18 个用户、18 条微信身份、7 个家庭、6 份家庭状态。18 个用户均为旧结构，缺少 `profileStatus` 且昵称都是默认“微信用户”；本次实现没有修改这些生产记录，升级后会在用户下一次主动登录时要求一次性完善身份。

本地启动：

```bash
npm run api:dev
```

本地 smoke：

```bash
npm run validate:api
```

原生启动合同：

```bash
npm run validate:native-bootstrap-api
```

环境变量：

| 变量 | 用途 |
| --- | --- |
| `HUMI_API_PORT` | 本地监听端口，默认 `8787` |
| `HUMI_API_DATA_FILE` | 本地文件存储路径，默认 `.humi-api-data.json` |
| `HUMI_AVATAR_DIR` | 用户头像持久化目录，默认位于数据文件同级的 `avatars/` |
| `HUMI_POSTER_DIR` | 短期海报图片目录，默认与数据文件同级的 `.humi-posters` |
| `HUMI_PUBLIC_BASE_URL` | 海报公开下载地址前缀，生产为 `https://api.humi-home.com` |
| `HUMI_POSTER_MAX_BYTES` | 单张海报上限，默认 950KB，服务端硬上限 1MB |
| `HUMI_POSTER_TTL_MS` | 海报保留时长，默认 24 小时，最低 1 小时 |
| `HUMI_POSTER_RATE_LIMIT` | 单用户与 IP 每分钟上传上限，默认 12 次 |
| `HUMI_SESSION_SECRET` | Humi session HMAC 密钥，生产必填 |
| `HUMI_ALLOWED_ORIGINS` | CORS 允许来源，逗号分隔 |
| `WECHAT_APP_ID` | 微信小程序 AppID |
| `WECHAT_APP_SECRET` | 微信小程序 AppSecret |
| `HUMI_WECHAT_MOCK` | 仅本地测试使用，`1` 时不请求微信接口 |
| `HUMI_NATIVE_SHELL_ENABLED` | 原生小程序壳总开关；默认 `0`。 |
| `HUMI_NATIVE_SHELL_HOUSEHOLDS` | 原生壳家庭白名单，逗号分隔；空值不匹配任何家庭。仅测试环境在总开关为 `1` 时可使用 `*`，它也匹配尚未建家的首次用户。 |

## 原生启动 Bootstrap

`GET /bootstrap` 要求 `Authorization: Bearer <accessToken>`，并返回 `Cache-Control: private, no-store`。读取不会创建家庭、成员或家庭状态。响应使用 `schemaVersion: 1`，包含已脱敏的当前用户、全部家庭、当前家庭 ID、家庭状态、当天晚餐 `MealRun` 与能力开关。

`stateVersion` 是对已脱敏家庭状态、当前家庭成员/角色、当前晚餐与相关能力开关做稳定 SHA-256 base64url 哈希；不包含 `generatedAt`，相同逻辑状态重复读取时保持不变。用户字段只包含 `id`、`displayName`、`avatarKey`、`avatarUrl` 与 `profileStatus`，不会返回 token、openid 或电话散列。

原生壳只有在 `HUMI_NATIVE_SHELL_ENABLED=1` 且 allowlist 匹配当前家庭时才启用；空 allowlist 永不匹配。未命中时响应仍成功，但 `capabilities.nativeShellEnabled=false`，客户端继续进入既有 H5。

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
    "provider": "wechat",
    "profileStatus": "incomplete",
    "avatarKey": "humi-avatar-family-f-01",
    "avatarUrl": ""
  }
}
```

服务端要求：

- 使用小程序 AppID 和 AppSecret 调微信 `code2Session`。
- AppSecret 不得进入前端或小程序包。
- 按 `openid` 创建或恢复 Humi 用户。
- 新用户返回 `profileStatus=incomplete`；只有完成 `PUT /identity/profile` 后才变为 `complete`。
- 微信登录成功不自动创建家庭，也不自动把资料标记为完成。
- 登录失败返回非 2xx，小程序壳层会停留在登录重试页，不自动进入游客体验。
- 当前仓库实现位于 `api/`，使用 Node HTTP 标准库和本地 JSON 文件存储。正式部署多实例前，需要替换为托管数据库或对象存储。

## 会话

- `POST /auth/session/refresh`：刷新 Humi 会话。
- `POST /auth/logout`：退出登录并失效当前会话。
- `GET /me`：返回当前用户、身份资料状态和家庭空间摘要；无家庭时返回 `family: null`、`households: []`。
- `POST /profile`：保存用户画像。

## 身份资料、头像与 H5 交接

- `PUT /identity/profile`：保存必填昵称，并把 `profileStatus` 更新为 `complete`。
- `POST /identity/avatar`：上传 JPEG/PNG 头像；Base64 解码后最大 512 KiB。JPEG 必须包含可解析的 segment、有效尺寸、SOF/SOS/EOI；PNG 必须通过逐 chunk 边界与 CRC、IHDR 尺寸/编码、IDAT 和 IEND 校验。只上传头像不会提前完成身份资料。
- `GET /avatars/:token.jpg|png`：公开读取头像。URL 仅包含不透明随机 token，不包含 OpenID、手机号、昵称或用户 ID。
- `POST /auth/h5-ticket`：资料完成的原生会话可申请 60 秒有效、只能消费一次的 H5 票据；数据文件只保存 SHA-256 哈希。
- `POST /auth/h5/exchange`：消费票据并返回 H5 session；过期、伪造或重复消费均返回 401。

小程序与 H5 的长期 access token 不进入 URL 或 history。H5 完成交换后立即从地址栏移除 `humiTicket`。H5 发现本地 session 过期，或任一鉴权读取/写入返回 401/`invalid_session`，必须统一清掉 H5 与原生缓存并回到重新登录/游客选择，不得继续显示“已登录”。用户再次点击登录时，原生身份页必须先丢弃残留 session，再执行新的 `wx.login`。

H5 到原生的登录与退出使用立即执行的页面导航：登录进入 `/pages/identity/index?action=login`，退出重启到 `/pages/index/index?humiLogout=1`。正式身份链路不得依赖 `web-view bindmessage` 才触发，因为该消息可能延迟到返回、销毁或分享时才送达。

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

`GET /state` 与 `GET /households` 在用户没有家庭时分别返回 `state: null, family: null, households: []` 和 `family: null, households: []`，不得创建家庭或家庭状态。`PUT /state`、发起家庭协作等需要家庭的写操作在无家庭时返回 `409 household_required`。只有用户明确提交 `POST /households` 才能创建家庭。

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
- `GET /households/:householdId/collaborations?limit=50`：读取这个家的协作历史；必须携带有效、未撤销的 bearer，且调用者必须是该家的正式成员。owner 与 member 得到相同的最新优先结果；陌生用户或不存在的家庭一律返回掩码 `404 household_not_found`，GET 不写入任何记录。`limit` 默认为 `50`，并限制在 `1..100`。
- `POST /households`：创建一个新家庭，并把创建者设为 `owner`。`householdName` 缺失、仅含空白或整个 JSON 请求体为 `null` 时等价处理，均返回 `400 household_name_required`，且不创建家庭或家庭状态。
- `POST /households/active`：切换当前家庭。
- `POST /household-invites`：仅主厨/owner 可创建家庭邀请。
- `GET /household-invites/:token`：公开读取邀请摘要。
- `POST /household-invites/:token/wants`：临时家人凭邀请 token 免登录丢一道想吃；同一临时身份重复提交会更新自己的未完成条目。
- `POST /household-invites/:token/join`：登录后加入家庭，成为正式成员。

正式家庭关系只会由两种操作建立：用户明确 `POST /households` 创建家庭，或登录用户接受 `POST /household-invites/:token/join`。感觉征集、买菜协作和想吃征集的参与认领都不是家庭邀请，绝不能自动把参与者变成正式成员。

协作历史响应固定为 `{ householdId, events }`。每一条 `event` 只包含安全的展示投影：`id`、`requestType`、`actionType`、`createdAt`、`participant: { displayName, avatarUrl }`，以及按动作白名单过滤的 `payload`（感觉：`feelingTag`/`dishWish`/`note`；买菜：`status`/`itemIds`/`note`；想吃：`dishName`/`note`）。它不会返回协作路由 token、owner secret、请求/成员/参与者内部 ID、guest storage key、认领/合并元数据、内部时间戳、OpenID/union ID/手机号，或任何 `family`、`households`、`state` 包络。

协作历史读取的认证错误沿用会话边界：缺少 bearer 为 `401 missing_token`，无效或过期为 `401 invalid_token`，已撤销为 `401 revoked_token`；非成员和未知家庭都保持 `404 household_not_found`，避免暴露家庭是否存在。

以下三个保留的 `/join` 路径是“把临时参与记录绑定到已认证身份”的兼容名称，而不是加入家庭：

- `POST /crave-requests/:token/join`
- `POST /grocery-share-requests/:token/join`
- `POST /wish-share-requests/:token/join`

它们只返回 `{ request }`，不返回 `family`、`households` 或 `state`，也不改变任何家庭成员数量或当前家庭。H5 合并参与记录时必须保留用户已有的家庭和家庭状态；若需要成为正式成员，必须单独接受家庭邀请。

家庭角色边界：

- `owner` 可发起家庭邀请、发起征集、管理这个家。
- `member` 可共享菜单、清单、征集记录和买菜认领。
- `member` 不能代替主厨发起这个家的感觉征集或生成这个家的买菜分享卡片；服务端返回 403。
- 免登录临时参与者只能投感觉、认领买菜、丢想吃，不能拥有或管理家庭。
- 邀请页提交想吃时携带本机 `participantKey`；正式加入同一个家后，该条目归并到微信成员身份。
- 用户主动维护的信息只保留忌口/过敏等硬约束；软口味与营养回看由感觉征集、想吃和确认做饭等行为形成，不要求填写设置表。

### 家庭生命周期

以下接口均要求 `Authorization: Bearer <accessToken>`；服务端始终从会话中识别操作者，不能在请求体中指定 acting user ID。

- `PATCH /households/:householdId`，请求体 `{ "name": "新家庭名称" }`：仅 `owner` 可改名。
- `DELETE /households/:householdId/members/:memberId`：仅 `owner` 可移除正式成员，且不能移除当前 owner。
- `POST /households/:householdId/owner`，请求体 `{ "memberId": "正式成员 ID" }`：仅 `owner` 可把 owner 身份转给同一家庭的正式成员。
- `POST /households/:householdId/leave`：当前成员退出家庭；owner 在仍有其他正式成员时必须先转让 owner。

以上成功响应都包含 `{ family, households }`。退出接口还包含当前新 active 家庭的 `{ state }`。改名、移除成员、转让 owner 和从多成员家庭退出都不会改写该家庭的共享菜单、计划、清单或协作状态；退出后只切换退出者的 active 家庭。移除成员、成员主动退出，以及最后一位 owner 主动退出并删除空家庭时，服务端会同时删除该用户的旧版 `states[userId]` 启动快照，防止之后创建新家时复活旧家的菜单、用餐记录或家庭画像。只有最后一位 owner 主动退出、使家庭为空时，服务端才可以清理该空家庭及其状态。

家庭生命周期的业务错误码：

| HTTP | 错误码 | 含义 |
| --- | --- | --- |
| 404 | `household_not_found` | 当前用户没有该家庭，或家庭不存在。 |
| 403 | `forbidden` | 非 owner 尝试管理家庭。 |
| 400 | `household_name_required` | 家庭名称为空或无效。 |
| 404 | `member_not_found` | 指定的新 owner 或待移除成员不是该家庭的正式成员。 |
| 409 | `owner_cannot_be_removed` | 不能通过成员移除接口删除 owner。 |
| 409 | `owner_must_transfer_or_disband` | owner 离开前仍有其他正式成员，必须先转让或解散。 |

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

- 登录后把本机 `participantKey` 对应的临时投票绑定到当前认证身份。
- 这只是一次协作参与认领，不建立正式成员关系，也不返回家庭或家庭状态；响应仅为 `{ request }`。

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

## 海报图片交接

`POST /poster-shares`

- 必须携带有效 Humi 微信登录会话。
- 请求体是 Humi 在浏览器 Canvas 生成的 JPG 或 PNG 原始字节；服务端同时校验 `Content-Type` 和文件签名。
- 单张默认不超过 950KB；前端在上传前压缩到 900KB 内，以兼容生产反向代理的 1MB 请求上限。
- 返回不可预测的临时 token、图片格式、公开 URL、字节数和失效时间。
- 同一用户与 IP 默认每分钟最多上传 12 张，超过返回 429。

`GET /poster-shares/:token.jpg` / `GET /poster-shares/:token.png`

- 小程序原生海报页用该地址执行 `wx.downloadFile`，随后才调起图片分享或相册保存。
- 图片默认保留 24 小时；过期文件会删除并返回 410，未知 token 返回 404。
- URL 仅以 192 位随机 token 作为短期访问能力，不包含用户、家庭、菜单或清单标识。
- 海报不得作为长期家庭数据存储；失效后需要回到 Humi 重新生成。

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

## 晚餐执行：每周做成两顿

该能力默认关闭。只有 `HUMI_MEAL_EXECUTION_ENABLED=1`，且当前家庭 ID 命中 `HUMI_MEAL_EXECUTION_HOUSEHOLDS`（逗号分隔，或 `*`）时，`GET /me` 与 `GET /state` 才返回 `capabilities.mealExecution=true`。H5 只在该 capability 为真、且当前菜单全部为认证菜谱时展示新流程；否则保持原有今晚流程。

正式接口均要求 `Authorization: Bearer <accessToken>`：

- `POST /meal-runs`：owner 为指定日期晚餐创建或替换 `planned` 记录；必须携带 `idempotencyKey`。当天现有 `planned` 可替换，`cooking` 或 `completed` 不可覆盖。
- `GET /meal-runs/current?householdId=...&dateKey=YYYY-MM-DD&mealSlot=dinner`：正式成员读取当天当前晚餐。
- `POST /meal-runs/:id/start`：正式成员开始做饭；重复调用返回同一 `startedAt`。
- `PUT /meal-runs/:id/progress`：正式成员推进到快照时间线中的步骤，等待计时只保存绝对时间 `timerEndsAt`。
- `POST /meal-runs/:id/downgrade`：正式成员执行 `remove_optional_side | lower_effort_recipe | ready_staple`。
- `POST /meal-runs/:id/complete`：只有该接口对应的明确“上桌了”动作把状态改为 `completed`；重复调用不重复计数。
- `POST /meal-runs/:id/abandon`：原因仅允许 `too_much_effort | missing_ingredients | plans_changed | cooking_failed`，不破坏周节奏。
- `PUT /meal-runs/:id/feedback`：完成后按成员幂等更新 `want_again | change_next_time | too_much_effort`。

`MealRun` 保存家庭、日期、`dinner`、行动力、认证菜谱快照、时间线版本、当前步骤、绝对计时器、操作者、时间戳、降级历史和家庭反馈。运行时不调用 AI 生成烹饪步骤。游客记录保存在本机；登录后 owner 可用稳定的合并幂等键创建远端记录并重放状态，`syncedFromLocalId` 用于避免周完成数重复。登录成员离线时可继续推进本地时间线，联网后按顺序重放幂等状态操作。

权限边界：

- owner 可选择/替换家庭晚餐，也可以执行做饭。
- 正式 member 不能修改家庭菜单，但可以开始、推进、降级、确认上桌、反馈和创建/完成协作任务。
- 游客只能在本机完成选择和做饭，不能创建/领取家庭任务，也不能创建微信提醒。

### 家庭做饭任务

- `POST /meal-runs/:id/tasks`：从认证快照生成 `buy` 或 `prep` 任务，服务端生成安全展示文案和不可预测 token。
- `GET /meal-tasks/:token`：只有该家庭正式成员可读取任务。
- `POST /meal-tasks/:token/claim`：正式成员幂等认领；游客和陌生家庭不得读取或认领。
- `POST /meal-tasks/:token/complete`：认领者或 owner 标记完成。

小程序分享类型为 `meal_task`，深链参数为 `mealTask=<token>&shareSource=meal_task`。分享任务不阻塞发起者继续单人做饭。

### 微信一次性提醒

- `GET /meal-reminders/config`：正式成员读取服务端配置的订阅模板 ID。
- `POST /meal-reminders`：只接受原生页在用户点击后取得 `accept` 的请求；请求必须包含 `accepted=true` 和匹配的 `templateId`。
- `DELETE /meal-reminders/:id`：创建者取消尚未发送的提醒。

H5 只负责收集用户主动选择的下一次做饭时间，然后导航到原生 `/pages/reminder/index`。原生页 `onLoad` 不调用 `wx.requestSubscribeMessage`；只有用户再次点击确认按钮才请求微信授权。拒绝后本机记忆为拒绝，不再重复索取；拒绝或取消都不会创建服务端提醒。发送失败最多重试一次，成功、失败或取消后不会再投递；目标日期晚餐已经完成或放弃时自动取消。

### 分析与保留

客户端只允许上报 `effort_tier_viewed`、`effort_tier_selected`、`plan_presented`、`plan_accepted`、`reminder_opened`，不上传昵称或自由文本。开始、完成和放弃由状态接口在服务端形成事实。原始产品事件保留 180 天；家庭可见的晚餐记录持续保留。

灰度验证固定为 10–20 个真实家庭、两周：方案展示→开始做饭 ≥50%，开始→上桌 ≥70%，首顿完成家庭 7 天内第二顿 ≥40%，并观察激活家庭每周 Humi 辅助晚餐完成数中位数是否达到 2。回滚只需先把 `HUMI_MEAL_EXECUTION_ENABLED` 改为 `0` 并重启 API；旧今晚流程与历史 `MealRun` 数据都保留，不执行数据删除。

相关环境变量：

| 变量 | 用途 |
| --- | --- |
| `HUMI_MEAL_EXECUTION_ENABLED` | 总开关；默认 `0`。 |
| `HUMI_MEAL_EXECUTION_HOUSEHOLDS` | 家庭 ID 白名单，逗号分隔；`*` 表示全部家庭。 |
| `HUMI_MEAL_REMINDER_TEMPLATE_ID` | 微信一次性订阅消息模板 ID。 |
| `HUMI_MEAL_REMINDER_THING_KEY` | 模板中的事项字段 key，默认 `thing1`。 |
| `HUMI_MEAL_REMINDER_TIME_KEY` | 模板中的时间字段 key，默认 `time2`。 |

生产启用前必须完成 30 道菜的厨房走查、10 组双菜组合、390×844 真机全流程和订阅消息真实送达验证。本地候选完成不等于允许部署、扩白名单或提交微信审核。

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

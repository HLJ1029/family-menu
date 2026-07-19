# Humi 微信登录与手机号绑定实施方案 V1

更新日期：2026-06-07

## 1. 目标

小程序正式验证前，将身份方案从邮箱登录切换为更符合国内用户习惯的微信登录，并把手机号绑定作为增强身份。

核心原则：

- 游客仍可先体验核心推荐链路。
- 小程序主登录使用微信身份。
- 手机号只在必要场景请求授权。
- 邮箱登录保留给 Web/PWA、后台测试和迁移兜底。
- 微信 AppSecret、手机号接口凭证、DeepSeek Key 等敏感信息只放服务端。

## 2. 用户体验策略

### 2.1 登录后置

不在首页首屏强制登录。

触发登录的场景：

- 主厨发起感觉征集或生成可回传的家庭协作卡片。
- 保存到云端。
- 跨设备恢复数据。
- 创建或加入家庭。
- 绑定手机号。
- 后续支付、会员或客服场景。

### 2.2 小程序登录入口

小程序内显示：

- 主按钮：微信一键登录。
- 次级入口：先随便看看。
- 手机号绑定：只在需要更强身份时出现。
- 邮箱入口：默认隐藏，仅保留 Web/PWA 或开发测试开关。

### 2.3 手机号绑定时机

不在首次打开时请求手机号。

建议触发点：

- 用户要换设备找回账号。
- 用户要邀请家人或接受家庭邀请。
- 用户要开启付费/会员/订单类能力。
- 用户主动进入账号安全页面。

## 3. 推荐架构

### 阶段 A：备案前/过渡期

```text
小程序
  → H5 WebView
    → 国内/海外临时 API
      → Supabase Auth/Data
```

目标：先完成流程验证，不承诺最终架构。

### 阶段 B：备案后/正式验证

```text
小程序
  → Humi 国内 API
    ├── 微信 code2Session
    ├── 手机号换取与绑定
    ├── Humi 用户映射
    ├── 推荐代理
    └── 数据同步 API
```

数据库可先继续 Supabase 过渡，但新身份服务建议放在国内 API 后端，减少微信接口、用户身份和后续手机号能力的跨境复杂度。

### 阶段 C：国内后端稳定后

```text
小程序/H5
  → 国内 API
    → 国内数据库
    → 国内对象存储/CDN
    → DeepSeek 推荐代理
```

目标：将核心用户数据、登录、推荐和埋点迁至国内，Supabase 仅作为旧数据迁移源或下线。

## 4. 微信登录流程

### 4.1 小程序端

```text
用户点击“微信一键登录”
→ wx.login()
→ 获取临时 code
→ 调用 POST /auth/wechat-login
→ 服务端返回 Humi session
→ H5/WebView 保存登录态
```

注意：

- code 只能使用一次。
- 不在前端持有 AppSecret。
- 不把 OpenID 暴露为用户可见 ID。
- 登录失败时回到游客模式，不阻塞单人安排；但不会匿名创建主厨协作请求。

### 4.2 服务端

`POST /auth/wechat-login`

请求：

```json
{
  "code": "wx_login_code",
  "channel": "wechat-miniprogram"
}
```

服务端动作：

1. 用 `appid + secret + code` 调微信 `auth.code2Session`。
2. 获取 `openid`，如有开放平台绑定则可能获得 `unionid`。
3. 查找或创建 Humi 用户。
4. 查找或创建默认家庭空间。
5. 签发 Humi session。
6. 返回前端。

响应：

```json
{
  "session": "humi_session_token",
  "user": {
    "id": "humi_user_id",
    "hasPhone": false,
    "hasFamily": true
  }
}
```

## 5. 手机号绑定流程

### 5.1 小程序端

用户点击授权按钮：

```text
button open-type="getPhoneNumber"
→ bindgetphonenumber 拿到手机号 code
→ POST /auth/wechat/phone
```

### 5.2 服务端

`POST /auth/wechat/phone`

请求：

```json
{
  "phoneCode": "getPhoneNumber_code"
}
```

服务端动作：

1. 校验 Humi session。
2. 获取或刷新微信接口 `access_token`。
3. 调微信手机号接口，用 `phoneCode` 换取手机号。
4. 将手机号加密或脱敏存储。
5. 写入绑定时间和授权来源。

响应：

```json
{
  "phoneBound": true,
  "maskedPhone": "138****1234"
}
```

## 6. 数据模型建议

当前 `profiles` 已预留：

- `wechat_openid`
- `wechat_unionid`

为了降低未来迁移风险，建议新增独立身份表，而不是继续把所有身份字段塞进 `profiles`。

### 6.1 `auth_identities`

```sql
create table auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  provider_user_id text not null,
  union_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);
```

示例：

- `provider = wechat_miniprogram`
- `provider_user_id = openid`
- `union_id = unionid`

### 6.2 `user_phone_bindings`

```sql
create table user_phone_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  phone_country_code text not null default '86',
  phone_e164 text not null,
  phone_masked text not null,
  verified_at timestamptz not null default now(),
  source text not null default 'wechat_miniprogram',
  created_at timestamptz not null default now(),
  unique (phone_country_code, phone_e164)
);
```

实施注意：

- 前端只展示 `phone_masked`。
- 数据库中手机号建议加密或至少限制读取权限。
- 手机号绑定上线前必须更新隐私政策、用户协议和微信后台隐私保护指引。

## 7. Session 方案

### 方案 1：继续 Supabase Auth 过渡

优点：

- 复用现有 RLS、家庭空间和同步逻辑。
- 改动较小。

难点：

- Supabase 原生不直接支持微信小程序登录。
- 需要通过服务端创建/映射 Supabase 用户或使用自定义 token 方案。
- 国内网络稳定性仍是风险。

适合：短期验证。

### 方案 2：Humi 自有 Session

优点：

- 微信登录、手机号、后续国内数据库更自然。
- 小程序与 H5 可以共用 Humi API。
- 迁国内后端更顺。

难点：

- 需要重做服务端鉴权、权限、家庭空间访问控制。
- 需要迁移现有 Supabase 同步接口。

适合：备案后正式验证阶段。

### 建议

先设计成“自有身份层 + 可桥接 Supabase”：

```text
Humi Session
  → 短期映射 Supabase user_id
  → 中期切换 Humi 国内数据库 user_id
```

这样微信登录代码不被 Supabase 绑定死。

## 8. API 清单

首批建议：

- `POST /auth/wechat-login`
- `POST /auth/wechat/phone`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/link-email`（可选，Web/PWA 迁移用）
- `POST /auth/delete-account-request`

后续：

- `POST /family/create`
- `POST /family/invite`
- `POST /family/join`
- `POST /data/migrate-local`

## 9. 安全要求

- 微信 AppSecret 只能放服务端密钥管理。
- 微信手机号接口 `access_token` 只能服务端获取和缓存。
- 不在日志中记录 code、openid、手机号明文、session token。
- 登录接口需要限流。
- 手机号绑定必须有用户主动点击授权。
- session 使用 HttpOnly Cookie 或安全存储策略，避免被页面脚本随意读取。
- 删除账号流程必须能解除微信身份和手机号绑定。

## 10. 隐私与审核影响

微信登录上线前必须更新：

- `public/privacy.html`
- `public/terms.html`
- `docs/privacy-data-inventory.md`
- 微信后台隐私保护指引
- 审核备注

新增声明项：

- 微信身份标识。
- 手机号。
- 账号绑定、找回、家庭协作用途。
- 解绑与删除申请方式。

不得声明：

- 自动读取微信昵称、头像、手机号。
- 未经用户点击授权获取手机号。

## 11. 实施步骤

### Step 1：设计确认

- [ ] 确认是否先用 Supabase 过渡，还是直接国内 API。
- [ ] 确认正式域名和 API 子域名。
- [ ] 确认小程序 AppID。
- [ ] 确认微信登录是否赶在首批灰度前完成。

### Step 2：后端基础

- [ ] 新建国内 API 项目或云函数。
- [ ] 配置微信 AppID/AppSecret。
- [ ] 实现 `/auth/wechat-login`。
- [ ] 实现 Humi session。
- [ ] 实现用户与家庭空间映射。

### Step 3：小程序壳改造

- [ ] 在小程序原生层调用 `wx.login`。
- [ ] 将 Humi session 传给 WebView。
- [ ] H5 读取 session 并进入已登录状态。
- [ ] 登录失败回游客模式。

### Step 4：手机号绑定

- [ ] 账号页增加手机号绑定入口。
- [ ] 小程序原生按钮触发 `getPhoneNumber`。
- [ ] 服务端换取手机号并绑定。
- [ ] 前端只展示脱敏手机号。

### Step 5：验收

- [ ] 首次微信登录创建用户。
- [ ] 二次打开恢复同一用户。
- [ ] 换设备登录恢复账号。
- [ ] 手机号绑定成功。
- [ ] 拒绝手机号授权不影响核心功能。
- [ ] 退出登录后不泄露家庭数据。
- [ ] 删除账号申请路径可用。

## 12. 官方文档入口

正式开发前再次核对微信开放文档：

- 小程序登录：<https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html>
- `wx.login`：<https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html>
- 服务端 `auth.code2Session`：<https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html>
- 获取手机号：<https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/getPhoneNumber.html>
- 服务端手机号接口：<https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-info/phone-number/getPhoneNumber.html>

以微信公众平台后台和最新开放文档为准。

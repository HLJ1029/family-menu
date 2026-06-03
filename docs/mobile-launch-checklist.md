# 食间移动端上线检查表

## 线上入口

- 当前 H5 地址：`https://hlj1029.github.io/family-menu/`
- 本地开发地址：`http://localhost:4173/family-menu/`
- GitHub Repository Secrets 需要配置：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- 登录回跳地址建议加入：
  - `https://hlj1029.github.io/family-menu/`
  - `http://localhost:4173/family-menu/`

## 手机真机验收

- Safari 打开线上地址后，首页、用户中心、菜单库、一周计划、食材清单可正常进入。
- Safari 分享按钮里可以选择“添加到主屏幕”。
- 主屏幕打开后没有明显浏览器地址栏，底部导航不被安全区遮挡。
- 邮箱密码登录后，刷新页面仍保持登录状态。
- 登录后可创建或读取“我的家”，并能保存今晚菜单、一周计划、食材清单和家中库存。
- 换一组晚饭可用；失败时也能继续显示当前推荐。
- 断网后再次打开应用，至少能显示食间页面和离线提示。

## 上线前保存能力检查

- Authentication > URL Configuration：
  - Site URL 使用线上 H5 地址。
  - Redirect URLs 包含线上地址和本地开发地址。
- Edge Functions：
  - `recommend-meals` 已部署。
  - `explain-recommendation` 已部署。
  - `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 已配置。
- RLS：
  - profiles、families、family_members、meal_plans、shopping_items、pantry_items、member_preferences 策略已执行。

## 微信登录准备

首发不阻塞微信登录。正式接入前先准备：

- 微信开放平台应用类型和资质。
- 正式域名和可访问的 H5 地址。
- OAuth 回调地址。
- 隐私政策与用户协议入口。
  - 隐私政策：`https://hlj1029.github.io/family-menu/privacy.html`
  - 用户协议：`https://hlj1029.github.io/family-menu/terms.html`
- 技术方案二选一：
  - Supabase Custom OAuth/OIDC Provider。
  - Supabase Edge Function 处理微信 code 换取身份，再与 Supabase 用户绑定。

微信密钥不得进入前端。若需要服务端适配，优先放在 Supabase Edge Function。

小程序 MVP 迁移建议见 `docs/miniprogram-mvp-plan.md`。

# Humi 移动端上线检查表

## 线上入口

- 当前 H5 地址：`https://www.humi-home.com/`
- 本地开发地址：`http://localhost:4173/family-menu/`
- GitHub Repository Secrets 需要配置：
  - `VITE_HUMI_API_BASE_URL`
  - `VITE_HUMI_AI_VIA_API`
- 登录回跳地址建议加入：
  - `https://www.humi-home.com/`
  - `http://localhost:4173/family-menu/`

## 手机真机验收

- Safari 打开线上地址后，【今晚】、【清单】、【我的家】三 tab 可正常进入。
- 【今晚】可安排推荐菜单、换一组、发起“问问大家”和进入“自己挑”。
- 【我的家】可查看饭线索、想吃池子、家庭身份、邀请家人和忌口入口。
- Safari 分享按钮里可以选择“添加到主屏幕”。
- 主屏幕打开后没有明显浏览器地址栏，底部导航不被安全区遮挡。
- 小程序微信登录后，刷新页面仍保持 Humi 账号状态。
- 登录后可创建或读取“我的家”，并能保存今晚菜单、连排计划、食材清单、后台已有和家庭画像。
- 换一组晚饭可用；失败时也能继续显示当前推荐。
- 断网后再次打开应用，至少能显示 Humi 页面和离线提示。

## 上线前保存能力检查

- Humi API：
  - `https://api.humi-home.com/health` 返回 200。
  - 微信登录、家庭状态、感觉征集、家庭邀请和买菜认领 smoke 通过。
  - 精准推荐和精准解释由服务端额度闸门保护。
- H5：
  - `npm run release:check` 和 `npm run release:check:online` 通过。
  - 小程序 WebView URL 带最新 `h5v` 缓存版本。

## 微信登录准备

微信登录已作为小程序主身份方案接入。继续验收：

- 正式域名和可访问的 H5 地址。
- 隐私政策与用户协议入口。
  - 隐私政策：`https://www.humi-home.com/privacy.html`
  - 用户协议：`https://www.humi-home.com/terms.html`
- 微信公众平台业务域名、request 合法域名和隐私保护指引与当前功能一致。

微信密钥不得进入前端；只通过 Humi API 服务端配置。

小程序 MVP 迁移建议见 `docs/miniprogram-mvp-plan.md`。

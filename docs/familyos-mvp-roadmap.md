# FamilyOS 真实自用版移动端 MVP 路线

## 当前目标

FamilyOS 是 AI 驱动的家庭饮食决策与管理系统。第一版目标不是完整商业平台，而是一个可以安装到手机主屏幕、可登录同步、可服务真实家庭日常做饭决策的自用版 MVP。

## MVP 范围

- 移动端应用优先：先以 PWA 发布，iPhone 优先适配，后续预留 Capacitor 打包路径。
- 家庭饮食闭环：今日推荐、菜单库、一周计划、购物清单、家庭库存、营养统计。
- 云端同步：使用 Supabase Auth + Postgres，登录前保留本地模式。
- AI 策略：DeepSeek 负责 AI 推荐和 AI 解释；本地规则引擎作为未配置或失败时的 fallback。
- 家庭协作：以家庭空间和成员偏好为核心，逐步加入邀请与共享。

## 阶段路线

1. PWA 壳：manifest、service worker、离线壳、iPhone safe area。
2. FamilyOS 信息架构：品牌文案、首页决策中心、移动端 4 tab。
3. Supabase 基础：邮箱登录、profiles、families、family_members。
4. 云端同步：今日菜单、周计划、购物清单、库存。
5. DeepSeek 推荐：库存、偏好、历史菜单、营养粗览参与推荐，本地规则 fallback。
6. DeepSeek 文案：Supabase Edge Function 调 DeepSeek，失败时回退规则文案。
7. 家庭协作：家庭邀请、共享清单、共享菜单、成员偏好。
8. Capacitor 评估：PWA 稳定后再验证 iOS/Android 原生壳。

## 当前默认决策

- 首发 PWA，不先发布 App Store。
- iPhone 优先，安卓后续补测。
- 离线第一版只做基础离线壳，不做离线编辑合并。
- 微信登录预留，不阻塞 MVP。
- 每个小阶段完成后执行 build、commit、push。

## 当前上线节奏

- PWA 移动端上线已经进入验收阶段，线上地址为 `https://hlj1029.github.io/family-menu/`。
- 邮箱密码登录继续作为 MVP 正式登录入口，magic link 保留为辅助方式。
- 微信登录进入准备阶段，不显示不可用的登录按钮；等正式域名、开放平台应用、回调地址和隐私协议齐备后接入。
- Capacitor 原生壳暂不启动，等 PWA 真机体验稳定后再评估。

上线验收清单见 `docs/mobile-launch-checklist.md`。

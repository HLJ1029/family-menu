# FamilyOS

AI 驱动的家庭饮食决策与管理系统。

当前版本已经从早期家庭菜单 MVP 升级为 `React + Vite + TailwindCSS` 的移动端优先 PWA，视觉方向是：

```text
mobile FamilyOS + clean SaaS dashboard + light doodle accent
```

## 已实现功能

- Dashboard 首页。
- 可安装 PWA 基础壳。
- iPhone 安全区底部导航适配。
- 左侧桌面 sidebar 导航。
- 移动端底部 tab bar。
- 顶部搜索。
- 菜单库卡片展示。
- 分类筛选。
- 今日菜单。
- DeepSeek AI 推荐入口，未配置时回退本地规则。
- DeepSeek 推荐闭环：推荐结果可加入今日菜单、本周计划，并自动补齐采购清单。
- 移动端未登录登录页，可选择先体验部分本地功能。
- 网页端/体验模式下的用户中心。
- 一周计划。
- 拖拽菜品到周计划。
- 自动合并食材清单。
- checkbox 风格购物清单。
- 厨房库存 / 家中已有材料。
- 家庭成员偏好。
- 饮食统计卡片。
- Supabase 邮箱密码登录和 magic link。
- 登录后创建家庭空间。
- 今日菜单、一周计划、食材清单、厨房库存、家庭偏好云同步。
- PWA 上线检查入口和 iPhone 主屏幕安装提示。
- 微信登录准备态，不阻塞首发。
- 43 道测试菜谱数据。

## 如何运行

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev -- --port 4173
```

访问：

```text
http://localhost:4173/family-menu/
```

生产构建：

```bash
npm run build
```

校验菜谱数据：

```bash
npm run validate:data
```

配置云同步：

```bash
cp .env.example .env.local
```

然后填写：

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Supabase schema 草案见：

```text
docs/supabase-schema.sql
```

PWA 上线检查见：

```text
docs/mobile-launch-checklist.md
```

## 项目结构

```text
family-menu/
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  src/
    main.jsx
    styles.css
  data/
    recipes.json
  docs/
    product-plan.md
  .github/
    workflows/
      deploy-pages.yml
```

## 当前技术方案

- React
- Vite
- TailwindCSS
- lucide-react
- GitHub Pages
- GitHub Actions

## 部署

线上地址：

```text
https://hlj1029.github.io/family-menu/
```

每次推送到 `main` 分支后，GitHub Actions 会自动：

1. 安装依赖。
2. 执行 `npm run build`。
3. 把 `dist` 部署到 GitHub Pages。

## 开发流程

```bash
git status
git checkout -b feature/your-feature-name
```

改完后：

```bash
npm run build
git status
git add .
git commit -m "feat: describe your change"
git push
```

## 下一阶段建议

1. 用 iPhone Safari 验收线上 PWA：安装到主屏幕、登录、刷新恢复、离线壳。
2. 在 Supabase Auth 中确认线上地址和本地地址都已加入 Redirect URLs。
3. 做一轮移动端上线前 polish：加载、空状态、错误提示、安装提示。
4. 准备微信开放平台应用、正式域名、回调地址、隐私政策和用户协议。
5. PWA 稳定后再评估 Capacitor 原生壳。

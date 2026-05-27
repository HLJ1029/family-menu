# Family Menu

一个现代都市家庭使用的家庭菜单与饮食管理 Web App。

当前版本已经从早期静态 MVP 升级为 `React + Vite + TailwindCSS`，视觉方向是：

```text
modern lifestyle app + clean SaaS dashboard + light doodle accent
```

## 已实现功能

- Dashboard 首页。
- 左侧桌面 sidebar 导航。
- 移动端底部 tab bar。
- 顶部搜索。
- 菜单库卡片展示。
- 分类筛选。
- 今日菜单。
- AI 推荐卡片。
- 一周计划。
- 拖拽菜品到周计划。
- 自动合并食材清单。
- checkbox 风格购物清单。
- 家庭成员偏好。
- 饮食统计卡片。
- 30 道测试菜谱数据。

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

1. 增加真实菜品图片或自托管图片资源。
2. 把 `src/main.jsx` 拆成多个组件文件。
3. 补充做饭详情页或菜谱详情抽屉。
4. 引入真实用户测试反馈。
5. 后续需要云端数据时再接 Supabase。

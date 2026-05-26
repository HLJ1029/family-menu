# 家常点单 MVP

这是“家庭点单网站”的第一版 MVP，当前是零依赖静态网站。

## 已实现功能

- 菜品列表。
- 菜品搜索。
- 分类筛选。
- 菜品详情弹窗。
- 食材、调料、做法步骤展示。
- 加入今日菜单。
- 今日菜单人数调整和移除。
- 根据今日菜单生成购物清单。
- 相同食材按名称和单位合并。
- 购物清单勾选状态本地保存。

## 如何运行

进入本目录后启动一个简单静态服务：

```bash
python3 -m http.server 4173
```

然后访问：

```text
http://localhost:4173
```

因为菜谱数据已经拆到 `data/recipes.json`，浏览器需要通过本地服务读取 JSON。直接双击打开 `index.html` 可能会被浏览器拦截数据读取。

## 项目结构

```text
family-menu/
  index.html          页面结构
  styles.css          页面样式
  app.js              页面交互逻辑
  data/recipes.json   菜谱数据
  docs/product-plan.md 产品企划书
  README.md           项目说明
```

## 新手开发流程

每次准备改功能时，建议按这个顺序来：

```bash
git status
git checkout -b feature/your-feature-name
```

改完后检查页面，再提交：

```bash
git status
git add .
git commit -m "feat: describe your change"
```

常用提交类型：

- `feat`: 新功能。
- `fix`: 修复问题。
- `docs`: 文档修改。
- `style`: 样式调整。
- `refactor`: 代码整理但不改变功能。

当前仓库已经有第一笔提交：

```text
feat: build family menu MVP
```

## 当前技术方案

- HTML
- CSS
- JavaScript
- localStorage

第一版故意不接后端、不做登录、不做支付，先验证核心流程：

```text
选菜 -> 看材料和做法 -> 加入今日菜单 -> 生成购物清单 -> 买菜做饭
```

## 后续迁移建议

当这个静态 MVP 流程跑通后，可以迁移到：

- Next.js
- React
- Tailwind CSS
- Supabase

建议先把 `app.js` 里的菜谱数据拆到 `recipes.json`，再逐步组件化。

## 下一阶段建议

建议按下面顺序继续：

1. 增加更多真实菜品数据。
2. 优化移动端做饭步骤阅读体验。
3. 使用 GitHub 创建远程仓库并推送代码。
4. 使用 Vercel 或 Netlify 部署静态站点。
5. 再考虑迁移到 Next.js。

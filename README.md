# Humi

让每顿饭都有安排。

Humi 致力于将产品从”家庭饮食管理工具”升级为”家庭饮食决策平台”：用户打开后，首先解决”今晚吃什么”的核心问题，进而顺畅地规划本周饮食、采购清单和家中库存管理。

## 已实现功能

- 首页围绕”今晚吃什么？”组织，提供清晰的决策入口。
- 聚合今晚推荐、今晚菜单、一周计划、食材清单和家中库存。
- 支持”自己挑”浏览、菜品详情、做法步骤和份数调整。
- 买菜清单自动合并，支持勾选完成和移出家中已有食材。
- 家中库存支持数量和到期日管理，临期食材自动纳入推荐依据。
- 支持记录家人口味偏好、忌口和饮食目标。
- 登录后可创建”我的家”，菜单、清单、库存和口味设置云端同步。
- 移动端底部导航保留核心模块：首页、自己挑、一周计划、食材清单。
- 小程序 MVP 采用渐进策略：先用 WebView 壳验证，不急于全量重写。

## 如何运行

安装依赖：

```bash
npm install
```

启动本地开发服务：

```bash
npm run dev -- --port 4173
```

在浏览器中访问：

```text
http://localhost:4173/family-menu/
```

创建生产构建：

```bash
npm run build
```

校验菜谱数据（建议提交前执行）：

```bash
npm run validate:data
```

## 云端与智能推荐配置

复制环境变量模板并创建本地配置：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写以下参数：

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

数据库 schema 参考文件：

```text
docs/supabase-schema.sql
```

AI 智能推荐函数配置详见：

```text
docs/ai-edge-function.md
```

## 上线与小程序

生产环境地址：

```text
https://hlj1029.github.io/family-menu/
```

移动端上线检查清单：

```text
docs/mobile-launch-checklist.md
```

小程序 MVP 准备计划：

```text
docs/miniprogram-mvp-plan.md
```

微信小程序上线计划：

```text
docs/Humi_微信小程序上线计划_V1.md
```

视觉资产生成指南：

```text
docs/Humi_Visual_Asset_Generation_Guide_V1.md
```

海报设计系统文档：

```text
docs/Humi_Poster_Design_System_V1.md
```

小程序 WebView 壳工程：

```text
miniprogram/
```

## 开发流程

全局 AI 团队章程、任务队列和角色权限统一维护在私有总部仓库：

```text
/Users/honglijie/AI-HQ
```

本仓库的 `CLAUDE.md` 仅保存 Humi 项目特有的工程约束。

每个开发阶段完成后建议执行：

```bash
npm run validate:data
npm run build
git status
git add .
git commit -m "feat: describe your change"
git push
```

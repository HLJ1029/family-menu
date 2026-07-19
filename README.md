# Humi

让每顿饭都有安排。

Humi 致力于将产品从”家庭饮食管理工具”升级为”家庭饮食决策平台”：用户打开后，先解决”今晚吃什么”，再顺手生成买菜清单，并把家人的感觉、忌口、想吃和做饭反馈沉淀到同一个家。

## 已实现功能

- 三 tab 主线：【今晚】决策晚饭，【清单】承接采购，【我的家】承接家庭协作、忌口和画像回馈。
- 【今晚】提供基础推荐、精准推荐、换一组、不想吃反馈、晚间轻确认和“问问大家想吃啥”。
- 家人可通过小程序分享卡片免登录点感觉；主厨可按回复揉合出菜单，勾选后自动落入今晚菜单和买菜清单。
- 【自己挑】保留小红书式菜品浏览，看到想吃的可一键补进今晚。
- “想连排几天”作为可选辅助入口，不占底部 tab，不给不规划的人制造空状态。
- 买菜清单自动汇总三餐食材，支持勾选、认领和小程序卡片分享回传。
- 不提供独立库存维护页；“后台已有”由清单勾选、做饭确认和推荐旁轻确认隐形维护。
- 登录后可创建和切换“我的家”，菜单、清单、感觉征集、想吃池子、画像和精准推荐额度按家庭共享。
- 小程序首发采用 WebView 壳承载正式 H5，分享出去的是小程序卡片，核心路径已按 1.1 协作闭环收口。

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

## Humi API 与智能推荐配置

复制环境变量模板并创建本地配置：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填写 Humi API、微信与服务端 AI 所需参数，具体键以 `.env.example` 为准。前端不再配置数据库凭证，正式身份、家庭、协作与推荐只走自建 Humi API。

历史 Supabase schema、Edge Function 与过渡方案只保留在归档目录，不是当前运行或部署说明：

```text
docs/archive/supabase/
```

## 上线与小程序

生产环境地址：

```text
https://www.humi-home.com/
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

首发发布日 Runbook：

```text
docs/launch-day-runbook.md
```

首批反馈与 1.0.1 修复池：

```text
docs/launch-feedback-and-101-backlog.md
```

生产健康检查：

```bash
npm run monitor:prod
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

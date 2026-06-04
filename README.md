# 呼米

帮家里少纠结一顿饭。

呼米 V3 的目标是把当前产品从“家庭饮食管理工具”升级为“家庭饮食决策平台”：用户打开后先解决“今晚吃什么”，再顺手安排这周怎么吃、还要买什么、家里有什么。

## 已实现功能

- 首页围绕“今晚吃什么？”组织。
- 今晚推荐、今晚菜单、一周计划、食材清单、家中库存。
- “自己挑”、菜品详情、做法步骤、份数调整。
- 买菜清单自动合并，支持勾选和移出家里现有材料。
- 家中库存支持数量和到期日，快到期食材会进入推荐依据。
- 家人口味、忌口和饮食目标。
- 登录后可创建“我的家”，保存菜单、清单、库存和口味。
- 移动端底部导航保留：首页、自己挑、一周计划、食材清单。
- 小程序 MVP 准备路线：先用 web-view 壳验证，不先全量重写。

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

## 云端与推荐配置

复制环境变量文件：

```bash
cp .env.example .env.local
```

填写：

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

数据库 schema：

```text
docs/supabase-schema.sql
```

智能推荐函数配置：

```text
docs/ai-edge-function.md
```

## 上线与小程序

线上地址：

```text
https://hlj1029.github.io/family-menu/
```

移动端上线检查：

```text
docs/mobile-launch-checklist.md
```

小程序 MVP 准备：

```text
docs/miniprogram-mvp-plan.md
```

## 开发流程

每个小阶段完成后：

```bash
npm run validate:data
npm run build
git status
git add .
git commit -m "feat: describe your change"
git push
```

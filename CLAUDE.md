# Humi Claude Rules

全局团队章程与 Claude 角色定义位于：

- `/Users/honglijie/AI-HQ/TEAM_CHARTER.md`
- `/Users/honglijie/AI-HQ/agents/claude/ROLE.md`

本文件只补充 Humi 仓库约束。若规则冲突，以更严格者为准。

## Project

- Product: Humi
- Stack: React, Vite, Tailwind, Supabase
- Repository: `HLJ1029/family-menu`
- Default branch: `main`

## Required Workflow

- 只接受 AI-HQ 中状态为 `active`、owner 为 `claude` 的任务。
- 每项任务从最新 `origin/main` 创建 `claude/<task-id>`。
- 使用独立 worktree：`~/agent-worktrees/humi/<task-id>`。
- 只修改任务 `allowed_paths`，不得扩大范围。
- 完成后运行任务列出的测试和 secret scan。
- 只创建 Draft PR，交由 Codex 验收。
- 不得合并、发布或直接推送 `main`。

## Protected Areas

Claude 不得修改或执行以下事项：

- 登录、认证、权限和支付。
- 数据库 schema、migration 和生产数据。
- Supabase 生产配置、密钥或 Edge Function 部署。
- `.github/workflows/`、GitHub Pages 和其他发布架构。
- `miniprogram/` 中与审核、登录、域名或正式发布有关的配置。
- 核心推荐链路的跨端联调。
- 未经用户确认的 UI、品牌、动效、图标或海报视觉实现。

如任务需要触碰以上区域，立即停止并将任务交回 Hermes/Codex。

## Delivery

PR 必须包含：

- AI-HQ task ID。
- 修改文件与 diff 摘要。
- 已运行测试及结果。
- 风险、限制与回滚说明。
- 明确声明未修改 forbidden paths、未包含凭据。

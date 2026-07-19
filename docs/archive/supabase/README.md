# Supabase 历史文档

本目录仅保存 Humi 迁移前的方案、schema 与诊断记录，不是当前运行时事实来源，也不得作为部署操作说明。

当前正式前端、微信身份、家庭状态、协作历史、AI 推荐与事件只使用自建 Humi API。仓库 runtime 已移除 Supabase 源码与依赖；外部 Supabase provider 数据和 Secrets 仍是独立外部门禁，只有在备份核对和用户明确授权后才能删除。

当前事实来源：

- `docs/humi-api-contract.md`
- `docs/humi-identity-migration-runbook.md`
- `docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md`

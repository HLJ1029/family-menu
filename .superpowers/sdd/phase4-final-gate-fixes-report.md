# Phase 4 Final Gate Fixes Report

Date: 2026-07-20
Final reviewed candidate: `aefa7a7`

## Independent review result

独立复审共执行四轮。首轮 adversarial review 为 NO-GO：P1 两项、P2 一项；迁移/audit CLI 为 GO。后续 broad/adversarial review 继续发现并关闭 committed-range whitespace、artifact 复用、manifest/ancestor symlink、裸 OpenID、全 provider dependency/package script/rc 配置覆盖与端口清理问题。

1. 真机证据 artifact 可通过证据目录内 symlink 指向目录外文件。
2. 真机 manifest 的 PII 检查只覆盖 notes/path，且接受非规范时间字符串。
3. provider 清退 gate 漏扫 lockfile、API 等 runtime、`.env.production`，并允许 dist 缺失。

## TDD closure

- RED：新增 symlink、metadata PII、非 UTC ISO timestamp 测试后，旧 checker 自测失败。
- GREEN：artifact 同时通过词法路径、`lstat` 非 symlink、`realpath` 目录归属与非空普通文件检查；所有 manifest 元数据都过 PII 检查；timestamp 只接受 UTC ISO。
- RED：新增 provider gate selftest 后，旧 checker 没有可复用检查函数，测试失败。
- GREEN：清退 gate 现在覆盖 direct dependency、lockfile、`src/api/miniprogram/public` 路径和内容、`.github`、全部 `.env*`、常见构建配置与 dist；dist 缺失直接失败。对抗 fixture 与 clean fixture 均成为永久自测。
- 扩大 runtime scan 后发现 `api/recommend.js` 仍有历史 provider 注释，已改为当前 Humi API 说明。
- 证据 manifest、证据根、artifact 及其每级 ancestor 均拒绝 symlink；16 个场景必须使用不同的真实普通文件，且不能复用 manifest。
- 清退 gate 覆盖全部 `@supabase/*`/`supabase` 依赖、package scripts/metadata、标准 `.env*`、`*.config.*`、`.postcssrc/.toolrc`、runtime、lockfile 和实际 dist。

## Verification

- 全部 household / collaboration / migration / identity / API / miniprogram / H5 gate 通过。
- true-device evidence selftest 通过。
- build 通过，1748 modules；仅既有 chunk size warning。
- provider retirement selftest + repository gate 通过。
- `git diff --check 24bded2..aefa7a7` 与 AI-HQ secret scan 通过。
- 两路最终独立复审均为 GO，P0/P1/P2/P3 = 0/0/0/0；工作树干净，4173 无监听。

当前状态：Phase 4 本地候选独立门禁已关闭；不授权任何微信、生产、迁移、部署或外部 provider 操作。

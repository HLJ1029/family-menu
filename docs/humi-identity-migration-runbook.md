# Humi 身份与家庭数据迁移 Runbook

状态：本地预案；不构成生产执行授权。  
适用工具：`scripts/audit-humi-migration-readiness.mjs`、`scripts/migrate-humi-identity-households.mjs`。

## 安全边界

- 两个工具都只接受显式输入文件。审计器只读；迁移器默认使用 `--dry-run`。
- `--apply` 只能写入一个不存在的新文件，拒绝原地覆盖，且 input/output/report 路径必须互不相同。
- 报告只含数量、错误代码和 SHA-256，不含 OpenID、手机号、token、昵称、家庭名称或记录明细。
- 本 runbook 不授权访问生产主机、停止写入、复制生产文件、替换数据、部署、微信上传或删除外部 Supabase 数据/Secrets。

## 执行前授权

生产执行前必须单独取得维护窗口和数据 backup/dry-run/apply 授权，并记录：执行人、批准人、窗口起止、候选提交、API 版本、生产数据文件的绝对路径、头像目录和回滚负责人。没有完整记录时停止。

## 备份与只读核对

1. 进入维护窗口，停止 API 写入并确认没有活跃写请求。
2. 在同一个带时间戳、权限为 `0700` 的备份目录中复制 API 代码版本信息、`data.json` 与整个 `avatars/`；不得只备份数据文件。
3. 对代码提交、`data.json`、头像文件清单分别记录 SHA-256、字节数和文件数。清单权限设为 `0600`，不得把内容或 PII 打到终端/聊天。
4. 对备份副本运行只读审计：

   ```bash
   node scripts/audit-humi-migration-readiness.mjs \
     --input /approved/backup/data.json \
     --report /approved/private-evidence/readiness.json
   ```

5. 对同一备份副本运行 dry-run：

   ```bash
   node scripts/migrate-humi-identity-households.mjs \
     --input /approved/backup/data.json \
     --dry-run \
     --report /approved/private-evidence/migration-dry-run.json
   ```

6. 人工比较基线 `18 users / 18 identities / 7 households / 6 householdStates` 与维护窗口开始时的合法增量。数量减少、fatal code 非零、哈希来源不一致或无法解释的增量都必须停止；不得把 18/18/7/6 当成永久硬编码生产事实。

## Apply 到新副本

1. 只有在备份、审计、dry-run 和人工核对均通过后，才可对备份副本执行：

   ```bash
   node scripts/migrate-humi-identity-households.mjs \
     --input /approved/backup/data.json \
     --apply \
     --output /approved/staging/data.identity-household-v1.json \
     --report /approved/private-evidence/migration-apply.json
   ```

2. 再次审计新文件；核对 user、identity、household、householdState、collaborationEvent 数量不减少，fatal code 为零，且 apply 输出哈希与报告一致。
3. 用新文件启动隔离 staging API，不接生产流量。依次运行 identity、household、collaboration 和完整 API smoke；验证游客启动不建号、不建家，登录读取无副作用，协作游客历史保留，正式家庭成员关系不变。
4. 对新文件再次执行 apply 到第二个新文件，要求两份规范化 JSON 逐字节一致，以证明幂等。

## 原子替换与观察

只有获得“生产原子替换”明确授权后，才能把当前生产数据文件与迁移后的 staging 文件置于同一文件系统，并使用原子 rename 完成替换。代码、数据和头像必须作为一个发布单元。启动 API 后立即运行健康检查与身份/家庭/协作 smoke，并在观察窗口持续核对错误率、登录失败、家庭读取、协作写入和数据计数。

## 回滚

出现 P0、数量下降、身份错绑、家庭成员变化、协作历史丢失、JSON/内存不一致或无法解释的写入时：

1. 立即停止生产写入和流量。
2. 回滚 API 代码、原始 `data.json` 和 `avatars/` 三者；禁止只回滚其中一项。
3. 校验恢复文件与备份 SHA-256 完全一致，再启动旧版 API。
4. 运行旧版健康检查及身份/家庭读取 smoke，确认恢复后再开放流量。
5. 保存脱敏错误代码、时间线和哈希证据；不得在事故记录中复制用户明细。

外部 Supabase provider 数据与 Secrets 只有在迁移稳定、备份可恢复且用户再次明确批准后才能删除。仓库源码清退不代表 provider 已删除。

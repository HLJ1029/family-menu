# Humi 微信真机验收证据包

状态：待外部授权执行。本文件和检查器只准备证据标准，不授权登录微信、使用真实账号、上传体验版、提审或发布。

## 执行前准备

- 使用专用测试微信账号和测试家庭，不使用真实家庭成员资料；账号昵称、手机号、OpenID、UnionID、token、二维码和聊天内容不得出现在截图、视频、文件名或 notes。
- 记录候选 commit、小程序 build、设备型号、微信版本、测试角色和测试时间。每条证据时间必须晚于候选 commit。
- 截图只保留与场景直接相关的 UI；网络或 console 证据必须遮盖请求头、cookie、code、ticket 和响应身份字段。
- 证据目录权限建议 `0700`，`manifest.json` 和文件权限建议 `0600`，并保留在私有 release evidence 目录，不提交到 Git。

## 必测场景

`manifest.json` 必须完整覆盖：

1. `fresh_guest_start`：全新账号/清缓存后进入即为游客，没有“已登录”、通用头像或空用户名，不新增账号/家庭。
2. `explicit_wechat_login`：只有点击微信登录后才调用 `wx.login`。
3. `new_identity_profile`：新身份完成昵称/头像设置后显示唯一资料。
4. `legacy_identity_recovery`：旧“微信用户”被引导补全，不丢失历史。
5. `session_revocation_relogin`：撤销/过期 session 后回到游客，重新点击才登录。
6. `create_household`、`join_household`：创建与邀请加入边界清晰。
7. `family_living_room_owner`、`family_living_room_member`：客厅、设置、邀请与权限反馈符合角色。
8. `guest_crave`、`signed_in_crave`、`guest_grocery`、`guest_wish`：协作对象身份按登录/游客自动记录，不增加额外填表动作。
9. `guest_to_user_merge`、`collaboration_history`：游客行为登录后只合并一次，家庭活动能说明“谁做了什么”。
10. `logout_to_guest`：退出后立即恢复游客语义，不保留“已登录”假状态。

## fresh guest 的数据核对

在打开小程序前后分别读取生产后台的脱敏聚合数量，只记录 user、identity、household、householdState 数量和时间，不导出用户明细。单纯打开游客首页前后数量必须一致。若任何数量增加，立即停止后续真机测试并按 P0 处理。

## `wx.login` 点击边界

使用微信开发者工具或获批的真机调试网络面板：冷启动后先截取没有登录请求的证据，再点击“微信登录”，截取点击后才出现 `wx.login`/后端登录交换的时间顺序。证据必须遮盖 code、Authorization 和响应身份值；不能只凭最终 UI 推断请求时序。

## Manifest 格式

```json
{
  "schemaVersion": 1,
  "scenarios": {
    "fresh_guest_start": {
      "deviceModel": "test device model",
      "wechatVersion": "test version",
      "miniProgramBuild": "candidate build",
      "testerRole": "fresh test account",
      "timestamp": "2026-07-20T08:00:00.000Z",
      "result": "pass",
      "artifactPath": "fresh-guest-start.png",
      "notes": "sanitized notes only"
    }
  }
}
```

所有 16 个场景都使用相同字段。`artifactPath` 必须是证据目录内的相对路径，文件必须存在且非空；`result` 必须为 `pass`。

## 检查命令

```bash
npm run validate:true-device-evidence -- \
  --evidence-dir /approved/private-evidence/humi-true-device \
  --candidate-commit <candidate-sha>
```

检查器只输出 `scenario / status / relative path`。缺场景、文件不存在、时间早于候选、结果非 pass、绝对/越界路径或 notes 疑似包含 PII 都会失败。

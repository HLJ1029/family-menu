# Humi 1.1 候选内测单据模板

更新日期：2026-07-07
执行设备：codex@mbp-m5pro

本文档是候选内测单据和设计验收锚点。私有执行包里的 `tester-feedback-form.md`、`host-run-sheet.md`、`candidate-feedback-import.csv` 和 `daily-review.csv` 都应与这里保持一致；真实姓名、手机号、微信号、截图和录屏仍只放在仓库外。

## 1. 单据设计原则

- 体验者只看一张轻量反馈单，不暴露发布、审核、门禁、P0/P1 等工程语言。
- 执行人单独使用主厨记录单，把体验者原话转成匿名字段和问题分级。
- 所有可进仓库的字段只使用 `U001-U020` 匿名编号。
- 单据文案保持 Humi 的家庭饭桌语气：具体、短句、围绕今晚吃什么、买什么、谁来买。
- 评分统一为 1-5 分，没试过的协作项允许填“没试”，避免逼用户乱评。
- 每天结束必须有 `daily-review.csv` 汇总，结论只写今天是否继续内测、是否修复、是否进入 1.1.x。

## 2. 体验者反馈单

标题：`Humi 1.1 体验者反馈单`

开头提示：

```text
这张单只记录匿名体验结果。请不要在这里写手机号、微信号、真实姓名或家庭隐私。
```

基本信息：

```text
用户编号：U___
设备与微信版本：
体验日期：
家庭场景：一个人 / 两人 / 多人 / 有孩子 / 给父母做饭 / 其他
```

体验路径：

```text
1. 打开 Humi 小程序。
2. 看【今晚】推荐。
3. 点“今晚就做”或换一组后选一个想做的菜。
4. 看【清单】里是否知道要买什么。
5. 有空的话试一下【我的家】里的问问大家，或把清单分享给家人认领。
```

只问这些问题：

```text
推荐里有没有你今晚真的愿意做的菜？1 / 2 / 3 / 4 / 5
买菜清单有没有减少你想买什么的负担？1 / 2 / 3 / 4 / 5
问问大家、邀请家人或清单分享顺不顺？1 / 2 / 3 / 4 / 5 / 没试
哪一步最困惑或最卡？
哪道菜你觉得不该推荐？为什么？
有没有一个地方让你觉得“这个对我家有用”？
明天你还会不会再打开？会 / 不会 / 看情况。原因：
```

截图说明：

```text
如果卡住，请把截图或录屏发给执行人。执行人只把私有位置写进 CSV，不把图片放进仓库。
```

## 3. 主厨记录单

标题：`Humi 1.1 主厨记录单`

用途：

```text
这张单给执行人使用，用来把真实体验转成 feedback-template.csv 和 anonymous-users.csv 的字段。
```

单个用户记录：

```text
用户编号：U___
邀请状态：待邀请 / 已邀请 / 已体验 / 未响应
首次体验日期：
完成【今晚】菜单：是 / 否
完成清单：是 / 否
尝试协作：问问大家 / 邀请家人 / 买菜认领 / 没有
推荐评分：1 / 2 / 3 / 4 / 5
清单评分：1 / 2 / 3 / 4 / 5
分享评分：1 / 2 / 3 / 4 / 5 / 没试
复访状态：第二天打开 / 未复访 / 待观察
当前等级：通过 / P0 / P1 / P2 / 建议 / 待观察
私有证据位置：private://
```

观察重点：

```text
是否能不解释就理解【今晚】主按钮。
是否能发现新菜并补进今晚。
是否能看懂清单里谁在买、谁买到了。
【我的家】问问大家是否留在本页完成，不跳错位置。
分享卡片进入后是否知道自己要点什么。
有无登录失败、清单回传失败、加入家庭失败、菜单丢失。
```

回填规则：

```text
真实体验后，把 anonymous-users.csv 的邀请状态改为已体验。
完成【今晚】菜单和完成清单只填 是 或 否。
用户说了明确卡点或建议，就在 feedback-template.csv 增加一行。
P0/P1 同步写入 issue-triage.csv，并回到产品修复，不进入审核。
每天结束时运行 npm run release:candidate:daily -- --date YYYY-MM-DD。
每轮回填后运行 npm run release:candidate:doctor。
```

## 4. 批量导入字段

私有包里的 `candidate-feedback-import.csv` 用于一天内集中回填多位体验者。字段名必须保持如下顺序：

```csv
user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit
```

填法：

- `user`：只填 `U001-U020`。
- `tonight` / `grocery`：填 `yes` 或 `no`。
- `collaboration`：填 `ask`、`invite`、`grocery` 或 `none`。
- `recommendation` / `grocery-score` / `share-score`：填 1-5；没试分享时 `share-score` 可留空。
- `severity`：填 `P0`、`P1`、`P2`、`建议` 或留空。
- `evidence`：只填私有位置，例如 `private://wechat/U001-001`。

导入命令：

```bash
npm run release:candidate:record -- --import candidate-feedback-import.csv
```

## 5. 每日复盘表

`daily-review.csv` 表头：

```csv
日期,新体验人数,完成今晚菜单,完成清单,尝试协作,P0数,P1数,今日结论,下一步
```

每天结束运行：

```bash
npm run release:candidate:daily -- --date YYYY-MM-DD
```

通过线：

- 至少 10 个真实体验样本。
- 至少 8 个样本完成【今晚】菜单。
- 至少 8 个样本完成清单。
- 至少 3 个样本尝试问问大家、邀请家人或买菜认领。
- 没有 P0/P1。

## 6. 验收命令

```bash
npm run release:candidate:check
HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare
npm run release:candidate:doctor
npm run release:candidate:desk:selftest
npm run release:candidate:record:selftest
npm run release:candidate:daily:selftest
npm run release:candidate:review
```

`release:candidate:review` 在真实反馈不足时失败是正确结果；它用于在候选内测未完成时阻止进入微信审核。

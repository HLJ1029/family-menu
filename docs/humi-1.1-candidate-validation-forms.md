# Humi 1.1 候选内测单据模板

更新日期：2026-07-07
执行设备：codex@mbp-m5pro

本文档是候选内测单据和设计验收锚点。私有执行包里的 `tester-feedback-form.md`、`host-run-sheet.md`、`candidate-forms-preview.html`、`candidate-feedback-import.csv` 和 `daily-review.csv` 都应与这里保持一致；真实姓名、手机号、微信号、截图和录屏仍只放在仓库外。

## 1. 单据设计原则

- 体验者只看一张轻量反馈单，不暴露发布、审核、门禁、P0/P1 等工程语言。
- 执行人单独使用主厨记录单，把体验者原话转成匿名字段和问题分级。
- 所有可进仓库的字段只使用 `U001-U020` 匿名编号。
- 单据文案保持 Humi 的家庭饭桌语气：具体、短句、围绕今晚吃什么、买什么、谁来买。
- 私有包必须生成 `candidate-forms-preview.html`，用于在发送真实内测前确认体验者反馈单、主厨记录单、导入字段和每日复盘规则的可读性；预览页顶部必须有“发送前确认”区，明确体验者只看反馈单、执行人保留记录单、隐私留在仓库外、候选未达标不审核。
- 评分统一为 1-5 分；推荐、清单或分享没走到时允许填“没试”，避免逼用户乱评。
- 全部核心路径未完成且评分都是“没试”的记录只作为卡点反馈，不计入真实体验样本。
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
入口任务：普通打开小程序 / 问问大家小程序卡片 / 邀请家人小程序卡片 / 买菜清单小程序卡片
家庭场景：一个人 / 两人 / 多人 / 有孩子 / 给父母做饭 / 其他
```

体验路径：

```text
1. 按执行人给你的入口任务打开 Humi：普通打开，或点问问大家/邀请家人/买菜清单小程序卡片。
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
入口任务：普通打开小程序 / 问问大家小程序卡片 / 邀请家人小程序卡片 / 买菜清单小程序卡片
完成【今晚】菜单：是 / 否
完成清单：是 / 否
尝试协作：问问大家 / 邀请家人 / 买菜认领 / 没有
推荐评分：1 / 2 / 3 / 4 / 5 / 没试
清单评分：1 / 2 / 3 / 4 / 5 / 没试
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
小程序卡片进入后是否知道自己在帮家里做什么。
【我的家】问问大家是否留在本页完成，不跳错位置。
分享卡片进入后是否知道自己要点什么。
有无登录失败、清单回传失败、加入家庭失败、菜单丢失。
```

回填规则：

```text
真实体验后，把 anonymous-users.csv 的邀请状态改为已体验。
完成【今晚】菜单和完成清单只填 是 或 否。
如果用户没打开成功、没走完今晚或清单，且推荐/清单/分享评分都是“没试”，这条记录保留为卡点反馈，但不会计入真实体验样本。
用户说了明确卡点或建议，就通过 `release:candidate:record` 写入 feedback-template.csv。
P0/P1 会由 `release:candidate:record` 自动同步写入 issue-triage.csv，并回到产品修复，不进入审核。
`release:candidate:record` 写入前会拒绝手机号、邮箱、微信号或真实姓名；只写 U 编号和 private:// 证据位置。
每天结束时运行 npm run release:candidate:daily -- --date YYYY-MM-DD。
每天收工前优先运行 npm run release:candidate:day:close -- --date YYYY-MM-DD，一次完成隐私扫描、daily-review、doctor、candidate review 和私有收尾报告。
每轮回填后运行 npm run release:candidate:doctor。
每轮邀请前运行 npm run release:candidate:plan，生成 candidate-day-plan.md，先看今天建议邀请、需要追问和优先协作的 U 编号。
每轮发送前运行 npm run release:candidate:dispatch -- --date YYYY-MM-DD，生成只包含今天 U 编号的 candidate-dispatch-YYYY-MM-DD.md/json；再运行 npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD，生成 candidate-dispatch-workbench-YYYY-MM-DD.html，把逐个发送文案、每个 U 的已发送登记命令、回填草稿命令、回填模板和日结命令放到同一个私有页面里。
每发完一个 U，就复制工作台里该卡片的 npm run release:candidate:invite -- --users U00X --date YYYY-MM-DD --sent-confirmed，把匿名 U 编号标为已邀请；如果整批都已经真实发出，也可以运行 npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed。不要记录真实联系人；未带确认参数时不会写入。
每轮复盘前运行 npm run release:candidate:privacy:check，确认匿名包没有手机号、邮箱、微信号或真实姓名。
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
- `recommendation` / `grocery-score` / `share-score`：填 1-5；未完成对应路径时可填 `没试`，不要为了凑分数乱填。
- `severity`：填 `P0`、`P1`、`P2`、`建议` 或留空。
- `evidence`：只填私有位置，例如 `private://wechat/U001-001`。
- 导入时如果 `severity` 是 `P0` 或 `P1`，回填工具会自动新增 `issue-triage.csv` 行。

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
npm run release:candidate:day:close -- --date YYYY-MM-DD
```

通过线：

- 至少 10 个真实体验样本。
- 至少 8 个样本完成【今晚】菜单。
- 至少 8 个样本完成清单。
- 至少 3 个样本尝试问问大家、邀请家人或买菜认领。
- 没有 P0/P1。
- `npm run release:candidate:privacy:check` 通过，且输出只包含文件、类型和行号，不回显敏感值。

## 6. 验收命令

```bash
npm run release:candidate:check
HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare
npm run release:candidate:prepare:selftest
npm run release:candidate:forms:preview
npm run release:candidate:forms:preview:selftest
npm run release:candidate:doctor
npm run release:candidate:plan
npm run release:candidate:plan:selftest
npm run release:candidate:dispatch:selftest
npm run release:candidate:dispatch:workbench:selftest
npm run release:candidate:invite:selftest
npm run release:candidate:desk:selftest
npm run release:candidate:record:draft
npm run release:candidate:record:draft:selftest
npm run release:candidate:record:selftest
npm run release:candidate:daily:selftest
npm run release:candidate:day:close:selftest
npm run release:candidate:privacy:check
npm run release:candidate:privacy:selftest
npm run release:candidate:review
```

`release:candidate:forms:preview` 会在私有候选包写入并打开 `candidate-forms-preview.html`，用于确认体验者反馈单、主厨记录单、导入字段和每日复盘规则的版式；该文件不提交仓库。`release:candidate:plan` 会在私有候选包写入 `candidate-day-plan.md`，用于当日执行，不提交仓库。`release:candidate:dispatch` 会在私有候选包写入 `candidate-dispatch-YYYY-MM-DD.md/json`，只抽今天计划里的 U 编号、邀请文案、反馈摘要和回填命令模板，不提交仓库；分发单里的 `release:candidate:record` 只能在替换真实匿名反馈后运行，不能原样运行。`release:candidate:dispatch:workbench` 会在私有候选包写入 `candidate-dispatch-workbench-YYYY-MM-DD.html`，读取 `anonymous-users.csv` 显示每个 U 的待邀请/已邀请/已体验状态，并在部分 U 已邀请时只生成未邀请 U 编号的批量发送标记命令；它用于逐个复制体验者文案、入口任务、本 U 已发送登记命令、回填草稿命令和回填模板，不会发送消息、不会自动标记邀请、不会提交审核。`release:candidate:record:draft` 会在收到反馈后先生成私有 `candidate-record-draft-U00X-YYYY-MM-DD.md`，把必填字段、占位符和 `release:candidate:record` 命令整理成一张草稿；它不会写入 `anonymous-users.csv`、`feedback-template.csv` 或 `issue-triage.csv`。`release:candidate:invite` 会从当天分发单或显式 `--users U00X` 读取匿名 U 编号并把 `anonymous-users.csv` 标为已邀请，不写真实联系人，也不生成体验反馈；非 dry-run 写入必须带 `--sent-confirmed`，确认消息或小程序卡片已经真实发出。`release:candidate:day:close` 会在私有候选包写入 `candidate-day-close-YYYY-MM-DD.md/json`，用于当天收尾，不提交仓库，也不会把真实候选复盘伪造成通过。`release:candidate:privacy:check` 在发现手机号、邮箱、微信号或真实姓名时失败是正确结果；先清理私有候选包再继续复盘。`release:candidate:review` 在真实反馈不足时失败也是正确结果；它用于在候选内测未完成时阻止进入微信审核。

`release:candidate:desk` 会优先识别当天 `candidate-dispatch-YYYY-MM-DD.md/json`，把 U001-U006 这类当天要发的编号和入口任务直接打印出来，并提示生成 `candidate-dispatch-workbench-YYYY-MM-DD.html`；如果当天分发单还没生成，执行台会提示先运行 `release:candidate:dispatch -- --date YYYY-MM-DD`，避免执行人回到全量 `outreach-batch.md` 里手工找文案。

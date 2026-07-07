# Humi 1.1 Release Operator Handoff

更新日期：2026-07-07
执行设备：codex@mbp-m5pro

本文档给实际发布操作者使用：不用翻聊天记录，只按这里判断 Humi 1.1 现在在哪、下一步谁做什么、做完后用什么证据收口。只想看当前进度时先看 `docs/humi-1.1-closure-map.md`。

## 1. 当前结论

- 1.1 主体闭环、H5 发布材料、小程序审核材料和规格验收矩阵已具备，但当前不直接进入微信审核。
- 当前阶段是 1.1 生产候选完善与内测验证：`docs/humi-1.1-pre-review-hardening.md` 的 P0/P1 已完成，继续保持工程门禁、产品验收和用户确认项可重复通过；最终进入微信公众平台审核前必须再次由用户确认。
- 当前产品仓库状态以 `npm run release:status` 和 `git log --oneline -1` 为准；`release:status ok=true` 现在表示工程门和真实候选复盘都已通过，若只想看工程项健康度，查看 `release.engineeringGatesReady`。
- 最新产品提交以 `git log --oneline -1` 为准；最新 GitHub Pages run 以 `gh run list --branch main --limit 1` 和 AI-HQ Humi STATUS 为准。
- API 部署提交：`154f379`（`docs: correct humi api deploy target`）；对应 GitHub Pages run `28639333760`，结论 `success`。
- 最新小程序上传：`1.1.59`，描述 `原生分享确认页`，AppID `wx4040b89f3b363416`。
- 当前 H5：`https://www.humi-home.com/`，1.1.59 已部署。
- 当前 API：`https://api.humi-home.com`，`/health` 返回 HTTP 200。
- 生产 API 补部署已完成：备份 `/opt/humi/backups/20260703T045543Z`，`humi-api.service` 已重启，线上 health/monitor/readiness/public smoke 通过。

## 2. 先后顺序

### Step 0：提审前产品打磨

状态：已完成。当前继续做生产候选产品复核、体验完善与内测验证；审核不是默认下一步。

Owner：Codex，涉及视觉/产品方向不确定项时由用户确认。

执行：

```bash
npm run release:next
npm run release:status
npm run release:product:review
npm run release:product:smoke
npm run release:candidate:check
cat docs/humi-1.1-candidate-validation-forms.md
HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare
npm run release:candidate:prepare:selftest
npm run release:candidate:forms:preview
npm run release:candidate:forms:preview:selftest
npm run release:candidate:plan
npm run release:candidate:plan:selftest
npm run release:candidate:dispatch
npm run release:candidate:dispatch:selftest
npm run release:candidate:dispatch:workbench
npm run release:candidate:dispatch:workbench:selftest
npm run release:candidate:invite
npm run release:candidate:invite:selftest
npm run release:candidate:desk
npm run release:candidate:doctor
npm run release:candidate:desk:selftest
npm run release:candidate:record:draft
npm run release:candidate:record:draft:selftest
npm run release:candidate:record:selftest
npm run release:candidate:daily:selftest
npm run release:candidate:day:close:selftest
npm run release:candidate:privacy:check
npm run release:candidate:privacy:selftest
npm run release:candidate:review
npm run release:candidate:review:selftest
```

完成标准：

- `docs/humi-1.1-pre-review-hardening.md` 中 P0/P1 全部勾选。
- `npm run release:status` 里 `release.preReviewHardeningReady: true`。
- `npm run release:product:review` 通过，确认发现新菜、我的家问问大家、征集单模板、小程序卡片证据和微信审核确认护栏仍有源码/文档/证据锚点。
- `npm run release:product:smoke` 通过，使用生产 H5 移动端视口实际验证【今晚菜单】发现新菜打开完整菜品页、菜品卡片数量充足、【我的家】问问大家进入征集单而不是跳回首页。
- `npm run release:candidate:check` 通过，确认匿名灰度名单、反馈字段、P0/P1/P2 分级、每日复盘、1.1.x 判断标准和“生产候选完善与内测验证”口径齐全。
- `docs/humi-1.1-candidate-validation-forms.md` 已固化体验者反馈单、主厨记录单、单据预览、批量导入字段、每日复盘表和单据设计规则，避免候选内测只存在私有包里、执行人不知道该给用户看哪张单。
- `npm run release:candidate:prepare` 可生成私有内测执行包，包含 U001-U020 匿名名单、反馈表、批量导入模板 `candidate-feedback-import.csv`、每日复盘、问题分级表、邀请文案、U001-U020 批量邀请清单 `outreach-batch.md`、体验者反馈单 `tester-feedback-form.md`、主厨记录单 `host-run-sheet.md` 和单据设计预览 `candidate-forms-preview.html`；真实用户信息仍不得进仓库。
- `npm run release:candidate:prepare:selftest` 可用临时私有目录验证候选执行包文件、权限、README 步骤、U001-U020 和空模板复盘状态。
- `npm run release:candidate:forms:preview` 可在最新私有包重新生成并打开 `candidate-forms-preview.html`，用于确认体验者反馈单、主厨记录单、导入字段和每日复盘规则。
- `npm run release:candidate:forms:preview:selftest` 可用临时私有包验证 HTML 预览可生成、权限为 600 且包含核心单据板块。
- `npm run release:candidate:plan` 可在私有执行包生成 `candidate-day-plan.md`，按当前缺口列出今天建议邀请、需要追问、必跑【今晚】/清单和优先协作的 U 编号。
- `npm run release:candidate:plan:selftest` 可用临时私有执行包验证日计划能选出追问用户、下一批邀请用户和协作目标。
- `npm run release:candidate:dispatch -- --date YYYY-MM-DD` 可在私有执行包生成 `candidate-dispatch-YYYY-MM-DD.md/json`，只抽当天计划里的 U 编号、对应邀请文案、反馈单摘要和回填命令模板，减少从 U001-U020 全量清单里手工筛选；模板必须替换成真实匿名反馈后再运行，不能原样运行。
- `npm run release:candidate:dispatch:selftest` 可用临时私有执行包验证今日分发单能按日计划抽取文案并保留隐私/审核护栏。
- `npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD` 可把当天分发单转成私有 `candidate-dispatch-workbench-YYYY-MM-DD.html`，在一个页面里复制体验者文案、入口任务、每个 U 的已发送登记命令、回填草稿命令、回填模板和日结命令；小程序卡片任务会直接显示可扫码直达原生分享确认页的二维码，并保留二维码路径；它会读取 `anonymous-users.csv` 显示待邀请/已邀请/已体验状态，部分 U 已邀请时只生成未邀请 U 编号的批量发送标记命令；它不发送消息、不自动标记邀请、不提交审核。
- `npm run release:candidate:dispatch:workbench:selftest` 可用临时私有执行包验证 HTML 工作台能生成、权限为 600 且保留隐私/审核护栏。
- `npm run release:candidate:invite -- --users U00X --date YYYY-MM-DD --sent-confirmed` 可在单个 U 的消息或小程序卡片真实发出后，把该匿名 U 编号标为已邀请；整批都已真实发出时也可运行 `npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed`。它不记录真实联系人，也不会生成体验反馈；未带确认参数时不会写入。
- `npm run release:candidate:invite:selftest` 可用临时私有执行包验证邀请状态标记只更新匿名邀请状态，dry-run 不写入。
- `npm run release:candidate:record:draft -- --user U00X --date YYYY-MM-DD --entry "入口任务"` 可在收到反馈后先生成私有 `candidate-record-draft-U00X-YYYY-MM-DD.md`，把必填字段、占位符、隐私护栏和可复制回填命令整理成一张草稿；它不写 CSV、不生成体验样本。
- `npm run release:candidate:record:draft:selftest` 可用临时私有执行包验证回填草稿文件、权限、占位符和“不写反馈”护栏。
- `npm run release:candidate:desk` 可把最新私有包、当天 `candidate-dispatch-YYYY-MM-DD.md/json`、U 编号入口任务、今天要打开的单据、可复制回填命令和“不要做”的审核/隐私动作打印成一张执行台。
- `npm run release:candidate:doctor` 可把真实体验、【今晚】菜单、清单和协作样本的进度与缺口打印成候选阶段行动卡，方便先完善功能和内测而不是直接审核。
- `npm run release:candidate:desk:selftest` 可用临时私有执行包验证执行台能读取包、打印今日动作和隐私/审核护栏。
- `npm run release:candidate:record -- --user U001 ...` 可把单个体验者的匿名结果回填到最新私有执行包，减少手改 CSV；写入前会拒绝手机号、邮箱、微信号和真实姓名，真实姓名、微信号、手机号、截图和录屏仍只保留在仓库外。
- `npm run release:candidate:record -- --import candidate-feedback-import.csv` 可从最新私有执行包批量导入多位体验者结果，适合一天内集中回填 U001-U020；P0/P1 会自动追加到 `issue-triage.csv`。
- `npm run release:candidate:record:selftest` 可用临时私有执行包验证单人反馈回填、批量导入、P1 自动入问题分级表和 PII 写入前阻断。
- `npm run release:candidate:daily -- --date YYYY-MM-DD` 可按当天匿名反馈自动写入 `daily-review.csv`，减少每日手算新增人数、P0/P1 和核心路径完成数。
- `npm run release:candidate:daily:selftest` 可用临时私有执行包验证每日复盘回填命令。
- `npm run release:candidate:day:close -- --date YYYY-MM-DD` 可在每天收工前串起隐私扫描、每日复盘、doctor 和 candidate review，并在私有包写入 `candidate-day-close-YYYY-MM-DD.md/json`，让当天结论和剩余缺口有一张收尾单。
- `npm run release:candidate:day:close:selftest` 可用临时私有执行包验证每日收尾报告不会伪造 `candidateValidationReady`。
- `npm run release:candidate:privacy:check` 可扫描最新私有候选包，发现手机号、邮箱、微信号或真实姓名时只报文件/类型/行号，不回显敏感值。
- `npm run release:candidate:privacy:selftest` 可用临时私有执行包验证匿名材料通过、含敏感值材料失败且输出不泄露敏感值。
- `npm run release:candidate:review` 可复盘最新私有内测执行包；如果仍是模板、样本不足或出现 P0/P1，会阻止进入审核准备；默认最低标准是 10 个真实体验、8 个完成今晚菜单、8 个完成清单、3 个尝试协作。
- `npm run release:candidate:review:selftest` 可用临时 CSV 验证复盘脚本本身，覆盖空模板、样本不足、P1 阻断和有效反馈通过四种路径。
- 用户确认关键体验，尤其是【今晚菜单】选菜发现、【我的家】问问大家、征集单模板和小程序卡片分享。
- 当前提审前 P0/P1 和工程项已满足；真实候选复盘尚待 U001-U020 匿名反馈，未达标前继续在本步骤完善，不直接跳到审核。

### Step A：生产 API 补部署

状态：已完成。后续只有回滚、补验证或再次发版时需要重跑本节。

Owner：Codex + 具备服务器登录权限的人。

执行：

```bash
npm run deploy:api:check
```

当前生产机需显式指定 SSH key：

```bash
HUMI_API_SSH_TARGETS=ubuntu@api.humi-home.com \
HUMI_API_SSH_KEY="$HOME/.ssh/humi_tencent_lighthouse" \
npm run deploy:api:check
```

如果后续再次部署时仍只有 `ssh-access` 失败，先恢复 `api.humi-home.com` 的 SSH 登录方式。预检通过后按：

```text
docs/humi-api-production-deploy-runbook.md
```

只读探查结论：生产 API 由 `systemd` 管理，unit 为 `humi-api.service`，实际目录是 `/opt/humi`，不是 `/opt/humi/current`。

必须补上的 API 增量：

- `deadlineAt`
- 精准推荐额度闸门
- 精准解释额度闸门
- 征集结果 `resultSummary`
- 家庭邀请 join 返回共享 `state`
- 买菜认领 409 冲突保护
- 主厨权限 403 边界
- 征集 join 返回家庭列表与共享 `state`

完成证据：

- `npm run deploy:api:check` 通过。
- `npm run monitor:prod` 通过。
- `npm run release:check:online` 通过。
- AI-HQ Humi 状态记录部署时间、执行人、备份路径和验证结果。
- `docs/humi-1.1-release-evidence-log.md` 填写 API 补部署证据。

### Step B：微信公众平台提交审核

Owner：用户，Codex 提供材料。

提交前先跑：

```bash
npm run release:candidate:doctor
npm run release:candidate:prepare:selftest
npm run release:candidate:forms:preview
npm run release:candidate:forms:preview:selftest
npm run release:candidate:plan
npm run release:candidate:plan:selftest
npm run release:candidate:dispatch
npm run release:candidate:dispatch:selftest
npm run release:candidate:dispatch:workbench
npm run release:candidate:dispatch:workbench:selftest
npm run release:candidate:invite
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
npm run release:wechat:check
```

`release:candidate:doctor` 先展示当前还差多少真实样本和核心路径完成数；`release:candidate:forms:preview` 先打开私有包里的单据设计预览，确认体验者反馈单和主厨记录单可读；`release:candidate:plan` 再把今天建议邀请、需要追问和优先协作的 U 编号写入私有包；`release:candidate:dispatch -- --date YYYY-MM-DD` 会抽出当天 U 编号的私有分发单；`release:candidate:dispatch:workbench -- --date YYYY-MM-DD` 会生成私有 HTML 工作台，便于逐个复制体验者文案、本 U 已发送登记命令、回填草稿命令和回填模板；小程序卡片任务会直接显示可扫码直达二维码，同时显示每个 U 当前是待邀请、已邀请还是已体验，避免重复发送；每发完一个 U 后，优先复制该卡片里的 `release:candidate:invite -- --users U00X --date YYYY-MM-DD --sent-confirmed` 标记匿名 U 编号已邀请；整批都已真实发出时，也可运行 `release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed`；收到单个体验者反馈后，先运行 `release:candidate:record:draft -- --user U00X --date YYYY-MM-DD --entry "入口任务"` 生成私有回填草稿，再把真实匿名结果填进 `release:candidate:record` 命令，不能用默认值代替真实反馈；如反馈为 P0/P1，record 会自动写入 `issue-triage.csv`；每天收工前运行 `npm run release:candidate:day:close -- --date YYYY-MM-DD` 生成私有收尾单；`release:candidate:privacy:check` 必须确认候选包没有手机号、邮箱、微信号或真实姓名；`release:candidate:review` 必须通过真实匿名候选复盘；`release:wechat:check` 必须在产品仓库干净、`main` 已同步到 `origin/main`、候选复盘达标时返回 `ok=true`。如果本地还有未提交改动，或 `release.candidateValidationReady=false`，只能继续候选收口，不能把微信审核准备视为可执行。

执行材料：

```text
docs/miniprogram-platform-submit-runbook.md
docs/miniprogram-review-materials.md
docs/wechat-submit-copy-packet.md
```

提交版本：

- 版本：`1.1.59`
- 描述：`原生分享确认页`

提交前必须确认：

- request 合法域名包含 `https://api.humi-home.com`
- web-view 业务域名包含 `https://www.humi-home.com`
- 隐私政策为 `https://www.humi-home.com/privacy.html`
- 用户协议为 `https://www.humi-home.com/terms.html`

完成证据：

- 上传版本列表截图。
- request/web-view 域名截图。
- 隐私保护指引截图。
- 审核备注/提交页截图。
- 提交成功或审核中截图。
- AI-HQ Humi 状态记录提交时间、提交人、版本和审核状态。
- `docs/humi-1.1-release-evidence-log.md` 填写审核提交证据索引。

### Step C：审核通过后发布

Owner：用户。

执行材料：

```text
docs/launch-day-runbook.md
```

完成证据：

- 微信公众平台发布成功状态。
- 真机打开小程序，不只看开发者工具。
- P0 真机路径全部通过，尤其是普通启动、`crave`、`invite`、`grocery` 三类小程序卡片。
- 填写发布、P0 和 24 小时监控证据后，`npm run release:evidence:check` 通过。
- AI-HQ Humi 状态记录发布时间、执行人、验证结果和是否出现 P0/P1 问题。
- `docs/humi-1.1-release-evidence-log.md` 填写发布与 P0 真机验收证据。

### Step D：10-20 家灰度

Owner：用户 + 运营执行。

执行材料：

```text
docs/humi-1.1-gray-release-tracker.md
docs/launch-feedback-and-101-backlog.md
docs/humi-1.1-candidate-validation-forms.md
```

要求：

- 真实姓名、手机号、微信号不得进仓库。
- 只记录匿名家庭编号、设备、路径、问题等级和处理结论。
- 只有审核反馈、P0 链路阻塞、隐私合规问题或多个首批用户遇到同一处不可继续问题，才发 1.1.x。

## 3. 当前不要做

- 不要在审核通过前上传新小程序版本覆盖 `1.1.59`，除非审核反馈或 P0 问题要求。
- 不要在 1.1 发布前清退 Supabase、改支付、改登录架构或改数据库存储。
- 不要把微信后台截图、登录态、手机号、真实家庭名单提交到仓库。
- 不要因为 `release:status ok=false` 就误判 H5 不可发；先看失败项是不是只有生产 API SSH。

## 4. 一键状态判断

只想知道“现在下一步做什么”：

```bash
npm run release:next
```

想看“离 1.1 完整上线还差哪几段”：

```bash
npm run release:closure
npm run release:candidate:check
npm run release:candidate:desk
npm run release:candidate:prepare:selftest
npm run release:candidate:forms:preview
npm run release:candidate:forms:preview:selftest
npm run release:candidate:doctor
npm run release:candidate:plan
npm run release:candidate:plan:selftest
npm run release:candidate:dispatch
npm run release:candidate:dispatch:selftest
npm run release:candidate:dispatch:workbench
npm run release:candidate:dispatch:workbench:selftest
npm run release:candidate:invite
npm run release:candidate:invite:selftest
npm run release:candidate:desk:selftest
npm run release:candidate:record:selftest
npm run release:candidate:daily:selftest
npm run release:candidate:day:close:selftest
npm run release:candidate:privacy:check
npm run release:candidate:privacy:selftest
```

`release:closure` 会汇总规格验收、提审前 P0/P1、小程序分享卡片证据、微信审核/发布证据、真机 P0 和 24 小时监控阶段；它只读状态并输出下一组命令，不会提交审核、不发布、不修改微信后台。

现在 `release:next` 应停在“1.1 生产候选完善与内测验证，暂不进入微信审核”。在候选复盘达标前，继续做产品复核、真机体验确认、灰度名单准备与细节完善；`release:candidate:doctor` 用来确认还差哪些真实反馈，进入微信公众平台材料前仍需 `release:candidate:review` 通过，并由用户动作当下确认：

```bash
npm run release:wechat:start-submit
HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit
npm run release:wechat:copy
```

当前已准备的提交证据目录：

```text
/Users/honglijie/.humi-release-evidence/wechat-submit-1.1.59-20260705T094930
```

后续如果重新运行 `HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit`，以命令最新输出的目录为准。

自动化边界：

- 微信开发者工具 CLI 已完成 `1.1.59` 上传，但本机 CLI 没有提交审核/发布命令。
- `release:wechat:prepare-submit` 必须带 `HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1` 才会打开微信公众平台；未带确认变量时只打印说明并退出。确认后它会复用最新未留证的私有目录；如果最新目录已经有后台截图或录屏，才新建一个提审目录。它只负责复制审核备注、打开公众平台和证据目录；不提交审核、不发布、不撤回，也不调用微信开放接口。
- 微信公众平台 `mp.weixin.qq.com` 不允许本会话用浏览器自动化控制；不得绕过该限制。
- 提交审核、发布、撤回审核、调用微信开放接口提交审核/发布都属于小程序审核关键路径，必须由平台权限操作者在动作当下确认。
- 证据截图只放私有目录或私有链接；仓库内只登记时间、状态、结论和私有位置。

用户确认并完成提交审核后，登记证据日志：

```bash
npm run release:evidence:record:submit:latest
npm run release:evidence:commands -- submit
```

如果最新私有证据目录中没有 README 之外的截图或录屏，`release:evidence:record:submit:latest` 会拒绝登记，避免没有后台证据时误填发布日志。审核结果、发布、P0 和 24 小时监控回来后，继续用：

```bash
npm run release:evidence:commands -- review
npm run release:evidence:commands -- publish
npm run release:evidence:commands -- p0
npm run release:evidence:commands -- monitor
```

这些命令会打印可复制模板；替换时间、执行人、结论和私有证据位置后再运行。需要一次看完全部模板：

```bash
npm run release:evidence:commands
```

需要验证登记命令本身是否还能完整跑通：

```bash
npm run release:evidence:selftest
npm run release:next:selftest
npm run release:complete:selftest
```

需要看完整 JSON 状态：

```bash
npm run release:status
npm run release:evidence:check
npm run release:complete:check
```

读法：

- `release.onlineReady: true`：线上 H5 readiness 通过。
- `release.productionMonitorOk: true`：H5、API health、基础推荐监控通过。
- `release.artifactsReady: true`：发布必备文档齐全。
- `release.preReviewHardeningReady: true`：提审前 P0/P1 产品打磨已全部完成。
- `release.productReviewReady: true`：发现新菜、我的家问问大家、征集单模板、小程序卡片证据和微信审核确认护栏这些产品复核锚点已通过。
- `release.productSmokeReady: true`：生产 H5 移动端入口烟测已通过，发现新菜和我的家问问大家的实际跳转符合 1.1 候选体验。
- `release.wechatSubmitWorkspaceGuardReady: true`：`release:wechat:prepare-submit` 未带显式确认变量时不会打开微信公众平台。
- `release.apiDeployOnlySshBlocked: true`：只剩生产机 SSH 权限问题。
- `release.apiDeployReady: true`：API 补部署条件已满足。
- `release.releaseEvidenceReady: false`：外部微信提交/审核/发布/真机/24 小时监控证据还没填完。
- `release.releaseComplete: true`：工程侧、微信发布侧、真机 P0 和 24 小时监控证据都完成。
- `release:evidence:check` 通过：微信提交、审核结果、发布、真机 P0 和 24 小时监控证据都已填写。
- `release:complete:check` 通过：可以宣布 Humi 1.1 正式发布完成；未通过时不能宣布完成。
- `release:complete:selftest` 通过：临时完整证据日志可让最终完成门禁通过，证明完成判定脚本本身仍可用。

只有 `release.preReviewHardeningReady`、`release.productReviewReady`、`release.productSmokeReady`、`release.wechatSubmitWorkspaceGuardReady`、`release.apiDeployReady`、微信审核发布、真机 P0 和 24 小时监控证据都完成后，1.1 才算正式发布完成。

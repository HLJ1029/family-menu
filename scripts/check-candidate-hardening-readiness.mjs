import { readFile } from "node:fs/promises";

const files = {
  tracker: "docs/humi-1.1-gray-release-tracker.md",
  feedback: "docs/launch-feedback-and-101-backlog.md",
  handoff: "docs/humi-1.1-release-operator-handoff.md",
  nextAction: "scripts/print-release-next-action.mjs",
  packageJson: "package.json",
  prepareScript: "scripts/prepare-candidate-validation-packet.mjs",
  candidateFormsPreview: "scripts/print-candidate-forms-preview.mjs",
  candidateFormsPreviewLib: "scripts/lib/candidate-forms-preview.mjs",
  candidateFormsPreviewSelftest: "scripts/selftest-candidate-forms-preview.mjs",
  candidateForms: "docs/humi-1.1-candidate-validation-forms.md",
  candidateDoctor: "scripts/doctor-candidate-validation.mjs",
  candidateDoctorSelftest: "scripts/selftest-candidate-validation-doctor.mjs",
  candidateDesk: "scripts/print-candidate-validation-desk.mjs",
  candidateDeskSelftest: "scripts/selftest-candidate-validation-desk.mjs",
  candidatePrivacy: "scripts/check-candidate-privacy.mjs",
  candidatePlan: "scripts/plan-candidate-validation-day.mjs",
  candidateDispatch: "scripts/print-candidate-dispatch-pack.mjs",
  candidateDispatchSelftest: "scripts/selftest-candidate-dispatch-pack.mjs",
  candidateDispatchWorkbench: "scripts/print-candidate-dispatch-workbench.mjs",
  candidateDispatchWorkbenchSelftest: "scripts/selftest-candidate-dispatch-workbench.mjs",
  candidateInvite: "scripts/mark-candidate-invites.mjs",
  candidateDayClose: "scripts/close-candidate-validation-day.mjs",
  candidateRecordDraft: "scripts/prepare-candidate-record-draft.mjs",
  candidateRecordDraftSelftest: "scripts/selftest-candidate-record-draft.mjs",
  candidateRecord: "scripts/record-candidate-feedback.mjs",
};

const [tracker, feedback, handoff, nextAction, packageJson, prepareScript, candidateFormsPreview, candidateFormsPreviewLib, candidateFormsPreviewSelftest, candidateForms, candidateDoctor, candidateDoctorSelftest, candidateDesk, candidateDeskSelftest, candidatePrivacy, candidatePlan, candidateDispatch, candidateDispatchSelftest, candidateDispatchWorkbench, candidateDispatchWorkbenchSelftest, candidateInvite, candidateDayClose, candidateRecordDraft, candidateRecordDraftSelftest, candidateRecord] = await Promise.all(
  Object.values(files).map((path) => readFile(path, "utf8")),
);

const checks = [
  {
    key: "anonymous-gray-list",
    title: "10-20 个家庭匿名灰度名单模板",
    path: files.tracker,
    ok: tracker.includes("10-20 个家庭")
      && tracker.includes("不要在仓库里填写真实姓名、手机号、微信号或家庭成员隐私")
      && countSeedUsers(tracker) >= 10
      && tracker.includes("U011-U020"),
  },
  {
    key: "gray-core-paths",
    title: "灰度核心路径字段覆盖今晚/清单/协作/评分/复访",
    path: files.tracker,
    ok: [
      "完成今晚菜单",
      "完成清单",
      "尝试协作",
      "推荐评分",
      "清单评分",
      "分享评分",
      "复访状态",
      "当前等级",
    ].every((text) => tracker.includes(text)),
  },
  {
    key: "daily-review",
    title: "每日灰度复盘与 1.1.x 判断标准",
    path: files.tracker,
    ok: tracker.includes("## 3. 每日灰度复盘")
      && tracker.includes("## 4. 是否发 1.1.x 的判断")
      && tracker.includes("任一 P0 可复现")
      && tracker.includes("多个用户在同一核心链路卡住")
      && tracker.includes("登录失败且游客不能继续"),
  },
  {
    key: "feedback-intake",
    title: "首批反馈邀请文案和字段完整",
    path: files.feedback,
    ok: feedback.includes("你试 5 分钟就行")
      && feedback.includes("问家人/分享清单这一步有没有顺")
      && feedback.includes("10-20 个家庭的匿名名单")
      && [
        "卡住的位置",
        "截图/录屏",
        "问题等级",
        "是否进入 1.1.x",
        "处理状态",
      ].every((text) => feedback.includes(text)),
  },
  {
    key: "feedback-severity",
    title: "反馈池有 P0/P1/P2 分级和首批验证目标",
    path: files.feedback,
    ok: ["### P0", "### P1", "### P2", "## 4. 问题分级标准", "## 5. 首批验证目标"]
      .every((text) => feedback.includes(text)),
  },
  {
    key: "candidate-stage-language",
    title: "当前交接和行动卡停在生产候选完善，不默认审核",
    path: `${files.handoff}, ${files.nextAction}`,
    ok: handoff.includes("1.1 生产候选完善与内测验证")
      && handoff.includes("审核不是默认下一步")
      && nextAction.includes("1.1 生产候选完善与内测验证，暂不进入微信审核")
      && nextAction.includes("灰度名单准备"),
  },
  {
    key: "candidate-private-packet",
    title: "候选内测私有执行包命令可用",
    path: `${files.packageJson}, ${files.nextAction}, ${files.handoff}`,
    ok: packageJson.includes("release:candidate:prepare")
      && packageJson.includes("release:candidate:prepare:selftest")
      && packageJson.includes("release:candidate:forms:preview")
      && packageJson.includes("release:candidate:forms:preview:selftest")
      && packageJson.includes("release:candidate:doctor")
      && packageJson.includes("release:candidate:doctor:selftest")
      && packageJson.includes("release:candidate:plan")
      && packageJson.includes("release:candidate:plan:selftest")
      && packageJson.includes("release:candidate:dispatch")
      && packageJson.includes("release:candidate:dispatch:selftest")
      && packageJson.includes("release:candidate:dispatch:workbench")
      && packageJson.includes("release:candidate:dispatch:workbench:selftest")
      && packageJson.includes("release:candidate:invite")
      && packageJson.includes("release:candidate:invite:selftest")
      && packageJson.includes("release:candidate:desk")
      && packageJson.includes("release:candidate:desk:selftest")
      && packageJson.includes("release:candidate:record")
      && packageJson.includes("release:candidate:record:selftest")
      && packageJson.includes("release:candidate:daily")
      && packageJson.includes("release:candidate:daily:selftest")
      && packageJson.includes("release:candidate:day:close")
      && packageJson.includes("release:candidate:day:close:selftest")
      && packageJson.includes("release:candidate:privacy:check")
      && packageJson.includes("release:candidate:privacy:selftest")
      && packageJson.includes("release:candidate:review")
      && nextAction.includes("release:candidate:prepare")
      && nextAction.includes("release:candidate:prepare:selftest")
      && nextAction.includes("release:candidate:forms:preview")
      && nextAction.includes("release:candidate:doctor")
      && nextAction.includes("release:candidate:plan")
      && nextAction.includes("release:candidate:dispatch")
      && nextAction.includes("release:candidate:dispatch:workbench")
      && nextAction.includes("release:candidate:invite")
      && nextAction.includes("release:candidate:plan:selftest")
      && nextAction.includes("release:candidate:desk")
      && nextAction.includes("release:candidate:desk:selftest")
      && nextAction.includes("release:candidate:record")
      && nextAction.includes("release:candidate:record:selftest")
      && nextAction.includes("release:candidate:daily")
      && nextAction.includes("release:candidate:day:close")
      && nextAction.includes("release:candidate:privacy:check")
      && nextAction.includes("release:candidate:privacy:selftest")
      && nextAction.includes("release:candidate:review")
      && handoff.includes("release:candidate:prepare")
      && handoff.includes("release:candidate:prepare:selftest")
      && handoff.includes("release:candidate:forms:preview")
      && handoff.includes("release:candidate:doctor")
      && handoff.includes("release:candidate:plan")
      && handoff.includes("release:candidate:dispatch")
      && handoff.includes("release:candidate:dispatch:workbench")
      && handoff.includes("release:candidate:invite")
      && handoff.includes("release:candidate:plan:selftest")
      && handoff.includes("release:candidate:desk")
      && handoff.includes("release:candidate:desk:selftest")
      && handoff.includes("release:candidate:record")
      && handoff.includes("release:candidate:record:selftest")
      && handoff.includes("release:candidate:daily")
      && handoff.includes("release:candidate:day:close")
      && handoff.includes("release:candidate:privacy:check")
      && handoff.includes("release:candidate:privacy:selftest")
      && handoff.includes("release:candidate:review"),
  },
  {
    key: "candidate-feedback-forms",
    title: "候选执行包包含批量邀请清单、体验者反馈单和主厨记录单",
    path: `${files.prepareScript}, ${files.candidateForms}`,
    ok: [
      "tester-feedback-form.md",
      "host-run-sheet.md",
      "candidate-forms-preview.html",
      "candidate-feedback-import.csv",
      "outreach-batch.md",
      "candidate-day-plan.md",
      "release:candidate:plan",
      "U001-U020 批量邀请清单",
      "release:candidate:record",
      "--import candidate-feedback-import.csv",
      "release:candidate:desk:selftest",
      "release:candidate:forms:preview",
      "Humi 1.1 体验者反馈单",
      "Humi 1.1 主厨记录单",
      "release:candidate:doctor",
    ].every((text) => prepareScript.includes(text)),
  },
  {
    key: "candidate-form-design-anchor",
    title: "候选单据模板和设计验收锚点已入仓库",
    path: files.candidateForms,
    ok: [
      "Humi 1.1 候选内测单据模板",
      "单据设计原则",
      "candidate-forms-preview.html",
      "不计入真实体验样本",
      "Humi 1.1 体验者反馈单",
      "Humi 1.1 主厨记录单",
      "入口任务：普通打开小程序 / 问问大家小程序卡片 / 邀请家人小程序卡片 / 买菜清单小程序卡片",
      "小程序卡片进入后是否知道自己在帮家里做什么",
      "问问大家、邀请家人或清单分享顺不顺",
      "是否能发现新菜并补进今晚",
      "candidate-feedback-import.csv",
      "issue-triage.csv",
      "P0/P1 会由 `release:candidate:record` 自动同步写入 issue-triage.csv",
      "daily-review.csv",
      "release:candidate:day:close",
      "npm run release:candidate:plan",
      "npm run release:candidate:daily -- --date YYYY-MM-DD",
      "npm run release:candidate:privacy:check",
      "真实姓名、手机号、微信号、截图和录屏仍只放在仓库外",
    ].every((text) => candidateForms.includes(text)),
  },
  {
    key: "candidate-form-preview",
    title: "候选单据可生成 HTML 设计预览",
    path: `${files.packageJson}, ${files.prepareScript}, ${files.candidateFormsPreview}, ${files.candidateFormsPreviewLib}, ${files.candidateFormsPreviewSelftest}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:forms:preview")
      && packageJson.includes("release:candidate:forms:preview:selftest")
      && prepareScript.includes("candidate-forms-preview.html")
      && prepareScript.includes("buildCandidateFormsPreviewHtml")
      && candidateFormsPreview.includes("candidate-forms-preview.html")
      && candidateFormsPreview.includes("tester-feedback-form.md")
      && candidateFormsPreview.includes("host-run-sheet.md")
      && candidateFormsPreview.includes("candidate-feedback-import.csv")
      && candidateFormsPreview.includes("daily-review.csv")
      && candidateFormsPreviewLib.includes("data-form=\"send-checklist\"")
      && candidateFormsPreviewLib.includes("体验者只看反馈单")
      && candidateFormsPreviewLib.includes("执行人保留记录单")
      && candidateFormsPreviewLib.includes("隐私留在仓库外")
      && candidateFormsPreviewLib.includes("未达标不审核")
      && candidateFormsPreviewSelftest.includes("data-preview-kind=\"humi-candidate-forms\"")
      && candidateFormsPreviewSelftest.includes("data-form=\"send-checklist\"")
      && candidateFormsPreviewSelftest.includes("体验者只看反馈单")
      && candidateFormsPreviewSelftest.includes("未达标不审核")
      && candidateFormsPreviewSelftest.includes("批量导入字段")
      && candidateFormsPreviewSelftest.includes("每日复盘字段")
      && candidateForms.includes("candidate-forms-preview.html"),
  },
  {
    key: "candidate-doctor-dispatch-focus",
    title: "候选 doctor 会直接提示今日分发单和真实发送后的登记动作",
    path: `${files.packageJson}, ${files.candidateDoctor}, ${files.candidateDoctorSelftest}`,
    ok: packageJson.includes("release:candidate:doctor:selftest")
      && [
        "今日分发单已生成",
        "candidate-dispatch-",
        "每发完一个 U",
        "本 U 已发送登记命令",
        "只标记已邀请，不会生成体验反馈",
        "不会记录真实联系人",
        "先发今天分发单里的 U 编号",
        "不要把“已邀请”当成“已体验”",
      ].every((text) => candidateDoctor.includes(text))
      && [
        "doctor-surfaces-current-dispatch-and-invite-guard",
        "今日分发单已生成",
        "U001: 问问大家小程序卡片（优先跑协作）",
        "每发完一个 U",
        "本 U 已发送登记命令",
        "不要把“已邀请”当成“已体验”",
        "单据设计预览",
        "candidate-forms-preview.html",
      ].every((text) => candidateDoctorSelftest.includes(text)),
  },
  {
    key: "candidate-execution-desk",
    title: "候选内测执行台可直接打印今日动作和私有包路径",
    path: `${files.packageJson}, ${files.candidateDesk}, ${files.candidateDeskSelftest}, ${files.nextAction}, ${files.handoff}`,
    ok: [
      "Humi 1.1 候选内测执行台",
      "今天先做",
      "今天不要做",
      "candidate-day-plan.md",
      "candidate-dispatch-",
      "今日分发单已生成",
      "release:candidate:plan",
      "outreach-batch.md",
      "candidate-forms-preview.html",
      "tester-feedback-form.md",
      "host-run-sheet.md",
      "candidate-feedback-import.csv",
      "release:candidate:day:close",
      "release:candidate:daily -- --date",
      "docs/humi-1.1-candidate-validation-forms.md",
    ].every((text) => candidateDesk.includes(text))
      && [
        "今日分发单已生成",
        "candidate-dispatch-2026-07-07.md",
        "U001: 问问大家小程序卡片（优先跑协作）",
        "打开 `candidate-dispatch-2026-07-07.md`",
        "candidate-forms-preview.html",
      ].every((text) => candidateDeskSelftest.includes(text)),
  },
  {
    key: "candidate-day-plan",
    title: "候选日计划可按缺口生成当日邀请和协作目标",
    path: `${files.packageJson}, ${files.candidatePlan}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:plan")
      && packageJson.includes("release:candidate:plan:selftest")
      && candidatePlan.includes("candidate-day-plan.md")
      && candidatePlan.includes("recommendedInviteUsers")
      && candidatePlan.includes("collaborationUsers")
      && nextAction.includes("candidate-day-plan.md")
      && handoff.includes("release:candidate:plan")
      && candidateForms.includes("release:candidate:plan"),
  },
  {
    key: "candidate-dispatch-pack",
    title: "候选今日分发单可按日计划抽取发送对象和文案",
    path: `${files.packageJson}, ${files.candidateDispatch}, ${files.candidateDispatchSelftest}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:dispatch")
      && packageJson.includes("release:candidate:dispatch:selftest")
      && candidateDispatch.includes("candidate-dispatch-")
      && candidateDispatch.includes("outreach-batch.md")
      && candidateDispatch.includes("tester-feedback-form.md")
      && candidateDispatch.includes("host-run-sheet.md")
      && candidateDispatch.includes("release:candidate:record")
      && candidateDispatch.includes("release:candidate:invite")
      && candidateDispatch.includes("release:candidate:day:close")
      && candidateDispatch.includes("release:candidate:dispatch:workbench")
      && candidateDispatch.includes("工作台不会发送消息或标记邀请")
      && candidateDispatch.includes("问问大家小程序卡片")
      && candidateDispatch.includes("邀请家人小程序卡片")
      && candidateDispatch.includes("买菜清单小程序卡片")
      && candidateDispatch.includes("recordEntry: \"分享卡片\"")
      && candidateDispatch.includes("0. 入口任务")
      && candidateDispatch.includes("这次请按这个入口任务试")
      && candidateDispatch.includes("不要原样运行")
      && candidateDispatch.includes("--recommendation \"1-5|没试\"")
      && !candidateDispatch.includes("--recommendation 5 --grocery-score 5")
      && !candidateDispatch.includes("--note \"清单有用\"")
      && candidateDispatchSelftest.includes("dispatch-pack-covers-six-entry-tasks")
      && candidateDispatchSelftest.includes("U001\", \"crave-card\"")
      && candidateDispatchSelftest.includes("U002\", \"invite-card\"")
      && candidateDispatchSelftest.includes("U003\", \"grocery-card\"")
      && candidateDispatchSelftest.includes("U004\", \"normal-open\"")
      && candidateDispatchSelftest.includes("U005\", \"today-discovery\"")
      && candidateDispatchSelftest.includes("U006\", \"grocery-list\"")
      && candidateDispatchSelftest.includes("重点看是否能找到完整菜品页和愿意做的新菜")
      && candidateDispatchSelftest.includes("重点看食材、已有项和谁在买是否容易理解")
      && nextAction.includes("release:candidate:dispatch")
      && nextAction.includes("release:candidate:dispatch:workbench")
      && nextAction.includes("release:candidate:invite")
      && handoff.includes("release:candidate:dispatch")
      && handoff.includes("release:candidate:dispatch:workbench")
      && candidateForms.includes("release:candidate:dispatch"),
  },
  {
    key: "candidate-dispatch-workbench",
    title: "候选今日分发工作台可把文案、小程序卡片确认、发送标记和回填模板放到同一私有页面",
    path: `${files.packageJson}, ${files.candidateDispatchWorkbench}, ${files.candidateDispatchWorkbenchSelftest}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:dispatch:workbench")
      && packageJson.includes("release:candidate:dispatch:workbench:selftest")
      && candidateDispatchWorkbench.includes("candidate-dispatch-workbench-")
      && candidateDispatchWorkbench.includes("data-workbench-kind=\"humi-candidate-dispatch\"")
      && candidateDispatchWorkbench.includes("navigator.clipboard.writeText")
      && candidateDispatchWorkbench.includes("anonymous-users.csv")
      && candidateDispatchWorkbench.includes("inviteStatus")
      && candidateDispatchWorkbench.includes("pendingUsers")
      && candidateDispatchWorkbench.includes("避免重复打扰")
      && candidateDispatchWorkbench.includes("不会发送微信消息")
      && candidateDispatchWorkbench.includes("不会标记已邀请")
      && candidateDispatchWorkbench.includes("不进入微信公众平台审核动作")
      && candidateDispatchWorkbench.includes("小程序卡片发送确认")
      && candidateDispatchWorkbench.includes("pages/share/index?type=crave")
      && candidateDispatchWorkbench.includes("pages/share/index?type=invite")
      && candidateDispatchWorkbench.includes("pages/share/index?type=grocery")
      && candidateDispatchWorkbench.includes("release:wechat:share:direct-previews")
      && candidateDispatchWorkbench.includes("findLatestShareEvidenceDir")
      && candidateDispatchWorkbench.includes("小程序卡片证据目录")
      && candidateDispatchWorkbench.includes("复制直达二维码路径")
      && candidateDispatchWorkbench.includes("directPreviewPath")
      && candidateDispatchWorkbench.includes("pathToFileURL")
      && candidateDispatchWorkbench.includes("data-share-qr=\"ready\"")
      && candidateDispatchWorkbench.includes("directPreviewUrl")
      && candidateDispatchWorkbench.includes("可扫码直达")
      && candidateDispatchWorkbench.includes("直达二维码状态")
      && candidateDispatchWorkbench.includes("directPreviewOk")
      && candidateDispatchWorkbench.includes("inspectDirectPreviewFile")
      && candidateDispatchWorkbench.includes("复制本 U 已发送登记命令")
      && candidateDispatchWorkbench.includes("复制回填草稿命令")
      && candidateDispatchWorkbench.includes("release:candidate:record:draft")
      && candidateDispatchWorkbench.includes("--sent-confirmed")
      && candidateDispatchWorkbenchSelftest.includes("candidate-dispatch-workbench-html")
      && candidateDispatchWorkbenchSelftest.includes("mini program share card send guidance")
      && candidateDispatchWorkbenchSelftest.includes("share evidence dir")
      && candidateDispatchWorkbenchSelftest.includes("absolute crave direct-preview QR path")
      && candidateDispatchWorkbenchSelftest.includes("share QR ready")
      && candidateDispatchWorkbenchSelftest.includes("share QR image")
      && candidateDispatchWorkbenchSelftest.includes("data-share-qr=\"ready\"")
      && candidateDispatchWorkbenchSelftest.includes("可扫码直达")
      && candidateDispatchWorkbenchSelftest.includes("直达二维码状态")
      && candidateDispatchWorkbenchSelftest.includes("crave share confirmation path template")
      && candidateDispatchWorkbenchSelftest.includes("DevTools direct-preview command")
      && candidateDispatchWorkbenchSelftest.includes("per-user sent mark commands")
      && candidateDispatchWorkbenchSelftest.includes("record draft command")
      && candidateDispatchWorkbenchSelftest.includes("pending-only batch command")
      && candidateDispatchWorkbenchSelftest.includes("workbench should read U001 invite status")
      && candidateDispatchWorkbenchSelftest.includes("mode: \"600\"")
      && candidateDispatchWorkbenchSelftest.includes("不会发送微信消息")
      && candidateDispatchWorkbenchSelftest.includes("不进入微信公众平台审核动作")
      && nextAction.includes("release:candidate:dispatch:workbench")
      && handoff.includes("release:candidate:dispatch:workbench")
      && candidateForms.includes("release:candidate:dispatch:workbench"),
  },
  {
    key: "candidate-invite-mark",
    title: "候选邀请状态可从分发单标记匿名 U 编号",
    path: `${files.packageJson}, ${files.candidateInvite}, ${files.nextAction}, ${files.handoff}, ${files.prepareScript}`,
    ok: packageJson.includes("release:candidate:invite")
      && packageJson.includes("release:candidate:invite:selftest")
      && candidateInvite.includes("candidate-dispatch-")
      && candidateInvite.includes("anonymous-users.csv")
      && candidateInvite.includes("已邀请")
      && candidateInvite.includes("--sent-confirmed")
      && candidateInvite.includes("--allow-out-of-dispatch")
      && candidateInvite.includes("outside candidate-dispatch-")
      && candidateInvite.includes("Refusing to mark invitations without confirmation")
      && candidateInvite.includes("does not create validation feedback")
      && candidateInvite.includes("does not store real contacts")
      && nextAction.includes("本 U 已发送登记命令")
      && nextAction.includes("--sent-confirmed")
      && nextAction.includes("release:candidate:invite")
      && handoff.includes("release:candidate:invite")
      && prepareScript.includes("release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed"),
  },
  {
    key: "candidate-day-close",
    title: "候选每日收尾可生成私有日结报告且不伪造通过",
    path: `${files.packageJson}, ${files.candidateDayClose}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:day:close")
      && packageJson.includes("release:candidate:day:close:selftest")
      && candidateDayClose.includes("candidate-day-close-")
      && candidateDayClose.includes("candidateValidationReady")
      && candidateDayClose.includes("does not create fake feedback")
      && candidateDayClose.includes("scripts/check-candidate-privacy.mjs")
      && candidateDayClose.includes("scripts/record-candidate-daily-review.mjs")
      && candidateDayClose.includes("scripts/review-candidate-validation-packet.mjs")
      && nextAction.includes("release:candidate:day:close")
      && handoff.includes("release:candidate:day:close")
      && candidateForms.includes("release:candidate:day:close"),
  },
  {
    key: "candidate-record-guards",
    title: "候选反馈回填会阻断 PII 并自动同步 P0/P1 到问题表",
    path: `${files.packageJson}, ${files.candidateRecordDraft}, ${files.candidateRecordDraftSelftest}, ${files.candidateRecord}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:record")
      && packageJson.includes("release:candidate:record:selftest")
      && packageJson.includes("release:candidate:record:draft")
      && packageJson.includes("release:candidate:record:draft:selftest")
      && candidateRecordDraft.includes("candidate-record-draft-")
      && candidateRecordDraft.includes("这份草稿不会写入")
      && candidateRecordDraft.includes("--tonight \\\"yes|no\\\"")
      && candidateRecordDraft.includes("--recommendation \\\"1-5|没试\\\"")
      && candidateRecordDraftSelftest.includes("candidate-record-draft")
      && candidateRecordDraftSelftest.includes("should not mutate anonymous-users.csv")
      && candidatePrivacy.includes("candidate-record-draft-U")
      && candidateRecord.includes("issue-triage.csv")
      && candidateRecord.includes("appendedIssues")
      && candidateRecord.includes("scanRecordForPii")
      && candidateRecord.includes("phone")
      && candidateRecord.includes("wechat-id")
      && candidateRecord.includes("real-name")
      && candidateRecord.includes("nextIssueId")
      && candidateRecord.includes("--recommendation 1-5|没试")
      && candidateRecord.includes("--grocery-score 1-5|没试")
      && nextAction.includes("issue-triage.csv")
      && nextAction.includes("release:candidate:record:draft")
      && nextAction.includes("PII 写入前阻断")
      && handoff.includes("release:candidate:record:draft")
      && handoff.includes("P0/P1 会自动追加到 `issue-triage.csv`")
      && candidateForms.includes("release:candidate:record:draft")
      && candidateForms.includes("写入前会拒绝手机号、邮箱、微信号或真实姓名"),
  },
  {
    key: "candidate-prepare-selftest",
    title: "候选执行包生成自测可验证文件、权限和分发顺序",
    path: `${files.packageJson}, ${files.prepareScript}, ${files.nextAction}, ${files.handoff}`,
    ok: packageJson.includes("release:candidate:prepare:selftest")
      && nextAction.includes("release:candidate:prepare:selftest")
      && handoff.includes("release:candidate:prepare:selftest")
      && prepareScript.includes("release:candidate:desk:selftest")
      && prepareScript.includes("release:candidate:forms:preview")
      && prepareScript.includes("candidate-forms-preview.html")
      && prepareScript.includes("release:candidate:dispatch -- --date YYYY-MM-DD")
      && prepareScript.includes("release:candidate:dispatch:workbench -- --date YYYY-MM-DD")
      && prepareScript.includes("release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed")
      && prepareScript.includes("candidate-dispatch-YYYY-MM-DD.md/json")
      && prepareScript.includes("candidate-dispatch-workbench-YYYY-MM-DD.html")
      && prepareScript.includes("不能原样运行")
      && prepareScript.includes("1-5|没试")
      && !prepareScript.includes("--recommendation 5 --grocery-score 5")
      && !prepareScript.includes("--note \"清单有用\""),
  },
  {
    key: "candidate-privacy-scan",
    title: "候选执行包隐私扫描可阻止 PII 进入匿名材料",
    path: `${files.packageJson}, ${files.candidatePrivacy}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:privacy:check")
      && packageJson.includes("release:candidate:privacy:selftest")
      && candidatePrivacy.includes("phone")
      && candidatePrivacy.includes("email")
      && candidatePrivacy.includes("wechat-id")
      && candidatePrivacy.includes("real-name")
      && candidatePrivacy.includes("candidate-day-close-")
      && candidatePrivacy.includes("candidate-dispatch-")
      && candidatePrivacy.includes("candidate-dispatch-workbench-")
      && candidatePrivacy.includes("candidate-forms-preview.html")
      && candidatePrivacy.includes("Do not paste the sensitive values into chat or commits")
      && nextAction.includes("release:candidate:privacy:check")
      && nextAction.includes("只报文件/类型/行号，不回显敏感值")
      && handoff.includes("release:candidate:privacy:check")
      && handoff.includes("release:candidate:privacy:selftest")
      && candidateForms.includes("release:candidate:privacy:check"),
  },
];

const failures = checks.filter((check) => !check.ok);
const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  scope: Object.values(files),
  checks,
  failures,
  nextActions: failures.length
    ? [
      "Restore the candidate hardening docs before treating 1.1 as an internally testable production candidate.",
      "Keep real names, phone numbers, WeChat IDs, and private screenshots outside the repository.",
    ]
    : [
      "Candidate hardening materials are ready for anonymous internal test planning.",
      "Do not submit WeChat review until real candidate validation passes and the user explicitly confirms that platform action.",
    ],
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) process.exit(1);

function countSeedUsers(content) {
  const explicitUsers = new Set();
  for (const match of content.matchAll(/\|\s*(U\d{3})\s*\|/g)) {
    explicitUsers.add(match[1]);
  }
  return explicitUsers.size;
}

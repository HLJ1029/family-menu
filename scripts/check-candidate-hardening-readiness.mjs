import { readFile } from "node:fs/promises";

const files = {
  tracker: "docs/humi-1.1-gray-release-tracker.md",
  feedback: "docs/launch-feedback-and-101-backlog.md",
  handoff: "docs/humi-1.1-release-operator-handoff.md",
  nextAction: "scripts/print-release-next-action.mjs",
  packageJson: "package.json",
  prepareScript: "scripts/prepare-candidate-validation-packet.mjs",
  candidateForms: "docs/humi-1.1-candidate-validation-forms.md",
  candidateDesk: "scripts/print-candidate-validation-desk.mjs",
  candidatePrivacy: "scripts/check-candidate-privacy.mjs",
  candidatePlan: "scripts/plan-candidate-validation-day.mjs",
  candidateDispatch: "scripts/print-candidate-dispatch-pack.mjs",
  candidateInvite: "scripts/mark-candidate-invites.mjs",
  candidateDayClose: "scripts/close-candidate-validation-day.mjs",
  candidateRecord: "scripts/record-candidate-feedback.mjs",
};

const [tracker, feedback, handoff, nextAction, packageJson, prepareScript, candidateForms, candidateDesk, candidatePrivacy, candidatePlan, candidateDispatch, candidateInvite, candidateDayClose, candidateRecord] = await Promise.all(
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
      && packageJson.includes("release:candidate:doctor")
      && packageJson.includes("release:candidate:plan")
      && packageJson.includes("release:candidate:plan:selftest")
      && packageJson.includes("release:candidate:dispatch")
      && packageJson.includes("release:candidate:dispatch:selftest")
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
      && nextAction.includes("release:candidate:doctor")
      && nextAction.includes("release:candidate:plan")
      && nextAction.includes("release:candidate:dispatch")
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
      && handoff.includes("release:candidate:doctor")
      && handoff.includes("release:candidate:plan")
      && handoff.includes("release:candidate:dispatch")
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
      "candidate-feedback-import.csv",
      "outreach-batch.md",
      "candidate-day-plan.md",
      "release:candidate:plan",
      "U001-U020 批量邀请清单",
      "release:candidate:record",
      "--import candidate-feedback-import.csv",
      "release:candidate:desk:selftest",
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
    key: "candidate-execution-desk",
    title: "候选内测执行台可直接打印今日动作和私有包路径",
    path: `${files.packageJson}, ${files.candidateDesk}, ${files.nextAction}, ${files.handoff}`,
    ok: [
      "Humi 1.1 候选内测执行台",
      "今天先做",
      "今天不要做",
      "candidate-day-plan.md",
      "release:candidate:plan",
      "outreach-batch.md",
      "tester-feedback-form.md",
      "host-run-sheet.md",
      "candidate-feedback-import.csv",
      "release:candidate:day:close",
      "release:candidate:daily -- --date",
      "docs/humi-1.1-candidate-validation-forms.md",
    ].every((text) => candidateDesk.includes(text)),
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
    path: `${files.packageJson}, ${files.candidateDispatch}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:dispatch")
      && packageJson.includes("release:candidate:dispatch:selftest")
      && candidateDispatch.includes("candidate-dispatch-")
      && candidateDispatch.includes("outreach-batch.md")
      && candidateDispatch.includes("tester-feedback-form.md")
      && candidateDispatch.includes("host-run-sheet.md")
      && candidateDispatch.includes("release:candidate:record")
      && candidateDispatch.includes("release:candidate:invite")
      && candidateDispatch.includes("release:candidate:day:close")
      && candidateDispatch.includes("问问大家小程序卡片")
      && candidateDispatch.includes("邀请家人小程序卡片")
      && candidateDispatch.includes("买菜清单小程序卡片")
      && candidateDispatch.includes("recordEntry: \"分享卡片\"")
      && candidateDispatch.includes("不要原样运行")
      && candidateDispatch.includes("--recommendation 1-5|没试")
      && !candidateDispatch.includes("--recommendation 5 --grocery-score 5")
      && !candidateDispatch.includes("--note \"清单有用\"")
      && nextAction.includes("release:candidate:dispatch")
      && nextAction.includes("release:candidate:invite")
      && handoff.includes("release:candidate:dispatch")
      && candidateForms.includes("release:candidate:dispatch"),
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
      && candidateInvite.includes("does not create validation feedback")
      && candidateInvite.includes("does not store real contacts")
      && nextAction.includes("release:candidate:invite")
      && handoff.includes("release:candidate:invite")
      && prepareScript.includes("release:candidate:invite -- --from-dispatch YYYY-MM-DD"),
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
    path: `${files.packageJson}, ${files.candidateRecord}, ${files.nextAction}, ${files.handoff}, ${files.candidateForms}`,
    ok: packageJson.includes("release:candidate:record")
      && packageJson.includes("release:candidate:record:selftest")
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
      && nextAction.includes("PII 写入前阻断")
      && handoff.includes("P0/P1 会自动追加到 `issue-triage.csv`")
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
      && prepareScript.includes("release:candidate:dispatch -- --date YYYY-MM-DD")
      && prepareScript.includes("release:candidate:invite -- --from-dispatch YYYY-MM-DD")
      && prepareScript.includes("candidate-dispatch-YYYY-MM-DD.md/json")
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

import { readFile } from "node:fs/promises";

const files = {
  tracker: "docs/humi-1.1-gray-release-tracker.md",
  feedback: "docs/launch-feedback-and-101-backlog.md",
  handoff: "docs/humi-1.1-release-operator-handoff.md",
  nextAction: "scripts/print-release-next-action.mjs",
};

const [tracker, feedback, handoff, nextAction] = await Promise.all(
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
      "Do not submit WeChat review until the user explicitly confirms that platform action.",
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

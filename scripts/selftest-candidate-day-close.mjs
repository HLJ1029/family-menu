import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-day-close-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("node", [
  "scripts/close-candidate-validation-day.mjs",
  "--date", "2026-07-07",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  },
  timeout: 60_000,
  maxBuffer: 1024 * 1024 * 4,
});

const result = JSON.parse(stdout);
const closeMarkdown = await readFile(join(packetDir, "candidate-day-close-2026-07-07.md"), "utf8");
const closeJson = await readFile(join(packetDir, "candidate-day-close-2026-07-07.json"), "utf8");
const daily = await readFile(join(packetDir, "daily-review.csv"), "utf8");

assert(result.ok, "day close command did not complete ok");
assert(result.privacyOk, "day close did not report privacyOk");
assert(result.dailyReviewOk, "day close did not update daily review");
assert(result.candidateValidationReady === false, "day close should not fake candidate validation readiness");
assert(result.dailySummary.newExperienceUsers === 2, "day close did not summarize daily users");
assert(result.missingToThresholds.experiencedUsers === 8, "day close did not keep threshold gaps");
assert(daily.includes("2026-07-07,2,2,1,1,0,0,继续候选验证"), "daily-review.csv was not updated with day close");
assert(closeMarkdown.includes("Humi 1.1 候选内测日收尾"), "close markdown missing title");
assert(closeMarkdown.includes("候选复盘达标：否"), "close markdown should show validation not ready");
assert(closeMarkdown.includes("insufficient-validation-sample"), "close markdown should include validation blocker");
assert(JSON.parse(closeJson).candidateValidationReady === false, "close json should show validation not ready");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "candidate-day-close-writes-private-report-without-faking-readiness",
      ok: true,
      closeMarkdown: join(packetDir, "candidate-day-close-2026-07-07.md"),
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "README.md"), "# Humi 1.1 候选执行包\n", { mode: 0o600 }),
    writeFile(join(dir, "invite-copy.md"), "# Humi 1.1 候选邀请文案\n\n请体验 5 分钟。\n", { mode: 0o600 }),
    writeFile(join(dir, "outreach-batch.md"), "# U001-U020 批量邀请清单\n\n- U001：请体验 5 分钟。\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-day-plan.md"), "# Humi 1.1 候选内测日计划\n\n- 建议新邀请：U001、U002\n", { mode: 0o600 }),
    writeFile(join(dir, "tester-feedback-form.md"), "# Humi 1.1 体验者反馈单\n\n请不要写真实姓名、手机号或微信号。\n", { mode: 0o600 }),
    writeFile(join(dir, "host-run-sheet.md"), "# Humi 1.1 主厨记录单\n\n观察发现新菜、今晚菜单、清单和协作路径。\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-feedback-import.csv"), [
      "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "anonymous-users.csv"), csv([
      anonymousHeader(),
      ["U001", "待定", "iPhone 15 / WeChat 9", "已体验", "2026-07-07", "是", "是", "问问大家", "5", "5", "4", "待观察", "建议", "private://candidate/U001", "清单有用"],
      ["U002", "待定", "Android / WeChat 9", "已体验", "2026-07-07", "是", "否", "没有", "4", "3", "没试", "待观察", "建议", "private://candidate/U002", "清单入口不明显"],
      ["U003", "待定", "待填", "待邀请", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), csv([
      feedbackHeader(),
      ["U001", "iPhone 15 / WeChat 9", "2026-07-07", "今晚", "是", "是", "问问大家", "5", "5", "4", "没有卡住", "能发现新菜", "private://candidate/U001", "建议", "否", "新反馈"],
      ["U002", "Android / WeChat 9", "2026-07-07", "清单", "是", "否", "没有", "4", "3", "没试", "清单入口不明显", "需要再看", "private://candidate/U002", "建议", "待观察", "新反馈"],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "daily-review.csv"), csv([
      dailyHeader(),
      ["Day 1", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "issue-triage.csv"), csv([
      issueHeader(),
      ["P0-001", "待收集", "U000", "P0/P1/P2/建议", "待判断", "待判断", "待观察", "codex@mbp-m5pro", "新反馈", ""],
    ]), { mode: 0o600 }),
  ]);
}

function anonymousHeader() {
  return ["用户编号", "家庭类型", "设备/微信版本", "邀请状态", "首次体验日期", "完成今晚菜单", "完成清单", "尝试协作", "推荐评分", "清单评分", "分享评分", "复访状态", "当前等级", "私有证据位置", "备注"];
}

function feedbackHeader() {
  return ["用户编号", "设备与微信版本", "体验日期", "入口", "完成今晚菜单", "完成清单", "协作类型", "推荐评分", "清单评分", "分享评分", "卡住的位置", "用户原话摘要", "私有截图/录屏位置", "问题等级", "是否进入1.1.x", "处理状态"];
}

function dailyHeader() {
  return ["日期", "新体验人数", "完成今晚菜单", "完成清单", "尝试协作", "P0数", "P1数", "今日结论", "下一步"];
}

function issueHeader() {
  return ["编号", "问题", "来源用户编号", "等级", "是否复现", "是否阻塞审核", "是否进入1.1.x", "Owner", "处理状态", "结论"];
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

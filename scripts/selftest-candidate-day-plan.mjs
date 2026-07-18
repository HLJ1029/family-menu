import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-plan-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("node", [
  "scripts/plan-candidate-validation-day.mjs",
  "--date",
  "2026-07-07",
  "--batch-size",
  "3",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const planPath = join(packetDir, "candidate-day-plan.md");
const plan = await readFile(planPath, "utf8");
const requiredText = [
  "Humi 1.1 候选内测日计划",
  "日期：2026-07-07",
  "建议新邀请：U003、U004、U005",
  "需要追问：U001、U002",
        "优先跑协作：U003、U004、U005",
        "五类卡片固定任务：U001、U002、U003、U004、U005",
        "双海报固定任务：U009 菜单海报、U010 清单海报",
  "npm run release:candidate:privacy:check",
  "npm run release:candidate:day:close",
  "候选复盘达标前不进入微信公众平台审核动作",
];

for (const text of requiredText) {
  assert(stdout.includes(text), `stdout missing: ${text}`);
  assert(plan.includes(text), `plan file missing: ${text}`);
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  planPath,
  cases: [
    {
      name: "candidate-day-plan-selects-followups-and-next-invites",
      ok: true,
      requiredText,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), csv([
      anonymousHeader(),
      ["U001", "待定", "iPhone 15 / WeChat 9", "已体验", "2026-07-06", "否", "否", "没有", "没试", "没试", "没试", "待观察", "P2", "private://candidate/U001", "没打开成功"],
      ["U002", "待定", "待填", "未响应", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
      ["U003", "待定", "待填", "待邀请", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
      ["U004", "待定", "待填", "待邀请", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
      ["U005", "候补", "待填", "候补", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), csv([
      feedbackHeader(),
      ["U001", "待填", "待填", "今晚/完整菜品页/清单/我的家/五类分享卡片/菜单海报/清单海报", "是/否", "是/否", "问问大家/邀请家人/买菜认领/最近想吃/今晚菜单/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "daily-review.csv"), csv([
      ["日期", "新体验人数", "完成今晚菜单", "完成清单", "尝试协作", "P0数", "P1数", "今日结论", "下一步"],
      ["Day 1", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "issue-triage.csv"), csv([
      ["编号", "问题", "来源用户编号", "等级", "是否复现", "是否阻塞审核", "是否进入1.1.x", "Owner", "处理状态", "结论"],
      ["P0-001", "待收集", "U000", "P0/P1/P2/建议", "待判断", "待判断", "待观察", "codex@mbp-m5pro", "新反馈", ""],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "outreach-batch.md"), "# U001-U020 批量邀请清单\n", { mode: 0o600 }),
    writeFile(join(dir, "tester-feedback-form.md"), "# Humi 1.1 体验者反馈单\n", { mode: 0o600 }),
    writeFile(join(dir, "host-run-sheet.md"), "# Humi 1.1 主厨记录单\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-feedback-import.csv"), "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit\n", { mode: 0o600 }),
  ]);
}

function anonymousHeader() {
  return ["用户编号", "家庭类型", "设备/微信版本", "邀请状态", "首次体验日期", "完成今晚菜单", "完成清单", "尝试协作", "推荐评分", "清单评分", "分享评分", "复访状态", "当前等级", "私有证据位置", "备注"];
}

function feedbackHeader() {
  return ["用户编号", "设备与微信版本", "体验日期", "入口", "完成今晚菜单", "完成清单", "协作类型", "推荐评分", "清单评分", "分享评分", "卡住的位置", "用户原话摘要", "私有截图/录屏位置", "问题等级", "是否进入1.1.x", "处理状态"];
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

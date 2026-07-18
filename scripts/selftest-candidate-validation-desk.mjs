import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-desk-"));
await writePacket(packetDir);

const { stdout } = await execFileAsync("node", ["scripts/print-candidate-validation-desk.mjs"], {
  env: {
      ...process.env,
      HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
      HUMI_CANDIDATE_VALIDATION_DATE: "2026-07-07",
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const requiredText = [
  "Humi 1.1 候选内测执行台",
  `私有执行包：${packetDir}`,
  "真实体验：0/10",
  "完成【今晚】菜单：0/8",
  "完成清单：0/8",
  "尝试协作：0/3",
  "今日分发单已生成",
  "candidate-dispatch-2026-07-07.md",
  "release:candidate:dispatch:workbench -- --date 2026-07-07",
  "candidate-dispatch-workbench-2026-07-07.html",
  "U001: 问问大家小程序卡片（优先跑协作）",
  "U002: 邀请家人小程序卡片",
  "今天先做",
  "candidate-day-plan.md",
  "打开 `candidate-dispatch-2026-07-07.md`",
  "npm run release:candidate:invite -- --from-dispatch 2026-07-07 --sent-confirmed",
  "npm run release:candidate:plan",
  "今天不要做",
  "outreach-batch.md",
  "candidate-forms-preview.html",
  "tester-feedback-form.md",
  "host-run-sheet.md",
  "candidate-feedback-import.csv",
  "docs/humi-1.1-candidate-validation-forms.md",
  "npm run release:candidate:day:close",
  "release:candidate:record:draft -- --user U00X --date YYYY-MM-DD",
  "npm run release:candidate:record:draft -- --user U001 --date 2026-07-07 --entry \"问问大家小程序卡片\"",
  "npm run release:candidate:record -- --import candidate-feedback-import.csv",
  "达标后仍需用户动作当下确认",
];

for (const text of requiredText) {
  assert(stdout.includes(text), `desk output missing: ${text}`);
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "template-packet-desk-output",
      ok: true,
      requiredText,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "invite-copy.md"), "# Humi 1.1 候选邀请文案\n\n请体验 5 分钟。\n", { mode: 0o600 }),
    writeFile(join(dir, "outreach-batch.md"), "# U001-U020 批量邀请清单\n\n- U001：请体验 5 分钟。\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-forms-preview.html"), "<!doctype html><title>Humi 1.1 候选内测单据预览</title><main>体验者反馈单 / 主厨记录单</main>\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-day-plan.md"), "# Humi 1.1 候选内测日计划\n\n- 建议新邀请：U001、U002\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.md"), "# Humi 1.1 候选内测今日分发单\n\n- U001：问问大家小程序卡片\n- U002：邀请家人小程序卡片\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-workbench-2026-07-07.html"), "<!doctype html><title>Humi 1.1 候选分发工作台</title><main>U001</main>\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-dispatch-2026-07-07.json"), JSON.stringify({
      ok: true,
      checkedAt: "2026-07-07T00:00:00.000Z",
      date: "2026-07-07",
      users: [
        {
          id: "U001",
          collaborationTarget: true,
          entryTask: "crave-card",
          entryLabel: "问问大家小程序卡片",
          hasMessage: true,
        },
        {
          id: "U002",
          collaborationTarget: false,
          entryTask: "invite-card",
          entryLabel: "邀请家人小程序卡片",
          hasMessage: true,
        },
      ],
    }, null, 2), { mode: 0o600 }),
    writeFile(join(dir, "tester-feedback-form.md"), "# Humi 1.1 体验者反馈单\n\n请不要写真实姓名、手机号或微信号。\n", { mode: 0o600 }),
    writeFile(join(dir, "host-run-sheet.md"), "# Humi 1.1 主厨记录单\n\n观察发现新菜、今晚菜单、清单和协作路径。\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-feedback-import.csv"), [
      "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "anonymous-users.csv"), csv([
      anonymousHeader(),
      ["U001", "待定", "待填", "待邀请", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
      ["U002", "待定", "待填", "待邀请", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
    ]), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), csv([
      feedbackHeader(),
      ["U001", "待填", "待填", "今晚/完整菜品页/清单/我的家/五类分享卡片/菜单海报/清单海报", "是/否", "是/否", "问问大家/邀请家人/买菜认领/最近想吃/今晚菜单/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
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

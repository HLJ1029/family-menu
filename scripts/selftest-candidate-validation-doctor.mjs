import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const today = new Date().toISOString().slice(0, 10);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-doctor-"));
await writePacket(packetDir);

const stdout = await runDoctor(packetDir);

const requiredText = [
  "Humi 1.1 候选内测进度台",
  "当前动作：继续完善 1.1 生产候选与真实内测；候选复盘达标前不进入微信审核。",
  "今日分发单已生成",
  `${packetDir}/candidate-dispatch-${today}.md`,
  "U001: 问问大家小程序卡片（优先跑协作）",
  "U002: 邀请家人小程序卡片",
  `真实发送后再运行 \`npm run release:candidate:invite -- --from-dispatch ${today}\`，只标记已邀请，不会生成体验反馈。`,
  "先发今天分发单里的 U 编号",
  "不要把“已邀请”当成“已体验”",
  "体验者反馈单",
  "主厨记录单",
  "单个用户回填",
];

for (const text of requiredText) {
  assert(stdout.includes(text), `doctor output missing: ${text}`);
}

await writeAnonymousUsers(packetDir, "已邀请");
const invitedStdout = await runDoctor(packetDir);
const invitedRequiredText = [
  "今天这批已标记已邀请",
  "等待今天这批 U 编号的真实反馈",
  "U001: 问问大家小程序卡片（优先跑协作） / 已邀请",
  "U002: 邀请家人小程序卡片 / 已邀请",
];
for (const text of invitedRequiredText) {
  assert(invitedStdout.includes(text), `doctor invited output missing: ${text}`);
}

await writeAnonymousUsers(packetDir, ["已邀请", "待邀请"]);
const partialStdout = await runDoctor(packetDir);
const partialRequiredText = [
  "还没发",
  "U002: 邀请家人小程序卡片 / 待邀请",
  "已发待回收",
  "U001: 问问大家小程序卡片（优先跑协作） / 已邀请",
  "继续只发送“还没发”的 U 编号",
];
for (const text of partialRequiredText) {
  assert(partialStdout.includes(text), `doctor partial output missing: ${text}`);
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "doctor-surfaces-current-dispatch-and-invite-guard",
      ok: true,
      requiredText,
    },
    {
      name: "doctor-switches-to-feedback-after-invite-mark",
      ok: true,
      requiredText: invitedRequiredText,
    },
    {
      name: "doctor-splits-partial-invite-progress",
      ok: true,
      requiredText: partialRequiredText,
    },
  ],
}, null, 2));

async function runDoctor(dir) {
  const { stdout } = await execFileAsync("node", ["scripts/doctor-candidate-validation.mjs"], {
    env: {
      ...process.env,
      HUMI_CANDIDATE_VALIDATION_DIR: dir,
    },
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "invite-copy.md"), "# Humi 1.1 候选邀请文案\n\n请体验 5 分钟。\n", { mode: 0o600 }),
    writeFile(join(dir, "outreach-batch.md"), "# U001-U020 批量邀请清单\n\n- U001：请体验 5 分钟。\n", { mode: 0o600 }),
    writeFile(join(dir, "candidate-day-plan.md"), "# Humi 1.1 候选内测日计划\n\n- 建议新邀请：U001、U002\n", { mode: 0o600 }),
    writeFile(join(dir, `candidate-dispatch-${today}.md`), "# Humi 1.1 候选内测今日分发单\n\n- U001：问问大家小程序卡片\n- U002：邀请家人小程序卡片\n", { mode: 0o600 }),
    writeFile(join(dir, `candidate-dispatch-${today}.json`), JSON.stringify({
      ok: true,
      checkedAt: `${today}T00:00:00.000Z`,
      date: today,
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
    writeAnonymousUsers(dir, "待邀请"),
    writeFile(join(dir, "feedback-template.csv"), csv([
      feedbackHeader(),
      ["U001", "待填", "待填", "今晚/自己挑/想连排几天/清单/我的家/分享卡片", "是/否", "是/否", "问问大家/邀请家人/买菜认领/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
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

async function writeAnonymousUsers(dir, inviteStatus) {
  const statuses = Array.isArray(inviteStatus) ? inviteStatus : [inviteStatus, inviteStatus];
  await writeFile(join(dir, "anonymous-users.csv"), csv([
    anonymousHeader(),
    ["U001", "待定", "待填", statuses[0], "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
    ["U002", "待定", "待填", statuses[1], "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
  ]), { mode: 0o600 });
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

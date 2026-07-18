import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WECHAT_SUBMIT_VERSION } from "./wechat-submit-evidence-session.mjs";

const execFileAsync = promisify(execFile);

const tempDir = await mkdtemp(join(tmpdir(), "humi-release-next-"));
const tempEvidence = join(tempDir, "evidence.md");
const tempHardening = join(tempDir, "hardening.md");

try {
  await copyFile("docs/humi-1.1-release-evidence-log.md", tempEvidence);
  await writeFile(tempHardening, "- [ ] P1 selftest open item\n");
  await assertNext("提审前产品打磨");
  await writeFile(tempHardening, "- [x] P1 selftest open item\n");
  await writePendingCandidatePacket(tempDir, "待邀请");
  await assertNext("运行 `npm run release:candidate:today", {
    forbidden: [
      "- docs/wechat-submit-copy-packet.md",
      "- docs/miniprogram-platform-submit-runbook.md",
      "- npm run release:wechat:share:doctor",
    ],
  });
  await writePendingCandidatePacket(tempDir, ["已邀请", "待邀请"]);
  await assertNext("只发送今日分发单里尚未标记已邀请的 U 编号");
  await writePendingCandidatePacket(tempDir, "已邀请");
  await assertNext("今天分发单里的 U 编号已标记为已邀请");
  await writeValidCandidatePacket(tempDir);

  const tempSubmitDir = join(tempDir, `wechat-submit-${WECHAT_SUBMIT_VERSION}-20990101T000000`);
  await mkdir(tempSubmitDir, { recursive: true });
  await writeFile(join(tempSubmitDir, "humi-review-submitted.png"), "fake screenshot bytes");
  await assertNext("微信提交截图已留存，下一步是登记提交审核证据");
  await rm(tempSubmitDir, { recursive: true, force: true });

  await assertNext("1.1 生产候选完善与内测验证，暂不进入微信审核");

  await run("release:evidence:record:submit", {
    HUMI_WECHAT_SUBMIT_TIME: "2026-07-03 14:30 CST",
    HUMI_WECHAT_SUBMITTER: "codex-selftest",
    HUMI_WECHAT_REVIEW_STATUS: "审核中",
    HUMI_WECHAT_EVIDENCE_LOCATION: "private://selftest/wechat-submit",
  });
  await assertNext("微信审核已提交，下一步是等待并登记审核结果");

  await run("release:evidence:record:review", {
    HUMI_WECHAT_REVIEW_RESULT: "通过",
    HUMI_WECHAT_REVIEW_RESULT_TIME: "2026-07-04 10:15 CST",
    HUMI_WECHAT_REVIEW_REASON: "无",
    HUMI_WECHAT_REVIEW_SEVERITY: "无问题",
    HUMI_WECHAT_REVIEW_NEEDS_PATCH: "否",
    HUMI_WECHAT_REVIEW_HANDLING: "等待发布",
  });
  await assertNext("微信审核结果已登记，下一步是发布审核通过版本");

  await run("release:evidence:record:publish", {
    HUMI_WECHAT_PUBLISH_TIME: "2026-07-04 11:00 CST",
    HUMI_WECHAT_PUBLISHER: "codex-selftest",
    HUMI_WECHAT_PUBLISH_SCREENSHOT: "private://selftest/wechat-publish",
    HUMI_WECHAT_P0_DEVICE: "selftest device / WeChat",
    HUMI_WECHAT_ROLLBACK_STATUS: "否",
  });
  await assertNext(`${WECHAT_SUBMIT_VERSION} 已发布，下一步是真机 P0 验收`);

  await run("release:evidence:record:p0", {
    HUMI_WECHAT_P0_DEVICE: "selftest device / WeChat",
    HUMI_WECHAT_P0_RESULT: "通过",
    HUMI_WECHAT_P0_NOTE: "selftest P0 evidence",
  });
  await assertNext("真机 P0 已登记，下一步是完成 24 小时监控");

  await run("release:evidence:record:monitor", {
    HUMI_MONITOR_H5: "正常",
    HUMI_MONITOR_API: "正常",
    HUMI_MONITOR_RECOMMENDATION: "正常",
    HUMI_MONITOR_SHARE: "正常",
    HUMI_MONITOR_LOGIN: "正常",
    HUMI_MONITOR_FEEDBACK: "无 P0/P1",
    HUMI_MONITOR_HANDLING: "无需处理",
  });
  await assertNext("外部证据区块已填完，下一步是最终状态复核", {
    alternative: "1.1 已完成发布证据闭环",
  });

  console.log(JSON.stringify({
    ok: true,
    tempEvidence,
    checkedStages: [
      "submit-evidence-ready",
      "submit",
      "review",
      "publish",
      "p0",
      "monitor",
      "final",
    ],
  }, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

async function assertNext(expected, options = {}) {
  const { stdout } = await execFileAsync("npm", ["run", "release:next"], {
    env: {
      ...process.env,
      HUMI_EVIDENCE_LOG_PATH: tempEvidence,
      HUMI_PRIVATE_EVIDENCE_DIR: tempDir,
      HUMI_PRE_REVIEW_HARDENING_PATH: tempHardening,
      HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY: "1",
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (!stdout.includes(expected) && (!options.alternative || !stdout.includes(options.alternative))) {
    throw new Error(`release:next did not include expected stage: ${expected}\n\n${stdout}`);
  }
  for (const forbidden of options.forbidden ?? []) {
    if (stdout.includes(forbidden)) {
      throw new Error(`release:next included forbidden candidate-stage text: ${forbidden}\n\n${stdout}`);
    }
  }
}

async function run(script, extraEnv) {
  await execFileAsync("npm", ["run", script], {
    env: {
      ...process.env,
      ...extraEnv,
      HUMI_EVIDENCE_LOG_PATH: tempEvidence,
      HUMI_PRE_REVIEW_HARDENING_PATH: tempHardening,
      HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY: "1",
    },
    timeout: 120_000,
    maxBuffer: 1024 * 1024 * 8,
  });
}

async function writePendingCandidatePacket(baseDir, inviteStatus) {
  const packetDir = join(baseDir, "candidate-validation-20990101T000000Z");
  const today = new Date().toISOString().slice(0, 10);
  const statuses = Array.isArray(inviteStatus) ? inviteStatus : [inviteStatus, inviteStatus];
  await mkdir(packetDir, { recursive: true });
  await Promise.all([
    writeFile(join(packetDir, "anonymous-users.csv"), csv([
      anonymousHeader(),
      ["U001", "两人家庭", "iPhone 15 / WeChat 9", statuses[0], "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://candidate/U001", ""],
      ["U002", "三人家庭", "iPhone 14 / WeChat 9", statuses[1], "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://candidate/U002", ""],
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, "feedback-template.csv"), csv([
      feedbackHeader(),
      ["U001", "待填", "待填", "今晚/自己挑/想连排几天/清单/我的家/分享卡片", "是/否", "是/否", "问问大家/邀请家人/买菜认领/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, "daily-review.csv"), csv([
      dailyHeader(),
      ["Day 1", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, "issue-triage.csv"), csv([
      issueHeader(),
      ["SUG-001", "待收集", "U000", "建议", "待判断", "否", "否", "codex@mbp-m5pro", "新反馈", ""],
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, `candidate-dispatch-${today}.md`), "# Humi 1.1 候选内测今日分发单\n\n- U001：问问大家小程序卡片\n- U002：邀请家人小程序卡片\n", { mode: 0o600 }),
    writeFile(join(packetDir, `candidate-dispatch-${today}.json`), JSON.stringify({
      ok: true,
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
  ]);
}

async function writeValidCandidatePacket(baseDir) {
  const packetDir = join(baseDir, "candidate-validation-20990101T000000Z");
  await mkdir(packetDir, { recursive: true });
  const users = Array.from({ length: 10 }, (_, index) => candidateUser(index + 1));
  await Promise.all([
    writeFile(join(packetDir, "anonymous-users.csv"), csv([
      anonymousHeader(),
      ...users.map((user) => user.anonymous),
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, "feedback-template.csv"), csv([
      feedbackHeader(),
      ...users.map((user) => user.feedback),
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, "daily-review.csv"), csv([
      dailyHeader(),
      ["Day 1", "10", "10", "10", "3", "0", "0", "候选复盘自测通过", "继续外部证据阶段"],
    ]), { mode: 0o600 }),
    writeFile(join(packetDir, "issue-triage.csv"), csv([
      issueHeader(),
      ["SUG-001", "希望菜更多", "U001", "建议", "是", "否", "否", "codex@mbp-m5pro", "不处理", "不阻塞"],
    ]), { mode: 0o600 }),
  ]);
}

function candidateUser(index) {
  const id = `U${String(index).padStart(3, "0")}`;
  const collaboration = index <= 3 ? ["问问大家", "邀请家人", "买菜认领"][index - 1] : "没有";
  const device = index % 2 === 0 ? "iPhone 14 / WeChat 9" : "iPhone 15 / WeChat 9";
  return {
    anonymous: [id, index % 2 === 0 ? "三人家庭" : "两人家庭", device, "已体验", "2026-07-06", "是", "是", collaboration, index % 2 === 0 ? "4" : "5", "5", collaboration === "没有" ? "待填" : "4", index <= 4 ? "已复访" : "待观察", "通过", `private://candidate/${id}`, "流程顺"],
    feedback: [id, device, "2026-07-06", index % 2 === 0 ? "清单" : "今晚", "是", "是", collaboration, index % 2 === 0 ? "4" : "5", "5", collaboration === "没有" ? "待填" : "4", "无", index % 2 === 0 ? "清单能看懂" : "推荐能直接做", `private://candidate/${id}`, "建议", "否", "不处理"],
  };
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

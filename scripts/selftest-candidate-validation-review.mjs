import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const cases = [
  {
    name: "empty-template",
    files: templatePacket(),
    expect: {
      ok: false,
      recommendation: "wait-for-validation-input",
      blocker: "no-real-validation",
    },
  },
  {
    name: "insufficient-sample",
    files: smallValidPacket(),
    expect: {
      ok: false,
      recommendation: "wait-for-more-validation",
      blocker: "insufficient-validation-sample",
      summary: {
        experiencedUsers: 2,
        completedTonight: 2,
        completedGrocery: 2,
        triedCollaboration: 1,
      },
    },
  },
  {
    name: "p1-blocker",
    files: p1Packet(),
    expect: {
      ok: false,
      recommendation: "triage-p1-before-review",
      blocker: "p1",
    },
  },
  {
    name: "valid-feedback",
    files: validPacket(),
    expect: {
      ok: true,
      recommendation: "candidate-validation-clear",
      summary: {
        experiencedUsers: 10,
        completedTonight: 10,
        completedGrocery: 10,
        triedCollaboration: 3,
      },
    },
  },
];

const results = [];

for (const testCase of cases) {
  const packetDir = await mkdtemp(join(tmpdir(), `humi-candidate-review-${testCase.name}-`));
  await writePacket(packetDir, testCase.files);
  const run = await runReview(packetDir);
  assertCase(testCase, run);
  results.push({
    name: testCase.name,
    ok: true,
    exitCode: run.exitCode,
    recommendation: run.data.recommendation,
    summary: run.data.summary,
  });
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  cases: results,
}, null, 2));

async function writePacket(packetDir, files) {
  await Promise.all(Object.entries(files).map(([file, content]) => (
    writeFile(join(packetDir, file), content, { mode: 0o600 })
  )));
}

async function runReview(packetDir) {
  try {
    const { stdout } = await execFileAsync("node", ["scripts/review-candidate-validation-packet.mjs"], {
      env: {
        ...process.env,
        HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
      },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return {
      exitCode: 0,
      data: parseLastJson(stdout),
      stdout,
    };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      data: parseLastJson(error.stdout || ""),
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  }
}

function assertCase(testCase, run) {
  if (!run.data) {
    throw new Error(`${testCase.name}: review script did not return JSON.`);
  }
  if (run.data.ok !== testCase.expect.ok) {
    throw new Error(`${testCase.name}: expected ok=${testCase.expect.ok}, got ${run.data.ok}.`);
  }
  if (run.data.recommendation !== testCase.expect.recommendation) {
    throw new Error(`${testCase.name}: expected recommendation=${testCase.expect.recommendation}, got ${run.data.recommendation}.`);
  }
  if (testCase.expect.ok && run.exitCode !== 0) {
    throw new Error(`${testCase.name}: expected exit 0, got ${run.exitCode}.`);
  }
  if (!testCase.expect.ok && run.exitCode === 0) {
    throw new Error(`${testCase.name}: expected non-zero exit for blocking review.`);
  }
  if (testCase.expect.blocker && !run.data.blockers?.some((item) => item.key === testCase.expect.blocker)) {
    throw new Error(`${testCase.name}: expected blocker ${testCase.expect.blocker}.`);
  }
  for (const [key, value] of Object.entries(testCase.expect.summary ?? {})) {
    if (run.data.summary?.[key] !== value) {
      throw new Error(`${testCase.name}: expected summary.${key}=${value}, got ${run.data.summary?.[key]}.`);
    }
  }
}

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function templatePacket() {
  return {
    "anonymous-users.csv": csv([
      anonymousHeader(),
      ["U001", "待定", "待填", "待邀请", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待观察", "待观察", "private://", ""],
    ]),
    "feedback-template.csv": csv([
      feedbackHeader(),
      ["U001", "待填", "待填", "今晚/自己挑/想连排几天/清单/我的家/分享卡片", "是/否", "是/否", "问问大家/邀请家人/买菜认领/没有", "1-5", "1-5", "1-5", "待填", "待填", "private://", "P0/P1/P2/建议", "是/否/待观察", "新反馈/已复现/修复中/已修复/不处理"],
    ]),
    "daily-review.csv": csv([
      dailyHeader(),
      ["Day 1", "待填", "待填", "待填", "待填", "待填", "待填", "待填", "待填"],
    ]),
    "issue-triage.csv": csv([
      issueHeader(),
      ["P0-001", "待收集", "U000", "P0/P1/P2/建议", "待观察", "待判断", "待观察", "codex@mbp-m5pro", "新反馈", ""],
    ]),
  };
}

function p1Packet() {
  return {
    ...validPacket(),
    "issue-triage.csv": csv([
      issueHeader(),
      ["P1-001", "家人看不懂买菜认领状态", "U001", "P1", "是", "否", "待观察", "codex@mbp-m5pro", "新反馈", "需先判断是否阻塞审核"],
    ]),
  };
}

function smallValidPacket() {
  return buildPacket([
    userRow(1, { collaboration: "问问大家" }),
    userRow(2, { collaboration: "没有" }),
  ]);
}

function validPacket() {
  return buildPacket(Array.from({ length: 10 }, (_, index) => userRow(index + 1, {
    collaboration: index < 3 ? ["问问大家", "邀请家人", "买菜认领"][index] : "没有",
  })));
}

function buildPacket(users) {
  return {
    "anonymous-users.csv": csv([anonymousHeader(), ...users.map((user) => user.anonymous)]),
    "feedback-template.csv": csv([feedbackHeader(), ...users.map((user) => user.feedback)]),
    "daily-review.csv": csv([
      dailyHeader(),
      ["Day 1", String(users.length), String(users.length), String(users.length), String(users.filter((user) => user.collaboration !== "没有").length), "0", "0", "核心路径通过", "继续观察"],
    ]),
    "issue-triage.csv": csv([
      issueHeader(),
      ["SUG-001", "希望菜更多", "U001", "建议", "是", "否", "否", "codex@mbp-m5pro", "不处理", "不阻塞"],
    ]),
  };
}

function userRow(index, { collaboration }) {
  const id = `U${String(index).padStart(3, "0")}`;
  const device = index % 2 === 0 ? "iPhone 14 / WeChat 9" : "iPhone 15 / WeChat 9";
  return {
    collaboration,
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

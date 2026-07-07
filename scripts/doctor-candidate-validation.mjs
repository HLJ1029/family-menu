import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const review = await runReview();

if (!review.data) {
  console.error("无法读取候选内测复盘结果。请先运行 HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare。");
  if (review.stderr) console.error(review.stderr);
  process.exit(1);
}

const result = review.data;
const today = new Date().toISOString().slice(0, 10);
const dispatch = await readDispatchSummary(result.packetDir, today);
const lines = [];

lines.push("Humi 1.1 候选内测进度台");
lines.push("");
lines.push(`检查时间：${result.checkedAt}`);
lines.push(`私有执行包：${result.packetDir}`);
lines.push("");
lines.push("当前结论：");
lines.push(`- 候选复盘达标：${result.ok ? "是" : "否"}`);
lines.push(`- 当前建议：${explainRecommendation(result.recommendation)}`);
lines.push("- 当前动作：继续完善 1.1 生产候选与真实内测；候选复盘达标前不进入微信审核。");
lines.push("");

lines.push("达标进度：");
for (const item of result.thresholdProgress ?? []) {
  const status = item.ok ? "已达标" : `还差 ${item.missing}`;
  lines.push(`- ${item.label}: ${item.current}/${item.required}，${status}`);
}
lines.push(`- P0 问题：${result.summary?.p0Count ?? 0}`);
lines.push(`- P1 问题：${result.summary?.p1Count ?? 0}`);
lines.push("");

lines.push("当前数据：");
lines.push(`- 匿名候选编号：${result.summary?.candidateUsers ?? 0}`);
lines.push(`- 已邀请/已体验/未响应：${result.summary?.activeUsers ?? 0}`);
lines.push(`- 反馈记录：${result.summary?.feedbackRows ?? 0}`);
lines.push(`- 每日复盘记录：${result.summary?.dailyReviewRows ?? 0}`);
lines.push("");

if (dispatch) {
  lines.push("今日分发单已生成：");
  lines.push(`- 分发单: ${dispatch.markdownPath}`);
  lines.push(`- JSON: ${dispatch.jsonPath}`);
  if (dispatch.users.length) {
    if (dispatch.someUsersInvited) {
      lines.push("- 还没发：");
      for (const user of dispatch.pendingUsers) {
        lines.push(`  - ${formatDispatchUser(user)}`);
      }
      lines.push("- 已发待回收：");
      for (const user of dispatch.invitedUsers) {
        lines.push(`  - ${formatDispatchUser(user)}`);
      }
      lines.push("- 继续只发送“还没发”的 U 编号；已发的等待真实反馈。");
    } else {
      for (const user of dispatch.users) {
        lines.push(`- ${formatDispatchUser(user)}`);
      }
    }
    if (dispatch.allUsersInvited) {
      lines.push("- 今天这批已标记已邀请；等待真实反馈，收到后替换分发单里的 record 模板并回填匿名结果。");
    } else if (!dispatch.someUsersInvited) {
      lines.push(`- 真实发送后再运行 \`npm run release:candidate:invite -- --from-dispatch ${today} --sent-confirmed\`，只标记已邀请，不会生成体验反馈。`);
    }
  } else {
    lines.push("- 今日分发单没有发送对象；先运行 `npm run release:candidate:plan` 重新看今日缺口。");
  }
  lines.push("");
}

lines.push("现在要打开的文件：");
for (const file of candidateFiles(result)) {
  lines.push(`- ${file.label}: ${file.path}`);
}
lines.push("");

if (result.blockers?.length) {
  lines.push("阻塞项：");
  for (const blocker of result.blockers) {
    lines.push(`- ${blocker.title}`);
    for (const detail of blocker.details ?? []) {
      lines.push(`  ${detail}`);
    }
  }
  lines.push("");
}

lines.push("下一步补什么：");
for (const action of buildHumanActions(result, dispatch, today)) {
  lines.push(`- ${action}`);
}
lines.push("");
lines.push("复盘文件：");
lines.push("- candidate-review.json");
lines.push("- candidate-review.md");
lines.push("");
lines.push("重新检查：");
lines.push("- npm run release:candidate:doctor");
lines.push("- npm run release:candidate:review");
lines.push("");
lines.push("单个用户回填：");
lines.push("- 先替换分发单里的 record 模板；不要原样运行占位命令。");
lines.push("- npm run release:candidate:record -- --user U001 ...");

console.log(lines.join("\n"));

async function runReview() {
  try {
    const { stdout, stderr } = await execFileAsync("node", ["scripts/review-candidate-validation-packet.mjs"], {
      env: process.env,
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      exitCode: 0,
      data: parseLastJson(stdout),
      stdout,
      stderr,
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

function parseLastJson(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function explainRecommendation(recommendation) {
  return {
    "wait-for-validation-input": "等待真实匿名反馈填入",
    "wait-for-more-validation": "继续补足样本量和核心路径完成数",
    "stop-and-fix-before-review": "先修复 P0 或阻塞项",
    "triage-p1-before-review": "先判断并处理 P1",
    "candidate-validation-clear": "候选复盘已通过，可进入用户确认审核讨论",
  }[recommendation] ?? recommendation ?? "未知";
}

function buildHumanActions(result, dispatch, today) {
  if (result.recommendation === "wait-for-validation-input") {
    return [
      dispatch?.allUsersInvited
        ? "等待今天这批 U 编号的真实反馈；收到后替换分发单里的 record 模板并回填匿名结果。"
        : dispatch?.someUsersInvited
        ? `继续只发送还没发的 U 编号：${dispatch.pendingUsers.map((user) => user.id).join("、")}；已发的 U 编号等待真实反馈。`
        : dispatch
        ? `先发今天分发单里的 U 编号；真实发送后运行 npm run release:candidate:invite -- --from-dispatch ${today} --sent-confirmed。`
        : `先运行 npm run release:candidate:plan 和 npm run release:candidate:dispatch -- --date ${today}，生成今日分发单后再发送。`,
      "收到反馈后，在私有包 anonymous-users.csv 记录 U 编号的真实匿名体验状态。",
      "至少记录首次体验日期、完成今晚菜单、完成清单、尝试协作这四类字段；不要把“已邀请”当成“已体验”。",
      "把具体卡点、用户原话摘要和私有截图位置填到 feedback-template.csv。",
      "也可以用 npm run release:candidate:record -- ... 回填单个用户，少手改 CSV。",
      "每天收工前运行 npm run release:candidate:day:close -- --date YYYY-MM-DD，把新增人数、P0/P1、当天结论、隐私扫描和候选复盘写入私有收尾报告。",
      "只需要单独补 daily-review.csv 时，再运行 npm run release:candidate:daily -- --date YYYY-MM-DD。",
      "真实姓名、微信号、手机号、截图和录屏继续放仓库外，不写进 Git。",
    ];
  }
  if (result.recommendation === "wait-for-more-validation") {
    return (result.thresholdProgress ?? [])
      .filter((item) => !item.ok)
      .map((item) => `继续补 ${item.label}：当前 ${item.current}/${item.required}，还差 ${item.missing}。`);
  }
  if (result.recommendation === "stop-and-fix-before-review") {
    return [
      "暂停审核准备，先修复可复现 P0 或阻塞项。",
      "修复后把结论写回 docs/humi-1.1-pre-review-hardening.md 和私有问题分级表。",
      "重新跑 release:status、release:candidate:doctor 和 release:candidate:review。",
    ];
  }
  if (result.recommendation === "triage-p1-before-review") {
    return [
      "先判断 P1 是否影响核心留存或审核风险。",
      "影响核心路径的 P1 先修；可进 1.1.x 的 P1 要在私有包和 AI-HQ 状态里写明决策。",
      "处理后重新跑 release:candidate:doctor 和 release:candidate:review。",
    ];
  }
  return [
    "候选复盘已经达标，下一步仍不是自动提交审核。",
    "先运行 npm run release:status 和 npm run release:wechat:check 做只读确认。",
    "只有用户在动作当下明确确认，才打开微信公众平台提交工作台。",
  ];
}

function candidateFiles(result) {
  const packetDir = result.packetDir;
  return [
    ["候选内测日计划", "candidate-day-plan.md"],
    dispatch ? ["今日分发单", `candidate-dispatch-${today}.md`] : null,
    dispatch ? ["今日分发 JSON", `candidate-dispatch-${today}.json`] : null,
    ["邀请文案", "invite-copy.md"],
    ["U001-U020 批量邀请清单", "outreach-batch.md"],
    ["体验者反馈单", "tester-feedback-form.md"],
    ["主厨记录单", "host-run-sheet.md"],
    ["批量反馈导入模板", "candidate-feedback-import.csv"],
    ["匿名用户进度表", "anonymous-users.csv"],
    ["单条反馈回填表", "feedback-template.csv"],
    ["每日复盘表", "daily-review.csv"],
    ["P0/P1 问题分级表", "issue-triage.csv"],
  ].filter(Boolean).map(([label, file]) => ({
    label,
    path: `${packetDir}/${file}`,
  }));
}

async function readDispatchSummary(dir, date) {
  const jsonPath = `${dir}/candidate-dispatch-${date}.json`;
  const markdownPath = `${dir}/candidate-dispatch-${date}.md`;
  try {
    const content = await readFile(jsonPath, "utf8");
    await access(markdownPath);
    const parsed = JSON.parse(content);
    const statuses = await readCandidateInviteStatuses(dir);
    const users = (Array.isArray(parsed.users) ? parsed.users : []).map((user) => {
      const id = String(user.id || "").trim().toUpperCase();
      return {
        ...user,
        id,
        inviteStatus: statuses.get(id) || "",
      };
    });
    const invitedUsers = users.filter((user) => isInvitedStatus(user.inviteStatus));
    const pendingUsers = users.filter((user) => !isInvitedStatus(user.inviteStatus));
    return {
      markdownPath,
      jsonPath,
      users,
      invitedUsers,
      pendingUsers,
      allUsersInvited: users.length > 0 && pendingUsers.length === 0,
      someUsersInvited: invitedUsers.length > 0 && pendingUsers.length > 0,
    };
  } catch {
    return null;
  }
}

function formatDispatchUser(user) {
  const suffix = user.collaborationTarget ? "（优先跑协作）" : "";
  const status = user.inviteStatus ? ` / ${user.inviteStatus}` : "";
  return `${user.id}: ${user.entryLabel}${suffix}${status}`;
}

function isInvitedStatus(status) {
  return ["已邀请", "已体验"].includes(String(status || "").trim());
}

async function readCandidateInviteStatuses(dir) {
  try {
    const content = await readFile(`${dir}/anonymous-users.csv`, "utf8");
    const rows = parseCsv(content);
    const [headers, ...data] = rows;
    const idIndex = headers.indexOf("用户编号");
    const statusIndex = headers.indexOf("邀请状态");
    const statuses = new Map();
    if (idIndex < 0 || statusIndex < 0) return statuses;
    for (const row of data) {
      const id = String(row[idIndex] || "").trim().toUpperCase();
      if (/^U\d{3}$/.test(id)) {
        statuses.set(id, String(row[statusIndex] || "").trim());
      }
    }
    return statuses;
  } catch {
    return new Map();
  }
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

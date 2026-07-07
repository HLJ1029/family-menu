import { execFile } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  findLatestWechatSubmitDir,
  listWechatSubmitEvidenceFiles,
} from "./wechat-submit-evidence-session.mjs";

const execFileAsync = promisify(execFile);

const status = await runJsonScript("release:status", { allowFailure: false });
const wechat = await runJsonScript("release:wechat:check", { allowFailure: true });
const shareEvidence = await runJsonScript("release:wechat:share:evidence", { allowFailure: true });
const evidenceCheck = status.checks?.find((check) => check.name === "release:evidence:check");
const missingSections = evidenceCheck?.data?.missing?.map((item) => item.section) ?? [];
const submitEvidenceState = await getLatestSubmitEvidenceState();
const nextStage = getNextEvidenceStage(missingSections, submitEvidenceState);
const openHardeningItems = status.release?.preReviewHardeningOpenItems ?? [];
const candidateAction = await getCandidateActionState();
let stageScope = "blocked";

const lines = [];
lines.push("Humi 1.1 当前行动卡");
lines.push("");
lines.push(`检查时间：${new Date().toISOString()}`);
lines.push(`当前提交：${status.git?.head ?? "unknown"} / origin/main ${status.git?.originMain ?? "unknown"}`);
lines.push(`小程序版本：${status.release?.miniProgramUploadedVersion ?? "unknown"} / ${status.release?.miniProgramUploadDescription ?? "unknown"}`);
lines.push("");

if (openHardeningItems.length) {
  stageScope = "hardening";
  lines.push("当前阶段：提审前产品打磨。");
  lines.push("");
  lines.push("现在该做：");
  lines.push("1. 按 docs/humi-1.1-pre-review-hardening.md 逐项完成 P0/P1 功能和体验项。");
  if (shareEvidence?.missingFiles?.length) {
    lines.push(`2. 小程序分享复核当前只缺：${shareEvidence.missingFiles.join("、")}。`);
    lines.push("3. 运行 npm run release:pre-review:evidence 生成私有证据总览，确认征集单视觉图和 H5 落地页已齐。");
    lines.push("4. 运行 npm run release:wechat:share:doctor 确认开发者工具 CLI、证据目录、桌面活跃状态和缺图清单。");
    lines.push("5. 运行 npm run release:wechat:share:devtools 打开小程序项目、预览二维码和核对清单。");
    lines.push("6. 如 DevTools/H5 内分享入口不稳定，运行 npm run release:wechat:share:direct-previews 生成三张直达原生分享确认页二维码。");
    lines.push("7. 如缺 landing 图，先运行 npm run release:wechat:share:landings 自动补齐；如缺 card 图，推荐运行 npm run release:wechat:share:cards:capture -- --interactive 框选保存，或用 npm run release:wechat:share:cards:import 导入已有截图。");
    lines.push("8. 截图补齐后运行 npm run release:wechat:share:evidence，再运行 npm run release:wechat:share:complete 完成视觉确认和 P1 勾选。");
  } else {
    lines.push("2. 小程序分享截图证据已齐，运行 npm run release:wechat:share:complete 完成视觉确认和 P1 勾选。");
  }
  lines.push(`${shareEvidence?.missingFiles?.length ? 9 : 3}. P0/P1 全部完成后，再重新运行 npm run release:next 判断是否进入生产候选完善与内测验证阶段。`);
} else if (status.release?.releaseComplete) {
  stageScope = "complete";
  lines.push("当前阶段：1.1 已完成发布证据闭环。");
  lines.push("现在该做：更新 AI-HQ Humi STATUS 的最终发布时间、P0 结果和 24 小时监控结论。");
} else if (status.release?.engineeringGatesReady && !status.release?.candidateValidationReady) {
  stageScope = "candidate";
  lines.push("当前阶段：1.1 生产候选完善与内测验证，暂不进入微信审核。");
  lines.push("");
  if (candidateAction.dispatch) {
    if (candidateAction.dispatch.allUsersInvited) {
      lines.push("下一步一句话：今天分发单里的 U 编号已标记为已邀请；等待今天这批 U 编号的真实反馈，收到后替换分发单里的 record 模板并回填匿名结果。");
    } else if (candidateAction.dispatch.someUsersInvited) {
      lines.push(`下一步一句话：运行 \`npm run release:candidate:dispatch:workbench -- --date ${candidateAction.date}\`，只发送今日分发单里尚未标记已邀请的 U 编号；已邀请的 U 编号等待真实反馈并准备回填。`);
    } else {
      lines.push(`下一步一句话：运行 \`npm run release:candidate:dispatch:workbench -- --date ${candidateAction.date}\`，打开私有 HTML 工作台发送今天这些 U 编号；真实发送后再运行 \`npm run release:candidate:invite -- --from-dispatch ${candidateAction.date} --sent-confirmed\`。`);
    }
    lines.push("");
    if (candidateAction.dispatch.someUsersInvited) {
      lines.push("还没发：");
      for (const user of candidateAction.dispatch.pendingUsers) {
        lines.push(`- ${formatDispatchUser(user)}`);
      }
      lines.push("");
      lines.push("已发待回收：");
      for (const user of candidateAction.dispatch.invitedUsers) {
        lines.push(`- ${formatDispatchUser(user)}`);
      }
    } else {
      lines.push(candidateAction.dispatch.allUsersInvited ? "今天已发，待回收：" : "今天要发：");
      for (const user of candidateAction.dispatch.users) {
        lines.push(`- ${formatDispatchUser(user)}`);
      }
    }
    lines.push("");
  } else if (candidateAction.packetDir) {
    lines.push(`下一步一句话：已找到私有候选包 ${candidateAction.packetDir}，先运行 \`npm run release:candidate:dispatch -- --date ${candidateAction.date}\` 生成今日分发单。`);
    lines.push("");
  } else {
    lines.push("下一步一句话：先运行 `HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare` 生成私有候选包。");
    lines.push("");
  }
  lines.push("现在该做：");
  if (candidateAction.dispatch) {
    if (candidateAction.dispatch.allUsersInvited) {
      lines.push("1. 等待今天这批 U 编号的真实反馈，不要用已邀请状态当作已体验。");
      lines.push("2. 收到单个用户反馈后，替换分发单里的 `release:candidate:record` 模板，再回填匿名汇总；不要原样运行占位模板。");
      lines.push("3. 批量收齐后，优先填 `candidate-feedback-import.csv`，再运行 `npm run release:candidate:record -- --import candidate-feedback-import.csv`。");
      lines.push(`4. 一天结束运行 \`npm run release:candidate:day:close -- --date ${candidateAction.date}\`，一次完成隐私扫描、每日复盘、候选复盘和私有收尾报告。`);
      lines.push("5. 若出现 P0/P1，先修复或明确进入 1.1.x，再回到候选复盘；不要绕过内测直接审核。");
    } else if (candidateAction.dispatch.someUsersInvited) {
      lines.push(`1. 只发送“还没发”里的 U 编号：${candidateAction.dispatch.pendingUsers.map((user) => user.id).join("、")}。`);
      lines.push(`2. 发送后运行 \`npm run release:candidate:invite -- --users ${candidateAction.dispatch.pendingUsers.map((user) => user.id).join(",")} --date ${candidateAction.date} --sent-confirmed\`，只补标这批匿名 U 编号。`);
      lines.push("3. 已发待回收的 U 编号继续等待真实反馈；不要用已邀请状态当作已体验。");
      lines.push("4. 收到反馈后，替换分发单里的 `release:candidate:record` 模板或填 `candidate-feedback-import.csv`，再回填匿名汇总。");
      lines.push(`5. 一天结束运行 \`npm run release:candidate:day:close -- --date ${candidateAction.date}\`，一次完成隐私扫描、每日复盘、候选复盘和私有收尾报告。`);
    } else {
      lines.push(`1. 运行 \`npm run release:candidate:dispatch:workbench -- --date ${candidateAction.date}\`，打开私有 HTML 工作台逐条复制 U 编号对应的入口任务和体验者文案。`);
      lines.push(`2. 需要纯文本时再打开 \`${candidateAction.dispatch.markdownPath}\` 作为来源分发单。`);
      lines.push(`3. 真实发送后运行 \`npm run release:candidate:invite -- --from-dispatch ${candidateAction.date} --sent-confirmed\`，只标记匿名 U 编号，不记录真实联系人。`);
      lines.push("4. 收到反馈后，从工作台复制 `release:candidate:record` 模板，替换真实匿名结果再回填；不要原样运行占位模板。");
      lines.push(`5. 一天结束运行 \`npm run release:candidate:day:close -- --date ${candidateAction.date}\`，一次完成隐私扫描、每日复盘、候选复盘和私有收尾报告。`);
      lines.push("6. 若出现 P0/P1，先修复或明确进入 1.1.x，再回到候选复盘；不要绕过内测直接审核。");
    }
  } else {
    lines.push("1. 继续把 1.1 当作生产候选版本做真实内测和细节完善；当前不直接进入微信公众平台提交审核。");
    lines.push("2. 运行 HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare 生成或复用私有内测执行包。");
    lines.push("3. 运行 npm run release:candidate:forms:preview，打开 candidate-forms-preview.html 确认体验者反馈单和主厨记录单设计。");
    lines.push("4. 运行 npm run release:candidate:plan，生成 candidate-day-plan.md，明确今天邀哪些 U 编号、哪些人优先跑协作。");
    lines.push("5. 运行 npm run release:candidate:dispatch -- --date YYYY-MM-DD，生成只包含今天 U 编号的私有分发单。");
    lines.push("6. 运行 npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD，生成私有 HTML 工作台，直接复制体验者文案和回填模板。");
    lines.push("7. 运行 npm run release:candidate:desk，直接查看今天该打开哪些私有单据、发什么、回填什么。");
  }
  lines.push("");
  lines.push("固定护栏：");
  lines.push("- 运行 npm run release:candidate:doctor，看当前 U001-U020 真实反馈、核心路径完成和协作样本还差多少。");
  lines.push("- 运行 npm run release:candidate:privacy:check，确认私有候选包没有手机号、邮箱、微信号或真实姓名。");
  lines.push("- 工具回归用 npm run release:candidate:prepare:selftest、npm run release:candidate:forms:preview:selftest、npm run release:candidate:plan:selftest、npm run release:candidate:dispatch:selftest、npm run release:candidate:dispatch:workbench:selftest、npm run release:candidate:invite:selftest、npm run release:candidate:desk:selftest、npm run release:candidate:record:selftest、npm run release:candidate:daily:selftest、npm run release:candidate:day:close:selftest 和 npm run release:candidate:privacy:selftest。");
  lines.push("- 运行 npm run release:candidate:review，确认达到 10 个真实体验、8 个今晚菜单、8 个清单、3 个协作样本且无 P0/P1。");
  lines.push("- 候选复盘达标后，再由用户动作当下确认是否进入微信审核准备。");
} else if (wechat?.ok) {
  stageScope = "external";
  lines.push(`当前阶段：${nextStage.title}`);
  lines.push("");
  lines.push("现在该做：");
  nextStage.actions.forEach((action, index) => {
    lines.push(`${index + 1}. ${action}`);
  });
} else {
  stageScope = "blocked";
  lines.push("当前阶段：还不能提交微信审核。");
  lines.push("");
  lines.push("先修这些：");
  for (const action of status.nextActions ?? []) {
    lines.push(`- ${action}`);
  }
}

lines.push("");
lines.push("要打开的材料：");
for (const item of getMaterialList(stageScope)) {
  lines.push(`- ${item}`);
}
lines.push("");
lines.push(stageScope === "candidate" ? "候选阶段完成判定：" : "完成判定：");
for (const item of getCompletionCriteria(stageScope)) {
  lines.push(`- ${item}`);
}
lines.push("");

if (missingSections.length && stageScope !== "candidate") {
  lines.push("当前还缺的证据区块：");
  for (const section of missingSections) {
    lines.push(`- ${section}`);
  }
  lines.push("");
} else if (missingSections.length) {
  lines.push("候选通过后才处理的外部证据区块：");
  for (const section of missingSections) {
    lines.push(`- ${section}`);
  }
  lines.push("");
}

if (openHardeningItems.length) {
  lines.push("当前还未完成的 P0/P1 打磨项：");
  for (const item of openHardeningItems) {
    lines.push(`- ${item.replace(/^- \[ \] /, "")}`);
  }
  lines.push("");
}

console.log(lines.join("\n"));

async function runJsonScript(scriptName, { allowFailure }) {
  try {
    const { stdout } = await execFileAsync("npm", ["run", scriptName], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 6,
    });
    return parseLastJson(stdout);
  } catch (error) {
    if (!allowFailure) throw error;
    return parseLastJson(error.stdout || "");
  }
}

async function getCandidateActionState() {
  const date = new Date().toISOString().slice(0, 10);
  const privateBaseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
  const packetDir = await findLatestCandidatePacketDir(privateBaseDir);
  if (!packetDir) return { date, packetDir: null, dispatch: null };

  const markdownPath = join(packetDir, `candidate-dispatch-${date}.md`);
  const jsonPath = join(packetDir, `candidate-dispatch-${date}.json`);
  const workbenchPath = join(packetDir, `candidate-dispatch-workbench-${date}.html`);
  try {
    const content = await readFile(jsonPath, "utf8");
    await access(markdownPath);
    const parsed = JSON.parse(content);
    const statuses = await readCandidateInviteStatuses(packetDir);
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
    const allUsersInvited = users.length > 0
      && pendingUsers.length === 0;
    return {
      date,
      packetDir,
      dispatch: {
        markdownPath,
        jsonPath,
        workbenchPath,
        users,
        invitedUsers,
        pendingUsers,
        allUsersInvited,
        someUsersInvited: invitedUsers.length > 0 && pendingUsers.length > 0,
      },
    };
  } catch {
    return { date, packetDir, dispatch: null };
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

async function readCandidateInviteStatuses(packetDir) {
  try {
    const content = await readFile(join(packetDir, "anonymous-users.csv"), "utf8");
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

async function findLatestCandidatePacketDir(privateBaseDir) {
  try {
    const entries = await readdir(privateBaseDir, { withFileTypes: true });
    const latest = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("candidate-validation-"))
      .map((entry) => entry.name)
      .sort()
      .at(-1);
    return latest ? join(privateBaseDir, latest) : null;
  } catch {
    return null;
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

function getMaterialList(scope) {
  if (scope === "candidate") {
    return [
      "docs/humi-1.1-candidate-validation-forms.md",
      "docs/humi-1.1-pre-review-hardening.md",
      "npm run release:status",
      "npm run release:next",
      "npm run release:product:review",
      "npm run release:candidate:check",
      "npm run release:candidate:forms:preview",
      "npm run release:candidate:doctor",
      "npm run release:candidate:plan",
      "npm run release:candidate:dispatch",
      "npm run release:candidate:dispatch:workbench",
      "npm run release:candidate:invite",
      "npm run release:candidate:record",
      "npm run release:candidate:record:selftest",
      "npm run release:candidate:daily",
      "npm run release:candidate:day:close",
      "npm run release:candidate:privacy:check",
      "npm run release:candidate:privacy:selftest",
      "npm run release:candidate:review",
    ];
  }

  return [
    "docs/humi-1.1-closure-map.md",
    "npm run release:map",
    "docs/humi-1.1-pre-review-hardening.md",
    "docs/wechat-submit-copy-packet.md",
    "docs/humi-1.1-miniprogram-share-card-qa.md",
    "docs/miniprogram-platform-submit-runbook.md",
    "docs/humi-1.1-release-evidence-log.md",
    "docs/launch-day-runbook.md",
    "docs/humi-1.1-candidate-validation-forms.md",
    "npm run release:evidence:commands",
    "npm run release:pre-review:evidence",
    "npm run release:product:review",
    "npm run release:candidate:check",
    "npm run release:candidate:prepare",
    "npm run release:candidate:prepare:selftest",
    "npm run release:candidate:forms:preview",
    "npm run release:candidate:forms:preview:selftest",
    "npm run release:candidate:doctor",
    "npm run release:candidate:plan",
    "npm run release:candidate:plan:selftest",
    "npm run release:candidate:dispatch",
    "npm run release:candidate:dispatch:selftest",
    "npm run release:candidate:dispatch:workbench",
    "npm run release:candidate:dispatch:workbench:selftest",
    "npm run release:candidate:invite",
    "npm run release:candidate:invite:selftest",
    "npm run release:candidate:desk",
    "npm run release:candidate:desk:selftest",
    "npm run release:candidate:record",
    "npm run release:candidate:record:selftest",
    "npm run release:candidate:daily",
    "npm run release:candidate:daily:selftest",
    "npm run release:candidate:day:close",
    "npm run release:candidate:day:close:selftest",
    "npm run release:candidate:privacy:check",
    "npm run release:candidate:privacy:selftest",
    "npm run release:candidate:review",
    "npm run release:candidate:review:selftest",
    "npm run release:spec:audit",
    "npm run release:wechat:share:doctor",
    "npm run release:closure",
  ];
}

function getCompletionCriteria(scope) {
  const candidateCriteria = [
    "工程状态：npm run release:status 里的 release.engineeringGatesReady 必须为 true；真实候选复盘也通过后，release:status 才会 ok=true。",
    "生产候选内测：npm run release:candidate:check 会检查匿名灰度名单模板、反馈字段、P0/P1/P2 分级、1.1.x 判断标准和当前候选阶段口径。",
    "单据模板确认：docs/humi-1.1-candidate-validation-forms.md 固化体验者反馈单、主厨记录单、批量导入字段、每日复盘表和单据设计规则。",
    "单据设计预览：npm run release:candidate:forms:preview 会在私有包生成并打开 candidate-forms-preview.html，用来确认体验者反馈单、主厨记录单、导入字段和每日复盘规则。",
    "今日分发工作台：npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD 会在私有包生成 candidate-dispatch-workbench-YYYY-MM-DD.html，把逐个发送文案、回填模板和日结命令放进同一个可复制页面；它不会发送消息或标记邀请。",
    "单人/批量反馈回填：npm run release:candidate:record 写入前会做 PII 写入前阻断；P0/P1 会自动追加到 issue-triage.csv。",
    "真实体验复盘：npm run release:candidate:review 必须达到 10 个真实体验、8 个今晚菜单、8 个清单、3 个协作样本且无 P0/P1。",
    "隐私扫描：npm run release:candidate:privacy:check 必须确认最新私有候选包没有手机号、邮箱、微信号或真实姓名；发现问题时只报文件/类型/行号，不回显敏感值。",
    "候选复盘达标前只做功能完善、真实内测和问题修复，不进入微信公众平台审核。",
  ];

  if (scope === "candidate") {
    return candidateCriteria;
  }

  return [
    "提审前：docs/humi-1.1-pre-review-hardening.md 里 P0/P1 必须全部勾完。",
    "提交审核前：npm run release:wechat:check 必须 ok=true。",
    ...candidateCriteria.slice(0, 7),
    "每个外部阶段完成后：按 npm run release:evidence:commands 打印的模板登记证据。",
    "小程序卡片复核：npm run release:wechat:share:evidence 必须确认私有截图齐全。",
    "小程序卡片 QA 体检：npm run release:wechat:share:doctor 会确认微信开发者工具 CLI、证据目录、桌面活跃状态和缺图清单。",
    "提审前证据总览：npm run release:pre-review:evidence 会汇总征集单视觉图、H5 落地页图和微信原生 card 缺口。",
    "产品复核锚点：npm run release:product:review 会检查发现新菜、我的家问问大家、征集单模板、小程序卡片证据和微信审核确认护栏。",
    "1.1 真正完成：npm run release:evidence:check 必须 ok=true，且 release:status 里 releaseComplete=true。",
  ];
}

function getNextEvidenceStage(missing, submitEvidence) {
  if (missing.includes("## 4. 微信公众平台提交审核证据")) {
    if (submitEvidence.hasEvidence) {
      return {
        title: "微信提交截图已留存，下一步是登记提交审核证据。",
        actions: [
          `确认私有证据目录无误：${submitEvidence.sessionDir}`,
          "运行 npm run release:evidence:record:submit:latest，自动登记提交时间、审核中状态和私有截图位置。",
          "登记后运行 npm run release:next，行动卡应切到“等待并登记审核结果”。",
        ],
      };
    }

    return {
      title: "1.1 生产候选完善与内测验证，暂不进入微信审核。",
      actions: [
        "继续把 1.1 当作生产候选版本做产品复核、真机体验确认和灰度名单准备；当前不直接进入微信公众平台提交审核。",
        "运行 npm run release:product:review、npm run release:candidate:check 和 npm run release:spec:audit，确认发现新菜、我的家问问大家、征集单模板、小程序卡片、内测准备和三份策划书矩阵仍然闭环。",
        "运行 HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare 生成私有内测执行包；要直接打开目录时去掉该环境变量。",
        "运行 npm run release:candidate:forms:preview，打开 candidate-forms-preview.html 确认体验者反馈单、主厨记录单、导入字段和每日复盘规则。",
        "运行 npm run release:candidate:doctor，把当前真实样本、今晚菜单、清单和协作样本缺口看清楚。",
        "运行 npm run release:candidate:plan，生成 candidate-day-plan.md，按当前缺口确定今天先邀哪些 U 编号和哪些人优先跑协作。",
        "运行 npm run release:candidate:dispatch -- --date YYYY-MM-DD，生成只包含今天 U 编号的私有分发单，逐个复制给体验者。",
        "运行 npm run release:candidate:dispatch:workbench -- --date YYYY-MM-DD，生成私有 HTML 工作台，把逐个发送文案、回填模板和日结命令放在同一页。",
        "发送后运行 npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD --sent-confirmed，把匿名 U 编号标为已邀请，不记录真实联系人。",
        "收到单个体验者反馈后，替换分发单里的 record 模板并用 npm run release:candidate:record -- --user U001 ... 回填匿名汇总；一天结束时运行 npm run release:candidate:day:close -- --date YYYY-MM-DD 写入 daily-review.csv 和私有收尾报告。",
        "运行 npm run release:candidate:privacy:check，确认最新私有候选包没有手机号、邮箱、微信号或真实姓名。",
        "运行 npm run release:candidate:prepare:selftest、npm run release:candidate:forms:preview:selftest、npm run release:candidate:plan:selftest、npm run release:candidate:dispatch:selftest、npm run release:candidate:dispatch:workbench:selftest、npm run release:candidate:invite:selftest、npm run release:candidate:desk:selftest、npm run release:candidate:record:selftest、npm run release:candidate:daily:selftest、npm run release:candidate:day:close:selftest 和 npm run release:candidate:privacy:selftest 确认工具可用。",
        "内测结果写入私有执行包后，运行 npm run release:candidate:review 判断是否达到 10 个真实体验、8 个今晚菜单、8 个清单、3 个协作样本且无 P0/P1。",
        "运行 npm run release:wechat:check 只做只读预检，确认版本 1.1.59、域名、隐私保护指引、审核备注和证据目录仍可用。",
        "把需要用户确认的体验问题先在当前候选版本里继续修完；新增 P0/P1 时登记到 docs/humi-1.1-pre-review-hardening.md。",
        "只有用户明确说“现在进入微信审核”后，才运行 HUMI_WECHAT_REVIEW_ACTION_CONFIRMED=1 npm run release:wechat:prepare-submit 打开微信公众平台。",
        "真正提交审核后，再运行 npm run release:evidence:commands -- submit，按模板登记提交时间、状态和私有截图位置。",
      ],
    };
  }

  if (missing.includes("## 5. 审核结果证据")) {
    return {
      title: "微信审核已提交，下一步是等待并登记审核结果。",
      actions: [
        "等待微信公众平台给出 1.1.59 审核结果。",
        "结果出来后运行 npm run release:evidence:commands -- review，按模板登记通过或驳回结论。",
        "如果驳回，把后台原因摘要写入 docs/launch-feedback-and-101-backlog.md，再判断是否需要 1.1.x。",
      ],
    };
  }

  if (missing.includes("## 6. 审核通过后发布证据")) {
    return {
      title: "微信审核结果已登记，下一步是发布审核通过版本。",
      actions: [
        "如果审核结果是通过，进入微信公众平台版本管理，找到 1.1.59 并点击发布。",
        "保存发布状态截图到私有位置，不要提交后台截图到仓库。",
        "发布后运行 npm run release:evidence:commands -- publish，按模板登记发布时间、发布人和私有证据位置。",
      ],
    };
  }

  if (missing.includes("## 7. 发布后 P0 真机验收证据")) {
    return {
      title: "1.1.59 已发布，下一步是真机 P0 验收。",
      actions: [
        "用真实微信打开正式小程序，不只看开发者工具。",
        "按 docs/launch-day-runbook.md 跑【今晚】、问问大家、清单分享、我的家、重新登录等 P0 路径。",
        "P0 通过后运行 npm run release:evidence:commands -- p0，按模板登记设备、结果和私有证据位置。",
      ],
    };
  }

  if (missing.includes("## 8. 24 小时监控证据")) {
    return {
      title: "真机 P0 已登记，下一步是完成 24 小时监控。",
      actions: [
        "按 T+2h/T+6h/T+12h/T+24h 观察 H5、API、推荐、分享卡片、登录同步和用户反馈。",
        "24 小时窗口结束后运行 npm run release:evidence:commands -- monitor，按模板登记监控结论。",
        "最后运行 npm run release:evidence:check 和 npm run release:status，确认 releaseComplete=true。",
      ],
    };
  }

  return {
    title: "外部证据区块已填完，下一步是最终状态复核。",
    actions: [
      "运行 npm run release:evidence:check。",
      "运行 npm run release:status，确认 releaseComplete=true。",
      "更新 AI-HQ Humi STATUS 的最终发布时间、P0 结果和 24 小时监控结论。",
    ],
  };
}

async function getLatestSubmitEvidenceState() {
  try {
    const sessionDir = await findLatestWechatSubmitDir();
    const evidenceFiles = await listWechatSubmitEvidenceFiles(sessionDir);
    return { hasEvidence: evidenceFiles.length > 0, sessionDir };
  } catch {
    return { hasEvidence: false, sessionDir: "" };
  }
}

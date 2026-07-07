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

const lines = [];
lines.push("Humi 1.1 当前行动卡");
lines.push("");
lines.push(`检查时间：${new Date().toISOString()}`);
lines.push(`当前提交：${status.git?.head ?? "unknown"} / origin/main ${status.git?.originMain ?? "unknown"}`);
lines.push(`小程序版本：${status.release?.miniProgramUploadedVersion ?? "unknown"} / ${status.release?.miniProgramUploadDescription ?? "unknown"}`);
lines.push("");

if (openHardeningItems.length) {
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
  lines.push("当前阶段：1.1 已完成发布证据闭环。");
  lines.push("现在该做：更新 AI-HQ Humi STATUS 的最终发布时间、P0 结果和 24 小时监控结论。");
} else if (status.release?.engineeringGatesReady && !status.release?.candidateValidationReady) {
  lines.push("当前阶段：1.1 生产候选完善与内测验证，暂不进入微信审核。");
  lines.push("");
  if (candidateAction.dispatch) {
    if (candidateAction.dispatch.allUsersInvited) {
      lines.push("下一步一句话：今天分发单里的 U 编号已标记为已邀请；等待今天这批 U 编号的真实反馈，收到后替换分发单里的 record 模板并回填匿名结果。");
    } else if (candidateAction.dispatch.someUsersInvited) {
      lines.push("下一步一句话：继续发送今日分发单里尚未标记已邀请的 U 编号；已邀请的 U 编号等待真实反馈并准备回填。");
    } else {
      lines.push(`下一步一句话：打开 ${candidateAction.dispatch.markdownPath}，发送今天这些 U 编号；真实发送后再运行 \`npm run release:candidate:invite -- --from-dispatch ${candidateAction.date}\`。`);
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
      lines.push(`2. 发送后运行 \`npm run release:candidate:invite -- --users ${candidateAction.dispatch.pendingUsers.map((user) => user.id).join(",")} --date ${candidateAction.date}\`，只补标这批匿名 U 编号。`);
      lines.push("3. 已发待回收的 U 编号继续等待真实反馈；不要用已邀请状态当作已体验。");
      lines.push("4. 收到反馈后，替换分发单里的 `release:candidate:record` 模板或填 `candidate-feedback-import.csv`，再回填匿名汇总。");
      lines.push(`5. 一天结束运行 \`npm run release:candidate:day:close -- --date ${candidateAction.date}\`，一次完成隐私扫描、每日复盘、候选复盘和私有收尾报告。`);
    } else {
      lines.push(`1. 打开 \`${candidateAction.dispatch.markdownPath}\`，逐条复制 U 编号对应的入口任务和体验者文案。`);
      lines.push(`2. 真实发送后运行 \`npm run release:candidate:invite -- --from-dispatch ${candidateAction.date}\`，只标记匿名 U 编号，不记录真实联系人。`);
      lines.push("3. 收到反馈后，替换分发单里的 `release:candidate:record` 模板，再回填匿名汇总；不要原样运行占位模板。");
      lines.push(`4. 一天结束运行 \`npm run release:candidate:day:close -- --date ${candidateAction.date}\`，一次完成隐私扫描、每日复盘、候选复盘和私有收尾报告。`);
      lines.push("5. 若出现 P0/P1，先修复或明确进入 1.1.x，再回到候选复盘；不要绕过内测直接审核。");
    }
  } else {
    lines.push("1. 继续把 1.1 当作生产候选版本做真实内测和细节完善；当前不直接进入微信公众平台提交审核。");
    lines.push("2. 运行 HUMI_CANDIDATE_VALIDATION_NO_OPEN=1 npm run release:candidate:prepare 生成或复用私有内测执行包。");
    lines.push("3. 运行 npm run release:candidate:plan，生成 candidate-day-plan.md，明确今天邀哪些 U 编号、哪些人优先跑协作。");
    lines.push("4. 运行 npm run release:candidate:dispatch -- --date YYYY-MM-DD，生成只包含今天 U 编号的私有分发单。");
    lines.push("5. 运行 npm run release:candidate:desk，直接查看今天该打开哪些私有单据、发什么、回填什么。");
  }
  lines.push("");
  lines.push("固定护栏：");
  lines.push("- 运行 npm run release:candidate:doctor，看当前 U001-U020 真实反馈、核心路径完成和协作样本还差多少。");
  lines.push("- 运行 npm run release:candidate:privacy:check，确认私有候选包没有手机号、邮箱、微信号或真实姓名。");
  lines.push("- 工具回归用 npm run release:candidate:prepare:selftest、npm run release:candidate:plan:selftest、npm run release:candidate:dispatch:selftest、npm run release:candidate:invite:selftest、npm run release:candidate:desk:selftest、npm run release:candidate:record:selftest、npm run release:candidate:daily:selftest、npm run release:candidate:day:close:selftest 和 npm run release:candidate:privacy:selftest。");
  lines.push("- 运行 npm run release:candidate:review，确认达到 10 个真实体验、8 个今晚菜单、8 个清单、3 个协作样本且无 P0/P1。");
  lines.push("- 候选复盘达标后，再由用户动作当下确认是否进入微信审核准备。");
} else if (wechat?.ok) {
  lines.push(`当前阶段：${nextStage.title}`);
  lines.push("");
  lines.push("现在该做：");
  nextStage.actions.forEach((action, index) => {
    lines.push(`${index + 1}. ${action}`);
  });
} else {
  lines.push("当前阶段：还不能提交微信审核。");
  lines.push("");
  lines.push("先修这些：");
  for (const action of status.nextActions ?? []) {
    lines.push(`- ${action}`);
  }
}

lines.push("");
lines.push("要打开的材料：");
lines.push("- docs/humi-1.1-closure-map.md");
lines.push("- npm run release:map");
lines.push("- docs/humi-1.1-pre-review-hardening.md");
lines.push("- docs/wechat-submit-copy-packet.md");
lines.push("- docs/humi-1.1-miniprogram-share-card-qa.md");
lines.push("- docs/miniprogram-platform-submit-runbook.md");
lines.push("- docs/humi-1.1-release-evidence-log.md");
lines.push("- docs/launch-day-runbook.md");
lines.push("- docs/humi-1.1-candidate-validation-forms.md");
lines.push("- npm run release:evidence:commands");
lines.push("- npm run release:pre-review:evidence");
lines.push("- npm run release:product:review");
lines.push("- npm run release:candidate:check");
lines.push("- npm run release:candidate:prepare");
lines.push("- npm run release:candidate:prepare:selftest");
lines.push("- npm run release:candidate:doctor");
lines.push("- npm run release:candidate:plan");
lines.push("- npm run release:candidate:plan:selftest");
lines.push("- npm run release:candidate:dispatch");
lines.push("- npm run release:candidate:dispatch:selftest");
lines.push("- npm run release:candidate:invite");
lines.push("- npm run release:candidate:invite:selftest");
lines.push("- npm run release:candidate:desk");
lines.push("- npm run release:candidate:desk:selftest");
lines.push("- npm run release:candidate:record");
lines.push("- npm run release:candidate:record:selftest");
lines.push("- npm run release:candidate:daily");
lines.push("- npm run release:candidate:daily:selftest");
lines.push("- npm run release:candidate:day:close");
lines.push("- npm run release:candidate:day:close:selftest");
lines.push("- npm run release:candidate:privacy:check");
lines.push("- npm run release:candidate:privacy:selftest");
lines.push("- npm run release:candidate:review");
lines.push("- npm run release:candidate:review:selftest");
lines.push("- npm run release:spec:audit");
lines.push("- npm run release:wechat:share:doctor");
lines.push("- npm run release:closure");
lines.push("");
lines.push("完成判定：");
lines.push("- 提审前：docs/humi-1.1-pre-review-hardening.md 里 P0/P1 必须全部勾完。");
lines.push("- 提交审核前：npm run release:wechat:check 必须 ok=true。");
lines.push("- 工程状态：npm run release:status 里的 release.engineeringGatesReady 必须为 true；真实候选复盘也通过后，release:status 才会 ok=true。");
lines.push("- 每个外部阶段完成后：按 npm run release:evidence:commands 打印的模板登记证据。");
lines.push("- 小程序卡片复核：npm run release:wechat:share:evidence 必须确认私有截图齐全。");
lines.push("- 小程序卡片 QA 体检：npm run release:wechat:share:doctor 会确认微信开发者工具 CLI、证据目录、桌面活跃状态和缺图清单。");
lines.push("- 提审前证据总览：npm run release:pre-review:evidence 会汇总征集单视觉图、H5 落地页图和微信原生 card 缺口。");
lines.push("- 产品复核锚点：npm run release:product:review 会检查发现新菜、我的家问问大家、征集单模板、小程序卡片证据和微信审核确认护栏。");
lines.push("- 生产候选内测：npm run release:candidate:check 会检查匿名灰度名单模板、反馈字段、P0/P1/P2 分级、1.1.x 判断标准和当前候选阶段口径。");
lines.push("- 生成内测执行包：npm run release:candidate:prepare 会在私有目录生成匿名名单 CSV、反馈表、每日复盘、问题分级表和邀请文案；真实用户信息不得进仓库。");
lines.push("- 执行包生成自测：npm run release:candidate:prepare:selftest 会用临时私有目录确认候选包文件、权限、README 步骤、U001-U020 和空模板复盘状态。");
lines.push("- 批量邀请清单：release:candidate:prepare 会生成 outreach-batch.md，可直接复制 U001-U020 的匿名邀请消息。");
lines.push("- 候选反馈单据：release:candidate:prepare 还会生成 tester-feedback-form.md 和 host-run-sheet.md，用来分别收体验者原话和执行人观察。");
lines.push("- 单据模板确认：docs/humi-1.1-candidate-validation-forms.md 固化体验者反馈单、主厨记录单、批量导入字段、每日复盘表和单据设计规则。");
lines.push("- 候选日计划：npm run release:candidate:plan 会在私有包生成 candidate-day-plan.md，列出今天建议邀请、需要追问、必跑【今晚】/清单和优先协作的 U 编号。");
lines.push("- 候选日计划自测：npm run release:candidate:plan:selftest 会用临时私有包确认日计划能选出追问用户、下一批邀请用户和协作目标。");
lines.push("- 今日分发单：npm run release:candidate:dispatch -- --date YYYY-MM-DD 会在私有包生成 candidate-dispatch-YYYY-MM-DD.md/json，只抽今天计划里的 U 编号、对应邀请文案、反馈摘要和回填模板。");
lines.push("- 今日分发单自测：npm run release:candidate:dispatch:selftest 会用临时私有包确认分发单能按日计划抽取文案且保留隐私/审核护栏。");
lines.push("- 邀请状态标记：npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD 会把当天分发单中的匿名 U 编号标为已邀请，不记录真实联系人，也不生成体验反馈。");
lines.push("- 邀请状态标记自测：npm run release:candidate:invite:selftest 会用临时私有包确认只更新匿名邀请状态，dry-run 不写入。");
lines.push("- 候选执行台：npm run release:candidate:desk 会把今天要打开的私有包文件、回填命令和不要做的事打印成一张执行卡。");
lines.push("- 候选执行台自测：npm run release:candidate:desk:selftest 会用临时私有执行包确认执行台可读包、可打印今日动作和隐私/审核护栏。");
lines.push("- 单人反馈回填：替换分发单里的 npm run release:candidate:record 模板后运行，会把真实匿名汇总写回最新私有执行包，并在写入前拒绝手机号、邮箱、微信号和真实姓名。");
lines.push("- 批量反馈导入：填好私有包里的 candidate-feedback-import.csv 后，npm run release:candidate:record -- --import candidate-feedback-import.csv 会一次回填多位匿名用户；P0/P1 会自动追加到 issue-triage.csv。");
lines.push("- 回填工具自测：npm run release:candidate:record:selftest 会用临时私有执行包确认 anonymous-users.csv、feedback-template.csv、issue-triage.csv 写入逻辑和 PII 写入前阻断。");
lines.push("- 每日复盘回填：npm run release:candidate:daily -- --date YYYY-MM-DD 会按当天匿名反馈自动写入 daily-review.csv。");
lines.push("- 每日复盘自测：npm run release:candidate:daily:selftest 会用临时私有执行包确认 daily-review.csv 写入逻辑。");
lines.push("- 每日收尾：npm run release:candidate:day:close -- --date YYYY-MM-DD 会在私有包写入 candidate-day-close-YYYY-MM-DD.md/json，并串起隐私扫描、daily-review、doctor 和 candidate review。");
lines.push("- 每日收尾自测：npm run release:candidate:day:close:selftest 会确认收尾报告不会伪造 candidateValidationReady。");
lines.push("- 隐私扫描：npm run release:candidate:privacy:check 会扫描最新私有候选包，发现手机号、邮箱、微信号或真实姓名时只报文件/类型/行号，不回显敏感值。");
lines.push("- 隐私扫描自测：npm run release:candidate:privacy:selftest 会确认匿名包可通过、含敏感值的临时包会失败且输出不泄露敏感值。");
lines.push("- 查看内测缺口：npm run release:candidate:doctor 会把真实样本、今晚菜单、清单和协作样本的当前进度与缺口打印成人能读的行动卡。");
lines.push("- 复盘内测结果：npm run release:candidate:review 会读取最新私有执行包，汇总 P0/P1、核心链路完成和是否可继续审核准备。");
lines.push("- 复盘工具自测：npm run release:candidate:review:selftest 会用临时 CSV 覆盖空模板、样本不足、P1 阻断和有效反馈通过四种路径。");
lines.push("- 小程序卡片收口：npm run release:wechat:share:complete 会在人工视觉确认后勾选提审前 P1。");
lines.push("- 补小程序截图前：npm run release:wechat:share:prepare 会打开预览二维码和私有证据目录。");
lines.push("- 补 H5 落地页截图：npm run release:wechat:share:landings 会自动生成 crave/invite/grocery 三张 landing 图。");
lines.push("- 打开开发者工具 QA：npm run release:wechat:share:devtools 会打开小程序项目、预览二维码和核对清单。");
lines.push("- 生成直达原生确认页二维码：npm run release:wechat:share:direct-previews 会生成 crave/invite/grocery 三张 direct-preview 二维码。");
lines.push("- 补微信原生卡片截图：npm run release:wechat:share:cards:capture -- --interactive 会逐项等待卡片预览，并让你框选卡片区域保存正确文件名。");
lines.push("- 导入已有卡片截图：npm run release:wechat:share:cards:import -- --source-dir /path/to/screenshots 会复制并校验三张 card 图。");
lines.push("- 1.1 真正完成：npm run release:evidence:check 必须 ok=true，且 release:status 里 releaseComplete=true。");
lines.push("");

if (missingSections.length) {
  lines.push("当前还缺的证据区块：");
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
        "运行 npm run release:candidate:doctor，把当前真实样本、今晚菜单、清单和协作样本缺口看清楚。",
        "运行 npm run release:candidate:plan，生成 candidate-day-plan.md，按当前缺口确定今天先邀哪些 U 编号和哪些人优先跑协作。",
        "运行 npm run release:candidate:dispatch -- --date YYYY-MM-DD，生成只包含今天 U 编号的私有分发单，逐个复制给体验者。",
        "发送后运行 npm run release:candidate:invite -- --from-dispatch YYYY-MM-DD，把匿名 U 编号标为已邀请，不记录真实联系人。",
        "收到单个体验者反馈后，替换分发单里的 record 模板并用 npm run release:candidate:record -- --user U001 ... 回填匿名汇总；一天结束时运行 npm run release:candidate:day:close -- --date YYYY-MM-DD 写入 daily-review.csv 和私有收尾报告。",
        "运行 npm run release:candidate:privacy:check，确认最新私有候选包没有手机号、邮箱、微信号或真实姓名。",
        "运行 npm run release:candidate:prepare:selftest、npm run release:candidate:plan:selftest、npm run release:candidate:dispatch:selftest、npm run release:candidate:invite:selftest、npm run release:candidate:desk:selftest、npm run release:candidate:record:selftest、npm run release:candidate:daily:selftest、npm run release:candidate:day:close:selftest 和 npm run release:candidate:privacy:selftest 确认工具可用。",
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

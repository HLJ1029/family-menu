import { execFile } from "node:child_process";
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
    lines.push("3. 如缺 landing 图，先运行 npm run release:wechat:share:landings 自动补齐；如缺 card 图，可运行 npm run release:wechat:share:cards:capture 辅助保存，或用 npm run release:wechat:share:cards:import 导入已有截图。");
    lines.push("4. 截图补齐后运行 npm run release:wechat:share:evidence，再运行 npm run release:wechat:share:complete 完成视觉确认和 P1 勾选。");
  } else {
    lines.push("2. 小程序分享截图证据已齐，运行 npm run release:wechat:share:complete 完成视觉确认和 P1 勾选。");
  }
  lines.push(`${shareEvidence?.missingFiles?.length ? 5 : 3}. P0/P1 全部完成后，再重新运行 npm run release:next 判断是否进入微信审核准备。`);
} else if (status.release?.releaseComplete) {
  lines.push("当前阶段：1.1 已完成发布证据闭环。");
  lines.push("现在该做：更新 AI-HQ Humi STATUS 的最终发布时间、P0 结果和 24 小时监控结论。");
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
lines.push("- docs/humi-1.1-pre-review-hardening.md");
lines.push("- docs/wechat-submit-copy-packet.md");
lines.push("- docs/humi-1.1-miniprogram-share-card-qa.md");
lines.push("- docs/miniprogram-platform-submit-runbook.md");
lines.push("- docs/humi-1.1-release-evidence-log.md");
lines.push("- docs/launch-day-runbook.md");
lines.push("- npm run release:evidence:commands");
lines.push("- npm run release:closure");
lines.push("");
lines.push("完成判定：");
lines.push("- 提审前：docs/humi-1.1-pre-review-hardening.md 里 P0/P1 必须全部勾完。");
lines.push("- 提交审核前：npm run release:wechat:check 必须 ok=true。");
lines.push("- 工程状态：npm run release:status 必须 ok=true。");
lines.push("- 每个外部阶段完成后：按 npm run release:evidence:commands 打印的模板登记证据。");
lines.push("- 小程序卡片复核：npm run release:wechat:share:evidence 必须确认私有截图齐全。");
lines.push("- 小程序卡片收口：npm run release:wechat:share:complete 会在人工视觉确认后勾选提审前 P1。");
lines.push("- 补小程序截图前：npm run release:wechat:share:prepare 会打开预览二维码和私有证据目录。");
lines.push("- 补 H5 落地页截图：npm run release:wechat:share:landings 会自动生成 crave/invite/grocery 三张 landing 图。");
lines.push("- 补微信原生卡片截图：npm run release:wechat:share:cards:capture 会逐项等待卡片预览并保存正确文件名。");
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
      title: "工程侧已可提交微信审核，下一步是平台提交审核。",
      actions: [
        "运行 npm run release:wechat:prepare-submit，打开微信公众平台、证据目录并复制审核备注。",
        "进入 Humi 小程序版本管理。",
        "找到已上传版本 1.1.55，描述为“征集单模板与分享卡片”。",
        "核对 request 合法域名 api.humi-home.com、web-view 业务域名 www.humi-home.com、隐私保护指引。",
        "按 docs/wechat-submit-copy-packet.md 填审核备注并提交审核。",
        "提交后运行 npm run release:evidence:commands -- submit，按模板登记提交时间、状态和私有截图位置。",
      ],
    };
  }

  if (missing.includes("## 5. 审核结果证据")) {
    return {
      title: "微信审核已提交，下一步是等待并登记审核结果。",
      actions: [
        "等待微信公众平台给出 1.1.55 审核结果。",
        "结果出来后运行 npm run release:evidence:commands -- review，按模板登记通过或驳回结论。",
        "如果驳回，把后台原因摘要写入 docs/launch-feedback-and-101-backlog.md，再判断是否需要 1.1.x。",
      ],
    };
  }

  if (missing.includes("## 6. 审核通过后发布证据")) {
    return {
      title: "微信审核结果已登记，下一步是发布审核通过版本。",
      actions: [
        "如果审核结果是通过，进入微信公众平台版本管理，找到 1.1.55 并点击发布。",
        "保存发布状态截图到私有位置，不要提交后台截图到仓库。",
        "发布后运行 npm run release:evidence:commands -- publish，按模板登记发布时间、发布人和私有证据位置。",
      ],
    };
  }

  if (missing.includes("## 7. 发布后 P0 真机验收证据")) {
    return {
      title: "1.1.55 已发布，下一步是真机 P0 验收。",
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

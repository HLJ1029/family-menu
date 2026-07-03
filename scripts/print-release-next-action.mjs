import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const status = await runJsonScript("release:status", { allowFailure: false });
const wechat = await runJsonScript("release:wechat:check", { allowFailure: true });

const lines = [];
lines.push("Humi 1.1 当前行动卡");
lines.push("");
lines.push(`检查时间：${new Date().toISOString()}`);
lines.push(`当前提交：${status.git?.head ?? "unknown"} / origin/main ${status.git?.originMain ?? "unknown"}`);
lines.push(`小程序版本：${status.release?.miniProgramUploadedVersion ?? "unknown"} / ${status.release?.miniProgramUploadDescription ?? "unknown"}`);
lines.push("");

if (status.release?.releaseComplete) {
  lines.push("当前阶段：1.1 已完成发布证据闭环。");
  lines.push("现在该做：更新 AI-HQ Humi STATUS 的最终发布时间、P0 结果和 24 小时监控结论。");
} else if (wechat?.ok) {
  lines.push("当前阶段：工程侧已可提交微信审核，但还没完成外部发布证据。");
  lines.push("");
  lines.push("现在该做：");
  lines.push("1. 打开微信公众平台，进入 Humi 小程序版本管理。");
  lines.push("2. 找到已上传版本 1.1.54，描述为“征集加入状态同步”。");
  lines.push("3. 核对 request 合法域名 api.humi-home.com、web-view 业务域名 www.humi-home.com、隐私保护指引。");
  lines.push("4. 按 docs/wechat-submit-copy-packet.md 填审核备注并提交审核。");
  lines.push("5. 提交后运行 npm run release:evidence:commands -- submit，按模板登记提交时间、状态和私有截图位置。");
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
lines.push("- docs/wechat-submit-copy-packet.md");
lines.push("- docs/miniprogram-platform-submit-runbook.md");
lines.push("- docs/humi-1.1-release-evidence-log.md");
lines.push("- docs/launch-day-runbook.md");
lines.push("- npm run release:evidence:commands");
lines.push("");
lines.push("完成判定：");
lines.push("- 提交审核前：npm run release:wechat:check 必须 ok=true。");
lines.push("- 工程状态：npm run release:status 必须 ok=true。");
lines.push("- 1.1 真正完成：npm run release:evidence:check 必须 ok=true，且 release:status 里 releaseComplete=true。");
lines.push("");

const evidenceCheck = status.checks?.find((check) => check.name === "release:evidence:check");
if (evidenceCheck?.data?.missing?.length) {
  lines.push("当前还缺的证据区块：");
  for (const item of evidenceCheck.data.missing) {
    lines.push(`- ${item.section}`);
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

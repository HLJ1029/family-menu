import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const status = await runJsonScript("release:status", { allowFailure: true });
const next = await runTextScript("release:next", { allowFailure: true });

const release = status?.release ?? {};
const failedChecks = status?.checks?.filter((check) => !check.ok).map((check) => check.name) ?? [];
const missingEvidence = status?.checks
  ?.find((check) => check.name === "release:evidence:check")
  ?.data
  ?.missing
  ?.map((item) => item.section) ?? [];

const report = {
  ok: Boolean(status?.ok && release.releaseComplete),
  checkedAt: new Date().toISOString(),
  commit: {
    head: status?.git?.head ?? "unknown",
    originMain: status?.git?.originMain ?? "unknown",
    clean: Boolean(status?.git?.clean),
    syncedToOriginMain: Boolean(status?.git?.syncedToOriginMain),
  },
  release: {
    engineeringReady: Boolean(status?.ok),
    onlineReady: Boolean(release.onlineReady),
    productionMonitorOk: Boolean(release.productionMonitorOk),
    apiDeployReady: Boolean(release.apiDeployReady),
    securityAuditReady: Boolean(release.securityAuditReady),
    artifactsReady: Boolean(release.artifactsReady),
    releaseEvidenceReady: Boolean(release.releaseEvidenceReady),
    releaseComplete: Boolean(release.releaseComplete),
    miniProgramUploadedVersion: release.miniProgramUploadedVersion ?? "unknown",
    miniProgramUploadDescription: release.miniProgramUploadDescription ?? "unknown",
  },
  failedChecks,
  missingEvidence,
  nextActionSummary: extractCurrentStage(next.stdout),
  nextActions: status?.nextActions ?? [],
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  console.error("");
  console.error("Humi 1.1 还不能宣布正式发布完成。");
  console.error("请先按 npm run release:next 的当前阶段完成外部动作，并补齐发布证据。");
  process.exit(1);
}

async function runJsonScript(scriptName, { allowFailure }) {
  const result = await runTextScript(scriptName, { allowFailure });
  return parseLastJson(result.stdout);
}

async function runTextScript(scriptName, { allowFailure }) {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName], {
      env: process.env,
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 10,
    });
    return { stdout, stderr };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
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

function extractCurrentStage(output) {
  const line = String(output || "")
    .split("\n")
    .find((item) => item.startsWith("当前阶段："));
  return line ? line.replace("当前阶段：", "").trim() : "unknown";
}

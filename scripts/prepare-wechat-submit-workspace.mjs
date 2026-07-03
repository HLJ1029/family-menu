import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import {
  findLatestWechatSubmitDir,
  listWechatSubmitEvidenceFiles,
} from "./wechat-submit-evidence-session.mjs";
import { reviewNote } from "./wechat-submit-copy-data.mjs";

const execFileAsync = promisify(execFile);

if (platform() !== "darwin") {
  throw new Error("release:wechat:prepare-submit currently supports macOS open/pbcopy only.");
}

const { sessionDir, reused } = await getOrCreateSessionDir();
await writeToCommand("pbcopy", [], reviewNote);
await execFileAsync("open", ["https://mp.weixin.qq.com/"], { timeout: 10_000 });
await execFileAsync("open", [sessionDir], { timeout: 10_000 });

const lines = [
  "Humi 1.1 微信提审工作台已打开",
  "",
  `私有证据目录：${sessionDir}`,
  `目录状态：${reused ? "复用最新未留证目录" : "新建目录"}`,
  "微信公众平台：https://mp.weixin.qq.com/",
  "审核备注：已复制到系统剪贴板",
  "",
  "接下来在微信公众平台完成：",
  "1. 进入 Humi 小程序版本管理。",
  "2. 找到 1.1.55 / 征集单模板与分享卡片。",
  "3. 核对 request 域名 api.humi-home.com、web-view 域名 www.humi-home.com、隐私保护指引。",
  "4. 粘贴审核备注并提交审核。",
  "5. 把后台截图放入上面的私有证据目录。",
  "",
  "提交审核后登记：",
  "npm run release:evidence:commands -- submit",
];

console.log(lines.join("\n"));

async function getOrCreateSessionDir() {
  const latestDir = await findLatestWechatSubmitDir().catch(() => "");
  if (latestDir) {
    const evidenceFiles = await listWechatSubmitEvidenceFiles(latestDir).catch(() => []);
    if (!evidenceFiles.length) {
      return { sessionDir: latestDir, reused: true };
    }
  }

  const { stdout } = await execFileAsync("npm", ["run", "release:wechat:start-submit"], {
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
  });

  return { sessionDir: parseSessionDir(stdout), reused: false };
}

function parseSessionDir(output) {
  const match = String(output).match(/私有证据目录：(.+)/);
  if (!match?.[1]) {
    throw new Error("Could not parse private evidence directory from release:wechat:start-submit output.");
  }
  return match[1].trim();
}

function writeToCommand(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} failed with code ${code ?? "null"} signal ${signal ?? "null"}${stderr ? `: ${stderr}` : ""}`));
    });
    child.stdin.end(input);
  });
}

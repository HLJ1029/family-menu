import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const now = new Date();
const stamp = formatStamp(now);
const baseDir = process.env.HUMI_PRIVATE_EVIDENCE_DIR || join(homedir(), ".humi-release-evidence");
const sessionDir = join(baseDir, `wechat-submit-1.1.55-${stamp}`);
const readmePath = join(sessionDir, "README.md");

await mkdir(sessionDir, { recursive: true, mode: 0o700 });
await writeFile(readmePath, buildReadme(sessionDir), { mode: 0o600 });
await chmod(sessionDir, 0o700);
await chmod(readmePath, 0o600);

const lines = [
  "Humi 1.1 微信提交会话已准备好",
  "",
  `私有证据目录：${sessionDir}`,
  `本地清单：${readmePath}`,
  "",
  "先执行：",
  "1. npm run release:wechat:copy",
  "2. 打开微信公众平台，提交 1.1.55 审核。",
  "3. 把截图/录屏放入上面的私有证据目录。",
  "",
  "提交审核后，用下面模板登记证据：",
  "```bash",
  `HUMI_WECHAT_SUBMIT_TIME='${formatHumanTime(now)}' \\`,
  "HUMI_WECHAT_SUBMITTER='honglijie' \\",
  "HUMI_WECHAT_REVIEW_STATUS='审核中' \\",
  `HUMI_WECHAT_EVIDENCE_LOCATION='private://${sessionDir}' \\`,
  "npm run release:evidence:record:submit",
  "```",
  "",
  "登记后检查：",
  "```bash",
  "npm run release:next",
  "npm run release:complete:check",
  "```",
];

console.log(lines.join("\n"));

function buildReadme(dir) {
  return `# Humi 1.1 微信提交私有证据

生成时间：${formatHumanTime(now)}
提交版本：1.1.55 / 征集单模板与分享卡片
私有目录：${dir}

本目录用于保存微信公众平台后台截图、录屏或审核提交证据。不要把本目录内容提交到 Git 仓库。

## 提交前核对

- [ ] 版本管理中能看到上传版本 1.1.55，描述为“征集单模板与分享卡片”
- [ ] request 合法域名包含 https://api.humi-home.com
- [ ] web-view 业务域名包含 https://www.humi-home.com
- [ ] 隐私保护指引覆盖微信身份标识、手机号、家庭人数、忌口、菜单、清单、感觉征集和使用事件
- [ ] 审核备注使用 docs/wechat-submit-copy-packet.md
- [ ] 测试账号填写“无需账号，打开即可体验核心功能”，除非后台强制要求

## 建议保存文件

- [ ] humi-1.1.55-version-list.png
- [ ] humi-request-domain-api.png
- [ ] humi-webview-domain-www.png
- [ ] humi-privacy-settings.png
- [ ] humi-review-submit-note.png
- [ ] humi-review-submitted.png

## 提交后登记模板

\`\`\`bash
HUMI_WECHAT_SUBMIT_TIME='${formatHumanTime(now)}' \\
HUMI_WECHAT_SUBMITTER='honglijie' \\
HUMI_WECHAT_REVIEW_STATUS='审核中' \\
HUMI_WECHAT_EVIDENCE_LOCATION='private://${dir}' \\
npm run release:evidence:record:submit
\`\`\`

## 后续命令

\`\`\`bash
npm run release:next
npm run release:complete:check
\`\`\`
`;
}

function formatStamp(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}T${value.hour}${value.minute}${value.second}`;
}

function formatHumanTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute} CST`;
}

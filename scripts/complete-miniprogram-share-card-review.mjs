import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HARDENING_PATH = process.env.HUMI_PRE_REVIEW_HARDENING_PATH || "docs/humi-1.1-pre-review-hardening.md";
const P1_OPEN = "- [ ] P1 小程序卡片分享复核：`crave`、`invite`、`grocery` 三类分享在小程序内都有明确标题、token 落地和免登录参与路径。";
const P1_DONE = "- [x] P1 小程序卡片分享复核：`crave`、`invite`、`grocery` 三类分享在小程序内都有明确标题、token 落地和免登录参与路径。";

const evidence = await runShareEvidenceCheck();
if (!evidence.ok) {
  console.error("Mini program share card evidence is not complete yet.");
  console.error(JSON.stringify(evidence.data ?? evidence, null, 2));
  process.exit(1);
}
if (!evidence.data?.ok || !Array.isArray(evidence.data.requiredFiles)) {
  console.error("Mini program share card evidence check did not return a usable result.");
  console.error(JSON.stringify(evidence, null, 2));
  process.exit(1);
}

const confirmed = await confirmVisualReview(evidence.data);
if (!confirmed) {
  console.error("Visual review was not confirmed. Keeping the P1 item open.");
  process.exit(1);
}

const content = await readFile(HARDENING_PATH, "utf8");
if (content.includes(P1_DONE)) {
  console.log(JSON.stringify({
    ok: true,
    alreadyComplete: true,
    hardeningPath: HARDENING_PATH,
    evidenceDir: evidence.data.evidenceDir,
    message: "P1 share card review is already marked complete.",
  }, null, 2));
  process.exit(0);
}
if (!content.includes(P1_OPEN)) {
  throw new Error(`Unable to find the open P1 share card review item in ${HARDENING_PATH}.`);
}

const updated = content.replace(P1_OPEN, P1_DONE);
await writeFile(HARDENING_PATH, updated);

console.log(JSON.stringify({
  ok: true,
  hardeningPath: HARDENING_PATH,
  evidenceDir: evidence.data.evidenceDir,
  requiredFiles: evidence.data.requiredFiles.map((item) => ({
    file: item.file,
    size: item.size,
    image: item.image,
    sha256: item.sha256,
  })),
  nextActions: [
    "Run npm run release:next to confirm the workflow advances to WeChat review preparation.",
    "Run npm run release:wechat:check before any platform submission.",
    "Do not submit WeChat review until the user confirms the platform action.",
  ],
}, null, 2));

async function runShareEvidenceCheck() {
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "release:wechat:share:evidence"], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return {
      ok: true,
      stdout,
      stderr,
      data: parseLastJson(stdout),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
      error: error.message,
      data: parseLastJson(error.stdout || ""),
    };
  }
}

async function confirmVisualReview(data) {
  if (process.env.HUMI_SHARE_CARD_VISUAL_CONFIRMED === "1") return true;
  if (!process.stdin.isTTY) {
    console.error("Set HUMI_SHARE_CARD_VISUAL_CONFIRMED=1 after visually confirming all three native share card screenshots.");
    return false;
  }

  const files = data.requiredFiles
    .filter((item) => item.key.endsWith("-card"))
    .map((item) => `${item.file} (${item.image.width}x${item.image.height}, ${item.size} bytes)`)
    .join("\n- ");
  console.log([
    "确认前请打开私有证据目录，逐张看过三张微信原生分享卡片：",
    `- ${files}`,
    "",
    "确认标准：标题、卡片类型、token 入口和免登录落地路径均符合 docs/humi-1.1-miniprogram-share-card-qa.md。",
  ].join("\n"));

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("已视觉确认三张原生卡片正确？输入 yes 继续：");
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
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

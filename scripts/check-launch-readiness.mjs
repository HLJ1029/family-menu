import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));
const checkOnline = args.has("--online");
const execFileAsync = promisify(execFile);

const failures = [];
const warnings = [];

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

const placeholderPattern = /\[(?:待|正式提交前|创建后|后台确认后|需要时创建)[^\]]*\]/g;

function assertNoPlaceholders(path) {
  const text = readText(path);
  const placeholders = [...new Set(text.match(placeholderPattern) || [])];
  for (const placeholder of placeholders) {
    fail(`${path} still contains placeholder: ${placeholder}`);
  }
}

function assertContains(path, value) {
  const text = readText(path);
  if (!text.includes(value)) {
    fail(`${path} must contain ${value}`);
  }
}

function isWechatLoginEnabled() {
  const text = readText("miniprogram/utils/config.js");
  return /HUMI_WECHAT_LOGIN_ENABLED\s*=\s*true/.test(text);
}

function checkWechatLoginRequired() {
  if (!isWechatLoginEnabled()) {
    fail("WeChat login must be enabled before real launch. Set HUMI_WECHAT_LOGIN_ENABLED to true.");
  }
}

function checkMiniProgramConfig() {
  const config = JSON.parse(readText("miniprogram/project.config.json"));
  if (config.appid === "wx3acc29804cbb265f") {
    fail("miniprogram/project.config.json still uses the test AppID.");
  }
  if (!config.appid || config.appid === "正式小程序 AppID") {
    fail("miniprogram/project.config.json must use the formal Mini Program AppID.");
  }
  if (config.setting?.urlCheck !== true) {
    fail("miniprogram/project.config.json must set setting.urlCheck to true for release.");
  }
  if (config.setting?.uploadWithSourceMap !== false) {
    warn("miniprogram/project.config.json should set setting.uploadWithSourceMap to false for release.");
  }
}

function checkWechatDomainVerification() {
  const publicDir = join(root, "public");
  const hasVerificationFile = existsSync(publicDir)
    && readdirSync(publicDir).some((name) => /^MP_verify_[A-Za-z0-9]+\.txt$/.test(name));
  if (!hasVerificationFile) {
    fail("public/ is missing the WeChat business domain verification file: MP_verify_*.txt");
  }
}

async function checkUrl(url) {
  try {
    const result = await requestUrlWithCurl(url);
    if (result.statusCode >= 400 || result.statusCode < 200) {
      fail(`${url} returned HTTP ${result.statusCode}.`);
    }
  } catch (error) {
    fail(`${url} is not reachable: ${error.message}`);
  }
}

async function requestUrlWithCurl(url) {
  const { stdout } = await execFileAsync("curl", ["-fsSIL", "--max-time", "15", "-o", "/dev/null", "-w", "%{http_code}", url]);
  const statusCode = Number(stdout.trim());
  if (!statusCode) {
    throw new Error("curl did not return an HTTP status.");
  }
  return { statusCode };
}

async function main() {
  assertNoPlaceholders("public/privacy.html");
  assertNoPlaceholders("public/terms.html");
  assertNoPlaceholders("docs/miniprogram-review-materials.md");

  assertContains("miniprogram/utils/config.js", "https://www.humi-home.com/?channel=wechat-miniprogram");
  assertContains("miniprogram/utils/config.js", "https://api.humi-home.com");
  assertContains("index.html", "id=\"humi-boot-fallback\"");
  assertContains("index.html", "humi-boot-fallback__retry");
  checkWechatLoginRequired();
  checkMiniProgramConfig();
  checkWechatDomainVerification();

  if (checkOnline) {
    await checkUrl("https://www.humi-home.com/");
    await checkUrl("https://www.humi-home.com/privacy.html");
    await checkUrl("https://www.humi-home.com/terms.html");
    await checkUrl("https://api.humi-home.com/health");
  }

  for (const message of warnings) {
    console.warn(`WARN ${message}`);
  }

  if (failures.length > 0) {
    console.error("Launch readiness check failed:");
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("Launch readiness check passed.");
}

main();

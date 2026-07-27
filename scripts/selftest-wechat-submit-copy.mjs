import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const declaration = JSON.parse(readFileSync("docs/wechat-privacy-declaration.json", "utf8"));
const output = execFileSync(process.execPath, ["scripts/print-wechat-submit-copy.mjs"], {
  encoding: "utf8",
});

assert.equal(declaration.platformDeclarationStatus, "pending");
for (const phrase of [
  "微信昵称和头像：仅在用户主动完善身份时收集，本地或微信头像可能压缩上传 Humi API。",
  "系统相册：仅在用户主动点击保存海报时写入，不读取已有相册内容。",
  "微信一次性订阅消息：仅在用户确认下次做饭时间后询问；拒绝或取消不创建提醒，也不重复索取。",
  "平台状态：隐私保护指引仍待在微信后台填写并留证。",
]) {
  assert(output.includes(phrase), `submit copy missing structured privacy phrase: ${phrase}`);
}
assert(!output.includes("隐私保护指引已填写"));

console.log("WeChat submit copy selftest passed.");

import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packetDir = await mkdtemp(join(tmpdir(), "humi-candidate-forms-preview-"));

await Promise.all([
  writeFile(join(packetDir, "tester-feedback-form.md"), [
    "# Humi 1.1 体验者反馈单",
    "",
    "- 用户编号：U___",
    "- 入口任务：问问大家小程序卡片",
    "",
    "## 只需要回答这些",
    "",
    "- 推荐里有没有你今晚真的愿意做的菜？1 / 2 / 3 / 4 / 5",
    "- 问问大家、邀请家人或清单分享顺不顺？1 / 2 / 3 / 4 / 5 / 没试",
  ].join("\n")),
  writeFile(join(packetDir, "host-run-sheet.md"), [
    "# Humi 1.1 主厨记录单",
    "",
    "- 完成【今晚】菜单：是 / 否",
    "- 完成清单：是 / 否",
    "- 私有证据位置：private://",
  ].join("\n")),
  writeFile(join(packetDir, "candidate-feedback-import.csv"), "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit\n"),
  writeFile(join(packetDir, "daily-review.csv"), "日期,新体验人数,完成今晚菜单,完成清单,尝试协作,P0数,P1数,今日结论,下一步\n"),
]);

const { stdout } = await execFileAsync("npm", ["run", "release:candidate:forms:preview"], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
    HUMI_CANDIDATE_FORMS_PREVIEW_NO_OPEN: "1",
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const result = parseLastJson(stdout);
assert(result?.ok === true, "forms preview did not return ok=true");
assert(result.previewPath === join(packetDir, "candidate-forms-preview.html"), "forms preview path is not inside the packet");

const html = await readFile(result.previewPath, "utf8");
const mode = (await stat(result.previewPath)).mode & 0o777;

assert(mode === 0o600, `forms preview mode expected 600, got ${mode.toString(8)}`);
assert(html.includes('data-preview-kind="humi-candidate-forms"'), "preview missing stable data-preview-kind marker");
assert(html.includes("Humi 1.1 候选内测单据预览"), "preview title missing");
assert(html.includes("体验者反馈单"), "preview missing tester feedback form");
assert(html.includes("主厨记录单"), "preview missing host run sheet");
assert(html.includes("批量导入字段"), "preview missing import fields");
assert(html.includes("每日复盘字段"), "preview missing daily review fields");
assert(html.includes("10</strong><span>真实体验样本"), "preview missing candidate threshold metrics");
assert(html.includes("真实姓名、手机号、微信号、截图和录屏"), "preview missing privacy boundary");
assert(!html.includes("<script"), "preview should not include script tags");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  previewPath: result.previewPath,
  cases: [
    {
      name: "candidate-forms-preview-html",
      ok: true,
      mode: "600",
      sections: result.sections,
    },
  ],
}, null, 2));

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

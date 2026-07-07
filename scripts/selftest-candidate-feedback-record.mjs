import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const singlePacketDir = await mkdtemp(join(tmpdir(), "humi-candidate-record-single-"));
await writePacket(singlePacketDir);

const { stdout } = await execFileAsync("node", [
  "scripts/record-candidate-feedback.mjs",
  "--user", "U001",
  "--date", "2026-07-07",
  "--device", "iPhone 15 / WeChat 9",
  "--entry", "今晚",
  "--tonight", "yes",
  "--grocery", "yes",
  "--collaboration", "ask",
  "--recommendation", "5",
  "--grocery-score", "5",
  "--share-score", "4",
  "--note", "清单有用",
  "--stuck", "无",
  "--severity", "建议",
  "--evidence", "private://candidate/U001",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: singlePacketDir,
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const result = JSON.parse(stdout);
const anonymous = await readFile(join(singlePacketDir, "anonymous-users.csv"), "utf8");
const feedback = await readFile(join(singlePacketDir, "feedback-template.csv"), "utf8");
const issues = await readFile(join(singlePacketDir, "issue-triage.csv"), "utf8");

assert(result.ok, "record command did not return ok=true");
assert(result.appendedFeedback === true, "record command did not append feedback");
assert(result.appendedIssues === 0, "record command should not append issue for suggestion feedback");
assert(anonymous.includes("U001,待定,iPhone 15 / WeChat 9,已体验,2026-07-07,是,是,问问大家,5,5,4,待观察,建议,private://candidate/U001,清单有用"), "anonymous-users.csv was not updated");
assert(feedback.includes("U001,iPhone 15 / WeChat 9,2026-07-07,今晚,是,是,问问大家,5,5,4,无,清单有用,private://candidate/U001,建议,否,新反馈"), "feedback-template.csv was not appended");
assert(!issues.includes("U001"), "issue-triage.csv should not include suggestion feedback");

const importPacketDir = await mkdtemp(join(tmpdir(), "humi-candidate-record-import-"));
await writePacket(importPacketDir);
await writeFile(join(importPacketDir, "candidate-feedback-import.csv"), [
  "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit",
  "U001,2026-07-07,iPhone 15 / WeChat 9,今晚,yes,yes,ask,5,5,4,无,清单有用,建议,private://candidate/U001,待观察",
  "U002,2026-07-07,Android / WeChat 9,清单,yes,no,grocery,4,3,没试,找不到认领按钮,认领入口不明显,P1,private://candidate/U002,待观察",
  "U003,2026-07-07,iPhone SE / WeChat 9,今晚,no,no,none,没试,没试,没试,没打开成功,打开后没继续体验,P2,private://candidate/U003,待观察",
  "",
].join("\n"), { mode: 0o600 });

const imported = await execFileAsync("node", [
  "scripts/record-candidate-feedback.mjs",
  "--import", "candidate-feedback-import.csv",
], {
  env: {
    ...process.env,
    HUMI_CANDIDATE_VALIDATION_DIR: importPacketDir,
  },
  timeout: 30_000,
  maxBuffer: 1024 * 1024,
});

const importResult = JSON.parse(imported.stdout);
const importedAnonymous = await readFile(join(importPacketDir, "anonymous-users.csv"), "utf8");
const importedFeedback = await readFile(join(importPacketDir, "feedback-template.csv"), "utf8");
const importedIssues = await readFile(join(importPacketDir, "issue-triage.csv"), "utf8");

assert(importResult.ok, "import command did not return ok=true");
assert(importResult.importedRecords === 3, "import command did not process three records");
assert(importResult.appendedIssues === 1, "import command should append one P1 issue");
assert(importedAnonymous.includes("U001,待定,iPhone 15 / WeChat 9,已体验,2026-07-07,是,是,问问大家,5,5,4,待观察,建议,private://candidate/U001,清单有用"), "import did not update U001");
assert(importedAnonymous.includes("U002,待定,Android / WeChat 9,已体验,2026-07-07,是,否,买菜认领,4,3,没试,待观察,P1,private://candidate/U002,认领入口不明显"), "import did not update U002");
assert(importedAnonymous.includes("U003,待定,iPhone SE / WeChat 9,已体验,2026-07-07,否,否,没有,没试,没试,没试,待观察,P2,private://candidate/U003,打开后没继续体验"), "import did not update U003 with skipped scores");
assert(importedFeedback.includes("U002,Android / WeChat 9,2026-07-07,清单,是,否,买菜认领,4,3,没试,找不到认领按钮,认领入口不明显,private://candidate/U002,P1,待观察,新反馈"), "import did not append U002 feedback");
assert(importedFeedback.includes("U003,iPhone SE / WeChat 9,2026-07-07,今晚,否,否,没有,没试,没试,没试,没打开成功,打开后没继续体验,private://candidate/U003,P2,否,新反馈"), "import did not append U003 skipped feedback");
assert(importedIssues.includes("P1-001,找不到认领按钮,U002,P1,待判断,是,待判断,codex@mbp-m5pro,新反馈,"), "import did not append P1 issue triage row");

const dirtyPacketDir = await mkdtemp(join(tmpdir(), "humi-candidate-record-dirty-"));
await writePacket(dirtyPacketDir);
const dirty = await runRecord(dirtyPacketDir, [
  "--user", "U001",
  "--date", "2026-07-07",
  "--device", "iPhone 15 / WeChat 9",
  "--entry", "今晚",
  "--tonight", "yes",
  "--grocery", "yes",
  "--collaboration", "ask",
  "--recommendation", "5",
  "--grocery-score", "5",
  "--share-score", "4",
  "--note", "手机号：13800138000",
  "--stuck", "无",
  "--severity", "建议",
  "--evidence", "private://candidate/U001",
]);
assert(dirty.exitCode !== 0, "record command should reject PII before writing");
assert(dirty.data?.ok === false, "dirty record should return ok=false");
assert(dirty.data?.findings?.[0]?.type === "phone", "dirty record should report phone finding type");
assert(!dirty.stdout.includes("13800138000"), "dirty record output must not echo sensitive value");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  cases: [
    {
      name: "record-u001-feedback",
      ok: true,
      packetDir: singlePacketDir,
      appendedFeedback: result.appendedFeedback,
    },
    {
      name: "import-two-feedback-rows-and-append-p1-issue",
      ok: true,
      packetDir: importPacketDir,
      importedRecords: importResult.importedRecords,
      appendedIssues: importResult.appendedIssues,
    },
    {
      name: "reject-sensitive-values-before-writing",
      ok: true,
      packetDir: dirtyPacketDir,
    },
  ],
}, null, 2));

async function writePacket(dir) {
  await Promise.all([
    writeFile(join(dir, "anonymous-users.csv"), [
      "用户编号,家庭类型,设备/微信版本,邀请状态,首次体验日期,完成今晚菜单,完成清单,尝试协作,推荐评分,清单评分,分享评分,复访状态,当前等级,私有证据位置,备注",
      "U001,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U002,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "U003,待定,待填,待邀请,待填,待填,待填,待填,待填,待填,待填,待观察,待观察,private://,",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "feedback-template.csv"), [
      "用户编号,设备与微信版本,体验日期,入口,完成今晚菜单,完成清单,协作类型,推荐评分,清单评分,分享评分,卡住的位置,用户原话摘要,私有截图/录屏位置,问题等级,是否进入1.1.x,处理状态",
      "",
    ].join("\n"), { mode: 0o600 }),
    writeFile(join(dir, "issue-triage.csv"), [
      "编号,问题,来源用户编号,等级,是否复现,是否阻塞审核,是否进入1.1.x,Owner,处理状态,结论",
      "",
    ].join("\n"), { mode: 0o600 }),
  ]);
}

async function runRecord(packetDir, args) {
  try {
    const { stdout } = await execFileAsync("node", ["scripts/record-candidate-feedback.mjs", ...args], {
      env: {
        ...process.env,
        HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
      },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout,
      data: JSON.parse(stdout),
    };
  } catch (error) {
    const stdout = String(error.stdout || "");
    return {
      exitCode: error.code ?? 1,
      stdout,
      data: JSON.parse(stdout),
    };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

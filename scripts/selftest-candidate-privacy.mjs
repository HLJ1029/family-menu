import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const cleanDir = await mkdtemp(join(tmpdir(), "humi-candidate-privacy-clean-"));
await writePacket(cleanDir, {
  "anonymous-users.csv": "用户编号,备注\nU001,清单有用\n",
  "feedback-template.csv": "用户编号,设备与微信版本,用户原话摘要,私有截图/录屏位置\nU001,iPhone 15 / WeChat 9,推荐能直接做,private://candidate/U001\n",
  "tester-feedback-form.md": "请不要写手机号、微信号、真实姓名或家庭隐私。\n",
});

const clean = await runPrivacy(cleanDir);
assert(clean.exitCode === 0, "clean packet should pass privacy scan");
assert(clean.data?.ok === true, "clean packet did not return ok=true");

const dirtyDir = await mkdtemp(join(tmpdir(), "humi-candidate-privacy-dirty-"));
await writePacket(dirtyDir, {
  "anonymous-users.csv": "用户编号,备注\nU001,手机号：13800138000\n",
  "feedback-template.csv": "用户编号,用户原话摘要\nU001,微信号：humi_test_001\n",
  "host-run-sheet.md": "真实姓名：张三\n",
  "candidate-day-close-2026-07-07.md": "联系人：李四\n",
});

const dirty = await runPrivacy(dirtyDir);
assert(dirty.exitCode !== 0, "dirty packet should fail privacy scan");
assert(dirty.data?.ok === false, "dirty packet did not return ok=false");
assert(dirty.data?.findings?.length === 4, "dirty packet should report four finding locations");
assert(dirty.stdout && !dirty.stdout.includes("13800138000"), "privacy output must not echo phone values");
assert(dirty.stdout && !dirty.stdout.includes("humi_test_001"), "privacy output must not echo WeChat ID values");
assert(dirty.stdout && !dirty.stdout.includes("张三"), "privacy output must not echo real names");
assert(dirty.stdout && !dirty.stdout.includes("李四"), "privacy output must not echo close-report real names");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  cases: [
    {
      name: "clean-anonymous-packet",
      ok: true,
      packetDir: cleanDir,
    },
    {
      name: "dirty-packet-redacts-sensitive-values",
      ok: true,
      packetDir: dirtyDir,
      findingTypes: dirty.data.findings.map((item) => item.type),
    },
  ],
}, null, 2));

async function writePacket(dir, files) {
  await Promise.all(Object.entries(files).map(([file, content]) => (
    writeFile(join(dir, file), content, { mode: 0o600 })
  )));
}

async function runPrivacy(packetDir) {
  try {
    const { stdout } = await execFileAsync("node", ["scripts/check-candidate-privacy.mjs"], {
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
      data: parseLastJson(stdout),
    };
  } catch (error) {
    const stdout = String(error.stdout || "");
    return {
      exitCode: error.code ?? 1,
      stdout,
      data: parseLastJson(stdout),
    };
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

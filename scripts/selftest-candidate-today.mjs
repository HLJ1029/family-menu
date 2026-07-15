import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const baseDir = await mkdtemp(join(tmpdir(), "humi-candidate-today-"));
const packetDir = join(baseDir, "candidate-validation-20260707T000000Z");

await execFileAsync("node", ["scripts/prepare-candidate-validation-packet.mjs"], {
  env: {
    ...process.env,
    HUMI_PRIVATE_EVIDENCE_DIR: baseDir,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
    HUMI_CANDIDATE_VALIDATION_NO_OPEN: "1",
    HUMI_CANDIDATE_PREPARE_SELFTEST: "1",
  },
  timeout: 180_000,
  maxBuffer: 1024 * 1024 * 8,
});

await mkdir(join(baseDir, "miniprogram-share-card-preview-20260707T000000", "direct-preview"), { recursive: true, mode: 0o700 });
await Promise.all([
  writeFile(join(baseDir, "miniprogram-share-card-preview-20260707T000000", "direct-preview", "crave-preview-qr.png"), "fake-crave-qr", { mode: 0o600 }),
  writeFile(join(baseDir, "miniprogram-share-card-preview-20260707T000000", "direct-preview", "invite-preview-qr.png"), "fake-invite-qr", { mode: 0o600 }),
  writeFile(join(baseDir, "miniprogram-share-card-preview-20260707T000000", "direct-preview", "grocery-preview-qr.png"), "fake-grocery-qr", { mode: 0o600 }),
]);

const { stdout } = await execFileAsync("npm", [
  "run",
  "release:candidate:today",
  "--",
  "--date",
  "2026-07-07",
  "--json",
  "--no-open",
], {
  env: {
    ...process.env,
    HUMI_PRIVATE_EVIDENCE_DIR: baseDir,
    HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
    HUMI_CANDIDATE_TODAY_NO_OPEN: "1",
  },
  timeout: 180_000,
  maxBuffer: 1024 * 1024 * 8,
});

const result = parseLastJson(stdout);
assert(result.ok === true, "today command should return ok=true");
assert(result.packetDir === packetDir, "today command should use provided packet dir");
assert(result.files.dayPlan === join(packetDir, "candidate-day-plan.md"), "today should generate day plan path");
assert(result.files.formsPreview === join(packetDir, "candidate-forms-preview.html"), "today should generate forms preview path");
assert(result.files.dispatchMarkdown === join(packetDir, "candidate-dispatch-2026-07-07.md"), "today should generate dispatch markdown path");
assert(result.files.workbench === join(packetDir, "candidate-dispatch-workbench-2026-07-07.html"), "today should generate workbench path");
assert(result.today.dispatchUsers.length === 6, "today should select six dispatch users from empty packet");
assert(result.today.pendingUsers.length === 6, "today should keep dispatch users pending before real sends");
assert(result.today.shareCardQrReadyUsers.join(",") === "U001,U002,U003", "today should report three ready share QR users");
assert(result.today.privacyFindings.length === 0, "today should pass privacy scan for anonymous packet");

for (const file of [
  result.files.dayPlan,
  result.files.formsPreview,
  result.files.dispatchMarkdown,
  result.files.dispatchJson,
  result.files.workbench,
]) {
  const mode = (await stat(file)).mode & 0o777;
  assert(mode === 0o600, `${file} mode expected 600, got ${mode.toString(8)}`);
}

const workbenchHtml = await readFile(result.files.workbench, "utf8");
assert(workbenchHtml.includes('data-share-qr="ready"'), "today workbench should include ready QR images");
assert(workbenchHtml.includes("可扫码直达"), "today workbench should explain direct QR scanning");
assert(workbenchHtml.includes("不会发送微信消息"), "today workbench should preserve no-send guard");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  packetDir,
  cases: [
    {
      name: "candidate-today-generates-current-private-materials",
      ok: true,
      dispatchUsers: result.today.dispatchUsers.map((user) => user.id),
      shareCardQrReadyUsers: result.today.shareCardQrReadyUsers,
    },
  ],
}, null, 2));

function parseLastJson(output) {
  const text = String(output || "").trim();
  const jsonStart = text.lastIndexOf("\n{");
  const candidate = jsonStart >= 0 ? text.slice(jsonStart + 1) : text;
  return JSON.parse(candidate);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

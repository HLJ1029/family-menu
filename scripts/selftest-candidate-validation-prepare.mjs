import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const privateBaseDir = await mkdtemp(join(tmpdir(), "humi-candidate-prepare-"));

const { stdout } = await execFileAsync("npm", ["run", "release:candidate:prepare"], {
  env: {
    ...process.env,
    HUMI_PRIVATE_EVIDENCE_DIR: privateBaseDir,
    HUMI_CANDIDATE_VALIDATION_NO_OPEN: "1",
    HUMI_CANDIDATE_PREPARE_SELFTEST: "1",
  },
  timeout: 180_000,
  maxBuffer: 1024 * 1024 * 8,
});

const result = parseLastJson(stdout);
assert(result?.ok === true, "candidate prepare did not return ok=true");
assert(result.packetDir?.startsWith(`${privateBaseDir}${sep}`), "candidate packet was not created under the private selftest directory");
assert(result.git?.clean === true, "candidate prepare selftest requires a clean worktree");
assert(result.release?.engineeringGatesReady === true, "candidate prepare did not see healthy engineering gates");

const requiredFiles = [
  "README.md",
  "anonymous-users.csv",
  "feedback-template.csv",
  "candidate-feedback-import.csv",
  "daily-review.csv",
  "issue-triage.csv",
  "invite-copy.md",
  "outreach-batch.md",
  "tester-feedback-form.md",
  "host-run-sheet.md",
];

assert(result.files?.length === requiredFiles.length, "candidate prepare did not report the expected file count");
await assertMode(result.packetDir, 0o700, "packet directory");

const contents = {};
for (const file of requiredFiles) {
  const path = join(result.packetDir, file);
  await assertMode(path, 0o600, file);
  contents[file] = await readFile(path, "utf8");
}

assert(contents["README.md"].includes("release:candidate:desk:selftest"), "README does not mention release:candidate:desk:selftest");
assert(contents["README.md"].includes("release:candidate:plan"), "README does not mention release:candidate:plan");
assert(contents["README.md"].includes("candidate-day-plan.md"), "README does not mention candidate-day-plan.md");
assert(contents["README.md"].includes("release:candidate:dispatch -- --date YYYY-MM-DD"), "README does not mention release:candidate:dispatch");
assert(contents["README.md"].includes("candidate-dispatch-YYYY-MM-DD.md/json"), "README does not mention candidate dispatch files");
assert(contents["README.md"].includes("不能原样运行"), "README should warn against running record templates as-is");
assert(contents["README.md"].includes("1-5|没试"), "README should require score placeholders");
assert(!contents["README.md"].includes("--recommendation 5 --grocery-score 5"), "README should not default to positive feedback scores");
assert(!contents["README.md"].includes("--note \"清单有用\""), "README should not default to positive feedback notes");
assert(contents["README.md"].includes("真实姓名、手机号、微信号、截图和录屏"), "README does not state privacy boundaries");
assert(contents["README.md"].includes("暂不进入微信审核"), "README does not state the no-review boundary");
assert(contents["anonymous-users.csv"].match(/^U\d{3},/gm)?.length === 20, "anonymous-users.csv does not contain U001-U020 rows");
assert(contents["anonymous-users.csv"].includes("U020,"), "anonymous-users.csv is missing U020");
assert(contents["outreach-batch.md"].includes("## U020"), "outreach-batch.md is missing U020");
assert(contents["candidate-feedback-import.csv"].trim() === "user,date,device,entry,tonight,grocery,collaboration,recommendation,grocery-score,share-score,stuck,note,severity,evidence,revisit", "candidate-feedback-import.csv should only contain the import header");
assert(contents["tester-feedback-form.md"].includes("Humi 1.1 体验者反馈单"), "tester feedback form title is missing");
assert(contents["host-run-sheet.md"].includes("Humi 1.1 主厨记录单"), "host run sheet title is missing");
assert(contents["daily-review.csv"].includes("Day 3"), "daily-review.csv does not include Day 1-Day 3 placeholders");

const review = await runReview(result.packetDir);
assert(review.data?.recommendation === "wait-for-validation-input", "fresh candidate packet should wait for real validation input");
assert(review.exitCode !== 0, "fresh candidate packet review should fail until real feedback is entered");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  privateBaseDir,
  packetDir: result.packetDir,
  cases: [
    {
      name: "prepare-private-packet",
      ok: true,
      files: requiredFiles,
      permissions: {
        directory: "700",
        files: "600",
      },
      reviewRecommendation: review.data?.recommendation,
    },
  ],
}, null, 2));

async function runReview(packetDir) {
  try {
    const review = await execFileAsync("node", ["scripts/review-candidate-validation-packet.mjs"], {
      env: {
        ...process.env,
        HUMI_CANDIDATE_VALIDATION_DIR: packetDir,
      },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return {
      exitCode: 0,
      data: parseLastJson(review.stdout),
    };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      data: parseLastJson(error.stdout || ""),
    };
  }
}

async function assertMode(path, expected, label) {
  const info = await stat(path);
  const actual = info.mode & 0o777;
  assert(actual === expected, `${label} mode expected ${expected.toString(8)}, got ${actual.toString(8)}`);
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

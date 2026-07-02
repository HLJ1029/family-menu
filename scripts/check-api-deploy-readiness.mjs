import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaultTargets = ["root@api.humi-home.com", "ubuntu@api.humi-home.com"];
const sshTargets = (process.env.HUMI_API_SSH_TARGETS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const targets = sshTargets.length > 0 ? sshTargets : defaultTargets;
const requiredApiIncrements = [
  "1.1.37 deadlineAt",
  "1.1.38 precise recommendation quota gate",
  "1.1.39 explain quota gate",
  "1.1.42 crave resultSummary",
  "1.1.51 invite join shared state",
  "1.1.52 grocery claim conflict protection",
  "1.1.53 owner action boundary",
  "1.1.54 crave join shared state",
];

const checks = [];

async function check(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    checks.push({
      name,
      ok: true,
      ms: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      ms: Date.now() - startedAt,
      error: error.message,
    });
  }
}

async function run(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: options.timeout ?? 15_000,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 200);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { status: response.status, data };
}

await check("git-main-clean", async () => {
  const branch = await run("git", ["branch", "--show-current"]);
  const status = await run("git", ["status", "--porcelain"]);
  const head = await run("git", ["rev-parse", "--short", "HEAD"]);
  const upstream = await run("git", ["rev-parse", "--short", "origin/main"]);
  if (branch.stdout !== "main") throw new Error(`Expected branch main, got ${branch.stdout || "(detached)"}`);
  if (status.stdout) throw new Error("Working tree has uncommitted changes.");
  if (head.stdout !== upstream.stdout) {
    throw new Error(`HEAD ${head.stdout} does not match origin/main ${upstream.stdout}.`);
  }
  return { branch: branch.stdout, head: head.stdout };
});

await check("production-api-health", async () => {
  const { status, data } = await fetchJson("https://api.humi-home.com/health");
  if (data?.ok !== true || data?.service !== "humi-api") {
    throw new Error(`Unexpected health payload: ${JSON.stringify(data)}`);
  }
  return { status, service: data.service };
});

await check("ssh-access", async () => {
  const attempts = [];
  for (const target of targets) {
    try {
      const result = await run("ssh", [
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", "StrictHostKeyChecking=accept-new",
        target,
        "hostname && date -u",
      ], { timeout: 12_000 });
      attempts.push({ target, ok: true, stdout: result.stdout.split("\n").slice(0, 2) });
      return { target, attempts };
    } catch (error) {
      attempts.push({
        target,
        ok: false,
        error: String(error.stderr || error.message).trim().split("\n").slice(-1)[0],
      });
    }
  }
  const tried = attempts.map((item) => `${item.target}: ${item.error}`).join("; ");
  const overrideHint = "Set HUMI_API_SSH_TARGETS=user@host,user2@host if the production user changed.";
  const error = new Error(`No SSH target is currently usable. ${tried}. ${overrideHint}`);
  error.attempts = attempts;
  throw error;
});

await check("pending-api-increments", async () => ({
  pending: requiredApiIncrements,
  runbook: "docs/humi-api-production-deploy-runbook.md",
}));

const failed = checks.filter((item) => !item.ok);

console.log(JSON.stringify({
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  sshTargets: targets,
  nextAction: failed.length === 0
    ? "SSH is available. Continue with docs/humi-api-production-deploy-runbook.md."
    : "Resolve failed checks before running the production API deploy runbook.",
  checks,
}, null, 2));

if (failed.length > 0) process.exit(1);

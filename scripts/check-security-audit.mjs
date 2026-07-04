import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const startedAt = Date.now();
const audit = await runNpmAudit();
const vulnerabilities = audit.metadata?.vulnerabilities ?? {};
const total = Number(vulnerabilities.total ?? 0);
const report = {
  ok: total === 0,
  checkedAt: new Date().toISOString(),
  ms: Date.now() - startedAt,
  command: "npm audit --json",
  vulnerabilities: {
    info: Number(vulnerabilities.info ?? 0),
    low: Number(vulnerabilities.low ?? 0),
    moderate: Number(vulnerabilities.moderate ?? 0),
    high: Number(vulnerabilities.high ?? 0),
    critical: Number(vulnerabilities.critical ?? 0),
    total,
  },
  affectedPackages: Object.keys(audit.vulnerabilities ?? {}).sort(),
  nextActions: total === 0
    ? ["Dependency audit is clean."]
    : [
      "Run npm audit for details.",
      "Fix production release dependency advisories before WeChat review.",
      "Rerun npm run release:security:audit after dependency changes.",
    ],
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);

async function runNpmAudit() {
  try {
    const { stdout } = await execFileAsync("npm", ["audit", "--json"], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 8,
    });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = String(error.stdout || "").trim();
    if (!stdout) throw error;
    return JSON.parse(stdout);
  }
}

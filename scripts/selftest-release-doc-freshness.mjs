import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = await mkdtemp(join(tmpdir(), "humi-release-doc-freshness-"));
try {
  for (const [target, label, staleStatement] of [
    ["docs/humi-1.1-release-evidence-log.md", "current 1.1.75 upload", "当前 1.1.75 尚未封包或上传。"],
    ["docs/humi-1.1-release-evidence-log.md", "1.1.74 recent upload", "最近已上传体验版是 `1.1.74@4eb3fbeb`。"],
    ["docs/humi-api-production-deploy-runbook.md", "pre-N5a current HEAD and all-false template", "当前部署预检要求候选提交必须等于当前 HEAD，并且 production_api_deployed=false、h5_deployed=false、miniprogram_uploaded=false。"],
    ["docs/humi-1.1-release-operator-handoff.md", "current 1.1.71 upload", "当前上传证据目录是 /Users/honglijie/.humi-release-evidence/miniprogram-upload-1.1.71；微信开发者工具 CLI 已完成 1.1.71 上传。"],
  ]) {
    const source = await readFile(resolve(root, target), "utf8");
    const staleFixture = join(fixtureRoot, `${label}.md`);
    await writeFile(staleFixture, `${source}\n${staleStatement}\n`, { mode: 0o600 });
    const result = spawnSync(process.execPath, ["scripts/check-release-doc-freshness.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        HUMI_RELEASE_DOC_FIXTURE_TARGET: target,
        HUMI_RELEASE_DOC_FIXTURE_PATH: staleFixture,
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    assert.notEqual(
      result.status,
      0,
      `${label} must be rejected even when all current uploaded-state text remains`,
    );
    const report = JSON.parse(result.stdout);
    assert(
      report.failures.some((failure) => failure.path === target && /stale current-state/.test(failure.phrase)),
      `${label}: ${JSON.stringify(report.failures)}`,
    );
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log("Release document freshness selftest passed.");

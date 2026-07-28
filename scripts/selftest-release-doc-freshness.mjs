import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = await mkdtemp(join(tmpdir(), "humi-release-doc-freshness-"));
try {
  const target = "docs/humi-1.1-release-evidence-log.md";
  const source = await readFile(resolve(root, target), "utf8");
  const staleFixture = join(fixtureRoot, "release-evidence-log.md");
  await writeFile(
    staleFixture,
    `${source}\n当前 1.1.75 尚未封包或上传。\n`,
    { mode: 0o600 },
  );
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
    "the document checker must reject a stale current-state statement even when all current uploaded-state text remains",
  );
  const report = JSON.parse(result.stdout);
  assert(
    report.failures.some((failure) => failure.path === target && /stale current-state/.test(failure.phrase)),
    JSON.stringify(report.failures),
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log("Release document freshness selftest passed.");

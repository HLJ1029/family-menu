import { realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

export const RELEASE_STATUS_SKIP_ENV_KEYS = Object.freeze([
  "HUMI_RELEASE_COMPLETION_SELFTEST_ALLOW_DIRTY",
  "HUMI_RELEASE_STATUS_SKIP_PRODUCT_SMOKE",
  "HUMI_RELEASE_STATUS_SKIP_CANDIDATE_PREPARE_SELFTEST",
  "HUMI_CANDIDATE_PREPARE_SELFTEST",
]);

export function validateReleaseStatusFixtureMode(env = {}) {
  const skipRequested = RELEASE_STATUS_SKIP_ENV_KEYS.some((key) => env[key] === "1");
  const evidencePath = String(env.HUMI_EVIDENCE_LOG_PATH || "").trim();
  if (!skipRequested) return { authorized: false, skipRequested: false, evidencePath, reason: "no_skip_requested" };
  if (env.NODE_ENV !== "test") return { authorized: false, skipRequested: true, evidencePath, reason: "NODE_ENV_must_be_test" };
  if (env.HUMI_RELEASE_STATUS_FIXTURE_MODE !== "1") {
    return { authorized: false, skipRequested: true, evidencePath, reason: "fixture_flag_required" };
  }
  if (!isAbsolute(evidencePath)) {
    return { authorized: false, skipRequested: true, evidencePath, reason: "absolute_evidence_path_required" };
  }
  let actual;
  try {
    if (!statSync(evidencePath).isFile()) throw new Error("not_file");
    actual = realpathSync(evidencePath);
  } catch {
    return { authorized: false, skipRequested: true, evidencePath, reason: "evidence_file_required" };
  }
  const allowedRoots = [realpathSync(tmpdir()), resolve(homedir(), ".humi-release-evidence")];
  if (!allowedRoots.some((root) => isInsideOrEqual(root, actual))) {
    return { authorized: false, skipRequested: true, evidencePath, reason: "evidence_path_outside_fixture_roots" };
  }
  return { authorized: true, skipRequested: true, evidencePath, reason: "authorized_test_fixture" };
}

function isInsideOrEqual(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

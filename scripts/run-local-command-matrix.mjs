import { resolve } from "node:path";
import {
  assertTestInjectionGuard,
  loadTestCommands,
  runLocalCommandMatrix,
} from "./lib/local-command-matrix.mjs";

try {
  const options = await parseArgs(process.argv.slice(2));
  const result = await runLocalCommandMatrix(options);
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(`Immutable local command matrix failed: ${error.message}`);
  process.exitCode = 1;
}

async function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--") || key in values) {
      throw new Error("invalid local matrix arguments");
    }
    values[key] = value;
  }
  const testKeys = ["--test-repo", "--test-evidence-root", "--test-command-file", "--test-run-id"];
  const usesTestInjection = testKeys.some((key) => key in values);
  if (usesTestInjection) {
    if (!testKeys.every((key) => key in values) || Object.keys(values).some((key) => !testKeys.includes(key))) {
      throw new Error("test-only matrix injection refused: all test arguments are required");
    }
    const repoRoot = resolve(values["--test-repo"]);
    const evidenceRoot = resolve(values["--test-evidence-root"]);
    const commandFile = resolve(values["--test-command-file"]);
    const guarded = await assertTestInjectionGuard({ repoRoot, evidenceRoot, commandFile });
    return {
      testMode: true,
      repoRoot: guarded.repoRoot,
      evidenceRoot: guarded.evidenceRoot,
      runId: values["--test-run-id"],
      commands: await loadTestCommands(guarded.commandFile),
    };
  }
  const allowed = new Set(["--true-device-evidence-dir", "--candidate-commit"]);
  if (Object.keys(values).some((key) => !allowed.has(key))) throw new Error("unsupported local matrix argument");
  if (Boolean(values["--true-device-evidence-dir"]) !== Boolean(values["--candidate-commit"])) {
    throw new Error("true-device evidence directory and candidate commit must be supplied together");
  }
  return {
    trueDeviceEvidenceDir: values["--true-device-evidence-dir"],
    candidateCommit: values["--candidate-commit"],
  };
}

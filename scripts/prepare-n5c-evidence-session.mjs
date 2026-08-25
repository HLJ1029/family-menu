import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareN5cSession } from "./lib/n5c-evidence-session.mjs";

export function parsePrepareN5cArgs(argv) {
  const options = { open: false };
  const allowed = new Set(["candidate-commit", "attestation", "output-root"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--open") {
      options.open = true;
      continue;
    }
    if (!token.startsWith("--") || !allowed.has(token.slice(2))) fail("arguments_invalid");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("arguments_invalid");
    options[token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    index += 1;
  }
  if (!options.candidateCommit || !options.attestation) fail("arguments_invalid");
  return options;
}

async function main() {
  try {
    const options = parsePrepareN5cArgs(process.argv.slice(2));
    const result = await prepareN5cSession({
      repoRoot: process.cwd(),
      candidateCommit: options.candidateCommit,
      attestationPath: options.attestation,
      outputRoot: options.outputRoot,
      open: options.open,
    });
    console.log(JSON.stringify({
      ok: true,
      sessionDir: result.sessionDir,
      sessionId: result.session.sessionId,
      candidate: `${result.session.packageVersion}@${result.session.runtimeCommit}`,
      passed: result.passed,
      required: result.required,
      externalActionsPerformed: [],
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code || "n5c_prepare_failed" }, null, 2));
    process.exitCode = 1;
  }
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

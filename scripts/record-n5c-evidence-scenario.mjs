import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { recordN5cScenario } from "./lib/n5c-evidence-recorder.mjs";

export function parseRecordN5cArgs(argv) {
  const options = {};
  const allowed = new Set(["session", "scenario", "row", "descriptor"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--") || !allowed.has(token.slice(2))) fail("arguments_invalid");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("arguments_invalid");
    options[token.slice(2)] = value;
    index += 1;
  }
  if (!options.session || !options.scenario || !options.row) fail("arguments_invalid");
  return options;
}

async function main() {
  try {
    const options = parseRecordN5cArgs(process.argv.slice(2));
    const report = await recordN5cScenario({
      sessionDir: options.session,
      scenarioId: options.scenario,
      rowPath: options.row,
      descriptorPath: options.descriptor,
      repoRoot: process.cwd(),
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code || "n5c_record_failed" }, null, 2));
    process.exitCode = 1;
  }
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

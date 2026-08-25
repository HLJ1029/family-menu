import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkN5cSession } from "./lib/n5c-evidence-recorder.mjs";

export function parseCheckN5cArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--session" || !argv[1]) fail("arguments_invalid");
  return { session: argv[1] };
}

async function main() {
  try {
    const { session } = parseCheckN5cArgs(process.argv.slice(2));
    const report = await checkN5cSession({ sessionDir: session, repoRoot: process.cwd() });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code || "n5c_check_failed" }, null, 2));
    process.exitCode = 1;
  }
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

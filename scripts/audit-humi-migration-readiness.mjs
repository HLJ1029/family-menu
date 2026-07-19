import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { auditHumiData, sha256 } from "./migrate-humi-identity-households.mjs";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--input", "--report"].includes(arg)) {
      throw new Error(`${arg} is not allowed; this command is read-only.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
    options[arg.slice(2)] = resolve(value);
    index += 1;
  }
  if (!options.input || !options.report) throw new Error("--input and --report are required.");
  if (options.input === options.report) throw new Error("Input and report paths must be distinct.");
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Audit arguments invalid: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const inputText = await readFile(options.input, "utf8");
    const audit = auditHumiData(JSON.parse(inputText));
    const report = {
      schemaVersion: 1,
      mode: "read-only-audit",
      ready: audit.fatalCount === 0,
      counts: audit.counts,
      fatalCount: audit.fatalCount,
      fatalCodes: audit.fatalCodes,
      inputSha256: sha256(inputText),
    };
    await mkdir(dirname(options.report), { recursive: true });
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(`Migration readiness: ${report.ready ? "ready" : "blocked"}; fatal codes: ${report.fatalCount}.`);
    if (!report.ready) process.exitCode = 2;
  } catch (error) {
    console.error(`Audit failed: ${error.code === "EEXIST" ? "report already exists" : error.message}`);
    process.exitCode = 1;
  }
}

await main();

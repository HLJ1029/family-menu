import { verifyLocalCommandMatrix } from "./lib/local-command-matrix.mjs";

try {
  if (process.argv.length !== 3) throw new Error("use: node scripts/verify-local-command-matrix.mjs /absolute/path/manifest.json");
  const report = await verifyLocalCommandMatrix(process.argv[2]);
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} catch (error) {
  console.error(`Local matrix verification failed: ${error.message}`);
  process.exitCode = 1;
}

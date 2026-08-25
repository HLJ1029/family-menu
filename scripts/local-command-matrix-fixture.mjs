import { appendFile, lstat, mkdir, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

if (process.env.NODE_ENV !== "test" || process.env.HUMI_LOCAL_MATRIX_TEST_MODE !== "1") {
  console.error("local matrix fixture helper refused outside guarded tests");
  process.exit(1);
}

const [action, id, value = ""] = process.argv.slice(2);
if (!process.env.HUMI_PRIVATE_EVIDENCE_DIR || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id || "")) {
  console.error("local matrix fixture helper received invalid controlled input");
  process.exit(1);
}

let repo;
let artifacts;
try {
  ({ repo, artifacts } = await validateControlledRoots(process.cwd(), process.env.HUMI_PRIVATE_EVIDENCE_DIR));
} catch {
  console.error("local matrix fixture helper refused unsafe roots");
  process.exit(1);
}

try {
  await runControlledAction();
} catch {
  console.error("local matrix fixture helper failed a controlled action");
  process.exit(1);
}

async function runControlledAction() {
  switch (action) {
  case "pass":
    console.log(id);
    break;
  case "fail":
    process.exit(Number(value));
    break;
  case "timeout":
    setInterval(() => {}, 1_000);
    break;
  case "wait":
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Number(value)));
    console.log(id);
    break;
  case "append-order":
    await appendFile(await controlledTarget(artifacts, "fixture-order.txt"), `${id}\n`);
    break;
  case "write-marker":
    await writeFile(await controlledTarget(artifacts, "continued.txt"), "yes");
    break;
  case "mutate-repo":
    await writeFile(await controlledTarget(repo, "README.md"), "changed\n");
    break;
  case "redact-output-and-artifact": {
    const authorization = ["Bearer", "matrix_test_authorization_value"].join(" ");
    const token = ["matrix", "test", "token", "value"].join("_");
    const ticket = ["matrix", "test", "ticket", "value"].join("_");
    const email = ["matrix.private", "example.test"].join("@");
    const phone = ["138", "0013", "8000"].join("");
    const openId = ["o_", "matrix_test_openid_value"].join("");
    const unionId = ["u_", "matrix_test_unionid_value"].join("");
    const salt = ["matrix", "test", "telemetry", "salt"].join("_");
    const secret = ["matrix", "test", "app", "secret"].join("_");
    const jsonToken = ["matrix", "test", "json", "access", "token"].join("_");
    const basicCredential = ["matrix", "test", "basic", "credential"].join("_");
    const plainTicket = ["matrix", "test", "plain", "ticket"].join("_");
    const jsonTicket = ["matrix", "test", "json", "ticket"].join("_");
    const digestCredential = ["matrix", "test", "digest", "credential"].join("_");
    const payload = [
      `Authorization: ${authorization}`,
      `Authorization: Basic ${basicCredential}`,
      `https://example.test/callback?token=${token}&ticket=${ticket}`,
      `ticket=${plainTicket}`,
      `email=${email}`,
      `phone=${phone}`,
      `openid=${openId}`,
      `UnionID=${unionId}`,
      `HUMI_TELEMETRY_HASH_SALT=${salt}`,
      `WECHAT_APP_SECRET=${secret}`,
      JSON.stringify({ accessToken: jsonToken, appSecret: secret, openId, unionId }),
      JSON.stringify({ ticket: jsonTicket }),
      JSON.stringify({ Authorization: `Digest ${digestCredential}` }),
      artifacts,
    ].join("\n");
    const nested = await controlledTarget(artifacts, "nested");
    await mkdir(nested);
    await writeFile(await controlledTarget(artifacts, "nested", "manifest.json"), payload);
    await writeFile(await controlledTarget(artifacts, "nested", "opaque-artifact.data"), payload);
    process.stdout.write(payload);
    process.stderr.write(payload);
    break;
  }
  case "artifact-symlink": {
    const path = await controlledTarget(artifacts, "unsafe-link");
    await symlink("/etc/hosts", path);
    break;
  }
  case "artifact-oversize":
    await writeFile(await controlledTarget(artifacts, "oversize-artifact"), "x".repeat(8 * 1024 * 1024 + 1));
    break;
  case "artifact-batch-unsafe":
    await symlink("/etc/hosts", await controlledTarget(artifacts, "00-symlink"));
    await writeFile(await controlledTarget(artifacts, "01-oversize"), "x".repeat(8 * 1024 * 1024 + 1));
    await writeFile(await controlledTarget(artifacts, "99-secret.custom"), `ticket=${["matrix", "batch", "secret"].join("_")}\n`);
    break;
  case "observation-failure":
  case "log-write-failure":
    console.log(id);
    break;
    default:
      console.error("local matrix fixture helper rejected an unknown action");
      process.exit(1);
  }
}

async function validateControlledRoots(repoInput, artifactsInput) {
  if (!isAbsolute(repoInput) || !isAbsolute(artifactsInput)) throw new Error("unsafe root");
  const tempRoot = await realpath(tmpdir());
  const canonicalRepo = await realpath(repoInput);
  const canonicalArtifacts = await realpath(artifactsInput);
  if (!isStrictChild(tempRoot, canonicalRepo) || !isStrictChild(tempRoot, canonicalArtifacts)) {
    throw new Error("unsafe root");
  }
  const [repoInfo, artifactsInfo, gitInfo] = await Promise.all([
    stat(canonicalRepo),
    stat(canonicalArtifacts),
    lstat(resolve(canonicalRepo, ".git")),
  ]);
  if (!repoInfo.isDirectory() || !artifactsInfo.isDirectory() || gitInfo.isSymbolicLink()
    || (!gitInfo.isDirectory() && !gitInfo.isFile())) {
    throw new Error("unsafe root");
  }
  if (!areDisjoint(canonicalRepo, canonicalArtifacts)) throw new Error("unsafe root");
  return { repo: canonicalRepo, artifacts: canonicalArtifacts };
}

function isStrictChild(root, candidate) {
  const relation = relative(root, candidate);
  return Boolean(relation) && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function areDisjoint(first, second) {
  return !isStrictChild(first, second) && !isStrictChild(second, first) && first !== second;
}

async function controlledTarget(root, ...segments) {
  const target = resolve(root, ...segments);
  if (!isStrictChild(root, target)) throw new Error("unsafe target");
  let current = root;
  for (const segment of relative(root, target).split(sep)) {
    current = resolve(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("unsafe target");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return target;
}

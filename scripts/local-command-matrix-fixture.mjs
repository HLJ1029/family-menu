import { appendFile, mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

if (process.env.NODE_ENV !== "test" || process.env.HUMI_LOCAL_MATRIX_TEST_MODE !== "1") {
  console.error("local matrix fixture helper refused outside guarded tests");
  process.exit(1);
}

const [action, id, value = ""] = process.argv.slice(2);
const artifacts = process.env.HUMI_PRIVATE_EVIDENCE_DIR;
if (!artifacts || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id || "")) {
  console.error("local matrix fixture helper received invalid controlled input");
  process.exit(1);
}

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
    await appendFile(join(artifacts, "fixture-order.txt"), `${id}\n`);
    break;
  case "write-marker":
    await writeFile(join(artifacts, "continued.txt"), "yes");
    break;
  case "mutate-repo":
    await writeFile(join(process.cwd(), "README.md"), "changed\n");
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
    const nested = join(artifacts, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "manifest.json"), payload);
    await writeFile(join(nested, "opaque-artifact.data"), payload);
    process.stdout.write(payload);
    process.stderr.write(payload);
    break;
  }
  case "artifact-symlink": {
    const path = join(artifacts, "unsafe-link");
    await mkdir(dirname(path), { recursive: true });
    await symlink("/etc/hosts", path);
    break;
  }
  case "artifact-oversize":
    await writeFile(join(artifacts, "oversize-artifact"), "x".repeat(8 * 1024 * 1024 + 1));
    break;
  case "observation-failure":
  case "log-write-failure":
    console.log(id);
    break;
  default:
    console.error("local matrix fixture helper rejected an unknown action");
    process.exit(1);
}

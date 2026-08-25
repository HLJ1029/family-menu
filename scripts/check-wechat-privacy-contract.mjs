import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditWechatPrivacyBehaviorConsistency,
  auditWechatPrivacyContract,
} from "./lib/wechat-privacy-contract.mjs";
import { runWechatPrivacyBehaviorChecks } from "./lib/wechat-privacy-behavior.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeFiles = await listTextFiles(resolve(ROOT, "miniprogram"));
const declaration = JSON.parse(
  await readFile(resolve(ROOT, "docs/wechat-privacy-declaration.json"), "utf8"),
);
const report = auditWechatPrivacyContract({ runtimeFiles, declaration });
const behavior = runWechatPrivacyBehaviorChecks({ root: ROOT });
const behaviorConsistency = auditWechatPrivacyBehaviorConsistency({ declaration, behavior });
const readme = await readFile(resolve(ROOT, "miniprogram/README.md"), "utf8");
const documentation = {
  ok: declaration.platformDeclarationStatus === "pending"
    && !readme.includes("隐私保护指引已填写")
    && readme.includes("隐私保护指引仍待在微信后台填写并留证"),
  platformDeclarationStatus: declaration.platformDeclarationStatus,
  readmeClaimsPlatformComplete: readme.includes("隐私保护指引已填写"),
};
const ok = report.ok && behavior.ok && behaviorConsistency.ok && documentation.ok;

console.log(JSON.stringify({
  ...report,
  ok,
  behavior,
  behaviorConsistency,
  documentation,
  declarationPath: "docs/wechat-privacy-declaration.json",
  platformDeclarationStatus: declaration.platformDeclarationStatus,
}, null, 2));
if (!ok) process.exitCode = 1;

async function listTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listTextFiles(path));
    else if (
      entry.isFile()
      && [".js", ".json", ".wxml", ".wxss"].includes(extname(entry.name).toLowerCase())
    ) {
      files.push({
        path: relative(ROOT, path),
        source: await readFile(path, "utf8"),
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

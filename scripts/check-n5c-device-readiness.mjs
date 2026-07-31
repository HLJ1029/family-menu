import { spawnSync } from "node:child_process";
import { accessSync, constants, chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkN5cSession } from "./lib/n5c-evidence-recorder.mjs";

const WECHAT_CLI = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const BUNDLED_ADB = "/Applications/wechatwebdevtools.app/Contents/Resources/bin/adb-macos/adb";

export function parseN5cDoctorArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--session" || !argv[1]) fail("arguments_invalid");
  return { session: resolve(argv[1]) };
}

export function summarizeN5cDeviceReadiness({ session, ios, android, devtools }) {
  const blockers = [];
  if (!devtools.loggedIn) blockers.push("wechat_devtools_login_missing");
  if (!ios.iphoneConnected) blockers.push("ios_390x844_phone_missing");
  if (!android.phoneConnected) blockers.push("android_phone_missing");
  if (session.passed < session.required) blockers.push("true_device_evidence_incomplete");
  return {
    ok: blockers.length === 0 && session.ok,
    candidate: session.candidate,
    session: {
      id: session.sessionId,
      passed: session.passed,
      required: session.required,
      remaining: Math.max(0, session.required - session.passed),
      performanceReady: session.performance.ok,
    },
    devices: {
      ios390x844PhoneConnected: ios.iphoneConnected,
      connectedIphoneCount: ios.connectedIphoneCount,
      pairedButUnavailableAppleDevices: ios.pairedButUnavailableCount,
      androidPhoneConnected: android.phoneConnected,
      connectedAndroidCount: android.connectedAndroidCount,
      wechatDevtoolsLoggedIn: devtools.loggedIn,
    },
    blockers,
    nextActions: nextActions(blockers),
  };
}

export function summarizeIosDevices(devices = []) {
  const physical = devices.filter((device) => device?.hardwareProperties?.reality !== "simulated");
  const connectedIphones = physical.filter((device) => (
    /^iPhone\b/i.test(String(device?.hardwareProperties?.marketingName || ""))
    && device?.connectionProperties?.pairingState === "paired"
    && device?.connectionProperties?.tunnelState !== "unavailable"
  ));
  return {
    iphoneConnected: connectedIphones.length > 0,
    connectedIphoneCount: connectedIphones.length,
    pairedButUnavailableCount: physical.filter((device) => (
      device?.connectionProperties?.pairingState === "paired"
      && device?.connectionProperties?.tunnelState === "unavailable"
    )).length,
  };
}

export function summarizeAdbDevices(stdout = "") {
  const connected = String(stdout)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("emulator-") && /\sdevice(?:\s|$)/.test(line));
  return {
    phoneConnected: connected.length > 0,
    connectedAndroidCount: connected.length,
  };
}

async function main() {
  try {
    const { session } = parseN5cDoctorArgs(process.argv.slice(2));
    const evidence = await checkN5cSession({ sessionDir: session, repoRoot: process.cwd() });
    const report = summarizeN5cDeviceReadiness({
      session: evidence,
      ios: probeIosDevices(),
      android: probeAndroidDevices(),
      devtools: probeWechatDevtools(),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: error.code || "n5c_doctor_failed" }, null, 2));
    process.exitCode = 1;
  }
}

function probeIosDevices() {
  const directory = mkdtempSync(join(tmpdir(), "humi-n5c-devices-"));
  const outputPath = join(directory, "devices.json");
  try {
    const result = spawnSync("xcrun", [
      "devicectl", "list", "devices", "--quiet", "--timeout", "10", "--json-output", outputPath,
    ], { encoding: "utf8", timeout: 15_000 });
    if (result.status !== 0) return { iphoneConnected: false, connectedIphoneCount: 0, pairedButUnavailableCount: 0 };
    chmodSync(outputPath, 0o600);
    const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
    return summarizeIosDevices(parsed?.result?.devices || []);
  } catch {
    return { iphoneConnected: false, connectedIphoneCount: 0, pairedButUnavailableCount: 0 };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function probeAndroidDevices() {
  const adb = firstExecutable([process.env.HUMI_ADB_PATH, BUNDLED_ADB, "/opt/homebrew/bin/adb", "/usr/local/bin/adb"]);
  if (!adb) return { phoneConnected: false, connectedAndroidCount: 0 };
  const result = spawnSync(adb, ["devices", "-l"], { encoding: "utf8", timeout: 10_000 });
  if (result.status !== 0) return { phoneConnected: false, connectedAndroidCount: 0 };
  return summarizeAdbDevices(result.stdout);
}

function probeWechatDevtools() {
  if (!firstExecutable([WECHAT_CLI])) return { loggedIn: false };
  const result = spawnSync(WECHAT_CLI, ["islogin"], { encoding: "utf8", timeout: 15_000 });
  return { loggedIn: result.status === 0 && /"login"\s*:\s*true/.test(`${result.stdout}\n${result.stderr}`) };
}

function firstExecutable(paths) {
  for (const path of paths.filter(Boolean)) {
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch {
      // Try the next fixed path without exposing local filesystem details.
    }
  }
  return "";
}

function nextActions(blockers) {
  const actions = [];
  if (blockers.includes("wechat_devtools_login_missing")) actions.push("打开微信开发者工具并完成登录");
  if (blockers.includes("ios_390x844_phone_missing")) actions.push("用数据线连接并解锁一台 iPhone，点按信任此电脑");
  if (blockers.includes("android_phone_missing")) actions.push("连接一台已开启 USB 调试的 Android 手机并允许本机调试");
  if (!actions.length && blockers.includes("true_device_evidence_incomplete")) actions.push("按 run-sheet.md 从首个缺失场景继续采集");
  return actions;
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

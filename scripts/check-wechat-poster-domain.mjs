import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_WECHAT_CLI = "/Applications/wechatwebdevtools.app/Contents/MacOS/cli";
const DEFAULT_PROBE_URL = "https://api.humi-home.com/health";
const EXPECTED_ORIGIN = "https://api.humi-home.com";
const EXPECTED_APP_ID = "wx4040b89f3b363416";

if (process.argv.includes("--selftest")) {
  assert(
    classifyCliDiagnostics("错误 Error: 需要重新登录 (code 10)") === "devtools_login_required",
    "DevTools login expiry should be classified before waiting for a dead automation socket.",
  );
  assert(
    classifyCliDiagnostics("url not in domain list") === "download_domain_missing",
    "downloadFile legal-domain rejection should keep its distinct external blocker.",
  );
  assert(
    nextActionForDomainStatus({
      rejectedByDomainPolicy: false,
      externalBlocker: "",
      domainAllowed: true,
      httpHealthy: false,
    }).includes("API health"),
    "an allowed download domain with a non-2xx probe must point to API health, not claim the gate passed.",
  );
  assert(
    nextActionForDomainStatus({
      rejectedByDomainPolicy: false,
      externalBlocker: "",
      domainAllowed: true,
      httpHealthy: true,
    }).includes("gate passed"),
    "only an allowed domain with a healthy API probe may claim the gate passed.",
  );
  console.log("WeChat poster domain diagnostics self-test passed.");
  process.exit(0);
}

const root = resolve(new URL("..", import.meta.url).pathname);
const projectPath = resolve(root, "miniprogram");
const projectConfigPath = resolve(projectPath, "project.config.json");
const privateConfigPath = resolve(projectPath, "project.private.config.json");
const cliPath = process.env.HUMI_WECHAT_DEVTOOLS_CLI || DEFAULT_WECHAT_CLI;
const probeUrl = new URL(process.env.HUMI_POSTER_DOMAIN_PROBE_URL || DEFAULT_PROBE_URL);
const timeout = Number(process.env.HUMI_WECHAT_AUTOMATOR_TIMEOUT_MS || 45_000);

await assertReadable(cliPath, "WeChat DevTools CLI");
assert(Number.isFinite(timeout) && timeout >= 10_000, "HUMI_WECHAT_AUTOMATOR_TIMEOUT_MS must be at least 10000.");
assert(probeUrl.origin === EXPECTED_ORIGIN, `Probe URL must use ${EXPECTED_ORIGIN}.`);

const projectConfig = JSON.parse(await readFile(projectConfigPath, "utf8"));
assert(projectConfig.appid === EXPECTED_APP_ID, `Expected formal AppID ${EXPECTED_APP_ID}.`);
assert(projectConfig.setting?.urlCheck === true, "miniprogram/project.config.json must keep setting.urlCheck=true.");

const privateConfig = await readOptionalJson(privateConfigPath);
assert(privateConfig?.setting?.urlCheck !== false, "project.private.config.json must not disable legal-domain checks.");

let connection;
let cliProcess;
let result;
let cliDiagnostics = "";
try {
  const port = await findAvailablePort();
  cliProcess = spawn(cliPath, ["auto", "--project", projectPath, "--auto-port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const appendDiagnostics = (chunk) => {
    cliDiagnostics = `${cliDiagnostics}${String(chunk || "")}`.slice(-12_000);
  };
  cliProcess.stdout?.on("data", appendDiagnostics);
  cliProcess.stderr?.on("data", appendDiagnostics);
  try {
    connection = await connectToDevTools(
      `ws://127.0.0.1:${port}`,
      timeout,
      () => classifyCliDiagnostics(cliDiagnostics),
    );
    const response = await connection.send("App.callFunction", {
      functionDeclaration: `function (url) {
        return new Promise(function (resolveProbe) {
          wx.downloadFile({
            url: url,
            success: function (downloadResponse) {
              resolveProbe({ kind: "success", statusCode: downloadResponse.statusCode });
            },
            fail: function (error) {
              resolveProbe({ kind: "fail", errMsg: error && error.errMsg ? error.errMsg : String(error) });
            }
          });
        });
      }`,
      args: [probeUrl.toString()],
    });
    result = response.result;
  } catch (error) {
    const errorCode = error?.code || classifyCliDiagnostics(cliDiagnostics) || "automation_unavailable";
    result = {
      kind: "blocked",
      errorCode,
      errMsg: externalBlockerMessage(errorCode),
    };
  }
} finally {
  await connection?.send("Tool.close", {}, 5_000).catch(() => {});
  connection?.close();
  cliProcess?.kill();
}

const errorMessage = result?.errMsg || "";
const rejectedByDomainPolicy = /url not in domain list/i.test(errorMessage);
const externalBlocker = result?.errorCode || classifyCliDiagnostics(errorMessage);
const domainAllowed = result?.kind === "success" && !rejectedByDomainPolicy;
const httpHealthy = domainAllowed && result.statusCode >= 200 && result.statusCode < 300;
const report = {
  ok: domainAllowed && httpHealthy,
  checkedAt: new Date().toISOString(),
  appId: projectConfig.appid,
  projectPath,
  probeUrl: probeUrl.toString(),
  urlCheck: projectConfig.setting.urlCheck,
  domainAllowed,
  httpHealthy,
  result,
  externalBlocker: rejectedByDomainPolicy ? "download_domain_missing" : externalBlocker || null,
  nextAction: nextActionForDomainStatus({
    rejectedByDomainPolicy,
    externalBlocker,
    domainAllowed,
    httpHealthy,
  }),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

async function assertReadable(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  assert(port, "Unable to reserve an automation port.");
  return port;
}

async function connectToDevTools(endpoint, timeoutMs, readBlocker = () => "") {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const blocker = readBlocker();
    if (blocker) {
      const error = new Error(externalBlockerMessage(blocker));
      error.code = blocker;
      throw error;
    }
    try {
      return await openProtocolConnection(endpoint, Math.min(2_000, deadline - Date.now()));
    } catch (error) {
      lastError = error;
      const failedBlocker = readBlocker();
      if (failedBlocker) {
        const blockerError = new Error(externalBlockerMessage(failedBlocker));
        blockerError.code = failedBlocker;
        throw blockerError;
      }
      await delay(500);
    }
  }
  throw new Error(`Unable to connect to WeChat DevTools automation: ${lastError?.message || "timed out"}`);
}

function classifyCliDiagnostics(value) {
  const message = String(value || "");
  if (/需要重新登录|not logged in|login required|login:false/i.test(message)) return "devtools_login_required";
  if (/url not in domain list/i.test(message)) return "download_domain_missing";
  return "";
}

function externalBlockerMessage(errorCode) {
  if (errorCode === "devtools_login_required") return "WeChat DevTools login is required before legal-domain evidence can be refreshed.";
  if (errorCode === "download_domain_missing") return `${EXPECTED_ORIGIN} is absent from the WeChat downloadFile legal-domain list.`;
  return "WeChat DevTools automation was unavailable before the legal-domain probe completed.";
}

function nextActionForDomainStatus({
  rejectedByDomainPolicy = false,
  externalBlocker = "",
  domainAllowed = false,
  httpHealthy = false,
} = {}) {
  if (rejectedByDomainPolicy || externalBlocker === "download_domain_missing") {
    return `Add ${EXPECTED_ORIGIN} to the mini program downloadFile legal-domain list, then run this command again.`;
  }
  if (externalBlocker === "devtools_login_required") {
    return "Sign in to WeChat DevTools, then rerun this read-only domain probe. Do not disable urlCheck.";
  }
  if (domainAllowed && httpHealthy) {
    return "The domain gate passed. Continue with real-device menu poster sharing and grocery poster saving.";
  }
  if (domainAllowed) {
    return `The download domain is allowed, but the API health probe failed. Restore ${EXPECTED_ORIGIN} health, then run this command again.`;
  }
  return "Inspect the DevTools connection or network failure, then run this command again.";
}

function openProtocolConnection(endpoint, openTimeoutMs) {
  return new Promise((resolveConnection, rejectConnection) => {
    const socket = new WebSocket(endpoint);
    const timer = setTimeout(() => {
      socket.close();
      rejectConnection(new Error("connection timed out"));
    }, openTimeoutMs);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolveConnection(createProtocolConnection(socket));
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      rejectConnection(new Error("connection refused"));
    }, { once: true });
  });
}

function createProtocolConnection(socket) {
  let requestId = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message || "DevTools protocol error"));
    else request.resolve(message.result);
  });

  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("WeChat DevTools automation connection closed."));
    }
    pending.clear();
  });

  return {
    send(method, params = {}, requestTimeoutMs = timeout) {
      const id = String(++requestId);
      return new Promise((resolveRequest, rejectRequest) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectRequest(new Error(`${method} timed out.`));
        }, requestTimeoutMs);
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

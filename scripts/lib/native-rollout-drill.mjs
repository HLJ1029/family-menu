import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

export async function runNativeRollbackDrill({ root }) {
  const repositoryRoot = resolve(root);
  const householdId = "household-rollout";
  const userId = "user-rollout";
  const session = {
    accessToken: "session-rollout",
    expiresAt: Date.now() + 60_000,
    user: { id: userId, profileStatus: "complete" },
  };
  const serverFixture = {
    nativeShellEnabled: true,
    householdAllowlist: new Set([householdId]),
  };
  const bootstrapCapabilities = [];
  const authorizationHeaders = [];
  let requestCount = 0;
  let serverFixtureMutations = 0;

  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== "/bootstrap") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    requestCount += 1;
    authorizationHeaders.push(String(request.headers.authorization || ""));
    const nativeShellEnabled = (
      serverFixture.nativeShellEnabled
      && serverFixture.householdAllowlist.has(householdId)
    );
    bootstrapCapabilities.push(nativeShellEnabled);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      schemaVersion: 1,
      stateVersion: nativeShellEnabled ? "state-native-enabled" : "state-native-disabled",
      activeHouseholdId: householdId,
      capabilities: {
        nativeShellEnabled,
        mealExecutionEnabled: true,
      },
      user: {
        id: userId,
        profileStatus: "complete",
      },
    }));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const apiOrigin = `http://127.0.0.1:${address.port}`;
  const storage = new Map([
    ["humi:native-session:v1", session],
    ["humi:meal-run:v1:user-rollout", { status: "cooking", id: "meal-run-preserved" }],
  ]);
  const removedKeys = [];
  const switchTabRoutes = [];
  const relaunchRoutes = [];
  let bootExecutions = 0;

  const wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => {
      removedKeys.push(key);
      storage.delete(key);
    },
    request: (options) => requestThroughHttp(options),
    switchTab: ({ url }) => switchTabRoutes.push(url),
    reLaunch: ({ url }) => relaunchRoutes.push(url),
  };
  const app = {
    globalData: {
      humiSession: session,
      nativeShellCandidate: true,
    },
    setHumiSession(nextSession) {
      this.globalData.humiSession = nextSession;
    },
    clearHumiSession() {
      this.globalData.humiSession = null;
    },
  };

  try {
    const context = vm.createContext({
      Buffer,
      Date,
      JSON,
      Map,
      Math,
      Promise,
      Set,
      URL,
      clearTimeout,
      console,
      getApp: () => app,
      setTimeout,
      wx,
    });
    const config = {
      HUMI_NATIVE_SESSION_KEY: "humi:native-session:v1",
      getHumiApiBaseUrl: () => apiOrigin,
    };
    const errors = await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/utils/errors.js"),
      dependencies: {},
    });
    const sessionModule = await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/utils/session.js"),
      dependencies: {
        "./config": config,
        "./errors": errors,
      },
    });
    const requestModule = await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/utils/request.js"),
      dependencies: {
        "./config": config,
        "./errors": errors,
        "./session": sessionModule,
      },
    });
    sessionModule.__setRequestModule = requestModule;
    const cacheModule = await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/utils/cache.js"),
      dependencies: {},
    });
    const bootstrapModule = await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/utils/bootstrap.js"),
      dependencies: {
        "./cache": cacheModule,
        "./request": requestModule,
      },
    });
    const storeModule = await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/utils/store.js"),
      dependencies: {},
    });
    storeModule.appStore.replaceSession(session);

    let bootDefinition = null;
    context.Page = (definition) => {
      bootDefinition = definition;
    };
    await loadCommonJs({
      context,
      filename: resolve(repositoryRoot, "miniprogram/pages/boot/index.js"),
      dependencies: {
        "../../utils/bootstrap": bootstrapModule,
        "../../utils/store": storeModule,
        "../../utils/telemetry": {
          startSpan: () => ({ end: () => {} }),
        },
      },
    });
    if (!bootDefinition) throw new Error("real boot Page did not register");

    await executeBootPage(bootDefinition);
    serverFixture.nativeShellEnabled = false;
    serverFixtureMutations += 1;
    bootstrapModule.clearBootstrapCacheForUser(userId);
    await executeBootPage(bootDefinition);

    return {
      serverStarted: true,
      requestCount,
      bootstrapCapabilities,
      authorizationHeaders,
      bootExecutions,
      switchTabRoutes,
      relaunchRoutes,
      removedKeys,
      productCachePreserved: storage.get("humi:meal-run:v1:user-rollout")?.id === "meal-run-preserved",
      serverFixtureMutations,
      householdFixture: householdId,
      allowlistPreserved: (
        serverFixture.householdAllowlist.size === 1
        && serverFixture.householdAllowlist.has(householdId)
      ),
    };
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  async function executeBootPage(definition) {
    bootExecutions += 1;
    const page = {
      ...definition,
      data: { ...(definition.data || {}) },
      setData(patch) {
        Object.assign(this.data, patch || {});
      },
    };
    await page.onLoad({});
  }
}

async function loadCommonJs({ context, filename, dependencies }) {
  const source = await readFile(filename, "utf8");
  const module = { exports: {} };
  const wrapper = vm.runInContext(
    `(function(require, module, exports) {\n${source}\n})`,
    context,
    { filename },
  );
  wrapper(
    (specifier) => {
      if (Object.prototype.hasOwnProperty.call(dependencies, specifier)) {
        return dependencies[specifier];
      }
      throw new Error(`unexpected dependency ${specifier} from ${filename}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}

function requestThroughHttp(options = {}) {
  const request = httpRequest(options.url, {
    method: options.method || "GET",
    headers: options.header || {},
  }, (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        options.success?.({
          statusCode: response.statusCode || 0,
          data: body ? JSON.parse(body) : null,
        });
      } catch (error) {
        options.fail?.({ errMsg: error.message });
      }
    });
  });
  request.on("error", (error) => options.fail?.({ errMsg: error.message }));
  if (options.data !== undefined && options.method !== "GET") {
    request.write(JSON.stringify(options.data));
  }
  request.end();
  return request;
}

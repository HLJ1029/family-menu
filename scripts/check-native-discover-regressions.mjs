import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(new URL("..", import.meta.url).pathname);

const contentRoutes = await evaluateCommonJs(
  "miniprogram/utils/content-routes.js",
  {
    "./config": {
      getHumiH5Url: () => "https://www.humi-home.com/?channel=wechat-miniprogram&h5v=1.1.74&redirect=https%3A%2F%2Fevil.example",
    },
  },
);
const ticketedUrl = contentRoutes.buildTicketedH5ContentUrl(
  "recipe",
  { recipeId: "tomato-egg" },
  "one_time_ticket_123456",
);
const parsedTicketedUrl = new URL(ticketedUrl);
assert.equal(parsedTicketedUrl.origin, "https://www.humi-home.com");
assert.equal(parsedTicketedUrl.pathname, "/");
assert.deepEqual(
  [...parsedTicketedUrl.searchParams.keys()].sort(),
  ["channel", "contentRoute", "h5v", "humiTicket", "recipeId"].sort(),
  "native URL construction must retain only controlled base and content parameters",
);
assert.equal(parsedTicketedUrl.searchParams.get("redirect"), null);

const scheduled = new Map();
let timerSequence = 0;
const requests = [];
const discover = await loadPage(
  "miniprogram/pages/discover/index.js",
  {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/request": {
      rawRequest: async ({ path }) => {
        requests.push(path);
        return {
          recipes: [{
            id: path.includes(encodeURIComponent("鸡蛋")) ? "egg-result" : "old-result",
            title: path.includes(encodeURIComponent("鸡蛋")) ? "鸡蛋新结果" : "旧结果",
            category: "家常菜",
            minutes: 15,
            thumbnailUrl: "/assets/dishes/thumbs/tomato-egg.webp",
          }],
          nextCursor: null,
        };
      },
    },
    "../../utils/config": { getHumiApiBaseUrl: () => "https://api.humi-home.com" },
  },
  {
    setTimeout(callback) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, callback);
      return timerId;
    },
    clearTimeout(timerId) {
      scheduled.delete(timerId);
    },
  },
);

await discover.onLoad();
discover.onSearchInput({ detail: { value: "鸡蛋" } });
discover.selectCategory({ currentTarget: { dataset: { category: "全部" } } });
assert.equal(scheduled.size, 1, "tapping the selected category must not cancel a pending search");
await [...scheduled.values()][0]();
assert.equal(requests.length, 2);
assert.equal(discover.data.recipes[0].id, "egg-result");

let resolveOldRequest;
const staleDiscover = await loadPage(
  "miniprogram/pages/discover/index.js",
  {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/request": {
      rawRequest: () => new Promise((resolveRequest) => { resolveOldRequest = resolveRequest; }),
    },
    "../../utils/config": { getHumiApiBaseUrl: () => "https://api.humi-home.com" },
  },
  {
    setTimeout: () => 1,
    clearTimeout() {},
  },
);
const oldLoad = staleDiscover.onLoad();
staleDiscover.onSearchInput({ detail: { value: "鸡蛋" } });
resolveOldRequest({
  recipes: [{
    id: "stale-result",
    title: "旧结果",
    category: "家常菜",
    minutes: 15,
    thumbnailUrl: "/assets/dishes/thumbs/tomato-egg.webp",
  }],
  nextCursor: null,
});
await oldLoad;
assert.deepEqual(
  staleDiscover.data.recipes,
  [],
  "typing a new query must invalidate an in-flight response before the debounce fires",
);

console.log("Native Discover debounce and URL-runtime regressions passed.");

async function loadPage(relativePath, stubs, timerGlobals) {
  let definition;
  await evaluateCommonJs(relativePath, stubs, {
    Page(candidate) {
      definition = candidate;
    },
    wx: { navigateTo() {} },
    ...timerGlobals,
  });
  assert(definition, `${relativePath} must register a Page`);
  return instantiate(definition);
}

async function evaluateCommonJs(relativePath, stubs, globals = {}) {
  const filename = resolve(root, relativePath);
  const source = await readFile(filename, "utf8");
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(request) {
      if (Object.hasOwn(stubs, request)) return stubs[request];
      throw new Error(`Unexpected require ${request} from ${relativePath}`);
    },
    console,
    ...globals,
  };
  vm.runInNewContext(source, sandbox, { filename });
  return module.exports;
}

function instantiate(definition) {
  return {
    ...definition,
    data: structuredClone(definition.data || {}),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}

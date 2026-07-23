import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { parseH5ContentEntry } from "../src/lib/contentEntry.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const scratch = await mkdtemp(join(tmpdir(), "humi-native-primary-tabs-"));
process.env.HUMI_API_DATA_FILE = join(scratch, "data.json");
process.env.HUMI_SESSION_SECRET = "native-primary-tabs-test-secret";
const { createHumiApiServer } = await import("../api/server.js");
const server = createHumiApiServer();
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));

try {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  const firstPage = await fetch(`${origin}/recipes`);
  assert.equal(firstPage.status, 200, "GET /recipes must be guest readable");
  assert.equal(firstPage.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=86400");
  const firstPayload = await firstPage.json();
  assert.equal(firstPayload.recipes.length, 20);
  assert.deepEqual(
    Object.keys(firstPayload.recipes[0]).sort(),
    ["category", "id", "minutes", "thumbnailUrl", "title"].sort(),
    "feed summaries must expose only five allowlisted fields",
  );
  assert.equal(typeof firstPayload.nextCursor, "string");
  assert.match(firstPayload.recipes[0].thumbnailUrl, /^\/assets\/dishes\/thumbs\/[A-Za-z0-9_-]+\.webp$/);

  const capped = await fetch(`${origin}/recipes?limit=999&cursor=0`);
  assert.equal((await capped.json()).recipes.length, 40, "limit must be capped at 40");
  const defaulted = await fetch(`${origin}/recipes?limit=-3&cursor=not-a-cursor`);
  assert.equal((await defaulted.json()).recipes.length, 20, "invalid limit and cursor use safe defaults");
  const malformedLimit = await fetch(`${origin}/recipes?limit=3oops`);
  assert.equal((await malformedLimit.json()).recipes.length, 20, "partially numeric limits must not bypass the default");
  const malformedCursorPayload = await (await fetch(`${origin}/recipes?limit=5&cursor=5oops`)).json();
  assert.equal(malformedCursorPayload.recipes[0].id, firstPayload.recipes[0].id, "partially numeric cursors reset safely");
  const secondPage = await fetch(`${origin}/recipes?limit=5&cursor=5`);
  const secondPayload = await secondPage.json();
  assert.equal(secondPayload.recipes.length, 5);
  assert.notEqual(secondPayload.recipes[0].id, firstPayload.recipes[0].id);
  const category = encodeURIComponent(firstPayload.recipes[0].category);
  const categoryPayload = await (await fetch(`${origin}/recipes?category=${category}&limit=40`)).json();
  assert(categoryPayload.recipes.length > 0);
  assert(categoryPayload.recipes.every((recipe) => recipe.category === firstPayload.recipes[0].category));
  const longQuery = `${firstPayload.recipes[0].title}${" ".repeat(40)}不应进入服务端查询`;
  const queryPayload = await (await fetch(`${origin}/recipes?query=${encodeURIComponent(longQuery)}&limit=40`)).json();
  assert(
    queryPayload.recipes.some((recipe) => recipe.id === firstPayload.recipes[0].id),
    "query must be normalized to at most 40 characters before matching",
  );
  const longCategory = `${firstPayload.recipes[0].category}${" ".repeat(40)}不应进入筛选`;
  const longCategoryPayload = await (await fetch(`${origin}/recipes?category=${encodeURIComponent(longCategory)}&limit=40`)).json();
  assert(longCategoryPayload.recipes.length > 0, "category must be normalized to at most 40 characters before matching");

  const imageComponent = await loadComponent("miniprogram/components/image-with-fallback/index.js");
  assert.equal(imageComponent.data.state, "placeholder");
  imageComponent.resetSource("https://api.humi-home.com/assets/dishes/thumbs/tomato-egg.webp");
  imageComponent.onLoad();
  assert.equal(imageComponent.data.state, "loaded");
  imageComponent.onError();
  assert.equal(imageComponent.data.state, "fallback");
  imageComponent.retry();
  assert.equal(imageComponent.data.state, "placeholder");
  const retrySource = imageComponent.data.imageSource;
  imageComponent.onError();
  imageComponent.retry();
  assert.equal(imageComponent.data.imageSource, retrySource, "a failed thumbnail may be retried only once");

  const contentRoutes = await loadModule("miniprogram/utils/content-routes.js", {
    "./config": { getHumiH5Url: () => "https://www.humi-home.com/" },
  });
  assert.equal(contentRoutes.buildAllowedContentUrl("recipe", { recipeId: "tomato-egg" }), "/recipe/tomato-egg");
  assert.equal(contentRoutes.buildAllowedContentUrl("stats", {}), "/stats");
  assert.equal(contentRoutes.buildAllowedContentUrl("history", {}), "/history");
  const ticketedRecipeUrl = new URL(contentRoutes.buildTicketedH5ContentUrl(
    "recipe",
    { recipeId: "tomato-egg" },
    "one_time_ticket_123456",
  ));
  assert.equal(ticketedRecipeUrl.pathname, "/", "GitHub Pages content entry must not use a direct nested path that returns 404");
  assert.deepEqual(
    [...ticketedRecipeUrl.searchParams.keys()].sort(),
    ["contentRoute", "humiTicket", "recipeId"].sort(),
    "the H5 entry URL contains only the controlled route payload and short-lived ticket",
  );
  assert.equal(ticketedRecipeUrl.searchParams.get("contentRoute"), "recipe");
  assert.equal(ticketedRecipeUrl.searchParams.get("recipeId"), "tomato-egg");
  assert.equal(ticketedRecipeUrl.searchParams.has("accessToken"), false);
  const ticketedStatsUrl = new URL(contentRoutes.buildTicketedH5ContentUrl("stats", {}, "one_time_ticket_123456"));
  const ticketedHistoryUrl = new URL(contentRoutes.buildTicketedH5ContentUrl("history", {}, "one_time_ticket_123456"));
  assert.deepEqual(parseH5ContentEntry(ticketedRecipeUrl.search), {
    route: "recipe",
    initialView: "library",
    recipeId: "tomato-egg",
  });
  assert.deepEqual(parseH5ContentEntry(ticketedStatsUrl.search), {
    route: "stats",
    initialView: "stats",
    recipeId: null,
  });
  assert.deepEqual(parseH5ContentEntry(ticketedHistoryUrl.search), {
    route: "history",
    initialView: "stats",
    recipeId: null,
  });
  assert.equal(parseH5ContentEntry("?contentRoute=recipe&recipeId=tomato-egg&redirect=https://evil.example"), null);
  for (const [route, params] of [
    ["https://evil.example", {}],
    ["javascript:alert(1)", {}],
    ["unknown", {}],
    ["recipe", { recipeId: "tomato-egg#script" }],
    ["recipe", { recipeId: "tomato-egg", extra: "arbitrary" }],
    ["stats", { query: "arbitrary" }],
  ]) {
    assert.throws(() => contentRoutes.buildAllowedContentUrl(route, params), /content_route_invalid/);
  }

  const discover = await loadPage("miniprogram/pages/discover/index.js", {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/request": {
      rawRequest: async () => ({
        recipes: [{
          id: "tomato-egg",
          title: "西红柿炒鸡蛋",
          category: "家常菜",
          minutes: 15,
          thumbnailUrl: "/assets/dishes/thumbs/tomato-egg.webp",
        }],
        nextCursor: null,
      }),
    },
    "../../utils/config": { getHumiApiBaseUrl: () => "https://api.humi-home.com" },
  });
  await discover.onLoad();
  assert.equal(discover.data.recipes[0].thumbnailUrl, "https://api.humi-home.com/assets/dishes/thumbs/tomato-egg.webp");
  discover.onSearchInput({ detail: { value: `鸡蛋${"a".repeat(80)}` } });
  assert.equal(discover.data.query.length, 40);
  assert.equal(discover._searchDelayMs, 250);
  discover.selectCategory({ currentTarget: { dataset: { category: "家常菜" } } });
  assert.equal(discover.data.category, "家常菜");

  const pendingRequests = [];
  const staleDiscover = await loadPage("miniprogram/pages/discover/index.js", {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/request": {
      rawRequest: (options) => new Promise((resolveRequest) => pendingRequests.push({ options, resolveRequest })),
    },
    "../../utils/config": { getHumiApiBaseUrl: () => "https://api.humi-home.com" },
  });
  const initialLoad = staleDiscover.onLoad();
  pendingRequests[0].resolveRequest({
    recipes: [{ id: "old-first", title: "旧筛选首项", category: "家常菜", minutes: 20, thumbnailUrl: "/assets/dishes/thumbs/old-first.webp" }],
    nextCursor: "20",
  });
  await initialLoad;
  const staleLoadMore = staleDiscover.loadMore();
  const newSearch = staleDiscover.loadFirstPage({ query: "鸡蛋" });
  pendingRequests[2].resolveRequest({
    recipes: [{ id: "new-query", title: "鸡蛋新结果", category: "家常菜", minutes: 15, thumbnailUrl: "/assets/dishes/thumbs/new-query.webp" }],
    nextCursor: null,
  });
  await newSearch;
  pendingRequests[1].resolveRequest({
    recipes: [{ id: "stale-more", title: "旧分页结果", category: "家常菜", minutes: 30, thumbnailUrl: "/assets/dishes/thumbs/stale-more.webp" }],
    nextCursor: null,
  });
  await staleLoadMore;
  assert.deepEqual(
    staleDiscover.data.recipes.map((recipe) => recipe.id),
    ["new-query"],
    "an old pagination response must not overwrite a newer filter or search generation",
  );

  const guestRecipePage = await loadPage("miniprogram/packageContent/pages/recipe/index.js", {
    "../../../utils/request": {
      requestHumi: async () => {
        const error = new Error("invalid_session");
        error.code = "invalid_session";
        throw error;
      },
    },
    "../../../utils/content-routes": contentRoutes,
  });
  await guestRecipePage.onLoad({ recipeId: "tomato-egg" });
  assert.equal(guestRecipePage.data.status, "error", "a guest recipe tap must leave loading state when no H5 ticket can be issued");
  assert.equal(guestRecipePage.data.url, "");
  assert.match(guestRecipePage.data.errorText, /登录|重试/);

  const webContentSource = await readFile(join(root, "miniprogram/packageContent/pages/web-content/index.js"), "utf8");
  assert.match(webContentSource, /auth\/h5-ticket/);
  assert.doesNotMatch(webContentSource, /[?&](?:accessToken|token)=/);
  assert.doesNotMatch(webContentSource, /options\.(?:url|src)/);
  const h5Source = await readFile(join(root, "src/main.jsx"), "utf8");
  assert.match(h5Source, /getInitialContentRecipeId/);
  assert.match(h5Source, /parseH5ContentEntry/);

  const discoverMarkup = await readFile(join(root, "miniprogram/pages/discover/index.wxml"), "utf8");
  assert.match(discoverMarkup, /dish-card/);
  assert.match(discoverMarkup, /wx:for/);
  const imageMarkup = await readFile(join(root, "miniprogram/components/image-with-fallback/index.wxml"), "utf8");
  assert.match(imageMarkup, /humi-dish-placeholder/);
  assert.match(imageMarkup, /bindload="onLoad"/);
  assert.match(imageMarkup, /binderror="onError"/);

  console.log("Native Discover, recipe summaries, image fallback, and isolated H5 content routes passed.");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(scratch, { recursive: true, force: true });
}

async function loadComponent(relativePath) {
  let definition;
  await evaluateCommonJs(relativePath, {}, {
    Component: (candidate) => { definition = candidate; },
  });
  assert(definition, `${relativePath} must register a Component`);
  return instantiate(definition);
}

async function loadPage(relativePath, stubs) {
  let definition;
  await evaluateCommonJs(relativePath, stubs, {
    Page: (candidate) => { definition = candidate; },
    wx: { navigateTo() {} },
  });
  assert(definition, `${relativePath} must register a Page`);
  return instantiate(definition);
}

async function loadModule(relativePath, stubs) {
  return evaluateCommonJs(relativePath, stubs);
}

async function evaluateCommonJs(relativePath, stubs, globals = {}) {
  const filename = join(root, relativePath);
  const source = await readFile(filename, "utf8");
  const module = { exports: {} };
  const sandbox = {
    ...globals,
    module,
    exports: module.exports,
    require: (request) => {
      if (Object.hasOwn(stubs, request)) return stubs[request];
      throw new Error(`Unexpected require ${request} from ${relativePath}`);
    },
    setTimeout,
    clearTimeout,
    URL,
    console,
  };
  vm.runInNewContext(source, sandbox, { filename });
  return module.exports;
}

function instantiate(definition) {
  const instance = {
    ...definition.methods,
    ...Object.fromEntries(Object.entries(definition).filter(([key]) => !["data", "methods", "properties"].includes(key))),
    data: structuredClone(definition.data || {}),
    properties: Object.fromEntries(Object.entries(definition.properties || {}).map(([key, value]) => [key, value?.value])),
    setData(patch) { Object.assign(this.data, patch); },
    triggerEvent() {},
  };
  for (const method of Object.values(instance)) {
    if (typeof method === "function") method.bind(instance);
  }
  return instance;
}

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
process.env.HUMI_WECHAT_MOCK = "1";
process.env.HUMI_MEAL_EXECUTION_ENABLED = "1";
process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS = "*";
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

  const householdState = await loadModule("miniprogram/utils/household-state.js", {
    "./request": {
      requestHumi: async (options) => options,
    },
  });
  const derivedItems = householdState.deriveGroceryItems({
    "2026-07-24": {
      dinner: [{
        recipeId: "tomato-egg",
        title: "西红柿炒鸡蛋",
        minutes: 15,
        ingredients: [
          { name: "鸡蛋", amount: 3, unit: "个" },
          { name: "西红柿", amount: 2, unit: "个" },
        ],
      }],
    },
  }, [{ name: "西红柿", status: "maybe" }]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(derivedItems.map((item) => [item.name, item.status]))),
    [["鸡蛋", "pending"], ["西红柿", "maybe_home"]],
    "the grocery list must derive deterministic pending and maybe-at-home groups from the meal plan",
  );
  const mealDays = householdState.buildMealDays({
    "2026-07-24": {
      dinner: [{
        recipeId: "tomato-egg",
        ingredients: [{ name: "鸡蛋" }, { name: "西红柿" }],
      }],
    },
  }, { startDate: "2026-07-24", pantrySignals: [{ name: "西红柿" }] });
  assert.equal(mealDays[0].missingIngredientsText, "鸡蛋", "WXML receives preformatted missing-ingredient text");
  const patchRequest = await householdState.saveHouseholdStatePatch(
    { mealPlan: { "2026-07-24": { dinner: [{ recipeId: "tomato-egg" }] } } },
    { householdId: "household-1", stateVersion: "state-v1", idempotencyKey: "plan-save-1" },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(patchRequest)), {
    path: "/state",
    method: "PUT",
    data: {
      householdId: "household-1",
      patch: { mealPlan: { "2026-07-24": { dinner: [{ recipeId: "tomato-egg" }] } } },
    },
    stateVersion: "state-v1",
    idempotencyKey: "plan-save-1",
  });

  const ownerBootstrap = buildNativeBootstrap({ role: "owner" });
  const ownerRequests = [];
  const ownerPlan = await loadPage("miniprogram/pages/plan/index.js", {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/store": { appStore: { getState: () => ({ bootstrap: ownerBootstrap }), replaceBootstrap: () => {} } },
    "../../utils/household-state": {
      buildMealDays: householdState.buildMealDays,
      createMutationId: () => "owner-plan-patch",
      getActiveHousehold: householdState.getActiveHousehold,
      getHouseholdRole: householdState.getHouseholdRole,
      saveHouseholdStatePatch: async (patch, context) => {
        ownerRequests.push({ patch, context });
        return buildNativeBootstrap({ role: "owner", stateVersion: "state-v2", mealPlan: patch.mealPlan });
      },
    },
  });
  ownerPlan.syncState();
  assert.equal(ownerPlan.data.canEditMenu, true);
  await ownerPlan.replaceDinner({
    currentTarget: {
      dataset: {
        dateKey: "2026-07-24",
        recipeId: "tomato-egg",
      },
    },
  });
  assert.equal(ownerRequests.length, 1, "an owner may replace dinner through a versioned state patch");

  const memberBootstrap = buildNativeBootstrap({ role: "member" });
  const memberPlan = await loadPage("miniprogram/pages/plan/index.js", {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/store": { appStore: { getState: () => ({ bootstrap: memberBootstrap }), replaceBootstrap: () => {} } },
    "../../utils/household-state": {
      buildMealDays: householdState.buildMealDays,
      createMutationId: () => "member-plan-patch",
      getActiveHousehold: householdState.getActiveHousehold,
      getHouseholdRole: householdState.getHouseholdRole,
      saveHouseholdStatePatch: async () => {
        throw new Error("member page must not send a menu mutation");
      },
    },
  });
  memberPlan.syncState();
  assert.equal(memberPlan.data.canEditMenu, false);
  await assert.rejects(() => memberPlan.replaceDinner({
    currentTarget: { dataset: { dateKey: "2026-07-24", recipeId: "tomato-egg" } },
  }), /forbidden/);

  const conflictEnvelope = buildNativeBootstrap({ role: "owner", stateVersion: "state-v3" });
  const conflictPlan = await loadPage("miniprogram/pages/plan/index.js", {
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/store": {
      appStore: {
        getState: () => ({ bootstrap: ownerBootstrap }),
        replaceBootstrap: (envelope) => { conflictPlan._replacedEnvelope = envelope; },
      },
    },
    "../../utils/household-state": {
      buildMealDays: householdState.buildMealDays,
      createMutationId: () => "conflict-plan-patch",
      getActiveHousehold: householdState.getActiveHousehold,
      getHouseholdRole: householdState.getHouseholdRole,
      saveHouseholdStatePatch: async () => {
        const error = new Error("state version conflict");
        error.status = 409;
        error.code = "state_version_conflict";
        error.latestEnvelope = conflictEnvelope;
        throw error;
      },
    },
  });
  conflictPlan.syncState();
  await conflictPlan.replaceDinner({
    currentTarget: { dataset: { dateKey: "2026-07-24", recipeId: "tomato-egg" } },
  });
  assert.equal(conflictPlan.data.conflictVisible, true);
  assert.equal(conflictPlan.data.stateVersion, conflictEnvelope.stateVersion);
  assert.equal(conflictPlan._replacedEnvelope, conflictEnvelope);

  const ownerLogin = await loginNativeUser(origin, "owner");
  const memberLogin = await loginNativeUser(origin, "member");
  const ownerHousehold = await apiRequest(origin, "/households", {
    method: "POST",
    token: ownerLogin.accessToken,
    expectedStatus: 201,
    body: { householdName: "原生计划测试家", memberName: "主理人" },
  });
  const invite = await apiRequest(origin, "/household-invites", {
    method: "POST",
    token: ownerLogin.accessToken,
    expectedStatus: 201,
    body: { householdId: ownerHousehold.family.id },
  });
  const joinedHousehold = await apiRequest(origin, `/household-invites/${invite.invite.token}/join`, {
    method: "POST",
    token: memberLogin.accessToken,
    body: { memberName: "伪造的正式昵称" },
  });
  assert.equal(
    joinedHousehold.family.members.find((member) => member.memberId === memberLogin.user.id)?.nickname,
    "家人",
    "formal invite membership must use the authenticated profile instead of client memberName",
  );
  const householdMealRun = await apiRequest(origin, "/meal-runs", {
    method: "POST",
    token: ownerLogin.accessToken,
    expectedStatus: 201,
    body: {
      householdId: ownerHousehold.family.id,
      dateKey: "2026-07-24",
      mealSlot: "dinner",
      effortTier: "quick_15",
      recipeIds: ["tomato-egg"],
      idempotencyKey: "household-control-meal-run",
    },
  });
  const emptyMealTasks = await apiRequest(origin, `/meal-runs/${householdMealRun.mealRun.id}/tasks`, {
    token: memberLogin.accessToken,
  });
  assert.deepEqual(emptyMealTasks.tasks, [], "a formal member sees an explicit empty task list");
  await apiRequest(origin, `/meal-runs/${householdMealRun.mealRun.id}/start`, {
    method: "POST",
    token: ownerLogin.accessToken,
    body: {},
  });
  await apiRequest(origin, `/meal-runs/${householdMealRun.mealRun.id}/tasks`, {
    method: "POST",
    token: ownerLogin.accessToken,
    expectedStatus: 201,
    body: { type: "buy", ingredientName: "鸡蛋" },
  });
  const householdMealTasks = await apiRequest(origin, `/meal-runs/${householdMealRun.mealRun.id}/tasks`, {
    token: memberLogin.accessToken,
  });
  assert.equal(householdMealTasks.tasks.length, 1);
  assert.deepEqual(
    Object.keys(householdMealTasks.tasks[0]).sort(),
    ["completedAt", "completedBy", "createdAt", "createdBy", "id", "label", "sourceId", "status", "type", "updatedAt", "claimedAt", "claimedBy"].sort(),
    "household task summaries must omit share tokens and unrelated execution internals",
  );
  const outsiderLogin = await loginNativeUser(origin, "outsider");
  const forbiddenMealTasks = await apiRequest(origin, `/meal-runs/${householdMealRun.mealRun.id}/tasks`, {
    token: outsiderLogin.accessToken,
    expectedStatus: 404,
  });
  assert.equal(forbiddenMealTasks.code, "meal_run_not_found");
  const missingMealTasks = await apiRequest(origin, `/meal-runs/${"0".repeat(32)}/tasks`, {
    token: ownerLogin.accessToken,
    expectedStatus: 404,
  });
  assert.equal(missingMealTasks.code, "meal_run_not_found");
  const legacySaved = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    body: {
      state: {
        mealPlan: {
          "2026-07-24": {
            breakfast: [],
            lunch: [],
            dinner: [{ recipeId: "tomato-egg", quantity: 1 }],
          },
        },
      },
    },
  });
  assert.equal(
    legacySaved.state.mealPlan["2026-07-24"].dinner[0].recipeId,
    "tomato-egg",
    "legacy H5 full-state saves remain compatible without If-Match",
  );
  const ownerState = await apiRequest(origin, "/state", { token: ownerLogin.accessToken });
  assert.equal(typeof ownerState.stateVersion, "string");
  assert(ownerState.stateVersion.length > 20);
  const ownerPatch = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: ownerState.stateVersion,
    idempotencyKey: "owner-plan-patch",
    body: {
      householdId: ownerHousehold.family.id,
      patch: {
        mealPlan: {
          "2026-07-24": {
            breakfast: [],
            lunch: [],
            dinner: [{ recipeId: "potato-shreds", quantity: 1 }],
          },
        },
      },
    },
  });
  assert.equal(ownerPatch.householdState.mealPlan["2026-07-24"].dinner[0].recipeId, "potato-shreds");
  const ownerPatchReplay = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: ownerState.stateVersion,
    idempotencyKey: "owner-plan-patch",
    body: {
      householdId: ownerHousehold.family.id,
      patch: {
        mealPlan: {
          "2026-07-24": {
            breakfast: [],
            lunch: [],
            dinner: [{ recipeId: "potato-shreds", quantity: 1 }],
          },
        },
      },
    },
  });
  assert.equal(ownerPatchReplay.stateVersion, ownerPatch.stateVersion, "same idempotency key must replay safely");
  const staleConflict = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: ownerState.stateVersion,
    idempotencyKey: "stale-plan-patch",
    expectedStatus: 409,
    body: { householdId: ownerHousehold.family.id, patch: { checkedItems: { "ingredient:egg": true } } },
  });
  assert.equal(staleConflict.code, "state_version_conflict");
  assert.equal(staleConflict.latestEnvelope.stateVersion, ownerPatch.stateVersion);
  const memberState = await apiRequest(origin, "/state", { token: memberLogin.accessToken });
  const memberLegacyAttempt = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    body: {
      state: {
        mealPlan: {
          "2026-07-24": {
            breakfast: [],
            lunch: [],
            dinner: [{ recipeId: "member-overwrite", quantity: 1 }],
          },
        },
      },
    },
  });
  assert.equal(
    memberLegacyAttempt.state.mealPlan["2026-07-24"].dinner[0].recipeId,
    "potato-shreds",
    "a member cannot bypass owner-only menu permissions through the legacy full-state endpoint",
  );
  const memberStateAfterLegacy = await apiRequest(origin, "/state", { token: memberLogin.accessToken });
  const memberStateVersion = memberStateAfterLegacy.stateVersion;
  const forbiddenMemberMenu = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    stateVersion: memberStateVersion,
    idempotencyKey: "member-menu-patch",
    expectedStatus: 403,
    body: {
      householdId: ownerHousehold.family.id,
      patch: { mealPlan: { "2026-07-24": { breakfast: [], lunch: [], dinner: [] } } },
    },
  });
  assert.equal(forbiddenMemberMenu.code, "forbidden");
  const forbiddenSpoofedClaim = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    stateVersion: memberStateVersion,
    idempotencyKey: "member-spoofed-claim",
    expectedStatus: 403,
    body: {
      householdId: ownerHousehold.family.id,
      patch: {
        groceryClaims: {
          "ingredient:egg": {
            itemKey: "ingredient:egg",
            itemName: "鸡蛋",
            memberId: ownerLogin.user.id,
            memberName: "伪造主理人",
            status: "claimed",
          },
        },
      },
    },
  });
  assert.equal(forbiddenSpoofedClaim.code, "forbidden");
  const ownerPreferenceSnapshot = await apiRequest(origin, "/state", { token: ownerLogin.accessToken });
  const memberClaim = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    stateVersion: memberStateVersion,
    idempotencyKey: "member-own-claim",
    body: {
      householdId: ownerHousehold.family.id,
      patch: {
        groceryClaims: {
          "ingredient:egg": {
            itemKey: "ingredient:egg",
            itemName: "鸡蛋",
            memberId: memberLogin.user.id,
            memberName: "伪造昵称",
            status: "claimed",
          },
        },
      },
    },
  });
  assert.equal(memberClaim.householdState.groceryClaims["ingredient:egg"].memberId, memberLogin.user.id);
  assert.equal(
    memberClaim.householdState.groceryClaims["ingredient:egg"].memberName,
    "家人",
    "claimant display identity must come from the authenticated profile",
  );
  const memberCheck = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    stateVersion: memberClaim.stateVersion,
    idempotencyKey: "member-item-check",
    body: {
      householdId: ownerHousehold.family.id,
      patch: { checkedItems: { "ingredient:egg": true } },
    },
  });
  assert.equal(memberCheck.householdState.checkedItems["ingredient:egg"], true, "formal members may check grocery items");
  const completeFamilyProfile = {
    planningMode: "weekly",
    familySize: 3,
    hasChildren: false,
    tastePreferences: [],
    goals: ["省时"],
    dislikes: ["香菜"],
    allergies: ["花生"],
    shoppingTolerance: "medium",
  };
  const staleOwnerPreferences = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: ownerPreferenceSnapshot.stateVersion,
    idempotencyKey: "stale-owner-family-profile",
    expectedStatus: 409,
    body: {
      householdId: ownerHousehold.family.id,
      patch: { familyProfile: completeFamilyProfile },
    },
  });
  assert.equal(staleOwnerPreferences.code, "state_version_conflict");
  assert.equal(
    staleOwnerPreferences.latestEnvelope.householdState.checkedItems["ingredient:egg"],
    true,
    "a stale owner preference save must return and preserve the member's newer grocery state",
  );
  assert.equal(
    staleOwnerPreferences.latestEnvelope.householdState.groceryClaims["ingredient:egg"].memberId,
    memberLogin.user.id,
  );
  const forbiddenMemberProfile = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    stateVersion: memberCheck.stateVersion,
    idempotencyKey: "member-family-profile",
    expectedStatus: 403,
    body: {
      householdId: ownerHousehold.family.id,
      patch: { familyProfile: completeFamilyProfile },
    },
  });
  assert.equal(forbiddenMemberProfile.code, "forbidden", "only the owner may patch the household family profile");
  const refreshedOwnerPreferences = await apiRequest(origin, "/state", { token: ownerLogin.accessToken });
  const savedOwnerPreferences = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: refreshedOwnerPreferences.stateVersion,
    idempotencyKey: "fresh-owner-family-profile",
    body: {
      householdId: ownerHousehold.family.id,
      patch: {
        familyProfile: {
          ...completeFamilyProfile,
          activeCraveRequest: { token: "must-not-enter-family-profile" },
        },
      },
    },
  });
  assert.deepEqual(savedOwnerPreferences.householdState.familyProfile.dislikes, ["香菜"]);
  assert.deepEqual(savedOwnerPreferences.householdState.familyProfile.allergies, ["花生"]);
  assert.equal(Object.hasOwn(savedOwnerPreferences.householdState.familyProfile, "activeCraveRequest"), false);
  assert.equal(
    savedOwnerPreferences.householdState.checkedItems["ingredient:egg"],
    true,
    "retrying the narrow profile patch must not replace the member's checked items",
  );
  assert.equal(
    savedOwnerPreferences.householdState.groceryClaims["ingredient:egg"].memberId,
    memberLogin.user.id,
    "retrying the narrow profile patch must not replace the member's grocery claim",
  );
  const invalidFamilyProfilePatch = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: savedOwnerPreferences.stateVersion,
    idempotencyKey: "invalid-family-profile-shape",
    expectedStatus: 400,
    body: {
      householdId: ownerHousehold.family.id,
      patch: { familyProfile: "not-an-object" },
    },
  });
  assert.equal(invalidFamilyProfilePatch.code, "state_patch_invalid");
  const memberShare = await apiRequest(origin, "/grocery-share-requests", {
    method: "POST",
    token: memberLogin.accessToken,
    expectedStatus: 201,
    body: {
      idempotencyKey: "member-readonly-share",
      householdId: ownerHousehold.family.id,
      title: "当前只读清单",
      items: [{ id: "ingredient:egg", name: "鸡蛋", amount: "3 个", checked: true }],
    },
  });
  const publicMemberShare = await apiRequest(origin, `/grocery-share-requests/${memberShare.request.token}`);
  assert.equal(publicMemberShare.request.items[0].name, "鸡蛋", "formal members may share a read-only snapshot");
  assert.equal(publicMemberShare.request.items[0].checked, true);
  const missingPrecondition = await apiRequest(origin, "/state", {
    method: "PUT",
    token: memberLogin.accessToken,
    idempotencyKey: "missing-state-precondition",
    expectedStatus: 428,
    body: {
      householdId: ownerHousehold.family.id,
      patch: { checkedItems: { "ingredient:egg": false } },
    },
  });
  assert.equal(missingPrecondition.code, "state_precondition_required");
  const unknownPatchField = await apiRequest(origin, "/state", {
    method: "PUT",
    token: ownerLogin.accessToken,
    stateVersion: memberCheck.stateVersion,
    idempotencyKey: "unknown-state-field",
    expectedStatus: 400,
    body: {
      householdId: ownerHousehold.family.id,
      patch: { arbitraryProfile: { familySize: 99 } },
    },
  });
  assert.equal(unknownPatchField.code, "state_patch_invalid");

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
  const planMarkup = await readFile(join(root, "miniprogram/pages/plan/index.wxml"), "utf8");
  assert.match(planMarkup, /meal-day/);
  assert.match(planMarkup, /can-edit/);
  const mealDayMarkup = await readFile(join(root, "miniprogram/components/meal-day/index.wxml"), "utf8");
  assert.match(mealDayMarkup, /missingIngredientsText/);
  assert.doesNotMatch(mealDayMarkup, /\.(?:join|map|filter|reduce|slice|includes)\(/, "WXML must bind precomputed fields");
  const groceryMarkup = await readFile(join(root, "miniprogram/pages/grocery/index.wxml"), "utf8");
  assert.match(groceryMarkup, /grocery-item/);
  assert.match(groceryMarkup, /分享只读清单/);

  const noHouseholdBootstrap = {
    schemaVersion: 1,
    stateVersion: "empty-household-v1",
    user: { id: "owner-1", displayName: "主理人" },
    activeHouseholdId: "",
    households: [],
    householdState: null,
    currentMealRun: null,
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
  };
  const familyRequests = [];
  const replacementBootstrap = buildNativeBootstrap({ role: "owner", stateVersion: "state-v2" });
  const familyPageStubs = (bootstrap) => ({
    "../../utils/native-shell-guard": { guardNativeTab: () => true },
    "../../utils/store": { appStore: { getState: () => ({ bootstrap }), replaceBootstrap: () => {} } },
    "../../utils/bootstrap": { loadBootstrap: async () => replacementBootstrap },
    "../../utils/request": {
      requestHumi: async (options) => {
        familyRequests.push(options);
        if (options.path.endsWith("/collaborations?limit=5")) {
          return {
            events: Array.from({ length: 7 }, (_, index) => ({
              id: `event-${index}`,
              participant: { displayName: index === 0 ? "游客 1" : "主理人", avatarUrl: "" },
              actionType: "crave_vote",
              createdAt: `2026-07-2${index}T10:00:00.000Z`,
              payload: { feelingTag: "清淡" },
            })),
          };
        }
        if (options.path.endsWith("/tasks")) {
          return {
            tasks: [
              { id: "task-open", label: "买鸡蛋", status: "open", createdByName: "主理人" },
              { id: "task-claimed", label: "洗青菜", status: "claimed", claimedByName: "家人" },
            ],
          };
        }
        if (options.path === "/household-invites") {
          return { invite: { token: "a".repeat(32), householdName: "测试家", inviterName: "主理人" } };
        }
        return {};
      },
    },
  });
  const noFamilyPage = await loadPage(
    "miniprogram/pages/family/index.js",
    familyPageStubs(noHouseholdBootstrap),
  );
  noFamilyPage.syncState();
  assert.equal(noFamilyPage.data.primaryAction, "创建一个家");
  assert.equal(noFamilyPage.data.secondaryAction, "我有邀请");
  assert.equal(noFamilyPage.data.activeHousehold, null, "reading My Home must not create a household");

  const familyRoutes = [];
  const ownerFamilyPage = await loadPage(
    "miniprogram/pages/family/index.js",
    familyPageStubs(buildNativeBootstrap({ role: "owner" })),
    { wx: { navigateTo: ({ url }) => familyRoutes.push(url) } },
  );
  ownerFamilyPage.syncState();
  assert.equal(ownerFamilyPage.data.canOpenSettings, true);
  assert.equal(ownerFamilyPage.data.canStartCooking, true);
  await ownerFamilyPage.prepareInvite();
  assert.equal(
    familyRoutes.at(-1),
    "/packageFamily/pages/invite/index?mode=prepare&householdId=household-1",
    "the household owner must stay in the native invitation flow",
  );

  const memberFamilyPage = await loadPage(
    "miniprogram/pages/family/index.js",
    familyPageStubs(buildNativeBootstrap({ role: "member" })),
  );
  memberFamilyPage.syncState();
  assert.equal(memberFamilyPage.data.canOpenSettings, false);
  assert.equal(memberFamilyPage.data.canStartCooking, true);

  const multiHouseholdBootstrap = buildNativeBootstrap({ role: "owner" });
  multiHouseholdBootstrap.households.push({
    id: "household-2",
    name: "爸妈家",
    ownerId: "owner-1",
    role: "owner",
    members: [{ id: "owner-1", displayName: "主理人", role: "owner" }],
  });
  const multiFamilyPage = await loadPage(
    "miniprogram/pages/family/index.js",
    familyPageStubs(multiHouseholdBootstrap),
  );
  multiFamilyPage.syncState();
  assert.equal(multiFamilyPage.data.householdOptions.length, 2);
  assert.equal(multiFamilyPage.data.householdOptions[0].isActive, true);
  assert.equal(multiFamilyPage.data.householdOptions[1].isActive, false);

  familyRequests.length = 0;
  await multiFamilyPage.switchHousehold({ currentTarget: { dataset: { householdId: "household-2" } } });
  assert.deepEqual(JSON.parse(JSON.stringify(familyRequests[0])), {
    path: "/households/active",
    method: "POST",
    data: { householdId: "household-2" },
    idempotencyKey: familyRequests[0].idempotencyKey,
  });
  assert.match(familyRequests[0].idempotencyKey, /^household-switch:/);

  const activeDinnerBootstrap = buildNativeBootstrap({ role: "owner" });
  activeDinnerBootstrap.currentMealRun = {
    id: "meal-run-1",
    status: "cooking",
    startedBy: "member-1",
    createdBy: "owner-1",
    recipeSnapshot: [{ title: "西红柿炒鸡蛋" }],
  };
  activeDinnerBootstrap.householdState.groceryClaims = {
    eggs: { itemKey: "eggs", itemName: "鸡蛋", memberId: "member-1", memberName: "家人", status: "claimed" },
  };
  const activeFamilyPage = await loadPage(
    "miniprogram/pages/family/index.js",
    familyPageStubs(activeDinnerBootstrap),
  );
  activeFamilyPage.syncState();
  assert.equal(activeFamilyPage.data.bootstrapUserId, "owner-1", "the member list must identify the current formal member");
  await activeFamilyPage.loadCollaborationData();
  assert.equal(activeFamilyPage.data.dinner.operatorName, "家人", "the operator identity comes from formal backend membership");
  assert.equal(activeFamilyPage.data.mealTasks.length, 2);
  assert.equal(activeFamilyPage.data.groceryClaims[0].memberName, "家人");
  assert.equal(activeFamilyPage.data.recentCollaborations.length, 5);
  assert.equal(activeFamilyPage.data.recentCollaborations[0].participantName, "游客 1");
  assert.equal(
    familyRequests.some((request) => /\/meal-runs\/[^/]+\/tasks$/.test(request.path)),
    true,
    "the control center must load the reviewed formal-member task summary endpoint",
  );

  const familySource = await readFile(join(root, "miniprogram/pages/family/index.js"), "utf8");
  const familyMarkup = await readFile(join(root, "miniprogram/pages/family/index.wxml"), "utf8");
  assert.doesNotMatch(familyMarkup, /已创立我的家/);
  for (const section of ["这个家", "今晚一起做", "成员", "最近协作", "家庭设置"]) {
    assert.match(familyMarkup, new RegExp(section));
  }
  for (const handler of [
    "openCreateHousehold",
    "openInviteEntry",
    "switchHousehold",
    "prepareInvite",
    "startOrResumeDinner",
    "openSettings",
    "leaveHousehold",
  ]) {
    assert.match(familySource, new RegExp(`\\b${handler}\\s*\\(`), `${handler} must be a real family-page handler`);
  }
  assert.doesNotMatch(familySource, /(?:询问|输入).{0,12}(?:身份|昵称)/, "formal collaboration must not re-ask identity");

  for (const [component, marker] of [
    ["household-summary", /bindtap/],
    ["member-row", /正式成员/],
    ["collaboration-row", /participantName/],
  ]) {
    const source = await readFile(join(root, `miniprogram/components/${component}/index.wxml`), "utf8");
    assert.match(source, marker);
  }
  const settingsSource = await readFile(join(root, "miniprogram/packageFamily/pages/settings/index.js"), "utf8");
  const settingsMarkup = await readFile(join(root, "miniprogram/packageFamily/pages/settings/index.wxml"), "utf8");
  for (const handler of ["saveName", "savePreferences", "transferOwnership", "removeMember", "leaveHousehold"]) {
    assert.match(settingsSource, new RegExp(`\\b${handler}\\s*\\(`));
  }
  assert.match(settingsSource, /showModal/, "destructive household changes require explicit confirmation");
  assert.match(settingsMarkup, /家庭名称/);
  assert.match(settingsMarkup, /过敏或必须避开/);
  assert.match(settingsMarkup, /转让主厨/);
  assert.doesNotMatch(settingsMarkup, /功能将在后续阶段启用/);

  const inviteSource = await readFile(join(root, "miniprogram/packageFamily/pages/invite/index.js"), "utf8");
  const inviteMarkup = await readFile(join(root, "miniprogram/packageFamily/pages/invite/index.wxml"), "utf8");
  for (const handler of ["loadInvite", "loginAndJoin", "joinHousehold", "submitTemporaryWant"]) {
    assert.match(inviteSource, new RegExp(`\\b${handler}\\s*\\(`));
  }
  assert.match(inviteMarkup, /邀请你加入/);
  assert.match(inviteMarkup, /加入这个家/);
  assert.match(inviteMarkup, /登录/);
  assert.doesNotMatch(inviteMarkup, /功能将在后续阶段启用/);

  const inviteToken = "i".repeat(32);
  const inviteRequests = [];
  const inviteStorage = new Map();
  const inviteRoutes = [];
  let inviteSession = null;
  let joinedBootstrap = buildNativeBootstrap({ role: "member", stateVersion: "joined-v1" });
  const invitePage = await loadPage(
    "miniprogram/packageFamily/pages/invite/index.js",
    {
      "../../../utils/bootstrap": { loadBootstrap: async () => joinedBootstrap },
      "../../../utils/request": {
        rawRequest: async (options) => {
          inviteRequests.push(options);
          if (options.method === "POST") return { want: { id: "want-1", temporary: true } };
          return {
            invite: {
              token: inviteToken,
              householdName: "测试家",
              inviterName: "主理人",
              status: "open",
            },
          };
        },
        requestHumi: async (options) => {
          inviteRequests.push(options);
          return {};
        },
      },
      "../../../utils/session": {
        getSession: () => inviteSession,
        loginWithWechat: async () => {
          inviteSession = {
            accessToken: "native-session",
            expiresAt: Date.now() + 60_000,
            user: { id: "member-1", displayName: "家人", profileStatus: "complete" },
          };
          return inviteSession;
        },
      },
      "../../../utils/store": { appStore: { getState: () => ({ bootstrap: null }), replaceBootstrap: (value) => { joinedBootstrap = value; } } },
    },
    {
      getApp: () => ({ setHumiSession: (value) => { inviteSession = value; } }),
      wx: {
        getStorageSync: (key) => inviteStorage.get(key),
        setStorageSync: (key, value) => inviteStorage.set(key, value),
        navigateTo: ({ url }) => inviteRoutes.push(url),
        redirectTo: ({ url }) => inviteRoutes.push(url),
        switchTab: ({ url }) => inviteRoutes.push(url),
      },
    },
  );
  await invitePage.onLoad({ token: inviteToken });
  assert.equal(invitePage.data.invite.householdName, "测试家");
  assert.equal(invitePage.data.isLoggedIn, false);
  assert.equal(invitePage.data.primaryAction, "微信登录后加入");
  invitePage.updateWant({ detail: { value: "番茄鸡蛋面" } });
  await invitePage.submitTemporaryWant();
  const guestWantRequest = inviteRequests.find((request) => request.path.endsWith("/wants"));
  assert.equal(guestWantRequest.method, "POST");
  assert.match(guestWantRequest.data.participantKey, /^guest_[A-Za-z0-9]+$/);
  assert.equal(Object.hasOwn(guestWantRequest.data, "memberName"), false, "guest participation must not ask for a reusable identity");
  await invitePage.loginAndJoin();
  const joinRequest = inviteRequests.find((request) => request.path.endsWith("/join"));
  assert.equal(joinRequest.method, "POST");
  assert.equal(joinRequest.data.participantKey, guestWantRequest.data.participantKey);
  assert.equal(Object.hasOwn(joinRequest.data, "memberName"), false, "formal identity must come from the authenticated backend session");
  assert.equal(inviteRoutes.at(-1), "/pages/family/index");

  const settingsRequests = [];
  const settingsPatches = [];
  let settingsShouldConflict = false;
  let settingsBootstrap = buildNativeBootstrap({ role: "owner" });
  settingsBootstrap.householdState.familyProfile = {
    planningMode: "weekly",
    familySize: 2,
    hasChildren: false,
    tastePreferences: [],
    goals: ["省时"],
    dislikes: [],
    allergies: [],
    shoppingTolerance: "medium",
  };
  settingsBootstrap.householdState.activeCraveRequest = { token: "server-owned-token" };
  const settingsPage = await loadPage(
    "miniprogram/packageFamily/pages/settings/index.js",
    {
      "../../../utils/bootstrap": { loadBootstrap: async () => settingsBootstrap },
      "../../../utils/request": {
        requestHumi: async (options) => {
          settingsRequests.push(options);
          return {};
        },
      },
      "../../../utils/household-state": {
        createMutationId: () => "settings-family-profile-patch",
        saveHouseholdStatePatch: async (patch, context) => {
          settingsPatches.push({ patch, context });
          if (settingsShouldConflict) {
            const latestEnvelope = structuredClone(settingsBootstrap);
            latestEnvelope.stateVersion = "state-v3";
            latestEnvelope.householdState.checkedItems = { "ingredient:egg": true };
            const error = new Error("state version conflict");
            error.status = 409;
            error.code = "state_version_conflict";
            error.latestEnvelope = latestEnvelope;
            throw error;
          }
          const nextEnvelope = structuredClone(settingsBootstrap);
          nextEnvelope.stateVersion = "state-v2";
          nextEnvelope.householdState.familyProfile = structuredClone(patch.familyProfile);
          return nextEnvelope;
        },
      },
      "../../../utils/store": {
        appStore: {
          getState: () => ({ bootstrap: settingsBootstrap }),
          replaceBootstrap: (envelope) => { settingsBootstrap = envelope; },
        },
      },
    },
    { wx: { navigateTo() {}, navigateBack() {}, showModal() {} } },
  );
  settingsPage.onLoad({ householdId: "household-1" });
  settingsPage.updateDislikes({ detail: { value: "香菜、芹菜" } });
  settingsPage.updateAllergies({ detail: { value: "花生" } });
  await settingsPage.savePreferences();
  assert.equal(settingsRequests.some((request) => request.path === "/state"), false, "settings must not use the legacy full-state endpoint");
  assert.deepEqual(
    JSON.parse(JSON.stringify(settingsPatches[0].patch.familyProfile.dislikes)),
    ["香菜", "芹菜"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(settingsPatches[0].patch.familyProfile.allergies)),
    ["花生"],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(settingsPatches[0].context)), {
    householdId: "household-1",
    stateVersion: "state-v1",
    idempotencyKey: "settings-family-profile-patch",
  });
  assert.equal(
    settingsBootstrap.householdState.activeCraveRequest.token,
    "server-owned-token",
    "a narrow preference patch must preserve unrelated server-owned state",
  );

  settingsShouldConflict = true;
  settingsPage.updateDislikes({ detail: { value: "韭菜" } });
  settingsPage.updateAllergies({ detail: { value: "虾" } });
  await settingsPage.savePreferences();
  assert.equal(settingsBootstrap.stateVersion, "state-v3", "a conflict must replace the app store with the latest envelope");
  assert.equal(settingsBootstrap.householdState.checkedItems["ingredient:egg"], true);
  assert.equal(settingsPage.data.dislikesText, "韭菜", "a conflict must preserve the owner's unsaved input");
  assert.equal(settingsPage.data.allergiesText, "虾", "a conflict must preserve the owner's unsaved input");
  assert.match(settingsPage.data.errorText, /更新|再保存/);

  console.log("Native primary tabs and household control center checks passed.");
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

async function loadPage(relativePath, stubs, globals = {}) {
  let definition;
  await evaluateCommonJs(relativePath, stubs, {
    ...globals,
    Page: (candidate) => { definition = candidate; },
    wx: { navigateTo() {}, ...(globals.wx || {}) },
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
      if (request === "../../behaviors/shareable-page" || request === "../../../behaviors/shareable-page") {
        return {
          data: { preparedShares: {}, sharePreparing: {}, shareErrors: {} },
          methods: {
            prepareNativeShare: async () => null,
            retryNativeShare: async () => null,
            getNativeSharePayload: (_event, fallback) => fallback,
          },
        };
      }
      if (request.endsWith("/utils/telemetry")) return { startSpan: () => ({ end: () => null }), trackEvent: () => null };
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
  const behaviorMethods = Object.assign({}, ...(definition.behaviors || []).map((behavior) => behavior.methods || {}));
  const behaviorData = Object.assign({}, ...(definition.behaviors || []).map((behavior) => behavior.data || {}));
  const instance = {
    ...behaviorMethods,
    ...definition.methods,
    ...Object.fromEntries(Object.entries(definition).filter(([key]) => !["data", "methods", "properties"].includes(key))),
    data: structuredClone({ ...behaviorData, ...(definition.data || {}) }),
    properties: Object.fromEntries(Object.entries(definition.properties || {}).map(([key, value]) => [key, value?.value])),
    setData(patch) { Object.assign(this.data, patch); },
    triggerEvent() {},
  };
  for (const method of Object.values(instance)) {
    if (typeof method === "function") method.bind(instance);
  }
  return instance;
}

function buildNativeBootstrap({
  role,
  stateVersion = "state-v1",
  mealPlan = {
    "2026-07-24": {
      breakfast: [{ recipeId: "porridge", quantity: 1 }],
      lunch: [{ recipeId: "leftovers", quantity: 1 }],
      dinner: [{ recipeId: "tomato-egg", quantity: 1, title: "西红柿炒鸡蛋", minutes: 15 }],
    },
  },
} = {}) {
  return {
    schemaVersion: 1,
    stateVersion,
    user: { id: role === "owner" ? "owner-1" : "member-1", displayName: role === "owner" ? "主理人" : "家人" },
    activeHouseholdId: "household-1",
    households: [{
      id: "household-1",
      name: "测试家",
      ownerId: "owner-1",
      role,
      members: [
        { id: "owner-1", displayName: "主理人", role: "owner" },
        { id: "member-1", displayName: "家人", role: "member" },
      ],
    }],
    householdState: { mealPlan, pantryItems: [], checkedItems: {}, groceryClaims: {} },
    capabilities: { nativeShellEnabled: true, mealExecutionEnabled: true },
  };
}

async function loginNativeUser(origin, suffix) {
  const login = await apiRequest(origin, "/auth/wechat/login", {
    method: "POST",
    body: { code: `native-primary-${suffix}` },
  });
  await apiRequest(origin, "/identity/profile", {
    method: "PUT",
    token: login.accessToken,
    body: {
      displayName: suffix === "owner" ? "主理人" : "家人",
      avatarKey: "humi-avatar-parent-f-01",
    },
  });
  return login;
}

async function apiRequest(origin, path, {
  method = "GET",
  token = "",
  body,
  stateVersion = "",
  idempotencyKey = "",
  expectedStatus = 200,
} = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (stateVersion) headers["If-Match"] = stateVersion;
  if (idempotencyKey) headers["X-Humi-Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, `${method} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

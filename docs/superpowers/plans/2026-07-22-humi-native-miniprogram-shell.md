# Humi Native Mini Program Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Humi's fragile H5 WebView application controller with a feature-gated native WeChat Mini Program shell that makes login, Tonight, cooking, family collaboration, sharing, and recovery reliable while retaining H5 only for low-frequency content.

**Architecture:** A non-tab native boot page restores the Humi session, performs at most one silent WeChat re-login, and loads a versioned `/bootstrap` envelope. Eligible households enter five native tab pages; all other users are relaunched into the existing H5 shell, so the migration can be stopped server-side without a package rollback. The self-hosted Humi API remains the only shared source of truth; the mini program keeps only versioned read caches, a bounded allowlisted offline queue, and guest dinner runs.

**Tech Stack:** WeChat Mini Program JavaScript/WXML/WXSS on base library `3.8.10`, Node.js self-hosted HTTP API with atomic JSON persistence, React 19/Vite H5 fallback, Node `assert` contract tests, Playwright mobile smoke tests.

## Global Constraints

- Completely exclude WeChat traffic-owner ads, interstitial ads, rewarded-video ads, ad application work, ad components, and ad unit IDs from this plan.
- Do not restore Supabase code, SDKs, configuration, migrations, or runtime calls; the self-hosted Humi API is the only shared backend.
- Preserve the confirmed five primary entries and copy: `今晚`, `发现`, `计划`, `清单`, `我的家`.
- Preserve MealRun states `planned | cooking | completed | abandoned`; only explicit `completed` through `上桌了` counts as success.
- Preserve abandonment reasons `too_much_effort | missing_ingredients | plans_changed | cooking_failed`; abandonment does not break a streak because Humi has no streak mechanic.
- Preserve three effort tiers: `quick_15`, `easy_30`, and `normal`; runtime cooking instructions must come only from the 30 certified recipes in `data/cook-assist.json`.
- Recommendation hard constraints for allergies, explicit dislikes, certification, effort tier, and an active `cooking` or `completed` dinner may never be relaxed.
- For a recommendation scope, five consecutive groups may not repeat any recipe; after exhaustion, exclude the two most recent groups before beginning a new cycle.
- All formal household members may start, advance, downgrade, abandon, complete, and give feedback on a meal; only the owner may replace the household menu or edit household settings.
- Login, bootstrap, state mutations, images, share handoff, and poster actions must expose privacy-safe stage, duration, result, and error-code telemetry without nickname, token, notes, or other free text.
- A `401` permits one silent re-login and one replay only; a non-idempotent mutation may be replayed only when it carries an idempotency key.
- The native cache is never authoritative for shared household state; state conflicts return `409` with the latest `stateVersion`.
- `nativeShellCandidate` is package-local; `HUMI_NATIVE_SHELL_ENABLED` and `HUMI_NATIVE_SHELL_HOUSEHOLDS` are server-side, default off, and both must permit native entry.
- Keep the H5 fallback functional for at least one stable mini-program version after the native shell reaches 100%.
- Validate in WeChat DevTools, 390×844 iOS WeChat, and Android WeChat; deployment, experience-version upload, review submission, release, and allowlist expansion each remain separate user checkpoints.

---

## File Responsibility Map

### Existing files that remain authoritative

- `api/store.js`: atomic persistence and transactional mutations.
- `api/server.js`: route registration, authentication, authorization, response sanitization, and HTTP errors.
- `data/cook-assist.json`: the only certified cooking metadata source.
- `src/lib/mealExecution.js`: canonical build-time validator and deterministic timeline behavior.
- `src/lib/mealRun.js`: canonical guest/local MealRun state-transition behavior.
- `src/lib/recommendation/rules.js`: canonical H5 recommendation scoring and hard constraints.
- `miniprogram/pages/legacy/index.*`: the isolated H5 compatibility shell after migration begins.

### New native platform files

- `miniprogram/pages/boot/index.*`: startup state machine and native/H5 routing gate.
- `miniprogram/utils/request.js`: authenticated request, one-time refresh, idempotency, timeout, and typed errors.
- `miniprogram/utils/session.js`: native session validation, persistence, login, and refresh.
- `miniprogram/utils/bootstrap.js`: `/bootstrap` loading, cache validation, and route selection.
- `miniprogram/utils/cache.js`: schema-versioned per-household read cache.
- `miniprogram/utils/offline-queue.js`: bounded, allowlisted, ordered mutation replay.
- `miniprogram/utils/telemetry.js`: privacy-safe client events and performance spans.
- `miniprogram/utils/store.js`: observable in-memory application state with narrow selectors.
- `miniprogram/utils/recommendation.js`: guest rotation and validation of server groups.
- `miniprogram/utils/meal-run.js`: native adapter around MealRun HTTP and guest-local behavior.
- `miniprogram/utils/share-snapshot.js`: snapshot pre-generation and page-share payloads.
- `miniprogram/data/certified-recipes.js`: generated CommonJS projection of the 30 certified recipes.

### Native pages

- `miniprogram/pages/tonight/index.*`: effort selection, recommendation rotation, plan acceptance, and current-run recovery.
- `miniprogram/pages/discover/index.*`: native category/search feed using thumbnails.
- `miniprogram/pages/plan/index.*`: native multi-day meal plan.
- `miniprogram/pages/grocery/index.*`: native grocery list, claims, and share readiness.
- `miniprogram/pages/family/index.*`: household overview, members, collaboration history, and settings entry.
- `miniprogram/packageCooking/pages/cooking/index.*`: timeline, timers, downgrade, abandon, serve, and feedback.
- `miniprogram/packageFamily/pages/settings/index.*`: owner-only settings.
- `miniprogram/packageFamily/pages/invite/index.*`: invitation landing and join.
- `miniprogram/packageFamily/pages/task/index.*`: meal-task landing, claim, and completion.
- `miniprogram/packageContent/pages/recipe/index.*`: H5 recipe article wrapper.
- `miniprogram/packageContent/pages/web-content/index.*`: allowlisted low-frequency H5 content wrapper.
- `miniprogram/pages/poster/index.*`: deterministic style preview, native image share, and album save.
- `miniprogram/pages/reminder/index.*`: user-triggered one-time subscription permission.

### Contract and smoke tests

- `scripts/check-native-bootstrap-api.mjs`: bootstrap payload, flags, permissions, state versions, and conflict contracts.
- `scripts/check-native-session.mjs`: session and one-retry behavior in a mocked `wx` runtime.
- `scripts/check-native-offline-queue.mjs`: queue allowlist, ordering, deduplication, and conflict blocking.
- `scripts/check-native-recommendation.mjs`: five-group rotation and hard-constraint validation.
- `scripts/check-native-shell-routing.mjs`: boot routing, tab registration, and H5 rollback.
- `scripts/check-native-tonight.mjs`: Tonight interaction state machine.
- `scripts/check-native-cooking.mjs`: timers, background restore, downgrade, completion, and feedback.
- `scripts/check-native-primary-tabs.mjs`: Discover, Plan, Grocery, and Family contracts.
- `scripts/check-native-sharing.mjs`: menu, grocery, invite, task, and poster native flows.
- `scripts/smoke-native-shell-ui.mjs`: 390×844 Playwright/devtools-compatible visual and interaction smoke.
- `scripts/check-native-rollout-readiness.mjs`: flags, domains, package size, evidence, and rollback gates.

---

## Milestones and Review Checkpoints

1. **Checkpoint N0 — H5 stabilization:** existing production path no longer treats bridge callback receipt as visible native UI; tokens and uploads are exactly once; the long dinner confirmation is removed from pre-cook pages.
2. **Checkpoint N1 — Native platform:** bootstrap, session, cache, state version, offline queue, telemetry, boot routing, and rollback are independently green while the server flag remains off.
3. **Checkpoint N2 — Native dinner loop:** Tonight and cooking complete the effort → recommend → plan → start → timeline → serve → feedback path with guest/offline recovery.
4. **Checkpoint N3 — Native household and sharing:** all five tab pages, family permissions, five share types, poster style switching, and reminder authorization pass mocked and DevTools checks.
5. **Checkpoint N4 — Candidate package:** all local regression, package, secret, and rollback checks pass; user reviews the candidate before upload.
6. **Checkpoint N5 — External rollout:** experience-version upload, real-device acceptance, review submission, release, and each allowlist increase require separate evidence and user confirmation.

---

### Task 1: Stabilize the Existing H5-to-Native Handoff

**Files:**
- Modify: `src/lib/runtime.js`
- Modify: `src/main.jsx`
- Modify: `scripts/validate-mini-share-runtime.mjs`
- Modify: `scripts/smoke-product-entrypoints.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `requestMiniProgramShare(payload, options)`, `requestMiniProgramPoster(payload, options)`, and already-created opaque share/poster tokens.
- Produces: `requestMiniProgramPage(url, { timeoutMs, confirmationMs, onStage }) -> Promise<"handoff" | "unavailable">`; `onStage({ stage, method, elapsedMs, errorCode })` contains no URL query or token.

- [ ] **Step 1: Write failing bridge tests that distinguish callback receipt from page visibility**

```js
const stages = [];
const result = await runtime.requestMiniProgramShare(
  { type: "menu", token: "a".repeat(32) },
  { confirmationMs: 10, timeoutMs: 80, onStage: (event) => stages.push(event) },
);
assert.equal(result, "handoff");
assert.deepEqual(calls.map((item) => item.method), ["navigateTo", "redirectTo", "reLaunch"]);
assert(stages.some((event) => event.stage === "callback_received"));
assert(stages.some((event) => event.stage === "page_hidden"));
assert(!JSON.stringify(stages).includes("a".repeat(32)));
```

- [ ] **Step 2: Run the bridge test and verify the current false positive**

Run: `npm run validate:share-bridge`

Expected: FAIL because `navigateTo.success` currently resolves `"handoff"` before any `visibilitychange` or `pagehide` confirmation and prevents fallback attempts.

- [ ] **Step 3: Make callback receipt observable but non-terminal**

```js
const mark = (stage, method = "", errorCode = "") => options.onStage?.({
  stage,
  method,
  errorCode,
  elapsedMs: Math.max(0, Date.now() - startedAt),
});

const handlePageLeave = () => {
  mark("page_hidden", activeMethod);
  finish("handoff");
};

method.call(miniProgram, {
  url,
  success: () => mark("callback_received", methodName),
  fail: (error) => {
    mark("callback_failed", methodName, normalizeBridgeError(error));
    advance();
  },
});
```

Keep the ordered attempts `navigateTo → redirectTo → reLaunch`. Only `visibilitychange=hidden`, `pagehide`, or `beforeunload` may resolve `"handoff"`; timer exhaustion resolves `"unavailable"`.

- [ ] **Step 4: Reuse every created token and poster upload during fallback**

```js
const shareSnapshotRef = useRef(new Map());

async function getOrCreateSnapshot(key, create) {
  if (shareSnapshotRef.current.has(key)) return shareSnapshotRef.current.get(key);
  const pending = Promise.resolve().then(create);
  shareSnapshotRef.current.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    shareSnapshotRef.current.delete(key);
    throw error;
  }
}
```

Use stable keys `menu:<householdId>:<stateVersion>`, `grocery:<householdId>:<stateVersion>`, `invite:<householdId>`, and `poster:<householdId>:<styleId>:<stateVersion>` inside `shareTodayMenu`, `shareGroceryList`, the household invite action, and poster generation. The H5 fallback may change navigation method but must not call the create/upload API twice.

- [ ] **Step 5: Permit one silent session recovery for a `401` snapshot request**

```js
async function createShareWithSessionRecovery(create) {
  try {
    return await create(humiSession);
  } catch (error) {
    if (error?.status !== 401 || !isWechatMiniProgramWebView()) throw error;
    const recovered = await requestWechatSessionRefreshOnce();
    return create(recovered);
  }
}
```

The second failure is surfaced to the user; no third request is issued.

- [ ] **Step 6: Re-run focused and product regression tests**

Run: `npm run validate:share-bridge && npm run release:product:smoke && npm run release:collaboration:smoke`

Expected: all commands exit `0`; the bridge test observes three attempts when no page-leave event occurs and exactly one token-creation call.

- [ ] **Step 7: Commit the stabilization slice**

```bash
git add src/lib/runtime.js src/main.jsx scripts/validate-mini-share-runtime.mjs scripts/smoke-product-entrypoints.mjs package.json
git commit -m "fix: harden H5 native handoff confirmation"
```

---

### Task 2: Remove Premature Dinner Confirmation and Make Poster Styles Deterministic

**Files:**
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/components/TodayMenu.jsx`
- Modify: `src/components/MealExecutionExperience.jsx`
- Modify: `src/lib/posters.js`
- Modify: `scripts/smoke-meal-execution-ui.mjs`
- Modify: `scripts/check-miniprogram-poster-share.mjs`

**Interfaces:**
- Consumes: existing MealRun `cooking` and `completed` states.
- Produces: `nextPosterStyle(currentStyleId, availableStyleIds) -> string`; exactly one pre-completion CTA labeled `上桌了`, rendered only after the run is `cooking`.

- [ ] **Step 1: Add failing UI assertions for confirmation placement**

```js
assert(!tonightHtml.includes("今晚最后吃得怎么样"));
assert(!todayMenuHtml.includes("DinnerLogPanel"));
assert.equal(countText(cookingHtml, "上桌了"), 1);
assert.equal(countText(plannedHtml, "上桌了"), 0);
```

- [ ] **Step 2: Add failing poster-cycle assertions**

```js
assert.equal(nextPosterStyle("default", ["default", "theme"]), "theme");
assert.equal(nextPosterStyle("theme", ["default", "theme"]), "default");
assert.equal(nextPosterStyle("default", ["default"]), "default");
```

- [ ] **Step 3: Run the focused tests and observe both failures**

Run: `npm run validate:meal-execution-ui && npm run validate:miniprogram-poster`

Expected: FAIL because pre-cook pages still render `DinnerLogPanel` and `shoppingPosterStyles` can randomly return the same visual style.

- [ ] **Step 4: Remove `DinnerLogPanel` from decision pages and retain serve confirmation inside cooking**

```jsx
{mealRun?.status === "cooking" && (
  <button className="meal-run__serve" type="button" onClick={onComplete}>
    上桌了
  </button>
)}
```

Delete the `DinnerLogPanel` imports and render blocks from `Dashboard.jsx` and `TodayMenu.jsx`. Keep source/confirmation history readable in history views but do not ask for it before cooking starts.

- [ ] **Step 5: Replace weighted duplicate styles with explicit distinct IDs**

```js
export const SHOPPING_POSTER_STYLES = ["default", "theme"];

export function nextPosterStyle(currentStyleId, availableStyleIds = SHOPPING_POSTER_STYLES) {
  const unique = [...new Set(availableStyleIds.filter(Boolean))];
  if (unique.length < 2) return unique[0] || "default";
  const index = unique.indexOf(currentStyleId);
  return unique[(index + 1 + unique.length) % unique.length];
}
```

Render the “换一种样式” action only when `availableStyleIds.length > 1`.

- [ ] **Step 6: Run the targeted tests and mobile product smoke**

Run: `npm run validate:meal-execution-ui && npm run validate:miniprogram-poster && npm run release:product:smoke`

Expected: all commands exit `0`; `planned` has no serve CTA, `cooking` has one, and two consecutive style actions always change `styleId`.

- [ ] **Step 7: Commit the interaction correction**

```bash
git add src/components/Dashboard.jsx src/components/TodayMenu.jsx src/components/MealExecutionExperience.jsx src/lib/posters.js scripts/smoke-meal-execution-ui.mjs scripts/check-miniprogram-poster-share.mjs
git commit -m "fix: simplify dinner confirmation and poster styles"
```

**Checkpoint N0:** Stop here for user verification of the stabilized H5 candidate. Do not deploy during this checkpoint.

---

### Task 3: Add the Versioned Native Bootstrap Contract

**Files:**
- Create: `api/bootstrap.js`
- Modify: `api/store.js`
- Modify: `api/server.js`
- Modify: `.env.example`
- Create: `scripts/check-native-bootstrap-api.mjs`
- Modify: `package.json`
- Modify: `docs/humi-api-contract.md`

**Interfaces:**
- Consumes: authenticated user, active household, household state, current dinner MealRun, existing `mealExecutionCapabilities(household)`.
- Produces: `GET /bootstrap`; `HUMI_NATIVE_SHELL_ENABLED=0`; `HUMI_NATIVE_SHELL_HOUSEHOLDS=`; `buildBootstrapEnvelope({ user, households, activeHousehold, state, mealRun, flags })`.

```js
{
  schemaVersion: 1,
  stateVersion: "sha256-base64url",
  generatedAt: "2026-07-22T00:00:00.000Z",
  user: { id, displayName, avatarKey, avatarUrl, profileStatus },
  households: [{ id, name, ownerId, role, members }],
  activeHouseholdId: "uuid-or-empty",
  householdState: null,
  currentMealRun: null,
  capabilities: {
    nativeShellEnabled: false,
    mealExecutionEnabled: false,
    reminderEnabled: false
  }
}
```

- [ ] **Step 1: Write failing HTTP tests for authenticated, first-use, allowlisted, and non-allowlisted responses**

```js
const guestOfApi = await login("bootstrap-new-user");
const first = await request("/bootstrap", { token: guestOfApi.accessToken });
assert.equal(first.status, 200);
assert.equal(first.data.activeHouseholdId, "");
assert.equal(first.data.householdState, null);
assert.equal(first.data.capabilities.nativeShellEnabled, false);
assert.match(first.data.stateVersion, /^[A-Za-z0-9_-]{43}$/);
```

Also assert `401` without a session, profile fields are sanitized, no token/openid/phone hash is returned, and the same logical state yields the same `stateVersion`.

- [ ] **Step 2: Run the new contract and confirm `/bootstrap` returns `404`**

Run: `npm run validate:native-bootstrap-api`

Expected: FAIL with HTTP `404`.

- [ ] **Step 3: Implement stable state-version hashing**

```js
export function computeStateVersion(value) {
  return createHash("sha256")
    .update(stableStringify(value))
    .digest("base64url");
}
```

Hash the sanitized `householdState`, active household membership/role, current MealRun, and relevant capabilities. Exclude `generatedAt` so repeat reads stay stable.

- [ ] **Step 4: Register and implement `GET /bootstrap`**

```js
if (request.method === "GET" && url.pathname === "/bootstrap") {
  await handleBootstrap(request, response);
  return;
}
```

`handleBootstrap` calls `requireAuth`, loads all households without creating one, loads current dinner only when a household exists, builds the sanitized envelope, and returns `Cache-Control: private, no-store`.

- [ ] **Step 5: Add default-off native rollout configuration**

```dotenv
# Native mini-program shell; both the global switch and household allowlist must match.
HUMI_NATIVE_SHELL_ENABLED=0
HUMI_NATIVE_SHELL_HOUSEHOLDS=
```

An empty allowlist matches no household. `*` is accepted only when the global switch is `1` and includes users who do not yet have a household. Internal household rollout uses explicit household IDs; isolated first-use testing uses `*` only in the test environment. Production defaults still fall back to H5.

- [ ] **Step 6: Run bootstrap, API, identity, household, and MealRun contracts**

Run: `npm run validate:native-bootstrap-api && npm run validate:api && npm run validate:identity && npm run validate:household && npm run validate:meal-execution-api`

Expected: all commands exit `0`; reading bootstrap never creates a household or member.

- [ ] **Step 7: Commit the bootstrap contract**

```bash
git add api/bootstrap.js api/store.js api/server.js .env.example scripts/check-native-bootstrap-api.mjs package.json docs/humi-api-contract.md
git commit -m "feat: add native bootstrap contract"
```

---

### Task 4: Build Native Session, Request, Cache, Telemetry, and Offline Foundations

**Files:**
- Create: `miniprogram/utils/errors.js`
- Create: `miniprogram/utils/session.js`
- Create: `miniprogram/utils/request.js`
- Create: `miniprogram/utils/cache.js`
- Create: `miniprogram/utils/telemetry.js`
- Create: `miniprogram/utils/offline-queue.js`
- Create: `miniprogram/utils/store.js`
- Modify: `miniprogram/app.js`
- Modify: `miniprogram/utils/config.js`
- Create: `scripts/check-native-session.mjs`
- Create: `scripts/check-native-offline-queue.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `restoreSession()`, `loginWithWechat()`, `refreshSessionOnce()`, `requestHumi(options)`, `readHouseholdCache(id)`, `writeHouseholdCache(id, envelope)`, `enqueueMutation(action)`, `flushMutationQueue()`, `startSpan(name, fields)`, and `appStore`.
- `requestHumi({ path, method="GET", data, idempotencyKey, stateVersion, timeoutMs=8000, retry401=true })` rejects with `HumiRequestError { status, code, retryable, latestStateVersion, latestEnvelope }`.

- [ ] **Step 1: Write failing mocked-`wx` tests for session restore and exactly one login replay**

```js
assert.equal(restoreSession({ accessToken: "x", expiresAt: now + 60_000 }).accessToken, "x");
assert.equal(restoreSession({ accessToken: "x", expiresAt: now - 1 }), null);
await requestHumi({ path: "/bootstrap" });
assert.equal(calls.login, 1);
assert.equal(calls.request.filter((call) => call.url.endsWith("/bootstrap")).length, 2);
```

Also assert a second `401` clears the session and throws `invalid_session`, and a `POST` without `idempotencyKey` is not replayed.

- [ ] **Step 2: Write failing queue tests**

```js
assert.throws(() => enqueueMutation({ type: "household_settings_update" }), /offline_action_not_allowed/);
enqueueMutation({ id: "a", type: "meal_progress", householdId: "h1", mealRunId: "r1", createdAt: 1 });
enqueueMutation({ id: "b", type: "meal_complete", householdId: "h1", mealRunId: "r1", createdAt: 2 });
assert.deepEqual(readQueue().map((item) => item.id), ["a", "b"]);
```

Allow only `meal_progress`, `meal_complete`, `meal_feedback`, `meal_abandon`, `grocery_item_check`, and privacy-safe `product_event`. Cap the queue at 100 actions and 256 KB serialized.

- [ ] **Step 3: Run both tests and confirm the modules are missing**

Run: `npm run validate:native-session && npm run validate:native-offline`

Expected: FAIL with module-not-found errors.

- [ ] **Step 4: Implement session and request behavior**

```js
async function loginWithWechat() {
  const { code } = await callWx(wx.login);
  if (!code) throw new HumiRequestError(0, "wechat_login_failed");
  const session = await rawRequest({ path: "/auth/wechat/login", method: "POST", data: { code } });
  saveSession(session);
  return session;
}

async function requestHumi(options) {
  const canReplay = options.method === "GET" || Boolean(options.idempotencyKey);
  try {
    return await authenticatedRequest(options);
  } catch (error) {
    if (error.status !== 401 || options.retry401 === false || !canReplay) throw error;
    await refreshSessionOnce();
    return authenticatedRequest({ ...options, retry401: false });
  }
}
```

Send `Authorization`, `X-Humi-Idempotency-Key`, and `If-Match` only when present. Do not log either header.

- [ ] **Step 5: Implement versioned cache and telemetry**

```js
const CACHE_SCHEMA_VERSION = 1;

function writeHouseholdCache(householdId, envelope) {
  wx.setStorageSync(`humi:household-cache:v1:${householdId}`, {
    schemaVersion: CACHE_SCHEMA_VERSION,
    savedAt: Date.now(),
    stateVersion: envelope.stateVersion,
    envelope,
  });
}
```

Reject schema mismatches and caches older than seven days. Telemetry accepts only declared numeric/string IDs and enum fields, batches at most 20 events, and drops nickname, token, URL query, note, and arbitrary error-message values.

- [ ] **Step 6: Implement the offline queue with ordered replay and conflict stop**

```js
for (const action of sortQueue(readQueue())) {
  try {
    await replayAction(action);
    removeAction(action.id);
  } catch (error) {
    if (error.status === 409) return { status: "conflict", action, envelope: error.latestEnvelope };
    if (!error.retryable) moveToDeadLetter(action, error.code);
    else return { status: "retry", action };
  }
}
return { status: "flushed" };
```

- [ ] **Step 7: Wire application lifecycle recovery**

```js
App({
  onLaunch() {
    this.globalData.humiSession = restoreSession();
    this.globalData.nativeShellCandidate = true;
  },
  onShow() {
    flushMutationQueue().catch(() => undefined);
  },
});
```

- [ ] **Step 8: Run foundation and existing entry tests**

Run: `npm run validate:native-session && npm run validate:native-offline && npm run validate:miniprogram-entry`

Expected: all commands exit `0`; no test observes more than one login and one replay.

- [ ] **Step 9: Commit the native foundation**

```bash
git add miniprogram/utils miniprogram/app.js scripts/check-native-session.mjs scripts/check-native-offline-queue.mjs package.json
git commit -m "feat: add native mini program platform foundation"
```

---

### Task 5: Introduce Boot Routing, Five Native Tabs, and the H5 Rollback Page

**Files:**
- Create: `miniprogram/pages/boot/index.js`
- Create: `miniprogram/pages/boot/index.json`
- Create: `miniprogram/pages/boot/index.wxml`
- Create: `miniprogram/pages/boot/index.wxss`
- Move and adapt: `miniprogram/pages/index/index.*` → `miniprogram/pages/legacy/index.*`
- Create: `miniprogram/pages/tonight/index.*`
- Create: `miniprogram/pages/discover/index.*`
- Create: `miniprogram/pages/plan/index.*`
- Create: `miniprogram/pages/grocery/index.*`
- Create: `miniprogram/pages/family/index.*`
- Create: `miniprogram/components/page-state/index.*`
- Create: `miniprogram/utils/bootstrap.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/project.config.json`
- Create: `scripts/check-native-shell-routing.mjs`
- Modify: `scripts/check-miniprogram-entrypoint-resilience.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `loadBootstrap({ allowCache })` and `nativeShellCandidate`.
- Produces: `resolveStartupRoute({ candidate, envelope }) -> { route, reason }`.

```js
function resolveStartupRoute({ candidate, envelope }) {
  if (!candidate) return { route: "/pages/legacy/index", reason: "package_disabled" };
  if (!envelope?.capabilities?.nativeShellEnabled) {
    return { route: "/pages/legacy/index", reason: "server_disabled" };
  }
  if (envelope.user?.profileStatus !== "complete") {
    return { route: "/pages/identity/index", reason: "identity_incomplete" };
  }
  return { route: "/pages/tonight/index", reason: "native_enabled" };
}
```

- [ ] **Step 1: Write failing routing tests for native, identity, offline-cache, and rollback paths**

```js
assert.equal(resolveStartupRoute({ candidate: false, envelope }).route, "/pages/legacy/index");
assert.equal(resolveStartupRoute({ candidate: true, envelope: disabled }).route, "/pages/legacy/index");
assert.equal(resolveStartupRoute({ candidate: true, envelope: incomplete }).route, "/pages/identity/index");
assert.equal(resolveStartupRoute({ candidate: true, envelope: enabled }).route, "/pages/tonight/index");
```

Assert the five tab paths and exact labels exist in `app.json`, and `pages/legacy/index` remains registered but is not a tab.

- [ ] **Step 2: Run routing and entry tests and confirm the boot page is absent**

Run: `npm run validate:native-shell-routing && npm run validate:miniprogram-entry`

Expected: FAIL because `pages/boot/index` and the five native tabs are not registered.

- [ ] **Step 3: Register the boot page, tabs, and subpackages**

```json
{
  "pages": [
    "pages/boot/index",
    "pages/tonight/index",
    "pages/discover/index",
    "pages/plan/index",
    "pages/grocery/index",
    "pages/family/index",
    "pages/legacy/index",
    "pages/identity/index",
    "pages/poster/index",
    "pages/reminder/index"
  ],
  "subPackages": [
    { "root": "packageCooking", "pages": ["pages/cooking/index"] },
    { "root": "packageFamily", "pages": ["pages/settings/index", "pages/invite/index", "pages/task/index"] },
    { "root": "packageContent", "pages": ["pages/recipe/index", "pages/web-content/index"] }
  ],
  "tabBar": {
    "color": "#7A7A7A",
    "selectedColor": "#111111",
    "backgroundColor": "#FFFFFF",
    "list": [
      { "pagePath": "pages/tonight/index", "text": "今晚" },
      { "pagePath": "pages/discover/index", "text": "发现" },
      { "pagePath": "pages/plan/index", "text": "计划" },
      { "pagePath": "pages/grocery/index", "text": "清单" },
      { "pagePath": "pages/family/index", "text": "我的家" }
    ]
  }
}
```

Keep this N1 tab bar text-only exactly as shown above. Icon assets are not required for routing acceptance and no unapproved visual asset is generated or registered in this implementation plan.

- [ ] **Step 4: Implement the boot state machine**

```js
async start() {
  const span = startSpan("native_boot");
  try {
    const envelope = await loadBootstrap({ allowCache: true });
    const target = resolveStartupRoute({ candidate: getApp().globalData.nativeShellCandidate, envelope });
    appStore.replaceBootstrap(envelope);
    span.complete({ route: target.reason });
    this.route(target.route);
  } catch (error) {
    span.fail({ errorCode: error.code || "bootstrap_failed" });
    this.setData({ state: "error", errorText: "暂时连不上 Humi，可以重试或进入兼容版。" });
  }
}
```

Use `wx.switchTab` only for tab pages and `wx.reLaunch` for identity/legacy. The error UI exposes `重新连接` and `进入兼容版`; it never presents an empty WebView.

- [ ] **Step 5: Adapt the old WebView controller into `pages/legacy/index`**

Replace every fallback `/pages/index/index` route with `/pages/legacy/index`. Preserve existing share-token landing compatibility by having boot parse legacy share query parameters and route known tokens to native landing pages; only unrecognized legacy entry paths go to the H5 shell.

- [ ] **Step 6: Add native page skeletons with loading, cached, empty, error, and ready states**

Create `miniprogram/components/page-state/index.*` and use it from each tab page:

```xml
<view class="page-shell">
  <view wx:if="{{status === 'loading'}}" class="skeleton" aria-label="正在加载" />
  <view wx:elif="{{status === 'error'}}" class="state-card">
    <text>{{errorText}}</text>
    <button bindtap="retry">重新加载</button>
  </view>
  <slot wx:else />
</view>
```

- [ ] **Step 7: Run routing, legacy-entry, share, and package checks**

Run: `npm run validate:native-shell-routing && npm run validate:miniprogram-entry && npm run validate:share-bridge && npm run build`

Expected: all commands exit `0`; when the server flag is false, boot always relaunches the unchanged H5 compatibility page.

- [ ] **Step 8: Commit the dual-shell routing layer**

```bash
git add miniprogram/pages/boot miniprogram/pages/legacy miniprogram/pages/tonight miniprogram/pages/discover miniprogram/pages/plan miniprogram/pages/grocery miniprogram/pages/family miniprogram/components/page-state miniprogram/utils/bootstrap.js miniprogram/app.json miniprogram/app.wxss miniprogram/project.config.json scripts/check-native-shell-routing.mjs scripts/check-miniprogram-entrypoint-resilience.mjs package.json
git commit -m "feat: add feature-gated native shell routing"
```

---

### Task 6: Complete Native Identity Without Creating a False Logged-In State

**Files:**
- Modify: `miniprogram/pages/identity/index.js`
- Modify: `miniprogram/pages/identity/index.wxml`
- Modify: `miniprogram/pages/identity/index.wxss`
- Modify: `miniprogram/pages/phone-bind/index.js`
- Create: `miniprogram/components/avatar-picker/index.*`
- Modify: `scripts/check-identity-runtime.mjs`
- Modify: `scripts/check-native-session.mjs`

**Interfaces:**
- Consumes: silent account session from `loginWithWechat()` and user `profileStatus`.
- Produces: `saveIdentity({ displayName, avatarKey, avatarUrl })`; identity completion routes through boot, never directly assumes a household exists.

- [ ] **Step 1: Add failing first-use and existing-user identity tests**

```js
assert.equal(firstUse.user.profileStatus, "incomplete");
assert.equal(identityPage.data.displayName, "");
assert.equal(identityPage.data.selectedAvatarKey, "");
assert.equal(calls.createHousehold, 0);
assert.equal(existingUserRoute, "/pages/tonight/index");
```

Assert `wx.getUserProfile` appears only inside the tap handler for `使用微信头像和昵称`; silent `wx.login` itself does not claim that profile permission was granted.

- [ ] **Step 2: Run identity tests and confirm current default nickname/avatar behavior fails**

Run: `npm run validate:identity && npm run validate:native-session`

Expected: FAIL until the identity page starts with an explicit incomplete state and does not display a shared generic avatar as if the user completed setup.

- [ ] **Step 3: Implement explicit identity choices**

```js
async useWechatProfile() {
  const profile = await callWx(wx.getUserProfile, { desc: "用于让家人认出你" });
  this.setData({
    displayName: String(profile.userInfo?.nickName || "").slice(0, 32),
    localAvatarUrl: profile.userInfo?.avatarUrl || "",
  });
}
```

Also keep manual nickname and the existing approved Humi avatar list. Disable `保存并进入 Humi` until nickname and either `avatarKey` or uploaded `avatarUrl` are present.

- [ ] **Step 4: Save identity, refresh bootstrap, and route by real household state**

```js
const { user, session } = await saveIdentity(payload);
getApp().setHumiSession({ ...currentSession, ...session, user });
clearBootstrapCacheForUser(user.id);
wx.reLaunch({ url: "/pages/boot/index?reason=identity_complete" });
```

Do not call `/households`; the native Family page handles create/join later.

- [ ] **Step 5: Run identity, household lifecycle, and startup tests**

Run: `npm run validate:identity && npm run validate:household && npm run validate:native-session && npm run validate:native-shell-routing`

Expected: all commands exit `0`; a brand-new openid creates one incomplete user and zero households until an explicit create/join action.

- [ ] **Step 6: Commit native identity completion**

```bash
git add miniprogram/pages/identity miniprogram/pages/phone-bind miniprogram/components/avatar-picker scripts/check-identity-runtime.mjs scripts/check-native-session.mjs
git commit -m "feat: complete explicit native identity onboarding"
```

**Checkpoint N1:** Run Tasks 3–6 as one review batch. The global native switch remains `0`; verify both enabled test fixtures and disabled rollback fixtures.

---

### Task 7: Unify Server and Guest Recommendation Rotation

**Files:**
- Create: `api/recommendation-rotation.js`
- Modify: `api/store.js`
- Modify: `api/server.js`
- Create: `miniprogram/utils/recommendation.js`
- Create: `scripts/generate-native-certified-recipes.mjs`
- Create: `miniprogram/data/certified-recipes.js`
- Modify: `src/lib/humiApi.js`
- Modify: `src/lib/recommendation/rules.js`
- Modify: `src/main.jsx`
- Create: `scripts/check-native-recommendation.mjs`
- Modify: `scripts/validate-recommendation-constraints.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `POST /recommendations/dinner`, `buildRecommendationScope(input)`, `selectBalancedDinner(input)`, `validateRecommendationGroup(group, constraints)`, and `rotateGuestDinner(input)`.

```js
// POST /recommendations/dinner request
{
  householdId: "uuid",
  dateKey: "2026-07-22",
  mode: "meal_execution | legacy",
  effortTier: "quick_15",
  action: "initial | next | reject",
  contextFingerprint: "sha256-base64url",
  stateVersion: "sha256-base64url"
}

// response
{
  recommendationId: "uuid",
  recipeIds: ["tomato-egg"],
  cycle: 0,
  groupIndex: 1,
  exhausted: false,
  reasonCode: "balanced_unseen",
  stateVersion: "sha256-base64url"
}
```

- [ ] **Step 1: Write failing tests for all three effort tiers and five groups**

```js
for (const effortTier of ["quick_15", "easy_30", "normal"]) {
  const groups = collectGroups({ effortTier, count: 5 });
  const ids = groups.flatMap((group) => group.recipeIds);
  assert.equal(new Set(ids).size, ids.length);
  assert(groups.every((group) => obeysHardConstraints(group, fixture)));
}
```

Add fixtures for allergy exclusion, explicit dislike, refresh-without-advance, household/date/tier isolation, invalid server group fallback, active run refusal, cycle exhaustion, recent-two-group protection, and feedback weight without same-cycle repetition.

- [ ] **Step 2: Run recommendation checks and confirm the existing A/B loop fixture fails**

Run: `npm run validate:native-recommendation && npm run validate:recommendation`

Expected: FAIL because the native rotation module and persistent server cursor do not exist.

- [ ] **Step 3: Generate the native 30-recipe projection deterministically**

```js
const catalog = cookAssist.recipes
  .filter((recipe) => recipe.status === "certified")
  .sort((a, b) => a.recipeId.localeCompare(b.recipeId));
await writeGeneratedModule("miniprogram/data/certified-recipes.js", catalog);
```

The generated file contains IDs, titles, effort tier, active/total minutes, cookware, cleanup level, thumbnail URL, steps, dependencies, downgrade IDs, substitutions, and ready staple. The generator fails unless there are exactly 30 certified recipes and `git diff --exit-code miniprogram/data/certified-recipes.js` is clean after regeneration.

- [ ] **Step 4: Add atomic server rotation persistence**

```js
recommendationRotations: [],
```

Persist only `scopeKey`, `householdId`, `seenRecipeIds`, `recentGroupIds`, `cycle`, and `updatedAt`. Keep at most 20 scopes per household and prune entries older than 14 days inside `mutateAndSave`.

- [ ] **Step 5: Implement high-score-window selection**

```js
const hardSafe = candidates.filter((recipe) => matchesHardConstraints(recipe, input));
const scored = hardSafe.map((recipe) => ({ recipe, score: scoreRecipe(recipe, input) }));
const best = Math.max(...scored.map((item) => item.score));
const window = scored.filter((item) => item.score >= best - 12);
return chooseComplementaryGroup(window, rotation, input.targetDishCount);
```

If unseen safe choices cannot fill a group, start a new cycle while excluding `recentGroupIds.slice(-2)`. Never relax allergies, explicit dislikes, certification, or effort tier.

- [ ] **Step 6: Implement guest rotation with the same scope and validation rules**

```js
const scopeKey = [householdId || "guest", dateKey, effortTier, contextFingerprint].join(":");
const rotation = normalizeRotation(wx.getStorageSync(`humi:recommendation:v1:${scopeKey}`));
const result = selectBalancedDinner({ ...input, rotation, catalog: certifiedRecipes });
wx.setStorageSync(`humi:recommendation:v1:${scopeKey}`, result.rotation);
return result.group;
```

For `mode: "meal_execution"`, use only the 30 certified recipes and require an effort tier. For `mode: "legacy"`, use the full 138-recipe catalog, keep the same household/date/context scope, and omit the certification-only filter while preserving allergies and explicit dislikes.

- [ ] **Step 7: Move authenticated H5 rotation to the same server contract**

```js
export function requestDinnerRecommendation(session, payload) {
  return humiRequest("/recommendations/dinner", {
    method: "POST",
    session,
    body: payload,
  });
}
```

`src/main.jsx` sends `mode: "meal_execution"` for effort cards and `mode: "legacy"` for the old Tonight flow. It sends the full rotation scope and validates returned IDs with `src/lib/recommendation/rules.js`; timeout, network failure, or an invalid group immediately uses the local balanced fallback. Page refresh reads the current group and does not send `action: "next"`.

- [ ] **Step 8: Run recommendation, MealRun, product, and API tests**

Run: `npm run validate:native-recommendation && npm run validate:recommendation && npm run validate:meal-execution && npm run validate:meal-execution-api && npm run release:product:smoke && npm run validate:api`

Expected: all commands exit `0`; all three tiers produce five distinct safe groups and an active `cooking`/`completed` run returns `409 meal_run_locked` for replacement.

- [ ] **Step 9: Commit unified rotation**

```bash
git add api/recommendation-rotation.js api/store.js api/server.js miniprogram/utils/recommendation.js miniprogram/data/certified-recipes.js src/lib/humiApi.js src/lib/recommendation/rules.js src/main.jsx scripts/generate-native-certified-recipes.mjs scripts/check-native-recommendation.mjs scripts/validate-recommendation-constraints.mjs package.json
git commit -m "feat: add balanced native dinner rotation"
```

---

### Task 8: Implement the Native Tonight Decision Flow

**Files:**
- Modify: `miniprogram/pages/tonight/index.js`
- Modify: `miniprogram/pages/tonight/index.wxml`
- Modify: `miniprogram/pages/tonight/index.wxss`
- Create: `miniprogram/components/effort-picker/index.*`
- Create: `miniprogram/components/dinner-plan-card/index.*`
- Create: `miniprogram/components/meal-run-resume/index.*`
- Create: `miniprogram/utils/meal-run.js`
- Create: `scripts/check-native-tonight.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: bootstrap `currentMealRun`, `recommendDinner`, `rotateGuestDinner`, and existing MealRun HTTP endpoints.
- Produces page states `loading | choose_effort | recommendation | accepting | planned | resuming | error` and actions `selectEffort`, `nextRecommendation`, `acceptRecommendation`, `startCooking`, `resumeCooking`.

- [ ] **Step 1: Write failing page tests for the full decision state machine**

```js
page.onLoad();
assert.equal(page.data.viewState, "choose_effort");
await page.selectEffort({ currentTarget: { dataset: { tier: "quick_15" } } });
assert.equal(page.data.recommendation.recipeIds.length, 1);
await page.nextRecommendation();
assert.notDeepEqual(page.data.recommendation.recipeIds, firstIds);
await page.acceptRecommendation();
assert.equal(page.data.mealRun.status, "planned");
```

Add cases for rapid double tap, recommendation timeout with immediate local fallback, existing `planned` resume, existing `cooking` resume, completed dinner read-only state, and state conflict refresh.

- [ ] **Step 2: Run the page test and confirm skeleton handlers are absent**

Run: `npm run validate:native-tonight`

Expected: FAIL because the native Tonight state machine is not implemented.

- [ ] **Step 3: Implement effort selection and recommendation rendering**

```js
const EFFORT_OPTIONS = [
  { id: "quick_15", title: "15 分钟·只求开饭", detail: "一锅或一盘，配现成主食" },
  { id: "easy_30", title: "30 分钟·简单做", detail: "一道主菜加极简配菜或汤" },
  { id: "normal", title: "正常做·今天有精力", detail: "完整菜单，先看时间和缺什么" },
];
```

The recommendation card shows total time, active time, cookware count, missing ingredients, and exactly two actions: primary `就做这顿`, secondary `换一组`.

- [ ] **Step 4: Guard rotation and acceptance**

```js
if (this.data.pendingAction || ["cooking", "completed"].includes(this.data.mealRun?.status)) return;
this.setData({ pendingAction: "accept" });
try {
  const mealRun = await createMealRun({ recommendation: this.data.recommendation, effortTier: this.data.effortTier });
  this.setData({ mealRun, viewState: "planned" });
} finally {
  this.setData({ pendingAction: "" });
}
```

Use one idempotency key per accepted `recommendationId`; a retry reuses it.

- [ ] **Step 5: Implement guest/local planning and authenticated merge**

Guest runs use IDs `guest:<uuid>` and `localOnly: true`. After login, merge only the active guest dinner into `/meal-runs` using `localRunId` as idempotency material; if a remote `cooking` or `completed` dinner exists for that day, keep the remote run and retain the guest run locally as an unmerged record.

- [ ] **Step 6: Navigate planned and cooking runs explicitly**

```js
startCooking() {
  wx.navigateTo({ url: `/packageCooking/pages/cooking/index?mealRunId=${encodeURIComponent(this.data.mealRun.id)}&action=start` });
}

resumeCooking() {
  wx.navigateTo({ url: `/packageCooking/pages/cooking/index?mealRunId=${encodeURIComponent(this.data.mealRun.id)}` });
}
```

- [ ] **Step 7: Run Tonight, recommendation, MealRun client, and 390×844 smoke tests**

Run: `npm run validate:native-tonight && npm run validate:native-recommendation && npm run validate:meal-run-client && npm run smoke:native-shell-ui`

Expected: all commands exit `0`; five manual `换一组` actions do not repeat a recipe and a refresh does not advance rotation.

- [ ] **Step 8: Commit native Tonight**

```bash
git add miniprogram/pages/tonight miniprogram/components/effort-picker miniprogram/components/dinner-plan-card miniprogram/components/meal-run-resume miniprogram/utils/meal-run.js scripts/check-native-tonight.mjs package.json
git commit -m "feat: add native Tonight decision flow"
```

---

### Task 9: Implement Native Cooking, Timers, Downgrade, Serve, and Feedback

**Files:**
- Create: `miniprogram/packageCooking/pages/cooking/index.js`
- Create: `miniprogram/packageCooking/pages/cooking/index.json`
- Create: `miniprogram/packageCooking/pages/cooking/index.wxml`
- Create: `miniprogram/packageCooking/pages/cooking/index.wxss`
- Create: `miniprogram/components/cooking-step/index.*`
- Create: `miniprogram/components/absolute-timer/index.*`
- Create: `miniprogram/components/meal-feedback/index.*`
- Create: `scripts/check-native-cooking.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: MealRun snapshot/timeline, `endsAt`, start/progress/downgrade/abandon/complete/feedback APIs, offline queue.
- Produces: `remainingSeconds(endsAt, now)`, `advanceStep(stepId)`, `downgrade(action)`, `completeMeal()`, and feedback `want_again | change_it | too_hard`.

- [ ] **Step 1: Write failing tests for absolute time and lifecycle recovery**

```js
assert.equal(remainingSeconds("2026-07-22T10:01:00.000Z", "2026-07-22T10:00:15.000Z"), 45);
assert.equal(remainingSeconds("2026-07-22T10:01:00.000Z", "2026-07-22T10:02:00.000Z"), 0);
page.onHide();
clock.advance(90_000);
page.onShow();
assert.equal(page.data.remainingSeconds, 0);
```

Add cases for active-step non-overlap, passive timer concurrency, rapid progress taps, offline progress queueing, each downgrade action, abandon reason, exactly-once completion, and one feedback write.

- [ ] **Step 2: Run the cooking test and confirm the page is absent**

Run: `npm run validate:native-cooking`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement start and progress with absolute timestamps**

```js
async ensureStarted() {
  if (this.data.mealRun.status !== "planned") return;
  const mealRun = await startMealRun(this.data.mealRun.id, this.idempotencyKey("start"));
  this.setData({ mealRun, timeline: mealRun.timeline });
}

function remainingSeconds(endsAt, now = new Date().toISOString()) {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - Date.parse(now)) / 1000));
}
```

Never persist a decrementing counter; persist and sync `endsAt`.

- [ ] **Step 4: Render current action, safe next action, and timers**

The page shows one current active step, all running passive timers, the next available step, elapsed/estimated total time, network state, and a back-navigation warning only while an unsynced active mutation exists.

- [ ] **Step 5: Implement the `太累了` sheet with the three confirmed downgrade actions**

```js
const DOWNGRADES = [
  { id: "drop_side", label: "去掉非必要配菜" },
  { id: "lower_effort_recipe", label: "换成更省力的认证做法" },
  { id: "ready_staple", label: "主食改成现成的" },
];
```

Apply only server-returned timelines/snapshots for authenticated runs. Guest runs use the generated certified catalog. Never generate instructions at runtime.

- [ ] **Step 6: Implement one serve action and post-serve feedback**

```xml
<button wx:if="{{mealRun.status === 'cooking'}}" class="serve-button" bindtap="completeMeal" loading="{{pendingAction === 'complete'}}">
  上桌了
</button>
<meal-feedback wx:if="{{mealRun.status === 'completed' && !mealRun.feedback}}" bindselect="saveFeedback" />
```

After completion, show `下次还想吃 / 可以换换 / 太费劲`. Do not reintroduce dinner confirmation on Tonight or planned views.

- [ ] **Step 7: Queue safe offline mutations and reconcile on show**

Progress, complete, feedback, and abandon may queue. A `409` freezes further sync, reloads bootstrap, and displays `家里的安排刚刚有更新，请确认最新进度`; it does not overwrite server state.

- [ ] **Step 8: Run cooking, timeline, MealRun, API, and UI checks**

Run: `npm run validate:native-cooking && npm run validate:meal-execution && npm run validate:meal-run-client && npm run validate:meal-execution-api && npm run smoke:native-shell-ui`

Expected: all commands exit `0`; background recovery uses absolute time, and repeated completion returns the same completed record.

- [ ] **Step 9: Commit the native cooking loop**

```bash
git add miniprogram/packageCooking miniprogram/components/cooking-step miniprogram/components/absolute-timer miniprogram/components/meal-feedback scripts/check-native-cooking.mjs package.json
git commit -m "feat: add native whole-meal cooking flow"
```

**Checkpoint N2:** Validate the complete dinner loop with guest, authenticated owner, authenticated member, offline recovery, and server-flag rollback fixtures.

---

### Task 10: Implement Native Discover With Fast Images and H5 Content Isolation

**Files:**
- Modify: `miniprogram/pages/discover/index.*`
- Create: `miniprogram/components/dish-card/index.*`
- Create: `miniprogram/components/image-with-fallback/index.*`
- Create: `miniprogram/packageContent/pages/recipe/index.*`
- Create: `miniprogram/packageContent/pages/web-content/index.*`
- Create: `miniprogram/utils/content-routes.js`
- Modify: `api/server.js`
- Create: `scripts/check-native-primary-tabs.mjs`
- Modify: `scripts/smoke-native-shell-ui.mjs`

**Interfaces:**
- Consumes: recipe summary endpoint and existing `/assets/dishes/thumbs/<id>.webp` API route.
- Produces: `GET /recipes?category=&query=&cursor=&limit=20`, `buildAllowedContentUrl(route, params)`, and a native double-column feed.

- [ ] **Step 1: Add failing recipe-summary and image-state tests**

```js
assert.equal(response.data.recipes.length, 20);
assert.deepEqual(Object.keys(response.data.recipes[0]).sort(), ["category", "id", "minutes", "thumbnailUrl", "title"].sort());
assert.equal(imageComponent.data.state, "placeholder");
imageComponent.onLoad();
assert.equal(imageComponent.data.state, "loaded");
imageComponent.onError();
assert.equal(imageComponent.data.state, "fallback");
```

- [ ] **Step 2: Run primary-tab tests and confirm the native Discover contract is missing**

Run: `npm run validate:native-primary-tabs`

Expected: FAIL for missing `/recipes` and Discover handlers.

- [ ] **Step 3: Add a sanitized paginated recipe summary route**

Return only the five declared fields, cap `limit` at 40, normalize query to 40 characters, and send `Cache-Control: public, max-age=300, stale-while-revalidate=86400`. Do not return full steps or notes in the feed.

- [ ] **Step 4: Implement native feed, filters, search debounce, and image fallback**

```js
onSearchInput(event) {
  clearTimeout(this._searchTimer);
  const query = String(event.detail.value || "").slice(0, 40);
  this._searchTimer = setTimeout(() => this.loadFirstPage({ query }), 250);
}
```

Load only thumbnail URLs. Show the local gray Humi dish placeholder immediately; transition to the remote image on `bindload`; retain the placeholder on `binderror` and allow one user-triggered retry.

- [ ] **Step 5: Restrict H5 content routes**

```js
const CONTENT_ROUTES = {
  recipe: ({ recipeId }) => `/recipe/${encodeURIComponent(recipeId)}`,
  stats: () => "/stats",
  history: () => "/history",
};
```

Reject absolute URLs, unknown routes, scripts, fragments, and arbitrary query keys. The wrapper obtains an H5 ticket from the native session and never receives a long-lived access token in its URL.

- [ ] **Step 6: Run primary tabs, image, H5 entry, API, and mobile smoke tests**

Run: `npm run validate:native-primary-tabs && npm run validate:h5-entry && npm run validate:api && npm run smoke:native-shell-ui`

Expected: all commands exit `0`; the Discover viewport renders local placeholders without blank circles before any network image finishes.

- [ ] **Step 7: Commit Discover and content isolation**

```bash
git add miniprogram/pages/discover miniprogram/components/dish-card miniprogram/components/image-with-fallback miniprogram/packageContent miniprogram/utils/content-routes.js api/server.js scripts/check-native-primary-tabs.mjs scripts/smoke-native-shell-ui.mjs
git commit -m "feat: add fast native recipe discovery"
```

---

### Task 11: Implement Native Plan and Grocery Tabs With Version Conflicts

**Files:**
- Modify: `miniprogram/pages/plan/index.*`
- Modify: `miniprogram/pages/grocery/index.*`
- Create: `miniprogram/components/meal-day/index.*`
- Create: `miniprogram/components/grocery-item/index.*`
- Create: `miniprogram/utils/household-state.js`
- Modify: `scripts/check-native-primary-tabs.mjs`
- Modify: `scripts/check-native-offline-queue.mjs`

**Interfaces:**
- Consumes: bootstrap `householdState`, `stateVersion`, member/owner role, existing `GET/PUT /state`.
- Produces: `saveHouseholdStatePatch(patch, { stateVersion, idempotencyKey })` and derived grocery list `deriveGroceryItems(mealPlan, pantrySignals)`.

- [ ] **Step 1: Add failing owner/member permission and `409` tests**

```js
assert.equal(ownerPage.data.canEditMenu, true);
assert.equal(memberPage.data.canEditMenu, false);
await assert.rejects(() => memberPage.replaceDinner(), /forbidden/);
assert.equal(conflictPage.data.conflictVisible, true);
assert.equal(conflictPage.data.stateVersion, serverEnvelope.stateVersion);
```

Formal members may check or claim grocery items and share the current read-only list; only owners may change the planned menu.

- [ ] **Step 2: Run primary-tab and offline tests and confirm missing state-version behavior**

Run: `npm run validate:native-primary-tabs && npm run validate:native-offline`

Expected: FAIL because Plan/Grocery do not yet send `If-Match` or display conflicts.

- [ ] **Step 3: Implement narrow state patches**

```js
async function saveHouseholdStatePatch(patch, context) {
  return requestHumi({
    path: "/state",
    method: "PUT",
    data: { householdId: context.householdId, patch },
    stateVersion: context.stateVersion,
    idempotencyKey: context.idempotencyKey,
  });
}
```

Extend the server handler to accept only `patch.mealPlan`, `patch.groceryClaims`, or declared member-writable collaboration fields and to return `409 { code: "state_version_conflict", latestEnvelope }` when `If-Match` differs.

- [ ] **Step 4: Implement Plan owner actions and member read-only state**

Render seven days, breakfast/lunch read-only compatibility rows, dinner entries, total estimated dinner time, and missing ingredients. Hide menu mutation actions for members; do not rely only on hiding—retain server authorization.

- [ ] **Step 5: Implement Grocery list, check/claim, cached view, and share readiness**

Grocery state shows `待买`, `家里可能有`, `已买`, and claimant identity. `grocery_item_check` may queue offline; list regeneration and menu replacement may not.

- [ ] **Step 6: Run primary-tab, household, collaboration, offline, and API tests**

Run: `npm run validate:native-primary-tabs && npm run validate:household && npm run release:collaboration:smoke && npm run validate:native-offline && npm run validate:api`

Expected: all commands exit `0`; conflicts reload the latest envelope without overwriting another family member's update.

- [ ] **Step 7: Commit Plan and Grocery**

```bash
git add miniprogram/pages/plan miniprogram/pages/grocery miniprogram/components/meal-day miniprogram/components/grocery-item miniprogram/utils/household-state.js api/server.js scripts/check-native-primary-tabs.mjs scripts/check-native-offline-queue.mjs
git commit -m "feat: add versioned native plan and grocery tabs"
```

---

### Task 12: Redesign My Home as a Native Household Control Center

**Files:**
- Modify: `miniprogram/pages/family/index.*`
- Create: `miniprogram/components/household-summary/index.*`
- Create: `miniprogram/components/member-row/index.*`
- Create: `miniprogram/components/collaboration-row/index.*`
- Create: `miniprogram/packageFamily/pages/settings/index.*`
- Create: `miniprogram/packageFamily/pages/invite/index.*`
- Modify: `scripts/check-native-primary-tabs.mjs`
- Modify: `scripts/check-collaboration-identity.mjs`

**Interfaces:**
- Consumes: households, active household, role, members, collaboration history, invite APIs.
- Produces page sections `这个家`, `今晚一起做`, `成员`, `最近协作`, `家庭设置`; actions `createHousehold`, `switchHousehold`, `prepareInvite`, `openSettings`.

- [ ] **Step 1: Add failing tests for no-household, owner, member, and multi-household states**

```js
assert.equal(noFamilyPage.data.primaryAction, "创建一个家");
assert.equal(ownerPage.data.canOpenSettings, true);
assert.equal(memberPage.data.canOpenSettings, false);
assert.equal(memberPage.data.canStartCooking, true);
assert.equal(multiFamilyPage.data.householdOptions.length, 2);
```

Assert that opening My Home always produces a real destination, never the terminal text `已创立我的家`.

- [ ] **Step 2: Run household and primary-tab tests and confirm the new information architecture is absent**

Run: `npm run validate:native-primary-tabs && npm run validate:collaboration-identity`

Expected: FAIL until the native Family page exposes actionable sections and exact permission states.

- [ ] **Step 3: Implement the no-household experience without implicit creation**

```xml
<view wx:if="{{!activeHousehold}}" class="empty-home">
  <text class="title">把家里的人和今晚的饭放在一起</text>
  <button bindtap="openCreateHousehold">创建一个家</button>
  <button class="secondary" bindtap="openInviteEntry">我有邀请</button>
</view>
```

Household creation asks for the household name once and calls `POST /households` only from explicit confirmation.

- [ ] **Step 4: Implement household summary and collaboration actions**

Show current dinner status, who is cooking, unclaimed/claimed meal tasks, current grocery claims, member count, and the latest five collaboration events. Use recorded formal/temporary identity labels from the backend; never ask a formal logged-in member to retype their identity for each collaboration.

- [ ] **Step 5: Implement owner-only settings and multi-household switching**

Settings expose name, member management, ownership transfer, leave/remove operations, and hard-diet preferences with existing server confirmation rules. Switching calls `POST /households/active`, clears page-derived state, loads new bootstrap, and uses a per-household cache key.

- [ ] **Step 6: Implement invitation landing behavior**

Logged-in recipients see inviter, household name, membership impact, and `加入这个家`; visitors may view the invitation but must log in before becoming formal members. Temporary desire/claim participation remains temporary and does not create formal membership.

- [ ] **Step 7: Run household, collaboration identity, API, and primary-tab tests**

Run: `npm run validate:household && npm run validate:collaboration-identity && npm run validate:api && npm run validate:native-primary-tabs`

Expected: all commands exit `0`; reads and login create no household, and general collaboration creates no formal member.

- [ ] **Step 8: Commit My Home**

```bash
git add miniprogram/pages/family miniprogram/components/household-summary miniprogram/components/member-row miniprogram/components/collaboration-row miniprogram/packageFamily scripts/check-native-primary-tabs.mjs scripts/check-collaboration-identity.mjs
git commit -m "feat: add native household control center"
```

---

### Task 13: Replace WebView Sharing With Native Snapshot Sharing

**Files:**
- Create: `miniprogram/utils/share-snapshot.js`
- Create: `miniprogram/behaviors/shareable-page.js`
- Modify: `miniprogram/pages/tonight/index.*`
- Modify: `miniprogram/pages/grocery/index.*`
- Modify: `miniprogram/pages/family/index.*`
- Create: `miniprogram/packageFamily/pages/task/index.*`
- Modify: `miniprogram/packageFamily/pages/invite/index.*`
- Create: `miniprogram/packageShare/pages/menu/index.*`
- Create: `miniprogram/packageShare/pages/grocery/index.*`
- Modify: `miniprogram/utils/share-routing.js`
- Modify: `miniprogram/app.json`
- Modify: `api/store.js`
- Modify: `api/server.js`
- Modify: `scripts/smoke-humi-api.mjs`
- Create: `scripts/check-native-sharing.mjs`
- Modify: `scripts/validate-mini-share-runtime.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing menu, grocery, invite, and meal-task snapshot APIs.
- Produces: `prepareShareSnapshot(type, context)`, `getPreparedShare(type)`, and synchronous `onShareAppMessage()` payloads.

- [ ] **Step 1: Write failing tests for exactly-once pre-generation and synchronous share payloads**

```js
await page.onShow();
await page.onShow();
assert.equal(calls.createMenuShare, 1);
const payload = page.onShareAppMessage({ target: { dataset: { shareType: "menu" } } });
assert.match(payload.path, /menuShare=[A-Za-z0-9_-]{24,64}/);
assert.equal(calls.createMenuShare, 1);
```

Repeat for grocery, invite, and meal task. Assert a disabled button while the snapshot is preparing, no WebView message dependency, no token in telemetry, and landing paths preserve the opaque token.

- [ ] **Step 2: Run sharing tests and confirm native tab pages lack prepared snapshots**

Run: `npm run validate:native-sharing && npm run validate:share-bridge`

Expected: FAIL because native tab pages do not own share snapshots.

- [ ] **Step 3: Implement stable snapshot keys and pre-generation**

```js
function snapshotKey(type, context) {
  return [type, context.householdId, context.stateVersion, context.mealRunId || ""].join(":");
}

async function prepareShareSnapshot(type, context) {
  const key = snapshotKey(type, context);
  if (prepared.has(key)) return prepared.get(key);
  const pending = createSnapshot(type, context);
  prepared.set(key, pending);
  try { return await pending; }
  catch (error) { prepared.delete(key); throw error; }
}
```

Cache only in memory plus an expiry timestamp; do not persist opaque share tokens in telemetry or long-term native cache.

- [ ] **Step 4: Render actual native share buttons**

```xml
<button
  open-type="share"
  data-share-type="menu"
  disabled="{{!preparedShares.menu}}"
>
  去微信分享菜单
</button>
```

`onShareAppMessage(event)` is synchronous and reads the already-prepared payload. If preparation failed, the page shows `分享内容没准备好，点这里重试` rather than a dead button.

- [ ] **Step 5: Route all recipient landings natively**

Register a `packageShare` subpackage with `pages/menu/index` and `pages/grocery/index`. Menu and grocery tokens open those read-only native states; invite opens the native join page; meal task opens the native task page. A visitor may view public menu/grocery details without login, but task claim and formal household join require authentication.

Permit any formal member of the active household to create a read-only menu or grocery snapshot:

```js
const household = await store.requireActiveHouseholdForUser(userId);
const member = household.members.find((item) => item.memberId === userId);
if (!member) throw codedError("forbidden", "Only household members can share this snapshot.");
```

This permission applies only to snapshot creation. Menu replacement, household settings, member removal, ownership transfer, and invite creation remain owner-only. Add API smoke fixtures proving a member receives `201` for menu/grocery snapshots and `403` for owner-only mutations.

- [ ] **Step 6: Verify direct share telemetry semantics**

Record `share_snapshot_created` when the server returns a token. Record `native_share_page_visible` only from the page's `onShow` when launched with `shareSource`; do not claim that the user selected or sent to a contact because WeChat does not expose a reliable send-completion callback.

- [ ] **Step 7: Run all share, collaboration, entry, and API checks**

Run: `npm run validate:native-sharing && npm run validate:share-bridge && npm run release:collaboration:smoke && npm run validate:miniprogram-entry && npm run validate:api`

Expected: all commands exit `0`; each prepared share type creates one snapshot and returns a valid native card path.

- [ ] **Step 8: Commit native sharing**

```bash
git add miniprogram/utils/share-snapshot.js miniprogram/behaviors/shareable-page.js miniprogram/pages/tonight miniprogram/pages/grocery miniprogram/pages/family miniprogram/packageFamily miniprogram/packageShare miniprogram/utils/share-routing.js miniprogram/app.json api/store.js api/server.js scripts/check-native-sharing.mjs scripts/validate-mini-share-runtime.mjs scripts/smoke-humi-api.mjs package.json
git commit -m "feat: replace WebView sharing with native snapshots"
```

---

### Task 14: Finish Native Poster Styles, Sharing, and Save Recovery

**Files:**
- Modify: `miniprogram/pages/poster/index.js`
- Modify: `miniprogram/pages/poster/index.wxml`
- Modify: `miniprogram/pages/poster/index.wxss`
- Create: `miniprogram/utils/poster-styles.js`
- Modify: `api/server.js`
- Modify: `scripts/check-miniprogram-poster-share.mjs`
- Modify: `scripts/check-native-sharing.mjs`
- Modify: `scripts/check-wechat-poster-domain.mjs`

**Interfaces:**
- Consumes: prepared poster source and the existing opaque poster upload/download endpoint.
- Produces: `POST /poster-shares` response with `styleId`; `nextStyleId(current, available)`; native `wx.showShareImageMenu` and `wx.saveImageToPhotosAlbum` flows.

- [ ] **Step 1: Add failing style, cache, cancel, and domain tests**

```js
assert.equal(nextStyleId("default", ["default", "theme"]), "theme");
assert.equal(nextStyleId("theme", ["default", "theme"]), "default");
await page.changeStyle();
assert.notEqual(page.data.styleId, firstStyle);
await page.changeStyle();
assert.notEqual(page.data.styleId, secondStyle);
await page.sharePosterImage();
await page.sharePosterImage();
assert.equal(calls.downloadFile, 1);
```

Assert user cancel is not reported as a technical failure, album denial offers `wx.openSetting`, and `https://api.humi-home.com` must be present in the WeChat `downloadFile` legal-domain evidence before candidate acceptance.

- [ ] **Step 2: Run poster and domain tests and record the expected domain blocker**

Run: `npm run validate:miniprogram-poster && npm run release:wechat:poster:domain`

Expected before platform configuration: poster code checks may pass, while the domain check exits non-zero with `api.humi-home.com` absent from the legal download domain list. This is an external checkpoint, not a code retry loop.

- [ ] **Step 3: Make `styleId` explicit and deterministic**

```js
const POSTER_STYLES = [
  { id: "default", label: "清单" },
  { id: "theme", label: "主题" },
];

function nextStyleId(current, styles = POSTER_STYLES) {
  const ids = styles.map((style) => style.id);
  if (ids.length < 2) return ids[0] || "default";
  return ids[(Math.max(0, ids.indexOf(current)) + 1) % ids.length];
}
```

Generate the selected existing template with the new `styleId`, upload once for that style/version, and update the displayed image URL. Send the style as `X-Humi-Poster-Style: default | theme`; `handleCreatePosterShare` sanitizes the header and includes it in the response metadata without changing the opaque image URL. Hide the style action for single-template poster types such as the current menu poster.

- [ ] **Step 4: Keep one download promise per poster URL**

```js
if (this._downloadedUrl === this.data.imageUrl && this._tempFilePath) return this._tempFilePath;
if (this._downloadPromise) return this._downloadPromise;
this._downloadPromise = downloadPoster(this.data.imageUrl).then((path) => {
  this._downloadedUrl = this.data.imageUrl;
  this._tempFilePath = path;
  return path;
}).finally(() => { this._downloadPromise = null; });
return this._downloadPromise;
```

Changing `styleId` invalidates only the old temp path; repeated share/save of the same style reuses it.

- [ ] **Step 5: Run poster, sharing, API, and domain readiness checks**

Run: `npm run validate:miniprogram-poster && npm run validate:native-sharing && npm run validate:api && npm run release:wechat:poster:domain`

Expected after the user completes the platform-domain checkpoint: all commands exit `0`; each style press differs from the immediately previous style, and each style/version has one poster URL.

- [ ] **Step 6: Commit poster completion**

```bash
git add miniprogram/pages/poster miniprogram/utils/poster-styles.js api/server.js scripts/check-miniprogram-poster-share.mjs scripts/check-native-sharing.mjs scripts/check-wechat-poster-domain.mjs
git commit -m "feat: complete deterministic native poster sharing"
```

---

### Task 15: Add Meal Tasks and One-Time Reminder Permission at the Correct Moment

**Files:**
- Modify: `miniprogram/packageCooking/pages/cooking/index.*`
- Modify: `miniprogram/packageFamily/pages/task/index.*`
- Modify: `miniprogram/pages/reminder/index.*`
- Modify: `scripts/check-miniprogram-meal-reminder.mjs`
- Modify: `scripts/check-native-cooking.mjs`
- Modify: `scripts/check-native-sharing.mjs`

**Interfaces:**
- Consumes: existing meal task and reminder API routes.
- Produces: task creation after cooking begins; `requestReminderPermission({ templateId, scheduledAt, effortTier })` only inside a user tap handler after first completion.

- [ ] **Step 1: Add failing placement, claim, and permission tests**

```js
assert.equal(plannedPage.data.canCreateTask, false);
assert.equal(cookingPage.data.canCreateTask, true);
await reminderPage.onLoad(options);
assert.equal(calls.requestSubscribeMessage, 0);
await reminderPage.confirmReminder();
assert.equal(calls.requestSubscribeMessage, 1);
```

Cover accept, reject, cancel, API failure, at-most-one technical retry, deep-link return, logged-out task viewer, formal-member claim, visitor claim denial, and completed-task idempotency.

- [ ] **Step 2: Run reminder, cooking, and sharing tests and confirm placement gaps**

Run: `npm run validate:miniprogram-meal-reminder && npm run validate:native-cooking && npm run validate:native-sharing`

Expected: FAIL until task creation is gated by `cooking` and subscription permission remains user-triggered after completion.

- [ ] **Step 3: Add concrete task suggestions after start**

```js
function suggestedTasks(mealRun) {
  return [
    ...mealRun.missingIngredients.slice(0, 2).map((item) => ({ kind: "buy", label: `请家人买${item.name}` })),
    ...mealRun.timeline.steps
      .filter((step) => step.delegatable)
      .slice(0, 2)
      .map((step) => ({ kind: "prep", label: step.taskLabel })),
  ];
}
```

The cook may edit only from declared task labels and ingredient names; the event log stores task type and IDs, not free text.

- [ ] **Step 4: Implement native task view, authentication, claim, and completion**

Visitors see the task and household context but must sign in and be a formal member to claim. Claim and complete requests use stable idempotency keys and return the existing task on repeat.

- [ ] **Step 5: Ask for one-time subscription only after explicit scheduling confirmation**

```js
async confirmReminder() {
  const { templateId } = await loadReminderConfig();
  const result = await callWx(wx.requestSubscribeMessage, { tmplIds: [templateId] });
  if (result[templateId] !== "accept") {
    this.setData({ state: "declined" });
    return;
  }
  await createReminder({ scheduledAt: this.data.scheduledAt, effortTier: this.data.effortTier });
  this.setData({ state: "scheduled" });
}
```

Do not ask again automatically after reject/cancel. A technical send failure retries at most once server-side and must produce at most one delivered message.

- [ ] **Step 6: Run reminder, task, cooking, API, and collaboration suites**

Run: `npm run validate:miniprogram-meal-reminder && npm run validate:native-cooking && npm run validate:native-sharing && npm run validate:meal-execution-api && npm run release:collaboration:smoke`

Expected: all commands exit `0`; collaboration never blocks solo cooking.

- [ ] **Step 7: Commit tasks and reminders**

```bash
git add miniprogram/packageCooking miniprogram/packageFamily/pages/task miniprogram/pages/reminder scripts/check-miniprogram-meal-reminder.mjs scripts/check-native-cooking.mjs scripts/check-native-sharing.mjs
git commit -m "feat: add native meal tasks and reminders"
```

**Checkpoint N3:** Review all five native tabs, five native share types, poster styles, task identity, reminder timing, member/owner permissions, and the H5 rollback route.

---

### Task 16: Split the Retained H5 and Enforce Startup Performance Budgets

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/components/AppShell.jsx`
- Modify: `vite.config.js`
- Create: `src/routes/lazyRoutes.js`
- Create: `scripts/check-startup-performance.mjs`
- Modify: `scripts/check-h5-entrypoint-resilience.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces lazy content routes and budgets: native cached first paint ≤ 400 ms in DevTools automation, native warm bootstrap ≤ 1000 ms, native cold authenticated bootstrap ≤ 2500 ms on the agreed 4G test profile, H5 initial JS chunk ≤ 350 KB gzip, thumbnails ≤ 80 KB each.

- [ ] **Step 1: Add failing build-artifact and startup-budget checks**

```js
assert(initialJsGzipBytes <= 350 * 1024, `initial H5 JS is ${initialJsGzipBytes} bytes gzip`);
assert(nativeCachedFirstPaintMs <= 400);
assert(nativeWarmBootstrapMs <= 1000);
assert(nativeColdBootstrapMs <= 2500);
assert(thumbnailFiles.every((file) => file.bytes <= 80 * 1024));
```

- [ ] **Step 2: Run build and performance checks to capture the current failing baseline**

Run: `npm run build && npm run validate:startup-performance`

Expected: FAIL if the current monolithic H5 initial chunk exceeds 350 KB gzip; the report prints file names and byte counts without credentials or URLs containing tickets.

- [ ] **Step 3: Lazy-load low-frequency H5 routes**

```js
export const lazyRoutes = {
  stats: lazy(() => import("../components/StatsPage.jsx")),
  familyActivity: lazy(() => import("../components/FamilyActivityPage.jsx")),
  householdSettings: lazy(() => import("../components/HouseholdSettingsPage.jsx")),
  recipeDetail: lazy(() => import("../components/RecipeDetailDrawer.jsx")),
};
```

Keep login exchange and content-route parsing in the initial chunk; move analytics/history/settings/long recipe UI out.

- [ ] **Step 4: Define stable vendor chunks**

```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        react: ["react", "react-dom"],
        icons: ["lucide-react"],
      },
    },
  },
}
```

- [ ] **Step 5: Add native performance spans and image timing**

Emit only `native_boot`, `native_login`, `bootstrap`, `recommendation`, `meal_run_restore`, and `thumbnail_first_visible` durations with version/page/error code. Keep event batching non-blocking.

- [ ] **Step 6: Run performance, entry, product, and build checks**

Run: `npm run validate:startup-performance && npm run validate:h5-entry && npm run validate:miniprogram-entry && npm run release:product:smoke && npm run build`

Expected: all commands exit `0`; the initial H5 gzip chunk is within budget and native cached UI paints before network bootstrap finishes.

- [ ] **Step 7: Commit performance isolation**

```bash
git add src/main.jsx src/components/AppShell.jsx src/routes/lazyRoutes.js vite.config.js scripts/check-startup-performance.mjs scripts/check-h5-entrypoint-resilience.mjs package.json
git commit -m "perf: isolate native startup from H5 content"
```

---

### Task 17: Add Privacy-Safe Observability and True-Device Evidence Contracts

**Files:**
- Modify: `api/store.js`
- Modify: `api/server.js`
- Modify: `miniprogram/utils/telemetry.js`
- Modify: `scripts/check-humi-true-device-evidence.mjs`
- Create: `scripts/check-native-observability.mjs`
- Modify: `docs/humi-1.1-candidate-validation-forms.md`
- Modify: `package.json`

**Interfaces:**
- Consumes allowlisted native event names.
- Produces server event retention of 180 days and device-evidence rows with `device`, `platform`, `wechatVersion`, `packageVersion`, `householdFixture`, `startedAt`, `finishedAt`, `result`, and redacted evidence path.

- [ ] **Step 1: Add failing event allowlist and privacy tests**

```js
await assert.rejects(() => recordEvent({ eventType: "nickname_seen", nickname: "Daniel" }), /event_not_allowed/);
await recordEvent({ eventType: "native_boot_completed", durationMs: 812, page: "tonight" });
assert(!JSON.stringify(store.data.productEvents).includes("Daniel"));
```

Allow only the native boot/login/bootstrap/share/poster/performance events in the design plus existing MealRun server events. Reject arbitrary keys and trim IDs to declared limits.

- [ ] **Step 2: Run observability and privacy checks and confirm missing native event contracts**

Run: `npm run validate:native-observability && npm run release:candidate:privacy:check`

Expected: FAIL until the native allowlist, key schema, and retention checks exist.

- [ ] **Step 3: Implement typed event sanitization and pruning**

```js
const NATIVE_EVENT_FIELDS = new Set([
  "eventType", "anonymousSessionId", "householdId", "page", "stage",
  "durationMs", "errorCode", "packageVersion", "businessId",
]);
```

Prune raw events older than `180 * 24 * 60 * 60 * 1000` during transactional writes. Hash anonymous session IDs with a server salt before persistence.

- [ ] **Step 4: Extend evidence forms for real-device paths**

Require six login cases, five recommendation rotations per tier, background timer restoration, offline sync, owner/member permissions, menu/grocery/invite/task/poster send and recipient open, two poster style changes, reminder accept/reject/cancel, and immediate H5 rollback.

- [ ] **Step 5: Run observability, privacy, true-device evidence, security audit, and secret scan**

Run: `npm run validate:native-observability && npm run release:candidate:privacy:check && npm run validate:true-device-evidence && npm run release:security:audit && /Users/honglijie/AI-HQ/scripts/secret-scan.sh`

Expected before real-device execution: local observability/privacy/security checks exit `0`; true-device evidence reports the specific missing rows without inventing passes.

- [ ] **Step 6: Commit observability and evidence contracts**

```bash
git add api/store.js api/server.js miniprogram/utils/telemetry.js scripts/check-humi-true-device-evidence.mjs scripts/check-native-observability.mjs docs/humi-1.1-candidate-validation-forms.md package.json
git commit -m "test: add native shell observability gates"
```

---

### Task 18: Candidate Regression, Rollback Drill, and Versioned Handoff

**Files:**
- Create: `scripts/check-native-rollout-readiness.mjs`
- Modify: `docs/humi-1.1-gray-release-tracker.md`
- Modify: `docs/humi-1.1-release-operator-handoff.md`
- Modify: `docs/humi-api-contract.md`
- Modify: `package.json`
- Modify: `/Users/honglijie/AI-HQ/tasks/active/HUMI-2026-001.md`
- Modify: `/Users/honglijie/AI-HQ/projects/humi/STATUS.md`
- Modify: `/Users/honglijie/AI-HQ/projects/humi/METRICS.md`
- Create: `/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/native-shell/HANDOFF.md`

**Interfaces:**
- Consumes every prior test command and a clean candidate commit.
- Produces a versioned `preview` handoff with commit SHA, package version, file path, size, SHA256, validations, blockers, rollback evidence, and explicit external actions not yet performed.

- [ ] **Step 1: Write the rollout-readiness checker before changing release state**

```js
assert.equal(env.HUMI_NATIVE_SHELL_ENABLED, "0", "repository default must remain off");
assert.equal(env.HUMI_NATIVE_SHELL_HOUSEHOLDS, "", "repository allowlist must remain empty");
assert(appJson.pages.includes("pages/legacy/index"));
assert(noAdComponents(miniprogramFiles));
assert(noSupabaseRuntime(sourceFiles));
```

The checker also enforces required scripts, package-size limits, legal domains, rollback path, and absence of `ad`, `ad-custom`, `unit-id`, Supabase imports, and credential values in candidate files.

- [ ] **Step 2: Run the complete local candidate matrix**

Run:

```bash
npm run validate:data
npm run validate:identity
npm run validate:household
npm run validate:collaboration-identity
npm run validate:api
npm run validate:meal-execution
npm run validate:meal-run-client
npm run validate:meal-execution-api
npm run validate:meal-execution-ui
npm run validate:recommendation
npm run validate:native-bootstrap-api
npm run validate:native-session
npm run validate:native-offline
npm run validate:native-shell-routing
npm run validate:native-recommendation
npm run validate:native-tonight
npm run validate:native-cooking
npm run validate:native-primary-tabs
npm run validate:native-sharing
npm run validate:native-observability
npm run validate:share-bridge
npm run validate:miniprogram-entry
npm run validate:h5-entry
npm run validate:miniprogram-poster
npm run validate:miniprogram-meal-reminder
npm run validate:startup-performance
npm run smoke:native-shell-ui
npm run release:product:review
npm run release:product:smoke
npm run release:collaboration:smoke
npm run validate:supabase-retirement
npm run build
npm run release:native-shell:check
git diff --check
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

Expected: every command exits `0`; any failure blocks candidate completion.

- [ ] **Step 3: Perform a local rollback drill**

With an enabled test fixture, boot enters `/pages/tonight/index`. Flip only the mock server `nativeShellEnabled` value to false, clear the one bootstrap read cache entry, relaunch, and verify `/pages/legacy/index` opens with the existing H5 login/share behavior. Do not change data schema or delete native caches during rollback.

- [ ] **Step 4: Record candidate scope and deferred external work**

The handoff must state:

```yaml
status: preview
ads: excluded
production_api_deployed: false
h5_deployed: false
miniprogram_uploaded: false
wechat_review_submitted: false
wechat_released: false
native_allowlist_enabled: false
```

Record the `api.humi-home.com` legal-domain status truthfully. A missing domain is a blocker for real poster image sharing, not a reason to mark the remaining native paths failed.

- [ ] **Step 5: Commit the candidate evidence**

```bash
git add scripts/check-native-rollout-readiness.mjs docs/humi-1.1-gray-release-tracker.md docs/humi-1.1-release-operator-handoff.md docs/humi-api-contract.md package.json
git commit -m "docs: prepare native shell candidate handoff"
```

- [ ] **Step 6: Validate the versioned AI-HQ handoff**

Run:

```bash
/Users/honglijie/AI-HQ/scripts/validate-handoff.sh /Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/native-shell/HANDOFF.md
/Users/honglijie/AI-HQ/scripts/secret-scan.sh
```

Expected: both commands exit `0`; the handoff points to the current candidate and its SHA256 matches.

**Checkpoint N4:** Present the local candidate, test matrix, package-size report, rollback drill, and remaining platform blockers to the user. Do not upload or deploy in this task.

---

### Task 19: Execute External Rollout as Separately Authorized Checkpoints

**Files:**
- Modify only after each authorized action: `docs/humi-1.1-gray-release-tracker.md`
- Modify only after each authorized action: `docs/humi-1.1-release-evidence-log.md`
- Modify only after each authorized action: `/Users/honglijie/AI-HQ/deliverables/humi/HUMI-2026-001/native-shell/HANDOFF.md`
- Modify only after each authorized action: `/Users/honglijie/AI-HQ/projects/humi/STATUS.md`
- Modify only after each authorized action: `/Users/honglijie/AI-HQ/projects/humi/METRICS.md`

**Interfaces:**
- Consumes: N4-approved candidate and explicit user authorization for the current external action.
- Produces evidence for one action at a time; no authorization carries forward automatically to the next action.

- [ ] **Step 1: Checkpoint N5a — deploy API/H5 compatibility changes**

Before deployment, re-run API/product/collaboration/build/secret checks. Deploy the exact approved commit, verify health and rollback endpoint, keep `HUMI_NATIVE_SHELL_ENABLED=0`, and record deployment IDs and production smoke output. Stop for user acceptance.

- [ ] **Step 2: Checkpoint N5b — upload a mini-program experience version**

Verify the AppID `wx4040b89f3b363416`, base library `3.8.10`, request/upload/download domains, privacy declarations, package-size report, and experience-version notes. Upload without submitting for review; record the returned version and upload evidence. Stop for user acceptance.

- [ ] **Step 3: Checkpoint N5c — run real-device internal acceptance**

Collect 390×844 iOS WeChat and Android WeChat evidence for login, identity, five tabs, five rotations per tier, cooking/background/offline, five share types with recipient opens, poster styles/save, task identity, reminder outcomes, and server-flag rollback. Any P0/P1 failure returns the task to implementation; do not submit for review.

- [ ] **Step 4: Checkpoint N5d — submit for WeChat review**

Use the accepted experience version and truthful category/privacy copy. Record submission ID and status; do not represent submission as release. Stop until the review result is available.

- [ ] **Step 5: Checkpoint N5e — release with the native server flag still off**

Release the approved package, run production health checks, verify existing H5 users still enter the compatibility page, and record evidence. Stop for user acceptance before changing the server flag.

- [ ] **Step 6: Checkpoint N5f — staged native allowlist rollout**

Enable in this order: internal accounts → 5 families → 20 families → 20% → 50% → 100%. At each stage observe at least the agreed validation window and compare login success, bootstrap success, share-page visibility, recommendation-to-start rate, start-to-complete rate, and crash/error rate with the previous stage.

- [ ] **Step 7: Apply rollback conditions exactly**

Immediately set `HUMI_NATIVE_SHELL_ENABLED=0` when login/bootstrap/share/MealRun completion materially regresses, a P0/P1 defect appears, or privacy/permission behavior differs from the approved contract. Verify the H5 compatibility page, preserve all data, record the trigger, and stop expansion.

- [ ] **Step 8: Close the rollout only after 100% stability evidence**

Mark the handoff `approved` only when all stages have evidence and the user confirms completion. Keep the H5 fallback for one additional stable mini-program version. Advertising remains absent and requires a new design, risk review, implementation plan, and user approval.

---

## Final Acceptance Matrix

| Area | Required evidence |
|---|---|
| First use | New openid creates one incomplete user, zero households, no false “logged in” identity, explicit nickname/avatar completion |
| Returning use | Valid session opens cached native UI; expired session performs one silent login and one bootstrap replay |
| Recommendation | Three effort tiers × five consecutive groups, no repeated recipe, zero hard-constraint violations |
| Dinner loop | Accept → planned → start → cooking → background restore → downgrade → `上桌了` → one feedback |
| Family | No-household CTA, create/join, two-household switching, owner/member permissions, collaboration identity history |
| Sharing | Menu, grocery, invite, meal task, and poster each sent to a real contact and opened by a recipient |
| Poster | Two consecutive style changes are visibly different; image share/save/cancel/permission recovery pass |
| Reminder | Accept/reject/cancel/send-failure/deep-link pass; permission requested only after explicit schedule confirmation |
| Performance | Native cached paint ≤ 400 ms; warm bootstrap ≤ 1000 ms; cold bootstrap ≤ 2500 ms; H5 initial JS ≤ 350 KB gzip; thumbnails ≤ 80 KB |
| Privacy | Only allowlisted fields, no token/nickname/free text, raw events pruned at 180 days |
| Rollback | Server flag returns every user to `pages/legacy/index` without schema rollback or data loss |
| Scope | No Supabase runtime and no advertising component, identifier, configuration, or rollout work |

## Execution Notes

- Execute Tasks 1–2, 3–6, 7–9, 10–15, and 16–18 as five review batches matching checkpoints N0–N4.
- Use test-driven development for every task: red test, minimal implementation, focused green test, regression, commit.
- Do not combine external Task 19 actions. Each action consumes fresh user authorization and produces its own evidence before the next action.
- If a task changes the interface consumed by a later task, update this plan and the design spec in the same commit before continuing.

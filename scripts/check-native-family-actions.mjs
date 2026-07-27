import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(new URL("..", import.meta.url).pathname);

await checkTaskPage();
await checkSettingsPage();
console.log("Native family task and household settings action checks passed.");

async function checkTaskPage() {
  const token = "t".repeat(32);
  const formalTask = {
    id: "task-1", householdId: "household-1", mealRunId: "run-1", label: "帮忙洗青菜", type: "prep",
    status: "open", claimedBy: null, claimedByName: "", viewerClaimed: false, viewerCanComplete: false,
  };
  let activeSession = null;
  const requests = [];
  const page = loadPage("miniprogram/packageFamily/pages/task/index.js", {
    "../../../utils/request": {
      rawRequest: async () => ({ task: structuredClone(formalTask) }),
      requestHumi: async (options) => {
        requests.push(options);
        if (!activeSession || activeSession.user.id === "outsider") {
          const error = new Error("forbidden"); error.code = "forbidden"; throw error;
        }
        if (options.path.endsWith("/claim")) return { task: { ...formalTask, status: "claimed", claimedBy: activeSession.user.id, claimedByName: activeSession.user.displayName, viewerClaimed: true, viewerCanComplete: true } };
        return { task: { ...page.data.task, status: "completed", completedBy: activeSession.user.id } };
      },
    },
    "../../../utils/session": {
      getSession: () => activeSession,
      loginWithWechat: async () => {
        activeSession = { accessToken: "member-token", expiresAt: Date.now() + 60_000, user: { id: "member-1", displayName: "小米" } };
        return activeSession;
      },
    },
    "../../../utils/telemetry": { trackEvent() {} },
    "../../../behaviors/shareable-page": shareBehavior(),
  }, { getApp: () => ({ setHumiSession(value) { activeSession = value; } }) });

  await page.onLoad({ token });
  assert.equal(page.data.currentUserId, "", "a guest view remains guest-only");
  assert.equal(page.data.task.claimedByName, "", "a public open task does not invent a formal identity");
  await page.claimTask();
  assert.equal(page.data.currentUserId, "member-1", "claiming binds the authenticated member identity");
  assert.equal(page.data.task.claimedByName, "小米", "the claimed task renders the backend claimant identity");
  assert.equal(requests[0].expectedUserId, "member-1", "a claim replay is pinned to the login identity");
  await page.completeTask();
  await page.completeTask();
  const completes = requests.filter((request) => request.path.endsWith("/complete"));
  assert.equal(completes.length, 2, "an explicit replay reaches the idempotent boundary");
  assert.equal(completes[0].idempotencyKey, completes[1].idempotencyKey, "double complete reuses one stable action key");
  assert.equal(completes[0].expectedUserId, "member-1");

  activeSession = { accessToken: "outsider-token", expiresAt: Date.now() + 60_000, user: { id: "outsider", displayName: "路人" } };
  page.setData({ task: structuredClone(formalTask), currentUserId: "outsider" });
  await page.claimTask();
  assert.match(page.data.errorText, /正式成员/, "a non-member receives a truthful claim denial");
}

async function checkSettingsPage() {
  const requests = [];
  const navigations = [];
  const modals = [];
  let bootstrap = householdBootstrap("owner", true);
  let nextFailure = null;
  const page = loadPage("miniprogram/packageFamily/pages/settings/index.js", {
    "../../../utils/bootstrap": { loadBootstrap: async () => bootstrap },
    "../../../utils/household-state": { createMutationId: () => "prefs-key", saveHouseholdStatePatch: async () => bootstrap },
    "../../../utils/request": {
      requestHumi: async (options) => {
        requests.push(options);
        if (nextFailure) { const error = nextFailure; nextFailure = null; throw error; }
        return { household: bootstrap.households[0] };
      },
    },
    "../../../utils/store": {
      appStore: { getState: () => ({ bootstrap }), replaceBootstrap: (value) => { bootstrap = value; } },
    },
  }, {
    wx: {
      showModal(options) { modals.push(options); options.success({ confirm: true }); },
      navigateBack() { navigations.push("back"); },
      navigateTo() {},
    },
  });
  page.onLoad({ householdId: "household-1" });

  page.updateName({ detail: { value: "周末厨房" } });
  await page.saveName();
  assert.deepEqual(stripKey(requests.at(-1)), { path: "/households/household-1", method: "PATCH", data: { name: "周末厨房" } });

  await page.transferOwnership({ detail: { memberId: "member-1" } });
  assert.equal(modals.at(-1).title, "转让家庭创建者？");
  assert.deepEqual(stripKey(requests.at(-1)), { path: "/households/household-1/owner", method: "POST", data: { memberId: "member-1" } });

  await page.removeMember({ detail: { memberId: "member-1" } });
  assert.match(modals.at(-1).title, /移除/);
  assert.deepEqual(stripKey(requests.at(-1)), { path: "/households/household-1/members/member-1", method: "DELETE" });

  bootstrap = householdBootstrap("member", true);
  page.syncState();
  await page.leaveHousehold();
  assert.deepEqual(stripKey(requests.at(-1)), { path: "/households/household-1/leave", method: "POST", data: {} });

  bootstrap = householdBootstrap("owner", false);
  page.syncState();
  await page.leaveHousehold();
  assert.equal(modals.at(-1).title, "解散这个家？");
  assert.deepEqual(stripKey(requests.at(-1)), { path: "/households/household-1/leave", method: "POST", data: {} });

  bootstrap = householdBootstrap("owner", true);
  page.syncState();
  const beforeBlockedLeave = requests.length;
  await page.leaveHousehold();
  assert.equal(requests.length, beforeBlockedLeave, "an owner with other members cannot leave before transfer");
  assert.match(page.data.errorText, /先转让/);

  bootstrap = householdBootstrap("member", true);
  page.syncState();
  const beforeMemberActions = requests.length;
  await page.saveName();
  await page.transferOwnership({ detail: { memberId: "member-1" } });
  await page.removeMember({ detail: { memberId: "member-1" } });
  assert.equal(requests.length, beforeMemberActions, "a member cannot invoke owner-only mutations");

  bootstrap = householdBootstrap("owner", true);
  page.syncState();
  page.updateName({ detail: { value: "保留输入的名字" } });
  const conflict = new Error("state version conflict"); conflict.status = 409; conflict.code = "state_version_conflict";
  nextFailure = conflict;
  await page.saveName();
  assert.equal(page.data.name, "保留输入的名字", "a failed rename keeps the owner's input");
  assert.match(page.data.errorText, /更新|冲突|重试/, "a conflict produces recoverable user-facing guidance");
  assert.equal(page.data.pendingAction, "", "a failed mutation never leaves the page hung");
}

function householdBootstrap(role, withMember) {
  const owner = { id: "owner-1", displayName: "主理人", role: "owner" };
  const member = { id: "member-1", displayName: "小米", role: "member" };
  const current = role === "owner" ? owner : member;
  return {
    stateVersion: "state-v1", activeHouseholdId: "household-1", user: { id: current.id },
    households: [{ id: "household-1", name: "测试家", role, members: withMember ? [owner, member] : [owner] }],
    householdState: { familyProfile: {} },
  };
}

function stripKey(request) {
  const clone = structuredClone(request);
  delete clone.idempotencyKey;
  return clone;
}

function shareBehavior() {
  return { data: { preparedShares: {}, sharePreparing: {}, shareErrors: {} }, methods: { prepareNativeShare: async () => null, getNativeSharePayload: (_event, fallback) => fallback } };
}

function loadPage(relativePath, stubs, globals = {}) {
  let definition;
  const record = { exports: {} };
  const filename = path.join(root, relativePath);
  vm.runInNewContext(readFileSync(filename, "utf8"), {
    ...globals,
    Page: (candidate) => { definition = candidate; },
    module: record,
    exports: record.exports,
    require: (specifier) => {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
      throw new Error(`Unexpected require ${specifier} from ${relativePath}`);
    },
    wx: { navigateTo() {}, ...(globals.wx || {}) },
    console, Date, Math, Promise, Map, encodeURIComponent,
  }, { filename });
  assert(definition, `${relativePath} must register a page`);
  const behaviorMethods = Object.assign({}, ...(definition.behaviors || []).map((behavior) => behavior.methods || {}));
  const behaviorData = Object.assign({}, ...(definition.behaviors || []).map((behavior) => behavior.data || {}));
  return {
    ...behaviorMethods,
    ...definition,
    data: structuredClone({ ...behaviorData, ...(definition.data || {}) }),
    setData(patch) { Object.assign(this.data, patch); },
  };
}

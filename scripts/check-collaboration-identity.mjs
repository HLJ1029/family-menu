import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumiStore } from "../api/store.js";

const directory = await mkdtemp(join(tmpdir(), "humi-collaboration-identity-"));
const store = new HumiStore(join(directory, "data.json"));

const owner = await store.findOrCreateWechatUser({ openid: "collaboration-owner", unionid: null });
await store.updateIdentityAvatar(owner.id, { avatarUrl: "https://api.humi-home.com/avatars/xiaohe.png" });
await store.updateIdentityProfile(owner.id, {
  displayName: "小禾",
});
const household = await store.createHouseholdForUser(owner.id, { householdName: "小禾家" });

await assert.rejects(
  store.recordCollaborationEvent({
    householdId: household.id,
    requestType: "crave",
    requestId: "invalid-participant",
    participantType: "unknown",
    participantId: "spoofed",
    actionType: "crave_vote",
  }),
  (error) => error.code === "collaboration_event_invalid",
  "event participant types must be explicit",
);

const firstGuestEvent = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "crave",
  requestId: "crave-request-a",
  participantType: "guest",
  participantId: "guest-a",
  actionType: "crave_vote",
  payload: { feelingTag: "想吃点热的", dishWish: "番茄鸡蛋面", ignored: "must-not-persist" },
});
assert.equal(firstGuestEvent.displayNameSnapshot, "游客 1");
assert.deepEqual(firstGuestEvent.payload, { feelingTag: "想吃点热的", dishWish: "番茄鸡蛋面" });

const secondGuestEvent = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "crave",
  requestId: "crave-request-a",
  participantType: "guest",
  participantId: "guest-b",
  actionType: "crave_vote",
  payload: { feelingTag: "清淡", note: "少辣" },
});
assert.equal(secondGuestEvent.displayNameSnapshot, "游客 2");

const retry = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "crave",
  requestId: "crave-request-a",
  participantType: "guest",
  participantId: "guest-a",
  actionType: "crave_vote",
  payload: { feelingTag: "想吃点热的", dishWish: "番茄鸡蛋面", note: "加青菜" },
});
assert.equal(retry.id, firstGuestEvent.id, "same guest/action retry must update the existing event");
assert.equal(retry.createdAt, firstGuestEvent.createdAt, "retry must retain original createdAt");
assert.equal(retry.displayNameSnapshot, "游客 1", "retry must retain the guest alias");
assert.deepEqual(retry.payload, { feelingTag: "想吃点热的", dishWish: "番茄鸡蛋面", note: "加青菜" });

const secondRequestGuest = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "crave",
  requestId: "crave-request-b",
  participantType: "guest",
  participantId: "guest-c",
  actionType: "crave_vote",
  payload: { feelingTag: "随便都行" },
});
assert.equal(secondRequestGuest.displayNameSnapshot, "游客 1", "guest aliases are scoped to one request");

const merged = await store.mergeGuestCollaborationEvents({
  requestType: "crave",
  requestId: "crave-request-a",
  guestParticipantId: "guest-a",
  user: owner,
});
assert.equal(merged.length, 1);
assert.equal(merged[0].id, firstGuestEvent.id);
assert.equal(merged[0].participantType, "user");
assert.equal(merged[0].participantId, owner.id);
assert.equal(merged[0].displayNameSnapshot, "小禾");
assert.equal(merged[0].avatarSnapshot, "https://api.humi-home.com/avatars/xiaohe.png");
assert.equal(merged[0].createdAt, firstGuestEvent.createdAt);
assert.deepEqual(merged[0].payload, retry.payload);
assert.equal(merged[0].mergedFromGuestId, "guest-a");
assert.ok(merged[0].mergedAt);

const mergedAgain = await store.mergeGuestCollaborationEvents({
  requestType: "crave",
  requestId: "crave-request-a",
  guestParticipantId: "guest-a",
  user: owner,
});
assert.deepEqual(mergedAgain.map((event) => event.id), merged.map((event) => event.id), "merge must be idempotent");
assert.equal(mergedAgain[0].createdAt, firstGuestEvent.createdAt);

const eventCountBeforeMergedRetry = store.data.collaborationEvents.length;
const mergedGuestRetry = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "crave",
  requestId: "crave-request-a",
  participantType: "guest",
  participantId: "guest-a",
  actionType: "crave_vote",
  payload: { feelingTag: "想吃点热的", dishWish: "番茄鸡蛋面", note: "登录后仍想加青菜" },
});
assert.equal(mergedGuestRetry.id, firstGuestEvent.id, "a merged guest retry must retain the original event id");
assert.equal(mergedGuestRetry.createdAt, firstGuestEvent.createdAt, "a merged guest retry must retain original createdAt");
assert.equal(mergedGuestRetry.participantType, "user", "a merged guest retry must not revert to guest identity");
assert.equal(mergedGuestRetry.participantId, owner.id);
assert.deepEqual(mergedGuestRetry.payload, { feelingTag: "想吃点热的", dishWish: "番茄鸡蛋面", note: "登录后仍想加青菜" });
assert.equal(store.data.collaborationEvents.length, eventCountBeforeMergedRetry, "a merged guest retry must not add history");
const mergeAfterGuestRetry = await store.mergeGuestCollaborationEvents({
  requestType: "crave",
  requestId: "crave-request-a",
  guestParticipantId: "guest-a",
  user: owner,
});
assert.deepEqual(mergeAfterGuestRetry.map((event) => event.id), [firstGuestEvent.id]);
assert.equal(mergeAfterGuestRetry[0].createdAt, firstGuestEvent.createdAt);
assert.deepEqual(mergeAfterGuestRetry[0].payload, mergedGuestRetry.payload);
const anotherUser = await store.findOrCreateWechatUser({ openid: "collaboration-another-user", unionid: null });
const firstOwnerSnapshot = structuredClone(store.data.collaborationEvents.find((event) => event.id === firstGuestEvent.id));
await assert.rejects(
  store.mergeGuestCollaborationEvents({
    requestType: "crave",
    requestId: "crave-request-a",
    guestParticipantId: "guest-a",
    user: anotherUser,
  }),
  (error) => error.code === "collaboration_already_claimed",
  "another user must receive a typed conflict when claiming an already merged guest event",
);
assert.equal(
  store.data.collaborationEvents.find((event) => event.id === firstGuestEvent.id)?.participantId,
  owner.id,
  "an attempted merge takeover must leave the original user identity intact",
);
assert.deepEqual(
  store.data.collaborationEvents.find((event) => event.id === firstGuestEvent.id),
  firstOwnerSnapshot,
  "an attempted merge takeover must preserve the original event snapshot",
);
const eventsBeforeCrossRequestMerge = structuredClone(store.data.collaborationEvents);
await assert.rejects(
  store.mergeGuestCollaborationEvents({
    requestType: "crave",
    requestId: "crave-request-a",
    guestParticipantId: "guest-c",
    user: owner,
  }),
  (error) => error.code === "collaboration_participant_not_found",
  "a guest id that exists only on another request must return a typed not-found error",
);
assert.deepEqual(
  store.data.collaborationEvents,
  eventsBeforeCrossRequestMerge,
  "a cross-request merge attempt must not change collaboration history",
);
await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "grocery",
  requestId: "crave-request-a",
  participantType: "guest",
  participantId: "guest-wrong-type",
  actionType: "grocery_claim",
  payload: { itemIds: ["tomato"] },
});
const eventsBeforeCrossTypeMerge = structuredClone(store.data.collaborationEvents);
await assert.rejects(
  store.mergeGuestCollaborationEvents({
    requestType: "crave",
    requestId: "crave-request-a",
    guestParticipantId: "guest-wrong-type",
    user: owner,
  }),
  (error) => error.code === "collaboration_participant_not_found",
  "a guest id that exists only under another collaboration type must return a typed not-found error",
);
assert.deepEqual(
  store.data.collaborationEvents,
  eventsBeforeCrossTypeMerge,
  "a cross-type merge attempt must not change collaboration history",
);

const guestAfterMerge = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "crave",
  requestId: "crave-request-a",
  participantType: "guest",
  participantId: "guest-a",
  actionType: "grocery_claim",
  payload: { itemIds: ["tomato"], ignored: "must-not-persist" },
});
assert.equal(guestAfterMerge.displayNameSnapshot, "游客 1", "a merged guest must retain its request-scoped alias");
assert.deepEqual(guestAfterMerge.payload, { status: "claimed", itemIds: ["tomato"] });

const directUserEvent = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "wish",
  requestId: "wish-request-collision",
  participantType: "user",
  participantId: owner.id,
  displayNameSnapshot: "小禾",
  avatarSnapshot: "https://api.humi-home.com/avatars/xiaohe.png",
  actionType: "wish_entry",
  payload: { dishName: "清蒸鱼" },
});
const conflictingGuestEvent = await store.recordCollaborationEvent({
  householdId: household.id,
  requestType: "wish",
  requestId: "wish-request-collision",
  participantType: "guest",
  participantId: "guest-collision",
  actionType: "wish_entry",
  payload: { dishName: "红烧肉" },
});
const collisionMerge = await store.mergeGuestCollaborationEvents({
  requestType: "wish",
  requestId: "wish-request-collision",
  guestParticipantId: "guest-collision",
  user: owner,
});
assert.deepEqual(collisionMerge.map((event) => event.id), [conflictingGuestEvent.id], "a collision must retain the guest event instead of copying history");
assert.equal(collisionMerge[0].createdAt, conflictingGuestEvent.createdAt);
assert.deepEqual(collisionMerge[0].payload, { dishName: "红烧肉" });
assert.equal(store.data.collaborationEvents.filter((event) => event.requestId === "wish-request-collision").length, 1);
assert.equal(directUserEvent.id !== collisionMerge[0].id, true);
const repeatedCollisionMerge = await store.mergeGuestCollaborationEvents({
  requestType: "wish",
  requestId: "wish-request-collision",
  guestParticipantId: "guest-collision",
  user: owner,
});
assert.deepEqual(repeatedCollisionMerge.map((event) => event.id), collisionMerge.map((event) => event.id));

for (const event of store.data.collaborationEvents) event.createdAt = "2026-07-20T00:00:00.000Z";
const history = await store.getHouseholdCollaborationEvents(owner.id, household.id, { limit: 0 });
assert.equal(history.length, 1, "history limit must clamp to at least one entry");
assert.equal(history[0].id, conflictingGuestEvent.id, "history must be newest first even when timestamps tie");
const cappedHistory = await store.getHouseholdCollaborationEvents(owner.id, household.id, { limit: 999 });
assert.equal(cappedHistory.length, 6, "history limit must clamp to at most one hundred entries");

const outsider = await store.findOrCreateWechatUser({ openid: "collaboration-outsider", unionid: null });
await assert.rejects(
  store.getHouseholdCollaborationEvents(outsider.id, household.id, { limit: 20 }),
  (error) => error.code === "household_not_found",
  "collaboration history requires formal household membership",
);

const atomicDirectory = await mkdtemp(join(tmpdir(), "humi-collaboration-atomic-"));
const atomicFile = join(atomicDirectory, "data.json");
const atomicStore = new HumiStore(atomicFile);
const atomicUser = await atomicStore.findOrCreateWechatUser({ openid: "atomic-user", unionid: null });
await atomicStore.updateIdentityProfile(atomicUser.id, { displayName: "原子小禾", avatarKey: "humi-avatar-parent-f-01" });
const atomicRequests = {
  crave: await atomicStore.createCraveRequest({ householdName: "原子家" }),
  grocery: await atomicStore.createGroceryShareRequest({
    householdName: "原子家",
    items: [{ id: "milk", name: "牛奶", amount: "1 盒" }],
  }),
  wish: await atomicStore.createWishShareRequest({ householdName: "原子家" }),
};

async function assertSaveFailureRollsBack(label, operation, retry, businessCollection) {
  const beforeMemory = structuredClone(atomicStore.data);
  const beforeBytes = await readFile(atomicFile, "utf8");
  const save = atomicStore.save;
  atomicStore.save = async () => { throw new Error(`${label} injected save failure`); };
  await assert.rejects(operation, /injected save failure/, `${label} must surface the disk failure`);
  assert.deepEqual(atomicStore.data, beforeMemory, `${label} must restore all in-memory collections after a failed save`);
  assert.equal(await readFile(atomicFile, "utf8"), beforeBytes, `${label} must leave the data file byte-for-byte unchanged after a failed save`);
  atomicStore.save = save;
  await retry();
  assert.equal(businessCollection().length, 1, `${label} retry must persist one business action`);
  assert.equal(atomicStore.data.collaborationEvents.filter((event) => event.requestType === label).length, 1, `${label} retry must persist one canonical event`);
}

const guest = { type: "guest", id: "atomic-guest" };
await assertSaveFailureRollsBack(
  "crave",
  () => atomicStore.addCraveVote(atomicRequests.crave.token, { feelingTag: "热的" }, guest),
  () => atomicStore.addCraveVote(atomicRequests.crave.token, { feelingTag: "热的" }, guest),
  () => atomicStore.data.craveRequests.find((request) => request.id === atomicRequests.crave.id)?.votes ?? [],
);
await assertSaveFailureRollsBack(
  "grocery",
  () => atomicStore.addGroceryShareClaim(atomicRequests.grocery.token, { itemIds: ["milk"] }, guest),
  () => atomicStore.addGroceryShareClaim(atomicRequests.grocery.token, { itemIds: ["milk"] }, guest),
  () => atomicStore.data.groceryShareRequests.find((request) => request.id === atomicRequests.grocery.id)?.claims ?? [],
);
await assertSaveFailureRollsBack(
  "wish",
  () => atomicStore.addWishShareEntry(atomicRequests.wish.token, { dishName: "面条" }, guest),
  () => atomicStore.addWishShareEntry(atomicRequests.wish.token, { dishName: "面条" }, guest),
  () => atomicStore.data.wishShareRequests.find((request) => request.id === atomicRequests.wish.id)?.wishes ?? [],
);

async function assertClaimSaveFailureRollsBack(requestType, claim, action) {
  const beforeMemory = structuredClone(atomicStore.data);
  const beforeBytes = await readFile(atomicFile, "utf8");
  const save = atomicStore.save;
  atomicStore.save = async () => { throw new Error(`${requestType} claim injected save failure`); };
  await assert.rejects(claim, /injected save failure/, `${requestType} claim must surface the disk failure`);
  assert.deepEqual(atomicStore.data, beforeMemory, `${requestType} claim must restore all in-memory collections after a failed save`);
  assert.equal(await readFile(atomicFile, "utf8"), beforeBytes, `${requestType} claim must leave the data file byte-for-byte unchanged after a failed save`);
  atomicStore.save = save;
  await claim();
  assert.equal(action().claimedByUserId, atomicUser.id, `${requestType} claim retry must persist exactly once`);
}

await assertClaimSaveFailureRollsBack("crave", () => atomicStore.claimCraveVote(atomicRequests.crave.token, atomicUser.id, { guestParticipantId: guest.id }), () => atomicStore.data.craveRequests.find((request) => request.id === atomicRequests.crave.id)?.votes?.[0]);
await assertClaimSaveFailureRollsBack("grocery", () => atomicStore.claimGroceryShareParticipant(atomicRequests.grocery.token, atomicUser.id, { guestParticipantId: guest.id }), () => atomicStore.data.groceryShareRequests.find((request) => request.id === atomicRequests.grocery.id)?.claims?.[0]);
await assertClaimSaveFailureRollsBack("wish", () => atomicStore.claimWishShareParticipant(atomicRequests.wish.token, atomicUser.id, { guestParticipantId: guest.id }), () => atomicStore.data.wishShareRequests.find((request) => request.id === atomicRequests.wish.id)?.wishes?.[0]);

const concurrentDirectory = await mkdtemp(join(tmpdir(), "humi-collaboration-concurrent-"));
const concurrentFile = join(concurrentDirectory, "data.json");
const concurrentStore = new HumiStore(concurrentFile);
const concurrentRequests = {
  grocery: await concurrentStore.createGroceryShareRequest({
    householdName: "并发家",
    items: [{ id: "rice", name: "大米", amount: "1 袋" }],
  }),
  wish: await concurrentStore.createWishShareRequest({ householdName: "并发家" }),
  crave: await concurrentStore.createCraveRequest({ householdName: "并发家" }),
};
const originalFlushToDisk = concurrentStore.flushToDisk.bind(concurrentStore);
let releaseFirstFlush;
let markFirstFlushStarted;
const firstFlushMayFail = new Promise((resolve) => { releaseFirstFlush = resolve; });
const firstFlushStarted = new Promise((resolve) => { markFirstFlushStarted = resolve; });
let flushCount = 0;
concurrentStore.flushToDisk = async () => {
  flushCount += 1;
  if (flushCount === 1) {
    markFirstFlushStarted();
    await firstFlushMayFail;
    throw new Error("concurrent grocery injected flush failure");
  }
  return originalFlushToDisk();
};

const concurrentGrocery = concurrentStore.addGroceryShareClaim(
  concurrentRequests.grocery.token,
  { itemIds: ["rice"] },
  { type: "guest", id: "concurrent-grocery-guest" },
);
await firstFlushStarted;
let wishStartedWhileGroceryPending = false;
const concurrentWish = (() => {
  wishStartedWhileGroceryPending = true;
  return concurrentStore.addWishShareEntry(
    concurrentRequests.wish.token,
    { dishName: "清蒸鱼" },
    { type: "guest", id: "concurrent-wish-guest" },
  );
})();
assert.equal(wishStartedWhileGroceryPending, true, "wish B must be invoked while grocery A is pending its first flush");
releaseFirstFlush();
const [groceryOutcome, wishOutcome] = await Promise.allSettled([concurrentGrocery, concurrentWish]);
assert.equal(groceryOutcome.status, "rejected", "the transaction owning the failed first flush must reject");
assert.match(groceryOutcome.reason?.message || "", /injected flush failure/);
assert.equal(wishOutcome.status, "fulfilled", "the queued wish transaction must survive the earlier failure");
assert.equal(flushCount, 2, "the failed grocery and successful wish transactions must each attempt one flush");

const concurrentWishRequest = concurrentStore.data.wishShareRequests.find((request) => request.id === concurrentRequests.wish.id);
const concurrentGroceryRequest = concurrentStore.data.groceryShareRequests.find((request) => request.id === concurrentRequests.grocery.id);
assert.equal(concurrentGroceryRequest?.claims.length, 0, "failed grocery A must leave no business action in memory");
assert.equal(concurrentWishRequest?.wishes.length, 1, "successful wish B must retain exactly one business action in memory");
assert.equal(concurrentStore.data.collaborationEvents.filter((event) => event.requestType === "grocery").length, 0, "failed grocery A must leave no canonical event in memory");
assert.equal(concurrentStore.data.collaborationEvents.filter((event) => event.requestType === "wish").length, 1, "successful wish B must retain exactly one canonical event in memory");

const concurrentDisk = JSON.parse(await readFile(concurrentFile, "utf8"));
const persistedShape = (value) => JSON.parse(JSON.stringify(value));
assert.deepEqual(concurrentDisk.groceryShareRequests, persistedShape(concurrentStore.data.groceryShareRequests), "grocery memory and file state must agree after concurrent rollback");
assert.deepEqual(concurrentDisk.wishShareRequests, persistedShape(concurrentStore.data.wishShareRequests), "wish memory and file state must agree after concurrent rollback");
assert.deepEqual(concurrentDisk.collaborationEvents, persistedShape(concurrentStore.data.collaborationEvents), "canonical event memory and file state must agree after concurrent rollback");

concurrentStore.flushToDisk = originalFlushToDisk;
await concurrentStore.addCraveVote(
  concurrentRequests.crave.token,
  { feelingTag: "热的" },
  { type: "guest", id: "post-failure-crave-guest" },
);
assert.equal(concurrentStore.data.craveRequests.find((request) => request.id === concurrentRequests.crave.id)?.votes.length, 1, "a later transaction must remain writable after the queue sees a failure");
assert.equal(concurrentStore.data.collaborationEvents.filter((event) => event.requestType === "crave").length, 1, "a later transaction must persist its canonical event after the queue sees a failure");
const recoveredDisk = JSON.parse(await readFile(concurrentFile, "utf8"));
assert.deepEqual(recoveredDisk.craveRequests, persistedShape(concurrentStore.data.craveRequests), "post-failure business memory and file state must agree");
assert.deepEqual(recoveredDisk.collaborationEvents, persistedShape(concurrentStore.data.collaborationEvents), "post-failure event memory and file state must agree");

for (let round = 1; round <= 10; round += 1) {
  const crossQueueDirectory = await mkdtemp(join(tmpdir(), "humi-collaboration-cross-queue-"));
  const crossQueueFile = join(crossQueueDirectory, "data.json");
  const crossQueueStore = new HumiStore(crossQueueFile);
  const grocery = await crossQueueStore.createGroceryShareRequest({
    householdName: "跨队列家",
    items: [{ id: "rice", name: "大米", amount: "1 袋" }],
  });
  const originalCrossQueueFlush = crossQueueStore.flushToDisk.bind(crossQueueStore);
  let releaseFailedFlush;
  let markFailedFlushStarted;
  const failedFlushMayContinue = new Promise((resolve) => { releaseFailedFlush = resolve; });
  const failedFlushStarted = new Promise((resolve) => { markFailedFlushStarted = resolve; });
  let crossQueueFlushCount = 0;
  crossQueueStore.flushToDisk = async () => {
    crossQueueFlushCount += 1;
    if (crossQueueFlushCount === 1) {
      markFailedFlushStarted();
      await failedFlushMayContinue;
      throw new Error(`cross-queue round ${round} injected flush failure`);
    }
    return originalCrossQueueFlush();
  };

  const failedTransaction = crossQueueStore.addGroceryShareClaim(
    grocery.token,
    { itemIds: ["rice"] },
    { type: "guest", id: `cross-queue-grocery-${round}` },
  );
  await failedFlushStarted;
  const successfulOrdinaryWrite = crossQueueStore.createWishShareRequest({ householdName: "跨队列家" });
  releaseFailedFlush();
  const [failedTransactionOutcome, ordinaryWriteOutcome] = await Promise.allSettled([
    failedTransaction,
    successfulOrdinaryWrite,
  ]);
  assert.equal(failedTransactionOutcome.status, "rejected", `cross-queue round ${round}: A must reject`);
  assert.match(failedTransactionOutcome.reason?.message || "", /injected flush failure/);
  assert.equal(ordinaryWriteOutcome.status, "fulfilled", `cross-queue round ${round}: B must fulfill`);
  assert.equal(crossQueueFlushCount, 2, `cross-queue round ${round}: A and B must each flush once`);
  assert.equal(crossQueueStore.data.groceryShareRequests.find((request) => request.id === grocery.id)?.claims.length, 0, `cross-queue round ${round}: failed A must leave zero grocery claims`);
  assert.equal(crossQueueStore.data.wishShareRequests.length, 1, `cross-queue round ${round}: successful B must leave one wish request`);
  const crossQueueDisk = JSON.parse(await readFile(crossQueueFile, "utf8"));
  assert.deepEqual(crossQueueDisk.groceryShareRequests, persistedShape(crossQueueStore.data.groceryShareRequests), `cross-queue round ${round}: grocery memory and file must agree`);
  assert.deepEqual(crossQueueDisk.wishShareRequests, persistedShape(crossQueueStore.data.wishShareRequests), `cross-queue round ${round}: wish memory and file must agree`);

  crossQueueStore.flushToDisk = originalCrossQueueFlush;
  await crossQueueStore.createWishShareRequest({ householdName: "跨队列家" });
  await crossQueueStore.addCraveVote(
    (await crossQueueStore.createCraveRequest({ householdName: "跨队列家" })).token,
    { feelingTag: "热的" },
    { type: "guest", id: `cross-queue-post-failure-${round}` },
  );
  const postFailureDisk = JSON.parse(await readFile(crossQueueFile, "utf8"));
  assert.deepEqual(postFailureDisk, persistedShape(crossQueueStore.data), `cross-queue round ${round}: later ordinary and transaction writes must remain durable`);
}

await assertOrdinaryWriterSurvivesFailedTransaction("create-household", async (store, round) => {
  const user = await store.findOrCreateWechatUser({ openid: `cross-queue-household-${round}` });
  return {
    write: () => store.createHouseholdForUser(user.id, { householdName: `并发新家 ${round}` }),
    assertPersisted: () => {
      assert.equal(store.data.households.filter((household) => household.ownerId === user.id).length, 1, `create-household round ${round}: B must retain its new household`);
    },
  };
});

await assertOrdinaryWriterSurvivesFailedTransaction("save-state", async (store, round) => {
  const user = await store.findOrCreateWechatUser({ openid: `cross-queue-state-${round}` });
  const household = await store.createHouseholdForUser(user.id, { householdName: `状态家 ${round}` });
  return {
    write: () => store.saveState(user.id, { todayMenu: [{ recipeId: "tomato-egg", quantity: 1 }] }, household.id),
    assertPersisted: () => {
      assert.equal(store.data.householdStates[household.id]?.todayMenu?.[0]?.recipeId, "tomato-egg", `save-state round ${round}: B must retain its household state`);
    },
  };
});

const expiredRead = await atomicStore.createCraveRequest({ deadlineAt: new Date(Date.now() - 60_000).toISOString() });
const expiredReadBeforeMemory = structuredClone(atomicStore.data);
const expiredReadBeforeBytes = await readFile(atomicFile, "utf8");
const expiredReadPublic = await atomicStore.getCraveRequest(expiredRead.token);
assert.equal(expiredReadPublic.status, "closed", "an expired public Crave read must truthfully project closed status");
assert.deepEqual(atomicStore.data, expiredReadBeforeMemory, "an expired public Crave read must not mutate Store memory");
assert.equal(await readFile(atomicFile, "utf8"), expiredReadBeforeBytes, "an expired public Crave read must not write the data file");
await atomicStore.getCraveRequest(expiredRead.token);
assert.equal(await readFile(atomicFile, "utf8"), expiredReadBeforeBytes, "repeated expired public Crave reads must remain zero-write");

console.log("Collaboration identity checks passed.");

async function assertOrdinaryWriterSurvivesFailedTransaction(label, setupWriter) {
  for (let round = 1; round <= 10; round += 1) {
    const directory = await mkdtemp(join(tmpdir(), `humi-collaboration-${label}-`));
    const file = join(directory, "data.json");
    const store = new HumiStore(file);
    const writer = await setupWriter(store, round);
    const grocery = await store.createGroceryShareRequest({
      householdName: "跨队列家",
      items: [{ id: "rice", name: "大米", amount: "1 袋" }],
    });
    const originalFlush = store.flushToDisk.bind(store);
    let releaseFailedFlush;
    let markFailedFlushStarted;
    const failedFlushMayContinue = new Promise((resolve) => { releaseFailedFlush = resolve; });
    const failedFlushStarted = new Promise((resolve) => { markFailedFlushStarted = resolve; });
    let flushCount = 0;
    store.flushToDisk = async () => {
      flushCount += 1;
      if (flushCount === 1) {
        markFailedFlushStarted();
        await failedFlushMayContinue;
        throw new Error(`${label} round ${round} injected flush failure`);
      }
      return originalFlush();
    };
    const failedTransaction = store.addGroceryShareClaim(
      grocery.token,
      { itemIds: ["rice"] },
      { type: "guest", id: `${label}-grocery-${round}` },
    );
    await failedFlushStarted;
    const ordinaryWrite = writer.write();
    releaseFailedFlush();
    const [transactionOutcome, ordinaryOutcome] = await Promise.allSettled([failedTransaction, ordinaryWrite]);
    assert.equal(transactionOutcome.status, "rejected", `${label} round ${round}: A must reject`);
    assert.match(transactionOutcome.reason?.message || "", /injected flush failure/);
    assert.equal(ordinaryOutcome.status, "fulfilled", `${label} round ${round}: B must fulfill`);
    assert.equal(flushCount, 2, `${label} round ${round}: A and B must each flush once`);
    assert.equal(store.data.groceryShareRequests.find((request) => request.id === grocery.id)?.claims.length, 0, `${label} round ${round}: failed A must leave zero grocery claims`);
    writer.assertPersisted();
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), persistedShape(store.data), `${label} round ${round}: memory and file must agree`);
  }
}

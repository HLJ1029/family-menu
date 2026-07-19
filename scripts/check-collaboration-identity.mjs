import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumiStore } from "../api/store.js";

const directory = await mkdtemp(join(tmpdir(), "humi-collaboration-identity-"));
const store = new HumiStore(join(directory, "data.json"));

const owner = await store.findOrCreateWechatUser({ openid: "collaboration-owner", unionid: null });
await store.updateIdentityProfile(owner.id, {
  displayName: "小禾",
  avatarUrl: "https://api.humi-home.com/avatars/xiaohe.png",
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
assert.equal(cappedHistory.length, 5, "history limit must clamp to at most one hundred entries");

const outsider = await store.findOrCreateWechatUser({ openid: "collaboration-outsider", unionid: null });
await assert.rejects(
  store.getHouseholdCollaborationEvents(outsider.id, household.id, { limit: 20 }),
  (error) => error.code === "household_not_found",
  "collaboration history requires formal household membership",
);

console.log("Collaboration identity checks passed.");

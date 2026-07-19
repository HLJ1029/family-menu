import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumiStore } from "../api/store.js";

const directory = await mkdtemp(join(tmpdir(), "humi-household-lifecycle-"));
const store = new HumiStore(join(directory, "data.json"));

async function createCompleteUser(openid, displayName) {
  const user = await store.findOrCreateWechatUser({ openid, unionid: null });
  return store.updateIdentityProfile(user.id, { displayName, avatarKey: user.avatarKey });
}

async function joinByHouseholdInvite(owner, household, member, memberName = member.displayName) {
  const invite = await store.createHouseholdInvite(owner.id, { householdId: household.id });
  return store.acceptHouseholdInvite(invite.token, member.id, { memberName });
}

async function saveFormerFamilyState(user, household, marker) {
  await store.saveState(user.id, {
    todayMenu: [{ recipeId: `${marker}-menu`, quantity: 1 }],
    mealLogs: { "2026-07-19": { marker } },
    familyProfile: { goals: [marker] },
  }, household.id);
}

async function assertFreshHouseholdHasNoFormerState(user, householdName, marker) {
  const household = await store.createHouseholdForUser(user.id, { householdName });
  const state = await store.getState(user.id);
  assert.equal(state, null, `${marker} must not migrate a former menu, log, or family profile into a new household`);
  return household;
}

// Exiting a relationship must retire the legacy bootstrap snapshot. These regressions
// intentionally exercise a new household creation, which used to resurrect states[userId].
const removalOwner = await createCompleteUser("removal-owner", "移除主厨");
const removedMember = await createCompleteUser("removed-member", "被移除家人");
const removalHousehold = await store.createHouseholdForUser(removalOwner.id, { householdName: "移除前的家" });
await joinByHouseholdInvite(removalOwner, removalHousehold, removedMember);
await saveFormerFamilyState(removedMember, removalHousehold, "removed");
await store.removeHouseholdMember(removalOwner.id, removalHousehold.id, removedMember.id);
await assertFreshHouseholdHasNoFormerState(removedMember, "移除后的新家", "removed member");

const leaveOwner = await createCompleteUser("leave-owner", "离开主厨");
const leavingMember = await createCompleteUser("leaving-member", "离开的家人");
const leaveHousehold = await store.createHouseholdForUser(leaveOwner.id, { householdName: "离开前的家" });
await joinByHouseholdInvite(leaveOwner, leaveHousehold, leavingMember);
await saveFormerFamilyState(leavingMember, leaveHousehold, "left");
await store.leaveHousehold(leavingMember.id, leaveHousehold.id);
await assertFreshHouseholdHasNoFormerState(leavingMember, "离开后的新家", "left member");

const soloOwner = await createCompleteUser("solo-owner", "独居主厨");
const soloHousehold = await store.createHouseholdForUser(soloOwner.id, { householdName: "独居前的家" });
await saveFormerFamilyState(soloOwner, soloHousehold, "solo");
await store.leaveHousehold(soloOwner.id, soloHousehold.id);
await assertFreshHouseholdHasNoFormerState(soloOwner, "独居后的新家", "last owner");

// Collaboration claims bind the authenticated action identity only. They never grant
// formal household membership; an explicit household invite is the transition instead.
const owner = await createCompleteUser("household-owner", "小禾");
const craveGuest = await createCompleteUser("crave-guest", "感觉参与者");
const groceryGuest = await createCompleteUser("grocery-guest", "买菜参与者");
const wishGuest = await createCompleteUser("wish-guest", "想吃参与者");
const member = await createCompleteUser("household-member", "小米");
const secondMember = await createCompleteUser("household-second-member", "小满");
const household = await store.createHouseholdForUser(owner.id, { householdName: "我们家" });

const crave = await store.createCraveRequest({}, owner.id);
await store.addCraveVote(
  crave.token,
  { feelingTag: "随便都行" },
  { type: "guest", id: "crave-guest" },
);
const claimedCrave = await store.claimCraveVote(crave.token, craveGuest.id, { participantKey: "crave-guest" });
assert.equal(claimedCrave.votes[0].memberId, craveGuest.id, "crave claim must bind the authenticated identity");
assert.deepEqual(await store.getHouseholdsForUser(craveGuest.id), [], "crave claim must not create household membership");
assert.equal(await store.getState(craveGuest.id), null, "crave claim must not expose household state");

const grocery = await store.createGroceryShareRequest({ items: [{ id: "milk", name: "牛奶" }] }, owner.id);
await store.addGroceryShareClaim(
  grocery.token,
  { itemIds: ["milk"] },
  { type: "guest", id: "grocery-guest" },
);
const claimedGrocery = await store.claimGroceryShareParticipant(grocery.token, groceryGuest.id, { participantKey: "grocery-guest" });
assert.equal(claimedGrocery.claims[0].memberId, groceryGuest.id, "grocery claim must bind the authenticated identity");
assert.deepEqual(await store.getHouseholdsForUser(groceryGuest.id), [], "grocery claim must not create household membership");
assert.equal(await store.getState(groceryGuest.id), null, "grocery claim must not expose household state");

const wish = await store.createWishShareRequest({}, owner.id);
await store.addWishShareEntry(
  wish.token,
  { dishName: "红烧肉" },
  { type: "guest", id: "wish-guest" },
);
const claimedWish = await store.claimWishShareParticipant(wish.token, wishGuest.id, { participantKey: "wish-guest" });
assert.equal(claimedWish.wishes[0].memberId, wishGuest.id, "wish claim must bind the authenticated identity");
assert.deepEqual(await store.getHouseholdsForUser(wishGuest.id), [], "wish claim must not create household membership");
assert.equal(await store.getState(wishGuest.id), null, "wish claim must not expose household state");

const joinedMember = await joinByHouseholdInvite(owner, household, member);
assert(joinedMember.household.members.some((item) => item.memberId === member.id && item.status === "formal"), "invite acceptance must create formal membership");
await joinByHouseholdInvite(owner, household, secondMember);

await assert.rejects(
  store.updateHousehold(member.id, household.id, { name: "越权改名" }),
  (error) => error.code === "forbidden",
);
assert.equal((await store.updateHousehold(owner.id, household.id, { name: "小禾家" })).name, "小禾家");

await assert.rejects(
  store.removeHouseholdMember(owner.id, household.id, owner.id),
  (error) => error.code === "owner_cannot_be_removed",
);
assert.equal((await store.removeHouseholdMember(owner.id, household.id, secondMember.id)).members.length, 2);

const transferred = await store.transferHouseholdOwnership(owner.id, household.id, member.id);
assert.equal(transferred.ownerId, member.id);
assert.equal(transferred.members.find((item) => item.memberId === member.id).role, "owner");
assert.equal(transferred.members.find((item) => item.memberId === owner.id).role, "member");

await assert.rejects(
  store.leaveHousehold(member.id, household.id),
  (error) => error.code === "owner_must_transfer_or_disband",
);
const left = await store.leaveHousehold(owner.id, household.id);
assert.equal(left.household.members.some((item) => item.memberId === owner.id), false);

console.log("Household lifecycle checks passed.");

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

const owner = await createCompleteUser("household-owner", "小禾");
const member = await createCompleteUser("household-member", "小米");
const secondMember = await createCompleteUser("household-second-member", "小满");
const household = await store.createHouseholdForUser(owner.id, { householdName: "我们家" });
await store.addHouseholdMember(household.id, member.id);
await store.addHouseholdMember(household.id, secondMember.id);

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

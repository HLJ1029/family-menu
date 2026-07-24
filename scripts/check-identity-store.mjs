import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APPROVED_AVATAR_KEYS, HumiStore } from "../api/store.js";

const canonicalAvatarKeys = JSON.parse(await readFile(new URL("../api/data/approved-avatar-keys.json", import.meta.url), "utf8"));
const miniProgramAvatarKeys = JSON.parse(await readFile(new URL("../miniprogram/data/approved-avatar-keys.json", import.meta.url), "utf8"));
assert.deepEqual(miniProgramAvatarKeys, canonicalAvatarKeys, "the miniprogram avatar list must exactly project the API canonical contract");
assert.deepEqual(APPROVED_AVATAR_KEYS, canonicalAvatarKeys, "store validation must consume the API canonical avatar contract");

const directory = await mkdtemp(join(tmpdir(), "humi-identity-store-"));
const dataFile = join(directory, "data.json");
const store = new HumiStore(dataFile);

const user = await store.findOrCreateWechatUser({ openid: "identity-openid", unionid: null });
assert.equal((await stat(dataFile)).mode & 0o777, 0o600, "identity data must remain private after atomic writes");
assert.equal(user.profileStatus, "incomplete");
assert.match(user.avatarKey, /^humi-avatar-/);
assert.equal(await store.getActiveHouseholdForUser(user.id), null);
assert.equal(await store.getHouseholdForUser(user.id), null, "legacy read alias must not create a household");
await assert.rejects(
  store.requireActiveHouseholdForUser(user.id),
  (error) => error.code === "household_required",
);

await assert.rejects(
  store.updateIdentityProfile(user.id, { displayName: "只填昵称" }),
  (error) => error.code === "avatar_required",
  "an incomplete user must not complete identity from the server fallback avatar",
);
assert.equal((await store.getUser(user.id)).profileStatus, "incomplete");

await assert.rejects(
  store.updateIdentityProfile(user.id, { displayName: "伪造上传", avatarUrl: "https://attacker.example/avatar.jpg" }),
  (error) => error.code === "avatar_required",
  "only the successful identity-avatar upload path may establish an uploaded avatar",
);

await assert.rejects(
  store.updateIdentityProfile(user.id, { displayName: "伪造头像", avatarKey: "not-an-approved-avatar" }),
  (error) => error.code === "invalid_avatar_key",
  "an arbitrary avatar key must never complete identity",
);
assert.equal((await store.getUser(user.id)).profileStatus, "incomplete");

const avatarOnly = await store.updateIdentityAvatar(user.id, {
  avatarUrl: "https://api.humi-home.com/avatars/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.jpg",
});
assert.equal(avatarOnly.profileStatus, "incomplete", "avatar upload must not complete nickname setup");

const beforeRead = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(beforeRead.households.length, 0, "reading identity must not create a household");

await store.createHouseholdForUser(user.id, { householdName: "旧家庭", memberName: "微信用户" });

const updated = await store.updateIdentityProfile(user.id, {
  displayName: "小禾",
  avatarKey: "",
  avatarUrl: "",
});
assert.equal(updated.displayName, "小禾");
assert.equal(updated.profileStatus, "complete");
const updatedHousehold = await store.getActiveHouseholdForUser(user.id);
const updatedMember = updatedHousehold.members.find((member) => member.memberId === user.id);
assert.equal(updatedMember.nickname, "小禾", "identity completion must update existing household presentation");
assert.equal(updatedMember.avatarKey, updated.avatarKey);
assert.equal(updatedMember.avatarUrl, avatarOnly.avatarUrl);

const approvedUser = await store.findOrCreateWechatUser({ openid: "approved-avatar-openid", unionid: null });
const approved = await store.updateIdentityProfile(approvedUser.id, {
  displayName: "已选择头像",
  avatarKey: "humi-avatar-parent-f-01",
});
assert.equal(approved.profileStatus, "complete", "an approved avatar key may explicitly complete identity");

const issued = await store.issueH5Ticket(user.id, { now: 1_000, ttlMs: 60_000 });
assert.match(issued.ticket, /^[A-Za-z0-9_-]{32,}$/);
assert.equal((await store.consumeH5Ticket(issued.ticket, { now: 2_000 }))?.userId, user.id);
assert.equal(await store.consumeH5Ticket(issued.ticket, { now: 2_001 }), null, "ticket must be single-use");

const expired = await store.issueH5Ticket(user.id, { now: 10_000, ttlMs: 60_000 });
assert.equal(await store.consumeH5Ticket(expired.ticket, { now: 70_001 }), null, "expired ticket must fail");

const persisted = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(JSON.stringify(persisted).includes(issued.ticket), false, "raw ticket must not be stored");
console.log("Identity store checks passed.");

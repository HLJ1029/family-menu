import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumiStore } from "../api/store.js";

const directory = await mkdtemp(join(tmpdir(), "humi-identity-store-"));
const dataFile = join(directory, "data.json");
const store = new HumiStore(dataFile);

const user = await store.findOrCreateWechatUser({ openid: "identity-openid", unionid: null });
assert.equal(user.profileStatus, "incomplete");
assert.match(user.avatarKey, /^humi-avatar-/);
assert.equal(await store.getActiveHouseholdForUser(user.id), null);
assert.equal(await store.getHouseholdForUser(user.id), null, "legacy read alias must not create a household");
await assert.rejects(
  store.requireActiveHouseholdForUser(user.id),
  (error) => error.code === "household_required",
);

const avatarOnly = await store.updateIdentityAvatar(user.id, {
  avatarUrl: "https://api.humi-home.com/avatars/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.jpg",
});
assert.equal(avatarOnly.profileStatus, "incomplete", "avatar upload must not complete nickname setup");

const beforeRead = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(beforeRead.households.length, 0, "reading identity must not create a household");

const updated = await store.updateIdentityProfile(user.id, {
  displayName: "小禾",
  avatarKey: user.avatarKey,
  avatarUrl: "",
});
assert.equal(updated.displayName, "小禾");
assert.equal(updated.profileStatus, "complete");

const issued = await store.issueH5Ticket(user.id, { now: 1_000, ttlMs: 60_000 });
assert.match(issued.ticket, /^[A-Za-z0-9_-]{32,}$/);
assert.equal((await store.consumeH5Ticket(issued.ticket, { now: 2_000 }))?.userId, user.id);
assert.equal(await store.consumeH5Ticket(issued.ticket, { now: 2_001 }), null, "ticket must be single-use");

const expired = await store.issueH5Ticket(user.id, { now: 10_000, ttlMs: 60_000 });
assert.equal(await store.consumeH5Ticket(expired.ticket, { now: 70_001 }), null, "expired ticket must fail");

const persisted = JSON.parse(await readFile(dataFile, "utf8"));
assert.equal(JSON.stringify(persisted).includes(issued.ticket), false, "raw ticket must not be stored");
console.log("Identity store checks passed.");

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = await mkdtemp(join(tmpdir(), "humi-native-grocery-"));
process.env.HUMI_API_DATA_FILE = join(scratch, "data.json");
process.env.HUMI_SESSION_SECRET = "native-grocery-test-secret";
process.env.HUMI_WECHAT_MOCK = "1";
const { createHumiApiServer } = await import("../api/server.js");
const server = createHumiApiServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const owner = await createUser(origin, "owner", "主理人");
  const memberA = await createUser(origin, "member-a", "成员甲");
  const memberB = await createUser(origin, "member-b", "成员乙");
  const family = await request(origin, "/households", {
    method: "POST", token: owner.accessToken, status: 201,
    body: { householdName: "冲突测试家", memberName: "主理人" },
  });
  for (const member of [memberA, memberB]) {
    const invite = await request(origin, "/household-invites", {
      method: "POST", token: owner.accessToken, status: 201,
      body: { householdId: family.family.id },
    });
    await request(origin, `/household-invites/${invite.invite.token}/join`, {
      method: "POST", token: member.accessToken, body: { memberName: member.user.displayName },
    });
  }

  const stateA = await request(origin, "/state", { token: memberA.accessToken });
  const claimedA = await patchState(origin, memberA, family.family.id, stateA.stateVersion, "claim-a", {
    groceryClaims: {
      "ingredient:egg": claim("ingredient:egg", memberA, "claimed"),
    },
  });
  const stateB = await request(origin, "/state", { token: memberB.accessToken });
  const conflictB = await patchState(origin, memberB, family.family.id, stateB.stateVersion, "claim-b", {
    groceryClaims: {
      "ingredient:egg": claim("ingredient:egg", memberB, "claimed"),
    },
  }, 409);
  assert.equal(conflictB.code, "grocery_item_claim_conflict");
  assert.equal(conflictB.latestEnvelope.householdState.groceryClaims["ingredient:egg"].memberId, memberA.user.id);

  const mismatchedKey = await patchState(origin, memberB, family.family.id, stateB.stateVersion, "claim-key-mismatch", {
    groceryClaims: {
      "ingredient:egg": claim("ingredient:milk", memberB, "claimed"),
    },
  }, 400);
  assert.equal(mismatchedKey.code, "grocery_claim_invalid");
  const spoofedIdentity = await patchState(origin, memberB, family.family.id, stateB.stateVersion, "claim-spoof", {
    groceryClaims: {
      "ingredient:milk": claim("ingredient:milk", memberA, "claimed"),
    },
  }, 403);
  assert.equal(spoofedIdentity.code, "forbidden");
  assert.equal(
    spoofedIdentity.latestEnvelope.householdState.groceryClaims["ingredient:egg"].memberId,
    memberA.user.id,
    "identity rejection returns the authoritative claim envelope",
  );

  const latestA = await request(origin, "/state", { token: memberA.accessToken });
  const doneA = await patchState(origin, memberA, family.family.id, latestA.stateVersion, "claim-a-done", {
    groceryClaims: {
      "ingredient:egg": claim("ingredient:egg", memberA, "done"),
    },
  });
  assert.equal(doneA.householdState.groceryClaims["ingredient:egg"].status, "done");
  const replayA = await patchState(origin, memberA, family.family.id, latestA.stateVersion, "claim-a-done", {
    groceryClaims: {
      "ingredient:egg": claim("ingredient:egg", memberA, "done"),
    },
  });
  assert.equal(replayA.stateVersion, doneA.stateVersion);

  const invalidMode = await request(origin, "/grocery-share-requests", {
    method: "POST", token: memberB.accessToken, status: 400,
    body: {
      mode: "editable_but_claimless",
      idempotencyKey: "invalid-share-mode",
      items: [{ id: "ingredient:egg", name: "鸡蛋" }],
    },
  });
  assert.equal(invalidMode.code, "grocery_share_mode_invalid");

  const readOnly = await request(origin, "/grocery-share-requests", {
    method: "POST", token: memberB.accessToken, status: 201,
    body: {
      mode: "read_only",
      idempotencyKey: "readonly-list",
      items: [{ id: "ingredient:egg", name: "鸡蛋", checked: true }],
    },
  });
  const readOnlyPublic = await request(origin, `/grocery-share-requests/${readOnly.request.token}`);
  assert.equal(readOnlyPublic.request.mode, "read_only");
  const rejectedClaim = await request(origin, `/grocery-share-requests/${readOnly.request.token}/claims`, {
    method: "POST", status: 403,
    body: { guestParticipantId: "guest-readonly", itemIds: ["ingredient:egg"] },
  });
  assert.equal(rejectedClaim.code, "grocery_share_read_only");
  const rejectedCheck = await request(origin, `/grocery-share-requests/${readOnly.request.token}/items/ingredient%3Aegg/check`, {
    method: "POST", status: 403, body: { checked: false },
  });
  assert.equal(rejectedCheck.code, "grocery_share_read_only");

  const collaborative = await request(origin, "/grocery-share-requests", {
    method: "POST", token: memberB.accessToken, status: 201,
    body: {
      idempotencyKey: "collaborative-list",
      items: [{ id: "ingredient:milk", name: "牛奶", checked: false }],
    },
  });
  assert.equal(collaborative.request.mode, "collaboration");
  await request(origin, `/grocery-share-requests/${collaborative.request.token}/claims`, {
    method: "POST",
    body: { guestParticipantId: "guest-collab", itemIds: ["ingredient:milk"] },
  });
  await request(origin, `/grocery-share-requests/${collaborative.request.token}/items/ingredient%3Amilk/check`, {
    method: "POST", body: { checked: true },
  });

  console.log("Native grocery claim ownership and read-only sharing checks passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}

function claim(itemKey, user, status) {
  return {
    itemKey,
    itemName: itemKey.endsWith("egg") ? "鸡蛋" : "牛奶",
    memberId: user.user.id,
    memberName: user.user.displayName,
    status,
  };
}

async function createUser(origin, code, displayName) {
  const login = await request(origin, "/auth/wechat/login", { method: "POST", body: { code } });
  const profile = await request(origin, "/identity/profile", {
    method: "PUT", token: login.accessToken,
    body: { displayName, avatarKey: "humi-avatar-parent-f-01" },
  });
  return { ...login, user: profile.user };
}

function patchState(origin, user, householdId, stateVersion, idempotencyKey, patch, status = 200) {
  return request(origin, "/state", {
    method: "PUT", token: user.accessToken, stateVersion, idempotencyKey, status,
    body: { householdId, patch },
  });
}

async function request(origin, path, {
  method = "GET", token = "", body, stateVersion = "", idempotencyKey = "", status = 200,
} = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (stateVersion) headers["If-Match"] = stateVersion;
  if (idempotencyKey) headers["X-Humi-Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${origin}${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

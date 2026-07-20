import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 18787;
const smokeDirectory = await mkdtemp(join(tmpdir(), "humi-api-smoke-"));
const dataFile = join(smokeDirectory, "data.json");
const smokeSessionSecret = "humi-api-smoke-secret";
const explicitWechatOpenIds = new Set();
let explicitHouseholdCreateCount = 0;
process.env.HUMI_API_DATA_FILE = dataFile;
process.env.HUMI_AVATAR_DIR = join(smokeDirectory, "avatars");
process.env.HUMI_POSTER_DIR = join(smokeDirectory, "posters");
process.env.HUMI_PUBLIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.HUMI_SESSION_SECRET = smokeSessionSecret;
const { createHumiApiServer } = await import("../api/server.js");
const { createSessionToken } = await import("../api/session.js");
const server = createHumiApiServer();

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const health = await request(`${baseUrl}/health`);
  assert(health.ok, "health should be ok");

  await assertUnauthorizedCreate(`${baseUrl}/crave-requests`, {
    householdName: "匿名测试家",
    initiatorName: "匿名用户",
  }, "anonymous crave request creation");
  await assertUnauthorizedCreate(`${baseUrl}/grocery-shares`, {
    initiatorName: "匿名用户",
    items: [{ key: "custom:milk", name: "牛奶", amount: "1盒", type: "custom" }],
  }, "anonymous grocery share creation");

  explicitWechatOpenIds.add(`smoke-${runId}`);
  const login = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `smoke-${runId}` },
  });
  assert(login.accessToken, "login should return accessToken");
  assert(login.user?.provider === "wechat", "login should return wechat user");
  assert.equal(login.user?.profileStatus, "incomplete");
  assert.match(login.user?.avatarKey || "", /^humi-avatar-/);

  const posterJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const unauthorizedPoster = await rawRequest(`${baseUrl}/poster-shares`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: posterJpeg,
  });
  assert(unauthorizedPoster.status === 401, "poster upload should require a WeChat session");
  const uploadedPoster = await rawRequest(`${baseUrl}/poster-shares`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      Authorization: `Bearer ${login.accessToken}`,
    },
    body: posterJpeg,
  });
  assert(uploadedPoster.status === 201, "poster upload should return 201");
  assert(uploadedPoster.data.poster?.format === "jpg", "poster upload should detect JPEG");
  assert(uploadedPoster.data.poster?.bytes === posterJpeg.length, "poster upload should report exact bytes");
  assert(/^[A-Za-z0-9_-]{24,64}$/.test(uploadedPoster.data.poster?.token || ""), "poster upload should return an opaque token");
  const posterPath = `/poster-shares/${uploadedPoster.data.poster.token}.jpg`;
  const downloadedPoster = await rawRequest(`${baseUrl}${posterPath}`);
  assert(downloadedPoster.status === 200, "uploaded poster should be publicly downloadable by opaque token");
  assert(downloadedPoster.contentType === "image/jpeg", "poster download should keep image content type");
  assert(Buffer.compare(downloadedPoster.buffer, posterJpeg) === 0, "poster download should return the uploaded bytes");
  const posterHead = await rawRequest(`${baseUrl}${posterPath}`, { method: "HEAD" });
  assert(posterHead.status === 200, "poster HEAD should succeed");
  assert(posterHead.contentLength === String(posterJpeg.length), "poster HEAD should expose content length");
  const invalidPoster = await rawRequest(`${baseUrl}/poster-shares`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      Authorization: `Bearer ${login.accessToken}`,
    },
    body: Buffer.from("not-an-image"),
  });
  assert(invalidPoster.status === 415, "poster upload should reject invalid image signatures");
  const oversizedPoster = Buffer.alloc(951 * 1024, 0);
  oversizedPoster.set([0xff, 0xd8, 0xff], 0);
  const rejectedOversizedPoster = await rawRequest(`${baseUrl}/poster-shares`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      Authorization: `Bearer ${login.accessToken}`,
    },
    body: oversizedPoster,
  });
  assert(rejectedOversizedPoster.status === 413, "poster upload should reject images over 950KB");

  const me = await request(`${baseUrl}/me`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(me.user?.id === login.user.id, "me should return current user");
  assert.equal(me.family, null, "reading /me must not create a household");
  assert.deepEqual(me.households, []);

  const initialStateEnvelope = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(initialStateEnvelope.state, null, "reading /state before creation must not bootstrap state");
  assert.equal(initialStateEnvelope.family, null, "reading /state before creation must not create a household");
  assert.deepEqual(initialStateEnvelope.households, []);
  const initialHouseholds = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(initialHouseholds.family, null, "reading /households before creation must not create a household");
  assert.deepEqual(initialHouseholds.households, []);

  const avatarJpeg = await readFile(new URL("../public/recipe-images/chive-egg.jpg", import.meta.url));
  const avatarUpload = await request(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/jpeg", dataBase64: avatarJpeg.toString("base64") },
  });
  assert.equal(avatarUpload.user.profileStatus, "incomplete", "avatar alone must not complete identity");
  assert.match(avatarUpload.user.avatarUrl, /^http:\/\/127\.0\.0\.1:18787\/avatars\//);
  const downloadedAvatar = await rawRequest(avatarUpload.user.avatarUrl);
  assert.equal(downloadedAvatar.status, 200);
  assert.equal(Buffer.compare(downloadedAvatar.buffer, avatarJpeg), 0);

  await assertRejectedRequest(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/jpeg", dataBase64: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64") },
  }, 415, "invalid_avatar");

  const fakeJpeg = Buffer.alloc(16, 0);
  fakeJpeg.set([0xff, 0xd8, 0xff, 0xc0], 0);
  fakeJpeg.set([0xff, 0xd9], fakeJpeg.length - 2);
  await assertRejectedRequest(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/jpeg", dataBase64: fakeJpeg.toString("base64") },
  }, 415, "invalid_avatar");

  const fakePng = Buffer.alloc(33, 0);
  fakePng.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  fakePng.writeUInt32BE(13, 8);
  fakePng.write("IHDR", 12, "ascii");
  fakePng.writeUInt32BE(0, fakePng.length - 12);
  fakePng.write("IEND", fakePng.length - 8, "ascii");
  await assertRejectedRequest(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/png", dataBase64: fakePng.toString("base64") },
  }, 415, "invalid_avatar");

  const avatarPng = await readFile(new URL("../public/icons/humi-icon-192.png", import.meta.url));
  const pngAvatarUpload = await request(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/png", dataBase64: avatarPng.toString("base64") },
  });
  assert.match(pngAvatarUpload.user.avatarUrl, /\.png$/);
  const downloadedPngAvatar = await rawRequest(pngAvatarUpload.user.avatarUrl);
  assert.equal(downloadedPngAvatar.status, 200);
  assert.equal(Buffer.compare(downloadedPngAvatar.buffer, avatarPng), 0);

  await assertRejectedRequest(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/jpeg", dataBase64: Buffer.from("not-an-image").toString("base64") },
  }, 415, "invalid_avatar");

  const oversizedAvatar = Buffer.alloc(513 * 1024, 0);
  oversizedAvatar.set([0xff, 0xd8, 0xff], 0);
  await assertRejectedRequest(`${baseUrl}/identity/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { mimeType: "image/jpeg", dataBase64: oversizedAvatar.toString("base64") },
  }, 415, "invalid_avatar");

  await assertRejectedRequest(`${baseUrl}/identity/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { displayName: "" },
  }, 400, "display_name_required");

  await assertRejectedRequest(`${baseUrl}/auth/h5-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  }, 409, "identity_required");

  const identityProfile = await request(`${baseUrl}/identity/profile`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { displayName: "小禾", avatarKey: "humi-avatar-parent-f-01" },
  });
  assert.equal(identityProfile.user.displayName, "小禾");
  assert.equal(identityProfile.user.avatarKey, "humi-avatar-parent-f-01");
  assert.equal(identityProfile.user.profileStatus, "complete");

  const ticket = await request(`${baseUrl}/auth/h5-ticket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.match(ticket.ticket, /^[A-Za-z0-9_-]{32,}$/);
  const exchanged = await request(`${baseUrl}/auth/h5/exchange`, {
    method: "POST",
    body: { ticket: ticket.ticket },
  });
  assert.equal(exchanged.user.id, login.user.id);
  await assertRejectedRequest(`${baseUrl}/auth/h5/exchange`, {
    method: "POST",
    body: { ticket: ticket.ticket },
  }, 401, "invalid_h5_ticket");

  await assertRejectedRequest(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { state: { todayMenu: [] } },
  }, 409, "household_required");
  await assertRejectedRequest(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "测试家", initiatorName: "小禾" },
  }, 409, "household_required");

  await assertRejectedRequest(`${baseUrl}/households`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "   ", memberName: "小禾" },
  }, 400, "household_name_required");
  const householdsAfterBlankName = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.deepEqual(householdsAfterBlankName.households, [], "blank household names must not create a household");

  const nullHouseholdBody = await rawRequest(`${baseUrl}/households`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${login.accessToken}`,
    },
    body: "null",
  });
  assert.equal(nullHouseholdBody.status, 400, "literal JSON null must be rejected as a missing household name");
  assert.equal(nullHouseholdBody.data?.error, "household_name_required");
  const householdsAfterNullBody = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(householdsAfterNullBody.family, null, "literal JSON null must not create an active household");
  assert.deepEqual(householdsAfterNullBody.households, [], "literal JSON null must not create a household");

  const firstHousehold = await request(`${baseUrl}/households`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "测试家", memberName: "小禾" },
  });
  explicitHouseholdCreateCount += 1;
  assert.equal(firstHousehold.family?.ownerId, login.user.id);
  assert.equal(firstHousehold.households?.length, 1);

  const phone = await request(`${baseUrl}/auth/wechat/phone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { code: "phone-smoke" },
  });
  assert(phone.user?.phoneVerified === true, "phone should be verified");
  assert(phone.user?.phoneMasked === "138****1234", "phone should be masked");

  const profile = await request(`${baseUrl}/profile`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      profile: {
        planningMode: "daily_family",
        familySize: 2,
        tastePreferences: ["家常"],
        goals: ["省时"],
        dislikes: [],
        allergies: ["花生"],
        shoppingTolerance: "medium",
      },
    },
  });
  assert(profile.profileCompleted >= 4, "profile should be saved");

  const savedStateEnvelope = await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      state: {
        todayMenu: [{ recipeId: "tomato-egg", quantity: 2 }],
        weekPlan: { 周一: ["tomato-egg"], 周二: [], 周三: [], 周四: [], 周五: [], 周六: [], 周日: [] },
        mealPlan: {
          "2026-07-01": {
            breakfast: [{ recipeId: "plain-rice-porridge", quantity: 1 }],
            lunch: [{ recipeId: "tomato-egg", quantity: 1 }],
            dinner: [{ recipeId: "tomato-egg", quantity: 2 }],
          },
        },
        mealLogs: {
          "2026-07-01": {
            source: "home",
            confirmation: "changed",
            consumedEntries: [],
            plannedEntries: [{ recipeId: "tomato-egg", quantity: 2 }],
            quickConfirmedAt: new Date().toISOString(),
            meals: {
              breakfast: { source: "home", consumedEntries: [{ recipeId: "plain-rice-porridge", quantity: 1 }] },
              lunch: { source: "outside", consumedEntries: [] },
            },
          },
        },
        checkedItems: { "ingredient:tomato": true },
        groceryClaims: {
          "ingredient:tomato": {
            itemKey: "ingredient:tomato",
            itemName: "西红柿",
            memberId: login.user.id,
            memberName: "主厨",
            status: "claimed",
            claimedAt: new Date().toISOString(),
          },
        },
        pantryItems: [{ key: "pantry:tomato", name: "西红柿", amount: "3 个", source: "清单完成" }],
        customItems: [{ key: "custom:milk", name: "牛奶", amount: "1 盒", source: "手动添加" }],
        recommendationAccess: { plan: "free", preciseTrialRemaining: 2, preciseUsed: 1 },
        wantToEatItems: [{
          id: "want:smoke",
          title: "麻婆豆腐",
          recipeId: "mapo-tofu",
          memberId: login.user.id,
          memberName: "主厨",
          status: "open",
          createdAt: new Date().toISOString(),
        }],
        craveSignals: [{
          id: "crave:state-smoke",
          token: "crave-state-smoke-token",
          ownerSecret: "must-not-be-shared",
          householdName: "测试家",
          initiatorName: "主厨",
          feelingTag: "清淡点",
          status: "open",
          deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          votes: [],
          createdAt: new Date().toISOString(),
        }],
        activeCraveRequest: {
          token: "active-crave-state-smoke",
          ownerSecret: "must-not-leak-to-members",
          householdName: "测试家",
          starterFeeling: "清淡点",
          status: "open",
          votes: [],
        },
        activeGroceryShareRequest: {
          token: "active-grocery-state-smoke",
          householdName: "测试家",
          status: "open",
          items: [{ id: "milk", name: "牛奶" }],
          claims: [],
        },
        activeWishShareRequest: {
          token: "active-wish-state-smoke",
          householdName: "测试家",
          status: "open",
          wishes: [],
        },
        pendingJoinContext: {
          type: "crave",
          token: "active-crave-state-smoke",
          participantKey: "must-stay-on-this-device",
        },
        householdMembers: [{
          id: "temporary-member",
          name: "临时家人",
          role: "member",
          status: "pending",
          participantKey: "must-not-sync-to-household",
        }],
        familyProfile: { familySize: 3, goals: ["省时"] },
      },
    },
  });
  const savedState = savedStateEnvelope.state;
  assert(savedState?.todayMenu?.[0]?.quantity === 2, "state should save menu");
  assert(savedState?.pantryItems?.[0]?.name === "西红柿", "state should save pantry");

  const loadedStateEnvelope = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  const loadedState = loadedStateEnvelope.state;
  assert(loadedState?.todayMenu?.[0]?.recipeId === "tomato-egg", "state should load menu");
  assert(loadedState?.familyProfile?.familySize === 3, "state should load profile");
  assert(loadedState?.mealLogs?.["2026-07-01"]?.confirmation === "changed", "state should load quick dinner confirmation");
  assert(loadedState?.mealPlan?.["2026-07-01"]?.breakfast?.[0]?.recipeId === "plain-rice-porridge", "state should load breakfast meal plan");
  assert(loadedState?.mealLogs?.["2026-07-01"]?.meals?.lunch?.source === "outside", "state should load lunch source log");
  assert(loadedState?.groceryClaims?.["ingredient:tomato"]?.status === "claimed", "state should load grocery claims");
  assert(loadedState?.recommendationAccess?.preciseTrialRemaining === 2, "state should load recommendation access");
  assert(loadedState?.wantToEatItems?.[0]?.recipeId === "mapo-tofu", "state should load want-to-eat pool");
  assert(loadedState?.craveSignals?.[0]?.token === "crave-state-smoke-token", "state should persist active crave signal across sessions");
  assert(loadedState?.activeCraveRequest?.token === "active-crave-state-smoke", "state should persist the active crave request");
  assert(!loadedState?.activeCraveRequest?.ownerSecret, "shared active crave state must not expose the owner secret");
  assert(loadedState?.activeGroceryShareRequest?.token === "active-grocery-state-smoke", "state should persist the active grocery request");
  assert(loadedState?.activeWishShareRequest?.token === "active-wish-state-smoke", "state should persist the active wish request");
  assert(!loadedState?.craveSignals?.[0]?.ownerSecret, "shared state must not expose crave owner secret");
  assert(loadedState?.pendingJoinContext === undefined, "shared state must not persist a device's temporary join credential");
  assert(loadedState?.householdMembers?.[0]?.participantKey === undefined, "shared member mirrors must strip temporary participant keys");
  assert(
    loadedStateEnvelope.family?.members?.some((member) => member.memberId === login.user.id),
    "owner household should include owner member",
  );
  assert(
    loadedStateEnvelope.family?.members?.some((member) => (
      member.memberId === login.user.id && member.role === "owner" && member.status === "formal"
    )),
    "owner household member should expose owner role and formal status",
  );
  assert(Array.isArray(loadedStateEnvelope.households), "state envelope should include households");
  assert(loadedStateEnvelope.households?.length === 1, "new user should start with one active household");

  const spoofedAccessEnvelope = await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      state: {
        ...loadedState,
        recommendationAccess: { plan: "plus", preciseTrialRemaining: 20, preciseUsed: 0 },
      },
    },
  });
  assert(spoofedAccessEnvelope.state?.recommendationAccess?.plan === "free", "client state must not grant plus access");
  assert(spoofedAccessEnvelope.state?.recommendationAccess?.preciseTrialRemaining === 2, "client state must not restore precise trials");
  assert(spoofedAccessEnvelope.state?.recommendationAccess?.preciseUsed === 1, "client state must not reduce precise usage");

  const secondHousehold = await request(`${baseUrl}/households`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "爸妈家", memberName: "主厨" },
  });
  explicitHouseholdCreateCount += 1;
  assert(secondHousehold.households?.length === 2, "user should be able to create a second household");
  assert(secondHousehold.family?.name === "爸妈家", "new household should become active");
  assert(secondHousehold.family?.role === "owner", "new household should keep current user as owner");
  const blankSecondHousehold = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(!blankSecondHousehold.state?.todayMenu?.length, "new second household should start without original menu");
  await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      state: {
        todayMenu: [{ recipeId: "mapo-tofu", quantity: 1 }],
        weekPlan: { 周一: ["mapo-tofu"], 周二: [], 周三: [], 周四: [], 周五: [], 周六: [], 周日: [] },
        mealPlan: {
          "2026-07-01": {
            breakfast: [],
            lunch: [],
            dinner: [{ recipeId: "mapo-tofu", quantity: 1 }],
          },
        },
        familyProfile: { familySize: 4, goals: ["照顾老人"] },
      },
    },
  });
  const switchedBack = await request(`${baseUrl}/households/active`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: loadedStateEnvelope.family.id },
  });
  assert(switchedBack.family?.id === loadedStateEnvelope.family.id, "should switch back to original household");
  assert(switchedBack.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "original household should keep original state");
  const switchedAgain = await request(`${baseUrl}/households/active`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: secondHousehold.family.id },
  });
  assert(switchedAgain.state?.todayMenu?.[0]?.recipeId === "mapo-tofu", "second household should keep separate state");
  await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdId: loadedStateEnvelope.family.id,
      state: {
        ...loadedState,
        todayMenu: [{ recipeId: "tomato-egg", quantity: 3 }],
      },
    },
  });
  const activeSecondAfterDelayedOriginalSave = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(
    activeSecondAfterDelayedOriginalSave.state?.todayMenu?.[0]?.recipeId === "mapo-tofu",
    "a delayed save for the original household must not overwrite the active second household",
  );
  await request(`${baseUrl}/households/active`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: loadedStateEnvelope.family.id },
  });

  const crave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "测试家", initiatorName: "主厨", initialFeelingTag: "想喝汤" },
  });
  assert(crave.request?.token, "crave request should return token");
  assert(crave.request?.householdId === loadedStateEnvelope.family?.id, "crave request should attach owner household");
  assert(crave.request?.initialFeelingTag === "想喝汤", "crave request should preserve the initiator feeling for no-reply fallback");
  assert(
    Number.isFinite(Date.parse(crave.request?.deadlineAt)),
    "crave request should return an explicit deadline",
  );
  const collaborationEventsBeforePublicGets = await readCollaborationEvents();
  const publicCraveRequest = await request(`${baseUrl}/crave-requests/${crave.request.token}`);
  assertNoCollaborationResponseLeaks(publicCraveRequest, "public crave GET");
  assert.deepEqual(
    await readCollaborationEvents(),
    collaborationEventsBeforePublicGets,
    "reading a public crave request must not create collaboration history",
  );
  const generatedCraveGuest = await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: {
      memberName: "伪造的游客称呼",
      feelingTag: "清淡一点",
      dishWish: "冬瓜汤",
      note: "少油",
    },
  });
  assert.equal(generatedCraveGuest.participant?.type, "guest", "guest crave submit should return canonical participant type");
  assert.equal(generatedCraveGuest.participant?.actionId, generatedCraveGuest.request?.votes?.[0]?.id, "guest crave submit must return the exact server-issued action id");
  assertNoCollaborationResponseLeaks(generatedCraveGuest, "public crave action response");
  assert.match(generatedCraveGuest.participant?.id || "", /^[A-Za-z0-9-]{20,}$/i, "guest crave submit should return a server-generated id");
  assert.equal(generatedCraveGuest.participant?.displayName, "游客 1", "guest crave alias should be request-scoped");
  assert.equal(generatedCraveGuest.request?.votes?.[0]?.memberName, "游客 1", "legacy crave name should derive from canonical guest");
  const firstCraveGuestAction = generatedCraveGuest.request?.votes?.[0];
  const firstCraveGuestEvent = (await readCollaborationEvents()).find((event) => (
    event.requestType === "crave" && event.requestId === crave.request.id && event.participantId === generatedCraveGuest.participant.id
  ));
  assert(firstCraveGuestEvent, "guest crave submit should persist a canonical collaboration event");
  const retriedCraveGuest = await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: {
      guestParticipantId: generatedCraveGuest.participant.id,
      feelingTag: "清淡一点",
      dishWish: "冬瓜汤",
      note: "少油少盐",
    },
  });
  const retriedCraveGuestAction = retriedCraveGuest.request?.votes?.find((vote) => vote.id === firstCraveGuestAction?.id);
  const retriedCraveGuestEvent = (await readCollaborationEvents()).find((event) => event.id === firstCraveGuestEvent.id);
  assert.equal(retriedCraveGuestAction?.id, firstCraveGuestAction?.id, "guest crave retry should preserve business action id");
  assert.equal(retriedCraveGuestAction?.createdAt, firstCraveGuestAction?.createdAt, "guest crave retry should preserve business action creation time");
  assert.equal(retriedCraveGuestEvent?.createdAt, firstCraveGuestEvent.createdAt, "guest crave retry should preserve event creation time");
  const collaborationEventsBeforeInvalidCrave = await readCollaborationEvents();
  const craveActionsBeforeInvalidBearer = await readCollaborationBusinessActions("crave", crave.request.id);
  await assertRejectedRequest(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    headers: { Authorization: "Bearer bad" },
    body: { feelingTag: "不应写入" },
  }, 401, "invalid_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidCrave, "invalid crave bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("crave", crave.request.id), craveActionsBeforeInvalidBearer, "invalid crave bearer must not create a business action");
  await assertRejectedRequest(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${createExpiredBearer(login.user.id)}` },
    body: { feelingTag: "不应写入" },
  }, 401, "invalid_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidCrave, "expired crave bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("crave", crave.request.id), craveActionsBeforeInvalidBearer, "expired crave bearer must not create a business action");
  const craveRequestsBeforeUnknownToken = await readCollaborationRequestCollection("crave");
  await assertRejectedRequest(`${baseUrl}/crave-requests/unknown-crave-token/votes`, {
    method: "POST",
    body: { feelingTag: "不应写入" },
  }, 404, "crave_request_not_found");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidCrave, "unknown crave token must not create collaboration history");
  assert.deepEqual(await readCollaborationRequestCollection("crave"), craveRequestsBeforeUnknownToken, "unknown crave token must not create a business action");
  explicitWechatOpenIds.add(`revoked-crave-${runId}`);
  const revokedCraveSession = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `revoked-crave-${runId}` },
  });
  await request(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedCraveSession.accessToken}` },
  });
  await assertRejectedRequest(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedCraveSession.accessToken}` },
    body: { feelingTag: "不应写入" },
  }, 401, "revoked_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidCrave, "revoked crave bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("crave", crave.request.id), craveActionsBeforeInvalidBearer, "revoked crave bearer must not create a business action");
  const legacyCraveGuest = await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: {
      participantKey: "participant-smoke",
      memberName: "家人",
      feelingTag: "辣一点",
      dishWish: "番茄汤",
      temporary: true,
    },
  });
  explicitWechatOpenIds.add(`family-member-smoke-${runId}`);
  const memberLogin = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `family-member-smoke-${runId}` },
  });
  const signedInCraveVote = await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: {
      guestParticipantId: "forged-guest-id",
      memberId: "forged-user-id",
      memberName: "伪造的登录昵称",
      displayNameSnapshot: "伪造快照",
      avatar: "https://forged.example/avatar.png",
      feelingTag: "想喝汤",
    },
  });
  assert.deepEqual(
    signedInCraveVote.participant,
    {
      type: "user",
      id: memberLogin.user.id,
      displayName: memberLogin.user.displayName,
      avatar: memberLogin.user.avatarUrl || memberLogin.user.avatarKey,
    },
    "signed-in crave action must derive identity only from the server session",
  );
  const claimedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { guestParticipantId: legacyCraveGuest.participant.id },
  });
  const claimedCraveVote = claimedCrave.request?.votes?.find((vote) => vote.dishWish === "番茄汤");
  assert(claimedCraveVote?.temporary === false, "crave claim should bind the authenticated participant");
  assert(claimedCraveVote?.dishWish === "番茄汤", "crave claim should preserve the optional dish wish");
  assert(!claimedCraveVote?.memberId, "public crave response must not expose authenticated participant ids");
  assert.deepEqual(claimedCrave.participant, {
    type: "user",
    id: memberLogin.user.id,
    displayName: memberLogin.user.displayName,
    avatar: memberLogin.user.avatarUrl || memberLogin.user.avatarKey,
  }, "crave merge must return the server-derived authenticated participant snapshot");
  assertNoCollaborationResponseLeaks(claimedCrave, "generic crave join response");
  const publicClaimedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}`);
  assert.equal(JSON.stringify(publicClaimedCrave).includes("claimedByUserId"), false, "public crave GET must not expose internal claim ownership");
  const claimedCraveAction = (await readCollaborationBusinessActions("crave", crave.request.id)).find((vote) => vote.id === claimedCraveVote.id);
  const claimedCraveEvent = (await readCollaborationEvents()).find((event) => event.mergedFromGuestId === legacyCraveGuest.participant.id && event.requestId === crave.request.id);
  assert.equal(claimedCraveAction?.claimedByUserId, memberLogin.user.id, "first crave merge must persist the authenticated claimant");
  assert.equal(claimedCraveEvent?.participantId, memberLogin.user.id, "first crave merge must canonicalize the event user");
  const retriedMergedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: { guestParticipantId: legacyCraveGuest.participant.id, feelingTag: "辣一点", dishWish: "番茄汤", note: "合并后更新" },
  });
  const retriedMergedCraveAction = (await readCollaborationBusinessActions("crave", crave.request.id)).find((vote) => vote.id === claimedCraveVote.id);
  const retriedMergedCraveEvent = (await readCollaborationEvents()).find((event) => event.id === claimedCraveEvent.id);
  assert.equal(retriedMergedCrave.request?.votes?.find((vote) => vote.id === claimedCraveVote.id)?.temporary, false, "merged crave guest retry must not revert the public action to temporary");
  assert.equal(retriedMergedCraveAction?.memberId, memberLogin.user.id, "merged crave guest retry must retain the formal business identity");
  assert.equal(retriedMergedCraveAction?.claimedByUserId, memberLogin.user.id, "merged crave guest retry must retain claim ownership");
  assert.equal(retriedMergedCraveEvent?.participantId, memberLogin.user.id, "merged crave guest retry must retain canonical event identity");
  const craveActionSnapshot = structuredClone(claimedCraveAction);
  const craveEventSnapshot = structuredClone(claimedCraveEvent);
  const repeatedCraveMerge = await request(`${baseUrl}/crave-requests/${crave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { guestParticipantId: legacyCraveGuest.participant.id, memberId: "forged", memberName: "伪造", avatar: "https://forged.example/avatar.png" },
  });
  const repeatedCraveAction = (await readCollaborationBusinessActions("crave", crave.request.id)).find((vote) => vote.id === claimedCraveVote.id);
  const repeatedCraveEvent = (await readCollaborationEvents()).find((event) => event.id === claimedCraveEvent.id);
  assert.equal(repeatedCraveMerge.request?.votes?.find((vote) => vote.id === claimedCraveVote.id)?.id, claimedCraveVote.id, "same-user crave merge must preserve the business action id");
  assert.equal(repeatedCraveAction?.createdAt, craveActionSnapshot.createdAt, "same-user crave merge must preserve the business action timestamp");
  assert.equal(repeatedCraveEvent?.id, craveEventSnapshot.id, "same-user crave merge must preserve the canonical event id");
  assert.equal(repeatedCraveEvent?.createdAt, craveEventSnapshot.createdAt, "same-user crave merge must preserve the canonical event timestamp");
  const craveBeforeOtherUser = await readCollaborationRequestCollection("crave");
  const craveEventsBeforeOtherUser = await readCollaborationEvents();
  await assertRejectedRequest(`${baseUrl}/crave-requests/${crave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { guestParticipantId: legacyCraveGuest.participant.id },
  }, 409, "collaboration_already_claimed");
  assert.deepEqual(await readCollaborationRequestCollection("crave"), craveBeforeOtherUser, "another user must not change the claimed crave request");
  assert.deepEqual(await readCollaborationEvents(), craveEventsBeforeOtherUser, "another user must not change the claimed crave event");
  const otherCrave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "测试家", initiatorName: "主厨" },
  });
  const otherCraveGuest = await request(`${baseUrl}/crave-requests/${otherCrave.request.token}/votes`, {
    method: "POST",
    body: { guestParticipantId: "crave-other-request-guest", feelingTag: "清淡" },
  });
  const craveBeforeCrossRequest = await readCollaborationRequestCollection("crave");
  const craveEventsBeforeCrossRequest = await readCollaborationEvents();
  await assertRejectedRequest(`${baseUrl}/crave-requests/${crave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { guestParticipantId: otherCraveGuest.participant.id },
  }, 404, "vote_not_found");
  assert.deepEqual(await readCollaborationRequestCollection("crave"), craveBeforeCrossRequest, "a cross-request guest id must not change the target crave request");
  assert.deepEqual(await readCollaborationEvents(), craveEventsBeforeCrossRequest, "a cross-request guest id must not change collaboration history");
  assert(!("family" in claimedCrave) && !("households" in claimedCrave) && !("state" in claimedCrave), "generic crave claim must return only the collaboration request");
  const memberBeforeInviteHouseholds = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
  });
  assert.equal(memberBeforeInviteHouseholds.family, null, "crave claim must not create formal membership");
  assert.deepEqual(memberBeforeInviteHouseholds.households, []);
  const memberBeforeInviteState = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
  });
  assert.equal(memberBeforeInviteState.state, null, "crave claim must not expose the source household state");
  const ownerAfterCraveClaim = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(ownerAfterCraveClaim.family?.members?.length, 1, "crave claim must not grow formal household membership");

  const memberHouseholdInvite = await request(`${baseUrl}/household-invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: loadedStateEnvelope.family.id, inviterName: "主厨" },
  });
  const joinedCrave = await request(`${baseUrl}/household-invites/${memberHouseholdInvite.invite.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { memberName: "家人" },
  });
  assert(
    joinedCrave.family?.members?.some((member) => member.memberId === login.user.id)
      && joinedCrave.family?.members?.some((member) => member.memberId === memberLogin.user.id),
    "explicit invite acceptance should include owner and member",
  );
  assert.equal(joinedCrave.family?.members?.length, 2, "explicit invite acceptance should grow formal membership");
  assert(joinedCrave.family?.role === "member", "joined user should see member role");
  assert(joinedCrave.family?.ownerId === login.user.id, "joined family should keep original owner");
  assert(joinedCrave.households?.some((household) => household.id === loadedStateEnvelope.family.id), "joined crave user should receive households");
  assert(joinedCrave.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "joined crave user should immediately receive shared household state");

  const memberMutation = await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: {
      state: {
        ...joinedCrave.state,
        todayMenu: [{ recipeId: "mapo-tofu", quantity: 9 }],
        familyProfile: { familySize: 9, dislikes: [] },
        recommendationAccess: { plan: "plus", preciseTrialRemaining: 20, preciseUsed: 0 },
        craveSignals: [{ token: "member-forged-crave", status: "closed" }],
        wantToEatItems: [
          ...(joinedCrave.state?.wantToEatItems ?? []),
          {
            id: "want:member-own",
            title: "冬瓜排骨汤",
            recipeId: "wintermelon-rib-soup",
            memberId: memberLogin.user.id,
            memberName: "家人",
            status: "open",
            createdAt: new Date().toISOString(),
          },
          {
            id: "want:member-forged",
            title: "伪造他人想吃",
            memberId: login.user.id,
            memberName: "主厨",
            status: "open",
            createdAt: new Date().toISOString(),
          },
        ],
        groceryClaims: {
          ...(joinedCrave.state?.groceryClaims ?? {}),
          "custom:member-milk": {
            itemKey: "custom:member-milk",
            itemName: "牛奶",
            memberId: memberLogin.user.id,
            memberName: "家人",
            status: "done",
            claimedAt: new Date().toISOString(),
          },
        },
      },
    },
  });
  assert(memberMutation.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "member state save must not replace the owner menu");
  assert(memberMutation.state?.familyProfile?.familySize === 3, "member state save must not replace the family profile");
  assert(memberMutation.state?.recommendationAccess?.plan === "free", "member state save must not grant plus access");
  assert(memberMutation.state?.wantToEatItems?.some((item) => item.id === "want:member-own"), "member should add their own want-to-eat item");
  assert(!memberMutation.state?.wantToEatItems?.some((item) => item.id === "want:member-forged"), "member must not write want-to-eat items for another user");
  assert(memberMutation.state?.groceryClaims?.["custom:member-milk"]?.status === "done", "member should update their own grocery claim");
  assert(memberMutation.state?.checkedItems?.["custom:member-milk"] === true, "completed member grocery claim should mark the item checked");
  assert(memberMutation.state?.craveSignals?.[0]?.token === "crave-state-smoke-token", "member state save must not replace active crave signal");

  const targetedCrave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      recipientIds: [memberLogin.user.id, "not-a-household-member", memberLogin.user.id],
    },
  });
  assert(targetedCrave.request?.recipientCount === 1, "crave recipients should keep only unique household members");
  try {
    await request(`${baseUrl}/crave-requests/${targetedCrave.request.token}/close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
      body: {},
    });
    throw new Error("non-owner authenticated crave close should be forbidden");
  } catch (error) {
    assert(String(error.message).startsWith("403 "), "non-owner authenticated crave close should return 403");
  }
  const ownerClosedTargetedCrave = await request(`${baseUrl}/crave-requests/${targetedCrave.request.token}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      resultSummary: {
        dishes: [{ name: "冬瓜排骨汤", timeMinutes: 45 }],
        reason: "主厨登录后收口。",
        generatedAt: new Date().toISOString(),
      },
    },
  });
  assert(ownerClosedTargetedCrave.request?.status === "closed", "authenticated owner should close crave without client owner secret");
  assert(joinedCrave.state?.wantToEatItems?.[0]?.title === "麻婆豆腐", "joined crave user should immediately receive shared want-to-eat pool");
  assert(
    joinedCrave.family?.members?.some((member) => (
      member.memberId === memberLogin.user.id && member.role === "member" && member.status === "formal"
    )),
    "joined user should become formal household member",
  );
  const closedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}/close`, {
    method: "POST",
    body: {
      ownerSecret: crave.ownerSecret,
      resultSummary: {
        dishes: [{ name: "番茄炒蛋", timeMinutes: 15 }],
        reason: "已揉合家人回复。",
        generatedAt: "2026-07-02T00:00:00.000Z",
      },
    },
  });
  assert(closedCrave.request?.status === "closed", "closed crave request should return closed status");
  assert(closedCrave.request?.resultSummary?.dishes?.[0]?.name === "番茄炒蛋", "closed crave request should expose result summary");
  const closedCraveEventsBeforeSubmit = await readCollaborationEvents();
  const closedCraveActionsBeforeSubmit = await readCollaborationBusinessActions("crave", crave.request.id);
  const closedCraveSubmit = await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: { feelingTag: "不应新增", dishWish: "不应新增" },
  });
  assert.equal(closedCraveSubmit.request?.status, "closed", "closed crave submit should preserve the existing 200 closed contract");
  assert.deepEqual(await readCollaborationEvents(), closedCraveEventsBeforeSubmit, "closed crave submit must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("crave", crave.request.id), closedCraveActionsBeforeSubmit, "closed crave submit must not create a business action");
  const publicClosedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}`);
  assert(publicClosedCrave.request?.resultSummary?.dishes?.[0]?.name === "番茄炒蛋", "public crave request should keep result summary");

  const memberLoadedState = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
  });
  assert(memberLoadedState.family?.id === loadedStateEnvelope.family?.id, "joined member should read owner household");
  assert(memberLoadedState.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "joined member should share household state");
  assert(memberLoadedState.state?.mealLogs?.["2026-07-01"]?.confirmation === "changed", "joined member should share dinner confirmation");
  assert(memberLoadedState.state?.mealPlan?.["2026-07-01"]?.lunch?.[0]?.recipeId === "tomato-egg", "joined member should share lunch meal plan");
  assert(memberLoadedState.state?.mealLogs?.["2026-07-01"]?.meals?.breakfast?.source === "home", "joined member should share breakfast log");
  assert(memberLoadedState.state?.groceryClaims?.["ingredient:tomato"]?.memberId === login.user.id, "joined member should share grocery claims");
  assert(memberLoadedState.state?.recommendationAccess?.preciseUsed === 1, "joined member should share recommendation access");
  assert(memberLoadedState.state?.wantToEatItems?.[0]?.title === "麻婆豆腐", "joined member should share want-to-eat pool");

  const householdInvite = await request(`${baseUrl}/household-invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: loadedStateEnvelope.family.id, inviterName: "主厨" },
  });
  assert(householdInvite.invite?.token, "household invite should return token");
  assert(householdInvite.invite?.householdId === loadedStateEnvelope.family.id, "household invite should attach household");
  const publicInvite = await request(`${baseUrl}/household-invites/${householdInvite.invite.token}`);
  assert(publicInvite.invite?.householdName === loadedStateEnvelope.family.name, "public invite should expose household name");
  const temporaryInviteWant = await request(`${baseUrl}/household-invites/${householdInvite.invite.token}/wants`, {
    method: "POST",
    body: {
      participantKey: "temporary-invite-want-smoke",
      memberName: "想吃面的家人",
      title: "牛肉面",
    },
  });
  assert(temporaryInviteWant.want?.title === "牛肉面", "invite guest should add a want-to-eat item without login");
  assert(temporaryInviteWant.want?.temporary === true, "invite guest want should remain temporary before joining");
  const stateWithTemporaryInviteWant = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(
    stateWithTemporaryInviteWant.state?.wantToEatItems?.some((item) => (
      item.title === "牛肉面" && item.memberId === "temporary:temporary-invite-want-smoke"
    )),
    "invite guest want should persist in the household want-to-eat pool",
  );
  explicitWechatOpenIds.add(`invite-member-smoke-${runId}`);
  const invitedLogin = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `invite-member-smoke-${runId}` },
  });
  const joinedInvite = await request(`${baseUrl}/household-invites/${householdInvite.invite.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${invitedLogin.accessToken}` },
    body: { memberName: "被邀请的家人", participantKey: "temporary-invite-want-smoke" },
  });
  assert(joinedInvite.family?.role === "member", "invite joiner should see member role");
  assert(
    joinedInvite.family?.members?.some((member) => member.memberId === invitedLogin.user.id && member.status === "formal"),
    "invite joiner should become formal household member",
  );
  assert(joinedInvite.households?.some((household) => household.id === loadedStateEnvelope.family.id), "invite joiner should receive households");
  assert(joinedInvite.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "invite joiner should immediately receive shared household state");
  assert(joinedInvite.state?.wantToEatItems?.some((item) => item.title === "麻婆豆腐"), "invite joiner should immediately receive shared want-to-eat pool");
  assert(
    joinedInvite.state?.wantToEatItems?.some((item) => (
      item.title === "牛肉面" && item.memberId === invitedLogin.user.id && item.temporary === false
    )),
    "joining should merge the invite guest want into the formal member identity",
  );
  try {
    await request(`${baseUrl}/household-invites`, {
      method: "POST",
      headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
      body: { householdId: loadedStateEnvelope.family.id, inviterName: "家人" },
    });
    throw new Error("non-owner invite creation should be forbidden");
  } catch (error) {
    assert(String(error.message).startsWith("403 "), "non-owner invite creation should return 403");
  }
  try {
    await request(`${baseUrl}/crave-requests`, {
      method: "POST",
      headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
      body: { householdName: "测试家", initiatorName: "家人" },
    });
    throw new Error("non-owner crave request creation should be forbidden");
  } catch (error) {
    assert(String(error.message).startsWith("403 "), "non-owner crave request creation should return 403");
  }
  try {
    await request(`${baseUrl}/grocery-shares`, {
      method: "POST",
      headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
      body: {
        initiatorName: "家人",
        items: [{ key: "custom:member-milk", name: "牛奶", amount: "1盒", type: "custom", source: "顺手买" }],
      },
    });
    throw new Error("non-owner grocery share creation should be forbidden");
  } catch (error) {
    assert(String(error.message).startsWith("403 "), "non-owner grocery share creation should return 403");
  }

  const groceryShare = await request(`${baseUrl}/grocery-shares`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      initiatorName: "主厨",
      items: [
        { key: "ingredient:tomato", name: "西红柿", amount: "约2个", type: "ingredient", source: "今晚菜单" },
        { key: "custom:milk", name: "牛奶", amount: "1盒", type: "custom", source: "顺手买" },
      ],
    },
  });
  assert(groceryShare.share?.token, "grocery share should return token");
  assert(groceryShare.share?.items?.length === 2, "grocery share should expose items");
  const publicGroceryShare = await request(`${baseUrl}/grocery-shares/${groceryShare.share.token}`);
  assert(publicGroceryShare.share?.householdId === loadedStateEnvelope.family.id, "public grocery share should attach household");
  const claimedGroceryShare = await request(`${baseUrl}/grocery-shares/${groceryShare.share.token}/claims`, {
    method: "POST",
    body: {
      itemKey: "custom:milk",
      participantKey: "temporary-grocery-smoke",
      memberName: "顺路买菜的家人",
    },
  });
  assert(
    claimedGroceryShare.share?.claims?.["custom:milk"]?.memberName === "顺路买菜的家人",
    "grocery share should accept temporary claim",
  );
  try {
    await request(`${baseUrl}/grocery-shares/${groceryShare.share.token}/claims`, {
      method: "POST",
      body: {
        itemKey: "custom:milk",
        participantKey: "second-temporary-grocery-smoke",
        memberName: "另一个家人",
        status: "done",
      },
    });
    throw new Error("second participant should not complete another member's grocery claim");
  } catch (error) {
    assert(String(error.message).startsWith("409 "), "second grocery participant should receive 409 conflict");
  }
  const ownerStateAfterGroceryClaim = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(
    ownerStateAfterGroceryClaim.state?.groceryClaims?.["custom:milk"]?.status === "claimed",
    "temporary grocery claim should sync into household state",
  );

  const batchGrocery = await request(`${baseUrl}/grocery-share-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      items: [
        { id: "tomato", name: "西红柿", amount: "2个", category: "蔬菜" },
        { id: "egg", name: "鸡蛋", amount: "4个", category: "蛋奶" },
      ],
    },
  });
  assert(batchGrocery.request?.items?.length === 2, "batch grocery share should expose the user's complete list");
  const collaborationEventsBeforeGroceryGet = await readCollaborationEvents();
  const publicGroceryRequest = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}`);
  assertNoCollaborationResponseLeaks(publicGroceryRequest, "public grocery GET");
  assert.deepEqual(
    await readCollaborationEvents(),
    collaborationEventsBeforeGroceryGet,
    "reading a public grocery request must not create collaboration history",
  );
  const batchClaim = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    body: {
      memberName: "伪造的买菜身份",
      itemIds: ["tomato", "egg", "forged-item-id"],
      status: "claimed",
      note: "下班路上买",
    },
  });
  assert(batchClaim.request?.claims?.[0]?.itemIds?.length === 2, "batch grocery share should claim multiple items at once");
  assert.equal(batchClaim.participant?.type, "guest", "guest grocery submit should return canonical participant type");
  assert.equal(batchClaim.participant?.actionId, batchClaim.request?.claims?.[0]?.id, "guest grocery submit must return the exact server-issued action id");
  assertNoCollaborationResponseLeaks(batchClaim, "public grocery action response");
  assert.equal(batchClaim.participant?.displayName, "游客 1", "guest grocery alias should be request-scoped");
  const firstGroceryGuestAction = batchClaim.request?.claims?.[0];
  const firstGroceryGuestEvent = (await readCollaborationEvents()).find((event) => (
    event.requestType === "grocery" && event.requestId === batchGrocery.request.id && event.participantId === batchClaim.participant.id
  ));
  assert(firstGroceryGuestEvent, "guest grocery submit should persist a canonical collaboration event");
  assert.deepEqual(firstGroceryGuestEvent.payload?.itemIds, ["tomato", "egg"], "grocery history should keep only accepted item ids");
  const retriedBatchClaim = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    body: {
      guestParticipantId: batchClaim.participant.id,
      itemIds: ["tomato"],
      status: "claimed",
      note: "改成只买西红柿",
    },
  });
  const retriedGroceryGuestAction = retriedBatchClaim.request?.claims?.find((claim) => claim.id === firstGroceryGuestAction?.id);
  const retriedGroceryGuestEvent = (await readCollaborationEvents()).find((event) => event.id === firstGroceryGuestEvent.id);
  assert.equal(retriedGroceryGuestAction?.id, firstGroceryGuestAction?.id, "guest grocery retry should preserve business action id");
  assert.equal(retriedGroceryGuestAction?.createdAt, firstGroceryGuestAction?.createdAt, "guest grocery retry should preserve business action creation time");
  assert.equal(retriedGroceryGuestEvent?.createdAt, firstGroceryGuestEvent.createdAt, "guest grocery retry should preserve event creation time");
  const collaborationEventsBeforeInvalidGrocery = await readCollaborationEvents();
  const groceryActionsBeforeInvalidBearer = await readCollaborationBusinessActions("grocery", batchGrocery.request.id);
  await assertRejectedRequest(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    headers: { Authorization: "Bearer bad" },
    body: { itemIds: ["egg"] },
  }, 401, "invalid_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidGrocery, "invalid grocery bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("grocery", batchGrocery.request.id), groceryActionsBeforeInvalidBearer, "invalid grocery bearer must not create a business action");
  await assertRejectedRequest(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    headers: { Authorization: `Bearer ${createExpiredBearer(login.user.id)}` },
    body: { itemIds: ["egg"] },
  }, 401, "invalid_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidGrocery, "expired grocery bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("grocery", batchGrocery.request.id), groceryActionsBeforeInvalidBearer, "expired grocery bearer must not create a business action");
  const groceryRequestsBeforeUnknownToken = await readCollaborationRequestCollection("grocery");
  await assertRejectedRequest(`${baseUrl}/grocery-share-requests/unknown-grocery-token/claims`, {
    method: "POST",
    body: { itemIds: ["egg"] },
  }, 404, "grocery_share_not_found");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidGrocery, "unknown grocery token must not create collaboration history");
  assert.deepEqual(await readCollaborationRequestCollection("grocery"), groceryRequestsBeforeUnknownToken, "unknown grocery token must not create a business action");
  explicitWechatOpenIds.add(`revoked-grocery-${runId}`);
  const revokedGrocerySession = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `revoked-grocery-${runId}` },
  });
  await request(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedGrocerySession.accessToken}` },
  });
  await assertRejectedRequest(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedGrocerySession.accessToken}` },
    body: { itemIds: ["egg"] },
  }, 401, "revoked_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidGrocery, "revoked grocery bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("grocery", batchGrocery.request.id), groceryActionsBeforeInvalidBearer, "revoked grocery bearer must not create a business action");
  const checkedBatchGrocery = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/items/tomato/check`, {
    method: "POST",
    body: { checked: true },
  });
  assert(checkedBatchGrocery.request?.items?.find((item) => item.id === "tomato")?.checked, "batch grocery item should be checkable");

  const menuShare = await request(`${baseUrl}/menu-share-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      title: "今晚菜单",
      dishes: [{ id: "tomato-egg", name: "西红柿炒鸡蛋", quantity: 1, timeMinutes: 15 }],
      groceryCount: 2,
    },
  });
  const publicMenuShare = await request(`${baseUrl}/menu-share-requests/${menuShare.request.token}`);
  assert(publicMenuShare.request?.dishes?.[0]?.name === "西红柿炒鸡蛋", "menu share should open without login");

  const wishShare = await request(`${baseUrl}/wish-share-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "测试家", initiatorName: "主厨", title: "最近想吃什么" },
  });
  const collaborationEventsBeforeWishGet = await readCollaborationEvents();
  const publicWishRequest = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}`);
  assertNoCollaborationResponseLeaks(publicWishRequest, "public wish GET");
  assert.deepEqual(
    await readCollaborationEvents(),
    collaborationEventsBeforeWishGet,
    "reading a public wish request must not create collaboration history",
  );
  const wishEntry = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    body: {
      memberName: "伪造的想吃身份",
      dishName: "红烧肉",
      note: "周末吃",
    },
  });
  assert(wishEntry.request?.wishes?.[0]?.dishName === "红烧肉", "wish share should receive a guest dish request");
  assert.equal(wishEntry.participant?.type, "guest", "guest wish submit should return canonical participant type");
  assert.equal(wishEntry.participant?.actionId, wishEntry.request?.wishes?.[0]?.id, "guest wish submit must return the exact server-issued action id");
  assertNoCollaborationResponseLeaks(wishEntry, "public wish action response");
  assert.equal(wishEntry.participant?.displayName, "游客 1", "guest wish alias should be request-scoped");
  const firstWishGuestAction = wishEntry.request?.wishes?.[0];
  const firstWishGuestEvent = (await readCollaborationEvents()).find((event) => (
    event.requestType === "wish" && event.requestId === wishShare.request.id && event.participantId === wishEntry.participant.id
  ));
  assert(firstWishGuestEvent, "guest wish submit should persist a canonical collaboration event");
  const retriedWishEntry = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    body: {
      guestParticipantId: wishEntry.participant.id,
      dishName: "红烧肉",
      note: "周末家人一起吃",
    },
  });
  const retriedWishGuestAction = retriedWishEntry.request?.wishes?.find((wish) => wish.id === firstWishGuestAction?.id);
  const retriedWishGuestEvent = (await readCollaborationEvents()).find((event) => event.id === firstWishGuestEvent.id);
  assert.equal(retriedWishGuestAction?.id, firstWishGuestAction?.id, "guest wish retry should preserve business action id");
  assert.equal(retriedWishGuestAction?.createdAt, firstWishGuestAction?.createdAt, "guest wish retry should preserve business action creation time");
  assert.equal(retriedWishGuestEvent?.createdAt, firstWishGuestEvent.createdAt, "guest wish retry should preserve event creation time");

  const collaborationEventsBeforeInvalidWish = await readCollaborationEvents();
  const wishActionsBeforeInvalidBearer = await readCollaborationBusinessActions("wish", wishShare.request.id);
  await assertRejectedRequest(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    headers: { Authorization: "Bearer bad" },
    body: { dishName: "不应写入" },
  }, 401, "invalid_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidWish, "invalid wish bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("wish", wishShare.request.id), wishActionsBeforeInvalidBearer, "invalid wish bearer must not create a business action");
  await assertRejectedRequest(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${createExpiredBearer(login.user.id)}` },
    body: { dishName: "不应写入" },
  }, 401, "invalid_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidWish, "expired wish bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("wish", wishShare.request.id), wishActionsBeforeInvalidBearer, "expired wish bearer must not create a business action");
  const wishRequestsBeforeUnknownToken = await readCollaborationRequestCollection("wish");
  await assertRejectedRequest(`${baseUrl}/wish-share-requests/unknown-wish-token/wishes`, {
    method: "POST",
    body: { dishName: "不应写入" },
  }, 404, "wish_share_not_found");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidWish, "unknown wish token must not create collaboration history");
  assert.deepEqual(await readCollaborationRequestCollection("wish"), wishRequestsBeforeUnknownToken, "unknown wish token must not create a business action");
  explicitWechatOpenIds.add(`revoked-wish-${runId}`);
  const revokedWishSession = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `revoked-wish-${runId}` },
  });
  await request(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedWishSession.accessToken}` },
  });
  await assertRejectedRequest(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedWishSession.accessToken}` },
    body: { dishName: "不应写入" },
  }, 401, "revoked_token");
  assert.deepEqual(await readCollaborationEvents(), collaborationEventsBeforeInvalidWish, "revoked wish bearer must not create collaboration history");
  assert.deepEqual(await readCollaborationBusinessActions("wish", wishShare.request.id), wishActionsBeforeInvalidBearer, "revoked wish bearer must not create a business action");

  explicitWechatOpenIds.add(`collaboration-guest-${runId}`);
  const collaborationGuest = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `collaboration-guest-${runId}` },
  });
  const joinedBatchGrocery = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
    body: { guestParticipantId: batchClaim.participant.id },
  });
  assert(joinedBatchGrocery.request?.claims?.[0]?.temporary === false, "grocery claim should bind the authenticated participant");
  assert.deepEqual(joinedBatchGrocery.participant, {
    type: "user",
    id: collaborationGuest.user.id,
    displayName: collaborationGuest.user.displayName,
    avatar: collaborationGuest.user.avatarUrl || collaborationGuest.user.avatarKey,
  }, "grocery merge must return the server-derived authenticated participant snapshot");
  assertNoCollaborationResponseLeaks(joinedBatchGrocery, "generic grocery join response");
  const publicJoinedGrocery = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}`);
  assert.equal(JSON.stringify(publicJoinedGrocery).includes("claimedByUserId"), false, "public grocery GET must not expose internal claim ownership");
  const joinedGroceryAction = (await readCollaborationBusinessActions("grocery", batchGrocery.request.id)).find((claim) => claim.id === firstGroceryGuestAction.id);
  const joinedGroceryEvent = (await readCollaborationEvents()).find((event) => event.mergedFromGuestId === batchClaim.participant.id && event.requestId === batchGrocery.request.id);
  assert.equal(joinedGroceryAction?.claimedByUserId, collaborationGuest.user.id, "first grocery merge must persist the authenticated claimant");
  const retriedMergedGrocery = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    body: { guestParticipantId: batchClaim.participant.id, itemIds: ["egg"], note: "合并后更新" },
  });
  const retriedMergedGroceryAction = (await readCollaborationBusinessActions("grocery", batchGrocery.request.id)).find((claim) => claim.id === firstGroceryGuestAction.id);
  const retriedMergedGroceryEvent = (await readCollaborationEvents()).find((event) => event.id === joinedGroceryEvent.id);
  assert.equal(retriedMergedGrocery.request?.claims?.find((claim) => claim.id === firstGroceryGuestAction.id)?.temporary, false, "merged grocery guest retry must not revert the public action to temporary");
  assert.equal(retriedMergedGroceryAction?.memberId, collaborationGuest.user.id, "merged grocery guest retry must retain the formal business identity");
  assert.equal(retriedMergedGroceryAction?.claimedByUserId, collaborationGuest.user.id, "merged grocery guest retry must retain claim ownership");
  assert.equal(retriedMergedGroceryEvent?.participantId, collaborationGuest.user.id, "merged grocery guest retry must retain canonical event identity");
  const groceryActionSnapshot = structuredClone(joinedGroceryAction);
  const groceryEventSnapshot = structuredClone(joinedGroceryEvent);
  const repeatedGroceryMerge = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
    body: { guestParticipantId: batchClaim.participant.id, memberName: "伪造" },
  });
  const repeatedGroceryAction = (await readCollaborationBusinessActions("grocery", batchGrocery.request.id)).find((claim) => claim.id === firstGroceryGuestAction.id);
  const repeatedGroceryEvent = (await readCollaborationEvents()).find((event) => event.id === joinedGroceryEvent.id);
  assert.equal(repeatedGroceryMerge.request?.claims?.find((claim) => claim.id === firstGroceryGuestAction.id)?.id, firstGroceryGuestAction.id, "same-user grocery merge must preserve the business action id");
  assert.equal(repeatedGroceryAction?.createdAt, groceryActionSnapshot.createdAt, "same-user grocery merge must preserve the business action timestamp");
  assert.equal(repeatedGroceryEvent?.id, groceryEventSnapshot.id, "same-user grocery merge must preserve the canonical event id");
  assert.equal(repeatedGroceryEvent?.createdAt, groceryEventSnapshot.createdAt, "same-user grocery merge must preserve the canonical event timestamp");
  const groceryBeforeOtherUser = await readCollaborationRequestCollection("grocery");
  const groceryEventsBeforeOtherUser = await readCollaborationEvents();
  await assertRejectedRequest(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { guestParticipantId: batchClaim.participant.id },
  }, 409, "collaboration_already_claimed");
  assert.deepEqual(await readCollaborationRequestCollection("grocery"), groceryBeforeOtherUser, "another user must not change the claimed grocery request");
  assert.deepEqual(await readCollaborationEvents(), groceryEventsBeforeOtherUser, "another user must not change the claimed grocery event");
  assert(!("family" in joinedBatchGrocery) && !("households" in joinedBatchGrocery) && !("state" in joinedBatchGrocery), "generic grocery claim must return only the collaboration request");
  const groceryGuestBeforeInvite = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
  });
  assert.equal(groceryGuestBeforeInvite.family, null, "grocery claim must not create formal membership");
  assert.deepEqual(groceryGuestBeforeInvite.households, []);
  const groceryGuestStateBeforeInvite = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
  });
  assert.equal(groceryGuestStateBeforeInvite.state, null, "grocery claim must not expose the source household state");
  const signedInGroceryClaim = await request(`${baseUrl}/grocery-share-requests/${batchGrocery.request.token}/claims`, {
    method: "POST",
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
    body: {
      guestParticipantId: "forged-guest-id",
      memberId: "forged-user-id",
      memberName: "伪造的登录昵称",
      itemIds: ["egg"],
    },
  });
  assert.deepEqual(
    signedInGroceryClaim.participant,
    {
      type: "user",
      id: collaborationGuest.user.id,
      displayName: collaborationGuest.user.displayName,
      avatar: collaborationGuest.user.avatarUrl || collaborationGuest.user.avatarKey,
    },
    "signed-in grocery action must derive identity only from the server session",
  );
  const groceryGuestAfterSignedInAction = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
  });
  assert.equal(groceryGuestAfterSignedInAction.family, null, "signed-in grocery action must not create formal membership");
  assert.deepEqual(groceryGuestAfterSignedInAction.households, []);
  const collaborationGuestInvite = await request(`${baseUrl}/household-invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: loadedStateEnvelope.family.id, inviterName: "主厨" },
  });
  const invitedCollaborationGuest = await request(`${baseUrl}/household-invites/${collaborationGuestInvite.invite.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${collaborationGuest.accessToken}` },
    body: { memberName: "买菜家人" },
  });
  assert(invitedCollaborationGuest.family?.members?.some((member) => member.memberId === collaborationGuest.user.id), "explicit invite should create the removal-test member");

  explicitWechatOpenIds.add(`wish-guest-${runId}`);
  const wishGuest = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `wish-guest-${runId}` },
  });
  const signedInWishEntry = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${wishGuest.accessToken}` },
    body: {
      guestParticipantId: "forged-guest-id",
      memberId: "forged-user-id",
      memberName: "伪造的登录昵称",
      dishName: "鱼香肉丝",
    },
  });
  assert.deepEqual(
    signedInWishEntry.participant,
    {
      type: "user",
      id: wishGuest.user.id,
      displayName: wishGuest.user.displayName,
      avatar: wishGuest.user.avatarUrl || wishGuest.user.avatarKey,
    },
    "signed-in wish action must derive identity only from the server session",
  );
  const wishGuestAfterSignedInAction = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${wishGuest.accessToken}` },
  });
  assert.equal(wishGuestAfterSignedInAction.family, null, "signed-in wish action must not create formal membership");
  assert.deepEqual(wishGuestAfterSignedInAction.households, []);
  const joinedWish = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${wishGuest.accessToken}` },
    body: { guestParticipantId: wishEntry.participant.id },
  });
  assert(joinedWish.request?.wishes?.[0]?.temporary === false, "wish claim should bind the authenticated participant");
  assert.deepEqual(joinedWish.participant, {
    type: "user",
    id: wishGuest.user.id,
    displayName: wishGuest.user.displayName,
    avatar: wishGuest.user.avatarUrl || wishGuest.user.avatarKey,
  }, "wish merge must return the server-derived authenticated participant snapshot");
  assertNoCollaborationResponseLeaks(joinedWish, "generic wish join response");
  const publicJoinedWish = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}`);
  assert.equal(JSON.stringify(publicJoinedWish).includes("claimedByUserId"), false, "public wish GET must not expose internal claim ownership");
  const joinedWishAction = (await readCollaborationBusinessActions("wish", wishShare.request.id)).find((wish) => wish.id === firstWishGuestAction.id);
  const joinedWishEvent = (await readCollaborationEvents()).find((event) => event.mergedFromGuestId === wishEntry.participant.id && event.requestId === wishShare.request.id);
  assert.equal(joinedWishAction?.claimedByUserId, wishGuest.user.id, "first wish merge must persist the authenticated claimant");
  const retriedMergedWish = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    body: { guestParticipantId: wishEntry.participant.id, dishName: "红烧肉", note: "合并后更新" },
  });
  const retriedMergedWishAction = (await readCollaborationBusinessActions("wish", wishShare.request.id)).find((wish) => wish.id === firstWishGuestAction.id);
  const retriedMergedWishEvent = (await readCollaborationEvents()).find((event) => event.id === joinedWishEvent.id);
  assert.equal(retriedMergedWish.request?.wishes?.find((wish) => wish.id === firstWishGuestAction.id)?.temporary, false, "merged wish guest retry must not revert the public action to temporary");
  assert.equal(retriedMergedWishAction?.memberId, wishGuest.user.id, "merged wish guest retry must retain the formal business identity");
  assert.equal(retriedMergedWishAction?.claimedByUserId, wishGuest.user.id, "merged wish guest retry must retain claim ownership");
  assert.equal(retriedMergedWishEvent?.participantId, wishGuest.user.id, "merged wish guest retry must retain canonical event identity");
  const wishActionSnapshot = structuredClone(joinedWishAction);
  const wishEventSnapshot = structuredClone(joinedWishEvent);
  const repeatedWishMerge = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${wishGuest.accessToken}` },
    body: { guestParticipantId: wishEntry.participant.id, displayName: "伪造" },
  });
  const repeatedWishAction = (await readCollaborationBusinessActions("wish", wishShare.request.id)).find((wish) => wish.id === firstWishGuestAction.id);
  const repeatedWishEvent = (await readCollaborationEvents()).find((event) => event.id === joinedWishEvent.id);
  assert.equal(repeatedWishMerge.request?.wishes?.find((wish) => wish.id === firstWishGuestAction.id)?.id, firstWishGuestAction.id, "same-user wish merge must preserve the business action id");
  assert.equal(repeatedWishAction?.createdAt, wishActionSnapshot.createdAt, "same-user wish merge must preserve the business action timestamp");
  assert.equal(repeatedWishEvent?.id, wishEventSnapshot.id, "same-user wish merge must preserve the canonical event id");
  assert.equal(repeatedWishEvent?.createdAt, wishEventSnapshot.createdAt, "same-user wish merge must preserve the canonical event timestamp");
  const wishBeforeOtherUser = await readCollaborationRequestCollection("wish");
  const wishEventsBeforeOtherUser = await readCollaborationEvents();
  await assertRejectedRequest(`${baseUrl}/wish-share-requests/${wishShare.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { guestParticipantId: wishEntry.participant.id },
  }, 409, "collaboration_already_claimed");
  assert.deepEqual(await readCollaborationRequestCollection("wish"), wishBeforeOtherUser, "another user must not change the claimed wish request");
  assert.deepEqual(await readCollaborationEvents(), wishEventsBeforeOtherUser, "another user must not change the claimed wish event");
  assert(!("family" in joinedWish) && !("households" in joinedWish) && !("state" in joinedWish), "generic wish claim must return only the collaboration request");
  const wishGuestBeforeInvite = await request(`${baseUrl}/households`, {
    headers: { Authorization: `Bearer ${wishGuest.accessToken}` },
  });
  assert.equal(wishGuestBeforeInvite.family, null, "wish claim must not create formal membership");
  assert.deepEqual(wishGuestBeforeInvite.households, []);

  const collaborationHistoryPath = `/households/${loadedStateEnvelope.family.id}/collaborations`;
  const collaborationDataBeforeHistoryReads = await readFile(dataFile, "utf8");
  await assertRejectedRequest(`${baseUrl}${collaborationHistoryPath}`, {}, 401, "missing_token");
  assert.equal(await readFile(dataFile, "utf8"), collaborationDataBeforeHistoryReads, "unauthenticated history read must not write data");
  await assertRejectedRequest(`${baseUrl}${collaborationHistoryPath}`, {
    headers: { Authorization: `Bearer ${wishGuest.accessToken}` },
  }, 404, "household_not_found");
  assert.equal(await readFile(dataFile, "utf8"), collaborationDataBeforeHistoryReads, "outsider history read must not write data");
  await assertRejectedRequest(`${baseUrl}/households/unknown-household/collaborations`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  }, 404, "household_not_found");
  assert.equal(await readFile(dataFile, "utf8"), collaborationDataBeforeHistoryReads, "unknown household history read must not write data");
  await assertRejectedRequest(`${baseUrl}${collaborationHistoryPath}`, {
    headers: { Authorization: "Bearer bad" },
  }, 401, "invalid_token");
  assert.equal(await readFile(dataFile, "utf8"), collaborationDataBeforeHistoryReads, "invalid history bearer must not write data");
  await assertRejectedRequest(`${baseUrl}${collaborationHistoryPath}`, {
    headers: { Authorization: `Bearer ${createExpiredBearer(login.user.id)}` },
  }, 401, "invalid_token");
  assert.equal(await readFile(dataFile, "utf8"), collaborationDataBeforeHistoryReads, "expired history bearer must not write data");
  explicitWechatOpenIds.add(`revoked-history-${runId}`);
  const revokedHistorySession = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `revoked-history-${runId}` },
  });
  await request(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${revokedHistorySession.accessToken}` },
  });
  const collaborationDataBeforeRevokedHistoryRead = await readFile(dataFile, "utf8");
  await assertRejectedRequest(`${baseUrl}${collaborationHistoryPath}`, {
    headers: { Authorization: `Bearer ${revokedHistorySession.accessToken}` },
  }, 401, "revoked_token");
  assert.equal(await readFile(dataFile, "utf8"), collaborationDataBeforeRevokedHistoryRead, "revoked history bearer must not write data");

  const ownerCollaborationHistory = await request(`${baseUrl}${collaborationHistoryPath}?limit=50`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  const memberCollaborationHistory = await request(`${baseUrl}${collaborationHistoryPath}?limit=50`, {
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
  });
  assert.deepEqual(memberCollaborationHistory, ownerCollaborationHistory, "owner and formal member must receive the same household collaboration history");
  assert.equal(ownerCollaborationHistory.householdId, loadedStateEnvelope.family.id, "history response should identify the requested household");
  assert(ownerCollaborationHistory.events.length >= 3, "history should include the seeded crave, grocery, and wish actions");
  assert.deepEqual(
    new Set(ownerCollaborationHistory.events.map((event) => event.requestType)),
    new Set(["crave", "grocery", "wish"]),
    "history should include all seeded collaboration action types",
  );
  assert(
    ownerCollaborationHistory.events.every((event, index, events) => (
      index === 0 || Date.parse(events[index - 1].createdAt) >= Date.parse(event.createdAt)
    )),
    "history should be newest first",
  );
  assertNoHouseholdCollaborationHistoryLeaks(ownerCollaborationHistory.events, "household collaboration history events");
  assert(
    ownerCollaborationHistory.events.every((event) => (
      typeof event.id === "string"
      && typeof event.requestType === "string"
      && typeof event.actionType === "string"
      && typeof event.createdAt === "string"
      && typeof event.participant?.displayName === "string"
      && typeof event.participant?.avatarUrl === "string"
      && event.payload && typeof event.payload === "object"
    )),
    "history should return only explicit display-safe event fields",
  );
  const limitedCollaborationHistory = await request(`${baseUrl}${collaborationHistoryPath}?limit=2`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert.equal(limitedCollaborationHistory.events.length, 2, "history endpoint must enforce its caller limit");
  assert.deepEqual(
    limitedCollaborationHistory.events,
    ownerCollaborationHistory.events.slice(0, 2),
    "limited history should preserve newest-first order",
  );

  const basicRecommendation = await request(`${baseUrl}/recommend`, {
    method: "POST",
    body: {
      candidates: [
        { id: "tomato-egg", name: "西红柿炒鸡蛋" },
        { id: "rice", name: "米饭" },
      ],
      ruleFallback: {
        recipeIds: ["tomato-egg", "rice"],
        reason: "本地规则推荐。",
      },
    },
  });
  assert(basicRecommendation.source === "rule", "public recommendation should use basic rule path");
  assert(basicRecommendation.recipeIds?.[0] === "tomato-egg", "basic recommendation should return fallback ids");
  try {
    await request(`${baseUrl}/recommend`, {
      method: "POST",
      body: {
        mode: "precise",
        candidates: [{ id: "tomato-egg", name: "西红柿炒鸡蛋" }],
        ruleFallback: { recipeIds: ["tomato-egg"], reason: "本地规则推荐。" },
      },
    });
    throw new Error("public precise recommendation should require auth");
  } catch (error) {
    assert(String(error.message).startsWith("401 "), "public precise recommendation should return 401");
  }
  try {
    await request(`${baseUrl}/explain`, {
      method: "POST",
      body: {
        recommendation: {
          recipes: [{ name: "西红柿炒鸡蛋", categories: ["家常菜"] }],
          reason: "本地规则推荐。",
        },
      },
    });
    throw new Error("public precise explanation should require auth");
  } catch (error) {
    assert(String(error.message).startsWith("401 "), "public precise explanation should return 401");
  }
  await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      state: {
        ...loadedState,
        recommendationAccess: { plan: "free", preciseTrialRemaining: 0, preciseUsed: 3 },
      },
    },
  });
  try {
    await request(`${baseUrl}/recommend`, {
      method: "POST",
      headers: { Authorization: `Bearer ${login.accessToken}` },
      body: {
        mode: "precise",
        candidates: [{ id: "tomato-egg", name: "西红柿炒鸡蛋" }],
        ruleFallback: { recipeIds: ["tomato-egg"], reason: "本地规则推荐。" },
      },
    });
    throw new Error("exhausted precise recommendation should be rejected");
  } catch (error) {
    assert(String(error.message).startsWith("402 "), "exhausted precise recommendation should return 402");
  }
  try {
    await request(`${baseUrl}/explain`, {
      method: "POST",
      headers: { Authorization: `Bearer ${login.accessToken}` },
      body: {
        recommendation: {
          recipes: [{ name: "西红柿炒鸡蛋", categories: ["家常菜"] }],
          reason: "本地规则推荐。",
        },
      },
    });
    throw new Error("exhausted precise explanation should be rejected");
  } catch (error) {
    assert(String(error.message).startsWith("402 "), "exhausted precise explanation should return 402");
  }

  const renamedHousehold = await request(`${baseUrl}/households/${loadedStateEnvelope.family.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { name: "改名后的测试家" },
  });
  assertHouseholdEnvelope(renamedHousehold, "owner household rename");
  assert.equal(renamedHousehold.family?.name, "改名后的测试家", "owner should rename the household");

  await assertRejectedRequest(`${baseUrl}/households/${loadedStateEnvelope.family.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: null,
  }, 400, "household_name_required");

  await assertRejectedRequest(`${baseUrl}/households/${loadedStateEnvelope.family.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { name: "成员不能改名" },
  }, 403, "forbidden");

  await assertRejectedRequest(`${baseUrl}/households/${loadedStateEnvelope.family.id}/members/${login.user.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  }, 409, "owner_cannot_be_removed");

  const removedMember = await request(`${baseUrl}/households/${loadedStateEnvelope.family.id}/members/${collaborationGuest.user.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assertHouseholdEnvelope(removedMember, "owner member removal");
  assert(
    !removedMember.family?.members?.some((member) => member.memberId === collaborationGuest.user.id),
    "owner should remove another household member",
  );

  await assertRejectedRequest(`${baseUrl}/households/${loadedStateEnvelope.family.id}/owner`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: null,
  }, 404, "member_not_found");

  const transferredHousehold = await request(`${baseUrl}/households/${loadedStateEnvelope.family.id}/owner`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { memberId: memberLogin.user.id },
  });
  assertHouseholdEnvelope(transferredHousehold, "household ownership transfer");
  assert.equal(transferredHousehold.family?.ownerId, memberLogin.user.id, "ownership should transfer to the member");

  const leftHousehold = await request(`${baseUrl}/households/${loadedStateEnvelope.family.id}/leave`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assertHouseholdEnvelope(leftHousehold, "former owner household leave");
  assert("state" in leftHousehold, "leaving should return the new active household state");
  assert.equal(leftHousehold.family?.id, secondHousehold.family.id, "former owner should switch to another active household");

  const refreshed = await request(`${baseUrl}/auth/session/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(refreshed.accessToken, "refresh should return accessToken");

  await request(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });

  const persistedData = JSON.parse(await readFile(dataFile, "utf8"));
  assert.equal(persistedData.users.length, explicitWechatOpenIds.size, "only explicit WeChat login may create users");
  assert.equal(persistedData.households.length, explicitHouseholdCreateCount, "only explicit household creation may create households");
  assert.equal(
    (persistedData.h5Tickets ?? []).filter((item) => !item.consumedAt && item.expiresAt > Date.now()).length,
    0,
    "smoke must not leave a live H5 ticket",
  );

  console.log("Humi API smoke test passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(smokeDirectory, { recursive: true, force: true });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function rawRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers ?? {},
    body: options.body,
  });
  const contentType = String(response.headers.get("content-type") || "").split(";")[0];
  const buffer = Buffer.from(await response.arrayBuffer());
  let data = {};
  if (contentType === "application/json" && buffer.length > 0) {
    data = JSON.parse(buffer.toString("utf8"));
  }
  return {
    status: response.status,
    contentType,
    contentLength: response.headers.get("content-length"),
    buffer,
    data,
  };
}

async function assertUnauthorizedCreate(url, body, label) {
  try {
    await request(url, { method: "POST", body });
    throw new Error(`${label} should require auth`);
  } catch (error) {
    assert(String(error.message).startsWith("401 "), `${label} should return 401`);
  }
}

async function assertRejectedRequest(url, options, expectedStatus, expectedCode) {
  const method = options.method || "GET";
  const response = await rawRequest(url, {
    ...options,
    method,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: method === "GET" || method === "HEAD"
      ? undefined
      : JSON.stringify(Object.hasOwn(options, "body") ? options.body : {}),
  });
  assert.equal(response.status, expectedStatus);
  assert.equal(response.data?.error, expectedCode);
}

async function readCollaborationEvents() {
  const data = JSON.parse(await readFile(dataFile, "utf8"));
  return data.collaborationEvents ?? [];
}

async function readCollaborationBusinessActions(requestType, requestId) {
  const data = JSON.parse(await readFile(dataFile, "utf8"));
  const collection = requestType === "crave"
    ? data.craveRequests
    : requestType === "grocery"
    ? data.groceryShareRequests
    : data.wishShareRequests;
  const request = (collection ?? []).find((item) => item.id === requestId);
  if (requestType === "crave") return request?.votes ?? [];
  if (requestType === "grocery") return request?.claims ?? [];
  return request?.wishes ?? [];
}

async function readCollaborationRequestCollection(requestType) {
  const data = JSON.parse(await readFile(dataFile, "utf8"));
  if (requestType === "crave") return data.craveRequests ?? [];
  if (requestType === "grocery") return data.groceryShareRequests ?? [];
  return data.wishShareRequests ?? [];
}

function assertNoCollaborationResponseLeaks(value, label) {
  const forbiddenKeys = new Set([
    "token",
    "ownerSecret",
    "householdId",
    "ownerId",
    "requestId",
    "claimedAt",
    "claimedByUserId",
    "mergedAt",
    "mergedFromGuestId",
    "participantKey",
    "memberId",
    "openid",
    "openId",
    "unionid",
    "unionId",
    "phone",
    "phoneMasked",
    "phoneVerifiedAt",
    "family",
    "households",
    "state",
  ]);
  const leaked = [];
  const visit = (current, path = "$") => {
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      const childPath = `${path}.${key}`;
      if (forbiddenKeys.has(key)) leaked.push(childPath);
      visit(child, childPath);
    }
  };
  visit(value);
  assert.deepEqual(leaked, [], `${label} must use the strict collaboration response projection`);
}

function assertNoHouseholdCollaborationHistoryLeaks(value, label) {
  const forbiddenKeys = new Set([
    "token",
    "ownerSecret",
    "householdId",
    "ownerId",
    "requestId",
    "participantType",
    "participantId",
    "memberId",
    "userId",
    "claimedByUserId",
    "mergedFromGuestId",
    "mergedAt",
    "updatedAt",
    "participantKey",
    "guestParticipantId",
    "openid",
    "openId",
    "unionid",
    "unionId",
    "phone",
    "phoneMasked",
    "phoneVerifiedAt",
    "family",
    "households",
    "state",
  ]);
  const leaked = [];
  const visit = (current, path = "$") => {
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      const childPath = `${path}.${key}`;
      if (forbiddenKeys.has(key)) leaked.push(childPath);
      visit(child, childPath);
    }
  };
  visit(value);
  assert.deepEqual(leaked, [], `${label} must not expose internal collaboration identity or request data`);
}

function createExpiredBearer(userId) {
  return createSessionToken({ userId, secret: smokeSessionSecret, ttlSeconds: -1 }).token;
}

function assertHouseholdEnvelope(response, label) {
  assert("family" in response, `${label} should return family`);
  assert(Array.isArray(response.households), `${label} should return households`);
}

import { createHumiApiServer } from "../api/server.js";

const server = createHumiApiServer();
const port = 18787;

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await request(`${baseUrl}/health`);
  assert(health.ok, "health should be ok");

  const login = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: "smoke" },
  });
  assert(login.accessToken, "login should return accessToken");
  assert(login.user?.provider === "wechat", "login should return wechat user");

  const me = await request(`${baseUrl}/me`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(me.user?.id === login.user.id, "me should return current user");
  assert(me.family?.provider === "wechat", "me should return wechat family");
  assert(me.family?.ownerId === login.user.id, "new family should expose owner id");
  assert(me.family?.currentMemberId === login.user.id, "family should expose current member id");
  assert(me.family?.role === "owner", "new family current user should be owner");

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

  const crave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "测试家", initiatorName: "主厨" },
  });
  assert(crave.request?.token, "crave request should return token");
  assert(crave.request?.householdId === loadedStateEnvelope.family?.id, "crave request should attach owner household");
  await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: {
      participantKey: "participant-smoke",
      memberName: "家人",
      feelingTag: "辣一点",
      temporary: true,
    },
  });
  const memberLogin = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: "family-member-smoke" },
  });
  const joinedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { participantKey: "participant-smoke" },
  });
  assert(joinedCrave.request?.votes?.[0]?.temporary === false, "joined crave vote should become formal");
  assert(joinedCrave.request?.votes?.[0]?.memberId === memberLogin.user.id, "joined crave vote should attach user");
  assert(
    joinedCrave.family?.members?.some((member) => member.memberId === login.user.id)
      && joinedCrave.family?.members?.some((member) => member.memberId === memberLogin.user.id),
    "joined family should include owner and member",
  );
  assert(joinedCrave.family?.role === "member", "joined user should see member role");
  assert(joinedCrave.family?.ownerId === login.user.id, "joined family should keep original owner");
  assert(
    joinedCrave.family?.members?.some((member) => (
      member.memberId === memberLogin.user.id && member.role === "member" && member.status === "formal"
    )),
    "joined user should become formal household member",
  );

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

  const refreshed = await request(`${baseUrl}/auth/session/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(refreshed.accessToken, "refresh should return accessToken");

  await request(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });

  console.log("Humi API smoke test passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

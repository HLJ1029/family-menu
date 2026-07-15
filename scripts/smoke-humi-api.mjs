process.env.NODE_ENV ||= "test";
process.env.DEEPSEEK_API_KEY ||= "smoke-deepseek-key";
process.env.HUMI_AI_PRECISE_TRIAL_LIMIT ||= "1";
process.env.HUMI_COLLABORATION_RATE_LIMIT ||= "40";

const { unlink } = await import("node:fs/promises");
await unlink(process.env.HUMI_API_DATA_FILE || ".humi-api-data.json").catch(() => {});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.deepseek.com")) {
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            recipeIds: ["tomato-egg"],
            reason: "按家里口味先安排西红柿炒鸡蛋。",
            pantry: "已有常见食材。",
            preference: "符合家常省时。",
            grocery: "不用额外买太多。",
          }),
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(url, options);
};

const { createHumiApiServer } = await import("../api/server.js");

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

  for (const endpoint of ["crave-requests", "grocery-share-requests", "menu-share-requests", "wish-share-requests"]) {
    const anonymousCreate = await requestRaw(`${baseUrl}/${endpoint}`, {
      method: "POST",
      body: {},
    });
    assert(anonymousCreate.status === 401, `${endpoint} creation should require a signed-in chef`);
  }

  const phone = await request(`${baseUrl}/auth/wechat/phone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { code: "phone-smoke" },
  });
  assert(phone.user?.phoneVerified === true, "phone should be verified");
  assert(phone.user?.phoneMasked === "138****1234", "phone should be masked");

  const anonymousRecommend = await requestRaw(`${baseUrl}/recommend`, {
    method: "POST",
    body: { candidates: [] },
  });
  assert(anonymousRecommend.status === 401, "anonymous precise recommendation should be rejected");

  const anonymousExplain = await requestRaw(`${baseUrl}/explain`, {
    method: "POST",
    body: { recommendation: { recipes: [{ name: "西红柿炒鸡蛋" }], reason: "基础推荐。" } },
  });
  assert(anonymousExplain.status === 401, "anonymous precise explanation should be rejected");

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

  const savedState = await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      state: {
        todayMenu: [{ recipeId: "tomato-egg", quantity: 2 }],
        weekPlan: { 周一: ["tomato-egg"], 周二: [], 周三: [], 周四: [], 周五: [], 周六: [], 周日: [] },
        checkedItems: { "ingredient:tomato": true },
        pantryItems: [{ key: "pantry:tomato", name: "西红柿", amount: "3 个", source: "清单完成" }],
        customItems: [{ key: "custom:milk", name: "牛奶", amount: "1 盒", source: "手动添加" }],
        familyProfile: { familySize: 3, goals: ["省时"] },
        craveSignals: [{
          id: "crave:smoke",
          requestToken: "request-token-smoke",
          householdId: "household-signal-smoke",
          ownerId: "owner-signal-smoke",
          householdName: "小家",
          initiatorName: "主厨",
          feelingTag: "想喝汤",
          voteCount: 1,
          votes: [{ id: "vote-smoke", participantKey: "participant-smoke", memberName: "家人", feelingTag: "想喝汤", temporary: false, mergedAt: "2026-07-08T01:00:00.000Z" }],
          recipeIds: ["tomato-egg"],
          updatedAt: "2026-07-08T01:00:00.000Z",
        }],
        wishPool: [{
          id: "wish:tomato-egg",
          participantKey: "participant-wish",
          recipeId: "tomato-egg",
          name: "西红柿炒鸡蛋",
          source: "阿宁想吃",
          temporary: false,
          mergedAt: "2026-07-08T01:00:00.000Z",
        }],
        activeCraveRequest: {
          id: "active-crave-smoke",
          token: "active-crave-token",
          ownerSecret: "owner-secret-smoke",
          householdId: "household-smoke",
          ownerId: "owner-smoke",
          householdName: "小家",
          initiatorName: "主厨",
          mealType: "dinner",
          status: "open",
          starterFeeling: "想喝汤",
          targetParticipantNames: ["阿宁"],
          audience: [{ id: "member-aning", name: "阿宁", meta: "家人" }],
          votes: [{ id: "vote-active", participantKey: "participant-active", memberName: "阿宁", feelingTag: "想喝汤", dishWish: "番茄汤", temporary: true }],
          deadlineAt: "2099-01-01T00:30:00.000Z",
        },
        activeGroceryShareRequest: {
          id: "grocery-share-smoke",
          token: "share-token-smoke",
          ownerSecret: "grocery-owner-secret-smoke",
          householdId: "household-grocery-state",
          ownerId: "owner-grocery-state",
          title: "测试清单",
          items: [{ id: "tomato", name: "西红柿", amount: "2 个", category: "蔬菜" }],
          claims: [{ id: "claim-smoke", participantKey: "participant-grocery", memberName: "家人", status: "claimed", note: "下班买", temporary: false, mergedAt: "2026-07-08T01:00:00.000Z" }],
        },
        activeWishShareRequest: {
          id: "wish-share-smoke",
          token: "wish-token-smoke",
          ownerSecret: "wish-owner-secret-smoke",
          householdId: "household-wish-state",
          ownerId: "owner-wish-state",
          householdName: "小家",
          initiatorName: "主厨",
          title: "家里最近想吃什么",
          status: "open",
          wishes: [{ id: "wish-entry-smoke", participantKey: "participant-wish", memberName: "阿宁", dishName: "糖醋排骨", note: "周末做", temporary: false, mergedAt: "2026-07-08T01:00:00.000Z" }],
        },
        pendingJoinContext: {
          type: "wish",
          token: "join-token-smoke",
          participantKey: "participant-smoke",
          householdName: "小家",
          memberName: "阿宁",
          dishWish: "糖醋排骨",
          createdAt: "2026-07-08T00:00:00.000Z",
        },
        householdMembers: [{
          id: "member:participant-smoke",
          participantKey: "participant-smoke",
          name: "阿宁",
          role: "家人",
          status: "正式成员",
          source: "感觉征集",
          householdName: "小家",
          lastSignal: "点了想喝汤",
          joinedAt: "2026-07-08T00:00:00.000Z",
        }],
      },
    },
  });
  assert(savedState.state?.todayMenu?.[0]?.quantity === 2, "state should save menu");
  assert(savedState.state?.pantryItems?.[0]?.name === "西红柿", "state should save pantry");

  const loadedState = await request(`${baseUrl}/state`, {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  assert(loadedState.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "state should load menu");
  assert(loadedState.state?.familyProfile?.familySize === 3, "state should load profile");
  assert(loadedState.state?.craveSignals?.[0]?.feelingTag === "想喝汤", "state should load crave signals");
  assert(loadedState.state?.craveSignals?.[0]?.requestToken === "request-token-smoke", "state should preserve crave signal request token for later member merge");
  assert(loadedState.state?.craveSignals?.[0]?.householdId === "household-signal-smoke", "state should preserve crave signal household id");
  assert(loadedState.state?.craveSignals?.[0]?.votes?.[0]?.temporary === false, "state should preserve merged crave vote status");
  assert(loadedState.state?.craveSignals?.[0]?.votes?.[0]?.mergedAt === "2026-07-08T01:00:00.000Z", "state should preserve merged crave vote timestamp");
  assert(loadedState.state?.activeCraveRequest?.ownerSecret === "owner-secret-smoke", "state should load active crave owner secret");
  assert(loadedState.state?.activeCraveRequest?.householdId === "household-smoke", "state should preserve active crave household id");
  assert(loadedState.state?.activeCraveRequest?.ownerId === "owner-smoke", "state should preserve active crave owner id");
  assert(
    JSON.stringify(loadedState.state?.activeCraveRequest?.targetParticipantNames) === JSON.stringify(["阿宁"]),
    "state should preserve active crave target participants",
  );
  assert(loadedState.state?.activeCraveRequest?.audience?.[0]?.name === "阿宁", "state should preserve active crave audience");
  assert(loadedState.state?.activeCraveRequest?.votes?.[0]?.participantKey === "participant-active", "state should load active crave votes");
  assert(loadedState.state?.activeCraveRequest?.deadlineAt === "2099-01-01T00:30:00.000Z", "state should preserve active crave deadline");
  assert(loadedState.state?.wishPool?.[0]?.recipeId === "tomato-egg", "state should load wish pool");
  assert(loadedState.state?.wishPool?.[0]?.participantKey === "participant-wish", "state should preserve wish pool participant key");
  assert(loadedState.state?.wishPool?.[0]?.temporary === false, "state should preserve merged wish pool status");
  assert(loadedState.state?.activeGroceryShareRequest?.ownerSecret === "grocery-owner-secret-smoke", "state should preserve grocery share owner secret");
  assert(loadedState.state?.activeGroceryShareRequest?.householdId === "household-grocery-state", "state should preserve grocery share household id");
  assert(loadedState.state?.activeGroceryShareRequest?.claims?.[0]?.status === "claimed", "state should load grocery share claims");
  assert(loadedState.state?.activeGroceryShareRequest?.claims?.[0]?.participantKey === "participant-grocery", "state should preserve grocery claim participant key");
  assert(loadedState.state?.activeGroceryShareRequest?.claims?.[0]?.temporary === false, "state should preserve merged grocery claim status");
  assert(loadedState.state?.activeWishShareRequest?.ownerSecret === "wish-owner-secret-smoke", "state should load active wish owner secret");
  assert(loadedState.state?.activeWishShareRequest?.householdId === "household-wish-state", "state should preserve wish share household id");
  assert(loadedState.state?.activeWishShareRequest?.wishes?.[0]?.dishName === "糖醋排骨", "state should load active wish entries");
  assert(loadedState.state?.activeWishShareRequest?.wishes?.[0]?.temporary === false, "state should preserve merged wish entry status");
  assert(loadedState.state?.pendingJoinContext?.type === "wish", "state should load pending wish join context type");
  assert(loadedState.state?.pendingJoinContext?.memberName === "阿宁", "state should load pending join context");
  assert(loadedState.state?.householdMembers?.[0]?.name === "阿宁", "state should load household members");

  const ownerHouseholdId = loadedState.family?.id;
  assert(ownerHouseholdId, "wechat owner should have an active household");
  assert(loadedState.family?.role === "owner", "first household member should be the owner");

  const householdInvite = await request(`${baseUrl}/household-invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: ownerHouseholdId, inviterName: "主厨" },
  });
  assert(householdInvite.invite?.token, "owner should create a household invite token");
  const publicInvite = await request(`${baseUrl}/household-invites/${householdInvite.invite.token}`);
  assert(publicInvite.invite?.householdId === ownerHouseholdId, "public invite should target the owner's household");

  const memberLogin = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: "member-smoke" },
  });
  const joinedHousehold = await request(`${baseUrl}/household-invites/${householdInvite.invite.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { memberName: "阿宁" },
  });
  assert(joinedHousehold.family?.id === ownerHouseholdId, "invite join should activate the shared household");
  assert(joinedHousehold.family?.role === "member", "invitee should join as a household member");
  assert(joinedHousehold.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "invitee should receive the household's saved menu state");
  assert(joinedHousehold.households?.some((household) => household.id === ownerHouseholdId), "invitee should list the joined household");

  const memberInviteAttempt = await requestRaw(`${baseUrl}/household-invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { householdId: ownerHouseholdId },
  });
  assert(memberInviteAttempt.status === 403, "household members should not create new household invites");

  const secondHousehold = await request(`${baseUrl}/households`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "爸妈家", memberName: "主厨" },
  });
  assert(secondHousehold.family?.id !== ownerHouseholdId, "owner should create a separate second household");
  assert(secondHousehold.households?.length === 2, "owner should see both households after creating another one");
  await request(`${baseUrl}/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { state: { todayMenu: [{ recipeId: "potato-shreds", quantity: 1 }] } },
  });
  const switchedBack = await request(`${baseUrl}/households/active`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdId: ownerHouseholdId },
  });
  assert(switchedBack.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "switching households should restore the original household state without cross-family bleed");

  const authenticatedCrave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: { householdName: "我的家", initiatorName: "主厨", starterFeeling: "随便都行" },
  });
  await request(`${baseUrl}/crave-requests/${authenticatedCrave.request.token}/votes`, {
    method: "POST",
    body: { participantKey: "formal-member-smoke", memberName: "阿宁", feelingTag: "想喝汤" },
  });
  const joinedCrave = await request(`${baseUrl}/crave-requests/${authenticatedCrave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { participantKey: "formal-member-smoke", memberName: "阿宁" },
  });
  assert(joinedCrave.request?.votes?.[0]?.temporary === false, "login join should merge a temporary crave vote into a formal household member");
  assert(joinedCrave.family?.id === ownerHouseholdId, "crave join should return the shared household context");

  const memberCraveAttempt = await requestRaw(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { householdName: "我的家", initiatorName: "阿宁" },
  });
  assert(memberCraveAttempt.status === 403, "formal household members should not start owner-only collaboration requests");

  const recommendationPayload = {
    candidates: [{
      id: "tomato-egg",
      name: "西红柿炒鸡蛋",
      categories: ["家常菜"],
      tags: ["快手"],
      timeMinutes: 15,
      difficulty: "easy",
      ingredients: ["西红柿", "鸡蛋"],
      seasonings: ["盐"],
    }],
    familyProfile: { familySize: 2, goals: ["省时"] },
    compactFamilyPrompt: "2人，家常省时",
    pantryItems: [],
    familyPreferences: [],
    recentRecipeIds: [],
    recentFeedback: [],
    currentMissingItems: [],
    ruleFallback: {
      recipeIds: ["tomato-egg"],
      reason: "基础推荐西红柿炒鸡蛋。",
    },
  };
  const preciseFirst = await request(`${baseUrl}/recommend`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: recommendationPayload,
  });
  assert(preciseFirst.source === "deepseek", "first precise recommendation should call model");
  assert(preciseFirst.entitlement?.trialRemaining === 0, "first precise recommendation should consume trial");

  const preciseCached = await request(`${baseUrl}/recommend`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: recommendationPayload,
  });
  assert(preciseCached.source === "deepseek_cached", "same precise recommendation should use cache");
  assert(preciseCached.entitlement?.cached === true, "cached precise recommendation should report cache hit");

  const preciseAfterTrial = await requestRaw(`${baseUrl}/recommend`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      ...recommendationPayload,
      recentFeedback: [{ reason: "太麻烦", reasonId: "too_much_work", recipeIds: ["tomato-egg"] }],
    },
  });
  assert(preciseAfterTrial.status === 402, "uncached precise recommendation should stop after trial is used");

  const explainAfterTrial = await requestRaw(`${baseUrl}/explain`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      recommendation: {
        recipes: [{ name: "西红柿炒鸡蛋", categories: ["家常菜"], timeMinutes: 15 }],
        reason: "基础推荐西红柿炒鸡蛋。",
      },
    },
  });
  assert(explainAfterTrial.status === 402, "precise explanation should stop after trial is used");

  const crave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdId: "household-api-smoke",
      ownerId: "owner-api-smoke",
      householdName: "测试家",
      initiatorName: "主厨",
      mealType: "dinner",
      starterFeeling: "想喝汤",
      targetParticipantNames: ["阿宁", "家人"],
    },
  });
  assert(crave.request?.token, "crave request should return token");
  assert(crave.request?.householdId === ownerHouseholdId, "authenticated crave request should use the active household id");
  assert(crave.request?.ownerId === login.user.id, "authenticated crave request should bind the signed-in chef");
  assert(
    JSON.stringify(crave.request?.targetParticipantNames) === JSON.stringify(["阿宁", "家人"]),
    "crave request should preserve selected audience names",
  );
  assert(crave.request?.starterFeeling === "想喝汤", "crave request should preserve starter feeling");
  assert(Number.isFinite(Date.parse(crave.request?.deadlineAt)), "crave request should return a valid deadline");
  assert(Date.parse(crave.request.deadlineAt) > Date.parse(crave.request.createdAt), "crave request deadline should be after creation time");
  await request(`${baseUrl}/crave-requests/${crave.request.token}/votes`, {
    method: "POST",
    body: { participantKey: "smoke-crave", memberName: "家人", feelingTag: "想喝汤", dishWish: "西红柿炒鸡蛋" },
  });
  const loadedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}`);
  assert(loadedCrave.request?.householdId === ownerHouseholdId, "loaded crave request should preserve active household id");
  assert(loadedCrave.request?.ownerId === login.user.id, "loaded crave request should preserve signed-in owner id");
  assert(loadedCrave.request?.votes?.[0]?.feelingTag === "想喝汤", "crave vote should be saved");
  assert(loadedCrave.request?.votes?.[0]?.dishWish === "西红柿炒鸡蛋", "crave vote dish wish should be saved");
  assert(loadedCrave.request?.votes?.[0]?.participantKey === "smoke-crave", "crave vote should expose participant key for later member merge");

  const expiredCrave = await request(`${baseUrl}/crave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdName: "测试家",
      initiatorName: "主厨",
      mealType: "dinner",
      starterFeeling: "不想动",
      deadlineAt: new Date(Date.now() - 60 * 1000).toISOString(),
    },
  });
  assert(expiredCrave.request?.status === "open", "expired crave starts open until the API reads it");
  const loadedExpiredCrave = await request(`${baseUrl}/crave-requests/${expiredCrave.request.token}`);
  assert(loadedExpiredCrave.request?.status === "closed", "expired crave should close itself when read");
  const expiredVoteAttempt = await request(`${baseUrl}/crave-requests/${expiredCrave.request.token}/votes`, {
    method: "POST",
    body: { participantKey: "late-crave", memberName: "家人", feelingTag: "想喝汤" },
  });
  assert(expiredVoteAttempt.request?.status === "closed", "expired crave should stay closed after late vote");
  assert((expiredVoteAttempt.request?.votes?.length ?? 0) === 0, "expired crave should not accept late votes");

  const groceryShare = await request(`${baseUrl}/grocery-share-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdId: "household-grocery-smoke",
      ownerId: "owner-grocery-smoke",
      householdName: "测试家",
      initiatorName: "主厨",
      title: "测试清单",
      items: [{ id: "tomato", name: "西红柿", amount: "2 个", category: "蔬菜" }],
    },
  });
  assert(groceryShare.request?.token, "grocery share should return token");
  assert(groceryShare.request?.householdId === ownerHouseholdId, "grocery share should use the active household id");
  assert(groceryShare.request?.ownerId === login.user.id, "grocery share should bind the signed-in chef");
  await request(`${baseUrl}/grocery-share-requests/${groceryShare.request.token}/claims`, {
    method: "POST",
    body: { participantKey: "smoke-grocery", memberName: "家人", status: "claimed", itemIds: ["tomato"] },
  });
  const loadedGroceryShare = await request(`${baseUrl}/grocery-share-requests/${groceryShare.request.token}`);
  assert(loadedGroceryShare.request?.claims?.[0]?.status === "claimed", "grocery claim should be saved");
  assert(loadedGroceryShare.request?.claims?.[0]?.itemIds?.[0] === "tomato", "grocery claim item ids should be saved");
  assert(loadedGroceryShare.request?.claims?.[0]?.participantKey === "smoke-grocery", "grocery claim should expose participant key for later member merge");
  await request(`${baseUrl}/grocery-share-requests/${groceryShare.request.token}/items/tomato/check`, {
    method: "POST",
    body: { checked: true },
  });
  const checkedGroceryShare = await request(`${baseUrl}/grocery-share-requests/${groceryShare.request.token}`);
  assert(checkedGroceryShare.request?.items?.[0]?.checked === true, "grocery share item check should be saved");

  const menuShare = await request(`${baseUrl}/menu-share-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdId: "household-menu-smoke",
      ownerId: "owner-menu-smoke",
      householdName: "测试家",
      initiatorName: "主厨",
      title: "西红柿炒鸡蛋 + 青椒土豆丝",
      groceryCount: 4,
      dishes: [
        { id: "tomato-egg", recipeId: "tomato-egg", name: "西红柿炒鸡蛋", quantity: 1, category: "家常菜", timeMinutes: 15 },
        { id: "potato-shreds", recipeId: "potato-shreds", name: "青椒土豆丝", quantity: 1, category: "素菜", timeMinutes: 20 },
      ],
    },
  });
  assert(menuShare.request?.token, "menu share should return token");
  assert(menuShare.request?.householdId === ownerHouseholdId, "menu share should use the active household id");
  assert(menuShare.request?.ownerId === login.user.id, "menu share should bind the signed-in chef");
  const loadedMenuShare = await request(`${baseUrl}/menu-share-requests/${menuShare.request.token}`);
  assert(loadedMenuShare.request?.dishes?.[0]?.name === "西红柿炒鸡蛋", "menu share should expose shared dish names");
  assert(loadedMenuShare.request?.groceryCount === 4, "menu share should expose grocery count");

  const wishShare = await request(`${baseUrl}/wish-share-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.accessToken}` },
    body: {
      householdId: "household-wish-smoke",
      ownerId: "owner-wish-smoke",
      householdName: "测试家",
      initiatorName: "主厨",
      title: "测试想吃池",
    },
  });
  assert(wishShare.request?.token, "wish share should return token");
  assert(wishShare.ownerSecret, "wish share should return owner secret");
  assert(wishShare.request?.householdId === ownerHouseholdId, "wish share should use the active household id");
  assert(wishShare.request?.ownerId === login.user.id, "wish share should bind the signed-in chef");
  await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}/wishes`, {
    method: "POST",
    body: { participantKey: "smoke-wish", memberName: "家人", dishName: "糖醋排骨", note: "周末做" },
  });
  const loadedWishShare = await request(`${baseUrl}/wish-share-requests/${wishShare.request.token}`);
  assert(loadedWishShare.request?.wishes?.[0]?.memberName === "家人", "wish share entry should save member name");
  assert(loadedWishShare.request?.wishes?.[0]?.dishName === "糖醋排骨", "wish share entry should save dish name");
  assert(loadedWishShare.request?.wishes?.[0]?.note === "周末做", "wish share entry should save note");

  const oversizedResponse = await fetch(`${baseUrl}/wish-share-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.accessToken}` },
    body: JSON.stringify({ title: "大".repeat(70_000) }),
  });
  assert(oversizedResponse.status === 413, "oversized collaboration request should be rejected");

  let collaborationRateLimited = false;
  for (let index = 0; index < 45; index += 1) {
    const response = await requestRaw(`${baseUrl}/menu-share-requests`, {
      method: "POST",
      body: { title: `限流测试 ${index}`, dishes: [] },
    });
    if (response.status === 429) {
      collaborationRateLimited = true;
      break;
    }
  }
  assert(collaborationRateLimited, "anonymous collaboration writes should be rate limited");

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
  const response = await requestRaw(url, options);
  const data = response.data;
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function requestRaw(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

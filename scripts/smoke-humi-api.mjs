import { createHumiApiServer } from "../api/server.js";

const server = createHumiApiServer();
const port = 18787;

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

  const login = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `smoke-${runId}` },
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
  assert(!loadedState?.craveSignals?.[0]?.ownerSecret, "shared state must not expose crave owner secret");
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
    body: { code: `family-member-smoke-${runId}` },
  });
  const joinedCrave = await request(`${baseUrl}/crave-requests/${crave.request.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${memberLogin.accessToken}` },
    body: { participantKey: "participant-smoke" },
  });
  assert(joinedCrave.request?.votes?.[0]?.temporary === false, "joined crave vote should become formal");
  assert(!joinedCrave.request?.votes?.[0]?.memberId, "public crave response must not expose formal member ids");
  assert(
    joinedCrave.family?.members?.some((member) => member.memberId === login.user.id)
      && joinedCrave.family?.members?.some((member) => member.memberId === memberLogin.user.id),
    "joined family should include owner and member",
  );
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
  const invitedLogin = await request(`${baseUrl}/auth/wechat/login`, {
    method: "POST",
    body: { code: `invite-member-smoke-${runId}` },
  });
  const joinedInvite = await request(`${baseUrl}/household-invites/${householdInvite.invite.token}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${invitedLogin.accessToken}` },
    body: { memberName: "被邀请的家人" },
  });
  assert(joinedInvite.family?.role === "member", "invite joiner should see member role");
  assert(
    joinedInvite.family?.members?.some((member) => member.memberId === invitedLogin.user.id && member.status === "formal"),
    "invite joiner should become formal household member",
  );
  assert(joinedInvite.households?.some((household) => household.id === loadedStateEnvelope.family.id), "invite joiner should receive households");
  assert(joinedInvite.state?.todayMenu?.[0]?.recipeId === "tomato-egg", "invite joiner should immediately receive shared household state");
  assert(joinedInvite.state?.wantToEatItems?.[0]?.title === "麻婆豆腐", "invite joiner should immediately receive shared want-to-eat pool");
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

async function assertUnauthorizedCreate(url, body, label) {
  try {
    await request(url, { method: "POST", body });
    throw new Error(`${label} should require auth`);
  } catch (error) {
    assert(String(error.message).startsWith("401 "), `${label} should return 401`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

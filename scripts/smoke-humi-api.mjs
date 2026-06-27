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

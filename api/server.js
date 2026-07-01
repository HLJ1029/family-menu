import http from "node:http";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionToken, verifySessionToken } from "./session.js";
import { HumiStore } from "./store.js";
import { exchangeWechatCode, exchangeWechatPhoneNumber } from "./wechat.js";
import { generateMealRecommendation, generateRecommendationExplanation } from "./recommend.js";

const config = {
  port: Number(process.env.HUMI_API_PORT || 8787),
  dataFile: process.env.HUMI_API_DATA_FILE || resolve(".humi-api-data.json"),
  sessionSecret: process.env.HUMI_SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "humi-dev-secret"),
  wechatAppId: process.env.WECHAT_APP_ID || "",
  wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
  wechatMock: process.env.HUMI_WECHAT_MOCK === "1",
  allowedOrigins: (process.env.HUMI_ALLOWED_ORIGINS || "https://www.humi-home.com,http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  // 方案 A：游客也放行 AI 推荐，但按 IP 限流，避免 DeepSeek 额度被公开接口刷
  aiRateLimit: Number(process.env.HUMI_AI_RATE_LIMIT || 30),
  aiRateWindowMs: Number(process.env.HUMI_AI_RATE_WINDOW_MS || 60000),
};

if (!config.sessionSecret) {
  throw new Error("HUMI_SESSION_SECRET is required in production.");
}

const store = new HumiStore(config.dataFile);

export function createHumiApiServer() {
  return http.createServer(async (request, response) => {
    try {
      applyCors(request, response);
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/health") {
        if (request.method === "HEAD") {
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end();
          return;
        }
        sendJson(response, 200, { ok: true, service: "humi-api" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/wechat/login") {
        await handleWechatLogin(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/wechat/phone") {
        await handleWechatPhone(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/session/refresh") {
        await handleSessionRefresh(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        await handleLogout(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/me") {
        await handleMe(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/state") {
        await handleGetState(request, response);
        return;
      }

      if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/state") {
        await handleSaveState(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/profile") {
        await handleProfile(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/recommend") {
        await handleRecommend(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/explain") {
        await handleExplain(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/crave-requests") {
        await handleCreateCraveRequest(request, response);
        return;
      }

      const craveRequestMatch = url.pathname.match(/^\/crave-requests\/([^/]+)$/);
      if (request.method === "GET" && craveRequestMatch) {
        await handleGetCraveRequest(response, craveRequestMatch[1]);
        return;
      }

      const craveVoteMatch = url.pathname.match(/^\/crave-requests\/([^/]+)\/votes$/);
      if (request.method === "POST" && craveVoteMatch) {
        await handleCraveVote(request, response, craveVoteMatch[1]);
        return;
      }

      const craveJoinMatch = url.pathname.match(/^\/crave-requests\/([^/]+)\/join$/);
      if (request.method === "POST" && craveJoinMatch) {
        await handleJoinCraveRequest(request, response, craveJoinMatch[1]);
        return;
      }

      const craveCloseMatch = url.pathname.match(/^\/crave-requests\/([^/]+)\/close$/);
      if (request.method === "POST" && craveCloseMatch) {
        await handleCloseCraveRequest(request, response, craveCloseMatch[1]);
        return;
      }

      sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error(error);
      }
      const status = error.status || 500;
      sendJson(response, status, {
        error: error.code || "internal_error",
        message: status >= 500 ? "Humi API 暂时不可用。" : error.message,
      });
    }
  });
}

async function handleWechatLogin(request, response) {
  const body = await readJson(request);
  const wechatSession = await exchangeWechatCode({
    code: body.code,
    appId: config.wechatAppId,
    appSecret: config.wechatAppSecret,
    mock: config.wechatMock,
  });
  const user = await store.findOrCreateWechatUser({
    openid: wechatSession.openid,
    unionid: wechatSession.unionid,
  });
  sendAuthSession(response, user);
}

async function handleWechatPhone(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const phoneInfo = await exchangeWechatPhoneNumber({
    code: body.code || body.phoneCode,
    appId: config.wechatAppId,
    appSecret: config.wechatAppSecret,
    mock: config.wechatMock,
  });
  const countryCode = String(phoneInfo.countryCode || "86").replace(/\D/g, "") || "86";
  const purePhoneNumber = String(phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || "").replace(/\D/g, "");
  const updatedUser = await store.bindPhoneNumber(user.id, {
    ...phoneInfo,
    countryCode,
    purePhoneNumber,
    phoneHash: createPhoneHash(countryCode, purePhoneNumber),
  });
  sendAuthSession(response, updatedUser);
}

async function handleSessionRefresh(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  sendAuthSession(response, user);
}

async function handleLogout(request, response) {
  const token = getBearerToken(request);
  if (token) await store.revokeToken(token);
  sendJson(response, 200, { ok: true });
}

async function handleMe(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const profile = await store.getProfile(user.id);
  sendJson(response, 200, {
    user: toPublicUser(user),
    profileCompleted: getProfileCompletedCount(profile),
    family: toHumiFamily(user),
  });
}

async function handleProfile(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const profile = await store.saveProfile(user.id, sanitizeProfile(body.profile ?? body));
  sendJson(response, 200, {
    profile,
    profileCompleted: getProfileCompletedCount(profile),
  });
}

async function handleGetState(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const state = await store.getState(user.id);
  sendJson(response, 200, {
    state,
    family: toHumiFamily(user),
  });
}

async function handleSaveState(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const state = await store.saveState(user.id, sanitizeAppState(body.state ?? body));
  sendJson(response, 200, {
    state,
    family: toHumiFamily(user),
  });
}

async function handleRecommend(request, response) {
  enforceAiAccess(request);
  if (!config.deepseekApiKey) throw httpError(503, "deepseek_not_configured", "DEEPSEEK_API_KEY 未配置。");
  const body = await readJson(request);
  const result = await generateMealRecommendation(body, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel,
    baseUrl: config.deepseekBaseUrl,
  });
  sendJson(response, 200, result);
}

async function handleExplain(request, response) {
  enforceAiAccess(request);
  if (!config.deepseekApiKey) throw httpError(503, "deepseek_not_configured", "DEEPSEEK_API_KEY 未配置。");
  const body = await readJson(request);
  const result = await generateRecommendationExplanation(body, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel,
    baseUrl: config.deepseekBaseUrl,
  });
  sendJson(response, 200, result);
}

async function handleCreateCraveRequest(request, response) {
  const body = await readJson(request);
  const craveRequest = await store.createCraveRequest(body);
  sendJson(response, 201, { request: toPublicCraveRequest(craveRequest), ownerSecret: craveRequest.ownerSecret });
}

async function handleGetCraveRequest(response, token) {
  const craveRequest = await store.getCraveRequest(token);
  if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
  sendJson(response, 200, { request: toPublicCraveRequest(craveRequest) });
}

async function handleCraveVote(request, response, token) {
  const body = await readJson(request);
  const craveRequest = await store.addCraveVote(token, body);
  if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
  sendJson(response, 200, { request: toPublicCraveRequest(craveRequest) });
}

async function handleJoinCraveRequest(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const craveRequest = await store.claimCraveVote(token, user.id, {
      participantKey: body.participantKey,
      memberName: body.memberName || user.displayName,
    });
    if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
    sendJson(response, 200, { request: toPublicCraveRequest(craveRequest), family: toHumiFamily(user) });
  } catch (error) {
    if (error.code === "missing_participant_key") {
      throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能加入这次征集。");
    }
    if (error.code === "vote_not_found") {
      throw httpError(404, "vote_not_found", "没有找到你刚才的投票，可以直接回 Humi 查看。");
    }
    throw error;
  }
}

async function handleCloseCraveRequest(request, response, token) {
  const body = await readJson(request);
  try {
    const craveRequest = await store.closeCraveRequest(token, body.ownerSecret);
    if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
    sendJson(response, 200, { request: toPublicCraveRequest(craveRequest) });
  } catch (error) {
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有发起者能结束这次征集。");
    }
    throw error;
  }
}

// 方案 A：不强制登录（游客也能用 AI 推荐），仅按客户端 IP 限流保护 DeepSeek 额度。
const aiRateBuckets = new Map();

function enforceAiAccess(request) {
  const ip = getClientIp(request);
  const now = Date.now();
  const bucket = aiRateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    aiRateBuckets.set(ip, { count: 1, resetAt: now + config.aiRateWindowMs });
    return;
  }
  if (bucket.count >= config.aiRateLimit) {
    throw httpError(429, "rate_limited", "请求过于频繁，请稍后再试。");
  }
  bucket.count += 1;
}

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "unknown";
}

function toPublicCraveRequest(request) {
  return {
    id: request.id,
    token: request.token,
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    mealType: request.mealType,
    status: request.status,
    votes: (request.votes ?? []).map((vote) => ({
      id: vote.id,
      memberName: vote.memberName,
      feelingTag: vote.feelingTag,
      note: vote.note,
      temporary: vote.temporary,
      memberId: vote.temporary ? undefined : vote.memberId,
      claimedAt: vote.claimedAt,
      createdAt: vote.createdAt,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

async function requireAuth(request) {
  const token = getBearerToken(request);
  if (!token) throw httpError(401, "missing_token", "Authorization bearer token is required.");
  if (await store.isTokenRevoked(token)) throw httpError(401, "revoked_token", "Session has been revoked.");
  const payload = verifySessionToken(token, config.sessionSecret);
  if (!payload) throw httpError(401, "invalid_token", "Session is invalid or expired.");
  return { userId: payload.sub, token };
}

function sendAuthSession(response, user) {
  const session = createSessionToken({ userId: user.id, secret: config.sessionSecret });
  sendJson(response, 200, {
    accessToken: session.token,
    refreshToken: session.token,
    expiresAt: session.expiresAt,
    user: toPublicUser(user),
  });
}

function toPublicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName || "微信用户",
    provider: user.provider || "wechat",
    phoneVerified: Boolean(user.phoneVerifiedAt),
    phoneMasked: user.phoneMasked || "",
    phoneVerifiedAt: user.phoneVerifiedAt || null,
  };
}

function toHumiFamily(user) {
  return {
    id: `humi:${user.id}`,
    name: "我的家",
    role: "owner",
    provider: "wechat",
  };
}

function sanitizeProfile(profile = {}) {
  return {
    planningMode: stringValue(profile.planningMode),
    familySize: Number(profile.familySize || 2),
    hasChildren: Boolean(profile.hasChildren),
    tastePreferences: stringList(profile.tastePreferences),
    goals: stringList(profile.goals),
    dislikes: stringList(profile.dislikes),
    allergies: stringList(profile.allergies),
    shoppingTolerance: stringValue(profile.shoppingTolerance || "medium"),
  };
}

function sanitizeAppState(state = {}) {
  return {
    todayMenu: sanitizeMenuEntries(state.todayMenu),
    weekPlan: sanitizeWeekPlan(state.weekPlan),
    mealPlan: sanitizeMealPlan(state.mealPlan),
    mealCalendar: sanitizeCalendar(state.mealCalendar),
    mealLogs: sanitizeObjectMap(state.mealLogs, 120),
    checkedItems: sanitizeBooleanMap(state.checkedItems, 400),
    customItems: sanitizeList(state.customItems, sanitizeGroceryLikeItem, 200),
    excludedGroceryKeys: stringList(state.excludedGroceryKeys).slice(0, 400),
    pantryItems: sanitizeList(state.pantryItems, sanitizePantryItem, 300),
    familyProfile: sanitizeProfile(state.familyProfile),
    nutritionGoals: sanitizeObjectMap(state.nutritionGoals, 32),
    recommendationFeedback: sanitizeList(state.recommendationFeedback, sanitizeFeedbackItem, 50),
  };
}

function sanitizeMenuEntries(value) {
  return Array.isArray(value)
    ? value
      .map((item) => ({
        recipeId: stringValue(item?.recipeId),
        quantity: Math.max(1, Math.min(12, Number.parseInt(item?.quantity, 10) || 1)),
      }))
      .filter((item) => item.recipeId)
      .slice(0, 40)
    : [];
}

function sanitizeWeekPlan(value = {}) {
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return Object.fromEntries(
    days.map((day) => [
      day,
      Array.isArray(value?.[day]) ? value[day].map(stringValue).filter(Boolean).slice(0, 20) : [],
    ]),
  );
}

function sanitizeCalendar(value = {}) {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .slice(-120)
      .map(([key, recipeIds]) => [
        key,
        Array.isArray(recipeIds) ? recipeIds.map(stringValue).filter(Boolean).slice(0, 20) : [],
      ]),
  );
}

function sanitizeMealPlan(value = {}) {
  const mealSlots = ["breakfast", "lunch", "dinner"];
  return Object.fromEntries(
    Object.entries(value ?? {})
      .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      .slice(-120)
      .map(([key, dayMeals]) => [
        key,
        Object.fromEntries(
          mealSlots.map((slotId) => [
            slotId,
            sanitizeMenuEntries(dayMeals?.[slotId]).slice(0, 16),
          ]),
        ),
      ]),
  );
}

function sanitizeBooleanMap(value = {}, limit = 200) {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .slice(0, limit)
      .map(([key, itemValue]) => [stringValue(key), Boolean(itemValue)])
      .filter(([key]) => key),
  );
}

function sanitizeObjectMap(value = {}, limit = 80) {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .slice(0, limit)
      .map(([key, itemValue]) => [stringValue(key), sanitizeJsonValue(itemValue, 4)])
      .filter(([key]) => key),
  );
}

function sanitizeList(value, sanitizer, limit) {
  return Array.isArray(value) ? value.map(sanitizer).filter(Boolean).slice(0, limit) : [];
}

function sanitizeGroceryLikeItem(item = {}) {
  const name = stringValue(item.name);
  if (!name) return null;
  return {
    key: stringValue(item.key),
    name,
    amount: stringValue(item.amount),
    source: stringValue(item.source),
  };
}

function sanitizePantryItem(item = {}) {
  const name = stringValue(item.name);
  if (!name) return null;
  return {
    key: stringValue(item.key),
    name,
    amount: stringValue(item.amount),
    expiresOn: dateValue(item.expiresOn),
    source: stringValue(item.source),
  };
}

function sanitizeFeedbackItem(item = {}) {
  return {
    id: stringValue(item.id),
    reasonId: stringValue(item.reasonId),
    reasonLabel: stringValue(item.reasonLabel),
    recipeIds: stringList(item.recipeIds).slice(0, 12),
    createdAt: stringValue(item.createdAt),
  };
}

function sanitizeJsonValue(value, depth) {
  if (depth <= 0) return null;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeJsonValue(item, depth - 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([key, itemValue]) => [stringValue(key), sanitizeJsonValue(itemValue, depth - 1)])
        .filter(([key]) => key),
    );
  }
  return null;
}

function dateValue(value) {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getProfileCompletedCount(profile = {}) {
  if (!profile) return 0;
  return [
    profile.planningMode,
    profile.familySize,
    profile.tastePreferences?.length,
    profile.goals?.length,
    profile.dislikes?.length || profile.allergies?.length,
    profile.shoppingTolerance,
  ].filter(Boolean).length;
}

function stringList(value) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean).slice(0, 24) : [];
}

function stringValue(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function createPhoneHash(countryCode, phoneNumber) {
  return createHmac("sha256", config.sessionSecret).update(`${countryCode}:${phoneNumber}`).digest("hex");
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "invalid_json", "Request body must be JSON.");
  }
}

function getBearerToken(request) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(data)}\n`);
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  createHumiApiServer().listen(config.port, () => {
    console.log(`Humi API listening on http://127.0.0.1:${config.port}`);
  });
}

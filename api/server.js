import http from "node:http";
import { createHash, createHmac } from "node:crypto";
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
  // 精准推荐有真实 API 成本：匿名用户永远走前端基础推荐；登录用户先走缓存，再消耗尝鲜额度。
  aiRateLimit: Number(process.env.HUMI_AI_RATE_LIMIT || 30),
  aiRateWindowMs: Number(process.env.HUMI_AI_RATE_WINDOW_MS || 60000),
  aiPreciseTrialLimit: Number(process.env.HUMI_AI_PRECISE_TRIAL_LIMIT || 3),
  aiCacheTtlMs: Number(process.env.HUMI_AI_CACHE_TTL_MS || 24 * 60 * 60 * 1000),
  collaborationRateLimit: Number(process.env.HUMI_COLLABORATION_RATE_LIMIT || 120),
  collaborationRateWindowMs: Number(process.env.HUMI_COLLABORATION_RATE_WINDOW_MS || 60000),
  requestBodyLimitBytes: Number(process.env.HUMI_REQUEST_BODY_LIMIT_BYTES || 64 * 1024),
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
      if (isCollaborationWriteRequest(request.method, url.pathname)) {
        enforceCollaborationWriteLimit(request);
      }
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

      if (request.method === "GET" && url.pathname === "/households") {
        await handleGetHouseholds(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/households") {
        await handleCreateHousehold(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/households/active") {
        await handleSetActiveHousehold(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/household-invites") {
        await handleCreateHouseholdInvite(request, response);
        return;
      }

      const householdInviteMatch = url.pathname.match(/^\/household-invites\/([^/]+)$/);
      if (request.method === "GET" && householdInviteMatch) {
        await handleGetHouseholdInvite(response, householdInviteMatch[1]);
        return;
      }

      const householdInviteJoinMatch = url.pathname.match(/^\/household-invites\/([^/]+)\/join$/);
      if (request.method === "POST" && householdInviteJoinMatch) {
        await handleJoinHouseholdInvite(request, response, householdInviteJoinMatch[1]);
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

      if (request.method === "POST" && url.pathname === "/grocery-share-requests") {
        await handleCreateGroceryShareRequest(request, response);
        return;
      }

      const groceryShareMatch = url.pathname.match(/^\/grocery-share-requests\/([^/]+)$/);
      if (request.method === "GET" && groceryShareMatch) {
        await handleGetGroceryShareRequest(response, groceryShareMatch[1]);
        return;
      }

      const groceryClaimMatch = url.pathname.match(/^\/grocery-share-requests\/([^/]+)\/claims$/);
      if (request.method === "POST" && groceryClaimMatch) {
        await handleGroceryShareClaim(request, response, groceryClaimMatch[1]);
        return;
      }

      const groceryItemCheckMatch = url.pathname.match(/^\/grocery-share-requests\/([^/]+)\/items\/([^/]+)\/check$/);
      if (request.method === "POST" && groceryItemCheckMatch) {
        await handleGroceryShareItemCheck(request, response, groceryItemCheckMatch[1], groceryItemCheckMatch[2]);
        return;
      }

      const groceryJoinMatch = url.pathname.match(/^\/grocery-share-requests\/([^/]+)\/join$/);
      if (request.method === "POST" && groceryJoinMatch) {
        await handleJoinGroceryShare(request, response, groceryJoinMatch[1]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/menu-share-requests") {
        await handleCreateMenuShareRequest(request, response);
        return;
      }

      const menuShareMatch = url.pathname.match(/^\/menu-share-requests\/([^/]+)$/);
      if (request.method === "GET" && menuShareMatch) {
        await handleGetMenuShareRequest(response, menuShareMatch[1]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/wish-share-requests") {
        await handleCreateWishShareRequest(request, response);
        return;
      }

      const wishShareMatch = url.pathname.match(/^\/wish-share-requests\/([^/]+)$/);
      if (request.method === "GET" && wishShareMatch) {
        await handleGetWishShareRequest(response, wishShareMatch[1]);
        return;
      }

      const wishEntryMatch = url.pathname.match(/^\/wish-share-requests\/([^/]+)\/wishes$/);
      if (request.method === "POST" && wishEntryMatch) {
        await handleWishShareEntry(request, response, wishEntryMatch[1]);
        return;
      }

      const wishJoinMatch = url.pathname.match(/^\/wish-share-requests\/([^/]+)\/join$/);
      if (request.method === "POST" && wishJoinMatch) {
        await handleJoinWishShare(request, response, wishJoinMatch[1]);
        return;
      }

      sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      const status = error.status || 500;
      if (process.env.NODE_ENV !== "production" && status >= 500) {
        console.error(error);
      }
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
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  sendJson(response, 200, {
    user: toPublicUser(user),
    profileCompleted: getProfileCompletedCount(profile),
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
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
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  sendJson(response, 200, {
    state,
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
  });
}

async function handleSaveState(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const state = await store.saveState(user.id, sanitizeAppState(body.state ?? body));
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  sendJson(response, 200, {
    state,
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
  });
}

async function handleGetHouseholds(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  sendJson(response, 200, {
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
  });
}

async function handleCreateHousehold(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const household = await store.createHouseholdForUser(user.id, {
    householdName: stringValue(body.householdName || body.name) || "我的家",
    memberName: stringValue(body.memberName) || user.displayName,
  });
  const households = await store.getHouseholdsForUser(user.id);
  sendJson(response, 201, {
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
  });
}

async function handleSetActiveHousehold(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const household = await store.setActiveHouseholdForUser(user.id, stringValue(body.householdId));
    const state = await store.getState(user.id);
    const households = await store.getHouseholdsForUser(user.id);
    sendJson(response, 200, {
      state,
      family: toHumiFamily(household, user),
      households: toHumiFamilies(households, user),
    });
  } catch (error) {
    if (error.code === "household_not_found") throw httpError(404, "household_not_found", "没有找到这个家，可能还没有加入。");
    throw error;
  }
}

async function handleCreateHouseholdInvite(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const invite = await store.createHouseholdInvite(user.id, {
      householdId: stringValue(body.householdId),
      inviterName: stringValue(body.inviterName) || user.displayName,
    });
    sendJson(response, 201, { invite: toPublicHouseholdInvite(invite) });
  } catch (error) {
    if (error.code === "household_not_found") throw httpError(404, "household_not_found", "没有找到这个家，暂时不能邀请家人。");
    if (error.code === "forbidden") throw httpError(403, "forbidden", "只有主厨能邀请家人加入这个家。");
    throw error;
  }
}

async function handleGetHouseholdInvite(response, token) {
  const invite = await store.getHouseholdInvite(token);
  if (!invite) throw httpError(404, "household_invite_not_found", "这个家庭邀请已经失效。");
  sendJson(response, 200, { invite: toPublicHouseholdInvite(invite) });
}

async function handleJoinHouseholdInvite(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const result = await store.acceptHouseholdInvite(token, user.id, {
      memberName: stringValue(body.memberName) || user.displayName,
    });
    if (!result) throw httpError(404, "household_invite_not_found", "这个家庭邀请已经失效。");
    await sendHouseholdJoinResult(response, user, { invite: toPublicHouseholdInvite(result.invite) });
  } catch (error) {
    if (error.code === "invite_closed") throw httpError(410, "invite_closed", "这个家庭邀请已经关闭。");
    throw error;
  }
}

async function handleRecommend(request, response) {
  const auth = await requireAuth(request);
  enforceAiAccess(auth.userId);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const cacheKey = buildAiRecommendationCacheKey(body);
  const cached = await store.getCachedAiRecommendation(cacheKey, config.aiCacheTtlMs);
  const access = await getPreciseRecommendationAccess(user);
  if (cached) {
    sendJson(response, 200, {
      ...cached.result,
      source: cached.result?.source ? `${cached.result.source}_cached` : "deepseek_cached",
      entitlement: {
        ...access,
        cached: true,
      },
    });
    return;
  }
  if (!access.allowed) {
    throw httpError(402, "precise_trial_used", "精准推荐尝鲜额度已用完；基础推荐仍可无限使用。");
  }
  if (!config.deepseekApiKey) throw httpError(503, "deepseek_not_configured", "DEEPSEEK_API_KEY 未配置。");
  const result = await generateMealRecommendation(body, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel,
    baseUrl: config.deepseekBaseUrl,
  });
  await store.saveCachedAiRecommendation(cacheKey, result);
  const nextUsage = access.paid ? await store.getAiUsage(user.id) : await store.recordAiRecommendationUse(user.id);
  sendJson(response, 200, {
    ...result,
    entitlement: buildPreciseRecommendationEntitlement(user, nextUsage, false),
  });
}

async function handleExplain(request, response) {
  const auth = await requireAuth(request);
  enforceAiAccess(auth.userId);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const access = await getPreciseRecommendationAccess(user);
  if (!access.allowed) {
    throw httpError(402, "precise_trial_used", "精准推荐尝鲜额度已用完；基础推荐仍可无限使用。");
  }
  if (!config.deepseekApiKey) throw httpError(503, "deepseek_not_configured", "DEEPSEEK_API_KEY 未配置。");
  const body = await readJson(request);
  const result = await generateRecommendationExplanation(body, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel,
    baseUrl: config.deepseekBaseUrl,
  });
  const nextUsage = access.paid ? await store.getAiUsage(user.id) : await store.recordAiRecommendationUse(user.id);
  sendJson(response, 200, {
    ...result,
    entitlement: buildPreciseRecommendationEntitlement(user, nextUsage, false),
  });
}

async function handleCreateCraveRequest(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const craveRequest = await store.createCraveRequest(body, user.id);
    sendJson(response, 201, { request: toPublicCraveRequest(craveRequest), ownerSecret: craveRequest.ownerSecret });
  } catch (error) {
    if (error.code === "forbidden") throw httpError(403, "forbidden", "只有主厨能发起这个家的征集。");
    throw error;
  }
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
    const craveRequest = await store.claimCraveVote(token, user.id, body);
    if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
    await sendHouseholdJoinResult(response, user, { request: toPublicCraveRequest(craveRequest) });
  } catch (error) {
    if (error.code === "missing_participant_key") throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能加入这次征集。");
    if (error.code === "vote_not_found") throw httpError(404, "vote_not_found", "没有找到你刚才的投票，可以直接回 Humi 查看。");
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

async function handleCreateGroceryShareRequest(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const groceryRequest = await store.createGroceryShareRequest(body, user.id);
    sendJson(response, 201, { request: toPublicGroceryShareRequest(groceryRequest), ownerSecret: groceryRequest.ownerSecret });
  } catch (error) {
    if (error.code === "forbidden") throw httpError(403, "forbidden", "只有主厨能分享这个家的买菜清单。");
    throw error;
  }
}

async function handleGetGroceryShareRequest(response, token) {
  const groceryRequest = await store.getGroceryShareRequest(token);
  if (!groceryRequest) throw httpError(404, "grocery_share_not_found", "这个清单链接已经失效。");
  sendJson(response, 200, { request: toPublicGroceryShareRequest(groceryRequest) });
}

async function handleGroceryShareClaim(request, response, token) {
  const body = await readJson(request);
  const groceryRequest = await store.addGroceryShareClaim(token, body);
  if (!groceryRequest) throw httpError(404, "grocery_share_not_found", "这个清单链接已经失效。");
  sendJson(response, 200, { request: toPublicGroceryShareRequest(groceryRequest) });
}

async function handleGroceryShareItemCheck(request, response, token, itemId) {
  const body = await readJson(request);
  const groceryRequest = await store.updateGroceryShareItemChecked(token, decodeURIComponent(itemId), Boolean(body.checked));
  if (!groceryRequest) throw httpError(404, "grocery_share_not_found", "这个清单链接已经失效。");
  sendJson(response, 200, { request: toPublicGroceryShareRequest(groceryRequest) });
}

async function handleJoinGroceryShare(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const groceryRequest = await store.claimGroceryShareParticipant(token, user.id, body);
    if (!groceryRequest) throw httpError(404, "grocery_share_not_found", "这个清单链接已经失效。");
    await sendHouseholdJoinResult(response, user, { request: toPublicGroceryShareRequest(groceryRequest) });
  } catch (error) {
    if (error.code === "missing_participant_key") throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能加入这个家。");
    if (error.code === "claim_not_found") throw httpError(404, "claim_not_found", "没有找到你刚才的买菜参与记录。");
    throw error;
  }
}

async function handleCreateMenuShareRequest(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const menuRequest = await store.createMenuShareRequest(body, user.id);
    sendJson(response, 201, { request: toPublicMenuShareRequest(menuRequest) });
  } catch (error) {
    if (error.code === "forbidden") throw httpError(403, "forbidden", "只有主厨能分享这个家的今晚菜单。");
    throw error;
  }
}

async function handleGetMenuShareRequest(response, token) {
  const menuRequest = await store.getMenuShareRequest(token);
  if (!menuRequest) throw httpError(404, "menu_share_not_found", "这个菜单链接已经失效。");
  sendJson(response, 200, { request: toPublicMenuShareRequest(menuRequest) });
}

async function handleCreateWishShareRequest(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const wishRequest = await store.createWishShareRequest(body, user.id);
    sendJson(response, 201, { request: toPublicWishShareRequest(wishRequest), ownerSecret: wishRequest.ownerSecret });
  } catch (error) {
    if (error.code === "forbidden") throw httpError(403, "forbidden", "只有主厨能分享这个家的想吃入口。");
    throw error;
  }
}

async function handleGetWishShareRequest(response, token) {
  const wishRequest = await store.getWishShareRequest(token);
  if (!wishRequest) throw httpError(404, "wish_share_not_found", "这个想吃入口已经失效。");
  sendJson(response, 200, { request: toPublicWishShareRequest(wishRequest) });
}

async function handleWishShareEntry(request, response, token) {
  const body = await readJson(request);
  const wishRequest = await store.addWishShareEntry(token, body);
  if (!wishRequest) throw httpError(404, "wish_share_not_found", "这个想吃入口已经失效。");
  sendJson(response, 200, { request: toPublicWishShareRequest(wishRequest) });
}

async function handleJoinWishShare(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const wishRequest = await store.claimWishShareParticipant(token, user.id, body);
    if (!wishRequest) throw httpError(404, "wish_share_not_found", "这个想吃入口已经失效。");
    await sendHouseholdJoinResult(response, user, { request: toPublicWishShareRequest(wishRequest) });
  } catch (error) {
    if (error.code === "missing_participant_key") throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能加入这个家。");
    if (error.code === "wish_not_found") throw httpError(404, "wish_not_found", "没有找到你刚才的想吃记录。");
    throw error;
  }
}

async function sendHouseholdJoinResult(response, user, payload = {}) {
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  const state = await store.getState(user.id);
  sendJson(response, 200, {
    ...payload,
    state,
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
  });
}

const aiRateBuckets = new Map();
const collaborationRateBuckets = new Map();

function enforceAiAccess(bucketKey) {
  const now = Date.now();
  const bucket = aiRateBuckets.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    aiRateBuckets.set(bucketKey, { count: 1, resetAt: now + config.aiRateWindowMs });
    return;
  }
  if (bucket.count >= config.aiRateLimit) {
    throw httpError(429, "rate_limited", "请求过于频繁，请稍后再试。");
  }
  bucket.count += 1;
}

function enforceCollaborationWriteLimit(request) {
  const now = Date.now();
  const bucketKey = getRequestClientKey(request);
  const bucket = collaborationRateBuckets.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    collaborationRateBuckets.set(bucketKey, { count: 1, resetAt: now + config.collaborationRateWindowMs });
    pruneExpiredRateBuckets(collaborationRateBuckets, now);
    return;
  }
  if (bucket.count >= config.collaborationRateLimit) {
    throw httpError(429, "rate_limited", "协作操作过于频繁，请稍后再试。");
  }
  bucket.count += 1;
}

function isCollaborationWriteRequest(method, pathname) {
  if (method !== "POST") return false;
  return pathname === "/crave-requests" ||
    /^\/crave-requests\/[^/]+\/(votes|close|join)$/.test(pathname) ||
    pathname === "/grocery-share-requests" ||
    /^\/grocery-share-requests\/[^/]+\/(claims|join|items\/[^/]+\/check)$/.test(pathname) ||
    pathname === "/menu-share-requests" ||
    pathname === "/wish-share-requests" ||
    /^\/wish-share-requests\/[^/]+\/(wishes|join)$/.test(pathname);
}

function getRequestClientKey(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
}

function pruneExpiredRateBuckets(buckets, now) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

async function getPreciseRecommendationAccess(user) {
  const usage = await store.getAiUsage(user.id);
  return buildPreciseRecommendationEntitlement(user, usage, false);
}

function buildPreciseRecommendationEntitlement(user, usage = {}, cached = false) {
  const paid = hasPaidPrecisePlan(user);
  const used = Number(usage.preciseRecommendationUses || 0);
  const trialLimit = Math.max(0, config.aiPreciseTrialLimit);
  const trialRemaining = paid ? null : Math.max(0, trialLimit - used);
  return {
    allowed: paid || trialRemaining > 0,
    paid,
    trialLimit,
    trialUsed: paid ? 0 : Math.min(used, trialLimit),
    trialRemaining,
    cached,
  };
}

function hasPaidPrecisePlan(user = {}) {
  return ["paid", "premium", "family_pro"].includes(user.plan)
    || ["paid", "premium", "family_pro"].includes(user.subscriptionPlan)
    || user.preciseRecommendationEnabled === true;
}

function buildAiRecommendationCacheKey(payload = {}) {
  const normalized = {
    candidateIds: (payload.candidates ?? []).map((item) => item.id).filter(Boolean).sort(),
    pantryItems: (payload.pantryItems ?? []).map((item) => [item.name, item.amount]).sort(),
    familyProfile: payload.familyProfile ?? {},
    compactFamilyPrompt: payload.compactFamilyPrompt ?? "",
    familyPreferences: payload.familyPreferences ?? [],
    recentRecipeIds: payload.recentRecipeIds ?? [],
    recentFeedback: payload.recentFeedback ?? [],
    currentMissingItems: payload.currentMissingItems ?? [],
    ruleFallback: {
      recipeIds: payload.ruleFallback?.recipeIds ?? [],
      reason: payload.ruleFallback?.reason ?? "",
    },
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function toPublicCraveRequest(request) {
  return {
    id: request.id,
    token: request.token,
    householdId: request.householdId || "",
    ownerId: request.ownerId || "",
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    mealType: request.mealType,
    starterFeeling: request.starterFeeling,
    targetParticipantNames: Array.isArray(request.targetParticipantNames) ? request.targetParticipantNames : [],
    status: request.status,
    votes: (request.votes ?? []).map((vote) => ({
      id: vote.id,
      participantKey: vote.participantKey,
      memberName: vote.memberName,
      feelingTag: vote.feelingTag,
      dishWish: vote.dishWish,
      note: vote.note,
      temporary: vote.temporary,
      memberId: vote.temporary ? undefined : vote.memberId,
      mergedAt: vote.mergedAt,
      createdAt: vote.createdAt,
    })),
    createdAt: request.createdAt,
    deadlineAt: request.deadlineAt,
    updatedAt: request.updatedAt,
  };
}

function toPublicGroceryShareRequest(request) {
  return {
    id: request.id,
    token: request.token,
    householdId: request.householdId || "",
    ownerId: request.ownerId || "",
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    title: request.title,
    status: request.status,
    items: (request.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      category: item.category,
      checked: item.checked,
    })),
    claims: (request.claims ?? []).map((claim) => ({
      id: claim.id,
      participantKey: claim.participantKey,
      memberName: claim.memberName,
      status: claim.status,
      itemIds: Array.isArray(claim.itemIds) ? claim.itemIds : [],
      note: claim.note,
      temporary: claim.temporary,
      memberId: claim.temporary ? undefined : claim.memberId,
      mergedAt: claim.mergedAt,
      createdAt: claim.createdAt,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toPublicMenuShareRequest(request) {
  return {
    id: request.id,
    token: request.token,
    householdId: request.householdId || "",
    ownerId: request.ownerId || "",
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    title: request.title,
    status: request.status,
    dishes: (request.dishes ?? []).map((dish) => ({
      id: dish.id,
      recipeId: dish.recipeId,
      name: dish.name,
      quantity: dish.quantity,
      category: dish.category,
      timeMinutes: dish.timeMinutes,
    })),
    groceryCount: request.groceryCount,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toPublicWishShareRequest(request) {
  return {
    id: request.id,
    token: request.token,
    householdId: request.householdId || "",
    ownerId: request.ownerId || "",
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    title: request.title,
    status: request.status,
    wishes: (request.wishes ?? []).map((wish) => ({
      id: wish.id,
      participantKey: wish.participantKey,
      memberName: wish.memberName,
      dishName: wish.dishName,
      note: wish.note,
      temporary: wish.temporary,
      memberId: wish.temporary ? undefined : wish.memberId,
      mergedAt: wish.mergedAt,
      createdAt: wish.createdAt,
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

function toHumiFamily(household, user) {
  const member = household?.members?.find((item) => item.memberId === user.id);
  return {
    id: household?.id || `humi:${user.id}`,
    name: household?.name || "我的家",
    ownerId: household?.ownerId || user.id,
    currentMemberId: member?.memberId || user.id,
    role: member?.role || (household?.ownerId === user.id ? "owner" : "member"),
    provider: "wechat",
    members: (household?.members ?? []).map((item) => ({
      memberId: item.memberId,
      nickname: item.nickname,
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt,
    })),
  };
}

function toHumiFamilies(households = [], user) {
  return households.map((household) => toHumiFamily(household, user));
}

function toPublicHouseholdInvite(invite) {
  return {
    id: invite.id,
    token: invite.token,
    householdId: invite.householdId,
    householdName: invite.householdName,
    inviterName: invite.inviterName,
    status: invite.status,
    acceptedCount: (invite.acceptedMemberIds ?? []).length,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
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
    craveSignals: sanitizeList(state.craveSignals, sanitizeCraveSignalItem, 50),
    wishPool: sanitizeList(state.wishPool, sanitizeWishPoolItem, 80),
    activeCraveRequest: sanitizeActiveCraveRequestState(state.activeCraveRequest),
    activeGroceryShareRequest: sanitizeGroceryShareState(state.activeGroceryShareRequest),
    activeWishShareRequest: sanitizeWishShareState(state.activeWishShareRequest),
    pendingJoinContext: sanitizePendingJoinContext(state.pendingJoinContext),
    householdMembers: sanitizeList(state.householdMembers, sanitizeHouseholdMemberItem, 80),
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

function sanitizeCraveSignalItem(item = {}) {
  return {
    id: stringValue(item.id),
    requestToken: stringValue(item.requestToken),
    householdId: stringValue(item.householdId),
    ownerId: stringValue(item.ownerId),
    householdName: stringValue(item.householdName || "我家"),
    initiatorName: stringValue(item.initiatorName || "主厨"),
    feelingTag: stringValue(item.feelingTag || "随便都行"),
    voteCount: Math.max(0, Math.min(20, Number.parseInt(item.voteCount, 10) || 0)),
    votes: sanitizeList(item.votes, sanitizeCraveVoteItem, 20),
    createdAt: stringValue(item.createdAt),
    updatedAt: stringValue(item.updatedAt),
    recipeIds: stringList(item.recipeIds).slice(0, 12),
  };
}

function sanitizeCraveVoteItem(item = {}) {
  return {
    id: stringValue(item.id),
    participantKey: stringValue(item.participantKey),
    memberName: stringValue(item.memberName || "家人"),
    feelingTag: stringValue(item.feelingTag || "随便都行"),
    dishWish: stringValue(item.dishWish),
    note: stringValue(item.note),
    temporary: item.temporary !== false,
    createdAt: stringValue(item.createdAt),
    mergedAt: stringValue(item.mergedAt),
  };
}

function sanitizeActiveCraveRequestState(request = null) {
  if (!request?.token) return null;
  return {
    id: stringValue(request.id),
    token: stringValue(request.token),
    ownerSecret: stringValue(request.ownerSecret),
    householdId: stringValue(request.householdId),
    ownerId: stringValue(request.ownerId),
    householdName: stringValue(request.householdName || "我家"),
    initiatorName: stringValue(request.initiatorName || "主厨"),
    mealType: stringValue(request.mealType || "dinner"),
    status: request.status === "closed" ? "closed" : "open",
    starterFeeling: stringValue(request.starterFeeling || "随便都行"),
    targetParticipantNames: stringList(request.targetParticipantNames).slice(0, 12),
    audience: sanitizeList(request.audience, sanitizeAudienceItem, 20),
    votes: sanitizeList(request.votes, sanitizeCraveVoteItem, 40),
    createdAt: stringValue(request.createdAt),
    deadlineAt: stringValue(request.deadlineAt),
    updatedAt: stringValue(request.updatedAt),
  };
}

function sanitizeWishPoolItem(item = {}) {
  const recipeId = stringValue(item.recipeId);
  const name = stringValue(item.name);
  if (!recipeId && !name) return null;
  return {
    id: stringValue(item.id || `wish:${recipeId || name}`),
    participantKey: stringValue(item.participantKey),
    recipeId,
    name,
    source: stringValue(item.source),
    temporary: item.temporary !== false,
    createdAt: stringValue(item.createdAt),
    mergedAt: stringValue(item.mergedAt),
  };
}

function sanitizeWishShareState(request = null) {
  if (!request?.token) return null;
  return {
    id: stringValue(request.id),
    token: stringValue(request.token),
    ownerSecret: stringValue(request.ownerSecret),
    householdId: stringValue(request.householdId),
    ownerId: stringValue(request.ownerId),
    householdName: stringValue(request.householdName || "我家"),
    initiatorName: stringValue(request.initiatorName || "主厨"),
    title: stringValue(request.title || "家里最近想吃什么"),
    status: request.status === "closed" ? "closed" : "open",
    wishes: sanitizeList(request.wishes, sanitizeWishShareEntryItem, 60),
    createdAt: stringValue(request.createdAt),
    updatedAt: stringValue(request.updatedAt),
  };
}

function sanitizeAudienceItem(item = {}) {
  const name = stringValue(item.name || "家人");
  if (!name) return null;
  return {
    id: stringValue(item.id || name),
    name,
    meta: stringValue(item.meta),
  };
}

function sanitizeWishShareEntryItem(item = {}) {
  return {
    id: stringValue(item.id),
    participantKey: stringValue(item.participantKey),
    memberName: stringValue(item.memberName || "家人"),
    dishName: stringValue(item.dishName || item.name),
    note: stringValue(item.note),
    temporary: item.temporary !== false,
    createdAt: stringValue(item.createdAt),
    mergedAt: stringValue(item.mergedAt),
  };
}

function sanitizePendingJoinContext(context = null) {
  if (!context?.type) return null;
  const type = context.type === "grocery" ? "grocery" : context.type === "wish" ? "wish" : context.type === "crave" ? "crave" : "";
  if (!type) return null;
  return {
    type,
    token: stringValue(context.token),
    participantKey: stringValue(context.participantKey),
    householdName: stringValue(context.householdName || "我家"),
    initiatorName: stringValue(context.initiatorName || "主厨"),
    memberName: stringValue(context.memberName || "家人"),
    feelingTag: type === "crave" ? stringValue(context.feelingTag || "随便都行") : "",
    dishWish: type === "crave" || type === "wish" ? stringValue(context.dishWish) : "",
    claimStatus: type === "grocery" && context.claimStatus === "declined" ? "declined" : type === "grocery" ? "claimed" : "",
    itemCount: type === "grocery" ? Math.max(0, Math.min(80, Number.parseInt(context.itemCount, 10) || 0)) : 0,
    createdAt: stringValue(context.createdAt),
  };
}

function sanitizeHouseholdMemberItem(member = {}) {
  const name = stringValue(member.name || "家人");
  if (!name) return null;
  return {
    id: stringValue(member.id || member.participantKey || `member:${name}`),
    participantKey: stringValue(member.participantKey),
    name,
    role: member.role === "主厨" ? "主厨" : "家人",
    status: "正式成员",
    source: stringValue(member.source),
    householdName: stringValue(member.householdName || "我家"),
    lastSignal: stringValue(member.lastSignal),
    joinedAt: stringValue(member.joinedAt),
  };
}

function sanitizeGroceryShareState(request = null) {
  if (!request?.token) return null;
  return {
    id: stringValue(request.id),
    token: stringValue(request.token),
    ownerSecret: stringValue(request.ownerSecret),
    householdId: stringValue(request.householdId),
    ownerId: stringValue(request.ownerId),
    householdName: stringValue(request.householdName),
    initiatorName: stringValue(request.initiatorName),
    title: stringValue(request.title),
    status: stringValue(request.status || "open"),
    items: sanitizeList(request.items, sanitizeGroceryShareItem, 80),
    claims: sanitizeList(request.claims, sanitizeGroceryShareClaimItem, 40),
    createdAt: stringValue(request.createdAt),
    updatedAt: stringValue(request.updatedAt),
  };
}

function sanitizeGroceryShareItem(item = {}) {
  const id = stringValue(item.id);
  const name = stringValue(item.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    amount: stringValue(item.amount),
    category: stringValue(item.category),
    checked: Boolean(item.checked),
  };
}

function sanitizeGroceryShareClaimItem(item = {}) {
  return {
    id: stringValue(item.id),
    participantKey: stringValue(item.participantKey),
    memberName: stringValue(item.memberName || "家人"),
    status: item.status === "declined" ? "declined" : "claimed",
    itemIds: stringList(item.itemIds).slice(0, 80),
    note: stringValue(item.note),
    temporary: item.temporary !== false,
    createdAt: stringValue(item.createdAt),
    mergedAt: stringValue(item.mergedAt),
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
  let receivedBytes = 0;
  let payloadTooLarge = false;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > config.requestBodyLimitBytes) {
      payloadTooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (payloadTooLarge) throw httpError(413, "payload_too_large", "请求内容过大。");
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

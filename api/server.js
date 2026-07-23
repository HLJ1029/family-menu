import http from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionToken, verifySessionToken } from "./session.js";
import { APPROVED_AVATAR_KEYS, HumiStore } from "./store.js";
import { buildBootstrapEnvelope } from "./bootstrap.js";
import { exchangeWechatCode, exchangeWechatPhoneNumber, sendWechatSubscribeMessage } from "./wechat.js";
import { generateMealRecommendation, generateRecommendationExplanation } from "./recommend.js";
import { decodeAvatarPayload, readAvatarFile, writeAvatarFile } from "./avatar.js";
import { buildMealTimeline, downgradeMealPlan, getCertifiedRecipe } from "../src/lib/mealExecution.js";
import { formatBusinessDateKey } from "./recommendation-rotation.js";

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
  // 基础推荐默认走本地规则；只有登录用户显式请求精准能力时才允许消耗 DeepSeek。
  aiRateLimit: Number(process.env.HUMI_AI_RATE_LIMIT || 30),
  aiRateWindowMs: Number(process.env.HUMI_AI_RATE_WINDOW_MS || 60000),
  posterDir: process.env.HUMI_POSTER_DIR || resolve(dirname(process.env.HUMI_API_DATA_FILE || resolve(".humi-api-data.json")), ".humi-posters"),
  posterPublicBaseUrl: (process.env.HUMI_PUBLIC_BASE_URL || "https://api.humi-home.com").replace(/\/$/, ""),
  posterMaxBytes: Math.min(1024 * 1024, Math.max(64 * 1024, Number(process.env.HUMI_POSTER_MAX_BYTES || 950 * 1024))),
  posterTtlMs: Math.max(60 * 60 * 1000, Number(process.env.HUMI_POSTER_TTL_MS || 24 * 60 * 60 * 1000)),
  posterRateLimit: Math.max(1, Number(process.env.HUMI_POSTER_RATE_LIMIT || 12)),
  posterRateWindowMs: Math.max(10_000, Number(process.env.HUMI_POSTER_RATE_WINDOW_MS || 60_000)),
  avatarDir: process.env.HUMI_AVATAR_DIR || resolve(dirname(process.env.HUMI_API_DATA_FILE || resolve(".humi-api-data.json")), "avatars"),
  avatarPublicBaseUrl: (process.env.HUMI_PUBLIC_BASE_URL || "https://api.humi-home.com").replace(/\/$/, ""),
  avatarMaxBytes: 512 * 1024,
  assetDir: process.env.HUMI_ASSET_DIR || resolve("public/assets"),
  mealExecutionEnabled: process.env.HUMI_MEAL_EXECUTION_ENABLED === "1",
  mealExecutionHouseholds: new Set((process.env.HUMI_MEAL_EXECUTION_HOUSEHOLDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)),
  nativeShellEnabled: process.env.HUMI_NATIVE_SHELL_ENABLED === "1",
  nativeShellHouseholds: new Set((process.env.HUMI_NATIVE_SHELL_HOUSEHOLDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)),
  nativeShellWildcardAllowed: process.env.NODE_ENV === "test",
  mealReminderTemplateId: process.env.HUMI_MEAL_REMINDER_TEMPLATE_ID || "",
  mealReminderThingKey: process.env.HUMI_MEAL_REMINDER_THING_KEY || "thing1",
  mealReminderTimeKey: process.env.HUMI_MEAL_REMINDER_TIME_KEY || "time2",
};

if (!config.sessionSecret) {
  throw new Error("HUMI_SESSION_SECRET is required in production.");
}

const store = new HumiStore(config.dataFile);

const householdStatus = {
  household_not_found: 404,
  forbidden: 403,
  household_name_required: 400,
  member_not_found: 404,
  owner_cannot_be_removed: 409,
  owner_must_transfer_or_disband: 409,
};

export function createHumiApiServer() {
  const server = http.createServer(async (request, response) => {
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

      const staticAssetMatch = url.pathname.match(/^\/assets\/(dishes\/(?:thumbs|webp)\/[A-Za-z0-9_-]+\.webp|brand\/lovart-v2\/[A-Za-z0-9_-]+\.webp)$/);
      if ((request.method === "GET" || request.method === "HEAD") && staticAssetMatch) {
        await handleGetStaticAsset(request, response, staticAssetMatch[1]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/wechat/login") {
        await handleWechatLogin(request, response);
        return;
      }

      if (request.method === "PUT" && url.pathname === "/identity/profile") {
        await handleIdentityProfile(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/identity/avatar") {
        await handleIdentityAvatar(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/h5-ticket") {
        await handleCreateH5Ticket(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/auth/h5/exchange") {
        await handleExchangeH5Ticket(request, response);
        return;
      }

      const avatarMatch = url.pathname.match(/^\/avatars\/([A-Za-z0-9_-]{32})\.(jpg|png)$/);
      if ((request.method === "GET" || request.method === "HEAD") && avatarMatch) {
        await handleGetAvatar(request, response, avatarMatch[1], avatarMatch[2]);
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

      if (request.method === "GET" && url.pathname === "/bootstrap") {
        await handleBootstrap(request, response);
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

      const householdCollaborationMatch = url.pathname.match(/^\/households\/([^/]+)\/collaborations$/);
      if (request.method === "GET" && householdCollaborationMatch) {
        await handleGetHouseholdCollaborations(request, response, householdCollaborationMatch[1], url.searchParams.get("limit"));
        return;
      }

      const householdMemberMatch = url.pathname.match(/^\/households\/([^/]+)\/members\/([^/]+)$/);
      if (request.method === "DELETE" && householdMemberMatch) {
        await handleRemoveHouseholdMember(request, response, householdMemberMatch[1], householdMemberMatch[2]);
        return;
      }

      const householdOwnerMatch = url.pathname.match(/^\/households\/([^/]+)\/owner$/);
      if (request.method === "POST" && householdOwnerMatch) {
        await handleTransferHouseholdOwnership(request, response, householdOwnerMatch[1]);
        return;
      }

      const householdLeaveMatch = url.pathname.match(/^\/households\/([^/]+)\/leave$/);
      if (request.method === "POST" && householdLeaveMatch) {
        await handleLeaveHousehold(request, response, householdLeaveMatch[1]);
        return;
      }

      const householdMatch = url.pathname.match(/^\/households\/([^/]+)$/);
      if (request.method === "PATCH" && householdMatch) {
        await handleUpdateHousehold(request, response, householdMatch[1]);
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

      const householdInviteWantMatch = url.pathname.match(/^\/household-invites\/([^/]+)\/wants$/);
      if (request.method === "POST" && householdInviteWantMatch) {
        await handleAddHouseholdInviteWant(request, response, householdInviteWantMatch[1]);
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

      if (request.method === "POST" && url.pathname === "/recommendations/dinner") {
        await handleDinnerRecommendation(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/meal-runs") {
        await handleCreateMealRun(request, response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/meal-runs/current") {
        await handleGetCurrentMealRun(request, response, url.searchParams);
        return;
      }

      const mealRunStartMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/start$/);
      if (request.method === "POST" && mealRunStartMatch) {
        await handleStartMealRun(request, response, mealRunStartMatch[1]);
        return;
      }

      const mealRunProgressMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/progress$/);
      if (request.method === "PUT" && mealRunProgressMatch) {
        await handleUpdateMealRunProgress(request, response, mealRunProgressMatch[1]);
        return;
      }

      const mealRunCompleteMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/complete$/);
      if (request.method === "POST" && mealRunCompleteMatch) {
        await handleCompleteMealRun(request, response, mealRunCompleteMatch[1]);
        return;
      }

      const mealRunDowngradeMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/downgrade$/);
      if (request.method === "POST" && mealRunDowngradeMatch) {
        await handleDowngradeMealRun(request, response, mealRunDowngradeMatch[1]);
        return;
      }

      const mealRunAbandonMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/abandon$/);
      if (request.method === "POST" && mealRunAbandonMatch) {
        await handleAbandonMealRun(request, response, mealRunAbandonMatch[1]);
        return;
      }

      const mealRunFeedbackMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/feedback$/);
      if (request.method === "PUT" && mealRunFeedbackMatch) {
        await handleMealRunFeedback(request, response, mealRunFeedbackMatch[1]);
        return;
      }

      const mealRunTasksMatch = url.pathname.match(/^\/meal-runs\/([^/]+)\/tasks$/);
      if (request.method === "POST" && mealRunTasksMatch) {
        await handleCreateMealTask(request, response, mealRunTasksMatch[1]);
        return;
      }

      const mealTaskClaimMatch = url.pathname.match(/^\/meal-tasks\/([^/]+)\/claim$/);
      if (request.method === "POST" && mealTaskClaimMatch) {
        await handleClaimMealTask(request, response, mealTaskClaimMatch[1]);
        return;
      }

      const mealTaskMatch = url.pathname.match(/^\/meal-tasks\/([^/]+)$/);
      if (request.method === "GET" && mealTaskMatch) {
        await handleGetMealTask(request, response, mealTaskMatch[1]);
        return;
      }

      const mealTaskCompleteMatch = url.pathname.match(/^\/meal-tasks\/([^/]+)\/complete$/);
      if (request.method === "POST" && mealTaskCompleteMatch) {
        await handleCompleteMealTask(request, response, mealTaskCompleteMatch[1]);
        return;
      }

      if (request.method === "GET" && url.pathname === "/meal-reminders/config") {
        await handleMealReminderConfig(request, response);
        return;
      }

      if (request.method === "POST" && url.pathname === "/meal-reminders") {
        await handleCreateMealReminder(request, response);
        return;
      }

      const mealReminderMatch = url.pathname.match(/^\/meal-reminders\/([^/]+)$/);
      if (request.method === "DELETE" && mealReminderMatch) {
        await handleCancelMealReminder(request, response, mealReminderMatch[1]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/product-events") {
        await handleProductEvent(request, response);
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

      if (request.method === "POST" && url.pathname === "/grocery-shares") {
        await handleCreateGroceryShare(request, response);
        return;
      }

      const groceryShareMatch = url.pathname.match(/^\/grocery-shares\/([^/]+)$/);
      if (request.method === "GET" && groceryShareMatch) {
        await handleGetGroceryShare(response, groceryShareMatch[1]);
        return;
      }

      const groceryShareClaimMatch = url.pathname.match(/^\/grocery-shares\/([^/]+)\/claims$/);
      if (request.method === "POST" && groceryShareClaimMatch) {
        await handleClaimGroceryShare(request, response, groceryShareClaimMatch[1]);
        return;
      }

      if (request.method === "POST" && url.pathname === "/grocery-share-requests") {
        await handleCreateGroceryShareRequest(request, response);
        return;
      }

      const batchGroceryShareMatch = url.pathname.match(/^\/grocery-share-requests\/([^/]+)$/);
      if (request.method === "GET" && batchGroceryShareMatch) {
        await handleGetGroceryShareRequest(response, batchGroceryShareMatch[1]);
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

      if (request.method === "POST" && url.pathname === "/poster-shares") {
        await handleCreatePosterShare(request, response);
        return;
      }

      const posterShareMatch = url.pathname.match(/^\/poster-shares\/([A-Za-z0-9_-]{24,64})\.(jpg|png)$/);
      if ((request.method === "GET" || request.method === "HEAD") && posterShareMatch) {
        await handleGetPosterShare(request, response, posterShareMatch[1], posterShareMatch[2]);
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
      const status = error.status || (error.code === "household_required" ? 409 : 500);
      if (process.env.NODE_ENV !== "production" && status >= 500) {
        console.error(error);
      }
      sendJson(response, status, {
        error: error.code || "internal_error",
        message: status >= 500 ? "Humi API 暂时不可用。" : error.message,
      });
    }
  });
  const reminderTimer = setInterval(() => {
    void processDueMealReminders().catch((error) => {
      if (process.env.NODE_ENV !== "production") console.error("Meal reminder worker failed", error);
    });
  }, 60_000);
  reminderTimer.unref?.();
  server.once("close", () => clearInterval(reminderTimer));
  return server;
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

async function handleIdentityProfile(request, response) {
  const auth = await requireAuth(request);
  const body = await readJson(request);
  const displayName = stringValue(body.displayName, 32);
  if (!displayName) throw httpError(400, "display_name_required", "请输入你的昵称。");
  const avatarKey = stringValue(body.avatarKey, 80);
  if (avatarKey && !APPROVED_AVATAR_KEYS.includes(avatarKey)) {
    throw httpError(400, "invalid_avatar_key", "请选择 Humi 提供的头像。");
  }
  let user;
  try {
    user = await store.updateIdentityProfile(auth.userId, { displayName, avatarKey });
  } catch (error) {
    if (error?.code === "avatar_required") {
      throw httpError(400, "avatar_required", "请选择一个 Humi 头像，或使用微信头像。");
    }
    if (error?.code === "invalid_avatar_key") {
      throw httpError(400, "invalid_avatar_key", "请选择 Humi 提供的头像。");
    }
    throw error;
  }
  if (!user) throw httpError(401, "invalid_session", "登录状态已失效。");
  sendJson(response, 200, { user: toPublicUser(user) });
}

async function handleIdentityAvatar(request, response) {
  const auth = await requireAuth(request);
  const body = await readJson(request, 800 * 1024);
  const decoded = decodeAvatarPayload(body, config.avatarMaxBytes);
  if (!decoded) throw httpError(415, "invalid_avatar", "头像需要是 512KB 内的 JPG 或 PNG。");
  const file = await writeAvatarFile({ directory: config.avatarDir, ...decoded });
  const avatarUrl = `${config.avatarPublicBaseUrl}/avatars/${file.token}.${file.format}`;
  const user = await store.updateIdentityAvatar(auth.userId, { avatarUrl });
  if (!user) throw httpError(401, "invalid_session", "登录状态已失效。");
  sendJson(response, 201, { user: toPublicUser(user) });
}

async function handleGetStaticAsset(request, response, relativePath) {
  const path = join(config.assetDir, relativePath);
  const file = await readFile(path).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!file) throw httpError(404, "asset_not_found", "图片资源不存在。");
  response.writeHead(200, {
    "Content-Type": "image/webp",
    "Content-Length": file.length,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(request.method === "HEAD" ? undefined : file);
}

async function handleCreateH5Ticket(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "登录状态已失效。");
  if (user.profileStatus !== "complete") {
    throw httpError(409, "identity_required", "请先完成昵称设置。");
  }
  const issued = await store.issueH5Ticket(auth.userId, { ttlMs: 60_000 });
  if (!issued) throw httpError(401, "invalid_session", "登录状态已失效。");
  sendJson(response, 201, issued);
}

async function handleExchangeH5Ticket(request, response) {
  const body = await readJson(request);
  const consumed = await store.consumeH5Ticket(stringValue(body.ticket, 160));
  if (!consumed) throw httpError(401, "invalid_h5_ticket", "登录链接已失效，请重新登录。");
  const user = await store.getUser(consumed.userId);
  if (!user) throw httpError(401, "invalid_h5_ticket", "登录链接已失效，请重新登录。");
  sendAuthSession(response, user);
}

async function handleGetAvatar(request, response, token, format) {
  const file = await readAvatarFile({ directory: config.avatarDir, token, format });
  if (!file) throw httpError(404, "avatar_not_found", "头像不存在。");
  response.writeHead(200, {
    "Content-Type": format === "png" ? "image/png" : "image/jpeg",
    "Content-Length": file.size,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") return response.end();
  response.end(file.bytes);
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
    capabilities: mealExecutionCapabilities(household),
  });
}

async function handleBootstrap(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const snapshot = await store.getBootstrapSnapshot(user.id, { dateKey: currentDinnerDateKey() });
  const mealExecutionEnabled = mealExecutionCapabilities(snapshot.activeHousehold).mealExecution;
  const payload = buildBootstrapEnvelope({
    user,
    households: snapshot.households,
    activeHousehold: snapshot.activeHousehold,
    state: snapshot.state,
    mealRun: snapshot.mealRun,
    flags: {
      nativeShellEnabled: isNativeShellEnabledFor(snapshot.activeHousehold?.id),
      mealExecutionEnabled,
      reminderEnabled: Boolean(mealExecutionEnabled && config.mealReminderTemplateId),
    },
  });
  sendJson(response, 200, payload, { "Cache-Control": "private, no-store" });
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
    capabilities: mealExecutionCapabilities(household),
  });
}

async function handleSaveState(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  const householdId = stringValue(body.householdId || body.state?.householdId, 80);
  const state = await store.saveState(user.id, sanitizeAppState(body.state ?? body), householdId);
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  sendJson(response, 200, {
    state,
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
    capabilities: mealExecutionCapabilities(household),
  });
}

async function handleDinnerRecommendation(request, response) {
  const { user } = await requireMealExecutionUser(request);
  const body = await readJson(request);
  const requestedHouseholdId = stringValue(body.householdId, 100);
  const households = await store.getHouseholdsForUser(user.id);
  const activeHousehold = await store.getHouseholdForUser(user.id);
  const household = requestedHouseholdId
    ? households.find((item) => item.id === requestedHouseholdId)
    : activeHousehold;
  if (!household) throw httpError(404, "household_not_found", "没有找到这个家。");
  const mode = stringValue(body.mode, 24);
  if (mode === "meal_execution") assertMealExecutionEnabled(household.id);
  try {
    const recommendation = await store.rotateDinnerRecommendation(user.id, {
      householdId: household.id,
      dateKey: body.dateKey,
      mode,
      effortTier: body.effortTier,
      action: body.action,
      contextFingerprint: body.contextFingerprint,
      stateVersion: body.stateVersion,
    });
    sendJson(response, 200, recommendation, { "Cache-Control": "private, no-store" });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleCreateMealRun(request, response) {
  const { user, household } = await requireMealExecutionContext(request);
  const body = await readJson(request);
  const householdId = stringValue(body.householdId, 100) || household.id;
  if (householdId !== household.id) {
    const households = await store.getHouseholdsForUser(user.id);
    const requestedHousehold = households.find((item) => item.id === householdId);
    if (!requestedHousehold) throw httpError(404, "household_not_found", "没有找到这个家。");
    assertMealExecutionEnabled(requestedHousehold.id);
  }
  const effortTier = stringValue(body.effortTier, 24);
  const recipeIds = [...new Set((Array.isArray(body.recipeIds) ? body.recipeIds : [])
    .map((recipeId) => stringValue(recipeId, 100))
    .filter(Boolean))].slice(0, 6);
  const certifiedRecipes = recipeIds.map((recipeId) => {
    const recipe = getCertifiedRecipe(recipeId);
    if (!recipe) throw httpError(400, "recipe_not_certified", "这套菜单还没有通过省力烹饪认证，请继续使用普通做法。");
    return recipe;
  });
  assertRecipesFitEffortTier(certifiedRecipes, effortTier);
  try {
    const result = await store.createMealRun(user.id, {
      householdId,
      dateKey: body.dateKey,
      mealSlot: body.mealSlot,
      effortTier,
      recipeIds,
      idempotencyKey: body.idempotencyKey,
      readyStaple: body.readyStaple,
      syncedFromLocalId: body.syncedFromLocalId,
      timelineVersion: 1,
      recipeSnapshot: certifiedRecipes.map(toMealRecipeSnapshot),
    });
    sendJson(response, result.mealRun.createdAt === result.mealRun.updatedAt ? 201 : 200, {
      mealRun: result.mealRun,
      replacedMealRunId: result.replacedMealRunId || "",
    });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleGetCurrentMealRun(request, response, searchParams) {
  const householdId = stringValue(searchParams.get("householdId"), 100);
  const { user } = await requireMealExecutionContext(request, householdId);
  try {
    const mealRun = await store.getCurrentMealRun(user.id, {
      householdId,
      dateKey: searchParams.get("dateKey"),
      mealSlot: stringValue(searchParams.get("mealSlot"), 24) || "dinner",
    });
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleStartMealRun(request, response, mealRunId) {
  const { auth, user } = await requireMealExecutionUser(request);
  try {
    const current = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(current.householdId);
    const timeline = current.status === "cooking"
      ? current.timeline
      : buildMealTimeline(current.recipeIds, { startedAt: new Date().toISOString() });
    const mealRun = await store.startMealRun(auth.userId, mealRunId, timeline);
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleUpdateMealRunProgress(request, response, mealRunId) {
  const { user } = await requireMealExecutionUser(request);
  const body = await readJson(request);
  try {
    const current = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(current.householdId);
    const mealRun = await store.updateMealRunProgress(user.id, mealRunId, {
      currentStepId: body.currentStepId,
      timerEndsAt: body.timerEndsAt,
    });
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleCompleteMealRun(request, response, mealRunId) {
  const { user } = await requireMealExecutionUser(request);
  try {
    const current = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(current.householdId);
    const mealRun = await store.completeMealRun(user.id, mealRunId);
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleDowngradeMealRun(request, response, mealRunId) {
  const { user } = await requireMealExecutionUser(request);
  const body = await readJson(request);
  try {
    const current = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(current.householdId);
    const downgradedPlan = downgradeMealPlan(current.recipeIds, body.action);
    const certifiedRecipes = downgradedPlan.recipeIds.map((recipeId) => getCertifiedRecipe(recipeId));
    const timeline = current.status === "cooking"
      ? buildMealTimeline(downgradedPlan.recipeIds, { startedAt: new Date().toISOString() })
      : null;
    const mealRun = await store.downgradeMealRun(user.id, mealRunId, {
      action: body.action,
      recipeIds: downgradedPlan.recipeIds,
      readyStaple: downgradedPlan.readyStaple,
      recipeSnapshot: certifiedRecipes.map(toMealRecipeSnapshot),
      timeline,
    });
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleAbandonMealRun(request, response, mealRunId) {
  const { user } = await requireMealExecutionUser(request);
  const body = await readJson(request);
  try {
    const current = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(current.householdId);
    const mealRun = await store.abandonMealRun(user.id, mealRunId, body.reason);
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleMealRunFeedback(request, response, mealRunId) {
  const { user } = await requireMealExecutionUser(request);
  const body = await readJson(request);
  try {
    const current = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(current.householdId);
    const mealRun = await store.updateMealRunFeedback(user.id, mealRunId, body.value);
    sendJson(response, 200, { mealRun });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleCreateMealTask(request, response, mealRunId) {
  const { user } = await requireMealExecutionUser(request);
  const body = await readJson(request);
  try {
    const mealRun = await store.getMealRunForUser(user.id, mealRunId);
    assertMealExecutionEnabled(mealRun.householdId);
    const taskInput = deriveMealTask(mealRun, body);
    const task = await store.createMealTask(user.id, mealRunId, taskInput);
    sendJson(response, 201, { task });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleGetMealTask(request, response, token) {
  const { user } = await requireMealExecutionUser(request);
  try {
    const task = await store.getMealTask(token);
    if (!task) throw httpError(404, "meal_task_not_found", "这个家庭任务已经失效。");
    await store.getMealRunForUser(user.id, task.mealRunId);
    assertMealExecutionEnabled(task.householdId);
    sendJson(response, 200, { task });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleClaimMealTask(request, response, token) {
  const { user } = await requireMealExecutionUser(request);
  try {
    const task = await store.getMealTask(token);
    if (!task) throw httpError(404, "meal_task_not_found", "这个家庭任务已经失效。");
    assertMealExecutionEnabled(task.householdId);
    const claimed = await store.claimMealTask(user.id, token);
    sendJson(response, 200, { task: claimed });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleCompleteMealTask(request, response, token) {
  const { user } = await requireMealExecutionUser(request);
  try {
    const task = await store.getMealTask(token);
    if (!task) throw httpError(404, "meal_task_not_found", "这个家庭任务已经失效。");
    assertMealExecutionEnabled(task.householdId);
    const completed = await store.completeMealTask(user.id, token);
    sendJson(response, 200, { task: completed });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleMealReminderConfig(request, response) {
  const { household } = await requireMealExecutionContext(request);
  sendJson(response, 200, {
    enabled: Boolean(config.mealReminderTemplateId && household),
    templateId: config.mealReminderTemplateId || "",
  });
}

async function handleCreateMealReminder(request, response) {
  const { user, household } = await requireMealExecutionContext(request);
  const body = await readJson(request);
  if (!config.mealReminderTemplateId) throw httpError(503, "reminder_not_configured", "做饭提醒暂未配置。");
  if (body.accepted !== true || stringValue(body.templateId, 120) !== config.mealReminderTemplateId) {
    throw httpError(400, "reminder_consent_required", "只有微信明确授权后才能创建这次提醒。");
  }
  const scheduledAtMs = Date.parse(body.scheduledAt);
  if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now() || scheduledAtMs > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    throw httpError(400, "reminder_time_invalid", "请选择未来 30 天内的做饭时间。");
  }
  try {
    const reminder = await store.createMealReminder(user.id, {
      householdId: household.id,
      scheduledAt: body.scheduledAt,
      dateKey: body.dateKey,
      effortTier: body.effortTier,
      templateId: config.mealReminderTemplateId,
    });
    sendJson(response, 201, { reminder });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleCancelMealReminder(request, response, reminderId) {
  const { user } = await requireMealExecutionUser(request);
  try {
    const reminder = await store.cancelMealReminder(user.id, reminderId);
    if (!reminder) throw httpError(404, "meal_reminder_not_found", "没有找到这次提醒。");
    assertMealExecutionEnabled(reminder.householdId);
    sendJson(response, 200, { reminder });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
}

async function handleProductEvent(request, response) {
  const { user, household } = await requireMealExecutionContext(request);
  const body = await readJson(request);
  try {
    await store.recordProductEvent(user.id, household.id, {
      eventType: body.eventType,
      mealRunId: body.mealRunId,
      recommendationId: body.recommendationId,
      effortTier: body.effortTier,
    });
    sendJson(response, 202, { ok: true });
  } catch (error) {
    throw mapMealExecutionError(error);
  }
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
  const body = (await readJson(request)) ?? {};
  const householdName = stringValue(body.householdName || body.name, 32);
  if (!householdName) throw httpError(400, "household_name_required", "请填写家庭名称。");
  const household = await store.createHouseholdForUser(user.id, {
    householdName,
    memberName: stringValue(body.memberName, 32) || user.displayName,
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
    const household = await store.setActiveHouseholdForUser(user.id, stringValue(body.householdId, 80));
    const state = await store.getState(user.id);
    const households = await store.getHouseholdsForUser(user.id);
    sendJson(response, 200, {
      state,
      family: toHumiFamily(household, user),
      households: toHumiFamilies(households, user),
    });
  } catch (error) {
    if (error.code === "household_not_found") {
      throw httpError(404, "household_not_found", "没有找到这个家，可能还没有加入。");
    }
    throw error;
  }
}

async function handleGetHouseholdCollaborations(request, response, householdId, requestedLimit) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  try {
    const events = await store.getHouseholdCollaborationEvents(user.id, householdId, {
      limit: collaborationHistoryLimit(requestedLimit),
    });
    sendJson(response, 200, {
      householdId,
      events: events.map(toPublicHouseholdCollaborationEvent),
    });
  } catch (error) {
    throw mapHouseholdError(error);
  }
}

async function handleUpdateHousehold(request, response, householdId) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = (await readJson(request)) ?? {};
  try {
    await store.updateHousehold(user.id, householdId, { name: body.name });
    await sendHouseholdMutationResult(response, user);
  } catch (error) {
    throw mapHouseholdError(error);
  }
}

async function handleRemoveHouseholdMember(request, response, householdId, memberId) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  try {
    await store.removeHouseholdMember(user.id, householdId, memberId);
    await sendHouseholdMutationResult(response, user);
  } catch (error) {
    throw mapHouseholdError(error);
  }
}

async function handleTransferHouseholdOwnership(request, response, householdId) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = (await readJson(request)) ?? {};
  try {
    await store.transferHouseholdOwnership(user.id, householdId, stringValue(body.memberId, 80));
    await sendHouseholdMutationResult(response, user);
  } catch (error) {
    throw mapHouseholdError(error);
  }
}

async function handleLeaveHousehold(request, response, householdId) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  try {
    await store.leaveHousehold(user.id, householdId);
    await sendHouseholdMutationResult(response, user, { includeState: true });
  } catch (error) {
    throw mapHouseholdError(error);
  }
}

async function sendHouseholdMutationResult(response, user, { includeState = false } = {}) {
  const household = await store.getHouseholdForUser(user.id);
  const households = await store.getHouseholdsForUser(user.id);
  const payload = {
    family: toHumiFamily(household, user),
    households: toHumiFamilies(households, user),
  };
  if (includeState) payload.state = await store.getState(user.id);
  sendJson(response, 200, payload);
}

function mapHouseholdError(error) {
  const code = error.code === "household_member_not_found" ? "member_not_found" : error.code;
  const status = householdStatus[code];
  return status ? httpError(status, code, error.message) : error;
}

async function requireMealExecutionUser(request) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  return { auth, user };
}

async function requireMealExecutionContext(request, requestedHouseholdId = "") {
  const context = await requireMealExecutionUser(request);
  const households = await store.getHouseholdsForUser(context.user.id);
  const activeHousehold = await store.getHouseholdForUser(context.user.id);
  const household = requestedHouseholdId
    ? households.find((item) => item.id === requestedHouseholdId)
    : activeHousehold;
  if (!household) throw httpError(404, "household_not_found", "请先创建或加入一个家。");
  assertMealExecutionEnabled(household.id);
  return { ...context, household };
}

function mealExecutionCapabilities(household) {
  return {
    mealExecution: household
      ? isMealExecutionEnabledFor(household.id)
      : isGuestMealExecutionEnabled(),
  };
}

function isMealExecutionEnabledFor(householdId) {
  if (!config.mealExecutionEnabled || !householdId) return false;
  return config.mealExecutionHouseholds.has("*") || config.mealExecutionHouseholds.has(householdId);
}

function isGuestMealExecutionEnabled() {
  return config.mealExecutionEnabled
    && (config.mealExecutionHouseholds.has("guest") || config.mealExecutionHouseholds.has("*"));
}

function isNativeShellEnabledFor(householdId) {
  if (!config.nativeShellEnabled) return false;
  if (!householdId) {
    const explicitGuestCohort = config.nativeShellHouseholds.has("guest")
      && config.mealExecutionHouseholds.has("guest");
    const testWildcardCohort = config.nativeShellWildcardAllowed
      && config.nativeShellHouseholds.has("*")
      && config.mealExecutionHouseholds.has("*");
    return config.mealExecutionEnabled && (explicitGuestCohort || testWildcardCohort);
  }
  return (config.nativeShellWildcardAllowed && config.nativeShellHouseholds.has("*"))
    || config.nativeShellHouseholds.has(householdId);
}

function currentDinnerDateKey(now = new Date()) {
  return formatBusinessDateKey(now, "Asia/Shanghai");
}

function assertMealExecutionEnabled(householdId) {
  if (!isMealExecutionEnabledFor(householdId)) {
    throw httpError(403, "meal_execution_disabled", "这个家暂未进入省力做饭体验。");
  }
}

function assertRecipesFitEffortTier(recipes, effortTier) {
  const rank = { quick_15: 0, easy_30: 1, normal: 2 };
  if (!(effortTier in rank)) throw httpError(400, "effort_tier_invalid", "请选择今天的行动力。");
  if (recipes.length === 0) throw httpError(400, "meal_recipes_required", "请先选择今晚要做的菜。");
  if (recipes.some((recipe) => rank[recipe.cookAssist.effortTier] > rank[effortTier])) {
    throw httpError(400, "effort_tier_mismatch", "这套菜超过了当前行动力档位，请换一套更省力的方案。");
  }
}

function toMealRecipeSnapshot(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: stringValue(ingredient.name, 40),
      amount: ingredient.amount,
      unit: stringValue(ingredient.unit, 16),
      required: ingredient.required !== false,
    })),
    cookAssist: structuredClone(recipe.cookAssist),
  };
}

function deriveMealTask(mealRun, body = {}) {
  if (body.type === "buy") {
    const ingredientName = stringValue(body.ingredientName, 40);
    const ingredients = mealRun.recipeSnapshot.flatMap((recipe) => recipe.ingredients ?? []);
    if (!ingredientName || !ingredients.some((ingredient) => ingredient.name === ingredientName)) {
      throw httpError(400, "meal_task_invalid", "请选择这顿饭真实缺少的食材。");
    }
    return { type: "buy", label: `请家人买${ingredientName}` };
  }
  if (body.type === "prep") {
    const stepId = stringValue(body.stepId, 160);
    const step = mealRun.recipeSnapshot
      .flatMap((recipe) => recipe.cookAssist?.steps ?? [])
      .find((candidate) => candidate.id === stepId && candidate.phase === "prep");
    if (!step) throw httpError(400, "meal_task_invalid", "请选择这顿饭里的备菜步骤。");
    return { type: "prep", label: `帮忙${String(step.text).replace(/[。！!]$/, "")}`.slice(0, 64) };
  }
  throw httpError(400, "meal_task_invalid", "只支持买食材或帮忙备菜任务。");
}

function mapMealExecutionError(error) {
  if (error?.status) return error;
  const statusByCode = {
    forbidden: 403,
    household_not_found: 404,
    meal_run_not_found: 404,
    meal_task_not_found: 404,
    meal_run_locked: 409,
    meal_run_transition_invalid: 409,
    meal_task_claimed: 409,
    meal_task_forbidden: 403,
    meal_task_unavailable: 409,
    meal_step_invalid: 400,
    meal_task_invalid: 400,
    meal_feedback_invalid: 400,
    abandon_reason_invalid: 400,
    invalid_downgrade_action: 400,
    product_event_invalid: 400,
    recommendation_state_conflict: 409,
    recommendation_candidates_exhausted: 409,
    recommendation_mode_invalid: 400,
    recommendation_action_invalid: 400,
    context_fingerprint_invalid: 400,
    idempotency_key_required: 400,
    date_key_invalid: 400,
    effort_tier_invalid: 400,
    meal_slot_invalid: 400,
    meal_recipes_required: 400,
    timer_end_invalid: 400,
    reminder_time_invalid: 400,
  };
  const status = statusByCode[error?.code];
  return status ? httpError(status, error.code, error.message) : error;
}

export async function processDueMealReminders({ now = new Date().toISOString() } = {}) {
  if (!config.mealExecutionEnabled || !config.mealReminderTemplateId) return [];
  const reminders = await store.getDueMealReminders(now);
  const results = [];
  for (const reminder of reminders) {
    if (!isMealExecutionEnabledFor(reminder.householdId) || await store.shouldCancelMealReminder(reminder)) {
      const cancelled = await store.markMealReminderCancelled(reminder.id);
      results.push(cancelled);
      continue;
    }
    try {
      const openid = await store.getWechatOpenIdForUser(reminder.userId);
      if (!openid) throw new Error("wechat_openid_missing");
      await sendWechatSubscribeMessage({
        openid,
        appId: config.wechatAppId,
        appSecret: config.wechatAppSecret,
        mock: config.wechatMock,
        templateId: config.mealReminderTemplateId,
        page: `pages/index/index?view=dashboard&mealReminder=${encodeURIComponent(reminder.id)}&effortTier=${encodeURIComponent(reminder.effortTier)}`,
        data: {
          [config.mealReminderThingKey]: { value: reminder.effortTier === "quick_15" ? "今晚 15 分钟方案已准备好" : "今晚的省力方案已准备好" },
          [config.mealReminderTimeKey]: { value: formatWechatReminderTime(reminder.scheduledAt) },
        },
      });
      results.push(await store.markMealReminderSent(reminder.id, now));
    } catch (error) {
      results.push(await store.markMealReminderFailure(reminder.id, error.code || error.message, now));
    }
  }
  return results;
}

function formatWechatReminderTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replaceAll("/", "-");
}

async function handleCreateHouseholdInvite(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const invite = await store.createHouseholdInvite(user.id, {
      householdId: stringValue(body.householdId, 80),
      inviterName: stringValue(body.inviterName, 32) || user.displayName,
    });
    sendJson(response, 201, { invite: toPublicHouseholdInvite(invite) });
  } catch (error) {
    if (error.code === "household_not_found") {
      throw httpError(404, "household_not_found", "没有找到这个家，暂时不能邀请家人。");
    }
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有主厨能邀请家人加入这个家。");
    }
    throw error;
  }
}

async function handleGetHouseholdInvite(response, token) {
  const invite = await store.getHouseholdInvite(token);
  if (!invite) throw httpError(404, "household_invite_not_found", "这个家庭邀请已经失效。");
  sendJson(response, 200, { invite: toPublicHouseholdInvite(invite) });
}

async function handleAddHouseholdInviteWant(request, response, token) {
  const body = await readJson(request);
  try {
    const result = await store.addHouseholdInviteWant(token, {
      participantKey: stringValue(body.participantKey, 80),
      memberName: stringValue(body.memberName, 32),
      title: stringValue(body.title, 40),
    });
    if (!result) throw httpError(404, "household_invite_not_found", "这个家庭邀请已经失效。");
    sendJson(response, 201, {
      invite: toPublicHouseholdInvite(result.invite),
      want: toPublicWantToEatItem(result.want),
    });
  } catch (error) {
    if (error.code === "invite_closed") {
      throw httpError(410, "invite_closed", "这个家庭邀请已经关闭。");
    }
    if (error.code === "missing_participant_key" || error.code === "missing_want_title") {
      throw httpError(400, error.code, "请写下想吃的菜，再告诉主厨。");
    }
    throw error;
  }
}

async function handleJoinHouseholdInvite(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const result = await store.acceptHouseholdInvite(token, user.id, {
      memberName: stringValue(body.memberName, 32) || user.displayName,
      participantKey: stringValue(body.participantKey, 80),
    });
    if (!result) throw httpError(404, "household_invite_not_found", "这个家庭邀请已经失效。");
    const state = await store.getState(user.id);
    const households = await store.getHouseholdsForUser(user.id);
    sendJson(response, 200, {
      invite: toPublicHouseholdInvite(result.invite),
      state,
      family: toHumiFamily(result.household, user),
      households: toHumiFamilies(households, user),
    });
  } catch (error) {
    if (error.code === "invite_closed") {
      throw httpError(410, "invite_closed", "这个家庭邀请已经关闭。");
    }
    throw error;
  }
}

async function handleRecommend(request, response) {
  const body = await readJson(request);
  if (body.mode !== "precise") {
    sendJson(response, 200, buildBasicRecommendation(body));
    return;
  }
  const auth = await requireAuth(request);
  enforceAiAccess(request);
  const accessStatus = await store.getPreciseRecommendationAccess(auth.userId);
  if (!accessStatus.canUse) {
    throw httpError(402, "precise_trial_exhausted", "精准推荐尝鲜已用完，基础推荐仍可无限使用。");
  }
  if (!config.deepseekApiKey) throw httpError(503, "deepseek_not_configured", "DEEPSEEK_API_KEY 未配置。");
  const result = await generateMealRecommendation(body, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel,
    baseUrl: config.deepseekBaseUrl,
  });
  const recommendationAccess = await store.consumePreciseRecommendationAccess(auth.userId);
  sendJson(response, 200, { ...result, recommendationAccess });
}

function buildBasicRecommendation(payload = {}) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (candidates.length === 0) {
    throw httpError(400, "missing_candidates", "缺少可推荐的菜谱。");
  }
  const candidateIds = new Set(candidates.map((candidate) => stringValue(candidate.id)).filter(Boolean));
  const fallbackIds = Array.isArray(payload.ruleFallback?.recipeIds)
    ? payload.ruleFallback.recipeIds.map((id) => stringValue(id)).filter((id) => candidateIds.has(id))
    : [];
  const recipeIds = [...new Set(fallbackIds.length > 0 ? fallbackIds : [...candidateIds])].slice(0, 2);
  return {
    recipeIds,
    reason: stringValue(payload.ruleFallback?.reason) || "先照着你家的口味、现有食材和时间安排了一组。",
    explanation: {
      pantry: "基础版已参考家里现有信号。",
      preference: "基础版已参考家庭偏好标签。",
      grocery: "基础版会尽量控制主要采购缺口。",
    },
    source: "rule",
  };
}

async function handleExplain(request, response) {
  const auth = await requireAuth(request);
  enforceAiAccess(request);
  const accessStatus = await store.getPreciseRecommendationAccess(auth.userId);
  if (!accessStatus.canUse) {
    throw httpError(402, "precise_trial_exhausted", "精准解释尝鲜已用完，基础推荐说明仍可直接查看。");
  }
  if (!config.deepseekApiKey) throw httpError(503, "deepseek_not_configured", "DEEPSEEK_API_KEY 未配置。");
  const body = await readJson(request);
  const result = await generateRecommendationExplanation(body, {
    apiKey: config.deepseekApiKey,
    model: config.deepseekModel,
    baseUrl: config.deepseekBaseUrl,
  });
  const recommendationAccess = await store.consumePreciseRecommendationAccess(auth.userId);
  sendJson(response, 200, { ...result, recommendationAccess });
}

async function handleCreateCraveRequest(request, response) {
  const auth = await requireAuth(request);
  const body = await readJson(request);
  try {
    const craveRequest = await store.createCraveRequest(body, auth.userId);
    sendJson(response, 201, { request: toOwnerCraveRequest(craveRequest), ownerSecret: craveRequest.ownerSecret });
  } catch (error) {
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有主厨能发起这个家的征集。");
    }
    throw error;
  }
}

async function handleCreateGroceryShare(request, response) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const share = await store.createGroceryShare(user.id, {
      householdName: stringValue(body.householdName, 32),
      initiatorName: stringValue(body.initiatorName, 32) || user.displayName,
      items: sanitizeGroceryShareItems(body.items),
    });
    sendJson(response, 201, { share: toPublicGroceryShare(share) });
  } catch (error) {
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有主厨能分享这个家的买菜清单。");
    }
    throw error;
  }
}

async function handleGetGroceryShare(response, token) {
  const share = await store.getGroceryShare(token);
  if (!share) throw httpError(404, "grocery_share_not_found", "这个买菜清单已经失效。");
  sendJson(response, 200, { share: toPublicGroceryShare(share) });
}

async function handleClaimGroceryShare(request, response, token) {
  const auth = await optionalAuth(request);
  const user = auth?.userId ? await store.getUser(auth.userId) : null;
  const body = await readJson(request);
  try {
    const share = await store.claimGroceryShareItem(token, {
      itemKey: stringValue(body.itemKey, 160),
      participantKey: stringValue(body.participantKey, 80),
      memberId: user?.id || "",
      memberName: stringValue(body.memberName, 32) || user?.displayName || "家人",
      status: stringValue(body.status, 16),
    });
    if (!share) throw httpError(404, "grocery_share_not_found", "这个买菜清单已经失效。");
    sendJson(response, 200, { share: toPublicGroceryShare(share) });
  } catch (error) {
    if (error.code === "grocery_item_not_found") {
      throw httpError(404, "grocery_item_not_found", "清单里没有这项食材。");
    }
    if (error.code === "grocery_item_claimed") {
      throw httpError(409, "grocery_item_claimed", `${error.claim?.memberName || "家人"}已经在买这项食材。`);
    }
    if (error.code === "grocery_item_done") {
      throw httpError(409, "grocery_item_done", `${error.claim?.memberName || "家人"}已经买到这项食材。`);
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
    sendJson(response, 201, {
      request: toOwnerGroceryShareRequest(groceryRequest),
      ownerSecret: groceryRequest.ownerSecret,
    });
  } catch (error) {
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有主厨能分享这个家的买菜清单。");
    }
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
  const participant = await resolveCollaborationParticipant(request, body);
  const groceryRequest = await store.addGroceryShareClaim(token, body, participant);
  if (!groceryRequest) throw httpError(404, "grocery_share_not_found", "这个清单链接已经失效。");
  sendJson(response, 200, {
    request: toPublicGroceryShareRequest(groceryRequest),
    participant: toPublicCollaborationParticipant(participant, groceryRequest.claims, "participantKey"),
  });
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
    const result = await store.claimGroceryShareParticipant(token, user.id, {
      guestParticipantId: collaborationMergeGuestParticipantId(body),
    });
    if (!result) throw httpError(404, "grocery_share_not_found", "这个清单链接已经失效。");
    sendJson(response, 200, {
      request: toPublicGroceryShareRequest(result.request),
      participant: toPublicCollaborationParticipant({
        type: "user",
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatarUrl || user.avatarKey || "",
      }),
    });
  } catch (error) {
    if (error.code === "missing_participant_key") {
      throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能绑定这次参与。");
    }
    if (error.code === "claim_not_found") {
      throw httpError(404, "claim_not_found", "没有找到你刚才的买菜参与记录。");
    }
    if (error.code === "collaboration_participant_not_found") {
      throw httpError(404, "collaboration_participant_not_found", "没有找到这次游客参与记录。");
    }
    if (error.code === "collaboration_already_claimed") {
      throw httpError(409, "collaboration_already_claimed", "这次游客参与已经绑定到另一个 Humi 身份。");
    }
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
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有主厨能分享这个家的今晚菜单。");
    }
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
    sendJson(response, 201, {
      request: toOwnerWishShareRequest(wishRequest),
      ownerSecret: wishRequest.ownerSecret,
    });
  } catch (error) {
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有主厨能分享这个家的想吃入口。");
    }
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
  const participant = await resolveCollaborationParticipant(request, body);
  const wishRequest = await store.addWishShareEntry(token, body, participant);
  if (!wishRequest) throw httpError(404, "wish_share_not_found", "这个想吃入口已经失效。");
  sendJson(response, 200, {
    request: toPublicWishShareRequest(wishRequest),
    participant: toPublicCollaborationParticipant(participant, wishRequest.wishes, "participantKey"),
  });
}

async function handleJoinWishShare(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const result = await store.claimWishShareParticipant(token, user.id, {
      guestParticipantId: collaborationMergeGuestParticipantId(body),
    });
    if (!result) throw httpError(404, "wish_share_not_found", "这个想吃入口已经失效。");
    sendJson(response, 200, {
      request: toPublicWishShareRequest(result.request),
      participant: toPublicCollaborationParticipant({
        type: "user",
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatarUrl || user.avatarKey || "",
      }),
    });
  } catch (error) {
    if (error.code === "missing_participant_key") {
      throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能绑定这次参与。");
    }
    if (error.code === "wish_not_found") {
      throw httpError(404, "wish_not_found", "没有找到你刚才的想吃记录。");
    }
    if (error.code === "collaboration_participant_not_found") {
      throw httpError(404, "collaboration_participant_not_found", "没有找到这次游客参与记录。");
    }
    if (error.code === "collaboration_already_claimed") {
      throw httpError(409, "collaboration_already_claimed", "这次游客参与已经绑定到另一个 Humi 身份。");
    }
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

async function handleGetCraveRequest(response, token) {
  const craveRequest = await store.getCraveRequest(token);
  if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
  sendJson(response, 200, { request: toPublicCraveRequest(craveRequest) });
}

async function handleCraveVote(request, response, token) {
  const body = await readJson(request);
  const participant = await resolveCollaborationParticipant(request, body);
  const craveRequest = await store.addCraveVote(token, body, participant);
  if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
  sendJson(response, 200, {
    request: toPublicCraveRequest(craveRequest),
    participant: toPublicCollaborationParticipant(participant, craveRequest.votes, "participantKey"),
  });
}

async function handleJoinCraveRequest(request, response, token) {
  const auth = await requireAuth(request);
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  const body = await readJson(request);
  try {
    const craveRequest = await store.claimCraveVote(token, user.id, {
      guestParticipantId: collaborationMergeGuestParticipantId(body),
    });
    if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
    sendJson(response, 200, {
      request: toPublicCraveRequest(craveRequest.request),
      participant: toPublicCollaborationParticipant({
        type: "user",
        id: user.id,
        displayName: user.displayName,
        avatar: user.avatarUrl || user.avatarKey || "",
      }),
    });
  } catch (error) {
    if (error.code === "missing_participant_key") {
      throw httpError(400, "missing_participant_key", "缺少临时参与身份，暂时不能绑定这次参与。");
    }
    if (error.code === "vote_not_found") {
      throw httpError(404, "vote_not_found", "没有找到你刚才的投票，可以直接回 Humi 查看。");
    }
    if (error.code === "collaboration_participant_not_found") {
      throw httpError(404, "collaboration_participant_not_found", "没有找到这次游客参与记录。");
    }
    if (error.code === "collaboration_already_claimed") {
      throw httpError(409, "collaboration_already_claimed", "这次游客参与已经绑定到另一个 Humi 身份。");
    }
    throw error;
  }
}

async function handleCloseCraveRequest(request, response, token) {
  const body = await readJson(request);
  const auth = await optionalAuth(request);
  try {
    const craveRequest = await store.closeCraveRequest(token, body.ownerSecret, body.resultSummary, auth?.userId);
    if (!craveRequest) throw httpError(404, "crave_request_not_found", "这个征集链接已经失效。");
    sendJson(response, 200, { request: toPublicCraveRequest(craveRequest) });
  } catch (error) {
    if (error.code === "forbidden") {
      throw httpError(403, "forbidden", "只有发起者能结束这次征集。");
    }
    throw error;
  }
}

async function handleCreatePosterShare(request, response) {
  const auth = await requireAuth(request);
  enforcePosterUploadAccess(request, auth.userId);
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > config.posterMaxBytes) {
    throw httpError(413, "poster_too_large", "海报图片太大，请重新生成后再试。");
  }

  const body = await readBinary(request, config.posterMaxBytes);
  const format = detectPosterFormat(body, request.headers["content-type"]);
  if (!format) {
    throw httpError(415, "invalid_poster_image", "只支持 Humi 生成的 JPG 或 PNG 海报。");
  }

  await mkdir(config.posterDir, { recursive: true, mode: 0o700 });
  await cleanupExpiredPosters();
  const token = randomBytes(24).toString("base64url");
  const filename = `${token}.${format}`;
  await writeFile(join(config.posterDir, filename), body, { mode: 0o600, flag: "wx" });
  const expiresAt = new Date(Date.now() + config.posterTtlMs).toISOString();
  sendJson(response, 201, {
    poster: {
      token,
      format,
      url: `${config.posterPublicBaseUrl}/poster-shares/${token}.${format}`,
      expiresAt,
      bytes: body.length,
    },
  });
}

async function handleGetPosterShare(request, response, token, format) {
  const path = join(config.posterDir, `${token}.${format}`);
  let fileInfo;
  try {
    fileInfo = await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") throw httpError(404, "poster_not_found", "这张海报已经失效，请回到 Humi 重新生成。");
    throw error;
  }
  if (Date.now() - fileInfo.mtimeMs > config.posterTtlMs) {
    await unlink(path).catch(() => {});
    throw httpError(410, "poster_expired", "这张海报已经过期，请回到 Humi 重新生成。");
  }

  response.writeHead(200, {
    "Content-Type": format === "png" ? "image/png" : "image/jpeg",
    "Content-Length": fileInfo.size,
    "Cache-Control": "public, max-age=3600, immutable",
    "Content-Disposition": `inline; filename="humi-poster.${format}"`,
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(await readFile(path));
}

const posterRateBuckets = new Map();

function enforcePosterUploadAccess(request, userId) {
  const key = `${userId}:${getClientIp(request)}`;
  const now = Date.now();
  if (posterRateBuckets.size > 1000) {
    for (const [bucketKey, candidate] of posterRateBuckets) {
      if (now >= candidate.resetAt) posterRateBuckets.delete(bucketKey);
    }
  }
  const bucket = posterRateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    posterRateBuckets.set(key, { count: 1, resetAt: now + config.posterRateWindowMs });
    return;
  }
  if (bucket.count >= config.posterRateLimit) {
    throw httpError(429, "poster_rate_limited", "海报生成得有点快，请稍后再试。");
  }
  bucket.count += 1;
}

async function cleanupExpiredPosters() {
  const entries = await readdir(config.posterDir, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !/^[A-Za-z0-9_-]{24,64}\.(jpg|png)$/.test(entry.name)) return;
    const path = join(config.posterDir, entry.name);
    const fileInfo = await stat(path).catch(() => null);
    if (fileInfo && now - fileInfo.mtimeMs > config.posterTtlMs) {
      await unlink(path).catch(() => {});
    }
  }));
}

function detectPosterFormat(body, contentType = "") {
  const normalizedType = String(contentType).split(";")[0].trim().toLowerCase();
  const isPng = body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (isPng && normalizedType === "image/png") return "png";
  if (isJpeg && ["image/jpeg", "image/jpg"].includes(normalizedType)) return "jpg";
  return "";
}

// 精准推荐仍按客户端 IP 限流，避免登录态被滥用刷 DeepSeek 额度。
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
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    recipientCount: (request.recipientIds ?? []).length,
    mealType: request.mealType,
    initialFeelingTag: request.initialFeelingTag || "随便都行",
    status: request.status,
    deadlineAt: request.deadlineAt,
    resultSummary: request.resultSummary ? {
      dishes: (request.resultSummary.dishes ?? []).map((dish) => ({
        name: dish.name,
        timeMinutes: dish.timeMinutes,
      })),
      reason: request.resultSummary.reason,
      generatedAt: request.resultSummary.generatedAt,
    } : undefined,
    votes: (request.votes ?? []).map((vote) => ({
      id: vote.id,
      memberName: vote.memberName,
      feelingTag: vote.feelingTag,
      dishWish: vote.dishWish,
      note: vote.note,
      temporary: vote.temporary,
      createdAt: vote.createdAt,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toOwnerCraveRequest(request) {
  return {
    ...toPublicCraveRequest(request),
    id: request.id,
    token: request.token,
    householdId: request.householdId,
  };
}

function toPublicGroceryShare(share) {
  return {
    id: share.id,
    token: share.token,
    householdId: share.householdId,
    householdName: share.householdName,
    initiatorName: share.initiatorName,
    status: share.status,
    items: (share.items ?? []).map((item) => ({
      key: item.key,
      name: item.name,
      amount: item.amount,
      type: item.type,
      source: item.source,
    })),
    claims: share.claims ?? {},
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
  };
}

function toPublicGroceryShareRequest(request) {
  return {
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
      memberName: claim.memberName,
      status: claim.status,
      itemIds: Array.isArray(claim.itemIds) ? claim.itemIds : [],
      note: claim.note,
      temporary: claim.temporary,
      createdAt: claim.createdAt,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toOwnerGroceryShareRequest(request) {
  return {
    ...toPublicGroceryShareRequest(request),
    id: request.id,
    token: request.token,
    householdId: request.householdId || "",
    ownerId: request.ownerId || "",
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
    householdName: request.householdName,
    initiatorName: request.initiatorName,
    title: request.title,
    status: request.status,
    wishes: (request.wishes ?? []).map((wish) => ({
      id: wish.id,
      memberName: wish.memberName,
      dishName: wish.dishName,
      note: wish.note,
      temporary: wish.temporary,
      createdAt: wish.createdAt,
    })),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function toOwnerWishShareRequest(request) {
  return {
    ...toPublicWishShareRequest(request),
    id: request.id,
    token: request.token,
    householdId: request.householdId || "",
    ownerId: request.ownerId || "",
  };
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

function toPublicWantToEatItem(item) {
  return {
    id: item.id,
    title: item.title,
    memberName: item.memberName,
    status: item.status,
    temporary: Boolean(item.temporary),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
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

async function optionalAuth(request) {
  if (!request.headers.authorization) return null;
  return requireAuth(request);
}

async function resolveCollaborationParticipant(request, body = {}) {
  const auth = await optionalAuth(request);
  if (!auth) {
    return {
      type: "guest",
      id: stringValue(body.guestParticipantId, 100) || randomUUID(),
      displayName: "",
      avatar: "",
    };
  }
  const user = await store.getUser(auth.userId);
  if (!user) throw httpError(401, "invalid_session", "Session user not found.");
  return {
    type: "user",
    id: user.id,
    displayName: user.displayName || "Humi 用户",
    avatar: user.avatarUrl || user.avatarKey || "",
  };
}

function collaborationMergeGuestParticipantId(body = {}) {
  return stringValue(body.guestParticipantId, 100) || stringValue(body.participantKey, 80);
}

function toPublicCollaborationParticipant(participant, actions = [], participantKey = "participantKey") {
  const action = actions.find((item) => item?.[participantKey] === participant.id);
  return {
    type: participant.type,
    id: participant.id,
    displayName: action?.memberName || participant.displayName || "游客",
    avatar: participant.avatar || "",
    ...(participant.type === "guest" ? { actionId: action?.id || "" } : {}),
  };
}

function collaborationHistoryLimit(value) {
  if (value === null || value === "") return 50;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}

function toPublicHouseholdCollaborationEvent(event = {}) {
  return {
    id: stringValue(event.id, 100),
    requestType: stringValue(event.requestType, 24),
    actionType: stringValue(event.actionType, 40),
    createdAt: stringValue(event.createdAt, 48),
    participant: {
      displayName: stringValue(event.displayNameSnapshot, 32) || "Humi 用户",
      avatarUrl: publicAvatarUrl(event.avatarSnapshot),
    },
    payload: toPublicHouseholdCollaborationPayload(event.actionType, event.payload),
  };
}

function toPublicHouseholdCollaborationPayload(actionType, payload = {}) {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  if (actionType === "crave_vote") {
    return copyDefinedPublicCollaborationPayload({
      feelingTag: stringValue(value.feelingTag, 32),
      dishWish: stringValue(value.dishWish, 80),
      note: stringValue(value.note, 80),
    });
  }
  if (actionType === "grocery_claim") {
    return copyDefinedPublicCollaborationPayload({
      status: value.status === "declined" ? "declined" : "claimed",
      itemIds: [...new Set((Array.isArray(value.itemIds) ? value.itemIds : [])
        .map((itemId) => stringValue(itemId, 80))
        .filter(Boolean))].slice(0, 120),
      note: stringValue(value.note, 80),
    });
  }
  return copyDefinedPublicCollaborationPayload({
    dishName: stringValue(value.dishName, 40),
    note: stringValue(value.note, 80),
  });
}

function copyDefinedPublicCollaborationPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => (
    Array.isArray(value) ? value.length > 0 : value !== ""
  )));
}

function publicAvatarUrl(value) {
  const avatarUrl = stringValue(value, 240);
  return /^(?:https?:\/\/|data:image\/)/i.test(avatarUrl) ? avatarUrl : "";
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
    provider: "wechat",
    profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
    avatarKey: user.avatarKey || "humi-avatar-family-m-01",
    avatarUrl: user.avatarUrl || "",
    phoneVerified: Boolean(user.phoneVerifiedAt),
    phoneMasked: user.phoneMasked || "",
    phoneVerifiedAt: user.phoneVerifiedAt || null,
  };
}

function toHumiFamily(household, user) {
  if (!household) return null;
  const member = household?.members?.find((item) => item.memberId === user.id);
  return {
    id: household.id,
    name: household.name,
    ownerId: household.ownerId,
    currentMemberId: member?.memberId || user.id,
    role: member?.role || "member",
    provider: "wechat",
    members: (household?.members ?? []).map((item) => ({
      memberId: item.memberId,
      nickname: item.nickname,
      avatarKey: item.avatarKey || "humi-avatar-family-m-01",
      avatarUrl: item.avatarUrl || "",
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt,
    })),
  };
}

function toHumiFamilies(households = [], user) {
  return households.map((household) => toHumiFamily(household, user));
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
    groceryClaims: sanitizeGroceryClaims(state.groceryClaims),
    customItems: sanitizeList(state.customItems, sanitizeGroceryLikeItem, 200),
    excludedGroceryKeys: stringList(state.excludedGroceryKeys).slice(0, 400),
    pantryItems: sanitizeList(state.pantryItems, sanitizePantryItem, 300),
    familyProfile: sanitizeProfile(state.familyProfile),
    familyMembers: sanitizeList(state.familyMembers, sanitizeFamilyMemberPreference, 50),
    wantToEatItems: sanitizeList(state.wantToEatItems, sanitizeWantToEatItem, 200),
    nutritionGoals: sanitizeObjectMap(state.nutritionGoals, 32),
    recommendationAccess: sanitizeRecommendationAccess(state.recommendationAccess),
    recommendationFeedback: sanitizeList(state.recommendationFeedback, sanitizeFeedbackItem, 50),
    craveSignals: sanitizeList(state.craveSignals, sanitizeCraveSignal, 50),
    activeCraveRequest: sanitizeCollaborationState(state.activeCraveRequest),
    activeGroceryShareRequest: sanitizeCollaborationState(state.activeGroceryShareRequest),
    activeWishShareRequest: sanitizeCollaborationState(state.activeWishShareRequest),
    householdMembers: sanitizeList(state.householdMembers, sanitizeHouseholdMemberState, 50),
  };
}

function sanitizeFamilyMemberPreference(member = {}) {
  const memberId = stringValue(member.memberId, 100);
  if (!memberId) return null;
  return {
    memberId,
    preference: {
      allergies: normalizedPreferenceList(member.preference?.allergies),
      dislikes: normalizedPreferenceList(member.preference?.dislikes),
    },
  };
}

function normalizedPreferenceList(value) {
  return [...new Set(stringList(value).map((item) => item.slice(0, 40)))];
}

function sanitizeHouseholdMemberState(member = {}) {
  return {
    id: stringValue(member.id, 180),
    memberId: stringValue(member.memberId, 180),
    name: stringValue(member.name, 32),
    role: member.role === "owner" ? "owner" : "member",
    status: member.status === "pending" ? "pending" : "active",
    joinedAt: stringValue(member.joinedAt, 40),
  };
}

function sanitizeCollaborationState(value) {
  if (!value || typeof value !== "object") return null;
  const sanitized = sanitizeObjectMap(value, 48);
  delete sanitized.ownerSecret;
  delete sanitized.secret;
  return sanitized;
}

function sanitizeCraveSignal(signal = {}) {
  const token = stringValue(signal.token || signal.requestToken, 180);
  if (!token) return null;
  return {
    id: stringValue(signal.id, 180),
    token,
    requestToken: token,
    householdName: stringValue(signal.householdName, 32),
    initiatorName: stringValue(signal.initiatorName, 32),
    feelingTag: stringValue(signal.feelingTag, 32),
    mealType: stringValue(signal.mealType, 24) || "dinner",
    status: signal.status === "closed" ? "closed" : "open",
    deadlineAt: stringValue(signal.deadlineAt, 40),
    recipientCount: Math.max(0, Math.min(20, Number.parseInt(signal.recipientCount, 10) || 0)),
    votes: sanitizeList(signal.votes, (vote) => ({
      id: stringValue(vote?.id, 180),
      memberId: stringValue(vote?.memberId, 180),
      memberName: stringValue(vote?.memberName, 32) || "家人",
      feelingTag: stringValue(vote?.feelingTag, 32),
      dishWish: stringValue(vote?.dishWish, 80),
      note: stringValue(vote?.note, 120),
      temporary: Boolean(vote?.temporary),
      claimedAt: stringValue(vote?.claimedAt, 40),
      createdAt: stringValue(vote?.createdAt, 40),
    }), 50),
    resultSummary: signal.resultSummary ? sanitizeObjectMap(signal.resultSummary, 20) : undefined,
    createdAt: stringValue(signal.createdAt, 40),
    updatedAt: stringValue(signal.updatedAt, 40),
    generatedAt: stringValue(signal.generatedAt, 40),
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
      Array.isArray(value?.[day]) ? value[day].map((item) => stringValue(item)).filter(Boolean).slice(0, 20) : [],
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
        Array.isArray(recipeIds) ? recipeIds.map((item) => stringValue(item)).filter(Boolean).slice(0, 20) : [],
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

function sanitizeGroceryShareItems(items = []) {
  return sanitizeList(items, (item) => ({
    key: stringValue(item?.key, 160),
    name: stringValue(item?.name, 80),
    amount: stringValue(item?.amount, 80),
    type: stringValue(item?.type || "ingredient", 40),
    source: stringValue(item?.source, 80),
  }), 120).filter((item) => item.key && item.name);
}

function sanitizeGroceryClaims(value = {}) {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .slice(0, 400)
      .map(([key, claim]) => {
        const itemKey = stringValue(key, 180);
        const memberId = stringValue(claim?.memberId);
        const itemName = stringValue(claim?.itemName, 80);
        if (!itemKey || !memberId || !itemName) return null;
        return [
          itemKey,
          {
            itemKey,
            itemName,
            memberId,
            memberName: stringValue(claim?.memberName) || "家人",
            status: claim?.status === "done" ? "done" : "claimed",
            claimedAt: stringValue(claim?.claimedAt),
            completedAt: stringValue(claim?.completedAt),
          },
        ];
      })
      .filter(Boolean),
  );
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

function sanitizeWantToEatItem(item = {}) {
  const title = stringValue(item.title);
  if (!title) return null;
  return {
    id: stringValue(item.id) || `want:${Date.now()}`,
    title,
    recipeId: stringValue(item.recipeId),
    note: stringValue(item.note),
    memberId: stringValue(item.memberId),
    memberName: stringValue(item.memberName) || "家人",
    status: item.status === "done" ? "done" : "open",
    temporary: Boolean(item.temporary),
    source: stringValue(item.source, 40),
    createdAt: stringValue(item.createdAt),
    updatedAt: stringValue(item.updatedAt),
    completedAt: stringValue(item.completedAt),
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

function sanitizeRecommendationAccess(access = {}) {
  return {
    plan: access.plan === "plus" ? "plus" : "free",
    preciseTrialRemaining: Math.max(0, Math.min(20, Number.parseInt(access.preciseTrialRemaining, 10) || 0)),
    preciseUsed: Math.max(0, Number.parseInt(access.preciseUsed, 10) || 0),
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
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, 24) : [];
}

function stringValue(value, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createPhoneHash(countryCode, phoneNumber) {
  return createHmac("sha256", config.sessionSecret).update(`${countryCode}:${phoneNumber}`).digest("hex");
}

async function readJson(request, maxBytes = Number.POSITIVE_INFINITY) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw httpError(413, "request_too_large", "提交内容太大。");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "invalid_json", "Request body must be JSON.");
  }
}

async function readBinary(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw httpError(413, "poster_too_large", "海报图片太大，请重新生成后再试。");
    }
    chunks.push(chunk);
  }
  if (bytes === 0) throw httpError(400, "missing_poster_image", "没有收到海报图片，请重新生成后再试。");
  return Buffer.concat(chunks);
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
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
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

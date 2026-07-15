import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const DEFAULT_DATA = {
  users: [],
  identities: [],
  households: [],
  activeHouseholds: {},
  profiles: {},
  states: {},
  householdStates: {},
  aiUsage: {},
  aiRecommendationCache: [],
  craveRequests: [],
  householdInvites: [],
  groceryShareRequests: [],
  menuShareRequests: [],
  wishShareRequests: [],
  revokedTokens: [],
};

export class HumiStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.data = structuredClone(DEFAULT_DATA);
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.data = { ...structuredClone(DEFAULT_DATA), ...JSON.parse(raw) };
    } catch {
      this.data = structuredClone(DEFAULT_DATA);
    }
    this.loaded = true;
  }

  async save() {
    // 串行化写入：并发请求各自 mutate 后调用 save，依次落盘，避免互相覆盖/交错。
    const run = () => this.flushToDisk();
    this.saveQueue = (this.saveQueue ?? Promise.resolve()).then(run, run);
    return this.saveQueue;
  }

  async flushToDisk() {
    await mkdir(dirname(this.filePath), { recursive: true });
    // 原子写：先写临时文件再 rename，避免进程中断时留下半写的损坏文件。
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(this.data, null, 2)}\n`);
    await rename(tmpPath, this.filePath);
  }

  async findOrCreateWechatUser({ openid, unionid }) {
    await this.load();
    const identity = this.data.identities.find(
      (item) => item.provider === "wechat_miniprogram" && item.providerUserId === openid,
    );
    if (identity) {
      const user = this.data.users.find((item) => item.id === identity.userId);
      if (user) return user;
    }

    const user = {
      id: randomUUID(),
      displayName: "微信用户",
      provider: "wechat",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.users.push(user);
    this.data.identities.push({
      id: randomUUID(),
      userId: user.id,
      provider: "wechat_miniprogram",
      providerUserId: openid,
      unionId: unionid ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await this.save();
    return user;
  }

  async getUser(userId) {
    await this.load();
    return this.data.users.find((item) => item.id === userId) ?? null;
  }

  async getProfile(userId) {
    await this.load();
    return this.data.profiles[userId] ?? null;
  }

  async getHouseholdForUser(userId) {
    await this.load();
    return this.findActiveHouseholdByMember(userId) ?? this.ensureHouseholdForUser(userId);
  }

  async getHouseholdsForUser(userId) {
    await this.load();
    return this.findHouseholdsByMember(userId);
  }

  async createHouseholdForUser(userId, options = {}) {
    await this.load();
    const hadHousehold = this.findHouseholdsByMember(userId).length > 0;
    const household = this.buildHousehold(userId, options);
    this.data.households.push(household);
    this.data.activeHouseholds[userId] = household.id;
    if (!hadHousehold && this.data.states[userId] && !this.data.householdStates[household.id]) {
      this.data.householdStates[household.id] = {
        ...this.data.states[userId],
        householdId: household.id,
        migratedFromUserId: userId,
        updatedAt: this.data.states[userId].updatedAt || household.createdAt,
      };
    }
    await this.save();
    return household;
  }

  async setActiveHouseholdForUser(userId, householdId) {
    await this.load();
    const household = this.findHouseholdsByMember(userId).find((item) => item.id === householdId);
    if (!household) {
      const error = new Error("Household not found for user.");
      error.code = "household_not_found";
      throw error;
    }
    this.data.activeHouseholds[userId] = household.id;
    await this.save();
    return household;
  }

  async ensureHouseholdForUser(userId, options = {}) {
    await this.load();
    const existing = this.findActiveHouseholdByMember(userId);
    if (!existing) return this.createHouseholdForUser(userId, options);
    const member = existing.members.find((item) => item.memberId === userId);
    const nextName = sanitizeText(options.memberName, "", 32);
    if (member && nextName && member.nickname !== nextName) {
      member.nickname = nextName;
      member.updatedAt = new Date().toISOString();
      existing.updatedAt = member.updatedAt;
      await this.save();
    }
    return existing;
  }

  async ensureOwnedHouseholdForUser(userId, options = {}) {
    const household = await this.ensureHouseholdForUser(userId, options);
    if (household.ownerId !== userId) {
      const error = new Error("Only the household owner can start household actions.");
      error.code = "forbidden";
      throw error;
    }
    return household;
  }

  buildHousehold(userId, options = {}) {
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name: sanitizeText(options.householdName, "我的家", 32),
      ownerId: userId,
      members: [{
        memberId: userId,
        nickname: sanitizeText(options.memberName, "", 32) || user?.displayName || "主厨",
        role: "owner",
        status: "formal",
        joinedAt: now,
        updatedAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
  }

  async addHouseholdMember(householdId, userId, options = {}) {
    await this.load();
    const household = this.data.households.find((item) => item.id === householdId);
    if (!household) return this.ensureHouseholdForUser(userId, options);
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    const existingMember = household.members.find((item) => item.memberId === userId);
    if (existingMember) {
      existingMember.status = "formal";
      existingMember.role ||= "member";
      existingMember.nickname = sanitizeText(options.memberName, "", 32) || existingMember.nickname || user?.displayName || "家人";
      existingMember.updatedAt = now;
    } else {
      household.members.push({
        memberId: userId,
        nickname: sanitizeText(options.memberName, "", 32) || user?.displayName || "家人",
        role: "member",
        status: "formal",
        joinedAt: now,
        updatedAt: now,
      });
    }
    household.updatedAt = now;
    this.data.activeHouseholds[userId] = household.id;
    await this.save();
    return household;
  }

  async createHouseholdInvite(ownerUserId, payload = {}) {
    await this.load();
    const householdId = sanitizeText(payload.householdId, "", 80);
    const household = householdId
      ? this.data.households.find((item) => item.id === householdId)
      : this.findActiveHouseholdByMember(ownerUserId);
    if (!household) {
      const error = new Error("Household not found.");
      error.code = "household_not_found";
      throw error;
    }
    if (household.ownerId !== ownerUserId) {
      const error = new Error("Only the household owner can invite members.");
      error.code = "forbidden";
      throw error;
    }
    const owner = this.data.users.find((item) => item.id === ownerUserId);
    const ownerMember = household.members.find((item) => item.memberId === ownerUserId);
    const now = new Date().toISOString();
    const invite = {
      id: randomUUID(),
      token: randomUUID().replaceAll("-", ""),
      householdId: household.id,
      householdName: household.name,
      inviterId: ownerUserId,
      inviterName: sanitizeText(payload.inviterName, "", 32) || ownerMember?.nickname || owner?.displayName || "主厨",
      status: "open",
      acceptedMemberIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.data.householdInvites.unshift(invite);
    this.data.householdInvites = this.data.householdInvites.slice(0, 2000);
    await this.save();
    return invite;
  }

  async getHouseholdInvite(token) {
    await this.load();
    return this.data.householdInvites.find((item) => item.token === token) ?? null;
  }

  async acceptHouseholdInvite(token, userId, options = {}) {
    await this.load();
    const invite = this.data.householdInvites.find((item) => item.token === token);
    if (!invite) return null;
    if (invite.status !== "open") {
      const error = new Error("Invite is closed.");
      error.code = "invite_closed";
      throw error;
    }
    const household = await this.addHouseholdMember(invite.householdId, userId, options);
    const now = new Date().toISOString();
    invite.acceptedMemberIds = [...new Set([...(invite.acceptedMemberIds ?? []), userId])];
    invite.acceptedAt = now;
    invite.updatedAt = now;
    await this.save();
    return { invite, household };
  }

  async saveProfile(userId, profile) {
    await this.load();
    this.data.profiles[userId] = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.data.profiles[userId];
  }

  async bindPhoneNumber(userId, phoneInfo) {
    await this.load();
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) return null;

    const purePhoneNumber = normalizePhone(phoneInfo.purePhoneNumber || phoneInfo.phoneNumber);
    const countryCode = normalizeCountryCode(phoneInfo.countryCode);
    const now = new Date().toISOString();
    user.phoneCountryCode = countryCode;
    user.phoneMasked = maskPhoneNumber(purePhoneNumber);
    user.phoneHash = String(phoneInfo.phoneHash || "");
    user.phoneVerifiedAt = now;
    user.updatedAt = now;
    await this.save();
    return user;
  }

  async getState(userId) {
    await this.load();
    const household = await this.ensureHouseholdForUser(userId);
    return this.data.householdStates[household.id] ?? null;
  }

  async saveState(userId, state) {
    await this.load();
    const household = await this.ensureHouseholdForUser(userId);
    const nextState = {
      ...state,
      householdId: household.id,
      updatedAt: new Date().toISOString(),
    };
    this.data.householdStates[household.id] = nextState;
    this.data.states[userId] = nextState;
    await this.save();
    return this.data.householdStates[household.id];
  }

  async revokeToken(token) {
    await this.load();
    this.data.revokedTokens = [...new Set([...this.data.revokedTokens, token])].slice(-1000);
    await this.save();
  }

  async isTokenRevoked(token) {
    await this.load();
    return this.data.revokedTokens.includes(token);
  }

  async getAiUsage(userId) {
    await this.load();
    const household = await this.ensureHouseholdForUser(userId);
    this.data.aiUsage ??= {};
    return this.data.aiUsage[household.id] ?? { preciseRecommendationUses: 0 };
  }

  async recordAiRecommendationUse(userId) {
    await this.load();
    const household = await this.ensureHouseholdForUser(userId);
    this.data.aiUsage ??= {};
    const current = this.data.aiUsage[household.id] ?? { preciseRecommendationUses: 0 };
    this.data.aiUsage[household.id] = {
      ...current,
      preciseRecommendationUses: Number(current.preciseRecommendationUses || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.data.aiUsage[household.id];
  }

  async getCachedAiRecommendation(cacheKey, maxAgeMs) {
    await this.load();
    this.data.aiRecommendationCache ??= [];
    const cached = this.data.aiRecommendationCache.find((item) => item.cacheKey === cacheKey);
    if (!cached) return null;
    const ageMs = Date.now() - Date.parse(cached.createdAt || 0);
    if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) return null;
    return cached;
  }

  async saveCachedAiRecommendation(cacheKey, result) {
    await this.load();
    this.data.aiRecommendationCache ??= [];
    const now = new Date().toISOString();
    this.data.aiRecommendationCache = [
      {
        id: randomUUID(),
        cacheKey,
        result,
        createdAt: now,
      },
      ...this.data.aiRecommendationCache.filter((item) => item.cacheKey !== cacheKey),
    ].slice(0, 500);
    await this.save();
  }

  async createCraveRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const defaultDeadlineAt = new Date(nowMs + 30 * 60 * 1000).toISOString();
    const requestedDeadlineAt = sanitizeText(payload.deadlineAt, "", 40);
    const deadlineAt = Number.isFinite(new Date(requestedDeadlineAt).getTime())
      ? requestedDeadlineAt
      : defaultDeadlineAt;
    const token = randomUUID().replaceAll("-", "");
    const ownerSecret = randomUUID().replaceAll("-", "");
    const household = ownerUserId
      ? await this.ensureOwnedHouseholdForUser(ownerUserId, {
        householdName: payload.householdName,
        memberName: payload.initiatorName,
      })
      : null;
    const request = {
      id: randomUUID(),
      token,
      ownerSecret,
      householdId: household?.id || sanitizeText(payload.householdId, "", 80),
      ownerId: ownerUserId || sanitizeText(payload.ownerId, "", 80),
      householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
      initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
      mealType: sanitizeText(payload.mealType, "dinner", 24),
      starterFeeling: sanitizeText(payload.starterFeeling, "随便都行", 32),
      targetParticipantNames: sanitizeTextList(payload.targetParticipantNames, 12, 32),
      status: "open",
      votes: [],
      createdAt: now,
      deadlineAt,
      updatedAt: now,
    };
    this.data.craveRequests.unshift(request);
    this.data.craveRequests = this.data.craveRequests.slice(0, 2000);
    await this.save();
    return request;
  }

  async getCraveRequest(token) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token) ?? null;
    const closedByDeadline = expireCraveRequestIfNeeded(request);
    if (closedByDeadline) await this.save();
    return request;
  }

  async addCraveVote(token, vote = {}) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    const closedByDeadline = expireCraveRequestIfNeeded(request);
    if (closedByDeadline) {
      await this.save();
      return request;
    }
    if (request.status !== "open") return request;
    const now = new Date().toISOString();
    const participantKey = sanitizeText(vote.participantKey, "", 80) || randomUUID();
    const nextVote = {
      id: randomUUID(),
      participantKey,
      memberName: sanitizeText(vote.memberName, "家人", 32),
      feelingTag: sanitizeText(vote.feelingTag, "随便都行", 32),
      dishWish: sanitizeText(vote.dishWish, "", 40),
      note: sanitizeText(vote.note, "", 80),
      temporary: vote.temporary !== false,
      createdAt: now,
    };
    const existingIndex = request.votes.findIndex((item) => item.participantKey === participantKey);
    if (existingIndex >= 0) request.votes[existingIndex] = nextVote;
    else request.votes.push(nextVote);
    request.updatedAt = now;
    await this.save();
    return request;
  }

  async claimCraveVote(token, userId, claim = {}) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    const participantKey = sanitizeText(claim.participantKey, "", 80);
    if (!participantKey) throw codedError("missing_participant_key", "participantKey is required.");
    const vote = request.votes.find((item) => item.participantKey === participantKey);
    if (!vote) throw codedError("vote_not_found", "Temporary vote not found.");
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    vote.memberId = userId;
    vote.memberName = sanitizeText(claim.memberName, "", 32) || user?.displayName || vote.memberName || "家人";
    vote.temporary = false;
    vote.mergedAt = now;
    if (request.householdId) await this.addHouseholdMember(request.householdId, userId, { memberName: vote.memberName });
    request.updatedAt = now;
    await this.save();
    return request;
  }

  async closeCraveRequest(token, ownerSecret) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    if (request.ownerSecret !== ownerSecret) {
      const error = new Error("Owner secret mismatch.");
      error.code = "forbidden";
      throw error;
    }
    request.status = "closed";
    request.updatedAt = new Date().toISOString();
    await this.save();
    return request;
  }

  async createGroceryShareRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const household = ownerUserId
      ? await this.ensureOwnedHouseholdForUser(ownerUserId, {
        householdName: payload.householdName,
        memberName: payload.initiatorName,
      })
      : null;
    const now = new Date().toISOString();
    const token = randomUUID().replaceAll("-", "");
    const ownerSecret = randomUUID().replaceAll("-", "");
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 80).map((item, index) => ({
      id: sanitizeText(item.id, `item-${index}`, 80),
      name: sanitizeText(item.name, "食材", 40),
      amount: sanitizeText(item.amount, "", 40),
      category: sanitizeText(item.category, "", 40),
      checked: Boolean(item.checked),
    })) : [];
    const request = {
      id: randomUUID(),
      token,
      ownerSecret,
      householdId: household?.id || sanitizeText(payload.householdId, "", 80),
      ownerId: ownerUserId || sanitizeText(payload.ownerId, "", 80),
      householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
      initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
      title: sanitizeText(payload.title, "Humi 买菜清单", 48),
      status: "open",
      items,
      claims: [],
      createdAt: now,
      updatedAt: now,
    };
    this.data.groceryShareRequests.unshift(request);
    this.data.groceryShareRequests = this.data.groceryShareRequests.slice(0, 2000);
    await this.save();
    return request;
  }

  async getGroceryShareRequest(token) {
    await this.load();
    return this.data.groceryShareRequests.find((item) => item.token === token) ?? null;
  }

  async addGroceryShareClaim(token, claim = {}) {
    await this.load();
    const request = this.data.groceryShareRequests.find((item) => item.token === token);
    if (!request) return null;
    if (request.status !== "open") return request;
    const now = new Date().toISOString();
    const participantKey = sanitizeText(claim.participantKey, "", 80) || randomUUID();
    const claimStatus = claim.status === "declined" ? "declined" : "claimed";
    const nextClaim = {
      id: randomUUID(),
      participantKey,
      memberName: sanitizeText(claim.memberName, "家人", 32),
      status: claimStatus,
      itemIds: sanitizeClaimItemIds(claim.itemIds, request.items, claimStatus !== "declined"),
      note: sanitizeText(claim.note, "", 80),
      temporary: claim.temporary !== false,
      createdAt: now,
    };
    const existingIndex = request.claims.findIndex((item) => item.participantKey === participantKey);
    if (existingIndex >= 0) request.claims[existingIndex] = nextClaim;
    else request.claims.push(nextClaim);
    request.updatedAt = now;
    await this.save();
    return request;
  }

  async updateGroceryShareItemChecked(token, itemId, checked) {
    await this.load();
    const request = this.data.groceryShareRequests.find((item) => item.token === token);
    if (!request) return null;
    if (request.status !== "open") return request;
    const item = request.items.find((entry) => entry.id === itemId);
    if (!item) return request;
    item.checked = Boolean(checked);
    request.updatedAt = new Date().toISOString();
    await this.save();
    return request;
  }

  async claimGroceryShareParticipant(token, userId, claim = {}) {
    await this.load();
    const request = this.data.groceryShareRequests.find((item) => item.token === token);
    if (!request) return null;
    const participantKey = sanitizeText(claim.participantKey, "", 80);
    if (!participantKey) throw codedError("missing_participant_key", "participantKey is required.");
    const participantClaim = request.claims.find((item) => item.participantKey === participantKey);
    if (!participantClaim) throw codedError("claim_not_found", "Temporary grocery claim not found.");
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    participantClaim.memberId = userId;
    participantClaim.memberName = sanitizeText(claim.memberName, "", 32) || user?.displayName || participantClaim.memberName || "家人";
    participantClaim.temporary = false;
    participantClaim.mergedAt = now;
    if (request.householdId) await this.addHouseholdMember(request.householdId, userId, { memberName: participantClaim.memberName });
    request.updatedAt = now;
    await this.save();
    return request;
  }

  async createMenuShareRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const household = ownerUserId
      ? await this.ensureOwnedHouseholdForUser(ownerUserId, {
        householdName: payload.householdName,
        memberName: payload.initiatorName,
      })
      : null;
    const now = new Date().toISOString();
    const token = randomUUID().replaceAll("-", "");
    const dishes = Array.isArray(payload.dishes) ? payload.dishes.slice(0, 20).map((dish, index) => ({
      id: sanitizeText(dish.id, `dish-${index}`, 80),
      recipeId: sanitizeText(dish.recipeId || dish.id, "", 80),
      name: sanitizeText(dish.name, "一道菜", 48),
      quantity: Math.max(1, Math.min(12, Number.parseInt(dish.quantity, 10) || 1)),
      category: sanitizeText(dish.category, "", 40),
      timeMinutes: Math.max(0, Math.min(240, Number.parseInt(dish.timeMinutes, 10) || 0)),
    })).filter((dish) => dish.name) : [];
    const request = {
      id: randomUUID(),
      token,
      householdId: household?.id || sanitizeText(payload.householdId, "", 80),
      ownerId: ownerUserId || sanitizeText(payload.ownerId, "", 80),
      householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
      initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
      title: sanitizeText(payload.title, "Humi 今晚菜单", 80),
      status: "open",
      dishes,
      groceryCount: Math.max(0, Math.min(200, Number.parseInt(payload.groceryCount, 10) || 0)),
      createdAt: now,
      updatedAt: now,
    };
    this.data.menuShareRequests ??= [];
    this.data.menuShareRequests.unshift(request);
    this.data.menuShareRequests = this.data.menuShareRequests.slice(0, 2000);
    await this.save();
    return request;
  }

  async getMenuShareRequest(token) {
    await this.load();
    this.data.menuShareRequests ??= [];
    return this.data.menuShareRequests.find((item) => item.token === token) ?? null;
  }

  async createWishShareRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const household = ownerUserId
      ? await this.ensureOwnedHouseholdForUser(ownerUserId, {
        householdName: payload.householdName,
        memberName: payload.initiatorName,
      })
      : null;
    const now = new Date().toISOString();
    const token = randomUUID().replaceAll("-", "");
    const ownerSecret = randomUUID().replaceAll("-", "");
    const request = {
      id: randomUUID(),
      token,
      ownerSecret,
      householdId: household?.id || sanitizeText(payload.householdId, "", 80),
      ownerId: ownerUserId || sanitizeText(payload.ownerId, "", 80),
      householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
      initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
      title: sanitizeText(payload.title, "家里最近想吃什么", 48),
      status: "open",
      wishes: [],
      createdAt: now,
      updatedAt: now,
    };
    this.data.wishShareRequests ??= [];
    this.data.wishShareRequests.unshift(request);
    this.data.wishShareRequests = this.data.wishShareRequests.slice(0, 2000);
    await this.save();
    return request;
  }

  async getWishShareRequest(token) {
    await this.load();
    this.data.wishShareRequests ??= [];
    return this.data.wishShareRequests.find((item) => item.token === token) ?? null;
  }

  async addWishShareEntry(token, wish = {}) {
    await this.load();
    this.data.wishShareRequests ??= [];
    const request = this.data.wishShareRequests.find((item) => item.token === token);
    if (!request) return null;
    if (request.status !== "open") return request;
    const now = new Date().toISOString();
    const participantKey = sanitizeText(wish.participantKey, "", 80) || randomUUID();
    const nextWish = {
      id: randomUUID(),
      participantKey,
      memberName: sanitizeText(wish.memberName, "家人", 32),
      dishName: sanitizeText(wish.dishName, "想吃的菜", 40),
      note: sanitizeText(wish.note, "", 80),
      temporary: wish.temporary !== false,
      createdAt: now,
    };
    const existingIndex = request.wishes.findIndex((item) => item.participantKey === participantKey);
    if (existingIndex >= 0) request.wishes[existingIndex] = nextWish;
    else request.wishes.push(nextWish);
    request.updatedAt = now;
    await this.save();
    return request;
  }

  async claimWishShareParticipant(token, userId, claim = {}) {
    await this.load();
    const request = this.data.wishShareRequests.find((item) => item.token === token);
    if (!request) return null;
    const participantKey = sanitizeText(claim.participantKey, "", 80);
    if (!participantKey) throw codedError("missing_participant_key", "participantKey is required.");
    const wish = request.wishes.find((item) => item.participantKey === participantKey);
    if (!wish) throw codedError("wish_not_found", "Temporary wish not found.");
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    wish.memberId = userId;
    wish.memberName = sanitizeText(claim.memberName, "", 32) || user?.displayName || wish.memberName || "家人";
    wish.temporary = false;
    wish.mergedAt = now;
    if (request.householdId) await this.addHouseholdMember(request.householdId, userId, { memberName: wish.memberName });
    request.updatedAt = now;
    await this.save();
    return request;
  }

  findActiveHouseholdByMember(userId) {
    const households = this.findHouseholdsByMember(userId);
    const activeHouseholdId = this.data.activeHouseholds?.[userId];
    return households.find((household) => household.id === activeHouseholdId) ?? households[0] ?? null;
  }

  findHouseholdsByMember(userId) {
    return this.data.households.filter((household) => (
      Array.isArray(household.members) &&
      household.members.some((member) => member.memberId === userId && member.status === "formal")
    ));
  }
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePhone(value = "") {
  return String(value).replace(/\D/g, "").slice(0, 24);
}

function normalizeCountryCode(value = "") {
  const normalized = String(value || "86").replace(/\D/g, "").slice(0, 6);
  return normalized || "86";
}

function maskPhoneNumber(phoneNumber) {
  if (phoneNumber.length < 7) return phoneNumber ? `${phoneNumber.slice(0, 2)}****` : "";
  return `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}`;
}

function expireCraveRequestIfNeeded(request) {
  if (!request || request.status !== "open") return false;
  const deadlineTime = Date.parse(request.deadlineAt || "");
  if (!Number.isFinite(deadlineTime) || deadlineTime > Date.now()) return false;
  request.status = "closed";
  request.closedReason = "deadline";
  request.updatedAt = new Date().toISOString();
  return true;
}

function sanitizeText(value, fallback = "", maxLength = 80) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, maxLength);
}

function sanitizeTextList(value, maxItems = 20, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => sanitizeText(item, "", maxLength)).filter(Boolean))].slice(0, maxItems);
}

function sanitizeClaimItemIds(value, requestItems = [], defaultAll = true) {
  const allowedIds = new Set((requestItems ?? []).map((item) => item.id));
  const ids = Array.isArray(value) ? value.map((item) => sanitizeText(item, "", 80)).filter(Boolean) : [];
  const filtered = ids.filter((id) => allowedIds.has(id));
  return [...new Set(filtered.length > 0 || !defaultAll ? filtered : [...allowedIds])].slice(0, 80);
}

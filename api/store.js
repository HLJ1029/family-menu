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
  craveRequests: [],
  householdInvites: [],
  groceryShares: [],
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
    if (existing) {
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

    return this.createHouseholdForUser(userId, options);
  }

  async ensureOwnedHouseholdForUser(userId, options = {}) {
    await this.load();
    const existing = this.findActiveHouseholdByMember(userId);
    if (existing) {
      if (existing.ownerId !== userId) {
        const error = new Error("Only the household owner can start household actions.");
        error.code = "forbidden";
        throw error;
      }
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

    return this.createHouseholdForUser(userId, options);
  }

  buildHousehold(userId, options = {}) {
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name: sanitizeText(options.householdName, "我的家", 32),
      ownerId: userId,
      members: [
        {
          memberId: userId,
          nickname: sanitizeText(options.memberName, "", 32) || user?.displayName || "主厨",
          role: "owner",
          status: "formal",
          joinedAt: now,
          updatedAt: now,
        },
      ],
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
      existingMember.role = existingMember.role || "member";
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

  async createGroceryShare(ownerUserId, payload = {}) {
    await this.load();
    const household = await this.ensureOwnedHouseholdForUser(ownerUserId, {
      householdName: payload.householdName,
      memberName: payload.initiatorName,
    });
    const owner = this.data.users.find((item) => item.id === ownerUserId);
    const ownerMember = household.members.find((item) => item.memberId === ownerUserId);
    const now = new Date().toISOString();
    const share = {
      id: randomUUID(),
      token: randomUUID().replaceAll("-", ""),
      householdId: household.id,
      householdName: household.name,
      initiatorId: ownerUserId,
      initiatorName: sanitizeText(payload.initiatorName, "", 32) || ownerMember?.nickname || owner?.displayName || "主厨",
      status: "open",
      items: sanitizeGroceryShareItems(payload.items),
      claims: {},
      createdAt: now,
      updatedAt: now,
    };
    this.data.groceryShares.unshift(share);
    this.data.groceryShares = this.data.groceryShares.slice(0, 2000);
    await this.save();
    return share;
  }

  async getGroceryShare(token) {
    await this.load();
    return this.data.groceryShares.find((item) => item.token === token) ?? null;
  }

  async claimGroceryShareItem(token, payload = {}) {
    await this.load();
    const share = this.data.groceryShares.find((item) => item.token === token);
    if (!share) return null;
    if (share.status !== "open") return share;
    const itemKey = sanitizeText(payload.itemKey, "", 160);
    const item = share.items.find((entry) => entry.key === itemKey);
    if (!item) {
      const error = new Error("Grocery item not found.");
      error.code = "grocery_item_not_found";
      throw error;
    }
    const now = new Date().toISOString();
    const memberId = sanitizeText(payload.memberId, "", 100)
      || `temporary:${sanitizeText(payload.participantKey, "", 80) || randomUUID()}`;
    const currentClaim = share.claims[itemKey];
    if (currentClaim?.memberId && currentClaim.memberId !== memberId) {
      const error = new Error("Grocery item has already been claimed.");
      error.code = currentClaim.status === "done" ? "grocery_item_done" : "grocery_item_claimed";
      error.claim = currentClaim;
      throw error;
    }
    const status = payload.status === "done" || currentClaim?.memberId === memberId ? "done" : "claimed";
    const claim = {
      itemKey,
      itemName: item.name,
      memberId,
      memberName: sanitizeText(payload.memberName, "家人", 32),
      status,
      claimedAt: currentClaim?.claimedAt || now,
      completedAt: status === "done" ? now : "",
      updatedAt: now,
      temporary: !sanitizeText(payload.memberId, "", 100),
    };
    share.claims[itemKey] = claim;
    share.updatedAt = now;
    this.syncGroceryClaimToHouseholdState(share.householdId, claim);
    await this.save();
    return share;
  }

  syncGroceryClaimToHouseholdState(householdId, claim) {
    if (!householdId || !claim?.itemKey) return;
    const currentState = this.data.householdStates[householdId] ?? {};
    this.data.householdStates[householdId] = {
      ...currentState,
      householdId,
      groceryClaims: {
        ...(currentState.groceryClaims ?? {}),
        [claim.itemKey]: {
          itemKey: claim.itemKey,
          itemName: claim.itemName,
          memberId: claim.memberId,
          memberName: claim.memberName,
          status: claim.status,
          claimedAt: claim.claimedAt,
          completedAt: claim.completedAt,
        },
      },
      updatedAt: new Date().toISOString(),
    };
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

  async getPreciseRecommendationAccess(userId) {
    await this.load();
    const household = await this.ensureHouseholdForUser(userId);
    const state = this.data.householdStates[household.id] ?? {};
    const access = normalizeRecommendationAccess(state.recommendationAccess);
    return {
      access,
      canUse: access.plan === "plus" || access.preciseTrialRemaining > 0,
    };
  }

  async consumePreciseRecommendationAccess(userId) {
    await this.load();
    const household = await this.ensureHouseholdForUser(userId);
    const currentState = this.data.householdStates[household.id] ?? {};
    const access = normalizeRecommendationAccess(currentState.recommendationAccess);
    const nextAccess = access.plan === "plus"
      ? { ...access, preciseUsed: access.preciseUsed + 1 }
      : {
        ...access,
        preciseTrialRemaining: Math.max(0, access.preciseTrialRemaining - 1),
        preciseUsed: access.preciseUsed + 1,
      };
    this.data.householdStates[household.id] = {
      ...currentState,
      householdId: household.id,
      recommendationAccess: nextAccess,
      updatedAt: new Date().toISOString(),
    };
    this.data.states[userId] = this.data.householdStates[household.id];
    await this.save();
    return nextAccess;
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

  async createCraveRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const now = new Date().toISOString();
    const deadlineAt = resolveCraveDeadline(payload.deadlineAt, now);
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
      householdId: household?.id ?? null,
      initiatorId: ownerUserId ?? null,
      householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
      initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
      mealType: sanitizeText(payload.mealType, "dinner", 24),
      status: "open",
      deadlineAt,
      votes: [],
      createdAt: now,
      updatedAt: now,
    };
    this.data.craveRequests.unshift(request);
    this.data.craveRequests = this.data.craveRequests.slice(0, 2000);
    await this.save();
    return request;
  }

  async getCraveRequest(token) {
    await this.load();
    return this.data.craveRequests.find((item) => item.token === token) ?? null;
  }

  async addCraveVote(token, vote = {}) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    if (request.status !== "open") return request;
    const now = new Date().toISOString();
    const participantKey = sanitizeText(vote.participantKey, "", 80) || randomUUID();
    const nextVote = {
      id: randomUUID(),
      participantKey,
      memberName: sanitizeText(vote.memberName, "家人", 32),
      feelingTag: sanitizeText(vote.feelingTag, "随便都行", 32),
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
    if (!participantKey) {
      const error = new Error("participantKey is required.");
      error.code = "missing_participant_key";
      throw error;
    }

    const vote = request.votes.find((item) => item.participantKey === participantKey);
    if (!vote) {
      const error = new Error("Temporary vote not found.");
      error.code = "vote_not_found";
      throw error;
    }

    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    vote.memberId = userId;
    vote.memberName = sanitizeText(claim.memberName, "", 32) || user?.displayName || vote.memberName || "家人";
    vote.temporary = false;
    vote.claimedAt = now;
    if (request.householdId) {
      await this.addHouseholdMember(request.householdId, userId, { memberName: vote.memberName });
    }
    request.updatedAt = now;
    await this.save();
    return request;
  }

  async closeCraveRequest(token, ownerSecret, resultSummary = null) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    if (request.ownerSecret !== ownerSecret) {
      const error = new Error("Owner secret mismatch.");
      error.code = "forbidden";
      throw error;
    }
    if (resultSummary) {
      request.resultSummary = sanitizeCraveResultSummary(resultSummary);
    }
    request.status = "closed";
    request.updatedAt = new Date().toISOString();
    await this.save();
    return request;
  }

  findHouseholdByMember(userId) {
    return this.findHouseholdsByMember(userId)[0] ?? null;
  }

  findActiveHouseholdByMember(userId) {
    const households = this.findHouseholdsByMember(userId);
    const activeHouseholdId = this.data.activeHouseholds?.[userId];
    return households.find((household) => household.id === activeHouseholdId) ?? households[0] ?? null;
  }

  findHouseholdsByMember(userId) {
    return this.data.households.filter((household) => (
      Array.isArray(household.members)
      && household.members.some((member) => member.memberId === userId && member.status === "formal")
    ));
  }
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

function sanitizeText(value, fallback = "", maxLength = 80) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return (text || fallback).slice(0, maxLength);
}

function sanitizeCraveResultSummary(summary = {}) {
  const dishes = Array.isArray(summary.dishes) ? summary.dishes : [];
  return {
    dishes: dishes
      .map((dish) => ({
        name: sanitizeText(dish?.name, "", 40),
        timeMinutes: Number.isFinite(Number(dish?.timeMinutes)) ? Number(dish.timeMinutes) : null,
      }))
      .filter((dish) => dish.name)
      .slice(0, 4),
    reason: sanitizeText(summary.reason, "", 180),
    generatedAt: sanitizeText(summary.generatedAt, new Date().toISOString(), 40),
  };
}

function normalizeRecommendationAccess(access = {}) {
  const parsedTrialRemaining = Number.parseInt(access.preciseTrialRemaining, 10);
  return {
    plan: access.plan === "plus" ? "plus" : "free",
    preciseTrialRemaining: Math.max(0, Math.min(20, Number.isFinite(parsedTrialRemaining) ? parsedTrialRemaining : 3)),
    preciseUsed: Math.max(0, Number.parseInt(access.preciseUsed, 10) || 0),
  };
}

function resolveCraveDeadline(value, createdAt) {
  const explicitTime = Date.parse(String(value ?? ""));
  if (Number.isFinite(explicitTime) && explicitTime > Date.now()) {
    return new Date(explicitTime).toISOString();
  }
  const createdTime = Date.parse(createdAt);
  return new Date((Number.isFinite(createdTime) ? createdTime : Date.now()) + 30 * 60 * 1000).toISOString();
}

function sanitizeGroceryShareItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      key: sanitizeText(item?.key, "", 160),
      name: sanitizeText(item?.name, "", 80),
      amount: sanitizeText(item?.amount, "", 80),
      type: sanitizeText(item?.type, "ingredient", 40),
      source: sanitizeText(item?.source, "", 80),
    }))
    .filter((item) => item.key && item.name)
    .slice(0, 120);
}

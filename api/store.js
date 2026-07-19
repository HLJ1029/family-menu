import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const DEFAULT_AVATAR_KEYS = [
  "humi-avatar-dev-front-m-01",
  "humi-avatar-dev-side-m-01",
  "humi-avatar-dev-thinking-m-01",
  "humi-avatar-dev-laptop-m-01",
  "humi-avatar-family-f-01",
  "humi-avatar-family-m-01",
  "humi-avatar-parent-f-01",
  "humi-avatar-parent-m-01",
];

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
  groceryShareRequests: [],
  menuShareRequests: [],
  wishShareRequests: [],
  collaborationEvents: [],
  revokedTokens: [],
  h5Tickets: [],
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
    this.data.collaborationEvents = Array.isArray(this.data.collaborationEvents)
      ? this.data.collaborationEvents
      : [];
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
      if (user) return this.normalizeIdentityUser(user);
    }

    const userId = randomUUID();
    const user = {
      id: userId,
      displayName: "微信用户",
      provider: "wechat",
      profileStatus: "incomplete",
      avatarKey: defaultAvatarKey(userId),
      avatarUrl: "",
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
    return this.normalizeIdentityUser(user);
  }

  async getUser(userId) {
    await this.load();
    return this.normalizeIdentityUser(this.data.users.find((item) => item.id === userId) ?? null);
  }

  normalizeIdentityUser(user) {
    if (!user) return null;
    return {
      ...user,
      profileStatus: user.profileStatus === "complete" ? "complete" : "incomplete",
      avatarKey: user.avatarKey || defaultAvatarKey(user.id),
      avatarUrl: user.avatarUrl || "",
    };
  }

  async updateIdentityProfile(userId, profile = {}) {
    await this.load();
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) return null;
    const displayName = sanitizeText(profile.displayName, "", 32);
    if (!displayName) throw codedError("display_name_required", "displayName is required.");
    user.displayName = displayName;
    user.avatarKey = sanitizeText(profile.avatarKey, user.avatarKey || defaultAvatarKey(user.id), 80);
    user.avatarUrl = sanitizeText(profile.avatarUrl, user.avatarUrl || "", 240);
    user.profileStatus = "complete";
    user.updatedAt = new Date().toISOString();
    this.syncIdentityToHouseholdMembers(user, { updateNickname: true });
    await this.save();
    return this.normalizeIdentityUser(user);
  }

  async updateIdentityAvatar(userId, profile = {}) {
    await this.load();
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) return null;
    const avatarUrl = sanitizeText(profile.avatarUrl, "", 240);
    if (!avatarUrl) throw codedError("avatar_url_required", "avatarUrl is required.");
    user.avatarUrl = avatarUrl;
    user.updatedAt = new Date().toISOString();
    this.syncIdentityToHouseholdMembers(user);
    await this.save();
    return this.normalizeIdentityUser(user);
  }

  async getProfile(userId) {
    await this.load();
    return this.data.profiles[userId] ?? null;
  }

  async getHouseholdForUser(userId) {
    return this.getActiveHouseholdForUser(userId);
  }

  async getActiveHouseholdForUser(userId) {
    await this.load();
    return this.findActiveHouseholdByMember(userId);
  }

  async requireActiveHouseholdForUser(userId) {
    const household = await this.getActiveHouseholdForUser(userId);
    if (household) return household;
    throw codedError("household_required", "请先创建或加入一个家。");
  }

  async requireOwnedHouseholdForUser(userId) {
    const household = await this.requireActiveHouseholdForUser(userId);
    if (household.ownerId === userId) return household;
    throw codedError("forbidden", "Only the household owner can perform this action.");
  }

  async getHouseholdsForUser(userId) {
    await this.load();
    return this.findHouseholdsByMember(userId);
  }

  async createHouseholdForUser(userId, options = {}) {
    await this.load();
    const householdName = sanitizeText(options.householdName, "", 32);
    if (!householdName) throw codedError("household_name_required", "请填写家庭名称。");
    const hadHousehold = this.findHouseholdsByMember(userId).length > 0;
    const household = this.buildHousehold(userId, { ...options, householdName });
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

  buildHousehold(userId, options = {}) {
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name: sanitizeText(options.householdName, "", 32),
      ownerId: userId,
      members: [
        {
          memberId: userId,
          nickname: sanitizeText(options.memberName, "", 32) || user?.displayName || "主厨",
          avatarKey: user?.avatarKey || defaultAvatarKey(userId),
          avatarUrl: user?.avatarUrl || "",
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
    if (!household) return null;
    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    const existingMember = household.members.find((item) => item.memberId === userId);
    if (existingMember) {
      existingMember.status = "formal";
      existingMember.role = existingMember.role || "member";
      existingMember.nickname = sanitizeText(options.memberName, "", 32) || existingMember.nickname || user?.displayName || "家人";
      existingMember.avatarKey = user?.avatarKey || existingMember.avatarKey || defaultAvatarKey(userId);
      existingMember.avatarUrl = user?.avatarUrl || existingMember.avatarUrl || "";
      existingMember.updatedAt = now;
    } else {
      household.members.push({
        memberId: userId,
        nickname: sanitizeText(options.memberName, "", 32) || user?.displayName || "家人",
        avatarKey: user?.avatarKey || defaultAvatarKey(userId),
        avatarUrl: user?.avatarUrl || "",
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

  async updateHousehold(userId, householdId, patch = {}) {
    await this.load();
    const household = this.requireFormalMemberHousehold(userId, householdId);
    if (household.ownerId !== userId) {
      throw codedError("forbidden", "Only the household owner can update this household.");
    }
    const name = sanitizeText(patch.name, "", 32);
    if (!name) throw codedError("household_name_required", "请填写家庭名称。");
    household.name = name;
    household.updatedAt = new Date().toISOString();
    this.repairActiveHouseholds();
    await this.save();
    return household;
  }

  async removeHouseholdMember(ownerUserId, householdId, memberId) {
    await this.load();
    const household = this.requireFormalMemberHousehold(ownerUserId, householdId);
    if (household.ownerId !== ownerUserId) {
      throw codedError("forbidden", "Only the household owner can remove members.");
    }
    if (memberId === household.ownerId) {
      throw codedError("owner_cannot_be_removed", "The household owner cannot be removed.");
    }
    const memberIndex = household.members.findIndex(
      (member) => member.memberId === memberId && member.status === "formal",
    );
    if (memberIndex < 0) {
      throw codedError("household_member_not_found", "Household member not found.");
    }
    household.members.splice(memberIndex, 1);
    delete this.data.states[memberId];
    household.updatedAt = new Date().toISOString();
    this.repairActiveHouseholds();
    await this.save();
    return household;
  }

  async transferHouseholdOwnership(ownerUserId, householdId, nextOwnerId) {
    await this.load();
    const household = this.requireFormalMemberHousehold(ownerUserId, householdId);
    if (household.ownerId !== ownerUserId) {
      throw codedError("forbidden", "Only the household owner can transfer ownership.");
    }
    const nextOwner = household.members.find(
      (member) => member.memberId === nextOwnerId && member.status === "formal",
    );
    if (!nextOwner) {
      throw codedError("household_member_not_found", "New owner must be a formal household member.");
    }
    const now = new Date().toISOString();
    for (const member of household.members) {
      member.role = member.memberId === nextOwnerId ? "owner" : "member";
      member.updatedAt = now;
    }
    household.ownerId = nextOwnerId;
    household.updatedAt = now;
    this.repairActiveHouseholds();
    await this.save();
    return household;
  }

  async leaveHousehold(userId, householdId) {
    await this.load();
    const household = this.requireFormalMemberHousehold(userId, householdId);
    const formalMembers = household.members.filter((member) => member.status === "formal");
    const isOwner = household.ownerId === userId;
    const otherFormalMembers = formalMembers.filter((member) => member.memberId !== userId);
    if (isOwner && otherFormalMembers.length > 0) {
      throw codedError("owner_must_transfer_or_disband", "The owner must transfer ownership or disband the household.");
    }

    const now = new Date().toISOString();
    if (isOwner) {
      this.data.households = this.data.households.filter((item) => item.id !== household.id);
      delete this.data.householdStates[household.id];
      delete this.data.states[userId];
      this.repairActiveHouseholds();
      await this.save();
      return { household: null, activeHousehold: this.findActiveHouseholdByMember(userId) };
    }

    household.members = household.members.filter((member) => member.memberId !== userId);
    delete this.data.states[userId];
    household.updatedAt = now;
    this.repairActiveHouseholds();
    await this.save();
    return { household, activeHousehold: this.findActiveHouseholdByMember(userId) };
  }

  syncIdentityToHouseholdMembers(user, { updateNickname = false } = {}) {
    for (const household of this.data.households) {
      const member = household.members?.find((item) => item.memberId === user.id);
      if (!member) continue;
      if (updateNickname) member.nickname = user.displayName;
      member.avatarKey = user.avatarKey || defaultAvatarKey(user.id);
      member.avatarUrl = user.avatarUrl || "";
      member.updatedAt = user.updatedAt;
      household.updatedAt = user.updatedAt;
    }
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

  async addHouseholdInviteWant(token, payload = {}) {
    await this.load();
    const invite = this.data.householdInvites.find((item) => item.token === token);
    if (!invite) return null;
    if (invite.status !== "open") {
      const error = new Error("Invite is closed.");
      error.code = "invite_closed";
      throw error;
    }
    const participantKey = sanitizeText(payload.participantKey, "", 80);
    if (!participantKey) {
      const error = new Error("Participant key is required.");
      error.code = "missing_participant_key";
      throw error;
    }
    const title = sanitizeText(payload.title, "", 40);
    if (!title) {
      const error = new Error("Want title is required.");
      error.code = "missing_want_title";
      throw error;
    }

    const now = new Date().toISOString();
    const temporaryMemberId = `temporary:${participantKey}`;
    const currentState = this.data.householdStates[invite.householdId] ?? {};
    const currentItems = Array.isArray(currentState.wantToEatItems) ? currentState.wantToEatItems : [];
    const existing = currentItems.find((item) => item.memberId === temporaryMemberId && item.status !== "done");
    const want = {
      id: existing?.id || `want:${randomUUID()}`,
      title,
      recipeId: "",
      note: "",
      memberId: temporaryMemberId,
      memberName: sanitizeText(payload.memberName, "家人", 32),
      status: "open",
      temporary: true,
      source: "household_invite",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      completedAt: "",
    };
    this.data.householdStates[invite.householdId] = {
      ...currentState,
      householdId: invite.householdId,
      wantToEatItems: [want, ...currentItems.filter((item) => item.id !== want.id)].slice(0, 200),
      updatedAt: now,
    };
    invite.updatedAt = now;
    await this.save();
    return { invite, want };
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
    const participantKey = sanitizeText(options.participantKey, "", 80);
    if (participantKey) {
      const temporaryMemberId = `temporary:${participantKey}`;
      const currentState = this.data.householdStates[invite.householdId] ?? {};
      this.data.householdStates[invite.householdId] = {
        ...currentState,
        wantToEatItems: (Array.isArray(currentState.wantToEatItems) ? currentState.wantToEatItems : []).map((item) => (
          item.memberId === temporaryMemberId
            ? {
                ...item,
                memberId: userId,
                memberName: sanitizeText(options.memberName, item.memberName || "家人", 32),
                temporary: false,
                updatedAt: now,
              }
            : item
        )),
        updatedAt: now,
      };
    }
    invite.acceptedMemberIds = [...new Set([...(invite.acceptedMemberIds ?? []), userId])];
    invite.acceptedAt = now;
    invite.updatedAt = now;
    await this.save();
    return { invite, household };
  }

  async createGroceryShare(ownerUserId, payload = {}) {
    await this.load();
    const household = await this.requireOwnedHouseholdForUser(ownerUserId);
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
    const household = this.findActiveHouseholdByMember(userId);
    return household ? this.data.householdStates[household.id] ?? null : null;
  }

  async saveState(userId, state, householdId = "") {
    await this.load();
    const household = householdId
      ? this.findHouseholdsByMember(userId).find((item) => item.id === householdId)
      : this.findActiveHouseholdByMember(userId);
    if (!household) {
      throw codedError("household_required", "请先创建或加入一个家。");
    }
    const currentState = this.data.householdStates[household.id] ?? {};
    const writableState = household.ownerId === userId
      ? state
      : mergeMemberWritableState(currentState, state, userId);
    const nextState = {
      ...writableState,
      recommendationAccess: mergeClientRecommendationAccess(
        currentState.recommendationAccess,
        writableState.recommendationAccess,
      ),
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
    const household = await this.requireActiveHouseholdForUser(userId);
    const state = this.data.householdStates[household.id] ?? {};
    const access = normalizeRecommendationAccess(state.recommendationAccess);
    return {
      access,
      canUse: access.plan === "plus" || access.preciseTrialRemaining > 0,
    };
  }

  async consumePreciseRecommendationAccess(userId) {
    await this.load();
    const household = await this.requireActiveHouseholdForUser(userId);
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

  async issueH5Ticket(userId, { now = Date.now(), ttlMs = 60_000 } = {}) {
    await this.load();
    if (!this.data.users.some((item) => item.id === userId)) return null;
    const ticket = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(ticket).digest("hex");
    this.data.h5Tickets = (this.data.h5Tickets ?? [])
      .filter((item) => item.expiresAt > now && !item.consumedAt)
      .slice(-999);
    this.data.h5Tickets.push({ tokenHash, userId, expiresAt: now + ttlMs, consumedAt: null });
    await this.save();
    return { ticket, expiresAt: now + ttlMs };
  }

  async consumeH5Ticket(ticket, { now = Date.now() } = {}) {
    await this.load();
    const tokenHash = createHash("sha256").update(String(ticket || "")).digest("hex");
    const item = (this.data.h5Tickets ?? []).find((candidate) => candidate.tokenHash === tokenHash);
    if (!item || item.consumedAt || item.expiresAt <= now) return null;
    item.consumedAt = now;
    await this.save();
    return { userId: item.userId };
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

  async recordCollaborationEvent(input = {}) {
    await this.load();
    const requestType = sanitizeCollaborationRequestType(input.requestType);
    const requestId = sanitizeText(input.requestId, "", 100);
    const participantType = sanitizeCollaborationParticipantType(input.participantType);
    const participantId = sanitizeText(input.participantId, "", 100);
    const actionType = sanitizeCollaborationActionType(input.actionType);
    if (!requestId || !participantId) {
      throw codedError("collaboration_event_invalid", "requestId and participantId are required.");
    }

    const directExisting = this.data.collaborationEvents.find((event) => (
      collaborationEventKey(event) === collaborationEventKey({
        requestType,
        requestId,
        participantType,
        participantId,
        actionType,
      })
    ));
    const mergedGuestExisting = !directExisting && participantType === "guest"
      ? this.data.collaborationEvents.find((event) => (
        event.requestType === requestType
        && event.requestId === requestId
        && event.actionType === actionType
        && event.participantType === "user"
        && event.mergedFromGuestId === participantId
      ))
      : null;
    const existing = directExisting || mergedGuestExisting;
    const isMergedGuestRetry = Boolean(mergedGuestExisting);
    const now = new Date().toISOString();
    const canonicalParticipantType = isMergedGuestRetry ? existing.participantType : participantType;
    const canonicalParticipantId = isMergedGuestRetry ? existing.participantId : participantId;
    const alias = isMergedGuestRetry
      ? existing.displayNameSnapshot
      : participantType === "guest"
      ? existing?.displayNameSnapshot || this.nextGuestCollaborationAlias(requestType, requestId, participantId)
      : sanitizeText(input.displayNameSnapshot, "Humi 用户", 32);
    const next = {
      id: existing?.id || randomUUID(),
      householdId: existing?.householdId || sanitizeText(input.householdId, "", 100),
      requestType,
      requestId,
      participantType: canonicalParticipantType,
      participantId: canonicalParticipantId,
      displayNameSnapshot: alias,
      avatarSnapshot: isMergedGuestRetry
        ? existing.avatarSnapshot
        : participantType === "guest"
        ? ""
        : sanitizeText(input.avatarSnapshot, "", 240),
      actionType,
      payload: sanitizeCollaborationPayload(actionType, input.payload),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      mergedAt: existing?.mergedAt || "",
      mergedFromGuestId: existing?.mergedFromGuestId || "",
    };
    if (existing) Object.assign(existing, next);
    else this.data.collaborationEvents.unshift(next);
    await this.save();
    return existing || next;
  }

  async mergeGuestCollaborationEvents({ requestType, requestId, guestParticipantId, user } = {}) {
    await this.load();
    const normalizedRequestType = sanitizeCollaborationRequestType(requestType);
    const normalizedRequestId = sanitizeText(requestId, "", 100);
    const normalizedGuestId = sanitizeText(guestParticipantId, "", 100);
    const userId = sanitizeText(user?.id, "", 100);
    if (!normalizedRequestId || !normalizedGuestId || !userId) {
      throw codedError("collaboration_merge_invalid", "requestId, guestParticipantId and user are required.");
    }
    const currentUser = this.data.users.find((candidate) => candidate.id === userId) || user;
    const userName = sanitizeText(currentUser.displayName, "Humi 用户", 32);
    const userAvatar = sanitizeText(currentUser.avatarUrl || currentUser.avatarKey, "", 240);
    const matching = this.data.collaborationEvents.filter((event) => (
      event.requestType === normalizedRequestType
      && event.requestId === normalizedRequestId
      && event.participantType === "guest"
      && event.participantId === normalizedGuestId
    ));
    const alreadyMerged = this.data.collaborationEvents.filter((event) => (
      event.requestType === normalizedRequestType
      && event.requestId === normalizedRequestId
      && event.participantType === "user"
      && event.mergedFromGuestId === normalizedGuestId
    ));
    if (matching.length === 0) {
      if (alreadyMerged.length === 0) {
        throw codedError("collaboration_participant_not_found", "Guest collaboration participant not found for this request.");
      }
      if (alreadyMerged.some((event) => event.participantId !== userId)) {
        throw codedError("collaboration_already_claimed", "Guest collaboration participant has already been claimed.");
      }
      return alreadyMerged;
    }
    const merged = [];
    const now = new Date().toISOString();
    for (const event of matching) {
      const target = this.data.collaborationEvents.find((candidate) => (
        candidate !== event
        && collaborationEventKey(candidate) === collaborationEventKey({
          requestType: normalizedRequestType,
          requestId: normalizedRequestId,
          participantType: "user",
          participantId: userId,
          actionType: event.actionType,
        })
      ));
      if (target) {
        this.data.collaborationEvents.splice(this.data.collaborationEvents.indexOf(target), 1);
      }
      event.participantType = "user";
      event.participantId = userId;
      event.displayNameSnapshot = userName;
      event.avatarSnapshot = userAvatar;
      event.updatedAt = now;
      event.mergedAt = now;
      event.mergedFromGuestId = normalizedGuestId;
      merged.push(event);
    }
    await this.save();
    return merged;
  }

  async getHouseholdCollaborationEvents(userId, householdId, { limit = 30 } = {}) {
    await this.load();
    this.requireFormalMemberHousehold(userId, householdId);
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Math.max(1, Math.min(100, Number.isFinite(parsedLimit) ? parsedLimit : 30));
    return this.data.collaborationEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.householdId === householdId)
      .sort((left, right) => (
        Date.parse(right.event.createdAt) - Date.parse(left.event.createdAt)
        || left.index - right.index
      ))
      .slice(0, safeLimit)
      .map(({ event }) => structuredClone(event));
  }

  nextGuestCollaborationAlias(requestType, requestId, participantId) {
    const guestIds = [];
    this.data.collaborationEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.requestType === requestType && event.requestId === requestId)
      .sort((left, right) => (
        Date.parse(left.event.createdAt) - Date.parse(right.event.createdAt)
        || right.index - left.index
      ))
      .forEach(({ event }) => {
        const guestId = event.participantType === "guest" ? event.participantId : event.mergedFromGuestId;
        if (guestId && !guestIds.includes(guestId)) guestIds.push(guestId);
      });
    const guestIndex = guestIds.indexOf(participantId);
    return `游客 ${guestIndex >= 0 ? guestIndex + 1 : guestIds.length + 1}`;
  }

  async createCraveRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const now = new Date().toISOString();
    const deadlineAt = resolveCraveDeadline(payload.deadlineAt, now);
    const token = randomUUID().replaceAll("-", "");
    const ownerSecret = randomUUID().replaceAll("-", "");
    const household = ownerUserId
      ? await this.requireOwnedHouseholdForUser(ownerUserId)
      : null;
    const householdMemberIds = new Set((household?.members ?? []).map((member) => member.memberId));
    const recipientIds = [...new Set((Array.isArray(payload.recipientIds) ? payload.recipientIds : [])
      .map((memberId) => sanitizeText(memberId, "", 80))
      .filter((memberId) => memberId && memberId !== ownerUserId && householdMemberIds.has(memberId)))]
      .slice(0, 20);
    const request = {
      id: randomUUID(),
      token,
      ownerSecret,
      householdId: household?.id ?? null,
      initiatorId: ownerUserId ?? null,
      householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
      initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
      recipientIds,
      mealType: sanitizeText(payload.mealType, "dinner", 24),
      initialFeelingTag: sanitizeText(payload.initialFeelingTag || payload.starterFeeling, "随便都行", 32),
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
    const request = this.data.craveRequests.find((item) => item.token === token) ?? null;
    if (expireCraveRequestIfNeeded(request)) await this.save();
    return request;
  }

  async addCraveVote(token, vote = {}, participant = {}) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    if (expireCraveRequestIfNeeded(request)) {
      await this.save();
      return request;
    }
    if (request.status !== "open") return request;
    const trustedParticipant = sanitizeTrustedCollaborationParticipant(participant);
    const event = await this.recordCollaborationEvent({
      requestType: "crave",
      requestId: request.id,
      householdId: request.householdId,
      participantType: trustedParticipant.type,
      participantId: trustedParticipant.id,
      displayNameSnapshot: trustedParticipant.displayName,
      avatarSnapshot: trustedParticipant.avatar,
      actionType: "crave_vote",
      payload: vote,
    });
    const now = new Date().toISOString();
    const participantKey = trustedParticipant.id;
    const existing = request.votes.find((item) => item.participantKey === participantKey);
    const nextVote = {
      id: existing?.id || randomUUID(),
      participantKey,
      memberName: event.displayNameSnapshot,
      memberId: trustedParticipant.type === "user" ? trustedParticipant.id : undefined,
      feelingTag: sanitizeText(vote.feelingTag, "随便都行", 32),
      dishWish: sanitizeText(vote.dishWish, "", 80),
      note: sanitizeText(vote.note, "", 80),
      temporary: trustedParticipant.type === "guest",
      createdAt: existing?.createdAt || now,
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
    const participantKey = collaborationGuestParticipantId(claim);
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

    this.assertCollaborationActionClaimable(vote, userId);
    const user = this.data.users.find((item) => item.id === userId);
    const mergedEvents = await this.mergeGuestCollaborationEvents({
      requestType: "crave",
      requestId: request.id,
      guestParticipantId: participantKey,
      user: { id: userId },
    });
    const event = mergedEvents.find((item) => item.actionType === "crave_vote");
    if (!event) throw codedError("collaboration_participant_not_found", "Guest collaboration event not found for this vote.");
    const now = new Date().toISOString();
    vote.memberId = userId;
    vote.memberName = event.displayNameSnapshot || user?.displayName || "Humi 用户";
    vote.temporary = false;
    vote.claimedAt ||= now;
    vote.mergedAt ||= event.mergedAt || now;
    vote.claimedByUserId = userId;
    request.updatedAt = now;
    await this.save();
    return { request, mergedEvents };
  }

  async closeCraveRequest(token, ownerSecret, resultSummary = null, ownerUserId = null) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    const authenticatedOwner = Boolean(ownerUserId && request.initiatorId === ownerUserId);
    if (!authenticatedOwner && request.ownerSecret !== ownerSecret) {
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

  async createGroceryShareRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const household = ownerUserId
      ? await this.requireOwnedHouseholdForUser(ownerUserId)
      : null;
    const now = new Date().toISOString();
    const items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 80).map((item, index) => ({
      id: sanitizeText(item.id, `item-${index}`, 80),
      name: sanitizeText(item.name, "食材", 40),
      amount: sanitizeText(item.amount, "", 40),
      category: sanitizeText(item.category, "", 40),
      checked: Boolean(item.checked),
    }));
    const request = {
      id: randomUUID(),
      token: randomUUID().replaceAll("-", ""),
      ownerSecret: randomUUID().replaceAll("-", ""),
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
    this.data.groceryShareRequests ??= [];
    this.data.groceryShareRequests.unshift(request);
    this.data.groceryShareRequests = this.data.groceryShareRequests.slice(0, 2000);
    await this.save();
    return request;
  }

  async getGroceryShareRequest(token) {
    await this.load();
    this.data.groceryShareRequests ??= [];
    return this.data.groceryShareRequests.find((item) => item.token === token) ?? null;
  }

  async addGroceryShareClaim(token, claim = {}, participant = {}) {
    await this.load();
    const request = this.data.groceryShareRequests.find((item) => item.token === token);
    if (!request || request.status !== "open") return request;
    const trustedParticipant = sanitizeTrustedCollaborationParticipant(participant);
    const claimStatus = claim.status === "declined" ? "declined" : "claimed";
    const itemIds = sanitizeClaimItemIds(claim.itemIds, request.items, claimStatus !== "declined");
    const note = sanitizeText(claim.note, "", 80);
    const event = await this.recordCollaborationEvent({
      requestType: "grocery",
      requestId: request.id,
      householdId: request.householdId,
      participantType: trustedParticipant.type,
      participantId: trustedParticipant.id,
      displayNameSnapshot: trustedParticipant.displayName,
      avatarSnapshot: trustedParticipant.avatar,
      actionType: "grocery_claim",
      payload: { status: claimStatus, itemIds, note },
    });
    const now = new Date().toISOString();
    const participantKey = trustedParticipant.id;
    const existing = request.claims.find((item) => item.participantKey === participantKey);
    const nextClaim = {
      id: existing?.id || randomUUID(),
      participantKey,
      memberName: event.displayNameSnapshot,
      memberId: trustedParticipant.type === "user" ? trustedParticipant.id : undefined,
      status: claimStatus,
      itemIds,
      note,
      temporary: trustedParticipant.type === "guest",
      createdAt: existing?.createdAt || now,
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
    if (!request || request.status !== "open") return request;
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
    const participantKey = collaborationGuestParticipantId(claim);
    if (!participantKey) throw codedError("missing_participant_key", "participantKey is required.");
    const participantClaim = request.claims.find((item) => item.participantKey === participantKey);
    if (!participantClaim) throw codedError("claim_not_found", "Temporary grocery claim not found.");
    this.assertCollaborationActionClaimable(participantClaim, userId);
    const user = this.data.users.find((item) => item.id === userId);
    const mergedEvents = await this.mergeGuestCollaborationEvents({
      requestType: "grocery",
      requestId: request.id,
      guestParticipantId: participantKey,
      user: { id: userId },
    });
    const event = mergedEvents.find((item) => item.actionType === "grocery_claim");
    if (!event) throw codedError("collaboration_participant_not_found", "Guest collaboration event not found for this claim.");
    const now = new Date().toISOString();
    participantClaim.memberId = userId;
    participantClaim.memberName = event.displayNameSnapshot || user?.displayName || "Humi 用户";
    participantClaim.temporary = false;
    participantClaim.mergedAt ||= event.mergedAt || now;
    participantClaim.claimedByUserId = userId;
    request.updatedAt = now;
    await this.save();
    return { request, mergedEvents };
  }

  async createMenuShareRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const household = ownerUserId
      ? await this.requireOwnedHouseholdForUser(ownerUserId)
      : null;
    const now = new Date().toISOString();
    const dishes = (Array.isArray(payload.dishes) ? payload.dishes : []).slice(0, 20).map((dish, index) => ({
      id: sanitizeText(dish.id, `dish-${index}`, 80),
      recipeId: sanitizeText(dish.recipeId || dish.id, "", 80),
      name: sanitizeText(dish.name, "一道菜", 48),
      quantity: Math.max(1, Math.min(12, Number.parseInt(dish.quantity, 10) || 1)),
      category: sanitizeText(dish.category, "", 40),
      timeMinutes: Math.max(0, Math.min(240, Number.parseInt(dish.timeMinutes, 10) || 0)),
    })).filter((dish) => dish.name);
    const request = {
      id: randomUUID(),
      token: randomUUID().replaceAll("-", ""),
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
      ? await this.requireOwnedHouseholdForUser(ownerUserId)
      : null;
    const now = new Date().toISOString();
    const request = {
      id: randomUUID(),
      token: randomUUID().replaceAll("-", ""),
      ownerSecret: randomUUID().replaceAll("-", ""),
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

  async addWishShareEntry(token, wish = {}, participant = {}) {
    await this.load();
    const request = this.data.wishShareRequests.find((item) => item.token === token);
    if (!request || request.status !== "open") return request;
    const trustedParticipant = sanitizeTrustedCollaborationParticipant(participant);
    const event = await this.recordCollaborationEvent({
      requestType: "wish",
      requestId: request.id,
      householdId: request.householdId,
      participantType: trustedParticipant.type,
      participantId: trustedParticipant.id,
      displayNameSnapshot: trustedParticipant.displayName,
      avatarSnapshot: trustedParticipant.avatar,
      actionType: "wish_entry",
      payload: wish,
    });
    const now = new Date().toISOString();
    const participantKey = trustedParticipant.id;
    const existing = request.wishes.find((item) => item.participantKey === participantKey);
    const nextWish = {
      id: existing?.id || randomUUID(),
      participantKey,
      memberName: event.displayNameSnapshot,
      memberId: trustedParticipant.type === "user" ? trustedParticipant.id : undefined,
      dishName: sanitizeText(wish.dishName, "想吃的菜", 40),
      note: sanitizeText(wish.note, "", 80),
      temporary: trustedParticipant.type === "guest",
      createdAt: existing?.createdAt || now,
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
    const participantKey = collaborationGuestParticipantId(claim);
    if (!participantKey) throw codedError("missing_participant_key", "participantKey is required.");
    const wish = request.wishes.find((item) => item.participantKey === participantKey);
    if (!wish) throw codedError("wish_not_found", "Temporary wish not found.");
    this.assertCollaborationActionClaimable(wish, userId);
    const user = this.data.users.find((item) => item.id === userId);
    const mergedEvents = await this.mergeGuestCollaborationEvents({
      requestType: "wish",
      requestId: request.id,
      guestParticipantId: participantKey,
      user: { id: userId },
    });
    const event = mergedEvents.find((item) => item.actionType === "wish_entry");
    if (!event) throw codedError("collaboration_participant_not_found", "Guest collaboration event not found for this wish.");
    const now = new Date().toISOString();
    wish.memberId = userId;
    wish.memberName = event.displayNameSnapshot || user?.displayName || "Humi 用户";
    wish.temporary = false;
    wish.mergedAt ||= event.mergedAt || now;
    wish.claimedByUserId = userId;
    request.updatedAt = now;
    await this.save();
    return { request, mergedEvents };
  }

  assertCollaborationActionClaimable(action, userId) {
    const claimedByUserId = sanitizeText(action?.claimedByUserId || action?.memberId, "", 100);
    if (claimedByUserId && claimedByUserId !== userId) {
      throw codedError("collaboration_already_claimed", "Guest collaboration participant has already been claimed.");
    }
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

  requireFormalMemberHousehold(userId, householdId) {
    const household = this.findHouseholdsByMember(userId).find((item) => item.id === householdId);
    if (!household) {
      throw codedError("household_not_found", "Household not found for user.");
    }
    return household;
  }

  repairActiveHouseholds() {
    this.data.activeHouseholds ??= {};
    for (const userId of Object.keys(this.data.activeHouseholds)) {
      const activeHouseholdId = this.data.activeHouseholds[userId];
      const households = this.findHouseholdsByMember(userId);
      if (households.some((household) => household.id === activeHouseholdId)) continue;
      if (households[0]) this.data.activeHouseholds[userId] = households[0].id;
      else delete this.data.activeHouseholds[userId];
    }
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

function sanitizeCollaborationRequestType(value) {
  if (["crave", "grocery", "wish"].includes(value)) return value;
  throw codedError("collaboration_event_invalid", "Unsupported collaboration request type.");
}

function sanitizeCollaborationActionType(value) {
  if (["crave_vote", "grocery_claim", "wish_entry"].includes(value)) return value;
  throw codedError("collaboration_event_invalid", "Unsupported collaboration action type.");
}

function sanitizeCollaborationParticipantType(value) {
  if (["user", "guest"].includes(value)) return value;
  throw codedError("collaboration_event_invalid", "Unsupported collaboration participant type.");
}

function sanitizeTrustedCollaborationParticipant(participant = {}) {
  const type = sanitizeCollaborationParticipantType(participant.type);
  const id = sanitizeText(participant.id, "", 100);
  if (!id) throw codedError("collaboration_event_invalid", "Collaboration participant id is required.");
  return {
    type,
    id,
    displayName: type === "user" ? sanitizeText(participant.displayName, "Humi 用户", 32) : "",
    avatar: type === "user" ? sanitizeText(participant.avatar, "", 240) : "",
  };
}

function collaborationGuestParticipantId(claim = {}) {
  return sanitizeText(claim.guestParticipantId, "", 100)
    || sanitizeText(claim.participantKey, "", 80);
}

function collaborationEventKey(event) {
  return [
    event.requestType,
    event.requestId,
    event.participantType,
    event.participantId,
    event.actionType,
  ].join(":");
}

function sanitizeCollaborationPayload(actionType, payload = {}) {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  if (actionType === "crave_vote") {
    return copyDefinedCollaborationPayload({
      feelingTag: sanitizeText(value.feelingTag, "", 32),
      dishWish: sanitizeText(value.dishWish, "", 80),
      note: sanitizeText(value.note, "", 80),
    });
  }
  if (actionType === "grocery_claim") {
    return copyDefinedCollaborationPayload({
      status: value.status === "declined" ? "declined" : "claimed",
      itemIds: [...new Set((Array.isArray(value.itemIds) ? value.itemIds : [])
        .map((itemId) => sanitizeText(itemId, "", 80))
        .filter(Boolean))].slice(0, 120),
      note: sanitizeText(value.note, "", 80),
    });
  }
  return copyDefinedCollaborationPayload({
    dishName: sanitizeText(value.dishName, "想吃的菜", 40),
    note: sanitizeText(value.note, "", 80),
  });
}

function copyDefinedCollaborationPayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => (
    Array.isArray(value) ? value.length > 0 : value !== ""
  )));
}

function defaultAvatarKey(userId) {
  const digest = createHash("sha256").update(String(userId || "")).digest();
  return DEFAULT_AVATAR_KEYS[digest.readUInt32BE(0) % DEFAULT_AVATAR_KEYS.length];
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sanitizeClaimItemIds(itemIds, items = [], fallbackToAll = false) {
  const validIds = new Set(items.map((item) => item.id));
  const sanitized = [...new Set((Array.isArray(itemIds) ? itemIds : [])
    .map((itemId) => sanitizeText(itemId, "", 80))
    .filter((itemId) => validIds.has(itemId)))];
  if (sanitized.length > 0 || !fallbackToAll) return sanitized;
  return [...validIds];
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

function mergeClientRecommendationAccess(currentAccess = {}, clientAccess = {}) {
  const current = normalizeRecommendationAccess(currentAccess);
  const incoming = normalizeRecommendationAccess(clientAccess);
  return {
    plan: current.plan,
    preciseTrialRemaining: current.plan === "plus"
      ? current.preciseTrialRemaining
      : Math.min(current.preciseTrialRemaining, incoming.preciseTrialRemaining),
    preciseUsed: Math.max(current.preciseUsed, incoming.preciseUsed),
  };
}

function mergeMemberWritableState(currentState = {}, incomingState = {}, userId) {
  const existingWantItems = Array.isArray(currentState.wantToEatItems) ? currentState.wantToEatItems : [];
  const incomingWantItems = (Array.isArray(incomingState.wantToEatItems) ? incomingState.wantToEatItems : [])
    .filter((item) => item.memberId === userId);
  const preservedWantItems = existingWantItems.filter((item) => item.memberId !== userId);

  const existingClaims = currentState.groceryClaims && typeof currentState.groceryClaims === "object"
    ? currentState.groceryClaims
    : {};
  const incomingClaims = incomingState.groceryClaims && typeof incomingState.groceryClaims === "object"
    ? incomingState.groceryClaims
    : {};
  const preservedClaims = Object.fromEntries(
    Object.entries(existingClaims).filter(([, claim]) => claim?.memberId !== userId),
  );
  const ownClaims = Object.fromEntries(
    Object.entries(incomingClaims).filter(([, claim]) => claim?.memberId === userId),
  );
  const completedOwnKeys = Object.values(ownClaims)
    .filter((claim) => claim?.status === "done" && claim.itemKey)
    .map((claim) => claim.itemKey);

  return {
    ...currentState,
    wantToEatItems: [...preservedWantItems, ...incomingWantItems].slice(0, 200),
    groceryClaims: { ...preservedClaims, ...ownClaims },
    checkedItems: {
      ...(currentState.checkedItems ?? {}),
      ...Object.fromEntries(completedOwnKeys.map((key) => [key, true])),
    },
  };
}

function resolveCraveDeadline(value, createdAt) {
  const explicitTime = Date.parse(String(value ?? ""));
  if (Number.isFinite(explicitTime)) {
    return new Date(explicitTime).toISOString();
  }
  const createdTime = Date.parse(createdAt);
  return new Date((Number.isFinite(createdTime) ? createdTime : Date.now()) + 30 * 60 * 1000).toISOString();
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

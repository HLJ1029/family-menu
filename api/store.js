import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  buildRecommendationScope,
  normalizeRecommendationFeedbackValue,
  recommendationStateVersion,
  selectBalancedDinner,
} from "./recommendation-rotation.js";

const require = createRequire(import.meta.url);
export const APPROVED_AVATAR_KEYS = Object.freeze([...require("./data/approved-avatar-keys.json")]);
const DEFAULT_AVATAR_KEYS = APPROVED_AVATAR_KEYS;

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
  mealRuns: [],
  mealTasks: [],
  mealReminders: [],
  productEvents: [],
  recommendationRotations: [],
  revokedTokens: [],
  h5Tickets: [],
};

export class HumiStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.data = structuredClone(DEFAULT_DATA);
    this.loaded = false;
  }

  async load({ waitForTransaction = true } = {}) {
    if (waitForTransaction && this.transactionQueue) await this.transactionQueue;
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
    this.data.mealRuns = Array.isArray(this.data.mealRuns) ? this.data.mealRuns : [];
    this.data.mealTasks = Array.isArray(this.data.mealTasks) ? this.data.mealTasks : [];
    this.data.mealReminders = Array.isArray(this.data.mealReminders) ? this.data.mealReminders : [];
    this.data.productEvents = Array.isArray(this.data.productEvents) ? this.data.productEvents : [];
    this.data.recommendationRotations = Array.isArray(this.data.recommendationRotations)
      ? this.data.recommendationRotations
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
    await writeFile(tmpPath, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    await rename(tmpPath, this.filePath);
  }

  async mutateAndSave(mutation) {
    const pendingSaves = (this.saveQueue ?? Promise.resolve()).then(() => undefined, () => undefined);
    const run = async () => {
      await pendingSaves;
      const snapshot = structuredClone(this.data);
      try {
        const result = await mutation();
        await this.save();
        return result;
      } catch (error) {
        this.data = snapshot;
        throw error;
      }
    };
    const transaction = (this.transactionQueue ?? Promise.resolve()).then(run, run);
    this.transactionQueue = transaction.then(() => undefined, () => undefined);
    return transaction;
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
    const avatarKey = sanitizeText(profile.avatarKey, "", 80);
    if (avatarKey && !APPROVED_AVATAR_KEYS.includes(avatarKey)) {
      throw codedError("invalid_avatar_key", "avatarKey must be approved.");
    }
    if (user.profileStatus !== "complete" && !avatarKey && !user.avatarUrl) {
      throw codedError("avatar_required", "An explicit approved avatar or uploaded avatar is required.");
    }
    user.displayName = displayName;
    if (avatarKey) user.avatarKey = avatarKey;
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

  async getBootstrapSnapshot(userId, { dateKey } = {}) {
    await this.load();
    const households = this.findHouseholdsByMember(userId);
    const activeHousehold = this.findActiveHouseholdByMember(userId);
    const state = activeHousehold ? this.data.householdStates[activeHousehold.id] ?? null : null;
    const mealRun = activeHousehold && dateKey
      ? this.data.mealRuns.find((run) => (
        run.householdId === activeHousehold.id
        && run.dateKey === sanitizeDateKey(dateKey)
        && run.mealSlot === "dinner"
        && run.status !== "abandoned"
      )) ?? null
      : null;
    return structuredClone({ households, activeHousehold, state, mealRun });
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
    return this.mutateAndSave(() => {
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
      this.syncFormalMemberPreferences(household);
      delete this.data.states[memberId];
      household.updatedAt = new Date().toISOString();
      this.repairActiveHouseholds();
      return household;
    });
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
    return this.mutateAndSave(() => {
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
        this.retireHouseholdState(household.id);
        delete this.data.states[userId];
        this.repairActiveHouseholds();
        return { household: null, activeHousehold: this.findActiveHouseholdByMember(userId) };
      }

      household.members = household.members.filter((member) => member.memberId !== userId);
      this.syncFormalMemberPreferences(household);
      delete this.data.states[userId];
      household.updatedAt = now;
      this.repairActiveHouseholds();
      return { household, activeHousehold: this.findActiveHouseholdByMember(userId) };
    });
  }

  syncFormalMemberPreferences(household) {
    const householdId = household?.id;
    if (!householdId) return;
    const formalMemberIds = new Set((Array.isArray(household.members) ? household.members : [])
      .filter((member) => member?.status === "formal" && member.memberId)
      .map((member) => member.memberId));
    const currentState = this.data.householdStates[householdId];
    const filterPreferences = (state = {}) => ({
      ...state,
      familyMembers: normalizeMemberPreferenceEntries(state.familyMembers)
        .filter((member) => formalMemberIds.has(member.memberId)),
    });
    const nextState = currentState ? filterPreferences(currentState) : null;
    if (nextState) this.data.householdStates[householdId] = nextState;
    for (const [stateUserId, state] of Object.entries(this.data.states ?? {})) {
      if (state !== currentState && state?.householdId !== householdId) continue;
      this.data.states[stateUserId] = nextState ?? filterPreferences(state);
    }
  }

  retireHouseholdState(householdId) {
    const currentState = this.data.householdStates[householdId];
    delete this.data.householdStates[householdId];
    for (const [stateUserId, state] of Object.entries(this.data.states ?? {})) {
      if (state === currentState || state?.householdId === householdId) {
        delete this.data.states[stateUserId];
      }
    }
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
    const familyMembers = mergeFormalMemberPreferences({
      current: currentState.familyMembers,
      incoming: state.familyMembers,
      household,
      userId,
    });
    const nextState = {
      ...writableState,
      familyMembers,
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

  async recordCollaborationEvent(input = {}, { persist = true } = {}) {
    await this.load({ waitForTransaction: persist });
    if (persist) return this.mutateAndSave(() => this.recordCollaborationEvent(input, { persist: false }));
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
    return existing || next;
  }

  async mergeGuestCollaborationEvents({ requestType, requestId, guestParticipantId, user } = {}, { persist = true } = {}) {
    await this.load({ waitForTransaction: persist });
    if (persist) return this.mutateAndSave(() => this.mergeGuestCollaborationEvents({ requestType, requestId, guestParticipantId, user }, { persist: false }));
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
    if (!request) return null;
    const projection = structuredClone(request);
    expireCraveRequestIfNeeded(projection);
    return projection;
  }

  async addCraveVote(token, vote = {}, participant = {}) {
    await this.load();
    const request = this.data.craveRequests.find((item) => item.token === token);
    if (!request) return null;
    return this.mutateAndSave(async () => {
      const request = this.data.craveRequests.find((item) => item.token === token);
      if (!request) return null;
      if (expireCraveRequestIfNeeded(request) || request.status !== "open") return request;
      const trustedParticipant = sanitizeTrustedCollaborationParticipant(participant);
      const event = await this.recordCollaborationEvent({
        requestType: "crave", requestId: request.id, householdId: request.householdId,
        participantType: trustedParticipant.type, participantId: trustedParticipant.id,
        displayNameSnapshot: trustedParticipant.displayName, avatarSnapshot: trustedParticipant.avatar,
        actionType: "crave_vote", payload: vote,
      }, { persist: false });
      const now = new Date().toISOString();
      const participantKey = trustedParticipant.id;
      const existing = request.votes.find((item) => item.participantKey === participantKey);
      const identity = canonicalActionIdentity(event, trustedParticipant);
      const nextVote = {
        id: existing?.id || randomUUID(), participantKey, memberName: event.displayNameSnapshot,
        memberId: identity.type === "user" ? identity.id : undefined,
        feelingTag: sanitizeText(vote.feelingTag, "随便都行", 32), dishWish: sanitizeText(vote.dishWish, "", 80), note: sanitizeText(vote.note, "", 80),
        temporary: identity.type === "guest", createdAt: existing?.createdAt || now,
        claimedAt: existing?.claimedAt, mergedAt: existing?.mergedAt || identity.mergedAt, claimedByUserId: existing?.claimedByUserId || identity.claimedByUserId,
      };
      const existingIndex = request.votes.findIndex((item) => item.participantKey === participantKey);
      if (existingIndex >= 0) request.votes[existingIndex] = nextVote;
      else request.votes.push(nextVote);
      request.updatedAt = now;
      return request;
    });
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
    return this.mutateAndSave(async () => {
      const request = this.data.craveRequests.find((item) => item.token === token);
      if (!request) return null;
      const vote = request.votes.find((item) => item.participantKey === participantKey);
      if (!vote) throw codedError("vote_not_found", "Temporary vote not found.");
      this.assertCollaborationActionClaimable(vote, userId);
      const user = this.data.users.find((item) => item.id === userId);
      const mergedEvents = await this.mergeGuestCollaborationEvents({ requestType: "crave", requestId: request.id, guestParticipantId: participantKey, user: { id: userId } }, { persist: false });
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
      return { request, mergedEvents };
    });
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
    const idempotencyKey = sanitizeText(payload.idempotencyKey, "", 100);
    const items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 80).map((item, index) => ({
      id: sanitizeText(item.id, `item-${index}`, 80),
      name: sanitizeText(item.name, "食材", 40),
      amount: sanitizeText(item.amount, "", 40),
      category: sanitizeText(item.category, "", 40),
      checked: Boolean(item.checked),
    }));
    return this.mutateAndSave(() => {
      this.data.groceryShareRequests ??= [];
      if (ownerUserId && idempotencyKey) {
        const existing = this.data.groceryShareRequests.find((item) => (
          item.ownerId === ownerUserId
          && item.householdId === household?.id
          && item.idempotencyKey === idempotencyKey
        ));
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const request = {
        id: randomUUID(),
        token: randomUUID().replaceAll("-", ""),
        ownerSecret: randomUUID().replaceAll("-", ""),
        householdId: household?.id || sanitizeText(payload.householdId, "", 80),
        ownerId: ownerUserId || sanitizeText(payload.ownerId, "", 80),
        idempotencyKey,
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
      return request;
    });
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
    return this.mutateAndSave(async () => {
      const request = this.data.groceryShareRequests.find((item) => item.token === token);
      if (!request || request.status !== "open") return request;
      const trustedParticipant = sanitizeTrustedCollaborationParticipant(participant);
      const claimStatus = claim.status === "declined" ? "declined" : "claimed";
      const itemIds = sanitizeClaimItemIds(claim.itemIds, request.items, claimStatus !== "declined");
      const note = sanitizeText(claim.note, "", 80);
      const event = await this.recordCollaborationEvent({
        requestType: "grocery", requestId: request.id, householdId: request.householdId,
        participantType: trustedParticipant.type, participantId: trustedParticipant.id,
        displayNameSnapshot: trustedParticipant.displayName, avatarSnapshot: trustedParticipant.avatar,
        actionType: "grocery_claim", payload: { status: claimStatus, itemIds, note },
      }, { persist: false });
      const now = new Date().toISOString();
      const participantKey = trustedParticipant.id;
      const existing = request.claims.find((item) => item.participantKey === participantKey);
      const identity = canonicalActionIdentity(event, trustedParticipant);
      const nextClaim = {
        id: existing?.id || randomUUID(), participantKey, memberName: event.displayNameSnapshot,
        memberId: identity.type === "user" ? identity.id : undefined,
        status: claimStatus, itemIds, note, temporary: identity.type === "guest", createdAt: existing?.createdAt || now,
        mergedAt: existing?.mergedAt || identity.mergedAt, claimedByUserId: existing?.claimedByUserId || identity.claimedByUserId,
      };
      const existingIndex = request.claims.findIndex((item) => item.participantKey === participantKey);
      if (existingIndex >= 0) request.claims[existingIndex] = nextClaim;
      else request.claims.push(nextClaim);
      request.updatedAt = now;
      return request;
    });
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
    return this.mutateAndSave(async () => {
      const request = this.data.groceryShareRequests.find((item) => item.token === token);
      if (!request) return null;
      const participantClaim = request.claims.find((item) => item.participantKey === participantKey);
      if (!participantClaim) throw codedError("claim_not_found", "Temporary grocery claim not found.");
      this.assertCollaborationActionClaimable(participantClaim, userId);
      const user = this.data.users.find((item) => item.id === userId);
      const mergedEvents = await this.mergeGuestCollaborationEvents({ requestType: "grocery", requestId: request.id, guestParticipantId: participantKey, user: { id: userId } }, { persist: false });
      const event = mergedEvents.find((item) => item.actionType === "grocery_claim");
      if (!event) throw codedError("collaboration_participant_not_found", "Guest collaboration event not found for this claim.");
      const now = new Date().toISOString();
      participantClaim.memberId = userId;
      participantClaim.memberName = event.displayNameSnapshot || user?.displayName || "Humi 用户";
      participantClaim.temporary = false;
      participantClaim.mergedAt ||= event.mergedAt || now;
      participantClaim.claimedByUserId = userId;
      request.updatedAt = now;
      return { request, mergedEvents };
    });
  }

  async createMenuShareRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const household = ownerUserId
      ? await this.requireOwnedHouseholdForUser(ownerUserId)
      : null;
    const idempotencyKey = sanitizeText(payload.idempotencyKey, "", 100);
    const dishes = (Array.isArray(payload.dishes) ? payload.dishes : []).slice(0, 20).map((dish, index) => ({
      id: sanitizeText(dish.id, `dish-${index}`, 80),
      recipeId: sanitizeText(dish.recipeId || dish.id, "", 80),
      name: sanitizeText(dish.name, "一道菜", 48),
      quantity: Math.max(1, Math.min(12, Number.parseInt(dish.quantity, 10) || 1)),
      category: sanitizeText(dish.category, "", 40),
      timeMinutes: Math.max(0, Math.min(240, Number.parseInt(dish.timeMinutes, 10) || 0)),
    })).filter((dish) => dish.name);
    return this.mutateAndSave(() => {
      this.data.menuShareRequests ??= [];
      if (ownerUserId && idempotencyKey) {
        const existing = this.data.menuShareRequests.find((item) => (
          item.ownerId === ownerUserId
          && item.householdId === household?.id
          && item.idempotencyKey === idempotencyKey
        ));
        if (existing) return existing;
      }
      const now = new Date().toISOString();
      const request = {
        id: randomUUID(),
        token: randomUUID().replaceAll("-", ""),
        householdId: household?.id || sanitizeText(payload.householdId, "", 80),
        ownerId: ownerUserId || sanitizeText(payload.ownerId, "", 80),
        idempotencyKey,
        householdName: sanitizeText(payload.householdName, household?.name || "我家", 32),
        initiatorName: sanitizeText(payload.initiatorName, "主厨", 32),
        title: sanitizeText(payload.title, "Humi 今晚菜单", 80),
        status: "open",
        dishes,
        groceryCount: Math.max(0, Math.min(200, Number.parseInt(payload.groceryCount, 10) || 0)),
        createdAt: now,
        updatedAt: now,
      };
      this.data.menuShareRequests.unshift(request);
      this.data.menuShareRequests = this.data.menuShareRequests.slice(0, 2000);
      return request;
    });
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
    return this.mutateAndSave(async () => {
      const request = this.data.wishShareRequests.find((item) => item.token === token);
      if (!request || request.status !== "open") return request;
      const trustedParticipant = sanitizeTrustedCollaborationParticipant(participant);
      const event = await this.recordCollaborationEvent({
        requestType: "wish", requestId: request.id, householdId: request.householdId,
        participantType: trustedParticipant.type, participantId: trustedParticipant.id,
        displayNameSnapshot: trustedParticipant.displayName, avatarSnapshot: trustedParticipant.avatar,
        actionType: "wish_entry", payload: wish,
      }, { persist: false });
      const now = new Date().toISOString();
      const participantKey = trustedParticipant.id;
      const existing = request.wishes.find((item) => item.participantKey === participantKey);
      const identity = canonicalActionIdentity(event, trustedParticipant);
      const nextWish = {
        id: existing?.id || randomUUID(), participantKey, memberName: event.displayNameSnapshot,
        memberId: identity.type === "user" ? identity.id : undefined,
        dishName: sanitizeText(wish.dishName, "想吃的菜", 40), note: sanitizeText(wish.note, "", 80),
        temporary: identity.type === "guest", createdAt: existing?.createdAt || now,
        mergedAt: existing?.mergedAt || identity.mergedAt, claimedByUserId: existing?.claimedByUserId || identity.claimedByUserId,
      };
      const existingIndex = request.wishes.findIndex((item) => item.participantKey === participantKey);
      if (existingIndex >= 0) request.wishes[existingIndex] = nextWish;
      else request.wishes.push(nextWish);
      request.updatedAt = now;
      return request;
    });
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
    return this.mutateAndSave(async () => {
      const request = this.data.wishShareRequests.find((item) => item.token === token);
      if (!request) return null;
      const wish = request.wishes.find((item) => item.participantKey === participantKey);
      if (!wish) throw codedError("wish_not_found", "Temporary wish not found.");
      this.assertCollaborationActionClaimable(wish, userId);
      const user = this.data.users.find((item) => item.id === userId);
      const mergedEvents = await this.mergeGuestCollaborationEvents({ requestType: "wish", requestId: request.id, guestParticipantId: participantKey, user: { id: userId } }, { persist: false });
      const event = mergedEvents.find((item) => item.actionType === "wish_entry");
      if (!event) throw codedError("collaboration_participant_not_found", "Guest collaboration event not found for this wish.");
      const now = new Date().toISOString();
      wish.memberId = userId;
      wish.memberName = event.displayNameSnapshot || user?.displayName || "Humi 用户";
      wish.temporary = false;
      wish.mergedAt ||= event.mergedAt || now;
      wish.claimedByUserId = userId;
      request.updatedAt = now;
      return { request, mergedEvents };
    });
  }

  async createMealRun(userId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      const householdId = sanitizeText(input.householdId, "", 100);
      const household = this.requireFormalMemberHousehold(userId, householdId);
      if (household.ownerId !== userId) throw codedError("forbidden", "Only the household owner can choose or replace dinner.");
      const dateKey = sanitizeDateKey(input.dateKey);
      const mealSlot = input.mealSlot === "dinner" ? "dinner" : "";
      if (!mealSlot) throw codedError("meal_slot_invalid", "Cook assist currently supports dinner only.");
      const effortTier = sanitizeEffortTier(input.effortTier);
      const recipeIds = sanitizeRecipeIds(input.recipeIds);
      const idempotencyKey = sanitizeText(input.idempotencyKey, "", 100);
      if (!idempotencyKey) throw codedError("idempotency_key_required", "idempotencyKey is required.");
      const syncedFromLocalId = sanitizeText(input.syncedFromLocalId, "", 100);
      const syncedStartedAt = sanitizeSyncedMealStartedAt(input.syncedStartedAt, {
        syncedFromLocalId,
        dateKey,
      });

      const idempotent = this.data.mealRuns.find((run) => (
        run.householdId === householdId && run.idempotencyKey === idempotencyKey
      ));
      if (idempotent) return { mealRun: idempotent, replacedMealRunId: idempotent.replacedMealRunId || "" };

      const current = this.data.mealRuns.find((run) => (
        run.householdId === householdId
        && run.dateKey === dateKey
        && run.mealSlot === mealSlot
        && run.status !== "abandoned"
      ));
      if (current && current.status !== "planned") {
        throw codedError("meal_run_locked", "Cooking or completed dinner cannot be replaced.");
      }

      const now = new Date().toISOString();
      const mealRun = {
        id: randomUUID(),
        householdId,
        dateKey,
        mealSlot,
        effortTier,
        recipeIds,
        recipeSnapshot: structuredClone(input.recipeSnapshot ?? []),
        timelineVersion: Number(input.timelineVersion || 1),
        timeline: null,
        currentStepId: "",
        timers: {},
        timerEndsAt: "",
        readyStaple: sanitizeText(input.readyStaple, "", 40),
        syncedFromLocalId,
        syncedStartedAt,
        status: "planned",
        abandonReason: "",
        feedback: [],
        downgrades: [],
        idempotencyKey,
        createdBy: userId,
        startedBy: "",
        completedBy: "",
        replacedMealRunId: current?.id || "",
        createdAt: now,
        updatedAt: now,
        startedAt: "",
        completedAt: "",
        abandonedAt: "",
      };
      if (current) {
        current.status = "abandoned";
        current.abandonReason = "plans_changed";
        current.abandonedAt = now;
        current.updatedAt = now;
        current.replacedByMealRunId = mealRun.id;
      }
      this.data.mealRuns.unshift(mealRun);
      this.data.mealRuns = this.data.mealRuns.slice(0, 5000);
      return { mealRun, replacedMealRunId: current?.id || "" };
    });
  }

  async rotateDinnerRecommendation(userId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      const householdId = sanitizeText(input.householdId, "", 100);
      const household = this.requireFormalMemberHousehold(userId, householdId);
      const dateKey = sanitizeDateKey(input.dateKey);
      const mode = input.mode === "legacy" ? "legacy" : input.mode === "meal_execution" ? "meal_execution" : "";
      if (!mode) throw codedError("recommendation_mode_invalid", "Unsupported recommendation mode.");
      const effortTier = mode === "meal_execution"
        ? sanitizeEffortTier(input.effortTier)
        : sanitizeText(input.effortTier, "legacy", 24);
      const action = ["initial", "next", "reject"].includes(input.action) ? input.action : "initial";
      const contextFingerprint = sanitizeText(input.contextFingerprint, "", 128);
      const scopeKey = buildRecommendationScope({
        householdId,
        dateKey,
        mode,
        effortTier,
        contextFingerprint,
      });
      const currentMealRun = this.data.mealRuns.find((run) => (
        run.householdId === household.id
        && run.dateKey === dateKey
        && run.mealSlot === "dinner"
        && ["cooking", "completed"].includes(run.status)
      ));
      if (currentMealRun && action !== "initial") {
        throw codedError("meal_run_locked", "Cooking or completed dinner cannot be replaced.");
      }

      this.pruneRecommendationRotations();
      const rotationIndex = this.data.recommendationRotations.findIndex((entry) => entry.scopeKey === scopeKey);
      const currentRotation = rotationIndex >= 0 ? this.data.recommendationRotations[rotationIndex] : null;
      const currentStateVersion = currentRotation ? recommendationStateVersion(currentRotation) : "";
      const expectedStateVersion = sanitizeText(input.stateVersion, "", 128);
      if (action !== "initial" && currentRotation && expectedStateVersion !== currentStateVersion) {
        throw codedError("recommendation_state_conflict", "Recommendation cursor changed; refresh before choosing another group.");
      }

      const state = this.data.householdStates[household.id] ?? {};
      const recommendationFeedback = collectRecommendationFeedback(
        state.recommendationFeedback,
        this.data.mealRuns,
        household.id,
      );
      const targetDishCount = normalizeRecommendationDishCount(input.targetDishCount, mode, effortTier, state.familyProfile);
      const result = selectBalancedDinner({
        householdId,
        dateKey,
        mode,
        effortTier,
        action,
        contextFingerprint,
        targetDishCount,
        rotation: currentRotation,
        familyProfile: state.familyProfile ?? {},
        familyMembers: state.familyMembers ?? [],
        recommendationFeedback,
        pantryItems: state.pantryItems ?? [],
        wantToEatItems: state.wantToEatItems ?? state.wishPool ?? [],
        dislikedRecipeIds: state.dislikedRecipeIds ?? [],
      });
      const persisted = {
        scopeKey: result.rotation.scopeKey,
        householdId: result.rotation.householdId,
        seenRecipeIds: [...result.rotation.seenRecipeIds],
        recentGroupIds: [...result.rotation.recentGroupIds],
        cycle: result.rotation.cycle,
        updatedAt: result.rotation.updatedAt,
      };
      if (rotationIndex >= 0) this.data.recommendationRotations[rotationIndex] = persisted;
      else this.data.recommendationRotations.push(persisted);
      this.pruneRecommendationRotations();
      return structuredClone(result.group);
    });
  }

  pruneRecommendationRotations(now = Date.now()) {
    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    const recent = (this.data.recommendationRotations ?? []).filter((entry) => {
      const updatedAt = Date.parse(entry?.updatedAt || "");
      return Number.isFinite(updatedAt) && updatedAt >= cutoff;
    });
    const perHousehold = new Map();
    for (const entry of recent.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))) {
      const entries = perHousehold.get(entry.householdId) ?? [];
      if (entries.length < 20) entries.push(entry);
      perHousehold.set(entry.householdId, entries);
    }
    this.data.recommendationRotations = [...perHousehold.values()].flat();
  }

  async getCurrentMealRun(userId, { householdId, dateKey, mealSlot = "dinner" } = {}) {
    await this.load();
    this.requireFormalMemberHousehold(userId, householdId);
    return this.data.mealRuns.find((run) => (
      run.householdId === householdId
      && run.dateKey === sanitizeDateKey(dateKey)
      && run.mealSlot === mealSlot
      && run.status !== "abandoned"
    )) ?? null;
  }

  async getMealRunForUser(userId, mealRunId) {
    await this.load();
    return this.requireMealRunForMember(userId, mealRunId);
  }

  async startMealRun(userId, mealRunId, timeline) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      if (mealRun.status === "cooking") return mealRun;
      if (mealRun.status !== "planned") throw codedError("meal_run_transition_invalid", "Only a planned dinner can start cooking.");
      const now = new Date().toISOString();
      const startedAt = mealRun.syncedStartedAt || now;
      mealRun.status = "cooking";
      mealRun.timeline = structuredClone(timeline);
      mealRun.currentStepId = timeline?.steps?.[0]?.id || "";
      mealRun.timers = {};
      const firstStep = timeline?.steps?.[0];
      if (firstStep?.attention === "passive" && !mealRun.syncedStartedAt) {
        const timer = createActualMealTimer(firstStep, startedAt);
        mealRun.timers[timer.stepId] = timer;
        mealRun.timerEndsAt = timer.endsAt;
      } else {
        mealRun.timerEndsAt = "";
      }
      mealRun.startedBy = userId;
      mealRun.startedAt = startedAt;
      mealRun.updatedAt = now;
      return mealRun;
    });
  }

  async updateMealRunProgress(userId, mealRunId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      if (mealRun.status !== "cooking") throw codedError("meal_run_transition_invalid", "Cooking progress can only update an active dinner.");
      const expectedTimelineVersion = Number(input.timelineVersion);
      if (
        !Number.isInteger(expectedTimelineVersion)
        || expectedTimelineVersion <= 0
        || expectedTimelineVersion !== Number(mealRun.timelineVersion || 1)
      ) {
        throw codedError("meal_timeline_version_conflict", "The cooking timeline changed; refresh before saving progress.");
      }
      const currentStepId = sanitizeText(input.currentStepId, "", 160);
      const steps = Array.isArray(mealRun.timeline?.steps) ? mealRun.timeline.steps : [];
      const incomingStepIndex = steps.findIndex((item) => item.id === currentStepId);
      if (incomingStepIndex < 0) throw codedError("meal_step_invalid", "The cooking step does not belong to this dinner.");
      mealRun.timers = normalizeStoredMealTimers(mealRun.timers, steps);
      const incomingTimer = input.timer === undefined
        ? null
        : sanitizeActualMealTimer(input.timer, steps);
      if (incomingTimer && incomingTimer.stepId !== currentStepId) {
        throw codedError("meal_timer_step_invalid", "The timer must belong to the progressed step.");
      }
      if (incomingTimer) assertActualMealTimerBounds(incomingTimer, mealRun);
      const existingTimer = incomingTimer ? mealRun.timers[incomingTimer.stepId] : null;
      if (incomingTimer && !existingTimer) {
        assertActualMealTimerCanStart(incomingTimer, steps, mealRun.timers);
        mealRun.timers[incomingTimer.stepId] = incomingTimer;
      }
      const currentStepIndex = steps.findIndex((item) => item.id === mealRun.currentStepId);
      if (currentStepIndex < incomingStepIndex) {
        const incomingStep = steps[incomingStepIndex];
        assertMealStepCanProgress(incomingStep, steps, mealRun.timers, new Date().toISOString());
        mealRun.currentStepId = currentStepId;
      }
      mealRun.timerEndsAt = incomingTimer
        ? (mealRun.timers[incomingTimer.stepId]?.endsAt || "")
        : mealRun.timerEndsAt || "";
      if (currentStepIndex < incomingStepIndex || (incomingTimer && !existingTimer)) {
        mealRun.updatedAt = new Date().toISOString();
      }
      return mealRun;
    });
  }

  async completeMealRun(userId, mealRunId) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      if (mealRun.status === "completed") return mealRun;
      if (mealRun.status !== "cooking") throw codedError("meal_run_transition_invalid", "Only an active dinner can be served.");
      const now = new Date().toISOString();
      mealRun.status = "completed";
      mealRun.completedBy = userId;
      mealRun.completedAt = now;
      mealRun.timerEndsAt = "";
      mealRun.updatedAt = now;
      return mealRun;
    });
  }

  async downgradeMealRun(userId, mealRunId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      if (!["planned", "cooking"].includes(mealRun.status)) {
        throw codedError("meal_run_transition_invalid", "Only a planned or active dinner can be simplified.");
      }
      const action = sanitizeDowngradeAction(input.action);
      const recipeIds = sanitizeRecipeIds(input.recipeIds);
      const now = new Date().toISOString();
      const previousRecipeIds = [...mealRun.recipeIds];
      const recipeChanged = !sameStringArray(previousRecipeIds, recipeIds);
      mealRun.recipeIds = recipeIds;
      mealRun.recipeSnapshot = structuredClone(input.recipeSnapshot ?? []);
      mealRun.readyStaple = sanitizeText(input.readyStaple, mealRun.readyStaple || "", 40);
      mealRun.downgrades = [...(mealRun.downgrades ?? []), {
        action,
        previousRecipeIds,
        recipeIds: [...recipeIds],
        changedBy: userId,
        changedAt: now,
      }];
      mealRun.timelineVersion = Number(mealRun.timelineVersion || 1) + 1;
      if (mealRun.status === "cooking" && recipeChanged) {
        mealRun.timeline = structuredClone(input.timeline);
        mealRun.currentStepId = input.timeline?.steps?.[0]?.id || "";
        mealRun.timers = {};
        const firstStep = input.timeline?.steps?.[0];
        if (firstStep?.attention === "passive") {
          const timer = createActualMealTimer(firstStep, now);
          mealRun.timers[timer.stepId] = timer;
          mealRun.timerEndsAt = timer.endsAt;
        } else {
          mealRun.timerEndsAt = "";
        }
      }
      mealRun.updatedAt = now;
      return mealRun;
    });
  }

  async abandonMealRun(userId, mealRunId, reason) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      const abandonReason = sanitizeAbandonReason(reason);
      if (mealRun.status === "abandoned") return mealRun;
      if (!["planned", "cooking"].includes(mealRun.status)) throw codedError("meal_run_transition_invalid", "A completed dinner cannot be abandoned.");
      const now = new Date().toISOString();
      mealRun.status = "abandoned";
      mealRun.abandonReason = abandonReason;
      mealRun.abandonedAt = now;
      mealRun.timerEndsAt = "";
      mealRun.updatedAt = now;
      return mealRun;
    });
  }

  async updateMealRunFeedback(userId, mealRunId, value) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      if (mealRun.status !== "completed") throw codedError("meal_run_transition_invalid", "Feedback is available after the dinner is served.");
      const feedbackValue = sanitizeMealFeedback(value);
      const now = new Date().toISOString();
      const existing = mealRun.feedback.find((entry) => entry.userId === userId);
      if (existing) {
        existing.value = feedbackValue;
        existing.updatedAt = now;
      } else {
        mealRun.feedback.push({ userId, value: feedbackValue, createdAt: now, updatedAt: now });
      }
      mealRun.updatedAt = now;
      return mealRun;
    });
  }

  async createMealTask(userId, mealRunId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      const mealRun = this.requireMealRunForMember(userId, mealRunId);
      if (!["planned", "cooking"].includes(mealRun.status)) throw codedError("meal_task_unavailable", "Tasks can only be created before dinner is served.");
      const type = input.type === "buy" || input.type === "prep" ? input.type : "";
      const label = sanitizeText(input.label, "", 64);
      if (!type || !label) throw codedError("meal_task_invalid", "Meal task type and label are required.");
      const now = new Date().toISOString();
      const task = {
        id: randomUUID(),
        token: randomBytes(24).toString("base64url"),
        mealRunId: mealRun.id,
        householdId: mealRun.householdId,
        type,
        label,
        status: "open",
        createdBy: userId,
        claimedBy: "",
        completedBy: "",
        createdAt: now,
        updatedAt: now,
        claimedAt: "",
        completedAt: "",
      };
      this.data.mealTasks.unshift(task);
      this.data.mealTasks = this.data.mealTasks.slice(0, 5000);
      return task;
    });
  }

  async getMealTask(token) {
    await this.load();
    return this.data.mealTasks.find((task) => task.token === token) ?? null;
  }

  async claimMealTask(userId, token) {
    await this.load();
    return this.mutateAndSave(() => {
      const task = this.data.mealTasks.find((entry) => entry.token === token);
      if (!task) return null;
      this.requireFormalMemberHousehold(userId, task.householdId);
      if (task.status === "claimed" && task.claimedBy === userId) return task;
      if (task.status !== "open") throw codedError("meal_task_claimed", "This task is already claimed or completed.");
      const now = new Date().toISOString();
      task.status = "claimed";
      task.claimedBy = userId;
      task.claimedAt = now;
      task.updatedAt = now;
      return task;
    });
  }

  async completeMealTask(userId, token) {
    await this.load();
    return this.mutateAndSave(() => {
      const task = this.data.mealTasks.find((entry) => entry.token === token);
      if (!task) return null;
      const household = this.requireFormalMemberHousehold(userId, task.householdId);
      if (task.status === "completed" && task.completedBy === userId) return task;
      if (task.status !== "claimed" || (task.claimedBy !== userId && household.ownerId !== userId)) {
        throw codedError("meal_task_forbidden", "Only the assignee or household owner can complete this task.");
      }
      const now = new Date().toISOString();
      task.status = "completed";
      task.completedBy = userId;
      task.completedAt = now;
      task.updatedAt = now;
      return task;
    });
  }

  async createMealReminder(userId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      const householdId = sanitizeText(input.householdId, "", 100);
      this.requireFormalMemberHousehold(userId, householdId);
      const scheduledAt = sanitizeIsoDate(input.scheduledAt, "reminder_time_invalid");
      const dateKey = sanitizeDateKey(input.dateKey);
      const effortTier = sanitizeEffortTier(input.effortTier);
      const now = new Date().toISOString();
      const reminder = {
        id: randomUUID(),
        userId,
        householdId,
        dateKey,
        mealSlot: "dinner",
        effortTier,
        scheduledAt,
        nextAttemptAt: scheduledAt,
        status: "scheduled",
        attempts: 0,
        templateId: sanitizeText(input.templateId, "", 120),
        createdAt: now,
        updatedAt: now,
        sentAt: "",
        cancelledAt: "",
        failedAt: "",
        lastError: "",
      };
      this.data.mealReminders.unshift(reminder);
      this.data.mealReminders = this.data.mealReminders.slice(0, 5000);
      return reminder;
    });
  }

  async cancelMealReminder(userId, reminderId) {
    await this.load();
    return this.mutateAndSave(() => {
      const reminder = this.data.mealReminders.find((entry) => entry.id === reminderId);
      if (!reminder) return null;
      if (reminder.userId !== userId) throw codedError("forbidden", "Only the reminder owner can cancel it.");
      if (["sent", "failed", "cancelled"].includes(reminder.status)) return reminder;
      const now = new Date().toISOString();
      reminder.status = "cancelled";
      reminder.cancelledAt = now;
      reminder.updatedAt = now;
      return reminder;
    });
  }

  async getDueMealReminders(now = new Date().toISOString()) {
    await this.load();
    const nowMs = Date.parse(now);
    return this.data.mealReminders.filter((reminder) => (
      ["scheduled", "retrying"].includes(reminder.status)
      && Date.parse(reminder.nextAttemptAt || reminder.scheduledAt) <= nowMs
    ));
  }

  async shouldCancelMealReminder(reminder) {
    await this.load();
    return this.data.mealRuns.some((run) => (
      run.householdId === reminder.householdId
      && run.dateKey === reminder.dateKey
      && run.mealSlot === reminder.mealSlot
      && ["completed", "abandoned"].includes(run.status)
    ));
  }

  async markMealReminderCancelled(reminderId) {
    await this.load();
    return this.mutateAndSave(() => {
      const reminder = this.data.mealReminders.find((entry) => entry.id === reminderId);
      if (!reminder || ["sent", "failed", "cancelled"].includes(reminder.status)) return reminder;
      const now = new Date().toISOString();
      reminder.status = "cancelled";
      reminder.cancelledAt = now;
      reminder.updatedAt = now;
      return reminder;
    });
  }

  async markMealReminderSent(reminderId, sentAt = new Date().toISOString()) {
    await this.load();
    return this.mutateAndSave(() => {
      const reminder = this.data.mealReminders.find((entry) => entry.id === reminderId);
      if (!reminder || reminder.status === "sent") return reminder;
      reminder.attempts = Number(reminder.attempts || 0) + 1;
      reminder.status = "sent";
      reminder.sentAt = sentAt;
      reminder.updatedAt = sentAt;
      reminder.lastError = "";
      return reminder;
    });
  }

  async markMealReminderFailure(reminderId, message, now = new Date().toISOString()) {
    await this.load();
    return this.mutateAndSave(() => {
      const reminder = this.data.mealReminders.find((entry) => entry.id === reminderId);
      if (!reminder || ["sent", "failed", "cancelled"].includes(reminder.status)) return reminder;
      reminder.attempts = Number(reminder.attempts || 0) + 1;
      reminder.lastError = sanitizeText(message, "send_failed", 120);
      reminder.updatedAt = now;
      if (reminder.attempts >= 2) {
        reminder.status = "failed";
        reminder.failedAt = now;
      } else {
        reminder.status = "retrying";
        reminder.nextAttemptAt = new Date(Date.parse(now) + 5 * 60 * 1000).toISOString();
      }
      return reminder;
    });
  }

  async getWechatOpenIdForUser(userId) {
    await this.load();
    return this.data.identities.find((identity) => (
      identity.userId === userId && identity.provider === "wechat_miniprogram"
    ))?.providerUserId || "";
  }

  async recordProductEvent(userId, householdId, input = {}) {
    await this.load();
    return this.mutateAndSave(() => {
      this.requireFormalMemberHousehold(userId, householdId);
      const eventType = sanitizeProductEventType(input.eventType);
      const effortTier = input.effortTier ? sanitizeEffortTier(input.effortTier) : "";
      const mealRunId = sanitizeText(input.mealRunId, "", 100);
      if (mealRunId) {
        const mealRun = this.data.mealRuns.find((run) => run.id === mealRunId && run.householdId === householdId);
        if (!mealRun) throw codedError("meal_run_not_found", "Meal run not found for this household.");
      }
      const now = new Date().toISOString();
      const cutoff = Date.parse(now) - 180 * 24 * 60 * 60 * 1000;
      this.data.productEvents = this.data.productEvents.filter((event) => Date.parse(event.occurredAt || event.createdAt) >= cutoff);
      const event = {
        id: randomUUID(),
        eventType,
        userId,
        householdId,
        mealRunId,
        recommendationId: sanitizeText(input.recommendationId, "", 100),
        effortTier,
        occurredAt: now,
      };
      this.data.productEvents.push(event);
      return event;
    });
  }

  requireMealRunForMember(userId, mealRunId) {
    const mealRun = this.data.mealRuns.find((run) => run.id === mealRunId);
    if (!mealRun) throw codedError("meal_run_not_found", "Meal run not found.");
    this.requireFormalMemberHousehold(userId, mealRun.householdId);
    return mealRun;
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

function sanitizeDateKey(value) {
  const dateKey = sanitizeText(value, "", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(Date.parse(`${dateKey}T00:00:00.000Z`))) {
    throw codedError("date_key_invalid", "dateKey must use YYYY-MM-DD.");
  }
  return dateKey;
}

function sanitizeIsoDate(value, code = "date_invalid") {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw codedError(code, "A valid ISO date is required.");
  return date.toISOString();
}

function sanitizeOptionalIsoDate(value) {
  if (!value) return "";
  return sanitizeIsoDate(value, "timer_end_invalid");
}

function createActualMealTimer(step, startedAt) {
  const canonicalStartedAt = sanitizeCanonicalTimerIso(startedAt);
  return {
    stepId: step.id,
    startedAt: canonicalStartedAt,
    endsAt: new Date(
      Date.parse(canonicalStartedAt) + Number(step.durationSeconds) * 1000,
    ).toISOString(),
  };
}

function sanitizeActualMealTimer(value, steps) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw codedError("meal_timer_step_invalid", "A passive cooking timer is required.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3
    || keys[0] !== "endsAt"
    || keys[1] !== "startedAt"
    || keys[2] !== "stepId"
  ) {
    throw codedError("meal_timer_step_invalid", "Cooking timer fields are invalid.");
  }
  const stepId = typeof value.stepId === "string" ? value.stepId : "";
  const step = steps.find((candidate) => candidate.id === stepId);
  if (!step || step.attention !== "passive") {
    throw codedError("meal_timer_step_invalid", "The timer must belong to a passive step in this dinner.");
  }
  const startedAt = sanitizeCanonicalTimerIso(value.startedAt);
  const endsAt = sanitizeCanonicalTimerIso(value.endsAt);
  if (Date.parse(endsAt) - Date.parse(startedAt) !== Number(step.durationSeconds) * 1000) {
    throw codedError("meal_timer_duration_invalid", "The timer duration must match the certified step.");
  }
  return { stepId, startedAt, endsAt };
}

function assertActualMealTimerBounds(timer, mealRun) {
  if (Date.parse(timer.startedAt) > Date.now()) {
    throw codedError("meal_timer_time_invalid", "Timer start cannot be in the future.");
  }
  const mealStartedAt = Date.parse(mealRun.startedAt || "");
  if (Number.isFinite(mealStartedAt) && Date.parse(timer.startedAt) < mealStartedAt - 5 * 1000) {
    throw codedError("meal_timer_time_invalid", "Timer start cannot predate this cooking run.");
  }
}

function sanitizeSyncedMealStartedAt(value, { syncedFromLocalId, dateKey }) {
  if (value === undefined || value === null || value === "") return "";
  if (!syncedFromLocalId || typeof value !== "string") {
    throw codedError("meal_synced_started_at_invalid", "Imported cooking time requires a synced guest run.");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value || timestamp > Date.now()) {
    throw codedError("meal_synced_started_at_invalid", "Imported cooking time is invalid.");
  }
  const businessDateKey = new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (businessDateKey !== dateKey) {
    throw codedError("meal_synced_started_at_invalid", "Imported cooking time must match the dinner date.");
  }
  return value;
}

function sanitizeCanonicalTimerIso(value) {
  if (typeof value !== "string") {
    throw codedError("meal_timer_time_invalid", "Timer timestamps must use canonical ISO format.");
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw codedError("meal_timer_time_invalid", "Timer timestamps must use canonical ISO format.");
  }
  return value;
}

function normalizeStoredMealTimers(value, steps) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const timers = {};
  for (const timer of Object.values(value)) {
    try {
      const normalized = sanitizeActualMealTimer(timer, steps);
      timers[normalized.stepId] = normalized;
    } catch {
      // Persisted pre-release data is untrusted and cannot drive cooking locks.
    }
  }
  return timers;
}

function assertActualMealTimerCanStart(timer, steps, timers) {
  const stepById = new Map(steps.map((step) => [step.id, step]));
  const step = stepById.get(timer.stepId);
  for (const dependencyId of step.dependsOn ?? []) {
    const dependency = stepById.get(dependencyId);
    if (dependency?.attention !== "passive") continue;
    const dependencyTimer = timers[dependencyId];
    if (!dependencyTimer || Date.parse(dependencyTimer.endsAt) > Date.parse(timer.startedAt)) {
      throw codedError("meal_timer_dependency_blocked", "A required passive step has not actually finished.");
    }
  }
  for (const existingTimer of Object.values(timers)) {
    const existingStep = stepById.get(existingTimer.stepId);
    if (
      existingStep
      && resourcesOverlap(step, existingStep)
      && timerIntervalsOverlap(timer, existingTimer)
    ) {
      throw codedError("meal_timer_resource_busy", "Required cookware is still occupied by another step.");
    }
  }
}

function assertMealStepCanProgress(step, steps, timers, now) {
  const stepById = new Map(steps.map((candidate) => [candidate.id, candidate]));
  for (const dependencyId of step.dependsOn ?? []) {
    const dependency = stepById.get(dependencyId);
    if (dependency?.attention !== "passive") continue;
    const dependencyTimer = timers[dependencyId];
    if (!dependencyTimer || Date.parse(dependencyTimer.endsAt) > Date.parse(now)) {
      throw codedError("meal_timer_dependency_blocked", "A required passive step has not actually finished.");
    }
  }
  if (step.attention === "passive" && !timers[step.id]) {
    throw codedError("meal_timer_step_invalid", "A passive step requires its actual timer.");
  }
  for (const timer of Object.values(timers)) {
    if (timer.stepId === step.id || Date.parse(timer.endsAt) <= Date.parse(now)) continue;
    const timerStep = stepById.get(timer.stepId);
    if (timerStep && resourcesOverlap(step, timerStep)) {
      throw codedError("meal_timer_resource_busy", "Required cookware is still occupied by another step.");
    }
  }
}

function resourcesOverlap(left, right) {
  const leftResources = new Set(left.resources ?? []);
  return (right.resources ?? []).some((resource) => leftResources.has(resource));
}

function timerIntervalsOverlap(left, right) {
  return Date.parse(left.startedAt) < Date.parse(right.endsAt)
    && Date.parse(right.startedAt) < Date.parse(left.endsAt);
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sanitizeEffortTier(value) {
  if (["quick_15", "easy_30", "normal"].includes(value)) return value;
  throw codedError("effort_tier_invalid", "Unsupported effort tier.");
}

function normalizeRecommendationDishCount(value, mode, effortTier, familyProfile = {}) {
  const requested = Number.parseInt(value, 10);
  if (Number.isFinite(requested)) return Math.max(1, Math.min(4, requested));
  if (mode === "meal_execution") return effortTier === "quick_15" ? 1 : 2;
  const familySize = Math.max(1, Number.parseInt(familyProfile?.familySize, 10) || 2);
  return familySize <= 1 ? 1 : familySize >= 5 ? 3 : 2;
}

function collectRecommendationFeedback(recommendationFeedback, mealRuns, householdId) {
  const legacy = (Array.isArray(recommendationFeedback) ? recommendationFeedback : [])
    .map((item) => ({
      recipeIds: [...new Set([
        ...(Array.isArray(item?.recipeIds) ? item.recipeIds : []),
        item?.recipeId,
      ].filter(Boolean))],
      value: normalizeRecommendationFeedbackValue(item?.value || item?.reasonId),
    }))
    .filter((item) => item.recipeIds.length > 0 && item.value);
  const completed = (Array.isArray(mealRuns) ? mealRuns : [])
    .filter((run) => run?.householdId === householdId && run.status === "completed")
    .flatMap((run) => (Array.isArray(run.feedback) ? run.feedback : []).map((entry) => ({
      recipeIds: [...new Set((run.recipeIds ?? []).filter(Boolean))],
      value: normalizeRecommendationFeedbackValue(entry?.value),
      mealRunId: run.id || "",
    })))
    .filter((item) => item.recipeIds.length > 0 && item.value);
  return [...legacy, ...completed].slice(-100);
}

function sanitizeRecipeIds(value) {
  const recipeIds = [...new Set((Array.isArray(value) ? value : [])
    .map((recipeId) => sanitizeText(recipeId, "", 100))
    .filter(Boolean))].slice(0, 6);
  if (recipeIds.length === 0) throw codedError("meal_recipes_required", "Choose at least one recipe.");
  return recipeIds;
}

function sanitizeAbandonReason(value) {
  if (["too_much_effort", "missing_ingredients", "plans_changed", "cooking_failed"].includes(value)) return value;
  throw codedError("abandon_reason_invalid", "Unsupported abandon reason.");
}

function sanitizeDowngradeAction(value) {
  if (["remove_optional_side", "lower_effort_recipe", "ready_staple"].includes(value)) return value;
  throw codedError("invalid_downgrade_action", "Unsupported downgrade action.");
}

function sanitizeMealFeedback(value) {
  const normalized = normalizeRecommendationFeedbackValue(value);
  if (normalized) return normalized;
  throw codedError("meal_feedback_invalid", "Unsupported meal feedback.");
}

function sanitizeProductEventType(value) {
  if (["effort_tier_viewed", "effort_tier_selected", "plan_presented", "plan_accepted", "reminder_opened"].includes(value)) return value;
  throw codedError("product_event_invalid", "Unsupported product event.");
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

function canonicalActionIdentity(event, participant) {
  const isMergedGuestRetry = participant.type === "guest" && event.mergedFromGuestId === participant.id;
  if (!isMergedGuestRetry) return { type: participant.type, id: participant.id, mergedAt: "", claimedByUserId: "" };
  return {
    type: event.participantType,
    id: event.participantId,
    mergedAt: event.mergedAt || "",
    claimedByUserId: event.participantId,
  };
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

function mergeFormalMemberPreferences({
  current = [],
  incoming = [],
  household = {},
  userId = "",
} = {}) {
  const formalMemberIds = (Array.isArray(household.members) ? household.members : [])
    .filter((member) => member?.status === "formal" && member.memberId)
    .map((member) => member.memberId);
  const formalMemberIdSet = new Set(formalMemberIds);
  const currentByMemberId = new Map(
    normalizeMemberPreferenceEntries(current)
      .filter((entry) => formalMemberIdSet.has(entry.memberId))
      .map((entry) => [entry.memberId, entry]),
  );
  const canEditAll = household.ownerId === userId;
  for (const entry of normalizeMemberPreferenceEntries(incoming)) {
    if (!formalMemberIdSet.has(entry.memberId)) continue;
    if (!canEditAll && entry.memberId !== userId) continue;
    currentByMemberId.set(entry.memberId, entry);
  }
  return formalMemberIds
    .map((memberId) => currentByMemberId.get(memberId))
    .filter(Boolean);
}

function normalizeMemberPreferenceEntries(value) {
  if (!Array.isArray(value)) return [];
  const entries = new Map();
  for (const member of value.slice(0, 50)) {
    const memberId = sanitizeText(member?.memberId, "", 100);
    if (!memberId) continue;
    entries.set(memberId, {
      memberId,
      preference: {
        allergies: normalizePreferenceList(member?.preference?.allergies),
        dislikes: normalizePreferenceList(member?.preference?.dislikes),
      },
    });
  }
  return [...entries.values()];
}

function normalizePreferenceList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => sanitizeText(item, "", 40))
    .filter(Boolean))]
    .slice(0, 24);
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

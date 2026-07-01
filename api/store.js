import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const DEFAULT_DATA = {
  users: [],
  identities: [],
  households: [],
  profiles: {},
  states: {},
  householdStates: {},
  craveRequests: [],
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
    return this.findHouseholdByMember(userId) ?? this.ensureHouseholdForUser(userId);
  }

  async ensureHouseholdForUser(userId, options = {}) {
    await this.load();
    const existing = this.findHouseholdByMember(userId);
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

    const user = this.data.users.find((item) => item.id === userId);
    const now = new Date().toISOString();
    const household = {
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
    this.data.households.push(household);
    if (this.data.states[userId] && !this.data.householdStates[household.id]) {
      this.data.householdStates[household.id] = {
        ...this.data.states[userId],
        householdId: household.id,
        migratedFromUserId: userId,
        updatedAt: this.data.states[userId].updatedAt || now,
      };
    }
    await this.save();
    return household;
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
    await this.save();
    return household;
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
    return this.data.householdStates[household.id] ?? this.data.states[userId] ?? null;
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

  async createCraveRequest(payload = {}, ownerUserId = null) {
    await this.load();
    const now = new Date().toISOString();
    const token = randomUUID().replaceAll("-", "");
    const ownerSecret = randomUUID().replaceAll("-", "");
    const household = ownerUserId
      ? await this.ensureHouseholdForUser(ownerUserId, {
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

  findHouseholdByMember(userId) {
    return this.data.households.find((household) => (
      Array.isArray(household.members)
      && household.members.some((member) => member.memberId === userId && member.status === "formal")
    )) ?? null;
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

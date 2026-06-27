import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const DEFAULT_DATA = {
  users: [],
  identities: [],
  profiles: {},
  states: {},
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
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`);
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

  async saveProfile(userId, profile) {
    await this.load();
    this.data.profiles[userId] = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.data.profiles[userId];
  }

  async getState(userId) {
    await this.load();
    return this.data.states[userId] ?? null;
  }

  async saveState(userId, state) {
    await this.load();
    this.data.states[userId] = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
    return this.data.states[userId];
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
}

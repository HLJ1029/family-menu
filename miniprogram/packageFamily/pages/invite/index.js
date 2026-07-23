const { loadBootstrap } = require("../../../utils/bootstrap");
const { rawRequest, requestHumi } = require("../../../utils/request");
const session = require("../../../utils/session");
const { appStore } = require("../../../utils/store");
const { trackEvent } = require("../../../utils/telemetry");
const shareablePage = require("../../../behaviors/shareable-page");

const INVITE_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const PARTICIPANT_KEY = /^[A-Za-z0-9_-]{16,80}$/;
const PARTICIPANT_KEY_PREFIX = "humi:household-invite-participant:v1:";

Page({
  behaviors: [shareablePage],

  data: {
    status: "loading",
    errorText: "",
    mode: "entry",
    tokenInput: "",
    invite: null,
    isLoggedIn: false,
    profileComplete: false,
    primaryAction: "微信登录后加入",
    pendingAction: "",
    wantText: "",
    wantSaved: false,
    preparedInvite: null,
    shareSource: "",
  },

  async onLoad(options = {}) {
    const token = normalizeToken(options.token);
    const mode = options.mode === "prepare" ? "prepare" : token ? "landing" : "entry";
    this._householdId = safeId(options.householdId);
    this._token = token;
    this.setData({
      mode,
      shareSource: options.shareSource === "invite" ? "invite" : "",
      isLoggedIn: Boolean(session.getSession()),
      profileComplete: session.getSession()?.user?.profileStatus === "complete",
    });
    if (mode === "landing") return this.loadInvite(token);
    if (mode === "prepare") {
      const bootstrap = appStore.getState().bootstrap;
      const household = (bootstrap?.households || []).find((item) => item.id === (this._householdId || bootstrap.activeHouseholdId));
      if (!household || household.role !== "owner") {
        this.setData({ status: "error", errorText: "只有家庭创建者能准备正式家庭邀请。" });
        return;
      }
      this._householdId = household.id;
      this.setData({
        status: "ready",
        invite: {
          householdName: household.name,
          inviterName: bootstrap.user?.displayName || "主厨",
          status: "open",
        },
      });
      return;
    }
    this.setData({ status: "ready" });
  },

  onShow() {
    if (this.data.shareSource && !this._visibleTracked) {
      this._visibleTracked = true;
      trackEvent("native_share_page_visible", {
        page: "share",
        shareSource: this.data.shareSource,
      });
    }
  },

  updateTokenInput(event = {}) {
    this.setData({ tokenInput: String(event.detail?.value || "").trim().slice(0, 80), errorText: "" });
  },

  openInviteToken() {
    const token = normalizeToken(this.data.tokenInput);
    if (!token || this.data.pendingAction) {
      this.setData({ errorText: "请输入有效的家庭邀请码。" });
      return;
    }
    wx.redirectTo({ url: `/packageFamily/pages/invite/index?token=${encodeURIComponent(token)}` });
  },

  async loadInvite(token = this._token) {
    const normalizedToken = normalizeToken(token);
    if (!normalizedToken || this.data.pendingAction) {
      this.setData({ status: "error", errorText: "这个家庭邀请不完整，请让家人重新发送。" });
      return null;
    }
    this._token = normalizedToken;
    this.setData({ status: "loading", pendingAction: "load", errorText: "" });
    try {
      const payload = await rawRequest({ path: `/household-invites/${encodeURIComponent(normalizedToken)}` });
      const invite = payload?.invite;
      if (!invite || invite.status !== "open") {
        this.setData({ status: "error", errorText: "这个家庭邀请已经失效。" });
        return null;
      }
      const activeSession = session.getSession();
      const isLoggedIn = Boolean(activeSession);
      const profileComplete = activeSession?.user?.profileStatus === "complete";
      this.setData({
        status: "ready",
        invite,
        isLoggedIn,
        profileComplete,
        primaryAction: !isLoggedIn ? "微信登录后加入" : profileComplete ? "加入这个家" : "先完成个人身份",
      });
      return invite;
    } catch (error) {
      this.setData({ status: "error", errorText: inviteError(error, "家庭邀请暂时没有加载成功，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async prepareInvite() {
    if (this.data.mode !== "prepare" || this.data.pendingAction) return null;
    const bootstrap = appStore.getState().bootstrap;
    this.setData({ pendingAction: "prepare", errorText: "" });
    try {
      const household = this.data.invite;
      const snapshot = await this.prepareNativeShare("invite", {
        page: "family",
        householdId: this._householdId,
        stateVersion: bootstrap?.stateVersion || "",
        mealRunId: bootstrap?.currentMealRun?.id || "",
        householdName: household?.householdName || "这个家",
        inviterName: bootstrap?.user?.displayName || "主厨",
        data: {
          householdId: this._householdId,
          inviterName: bootstrap?.user?.displayName || "主厨",
        },
      });
      const invite = snapshot?.record;
      if (!invite?.token) throw new Error("household_invite_missing");
      this.setData({ preparedInvite: invite, invite });
      return invite;
    } catch (error) {
      this.setData({ errorText: inviteError(error, "邀请暂时没有准备好，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async loginAndJoin() {
    if (!this.data.invite || this.data.pendingAction) return null;
    const activeSession = session.getSession();
    if (activeSession?.user?.profileStatus === "complete") return this.joinHousehold();
    if (activeSession) {
      wx.navigateTo({ url: "/pages/identity/index" });
      return null;
    }
    this.setData({ pendingAction: "login", errorText: "" });
    try {
      const signedIn = await session.loginWithWechat();
      const app = getApp();
      if (typeof app?.setHumiSession === "function") app.setHumiSession(signedIn);
      if (signedIn.user?.profileStatus !== "complete") {
        this.setData({
          isLoggedIn: true,
          profileComplete: false,
          primaryAction: "先完成个人身份",
          errorText: "微信登录已完成。请先设置昵称和头像，再回来正式加入这个家。",
        });
        wx.navigateTo({ url: "/pages/identity/index" });
        return null;
      }
      this.setData({ isLoggedIn: true, profileComplete: true, primaryAction: "加入这个家", pendingAction: "" });
      return this.joinHousehold();
    } catch (error) {
      this.setData({ errorText: inviteError(error, "微信登录失败，请重试。") });
      return null;
    } finally {
      if (this.data.pendingAction === "login") this.setData({ pendingAction: "" });
    }
  },

  async joinHousehold() {
    if (!this.data.invite || this.data.pendingAction || !this.data.profileComplete) {
      if (!this.data.profileComplete && this.data.isLoggedIn) wx.navigateTo({ url: "/pages/identity/index" });
      return null;
    }
    const token = normalizeToken(this._token || this.data.invite.token);
    if (!token) return null;
    this.setData({ pendingAction: "join", errorText: "" });
    try {
      await requestHumi({
        path: `/household-invites/${encodeURIComponent(token)}/join`,
        method: "POST",
        data: { participantKey: readParticipantKey(token) },
        idempotencyKey: mutationId("household-join"),
      });
      const envelope = await loadBootstrap({ allowCache: false });
      appStore.replaceBootstrap(envelope);
      wx.switchTab({ url: "/pages/family/index" });
      return envelope;
    } catch (error) {
      this.setData({ errorText: inviteError(error, "暂时无法加入这个家，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  updateWant(event = {}) {
    this.setData({ wantText: String(event.detail?.value || "").slice(0, 40), wantSaved: false, errorText: "" });
  },

  async submitTemporaryWant() {
    const token = normalizeToken(this._token || this.data.invite?.token);
    const title = String(this.data.wantText || "").trim();
    if (!token || !title || this.data.pendingAction) {
      if (!title) this.setData({ errorText: "写一道最近想吃的菜就可以。" });
      return null;
    }
    this.setData({ pendingAction: "want", errorText: "" });
    try {
      const payload = await rawRequest({
        path: `/household-invites/${encodeURIComponent(token)}/wants`,
        method: "POST",
        data: {
          participantKey: ensureParticipantKey(token),
          title,
        },
      });
      this.setData({ wantSaved: true, wantText: "" });
      return payload?.want || null;
    } catch (error) {
      this.setData({ errorText: inviteError(error, "这道想吃的菜暂时没有送达，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  onShareAppMessage() {
    return this.getNativeSharePayload(
      { target: { dataset: { shareType: "invite" } } },
      { title: "邀请家人加入 Humi", path: "/pages/family/index" },
    );
  },

  retryInviteShare() {
    return this.prepareInvite();
  },

  retry() {
    if (this.data.mode === "landing") return this.loadInvite();
    if (this.data.mode === "prepare") return this.prepareInvite();
    this.setData({ status: "ready", errorText: "" });
  },
});

function normalizeToken(value) {
  const token = String(value || "").trim();
  return INVITE_TOKEN.test(token) ? token : "";
}

function safeId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "";
}

function participantStorageKey(token) {
  return `${PARTICIPANT_KEY_PREFIX}${token}`;
}

function readParticipantKey(token) {
  const value = String(wx.getStorageSync(participantStorageKey(token)) || "");
  return PARTICIPANT_KEY.test(value) ? value : "";
}

function ensureParticipantKey(token) {
  const existing = readParticipantKey(token);
  if (existing) return existing;
  const random = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`.slice(0, 40);
  const participantKey = `guest_${random}`;
  wx.setStorageSync(participantStorageKey(token), participantKey);
  return participantKey;
}

function mutationId(prefix) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function inviteError(error, fallback) {
  const known = {
    household_invite_not_found: "这个家庭邀请已经失效。",
    invite_closed: "这个家庭邀请已经关闭。",
    invalid_session: "登录状态已失效，请重新登录。",
  };
  return known[error?.code] || error?.message || fallback;
}

module.exports = { ensureParticipantKey, normalizeToken };

const { rawRequest, requestHumi } = require("../../../utils/request");
const session = require("../../../utils/session");
const { trackEvent } = require("../../../utils/telemetry");
const { buildNativeSharePayload } = require("../../../utils/share-routing");

const SHARE_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
const FEELINGS = ["随便都行", "辣一点", "清淡点", "想喝汤", "想吃肉", "想吃素", "不想动", "想暖胃", "开胃 / 酸"];

Page({
  data: {
    status: "loading",
    errorText: "",
    shareSource: "",
    request: null,
    feelings: FEELINGS,
    selectedFeeling: "随便都行",
    detailsOpen: false,
    dishWish: "",
    note: "",
    participant: null,
    submitted: false,
    pendingAction: "",
  },

  onLoad(options = {}) {
    this._token = normalizeToken(options.crave || options.token);
    this._storageKey = this._token ? `humi:crave-participant:v1:${this._token}` : "";
    this.setData({ shareSource: options.shareSource === "crave" ? "crave" : "" });
    return this.loadRequest();
  },

  onShow() {
    if (this.data.shareSource && !this._visibleTracked) {
      this._visibleTracked = true;
      trackEvent("native_share_page_visible", {
        page: "share",
        shareSource: "crave",
      });
    }
  },

  async loadRequest() {
    if (!this._token) {
      this.setData({ status: "error", errorText: "这个口味征集不完整，请让家人重新发送。" });
      return null;
    }
    this.setData({ status: "loading", errorText: "" });
    try {
      const payload = await rawRequest({
        path: `/crave-requests/${encodeURIComponent(this._token)}`,
      });
      if (!payload?.request) throw new Error("crave_request_unavailable");
      this.setData({ status: "ready", request: payload.request });
      return payload.request;
    } catch (_) {
      this.setData({ status: "error", errorText: "这个口味征集暂时打不开，请稍后重试。" });
      return null;
    }
  },

  selectFeeling(event = {}) {
    const feeling = String(event.currentTarget?.dataset?.feeling || "");
    if (FEELINGS.includes(feeling) && !this.data.pendingAction) {
      this.setData({ selectedFeeling: feeling });
    }
  },

  toggleDetails() {
    if (!this.data.pendingAction) this.setData({ detailsOpen: !this.data.detailsOpen });
  },

  updateDishWish(event = {}) {
    this.setData({ dishWish: String(event.detail?.value || "").slice(0, 80) });
  },

  updateNote(event = {}) {
    this.setData({ note: String(event.detail?.value || "").slice(0, 80) });
  },

  async submitVote() {
    if (!this.data.request || this.data.pendingAction) return null;
    if (this.data.request.status !== "open") {
      this.setData({ errorText: "这次征集已经结束，家人正在安排菜单。" });
      return null;
    }
    const activeSession = session.getSession();
    const requester = activeSession ? requestHumi : rawRequest;
    const guestParticipantId = activeSession || !this._storageKey
      ? ""
      : String(wx.getStorageSync(this._storageKey) || "");
    this.setData({ pendingAction: "submit", errorText: "" });
    try {
      const payload = await requester({
        path: `/crave-requests/${encodeURIComponent(this._token)}/votes`,
        method: "POST",
        data: {
          ...(guestParticipantId ? { guestParticipantId } : {}),
          feelingTag: this.data.selectedFeeling,
          dishWish: this.data.dishWish.trim(),
          note: this.data.note.trim(),
        },
        idempotencyKey: `crave-vote:${this._token}:${activeSession?.user?.id || guestParticipantId || "guest"}`,
        expectedUserId: activeSession?.user?.id,
      });
      if (payload?.participant?.type === "guest" && payload.participant.id && this._storageKey) {
        wx.setStorageSync(this._storageKey, payload.participant.id);
      }
      this.setData({
        request: payload?.request || this.data.request,
        participant: payload?.participant || null,
        submitted: payload?.request?.status === "open",
        errorText: payload?.request?.status === "open" ? "" : "这次征集已经结束，家人正在安排菜单。",
      });
      return payload;
    } catch (error) {
      this.setData({ errorText: craveError(error) });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  onShareAppMessage() {
    if (!this._token || !this.data.request) {
      return { title: "Humi 今晚口味征集", path: "/pages/boot/index" };
    }
    return buildNativeSharePayload("crave", {
      token: this._token,
      householdName: this.data.request.householdName,
    });
  },

  retry() {
    return this.loadRequest();
  },

  goHome() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/boot/index" });
  },
});

function normalizeToken(value) {
  const token = String(value || "");
  return SHARE_TOKEN.test(token) ? token : "";
}

function craveError(error) {
  if (error?.code === "crave_request_not_found") return "这个口味征集已经失效，请让家人重新发送。";
  if (error?.code === "invalid_session") return "登录状态刚刚失效，请重新打开后再试。";
  return "刚才的回复没有发出去，请检查网络后重试。";
}

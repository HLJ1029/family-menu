const { rawRequest, requestHumi } = require("../../../utils/request");
const session = require("../../../utils/session");
const { trackEvent } = require("../../../utils/telemetry");
const { buildNativeSharePayload } = require("../../../utils/share-routing");

const SHARE_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

Page({
  data: {
    status: "loading",
    errorText: "",
    shareSource: "",
    request: null,
    dishName: "",
    note: "",
    detailsOpen: false,
    participant: null,
    submitted: false,
    pendingAction: "",
  },

  onLoad(options = {}) {
    this._token = normalizeToken(options.wishShare || options.token);
    this._storageKey = this._token ? `humi:wish-participant:v1:${this._token}` : "";
    this.setData({ shareSource: options.shareSource === "wish" ? "wish" : "" });
    return this.loadRequest();
  },

  onShow() {
    if (this.data.shareSource && !this._visibleTracked) {
      this._visibleTracked = true;
      trackEvent("native_share_page_visible", {
        page: "share",
        shareSource: "wish",
      });
    }
  },

  async loadRequest() {
    if (!this._token) {
      this.setData({ status: "error", errorText: "这个想吃入口不完整，请让家人重新发送。" });
      return null;
    }
    this.setData({ status: "loading", errorText: "" });
    try {
      const payload = await rawRequest({
        path: `/wish-share-requests/${encodeURIComponent(this._token)}`,
      });
      if (!payload?.request) throw new Error("wish_share_unavailable");
      this.setData({ status: "ready", request: payload.request });
      return payload.request;
    } catch (_) {
      this.setData({ status: "error", errorText: "这个想吃入口暂时打不开，请稍后重试。" });
      return null;
    }
  },

  updateDishName(event = {}) {
    this.setData({ dishName: String(event.detail?.value || "").slice(0, 80) });
  },

  updateNote(event = {}) {
    this.setData({ note: String(event.detail?.value || "").slice(0, 80) });
  },

  toggleDetails() {
    if (!this.data.pendingAction) this.setData({ detailsOpen: !this.data.detailsOpen });
  },

  async submitWish() {
    if (!this.data.request || this.data.pendingAction) return null;
    const dishName = this.data.dishName.trim();
    if (!dishName) {
      this.setData({ errorText: "先写一道最近想吃的菜。" });
      return null;
    }
    if (this.data.request.status !== "open") {
      this.setData({ errorText: "这个想吃入口已经结束，请让家人重新发一个。" });
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
        path: `/wish-share-requests/${encodeURIComponent(this._token)}/wishes`,
        method: "POST",
        data: {
          ...(guestParticipantId ? { guestParticipantId } : {}),
          dishName,
          note: this.data.note.trim(),
        },
        idempotencyKey: `wish-entry:${this._token}:${activeSession?.user?.id || guestParticipantId || "guest"}`,
        expectedUserId: activeSession?.user?.id,
      });
      if (payload?.participant?.type === "guest" && payload.participant.id && this._storageKey) {
        wx.setStorageSync(this._storageKey, payload.participant.id);
      }
      this.setData({
        request: payload?.request || this.data.request,
        participant: payload?.participant || null,
        submitted: true,
      });
      return payload;
    } catch (error) {
      this.setData({ errorText: wishError(error) });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  onShareAppMessage() {
    if (!this._token || !this.data.request) {
      return { title: "Humi 最近想吃", path: "/pages/boot/index" };
    }
    return buildNativeSharePayload("wish", {
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

function wishError(error) {
  if (error?.code === "wish_share_not_found") return "这个想吃入口已经失效，请让家人重新发送。";
  if (error?.code === "invalid_session") return "登录状态刚刚失效，请重新打开后再试。";
  return "刚才没有发出去，请检查网络后重试。";
}

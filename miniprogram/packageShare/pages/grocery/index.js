const { rawRequest } = require("../../../utils/request");
const { trackEvent } = require("../../../utils/telemetry");

const SHARE_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

Page({
  data: {
    status: "loading",
    errorText: "",
    shareSource: "",
    grocery: null,
  },

  onLoad(options = {}) {
    this._token = normalizeToken(options.groceryShare);
    this.setData({ shareSource: options.shareSource === "grocery" ? "grocery" : "" });
    return this.loadGrocery();
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

  async loadGrocery() {
    if (!this._token) {
      this.setData({ status: "error", errorText: "这个清单分享不完整，请让家人重新发送。" });
      return null;
    }
    this.setData({ status: "loading", errorText: "" });
    try {
      const payload = await rawRequest({
        path: `/grocery-share-requests/${encodeURIComponent(this._token)}`,
      });
      const grocery = payload?.request;
      if (!grocery || grocery.status !== "open") throw new Error("grocery_share_unavailable");
      this.setData({ status: "ready", grocery });
      return grocery;
    } catch (_) {
      this.setData({ status: "error", errorText: "这个买菜清单暂时打不开，请稍后重试。" });
      return null;
    }
  },

  retry() {
    return this.loadGrocery();
  },
});

function normalizeToken(value) {
  const token = String(value || "");
  return SHARE_TOKEN.test(token) ? token : "";
}

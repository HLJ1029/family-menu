const { rawRequest } = require("../../../utils/request");
const { trackEvent } = require("../../../utils/telemetry");

const SHARE_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

Page({
  data: {
    status: "loading",
    errorText: "",
    shareSource: "",
    menu: null,
  },

  onLoad(options = {}) {
    this._token = normalizeToken(options.menuShare);
    this.setData({ shareSource: options.shareSource === "menu" ? "menu" : "" });
    return this.loadMenu();
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

  async loadMenu() {
    if (!this._token) {
      this.setData({ status: "error", errorText: "这个菜单分享不完整，请让家人重新发送。" });
      return null;
    }
    this.setData({ status: "loading", errorText: "" });
    try {
      const payload = await rawRequest({
        path: `/menu-share-requests/${encodeURIComponent(this._token)}`,
      });
      const menu = payload?.request;
      if (!menu || menu.status !== "open") throw new Error("menu_share_unavailable");
      this.setData({ status: "ready", menu });
      return menu;
    } catch (_) {
      this.setData({ status: "error", errorText: "这个菜单暂时打不开，请稍后重试。" });
      return null;
    }
  },

  retry() {
    return this.loadMenu();
  },
});

function normalizeToken(value) {
  const token = String(value || "");
  return SHARE_TOKEN.test(token) ? token : "";
}

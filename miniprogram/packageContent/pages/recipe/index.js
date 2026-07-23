const { requestHumi } = require("../../../utils/request");
const {
  buildAllowedContentUrl,
  buildTicketedH5ContentUrl
} = require("../../../utils/content-routes");

Page({
  data: {
    status: "loading",
    url: "",
    errorText: ""
  },

  onLoad(options = {}) {
    const recipeId = String(options.recipeId || "");
    try {
      buildAllowedContentUrl("recipe", { recipeId });
      this._recipeId = recipeId;
    } catch (_) {
      this.setData({ status: "error", errorText: "这道菜的做法链接无效。" });
      return;
    }
    return this.loadContent();
  },

  async loadContent() {
    if (!this._recipeId) return;
    this.setData({ status: "loading", url: "", errorText: "" });
    try {
      const issued = await requestHumi({
        path: "/auth/h5-ticket",
        method: "POST",
        idempotencyKey: `h5-recipe:${this._recipeId}:${Date.now()}`
      });
      const url = buildTicketedH5ContentUrl("recipe", { recipeId: this._recipeId }, issued?.ticket);
      this.setData({ status: "ready", url, errorText: "" });
    } catch (_) {
      this.setData({
        status: "error",
        url: "",
        errorText: "完整做法暂时没有打开，请确认已登录后重试。"
      });
    }
  },

  onWebError() {
    this.setData({ status: "error", url: "", errorText: "完整做法加载失败，请重试。" });
  },

  retry() {
    return this.loadContent();
  }
});

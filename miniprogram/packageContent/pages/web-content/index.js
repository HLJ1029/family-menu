const { requestHumi } = require("../../../utils/request");
const {
  buildAllowedContentUrl,
  buildTicketedH5ContentUrl
} = require("../../../utils/content-routes");

const PAGE_TITLES = {
  recipe: "完整做法",
  stats: "做饭统计",
  history: "做饭记录"
};

Page({
  data: {
    status: "loading",
    url: "",
    errorText: ""
  },

  onLoad(options = {}) {
    const optionKeys = Object.keys(options);
    const route = String(options.route || "");
    const allowedOptionKeys = route === "recipe" ? ["route", "recipeId"] : ["route"];
    if (optionKeys.some((key) => !allowedOptionKeys.includes(key))) {
      this.setData({ status: "error", errorText: "内容入口无效。" });
      return;
    }
    const params = route === "recipe" ? { recipeId: String(options.recipeId || "") } : {};
    try {
      buildAllowedContentUrl(route, params);
    } catch (_) {
      this.setData({ status: "error", errorText: "内容入口无效。" });
      return;
    }
    this._route = route;
    this._params = params;
    wx.setNavigationBarTitle({ title: PAGE_TITLES[route] });
    return this.loadContent();
  },

  async loadContent() {
    if (!this._route) return;
    this.setData({ status: "loading", url: "", errorText: "" });
    try {
      const issued = await requestHumi({
        path: "/auth/h5-ticket",
        method: "POST",
        idempotencyKey: `h5-content:${this._route}:${Date.now()}`
      });
      const url = buildTicketedH5ContentUrl(this._route, this._params, issued?.ticket);
      this.setData({ status: "ready", url, errorText: "" });
    } catch (_) {
      this.setData({
        status: "error",
        url: "",
        errorText: "内容暂时没有打开，请确认已登录后重试。"
      });
    }
  },

  onWebError() {
    this.setData({ status: "error", url: "", errorText: "内容加载失败，请重试。" });
  },

  retry() {
    return this.loadContent();
  }
});

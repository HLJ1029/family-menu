const { buildLegacyRoute, extractLegacyOptions, getHouseholdId, loadBootstrap, resolveKnownShareRoute, resolveStartupRoute } = require("../../utils/bootstrap");
const { appStore } = require("../../utils/store");
const { startSpan } = require("../../utils/telemetry");

const TAB_ROUTES = new Set([
  "/pages/tonight/index",
  "/pages/discover/index",
  "/pages/plan/index",
  "/pages/grocery/index",
  "/pages/family/index"
]);

Page({
  data: {
    state: "loading",
    errorText: ""
  },

  onLoad(options = {}) {
    this._legacyOptions = extractLegacyOptions(options);
    return this.start(options);
  },

  async start(options = {}) {
    const span = startSpan("native_boot");
    const shareRoute = resolveKnownShareRoute(options);
    if (shareRoute) {
      span.end("completed", { page: "boot" });
      this.route(shareRoute);
      return;
    }

    this.setData({ state: "loading", errorText: "" });
    try {
      const envelope = await loadBootstrap({ allowCache: true });
      const target = resolveStartupRoute({
        candidate: getApp().globalData.nativeShellCandidate,
        envelope
      });
      appStore.setState({ bootstrap: envelope, currentHouseholdId: getHouseholdId(envelope) });
      span.end("completed", { page: "boot" });
      this.route(target.route === "/pages/legacy/index" ? buildLegacyRoute(options) : target.route);
    } catch (error) {
      span.end("failed", { page: "boot", errorCode: error?.code || "request_failed" });
      this.setData({ state: "error", errorText: "暂时连不上 Humi，可以重试或进入兼容版。" });
    }
  },

  retry() {
    return this.start(this._legacyOptions || {});
  },

  enterLegacy() {
    this.route(buildLegacyRoute(this._legacyOptions || {}));
  },

  route(url) {
    if (TAB_ROUTES.has(url)) {
      wx.switchTab({ url });
      return;
    }
    wx.reLaunch({ url });
  }
});

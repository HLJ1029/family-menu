const { appStore } = require("../../utils/store");

Page({
  data: { status: "loading", errorText: "" },
  onShow() { this.syncState(); },
  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    this.setData({ status: bootstrap?.cacheState === "cached" ? "cached" : bootstrap ? "ready" : "empty", errorText: "" });
  },
  retry() { this.setData({ status: "loading", errorText: "" }); this.syncState(); }
});

const { appStore } = require("../../utils/store");
const { guardNativeTab } = require("../../utils/native-shell-guard");

Page({
  data: { status: "loading", errorText: "" },
  onShow() { if (guardNativeTab()) this.syncState(); },
  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    this.setData({ status: bootstrap?.cacheState === "cached" ? "cached" : bootstrap ? "ready" : "empty", errorText: "" });
  },
  retry() { this.setData({ status: "loading", errorText: "" }); this.syncState(); }
});

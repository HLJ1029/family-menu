const { resolveStartupRoute } = require("./bootstrap");
const { appStore } = require("./store");

function guardNativeTab() {
  const envelope = appStore.getState().bootstrap;
  const sessionUserId = String(getApp().globalData?.humiSession?.user?.id || "");
  const bootstrapUserId = String(envelope?.user?.id || "");
  if (!sessionUserId || !bootstrapUserId || sessionUserId !== bootstrapUserId) {
    wx.reLaunch({ url: "/pages/boot/index" });
    return false;
  }
  if (!envelope) {
    wx.reLaunch({ url: "/pages/boot/index" });
    return false;
  }
  const target = resolveStartupRoute({
    candidate: getApp().globalData?.nativeShellCandidate,
    envelope
  });
  if (target.route === "/pages/tonight/index") return true;
  wx.reLaunch({ url: target.route });
  return false;
}

module.exports = { guardNativeTab };

const { buildLegacyRoute, resolveKnownShareRoute } = require("../../utils/bootstrap");

Page({
  onLoad(options = {}) {
    const shareRoute = resolveKnownShareRoute(options);
    wx.reLaunch({ url: shareRoute || buildLegacyRoute(options) });
  }
});

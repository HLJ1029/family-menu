const { resolveKnownShareRoute } = require("../../utils/bootstrap");

Page({
  onLoad(options = {}) {
    const shareRoute = resolveKnownShareRoute(options);
    wx.reLaunch({ url: shareRoute || buildLegacyRoute(options) });
  }
});

function buildLegacyRoute(options = {}) {
  const query = Object.entries(options)
    .filter(([key, value]) => key && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `/pages/legacy/index?${query}` : "/pages/legacy/index";
}

module.exports = { buildLegacyRoute };

const NATIVE_SESSION_KEY = "humi:native-session:v1";

App({
  globalData: {
    humiSession: null,
    humiIdentityUpdatedAt: 0,
    humiPhoneSessionUpdatedAt: 0
  },

  onLaunch() {
    const stored = wx.getStorageSync(NATIVE_SESSION_KEY);
    this.globalData.humiSession = stored?.accessToken && stored?.expiresAt > Date.now()
      ? stored
      : null;
    if (!this.globalData.humiSession) wx.removeStorageSync(NATIVE_SESSION_KEY);
  },

  setHumiSession(session) {
    this.globalData.humiSession = session;
    wx.setStorageSync(NATIVE_SESSION_KEY, session);
  },

  clearHumiSession() {
    this.globalData.humiSession = null;
    wx.removeStorageSync(NATIVE_SESSION_KEY);
  }
});

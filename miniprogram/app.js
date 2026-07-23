const { restoreSession, saveSession, clearSession } = require("./utils/session");
const { flushMutationQueue } = require("./utils/offline-queue");
const { HUMI_NATIVE_SHELL_CANDIDATE } = require("./utils/config");

App({
  globalData: {
    humiSession: null,
    humiIdentityUpdatedAt: 0,
    humiPhoneSessionUpdatedAt: 0,
    nativeShellCandidate: false
  },

  onLaunch() {
    this.globalData.humiSession = restoreSession();
    this.globalData.nativeShellCandidate = HUMI_NATIVE_SHELL_CANDIDATE;
  },

  onShow() {
    flushMutationQueue().catch(() => undefined);
  },

  setHumiSession(session) {
    this.globalData.humiSession = session;
    saveSession(session);
  },

  clearHumiSession() {
    this.globalData.humiSession = null;
    clearSession();
  }
});

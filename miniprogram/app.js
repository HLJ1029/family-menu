const { restoreSession, saveSession, clearSession } = require("./utils/session");
const { flushMutationQueue } = require("./utils/offline-queue");
const { HUMI_NATIVE_SHELL_CANDIDATE } = require("./utils/config");
const { trackEvent } = require("./utils/telemetry");
const { appStore } = require("./utils/store");

App({
  globalData: {
    humiSession: null,
    humiIdentityUpdatedAt: 0,
    humiPhoneSessionUpdatedAt: 0,
    nativeShellCandidate: false
  },

  onLaunch() {
    const restoredSession = restoreSession();
    appStore.replaceSession(restoredSession);
    this.globalData.humiSession = restoredSession;
    this.globalData.nativeShellCandidate = HUMI_NATIVE_SHELL_CANDIDATE;
  },

  onShow() {
    const startedAt = Date.now();
    flushMutationQueue()
      .then((outcome) => {
        const result = outcome?.status === "conflict" || outcome?.status === "retry" ? outcome.status : "completed";
        trackEvent(result === "completed" ? "native_boot_completed" : "native_boot_failed", {
          page: "boot",
          stage: "queue_flush",
          result,
          durationMs: Date.now() - startedAt,
          errorCode: result === "conflict" ? "queue_conflict" : result === "retry" ? "queue_retry" : "none"
        });
      })
      .catch(() => {
        trackEvent("native_boot_failed", {
          page: "boot",
          stage: "queue_flush",
          result: "failed",
          durationMs: Date.now() - startedAt,
          errorCode: "queue_flush_failed"
        });
      });
  },

  setHumiSession(session) {
    saveSession(session);
    appStore.replaceSession(session);
    this.globalData.humiSession = session;
  },

  clearHumiSession() {
    clearSession();
    appStore.replaceSession(null);
    this.globalData.humiSession = null;
  }
});

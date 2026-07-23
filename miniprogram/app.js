const { restoreSession, saveSession, clearSession } = require("./utils/session");
const { flushMutationQueue } = require("./utils/offline-queue");
const { scheduleTelemetryFlush } = require("./utils/telemetry");
const { HUMI_NATIVE_SHELL_CANDIDATE } = require("./utils/config");
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
    scheduleTelemetryFlush();
  },

  onShow() {
    scheduleTelemetryFlush();
    const applyEnvelope = (envelope) => {
      if (envelope?.schemaVersion === 1 && envelope?.stateVersion) {
        appStore.replaceBootstrap(envelope);
      }
    };
    flushMutationQueue({
      onEnvelope: applyEnvelope,
      onReplayed: (action, response) => {
        if (action?.type === "grocery_item_check") applyEnvelope(response);
      }
    })
      .then((outcome) => {
        applyEnvelope(outcome?.envelope);
        const result = outcome?.status === "conflict" || outcome?.status === "retry" ? outcome.status : "completed";
        appStore.setState({ offlineStatus: result === "completed" ? "idle" : result });
      })
      .catch(() => {});
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

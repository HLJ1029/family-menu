const { restoreSession, saveSession, clearSession } = require("./utils/session");
const { flushMutationQueue } = require("./utils/offline-queue");
const { scheduleTelemetryFlush, setTelemetryOwner } = require("./utils/telemetry");
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
    setTelemetryOwner(restoredSession?.user?.id || "", { rotate: false });
    this.globalData.nativeShellCandidate = HUMI_NATIVE_SHELL_CANDIDATE;
    scheduleTelemetryFlush({ delayMs: 1_200 });
  },

  onShow() {
    scheduleTelemetryFlush({ delayMs: 1_200 });
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
    const previousOwnerId = this.globalData.humiSession?.user?.id || "";
    const nextOwnerId = session?.user?.id || "";
    saveSession(session);
    appStore.replaceSession(session);
    this.globalData.humiSession = session;
    if (nextOwnerId !== previousOwnerId) setTelemetryOwner(nextOwnerId);
  },

  clearHumiSession() {
    const previousOwnerId = this.globalData.humiSession?.user?.id || "";
    clearSession();
    appStore.replaceSession(null);
    this.globalData.humiSession = null;
    if (previousOwnerId) setTelemetryOwner("");
  }
});

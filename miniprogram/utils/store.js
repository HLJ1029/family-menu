const state = {
  session: null,
  currentHouseholdId: "",
  bootstrap: null,
  offlineStatus: "idle"
};
const listeners = new Set();

function notify() {
  const snapshot = { ...state };
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

function sessionUserId(session) {
  return typeof session?.user?.id === "string" ? session.user.id : "";
}

function envelopeHouseholdId(envelope) {
  if (Object.prototype.hasOwnProperty.call(envelope || {}, "activeHouseholdId")) {
    return String(envelope.activeHouseholdId || "");
  }
  return String(envelope?.activeHousehold?.id || envelope?.currentHouseholdId || "");
}

function isReusableBootstrap(envelope, userId) {
  return Boolean(
    envelope &&
    envelope.schemaVersion === 1 &&
    typeof envelope.stateVersion === "string" &&
    envelope.stateVersion &&
    sessionUserId({ user: envelope.user }) === userId
  );
}

const appStore = {
  getState() {
    return { ...state };
  },
  setState(patch) {
    Object.assign(state, patch || {});
    return notify();
  },
  replaceSession(session) {
    const previousUserId = sessionUserId(state.session);
    const nextSession = session || null;
    const nextUserId = sessionUserId(nextSession);
    state.session = nextSession;
    if (!nextUserId || previousUserId !== nextUserId || (state.bootstrap && !isReusableBootstrap(state.bootstrap, nextUserId))) {
      state.bootstrap = null;
      state.currentHouseholdId = "";
      state.offlineStatus = "idle";
    }
    return notify();
  },
  resetSessionState(session = null) {
    state.session = session || null;
    state.bootstrap = null;
    state.currentHouseholdId = "";
    state.offlineStatus = "idle";
    return notify();
  },
  replaceBootstrap(envelope) {
    const ownerUserId = sessionUserId(state.session);
    if (!isReusableBootstrap(envelope, ownerUserId)) {
      state.bootstrap = null;
      state.currentHouseholdId = "";
      return notify();
    }
    state.bootstrap = envelope || null;
    state.currentHouseholdId = envelopeHouseholdId(envelope);
    return notify();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

module.exports = { appStore };

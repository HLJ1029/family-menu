const state = {
  session: null,
  currentHouseholdId: "",
  bootstrap: null,
  offlineStatus: "idle"
};
const listeners = new Set();

const appStore = {
  getState() {
    return { ...state };
  },
  setState(patch) {
    Object.assign(state, patch || {});
    const snapshot = this.getState();
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

module.exports = { appStore };

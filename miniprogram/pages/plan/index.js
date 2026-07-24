const { appStore } = require("../../utils/store");
const { guardNativeTab } = require("../../utils/native-shell-guard");
const {
  buildMealDays,
  createMutationId,
  getActiveHousehold,
  getHouseholdRole,
  saveHouseholdStatePatch,
} = require("../../utils/household-state");

Page({
  data: {
    status: "loading",
    errorText: "",
    cacheState: "",
    days: [],
    canEditMenu: false,
    stateVersion: "",
    conflictVisible: false,
    pendingAction: "",
  },
  onShow() { if (guardNativeTab()) this.syncState(); },
  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap) {
      this.setData({ status: "empty", errorText: "", days: [], canEditMenu: false, stateVersion: "" });
      return;
    }
    const household = getActiveHousehold(bootstrap);
    const householdState = bootstrap.householdState || {};
    this.setData({
      status: bootstrap.cacheState === "cached" ? "cached" : "ready",
      cacheState: bootstrap.cacheState || "",
      errorText: "",
      days: buildMealDays(householdState.mealPlan || {}, {
        pantrySignals: householdState.pantryItems || [],
      }),
      canEditMenu: getHouseholdRole(bootstrap) === "owner",
      stateVersion: bootstrap.stateVersion || "",
      householdName: household?.name || "我的家",
    });
  },
  async replaceDinner(event = {}) {
    if (!this.data.canEditMenu) {
      const error = new Error("forbidden: only the household owner can replace dinner");
      error.code = "forbidden";
      throw error;
    }
    if (this.data.cacheState === "cached") {
      const error = new Error("offline_menu_replacement_unavailable");
      error.code = "offline_menu_replacement_unavailable";
      throw error;
    }
    const bootstrap = appStore.getState().bootstrap;
    const dateKey = String(event?.currentTarget?.dataset?.dateKey || event?.detail?.dateKey || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || this.data.pendingAction) return null;
    const recipeId = String(event?.currentTarget?.dataset?.recipeId || "");
    const suppliedEntries = Array.isArray(event?.detail?.entries) ? event.detail.entries : null;
    const dinner = suppliedEntries ?? (recipeId ? [{ recipeId, quantity: 1 }] : []);
    const currentMealPlan = bootstrap?.householdState?.mealPlan || {};
    const currentDay = currentMealPlan[dateKey] || {};
    const mealPlan = {
      ...currentMealPlan,
      [dateKey]: {
        breakfast: Array.isArray(currentDay.breakfast) ? currentDay.breakfast : [],
        lunch: Array.isArray(currentDay.lunch) ? currentDay.lunch : [],
        dinner,
      },
    };
    this.setData({ pendingAction: "replace_dinner", errorText: "", conflictVisible: false });
    try {
      const envelope = await saveHouseholdStatePatch({ mealPlan }, {
        householdId: bootstrap.activeHouseholdId,
        stateVersion: bootstrap.stateVersion,
        idempotencyKey: createMutationId("meal-plan"),
      });
      appStore.replaceBootstrap(envelope);
      this.syncState();
      return envelope;
    } catch (error) {
      if (error?.status === 409 && error?.code === "state_version_conflict" && error.latestEnvelope) {
        appStore.replaceBootstrap(error.latestEnvelope);
        this.syncState();
        this.setData({
          conflictVisible: true,
          stateVersion: error.latestEnvelope.stateVersion || "",
          errorText: "家人刚刚更新了安排，已为你载入最新版本。",
        });
        return null;
      }
      this.setData({ errorText: "这次菜单没有保存成功，请联网后重试。" });
      throw error;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },
  retry() { this.setData({ status: "loading", errorText: "" }); this.syncState(); }
});

const { appStore } = require("../../utils/store");
const { guardNativeTab } = require("../../utils/native-shell-guard");
const certifiedRecipes = require("../../data/certified-recipes");
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
    menuEditAvailable: false,
    stateVersion: "",
    conflictVisible: false,
    pendingAction: "",
    chooserVisible: false,
    chooserDateKey: "",
    chooserDateLabel: "",
    recipeChoices: [],
  },
  onShow() { if (guardNativeTab()) this.syncState(); },
  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap) {
      this.setData({ status: "empty", errorText: "", days: [], canEditMenu: false, menuEditAvailable: false, stateVersion: "" });
      return;
    }
    const household = getActiveHousehold(bootstrap);
    const householdState = bootstrap.householdState || {};
    const cached = bootstrap.cacheState === "cached";
    const canEditMenu = getHouseholdRole(bootstrap) === "owner";
    this.setData({
      status: cached ? "cached" : "ready",
      cacheState: bootstrap.cacheState || "",
      errorText: "",
      days: buildMealDays(householdState.mealPlan || {}, {
        pantrySignals: householdState.pantryItems || [],
      }),
      canEditMenu,
      menuEditAvailable: canEditMenu && !cached,
      stateVersion: bootstrap.stateVersion || "",
      householdName: household?.name || "我的家",
    });
  },
  openRecipeChooser(event = {}) {
    if (!this.data.menuEditAvailable || this.data.pendingAction) return;
    const dateKey = String(event?.detail?.dateKey || event?.currentTarget?.dataset?.dateKey || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const day = this.data.days.find((item) => item.dateKey === dateKey);
    if (!day) return;
    const selectedIds = new Set((Array.isArray(day.dinner) ? day.dinner : []).map((entry) => entry.recipeId));
    this.setData({
      chooserVisible: true,
      chooserDateKey: dateKey,
      chooserDateLabel: day.label || dateKey,
      recipeChoices: certifiedRecipes.map((recipe) => ({
        recipeId: recipe.id,
        title: recipe.title,
        minutes: recipe.timeMinutes || recipe.cookAssist?.totalMinutes || 0,
        effortLabel: effortLabel(recipe.cookAssist?.effortTier),
        selected: selectedIds.has(recipe.id),
      })),
    });
  },
  toggleRecipe(event = {}) {
    if (!this.data.chooserVisible || this.data.pendingAction) return;
    const recipeId = String(event?.currentTarget?.dataset?.recipeId || "");
    if (!recipeId) return;
    this.setData({
      recipeChoices: this.data.recipeChoices.map((choice) => (
        choice.recipeId === recipeId ? { ...choice, selected: !choice.selected } : choice
      )),
    });
  },
  clearRecipeSelection() {
    if (!this.data.chooserVisible || this.data.pendingAction) return;
    this.setData({ recipeChoices: this.data.recipeChoices.map((choice) => ({ ...choice, selected: false })) });
  },
  closeRecipeChooser() {
    if (this.data.pendingAction) return;
    this.setData({ chooserVisible: false, chooserDateKey: "", chooserDateLabel: "", recipeChoices: [] });
  },
  async saveRecipeSelection() {
    if (!this.data.chooserVisible || this.data.pendingAction) return null;
    const selectedIds = new Set(this.data.recipeChoices.filter((choice) => choice.selected).map((choice) => choice.recipeId));
    const entries = certifiedRecipes.filter((recipe) => selectedIds.has(recipe.id)).map(recipeSnapshot);
    const result = await this.replaceDinner({ detail: { dateKey: this.data.chooserDateKey, entries } });
    if (result) this.closeRecipeChooser();
    return result;
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
          chooserVisible: false,
          chooserDateKey: "",
          chooserDateLabel: "",
          recipeChoices: [],
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

function recipeSnapshot(recipe) {
  return {
    recipeId: recipe.id,
    title: String(recipe.title || recipe.name || recipe.id),
    minutes: Number(recipe.timeMinutes || recipe.cookAssist?.totalMinutes) || 0,
    ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((ingredient) => ({
      name: String(ingredient.name || ""),
      amount: ingredient.amount,
      unit: String(ingredient.unit || ""),
      required: ingredient.required !== false,
    })),
    quantity: 1,
  };
}

function effortLabel(tier) {
  return { quick_15: "15 分钟", easy_30: "30 分钟", normal: "正常做" }[tier] || "认证菜谱";
}

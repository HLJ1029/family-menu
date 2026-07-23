const { guardNativeTab } = require("../../utils/native-shell-guard");
const { appStore } = require("../../utils/store");
const { recommendDinner } = require("../../utils/recommendation");
const {
  buildDinnerPlan,
  canReplaceHouseholdPlan,
  createMealRun,
  currentHouseholdRole,
  formatDinnerDateKey,
  loadCurrentMealRun,
  mergeActiveGuestMealRun,
} = require("../../utils/meal-run");
const { trackEvent } = require("../../utils/telemetry");

const EFFORT_OPTIONS = [
  { id: "quick_15", title: "15 分钟·只求开饭", detail: "一锅或一盘，配现成主食" },
  { id: "easy_30", title: "30 分钟·简单做", detail: "一道主菜加极简配菜或汤" },
  { id: "normal", title: "正常做·今天有精力", detail: "完整菜单，先看时间和缺什么" },
];
const EFFORT_TIERS = new Set(EFFORT_OPTIONS.map((option) => option.id));
const LOCKED_STATUSES = new Set(["cooking", "completed"]);

Page({
  data: {
    status: "loading",
    viewState: "loading",
    effortOptions: EFFORT_OPTIONS,
    effortTier: "",
    recommendation: null,
    plan: null,
    mealRun: null,
    householdRole: "guest",
    canReplacePlan: true,
    pendingAction: "",
    errorText: "",
    cacheState: "",
  },

  async onLoad() {
    this._skipFirstShow = true;
    return this.initialize();
  },

  async onShow() {
    if (!guardNativeTab()) return;
    if (this._skipFirstShow) {
      this._skipFirstShow = false;
      return;
    }
    if (!this._initialized) return this.initialize();
    if (this.data.pendingAction) return;
    return this.refreshVisibleMealRun();
  },

  async initialize() {
    if (this.data.pendingAction === "initialize") return;
    this._initialized = true;
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap) {
      this.setView("error", { errorText: "今晚的家庭信息还没有准备好，请重新加载。" });
      return;
    }
    if (bootstrap.capabilities?.mealExecutionEnabled !== true) {
      wx.reLaunch({ url: "/pages/legacy/index?reason=meal_execution_disabled" });
      return;
    }
    const ownerUserId = String(bootstrap.user?.id || "");
    const dateKey = formatDinnerDateKey();
    this._dateKey = dateKey;
    this.setView("loading", {
      pendingAction: "initialize",
      errorText: "",
      householdRole: currentHouseholdRole(bootstrap),
      canReplacePlan: canReplaceHouseholdPlan(bootstrap, ownerUserId),
      cacheState: bootstrap.cacheState || "",
    });
    try {
      let mealRun = bootstrap.currentMealRun || null;
      if (mealRun && ["cooking", "completed"].includes(mealRun.status)) {
        this.applyMealRun(mealRun);
        return;
      }
      const merge = await mergeActiveGuestMealRun({ bootstrap, dateKey });
      if (merge.mealRun || merge.guestRun) mealRun = merge.mealRun || merge.guestRun;
      if (!mealRun && !bootstrap.activeHouseholdId) {
        mealRun = await loadCurrentMealRun({ bootstrap, dateKey });
      }
      if (mealRun) this.applyMealRun(mealRun);
      else this.setView("choose_effort", { mealRun: null, plan: null });
    } catch (error) {
      this.setView("error", { errorText: errorMessage(error, "今晚的安排暂时没有加载成功。") });
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async selectEffort(event) {
    const tier = String(event?.currentTarget?.dataset?.tier || event?.detail?.tier || "");
    if (!EFFORT_TIERS.has(tier) || this.data.pendingAction || LOCKED_STATUSES.has(this.data.mealRun?.status)) return;
    this.setData({ effortTier: tier, pendingAction: "recommendation", errorText: "" });
    trackEvent("effort_tier_selected", { page: "tonight", effortTier: tier });
    try {
      const recommendation = await this.requestRecommendation("initial", { effortTier: tier, stateVersion: "" });
      this.applyRecommendation(recommendation, tier);
    } catch (error) {
      this.setView("error", { errorText: errorMessage(error, "这套晚饭暂时没有准备好，请重试。") });
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async nextRecommendation() {
    if (
      this.data.pendingAction
      || !EFFORT_TIERS.has(this.data.effortTier)
      || LOCKED_STATUSES.has(this.data.mealRun?.status)
    ) return;
    this.setData({ pendingAction: "next", errorText: "" });
    try {
      let recommendation;
      try {
        recommendation = await this.requestRecommendation("next", {
          stateVersion: this.data.recommendation?.stateVersion || "",
        });
      } catch (error) {
        if (error?.code === "recommendation_state_conflict") {
          recommendation = await this.requestRecommendation("initial", { stateVersion: "" });
        } else if (Number(error?.status) === 409) {
          const latest = await this.refreshMealRun();
          if (latest) return;
          throw error;
        } else {
          throw error;
        }
      }
      this.applyRecommendation(recommendation, this.data.effortTier);
    } catch (error) {
      this.setData({ errorText: errorMessage(error, "暂时换不了下一组，请稍后重试。") });
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async acceptRecommendation() {
    if (
      this.data.pendingAction
      || !this.data.recommendation
      || LOCKED_STATUSES.has(this.data.mealRun?.status)
    ) return;
    if (!this.data.canReplacePlan) {
      this.setData({ errorText: "请让家庭创建者确定今晚菜单。" });
      return;
    }
    const recommendation = this.data.recommendation;
    this.setView("accepting", { pendingAction: "accept", errorText: "" });
    try {
      const bootstrap = appStore.getState().bootstrap;
      const mealRun = await createMealRun({
        bootstrap,
        recommendation,
        effortTier: this.data.effortTier,
        dateKey: this._dateKey || formatDinnerDateKey(),
        stateVersion: bootstrap?.stateVersion || "",
      });
      trackEvent("plan_accepted", {
        page: "tonight",
        householdId: bootstrap?.activeHouseholdId || undefined,
        mealRunId: safeTelemetryId(mealRun.id),
        recommendationId: safeTelemetryId(recommendation.recommendationId),
        effortTier: this.data.effortTier,
      });
      this.applyMealRun(mealRun);
    } catch (error) {
      if (Number(error?.status) === 409) {
        const latest = await this.refreshMealRun().catch(() => null);
        if (latest) {
          this.applyMealRun(latest);
          return;
        }
      }
      this.setView("recommendation", { errorText: errorMessage(error, "今晚这顿暂时没有保存成功，请重试。") });
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  startCooking() {
    if (this.data.mealRun?.status !== "planned") return;
    wx.navigateTo({
      url: `/packageCooking/pages/cooking/index?mealRunId=${encodeURIComponent(this.data.mealRun.id)}&action=start`,
    });
  },

  resumeCooking() {
    if (this.data.mealRun?.status !== "cooking") return;
    wx.navigateTo({
      url: `/packageCooking/pages/cooking/index?mealRunId=${encodeURIComponent(this.data.mealRun.id)}`,
    });
  },

  replacePlannedMeal() {
    if (this.data.mealRun?.status !== "planned") return;
    if (!this.data.canReplacePlan) {
      this.setData({ errorText: "请让家庭创建者调整今晚菜单。" });
      return;
    }
    this.setView("choose_effort", {
      effortTier: "",
      recommendation: null,
      plan: null,
      errorText: "",
    });
  },

  async retry() {
    if (EFFORT_TIERS.has(this.data.effortTier)) {
      return this.selectEffort({ currentTarget: { dataset: { tier: this.data.effortTier } } });
    }
    return this.initialize();
  },

  async refreshMealRun() {
    const bootstrap = appStore.getState().bootstrap;
    const mealRun = await loadCurrentMealRun({
      bootstrap,
      dateKey: this._dateKey || formatDinnerDateKey(),
      allowCache: false,
    });
    if (mealRun) this.applyMealRun(mealRun);
    return mealRun;
  },

  async refreshVisibleMealRun() {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap) return this.initialize();
    this.setData({ pendingAction: "refresh", errorText: "" });
    try {
      const merge = await mergeActiveGuestMealRun({
        bootstrap,
        dateKey: this._dateKey || formatDinnerDateKey(),
      });
      if (merge.mealRun || merge.guestRun) {
        this.applyMealRun(merge.mealRun || merge.guestRun);
        return;
      }
      const mealRun = await loadCurrentMealRun({
        bootstrap,
        dateKey: this._dateKey || formatDinnerDateKey(),
        allowCache: true,
      });
      if (mealRun) this.applyMealRun(mealRun);
      else if (this.data.mealRun && !this.data.mealRun.localOnly) {
        this.setView("choose_effort", { mealRun: null, plan: null, effortTier: "" });
      }
    } catch (error) {
      this.setData({ errorText: errorMessage(error, "今晚的最新进度暂时没有同步成功。") });
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  requestRecommendation(action, override = {}) {
    const bootstrap = appStore.getState().bootstrap;
    return recommendDinner({
      bootstrap,
      householdId: bootstrap?.activeHouseholdId || "guest",
      dateKey: this._dateKey || formatDinnerDateKey(),
      effortTier: override.effortTier || this.data.effortTier,
      action,
      stateVersion: override.stateVersion ?? this.data.recommendation?.stateVersion ?? "",
      expectedUserId: bootstrap?.user?.id || "",
      timeoutMs: 4500,
    });
  },

  applyRecommendation(recommendation, effortTier) {
    const bootstrap = appStore.getState().bootstrap;
    const plan = buildDinnerPlan(recommendation, bootstrap);
    this.setView("recommendation", {
      effortTier,
      recommendation,
      plan,
      mealRun: null,
      errorText: "",
    });
    trackEvent("plan_presented", {
      page: "tonight",
      householdId: bootstrap?.activeHouseholdId || undefined,
      recommendationId: safeTelemetryId(recommendation.recommendationId),
      effortTier,
    });
  },

  applyMealRun(mealRun) {
    const bootstrap = appStore.getState().bootstrap;
    let plan = null;
    try {
      plan = buildDinnerPlan({
        recommendationId: `run-${mealRun.id}`,
        recipeIds: mealRun.recipeIds,
      }, bootstrap);
    } catch (_) {
      plan = null;
    }
    const viewState = mealRun.status === "planned"
      ? "planned"
      : mealRun.status === "cooking"
        ? "resuming"
        : mealRun.status === "completed"
          ? "completed"
          : "choose_effort";
    this.setView(viewState, {
      mealRun,
      effortTier: mealRun.effortTier || this.data.effortTier,
      plan,
      errorText: "",
      cacheState: mealRun.cacheState || this.data.cacheState,
    });
  },

  setView(viewState, patch = {}) {
    this.setData({
      ...patch,
      viewState,
      status: viewState === "loading" ? "loading" : viewState === "error" ? "error" : "ready",
    });
  },
});

function safeTelemetryId(value) {
  const normalized = String(value || "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
  return normalized || undefined;
}

function errorMessage(error, fallback) {
  if (error?.code === "forbidden") return "请让家庭创建者确定今晚菜单。";
  if (error?.code === "meal_run_locked") return "家人已经开始做这顿饭了，已为你刷新进度。";
  if (["network_error", "request_timeout"].includes(error?.code)) return "网络有点慢，请检查连接后重试。";
  return fallback;
}

const { loadBootstrap } = require("../../../utils/bootstrap");
const {
  abandonCookingMealRun,
  completeCookingMealRun,
  downgradeCookingMealRun,
  formatDinnerDateKey,
  loadMealRunForCooking,
  normalizeMealRunId,
  progressCookingMealRun,
  saveCookingFeedback,
  startCookingMealRun,
} = require("../../../utils/meal-run");
const {
  nextAvailableTimelineStep,
  nextTimelineStep,
  remainingSeconds,
  runningPassiveTimers,
  timelineStepIndex,
} = require("../../../utils/meal-timeline");
const { enqueueMutation, flushMutationQueue, readQueue } = require("../../../utils/offline-queue");
const { guardNativeTab } = require("../../../utils/native-shell-guard");
const { appStore } = require("../../../utils/store");
const { startSpan } = require("../../../utils/telemetry");

const DOWNGRADES = [
  { id: "drop_side", apiAction: "remove_optional_side", label: "去掉非必要配菜" },
  { id: "lower_effort_recipe", apiAction: "lower_effort_recipe", label: "换成更省力的认证做法" },
  { id: "ready_staple", apiAction: "ready_staple", label: "主食改成现成的" },
];
const ABANDON_REASONS = [
  { id: "too_much_effort", label: "今天实在太累" },
  { id: "missing_ingredients", label: "缺少关键食材" },
  { id: "plans_changed", label: "临时改变安排" },
  { id: "cooking_failed", label: "这次没做成功" },
];
const FEEDBACK_VALUES = new Set(["want_again", "change_it", "too_hard"]);
const MUTATING_STATUSES = new Set(["planned", "cooking"]);

const pageDefinition = {
  data: {
    status: "loading",
    viewState: "loading",
    mealRun: null,
    currentStep: null,
    currentActiveStep: null,
    nextStep: null,
    hasRemainingSteps: false,
    runningTimers: [],
    elapsedSeconds: 0,
    elapsedMinutes: 0,
    estimatedTotalSeconds: 0,
    estimatedTotalMinutes: 0,
    progressPercent: 0,
    pendingAction: "",
    isOnline: true,
    networkText: "网络正常",
    unsyncedCount: 0,
    showBackWarning: false,
    syncFrozen: false,
    errorText: "",
    downgradeSheetVisible: false,
    abandonSheetVisible: false,
    downgradeOptions: DOWNGRADES,
    abandonReasons: ABANDON_REASONS,
    feedbackValue: "",
  },

  async onLoad(options = {}) {
    this._dateKey = formatDinnerDateKey();
    this._idempotencyKeys = new Map();
    this._pendingMutations = new Map();
    this._hidden = false;
    this._skipFirstShow = true;
    this._networkListener = ({ isConnected, networkType }) => {
      this.setData({
        isOnline: Boolean(isConnected),
        networkText: isConnected ? networkLabel(networkType) : "网络已断开，进度会稍后同步",
      });
      if (isConnected && !this.data.syncFrozen) this.reconcile().catch(() => {});
    };
    if (typeof wx.onNetworkStatusChange === "function") wx.onNetworkStatusChange(this._networkListener);
    this.readNetworkStatus();

    if (!guardNativeTab()) return;
    try {
      this._mealRunId = normalizeMealRunId(options.mealRunId);
      this._entryAction = options.action === "start" ? "start" : options.action ? "invalid" : "";
      if (this._entryAction === "invalid") throw codedError("meal_run_route_invalid");
      await this.loadRun({ startIfPlanned: this._entryAction === "start" });
      this.startClock();
    } catch (error) {
      this.setError(errorMessage(error, "这顿饭暂时没有加载成功，请返回今晚重试。"));
    }
  },

  async onShow() {
    this._hidden = false;
    this.refreshDerivedState();
    if (this._skipFirstShow) {
      this._skipFirstShow = false;
      return;
    }
    if (!this.data.syncFrozen) await this.reconcile();
    this.startClock();
  },

  onHide() {
    this._hidden = true;
    this.stopClock();
  },

  onUnload() {
    this.stopClock();
    if (typeof wx.offNetworkStatusChange === "function" && this._networkListener) {
      wx.offNetworkStatusChange(this._networkListener);
    }
  },

  async retry() {
    if (!this._mealRunId) {
      wx.reLaunch({ url: "/pages/tonight/index" });
      return;
    }
    this.setData({ status: "loading", viewState: "loading", errorText: "" });
    await this.loadRun({ startIfPlanned: this._entryAction === "start" });
  },

  async loadRun({ startIfPlanned = false } = {}) {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap?.user?.id) throw codedError("invalid_session");
    let mealRun = await loadMealRunForCooking({
      bootstrap,
      mealRunId: this._mealRunId,
      dateKey: this._dateKey,
      allowCache: true,
    });
    this.applyMealRun(mealRun);
    if (startIfPlanned && mealRun.status === "planned") {
      mealRun = await this.runMutation("start", () => startCookingMealRun(mealRun, {
        bootstrap,
        idempotencyKey: this.idempotencyKey("start"),
      }));
    }
    this.updateUnsyncedState();
  },

  async startPlanned() {
    if (this.data.pendingAction || this.data.mealRun?.status !== "planned") return;
    await this.loadRun({ startIfPlanned: true });
  },

  async advanceStep(event) {
    const mealRun = this.data.mealRun;
    const tappedStepId = String(event?.currentTarget?.dataset?.stepId || event?.detail?.stepId || "");
    if (
      this.data.syncFrozen
      || this.data.pendingAction
      || mealRun?.status !== "cooking"
      || tappedStepId !== mealRun.currentStepId
    ) return;
    const next = nextAvailableTimelineStep(mealRun.timeline, mealRun.currentStepId);
    if (!next) return;
    const timerEndsAt = next.attention === "passive" ? next.endsAt : latestRunningTimerEnd(mealRun.timeline, next.id);
    const payload = { currentStepId: next.id, timerEndsAt };
    if (!this.data.isOnline && !mealRun.localOnly) {
      this.queueMealMutation("meal_progress", payload, `progress:${next.id}`);
      this.applyMealRun(chooseMonotonicMealRun(mealRun, {
        ...mealRun,
        ...payload,
        pendingSync: true,
      }));
      return;
    }
    await this.runMutation(`progress:${next.id}`, async () => {
      const updated = await progressCookingMealRun(mealRun, {
        bootstrap: appStore.getState().bootstrap,
        ...payload,
        idempotencyKey: this.idempotencyKey(`progress:${next.id}`),
      });
      return chooseMonotonicMealRun(this.data.mealRun, updated);
    }, {
      onOffline: () => {
        this.queueMealMutation("meal_progress", payload, `progress:${next.id}`);
        const optimistic = chooseMonotonicMealRun(mealRun, {
          ...mealRun,
          ...payload,
          pendingSync: true,
        });
        this.applyMealRun(optimistic);
        return optimistic;
      },
    });
  },

  showDowngradeSheet() {
    if (!MUTATING_STATUSES.has(this.data.mealRun?.status) || this.data.syncFrozen) return;
    this.setData({ downgradeSheetVisible: true, abandonSheetVisible: false });
  },

  hideDowngradeSheet() {
    this.setData({ downgradeSheetVisible: false });
  },

  async downgrade(event) {
    const uiAction = String(event?.currentTarget?.dataset?.action || event?.detail?.action || "");
    const option = DOWNGRADES.find((item) => item.id === uiAction);
    const mealRun = this.data.mealRun;
    if (!option || this.data.pendingAction || this.data.syncFrozen || !MUTATING_STATUSES.has(mealRun?.status)) return;
    if (!this.data.isOnline && !mealRun.localOnly) {
      this.setData({
        downgradeSheetVisible: false,
        errorText: "简化方案需要联网确认，当前进度不会丢失。",
      });
      return;
    }
    this.setData({ downgradeSheetVisible: false });
    await this.runMutation(`downgrade:${option.apiAction}`, () => downgradeCookingMealRun(mealRun, option.apiAction, {
      bootstrap: appStore.getState().bootstrap,
      idempotencyKey: this.idempotencyKey(`downgrade:${option.apiAction}`),
    }));
  },

  showAbandonSheet() {
    if (!MUTATING_STATUSES.has(this.data.mealRun?.status) || this.data.syncFrozen) return;
    this.setData({ abandonSheetVisible: true, downgradeSheetVisible: false });
  },

  hideAbandonSheet() {
    this.setData({ abandonSheetVisible: false });
  },

  noop() {},

  async abandon(event) {
    const reason = String(event?.currentTarget?.dataset?.reason || event?.detail?.reason || "");
    const mealRun = this.data.mealRun;
    if (
      !ABANDON_REASONS.some((item) => item.id === reason)
      || this.data.pendingAction
      || this.data.syncFrozen
      || !MUTATING_STATUSES.has(mealRun?.status)
    ) return;
    this.setData({ abandonSheetVisible: false });
    if (!this.data.isOnline && !mealRun.localOnly) {
      this.queueMealMutation("meal_abandon", { reason }, `abandon:${reason}`);
      this.setData({ errorText: "已记下这次变化，联网后会同步给家人。" });
      return;
    }
    await this.runMutation(`abandon:${reason}`, () => abandonCookingMealRun(mealRun, reason, {
      bootstrap: appStore.getState().bootstrap,
      idempotencyKey: this.idempotencyKey(`abandon:${reason}`),
    }), {
      onOffline: () => {
        this.queueMealMutation("meal_abandon", { reason }, `abandon:${reason}`);
        this.setData({ errorText: "已记下这次变化，联网后会同步给家人。" });
        return mealRun;
      },
    });
  },

  async completeMeal() {
    const mealRun = this.data.mealRun;
    if (this.data.pendingAction || this.data.syncFrozen || mealRun?.status !== "cooking") return;
    if (!this.data.isOnline && !mealRun.localOnly) {
      this.queueMealMutation("meal_complete", {}, "complete");
      this.setData({ errorText: "已记下“上桌了”，联网确认后才会计为完成。" });
      return;
    }
    await this.runMutation("complete", () => completeCookingMealRun(mealRun, {
      bootstrap: appStore.getState().bootstrap,
      idempotencyKey: this.idempotencyKey("complete"),
    }), {
      onOffline: () => {
        this.queueMealMutation("meal_complete", {}, "complete");
        this.setData({ errorText: "已记下“上桌了”，联网确认后才会计为完成。" });
        return mealRun;
      },
    });
  },

  async saveFeedback(event) {
    const value = String(event?.detail?.value || event?.currentTarget?.dataset?.value || "");
    const mealRun = this.data.mealRun;
    if (
      !FEEDBACK_VALUES.has(value)
      || this.data.pendingAction
      || this.data.syncFrozen
      || mealRun?.status !== "completed"
      || currentUserFeedback(mealRun) === value
    ) return;
    if (!this.data.isOnline && !mealRun.localOnly) {
      this.queueMealMutation("meal_feedback", { value }, `feedback:${value}`);
      this.setData({ feedbackValue: value, errorText: "反馈已保存在本机，联网后会同步。" });
      return;
    }
    await this.runMutation(`feedback:${value}`, () => saveCookingFeedback(mealRun, value, {
      bootstrap: appStore.getState().bootstrap,
      idempotencyKey: this.idempotencyKey(`feedback:${value}`),
    }), {
      onOffline: () => {
        this.queueMealMutation("meal_feedback", { value }, `feedback:${value}`);
        this.setData({ feedbackValue: value, errorText: "反馈已保存在本机，联网后会同步。" });
        return mealRun;
      },
    });
  },

  async reconcile() {
    if (this._reconcilePromise || this.data.syncFrozen || !this.data.isOnline || !this._mealRunId) {
      return this._reconcilePromise;
    }
    this._reconcilePromise = (async () => {
      const outcome = await flushMutationQueue();
      if (outcome?.status === "conflict") {
        await this.handleConflict({ latestEnvelope: outcome.envelope });
        return;
      }
      this.updateUnsyncedState();
      if (outcome?.status === "retry") return;
      const bootstrap = appStore.getState().bootstrap;
      const latest = await loadMealRunForCooking({
        bootstrap,
        mealRunId: this._mealRunId,
        dateKey: this._dateKey,
        allowCache: true,
      });
      this.applyMealRun(chooseMonotonicMealRun(this.data.mealRun, latest));
    })().catch((error) => {
      if (Number(error?.status) === 409) return this.handleConflict(error);
      if (!isNetworkError(error)) this.setData({ errorText: errorMessage(error, "最新进度暂时没有同步成功。") });
    }).finally(() => {
      this._reconcilePromise = null;
    });
    return this._reconcilePromise;
  },

  async runMutation(key, mutate, { onOffline } = {}) {
    if (this._pendingMutations?.has(key)) return this._pendingMutations.get(key);
    const mealRunId = safeTelemetryId(this.data.mealRun?.id || this._mealRunId);
    const span = startSpan("cooking_mutation", { page: "cooking", mealRunId });
    this.setData({ pendingAction: key, errorText: "" });
    const pending = Promise.resolve()
      .then(mutate)
      .then((mealRun) => {
        if (mealRun) this.applyMealRun(mealRun);
        span.end("completed");
        return mealRun;
      })
      .catch(async (error) => {
        if (Number(error?.status) === 409) {
          span.end("failed", { errorCode: "conflict" });
          await this.handleConflict(error);
          return this.data.mealRun;
        }
        if (isNetworkError(error)) {
          span.end("offline", { errorCode: "network_error" });
          this.setData({ isOnline: false, networkText: "网络已断开，进度会稍后同步" });
          if (typeof onOffline === "function") return onOffline();
        } else {
          span.end("failed", { errorCode: safeErrorCode(error) });
        }
        this.setData({ errorText: errorMessage(error, "这一步暂时没有保存成功，请重试。") });
        return this.data.mealRun;
      })
      .finally(() => {
        this._pendingMutations.delete(key);
        if (!this._pendingMutations.size) this.setData({ pendingAction: "" });
      });
    this._pendingMutations.set(key, pending);
    return pending;
  },

  async handleConflict(error = {}) {
    this.setData({
      syncFrozen: true,
      pendingAction: "",
      errorText: "家里的安排刚刚有更新，请确认最新进度",
    });
    let envelope = error.latestEnvelope || null;
    if (!envelope) {
      try {
        envelope = await loadBootstrap({ allowCache: false });
      } catch (_) {
        envelope = null;
      }
    }
    if (envelope) appStore.replaceBootstrap(envelope);
    const latest = envelope?.currentMealRun?.id === this._mealRunId
      ? envelope.currentMealRun
      : await loadMealRunForCooking({
        bootstrap: appStore.getState().bootstrap,
        mealRunId: this._mealRunId,
        dateKey: this._dateKey,
        allowCache: true,
      }).catch(() => null);
    if (latest) this.applyMealRun(latest, { preserveConflict: true });
    this.updateUnsyncedState();
  },

  queueMealMutation(type, data, key) {
    const mealRun = this.data.mealRun;
    const bootstrap = appStore.getState().bootstrap;
    const action = {
      id: this.idempotencyKey(key),
      idempotencyKey: this.idempotencyKey(key),
      type,
      householdId: mealRun.householdId || bootstrap.activeHouseholdId,
      mealRunId: mealRun.id,
      createdAt: Date.now(),
      stateVersion: bootstrap.stateVersion || "",
      ...(Object.keys(data).length ? { data } : {}),
    };
    enqueueMutation(action);
    this.updateUnsyncedState();
    return action;
  },

  applyMealRun(mealRun, { preserveConflict = false } = {}) {
    if (!mealRun) return;
    const feedbackValue = currentUserFeedback(mealRun);
    this.setData({
      status: "ready",
      viewState: mealRun.status,
      mealRun,
      feedbackValue,
      errorText: preserveConflict ? this.data.errorText : "",
    });
    this.refreshDerivedState();
  },

  refreshDerivedState() {
    const mealRun = this.data.mealRun;
    if (!mealRun?.timeline?.steps?.length) {
      this.setData({
        currentStep: null,
        currentActiveStep: null,
        nextStep: null,
        hasRemainingSteps: false,
        runningTimers: [],
        elapsedSeconds: 0,
        elapsedMinutes: 0,
        estimatedTotalSeconds: 0,
        estimatedTotalMinutes: 0,
        progressPercent: 0,
      });
      return;
    }
    const now = new Date().toISOString();
    const currentIndex = timelineStepIndex(mealRun.timeline, mealRun.currentStepId);
    const currentStep = mealRun.timeline.steps[currentIndex] || null;
    const nextCandidate = nextTimelineStep(mealRun.timeline, mealRun.currentStepId);
    const nextStep = nextAvailableTimelineStep(mealRun.timeline, mealRun.currentStepId, now);
    const startedAtMs = Date.parse(mealRun.startedAt || mealRun.timeline.startedAt);
    const elapsedSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
      : 0;
    const total = Number(mealRun.timeline.totalSeconds) || 0;
    this.setData({
      currentStep,
      currentActiveStep: currentStep?.attention === "active"
        ? currentStep
        : nextStep?.attention === "active" ? nextStep : null,
      nextStep,
      hasRemainingSteps: Boolean(nextCandidate),
      runningTimers: runningPassiveTimers(mealRun.timeline, mealRun.currentStepId, now),
      elapsedSeconds,
      elapsedMinutes: Math.floor(elapsedSeconds / 60),
      estimatedTotalSeconds: total,
      estimatedTotalMinutes: Math.ceil(total / 60),
      progressPercent: total ? Math.min(100, Math.round(elapsedSeconds / total * 100)) : 0,
    });
  },

  updateUnsyncedState() {
    const mealRun = this.data.mealRun;
    const unsyncedCount = mealRun?.localOnly
      ? 0
      : readQueue().filter((action) => action.mealRunId === (mealRun?.id || this._mealRunId)).length;
    this.setData({
      unsyncedCount,
      showBackWarning: unsyncedCount > 0 && mealRun?.status === "cooking",
    });
  },

  readNetworkStatus() {
    if (typeof wx.getNetworkType !== "function") return;
    wx.getNetworkType({
      success: ({ networkType }) => {
        const isOnline = networkType !== "none";
        this.setData({
          isOnline,
          networkText: isOnline ? networkLabel(networkType) : "网络已断开，进度会稍后同步",
        });
      },
    });
  },

  startClock() {
    this.stopClock();
    if (this._hidden || this.data.mealRun?.status !== "cooking") return;
    this._clock = setInterval(() => this.refreshDerivedState(), 1000);
  },

  stopClock() {
    if (this._clock) clearInterval(this._clock);
    this._clock = null;
  },

  idempotencyKey(action) {
    if (!this._idempotencyKeys.has(action)) {
      this._idempotencyKeys.set(action, `meal:${this._mealRunId}:${action}`);
    }
    return this._idempotencyKeys.get(action);
  },

  setError(errorText) {
    this.setData({ status: "error", viewState: "error", errorText });
  },
};

Page(pageDefinition);

function chooseMonotonicMealRun(current, incoming) {
  if (!current || !incoming || current.id !== incoming.id) return incoming || current;
  const ranks = { planned: 0, cooking: 1, abandoned: 2, completed: 3 };
  if ((ranks[incoming.status] ?? -1) < (ranks[current.status] ?? -1)) return current;
  if (incoming.status !== "cooking" || current.status !== "cooking") return incoming;
  const currentIndex = timelineStepIndex(current.timeline, current.currentStepId);
  const incomingIndex = timelineStepIndex(incoming.timeline, incoming.currentStepId);
  if (sameTimeline(current.timeline, incoming.timeline) && incomingIndex < currentIndex) return current;
  return incoming;
}

function sameTimeline(left, right) {
  const leftIds = left?.steps?.map((step) => step.id) || [];
  const rightIds = right?.steps?.map((step) => step.id) || [];
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function latestRunningTimerEnd(timeline, throughStepId) {
  const throughIndex = timelineStepIndex(timeline, throughStepId);
  return (timeline?.steps || [])
    .slice(0, throughIndex + 1)
    .filter((step) => step.attention === "passive")
    .map((step) => step.endsAt)
    .sort()
    .at(-1) || "";
}

function currentUserFeedback(mealRun) {
  const userId = String(appStore.getState().bootstrap?.user?.id || "guest");
  return (mealRun?.feedback || []).find((entry) => entry.userId === userId)?.value || "";
}

function networkLabel(networkType) {
  if (networkType === "wifi") return "网络正常 · Wi-Fi";
  if (networkType === "none") return "网络已断开，进度会稍后同步";
  return "网络正常";
}

function errorMessage(error, fallback) {
  if (error?.code === "meal_run_not_found") return "没有找到这顿饭，请返回今晚重新进入。";
  if (["meal_run_id_invalid", "meal_run_route_invalid"].includes(error?.code)) return "做饭链接不完整，请返回今晚重新进入。";
  if (error?.code === "meal_run_transition_invalid") return "这顿饭的状态已经变化，请确认最新进度。";
  if (error?.code === "forbidden") return "你已不在这个家庭中，无法继续修改这顿饭。";
  if (isNetworkError(error)) return "网络暂时不可用，已完成的步骤可以稍后同步。";
  return fallback;
}

function isNetworkError(error = {}) {
  return Number(error.status) === 0 || ["network_error", "request_timeout"].includes(error.code);
}

function safeTelemetryId(value) {
  const result = String(value || "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64);
  return result || undefined;
}

function safeErrorCode(error) {
  return ["invalid_session", "forbidden", "network_error"].includes(error?.code) ? error.code : "request_failed";
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  chooseMonotonicMealRun,
  remainingSeconds,
};

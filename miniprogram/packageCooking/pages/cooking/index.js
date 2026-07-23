const { loadBootstrap } = require("../../../utils/bootstrap");
const {
  abandonCookingMealRun,
  clearOptimisticMealProgress,
  completeCookingMealRun,
  downgradeCookingMealRun,
  formatDinnerDateKey,
  loadMealRunForCooking,
  normalizeMealRunId,
  progressCookingMealRun,
  saveCookingFeedback,
  startCookingMealRun,
  writeOptimisticMealProgress,
} = require("../../../utils/meal-run");
const {
  createActualPassiveTimer,
  nextAvailableTimelineStep,
  nextTimelineStep,
  remainingSeconds,
  runningPassiveTimers,
  timelineStepIndex,
} = require("../../../utils/meal-timeline");
const { enqueueMutation, flushMutationQueue, readQueue } = require("../../../utils/offline-queue");
const { guardNativeTab } = require("../../../utils/native-shell-guard");
const { requestHumi } = require("../../../utils/request");
const { prepareShareSnapshot } = require("../../../utils/share-snapshot");
const { appStore } = require("../../../utils/store");
const { startSpan, trackEvent } = require("../../../utils/telemetry");

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
const COOKING_TELEMETRY_ACTIONS = new Set(["progress", "timer", "downgrade", "feedback"]);

const pageDefinition = {
  data: {
    status: "loading",
    viewState: "loading",
    mealRun: null,
    currentStep: null,
    currentActiveStep: null,
    nextStep: null,
    displayNextStep: null,
    stepActionLabel: "",
    stepActionFromId: "",
    waitingForTimer: false,
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
    replacementDetected: false,
    canCreateTask: false,
    taskSuggestions: [],
    createdTasks: [],
    taskPendingId: "",
    taskErrorText: "",
    activeShareTaskId: "",
    activeTaskSharePayload: null,
    taskSharePreparingId: "",
    taskShareErrorId: "",
    canScheduleReminder: false,
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
      if (this.data.isOnline && !this.data.syncFrozen) await this.reconcile();
      await this.ensureCurrentPassiveTimer();
      await this.advanceUnlockedPassiveSteps();
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
    await this.ensureCurrentPassiveTimer();
    await this.advanceUnlockedPassiveSteps();
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
    try {
      await this.loadRun({ startIfPlanned: this._entryAction === "start" });
      if (this.data.isOnline && !this.data.syncFrozen) await this.reconcile();
      await this.ensureCurrentPassiveTimer();
      await this.advanceUnlockedPassiveSteps();
      this.startClock();
    } catch (error) {
      this.setError(errorMessage(error, "这顿饭暂时没有加载成功，请返回今晚重试。"));
    }
  },

  async loadRun({ startIfPlanned = false } = {}) {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap?.user?.id) throw codedError("invalid_session");
    const restoreSpan = startSpan("meal_run_restore", { page: "cooking" });
    let mealRun;
    try {
      mealRun = await loadMealRunForCooking({
        bootstrap,
        mealRunId: this._mealRunId,
        dateKey: this._dateKey,
        allowCache: true,
      });
      restoreSpan.end("completed", { page: "cooking" });
    } catch (error) {
      restoreSpan.end("failed", { page: "cooking", errorCode: error?.code || "request_failed" });
      throw error;
    }
    this.applyMealRun(mealRun);
    if (startIfPlanned && mealRun.status === "planned") {
      mealRun = await this.runMutation("start", () => startCookingMealRun(mealRun, {
        bootstrap,
        idempotencyKey: this.idempotencyKey("start"),
      }));
    }
    if (canCreateMealTask(this.data.mealRun)) await this.loadMealTasks();
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
    const now = new Date().toISOString();
    const next = nextAvailableTimelineStep(mealRun.timeline, mealRun.currentStepId, mealRun.timers, now);
    if (!next) return;
    const timer = next.attention === "passive" ? createActualPassiveTimer(next, now) : null;
    const payload = {
      currentStepId: next.id,
      timelineVersion: Number(mealRun.timelineVersion || 1),
      ...(timer ? { timer } : {}),
    };
    if (!this.data.isOnline && !mealRun.localOnly) {
      trackOfflineCookingMutation(`progress:${next.id}`, mealRun);
      this.queueMealMutation("meal_progress", payload, `progress:${next.id}`);
      writeOptimisticMealProgress(mealRun, {
        ownerUserId: appStore.getState().bootstrap?.user?.id,
        ...payload,
      });
      this.applyMealRun(chooseMonotonicMealRun(mealRun, {
        ...applyProgressPayload(mealRun, payload),
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
        writeOptimisticMealProgress(mealRun, {
          ownerUserId: appStore.getState().bootstrap?.user?.id,
          ...payload,
        });
        const optimistic = chooseMonotonicMealRun(mealRun, {
          ...applyProgressPayload(mealRun, payload),
          pendingSync: true,
        });
        this.applyMealRun(optimistic);
        return optimistic;
      },
    });
  },

  async ensureCurrentPassiveTimer() {
    const mealRun = this.data.mealRun;
    if (
      this.data.syncFrozen
      || this.data.pendingAction
      || mealRun?.status !== "cooking"
    ) return mealRun;
    const currentStep = mealRun.timeline?.steps?.find((step) => step.id === mealRun.currentStepId);
    if (currentStep?.attention !== "passive" || mealRun.timers?.[currentStep.id]) return mealRun;
    const timer = createActualPassiveTimer(currentStep, new Date().toISOString());
    const payload = {
      currentStepId: currentStep.id,
      timelineVersion: Number(mealRun.timelineVersion || 1),
      timer,
    };
    if (!this.data.isOnline && !mealRun.localOnly) {
      trackOfflineCookingMutation(`timer:${currentStep.id}`, mealRun);
      this.queueMealMutation("meal_progress", payload, `timer:${currentStep.id}`);
      writeOptimisticMealProgress(mealRun, {
        ownerUserId: appStore.getState().bootstrap?.user?.id,
        ...payload,
      });
      const optimistic = applyProgressPayload(mealRun, payload);
      this.applyMealRun({ ...optimistic, pendingSync: true });
      return optimistic;
    }
    return this.runMutation(`timer:${currentStep.id}`, () => progressCookingMealRun(mealRun, {
      bootstrap: appStore.getState().bootstrap,
      ...payload,
      idempotencyKey: this.idempotencyKey(`timer:${currentStep.id}`),
    }), {
      onOffline: () => {
        this.queueMealMutation("meal_progress", payload, `timer:${currentStep.id}`);
        writeOptimisticMealProgress(mealRun, {
          ownerUserId: appStore.getState().bootstrap?.user?.id,
          ...payload,
        });
        const optimistic = { ...applyProgressPayload(mealRun, payload), pendingSync: true };
        this.applyMealRun(optimistic);
        return optimistic;
      },
    });
  },

  async advanceUnlockedPassiveSteps() {
    if (this._autoAdvancePromise || this.data.syncFrozen || this.data.pendingAction) {
      return this._autoAdvancePromise;
    }
    this._autoAdvancePromise = (async () => {
      const stepLimit = this.data.mealRun?.timeline?.steps?.length || 0;
      for (let count = 0; count < stepLimit; count += 1) {
        const mealRun = this.data.mealRun;
        const currentIndex = timelineStepIndex(mealRun?.timeline, mealRun?.currentStepId);
        const currentStep = mealRun?.timeline?.steps?.[currentIndex] || null;
        const nextStep = nextAvailableTimelineStep(
          mealRun?.timeline,
          mealRun?.currentStepId,
          mealRun?.timers,
          new Date().toISOString(),
        );
        if (
          mealRun?.status !== "cooking"
          || currentStep?.attention !== "passive"
          || nextStep?.attention !== "passive"
        ) return;
        const previousStepId = mealRun.currentStepId;
        await this.advanceStep({ detail: { stepId: previousStepId } });
        if (this.data.mealRun?.currentStepId === previousStepId) return;
      }
    })().finally(() => {
      this._autoAdvancePromise = null;
    });
    return this._autoAdvancePromise;
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
      trackOfflineCookingMutation(`downgrade:${option.apiAction}`, mealRun);
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
    const payload = { timelineVersion: Number(mealRun.timelineVersion || 1) };
    if (!this.data.isOnline && !mealRun.localOnly) {
      this.queueMealMutation("meal_complete", payload, "complete");
      this.setData({ errorText: "已记下“上桌了”，联网确认后才会计为完成。" });
      return;
    }
    await this.runMutation("complete", () => completeCookingMealRun(mealRun, {
      bootstrap: appStore.getState().bootstrap,
      idempotencyKey: this.idempotencyKey("complete"),
    }), {
      onOffline: () => {
        this.queueMealMutation("meal_complete", payload, "complete");
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
      trackOfflineCookingMutation(`feedback:${value}`, mealRun);
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

  async createMealTask(event) {
    const suggestionId = String(event?.currentTarget?.dataset?.suggestionId || "");
    const suggestion = this.data.taskSuggestions.find((item) => item.id === suggestionId);
    const mealRun = this.data.mealRun;
    if (!suggestion || !this.data.canCreateTask || this.data.taskPendingId || mealRun?.status !== "cooking") return null;
    this.setData({ taskPendingId: suggestion.id, taskErrorText: "" });
    try {
      const payload = await requestHumi({
        path: `/meal-runs/${encodeURIComponent(mealRun.id)}/tasks`,
        method: "POST",
        data: suggestion.kind === "buy"
          ? { type: "buy", ingredientName: suggestion.ingredientName }
          : { type: "prep", stepId: suggestion.stepId },
        idempotencyKey: `meal-task-create:${mealRun.id}:${suggestion.id}`,
        expectedUserId: appStore.getState().bootstrap?.user?.id,
      });
      const task = payload?.task;
      if (!task?.id) throw codedError("meal_task_response_invalid");
      const createdTasks = [task, ...this.data.createdTasks.filter((item) => item.id !== task.id)];
      this.setData({
        createdTasks,
        taskSuggestions: suggestedTasks(mealRun, createdTasks),
      });
      await this.prepareMealTaskShare({ currentTarget: { dataset: { taskId: task.id } } });
      return task;
    } catch (_) {
      this.setData({ taskErrorText: "任务暂时没准备好，不影响继续做饭。" });
      return null;
    } finally {
      this.setData({ taskPendingId: "" });
    }
  },

  async loadMealTasks() {
    const mealRun = this.data.mealRun;
    if (!canCreateMealTask(mealRun)) return [];
    try {
      const payload = await requestHumi({
        path: `/meal-runs/${encodeURIComponent(mealRun.id)}/tasks`,
        method: "GET",
        expectedUserId: appStore.getState().bootstrap?.user?.id,
      });
      const tasks = Array.isArray(payload?.tasks)
        ? payload.tasks.filter((task) => task?.id && task?.label)
        : [];
      this.setData({
        createdTasks: tasks,
        taskSuggestions: suggestedTasks(mealRun, tasks),
      });
      if (tasks[0]) {
        this.prepareMealTaskShare({
          currentTarget: { dataset: { taskId: tasks[0].id } },
        }).catch(() => null);
      }
      return tasks;
    } catch (_) {
      return [];
    }
  },

  async prepareMealTaskShare(event) {
    const taskId = String(event?.currentTarget?.dataset?.taskId || "");
    const task = this.data.createdTasks.find((item) => item.id === taskId);
    const mealRun = this.data.mealRun;
    if (!task || !mealRun?.id || this.data.taskSharePreparingId) return null;
    this.setData({
      activeShareTaskId: task.id,
      activeTaskSharePayload: null,
      taskSharePreparingId: task.id,
      taskShareErrorId: "",
    });
    try {
      const snapshot = await prepareShareSnapshot("meal_task", {
        page: "cooking",
        householdId: mealRun.householdId,
        stateVersion: task.updatedAt || task.createdAt || task.status,
        mealRunId: mealRun.id,
        taskId: task.id,
        label: task.label,
      });
      if (this.data.activeShareTaskId === task.id) {
        this.setData({
          activeTaskSharePayload: snapshot.payload,
          taskShareErrorId: "",
        });
      }
      return snapshot;
    } catch (_) {
      if (this.data.activeShareTaskId === task.id) {
        this.setData({
          activeTaskSharePayload: null,
          taskShareErrorId: task.id,
        });
      }
      return null;
    } finally {
      if (this.data.taskSharePreparingId === task.id) {
        this.setData({ taskSharePreparingId: "" });
      }
    }
  },

  onShareAppMessage(event = {}) {
    const taskId = String(event.target?.dataset?.taskId || event.currentTarget?.dataset?.taskId || "");
    if (taskId && taskId === this.data.activeShareTaskId && this.data.activeTaskSharePayload) {
      return this.data.activeTaskSharePayload;
    }
    return {
      title: "Humi · 一起把饭做成",
      path: "/pages/tonight/index",
    };
  },

  openReminder() {
    const mealRun = this.data.mealRun;
    if (!this.data.canScheduleReminder || !mealRun?.id) return;
    wx.navigateTo({
      url: `/pages/reminder/index?mealRunId=${encodeURIComponent(mealRun.id)}&effortTier=${encodeURIComponent(mealRun.effortTier || "quick_15")}`,
    });
  },

  async reconcile() {
    if (this._reconcilePromise || this.data.syncFrozen || !this.data.isOnline || !this._mealRunId) {
      return this._reconcilePromise;
    }
    this._reconcilePromise = (async () => {
      let replayedMealRun = null;
      const outcome = await flushMutationQueue({
        onReplayed: (action, response) => {
          if (action.mealRunId === this._mealRunId && response?.mealRun?.id === this._mealRunId) {
            replayedMealRun = response.mealRun;
            clearOptimisticMealProgress(response.mealRun, appStore.getState().bootstrap?.user?.id);
          }
        },
      });
      if (outcome?.status === "conflict") {
        await this.handleConflict({ latestEnvelope: outcome.envelope });
        return;
      }
      if (outcome?.status === "timeline_conflict") {
        const discardedCompletion = (outcome.discardedActionIds || []).some((id) => (
          String(id).includes(":complete")
        ));
        clearOptimisticMealProgress(this.data.mealRun, appStore.getState().bootstrap?.user?.id);
        const latest = await loadMealRunForCooking({
          bootstrap: appStore.getState().bootstrap,
          mealRunId: this._mealRunId,
          dateKey: this._dateKey,
          allowCache: false,
        });
        this.setData({ syncFrozen: false });
        this.applyMealRun(latest);
        this.updateUnsyncedState();
        this.setData({
          errorText: discardedCompletion
            ? "家人更新了这顿饭，已切换到最新安排，请完成后重新确认上桌。"
            : "家人更新了这顿饭，已自动切换到最新进度。",
        });
        return;
      }
      this.updateUnsyncedState();
      if (outcome?.status === "retry") return;
      if (replayedMealRun) {
        this.applyMealRun(chooseMonotonicMealRun(this.data.mealRun, replayedMealRun));
        if (replayedMealRun.status === "abandoned") return;
      }
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
    trackCookingMutation(key, "started", this.data.mealRun);
    this.setData({ pendingAction: key, errorText: "" });
    const pending = Promise.resolve()
      .then(mutate)
      .then((mealRun) => {
        if (mealRun) this.applyMealRun(mealRun);
        trackCookingMutation(key, "completed", mealRun || this.data.mealRun);
        return mealRun;
      })
      .catch(async (error) => {
        if (Number(error?.status) === 409) {
          trackCookingMutation(key, "failed", this.data.mealRun, error);
          await this.handleConflict(error);
          return this.data.mealRun;
        }
        if (isNetworkError(error)) {
          trackCookingMutation(key, "failed", this.data.mealRun, error);
          this.setData({ isOnline: false, networkText: "网络已断开，进度会稍后同步" });
          if (typeof onOffline === "function") return onOffline();
        } else {
          trackCookingMutation(key, "failed", this.data.mealRun, error);
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
    const envelopeRun = envelope?.currentMealRun || null;
    if (envelopeRun?.id && envelopeRun.id !== this._mealRunId) {
      clearOptimisticMealProgress(this.data.mealRun, appStore.getState().bootstrap?.user?.id);
      this.stopClock();
      this.setData({
        status: "ready",
        viewState: "replaced",
        mealRun: envelopeRun,
        replacementDetected: true,
        currentStep: null,
        currentActiveStep: null,
        nextStep: null,
        displayNextStep: null,
        stepActionLabel: "",
        stepActionFromId: "",
        waitingForTimer: false,
        hasRemainingSteps: false,
        runningTimers: [],
      });
      return;
    }
    const latest = envelopeRun?.id === this._mealRunId
      ? envelopeRun
      : await loadMealRunForCooking({
        bootstrap: appStore.getState().bootstrap,
        mealRunId: this._mealRunId,
        dateKey: this._dateKey,
        allowCache: true,
      }).catch(() => null);
    if (latest) {
      clearOptimisticMealProgress(latest, appStore.getState().bootstrap?.user?.id);
      this.applyMealRun(latest, { preserveConflict: true });
    }
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
      replacementDetected: false,
      errorText: preserveConflict ? this.data.errorText : "",
      canCreateTask: canCreateMealTask(mealRun),
      taskSuggestions: canCreateMealTask(mealRun) ? suggestedTasks(mealRun, this.data.createdTasks) : [],
      taskErrorText: "",
      canScheduleReminder: canScheduleMealReminder(mealRun),
    });
    this.refreshDerivedState();
    if (mealRun.status === "cooking") this.startClock();
    else this.stopClock();
  },

  refreshDerivedState() {
    const mealRun = this.data.mealRun;
    if (!mealRun?.timeline?.steps?.length) {
      this.setData({
        currentStep: null,
        currentActiveStep: null,
        nextStep: null,
        displayNextStep: null,
        stepActionLabel: "",
        stepActionFromId: "",
        waitingForTimer: false,
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
    const nextStep = nextAvailableTimelineStep(mealRun.timeline, mealRun.currentStepId, mealRun.timers, now);
    const currentActiveStep = currentStep?.attention === "active"
      ? currentStep
      : nextStep?.attention === "active" ? nextStep : null;
    const startsParallelActiveStep = currentStep?.attention === "passive"
      && currentActiveStep?.id === nextStep?.id;
    const startedAtMs = Date.parse(mealRun.startedAt || mealRun.timeline.startedAt);
    const elapsedSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
      : 0;
    const total = Number(mealRun.timeline.totalSeconds) || 0;
    this.setData({
      currentStep,
      currentActiveStep,
      nextStep,
      displayNextStep: currentStep?.attention === "active" ? nextStep : null,
      stepActionLabel: startsParallelActiveStep
        ? "开始这一步"
        : currentStep?.attention === "active" && nextStep ? "这一步完成了" : "",
      stepActionFromId: currentStep?.id || "",
      waitingForTimer: currentStep?.attention === "passive" && !currentActiveStep,
      hasRemainingSteps: Boolean(nextCandidate),
      runningTimers: runningPassiveTimers(mealRun.timeline, mealRun.currentStepId, mealRun.timers, now),
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
    this._clock = setInterval(() => {
      this.refreshDerivedState();
      this.advanceUnlockedPassiveSteps().catch(() => {});
    }, 1000);
  },

  stopClock() {
    if (this._clock) clearInterval(this._clock);
    this._clock = null;
  },

  goToLatestPlan() {
    wx.reLaunch({ url: "/pages/tonight/index" });
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
  const currentTimelineVersion = Number(current.timelineVersion || 1);
  const incomingTimelineVersion = Number(incoming.timelineVersion || 1);
  if (incomingTimelineVersion > currentTimelineVersion) return incoming;
  if (incomingTimelineVersion < currentTimelineVersion) return current;
  const timers = mergeTimerMaps(incoming.timers, current.timers);
  const ranks = { planned: 0, cooking: 1, abandoned: 2, completed: 3 };
  if ((ranks[incoming.status] ?? -1) < (ranks[current.status] ?? -1)) return { ...current, timers };
  if (incoming.status !== "cooking" || current.status !== "cooking") return { ...incoming, timers };
  const currentIndex = timelineStepIndex(current.timeline, current.currentStepId);
  const incomingIndex = timelineStepIndex(incoming.timeline, incoming.currentStepId);
  if (sameTimeline(current.timeline, incoming.timeline) && incomingIndex < currentIndex) return { ...current, timers };
  return { ...incoming, timers };
}

function applyProgressPayload(mealRun, payload) {
  return {
    ...mealRun,
    currentStepId: payload.currentStepId,
    timers: mergeTimerMaps(
      mealRun.timers,
      payload.timer ? { [payload.timer.stepId]: payload.timer } : {},
    ),
    timerEndsAt: payload.timer?.endsAt || mealRun.timerEndsAt || "",
  };
}

function mergeTimerMaps(primary, fallback) {
  const merged = { ...(primary || {}) };
  for (const [stepId, timer] of Object.entries(fallback || {})) {
    if (!merged[stepId]) merged[stepId] = timer;
  }
  return merged;
}

function sameTimeline(left, right) {
  const leftIds = left?.steps?.map((step) => step.id) || [];
  const rightIds = right?.steps?.map((step) => step.id) || [];
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function currentUserFeedback(mealRun) {
  const userId = String(appStore.getState().bootstrap?.user?.id || "guest");
  return (mealRun?.feedback || []).find((entry) => entry.userId === userId)?.value || "";
}

function canCreateMealTask(mealRun) {
  const bootstrap = appStore.getState().bootstrap;
  return Boolean(
    mealRun?.status === "cooking"
    && !mealRun.localOnly
    && mealRun.householdId
    && bootstrap?.user?.id
    && (bootstrap.households || []).some((household) => household.id === mealRun.householdId),
  );
}

function canScheduleMealReminder(mealRun) {
  const bootstrap = appStore.getState().bootstrap;
  return Boolean(
    mealRun?.status === "completed"
    && mealRun.firstHouseholdCompletion === true
    && !mealRun.localOnly
    && bootstrap?.user?.id
    && (bootstrap.households || []).some((household) => household.id === mealRun.householdId),
  );
}

function suggestedTasks(mealRun, createdTasks = []) {
  const createdSourceIds = new Set((Array.isArray(createdTasks) ? createdTasks : [])
    .map((task) => String(task?.sourceId || ""))
    .filter(Boolean));
  const ingredients = (Array.isArray(mealRun?.missingIngredients) ? mealRun.missingIngredients : [])
    .map((item) => String(item?.name || item || "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .filter((ingredientName) => !createdSourceIds.has(`ingredient:${ingredientName}`))
    .map((ingredientName) => ({
      id: `buy:${ingredientName}`,
      kind: "buy",
      label: `请家人买${ingredientName}`,
      ingredientName,
    }));
  const prepSteps = (Array.isArray(mealRun?.timeline?.steps) ? mealRun.timeline.steps : [])
    .filter((step) => step?.delegatable === true && step.taskLabel)
    .slice(0, 2)
    .filter((step) => !createdSourceIds.has(`step:${step.id}`))
    .map((step) => ({
      id: `prep:${step.id}`,
      kind: "prep",
      label: String(step.taskLabel).slice(0, 64),
      stepId: step.id,
    }));
  return [...ingredients, ...prepSteps];
}

function networkLabel(networkType) {
  if (networkType === "wifi") return "网络正常 · Wi-Fi";
  if (networkType === "none") return "网络已断开，进度会稍后同步";
  return "网络正常";
}

function trackOfflineCookingMutation(key, mealRun) {
  trackCookingMutation(key, "started", mealRun);
  trackCookingMutation(key, "failed", mealRun, { status: 0, code: "network_error" });
}

function trackCookingMutation(key, outcome, mealRun, error = {}) {
  const action = String(key || "").split(":")[0];
  if (!COOKING_TELEMETRY_ACTIONS.has(action)) return null;
  const mealRunId = String(mealRun?.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const isOffline = isNetworkError(error);
  const isConflict = Number(error?.status) === 409 || error?.code === "conflict";
  const stage = outcome === "started"
    ? "started"
    : outcome === "completed"
      ? "completed"
      : isOffline
        ? "offline"
        : "failed";
  return trackEvent(`cooking_mutation_${outcome}`, {
    page: "cooking",
    stage,
    result: outcome === "completed" ? "completed" : isOffline ? "offline" : isConflict ? "conflict" : "failed",
    errorCode: outcome !== "failed" ? "none" : isOffline ? "network_error" : isConflict ? "conflict" : "request_failed",
    mealRunId,
    businessId: `cooking:${action}:${mealRunId || "unknown"}`.slice(0, 100),
  });
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

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = {
  chooseMonotonicMealRun,
  remainingSeconds,
  suggestedTasks,
};

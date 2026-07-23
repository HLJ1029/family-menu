const { rawRequest, requestHumi } = require("../../../utils/request");
const session = require("../../../utils/session");
const { trackEvent } = require("../../../utils/telemetry");
const shareablePage = require("../../../behaviors/shareable-page");

const TASK_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

Page({
  behaviors: [shareablePage],

  data: {
    status: "loading",
    errorText: "",
    pendingAction: "",
    shareSource: "",
    task: null,
    currentUserId: "",
  },

  onLoad(options = {}) {
    this._token = normalizeToken(options.mealTask || options.token);
    this.setData({
      shareSource: options.shareSource === "meal_task" ? "meal_task" : "",
      currentUserId: session.getSession()?.user?.id || "",
    });
    return this.loadTask();
  },

  onShow() {
    if (this.data.shareSource && !this._visibleTracked) {
      this._visibleTracked = true;
      trackEvent("native_share_page_visible", {
        page: "share",
        shareSource: this.data.shareSource,
      });
    }
  },

  async loadTask() {
    if (!this._token || this.data.pendingAction) {
      this.setData({ status: "error", errorText: "这个家庭任务不完整，请让家人重新发送。" });
      return null;
    }
    this.setData({ status: "loading", pendingAction: "load", errorText: "" });
    try {
      const fetchTask = session.getSession() ? requestHumi : rawRequest;
      const payload = await fetchTask({
        path: `/meal-tasks/${encodeURIComponent(this._token)}`,
      });
      const task = payload?.task;
      if (!task) throw new Error("meal_task_unavailable");
      this.setData({
        status: "ready",
        task,
        currentUserId: session.getSession()?.user?.id || "",
      });
      await this.prepareNativeShare("meal_task", {
        page: "share",
        householdId: task.householdId || "",
        stateVersion: task.updatedAt || "",
        mealRunId: task.mealRunId || "",
        token: this._token,
        label: task.label,
      });
      return task;
    } catch (error) {
      this.setData({
        status: "error",
        errorText: taskError(error, "这个家庭任务暂时打不开，请稍后重试。"),
      });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async claimTask() {
    if (!this.data.task || this.data.pendingAction) return null;
    const activeSession = await this.ensureLoggedIn();
    if (!activeSession) return null;
    this.setData({ pendingAction: "claim", errorText: "" });
    try {
      const payload = await requestHumi({
        path: `/meal-tasks/${encodeURIComponent(this._token)}/claim`,
        method: "POST",
        data: {},
        idempotencyKey: actionKey("claim"),
      });
      this.setData({
        task: {
          ...this.data.task,
          ...(payload?.task || {}),
          viewerClaimed: true,
          viewerCanComplete: true,
        },
        currentUserId: activeSession.user.id,
      });
      return payload?.task || null;
    } catch (error) {
      this.setData({ errorText: taskError(error, "这个任务暂时领取不了，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async completeTask() {
    if (!this.data.task || this.data.pendingAction || !session.getSession()) return null;
    this.setData({ pendingAction: "complete", errorText: "" });
    try {
      const payload = await requestHumi({
        path: `/meal-tasks/${encodeURIComponent(this._token)}/complete`,
        method: "POST",
        data: {},
        idempotencyKey: actionKey("complete"),
      });
      this.setData({ task: payload?.task || this.data.task });
      return payload?.task || null;
    } catch (error) {
      this.setData({ errorText: taskError(error, "这个任务暂时确认不了，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async ensureLoggedIn() {
    const active = session.getSession();
    if (active) return active;
    this.setData({ pendingAction: "login", errorText: "" });
    try {
      const signedIn = await session.loginWithWechat();
      const app = getApp();
      if (typeof app?.setHumiSession === "function") app.setHumiSession(signedIn);
      this.setData({ currentUserId: signedIn.user?.id || "" });
      return signedIn;
    } catch (error) {
      this.setData({ errorText: taskError(error, "微信登录失败，请重试。") });
      return null;
    } finally {
      if (this.data.pendingAction === "login") this.setData({ pendingAction: "" });
    }
  },

  onShareAppMessage(event) {
    return this.getNativeSharePayload(event, {
      title: this.data.task?.label || "一起把今晚这顿端上桌",
      path: "/pages/family/index",
    }, "meal_task");
  },

  retry() {
    return this.loadTask();
  },
});

function normalizeToken(value) {
  const token = String(value || "");
  return TASK_TOKEN.test(token) ? token : "";
}

function actionKey(action) {
  return `meal-task-${action}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function taskError(error, fallback) {
  if (error?.code === "forbidden") return "只有这个家的正式成员能领取或完成任务。";
  if (error?.code === "meal_task_claimed") return "这个任务已经被家人领取了，请刷新查看。";
  if (error?.code === "invalid_session") return "登录状态已失效，请重新登录。";
  return fallback;
}

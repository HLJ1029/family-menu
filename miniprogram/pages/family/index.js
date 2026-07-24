const { loadBootstrap } = require("../../utils/bootstrap");
const { guardNativeTab } = require("../../utils/native-shell-guard");
const { requestHumi } = require("../../utils/request");
const { appStore } = require("../../utils/store");
const shareablePage = require("../../behaviors/shareable-page");

Page({
  behaviors: [shareablePage],

  data: {
    status: "loading",
    errorText: "",
    sectionError: "",
    cacheState: "",
    primaryAction: "创建一个家",
    secondaryAction: "我有邀请",
    activeHousehold: null,
    householdOptions: [],
    members: [],
    memberCount: 0,
    bootstrapUserId: "",
    roleLabel: "",
    canInvite: false,
    canOpenSettings: false,
    canStartCooking: false,
    canLeaveHousehold: false,
    dinner: emptyDinner(),
    mealTasks: [],
    shareableMealTask: null,
    groceryClaims: [],
    recentCollaborations: [],
    pendingAction: "",
    loadingSections: false,
  },

  async onShow() {
    if (!guardNativeTab()) return;
    this.syncState();
    if (this.data.activeHousehold && this.data.cacheState !== "cached") {
      await this.loadCollaborationData();
    }
    await this.prepareFirstMealTaskShare().catch(() => null);
  },

  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    if (!bootstrap) {
      this.setData({
        status: "empty",
        errorText: "",
        cacheState: "",
        activeHousehold: null,
        householdOptions: [],
        members: [],
        memberCount: 0,
        bootstrapUserId: "",
        canInvite: false,
        canOpenSettings: false,
        canStartCooking: false,
        canLeaveHousehold: false,
        dinner: emptyDinner(),
        mealTasks: [],
        shareableMealTask: null,
        groceryClaims: [],
        recentCollaborations: [],
      });
      return;
    }

    const households = Array.isArray(bootstrap.households) ? bootstrap.households : [];
    const activeHousehold = households.find((item) => item?.id === bootstrap.activeHouseholdId) || null;
    if (!activeHousehold) {
      this.setData({
        status: bootstrap.cacheState === "cached" ? "cached" : "ready",
        errorText: "",
        sectionError: "",
        cacheState: bootstrap.cacheState || "",
        activeHousehold: null,
        householdOptions: households.map((item) => householdOption(item, "")),
        members: [],
        memberCount: 0,
        bootstrapUserId: bootstrap.user?.id || "",
        roleLabel: "",
        canInvite: false,
        canOpenSettings: false,
        canStartCooking: false,
        canLeaveHousehold: false,
        dinner: emptyDinner(),
        mealTasks: [],
        shareableMealTask: null,
        groceryClaims: [],
        recentCollaborations: [],
      });
      return;
    }

    const members = normalizeMembers(activeHousehold.members);
    const isOwner = activeHousehold.role === "owner";
    const mealTasks = normalizeMealTasks(bootstrap.currentMealRun?.tasks, members);
    const shareableMealTask = keepSelectedShareableTask(mealTasks, this.data.shareableMealTask?.id);
    this.setData({
      status: bootstrap.cacheState === "cached" ? "cached" : "ready",
      errorText: "",
      sectionError: "",
      cacheState: bootstrap.cacheState || "",
      activeHousehold,
      householdOptions: households.map((item) => householdOption(item, activeHousehold.id)),
      members,
      memberCount: members.length,
      bootstrapUserId: bootstrap.user?.id || "",
      roleLabel: isOwner ? "家庭创建者" : "家庭成员",
      canInvite: isOwner,
      canOpenSettings: isOwner,
      canStartCooking: ["owner", "member"].includes(activeHousehold.role),
      canLeaveHousehold: !isOwner || members.length === 1,
      dinner: buildDinner(bootstrap.currentMealRun, members),
      mealTasks,
      shareableMealTask,
      groceryClaims: normalizeGroceryClaims(bootstrap.householdState?.groceryClaims, members),
    });
  },

  async loadCollaborationData() {
    const bootstrap = appStore.getState().bootstrap;
    const householdId = String(this.data.activeHousehold?.id || "");
    if (!householdId || this.data.loadingSections || bootstrap?.cacheState === "cached") return;
    this.setData({ loadingSections: true, sectionError: "" });
    const results = await Promise.allSettled([
      requestHumi({ path: `/households/${encodeURIComponent(householdId)}/collaborations?limit=5` }),
      ...(bootstrap?.currentMealRun?.id
        ? [requestHumi({ path: `/meal-runs/${encodeURIComponent(bootstrap.currentMealRun.id)}/tasks` })]
        : []),
    ]);
    const [collaborationState, taskState] = results;
    const patch = { loadingSections: false };
    if (collaborationState.status === "fulfilled") {
      patch.recentCollaborations = normalizeCollaborations(collaborationState.value?.events).slice(0, 5);
    } else {
      patch.sectionError = "最近协作暂时没有同步成功，下拉可以重试。";
    }
    if (taskState?.status === "fulfilled") {
      patch.mealTasks = normalizeMealTasks(taskState.value?.tasks, this.data.members);
      patch.shareableMealTask = keepSelectedShareableTask(
        patch.mealTasks,
        this.data.shareableMealTask?.id,
      );
    } else if (taskState?.status === "rejected") {
      patch.sectionError ||= "今晚任务暂时没有同步成功，下拉可以重试。";
    }
    this.setData(patch);
  },

  async openCreateHousehold() {
    if (this.data.pendingAction) return;
    const result = await showModal({
      title: "给这个家起个名字",
      placeholderText: "例如：我们家",
      editable: true,
      confirmText: "创建",
    });
    if (!result.confirm) return;
    return this.createHousehold(result.content);
  },

  async createHousehold(name) {
    const householdName = String(name || "").trim().slice(0, 32);
    if (!householdName) {
      this.setData({ errorText: "请先填写家庭名称。" });
      return null;
    }
    if (this.data.pendingAction) return null;
    this.setData({ pendingAction: "create", errorText: "" });
    try {
      const bootstrap = appStore.getState().bootstrap;
      await requestHumi({
        path: "/households",
        method: "POST",
        data: {
          householdName,
          memberName: bootstrap?.user?.displayName || "主厨",
        },
        idempotencyKey: mutationId("household-create"),
      });
      return await this.reloadAfterMutation();
    } catch (error) {
      this.setData({ errorText: householdError(error, "这个家暂时没有创建成功，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  openInviteEntry() {
    if (this.data.pendingAction) return;
    wx.navigateTo({ url: "/packageFamily/pages/invite/index" });
  },

  async switchHousehold(event = {}) {
    const householdId = String(event?.detail?.householdId || event?.currentTarget?.dataset?.householdId || "");
    if (
      !householdId
      || householdId === this.data.activeHousehold?.id
      || this.data.pendingAction
      || this.data.cacheState === "cached"
    ) return null;
    this.setData({
      pendingAction: "switch",
      errorText: "",
      sectionError: "",
      mealTasks: [],
      groceryClaims: [],
      recentCollaborations: [],
    });
    try {
      await requestHumi({
        path: "/households/active",
        method: "POST",
        data: { householdId },
        idempotencyKey: mutationId("household-switch"),
      });
      const envelope = await this.reloadAfterMutation();
      await this.loadCollaborationData();
      return envelope;
    } catch (error) {
      this.setData({ errorText: householdError(error, "这个家暂时切换不了，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  prepareInvite() {
    const householdId = String(this.data.activeHousehold?.id || "");
    if (!this.data.canInvite || !householdId || this.data.pendingAction) return;
    wx.navigateTo({
      url: `/packageFamily/pages/invite/index?mode=prepare&householdId=${encodeURIComponent(householdId)}`,
    });
  },

  prepareFirstMealTaskShare() {
    const task = this.data.shareableMealTask;
    if (!task?.id) {
      this.invalidateNativeShare("meal_task");
      return Promise.resolve(null);
    }
    const bootstrap = appStore.getState().bootstrap;
    return this.prepareNativeShare("meal_task", {
      page: "family",
      householdId: bootstrap?.activeHouseholdId || "",
      stateVersion: bootstrap?.stateVersion || "",
      mealRunId: bootstrap?.currentMealRun?.id || "",
      taskId: task.id,
      label: task.label,
    });
  },

  prepareMealTaskShare(event = {}) {
    const taskId = String(event.currentTarget?.dataset?.taskId || "");
    const task = this.data.mealTasks.find((item) => item.id === taskId);
    if (!task) return null;
    this.setData({ shareableMealTask: task });
    return this.prepareFirstMealTaskShare().catch(() => null);
  },

  onShareAppMessage(event) {
    return this.getNativeSharePayload(event, {
      title: this.data.shareableMealTask?.label || "一起把今晚这顿端上桌",
      path: "/pages/family/index",
    }, "meal_task");
  },

  startOrResumeDinner() {
    if (!this.data.canStartCooking || this.data.pendingAction) return;
    const run = appStore.getState().bootstrap?.currentMealRun;
    if (run?.status === "cooking") {
      wx.navigateTo({ url: `/packageCooking/pages/cooking/index?mealRunId=${encodeURIComponent(run.id)}` });
      return;
    }
    wx.switchTab({ url: "/pages/tonight/index" });
  },

  openSettings() {
    if (!this.data.canOpenSettings || this.data.pendingAction) return;
    wx.navigateTo({
      url: `/packageFamily/pages/settings/index?householdId=${encodeURIComponent(this.data.activeHousehold.id)}`,
    });
  },

  async leaveHousehold() {
    const household = this.data.activeHousehold;
    if (!household || this.data.pendingAction) return null;
    if (!this.data.canLeaveHousehold) {
      this.setData({ errorText: "请先在家庭设置里把家庭创建者转让给一位家人。" });
      return null;
    }
    const result = await showModal({
      title: household.role === "owner" ? "解散这个家？" : "离开这个家？",
      content: household.role === "owner"
        ? "这是最后一位成员，确认后这个家及其家庭数据将不再可用。"
        : "离开后，你将不能再查看这个家的菜单、清单和协作记录。",
      confirmText: household.role === "owner" ? "确认解散" : "确认离开",
      confirmColor: "#7b2929",
    });
    if (!result.confirm) return null;
    this.setData({ pendingAction: "leave", errorText: "" });
    try {
      await requestHumi({
        path: `/households/${encodeURIComponent(household.id)}/leave`,
        method: "POST",
        data: {},
        idempotencyKey: mutationId("household-leave"),
      });
      return await this.reloadAfterMutation();
    } catch (error) {
      this.setData({ errorText: householdError(error, "暂时无法离开这个家，请重试。") });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  async reloadAfterMutation() {
    const envelope = await loadBootstrap({ allowCache: false });
    appStore.replaceBootstrap(envelope);
    this.syncState();
    return envelope;
  },

  async retry() {
    if (this.data.pendingAction) return;
    this.setData({ status: "loading", errorText: "", sectionError: "" });
    try {
      await this.reloadAfterMutation();
      await this.loadCollaborationData();
    } catch (error) {
      this.setData({ status: "error", errorText: householdError(error, "家庭信息暂时没有加载成功，请重试。") });
    }
  },

  async onPullDownRefresh() {
    await this.retry();
    wx.stopPullDownRefresh();
  },
});

function householdOption(household = {}, activeHouseholdId = "") {
  return {
    id: String(household.id || ""),
    name: String(household.name || "我的家"),
    role: household.role === "owner" ? "owner" : "member",
    isActive: household.id === activeHouseholdId,
  };
}

function normalizeMembers(members) {
  return (Array.isArray(members) ? members : []).map((member) => ({
    id: String(member.id || member.memberId || ""),
    displayName: String(member.displayName || member.nickname || "家人"),
    initial: String(member.displayName || member.nickname || "家").slice(0, 1),
    avatarUrl: /^https:\/\//.test(String(member.avatarUrl || "")) ? String(member.avatarUrl) : "",
    avatarKey: String(member.avatarKey || ""),
    role: member.role === "owner" ? "owner" : "member",
    roleLabel: member.role === "owner" ? "家庭创建者" : "家庭成员",
  })).filter((member) => member.id);
}

function keepSelectedShareableTask(tasks, selectedTaskId = "") {
  const selected = (Array.isArray(tasks) ? tasks : []).find((task) => (
    task.id === selectedTaskId && task.status !== "completed"
  ));
  return selected || firstShareableTask(tasks);
}

function buildDinner(mealRun, members) {
  if (!mealRun) return emptyDinner();
  const operatorId = String(mealRun.startedBy || mealRun.createdBy || "");
  const operator = members.find((member) => member.id === operatorId);
  const titles = (Array.isArray(mealRun.recipeSnapshot) ? mealRun.recipeSnapshot : [])
    .map((recipe) => String(recipe.title || recipe.name || ""))
    .filter(Boolean);
  const statusLabels = {
    planned: "菜单已确定",
    cooking: "正在做",
    completed: "已经上桌",
    abandoned: "今晚计划有变化",
  };
  return {
    id: String(mealRun.id || ""),
    status: String(mealRun.status || ""),
    title: titles.join(" + ") || statusLabels[mealRun.status] || "今晚的饭",
    operatorName: operator?.displayName || "家人",
    detail: mealRun.status === "cooking"
      ? `${operator?.displayName || "家人"}正在做 · 进度会自动同步`
      : statusLabels[mealRun.status] || "今晚还没有安排",
    actionLabel: mealRun.status === "cooking" ? "继续一起做" : mealRun.status === "completed" ? "看看这顿饭" : "打开今晚安排",
  };
}

function emptyDinner() {
  return {
    id: "",
    status: "empty",
    title: "今晚还没有安排",
    operatorName: "",
    detail: "选一档行动力，Humi 会给出一套能做完的晚饭。",
    actionLabel: "去安排今晚",
  };
}

function normalizeMealTasks(tasks, members) {
  return (Array.isArray(tasks) ? tasks : []).slice(0, 12).map((task) => {
    const createdBy = members.find((member) => member.id === task.createdBy);
    const claimedBy = members.find((member) => member.id === task.claimedBy);
    return {
      id: String(task.id || task.token || ""),
      label: String(task.label || "家庭协作"),
      status: ["open", "claimed", "completed"].includes(task.status) ? task.status : "open",
      statusLabel: task.status === "completed" ? "已完成" : task.status === "claimed" ? `${task.claimedByName || claimedBy?.displayName || "家人"}已领取` : "待领取",
      createdByName: String(task.createdByName || createdBy?.displayName || "家人"),
      claimedByName: String(task.claimedByName || claimedBy?.displayName || ""),
    };
  }).filter((task) => task.id);
}

function firstShareableTask(tasks) {
  return (Array.isArray(tasks) ? tasks : []).find((task) => task.id && task.status !== "completed") || null;
}

function normalizeGroceryClaims(claims, members) {
  const entries = claims && typeof claims === "object" ? Object.values(claims) : [];
  return entries
    .filter((claim) => claim?.status === "claimed" || claim?.status === "done")
    .slice(0, 12)
    .map((claim) => {
      const member = members.find((item) => item.id === claim.memberId);
      return {
        id: String(claim.itemKey || claim.id || ""),
        itemName: String(claim.itemName || "一项食材"),
        memberName: String(claim.memberName || member?.displayName || "家人"),
        statusLabel: claim.status === "done" ? "已买到" : "已领取",
      };
    });
}

function normalizeCollaborations(events) {
  return (Array.isArray(events) ? events : []).map((event) => {
    const participantName = String(event.participant?.displayName || event.displayNameSnapshot || "家人");
    return {
      id: String(event.id || ""),
      participantName,
      participantInitial: participantName.slice(0, 1),
      detail: collaborationDetail(event),
      timeLabel: formatRelativeDate(event.createdAt),
    };
  }).filter((event) => event.id);
}

function collaborationDetail(event = {}) {
  if (event.actionType === "crave_vote") return `回应了今晚口味${event.payload?.feelingTag ? `：${event.payload.feelingTag}` : ""}`;
  if (event.actionType === "grocery_claim") return "领取了买菜清单";
  if (event.actionType === "wish_entry") return `写下想吃的菜${event.payload?.dishName ? `：${event.payload.dishName}` : ""}`;
  return "参与了一次家庭协作";
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function mutationId(prefix) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function showModal(options) {
  return new Promise((resolve) => wx.showModal({ ...options, success: resolve, fail: () => resolve({ confirm: false }) }));
}

function householdError(error, fallback) {
  const known = {
    invalid_session: "登录状态已失效，请重新登录。",
    household_not_found: "没有找到这个家，请刷新后重试。",
    forbidden: "当前身份没有权限执行这项家庭操作。",
    owner_must_transfer_or_disband: "请先转让家庭创建者，再离开这个家。",
  };
  return known[error?.code] || error?.message || fallback;
}

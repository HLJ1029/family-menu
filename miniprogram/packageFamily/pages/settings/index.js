const { loadBootstrap } = require("../../../utils/bootstrap");
const { requestHumi } = require("../../../utils/request");
const { appStore } = require("../../../utils/store");

Page({
  data: {
    status: "loading",
    errorText: "",
    household: null,
    members: [],
    currentMemberId: "",
    canManage: false,
    ownerMustTransferBeforeLeaving: false,
    name: "",
    dislikesText: "",
    allergiesText: "",
    pendingAction: "",
  },

  onLoad(options = {}) {
    this._householdId = safeId(options.householdId);
    this.syncState();
  },

  onShow() {
    this.syncState();
  },

  syncState() {
    const bootstrap = appStore.getState().bootstrap;
    const household = (Array.isArray(bootstrap?.households) ? bootstrap.households : [])
      .find((item) => item?.id === (this._householdId || bootstrap.activeHouseholdId)) || null;
    if (!household) {
      this.setData({
        status: "empty",
        household: null,
        members: [],
        currentMemberId: "",
        canManage: false,
        errorText: "没有找到这个家，请返回“我的家”重新进入。",
      });
      return;
    }
    const members = normalizeMembers(household.members);
    const familyProfile = bootstrap.householdState?.familyProfile || {};
    const canManage = household.role === "owner";
    this._householdId = household.id;
    this.setData({
      status: bootstrap.cacheState === "cached" ? "cached" : "ready",
      household,
      members,
      currentMemberId: bootstrap.user?.id || "",
      canManage,
      ownerMustTransferBeforeLeaving: canManage && members.length > 1,
      name: household.name || "",
      dislikesText: normalizePreferenceList(familyProfile.dislikes).join("、"),
      allergiesText: normalizePreferenceList(familyProfile.allergies).join("、"),
      errorText: "",
    });
  },

  updateName(event = {}) {
    this.setData({ name: String(event.detail?.value || "").slice(0, 32), errorText: "" });
  },

  updateDislikes(event = {}) {
    this.setData({ dislikesText: String(event.detail?.value || "").slice(0, 240), errorText: "" });
  },

  updateAllergies(event = {}) {
    this.setData({ allergiesText: String(event.detail?.value || "").slice(0, 240), errorText: "" });
  },

  async saveName() {
    const name = String(this.data.name || "").trim();
    if (!this.data.canManage || this.data.pendingAction) return null;
    if (!name) {
      this.setData({ errorText: "请填写家庭名称。" });
      return null;
    }
    return this.runMutation("rename", async () => {
      await requestHumi({
        path: `/households/${encodeURIComponent(this._householdId)}`,
        method: "PATCH",
        data: { name },
        idempotencyKey: mutationId("household-rename"),
      });
      await this.reload();
    }, "家庭名称暂时没有保存成功，请重试。");
  },

  async savePreferences() {
    if (!this.data.canManage || this.data.pendingAction) return null;
    return this.runMutation("preferences", async () => {
      const current = await requestHumi({ path: "/state" });
      const currentState = current?.state && typeof current.state === "object" ? current.state : {};
      await requestHumi({
        path: "/state",
        method: "PUT",
        data: {
          householdId: this._householdId,
          state: {
            ...currentState,
            familyProfile: {
              ...(currentState.familyProfile || {}),
              dislikes: splitPreferences(this.data.dislikesText),
              allergies: splitPreferences(this.data.allergiesText),
            },
          },
        },
        idempotencyKey: mutationId("household-preferences"),
      });
      await this.reload();
    }, "家庭忌口暂时没有保存成功，请重试。");
  },

  async transferOwnership(event = {}) {
    const memberId = safeId(event.detail?.memberId || event.currentTarget?.dataset?.memberId);
    const member = this.data.members.find((item) => item.id === memberId);
    if (!this.data.canManage || !member || member.role === "owner" || this.data.pendingAction) return null;
    const confirmation = await showModal({
      title: "转让家庭创建者？",
      content: `确认把家庭设置和菜单管理权限交给${member.displayName}吗？`,
      confirmText: "确认转让",
    });
    if (!confirmation.confirm) return null;
    return this.runMutation(`transfer:${memberId}`, async () => {
      await requestHumi({
        path: `/households/${encodeURIComponent(this._householdId)}/owner`,
        method: "POST",
        data: { memberId },
        idempotencyKey: mutationId("household-transfer"),
      });
      await this.reload();
      wx.navigateBack();
    }, "家庭创建者暂时没有转让成功，请重试。");
  },

  async removeMember(event = {}) {
    const memberId = safeId(event.detail?.memberId || event.currentTarget?.dataset?.memberId);
    const member = this.data.members.find((item) => item.id === memberId);
    if (!this.data.canManage || !member || member.role === "owner" || this.data.pendingAction) return null;
    const confirmation = await showModal({
      title: `移除${member.displayName}？`,
      content: "移除后，对方将不能再查看这个家的菜单、清单和协作记录。",
      confirmText: "确认移除",
      confirmColor: "#7b2929",
    });
    if (!confirmation.confirm) return null;
    return this.runMutation(`remove:${memberId}`, async () => {
      await requestHumi({
        path: `/households/${encodeURIComponent(this._householdId)}/members/${encodeURIComponent(memberId)}`,
        method: "DELETE",
        idempotencyKey: mutationId("household-remove"),
      });
      await this.reload();
    }, "这位家人暂时没有移除成功，请重试。");
  },

  async leaveHousehold() {
    if (!this.data.household || this.data.pendingAction) return null;
    if (this.data.ownerMustTransferBeforeLeaving) {
      this.setData({ errorText: "这个家还有其他成员，请先转让家庭创建者。" });
      return null;
    }
    const isOwner = this.data.household.role === "owner";
    const confirmation = await showModal({
      title: isOwner ? "解散这个家？" : "离开这个家？",
      content: isOwner
        ? "你是最后一位成员。确认后，这个家及其家庭数据将不再可用。"
        : "离开后，你将不能再查看这个家的菜单、清单和协作记录。",
      confirmText: isOwner ? "确认解散" : "确认离开",
      confirmColor: "#7b2929",
    });
    if (!confirmation.confirm) return null;
    return this.runMutation("leave", async () => {
      await requestHumi({
        path: `/households/${encodeURIComponent(this._householdId)}/leave`,
        method: "POST",
        data: {},
        idempotencyKey: mutationId("household-leave"),
      });
      await this.reload();
      wx.navigateBack();
    }, "暂时无法离开这个家，请重试。");
  },

  openInvite() {
    if (!this.data.canManage || this.data.pendingAction) return;
    wx.navigateTo({
      url: `/packageFamily/pages/invite/index?mode=prepare&householdId=${encodeURIComponent(this._householdId)}`,
    });
  },

  async reload() {
    const envelope = await loadBootstrap({ allowCache: false });
    appStore.replaceBootstrap(envelope);
    this.syncState();
    return envelope;
  },

  async runMutation(action, operation, fallback) {
    if (this.data.pendingAction) return null;
    this.setData({ pendingAction: action, errorText: "" });
    try {
      await operation();
      return true;
    } catch (error) {
      this.setData({ errorText: error?.message || fallback });
      return null;
    } finally {
      this.setData({ pendingAction: "" });
    }
  },

  retry() {
    return this.reload().catch((error) => {
      this.setData({ status: "error", errorText: error?.message || "家庭设置暂时没有加载成功。" });
    });
  },
});

function normalizeMembers(members) {
  return (Array.isArray(members) ? members : []).map((member) => {
    const displayName = String(member.displayName || member.nickname || "家人");
    return {
      id: safeId(member.id || member.memberId),
      displayName,
      initial: displayName.slice(0, 1),
      avatarUrl: /^https:\/\//.test(String(member.avatarUrl || "")) ? String(member.avatarUrl) : "",
      role: member.role === "owner" ? "owner" : "member",
      roleLabel: member.role === "owner" ? "家庭创建者" : "家庭成员",
    };
  }).filter((member) => member.id);
}

function splitPreferences(value) {
  return normalizePreferenceList(String(value || "").split(/[、,，\n]/));
}

function normalizePreferenceList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim().slice(0, 40))
    .filter(Boolean))]
    .slice(0, 24);
}

function safeId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "";
}

function mutationId(prefix) {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function showModal(options) {
  return new Promise((resolve) => wx.showModal({ ...options, success: resolve, fail: () => resolve({ confirm: false }) }));
}

module.exports = { normalizeMembers, splitPreferences };

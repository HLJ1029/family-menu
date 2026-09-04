const { requestHumi } = require("../../../utils/request");
const { appStore } = require("../../../utils/store");

Page({
  data: {
    status: "loading",
    errorText: "",
    household: null,
    events: [],
  },

  onLoad(options = {}) {
    this._householdId = String(options.householdId || "");
    return this.loadEvents();
  },

  async loadEvents() {
    const bootstrap = appStore.getState().bootstrap;
    const household = (Array.isArray(bootstrap?.households) ? bootstrap.households : [])
      .find((item) => item?.id === this._householdId);
    if (!household) {
      this.setData({ status: "error", errorText: "没有找到这个家的协作记录，请返回“我的家”重试。" });
      return null;
    }
    this.setData({ status: "loading", errorText: "", household });
    try {
      const payload = await requestHumi({
        path: `/households/${encodeURIComponent(household.id)}/collaborations?limit=50`,
      });
      const events = normalizeCollaborations(payload?.events);
      this.setData({ status: "ready", events });
      return events;
    } catch (error) {
      this.setData({ status: "error", errorText: activityError(error) });
      return null;
    }
  },

  retry() {
    return this.loadEvents();
  },

  async onPullDownRefresh() {
    await this.loadEvents();
    wx.stopPullDownRefresh();
  },

  goBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: "/pages/family/index" });
  },
});

function normalizeCollaborations(events) {
  return (Array.isArray(events) ? events : []).map((event) => {
    const participantName = String(event.participant?.displayName || "家人").slice(0, 32);
    return {
      id: String(event.id || ""),
      participantName,
      participantInitial: participantName.slice(0, 1),
      detail: collaborationDetail(event),
      timeLabel: formatDate(event.createdAt),
    };
  }).filter((event) => event.id);
}

function collaborationDetail(event = {}) {
  if (event.actionType === "crave_vote") {
    const feeling = String(event.payload?.feelingTag || "").slice(0, 32);
    return `回应了今晚口味${feeling ? `：${feeling}` : ""}`;
  }
  if (event.actionType === "grocery_claim") return "领取了买菜清单";
  if (event.actionType === "wish_entry") {
    const dishName = String(event.payload?.dishName || "").slice(0, 80);
    return `写下想吃的菜${dishName ? `：${dishName}` : ""}`;
  }
  return "参与了一次家庭协作";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function activityError(error) {
  if (error?.code === "invalid_session") return "登录状态已失效，请重新登录后查看。";
  if (error?.code === "household_not_found") return "你已经不在这个家里，无法查看协作记录。";
  return "协作记录暂时没有同步成功，请下拉或点按钮重试。";
}

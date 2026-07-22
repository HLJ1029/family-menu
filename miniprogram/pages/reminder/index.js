const { getHumiApiBaseUrl } = require("../../utils/config");

const REMINDER_CONSENT_KEY = "humi:meal-reminder-consent:v1";

Page({
  data: {
    scheduledAt: "",
    dateKey: "",
    effortTier: "quick_15",
    mealRunId: "",
    scheduledLabel: "",
    templateId: "",
    loading: false,
    pending: false,
    saved: false,
    rejected: false,
    needsLogin: false,
    status: "正在准备这次提醒…"
  },

  onLoad(options = {}) {
    const session = getApp().globalData?.humiSession;
    const scheduledAt = normalizeScheduledAt(options.scheduledAt);
    const dateKey = normalizeDateKey(options.dateKey, scheduledAt);
    const rejected = wx.getStorageSync(REMINDER_CONSENT_KEY) === "rejected";
    this.setData({
      scheduledAt,
      dateKey,
      effortTier: normalizeEffortTier(options.effortTier),
      mealRunId: normalizeText(options.mealRunId, 100),
      scheduledLabel: formatScheduledAt(scheduledAt),
      rejected,
      needsLogin: !isValidSession(session),
      status: rejected
        ? "你已拒绝过做饭提醒，Humi 不会再次索取授权。"
        : "确认后，微信只会发送这一条做饭提醒。"
    });
    if (!isValidSession(session)) return;
    this.loadReminderConfig(session);
  },

  loadReminderConfig(session) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.request({
      url: `${getHumiApiBaseUrl()}/meal-reminders/config`,
      method: "GET",
      header: { Authorization: `Bearer ${session.accessToken}` },
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300 && data?.enabled && data?.templateId) {
          this.setData({ templateId: data.templateId, status: "确认后，微信只会发送这一条做饭提醒。" });
          return;
        }
        this.setData({ status: "做饭提醒暂时没有配置好，可以直接返回 Humi。" });
      },
      fail: () => this.setData({ status: "网络连接失败，暂时没有设置提醒。" }),
      complete: () => this.setData({ loading: false })
    });
  },

  requestReminder() {
    if (this.data.pending || this.data.saved || this.data.rejected) return;
    const session = getApp().globalData?.humiSession;
    if (!isValidSession(session)) {
      this.setData({ needsLogin: true, status: "先完成微信登录，再由你确认是否接收提醒。" });
      return;
    }
    if (!this.data.templateId || !this.data.scheduledAt) {
      this.setData({ status: "这次提醒还没有准备完整，请返回 Humi 重选时间。" });
      return;
    }
    this.setData({ pending: true, status: "等待你的微信授权…" });
    wx.requestSubscribeMessage({
      tmplIds: [this.data.templateId],
      success: (result) => {
        const decision = result?.[this.data.templateId];
        if (decision === "accept") {
          this.createReminder(session);
          return;
        }
        wx.setStorageSync(REMINDER_CONSENT_KEY, "rejected");
        this.setData({ pending: false, rejected: true, status: "没有设置提醒。以后 Humi 不会重复索取授权。" });
      },
      fail: () => this.setData({ pending: false, status: "已取消，没有设置提醒。" })
    });
  },

  createReminder(session) {
    wx.request({
      url: `${getHumiApiBaseUrl()}/meal-reminders`,
      method: "POST",
      header: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.accessToken}`
      },
      data: {
        scheduledAt: this.data.scheduledAt,
        dateKey: this.data.dateKey,
        effortTier: this.data.effortTier,
        mealRunId: this.data.mealRunId,
        templateId: this.data.templateId,
        accepted: true
      },
      success: ({ statusCode }) => {
        if (statusCode >= 200 && statusCode < 300) {
          wx.setStorageSync(REMINDER_CONSENT_KEY, "accepted");
          this.setData({ pending: false, saved: true, status: "已预约。到时间只会收到这一条提醒。" });
          return;
        }
        this.setData({ pending: false, status: "授权成功，但提醒暂时没有保存，请稍后重试。" });
      },
      fail: () => this.setData({ pending: false, status: "网络连接失败，提醒暂时没有保存。" })
    });
  },

  openLogin() {
    wx.navigateTo({ url: "/pages/identity/index?action=login" });
  },

  goBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/index/index" });
  }
});

function isValidSession(session) {
  return Boolean(session?.accessToken && session.expiresAt > Date.now() && session.user?.profileStatus === "complete");
}

function normalizeScheduledAt(value) {
  const decoded = normalizeText(value, 80);
  const date = new Date(decoded);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function normalizeDateKey(value, scheduledAt) {
  const dateKey = normalizeText(value, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return scheduledAt ? scheduledAt.slice(0, 10) : "";
}

function normalizeEffortTier(value) {
  return ["quick_15", "easy_30", "normal"].includes(value) ? value : "quick_15";
}

function normalizeText(value, limit) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text).trim().slice(0, limit);
  } catch {
    return text.slice(0, limit);
  }
}

function formatScheduledAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未设置";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

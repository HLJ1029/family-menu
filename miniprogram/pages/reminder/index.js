const { getHumiApiBaseUrl } = require("../../utils/config");

const REMINDER_CONSENT_PREFIX = "humi:meal-reminder-consent:v3:";

Page({
  data: {
    scheduledAt: "",
    dateKey: "",
    effortTier: "quick_15",
    mealRunId: "",
    scheduledLabel: "",
    selectedDate: "",
    selectedTime: "",
    minDate: "",
    maxDate: "",
    templateId: "",
    loading: false,
    pending: false,
    saved: false,
    rejected: false,
    permissionAccepted: false,
    reminderButtonLabel: "已预约",
    needsLogin: false,
    status: "正在准备这次提醒…"
  },

  onLoad(options = {}) {
    const session = getApp().globalData?.humiSession;
    const scheduledAt = normalizeScheduledAt(options.scheduledAt);
    const dateKey = normalizeDateKey(options.dateKey, scheduledAt);
    const selected = scheduledAt ? shanghaiDateTimeParts(scheduledAt) : { date: "", time: "" };
    const mealRunId = normalizeText(options.mealRunId, 100);
    this._consentKey = `${REMINDER_CONSENT_PREFIX}${mealRunId}`;
    const decision = normalizeConsentDecision(mealRunId ? wx.getStorageSync(this._consentKey) : null);
    this._consentDecision = decision;
    const rejected = decision.state === "rejected" || decision.state === "cancelled";
    this.setData({
      scheduledAt,
      dateKey,
      selectedDate: selected.date,
      selectedTime: selected.time,
      minDate: shanghaiDateTimeParts(new Date().toISOString()).date,
      maxDate: shanghaiDateTimeParts(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()).date,
      effortTier: normalizeEffortTier(options.effortTier),
      mealRunId,
      scheduledLabel: formatScheduledAt(scheduledAt),
      rejected,
      permissionAccepted: decision.state === "accepted_pending" && decision.scheduledAt === scheduledAt,
      needsLogin: !isValidSession(session),
      status: rejected
        ? "你已拒绝过做饭提醒，Humi 不会再次索取授权。"
        : scheduledAt
          ? "确认后，微信只会发送这一条做饭提醒。"
          : "请先选择下一次做饭的日期和时间。"
    });
    if (!isValidSession(session)) return;
    this.loadReminderConfig(session);
  },

  onDateChange(event) {
    this.setData({ selectedDate: normalizeDateSelection(event?.detail?.value) });
    this.updateSelectedSchedule();
  },

  onTimeChange(event) {
    this.setData({ selectedTime: normalizeTimeSelection(event?.detail?.value) });
    this.updateSelectedSchedule();
  },

  updateSelectedSchedule() {
    const { selectedDate, selectedTime } = this.data;
    if (!selectedDate || !selectedTime) {
      this.setData({
        scheduledAt: "",
        dateKey: "",
        scheduledLabel: "请选择日期和时间",
        status: "请先选择下一次做饭的日期和时间。",
        permissionAccepted: false,
      });
      return;
    }
    const scheduledAt = new Date(`${selectedDate}T${selectedTime}:00+08:00`).toISOString();
    this.setData({
      scheduledAt,
      dateKey: selectedDate,
      scheduledLabel: formatScheduledAt(scheduledAt),
      status: "确认后，微信只会发送这一条做饭提醒。",
      permissionAccepted: (
        this._consentDecision?.state === "accepted_pending"
        && this._consentDecision.scheduledAt === scheduledAt
      ),
    });
  },

  loadReminderConfig(session) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.request({
      url: `${getHumiApiBaseUrl()}/meal-reminders/config?mealRunId=${encodeURIComponent(this.data.mealRunId)}`,
      method: "GET",
      header: { Authorization: `Bearer ${session.accessToken}` },
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300 && data?.enabled && data?.templateId) {
          if (data.existingReminder?.id) {
            const existing = data.existingReminder;
            const scheduledAt = normalizeScheduledAt(existing.scheduledAt);
            const selected = shanghaiDateTimeParts(scheduledAt);
            const consumed = {
              state: "consumed",
              scheduledAt,
              reminderId: normalizeText(existing.id, 100),
            };
            this._consentDecision = consumed;
            wx.setStorageSync(this._consentKey, consumed);
            this.setData({
              templateId: data.templateId,
              saved: true,
              pending: false,
              scheduledAt,
              dateKey: normalizeDateKey(existing.dateKey, scheduledAt),
              selectedDate: selected.date,
              selectedTime: selected.time,
              scheduledLabel: formatScheduledAt(scheduledAt),
              effortTier: normalizeEffortTier(existing.effortTier),
              permissionAccepted: false,
              reminderButtonLabel: existingReminderButtonLabel(existing),
              status: existingReminderStatus(existing),
            });
            return;
          }
          const patch = { templateId: data.templateId };
          if (!this.data.rejected) {
            patch.status = this.data.scheduledAt
              ? "确认后，微信只会发送这一条做饭提醒。"
              : "请先选择下一次做饭的日期和时间。";
          }
          this.setData(patch);
          return;
        }
        if (!this.data.rejected && !this.data.saved) {
          this.setData({ status: "做饭提醒暂时没有配置好，可以直接返回 Humi。" });
        }
      },
      fail: () => {
        if (!this.data.rejected && !this.data.saved) {
          this.setData({ status: "网络连接失败，暂时没有设置提醒。" });
        }
      },
      complete: () => this.setData({ loading: false })
    });
  },

  confirmReminder() {
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
    if (this.data.permissionAccepted) {
      this.setData({ pending: true, status: "正在保存这次提醒…" });
      this.createReminder(session);
      return;
    }
    this.setData({ pending: true, status: "等待你的微信授权…" });
    wx.requestSubscribeMessage({
      tmplIds: [this.data.templateId],
      success: (result) => {
        const decision = result?.[this.data.templateId];
        if (decision === "accept") {
          const consent = { state: "accepted_pending", scheduledAt: this.data.scheduledAt };
          this._consentDecision = consent;
          wx.setStorageSync(this._consentKey, consent);
          this.setData({ permissionAccepted: true });
          this.createReminder(session);
          return;
        }
        const consent = { state: "rejected" };
        this._consentDecision = consent;
        wx.setStorageSync(this._consentKey, consent);
        this.setData({ pending: false, rejected: true, status: "没有设置提醒。以后 Humi 不会重复索取授权。" });
      },
      fail: () => {
        const consent = { state: "cancelled" };
        this._consentDecision = consent;
        wx.setStorageSync(this._consentKey, consent);
        this.setData({ pending: false, rejected: true, status: "已取消，没有设置提醒。" });
      }
    });
  },

  createReminder(session) {
    wx.request({
      url: `${getHumiApiBaseUrl()}/meal-reminders`,
      method: "POST",
      header: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "X-Humi-Idempotency-Key": `meal-reminder:${this.data.mealRunId}:${this.data.scheduledAt}`
      },
      data: {
        scheduledAt: this.data.scheduledAt,
        dateKey: this.data.dateKey,
        effortTier: this.data.effortTier,
        sourceMealRunId: this.data.mealRunId,
        templateId: this.data.templateId,
        accepted: true
      },
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300) {
          const consumed = {
            state: "consumed",
            scheduledAt: normalizeScheduledAt(data?.reminder?.scheduledAt || this.data.scheduledAt),
            reminderId: normalizeText(data?.reminder?.id, 100),
          };
          this._consentDecision = consumed;
          wx.setStorageSync(this._consentKey, consumed);
          this.setData({
            pending: false,
            saved: true,
            reminderButtonLabel: "已预约",
            status: "已预约。到时间只会收到这一条提醒。",
          });
          return;
        }
        this.setData({ pending: false, status: "授权成功，但提醒暂时没有保存，请稍后重试。" });
      },
      fail: () => this.setData({ pending: false, status: "网络连接失败，提醒暂时没有保存。" })
    });
  },

  requestReminder() {
    return this.confirmReminder();
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
    wx.reLaunch({ url: "/pages/boot/index" });
  }
});

function isValidSession(session) {
  return Boolean(session?.accessToken && session.expiresAt > Date.now() && session.user?.profileStatus === "complete");
}

function normalizeConsentDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { state: "" };
  const state = ["accepted_pending", "consumed", "rejected", "cancelled"].includes(value.state)
    ? value.state
    : "";
  return {
    state,
    scheduledAt: normalizeScheduledAt(value.scheduledAt),
    reminderId: normalizeText(value.reminderId, 100),
  };
}

function existingReminderStatus(reminder) {
  const statuses = {
    scheduled: "已预约。到时间只会收到这一条提醒。",
    retrying: "提醒已预约，系统会再尝试发送一次。",
    sending: "提醒正在发送。",
    sent: "这条提醒已经发送。",
    cancelled: "这条提醒已取消。",
    failed: "这条提醒未能发送。",
    delivery_unknown: "提醒已提交微信，不会重复发送。",
  };
  return statuses[reminder?.status] || "这次提醒已经保存。";
}

function existingReminderButtonLabel(reminder) {
  const labels = {
    scheduled: "已预约",
    retrying: "已预约",
    sending: "发送中",
    sent: "已发送",
    cancelled: "已取消",
    failed: "未能发送",
    delivery_unknown: "发送未确认",
  };
  return labels[reminder?.status] || "已保存";
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

function normalizeDateSelection(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeTimeSelection(value) {
  const time = String(value || "").trim();
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
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
  const parts = shanghaiDateTimeParts(value);
  if (!parts.date) return "请选择日期和时间";
  const [, month, day] = parts.date.split("-");
  return `${Number(month)} 月 ${Number(day)} 日 ${parts.time}`;
}

function shanghaiDateTimeParts(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { date: "", time: "" };
  const shifted = new Date(timestamp + 8 * 60 * 60 * 1000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

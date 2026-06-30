const { getHumiApiBaseUrl } = require("../../utils/config");

Page({
  data: {
    pending: false,
    error: ""
  },

  bindWechatPhone(event) {
    if (this.data.pending) return;
    const app = getApp();
    const session = app.globalData?.humiSession;
    const code = event.detail?.code;

    if (!session?.accessToken) {
      this.setData({ error: "微信登录状态已失效，请返回 Humi 后重新登录。" });
      return;
    }

    if (!code) {
      this.setData({ error: "没有完成手机号授权，可以稍后在我的家重新绑定。" });
      return;
    }

    this.setData({ pending: true, error: "" });
    wx.request({
      url: `${getHumiApiBaseUrl()}/auth/wechat/phone`,
      method: "POST",
      data: { code },
      header: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.accessToken}`
      },
      success: ({ statusCode, data }) => {
        if (statusCode < 200 || statusCode >= 300 || !data?.accessToken) {
          this.setData({ error: "手机号绑定暂时不可用，请稍后再试。" });
          return;
        }

        app.globalData.humiSession = data;
        app.globalData.humiPhoneSessionUpdatedAt = Date.now();
        wx.showToast({ title: "手机号已绑定", icon: "success" });
        setTimeout(() => wx.navigateBack(), 450);
      },
      fail: () => {
        this.setData({ error: "网络连接失败，请检查网络后重试。" });
      },
      complete: () => {
        this.setData({ pending: false });
      }
    });
  },

  cancelPhoneBind() {
    wx.navigateBack();
  }
});

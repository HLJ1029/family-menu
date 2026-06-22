const { HUMI_WECHAT_LOGIN_ENABLED, getHumiApiBaseUrl, getHumiH5Url } = require("../../utils/config");

Page({
  data: {
    url: "",
    loginPending: false
  },

  onLoad() {
    const url = getHumiH5Url();
    this.setData({
      url
    });
    if (HUMI_WECHAT_LOGIN_ENABLED) {
      this.loginWithWechat({ silent: true });
    }
  },

  handleLoad() {},

  handleMessage(event) {
    const messages = event.detail?.data || [];
    const latestMessage = messages[messages.length - 1];
    if (HUMI_WECHAT_LOGIN_ENABLED && latestMessage?.type === "humi:wechat-login") {
      this.loginWithWechat();
    }
  },

  handleError(error) {
    console.warn("Humi web-view error", error.detail);
  },

  loginWithWechat(options = {}) {
    if (this.data.loginPending) return;
    const silent = Boolean(options.silent);
    this.setData({ loginPending: true });

    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ loginPending: false });
          if (!silent) wx.showToast({ title: "登录失败，请先体验", icon: "none" });
          return;
        }

        wx.request({
          url: `${getHumiApiBaseUrl()}/auth/wechat/login`,
          method: "POST",
          data: { code },
          header: { "content-type": "application/json" },
          success: ({ statusCode, data }) => {
            if (statusCode < 200 || statusCode >= 300 || !data?.accessToken) {
              if (!silent) wx.showToast({ title: "登录服务准备中", icon: "none" });
              return;
            }

            this.setData({ url: appendSessionToUrl(getHumiH5Url(), data) });
            if (!silent) wx.showToast({ title: "已登录 Humi", icon: "success" });
          },
          fail: () => {
            if (!silent) wx.showToast({ title: "登录服务暂不可用", icon: "none" });
          },
          complete: () => {
            this.setData({ loginPending: false });
          }
        });
      },
      fail: () => {
        this.setData({ loginPending: false });
        if (!silent) wx.showToast({ title: "微信登录失败", icon: "none" });
      }
    });
  }
});

function appendSessionToUrl(url, session) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}humiLogin=wechat&humiSession=${encodeURIComponent(JSON.stringify(session))}`;
}

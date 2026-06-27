const { HUMI_WECHAT_LOGIN_ENABLED, getHumiApiBaseUrl, getHumiH5Url } = require("../../utils/config");

Page({
  data: {
    url: "",
    loginPending: false,
    loginError: ""
  },

  onLoad() {
    if (HUMI_WECHAT_LOGIN_ENABLED) {
      this.loginWithWechat({ initial: true });
      return;
    }
    this.setData({ url: getHumiH5Url() });
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
    const initial = Boolean(options.initial);
    this.setData({ loginPending: true, loginError: "" });

    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ loginPending: false, loginError: "微信登录失败，请重新尝试。" });
          return;
        }

        wx.request({
          url: `${getHumiApiBaseUrl()}/auth/wechat/login`,
          method: "POST",
          data: { code },
          header: { "content-type": "application/json" },
          success: ({ statusCode, data }) => {
            if (statusCode < 200 || statusCode >= 300 || !data?.accessToken) {
              this.setData({ loginError: "登录服务暂时不可用，请稍后重试。" });
              return;
            }

            this.setData({ url: appendSessionToUrl(getHumiH5Url(), data) });
            if (!initial) wx.showToast({ title: "已登录 Humi", icon: "success" });
          },
          fail: () => {
            this.setData({ loginError: "网络连接失败，请检查网络后重试。" });
          },
          complete: () => {
            this.setData({ loginPending: false });
          }
        });
      },
      fail: () => {
        this.setData({ loginPending: false, loginError: "微信登录失败，请重新尝试。" });
      }
    });
  }
});

function appendSessionToUrl(url, session) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}humiLogin=wechat&humiSession=${encodeURIComponent(JSON.stringify(session))}`;
}

const { HUMI_WECHAT_LOGIN_ENABLED, getHumiApiBaseUrl, getHumiH5Url } = require("../../utils/config");
const {
  buildHumiUrl,
  buildSharePayload,
  encodeShareParams,
  normalizeLaunchOptions,
  shouldOpenAsGuest,
} = require("../../utils/share-routing");

Page({
  data: {
    url: "",
    loginPending: false,
    loginError: "",
    phoneBindVisible: false,
    phoneBindPending: false,
    phoneBindError: "",
    currentSession: null,
    phoneSessionUpdatedAt: 0,
    launchOptions: {},
    pendingShare: null
  },

  onLoad(options = {}) {
    const launchOptions = normalizeLaunchOptions(options);
    enableNativeShareMenu();
    this.setData({ launchOptions });
    if (shouldOpenAsGuest(launchOptions)) {
      this.setData({ url: buildHumiUrl(getHumiH5Url(), launchOptions) });
      return;
    }
    if (HUMI_WECHAT_LOGIN_ENABLED) {
      this.loginWithWechat({ initial: true });
      return;
    }
    this.setData({ url: buildHumiUrl(getHumiH5Url(), launchOptions) });
  },

  onShow() {
    enableNativeShareMenu();
    const app = getApp();
    const updatedAt = app.globalData?.humiPhoneSessionUpdatedAt || 0;
    const session = app.globalData?.humiSession;
    if (updatedAt && updatedAt !== this.data.phoneSessionUpdatedAt && session?.accessToken) {
      this.setData({
        currentSession: session,
        phoneSessionUpdatedAt: updatedAt,
        phoneBindVisible: false,
        url: appendSessionToUrl(buildHumiUrl(getHumiH5Url(), this.data.launchOptions), session)
      });
    }
  },

  handleLoad() {},

  handleMessage(event) {
    const messages = event.detail?.data || [];
    const latestMessage = messages[messages.length - 1];
    if (HUMI_WECHAT_LOGIN_ENABLED && latestMessage?.type === "humi:wechat-login") {
      this.loginWithWechat();
    }
    if (HUMI_WECHAT_LOGIN_ENABLED && latestMessage?.type === "humi:phone-bind") {
      if (!this.data.currentSession?.accessToken) {
        this.loginWithWechat();
        return;
      }
      this.setData({ phoneBindVisible: true, phoneBindError: "" });
    }
    if (latestMessage?.type === "humi:share") {
      const payload = latestMessage.payload || {};
      this.setData({ pendingShare: buildSharePayload(payload) });
      const params = encodeShareParams(payload);
      openSharePage(params);
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

            const app = getApp();
            app.globalData.humiSession = data;
            this.setData({ currentSession: data, url: appendSessionToUrl(buildHumiUrl(getHumiH5Url(), this.data.launchOptions), data) });
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
  },

  cancelPhoneBind() {
    this.setData({ phoneBindVisible: false, phoneBindPending: false, phoneBindError: "" });
  },

  bindWechatPhone(event) {
    if (this.data.phoneBindPending) return;
    const code = event.detail?.code;
    if (!code) {
      this.setData({ phoneBindError: "没有完成手机号授权，可以稍后在我的家重新绑定。" });
      return;
    }
    const session = this.data.currentSession;
    if (!session?.accessToken) {
      this.setData({ phoneBindError: "微信登录状态已失效，请重新登录后再绑定。" });
      return;
    }

    this.setData({ phoneBindPending: true, phoneBindError: "" });
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
          this.setData({ phoneBindError: "手机号绑定暂时不可用，请稍后再试。" });
          return;
        }

        const app = getApp();
        app.globalData.humiSession = data;
        app.globalData.humiPhoneSessionUpdatedAt = Date.now();
        this.setData({
          currentSession: data,
          phoneSessionUpdatedAt: app.globalData.humiPhoneSessionUpdatedAt,
          phoneBindVisible: false,
          url: appendSessionToUrl(buildHumiUrl(getHumiH5Url(), this.data.launchOptions), data)
        });
        wx.showToast({ title: "手机号已绑定", icon: "success" });
      },
      fail: () => {
        this.setData({ phoneBindError: "网络连接失败，请检查网络后重试。" });
      },
      complete: () => {
        this.setData({ phoneBindPending: false });
      }
    });
  },

  onShareAppMessage() {
    return getCurrentSharePayload(this.data);
  },

});

function appendSessionToUrl(url, session) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}humiLogin=wechat&humiSession=${encodeURIComponent(JSON.stringify(session))}`;
}

function openSharePage(params = "") {
  const url = params ? `/pages/share/index?${params}` : "/pages/share/index";
  wx.navigateTo({
    url,
    fail: () => {
      wx.redirectTo({
        url,
        fail: () => {
          wx.showToast({
            title: "分享卡片暂时打不开",
            icon: "none"
          });
        }
      });
    }
  });
}

function getCurrentSharePayload(data = {}) {
  if (data.pendingShare?.path) return data.pendingShare;
  const launchOptions = data.launchOptions || {};
  if (launchOptions.crave) {
    return {
      title: "我家今晚要做饭，你想吃点啥？",
      path: `/pages/index/index?crave=${encodeURIComponent(launchOptions.crave)}&shareSource=crave`
    };
  }
  if (launchOptions.groceryShare) {
    return {
      title: "Humi 买菜清单，顺路带这些",
      path: `/pages/index/index?groceryShare=${encodeURIComponent(launchOptions.groceryShare)}&shareSource=grocery`
    };
  }
  if (launchOptions.menuShare) {
    return {
      title: "Humi 今晚菜单",
      path: `/pages/index/index?menuShare=${encodeURIComponent(launchOptions.menuShare)}&shareSource=today_menu`
    };
  }
  if (launchOptions.wishShare) {
    return {
      title: "我家最近想吃什么？写一道给 Humi",
      path: `/pages/index/index?wishShare=${encodeURIComponent(launchOptions.wishShare)}&shareSource=wish`
    };
  }
  if (launchOptions.invite) {
    return {
      title: "邀请你加入我的家，一起用 Humi",
      path: `/pages/index/index?invite=${encodeURIComponent(launchOptions.invite)}&shareSource=invite`
    };
  }
  if (launchOptions.view === "grocery") {
    return {
      title: "Humi 买菜清单",
      path: "/pages/index/index?view=grocery&shareSource=grocery"
    };
  }
  if (launchOptions.view === "today") {
    return {
      title: "Humi 今晚菜单",
      path: "/pages/index/index?view=today&shareSource=today_menu"
    };
  }
  return {
    title: "Humi：今晚吃什么，家里一起定",
    path: "/pages/index/index"
  };
}

function enableNativeShareMenu() {
  wx.showShareMenu({
    menus: ["shareAppMessage"],
    withShareTicket: false
  });
}

const { HUMI_WECHAT_LOGIN_ENABLED, getHumiApiBaseUrl, getHumiH5Url } = require("../../utils/config");

Page({
  data: {
    url: "",
    launchCraveToken: "",
    launchInviteToken: "",
    launchGroceryToken: "",
    launchWishToken: "",
    launchMenuToken: "",
    shareCrave: null,
    shareInvite: null,
    shareGrocery: null,
    shareWish: null,
    shareMenu: null,
    loginPending: false,
    loginError: "",
    webViewError: "",
    phoneBindVisible: false,
    phoneBindPending: false,
    phoneBindError: "",
    currentSession: null,
    phoneSessionUpdatedAt: 0
  },

  onLoad(options = {}) {
    const launchCraveToken = options.crave || "";
    const launchInviteToken = options.invite || "";
    const launchGroceryToken = options.grocery || "";
    const launchGroceryShareToken = options.groceryShare || launchGroceryToken;
    const launchWishToken = options.wishShare || "";
    const launchMenuToken = options.menuShare || "";
    if (launchWishToken) {
      this.setData({
        launchWishToken,
        shareCrave: null,
        shareInvite: null,
        shareGrocery: null,
        shareMenu: null,
        shareWish: { token: launchWishToken, householdName: "我家", initiatorName: "主厨" }
      });
      this.openWebView(appendQuery(getHumiH5Url(), { wishShare: launchWishToken, channel: "wechat-miniprogram" }));
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (launchMenuToken) {
      this.setData({
        launchMenuToken,
        shareCrave: null,
        shareInvite: null,
        shareGrocery: null,
        shareWish: null,
        shareMenu: { token: launchMenuToken, householdName: "我家", title: "今晚菜单已经安排好" }
      });
      this.openWebView(appendQuery(getHumiH5Url(), { menuShare: launchMenuToken, channel: "wechat-miniprogram" }));
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (launchGroceryShareToken) {
      this.setData({
        launchGroceryToken: launchGroceryShareToken,
        shareCrave: null,
        shareInvite: null,
        shareGrocery: {
          token: launchGroceryShareToken,
          householdName: "我家",
          initiatorName: "主厨",
          itemCount: 0
        },
      });
      this.openWebView(appendQuery(getHumiH5Url(), { groceryShare: launchGroceryShareToken, channel: "wechat-miniprogram" }));
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (launchInviteToken) {
      this.setData({
        launchInviteToken,
        shareCrave: null,
        shareGrocery: null,
        shareInvite: {
          token: launchInviteToken,
          householdName: "这个家",
          inviterName: "主厨"
        },
      });
      this.openWebView(appendQuery(getHumiH5Url(), { invite: launchInviteToken, channel: "wechat-miniprogram" }));
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (launchCraveToken) {
      this.setData({
        launchCraveToken,
        shareInvite: null,
        shareGrocery: null,
        shareCrave: {
          token: launchCraveToken,
          householdName: "我家",
          initiatorName: "主厨",
          title: "今晚征集口味，点一下就行"
        },
      });
      this.openWebView(appendQuery(getHumiH5Url(), { crave: launchCraveToken, channel: "wechat-miniprogram" }));
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (HUMI_WECHAT_LOGIN_ENABLED) {
      this._initialLoginTimer = setTimeout(() => this.finishInitialLoad(), 2200);
      this.loginWithWechat({ initial: true });
      return;
    }
    this.finishInitialLoad();
  },

  onUnload() {
    if (this._initialLoginTimer) clearTimeout(this._initialLoginTimer);
  },

  onShow() {
    const app = getApp();
    const updatedAt = app.globalData?.humiPhoneSessionUpdatedAt || 0;
    const session = app.globalData?.humiSession;
    if (updatedAt && updatedAt !== this.data.phoneSessionUpdatedAt && session?.accessToken) {
      this.setData({
        currentSession: session,
        phoneSessionUpdatedAt: updatedAt,
        phoneBindVisible: false,
        url: appendSessionToUrl(this.buildH5Url(), session)
      });
    }
  },

  handleLoad() {
    if (this.data.webViewError) this.setData({ webViewError: "" });
  },

  handleMessage(event) {
    const messages = event.detail?.data || [];
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.type === "humi:share-crave" && latestMessage?.token) {
      this.setData({
        shareInvite: null,
        shareGrocery: null,
        shareCrave: {
          token: latestMessage.token,
          householdName: latestMessage.householdName || "我家",
          initiatorName: latestMessage.initiatorName || "主厨",
          title: latestMessage.title || ""
        }
      });
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (latestMessage?.type === "humi:share-household-invite" && latestMessage?.token) {
      this.setData({
        shareCrave: null,
        shareGrocery: null,
        shareInvite: {
          token: latestMessage.token,
          householdName: latestMessage.householdName || "我的家",
          inviterName: latestMessage.inviterName || "主厨"
        }
      });
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (latestMessage?.type === "humi:share-grocery" && latestMessage?.token) {
      this.setData({
        shareCrave: null,
        shareInvite: null,
        shareGrocery: {
          token: latestMessage.token,
          householdName: latestMessage.householdName || "我家",
          initiatorName: latestMessage.initiatorName || "主厨",
          itemCount: latestMessage.itemCount || 0
        }
      });
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (latestMessage?.type === "humi:share-wish" && latestMessage?.token) {
      this.setData({
        shareCrave: null,
        shareInvite: null,
        shareGrocery: null,
        shareMenu: null,
        shareWish: {
          token: latestMessage.token,
          householdName: latestMessage.householdName || "我家",
          initiatorName: latestMessage.initiatorName || "主厨"
        }
      });
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (latestMessage?.type === "humi:share-menu" && latestMessage?.token) {
      this.setData({
        shareCrave: null,
        shareInvite: null,
        shareGrocery: null,
        shareWish: null,
        shareMenu: {
          token: latestMessage.token,
          householdName: latestMessage.householdName || "我家",
          title: latestMessage.title || "今晚菜单已经安排好"
        }
      });
      wx.showShareMenu({ withShareTicket: false, menus: ["shareAppMessage"] });
      return;
    }
    if (HUMI_WECHAT_LOGIN_ENABLED && latestMessage?.type === "humi:wechat-login") {
      if (this.data.currentSession?.accessToken) {
        this.openWebView(appendSessionToUrl(this.buildH5Url(), this.data.currentSession));
      } else {
        this.loginWithWechat();
      }
    }
    if (HUMI_WECHAT_LOGIN_ENABLED && latestMessage?.type === "humi:phone-bind") {
      if (!this.data.currentSession?.accessToken) {
        this.loginWithWechat();
        return;
      }
      this.setData({ phoneBindVisible: true, phoneBindError: "" });
    }
  },

  handleError(error) {
    console.warn("Humi web-view error", error.detail);
    if (this.data.url) this._lastWebViewUrl = this.data.url;
    this.setData({
      url: "",
      webViewError: "页面暂时没有加载出来。请检查网络后重试。"
    });
  },

  retryWebView() {
    const targetUrl = this._lastWebViewUrl || this.buildH5Url();
    this.openWebView(appendQuery(targetUrl, { humiRetry: Date.now() }));
  },

  openWebView(url) {
    this._lastWebViewUrl = url;
    this.setData({ url, webViewError: "" });
  },

  finishInitialLoad(session) {
    if (this._initialLoadFinished) return;
    this._initialLoadFinished = true;
    if (this._initialLoginTimer) {
      clearTimeout(this._initialLoginTimer);
      this._initialLoginTimer = null;
    }
    const url = session?.accessToken
      ? appendSessionToUrl(this.buildH5Url(), session)
      : this.buildH5Url();
    this.openWebView(url);
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
              if (initial) this.finishInitialLoad();
              return;
            }

            const app = getApp();
            app.globalData.humiSession = data;
            this.setData({ currentSession: data });
            if (initial) {
              this.finishInitialLoad(data);
            } else {
              this.openWebView(appendSessionToUrl(this.buildH5Url(), data));
            }
            if (!initial) wx.showToast({ title: "已登录 Humi", icon: "success" });
          },
          fail: () => {
            this.setData({ loginError: "网络连接失败，请检查网络后重试。" });
            if (initial) this.finishInitialLoad();
          },
          complete: () => {
            this.setData({ loginPending: false });
          }
        });
      },
      fail: () => {
        this.setData({ loginPending: false, loginError: "微信登录失败，请重新尝试。" });
        if (initial) this.finishInitialLoad();
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
          url: appendSessionToUrl(this.buildH5Url(), data)
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
    const shareWish = this.data.shareWish;
    if (shareWish?.token) {
      return {
        title: `${shareWish.initiatorName}想收集家里最近想吃的菜`,
        path: `/pages/index/index?wishShare=${encodeURIComponent(shareWish.token)}`
      };
    }
    const shareMenu = this.data.shareMenu;
    if (shareMenu?.token) {
      return {
        title: shareMenu.title || `${shareMenu.householdName}今晚菜单已经安排好`,
        path: `/pages/index/index?menuShare=${encodeURIComponent(shareMenu.token)}`
      };
    }
    const shareGrocery = this.data.shareGrocery;
    if (shareGrocery?.token) {
      const itemCount = Number(shareGrocery.itemCount || 0);
      return {
        title: itemCount > 0
          ? `${shareGrocery.initiatorName}发来 ${itemCount} 项买菜清单`
          : `${shareGrocery.initiatorName}发来买菜清单`,
        path: `/pages/index/index?groceryShare=${encodeURIComponent(shareGrocery.token)}`
      };
    }
    const shareInvite = this.data.shareInvite;
    if (shareInvite?.token) {
      return {
        title: `${shareInvite.inviterName}邀请你加入 ${shareInvite.householdName}`,
        path: `/pages/index/index?invite=${encodeURIComponent(shareInvite.token)}`
      };
    }
    const shareCrave = this.data.shareCrave;
    if (shareCrave?.token) {
      return {
        title: shareCrave.title || `${shareCrave.householdName}今晚征集口味，点一下就行`,
        path: `/pages/index/index?crave=${encodeURIComponent(shareCrave.token)}`
      };
    }
    return {
      title: "Humi 帮你安排今晚吃什么",
      path: "/pages/index/index"
    };
  },

  buildH5Url() {
    const launchWishToken = this.data.launchWishToken;
    if (launchWishToken) {
      return appendQuery(getHumiH5Url(), { wishShare: launchWishToken, channel: "wechat-miniprogram" });
    }
    const launchMenuToken = this.data.launchMenuToken;
    if (launchMenuToken) {
      return appendQuery(getHumiH5Url(), { menuShare: launchMenuToken, channel: "wechat-miniprogram" });
    }
    const launchGroceryToken = this.data.launchGroceryToken;
    if (launchGroceryToken) {
      return appendQuery(getHumiH5Url(), { groceryShare: launchGroceryToken, channel: "wechat-miniprogram" });
    }
    const launchInviteToken = this.data.launchInviteToken;
    if (launchInviteToken) {
      return appendQuery(getHumiH5Url(), { invite: launchInviteToken, channel: "wechat-miniprogram" });
    }
    const launchCraveToken = this.data.launchCraveToken;
    if (launchCraveToken) {
      return appendQuery(getHumiH5Url(), { crave: launchCraveToken, channel: "wechat-miniprogram" });
    }
    return getHumiH5Url();
  }
});

function appendSessionToUrl(url, session) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}humiLogin=wechat&humiSession=${encodeURIComponent(JSON.stringify(session))}`;
}

function appendQuery(url, params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  if (entries.length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${entries.join("&")}`;
}

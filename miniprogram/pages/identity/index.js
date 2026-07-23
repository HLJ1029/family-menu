const { getHumiApiBaseUrl } = require("../../utils/config");

Page({
  data: {
    displayName: "",
    avatarUrl: "",
    pending: false,
    error: ""
  },

  onLoad(options = {}) {
    if (options.action === "login") {
      getApp().clearHumiSession();
      this.loginWithWechat();
      return;
    }
    const user = getApp().globalData?.humiSession?.user;
    if (user) {
      this.hydrateUser(user);
      return;
    }
    if (!user) {
      wx.reLaunch({ url: "/pages/boot/index" });
    }
  },

  hydrateUser(user) {
    this.setData({
      displayName: user.displayName === "微信用户" ? "" : user.displayName,
      avatarUrl: user.avatarUrl || ""
    });
  },

  loginWithWechat() {
    if (this.data.pending) return;
    this.setData({ pending: true, error: "" });
    wx.login({
      success: ({ code }) => {
        if (!code) {
          this.setData({ pending: false, error: "微信登录失败，请重新尝试。" });
          return;
        }
        wx.request({
          url: `${getHumiApiBaseUrl()}/auth/wechat/login`,
          method: "POST",
          data: { code },
          header: { "content-type": "application/json" },
          success: ({ statusCode, data }) => {
            if (statusCode < 200 || statusCode >= 300 || !data?.accessToken) {
              this.setData({ error: data?.message || "登录服务暂时不可用，请稍后重试。" });
              return;
            }
            getApp().setHumiSession(data);
            if (data.user?.profileStatus === "complete") {
              wx.reLaunch({ url: "/pages/boot/index?humiResume=1" });
              return;
            }
            this.hydrateUser(data.user || {});
          },
          fail: () => this.setData({ error: "网络连接失败，请检查网络后重试。" }),
          complete: () => this.setData({ pending: false })
        });
      },
      fail: () => this.setData({ pending: false, error: "微信登录失败，请重新尝试。" })
    });
  },

  chooseAvatar(event) {
    this.setData({ avatarUrl: event.detail?.avatarUrl || "", error: "" });
  },

  updateNickname(event) {
    this.setData({ displayName: String(event.detail?.value || "").trim(), error: "" });
  },

  submit() {
    if (this.data.pending) return;
    if (!this.data.displayName) {
      this.setData({ error: "请输入你的昵称。" });
      return;
    }
    this.setData({ pending: true, error: "" });
    this.saveIdentity()
      .then(() => {
        getApp().globalData.humiIdentityUpdatedAt = Date.now();
        wx.reLaunch({ url: "/pages/boot/index?humiResume=1" });
      })
      .catch((error) => this.setData({ error: error.message || "身份暂时没有保存成功，请重试。" }))
      .finally(() => this.setData({ pending: false }));
  },

  async saveIdentity() {
    const app = getApp();
    const session = app.globalData?.humiSession;
    if (!session?.accessToken) throw new Error("登录状态已失效，请重新登录。");
    let user = session.user;
    if (this.data.avatarUrl && !/^https:\/\//.test(this.data.avatarUrl)) {
      const compressedPath = await compressAvatar(this.data.avatarUrl);
      const dataBase64 = await readBase64(compressedPath);
      const avatar = await apiRequest("/identity/avatar", session, {
        mimeType: detectAvatarMime(dataBase64),
        dataBase64
      });
      user = avatar.user;
    }
    const profile = await apiRequest("/identity/profile", session, { displayName: this.data.displayName }, "PUT");
    app.setHumiSession({ ...session, user: { ...user, ...profile.user } });
  }
});

function apiRequest(path, session, body, method = "POST") {
  return new Promise((resolve, reject) => wx.request({
    url: `${getHumiApiBaseUrl()}${path}`,
    method,
    data: body,
    header: { "content-type": "application/json", Authorization: `Bearer ${session.accessToken}` },
    success: ({ statusCode, data }) => statusCode >= 200 && statusCode < 300
      ? resolve(data)
      : reject(new Error(data?.message || "请求失败，请重试。")),
    fail: () => reject(new Error("网络连接失败，请检查网络后重试。"))
  }));
}

function compressAvatar(src) {
  return new Promise((resolve, reject) => wx.compressImage({
    src,
    quality: 70,
    success: ({ tempFilePath }) => resolve(tempFilePath),
    fail: () => reject(new Error("头像处理失败，请重新选择。"))
  }));
}

function readBase64(path) {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
    filePath: path,
    encoding: "base64",
    success: ({ data }) => resolve(data),
    fail: () => reject(new Error("头像读取失败，请重新选择。"))
  }));
}

function detectAvatarMime(dataBase64) {
  if (String(dataBase64 || "").startsWith("iVBORw0KGgo")) return "image/png";
  if (String(dataBase64 || "").startsWith("/9j/")) return "image/jpeg";
  throw new Error("头像格式不受支持，请重新选择 JPG 或 PNG。");
}

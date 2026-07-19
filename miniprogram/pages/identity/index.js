const { getHumiApiBaseUrl } = require("../../utils/config");

Page({
  data: {
    displayName: "",
    avatarUrl: "",
    pending: false,
    error: ""
  },

  onLoad() {
    const user = getApp().globalData?.humiSession?.user;
    if (!user) {
      wx.reLaunch({ url: "/pages/index/index" });
      return;
    }
    this.setData({
      displayName: user.displayName === "微信用户" ? "" : user.displayName,
      avatarUrl: user.avatarUrl || ""
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
        wx.reLaunch({ url: "/pages/index/index?humiResume=1" });
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

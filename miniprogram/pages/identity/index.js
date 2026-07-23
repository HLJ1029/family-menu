const { loginWithWechat } = require("../../utils/session");
const { requestHumi } = require("../../utils/request");
const { clearBootstrapCacheForUser } = require("../../utils/bootstrap");

Page({
  data: {
    displayName: "",
    selectedAvatarKey: "",
    avatarUrl: "",
    localAvatarUrl: "",
    canSubmit: false,
    pending: false,
    error: ""
  },

  onLoad(options = {}) {
    if (options.action === "login") {
      getApp().clearHumiSession();
      return this.loginWithWechat();
    }
    const user = getApp().globalData?.humiSession?.user;
    if (!user) {
      wx.reLaunch({ url: "/pages/boot/index" });
      return;
    }
    if (user.profileStatus === "complete") wx.reLaunch({ url: "/pages/boot/index?humiResume=1" });
  },

  async loginWithWechat() {
    if (this.data.pending) return;
    this.setData({ pending: true, error: "" });
    try {
      const session = await loginWithWechat();
      getApp().setHumiSession(session);
      if (session.user?.profileStatus === "complete") {
        wx.reLaunch({ url: "/pages/boot/index?humiResume=1" });
      }
    } catch (error) {
      this.setData({ error: "微信登录失败，请重新尝试。" });
    } finally {
      this.setData({ pending: false });
    }
  },

  async useWechatProfile() {
    if (this.data.pending) return;
    try {
      const profile = await callWx(wx.getUserProfile, { desc: "用于让家人认出你" });
      const avatarUrl = String(profile?.userInfo?.avatarUrl || "");
      this.setIdentityData({
        displayName: String(profile?.userInfo?.nickName || "").slice(0, 32),
        avatarUrl,
        localAvatarUrl: avatarUrl,
        selectedAvatarKey: "",
        error: ""
      });
    } catch (_) {
      this.setData({ error: "没有获取微信头像和昵称，你也可以手动填写。" });
    }
  },

  selectApprovedAvatar(event) {
    const avatarKey = String(event.detail?.avatarKey || "");
    this.setIdentityData({ selectedAvatarKey: avatarKey, avatarUrl: "", localAvatarUrl: "", error: "" });
  },

  chooseAvatar(event) {
    const avatarUrl = String(event.detail?.avatarUrl || "");
    this.setIdentityData({ avatarUrl, localAvatarUrl: avatarUrl, selectedAvatarKey: "", error: "" });
  },

  updateNickname(event) {
    this.setIdentityData({ displayName: String(event.detail?.value || "").slice(0, 32), error: "" });
  },

  setIdentityData(patch) {
    const next = { ...this.data, ...patch };
    this.setData({ ...patch, canSubmit: canSubmit(next) });
  },

  async submit() {
    if (this.data.pending || !this.data.canSubmit) return;
    this.setData({ pending: true, error: "" });
    try {
      const { user, session } = await this.saveIdentity({
        displayName: String(this.data.displayName || "").trim(),
        avatarKey: this.data.selectedAvatarKey,
        avatarUrl: this.data.avatarUrl
      });
      const app = getApp();
      app.setHumiSession({ ...app.globalData.humiSession, ...session, user });
      app.globalData.humiIdentityUpdatedAt = Date.now();
      clearBootstrapCacheForUser(user.id);
      wx.reLaunch({ url: "/pages/boot/index?reason=identity_complete" });
    } catch (error) {
      this.setData({ error: error.message || "身份暂时没有保存成功，请重试。" });
    } finally {
      this.setData({ pending: false });
    }
  },

  async saveIdentity(payload) {
    const session = getApp().globalData?.humiSession;
    if (!session?.accessToken) throw new Error("登录状态已失效，请重新登录。");
    let uploadedAvatarUrl = "";
    if (payload.avatarUrl) {
      const compressedPath = await compressAvatar(await localAvatarPath(payload.avatarUrl));
      const dataBase64 = await readBase64(compressedPath);
      const avatar = await requestHumi({
        path: "/identity/avatar",
        method: "POST",
        data: { mimeType: detectAvatarMime(dataBase64), dataBase64 }
      });
      uploadedAvatarUrl = avatar.user?.avatarUrl || "";
    }
    const profile = await requestHumi({
      path: "/identity/profile",
      method: "PUT",
      data: { displayName: payload.displayName, avatarKey: payload.avatarKey, avatarUrl: uploadedAvatarUrl }
    });
    return { user: profile.user, session: { ...session, user: profile.user } };
  }
});

function canSubmit(data = {}) {
  return Boolean(String(data.displayName || "").trim() && (data.selectedAvatarKey || data.avatarUrl));
}

function callWx(method, options) {
  return new Promise((resolve, reject) => method({ ...options, success: resolve, fail: reject }));
}

async function localAvatarPath(avatarUrl) {
  if (!/^https:\/\//.test(avatarUrl)) return avatarUrl;
  const result = await callWx(wx.downloadFile, { url: avatarUrl });
  if (result.statusCode && result.statusCode >= 400) throw new Error("微信头像下载失败，请重新选择。");
  if (!result.tempFilePath) throw new Error("微信头像下载失败，请重新选择。");
  return result.tempFilePath;
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

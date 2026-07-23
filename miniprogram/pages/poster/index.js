const { getHumiApiBaseUrl } = require("../../utils/config");

Page({
  data: {
    token: "",
    format: "jpg",
    title: "Humi 海报",
    action: "share",
    imageUrl: "",
    pending: false,
    statusText: "海报好了。发给家人，或者留到相册里。",
  },

  onLoad(options = {}) {
    const token = normalizeToken(options.token);
    const format = options.format === "png" ? "png" : "jpg";
    const title = normalizeText(options.title) || "Humi 海报";
    const action = options.action === "save" ? "save" : "share";
    this.setData({
      token,
      format,
      title,
      action,
      imageUrl: token ? `${getHumiApiBaseUrl()}/poster-shares/${token}.${format}` : "",
      statusText: token
        ? action === "save"
          ? "点“保存到相册”就行；第一次保存时，微信会问你是否允许。"
          : "点“发给家人”，再选一个聊天。"
        : "这张海报没带过来，回 Humi 再生成一次吧。",
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.title,
      path: `/pages/poster/index?token=${encodeURIComponent(this.data.token)}&format=${this.data.format}&title=${encodeURIComponent(this.data.title)}`,
    };
  },

  async sharePosterImage() {
    if (!this.data.token || this.data.pending) return;
    this.setData({ pending: true, statusText: "正在把海报带到微信…" });
    try {
      const tempFilePath = await this.ensurePosterDownloaded();
      if (typeof wx.showShareImageMenu !== "function") {
        this.setData({ statusText: "这台微信还不能直接发图片，可以先存到相册。" });
        wx.showModal({
          title: "先存到相册",
          content: "保存好以后，再从聊天里把这张海报发给家人。",
          confirmText: "知道了",
          showCancel: false,
        });
        return;
      }
      await callWxApi(wx.showShareImageMenu, { path: tempFilePath });
      this.setData({ statusText: "微信已经接手，选个家人发出去吧。" });
    } catch (error) {
      if (isUserCancel(error)) {
        this.setData({ statusText: "已取消发送，图片还在这里。" });
      } else {
        this.setData({ statusText: friendlyPosterError(error) });
      }
    } finally {
      this.setData({ pending: false });
    }
  },

  async savePosterImage() {
    if (!this.data.token || this.data.pending) return;
    this.setData({ pending: true, statusText: "正在保存这张海报…" });
    try {
      const tempFilePath = await this.ensurePosterDownloaded();
      await callWxApi(wx.saveImageToPhotosAlbum, { filePath: tempFilePath });
      this.setData({ statusText: "已经存进相册了。" });
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      if (isAlbumPermissionError(error)) {
        this.setData({ statusText: "还差相册权限。允许以后，再点一次保存。" });
        wx.showModal({
          title: "允许保存海报",
          content: "去设置里允许 Humi 保存图片，回来后再点一次就好。",
          confirmText: "去设置",
          success: (result) => {
            if (result.confirm) wx.openSetting();
          },
        });
      } else if (isUserCancel(error)) {
        this.setData({ statusText: "没有保存，海报还在这里。" });
      } else {
        this.setData({ statusText: friendlyPosterError(error) });
      }
    } finally {
      this.setData({ pending: false });
    }
  },

  ensurePosterDownloaded() {
    if (this._tempFilePath) return Promise.resolve(this._tempFilePath);
    if (this._downloadPromise) return this._downloadPromise;
    this._downloadPromise = new Promise((resolve, reject) => {
      wx.downloadFile({
        url: this.data.imageUrl,
        success: (result) => {
          if (result.statusCode !== 200 || !result.tempFilePath) {
            reject(new Error(`download status ${result.statusCode || 0}`));
            return;
          }
          this._tempFilePath = result.tempFilePath;
          resolve(result.tempFilePath);
        },
        fail: reject,
        complete: () => {
          this._downloadPromise = null;
        },
      });
    });
    return this._downloadPromise;
  },

  goBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/boot/index" });
  },
});

function callWxApi(api, options) {
  return new Promise((resolve, reject) => api({ ...options, success: resolve, fail: reject }));
}

function normalizeToken(value) {
  const token = String(value || "").trim();
  return /^[A-Za-z0-9_-]{24,64}$/.test(token) ? token : "";
}

function normalizeText(value) {
  const text = String(value || "").trim();
  try {
    return decodeURIComponent(text).trim().slice(0, 60);
  } catch {
    return text.slice(0, 60);
  }
}

function errorMessage(error) {
  return String(error?.errMsg || error?.message || error || "");
}

function isAlbumPermissionError(error) {
  return /auth deny|authorize:fail|scope\.writePhotosAlbum|permission/i.test(errorMessage(error));
}

function isUserCancel(error) {
  return /cancel/i.test(errorMessage(error));
}

function friendlyPosterError(error) {
  const message = errorMessage(error);
  if (/download|status/i.test(message)) return "海报没能下载下来，看看网络再试一次。";
  return "这次没完成，再试一次吧。";
}

module.exports = {
  friendlyPosterError,
  isAlbumPermissionError,
  isUserCancel,
  normalizeText,
  normalizeToken,
};

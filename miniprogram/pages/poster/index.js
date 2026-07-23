const { getHumiApiBaseUrl } = require("../../utils/config");
const { nextStyleId, normalizeStyleId, normalizeStyles, styleLabel } = require("../../utils/poster-styles");
const { trackEvent } = require("../../utils/telemetry");

Page({
  data: {
    token: "",
    format: "jpg",
    title: "Humi 海报",
    action: "share",
    imageUrl: "",
    posterType: "",
    styleId: "default",
    styleLabel: "清单",
    styleVariants: [],
    showStyleAction: false,
    nextStyleLabel: "",
    pending: false,
    statusText: "海报好了。发给家人，或者留到相册里。",
  },

  onLoad(options = {}) {
    const token = normalizeToken(options.token);
    const format = options.format === "png" ? "png" : "jpg";
    const title = normalizeText(options.title) || "Humi 海报";
    const action = options.action === "save" ? "save" : "share";
    const posterType = normalizePosterType(options.posterType);
    const requestedStyleId = normalizeStyleId(options.styleId);
    const styleVariants = parsePosterVariants([
      { styleId: "default", token: options.defaultToken, format: options.defaultFormat },
      { styleId: "theme", token: options.themeToken, format: options.themeFormat },
    ], { token, format, styleId: requestedStyleId });
    const selectedVariant = styleVariants.find((variant) => (
      variant.styleId === requestedStyleId && (!token || variant.token === token)
    )) || styleVariants.find((variant) => variant.styleId === requestedStyleId) || styleVariants[0] || null;
    const availableStyles = normalizeStyles(styleVariants);
    const styleId = selectedVariant?.styleId || requestedStyleId;
    const showStyleAction = posterTypeSupportsStyles(posterType) && availableStyles.length > 1;
    const followingStyleId = nextStyleId(styleId, availableStyles);
    this.setData({
      token: selectedVariant?.token || token,
      format: selectedVariant?.format || format,
      title,
      action,
      posterType,
      styleId,
      styleLabel: styleLabel(styleId),
      styleVariants,
      showStyleAction,
      nextStyleLabel: showStyleAction ? styleLabel(followingStyleId) : "",
      imageUrl: selectedVariant ? buildPosterImageUrl(selectedVariant) : "",
      statusText: selectedVariant
        ? action === "save"
          ? "点“保存到相册”就行；第一次保存时，微信会问你是否允许。"
          : "点“发给家人”，再选一个聊天。"
        : "这张海报没带过来，回 Humi 再生成一次吧。",
    });
  },

  onShareAppMessage() {
    const defaultVariant = this.data.styleVariants.find((variant) => variant.styleId === "default");
    const themeVariant = this.data.styleVariants.find((variant) => variant.styleId === "theme");
    return {
      title: this.data.title,
      path: [
        `/pages/poster/index?token=${encodeURIComponent(this.data.token)}`,
        `format=${this.data.format}`,
        `styleId=${this.data.styleId}`,
        `posterType=${encodeURIComponent(this.data.posterType)}`,
        `defaultToken=${encodeURIComponent(defaultVariant?.token || "")}`,
        `defaultFormat=${defaultVariant?.format || "jpg"}`,
        `themeToken=${encodeURIComponent(themeVariant?.token || "")}`,
        `themeFormat=${themeVariant?.format || "jpg"}`,
        `title=${encodeURIComponent(this.data.title)}`,
      ].join("&"),
    };
  },

  async sharePosterImage() {
    if (!this.data.token || this.data.pending) return;
    this.setData({ pending: true, statusText: "正在把海报带到微信…" });
    try {
      const tempFilePath = await this.ensurePosterDownloaded();
      if (typeof wx.showShareImageMenu !== "function") {
        trackPosterOutcome("poster_failed", this.data.styleId, "failed", "request_failed");
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
      trackPosterOutcome("poster_shared", this.data.styleId, "completed");
      this.setData({ statusText: "微信已经接手，选个家人发出去吧。" });
    } catch (error) {
      if (isUserCancel(error)) {
        trackPosterOutcome("native_share_cancelled", this.data.styleId, "cancelled");
        this.setData({ statusText: "已取消发送，图片还在这里。" });
      } else {
        trackPosterOutcome("poster_failed", this.data.styleId, "failed");
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
      trackPosterOutcome("poster_saved", this.data.styleId, "completed");
      this.setData({ statusText: "已经存进相册了。" });
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      if (isAlbumPermissionError(error)) {
        trackPosterOutcome("poster_failed", this.data.styleId, "failed", "permission_denied");
        this.setData({ statusText: "还差相册权限。允许以后，再点一次保存。" });
        wx.showModal({
          title: "允许保存海报",
          content: "去设置里允许 Humi 保存图片，回来后再点一次就好。",
          confirmText: "去设置",
          success: (result) => {
            if (result.confirm && typeof wx.openSetting === "function") wx.openSetting();
          },
        });
      } else if (isUserCancel(error)) {
        trackPosterOutcome("native_share_cancelled", this.data.styleId, "cancelled");
        this.setData({ statusText: "没有保存，海报还在这里。" });
      } else {
        trackPosterOutcome("poster_failed", this.data.styleId, "failed");
        this.setData({ statusText: friendlyPosterError(error) });
      }
    } finally {
      this.setData({ pending: false });
    }
  },

  ensurePosterDownloaded() {
    const imageUrl = this.data.imageUrl;
    if (!imageUrl) return Promise.reject(new Error("poster image missing"));
    if (this._downloadedUrl === imageUrl && this._tempFilePath) return Promise.resolve(this._tempFilePath);
    if (!this._posterDownloads) this._posterDownloads = Object.create(null);
    const cached = this._posterDownloads[imageUrl];
    if (cached?.tempFilePath) {
      this._downloadedUrl = imageUrl;
      this._tempFilePath = cached.tempFilePath;
      return Promise.resolve(cached.tempFilePath);
    }
    if (cached?.promise) return cached.promise;
    const entry = cached || {};
    const downloadPromise = new Promise((resolve, reject) => {
      wx.downloadFile({
        url: imageUrl,
        success: (result) => {
          if (result.statusCode !== 200 || !result.tempFilePath) {
            reject(new Error(`download status ${result.statusCode || 0}`));
            return;
          }
          entry.tempFilePath = result.tempFilePath;
          if (this.data.imageUrl === imageUrl) {
            this._downloadedUrl = imageUrl;
            this._tempFilePath = result.tempFilePath;
          }
          resolve(result.tempFilePath);
        },
        fail: reject,
      });
    });
    entry.promise = downloadPromise.finally(() => {
      entry.promise = null;
    });
    this._posterDownloads[imageUrl] = entry;
    return entry.promise;
  },

  changeStyle() {
    if (this.data.pending || !this.data.showStyleAction) return;
    const nextId = nextStyleId(this.data.styleId, this.data.styleVariants);
    const nextVariant = this.data.styleVariants.find((variant) => variant.styleId === nextId);
    if (!nextVariant || nextVariant.token === this.data.token) return;
    this._downloadedUrl = "";
    this._tempFilePath = "";
    const followingStyleId = nextStyleId(nextId, this.data.styleVariants);
    this.setData({
      token: nextVariant.token,
      format: nextVariant.format,
      styleId: nextId,
      styleLabel: styleLabel(nextId),
      imageUrl: buildPosterImageUrl(nextVariant),
      nextStyleLabel: styleLabel(followingStyleId),
      statusText: `已换成${styleLabel(nextId)}版，这是一张重新生成的海报。`,
    });
    trackEvent("poster_style_changed", {
      page: "poster",
      stage: "completed",
      result: "completed",
      errorCode: "none",
      styleId: nextId,
      shareSource: "poster",
    });
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

function normalizePosterType(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

function parsePosterVariants(value, fallback) {
  const candidates = Array.isArray(value) ? value.slice() : [];
  if (fallback?.token) candidates.unshift(fallback);
  const variants = [];
  const seenStyles = new Set();
  const seenTokens = new Set();
  for (const candidate of candidates) {
    const styleId = normalizeStyleId(candidate?.styleId);
    const token = normalizeToken(candidate?.token);
    const format = candidate?.format === "png" ? "png" : "jpg";
    if (!token || seenStyles.has(styleId) || seenTokens.has(token)) continue;
    seenStyles.add(styleId);
    seenTokens.add(token);
    variants.push({ styleId, token, format });
  }
  return variants;
}

function posterTypeSupportsStyles(posterType) {
  return posterType === "grocery_list";
}

function buildPosterImageUrl({ token, format }) {
  return `${getHumiApiBaseUrl()}/poster-shares/${token}.${format}`;
}

function trackPosterOutcome(name, styleId, result, errorCode = "") {
  trackEvent(name, {
    page: "poster",
    stage: result === "completed" ? "completed" : result === "cancelled" ? "completed" : "failed",
    result,
    errorCode: result === "completed" || result === "cancelled" ? "none" : errorCode || "request_failed",
    styleId,
    shareSource: "poster",
  });
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
  buildPosterImageUrl,
  friendlyPosterError,
  isAlbumPermissionError,
  isUserCancel,
  normalizeText,
  normalizeToken,
  parsePosterVariants,
  posterTypeSupportsStyles,
};

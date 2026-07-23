const {
  getPreparedShare,
  prepareShareSnapshot,
} = require("../utils/share-snapshot");

module.exports = Behavior({
  data: {
    preparedShares: {},
    sharePreparing: {},
    shareErrors: {},
  },

  methods: {
    async prepareNativeShare(type, context = {}) {
      this._shareContexts ||= {};
      this._sharePending ||= {};
      this._shareContexts[type] = context;
      if (this._sharePending[type]) return this._sharePending[type];
      const cached = getPreparedShare(type, context);
      if (cached) {
        this.applyShareState(type, { payload: cached.payload, preparing: false, error: "" });
        return cached;
      }
      this.applyShareState(type, { payload: null, preparing: true, error: "" });
      const pending = prepareShareSnapshot(type, context)
        .then((snapshot) => {
          this.applyShareState(type, { payload: snapshot.payload, preparing: false, error: "" });
          return snapshot;
        })
        .catch((error) => {
          this.applyShareState(type, {
            payload: null,
            preparing: false,
            error: "分享内容没准备好，点这里重试",
          });
          throw error;
        })
        .finally(() => {
          delete this._sharePending[type];
        });
      this._sharePending[type] = pending;
      return pending;
    },

    retryNativeShare(event = {}) {
      const type = String(event.currentTarget?.dataset?.shareType || "");
      const context = this._shareContexts?.[type];
      if (!context || this.data.sharePreparing?.[type]) return null;
      return this.prepareNativeShare(type, context).catch(() => null);
    },

    getNativeSharePayload(event = {}, fallback = {}, defaultType = "") {
      const type = String(
        event.target?.dataset?.shareType
        || event.currentTarget?.dataset?.shareType
        || defaultType,
      );
      const payload = this.data.preparedShares?.[type];
      return payload || fallback;
    },

    applyShareState(type, { payload, preparing, error }) {
      this.setData({
        preparedShares: { ...(this.data.preparedShares || {}), [type]: payload || null },
        sharePreparing: { ...(this.data.sharePreparing || {}), [type]: Boolean(preparing) },
        shareErrors: { ...(this.data.shareErrors || {}), [type]: String(error || "") },
      });
    },
  },
});

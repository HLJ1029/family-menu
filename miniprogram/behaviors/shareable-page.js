const {
  getPreparedShare,
  prepareShareSnapshot,
  snapshotKey,
} = require("../utils/share-snapshot");

module.exports = Behavior({
  data: {
    preparedShares: {},
    preparedShareKeys: {},
    sharePreparing: {},
    shareErrors: {},
  },

  methods: {
    async prepareNativeShare(type, context = {}) {
      this._shareContexts ||= {};
      this._sharePending ||= {};
      this._shareContextKeys ||= {};
      const key = snapshotKey(type, context);
      this._shareContexts[type] = context;
      this._shareContextKeys[type] = key;
      const cached = getPreparedShare(type, context);
      if (cached) {
        this.applyShareState(type, {
          payload: cached.payload,
          key,
          preparing: false,
          error: "",
        });
        return cached;
      }
      this.applyShareState(type, { payload: null, key: "", preparing: true, error: "" });
      const pending = prepareShareSnapshot(type, context)
        .then((snapshot) => {
          if (this._shareContextKeys[type] === key) {
            this.applyShareState(type, {
              payload: snapshot.payload,
              key,
              preparing: false,
              error: "",
            });
          }
          return snapshot;
        })
        .catch((error) => {
          if (this._shareContextKeys[type] === key) {
            this.applyShareState(type, {
              payload: null,
              key: "",
              preparing: false,
              error: "分享内容没准备好，点这里重试",
            });
          }
          throw error;
        })
        .finally(() => {
          if (this._sharePending[type]?.promise === pending) delete this._sharePending[type];
        });
      this._sharePending[type] = { key, promise: pending };
      return pending;
    },

    invalidateNativeShare(type, error = "") {
      this._shareContexts ||= {};
      this._shareContextKeys ||= {};
      this._shareInvalidationVersion = Number(this._shareInvalidationVersion || 0) + 1;
      this._shareContexts[type] = null;
      this._shareContextKeys[type] = `invalid:${type}:${this._shareInvalidationVersion}`;
      this.applyShareState(type, {
        payload: null,
        key: "",
        preparing: false,
        error,
      });
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
      const preparedKey = this.data.preparedShareKeys?.[type];
      return payload && preparedKey && preparedKey === this._shareContextKeys?.[type]
        ? payload
        : fallback;
    },

    applyShareState(type, { payload, key, preparing, error }) {
      this.setData({
        preparedShares: { ...(this.data.preparedShares || {}), [type]: payload || null },
        preparedShareKeys: { ...(this.data.preparedShareKeys || {}), [type]: String(key || "") },
        sharePreparing: { ...(this.data.sharePreparing || {}), [type]: Boolean(preparing) },
        shareErrors: { ...(this.data.shareErrors || {}), [type]: String(error || "") },
      });
    },
  },
});

const { startSpan } = require("../../utils/telemetry");

let firstVisibleSettled = false;

Component({
  properties: {
    src: {
      type: String,
      value: "",
      observer(value) {
        this.resetSource(value);
      }
    },
    alt: { type: String, value: "菜品图片" }
  },
  data: {
    state: "placeholder",
    imageSource: "",
    retryUsed: false
  },
  lifetimes: {
    attached() {
      this._firstVisibleSpan = firstVisibleSettled
        ? null
        : startSpan("thumbnail_first_visible", { page: "discover" });
      this.resetSource(this.properties.src);
    },
    detached() {
      if (this.data.state === "fallback") this.settleFirstVisibleFailure();
    }
  },
  methods: {
    resetSource(value) {
      this.setData({
        state: "placeholder",
        imageSource: String(value || ""),
        retryUsed: false
      });
    },
    onLoad() {
      this.setData({ state: "loaded" });
      if (!firstVisibleSettled && this._firstVisibleSpan) {
        firstVisibleSettled = true;
        this._firstVisibleSpan.end("completed", { page: "discover" });
        this._firstVisibleSpan = null;
      }
    },
    onError() {
      this.setData({ state: "fallback" });
      if (this.data.retryUsed) this.settleFirstVisibleFailure();
    },
    settleFirstVisibleFailure() {
      if (firstVisibleSettled || !this._firstVisibleSpan) return;
      firstVisibleSettled = true;
      this._firstVisibleSpan.end("failed", { page: "discover", errorCode: "network_error" });
      this._firstVisibleSpan = null;
    },
    retry() {
      if (this.data.retryUsed || !this.data.imageSource) return;
      const separator = this.data.imageSource.includes("?") ? "&" : "?";
      this.setData({
        state: "placeholder",
        retryUsed: true,
        imageSource: `${this.data.imageSource}${separator}retry=1`
      });
    }
  }
});

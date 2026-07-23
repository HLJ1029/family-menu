const { startSpan } = require("../../utils/telemetry");

let firstVisibleReported = false;

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
      this._firstVisibleSpan = firstVisibleReported
        ? null
        : startSpan("thumbnail_first_visible", { page: "discover" });
      this.resetSource(this.properties.src);
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
      if (!firstVisibleReported && this._firstVisibleSpan) {
        firstVisibleReported = true;
        this._firstVisibleSpan.end("completed", { page: "discover" });
        this._firstVisibleSpan = null;
      }
    },
    onError() {
      this.setData({ state: "fallback" });
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

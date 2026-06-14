const { getHumiH5Url } = require("../../utils/config");

Page({
  data: {
    url: ""
  },

  onLoad() {
    this.setData({
      url: getHumiH5Url()
    });
  },

  handleLoad() {},

  handleMessage(event) {
    console.info("Humi web-view message", event.detail);
  },

  handleError(error) {
    console.warn("Humi web-view error", error.detail);
  }
});

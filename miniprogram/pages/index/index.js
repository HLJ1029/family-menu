const { HUMI_H5_URL } = require("../../utils/config");

Page({
  data: {
    url: HUMI_H5_URL
  },

  handleLoad() {},

  handleMessage(event) {
    console.info("Humi web-view message", event.detail);
  },

  handleError(error) {
    console.warn("Humi web-view error", error.detail);
  }
});

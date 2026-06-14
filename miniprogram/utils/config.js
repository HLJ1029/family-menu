const HUMI_WEB_URL = "https://www.humi-home.com/?channel=wechat-miniprogram";
const HUMI_DEVTOOLS_URL = "http://127.0.0.1:5173/family-menu/?channel=wechat-miniprogram";

function getHumiH5Url() {
  try {
    if (wx.getDeviceInfo && wx.getDeviceInfo().platform === "devtools") {
      return HUMI_DEVTOOLS_URL;
    }
  } catch (error) {
    console.warn("Unable to detect mini program platform", error);
  }

  return HUMI_WEB_URL;
}

module.exports = {
  HUMI_WEB_URL,
  HUMI_DEVTOOLS_URL,
  getHumiH5Url
};

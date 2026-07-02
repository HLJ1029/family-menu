const HUMI_WEB_URL = "https://www.humi-home.com/?channel=wechat-miniprogram&h5v=1.1.20";
const HUMI_DEVTOOLS_URL = HUMI_WEB_URL;
const HUMI_API_BASE_URL = "https://api.humi-home.com";
const HUMI_DEVTOOLS_API_BASE_URL = HUMI_API_BASE_URL;
const HUMI_WECHAT_LOGIN_ENABLED = true;

function isDevtools() {
  try {
    const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
    return deviceInfo.platform === "devtools";
  } catch (error) {
    console.warn("Unable to detect mini program environment", error);
    return false;
  }
}

function getHumiH5Url() {
  return isDevtools() ? HUMI_DEVTOOLS_URL : HUMI_WEB_URL;
}

function getHumiApiBaseUrl() {
  return isDevtools() ? HUMI_DEVTOOLS_API_BASE_URL : HUMI_API_BASE_URL;
}

module.exports = {
  HUMI_API_BASE_URL,
  HUMI_DEVTOOLS_API_BASE_URL,
  HUMI_WECHAT_LOGIN_ENABLED,
  HUMI_WEB_URL,
  HUMI_DEVTOOLS_URL,
  getHumiApiBaseUrl,
  getHumiH5Url,
  isDevtools
};

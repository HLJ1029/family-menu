const HUMI_WEB_URL = "https://www.humi-home.com/?channel=wechat-miniprogram";
const HUMI_DEVTOOLS_URL = "http://localhost:5173/family-menu/?channel=wechat-miniprogram";
const HUMI_API_BASE_URL = "https://api.humi-home.com";
const HUMI_DEVTOOLS_API_BASE_URL = "http://127.0.0.1:8787";
const HUMI_WECHAT_LOGIN_ENABLED = true;

function isDevtools() {
  try {
    const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null;
    const envVersion = accountInfo?.miniProgram?.envVersion;
    const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
    return envVersion === "develop"
      || deviceInfo.platform === "devtools";
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

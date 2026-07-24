function toHumiUserMessage(error, fallback = "暂时连不上 Humi，请检查网络后重试。") {
  switch (error?.code) {
    case "invalid_session":
      return "登录状态已失效，请重新登录。";
    case "network_error":
    case "request_timeout":
      return "网络连接失败，请检查网络后重试。";
    case "avatar_required":
      return "请选择一个 Humi 头像，或使用微信头像。";
    case "invalid_avatar_key":
      return "请选择 Humi 提供的头像。";
    case "invalid_avatar":
      return "头像格式不受支持，请重新选择 JPG 或 PNG。";
    default:
      return fallback;
  }
}

module.exports = { toHumiUserMessage };

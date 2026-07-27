import { detailIntro, reviewNote } from "./wechat-submit-copy-data.mjs";
import { readFileSync } from "node:fs";
import {
  CURRENT_MINIPROGRAM_DESCRIPTION,
  CURRENT_MINIPROGRAM_VERSION,
} from "./release-candidate.mjs";

const privacyDeclaration = JSON.parse(readFileSync("docs/wechat-privacy-declaration.json", "utf8"));
const declaredCapabilities = new Set(privacyDeclaration.capabilities.map((item) => item.id));

const lines = [
  "Humi 1.1 微信提交复制卡",
  "",
  "版本信息",
  "- 小程序名称：Humi",
  "- AppID：wx4040b89f3b363416",
  `- 上传版本：${CURRENT_MINIPROGRAM_VERSION}`,
  `- 版本描述：${CURRENT_MINIPROGRAM_DESCRIPTION}`,
  "- H5 域名：https://www.humi-home.com/",
  "- API 域名：https://api.humi-home.com",
  "- 隐私政策：https://www.humi-home.com/privacy.html",
  "- 用户协议：https://www.humi-home.com/terms.html",
  "",
  "一句话介绍",
  "帮家里决定今晚吃什么，并自动整理买菜清单。",
  "",
  "详细介绍",
  detailIntro,
  "",
  "审核备注",
  reviewNote,
  "",
  "测试账号",
  "无需账号，打开即可体验核心功能。",
  "",
  "服务类目建议",
  "- 优先：工具 / 生活工具 / 效率 / 信息管理相关类目。",
  "- 可选：生活服务 / 家庭生活相关类目。",
  "- 避免：医疗健康、营养治疗、食品销售、外卖、社区或 UGC 平台。",
  "",
  "域名核对",
  "- request 合法域名必须包含：https://api.humi-home.com",
  "- web-view 业务域名必须包含：https://www.humi-home.com",
  "",
  "隐私保护指引要点",
  "- 微信身份标识：账号登录、恢复会话、家庭协作。",
  ...(declaredCapabilities.has("nickname_avatar")
    ? ["- 微信昵称和头像：仅在用户主动完善身份时收集，本地或微信头像可能压缩上传 Humi API。"]
    : []),
  "- 手机号：用户主动绑定时用于账号绑定、登录验证、账号找回、家庭协作安全。",
  ...(declaredCapabilities.has("photo_album")
    ? ["- 系统相册：仅在用户主动点击保存海报时写入，不读取已有相册内容。"]
    : []),
  ...(declaredCapabilities.has("subscription_message")
    ? ["- 微信一次性订阅消息：仅在用户确认下次做饭时间后询问；拒绝或取消不创建提醒，也不重复索取。"]
    : []),
  "- 家庭成员数量：根据家庭成员关系调整份量和菜单建议，不要求单独填表。",
  "- 忌口、过敏：作为硬约束避开不合适的菜，用户可填写或跳过。",
  "- 今晚菜单、三餐轻记录、食材清单、买菜认领：保存和同步家庭吃饭安排与采购协作。",
  "- 感觉征集、想吃池子、晚间反馈：形成家庭饭线索并改善后续推荐。",
  "- 使用事件、随机会话标识：统计核心流程、发现故障。",
  "- 不声明：精确位置、通讯录、相册内容、摄像头、麦克风、支付信息、医疗健康数据。",
  `- 平台状态：隐私保护指引${privacyDeclaration.platformDeclarationStatus === "pending" ? "仍待在微信后台填写并留证" : "状态需与结构化申报源复核"}。`,
  "",
  "提交后记录到 docs/humi-1.1-release-evidence-log.md",
  "- 提交时间",
  "- 提交人",
  `- 提交版本：${CURRENT_MINIPROGRAM_VERSION}`,
  "- 审核单状态",
  "- 证据原件私有位置",
];

console.log(lines.join("\n"));

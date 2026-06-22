# Humi 微信小程序 WebView 壳

第一版小程序只承载现有 H5，用来验证“今晚吃什么”这条核心链路。

## 使用方式

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择：`/Users/honglijie/vibe coding/family-menu/miniprogram`。
4. AppID 先用测试号或填写正式小程序 AppID。
5. 预览前确认 `utils/config.js` 里的 H5 地址。

本机已安装微信开发者工具：

```text
/Applications/wechatwebdevtools.app
```

当前 `project.config.json` 仍服务测试 AppID 和本机预览，保留 `urlCheck: false`。正式 AppID 到位后，参考 `docs/miniprogram-release-config-example.md` 切换为 `urlCheck: true`。

## 正式上线前必须确认

- `HUMI_WEB_URL` 使用已备案、可配置业务域名的 HTTPS 地址。
- `HUMI_API_BASE_URL` 对应的 API 域名已配置为 request 合法域名。
- 微信后台已配置 WebView 业务域名。
- 微信业务域名校验文件已放到 H5 站点根目录或 `.well-known/`。
- 隐私政策和用户协议可从 H5 域名直接访问。
- 小程序后台服务类目、隐私保护指引已填写。

当前地址策略：

- 微信开发者工具：`http://127.0.0.1:5173/family-menu/?channel=wechat-miniprogram`
- 微信开发者工具 API：`http://127.0.0.1:8787`
- 真机、预览、正式包：`https://www.humi-home.com/?channel=wechat-miniprogram`
- 真机、预览、正式 API：`https://api.humi-home.com`

正式默认地址：

```text
https://www.humi-home.com/?channel=wechat-miniprogram
```

微信登录是真实上线前必做项。联调微信登录骨架时，启动本地 API：

```bash
HUMI_WECHAT_MOCK=1 npm run api:dev
```

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

本机调试阶段已关闭合法域名校验。正式上传审核前，需要把正式 AppID 和业务域名配置好，再恢复合法域名校验。

## 正式上线前必须确认

- `HUMI_H5_URL` 换成已备案、可配置业务域名的 HTTPS 地址。
- 微信后台已配置 WebView 业务域名。
- 微信业务域名校验文件已放到 H5 站点根目录或 `.well-known/`。
- 隐私政策和用户协议可从 H5 域名直接访问。
- 小程序后台服务类目、隐私保护指引已填写。

当前地址策略：

- 微信开发者工具：`http://127.0.0.1:5173/family-menu/?channel=wechat-miniprogram`
- 真机、预览、正式包：`https://hlj1029.github.io/family-menu/?channel=wechat-miniprogram`

正式默认地址：

```text
https://hlj1029.github.io/family-menu/?channel=wechat-miniprogram
```

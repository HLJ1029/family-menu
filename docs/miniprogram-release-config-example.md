# Humi 小程序正式发布配置示例

正式 AppID 到位后，将 `miniprogram/project.config.json` 调整为以下关键配置：

```json
{
  "setting": {
    "urlCheck": true,
    "uploadWithSourceMap": false
  },
  "appid": "正式小程序 AppID",
  "projectname": "Humi"
}
```

发布前必须先在微信公众平台完成：

- WebView 业务域名：`www.humi-home.com`
- request 合法域名：`api.humi-home.com`
- downloadFile 合法域名：`api.humi-home.com`
- 业务域名校验文件已放入正式 H5 根目录
- 隐私保护指引已按实际能力填写，包括用户主动保存海报时写入系统相册

发布前本地门禁：

```bash
npm run validate:data
npm run build
npm run validate:api
npm run release:check
npm run release:check:online
```

`release:check` 会拦截测试 AppID、`urlCheck: false`、协议占位、缺少微信业务域名校验文件、微信登录未启用等不能提交审核的状态。`release:check:online` 额外检查正式 H5 与 `https://api.humi-home.com/health`。

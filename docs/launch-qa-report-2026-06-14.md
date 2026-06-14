# Humi 上线前 QA 报告

日期：2026-06-14

## 结论

H5 当前构建、核心页面结构和 GitHub Pages 部署通道可用。正式小程序提交审核仍被平台资料阻塞：正式域名、正式 AppID、微信业务域名校验文件、运营主体和联系邮箱尚未填入项目配置与协议页面。

## 已完成检查

- `npm run build` 通过。
- `npm run validate:data` 通过，当前 43 条菜谱、43 个唯一 ID。
- `git diff --check` 通过。
- GitHub Pages 当前线上地址可访问：
  - `https://hlj1029.github.io/family-menu/`
  - `https://hlj1029.github.io/family-menu/privacy.html`
  - `https://hlj1029.github.io/family-menu/terms.html`
- GitHub Pages 最近一次 `Deploy GitHub Pages` workflow 成功。
- 线上构建产物与本地构建产物一致：`index-BFwEm2dO.js`、`index-D14Mc-wM.css`。

## H5 页面验收

- 首页已收敛为状态页：
  - 只显示 `HUMI`、当前状态、主行动按钮、本周/今晚/清单摘要和一条轻量推荐。
  - 不再显示常驻场景选择卡片。
  - 不再显示六宫格工具入口。
  - 不再显示两套完整推荐卡片。
- 移动端底部导航已收敛为：
  - `首页`
  - `计划`
  - `清单`
- 计划页顶部二级入口存在：
  - `本周`
  - `今晚`
  - `营养`
  - `日历`
- `营养视图` 可从计划页进入。
- 清单页可打开，且保留二级入口：
  - `看临期库存`
  - `营养视图`

## 小程序壳检查

- 微信开发者工具已安装并正在运行。
- 微信开发者工具 CLI 服务端口已开启：`http://127.0.0.1:49552`。
- `cli islogin` 通过，当前开发者工具已登录。
- `cli open --project miniprogram` 通过。
- `cli preview --project miniprogram` 通过，测试 AppID 下生成预览包成功，包体约 `1.2 KB`。
- `miniprogram/utils/config.js` 当前配置：
  - 开发者工具：`http://127.0.0.1:5173/family-menu/?channel=wechat-miniprogram`
  - 真机/正式：`https://hlj1029.github.io/family-menu/?channel=wechat-miniprogram`
- `miniprogram/project.config.json` 当前仍是测试 AppID：`wx3acc29804cbb265f`。
- `urlCheck` 当前仍为 `false`，只适合本地调试，不适合正式提交审核。

## 当前阻塞项

- 缺正式 H5 域名。
- 缺正式小程序 AppID。
- 缺微信业务域名校验文件。
- 微信公众平台尚未确认 WebView 业务域名配置。
- `public/privacy.html` 仍有占位：
  - 运营者：`[正式提交前填写]`
  - 联系邮箱：`[正式提交前填写]`
- `public/terms.html` 仍有占位：
  - 运营者：`[正式提交前填写]`
  - 联系邮箱：`[正式提交前填写]`
- Supabase Auth redirect URLs 尚未按正式域名确认。
- 本机 Docker 未运行，无法执行本地 Supabase 容器状态检查。

## 待平台资料到位后执行

- 将 `HUMI_WEB_URL` 替换为正式 HTTPS 域名。
- 将 `project.config.json` 替换为正式小程序 AppID。
- 正式审核前恢复 `urlCheck: true`。
- 放置微信业务域名校验文件到正式域名要求路径。
- 补齐隐私政策和用户协议里的运营者与联系邮箱。
- 在 Supabase 后台确认正式域名 redirect URLs。
- 用真机微信完成 WebView 全链路验收。

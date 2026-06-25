# Humi 上线前 QA 报告

日期：2026-06-14

> 2026-06-25 状态同步：本报告保留为 2026-06-14 的历史 QA 记录。当前正式 AppID 已替换为 `wx4040b89f3b363416`，`urlCheck` 已恢复为 `true`，`https://api.humi-home.com/health` 已返回 HTTP 200，Humi brand UI refresh 已发布，`npm run build`、`npm run release:check` 与 `npm run release:check:online` 均通过。小程序上传版本为 `0.2.3`。

## 结论

H5 当前构建、核心页面结构、GitHub Pages 部署通道和正式域名均可用。正式小程序提交审核仍被平台资料阻塞：正式 AppID、微信业务域名校验文件、API 域名后端、运营主体和联系邮箱尚未完整闭环。

## 已完成检查

- `npm run build` 通过。
- `npm run validate:data` 通过，当前 43 条菜谱、43 个唯一 ID。
- `git diff --check` 通过。
- GitHub Pages 自定义域名当前线上地址可访问：
  - `https://www.humi-home.com/`
  - `https://www.humi-home.com/privacy.html`
  - `https://www.humi-home.com/terms.html`
- GitHub Pages 最近一次 `Deploy GitHub Pages` workflow 成功。
- 正式目标域名：`https://www.humi-home.com/`。
- 当前域名连通性：
  - `https://www.humi-home.com/`：HTTP 200。
  - 静态 JS/CSS 资源：HTTP 200。

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
  - 真机/正式：`https://www.humi-home.com/?channel=wechat-miniprogram`
  - Humi API：`https://api.humi-home.com`
- `miniprogram/project.config.json` 当前仍是测试 AppID：`wx3acc29804cbb265f`。
- `urlCheck` 当前仍为 `false`，用于测试 AppID 和本机预览；正式 AppID 到位后按 `docs/miniprogram-release-config-example.md` 切换为 `true`。

## 2026-06-14 当时阻塞项

- 以下为 2026-06-14 历史阻塞，2026-06-25 已通过正式 AppID、域名、API、隐私政策、用户协议和小程序上传版本 `0.2.3` 闭环；最终仍需在微信后台提交审核并等待平台审核通过。
- 当时缺正式小程序 AppID。
- 当时缺微信业务域名校验文件。
- 当时微信公众平台尚未确认 WebView 业务域名配置。
- 当时微信登录、自有 API 后端和 request 合法域名仍是提交审核前阻塞项。
- 当时 `public/privacy.html` 和 `public/terms.html` 仍需填写运营者与联系邮箱；当前已填写为厦门呼米文化有限公司、`humihome2026@163.com`。
- 本机 Docker 未运行，无法执行本地 Supabase 容器状态检查。
- 已新增 `npm run release:check` 和 `npm run release:check:online`，用于在提交审核前自动拦截上述仓库内可检查的阻塞项。

## 待平台资料到位后执行

- 将 `project.config.json` 替换为正式小程序 AppID，并按发布模板恢复 `urlCheck: true`。
- 放置微信业务域名校验文件到正式域名要求路径。
- 补齐隐私政策和用户协议里的运营者与联系邮箱。
- 部署 `api.humi-home.com`，完成微信 `code2Session` 登录接口并配置 request 合法域名。
- 用真机微信完成 WebView 全链路验收。
- 全部完成后执行：
  - `npm run validate:data`
  - `npm run build`
  - `npm run validate:api`
  - `npm run release:check`
  - `npm run release:check:online`

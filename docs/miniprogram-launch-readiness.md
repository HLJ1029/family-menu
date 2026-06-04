# 食间小程序上线准备清单

## 当前结论

第一版小程序建议采用 `web-view` 承载现有 H5，不先重写原生页面，不先接微信登录。

原因：

- 当前 H5 已经具备首页推荐、家庭画像、推荐反馈、库存、食材清单、营养视图和邮箱登录。
- WebView 壳可以最快进入微信生态验证“今晚吃什么？”是否成立。
- 真机用户反馈回来后，再决定哪些页面值得原生化。

## 版本范围

### 小程序 MVP 做

- 小程序首页打开食间 H5。
- 默认进入首页，不进入登录页。
- 保留游客体验。
- 登录继续使用 H5 邮箱登录。
- 首页、自己挑、一周计划、食材清单、我的家可用。
- 隐私政策、用户协议可访问。

### 小程序 MVP 不做

- 不接微信登录。
- 不做原生菜谱页。
- 不做原生食材清单。
- 不做订阅消息。
- 不做支付、会员、商城。

## 必备材料

- 小程序名称：食间。
- 一句话介绍：帮家里安排晚饭、清单和库存。
- 服务类目：优先选择生活服务、工具、餐饮相关可用类目，最终以微信后台可选项为准。
- 小程序图标：需要 1024x1024，建议沿用食间品牌色与锅/碗/餐桌符号。
- 隐私政策：`https://hlj1029.github.io/family-menu/privacy.html`
- 用户协议：`https://hlj1029.github.io/family-menu/terms.html`
- H5 入口：`https://hlj1029.github.io/family-menu/`

## 域名准备

### 短期测试

可继续用 GitHub Pages 验证 H5 和 PWA，但正式小程序 `web-view` 需要在微信后台配置业务域名，通常建议使用自有 HTTPS 域名。

### 正式建议

准备一个正式域名，例如：

- `shijian.app`
- `shijian.family`
- `eat.shijian.xxx`
- `app.shijian.xxx`

域名要求：

- 已备案或满足小程序后台要求。
- HTTPS 可访问。
- 能放置微信域名校验文件。
- 能稳定代理或部署到现有前端产物。

## 微信后台配置

- 小程序基本信息。
- 服务器域名：
  - request 合法域名：正式 H5 域名、Supabase 项目域名。
  - web-view 业务域名：正式 H5 域名。
  - upload/download 域名如无需求可暂不配。
- 隐私保护指引：
  - 账号信息。
  - 家庭画像。
  - 菜单计划。
  - 购物清单。
  - 厨房库存。
  - 推荐反馈。

## WebView 壳技术方案

目录建议：

```text
miniprogram/
  app.json
  app.js
  app.wxss
  pages/
    index/
      index.json
      index.wxml
      index.wxss
      index.js
```

首页逻辑：

- `pages/index/index.wxml` 放一个全屏 `web-view`。
- `src` 指向正式 H5 地址。
- 后续可用 query 参数区分小程序环境，例如 `?channel=wechat-miniprogram`。

示例：

```xml
<web-view src="{{url}}" />
```

```js
Page({
  data: {
    url: "https://your-domain.com/family-menu/?channel=wechat-miniprogram"
  }
})
```

## H5 需要继续检查

- 微信内置 WebView 下是否能正常登录。
- Supabase 邮箱登录回跳是否回到 H5 地址。
- 底部导航是否被微信胶囊/安全区影响。
- 页面刷新后 session 是否保留。
- 推荐失败时是否有本地 fallback。
- 隐私政策和用户协议链接是否能在小程序内打开。

## 审核风险

- 如果业务域名使用 GitHub Pages，可能不适合正式审核。
- 如果隐私指引没有覆盖家庭画像、库存、推荐反馈，可能需要补充。
- 如果页面出现技术词如 DeepSeek、Supabase、PWA、模型、规则引擎，可能影响用户理解和审核表达。
- 如果邮箱登录跳转链路在小程序 WebView 中不稳定，需要后续改成微信登录或手机号/验证码。

## 后续原生化顺序

如果 WebView MVP 通过验证，建议按以下顺序原生化：

1. 首页推荐。
2. 食材清单。
3. 菜谱详情。
4. 家庭画像。
5. 登录与家庭协作。

## 验收路径

1. 打开小程序。
2. 进入食间首页。
3. 完善家庭画像。
4. 点击帮我安排晚饭。
5. 换一组并选择原因。
6. 点击就吃这组。
7. 查看食材清单。
8. 将某个食材加入库存。
9. 查看营养视图。
10. 返回首页。


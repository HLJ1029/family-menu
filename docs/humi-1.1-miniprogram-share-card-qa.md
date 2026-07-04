# Humi 1.1 小程序分享卡片复核

更新日期：2026-07-04
设备：codex@mbp-m5pro

本文档用于完成提审前最后一个 P1：`crave`、`invite`、`grocery` 三类小程序卡片分享复核。

## 当前证据目录

私有证据目录：

```text
/Users/honglijie/.humi-release-evidence/miniprogram-share-card-preview-20260704T0522
```

已生成：

- `preview-qr.png`：微信开发者工具 CLI 预览二维码。
- `preview-info.json`：CLI preview 包体信息，当前包体 `16113` bytes。
- `auto-preview-info.json`：CLI auto-preview 包体信息，当前包体 `16113` bytes。
- `README.md`：私有证据说明。
- `share-card-qa-checklist.md`：运行 `npm run release:wechat:share:prepare` 后生成的私有核对清单。
- `share-card-expected.json`：运行 `npm run release:wechat:share:prepare` 后生成的三类分享标题、path 和落地 URL 预期数据。

代码层自测：

```bash
npm run release:wechat:share:selftest
```

该命令已覆盖：

- `crave` 卡片标题、path、token 落地 URL。
- `invite` 卡片标题、path、token 落地 URL。
- `grocery` 卡片标题、path、token 落地 URL。

## 还需要的截图

把以下截图保存到私有证据目录。真实姓名、手机号、微信号不要进入仓库。

| 文件名 | 内容 |
| --- | --- |
| `crave-card.png` | `crave` 小程序分享卡片预览截图 |
| `crave-landing.png` | `crave` token 打开后的免登录投票落地页截图 |
| `invite-card.png` | `invite` 小程序分享卡片预览截图 |
| `invite-landing.png` | `invite` token 打开后的加入家庭落地页截图 |
| `grocery-card.png` | `grocery` 小程序分享卡片预览截图 |
| `grocery-landing.png` | `grocery` token 打开后的免登录认领落地页截图 |

## 检查命令

打开私有证据目录和预览二维码：

```bash
npm run release:wechat:share:prepare
```

该命令会先运行 `npm run release:wechat:share:selftest` 的同等逻辑，确认三类分享数据仍然正确，然后在私有证据目录写入 `share-card-qa-checklist.md` 和 `share-card-expected.json`。

先做一次本机 QA 体检：

```bash
npm run release:wechat:share:doctor
```

该命令只读检查微信开发者工具 CLI、小程序项目目录、私有证据目录、当前还缺的截图，以及 macOS 是否处于 `UserIsActive=0`。如果屏幕已锁定，请先解锁 Mac，再运行开发者工具和交互截图命令；否则 CLI 可能返回打开成功，但实际窗口无法被继续操作。

## 打开开发者工具与证据目录

```bash
npm run release:wechat:share:devtools
```

该命令会打开微信开发者工具小程序项目、私有证据目录、预览二维码和核对清单。它不会上传新版本、提交审核或发布，只用于把截图复核需要的窗口一次性打开。

## 三张原生卡片怎么触发

### `crave-card.png` / 今晚征集口味

1. 打开预览二维码进入 Humi 小程序。
2. 进入【我的家】或【今晚】里的“问问大家/今晚征集单”。
3. 选择一个感觉，生成征集单卡片。
4. 点击页面里的分享动作，或点小程序右上角菜单里的转发。
5. 分享预览标题应包含“今晚征集口味，点一下就行”，path 应带 `?crave=` token。

### `invite-card.png` / 邀请家人

1. 打开预览二维码进入 Humi 小程序。
2. 进入【我的家】，找到邀请家人的分享动作。
3. 生成邀请家人卡片。
4. 点击页面里的分享动作，或点小程序右上角菜单里的转发。
5. 分享预览标题应为“某某邀请你加入某个家”的语义，path 应带 `?invite=` token。

### `grocery-card.png` / 买菜清单

1. 打开预览二维码进入 Humi 小程序。
2. 进入【清单】，确保今晚菜单已有待买食材。
3. 点击清单页的买菜分享动作。
4. 点击页面里的分享动作，或点小程序右上角菜单里的转发。
5. 分享预览标题应为“某某发来买菜清单/若干项买菜清单”的语义，path 应带 `?grocery=` token。

自动生成三张 H5 落地页截图：

```bash
npm run release:wechat:share:landings
```

该命令会启动本地 mock Humi API 和本地 H5，创建 `crave`、`invite`、`grocery` 三类真实 token，并自动保存：

- `crave-landing.png`
- `invite-landing.png`
- `grocery-landing.png`

这只能证明 token 打开后的 H5 落地页与免登录/加入流程入口，不替代微信原生分享卡片截图。三张 `*-card.png` 仍需微信开发者工具或真机生成。

辅助保存三张微信原生卡片截图：

```bash
npm run release:wechat:share:cards:capture -- --interactive
```

该命令会打开私有证据目录、预览二维码和核对清单，并逐项等待你把对应分享卡片预览停在屏幕上；按回车后，脚本会启动 macOS 框选截图，用正确文件名保存 PNG。建议只框选分享卡片区域；如果不加 `--interactive`，脚本会保存整屏 PNG。

- `crave-card.png`
- `invite-card.png`
- `grocery-card.png`

因为微信原生分享卡片不在 H5 DOM 内，这一步仍需要开发者工具或真机把卡片实际调出来；脚本负责命名、截图和基础 PNG 校验。

如果三张截图已经通过真机、微信开发者工具另存或 AirDrop 放在某个目录，也可以导入：

```bash
npm run release:wechat:share:cards:import -- --source-dir /path/to/screenshots
```

导入命令会在来源目录中查找 `crave-card.png`、`invite-card.png`、`grocery-card.png`，或包含 `crave/invite/grocery/征集/邀请/清单/买菜` 等关键词的 PNG，并复制成正确文件名到私有证据目录。也可以显式指定三张图：

```bash
npm run release:wechat:share:cards:import -- --crave /path/crave.png --invite /path/invite.png --grocery /path/grocery.png
```

检查截图是否齐全：

```bash
npm run release:wechat:share:evidence
```

通过标准：

- 六个截图文件全部存在、非空且为完整 PNG。
- 分享卡片截图尺寸至少 `240x160` 且不小于 `8 KB`，落地页截图尺寸至少 `320x568` 且不小于 `16 KB`。
- 命令输出每个文件的 size、图片尺寸和 SHA256。
- 截图视觉上符合对应卡片和落地页行为。

视觉确认三张微信原生卡片正确后，运行收口命令：

```bash
npm run release:wechat:share:complete
```

该命令会先重新跑截图证据门禁，然后要求执行人确认三张原生卡片视觉正确；确认后才会勾选 `docs/humi-1.1-pre-review-hardening.md` 中的小程序卡片 P1。非交互环境可在人工视觉确认后使用：

```bash
HUMI_SHARE_CARD_VISUAL_CONFIRMED=1 npm run release:wechat:share:complete
```

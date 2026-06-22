# Humi Monster UI Brief

Device owner: codex@mbp-m5pro
Updated: 2026-06-21

## Direction

Humi 的怪物不是新 logo，而是“晚饭小帮手”角色系统。它只用于陪伴、反馈、空状态、推荐解释和轻量完成感，不替代真实菜品图，也不改变“今晚、计划、清单、我的”等核心信息架构。

当前工程占位选择黄色三眼怪作为默认主角：轮廓清楚、表情亲和、在 48px 下眼睛和嘴巴仍可辨认。后续 Lovart 资产应以同一只角色输出完整状态，不要每个状态换物种。

## Asset Requirements

- 主角：黄色三眼小怪，身体结构、角、手脚和眼睛规则统一。
- 状态：`default`、`happy`、`thinking`、`hungry`、`success`、`error`。
- 道具：`spatula` 锅铲、`basket` 购物篮、`menu` 菜单纸、`fridge` 冰箱贴。
- 尺寸：至少输出 32px、48px、96px、192px 预览；48px 必须清楚可辨。
- 格式：透明背景 PNG/WebP；另给一张米白背景预览图用于 Humi UI 对比。
- 色彩：贴近 Humi 黑色、米白、酸绿底盘；主色建议黄色，辅以蓝色/酸绿；减少彩虹毛发和紫橙粉同时出现。
- 性格：聪明、温暖、可靠，像晚饭小帮手；尖牙和怪兽感要弱化。

## Current UI Hooks

- 首页：推荐主卡里的轻量怪物气泡，说明“我端来这组”或加载换一组。
- 画像页：顶部陪跑角色，依据孩子、忌口、目标切换表情。
- 推荐页：右侧角色提示和“为什么推荐”解释入口。
- 今晚菜单：空菜单状态使用饿了/锅铲状态。
- 清单：空购物篮状态使用 `hungry + basket`。
- 计划：空日期状态使用 `thinking + menu`。
- 库存：空冰箱、未匹配菜谱和过期/临期空状态使用 `fridge` 或 `spatula`。

## Engineering Notes

当前仓库使用 `src/components/ui/HumiMonster.jsx` 的 inline SVG 作为可替换占位。Lovart 资产确认后，可保留组件 API，将 SVG 内部替换为透明 PNG/WebP 映射，避免改动业务页面。

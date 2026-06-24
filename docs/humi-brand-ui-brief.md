# Humi Brand UI Brief

Device owner: codex@mbp-m5pro
Updated: 2026-06-24

## Direction

Humi 是家庭晚饭规划工具，不是儿童 App、游戏、虚拟宠物、怪物角色系统或种子/植物生命体。新的品牌方向是黑白极简生活方式插画 + 真实菜品图 + 高效晚饭决策。

核心问题保持不变：

> 今晚吃什么？

UI 必须优先解决三个工作流：

1. 快速录入家里已有食材。
2. 围绕冰箱库存生成今晚推荐。
3. 给出能真正照着做的菜谱步骤，包括火候、时间和状态判断。

## Visual System

- 背景：正式 UI 使用纯白为主，必要时用极浅灰分隔。
- 主色：黑、白、灰；不使用酸绿作为品牌主视觉。
- CTA：黑色实心圆角按钮。
- 卡片：白底、浅描边、低阴影或无阴影。
- 菜品图：沿用当前真实、温暖、可识别的菜品图风格。
- 插画：使用 Lovart 生成的黑白生活方式人物/场景 PNG，不使用 SVG 风格矢量图。
- 人物：可以每页不同，用于表达页面状态；不是固定主角，也不是 Humi 吉祥物。

## Explicitly Deprecated

- 小怪物、怪兽、Humi Monster。
- 种子、豆芽、植物成长或数字生命体。
- 酸绿色/彩虹色作为界面主视觉。
- 直接生成 SVG 图标感插画。
- 粗糙火柴人、日漫头像、贴纸风、儿童绘本风。

## Asset Map

工程资产位于 `public/assets/brand/`，正式应用只引用轻量 WebP：

- `dinner-planning.webp`：首页/晚饭规划。
- `fridge-inventory.webp`：冰箱库存录入。
- `menu-recommendation.webp`：推荐菜单。
- `shopping-list.webp`：购物清单。
- `cooking-recipe.webp`：菜谱详情/做法。
- `empty-state.webp`：空状态。
- `achievement.webp`：完成反馈。
- `onboarding.webp`：首次设置/画像。
- `family-profile.webp`：家庭口味/个人页。

代码入口为 `src/components/ui/HumiBrandIllustration.jsx`。业务页面只传 `variant`，不要直接写文件路径。

## UI Integration Rules

- 首页：标题和推荐菜品是主信息，插画只做辅助状态表达。
- 库存：突出快速录入、常用食材、即将优先使用。
- 推荐：必须解释已使用库存、需补食材、适合今晚的原因。
- 购物清单：条目要能追溯来自哪道菜。
- 菜谱详情：每步至少包含动作；关键步骤补充火候、时间、视觉判断。
- 空状态：用生活方式插画承接，但 CTA 要直接指向下一步操作。

## Acceptance Criteria

- 放入当前 WebView 后，首屏不再出现怪物、种子或酸绿色。
- 用户能一眼看懂“先看库存，再推荐晚饭”。
- 菜品图仍然是菜谱和推荐的主视觉。
- Lovart 插画只增强温度，不影响菜单效率。
- 关键页面在移动端不出现文字溢出或按钮不可读。

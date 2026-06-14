# Humi 菜品图片规范现状与 Seedream 配置评估报告

> 生成时间：2026-06-07  
> 分析范围：菜品图片规范文档、已生成素材、Seedream API 配置与生成管线

---

## 1. 现有规范文档体系

Humi 项目有两份核心视觉规范文档：

| 文档 | 路径 | 内容 |
|------|------|------|
| **视觉资产生成指南** | `docs/Humi_Visual_Asset_Generation_Guide_V1.md` | 菜品图/海报的生成流程、风格要求、验收 checklist、Codex 交接规范 |
| **海报设计系统** | `docs/Humi_Poster_Design_System_V1.md` | 海报模板系统（Tonight/Weekly/Shopping）、品牌元素、色彩/排版、信息规则 |

规范覆盖完整，包含品牌色（`#D4EB5A`）、背景色（`#F5F4F1`）、角色定位（warm, modern, restrained, family-oriented）等关键定义。

---

## 2. 菜品图片生成管线

```
recipe-image-prompts.json
        ↓
generate-dish-images.mjs  →  调用 Seedream API  →  保存 PNG
        ↓
generate-dish-thumbnails.mjs  →  sips 缩放  →  保存 JPG (512px)
        ↓
manifest.json  +  thumbs/ 目录  →  前端消费
```

### 关键技术参数

| 参数 | 值 |
|------|------|
| **模型** | `doubao-seedream-4-0-250828` |
| **API URL** | `https://ark.cn-beijing.volces.com/api/v3/images/generations` |
| **认证** | `ARK_API_KEY`（通过 `.env.local` 或 `secrets.env` 注入） |
| **输出尺寸** | 1024×1024（API 请求） |
| **输出格式** | PNG |
| **限流保护** | 每张图间隔 1.5 秒 |
| **缩略图** | `sips` 缩放至 512px 宽，JPG 质量 72 |
| **跳过逻辑** | 已存在则 skip |

---

## 3. 菜品图片规范详细要求

### 3.1 风格规范

| 维度 | 要求 |
|------|------|
| **视角** | 45 度俯视角 |
| **构图** | 单道菜居中，一个盘子/碗 |
| **背景** | 暖米白纸感背景（`#F5F4F1`） |
| **画风** | 手绘水彩上色 + 细墨线勾边 |
| **纹理** | 轻微纸张纹理 |
| **阴影** | 柔和 restrained shadow |
| **氛围** | warm, modern, restrained, family-oriented, lightly editorial |
| **参考** | MUJI 克制 + Apple 清晰 + Kinfolk 留白 + 下厨房实用 |

### 3.2 严格禁止项

- ❌ 文字/菜名/UI/标签/按钮
- ❌ 筷子/手/人物
- ❌ 桌布/装饰道具
- ❌ 真实照片质感
- ❌ 3D 渲染感
- ❌ 油腻商业摄影感

### 3.3 输出规格

| 规格 | 要求 |
|------|------|
| 尺寸 | 1024 × 1024 px |
| 格式 | PNG（无水印） |
| 命名 | `recipe-id.png`（kebab-case，与 recipe id 一致） |
| 用途 | 适合方形 App 卡片裁切 |

---

## 4. 现有资产现状

### 4.1 资产清单

| 资产类型 | 目录 | 数量 | 格式 | 说明 |
|----------|------|------|------|------|
| **生产主图** | `dist/assets/dishes/*.png` | **43 张** | PNG | 当前生产管线输出 |
| **缩略图** | `dist/assets/dishes/thumbs/*.jpg` | **43 张** | JPG (512px) | sips 自动缩放 |
| **source-grid** | `dist/recipe-images/source-grid/*.jpg` | **28 张** | JPG (1200×900) | 旧批次，已归档 |
| **recipe-images** | `dist/recipe-images/*.jpg` | **28 张** | JPG (1200×900) | 旧批次，已归档 |
| **海报预览** | `dist/recipe-images/source-grid-preview.jpg` | 1 张 | JPG (1080×800) | 28 张拼图预览 |

### 4.2 尺寸合规性分析

| 维度 | 结果 |
|------|------|
| 生产主图平均尺寸 | ~2710 KB/张 |
| 生产主图总大小 | **113.8 MB** |
| 1:1 正方形比例 | 40/43 张（93%） |
| 非 1:1 比例 | **3 张违规**： |
| | - `steamed-sea-bass.png` 1536×1024（清蒸鲈鱼，长条形鱼） |
| | - `boiled-fish.png` 1254×1254 ✅（水煮鱼也是鱼，但生成了正方形） |
| | - `braised-wuchang-fish.png` 1448×1086（红烧武昌鱼） |
| | - `braised-crucian-carp.png` 1536×1024（红烧鲫鱼） |
| 缩略图平均大小 | ~69.5 KB/张 |

### 4.3 与规范的差异

| 规范项 | 实际状态 | 问题等级 |
|--------|----------|----------|
| 目标尺寸 1024×1024 | 大部分 1254×1254（API 输出被放大） | ⚠️ 轻微 |
| 3 张鱼菜非正方形 | 1536×1024 / 1448×1086 | 🔴 需处理 |
| 文件名与 recipe-id 一致 | ✅ 全部一致 | ✅ |
| 无文字/水印 | ✅ 符合 | ✅ |
| 格式 PNG | ✅ 符合 | ✅ |
| 缩略图 512px | ✅ 全部 512px，但均为正方形裁切 | ⚠️ 长条鱼图裁切可能不完整 |

---

## 5. Seedream 当前配置评估

### 5.1 配置现状

| 组件 | 当前配置 | 状态 |
|------|----------|------|
| **模型** | `doubao-seedream-4-0-250828` | ✅ 最新稳定版 |
| **API 端点** | 火山引擎 ARK（北京 region） | ✅ |
| **认证方式** | Bearer Token (`ARK_API_KEY`) | ✅ |
| **OpenClaw 配置** | 加载了 `volcengine-image-gen` skill | ✅ |
| **生成脚本** | `generate-dish-images.mjs` (Node.js) | ✅ |
| **提示词引擎** | `buildPrompt(recipe)` 函数，注入菜名/食材/口味/分类 | ✅ |

### 5.2 OpenClaw 集成方式

OpenClaw（AI Content Director）通过 `volcengine-image-gen` skill 间接使用 Seedream：

```
OpenClaw (SKILL.md) → generate_image.sh → curl Seedream API → 保存 PNG
```

同时项目自有管线 `generate-dish-images.mjs` 直接调用同一 API。

### 5.3 Seedream Prompt 质量分析

当前 prompt 模板（`buildPrompt` 函数）：

```
生成一张单道中式家常菜插画，用于 Family Menu App 的菜品卡片。
菜名：{name}
主要食材：{ingredients}
口味：{taste}
分类：{category}
视觉风格：
现代 Urban Family Kitchen 风格，米白纸感背景，干净留白，手绘水彩上色，
细墨线勾边，轻微纸张纹理，温暖但克制，适合现代极简 App。
不要传统中餐馆菜单感，不要真实照片质感，不要 3D 渲染感，
不要油腻商业摄影感。
构图要求：
单道菜居中展示，一个盘子或碗，45 度俯视角，统一盘子比例，
柔和阴影，背景干净，适合 1024x1024 App 卡片裁切。
严格禁止：
不要文字，不要菜名，不要 UI 元素，不要标签，不要按钮，
不要筷子，不要手，不要人物，不要桌布，不要水印。
```

**评估**：

| 维度 | 评分 | 说明 |
|------|------|------|
| 结构完整性 | ⭐⭐⭐⭐⭐ | 包含菜名、食材、口味、分类、风格、构图、禁止项 |
| 风格一致性 | ⭐⭐⭐⭐ | 有明确的风格关键词，但缺乏示例参考图（Seedream 支持 image prompt） |
| 负面约束 | ⭐⭐⭐⭐⭐ | 禁止项非常详尽，覆盖了规范要求 |
| 结构化程度 | ⭐⭐⭐⭐ | 段落分明，但可考虑增加 JSON 结构化 prompt |
| 缺少项 | ⭐⭐⭐ | 无图像参考（image prompt）、无 few-shot 示例、未指定 plate 类型 |

---

## 6. 工作流程现状

```
1. recipe-image-prompts.json 定义菜品数据（id, name, ingredients, taste, category）
   ↓
2. generate-dish-images.mjs 读取 prompts，为每道菜生成 prompt
   ↓
3. 调用 Seedream API (doubao-seedream-4-0-250828)
   ↓
4. 下载 PNG 到 dist/assets/dishes/
   ↓
5. generate-dish-thumbnails.mjs 用 sips 生成 512px JPG 缩略图
   ↓
6. manifest.json 记录映射关系
   ↓
7. 前端通过 /assets/dishes/{id}.png 消费
```

### 协作角色分工

| 角色 | 职责 |
|------|------|
| **OpenClaw** | 准备视觉预览，交付至 `AI-HQ/deliverables/openclaw/` |
| **用户（产品 Owner）** | 审核视觉方向，确认后再 production |
| **Codex** | 验证文件，连接数据，测试产品，部署发布 |
| **Claude** | 修改任务代码，创建 Draft PR |

---

## 7. 关键发现与建议

### 🔴 问题

1. **尺寸不一致**：规范要求 1024×1024，但 API 实际输出 1254×1254（3 张鱼菜更长），缩略图强制正方形裁切导致鱼菜可能不完整
2. **鱼菜比例问题**：3 种鱼菜（鲈鱼/武昌鱼/鲫鱼）天然长条形，强制正方形浪费空间且需特殊 crop
3. **无图像参考**：Seedream 支持 image prompt，但当前纯文本 prompt 可能导致风格一致性波动

### 🟡 改进建议

1. **尺寸标准化**：在 `generate-dish-images.mjs` 中添加 post-process resize 到 1024×1024，或对鱼菜使用 `--resampleHeight` 保持宽高比
2. **Prompt 增强**：考虑加入 few-shot 参考描述或 image prompt，提升风格一致性
3. **缩略图策略**：鱼菜缩略图应考虑保持原始宽高比（如 3:2），而非强制正方形
4. **批量生成加速**：当前 1.5 秒限流间隔保守，可测试提高至 0.5-1 秒
5. **旧批次清理**：`dist/recipe-images/` 下的 28 张 1200×900 JPG 为旧批次，建议归档或移除

### 🟢 优势

1. **规范文档完善**：两份 V1 文档覆盖了从风格到交付的全流程
2. **自动化管线**：从 prompts JSON → API → PNG → 缩略图 → manifest 全链路自动化
3. **角色分工清晰**：OpenClaw/Codex/Claude 职责明确，有 review gate
4. **模型配置合理**：Seedream 4.0 版本是合适的选择，API 端点稳定

---

*报告结束*

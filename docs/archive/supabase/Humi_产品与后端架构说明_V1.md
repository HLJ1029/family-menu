# Humi 产品与后端架构说明 V1（历史审计快照）

> **状态（2026-07-19）**：本文保留 2026-06-29 的迁移前诊断，不能再作为当前运行时事实来源。当前正式前端入口、微信身份、家庭状态、AI 推荐/解释和产品事件均只走自建 Humi API；候选构建中没有 `supabase.co`、`@supabase` 或 `VITE_SUPABASE`。仓库里尚未物理删除的 Supabase 孤立源码、依赖、provider 数据和 Secrets，将在身份/家庭迁移稳定后的 Phase 4 清退。当前合同与交付边界以 `docs/humi-api-contract.md`、`docs/superpowers/specs/2026-07-19-humi-wechat-identity-family-collaboration-design.md` 和 `docs/humi-wechat-identity-phase-1-delivery.md` 为准。

> 编写日期：2026-06-29
> 文档目的：保留“彻底自建后端”决策形成时的历史依据。代码现状部分是 2026-06-29 对当时 `main` 分支的逐文件核对，不代表 2026-07-19 候选分支现状。
> 重要：本文档由 Claude 编写为**决策依据**。所涉及的认证、数据库、Edge Function、核心推荐链路改动均属 Claude 受保护区，须由 Codex 通过正式任务实现。

---

## 0. TL;DR（给决策用）

1. **代码现状是"双后端"半迁移态**，不是纯 Supabase 也不是纯自建：
   - 微信用户（生产主路径）→ 自建 Humi API（Node + 单 JSON 文件）
   - 邮箱登录 / **AI 推荐** / 数据埋点 → 仍然连 Supabase
2. **你以为已放弃的 Supabase，其实还托着核心 AI 推荐**。在国内环境 Supabase 不稳时，推荐会**静默降级成本地规则**，DeepSeek 那层智能等于没生效。
3. **上线前的严重问题（已复核修正）**（详见 §5）：
   - ✅ ~~`HUMI_SESSION_SECRET` 空密钥~~ —— **误报，已撤销**。`api/server.js:22-24` 已有守卫：生产缺密钥时服务器直接拒绝启动（fail-closed），不是漏洞。
   - 🔴 自建后端用**单个 JSON 文件**全量读写存所有用户数据 → 并发写覆盖、数据丢失、无法扩容。（唯一真实的严重项）
4. 彻底自建需要把 3 件事迁出 Supabase：AI 推荐、邮箱认证（或弃用）、埋点；并把 JSON 文件存储换成真正的数据库。
5. 文档与代码存在两层不同步（§1.2），现有 Supabase 文档已过时。

---

## 0.5 实施进展（2026-06-29 更新，分支 `claude/humi-backend-hardening`，未提交未推 main）

> 本节为本文档 §6/§7 计划的执行记录。✅=已在本地真实验证；⏳=待你的基础设施/部署。

### 已完成且验证
- **S3 AI 推荐迁出 Supabase（后端）✅ 端到端通过**
  - 新增 `api/recommend.js`：忠实移植 `recommend-meals` 与 `explain-recommendation` 两个 Edge Function，调 DeepSeek。
  - `api/server.js` 新增 `POST /recommend`、`POST /explain` 路由；匿名用户拒绝，登录用户先查缓存，再走尝鲜/付费额度，额度用完返回 402 并提示基础推荐仍可无限使用。
  - 验证：`npm run validate:api` 覆盖匿名拒绝、缓存复用、尝鲜消耗、额度用完后推荐/解释均拒绝、协作公开接口正常。
- **S3 前端开关 ✅ 编译通过**
  - 新增 `src/lib/aiViaHumiApi.js`；`aiRecommendation.js`/`aiExplanation.js` 由 `VITE_HUMI_AI_VIA_API==="1"` 切到自建端点。
  - **默认关 = 不打精准 API，前端回基础推荐**；旧 Supabase AI Edge Function 回退已关闭，避免绕过尝鲜/付费墙。`npm run build` 通过。
- **S2 急性风险（并发写丢数据/文件损坏）✅ 已硬化**
  - `api/store.js`：写入**串行化** + **原子写（临时文件 + rename）**。
  - 验证：50 并发写零丢失、落盘合法 JSON、无残留临时文件 + `npm run validate:api` 通过。
- **env 配置**：`package.json` 的 `api:dev` 改为 `--env-file-if-exists=.env.local`；`.env.example` 补 `DEEPSEEK_*` 与 `VITE_HUMI_AI_VIA_API`。

### 待你的基础设施（我无法在本环境验证/执行）
- ⏳ **生产配 `DEEPSEEK_API_KEY`** 到 `api.humi-home.com`（需你的部署方式：PM2/systemd/Docker/云平台）。
- ⏳ **部署新 API 代码**（`api/recommend.js` + 改过的 `server.js`/`store.js`）到生产。
- ⏳ **S2 完整版（Postgres）**：本环境无 pg/psql/docker/DB，无法真测。待你开通数据库并给 `DATABASE_URL`，再写**可注入 client + 真实联调**的 `HumiPgStore`（同 `HumiStore` 接口，env 选择，默认仍 JSON）。当前急性风险已由原子写缓解，可支撑灰度/首发量级。

### 上线激活顺序（务必按序，否则打断生产）
1. 部署新 API 代码到 `api.humi-home.com`
2. 生产配 `DEEPSEEK_API_KEY`
3. `curl` 生产 `/recommend` 验证 `source:deepseek`
4. 前端设 `VITE_HUMI_AI_VIA_API=1`，重新 build + 部署
5. App 验证推荐正常 → 再清退 Supabase（删 `src/lib/supabase/*`、依赖、过时文档）

---

## 1. 产品概览

### 1.1 产品定位
Humi 是家庭"今晚吃什么"决策工具：游客零门槛进入 → 获取晚餐推荐 → 换一组/反馈 → 确认菜单 → 生成买菜清单 → 跟做菜谱 → 生成分享海报。可选登录后云端保存与同步。

### 1.2 文档↔代码不同步现状
| 文档 | 描述的后端 | 与代码是否一致 |
| --- | --- | --- |
| `docs/supabase-schema.sql` (6-04) | Supabase 关系表 + RLS + families | ❌ 已非生产主路径 |
| `docs/familyos-mvp-roadmap.md` | "Supabase Auth + Postgres" | ❌ 过时 |
| `docs/miniprogram-launch-readiness.md` | 架构图标注 Supabase Edge Function | ⚠️ 部分仍准确（AI 推荐确实还在 Supabase） |
| 本文档 | 2026-06-29 双后端审计 + 自建目标 | 🕘 历史快照；当前基线见页首链接 |

---

## 2. 前端架构

- **技术栈**：React 19 + Vite 7 + Tailwind 3，`lucide-react` 图标。
- **构建/部署**：`vite build` → GitHub Pages（`www.humi-home.com`）。小程序为 `web-view` 壳，加载同一 H5（`?channel=wechat-miniprogram`）。
- **入口**：`src/main.jsx` 是应用根，持有全局状态与三种会话来源。
- **会话三态**（`src/main.jsx`）：
  - 游客：纯 `localStorage`，无账号即可完成核心链路。
  - 微信：`humiSession`（来自自建 API，存 `localStorage` 键 `humi:identity-session:v1`）。
  - 邮箱：`session`（Supabase Auth）。
  - 判定：`signedIn = Boolean(session?.user || humiSession?.user)`。
- **本地兜底推荐**：`src/lib/recommendation/rules.js`（规则引擎，16KB），AI 推荐失败时使用。
- **微信登录桥**：H5 的用户点击通过 `wx.miniProgram.navigateTo` 立即进入原生身份页；只有该显式入口会调用 `wx.login`。原生层换取会话后签发一次性 `humiTicket` 给 H5，H5 兑换完成会立刻清理 URL，长期 access token 不进入地址栏或历史记录。

---

## 3. 后端架构（现状：双后端）

### 3.1 自建 Humi API（生产微信主路径）
- 代码：`api/server.js`(409) + `api/store.js`(113) + `api/session.js`(55) + `api/wechat.js`(42)。
- 部署：`https://api.humi-home.com`（`/health` 返回 200）。
- **端点**：身份与状态端点；Household 创建、切换、邀请与加入端点；感觉、清单、菜单和想吃池协作端点；`/recommend` 与 `/explain`。
- **认证**：自实现 HMAC-SHA256 签名令牌（类 JWT），30 天 TTL，撤销列表存于 JSON 文件。无独立 refresh token（`refreshToken === accessToken`）。
- **存储**：`HumiStore` 读写**单个 JSON 文件**（`.humi-api-data.json`），包含身份、Household、活跃家庭、家庭状态、邀请和协作请求；写入已串行化并使用原子替换。
- **数据模型**：`householdStates[householdId] = App 状态 JSON`；一个用户可属于多个 Household，正式成员共享同一家庭状态。旧 `states[userId]` 仅保留兼容镜像/迁移。

### 3.2 Supabase（仍在承载的 3 件事）
| 用途 | 代码位置 | 状态 |
| --- | --- | --- |
| 邮箱登录 | `src/lib/supabase/family.js` + `CloudAccount.jsx` | 小程序渠道已隐藏为开发用；Web 仍可见 |
| **AI 推荐** | `src/lib/supabase/aiRecommendation.js` 仅保留兼容导出；未启用 `VITE_HUMI_AI_VIA_API=1` 时抛错并回基础推荐 | 不再走 Supabase AI |
| 推荐解释 | `aiExplanation.js` 仅保留兼容导出；未启用自建 API 时回本地说明 | 不再走 Supabase AI |
| 数据埋点 | `appEvents.js` → `app_events` 表 | 仍依赖 |
| 关系型家庭数据 | `menuSync.js` / `grocerySync.js` / `familyPreferences.js` | 仅邮箱路径使用 |

### 3.3 两条路径数据模型对比
| 维度 | 自建（微信） | Supabase（邮箱） |
| --- | --- | --- |
| 存储 | 单 JSON 文件 | Postgres + RLS |
| 模型 | 每 Household 整状态 blob + 协作实体 | 关系表（families/meal_plans/...） |
| 隔离 | 按 householdId + 成员/主厨权限 | 按 family_id + RLS |
| 历史 | 无 | 仅当前周 |
| 协作 | 感觉、邀请、买菜、菜单、想吃池 | family_members（邮箱路径） |

---

## 4. 数据与同步模型

### 4.1 游客 → 登录迁移
游客数据在 `localStorage`；登录后推送到云端（微信走 `saveHumiState`，邮箱走 `migrateLocalMenusToCloud`）。

### 4.2 微信路径同步（生产主路径）
- 登录后 `loadHumiStateEnvelope` 拉取活跃 Household、家庭列表和共享状态；之后对 `humiStateSnapshot` 做防抖 `saveHumiState`（`main.jsx` useEffect）。
- **按 Household 整状态覆盖、最后写入胜出、无字段级多设备合并、无历史版本**。

### 4.3 邮箱路径同步（Supabase）
- `menuSync.js`：删除后重插的"按 slot 整段替换"，**仅当前周**（`getWeekKey`）。
- 同样是最后写入胜出，无冲突解决。

---

## 5. 已发现问题清单（全量 + 严重度 + 归属）

### 🔴 严重 / 上线前必须确认
| # | 问题 | 位置 | 影响 | 归属 |
| --- | --- | --- | --- | --- |
| ~~S1~~ | ✅ **误报已撤销**：生产缺 `HUMI_SESSION_SECRET` 时 `api/server.js:22-24` 直接抛错拒绝启动（fail-closed），非漏洞 | `api/server.js:22-24` | 无（已防住） | 无需处理 |
| S2 | 单 JSON 文件全量读写存全部用户数据 | `api/store.js` | 并发写互相覆盖、数据丢失、不可扩容 | Codex（需换数据库） |
| S3 | 核心 AI 推荐仍依赖 Supabase，国内环境静默降级为本地规则 | `aiRecommendation.js` | "AI 推荐"实际可能未生效 | Codex（迁移到自建） |

### 🟡 中 / 架构债
| # | 问题 | 位置 | 影响 | 归属 |
| --- | --- | --- | --- | --- |
| M1 | 双后端并存，邮箱/微信两套数据模型割裂 | `src/lib/supabase/*` vs `humiApi.js` | 维护复杂、用户跨端体验不一致 | Codex |
| M2 | 无 refresh token，accessToken 即 refreshToken | `api/server.js:213` | 令牌泄露窗口大、无法单独续期 | Codex |
| M3 | 埋点/推荐解释仍在 Supabase | `appEvents.js` / `aiExplanation.js` | 弃用 Supabase 后丢失 | Codex |
| M4 | 架构文档需要随 Household 和协作契约持续更新 | `docs/*` | 过期事实会误导决策 | Codex |

### 🔵 低 / 体验优化（需你确认，非上线阻塞）
| # | 问题 | 位置 | 归属 |
| --- | --- | --- | --- |
| L1 | 清单"今晚菜单/周六"当天重复分区 | `GroceryList.jsx` | 待确认后由 Codex/Claude 任务处理 |
| L2 | 缺 `prefers-reduced-motion` 无障碍降级 | `styles.css` | 低风险快赢 |
| L3 | 抽屉关闭无退场动画 / 搜索筛选硬切 / 清单完成无庆祝 / 首页插画转场 | 多组件 | 动效，需你确认 |
| L4 | 单个 JS chunk 575KB 偏大 | 构建产物 | 可代码分割优化首屏 |

> 注：L1/L3 等 UI 项在本会话早期的"实测"曾因环境工具不可靠而不可信；如要处理需重新可信验证。

---

## 6. 目标架构：彻底自建

```
前端 H5（React/Vite，不变）
  └─→ 自建 Humi API（唯一后端）
        ├── 认证：微信为主，手机号绑定；HMAC 令牌 + 真正的 refresh token
        ├── 数据库：Postgres（自托管/国内云），替换单 JSON 文件
        ├── AI 推荐：自建 /recommend 端点 → 直连 DeepSeek（服务端持密钥）
        │         └── 失败兜底：现有本地 rules.js 保留
        ├── 埋点：自建 /events 端点 → 落库
        └── 推荐解释：自建 /explain 端点 → DeepSeek
  Supabase：完全移除
```

### 数据模型建议
- 短期最小改动：沿用"每用户状态 blob"，但落 Postgres（`states` 表，userId 主键，jsonb），解决 S2 的文件并发问题。
- 中期：将当前 Household 状态 blob 与协作实体迁入关系表（meal_plans / shopping_items / families），提升历史查询和并发能力。

---

## 7. 迁移计划（分阶段，交 Codex 落地）

**阶段 A：上线前必做（堵住严重问题）**
1. ~~强制 `HUMI_SESSION_SECRET`~~ —— 已实现（`api/server.js:22-24`），仅需运维确认生产 env 已设置（否则服务起不来）。
2. JSON 文件存储 → Postgres（以 `household_id` 为主键的 jsonb 状态表，并迁移成员/邀请/协作实体），保留现有 API 契约（修 S2）。**需要数据库连接串和迁移窗口。**

**阶段 B：迁移 AI 推荐（弃用 Supabase 的关键一步）**
3. 自建 `/recommend` 与 `/explain` 端点，服务端直连 DeepSeek（密钥仅在服务端）。
4. 前端把 `recommendMeals`/`explainRecommendation` 从 Supabase Edge Function 切到自建端点；保留 `rules.js` 兜底。
5. 灰度对比：自建推荐 vs 现 Edge Function 结果一致性。

**阶段 C：清退 Supabase**
6. 埋点迁到自建 `/events`。
7. 邮箱登录：决策"弃用"还是"迁到自建"（小程序已隐藏，建议上线后再定）。
8. 删除 `src/lib/supabase/*`、相关依赖与环境变量；更新所有过时文档。

---

## 8. 上线最后阶段的风险与建议

| 决策点 | 建议 |
| --- | --- |
| 阶段 A（S1/S2） | **上线前完成**。认证绕过与数据丢失是发布级阻塞。 |
| 阶段 B（AI 推荐迁移） | **建议上线后立即做**。当前有本地兜底，推荐不会崩；但 DeepSeek 智能未生效，属"能发但打折"。在最后阶段动核心推荐链路风险高，除非你接受灰度。 |
| 阶段 C（清退） | 上线后稳态再做，避免发布期大改。 |
| UI/动效（L1-L4） | 与后端发布解耦，单独小任务处理。 |

---

## 9. 后续工作决策清单（请逐项拍板）

- [ ] **确认生产 `HUMI_SESSION_SECRET` 已正确设置**（最高优先，安全）
- [ ] 批准阶段 A：JSON 文件 → Postgres（Codex 任务）
- [ ] 决定 AI 推荐迁移是"上线前"还是"上线后灰度"
- [ ] 决定邮箱登录"弃用"还是"迁到自建"
- [ ] 批准更新/归档过时的 Supabase 文档
- [ ] UI 优化（L1-L4）是否纳入本次发布

> 以上 Codex 任务由本文档作为输入。每项落地须：独立分支 + worktree + Draft PR + 测试与 secret scan + 风险/回滚说明。

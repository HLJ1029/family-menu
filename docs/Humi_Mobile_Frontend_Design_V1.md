# Humi Mobile Frontend Design V1

## 1. Design Goal

Humi's mobile experience should feel like opening a small family dinner magazine, not a database of recipes.

The first screen should answer:

```text
今晚吃什么？
```

The product should then move the user through one calm loop:

```text
Open Humi
-> sign in or continue as guest
-> get a dinner recommendation
-> change it if needed
-> accept it
-> buy what is missing
```

This design applies to the current H5/PWA, the WeChat mini program WebView, and future native app shells. Platform-specific login capabilities may differ, but the core flow and visual language should stay consistent.

## 2. Design Principles

- Food first: the main recommended dish image should carry the first impression.
- Warm editorial, not utilitarian admin: use large food imagery, strong Chinese titles, restrained metadata, and short human copy.
- Guest-friendly: login improves persistence and family collaboration, but the dinner recommendation loop must work before login.
- Platform-aware identity: domestic mobile entry should prefer WeChat and phone login; email stays hidden as a development entry and future overseas option.
- No technical surface language: do not show model names, backend services, PWA wording, fallback rules, or implementation details to users.

## 3. Navigation Model

Mobile primary navigation uses 3 tabs:

1. 首页
   - Tonight recommendation
   - Change recommendation
   - Accept recommendation
   - Entry points to recipe library, weekly planning, inventory, and stats
2. 清单
   - Grocery checklist
   - Pantry handling
   - Poster/share entry
3. 我的
   - Login state
   - Family profile
   - Cloud sync
   - Policies and account-related settings

Secondary surfaces remain available but should not compete for first-level mobile navigation:

- 自己挑 lives inside 首页 as a secondary entry.
- 一周计划 lives inside 首页 as a planning entry.
- 家中库存 and 统计 live inside 清单 or 我的 as utility entries.
- 菜品详情 stays as a drawer/sheet launched from recommendations, library, or menu items.

## 4. Login Page

The first-run experience should show a dedicated Humi login landing page.

Layout:

- Large food-cover hero at the top.
- Humi signature and the headline `今晚吃什么？`.
- One emotional line: `先把今晚安排好，保存和同步可以之后再说。`
- Primary identity actions:
  - WeChat login.
  - Phone login.
  - Guest mode.
- Email login is not shown to ordinary users. It may be exposed only through a development URL parameter such as `?devAuth=email`.
- Secondary action: `先体验 Humi`.

Behavior:

- First open: show login landing.
- Guest action: enter 首页 and remember the choice locally.
- Successful login: enter 首页 and keep sync/account features available.
- Sign out: keep local guest mode available instead of blocking the app.
- Before WeChat and phone login are implemented: show the two product login buttons with a clear "coming soon" message, and keep guest mode as the usable path.

## 5. Home Recommendation

The 首页 first screen should become a food-cover recommendation.

Structure:

- Top hero uses the first recommended dish image as the primary visual.
- Overlay or adjacent text includes:
  - `今晚吃什么？`
  - recommended group title
  - total cooking time
  - short recommendation status
- Primary button: `帮我安排晚饭` before a recommendation refresh, or `就吃这组` when a recommendation is ready.
- Secondary button: `换一组`.
- Recommendation details are below the hero:
  - 1-2 dish cards
  - why this group
  - missing ingredients
  - links to 自己挑 and 一周计划

The homepage should feel useful within 30 seconds. It should not require reading a long dashboard.

## 6. Rollout Order

1. H5/WebView sample
   - Wire first-run login landing.
   - Move mobile navigation to 3 tabs.
   - Replace the homepage hero with the food-cover recommendation.
2. WeChat mini program readiness
   - Keep WebView launch path.
   - Hide email login by default and expose it only through a development URL parameter.
   - Preserve guest core flow.
3. Native app preparation
   - Reuse the same IA and page hierarchy.
   - Replace platform identity actions with phone/WeChat capabilities when backend support exists.

## 7. Acceptance Criteria

- A new user sees a clear Humi entry page before the product shell.
- The user can skip login and complete recommendation -> accept -> grocery list.
- Mobile primary navigation has 3 items: 首页、清单、我的.
- The homepage first impression is driven by dish imagery.
- The mini program channel does not expose email login, PWA copy, model names, or backend service names.

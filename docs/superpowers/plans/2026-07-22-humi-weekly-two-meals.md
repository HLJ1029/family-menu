# Humi Weekly Two Meals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Humi's dinner recommendation into a durable choose → cook → serve loop that helps an activated household complete two Humi-assisted dinners per week.

**Architecture:** Keep the existing React H5 inside the WeChat mini-program shell and the self-hosted Humi API. Add a shared certified-recipe catalog and deterministic scheduler, persist authenticated meal runs in the existing atomic JSON store, and keep a compatible local-first run for guests/offline use. Native mini-program pages remain the only layer that invokes WeChat share and subscription APIs.

**Tech Stack:** React 19, Vite, Node HTTP API, atomic JSON persistence, WeChat Mini Program APIs, Node `assert` smoke/contract tests.

## Global Constraints

- Dinner only; 30 certified recipes; no runtime AI-generated cooking instructions.
- `planned` is not success; only explicit `completed`/“上桌了” counts.
- All formal household members may execute a meal; only the owner may create/replace the household dinner plan.
- Guest and offline cooking remain usable; server task claiming and reminders require authenticated household membership.
- Feature flag defaults off and falls back to the existing dinner flow.
- No Supabase, streaks, points, leaderboards, forced photos, voice-first flow, marketplace, breakfast/lunch assist, or all-138 coverage.

---

### Task 1: Certified recipe catalog and deterministic timeline

**Files:**
- Create: `data/cook-assist.json`
- Create: `src/lib/mealExecution.js`
- Modify: `src/lib/recipes.js`
- Create: `scripts/check-meal-execution.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `getCertifiedRecipe(id)`, `getCertifiedRecipesForTier(tier)`, `buildMealTimeline(recipeIds, { startedAt })`, `downgradeMealPlan(recipeIds, action)`.
- `cookAssist` contains `status`, `effortTier`, `activeMinutes`, `totalMinutes`, `cookware`, `cleanupLevel`, `steps`, `substitutions`, `downgradeRecipeIds`, and `readyStaple`.

- [x] Write contract tests for exactly 30 certified recipes, unique step IDs, valid dependencies, acyclic graphs, valid resource enums, certified downgrade targets, tier time limits, no overlapping active timeline steps, safe passive overlap, and absolute timer restoration.
- [x] Run `npm run validate:meal-execution` and confirm it fails because the catalog and engine do not exist.
- [x] Add the curated catalog and minimal scheduler/downgrade implementation.
- [x] Re-run `npm run validate:meal-execution` and `npm run validate:data`; confirm both pass.
- [x] Commit the independently testable catalog and engine.

### Task 2: Durable MealRun state machine and API

**Files:**
- Modify: `api/store.js`
- Modify: `api/server.js`
- Modify: `api/wechat.js`
- Create: `scripts/smoke-meal-execution-api.mjs`
- Modify: `package.json`

**Interfaces:**
- `MealRun.status`: `planned | cooking | completed | abandoned`.
- `MealRun.abandonReason`: `too_much_effort | missing_ingredients | plans_changed | cooking_failed`.
- Routes: create/current/start/progress/complete/abandon/feedback, meal tasks create/claim/complete, reminder config/create/delete, and allowlisted product events.

- [x] Write API smoke tests for feature gating, owner-only planning, formal-member execution, guest denial, one-current-dinner uniqueness, legal transitions, idempotency, feedback upsert, task claims, reminder consent storage, event allowlisting, and 180-day event pruning.
- [x] Run `npm run validate:meal-execution-api` and confirm the new routes return 404.
- [x] Extend default storage with `mealRuns`, `mealTasks`, `mealReminders`, and `productEvents`; implement all mutations through `mutateAndSave`.
- [x] Add route handlers and server-side sanitization; build certified snapshots/timelines on the server rather than trusting client instructions.
- [x] Add one-time WeChat subscribe-message delivery with at most one technical retry and cancellation when the target meal is already completed/abandoned.
- [x] Re-run meal execution API smoke plus the existing API/household/identity suites.
- [x] Commit the backend state machine.

### Task 3: Local-first execution controller and API client

**Files:**
- Create: `src/lib/mealRun.js`
- Modify: `src/lib/humiApi.js`
- Modify: `src/lib/validationEvents.js`
- Create: `scripts/check-meal-run-client.mjs`

**Interfaces:**
- Local controller exports `createLocalMealRun`, `transitionLocalMealRun`, `mergeLocalMealRun`, `remainingTimerSeconds`, and `completedMealsInWeek`.
- API client mirrors every backend route and never retries non-idempotent creates without an idempotency key.

- [x] Write failing tests for guest creation, offline progress, background timer restore, legal/illegal transitions, exactly-once completion, login merge, and weekly completion count.
- [x] Implement the minimal local controller and authenticated API wrappers.
- [x] Add privacy-safe event names: `effort_tier_viewed`, `effort_tier_selected`, `plan_presented`, `plan_accepted`, and `reminder_opened`; state transitions remain server-owned.
- [x] Run the client suite and existing identity/migration checks.
- [x] Commit the local-first execution layer.

### Task 4: Tonight effort picker and whole-meal cooking UI

**Files:**
- Create: `src/components/MealExecutionExperience.jsx`
- Modify: `src/components/Dashboard.jsx`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Extend: `scripts/smoke-product-entrypoints.mjs`

**Interfaces:**
- Dashboard receives `mealExecution` state/actions and renders the new experience only when capability is enabled and every planned recipe is certified.
- Existing recommendation/menu/grocery paths remain the fallback.

- [x] Add failing 390×844 browser smoke checks for the three effort tiers, one primary CTA, plan acceptance, start, timeline advancement, background restore, downgrade, abandon, serve confirmation, weekly rhythm, feedback, task suggestion, and reminder choice.
- [x] Add the effort picker and deterministic plan summary to Tonight without changing breakfast/lunch.
- [x] Add a focused cooking view with current/next steps, absolute timers, the three downgrade choices, offline state, and explicit “上桌了”.
- [x] Persist guest runs locally; sync authenticated runs; merge a guest run after login without duplicating completion.
- [x] Add the completion sheet, one-tap feedback, optional family task, and explicit next-cook time selection.
- [x] Run product smoke, collaboration smoke, mobile visual checks, and build.
- [x] Commit the H5 experience.

### Task 5: Native meal task sharing and subscription permission

**Files:**
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/share/index.js`
- Modify: `miniprogram/utils/share-routing.js`
- Create: `miniprogram/pages/reminder/*`
- Modify: `miniprogram/app.json`
- Extend: `scripts/validate-mini-share-runtime.mjs`
- Create: `scripts/check-miniprogram-meal-reminder.mjs`

**Interfaces:**
- Share type `meal_task` deep-links to `mealTask=<token>`.
- H5 navigates to `/pages/reminder/index?scheduledAt=<iso>&effortTier=<tier>`; the native page fetches the server template ID, requests permission only from its user-tap handler, and creates a reminder only after `accept`.

- [x] Write failing native contract tests for task-card routing, no auto-subscribe on load, accepted/rejected/cancelled authorization, authenticated reminder creation, and return-to-H5 behavior.
- [x] Add task share-card handling and authenticated claim deep link.
- [x] Add the native reminder permission page; rejection/cancellation remains silent and does not create a server reminder.
- [x] Run native entry, share, reminder, and package validation suites.
- [x] Commit the mini-program bridge.

### Task 6: Rollout, metrics, release evidence, and regression

**Files:**
- Modify: `.env.example`
- Modify: `docs/humi-api-contract.md`
- Modify: AI-HQ Humi task/status/metrics records within their approved paths.

**Interfaces:**
- `HUMI_MEAL_EXECUTION_ENABLED=0` by default; `HUMI_MEAL_EXECUTION_HOUSEHOLDS` is a comma-separated allowlist or `*`.
- `HUMI_MEAL_REMINDER_TEMPLATE_ID`, `HUMI_MEAL_REMINDER_THING_KEY`, and `HUMI_MEAL_REMINDER_TIME_KEY` configure the one-time template without storing secrets in the repository.

- [x] Document state transitions, permissions, rollout flags, reminder configuration, rollback, and the 2-week 10–20-family validation rubric.
- [x] Run all new checks, existing API/identity/household/entry/product/collaboration checks, `npm run build`, `git diff --check`, Supabase retirement validation, and AI-HQ secret scan.
- [x] Verify the feature-disabled path is byte-for-behavior compatible with the existing Tonight flow.
- [x] Record the local candidate and evidence; do not deploy, submit for review, or enable production rollout without a separate production checkpoint.
- [x] Use `superpowers:finishing-a-development-branch` for branch handoff.

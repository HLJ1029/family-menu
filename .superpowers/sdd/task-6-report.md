# Task 6 Report — Final-Review Household Isolation Corrections

## Status

Completed locally on `codex@mbp-m5pro` from baseline `becfeb0`. No production API, deployment, migration, WeChat action, or publish action was performed. Local preview servers were stopped after browser validation.

## RED evidence

After adding the direct store and API regressions, `npm run validate:household && npm run validate:api` was run. The two commands were then run independently so the first failure could not mask the second.

- `validate:household` failed as expected after removing a formal member and creating a new household. The old implementation migrated `states[userId]` into the new household (`migratedFromUserId` was present); the regression expected `null` state.
- `validate:api` failed as expected on `generic crave claim must return only the collaboration request`, because the previous claim response contained `family`, `households`, and `state` and had created formal membership.

## GREEN validation

The following passed locally after the minimal implementation changes:

- `npm run validate:household`
- `npm run validate:api`
- `npm run validate:identity`
- `npm run build`
- `git diff --check`
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh`

Both local browser-smoke commands also passed against `http://127.0.0.1:4174/`:

- `node scripts/smoke-product-entrypoints.mjs --base-url http://127.0.0.1:4174/ --evidence-dir /tmp/humi-task6-product-smoke`
- `node scripts/smoke-collaboration-landings.mjs --base-url http://127.0.0.1:4174/ --evidence-dir /tmp/humi-task6-collaboration-smoke`

The collaboration landing manifest reported `ok: true`, including guest Crave, grocery, Wish, invite and no-auto-login checks. Build emitted only Vite's existing chunk-size warning.

## Changes

- Generic Crave, grocery and Wish claims now bind the public collaboration record to the authenticated identity without calling `addHouseholdMember`.
- Those three claim routes return only `{ request }`; they do not expose a family envelope or household state.
- H5 participation merging no longer hydrates a family envelope or fabricates a local formal member. It preserves the user’s current household and uses participation terminology.
- Formal membership remains covered through authenticated household-invite acceptance in both direct store and API smoke flows.
- Removing a member, voluntary leave, and sole-owner household deletion now delete the departing user's legacy `states[userId]` snapshot. Regression coverage proves a newly created household has no former menu, meal log, or family profile state.
- The API contract explicitly distinguishes collaboration participation claims from household-invite acceptance, and records the legacy-snapshot retirement behavior.

## Scope and concerns

- The parent-owned `docs/superpowers/plans/2026-07-19-humi-family-living-room.md` was left unstaged and unmodified by this task.
- The additional, non-required `scripts/smoke-collaboration-flow.mjs` currently fails before browser assertions because it creates a collaboration request immediately after login, while the current API correctly requires explicit household creation first. It was not changed because it is outside this Task 6 brief; the two required registered local browser smokes passed.

# Phase 3 Task 4 Correction Report — Public Projection and Exact Action Binding

## Trigger

Independent review returned **NO-GO** on the first Task 4 delivery with two P1 findings:

1. Public collaboration GET/action/join paths reused owner-shaped request projections and exposed route tokens plus household/owner internal identifiers.
2. The browser derived pending `actionId` by matching nickname and business text, which could choose the first of two identical guest actions; some local collections were not constrained by type, token and action ID together.

## RED evidence

The new real API denylist regression first failed under `npm run validate:api`:

```text
AssertionError [ERR_ASSERTION]: public crave GET must use the strict collaboration response projection
+ actual - expected

+ [ '$.request.token', '$.request.householdId' ]
- []
```

The browser lifecycle regression also exposed a consumer dependency while applying the strict projection: owner grocery refresh directly replaced its local request with a public response, dropping its locally-held route token and timing out on `已买 1/1`. The minimal correction preserves the existing owner-local route context while overlaying the strict public fields.

## Correction delivery

- Fix commit: `cdd4ffedd5f11fd7226feb572db3386f09858994` (`fix: isolate Humi collaboration public projections`)
- Previous Task 4 implementation: `109dc7b596fcf2349d2580d1aaf092d2b3c05b71`

### Strict response boundary

- `toPublicCraveRequest`, `toPublicGroceryShareRequest`, and `toPublicWishShareRequest` now omit request `id`, route `token`, `householdId`, `ownerId`, formal `memberId`, ownership fields, and every merge-internal field.
- Authenticated create endpoints now use separate `toOwner*Request` projections, so owner clients retain the token/ID/context required to open and share their own route.
- Public GETs, action responses and generic `/join` responses share the strict projection; generic joins continue to return only `{ request, participant }`, never family/households/state.
- The permanent API smoke recursively deny-lists `token`, `ownerSecret`, `householdId`, `ownerId`, `requestId`, `claimedByUserId`, `mergedFromGuestId`, `participantKey`, formal member IDs, OpenID/union ID/phone variants, and family/state envelopes across all three types.

### Exact browser binding

- Guest action responses now return the exact safe opaque business `actionId` inside the guest participant snapshot. The client stores that direct server value; it no longer searches by display name or business content.
- After authenticated merge, local updates require all of current collaboration type, current route token, and that exact action ID. The scoped guest ID is retained only for the server claim and scoped key deletion, not for local row matching.
- `craveSignals` additionally requires `signal.requestToken === context.token`; `wishPool` is no longer mutated because it lacks the complete type/token/action correlation tuple.
- The browser smoke seeds two same-name, same-content guest entries in one request and proves only the target `actionId` changes while the other normalized local row is unchanged.

## Verification

- `npm run validate:api` — passed; all three public GET/action/join denylist checks and direct guest action IDs pass.
- `npm run validate:collaboration-identity` — passed.
- `npm run validate:household` — passed.
- `npm run validate:identity` — passed.
- `npm run validate:h5-entry` — passed.
- `npm run validate:miniprogram-entry` — passed; expected simulated `domain blocked` diagnostic emitted.
- `npm run validate:miniprogram-poster` — passed.
- `node scripts/smoke-collaboration-flow.mjs` — passed, including the same-content/same-alias non-target preservation and owner refresh regression.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/ --evidence-dir /Users/honglijie/.humi-release-evidence/phase3-task4-correction-browser-20260720` — passed (20 checks).
- `npm run release:product:review` — passed.
- `npm run build` — passed; existing non-blocking Vite chunk warning remains (`index-BnTMwlIy.js`, 861.99 kB).
- `git diff --check` and `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — passed.

## Private evidence

- Manifest: `/Users/honglijie/.humi-release-evidence/phase3-task4-correction-browser-20260720/manifest.json`
- SHA-256: `83b52fba821a7bcc2820739b5e5d3124d98ef00a77c57dd01d390cf196bf1ad7`
- Six mobile screenshots remain private and were not committed.

## Boundaries

No parent checklist, Task 5 history UI/API, production data, deployment, migration, WeChat/provider, or Supabase work was changed.

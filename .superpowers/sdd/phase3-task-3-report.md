# Phase 3 Task 3 Report — Request-Scoped Guest Identity and Zero-Form Landings

## Delivery

- Scope: Crave, Grocery and Wish share landings now create a guest identity only when a guest submits an action. The browser never asks a guest for a name, relationship, or other formal identity.
- Guest storage is request-scoped: `humi:collaboration-guest:${requestType}:${token}`. The helper uses `globalThis.crypto.randomUUID()` when available and a non-identifying random fallback otherwise.
- Signed-in actions send Authorization and only business fields. They do not send a client-selected user ID, display name, avatar, relation, guest ID, `memberName`, or `participantKey`.
- Guest action success uses the server-returned alias (`游客 1` per request), stores `guestParticipantId` in pending bind context, and retains the explicit “identity binding is not household membership” explanation. Signed-in success uses the returned Humi participant snapshot and has no redundant bind/login CTA.
- The existing join endpoint is kept compatible during the Task 3 → Task 4 transition: the new pending `guestParticipantId` is mapped to its current `participantKey` request field only at the legacy join boundary. Task 4 owns the endpoint contract hardening.
- Public Crave/Grocery/Wish GET converters no longer expose `participantKey`. The internal Store records and explicit action response `participant.id` remain available for authorized flow handling.

## RED evidence

The real Playwright landing smoke first failed before implementation:

```text
crave optional details landing must not ask a guest for an identity; found 1 identity input(s)
```

Private RED evidence:

- `/Users/honglijie/.humi-release-evidence/phase3-task3-red-identity-input-20260720/manifest.json`

This was the old optional “怎么称呼你？” input in the Crave details expander. Grocery and Wish had the same pattern.

## GREEN evidence

Final browser evidence:

- Manifest: `/Users/honglijie/.humi-release-evidence/phase3-task3-final-20260720/manifest.json`
- SHA-256: `9e7f4269956bfd799f35e6ab1ad7e9e3697890ea0ecd92f5b34ff54d61f55b86`
- Screenshots: six private mobile captures for guest first/success states, plus invite state in the same directory.

The final landing smoke verifies 18 checks, including:

1. GET/render creates no request-scoped guest key.
2. No Crave, Grocery or Wish action screen exposes identity inputs.
3. Guest submits carry exactly a request-scoped `guestParticipantId` plus business fields, with no formal/client identity fields.
4. Same type/token retry reuses its ID; another token and other request types receive distinct IDs.
5. Each request’s first server alias is `游客 1`.
6. Guest success shows the returned alias and truthful non-membership copy; bind context contains returned `guestParticipantId`.
7. All three signed-in submits carry `Authorization: Bearer …`, omit guest/formal identity fields, display returned `小禾`, and hide the guest bind CTA.
8. No automatic login or household mutation occurs; real household invitation remains the membership transition.

## Privacy regression found during Task 3

The preserved legacy mega-smoke revealed that the Task 2 public request converters had started returning each action’s internal `participantKey`. Anyone with a collaboration share token could therefore read the request-scoped guest ID via GET. Task 3 removes that field from all three public converters and updates API assertions to identify retry actions through public `id`/`createdAt` and canonical event evidence instead. This leaves the server action response’s explicit `participant.id` as the only browser-side guest binding reference.

## Verification

- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/ --evidence-dir /Users/honglijie/.humi-release-evidence/phase3-task3-final-20260720` — passed (18 checks).
- `node scripts/smoke-collaboration-flow.mjs` — passed; existing scenario count preserved and migrated from manual names/global IDs to server aliases/request-scoped IDs.
- `npm run validate:api` — passed.
- `npm run validate:collaboration-identity` — passed.
- `npm run validate:identity` — passed.
- `npm run validate:household` — passed.
- `npm run validate:h5-entry` — passed.
- `npm run validate:miniprogram-entry` — passed; expected simulated `domain blocked` diagnostic emitted.
- `npm run validate:miniprogram-poster` — passed.
- `npm run release:product:review` — passed.
- `npm run release:product:smoke` against the current public URL — not a local pass: its read-only probe timed out waiting for `family-living-room` after 15 seconds. No remote action was taken; this is an online candidate/environment gate and is not used as Task 3 evidence.
- `npm run build` — passed; existing non-blocking 861.51 kB Vite chunk warning remains.
- `git diff --check` — passed.

## Boundaries and deferrals

- Task 4 still owns merge ownership/claim abuse protection and the canonical join contract. Task 3 keeps the existing server join field compatible rather than widening that scope.
- Task 5 still owns household collaboration history API/UI.
- No production data, deployment, migration, WeChat/provider operation, Supabase operation, release upload/review, or publish action was performed.

# Phase 3 Task 1 Report — Canonical Collaboration Event Model

## Delivery

- Implementation commit: `5537dcd3ca5ec1e700684c50697d4caf9410d54a` (`feat: add Humi collaboration participant history`)
- Scope: `api/store.js`, `scripts/check-collaboration-identity.mjs`, `package.json`
- Explicitly excluded: API route wiring, H5/miniprogram UI, production/deployment/WeChat/Supabase operations, and the parent-owned Phase 3 checklist.

## RED evidence

1. Before the Store interface existed, `npm run validate:collaboration-identity` failed with:

   ```text
   TypeError: store.recordCollaborationEvent is not a function
   ```

2. The follow-up regression for a guest acting again after merging failed with:

   ```text
   AssertionError: a merged guest must retain its request-scoped alias
   '小禾' !== '游客 1'
   ```

3. The input-boundary regression failed before the strict type guard with:

   ```text
   AssertionError: Missing expected rejection: event participant types must be explicit
   ```

## GREEN evidence

- `npm run validate:collaboration-identity` — passed.
  - request-scoped sequential aliases and same-action retry idempotency
  - guest aliases remain stable after a merge
  - merge preserves guest ID/action/payload/createdAt, refreshes current user snapshots, and is idempotent
  - uniqueness collision keeps the guest event and removes the duplicate key rather than copying an extra history row
  - newest-first ordering is deterministic when timestamps tie
  - 1–100 limit clamp and formal-household membership check
  - action payload allowlisting and explicit participant-type validation
- `npm run validate:identity` — passed.
- `npm run validate:household` — passed.
- `npm run validate:api` — passed.
- `git diff --check` — passed.
- Targeted secret scan of changed files — passed (no credential/private-key/Supabase service-role markers).

## Risks and follow-up boundaries

- Strict uniqueness means a formal-user event and a guest event can collide during merge. Task 1 resolves this deterministically by retaining the guest event (including its original `id`, payload, and timestamp) and removing the duplicate formal event; it never duplicates history. Task 4 abuse/history tests should exercise the route-level user-facing policy and messaging for that rare sequence.
- Task 1 deliberately trusts only the method input contract for formal participant snapshots. Task 2 must derive that input from a validated server session, never from public request fields.
- Task 1 does not itself decide whether a public request without a formal household should emit a history event. Task 2 must supply authoritative household/request context and avoid exposing events that cannot pass formal membership authorization.

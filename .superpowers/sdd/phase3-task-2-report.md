# Phase 3 Task 2 Report — Record Crave, Grocery and Wish Actions

## Delivery

- Implementation commit: `21e7dbe` (`feat: record collaboration actions with canonical identity`)
- Changed: `api/store.js`, `api/server.js`, `scripts/smoke-humi-api.mjs`, and the existing direct-Store lifecycle caller in `scripts/check-household-lifecycle.mjs`.
- Scope: the public Crave vote, batch Grocery claim, and Wish entry routes only. No client storage/UI, merge route, history endpoint/UI, deployment, production, provider, WeChat, migration, or Supabase operation was performed.

## RED evidence

Before implementation, the real API smoke failed as intended:

```text
AssertionError [ERR_ASSERTION]: guest crave submit should return canonical participant type
+ actual - expected

+ undefined
- 'guest'
```

The failure occurred at `scripts/smoke-humi-api.mjs:527`: the old action response returned only `{ request }`, with no canonical `participant` object and no event recording path.

## GREEN contract evidence

`npm run validate:api` now exercises all three action families against a real local API server:

1. Public GET leaves `collaborationEvents` byte-for-byte unchanged.
2. A guest action without `guestParticipantId` returns a server UUID and request-scoped `游客 1`; both legacy action and canonical event are persisted.
3. Retrying with the returned guest ID preserves the legacy action ID/`createdAt` and canonical event ID/`createdAt`, while updating allowed payload fields.
4. A signed-in action ignores forged guest/user/name/avatar body fields and returns the Store/session-derived `{ type: "user", id, displayName, avatar }` snapshot.
5. Invalid and revoked Bearer tokens return 401 for Crave, Grocery, and Wish; each assertion proves both `collaborationEvents` and the corresponding legacy business-action array remain unchanged.
6. Signed-in and guest generic actions do not create formal household membership; only the pre-existing explicit invite transition does.
7. Grocery history receives the same accepted item IDs as the business claim. The smoke submits `forged-item-id` and proves neither the claim nor event payload records it.

## Trust-boundary decisions

- `addCraveVote`, `addGroceryShareClaim`, and `addWishShareEntry` now accept business input plus a separate trusted participant. The Store rejects missing/invalid participant types; it never derives a formal identity from action body fields.
- Server resolution distinguishes no authorization header (guest) from any supplied Authorization header. The latter goes through `requireAuth`, so malformed, invalid, expired, and revoked credentials cannot silently become guests.
- Canonical events use each internal request `id` and authoritative `householdId`; public share tokens and owner secrets are never placed in event records.
- Legacy `participantKey`, `memberName`, `temporary`, and internal `memberId` are derived from the trusted participant/event snapshot. Public request rendering keeps the existing formal-user-ID privacy behavior; the action response exposes only its explicit canonical `participant` object.
- The existing lifecycle Store test was updated to pass explicit `{ type: "guest", id }` values. No default empty participant or client-body fallback was added.

## Verification

- `npm run validate:collaboration-identity` — passed.
- `npm run validate:api` — passed.
- `npm run validate:identity` — passed.
- `npm run validate:household` — passed.
- `npm run validate:h5-entry` — passed.
- `npm run validate:miniprogram-entry` — passed; expected simulated `domain blocked` diagnostic was emitted.
- `npm run validate:miniprogram-poster` — passed.
- `npm run build` — passed. Existing non-blocking Vite chunk warning remains (`index-4aZSFBVt.js`, 861.94 kB).
- `git diff --check` — passed.
- Targeted changed-file secret scan — passed; no credential/private-key/Supabase service-role markers.

## Deferrals and risks

- Task 3 owns request-scoped guest ID persistence and UI submission wiring; Task 2 only accepts/returns the IDs at the API boundary.
- Task 4 owns merge-route hardening and abuse/history policy; Task 5 owns history API/UI.
- This local mock-backed verification does not authorize true-device WeChat login/profile behavior, release upload/review/publish, or production writes.

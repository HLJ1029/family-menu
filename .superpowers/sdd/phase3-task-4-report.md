# Phase 3 Task 4 Report — Safe Guest-to-User Merge

## Delivery

- Implementation commit: `109dc7b596fcf2349d2580d1aaf092d2b3c05b71` (`fix: secure guest collaboration identity merge`)
- Scope: the three generic collaboration `/join` routes, canonical event merge/claim ownership checks, scoped browser merge state, and their Store/API/browser regressions.
- Explicitly excluded: Task 5 household collaboration history API/UI, parent plan checkboxes, production/deployment, migration, real WeChat/provider, and Supabase work.

## RED evidence

1. Store ownership regression first failed under `npm run validate:collaboration-identity`:

   ```text
   AssertionError [ERR_ASSERTION]: Missing expected rejection: another user must receive a typed conflict when claiming an already merged guest event
   ```

   The previous Store merge silently returned an empty list for a different user rather than rejecting the takeover.

2. Canonical API body regression first failed under `npm run validate:api`:

   ```text
   Error: 400 {"error":"missing_participant_key","message":"缺少临时参与身份，暂时不能绑定这次参与。"}
   ```

   The join handlers still accepted only legacy `participantKey`, not the canonical `{ guestParticipantId }` body.

3. Browser local-history regression first failed under `node scripts/smoke-collaboration-flow.mjs`:

   ```text
   AssertionError [ERR_ASSERTION]: browser merge must use the server-returned Humi display name rather than a local fallback
   '游客 1' !== '主厨'
   ```

   Hydration had removed the internal participant key before the old browser merge could identify the submitted history row.

## GREEN contract

- `guestParticipantId` is now canonical for all Crave, Grocery and Wish joins. The old `participantKey` is an explicit server compatibility alias only.
- Store lookup is exact on request type, internal request ID and guest ID. A cross-request/cross-type/nonexistent guest ID is a typed 404 with no mutation; an already claimed guest returns typed 409 and preserves the original owner/event/action snapshots.
- First merge keeps canonical event and business action IDs, `createdAt`, action type and sanitized payload; it records event `mergedAt`/`mergedFromGuestId` and internal business-action `claimedByUserId`.
- Repeat by the same authenticated user returns the same IDs and original timestamps without duplicate events. Crave/Grocery/Wish all have permanent real-server regression coverage for first merge, repeat, other-user conflict and zero-mutation snapshots.
- Join identity comes only from `requireAuth`; client `memberId`, name, avatar and related identity fields are discarded. Invalid/revoked credentials remain rejected before data writes by the shared auth boundary and existing action regressions.
- Generic collaboration merge never invokes household membership changes and returns only `{ request, participant }`; the participant is server-derived. Merged canonical events stay internal.
- `claimedByUserId` persists only in Store data. Public GET regressions assert it is absent from Crave, Grocery and Wish responses.
- The browser records the safe public action ID at guest submission. After confirmed server success it uses that action ID or still-local scoped guest key to update only the exact pending row to the returned Humi name/avatar, removes participant keys from that local snapshot, and clears only `humi:collaboration-guest:${type}:${token}`. It never bulk-matches all temporary guest rows or falls back to `家人`.

## Verification

- `npm run validate:collaboration-identity` — passed.
- `npm run validate:api` — passed.
- `npm run validate:household` — passed.
- `npm run validate:identity` — passed.
- `npm run validate:h5-entry` — passed.
- `npm run validate:miniprogram-entry` — passed; expected simulated `domain blocked` diagnostic emitted.
- `npm run validate:miniprogram-poster` — passed.
- `node scripts/smoke-collaboration-flow.mjs` — passed, including exact local historical row update, identity-key removal, and scoped key deletion after server confirmation.
- `npm run release:collaboration:smoke -- --base-url http://127.0.0.1:4173/ --evidence-dir /Users/honglijie/.humi-release-evidence/phase3-task4-browser-20260720` — passed (20 checks).
- `npm run release:product:review` — passed.
- `npm run build` — passed. Existing non-blocking Vite chunk warning remains (`index-9-7DSRd_.js`, 862.37 kB).
- `git diff --check` — passed.
- `/Users/honglijie/AI-HQ/scripts/secret-scan.sh` — passed.

## Private browser evidence

- Manifest: `/Users/honglijie/.humi-release-evidence/phase3-task4-browser-20260720/manifest.json`
- SHA-256: `a7432eb576ef97d33901bbabb514b9d3b47776f7fb32c54c0c08ee4842ea69cc`
- Includes six private mobile captures for guest landings and the real invitation boundary. No images were committed.

## Deferrals and risks

- The local contract does not authorize true-device WeChat login/profile behavior, production writes, deployment, upload/review/publish, migration apply/rollback, provider operations, or Supabase retirement.
- Task 5 remains responsible for a formal household collaboration history API/UI. This task intentionally does not expose merge events or household state from generic collaboration joins.

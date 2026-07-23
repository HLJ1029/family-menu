# N1 Batch Review Fix Report

## Scope

This correction addresses only the three N1 Important findings against
`c71ce0b..ca90783`:

1. consume the real bootstrap `activeHouseholdId` field;
2. isolate offline queues and dead letters by authenticated session user;
3. make bootstrap/store/tab access follow the current session owner.

`HUMI_NATIVE_SHELL_CANDIDATE=true` remains unchanged. No Task 16/17 telemetry
work, deployment, upload, review submission, release, or rollout change is
included.

## Root causes

- `getHouseholdId()` read `activeHousehold.id`, while the authenticated API
  contract returns top-level `activeHouseholdId`. Consequently a real online
  response did not write the scoped cache or last-household pointer and boot
  stored an empty household ID.
- Offline queue and dead-letter storage used global keys. `enqueueMutation()`
  persisted the caller's object directly, had no authenticated owner, and
  `flushMutationQueue()` could replay or remove actions after an account switch.
- `appStore` had only generic patching. App lifecycle session changes did not
  atomically clear user-owned bootstrap state, and the native tab guard trusted
  any enabled bootstrap without comparing its user to the active app session.

## RED evidence

Initial focused command:

```sh
npm run validate:native-offline
npm run validate:native-shell-routing
```

Expected failures observed:

```text
Missing expected exception: offline mutations require a trusted authenticated native session
the exact API field must take precedence
actual: 'legacy-household'
expected: 'api-household'
```

The ownership-safe replay contract was then tightened before request changes:

```sh
npm run validate:native-session
```

Expected failure observed:

```text
Missing expected rejection:
an idempotent offline request must not replay after silent login changes the account owner
```

The same-user reusable-state contract also failed before the store correction:

```text
same-user refresh must clear a bootstrap without a valid state version
actual: bootstrap envelope
expected: null
```

## GREEN implementation

- `getHouseholdId()` now gives an explicitly present `activeHouseholdId`
  precedence, including the meaningful empty-string case, while retaining the
  old object/current-household fallback only when the API field is absent.
- Routing contracts now use the exact API envelope. They cover online scoped
  cache + pointer writes, offline recovery from that shape, and boot storage of
  `currentHouseholdId`.
- Queue and dead-letter keys are user-namespaced. Enqueue requires a valid
  native session, overwrites any caller-supplied owner with the trusted session
  user, and rejects arbitrary top-level fields before persisting an allowlisted
  projection.
- Flush captures one owner, reads only that owner's queue, validates every
  action owner before replay, and rechecks the session before deletion or
  dead-letter movement. Account/owner changes return stable
  `{ status: "skipped", reason: "ownership_changed|ownership_mismatch" }`
  outcomes without deleting account A's queue.
- Authenticated request replay accepts an internal expected owner. A silent
  login that returns another user updates the app session/store but stops before
  replaying the queued mutation.
- `appStore.replaceSession`, `resetSessionState`, and `replaceBootstrap` provide
  session-aware atomic state updates. User changes and logout clear bootstrap,
  current household, and offline status. Same-user refresh retains only a
  schema-v1 bootstrap with a state version owned by that user.
- App launch/set/clear synchronize global session and appStore. The shared
  native-tab guard requires a non-empty session user equal to
  `bootstrap.user.id`; missing or mismatched ownership returns to boot.

Focused GREEN command:

```sh
npm run validate:native-session &&
npm run validate:native-offline &&
npm run validate:native-shell-routing &&
npm run validate:miniprogram-entry
```

All four commands exited `0`.

## Explicitly out of scope

- The known UTC `dateKey` Minor is recorded and unchanged.
- The external `qlogo`/WeChat download-domain release gate is recorded and
  unchanged.
- No native-candidate package flag correction was made because
  `HUMI_NATIVE_SHELL_CANDIDATE=true` is the approved N1 package contract.

## Fresh final gate

Fresh command:

```sh
npm run validate:native-offline &&
npm run validate:native-session &&
npm run validate:native-shell-routing &&
npm run validate:miniprogram-entry &&
npm run validate:identity &&
npm run validate:household &&
npm run validate:native-bootstrap-api &&
npm run validate:api &&
npm run validate:share-bridge &&
npm run validate:supabase-retirement &&
npm run build
```

All commands exited `0` with:

```text
Native offline, cache, telemetry, and store foundation contract passed.
Native session foundation contract passed.
Native shell routing checks passed.
Mini-program entrypoint resilience checks passed.
Identity store checks passed.
Identity runtime checks passed.
Household lifecycle checks passed.
Native bootstrap API contract passed.
Humi API smoke test passed.
Mini-program share runtime validation passed.
Supabase retirement gate selftest passed.
Supabase retirement gate passed.
✓ built in 1.25s
```

The build retains the pre-existing informational large-chunk warning.

Final safety command:

```sh
/Users/honglijie/AI-HQ/scripts/secret-scan.sh && git diff --check
```

It exited `0` with `Secret scan passed.` and no diff-check output.

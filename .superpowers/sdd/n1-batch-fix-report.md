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

## Final privacy-schema remediation

### RED

The final batch reviewer found that the first top-level allowlist was shared by
all action types. A `product_event` could therefore pass
`isSafeTelemetryEvent(event, fields)` while separately persisting attacker
controlled `data`, `path`, `method`, and meal-mutation fields.

After adding the exact reviewer regression, this command failed:

```sh
npm run validate:native-offline
```

Observed failure:

```text
Missing expected exception:
product events must reject caller-controlled data, path, method, and meal mutation fields
```

The malicious action carried nickname/token/note data, a URL query containing a
token, `DELETE`, and `mealRunId`; the pre-fix queue accepted it.

An additional API-drift contract initially failed because the client product
event allowlist was not exported for comparison:

```text
TypeError: undefined is not iterable
```

### Correction

- Replaced the shared action-field set with one schema per allowed action type.
  `product_event` accepts only `id`, `type`, `householdId`, `createdAt`,
  `event`, `fields`, and the trusted internal `ownerUserId`. Caller-controlled
  `data`, `path`, `method`, idempotency fields, and meal fields are rejected
  before any storage write.
- Meal and grocery actions retain only their own required fields. Replay paths
  and HTTP methods are derived from action type and identifiers rather than
  persisted caller-controlled routing.
- Product-event replay is fixed to `POST /product-events`. Its idempotency key
  is the trusted action ID, its expected owner remains enforced, and its body is
  projected only from the already strict `event`/`fields` pair into the
  existing API fields `eventType`, `mealRunId`, `recommendationId`, and
  `effortTier`.
- The five product-event types exactly match
  `api/store.js#sanitizeProductEventType`; the offline contract dynamically
  compares both allowlists to prevent drift. This reuses the existing API event
  contract and does not implement Task 17 observability storage or rollout.
- Regression coverage proves the malicious event leaves storage untouched,
  legal replay has the fixed endpoint/method/body, and every allowed action
  rejects fields outside its own schema. Existing A/B isolation, UTF-8 bounds,
  ordered replay, conflict stop, and dead-letter behavior remain covered.

### GREEN and fresh final gate

Fresh command:

```sh
npm run validate:native-offline &&
npm run validate:native-session &&
npm run validate:native-shell-routing &&
npm run validate:miniprogram-entry &&
npm run validate:share-bridge &&
npm run release:candidate:privacy:check &&
npm run validate:identity &&
npm run validate:api &&
npm run validate:supabase-retirement &&
npm run build
```

Every command exited `0`. The candidate privacy check returned `ok: true` with
zero findings; build completed in `1.22s` with only the unchanged informational
large-chunk warning.

Final safety command:

```sh
/Users/honglijie/AI-HQ/scripts/secret-scan.sh && git diff --check
```

It exited `0` with `Secret scan passed.` and no diff-check output.

# Humi N4/N5 immutable local command matrix

The authoritative local release matrix runs 41 commands one at a time in the
fixed Humi worktree. The runner uses process argv with shell execution disabled,
waits for each child before starting the next one, and refuses to start unless
the Git worktree is clean. It never uploads, deploys, submits for review,
publishes, changes a flag or allowlist, writes AI-HQ, or mutates production data.

## Run the matrix

From a clean candidate commit in this repository:

```bash
npm run release:local-matrix
```

The default run deliberately has three external-evidence stops:

- `validate:startup-performance` is a blocker until bound device evidence is
  supplied, even though its local contract command exits zero;
- `validate:true-device-evidence` is an explicit blocker at the current `0/56`
  state and is never recorded as a pass without an evidence directory;
- local and historical-handoff rollout checks classify a non-zero result as a
  blocker. At the current `1.1.75` state they stop on the missing immutable
  archive/upload receipt, while the external form still verifies the historical
  `1.1.74@4eb3fbeb6aba886930b3fda652be96e9246eac9e` archive read-only.

Therefore the current complete run is expected to exit non-zero with overall
result `blocked`, not `passed`. A normal local test failure, timeout, spawn
failure, or repository mutation produces overall result `failed`.

After authorized, complete N5c evidence exists, bind it to the full candidate
commit:

```bash
npm run release:local-matrix -- \
  --true-device-evidence-dir /absolute/private/humi-true-device-evidence \
  --candidate-commit 0123456789abcdef0123456789abcdef01234567
```

The evidence directory and commit must be supplied together. Supplying evidence
does not authorize or execute any platform action.

## Command order

The runner records this exact order before command 1 starts:

1. `validate:data`
2. `validate:identity`
3. `validate:household`
4. `validate:collaboration-identity`
5. `validate:api`
6. `validate:meal-execution`
7. `validate:meal-run-client`
8. `validate:meal-execution-api`
9. `validate:meal-execution-ui`
10. `validate:recommendation`
11. `validate:native-bootstrap-api`
12. `validate:native-session`
13. `validate:native-offline`
14. `validate:native-shell-routing`
15. `validate:native-recommendation`
16. `validate:native-tonight`
17. `validate:native-cooking`
18. `validate:native-primary-tabs`
19. `validate:native-sharing`
20. `validate:native-observability`
21. `validate:share-bridge`
22. `validate:miniprogram-entry`
23. `validate:h5-entry`
24. `validate:miniprogram-poster`
25. `validate:miniprogram-meal-reminder`
26. `validate:startup-performance`
27. `smoke:native-shell-ui`
28. `release:product:review`
29. `release:product:smoke`
30. `release:collaboration:smoke`
31. `validate:supabase-retirement`
32. `release:candidate:privacy:check`
33. `release:wechat:privacy:check`
34. `release:security:audit`
35. `validate:true-device-evidence:selftest`
36. `validate:true-device-evidence`
37. `build`
38. `release:native-shell:check:local`
39. `release:native-shell:check` with the read-only historical AI-HQ handoff
40. `git diff --check`
41. the AI-HQ secret scan with this worktree as `HUMI_REPO`

This retains every Task 18 command in its original relative order and adds the
current privacy, dependency-security, true-device selftest/actual gate, and
local rollout checks. `validate:startup-performance` includes its current report
selftest. Product and collaboration smokes inherit a private artifact root under
the matrix run; they remain fixture-backed/read-only.

## Evidence and overwrite policy

Each run creates a mode-`0700` directory below
`~/.humi-release-evidence/HUMI-2026-001/local-command-matrix`. The run name binds
UTC start time and starting HEAD. Existing run directories are never reused or
overwritten. Logs and manifests are mode `0600`; product smoke artifacts remain
outside Git in the same private run.

`manifest.json` is written atomically at run start, when each command starts,
and after every command finishes. It records starting/final HEAD and tree,
cleanliness digests, candidate/runtime identities, Node/npm versions, ordered
argv identities, timestamps, durations, exit code/signal/timeout, relative log
paths, sanitized-log byte counts and SHA-256 values, classifications, aggregate
counts, and repository-change observations. Private evidence paths and sensitive
output are redacted; argv/environment identities additionally have SHA-256
digests without persisting private values.

The handoff must reference a private manifest only after a full run has overall
result `passed`. A blocked or failed run belongs in the implementation report,
not in the release handoff. Never add the private run or its logs to Git.

## Verify hashes

Verify the canonical manifest hash, the actual manifest file sidecar, every log
byte count, and every log SHA-256 in one command:

```bash
npm run release:local-matrix:verify -- \
  /absolute/private/local-command-matrix/<run>/manifest.json
```

The recorded `integrity.manifestSha256` is the SHA-256 of the pretty JSON with
the top-level `integrity` member omitted; this makes the in-manifest digest
non-self-referential and reproducible. `manifest.sha256` separately contains the
ordinary SHA-256 of the final `manifest.json` file. The verifier checks both.

For an independent file-level comparison:

```bash
cd /absolute/private/local-command-matrix/<run>
shasum -a 256 -c manifest.sha256
```

## Runner-only tests

The selftest and short smoke use repositories and evidence roots created under
the operating-system temporary directory:

```bash
npm run release:local-matrix:selftest
npm run release:local-matrix:smoke
```

Test repository paths, evidence roots, command files, and run IDs require both
`NODE_ENV=test` and `HUMI_LOCAL_MATRIX_TEST_MODE=1`, and every path is resolved
through `realpath` before it is accepted under the system temporary directory.
The command file is not argv: it is a small allowlisted fixture-action DSL that
the runner compiles to one fixed repository helper. Arbitrary executables,
arguments, paths, environment values, symlink escapes, and unknown actions are
refused before a run directory is created. The fixed helper independently
canonicalizes its repository and private evidence roots under the system
temporary directory, requires a controlled Git repository, rejects overlapping
or symlink-escaped roots, and constrains every write to a checked child path.
These options are unavailable in normal operator runs and cannot replace the
authoritative matrix.

After each command, controlled artifacts are scanned in deterministic order.
Unsafe symlinks and oversized text are removed and recorded with path-free error
codes, while the scan continues through later readable text so secrets are still
redacted. Any collected artifact error makes that command fail only after the
full scan, without preventing the remaining matrix commands from running.

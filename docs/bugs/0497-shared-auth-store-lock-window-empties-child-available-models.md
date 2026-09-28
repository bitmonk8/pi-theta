# Bug 0497 — real-child tests flake intermittently with `subagent model pre-flight mismatch … '(unresolved: no matching model)'`: spawned children inherit the operator's shared `~/.pi/agent`, and a child whose startup loses the auth.json lock race silently loads an EMPTY credential store, dropping the marshalled model's provider out of `getAvailable()`

- **Status:** open
- **Owning repo:** split. The recurring TEST flake is owned by the
  pi-theta test harness (hermetic per-run agent dir for the offline
  real-child tests — proven below). The underlying windows are owned by
  the pi host (lock held across the OAuth refresh network round-trip;
  silent empty-store degradation on lock timeout; in-place non-atomic
  writes) — to be filed/pinned upstream.
- **Sev/Diff estimate:** S3/D2 — S3: no pi-theta runtime defect (the
  PIC-62 pre-flight correctly refuses a child whose registry genuinely
  cannot resolve the marshalled model; the INPUT is what degrades). Cost
  is real: an intermittent full-suite red that mimics a regression of
  whatever diff is under review — it burned triage in the 0483 verify
  round, the 0493 fix round (1 of 4 full runs, 1 of 3 solo), and a
  ql-tune2 quality-loop run — plus a rare PRODUCTION exposure: any real
  subagent child spawning while another pi process on the box holds the
  auth.json lock can refuse spuriously the same way. D2: the harness fix
  is an env pin plus a fixture auth file in the shared helpers; the
  upstream fixes are separate small patches.
- **Where:**
  - `src/extension/subagent-spawn-regime.ts:963–966` — the child-side
    drive reads `const model = ctx.model` and runs
    `#confirmChildModelOrRefuse` (`:1129`); `:1150–1168` — the marshalled
    reference is re-resolved via
    `matchAvailableModel(qualified, this.#input.modelRegistry.getAvailable())`
    and total non-resolution surfaces as the
    `"(unresolved: no matching model)"` marker; the mismatch message
    template is `src/runtime/subagent-model-guard.ts:74`.
  - `tests/helpers/real-subagent-spawn.ts:32–33` — every offline
    real-child witness marshals `anthropic/claude-fable-5` (a REAL
    built-in anthropic model in the pinned pi 0.80.10 registry — chosen
    as never-contacted, not fictitious); `:86` —
    `parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: … }`:
    the child pins executable and extension identity but INHERITS the
    operator's `PI_CODING_AGENT_DIR`-default `~/.pi/agent` — models.json,
    auth.json, and the auth.json lock domain shared with every other pi
    process on the machine.
  - pi 0.80.10 (repo devDependency, what the children run)
    `dist/core/auth-storage.js`: `:30–52` — `acquireLockSyncWithRetry`,
    10 attempts × 20 ms synchronous busy-wait ≈ **200 ms total budget**;
    `:143` + `:169–181` — `AuthStorage` constructs with `data = {}` and
    `reload()` swallows EVERY error (`catch { /* preserve last valid
    snapshot */ }` — at construction there is no last valid snapshot, so
    the store silently stays EMPTY for the process lifetime; nothing
    re-reads the file later on the read path); `:62`/`:104` — writes are
    in-place `writeFileSync` (no temp+rename); `:86–97` — the async
    writer path retries ~43 s and sets `stale: 30000`, while the sync
    reader path inherits proper-lockfile's 10 s default staleness.
  - pi-ai vendored with pi 0.80.10, `dist/models.js:124–138`
    (`resolveRefreshCredential`): the OAuth token-refresh **network call
    runs INSIDE `credentials.modify`**, i.e. inside `withLockAsync` while
    the auth.json lock is held — the lock is held for the full HTTP
    round-trip. The operator's global install (0.87.1, what concurrent
    interactive/quality-loop sessions run) has the identical pattern
    (`models.js:199–202`) over the SAME `~/.pi/agent/auth.json`.
  - pi 0.80.10 `dist/core/model-runtime.js:142–164`
    (`runAvailabilityRefresh`): `configuredProviders` = providers whose
    `checkAuth` answers, and `checkAuth` → `readCredential` →
    `credentials.read` → **`AuthStorage.data`** (the once-loaded
    in-memory snapshot); `:134–141` — `available` = all models filtered
    to `configuredProviders`. Auth state IS model availability.

## Observed (2026-09-27/28, three independent rounds)

All in offline (default `npm test`) real-child-process tests; children
are query-free by design, so no tokens are involved:

- 0493 fix round: `tests/subagent-return-depth-refusal.test.ts` failed
  1 of 4 full `npm test` runs and 1 of 3 solo runs; the orchestrator
  suspected concurrent sessions rewriting the shared
  `~/.pi/agent/auth.json`.
- Branch ql-tune2: the same file failed a full-suite run under
  concurrent `/quality-loop` load, then passed 13/13 solo.
- 0483 verify/review: "subagent model pre-flight mismatch" seen in
  real-child-process tests under full-suite load; each file green in
  isolation.
- 0493 round-1 reviewer: could NOT reproduce (13/13 full and isolated)
  and confirmed no diff path reaches the child's model resolution — the
  cause is environmental, not the diff under review.

Field signature (byte-identical to the reproduction below):

```
subagent model pre-flight mismatch: expected 'anthropic/claude-fable-5',
child resolved '(unresolved: no matching model)'
cause: subagent_model_preflight_mismatch, exit {code: 0}, diagnostics []
```

## Mechanism

1. A real-child test spawns the repo-pinned pi 0.80.10 with
   `--provider anthropic --model claude-fable-5`, inheriting the
   operator's real agent dir. The session model resolves fine
   (`resolveCliModel` reads `getModels()`, which is auth-INDEPENDENT),
   so `ctx.model` = `anthropic/claude-fable-5`.
2. At child startup `ModelRuntime.create` builds `AuthStorage`, whose
   constructor `reload()` takes the auth.json lock via a **synchronous**
   acquire with a ~200 ms total retry budget. If any other pi process
   holds the lock past that budget, `reload()` throws, the catch
   swallows it, and the child runs with an **empty credential store —
   silently** (no diagnostic, no stderr).
3. The availability refresh then computes `configuredProviders` from
   `checkAuth` over that empty store. On this box anthropic is
   authenticated ONLY via a stored OAuth credential (no
   `ANTHROPIC_API_KEY` in env), so anthropic drops out and every
   anthropic model leaves `getAvailable()`.
4. pi-theta's PIC-62 child-side pre-flight re-resolves the marshalled
   `anthropic/claude-fable-5` against `getAvailable()` — zero matches —
   so it correctly refuses with
   `expected 'anthropic/claude-fable-5', child resolved '(unresolved: no
   matching model)'`, envelope `Err`, child exits 0. The test's row
   assertions then fail on the unexpected error shape.

What can hold the lock past 200 ms, ranked:

- **H1 — an OAuth refresh in ANY concurrent pi session (strongest;
  capable-confirmed).** `oauth.refresh` runs inside `credentials.modify`
  → the lock is held for the token HTTP round-trip (hundreds of ms to
  seconds). Concurrent `/quality-loop` lanes and interactive sessions
  drive anthropic via OAuth, refreshing regularly. Every field failure
  coincided with concurrent pi load; solo runs rarely land in a refresh
  window. This confirms-and-refines the 0493 orchestrator's suspicion:
  it is not torn bytes (reader and writer both lock) but a lock-timeout
  silently degraded to an empty store.
- **H2 — stale-lock poisoning after a hard-killed pi process.**
  proper-lockfile releases via exit hooks that do not run on SIGKILL;
  watchdog/reap kills are routine in these very tests. A lock dir left
  by a dead holder stalls every starting child for up to the ~10 s sync
  staleness window — one kill can fail a burst of subsequent spawns.
  Plausible amplifier; not directly witnessed.
- **H3 — reader-reader startup bursts.** `reload()` itself takes the
  exclusive lock, so N simultaneously-starting pi processes (grandchild
  chains; parallel suite workers; quality-loop `pi -p` parents) contend
  even with zero writers; Windows mkdir-lock latency plus AV scanning
  can stretch each hold. Weakest alone; adds to H1/H2 under load.
- **Ruled out:** torn/partial auth.json reads through `reload()` (both
  sides lock — only the exported `readStoredCredential` reads unlocked,
  and it is not on this path); any pi-theta diff path (0493 reviewer
  verified none reaches child model resolution); a real model-identity
  skew (expected and marshalled refs agree; the resolved side is the
  total-non-resolution marker).

## Reproduction (2026-09-28, this filing; fully isolated from the operator's agent dir)

Mechanism level — a resolver probe over pi 0.80.10 (`ModelRuntime.create`
+ the exact pre-flight match): with the real agent dir,
`available = {anthropic: 18, openrouter: 507, unity-completions: 56,
unity-responses: 56}` and `anthropic/claude-fable-5` matches; with
`authPath` pointed at an empty `{}` store (what a swallowed lock-timeout
yields), anthropic vanishes from `available` and the same match returns
**0 matches → unresolved** — while `resolveCliModel` still resolves the
session model, exactly the split the pre-flight then refuses.

End-to-end — scratch agent dir (`PI_CODING_AGENT_DIR` → temp) seeded with
a FAKE anthropic OAuth credential (children are query-free; nothing is
contacted):

- Baseline: `npx vitest run tests/subagent-return-depth-refusal.test.ts`
  → **13/13 pass** (55.7 s). The scratch dir alone is sufficient for
  green — the tests need no operator credentials.
- Lock held (a live holder process keeping proper-lockfile's mtime
  fresh on the scratch `auth.json`, mimicking an in-flight refresh):
  same command → **1 failed | 12 passed**; every real-child row settled
  `subagent model pre-flight mismatch: expected
  'anthropic/claude-fable-5', child resolved '(unresolved: no matching
  model)'`, `cause: subagent_model_preflight_mismatch`, child exit 0,
  `diagnostics []` — byte-identical to the field signature.

Blast radius: ≥11 offline test files spawn real pi children through the
same helper/consts (`subagent-return-depth-refusal`,
`subagent-child-real-spawn`, `b0488-real-spawn-respond-argv`,
`b0337`/`b0342` enum chains, `inbound-boundary-theta-callable`,
`inbound-union-arm-dispatch`, `invoke-prompt-cell-enum-return`,
`subagent-envelope-result-carriage`, `subagent-invoke-inbound-enum-tag`,
`subagent-invoke-nonfinite-return-refusal`) — any of them can flake this
way; the depth-refusal file is simply the widest window (8 sequential
child spawns over ~50 s).

## Fix direction

1. **pi-theta harness (this repo — recommended, proven).** Make the
   offline real-child helpers hermetic: per-run scratch agent dir via
   `PI_CODING_AGENT_DIR` in the child `parentEnv`
   (`tests/helpers/real-subagent-spawn.ts`, both launch entry points),
   seeded with a fake anthropic OAuth credential so
   `anthropic/claude-fable-5` is available from the built-in registry.
   This is exactly the reproduction baseline (13/13 green) and removes
   the shared-lock coupling, the dependence on the operator's real auth
   state, and the cross-session interference entirely. It is the agent
   dir joining the existing child-pin set (AGENTS.md
   `#subagent-child-pins`: executable, extension identity — config and
   credentials are a third ambient input the same argument applies to).
   The LIVE suites (H8a/H9a/hardening) must keep the real agent dir —
   they need real credentials — so they retain the (much rarer) exposure
   until the upstream fixes land.
2. **pi host (upstream).** Three independent hardenings, any one of
   which removes or shrinks the window: (a) do not hold the credential
   store lock across the OAuth refresh network call — refresh outside,
   compare-and-swap inside; (b) make `AuthStorage.reload()`'s
   construction-time lock timeout loud (or retry beyond 200 ms) instead
   of silently continuing with `{}` — an empty store that used to be
   non-empty is a state worth a diagnostic anywhere, and it currently
   propagates as far as a subagent pre-flight refusal with no hint of
   the cause; (c) write auth.json via temp+rename so the unlocked
   `readStoredCredential` path can never observe torn bytes.

## Relation to prior bugs

- 0493 — the flake fired during that fix's verification and was
  explicitly deferred by its round-1 reviewer as non-diff-related; the
  orchestrator's shared-auth.json hypothesis is confirmed in refined
  form here.
- 0483 — the verifier and reviewer saw the same signature under
  full-suite load; same environmental cause, not the 0483 diff.
- 0002 (defect 2) / AGENTS.md `#subagent-child-pins` — the established
  precedent that a real-child test must pin every ambient input the
  child resolves; this bug is the unpinned third input (the agent
  config/credential dir).

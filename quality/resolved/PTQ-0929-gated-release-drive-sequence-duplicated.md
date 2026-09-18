---
id: PTQ-0929
title: the gate-then-drain drive sequence around ParForHost is repeated eight times verbatim across b0324/b0325/b0326 instead of living in the shared par-for harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0324-max-non-number-runtime.test.ts:46-69
  - tests/b0324-max-non-number-runtime.test.ts:81-97
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:161-182
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:312-325
  - tests/b0326-max-non-positive-runtime.test.ts:82-97
  - tests/b0326-max-non-positive-runtime.test.ts:122-137
  - tests/b0326-max-non-positive-runtime.test.ts:156-171
  - tests/b0326-max-non-positive-runtime.test.ts:187-202
  - tests/helpers/par-for-harness.ts:1-107
sites: 8                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the gate-then-drain drive sequence around ParForHost is repeated eight times verbatim across b0324/b0325/b0326 instead of living in the shared par-for harness

## Observation
Each of the three files declares its own `ParForHost`/`RecordingParForHost`
instance, its own gate-promise (`let release!: () => void; host.gate = new
Promise<void>((res) => { release = res; })`), drives `executeBody` with that
host, awaits a fixed 30ms tick, reads `host.peakInFlight` while gated, calls
`release()`, and then awaits the drive to completion — an identical eight-line
sequence, reproduced eight times across the three files (twice in b0324,
twice in b0325, four times in b0326), always immediately before the same two
declarations (`const host = new ParForHost();` / `const captured: Diagnostic[]
= [];`). The shared `tests/helpers/par-for-harness.ts` module that all three
files already import (`ParForHost`, `execDeps`) exports the host and the
deps-builder but not this gate-then-drain sequence itself.

## Evidence

tests/b0324-max-non-number-runtime.test.ts:46-69:
```ts
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    // ...(fixture)...
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;
```

tests/b0324-max-non-number-runtime.test.ts:81-97:
```ts
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 2 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;
```

tests/b0325-nan-infinity-max-zero-workers.test.ts:161-182:
```ts
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      ["let w = 1 % 0", 'par for f in [1, 2, 3, 4, 5] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;
    const totalEffects = host.started;
```

tests/b0325-nan-infinity-max-zero-workers.test.ts:312-325:
```ts
    const host = new RecordingParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf('par for f in [1, 2, 3, 4, 5] max 2 { invoke("./c.theta", f) }');
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;
```

tests/b0326-max-non-positive-runtime.test.ts:82-97, :122-137, :156-171 and
:187-202 — the same eight-line gate/drain shape, four times in one file, e.g.
:82-97:
```ts
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 0 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    const exec = await execPromise;
```

Exact search: `grep -c "let release!: () => void;" tests/b0324-max-non-number-runtime.test.ts
tests/b0325-nan-infinity-max-zero-workers.test.ts
tests/b0326-max-non-positive-runtime.test.ts` → 2, 2, 4 (8 total, all cited
above). The same literal also appears in three files outside this wave's
scope (`tests/par-for.test.ts` ×4, `tests/b0438-par-max-fractional-width-silent-floor.test.ts`
×4, `tests/subagent-isolation.test.ts` ×1); those are named for completeness
of the search and are not cited as filing sites since they are outside the
briefed scope.

## Why this is a problem
tests/helpers/par-for-harness.ts's own header states it exists to hold "the
shared gated par-for host and diagnostic-capturing executor deps" so bug
witnesses "need only dispatch count and admitted in-flight width" — it already
centralises `ParForHost` (the gate field and `peakInFlight` tracking) and
`execDeps` (the diagnostic-spy wiring), but the actual call sequence that
arms the gate, starts the drive, waits a tick, samples the peak, releases,
and awaits completion is left for each of the eight call sites in these three
files to write out identically. A change to the drive protocol (the fixed
30ms tick value, the order of sampling vs. releasing, an added drain step)
applied to a shared driver would need to be applied by hand at all eight
sites for these three files to stay in sync with each other.

## Suggested direction (non-binding, optional)
tests/helpers/par-for-harness.ts already owns `ParForHost.gate`/`peakInFlight`
and `execDeps`; a paired driver (e.g. taking a body and host and returning
`{ peakWhileGated, execution }` after arming the gate, ticking, releasing and
awaiting) would sit naturally beside those two exports, in the same module the
eight call sites already import from.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; the cited lines are a test-drive sequence around a fake host,
  not a pinned count or inventory assertion.
- Recording-double check: `ParForHost`/`RecordingParForHost` records dispatch
  counts and peak concurrency for content assertions (`toBe(1)`, `toContain`
  a diagnostic code) — none of the cited sequences backs a "never called"
  MUST-NOT witness; not applicable.
- docs/bugs/ signature search: docs/bugs/0324, 0325 and 0326 (par-for `max`
  operand family) are each cited in their own file's header as "Witness
  suite (Phase 1, RED). Fixed in 0.31{2,3}.0" / "Fixed in 0.343.0". `npx
  vitest run tests/b0324-max-non-number-runtime.test.ts
  tests/b0325-nan-infinity-max-zero-workers.test.ts
  tests/b0326-max-non-positive-runtime.test.ts` → all green at HEAD, so none
  of the cited `it()` blocks is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0324-max-non-number-runtime\|b0325-nan-infinity-max-zero-workers\|b0326-max-non-positive-runtime"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename or deletion of any `it()` — only that the repeated
  arm/tick/sample/release/await sequence inside each `it()` body could call a
  shared driver instead of being retyped at each site — so no witness-list
  citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0483
  (fakeexecutablehost-adjacent `ParForHost` harness quadruplication),
  PTQ-0629 and PTQ-0692 all concern the `ParForHost` CLASS itself being
  reimplemented in files that do not import `tests/helpers/par-for-harness.ts`
  — all three cited files here already import `ParForHost`/`execDeps` from
  that module, so this finding's claim (the gate/drain call SEQUENCE around
  the imported class, not the class) is disjoint from those. No filed or
  resolved PTQ's Evidence cites the `let release!: () => void;` sequence by
  line inside these three files.

## Triage
<triage appends: triage note here>
verdict: confirmed — independently re-verified: all five excerpts reproduce verbatim at the cited lines and the three uncited b0326 ranges (:122-137, :156-171, :187-202) carry the same shape; mktemp extraction of the arm/drive/tick/sample/release/await lines from all eight ranges and `diff` against site 1 → IDENTICAL ×7 (11 lines each) once the `RecordingParForHost` import alias (b0325) and the `const exec =` binding (b0326 :97/:137 only) are normalised, so the sequence is byte-identical boilerplate, not incidental similarity; the stated `let release!: () => void;` search reproduces exactly (2/2/4 in scope; 4/4/1 in par-for/b0438/subagent-isolation out of scope), tests/helpers/par-for-harness.ts exports only `ok`/`ParForHost`/`execDeps` (no driver; `peakWhileGated` grep in tests/helpers → 0) and its header quotes are real (:1-3; file is 113 lines, cited 1-107 is minor drift); all eight sites are live — `npx vitest run` on the three files → 17/17 green; every location under tests/, D7 boilerplate-duplication class, no `*gate*` file, `ParForHost` is read for positive observables (peak/started) not a MUST-NOT witness, coverage-matrix grep → 0, no it() merge/rename/delete proposed; not a duplicate — fixed PTQ-0483 tracked the class/execDeps/scaffold block (its fix is what landed the shared harness these files now import) and open PTQ-0629/PTQ-0692 track class copies in b0438/execution-status-parfor-lanes; `grep -rl "let release!" quality/` → no filed or resolved PTQ cites this drive sequence; minor: locations lists 9 entries (8 sites + the harness as context) against sites: 8, which is consistent (triage: claude-fable-5-1)

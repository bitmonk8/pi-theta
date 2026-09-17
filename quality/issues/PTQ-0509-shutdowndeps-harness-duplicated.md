---
id: PTQ-0509
title: The runSessionShutdown deps builder (registry/activeInvocations/clock/no-op watchers/inventory snapshot/sink) is redeclared near-identically in four test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/active-invocation-binder-window.test.ts:150-179
  - tests/post-deadline-dual-surface.test.ts:171-204
  - tests/cancelled-by-session-shutdown-note.test.ts:187-215
  - tests/session-swap-tripwire.test.ts:126-155
sites: 4
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The runSessionShutdown deps builder (registry/activeInvocations/clock/no-op watchers/inventory snapshot/sink) is redeclared near-identically in four test files

## Observation
Four test files each hand-roll a local builder that assembles a full `SessionShutdownDeps` object for driving the real `runSessionShutdown`: a fresh `ThetaRegistry()`, the caller's `activeInvocations` registry and `FakeClock`, no-op `discoveryWatcher.close` / `settingsWatcher.close`, `debounceHandle: undefined`, `forwardingSignals: []`, a one-item `inventory` array carrying the identical `SessionShutdownEvent.reason` type-union snapshot line, and a `sink`. Three of the four (`active-invocation-binder-window.test.ts`, `cancelled-by-session-shutdown-note.test.ts`, `post-deadline-dual-surface.test.ts`) additionally declare their own near-identical no-op/recording `EmissionSink` builder immediately above it. `active-invocation-binder-window.test.ts` is in the reviewed scope; the other three are cited as the duplicate-count instances.

## Evidence
`tests/active-invocation-binder-window.test.ts:150-179`:
```ts
function sink(): EmissionSink {
  return {
    emit: (): void => {},
    serialise: (diagnostic): string => JSON.stringify(diagnostic),
  };
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds. */
function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: FakeClock,
): SessionShutdownDeps {
  return {
    registry: new ThetaRegistry(),
    activeInvocations,
    clock,
    discoveryWatcher: { close: (): void => {} },
    settingsWatcher: { close: (): void => {} },
    debounceHandle: undefined,
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink: sink(),
  };
}
```

`tests/post-deadline-dual-surface.test.ts:171-204` (the same builder; `sink` becomes a parameter instead of an inline call):
```ts
function recordingSink(lines: string[]): EmissionSink {
  return {
    emit: (line: unknown): void => {
      lines.push(String(line));
    },
    serialise: (diagnostic: Diagnostic): string => JSON.stringify(diagnostic),
  };
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds. */
function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: FakeClock,
  sink: EmissionSink,
): SessionShutdownDeps {
  return {
    registry: new ThetaRegistry(),
    activeInvocations,
    clock,
    discoveryWatcher: { close: (): void => {} },
    settingsWatcher: { close: (): void => {} },
    debounceHandle: undefined,
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink,
  };
}
```

`tests/cancelled-by-session-shutdown-note.test.ts:187-215` (identical to the first, `sink()` renamed `teardownSink()`):
```ts
function teardownSink(): EmissionSink {
  return {
    emit: (): void => {},
    serialise: (diagnostic): string => JSON.stringify(diagnostic),
  };
}

/** Real `runSessionShutdown` deps over the SAME registry the producer holds. */
function shutdownDeps(
  activeInvocations: ActiveInvocationRegistry,
  clock: FakeClock,
): SessionShutdownDeps {
  return {
    registry: new ThetaRegistry(),
    activeInvocations,
    clock,
    discoveryWatcher: { close: (): void => {} },
    settingsWatcher: { close: (): void => {} },
    debounceHandle: undefined,
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink: teardownSink(),
  };
}
```

`tests/session-swap-tripwire.test.ts:126-155` (same field set, inlined into a harness factory rather than a standalone `shutdownDeps` function; `close: vi.fn()` instead of a bare no-op, and `debounceHandle` set to a real timer instead of `undefined`):
```ts
interface ShutdownHarness {
  readonly deps: SessionShutdownDeps;
  readonly registry: ThetaRegistry;
  readonly activeInvocations: ActiveInvocationRegistry;
  readonly clock: FakeClock;
  readonly sink: ReturnType<typeof sinkSpy>;
}

function makeShutdownHarness(): ShutdownHarness {
  const registry = new ThetaRegistry();
  const activeInvocations = new ActiveInvocationRegistry();
  const clock = new FakeClock();
  const sink = sinkSpy();
  const deps: SessionShutdownDeps = {
    registry,
    activeInvocations,
    clock,
    discoveryWatcher: { close: vi.fn() },
    settingsWatcher: { close: vi.fn() },
    debounceHandle: clock.setTimeout(() => {}, 250),
    forwardingSignals: [],
    inventory: [
      {
        kind: "type-union-snapshot",
        path: "SessionShutdownEvent.reason",
        literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
      },
    ],
    sink,
  };
```

Exact search: `grep -n "SESSION_SHUTDOWN_REASON_SNAPSHOT.literals" tests/*.test.ts` returns the identical three-line inventory-snapshot literal at `active-invocation-binder-window.test.ts:174`, `cancelled-by-session-shutdown-note.test.ts:211`, `post-deadline-dual-surface.test.ts:198`, `session-swap-tripwire.test.ts:150` (plus unrelated hits in `session-shutdown.test.ts` and the `version-bump-*` gates, which build a different, smaller `healthyInventory()`-only helper and are not counted here). `grep -n "^function shutdownDeps"` across `tests/*.test.ts` returns exactly the three standalone-function sites (`active-invocation-binder-window.test.ts:158`, `cancelled-by-session-shutdown-note.test.ts:195`, `post-deadline-dual-surface.test.ts:181`); the fourth site (`session-swap-tripwire.test.ts`) inlines the same field set into `makeShutdownHarness`.

## Why this is a problem
The seven-field `SessionShutdownDeps` object literal — `registry: new ThetaRegistry()`, the caller-supplied `activeInvocations`/`clock`, two no-op watcher closes, `debounceHandle`, `forwardingSignals: []`, and the byte-identical three-line inventory snapshot — is retyped from scratch in three files as a standalone `shutdownDeps` function and inlined a fourth time in a harness factory, rather than being built once and imported. Three of the four sites additionally redeclare their own one-shape-different `EmissionSink` builder immediately beside it. `tests/helpers/` already holds a precedent for exactly this kind of extraction (e.g. `tests/helpers/fake-clock.ts` supplies the shared `FakeClock` these same four files already import instead of hand-rolling their own).

## Suggested direction (non-binding, optional)
A shared `SessionShutdownDeps` builder parameterised by the registry/clock/sink under `tests/helpers/` is the natural home the four sites' identical field lists already point at; the fix stage owns the actual extraction and any decision about the `session-swap-tripwire.test.ts` inlined variant's `vi.fn()`/timer differences.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named gate-kin patterns, and this finding does not touch a pinned count or inventory — not applicable.
- Recording-double check: the `sink()` / `teardownSink()` no-op builders record nothing; `post-deadline-dual-surface.test.ts`'s `recordingSink` and `session-swap-tripwire.test.ts`'s `sinkSpy()` ARE recording doubles used elsewhere in those files for MUST-NOT witnesses, but this finding is about the surrounding `shutdownDeps`/`makeShutdownHarness` field-list duplication, not about weakening or replacing any recording assertion — the carve-out does not apply and no recording-double behaviour is challenged here.
- docs/bugs/ signature search: `grep -rl` for all four file names across `docs/bugs/` hit `0073`, `0074`, `0208`, `0371`, `0375`, `0383`, `0397`, `0432`, `0451`, `0453`, `0468` — each cites a file NAME as its witness, not the internal `shutdownDeps` helper; this finding does not propose renaming, merging, or deleting any of the four files, only naming the shared field-list builder as an observation.
- coverage-matrix citation search: `grep -n` for all four file names against `docs/reference/coverage-matrix.md` returned no hits.
- Coverage-drift check: this finding does not claim a test should exist or that a path is untested; it is limited to the duplicated harness-builder code that exists today in four files, one of which (`active-invocation-binder-window.test.ts`) is in the reviewed scope.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines (only drift: session-swap-tripwire's ShutdownHarness interface has no `activeInvocations` field; its deps literal matches), the three `^function shutdownDeps` sites (binder-window:158, cancelled-by-note:195, post-deadline:181) are byte-identical apart from sink-as-parameter and the fourth (`makeShutdownHarness`, tripwire:134-152) differs only in `vi.fn()`/live-timer `debounceHandle`; every copy is live (called at :186, :349, :286 and 2× in tripwire); `grep SESSION_SHUTDOWN_REASON_SNAPSHOT.literals tests/` confirms the same three-line inventory snapshot at :174/:211/:198/:150 and the other five SessionShutdownDeps-building files (session-shutdown, reload-teardown-quiesce, b0376, wiring) use a distinct spy/`inventory: undefined` shape so the 4-site scoping is honest; no shared builder exists in tests/helpers/ (grep SessionShutdownDeps|runSessionShutdown|EmissionSink → 0 hits); class = copy-paste fixture, all locations under tests/; carve-outs do not apply (no gate files, coverage-matrix grep → 0, docs/bugs 0073/0074/0208/0216 mention `shutdownDeps` only inside illustrative repro sketches, not as witness pins); not tracked — resolved PTQ-0403 covers the dispatch-side block (binder-window:77-114), not the teardown deps. Note: same-wave intake sibling qw20260917154546-d7-140-03-session-shutdown-deps-harness-septupled.md cites a 7-site superset of this root cause — whichever is accepted first makes the other a duplicate (triage: claude-fable-5-1)

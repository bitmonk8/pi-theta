---
id: PTQ-0699
title: session-swap-tripwire.test.ts's SessionShutdownDeps-building harness is one of seven near-identical redeclarations across the suite, with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-swap-tripwire.test.ts:126-158
  - tests/session-shutdown.test.ts:161-210
  - tests/reload-teardown-quiesce.test.ts:334-370
  - tests/b0376-teardown-call-label-set-underenumerates.test.ts:79-106
  - tests/cancelled-by-session-shutdown-note.test.ts:194-214
  - tests/post-deadline-dual-surface.test.ts:180-200
  - tests/active-invocation-binder-window.test.ts:157-176
sites: 7
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# session-swap-tripwire.test.ts's SessionShutdownDeps-building harness is one of seven near-identical redeclarations across the suite, with no tests/helpers/ home

## Observation
`tests/session-swap-tripwire.test.ts` declares a `ShutdownHarness` interface,
a `makeShutdownHarness()` function that builds a `SessionShutdownDeps` object
(same nine fields: `registry`, `activeInvocations`, `clock`,
`discoveryWatcher`, `settingsWatcher`, `debounceHandle`, `forwardingSignals`,
`inventory`, `sink`, with `inventory` seeded from
`SESSION_SHUTDOWN_REASON_SNAPSHOT.literals`), and a module-level
`eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason })`
constant. Six other test files build the identical `SessionShutdownDeps`
field set through the same two recurring shapes: a `Harness`/`makeHarness()`
pair (three sibling files, `debounceHandle: clock.setTimeout(() => {}, 250)`)
and a `shutdownDeps(...)` function (three more, `debounceHandle: undefined`,
`discoveryWatcher`/`settingsWatcher` as inline `{ close: () => {} }`
literals). The `eventWith` one-liner is byte-identical across four of the
seven. No `tests/helpers/` module exports a `SessionShutdownDeps` builder.

## Evidence
tests/session-swap-tripwire.test.ts:126-158 (re-read immediately before
filing):
```ts
interface ShutdownHarness {
  readonly deps: SessionShutdownDeps;
  readonly registry: ThetaRegistry;
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
  return { deps, registry, clock, sink };
}

const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });
```

tests/b0376-teardown-call-label-set-underenumerates.test.ts:85-105 (the same
nine-field object, same `debounceHandle: clock.setTimeout(() => {}, 250)`
shape, same trailing `eventWith`):
```ts
function makeHarness(): Harness {
  const clock = new FakeClock();
  const sink = sinkSpy();
  const deps: SessionShutdownDeps = {
    registry: new ThetaRegistry(),
    activeInvocations: new ActiveInvocationRegistry(),
    clock,
    discoveryWatcher: watcherSpy(),
    settingsWatcher: watcherSpy(),
    debounceHandle: clock.setTimeout(() => {}, 250),
    forwardingSignals: [
      signalSpy("ctx.signal.removeEventListener"),
      signalSpy("toolSignal.removeEventListener"),
      signalSpy("parentInvokeSignal.removeEventListener"),
    ],
    inventory: undefined,
    sink,
  };
  return { deps, clock, sink };
}

const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });
```

tests/session-shutdown.test.ts:210 and tests/reload-teardown-quiesce.test.ts:370
(the same one-liner, byte-identical to session-swap-tripwire.test.ts:158):
```ts
const eventWith = (reason: unknown): SessionShutdownEventLike => ({ reason });
```

tests/active-invocation-binder-window.test.ts:157-176 (the `shutdownDeps`
variant — same nine fields, `debounceHandle: undefined`, the same
`SESSION_SHUTDOWN_REASON_SNAPSHOT.literals`-seeded `inventory`):
```ts
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

tests/cancelled-by-session-shutdown-note.test.ts:195-214 and
tests/post-deadline-dual-surface.test.ts:181-200 carry the same
`shutdownDeps` body (the latter takes `sink` as a parameter instead of
calling a local `sink()`); `diff` of the object-literal bodies (the
`return { ... }` block) across all three shows the only differences are the
parameter list and the final `sink` expression.

Exact search: `grep -rn "^const eventWith = (reason: unknown): SessionShutdownEventLike" tests/*.test.ts`
→ 4 hits (session-swap-tripwire.test.ts:158, session-shutdown.test.ts:210,
reload-teardown-quiesce.test.ts:370, b0376-teardown-call-label-set-underenumerates.test.ts:106).
`grep -rln "function shutdownDeps(" tests/*.test.ts` → 3 hits
(cancelled-by-session-shutdown-note.test.ts, post-deadline-dual-surface.test.ts,
active-invocation-binder-window.test.ts). `grep -rln "function makeHarness\|function makeShutdownHarness" tests/*.test.ts`
combined with a `SessionShutdownDeps` import → the same set as the `eventWith`
search plus session-swap-tripwire.test.ts's own `makeShutdownHarness`, for 7
distinct files building this exact nine-field object in total.

## Why this is a problem
Two shapes of the same `SessionShutdownDeps` construction — the
`Harness`/`makeHarness`/`eventWith` triple and the `shutdownDeps` function —
recur across seven files with no shared source. A change to the
`SessionShutdownDeps` field set (e.g. a new required field, or a rename of
`debounceHandle`) is TypeScript-checked in each of the seven files
independently rather than in one builder; the two families already agree on
every field name and on the `SESSION_SHUTDOWN_REASON_SNAPSHOT.literals`
inventory-seeding idiom, which is the shape a shared helper would capture.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports a `SessionShutdownDeps` builder;
the two independently-arrived-at families (`makeHarness`-with-spies and
`shutdownDeps`-with-inline-closers) are the observation that a shared base
parameterised over the parts that do vary (the watcher doubles, the
`debounceHandle` value, the sink) is missing, not a design for one.

## False-positive check
- Gate-pin check: none of the seven files match `*gate*.test.ts` or the
  named gate kin.
- Recording-double check: the `sink`/`discoveryWatcher`/`settingsWatcher`
  doubles back genuine positive assertions in each file (e.g. "the watcher
  closed exactly once", specific emitted diagnostics); this finding targets
  the redeclared harness definition, not the validity of any assertion built
  on it.
- docs/bugs/ signature search: `grep -rln "SessionShutdownDeps" docs/bugs/*.md`
  turns up narrative references to the production type in several fixed bug
  docs, none of which names a documented correct-reason red for any of the
  seven test files (each of the seven suites is green at HEAD).
- coverage-matrix/bug-doc citation search: `grep -n "session-swap-tripwire.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any file or `it()`/`describe()` — only that
  the `SessionShutdownDeps`-building harness could be shared.
- Coverage check: the claim is about repeated harness DEFINITIONS, not a
  missing test path; each file's own tests exercise its own copy fully.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all seven excerpts reproduce at the cited lines (tripwire:126-158 makeShutdownHarness, session-shutdown:161-210 makeHarness with overrides, reload-teardown-quiesce:334-370 makeHarness, b0376:79-106 makeHarness, and the three `^function shutdownDeps` sites at binder-window:157, cancelled-by-note:195, post-deadline:181), every copy builds the same nine-field `SessionShutdownDeps` literal (`registry/activeInvocations/clock/discoveryWatcher/settingsWatcher/debounceHandle/forwardingSignals/inventory/sink`), an awk-extracted diff of the three shutdownDeps `return {…}` bodies differs only in the `sink` expression (`sink()` / `teardownSink()` / param), `grep -rln SessionShutdownDeps tests/` → 9 files of which exactly these 7 build the object (session-shutdown-wiring mentions it only in a comment at :240; b0432 uses the distinct `CancelledBySessionShutdownDeps`), tests/helpers/ exports no `SessionShutdownDeps` builder (grep → 0), all 7 suites green (69/69 via vitest; bug 0376 is fixed 0.372.0 so b0376's RED header is historical), no `*gate*` files, coverage-matrix grep → 0 for all seven, no merge/rename/delete proposed; one correction: the `^const eventWith` grep returns 5 hits not 4 (extra tests/unknown-reason-rule.test.ts:64, which does not build the deps object, so the 7-site count stands); class = copy-paste fixture / boilerplate duplication, all under tests/; not in the tracked PTQ list (resolved PTQ-0403 covers binder-window's dispatch-side block :77-114, not the teardown deps) — NOTE for the human: this is a 7-site strict superset of same-wave confirmed sibling qw20260917154546-d7-01-shutdowndeps-harness-duplicated.md (shares its 4 sites: tripwire + the three shutdownDeps files; adds the three spy-shaped makeHarness copies), and confirmed sibling d7-01-b0376-teardown-spy-harness-duplicated.md explicitly deferred b0376's makeHarness deps-builder to this filing — accept one of this pair and duplicate the other at acceptance; the superset here is the one whose site list lets the fixer land a single parameterised builder (triage: claude-fable-5-1)

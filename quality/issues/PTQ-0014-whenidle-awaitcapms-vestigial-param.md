---
id: PTQ-0014
title: TeardownAwareDebouncer.whenIdle declares an awaitCapMs parameter that no caller passes and no implementation reads
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/session-shutdown.ts:119-132
  - src/extension/session-shutdown.ts:785
  - src/extension/reload-debounce.ts:174
  - src/extension/hot-reload.ts:448-451
  - src/extension/factory.ts:1155-1160
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# TeardownAwareDebouncer.whenIdle declares an awaitCapMs parameter that no caller passes and no implementation reads

## Observation
`TeardownAwareDebouncer.whenIdle` is declared with an optional `awaitCapMs?:
number` parameter. The single production call site invokes it with zero
arguments, and all three implementations that satisfy the interface declare
`whenIdle` with an empty parameter list, so no code ever reads a passed value.
The interface's own doc comment states the parameter exists "purely for label
symmetry" with a diagnostic `details.call` string; the handler bounds the await
itself via a separate cap timer.

## Evidence
src/extension/session-shutdown.ts:124-131 — the declaration and its own
admission that the parameter carries no value:
```ts
 * runtime. `whenIdle` takes an optional cap purely for label symmetry with the
 * closed-set `details.call` quiesce label at `TEARDOWN_STEP_CALL_LABELS[4]`;
 * the handler bounds the await itself against the shared deadline rather than
 * passing a budget in.
 */
export interface TeardownAwareDebouncer {
  markTornDown(): void;
  whenIdle(awaitCapMs?: number): Promise<void>;
```

src/extension/session-shutdown.ts:785 — the sole call through the interface,
zero arguments (the bound comes from the surrounding `capRace` timer, not from
a parameter):
```ts
    await Promise.race([debouncer.whenIdle(), capRace]); // allow: PIC-57 — pi-integration-contract/session-shutdown-semantics.md
```

src/extension/reload-debounce.ts:174 — implementation, no parameter:
```ts
  whenIdle(): Promise<void> {
```

src/extension/hot-reload.ts:448-451 — implementation, no parameter:
```ts
    whenIdle(): Promise<void> {
      // PIC-57 sub-step 4 (b): let an already-in-flight rebuild quiesce.
      return debouncer.whenIdle();
    },
```

src/extension/factory.ts:1158-1159 — the adapter that satisfies
`TeardownAwareDebouncer` for `runSessionShutdown`, no parameter:
```ts
                    whenIdle: (): Promise<void> =>
                      handle.whenIdle?.() ?? Promise.resolve(),
```

Search for any invocation passing an argument: `grep -rnE "whenIdle\([^)]"
--include=*.ts src tests` returns only string literals (the
`"debouncer.whenIdle(awaitCap)"` / `"hotReloadHandle.whenIdle(awaitCap)"`
`details.call` label texts), the interface declaration itself
(session-shutdown.ts:131), and a test-local mirror of that declaration
(tests/reload-teardown-quiesce.test.ts:277) — zero call expressions with an
argument. The test doubles in tests/reload-teardown-quiesce.test.ts:373-381 and
tests/b0376-teardown-call-label-set-underenumerates.test.ts:111-118 are typed
`() => Promise<void>` and read no parameter.

## Why this is a problem
Vestigial parameter: the value is never read by any implementation and never
supplied by any caller (production or test), so it is unreachable data flow by
construction. The "label symmetry" rationale ties a function signature to a
diagnostic string constant (`TEARDOWN_STEP_CALL_LABELS[4][3] ===
"debouncer.whenIdle(awaitCap)"`), but the label is wire contract for a
`details.call` field, not a signature requirement — the label compiles and is
emitted identically whether or not the parameter exists. The parameter also
misleads: it suggests callers can pass a budget in, while the handler's actual
bounding mechanism (`quiesceDebouncer`'s `capRace` timer,
session-shutdown.ts:778-788) ignores it entirely.

## Suggested direction (non-binding, optional)
Drop `awaitCapMs?` from the `TeardownAwareDebouncer.whenIdle` signature (and
the test-local mirror), leaving the doc comment to note that the bound is
owned by the caller's cap timer and that the `details.call` label spelling is
independent of the signature.

## False-positive check
- Reference search for argument-passing calls: `grep -rnE "whenIdle\([^)]"
  --include=*.ts src tests` — every hit is a string literal, the interface
  declaration, or the test mirror declaration; no call passes an argument.
- Implementation search: `grep -rn "whenIdle" src` — implementations at
  reload-debounce.ts:174, hot-reload.ts:448, factory.ts:1158 all declare zero
  parameters; none can read a value.
- Test-caller check: test doubles (reload-teardown-quiesce.test.ts:373-381,
  b0376-teardown-call-label-set-underenumerates.test.ts:111-118) implement
  `() => Promise<void>`; no test passes or asserts on an argument, so this is
  not a test-only-reachable code path — it is a no-reachable-path parameter.
- String-keyed/dynamic access: the only related strings are the
  `details.call` labels, which are emitted values, not property/parameter
  accesses.
- Git intent: `git log -S "awaitCapMs" -- src/extension/session-shutdown.ts`
  → single commit 7b2bfa73 ("impl: PIC-57 teardown-aware hot-reload
  debouncer"); the parameter was introduced already-unused with the same
  "purely for label symmetry" doc, and no later commit added a reader.

## Triage
verdict: confirmed — independently reproduced: repo-wide `awaitCapMs` = exactly 2 hits (the src declaration + the test mirror), all three implementations (reload-debounce.ts:174, hot-reload.ts:448, factory.ts:1158) and `HotReloadHandle.whenIdle?` (hot-reload.ts:142) are zero-param, the sole call (session-shutdown.ts:785) passes nothing and is bounded by `quiesceDebouncer`'s external `capRace`, git 7b2bfa73 introduced the param already-unused with no later reader, and the governing spec mandates only the `details.call` label string plus the earlier-of-settle-or-deadline race — never passing a budget in — so the parameter is an unreachable data path in a production source. (triage: claude-opus-5)

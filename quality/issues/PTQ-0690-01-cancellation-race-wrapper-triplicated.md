---
id: PTQ-0690
title: The abort-race Promise wrapper (AbortController + guardToolExecutePromise + settledCount) is redeclared near-verbatim three times in session-control-adapters.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/session-control-adapters.test.ts:222-241
  - tests/session-control-adapters.test.ts:257-276
  - tests/session-control-adapters.test.ts:300-319
sites: 3
fix_scope: localized
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# The abort-race Promise wrapper (AbortController + guardToolExecutePromise + settledCount) is redeclared near-verbatim three times in session-control-adapters.test.ts

## Observation
Three `it()` blocks in tests/session-control-adapters.test.ts (D5, D5b, D5c)
each declare their own `AbortController`, their own `ToolExecuteCancellationGuard`
literal, and an identically-shaped `new Promise<...>((resolve) => { const
guarded = guardToolExecutePromise(...); guarded.then(...); controller.signal
.addEventListener("abort", ...); controller.abort(); })` race wrapper. The
wrapper's five statements (guard declaration, `guardToolExecutePromise` call,
`.then` callback, `addEventListener("abort", ...)` callback, `controller.abort()`)
are typed out fresh in each of the three tests rather than built once.

## Evidence

tests/session-control-adapters.test.ts:222-241 (re-read immediately before filing):
```ts
    const controller = new AbortController();
    const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };

    const outcome = await new Promise<"settled" | "cancelled">((resolve) => {
      const guarded = guardToolExecutePromise(
        executeCompactTool(host, "compact", "keep"),
        guard,
        noopChannels,
      );
      guarded.then((): void => {
        if (!guard.cancellationSurfaced) {
          resolve("settled");
        }
      });
      controller.signal.addEventListener("abort", (): void => {
        guard.cancellationSurfaced = true;
        resolve("cancelled");
      });
      controller.abort();
    });
```

tests/session-control-adapters.test.ts:257-276 — the same five-piece shape,
only the `.then` body and the outer `Promise` generic differ (`settledCount +=
1` instead of the settled/cancelled discriminant):
```ts
    const controller = new AbortController();
    const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };
    let settledCount = 0;

    const cancelled = await new Promise<"cancelled">((resolve) => {
      const guarded = guardToolExecutePromise(
        executeCompactTool(host, "compact", "keep"),
        guard,
        noopChannels,
      );
      guarded.then((): void => {
        settledCount += 1;
      });
      controller.signal.addEventListener("abort", (): void => {
        guard.cancellationSurfaced = true;
        resolve("cancelled");
      });
      controller.abort();
    });
    expect(cancelled).toBe("cancelled");
```

tests/session-control-adapters.test.ts:300-319 — byte-identical to the
257-276 excerpt above (same variable names, same callback bodies, same
`controller.abort()` tail):
```ts
    const controller = new AbortController();
    const guard: ToolExecuteCancellationGuard = { cancellationSurfaced: false };
    let settledCount = 0;

    const cancelled = await new Promise<"cancelled">((resolve) => {
      const guarded = guardToolExecutePromise(
        executeCompactTool(host, "compact", "keep"),
        guard,
        noopChannels,
      );
      guarded.then((): void => {
        settledCount += 1;
      });
      controller.signal.addEventListener("abort", (): void => {
        guard.cancellationSurfaced = true;
        resolve("cancelled");
      });
      controller.abort();
    });
    expect(cancelled).toBe("cancelled");
```

Search performed: `grep -n "new AbortController()" tests/session-control-adapters.test.ts` → 3 hits, at the three line numbers above (each inside its own `it()`); `grep -n "guardToolExecutePromise" tests/session-control-adapters.test.ts` → 3 call sites, one per block; no other in-scope or nearby file (`tests/tool-calls-swallowing-handler.test.ts`, `tests/cancellation-core.test.ts`) constructs this AbortController+Promise-race wrapper — those files surface cancellation by setting `guard.cancellationSurfaced` directly, without an AbortController or a wrapping Promise.

## Why this is a problem
The same race-construction sequence — build a guard, build an
`AbortController`, wrap `guardToolExecutePromise`'s result in a `new Promise`
that resolves on either the guarded promise settling or the abort signal
firing, then call `controller.abort()` — is typed fresh three times within one
file rather than parameterised once over the differing pieces (the `.then`
body and the host fixture). The 257-276 and 300-319 copies are byte-identical
apart from the surrounding `it()` name and the host object built above them.

## Suggested direction (non-binding, optional)
A single file-local helper taking the `guardToolExecutePromise`-wrapped
promise and returning the `"cancelled"` outcome (or exposing the settle
counter) is the shape all three call sites already point toward; whether it
belongs in this file or in `tests/helpers/` is a decision for the fix stage.

## False-positive check
- Gate-pin check: `session-control-adapters.test.ts` does not match `*gate*.test.ts`
  or any named gate kin; the cited lines are a race-construction sequence, not
  a pinned count or inventory.
- Recording-double check: the `guard`/`abortCalls` values downstream of this
  wrapper back legitimate MUST-NOT witnesses (D5's "zero abort calls"); this
  finding targets the repeated SCAFFOLDING that builds and drives the race,
  not the validity of those assertions.
- docs/bugs/ signature search: `grep -rln "session-control-adapters" docs/bugs/*.md`
  → no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-adapters"
  docs/reference/coverage-matrix.md` → 0 hits; no citation pins these tests by
  name.
- Cross-file check: `grep -n "AbortController" tests/cancellation-core.test.ts
  tests/tool-calls-swallowing-handler.test.ts tests/invoke-swallowing-handler.test.ts
  tests/query-swallowing-handler.test.ts` shows AbortControllers used, but none
  wraps `guardToolExecutePromise` in this same resolve-on-either-event Promise
  shape — the duplication is confined to this one file, so `fix_scope` is
  `localized` and no canonical `tests/helpers/` home already exists for it.
- Coverage-drift check: this claim is about three already-passing tests whose
  setup sequence repeats; it makes no claim that any behaviour or path is
  untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts match tests/session-control-adapters.test.ts at exactly 222-241/257-276/300-319; scratch diff of 257-276 vs 300-319 is empty (byte-identical, 20 lines) and 222-241 differs only in the `.then` body and Promise generic; `new AbortController()` and `guardToolExecutePromise(` each grep to 3 hits in the file, one per it(); the other three guardToolExecutePromise-using tests (production-cancellation-wiring, tool-calls-off-surface-live-wiring, tool-calls-swallowing-handler) never wrap it in the resolve-on-either-event Promise race and no tests/helpers/ file touches cancellationSurfaced, so scope is truly intra-file; not a gate file, no docs/bugs or coverage-matrix citation, assertions themselves untouched (recording-double carve-out not implicated); sibling intake d7-01 targets the unhandledRejection trap at 192-202 — distinct root cause, no duplicate in the store. Boilerplate-duplication class, mechanical dedupe; stray `d4_class: parallel` field is extraneous on a D7 filing but non-blocking (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)

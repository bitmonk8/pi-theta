---
id: PTQ-0682
title: node()/snapshotOf() InvocationNodeSnapshot builders re-typed identically in execution-status-footer and execution-status-widget
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/execution-status-footer.test.ts:24-33
  - tests/execution-status-widget.test.ts:22-28
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# node()/snapshotOf() InvocationNodeSnapshot builders re-typed identically in execution-status-footer and execution-status-widget

## Observation
`tests/execution-status-footer.test.ts` and `tests/execution-status-widget.test.ts` each declare their own `node(overrides)` and `snapshotOf(nodes, untracked)` builder pair for constructing `InvocationNodeSnapshot`/`ExecutionStatusSnapshot` fixtures. Both pairs have the identical signature and identical (whitespace-only-differing) body; both files' own header comments state they cover sibling behaviour-matrix rows of the same RFC 0010 EXST-8 worked example (`footer-sink.ts`'s `renderFooterLine` vs. `widget-sink.ts`'s `renderStatusTree`, both consuming the same `ExecutionStatusSnapshot`/`InvocationNodeSnapshot` types from `src/extension/execution-status/types`).

## Evidence
`tests/execution-status-footer.test.ts:24-33`:
```ts
function node(overrides: Partial<InvocationNodeSnapshot> & Pick<InvocationNodeSnapshot, "invocationId" | "theta" | "startedAtMs">): InvocationNodeSnapshot {
  return {
    counters: { checkpoints: 0, loopIters: 0 },
    ...overrides,
  };
}

function snapshotOf(nodes: readonly InvocationNodeSnapshot[], untracked = 0): ExecutionStatusSnapshot {
  return { nodes, untracked };
}
```

`tests/execution-status-widget.test.ts:22-28` (same two functions, reformatted onto fewer lines):
```ts
function node(overrides: Partial<InvocationNodeSnapshot> & Pick<InvocationNodeSnapshot, "invocationId" | "theta" | "startedAtMs">): InvocationNodeSnapshot {
  return { counters: { checkpoints: 0, loopIters: 0 }, ...overrides };
}

function snapshotOf(nodes: readonly InvocationNodeSnapshot[], untracked = 0): ExecutionStatusSnapshot {
  return { nodes, untracked };
}
```

Exact search: `grep -rn "^function node(overrides" tests/*.test.ts` returns exactly these two files; `grep -rn "^function snapshotOf" tests/*.test.ts` returns these two files plus `tests/session-control-dispatch.test.ts:94`, whose `snapshotOf` has an unrelated `CallableSetSnapshot` signature over `(readonly [string, ResolvedCallable])[]` and is not part of this duplication.

## Why this is a problem
Both files build the same `InvocationNodeSnapshot`/`ExecutionStatusSnapshot` fixture shape to drive two renderers (`renderFooterLine`, `renderStatusTree`) that consume the identical snapshot types from `src/extension/execution-status/types`, and each file types the identical builder pair rather than sharing one.

## Suggested direction (non-binding, optional)
A shared `node`/`snapshotOf` builder pair (e.g. under tests/helpers/, alongside the other execution-status-domain fixtures already read in this scope) would let both files import the common builders and keep their own worked-example node literals local.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kinds. Recording-double check: `node`/`snapshotOf` are plain data builders, not recording doubles asserting a MUST-NOT call — the carve-out does not apply. docs/bugs/ signature search: `grep -rl "execution-status-footer\|execution-status-widget" docs/bugs` found no matching bug doc. coverage-matrix/bug-doc citation search: `grep -n "execution-status-footer.test.ts\|execution-status-widget.test.ts" docs/reference/coverage-matrix.md` returned no hits — neither file is cited by name, so no merge/rename/delete concern applies. Coverage: not claimed — both files already assert their own worked examples (B35-B40/B43 and B41-B44 respectively); this is only about the repeated builder code.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at footer:24-33 and widget:22-28 and a whitespace-stripped diff shows the only difference is a trailing comma after `...overrides` (semantically identical); the two stated greps reproduce (session-control-dispatch.test.ts:94 is the unrelated CallableSetSnapshot shape); no shared InvocationNodeSnapshot builder exists under tests/helpers/ and these two files are the only test consumers of the type; both copies are live (20 and 16 call sites); neither file is a gate test, a recording double, or cited by docs/reference/coverage-matrix.md or docs/bugs/; PTQ-0414 cites the type only as a src/ D9 location, so no duplicate — a D7 copy-paste-fixture clone with a mechanical dedupe (triage: claude-fable-5-1)

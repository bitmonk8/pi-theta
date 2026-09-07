---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Four render/runtime seam modules still narrate their tests-task stub state as current ("stubs ... inertly", "The paired ... leaf fills these in") although every named function is implemented
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/render/argument-echo.ts:23-28
  - src/render/query-render.ts:22-27
  - src/runtime/checkpoint-granularity.ts:27-34
  - src/runtime/checkpoint-granularity.ts:69-70
  - src/runtime/checkpoint-granularity.ts:100-101
  - src/runtime/control-flow.ts:17-23
  - src/runtime/control-flow.ts:49-50
sites: 7                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Four render/runtime seam modules still narrate their tests-task stub state as current ("stubs ... inertly", "The paired ... leaf fills these in") although every named function is implemented

## Observation
Four seam modules carry present-tense tests-task narration stating that their
behaviour-bearing functions are inert stubs which "the paired implementation
leaf fills in". In each file the named functions are fully implemented in the
same file: `renderEchoValue` / `renderArgumentEcho` (argument-echo.ts:202,
:232) render per the echo rules; `lexQueryTemplate` (query-render.ts:157)
emits escape/termination diagnostics, `renderTemplateText` (:280) performs
newline-trim + dedent, `stringifyInterpolatedValue` (:396) returns rendered
text, and both degenerate-template defences (:496, :526) return real values;
`runCheckpointedForLoop` / `runCheckpointedBinderCall`
(checkpoint-granularity.ts:72, :103) fire the checkpoints and run the
iteration / dispatch the call; `evaluateForLoop` (control-flow.ts:52)
evaluates the iterand and runs the body.

## Evidence
src/render/argument-echo.ts:23-28 (renderers implemented at :202 and :232):
```ts
// V11h-T (tests-task) declares these seam shapes — the `EchoType` static-type
// descriptor, the `EchoField` / `EchoParam` / `ArgumentEchoInput` inputs, the
// per-value `renderEchoValue` renderer, and the whole-line `renderArgumentEcho`
// — and stubs the two renderers inertly so the failing tests compile and red on
// their own primary assertions (the format-rule renderer is absent). The paired
// V11h implementation leaf fills these in.
```

src/render/query-render.ts:22-27 (all five named behaviours implemented at
:157, :280, :396, :496, :526):
```ts
// V13a-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions (the render pipeline is an identity stub, the lexer emits no
// escape/termination diagnostics, stringification returns empty text, and both
// degenerate-template defences are no-ops). The paired V13a implementation leaf
// fills these in.
```

src/runtime/checkpoint-granularity.ts:27-34 (both functions implemented at
:72-95 and :103-118):
```ts
// V17c-T (tests-task) declares this surface and stubs the behaviour-bearing
// functions inertly: `runCheckpointedForLoop` fires no checkpoint and runs no
// iteration, and `runCheckpointedBinderCall` fires no checkpoint and never
// dispatches the call (returning a cancelled outcome). The granularity
// assertions therefore red on their own primary expectation — the expected
// `loop-iter` / `binder-call` checkpoints are absent and the body / call never
// runs — not on a compile error, a missing fixture, or a harness throw. The
// paired V17c implementation leaf fills these in.
```

src/runtime/checkpoint-granularity.ts:69-70 and :100-101 (per-function doc
comments repeating the stub claim on the implemented bodies):
```ts
 * V17c-T stubs this inert: it fires no checkpoint and runs no iteration. The
 * paired V17c leaf implements it.
```
```ts
 * V17c-T stubs this inert: it fires no checkpoint and never dispatches the
 * call. The paired V17c leaf implements it.
```

src/runtime/control-flow.ts:17-23 and :49-50 (function implemented at :52-61,
which calls `host.evaluateIterand()` and `host.runIteration(...)` per element):
```ts
// V3c-T (tests-task) declares the seam — the `ForLoopHost` collaborator and the
// `evaluateForLoop` entry point — and stubs `evaluateForLoop` inertly: it
// neither evaluates the iterand nor runs the body, so the CTRL-1 assertions red
// on their own primary expectations (the iterand-evaluation count is `0` rather
// than `1`, and no body iteration is recorded), not on a compile error, a
// missing fixture, or a harness throw. The paired V3c implementation leaf fills
// it in.
```

## Why this is a problem
Leftover scaffolding narration: the stub descriptions were true at the
tests-task commit and became false when the paired implementation landed in
the same files; the comments were not updated. A reader of
query-render.ts:22-27 is told `lexQueryTemplate` "emits no escape/termination
diagnostics" while the function forty lines below pushes
`theta/parse/illegal-template-escape` and `theta/parse/unterminated-template`;
a reader of checkpoint-granularity.ts:69-70 is told the function above fires
no checkpoint while its body awaits `checkpoint.before("loop-iter", site)`.
Each statement describes a state git history holds, not the current code.

## Suggested direction (non-binding, optional)
Rewrite or drop the tests-task paragraphs the way sibling modules already
treat landed seams (e.g. cancellation-core.ts:12 states "This module fills in
the behaviour the paired V17a-T tests-task stubbed" — past tense, accurate).

## False-positive check
- Verified each named function's body in the current files: argument-echo.ts
  :202-236 (full switch over `EchoType`), query-render.ts :157-266 (diagnostic
  pushes at the illegal-escape and unterminated arms), :280-305, :396-450,
  :496-543; checkpoint-granularity.ts :72-95 (`await checkpoint.before(...)`
  per iteration), :103-118 (`await binderCall()`); control-flow.ts :52-61
  (`host.evaluateIterand()` then per-element `host.runIteration`). None is a
  stub.
- Checked the already-filed stub-narration findings to avoid re-filing:
  qw20260907130901-d2-01/-08/-09-stale-tests-task-stub-narration,
  qw20260907130901-d2-01-schema-validator/-value-model,
  qw20260907130901-d2-05-tool-call-stub-narration-stale,
  qw20260907183353-d2-03-seam-stub-narration-stale-lexer-parser,
  qw20260907183353-d2-07-parser-seam-stub-narration-stale,
  qw20260907183353-d2-07-extension-modules-stub-narration-stale — their
  location lists cover binder/, diagnostics/, discovery/, extension/, lexer/,
  mvp/, parser/, seams/, and runtime/tool-call*/value/subagent-model-guard
  files; none cites src/render/argument-echo.ts, src/render/query-render.ts,
  src/runtime/checkpoint-granularity.ts, or src/runtime/control-flow.ts.
- Grep `stubs\|tests-task\|paired V` across the eleven in-scope files: the
  only other hit is cancellation-core.ts:12, which is past-tense and accurate,
  so it is not cited.

## Triage

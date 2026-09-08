---
id: PTQ-0047
title: Six runtime tool-call/subagent modules still carry present-tense tests-task stub narration ("V14x-T stubs this …", "RED EXPECTATION … throw not implemented") on fully implemented functions
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/tool-call.ts:39-58
  - src/runtime/tool-call.ts:185-186
  - src/runtime/tool-call.ts:497
  - src/runtime/tool-call.ts:506
  - src/runtime/tool-call.ts:518
  - src/runtime/tool-call.ts:535-536
  - src/runtime/tool-call.ts:548-549
  - src/runtime/tool-call.ts:806-808
  - src/runtime/tool-call.ts:830-831
  - src/runtime/tool-batch.ts:30-35
  - src/runtime/tool-call-execute.ts:53-66
  - src/runtime/tool-call-off-surface.ts:106-108
  - src/runtime/tool-call-off-surface.ts:214-215
  - src/runtime/tool-call-off-surface.ts:325-327
  - src/runtime/tool-call-off-surface.ts:439-442
  - src/runtime/tool-call-host-denial.ts:27-35
  - src/runtime/tool-call-host-denial.ts:101
  - src/runtime/tool-call-host-denial.ts:122-124
  - src/runtime/subagent-model-guard.ts:33-35
sites: 19
fix_scope: cross-module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Six runtime tool-call/subagent modules still carry present-tense tests-task stub narration ("V14x-T stubs this …", "RED EXPECTATION … throw not implemented") on fully implemented functions

## Observation
These modules were built in the repository's tests-task/implementation pairs
(V14a-T→V14a, V14b, V14c, V14d, V14g; RFC-0006 red-then-green for the model
guard). The stub-phase narration was not removed when the implementations
landed: 19 sites still state in present tense that the named functions are
inert stubs — return the empty set, return `""`, return `Err(null)`, emit
nothing, settle nothing, "throw `not implemented: RFC 0006`" — while every
named function in these files is fully implemented today. Sibling waves already
filed the identical smell for binder/, extension/, and discovery/ modules; none
of those findings covers these six runtime files.

## Evidence
src/runtime/tool-call.ts:39-44 (module header) — followed by 8 per-function
repeats at :185-186, :497, :506, :518, :535-536, :548-549, :806-808, :830-831
(search: `grep -n "V14a-T stubs\|V14a-T (tests-task)" src/runtime/tool-call.ts`
→ 9 hits):

```ts
// V14a-T (tests-task) declares these seam shapes and stubs every
// behaviour-bearing function inertly:
//   - `checkToolCallArguments` returns no diagnostics (so the arity, not-literal,
//     type-mismatch, and arity-before-type assertions all red),
//   - `codeToolErrorCauses` returns the empty set and `codeToolErrorKind` /
//     `modelToolErrorKind` return `""` (so the closed-enum and distinctness
```

Current code in the same file: `checkToolCallArguments` (:189) implements all
four checks and returns diagnostics; `codeToolErrorCauses` (:499-501) returns
`["validation", "execution", "cancelled", "unknown_tool"]`; `codeToolErrorKind`
(:508-510) returns `"code_tool"`.

src/runtime/tool-batch.ts:30-35:

```ts
// V14b-T (tests-task) declares this surface and stubs `settleModelToolBatch`
// inertly — it settles no sibling and lowers nothing, returning an empty result
// array — so the settle-all-before-next-turn, per-sibling-independence, and
// failing-sibling `isError: true` assertions each red on their own primary
// expectation, not on a compile error, a missing fixture, or a harness throw.
// The paired V14b implementation leaf fills it in.
```

Current code: `settleModelToolBatch` (:95-134, same file) dispatches the batch
through `Promise.allSettled` and lowers every sibling.

src/runtime/tool-call-execute.ts:53-58 (header; the list runs to :66):

```ts
// V14g-T (tests-task) declares this surface and stubs every behaviour-bearing
// function inertly:
//   - `filterJoinToolText` returns a sentinel constant (so the filter/join and
//     non-text-discard assertions red on their own value),
//   - `lowerResolvedToolEnvelope` returns an inert `Err` (so the accepted-path
//     `Ok(string)` / `Ok("")` assertions red on `.ok`),
```

Current code: all five listed functions are implemented in the same file
(`filterJoinToolText` :152, `lowerResolvedToolEnvelope` :177,
`truncateUtf8CodePointBoundary` :201, `lowerToolExecuteThrow` :234,
`runCodeSideToolCall` :405 — which fires the checkpoint first and dispatches).

src/runtime/tool-call-off-surface.ts — four per-function repeats (search:
`grep -n "V14c-T stubs" src/runtime/tool-call-off-surface.ts` → 4 hits at
:106, :214, :325, :439), e.g. :439-442 on `discardPostCancelSettlement`, whose
current body IS the total no-op the comment promises from a "paired leaf":

```ts
 * V14c-T stubs this to the *non-discarding* behaviour CNCL-1/2/3 forbid — it
 * forwards the late settlement to `observer` — so the no-rebind / no-second-`Err`
 * / no-second-`RuntimeEvent` / no-`internal-error` assertions red. The paired
 * V14c leaf makes this a total no-op.
```

src/runtime/tool-call-host-denial.ts:27-32 (header; per-function repeats at
:101 and :122-124):

```ts
// V14d-T (tests-task) declares the seam and stubs the behaviour-bearing
// functions inertly:
//   - `isHostDenial` returns `false` (so the denial-recognition assertions red),
//   - `classifyHostDenial` returns the *forbidden* silent-`Ok` accepted outcome
//     for every input (so the denial → `Err(CodeToolError { cause: "execution" })`
//     and never-silent-`Ok` assertions red on their own primary assertion).
```

Current code: `isHostDenial` (:103-112) returns the real classification;
`classifyHostDenial` (:126-166) lowers denials to `Err(CodeToolError)`.

src/runtime/subagent-model-guard.ts:33-35:

```ts
// RED EXPECTATION (RFC-0006 not yet implemented): `guardResolvedModel` /
// `confirmChildModel` throw `not implemented: RFC 0006`, so each assertion reds
// on its primary behaviour; the paired implementation leaf greens them.
```

Current code: `guardResolvedModel` (:105-127) and `confirmChildModel`
(:150-174) are implemented in the same file; neither contains a throw
(`grep -n "not implemented" src/runtime/subagent-model-guard.ts` → the comment
only).

## Why this is a problem
Leftover scaffolding narration: comments written for the stub phase that now
make false present-tense claims about the code they annotate ("returns the
empty set", "emits nothing", "throw not implemented"). Each function's actual
behavior is the opposite of what its own doc comment says, so every reader must
reverse-engineer which sentences are history. The repository's convention for
landed pairs is past-tense narration (terminal-outcomes.ts:16-24: "V4c-T
(tests-task) declared the seam … V4c (this leaf) supplies the behaviour"),
showing these were meant to be rewritten when the implementations landed.

## Suggested direction (non-binding, optional)
Rewrite the 19 sites to the landed-pair form the sibling modules use (past
tense: the tests-task declared the seam, this leaf implements it), or delete
the per-function stub sentences outright.

## False-positive check
- Verified every named function is implemented (not a stub) by reading each body in the six files; none returns a sentinel/empty/throwing placeholder. Function start lines confirmed by `grep -n "export function …"` per file.
- Verified none of the three already-filed stale-stub-narration findings covers these files: qw…-d2-01 covers src/binder/* + src/diagnostics/diagnostic.ts; qw…-d2-08 covers src/extension/inventory-closure-audit.ts + load-pre-eval.ts; qw…-d2-09 covers src/discovery/*, src/diagnostics/placeholder.ts, src/extension/drain-state.ts.
- Counted the sites with exact searches: `V14a-T stubs|V14a-T (tests-task)` → 9 hits in tool-call.ts; `V14b-T` → 1 narration block in tool-batch.ts; `V14g-T` header block in tool-call-execute.ts (:53-66); `V14c-T stubs` → 4 hits; `V14d-T` → header + 2 docstrings; `RED EXPECTATION` → 1 hit in subagent-model-guard.ts.
- Confirmed the contrast case: terminal-outcomes.ts (same scope) uses the updated past-tense form, so the stale files are the exception, not a repo-wide convention.

## Triage
verdict: confirmed — all 19 sites reproduce verbatim at cited lines (greps: 9/1/1/4/3/1) and every named function is implemented (codeToolErrorCauses:499 returns 4 causes not the empty set; classifyHostDenial:126 returns Err(CodeToolError) not silent-Ok; RFC 0006 landed in 4866d4d2 so the "throw not implemented" narration is false), no sibling filing covers these six files (triage: claude-opus-5)

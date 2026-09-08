---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: evaluateQuestion's lazy-thunk operand parameter is never exercised lazily — both production call sites wrap an already-evaluated, already-brand-guarded local
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/runtime-panics.ts:407-422
  - src/runtime/statement-executor.ts:1633-1641
  - src/extension/production-theta-producer.ts:8089-8096
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# evaluateQuestion's lazy-thunk operand parameter is never exercised lazily — both production call sites wrap an already-evaluated, already-brand-guarded local

## Observation
`evaluateQuestion(operand: () => ThetaValue)` takes its `?`-operand as a thunk,
and its doc comment states the thunk invocation is load-bearing: "Invoking
`operand` *outside* any surrounding catch is the mechanism by which a panic
bypasses `?`". The repository has exactly two src call sites, and both pass a
constant closure over a local that was fully evaluated — and `isResultValue`
brand-guarded — before the closure is constructed. At both sites a panic thrown
while producing the operand propagates during that earlier evaluation, before
`evaluateQuestion` is ever entered, so the thunk's laziness (the only property
distinguishing the signature from taking the value directly) is exercised by no
production caller.

## Evidence
src/runtime/runtime-panics.ts:407-422 — the bypass claim and the immediate
single invocation of the thunk:

```ts
 * Invoking `operand` *outside* any surrounding catch is the mechanism by which
 * a panic bypasses `?`: a thrown `ThetaPanic` (or `MatchError`) propagates from
 * this call unchanged, never becoming a `propagate` outcome.
 *
 * The internal `as ResultValue` cast is sound only under the caller contract:
 * the operand thunk must yield a brand-verified `ResultValue` (`evalTry`'s
 * `isResultValue` guard — bug 0019); a new caller must guard likewise.
 */
export function evaluateQuestion(operand: () => ThetaValue): QuestionResult {
  // A panic thrown while producing the operand propagates past this call
  // unchanged (no catch surrounds it), so `?` is bypassed.
  const result = operand() as ResultValue;
  return result.ok
    ? { kind: "value", value: result.value }
    : { kind: "propagate", err: result.error };
}
```

src/runtime/statement-executor.ts:1633-1641 — production call site 1
(`evalTry`): `rv` is already a plain value produced by the awaited
`evalAsResult`, guarded, then wrapped in a constant thunk:

```ts
  const rv = operand.value;
  if (!isResultValue(rv)) {
    throw new QuestionOperandDefectError(rv);
  }
  const q = evaluateQuestion(() => rv);
  if (q.kind === "value") {
    return { flow: "value", value: q.value };
  }
  return { flow: "propagate", err: q.err };
```

src/extension/production-theta-producer.ts:8089-8096 — production call site 2
(the pure host's `try` arm), same shape:

```ts
      const operand = evaluatePureExpression(expr.operand, env, chain);
      // §Fix (b) — the ERR-18 brand guard travels with the primitive, exactly
      // as `evalTry` guards before unwrapping; reusing bug 0019's defect class
      // rather than minting a new one.
      if (!isResultValue(operand)) {
        throw new QuestionOperandDefectError(operand);
      }
      const q = evaluateQuestion(() => operand);
```

Call-site census: `grep -rn "evaluateQuestion(" src extensions tools` → exactly
the two invocation sites above (statement-executor.ts:1637,
production-theta-producer.ts:8096) plus the declaration. Both pass
`() => <already-evaluated local>`; neither closure body can throw.

## Why this is a problem
Speculative generality: the thunk is an indirection layer whose distinguishing
capability — deferring operand evaluation into the call so a panic thrown
"while producing the operand" escapes from inside `evaluateQuestion` — has zero
users among the counted src call sites (2 of 2 pass constant closures over
pre-computed values). At both sites the documented bypass property is realised
upstream: the operand is produced by `evalAsResult` / `evaluatePureExpression`
before the thunk exists, so a panic there never reaches `evaluateQuestion` at
all. What remains of the signature in production is pure ceremony — allocate a
closure, call it once, cast the result — plus a doc paragraph asserting a
mechanism ("the mechanism by which a panic bypasses `?`") that no production
path routes through. Only tests pass throwing thunks
(tests/runtime-panics.test.ts:212-216), witnessing a laziness contract the
shipped callers never invoke.

## Suggested direction (non-binding, optional)
Consider taking the operand as a `ThetaValue` (or `ResultValue`, matching the
caller contract the doc already imposes) and letting the two callers pass the
guarded local directly; the panic-bypass obligation is already discharged — and
witnessed — at the callers' own operand evaluation. The fix stage owns whether
the unit tests then witness bypass at the caller level instead.

## False-positive check
- Call-site census: `evaluateQuestion(` searched across src/, extensions/,
  tools/ — 2 invocation sites, both quoted above; no dynamic/string-keyed
  dispatch of the name exists (searched `"evaluateQuestion"` as a string — only
  comments and test narration).
- Laziness-dependence check: both closure bodies are bare identifier reads of a
  local (`() => rv`, `() => operand`); neither can throw or observe ordering,
  so semantics are identical to passing the value.
- Test-caller rule: tests DO exercise the thunk (runtime-panics.test.ts:212-216
  passes throwing thunks; result-value-privacy.test.ts:553-557 passes value
  thunks). This finding therefore does NOT claim the function or parameter is
  dead — it claims the lazy FORM has no production user, i.e. generality with
  zero non-test users of its distinguishing property; the function itself is
  alive at both cited production sites.
- Spec check: error-model.md mandates the bypass SEMANTICS ("a panic bypasses
  `?`"), not a thunk signature; both production sites satisfy the semantics
  without the thunk (panic propagates from the operand's own evaluation).
- Git intent: the signature dates from the V4b seam (`10d797bd` V4b-T /
  `ae94e2bf` V4b), when the seam was expected to receive the operand producer;
  the eager-callers shape arrived with the executor (`evalTry`) and the pure
  host's bug-0116 arm, neither of which uses the deferral.
- Duplicate check: no intake finding cites evaluateQuestion or these lines
  (grep over quality/intake for `evaluateQuestion` — no hits).

## Triage
verdict: questionable — excerpts, census (2 prod call sites) and the eager-caller shape all reproduce, but the anchor is design economy: the laziness's sole deliberate exerciser is the live V4b-T `?`-bypass witness (6 passing tests over throwing thunks) and git refutes the "unfulfilled seam" intent claim (thunk arrived test-first in 10d797bd with that witness), so a human should weigh two `() =>` wrappers against dismantling that witness (triage: claude-opus-5)

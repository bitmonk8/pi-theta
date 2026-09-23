---
id: PTQ-1483
title: PureHost StatementEvalHost double is a near-identical copy between par-for-body-return-refusal.test.ts and static-type-inference.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/par-for-body-return-refusal.test.ts:552-586
  - tests/static-type-inference.test.ts:158-183
  - tests/helpers/par-for-harness.ts:26-42
sites: 2
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# PureHost StatementEvalHost double is a near-identical copy between par-for-body-return-refusal.test.ts and static-type-inference.test.ts

## Observation
`tests/par-for-body-return-refusal.test.ts` declares a private class `PureHost implements StatementEvalHost` whose `evaluatePure` delegates to a private `#eval`, whose `checkpointFor` unconditionally returns `null`, and whose `runEffect` throws an `Error` stating that no effect should ever reach the host. `tests/static-type-inference.test.ts` declares a class of the identical name with the identical method shape and the identical unconditional-throw `runEffect` policy, differing only in the wording of the thrown message and in which literal/operator arms `#eval` handles.

## Evidence
tests/par-for-body-return-refusal.test.ts:552-568:
```ts
class PureHost implements StatementEvalHost {
  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(_expr: Expr): CheckpointDescriptor | null {
    return null;
  }

  async runEffect(): Promise<OperationResult> {
    throw new Error(
      "PureHost: no effect is written in any bug-0223 fold row — an effect " +
        "reaching the host means the source under test is not the row's source",
    );
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
```

tests/static-type-inference.test.ts:158-168:
```ts
class PureHost implements StatementEvalHost {
  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }
  checkpointFor(_expr: Expr): CheckpointDescriptor | null {
    return null;
  }
  runEffect(): Promise<never> {
    throw new Error("read-only body has no checkpointed effects");
  }
  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
```

Both `#eval` bodies handle the same base literal set (`number`, `string`, `bool`, `null`) before diverging on operator coverage; par-for-body-return-refusal.test.ts's file even imports the canonical bounded-pure evaluator (`evalBoundedPure`, tests/helpers/par-for-harness.ts:26-42, covering the identical `number`/`string`/`bool`/`null`/`ident`/`array` set) at its top (`import { evalBoundedPure } from "./helpers/par-for-harness";`, line 2) and calls it inside its own `#eval`, while static-type-inference.test.ts's `#eval` hand-rolls the same four literal arms plus a `binary +` arm from scratch, with no import from `par-for-harness.ts`.

Search: `grep -rl "class PureHost" tests/*.test.ts` returns exactly these two files; no other test file declares a class named `PureHost`.

## Why this is a problem
Two files each carry a full from-scratch declaration of a `StatementEvalHost` whose entire policy — pure evaluation with a checkpoint of `null` and an effect that must never be reached — is the same fixture shape, reimplemented rather than shared. `tests/helpers/par-for-harness.ts` already hosts the bounded-pure-evaluator half of this fixture (`evalBoundedPure`) and one file already imports it for that half while still hand-declaring the throwing-host wrapper around it; the other file reimplements both halves independently. The class name collision (`PureHost` in both files) with divergent bodies is itself evidence the shape was copied rather than factored: a reader who sees `PureHost` in one file and assumes it behaves like the other's would be wrong about which literal/operator arms it accepts.

## Suggested direction (non-binding, optional)
A shared no-effect pure-only `StatementEvalHost` wrapper alongside `evalBoundedPure` in `tests/helpers/par-for-harness.ts` is the natural home the existing partial import already points at.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns. Recording-double check: this `PureHost` never records calls for a MUST-NOT witness — its `runEffect` throw is a fail-fast guard against the fixture being asked to do something the test's plan does not expect, not a negative-witness assertion the test later inspects, so the recording-double carve-out does not apply. docs/bugs/ signature search: `grep -rln "PureHost" docs/bugs/*.md` returned no hits. Coverage-matrix/bug-doc citation search: `grep -rn "PureHost" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits, so neither class is cited by name in a pinning document; this finding proposes no merge, rename, or deletion of either test. `quality/issues` and `quality/intake` were searched for `PureHost` by name with no existing hits, so this is not a re-file of a prior finding.

## Triage
verdict: confirmed — independently re-verified: both `class PureHost implements StatementEvalHost` excerpts match at the cited lines (par-for-body-return-refusal.test.ts:552-596, static-type-inference.test.ts:158-187) with identical evaluatePure→#eval / checkpointFor→null / throwing-runEffect shape differing only in `async` and the throw string; `grep -rln "class PureHost" tests/` → exactly these two files; `evalBoundedPure` (par-for-harness.ts:26-42) is imported only by the par-for file (line 2, used :569) and static-type-inference's hand-rolled number/string/bool/null/binary-`+` arms are a strict subset of the other copy's, whose only driven body is two literals + `2 + 3`, so a shared host is a mechanical dedupe; git shows the static-type-inference copy is the original (57dd14ef 2026-07-04) and the par-for copy a later same-name re-type (3aaf74f8 2026-08-21); neither file is a gate, no recording-double witness, no coverage-matrix citation of either test file, no merge/rename/delete proposed; not a duplicate — resolved PTQ-1331 covered only the par-for PureHost#eval vs ParForHost#eval and its triage note explicitly set the static-type-inference PureHost aside as a distinct untracked class (triage: claude-fable-5-1)

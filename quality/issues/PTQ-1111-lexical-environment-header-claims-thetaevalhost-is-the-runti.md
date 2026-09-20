---
id: PTQ-1111
title: lexical-environment.ts's header claims ThetaEvalHost is "the real EvalHost implementation the V19c statement executor evaluates ... against", but no production code ever constructs one
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/lexical-environment.ts:1-7
  - src/runtime/lexical-environment.ts:30-37
  - src/runtime/lexical-environment.ts:806-812
  - src/extension/production-theta-producer.ts:8218-8231
sites: 4
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# lexical-environment.ts's header claims ThetaEvalHost is "the real EvalHost implementation the V19c statement executor evaluates ... against", but no production code ever constructs one

## Observation
`lexical-environment.ts`'s module header states that this module owns "the
real `EvalHost` implementation the `V19c` statement executor evaluates
`V19a`'s body-AST expressions and statements against", and repeats that
`ThetaEvalHost` is "the real `EvalHost`" seam-realisation this leaf supplies.
No file under `src/`, `extensions/`, or `tools/` ever constructs a
`ThetaEvalHost` or calls `expression-evaluator.ts`'s `evaluateSource` entry
point it implements against. The production interpreter evaluates body-AST
expressions through a separate, self-contained function,
`evaluatePureExpression` (`production-theta-producer.ts`), which reads
`LexicalEnvironment.resolve` / `.resolveSchema` / `.resolveEnumVariant`
directly and never touches `EvalHost`, `ThetaEvalHost`, or `evaluateSource`.

## Evidence
`src/runtime/lexical-environment.ts:1-7` (module header):
```ts
// V19b / V19b-T — the theta lexical environment and scope model.
//
// This module owns the runtime lexical environment and the real `EvalHost`
// implementation the `V19c` statement executor evaluates `V19a`'s body-AST
// expressions and statements against. It is an integration-realisation of the
// `V3a` (`EvalHost`), `V3b` (mutability), and `V15c` (import loader) seams at a
// real host; it closes no new coverage-matrix row.
```

`src/runtime/lexical-environment.ts:30-37`:
```ts
// V19b-T (tests-task) declared these seam shapes — the `LexicalEnvironment`
// scope model, the arm-labelled `Resolution`, the `WriteResult`, the
// `MaterializedImport` / `EnumRegistration` inputs, the `buildEnvironment`
// factory, and the real `ThetaEvalHost` realising `V3a`'s `EvalHost`; V19b
// (this leaf) supplies the behaviour: the precedence walk in `resolve`, the
// `let mut` discipline in `writeBinding`, the per-iteration fresh scopes of
// `bindIterationVariable` / `child`, the `resolveSchema` / `resolveEnumVariant`
// lookups, and the environment-backed `ThetaEvalHost`.
```

`src/runtime/lexical-environment.ts:806-812`:
```ts
// The real EvalHost (V3a seam realisation)
// --------------------------------------------------------------------------

/**
 * The real `EvalHost` (`V3a`'s seam): resolves a bare identifier read and
 * performs a call `f(args)` against the lexical environment, in the
 * expressions.md §"Identifier resolution" first-match order.
 */
export class ThetaEvalHost implements EvalHost {
```

`src/extension/production-theta-producer.ts:8218-8231` (the function that
actually evaluates body-AST expressions in production, reading the
environment directly rather than through `EvalHost`):
```ts
/**
 * Evaluate a pure (non-checkpointed) sub-expression against the environment.
 * The switch below covers the whole pure expression grammar (literals,
 * identifiers, arrays, objects, member/index reads, `fn` calls, `Result`
 * constructors, method calls, `try`, binary/ternary operators and block
 * expressions). An identifier that resolves to a local binding yields its
 * value; any other resolution arm (a bare `fn` / callable name, or an
 * unresolved name) has no first-class readable value and yields `null` — this
 * evaluator's own inert fallback (bug 0116: no such rule is stated in
 * expressions.md) — rather than throwing out of the executor.
 */
function evaluatePureExpression(
  expr: Expr,
  env: LexicalEnvironment,
  chain?: InvokeChain,
): ThetaValue {
```

Search performed: `grep -rn "new ThetaEvalHost" --include="*.ts" .` (excluding
`dist/`) returns exactly one hit,
`tests/lexical-environment.test.ts:134`. `grep -rn "evaluateSource(" --include="*.ts" .`
(excluding `dist/`) returns the declaration itself
(`expression-evaluator.ts:76`) plus five call sites, all in `tests/`
(`e2e-s1-runtime-values.test.ts`, `expression-evaluator.test.ts`,
`subagent-envelope-negative-zero-fidelity.test.ts` ×3). No file in `src/`,
`extensions/`, or `tools/` constructs `ThetaEvalHost` or calls
`evaluateSource`.

## Why this is a problem
The header names `ThetaEvalHost` as the collaborator "the `V19c` statement
executor evaluates ... against" — a specific claim about which code path the
production interpreter runs body-AST expressions through. That claim is
false: `production-theta-producer.ts` evaluates body-AST expressions through
its own `evaluatePureExpression`, an independent switch over `Expr` nodes that
calls `LexicalEnvironment`'s public methods directly, never `EvalHost`,
`ThetaEvalHost`, or `evaluateSource`. `ThetaEvalHost` remains fully
implemented and test-reachable (`tests/lexical-environment.test.ts` exercises
it directly), so this is not a dead-code claim — it is the header's account
of what the production `V19c` executor actually calls that is wrong, matching
the "miscounts its collaborators" filing target for stale header prose.

## Suggested direction (non-binding, optional)
Correct the header (and the `ThetaEvalHost` doc comment) to describe
`ThetaEvalHost`/`evaluateSource` as the standalone `V3a` conformance
implementation exercised directly by its own tests, distinct from the
interpreter's own `evaluatePureExpression`, rather than claiming the `V19c`
executor runs through it.

## False-positive check
- Reference searches run: `grep -rn "new ThetaEvalHost" --include="*.ts" .`
  and `grep -rn "evaluateSource(" --include="*.ts" .`, both excluding
  `dist/` — every hit enumerated above; no string-keyed or dynamic
  construction found (`ThetaEvalHost` is a named class export, not a
  registry entry).
- Re-export check: `grep -rn "export \* from .*lexical-environment\|export \* from .*expression-evaluator"` — no hits; no re-export path could supply another caller.
- Test-only-caller rule: not engaged as a deadness claim — `ThetaEvalHost`
  and `evaluateSource` remain implemented and are legitimately exercised by
  their own witness tests; the claim here is confined to the header's
  assertion about what the *production* `V19c` executor calls, which is
  independently checked against `evaluatePureExpression`'s existence and its
  34 call sites in `production-theta-producer.ts`.
- Git-history check: `git log -S"new LoomEvalHost"` (the pre-rename spelling)
  shows the class was introduced at V19b-T (`adb0a7e4`) and constructed only
  in its own test file from the start — not a caller that was later removed,
  but a collaborator the header has mis-described since introduction.

## Triage
<!-- appended by triage -->
verdict: confirmed — all four excerpts match at cited lines; re-ran the hunt: `new ThetaEvalHost` appears only in tests/lexical-environment.test.ts:134 and `evaluateSource` has only test callers (5 sites), no re-export or string-keyed path; the V19c executor (src/runtime/statement-executor.ts:1424) evaluates via `StatementEvalHost.evaluatePure`, wired in production to `evaluatePureExpression` (production-theta-producer.ts:2266), never touching `EvalHost`/`ThetaEvalHost`; git shows no production constructor since adb0a7e4, so the header's collaborator claim has been false since introduction; not a deadness filing (class is test-exercised), and PTQ-0072 addressed a different (stub-narration) defect in this header (triage: claude-fable-5-1)

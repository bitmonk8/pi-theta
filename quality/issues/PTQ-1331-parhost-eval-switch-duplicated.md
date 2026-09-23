---
id: PTQ-1331
title: par-for-body-return-refusal.test.ts's PureHost#eval reimplements the canonical ParForHost#eval bounded-pure-evaluator byte-for-byte
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/par-for-body-return-refusal.test.ts:551-598
  - tests/helpers/par-for-harness.ts:34-83
sites: 2
fix_scope: cross-module        # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# par-for-body-return-refusal.test.ts's PureHost#eval reimplements the canonical ParForHost#eval bounded-pure-evaluator byte-for-byte

## Observation
`tests/par-for-body-return-refusal.test.ts` declares a module-scope `class PureHost implements StatementEvalHost` whose private `#eval` method is a bounded pure-expression evaluator over `number`/`string`/`bool`/`null`/`ident`/`array` expression kinds. `tests/helpers/par-for-harness.ts` already exports `class ParForHost implements StatementEvalHost`, an explicitly-canonical par-for `StatementEvalHost` double ("the union of the tests/par-for.test.ts recording host and the tests/b0324 gated host"), whose own `#eval` carries the identical six-case switch body. `PureHost` is not imported from that helper; it is a fresh top-level class declared locally, adding one extra `case "binary"` arm the canonical host does not need.

## Evidence
`tests/par-for-body-return-refusal.test.ts:567-583` (re-read immediately before filing):
```ts
  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident": {
        const r = env.resolve(expr.name);
        return "value" in r ? ((r.value ?? null) as ThetaValue) : null;
      }
      case "array":
        return expr.elements.map((e) => this.#eval(e, env));
```

`tests/helpers/par-for-harness.ts:66-80` (re-read immediately before filing):
```ts
  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident": {
        const r = env.resolve(expr.name);
        return "value" in r ? ((r.value ?? null) as ThetaValue) : null;
      }
      case "array":
        return expr.elements.map((e) => this.#eval(e, env));
```

The two excerpts are identical line-for-line (case order, guard text, and the `"value" in r ? ((r.value ?? null) as ThetaValue) : null` idiom). `evaluatePure` (`return this.#eval(expr, env);`) is also identical in both classes (par-for-body-return-refusal.test.ts:552-554, par-for-harness.ts:41-43). The two classes diverge only in `checkpointFor` (`ParForHost` gates on `call`/`query`/`invoke` for a tool-call checkpoint; `PureHost` always returns `null`), in `runEffect` (`ParForHost` records dispatch/concurrency; `PureHost` throws, since no bug-0223 fold row reaches an effect), and in the one added `case "binary"` arm `PureHost` needs for `i * 10` / arithmetic operands.

## Why this is a problem
`tests/helpers/par-for-harness.ts` is the named canonical home for a `StatementEvalHost` double over exactly this bounded pure-expression surface for `par for` bodies (its own header comment states it is "the union of the tests/par-for.test.ts recording host and the tests/b0324 gated host"). `par-for-body-return-refusal.test.ts` re-types the same six-case `#eval` switch and the same one-line `evaluatePure` delegation rather than importing and extending it, so a change to the bounded pure-evaluator's semantics (e.g. adding a seventh expression kind, or fixing the `"value" in r` resolve idiom) must be made in this file's private copy as well as the helper's, with nothing forcing the two to move together.

## Suggested direction (non-binding, optional)
The shared six-case switch is observably already carved out as its own concern inside two differently-behaving hosts (`checkpointFor`/`runEffect` vary, `#eval`'s bounded-literal core does not); a shared base or exported evaluator function in `tests/helpers/par-for-harness.ts` that each host's `#eval` calls before falling through to its own extra cases (this file's `binary`) is the natural next home, named as observation rather than as a design.

## False-positive check
- Gate-pin check: `par-for-body-return-refusal.test.ts` does not match `*gate*.test.ts` or the named gate kin.
- Recording-double check: neither `PureHost` nor `ParForHost` is cited here as a "never called" negative witness; `PureHost`'s `runEffect` throwing is a fail-loud guard against an unexpected effect reaching it (documented in its own error message), not a MUST-NOT-call recorder this finding's claim rests on — the claim is only about the `#eval` switch's duplicated definition.
- docs/bugs/ signature search: `grep -rl "par-for-body-return-refusal" docs/bugs` → hits only `docs/bugs/0223-par-for-body-return-folds-unenumerated.md`, which names this file as bug 0223's own witness suite and does not pin `PureHost`'s implementation, so no documented correct-reason-red or witness-shape lock applies to the class body.
- coverage-matrix/bug-doc citation search: `grep -n "par-for-body-return-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that a locally-declared class's private evaluator duplicates an existing exported helper's.
- Coverage check: the claim is about a duplicated fixture DEFINITION already present and exercised by 15 passing `it()` blocks in this file; no new test path is proposed.
- `grep -rn "PureHost" tests/*.ts` → declared and used only in this one file (5 hits total, all within it), so this is not a re-file of any prior `ParForHost`-family finding (PTQ-0483/PTQ-0629/PTQ-0692, all resolved) — none of those three cites `PureHost` or this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match at the cited lines (par-for-body-return-refusal.test.ts:551-598, par-for-harness.ts:34-83); the six-case number/string/bool/null/ident/array `#eval` switch and the one-line `evaluatePure` delegation are byte-identical between PureHost and the exported canonical ParForHost, with PureHost's only additions being the `binary` arm and the divergent checkpointFor/runEffect exactly as the filing states, and the test file imports from three tests/helpers modules but not par-for-harness; not a gate file, `grep par-for-body-return-refusal docs/reference/coverage-matrix.md` → 0 hits, docs/bugs/0223 names the file as witness but no it() merge/rename/delete is proposed; not a duplicate of resolved PTQ-0483/0629/0692 (this file is in none of their site lists) and PTQ-0692 precedent already confirms a partial-`#eval` host copy with divergent runEffect; one inaccuracy in the FP-check only — `grep -rn PureHost tests/` also hits tests/static-type-inference.test.ts:158 (a distinct number/string/bool/null/binary class without ident/array), which does not affect the root cause here (triage: claude-fable-5-1)
</content>

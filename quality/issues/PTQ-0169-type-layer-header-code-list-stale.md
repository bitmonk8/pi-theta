---
id: PTQ-0169
title: type-layer-checks' header enumerates the code-keyed areas the module realises and omits two codes the module itself constructs — non-numeric-arithmetic-operands (A7) and non-integer-max
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-checks.ts:12-33
  - src/parser/type-layer-checks.ts:3257-3263
  - src/parser/type-layer-checks.ts:3846-3880
  - src/parser/type-layer-checks.ts:3901-3907
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# type-layer-checks' header enumerates the code-keyed areas the module realises and omits two codes the module itself constructs — non-numeric-arithmetic-operands (A7) and non-integer-max

## Observation
The module header states "each diagnostic is an integration realisation of a
code-keyed area owned on its original leaf —" and then lists the areas as
bullets, followed by a paragraph naming which of them defer on unresolvable
operands ("A5 / A6 / A2 fire ONLY when the operand / receiver static type is
concretely resolvable"). The file constructs diagnostics for six distinct
codes directly. Two of them appear nowhere in the header: the A7 spelled- and
unary-arithmetic operand check (`theta/parse/non-numeric-arithmetic-operands`,
two emission sites) and the `par for` `max` operand check
(`theta/parse/non-integer-max`, one emission site).

## Evidence
src/parser/type-layer-checks.ts:12-33 — the enumeration and its follow-up
paragraph (verbatim, lines :12-:26 plus :28-:29):

```ts
// It closes no new spec REQ-ID: each diagnostic is an integration realisation of
// a code-keyed area owned on its original leaf —
//   * `theta/parse/non-boolean-condition` (cka-4, V3a),
//   * `theta/parse/non-array-iterand` (cka-5, V3c),
//   * `theta/parse/question-on-non-result` / `theta/parse/question-outside-result-fn` (V4a),
//   * `theta/parse/array-no-common-type` (V3a), `theta/parse/return-no-common-type` (V3d),
//   * `theta/parse/integer-narrowing` (V2b), `theta/parse/match-arm-type-mismatch` (V4a),
//   * `theta/parse/non-indexable-receiver` (V3a), `theta/parse/non-string-object-index` (V3h),
//   * `theta/parse/non-string-array-join` (V3g),
//   * `theta/parse/mixed-plus-operands` (A5) / `theta/parse/non-orderable-operands`
//     (A6) — the `+` / ordering operand-type checks (expressions.md §"`+`
//     operator", §"Ordering comparisons"),
//   * `theta/parse/unknown-method` (A2) — a member / method access on a built-in
//     receiver type outside the theta 1.0 stdlib surface (expressions.md
//     §"Built-in methods and properties").
// A5 / A6 / A2 fire ONLY when the operand / receiver static type is concretely
// resolvable.
```

src/parser/type-layer-checks.ts:3257-3263 — an unlisted code, constructed in
this file (`walkExpr`'s `par for` arm):

```ts
            this.diagnostics.push({
              severity: "error",
              code: "theta/parse/non-integer-max",
              file: this.file,
              range: e.max.range,
              message: `'par for' max operand must be integer-typed; got ${displayType(maxType)}`,
            });
```

src/parser/type-layer-checks.ts:3846-3880 — the second unlisted code, with its
own letter (A7) and the same resolvability discipline the header attributes to
A5/A6/A2 only:

```ts
  /**
   * A7 — the spelled arithmetic (`-` / `*` / `/` / `%`) operand-type check.
   * expressions.md §"Other arithmetic": these accept only numeric operands;
   * every other concrete pairing is `theta/parse/non-numeric-arithmetic-operands`
   * (bug 0332). Mirrors `checkOrderingOperands`: fires only when both operands
   * are statically resolvable, deferring a statically-unresolvable operand to
   * runtime, ...
   */
  private checkArithmeticOperands(
```

```ts
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/non-numeric-arithmetic-operands",
      file: this.file,
      range: e.range,
```

src/parser/type-layer-checks.ts:3901-3907 — its unary sibling
(`checkUnaryArithmeticOperand`, bug 0392) emitting the same unlisted code:

```ts
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/non-numeric-arithmetic-operands",
      file: this.file,
      range: e.range,
      message: `unary '-' requires a numeric operand; got ${displayType(rightType)}`,
    });
```

## Why this is a problem
The header is a closed inventory of the module's diagnostic surface ("each
diagnostic is …" followed by the list) and a closed statement of which checks
defer on unresolvable operands. Both went out of step with the code as later
checks landed in the same file: `git log -S "non-numeric-arithmetic-operands" -- src/parser/type-layer-checks.ts`
returns `6ed73f9b` (bug-0332, v0.299.0) and `a5355f72` (bug-0392, v0.387.0);
`git log -S "non-integer-max" -- src/parser/type-layer-checks.ts` returns
`d9b74193` (bug-0324, v0.312.0); the header's list dates from `d23c22be`. None
of the three commits extended the list. A reader using the header to learn what
this module can refuse a load for misses an entire operand-type family and the
`par for` `max` refusal, and the "A5 / A6 / A2 fire ONLY when …" sentence
understates the set that shares the discipline (A7's own doc at :3851-3853
states the same deferral).

## Suggested direction (non-binding, optional)
Add the two codes (and A7's letter) to the header list and to the deferral
sentence, or reword the list as illustrative rather than exhaustive;
comment-only.

## False-positive check
- Emission census: `grep -n "code: \"theta/parse/" src/parser/type-layer-checks.ts`
  → 7 hits over 6 distinct codes: `integer-narrowing` (:3246),
  `non-integer-max` (:3259), `unknown-method` (:3756), `mixed-plus-operands`
  (:3803), `non-orderable-operands` (:3838), and
  `non-numeric-arithmetic-operands` (:3874, :3903). Four of the six
  (`integer-narrowing`, `unknown-method`, `mixed-plus-operands`,
  `non-orderable-operands`) appear in the header list; the two cited here do
  not.
- Header search for the missing names: `grep -n "A7\b" src/parser/type-layer-checks.ts`
  → one hit, :3848 (inside `checkArithmeticOperands`'s own doc, not the
  header). `grep -n "non-numeric-arithmetic\|non-integer-max" src/parser/type-layer-checks.ts`
  → hits at :3259, :3262 (message), :3850, :3874, :3903 only — none in lines
  1-40.
- Reachability: both checks are live production code. `checkArithmeticOperands`
  / `checkUnaryArithmeticOperand` are called from `walkExpr`'s `binary` arm
  (`ARITHMETIC_OPS` gate at :122; dispatches at :3121 and :3129, plus the
  interpolation-operand route at :3490) and `non-integer-max` fires inside
  `walkExpr`'s `par-for` arm at :3257; no deadness is claimed here.
- Duplicate check: `grep -rn "non-numeric-arithmetic\|non-integer-max" quality/intake/`
  → no hits; `grep -rl "src/parser/type-layer-checks.ts" quality/intake/` shows
  eight findings, none citing lines 1-40 of the file (they cite :331-337,
  :981-1008, :2287-2292, :3069-3104, :86).
- Behaviour: the header is comment text; nothing reads it.

## Triage
verdict: confirmed — independently reproduced: header :12-33 byte-matches and its subject is unscoped ("each diagnostic is an integration realisation of a code-keyed area" + list), yet `grep 'code: "theta/parse/'` gives 7 emissions over 6 codes of which `non-integer-max` (:3269) and `non-numeric-arithmetic-operands` (:3884, :3913; ~10-line drift from the cited :3259/:3874/:3903) appear nowhere in lines 1-40 while both are registered peers of the listed codes in docs/spec_topics/diagnostics/code-registry-parse.md:29/:43; blame puts the list at d23c22be (2026-07-13; 2bc69157 on 07-19 was only the Loom→Theta rename) and the three later commits 6ed73f9b/d9b74193/a5355f72 minted both codes in this very file (first `-S` hit anywhere in src/) without touching the header (hunks start at :117/:1738/:3074, :3212, :2798/:3088), so the "A5 / A6 / A2 fire ONLY when…" sentence is also stale — A7's doc (:3858-3863) states the same deferral and the `non-integer-max` arm (:3260-3264) explicitly refers back to "the type layer's documented posture"; reachability holds (dispatches :3123/:3131/:3500, par-for arm :3269); no existing PTQ or intake sibling covers the header list; sole inaccuracy is the claimed ":3262 (message)" hit — the message text does not contain the code name (4 hits, not 5) — immaterial to the root cause (triage: claude-opus-5)

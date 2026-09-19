---
id: PTQ-0967
title: fnArg()/letRhs() registry-message builder functions redeclared byte-identically across both in-scope files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/loop-element-withhold-binding-scoped.test.ts:215-232
  - tests/loop-element-withhold-binding-scoped.test.ts:235-244
  - tests/match-arm-scope-inference-pass.test.ts:280-297
  - tests/match-arm-scope-inference-pass.test.ts:206-215
sites: 4
fix_scope: cross-module
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# fnArg()/letRhs() registry-message builder functions redeclared byte-identically across both in-scope files

## Observation
Both in-scope files declare a module-scope `fnArg(name, index, param,
expected, actual)` function and a `letRhs(name, expected, actual)` function.
Each pair calls the file's own local `fill()` with the file's own local
`FN_ARG`/`LET_RHS` code constant and an identical `Map` of named
placeholders in the identical order. The two files' `fnArg` bodies are
byte-identical to each other, and the two files' `letRhs` bodies are
byte-identical to each other.

## Evidence
tests/loop-element-withhold-binding-scoped.test.ts:215-232 (re-read
immediately before filing):
```ts
function fnArg(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG,
    new Map([
      ["<name>", name],
      ["<i>", String(index)],
      ["<param>", param],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

tests/match-arm-scope-inference-pass.test.ts:280-297 (re-read immediately
before filing) — byte-identical body:
```ts
function fnArg(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG,
    new Map([
      ["<name>", name],
      ["<i>", String(index)],
      ["<param>", param],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

tests/loop-element-withhold-binding-scoped.test.ts:235-244:
```ts
function letRhs(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

tests/match-arm-scope-inference-pass.test.ts:206-215 — byte-identical body:
```ts
function letRhs(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

Exact commands run: `diff <(sed -n '/^function fnArg/,/^}$/p' tests/loop-element-withhold-binding-scoped.test.ts) <(sed -n '/^function fnArg/,/^}$/p' tests/match-arm-scope-inference-pass.test.ts)` → zero output; `diff <(sed -n '/^function letRhs/,/^}$/p' tests/loop-element-withhold-binding-scoped.test.ts) <(sed -n '/^function letRhs/,/^}$/p' tests/match-arm-scope-inference-pass.test.ts)` → zero output.

Wider pattern search: `grep -rl "^function fnArg(" tests/*.test.ts` → 6 files
(the two in-scope files plus tests/fn-arg-member-read-proof.test.ts,
tests/let-arm-withhold-binding-scoped.test.ts,
tests/params-declared-type-in-type-layer.test.ts,
tests/plain-for-loop-variable-element-type.test.ts); `grep -rl "^function
letRhs(" tests/*.test.ts` → 8 files (the same six plus
tests/enum-shadow-member-type.test.ts and
tests/member-access-declared-field-type.test.ts). This finding files only
the two in-scope files' pairwise duplication; the sibling counts are stated
for completeness, not claimed as independently re-verified byte-identical
here.

## Why this is a problem
Both functions are pure re-renderings of a registered diagnostic *Message*
template through the file's own `fill()`, with the same parameter list, the
same `Map` key order, and the same body — nothing about either function's
logic is specific to bug 0194 (the loop-element file's subject) versus bug
0145 (the match-arm-scope file's subject); both files judge the same two
registered codes (`theta/parse/fn-arg-type-mismatch`,
`theta/parse/let-rhs-type-mismatch`) and render them identically. Neither
`tests/helpers/registry-oracle.ts` nor `tests/helpers/load-row-harness.ts`
exports an `fnArg`/`letRhs`-shaped per-code renderer, so each file re-derives
the same five-line and nine-line function bodies against its own local
`fill()`.

## Suggested direction (non-binding, optional)
A shared per-code renderer for `theta/parse/fn-arg-type-mismatch` and
`theta/parse/let-rhs-type-mismatch`, parameterised by the `fill`-shaped
interpolator each file already builds from the common
`tests/helpers/registry-oracle.ts` primitives, is the natural home the two
in-scope files' identical bodies already point at.

## False-positive check
- Gate-pin check: neither in-scope file matches `*gate*.test.ts` or the
  named gate kin; this finding concerns two renderer-function definitions,
  not a pinned count or inventory.
- Recording-double check: `fnArg`/`letRhs` render diagnostic message
  strings consumed by ordered-equality assertions; neither records a call
  or backs a "never called" witness, so the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: `grep -rl "function fnArg\|function letRhs"
  docs/bugs/*.md` → 0 hits; no open bug document discusses this
  duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "loop-element-withhold-binding-scoped\|match-arm-scope-inference-pass"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()`
  name, only that the two renderer functions' bodies could be shared.
- Coverage check: the claim is entirely about a repeated renderer-function
  DEFINITION; every row in both files continues to render and assert its own
  diagnostics exactly as written.
- Prior-finding search: `grep -rl "function fnArg\|fnArg.*duplicat\|letRhs.*duplicat" quality/issues quality/resolved quality/intake` → one hit,
  `quality/issues/PTQ-0786-...`, which concerns `tests/live/live-production-acceptance.test.ts`'s
  `...Fragment` renderers reimplementing `registryMessageOf`/`registryLineOf` — a
  different pair of files and a different named canonical helper; it does not
  cite `fnArg`, `letRhs`, or either in-scope file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce at loop-element-withhold-binding-scoped.test.ts:215-232/235-244 and match-arm-scope-inference-pass.test.ts:280-297/206-215; mktemp sed-extract + diff of `fnArg` (18 lines) and `letRhs` (10 lines) → zero diff, and the two files' `fill(code, subs)` wrappers over `interpolateStrict` are byte-identical too, so a shared per-code renderer is a mechanical lift; all copies live (fnArg 6/3, letRhs 2/1 call sites), both files under tests/ with no gate/live/recording-double/red-test carve-out (docs/bugs `function fnArg\|function letRhs` → 0, coverage-matrix → 0, no it()/describe() change proposed); no tests/helpers module exports a per-code `fnArg`/`letRhs` (registry-oracle.ts exports readRegistry/interpolate/interpolateStrict only; load-row-harness.ts `registryMessageOf` is a generic code+subs renderer, not these builders); stated wider counts reproduce (`^function fnArg(` → 6 files, `^function letRhs(` → 8 files) and my own diff shows fnArg byte-identical in all 6 and letRhs byte-identical in 6 of 8 (enum-shadow-member-type and member-access-declared-field-type differ), so treat the cited pair as the canonical slice and fold the 4 further identical fnArg sites and 4 further identical letRhs sites into the location list at acceptance; not a duplicate — PTQ-0805 (fixed) covered the two-guard `fill` interpolation beneath these builders, PTQ-0549 bundles `letRhsMessage` only inside the division/modulo whole-harness pair, PTQ-0786 covers tests/live `...Fragment` renderers; none tracks the shared `fnArg`/`letRhs` per-code renderer (triage: claude-fable-5-1)

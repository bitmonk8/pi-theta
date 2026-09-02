# Bug 0368 — `+` and the four ordering operators have no runtime operand belt, so pairings the spec refuses silently JS-coerce when they reach the runtime through statically-withheld operands: `f("x", 1)` → `"x1"`, `f(null, 5)` → `5`, `f(true, true)` → `2`, `f([1], [2])` → `"12"`, `g(true, 2)` under `<` → `true` — while the identical laundering under `-` throws the bug-0332 belt

- **Status:** fixed (0.348.0).
- **Sev/Diff estimate:** S1/D1 — S1 because the coerced results are silent,
  plausible values on the production evaluation path (`"x1"`, `5`, `2`,
  `"12"`, boolean verdicts from cross-type ordering), with zero diagnostics at
  parse (the operand gates correctly defer on withheld types) and zero at
  runtime; the class letter matches 0332/0338, which S1'd the same silent
  JS-coercion for `-`/`*`/`/`/`%`. D1 because the fix is the established belt
  pattern applied to the remaining arms of the two existing sinks
  (`applyBinaryScalar`, `evaluateBinaryExpression`) — existing defect-class
  routing, no registry adjudication, no parse-layer change.
- **Kind:** defect against the operator operand rules on the laundered runtime
  path. `docs/spec_topics/expressions.md` §"`+` operator": two numbers add,
  two strings concatenate, "Mixed-type operands are
  `theta/parse/mixed-plus-operands`", and "`+` on `array<T>` is not
  supported". §"Ordering comparisons": `<`/`<=`/`>`/`>=` "accept either two
  `number`/`integer` operands or two `string` operands. Any other operand
  pairing … is `theta/parse/non-orderable-operands`". Both gates are
  parse-time and both defer on a statically-unresolvable operand (a WITHHELD
  `fn` parameter); unlike `-`/`*`/`/`/`%` (belted by 0332/0338), no runtime
  check re-judges the deferred pairing, and both hosts fall through to raw JS
  operator semantics.
- **Related:**
  - 0332 (fixed 0.299.0) — established the two-layer discipline for
    `-`/`*`/`/`/`%`: parse gate for resolvable pairs, `BinaryNonNumericError`
    runtime belt for deferred ones. Its §Non-goals reads "`+` on mixed
    operands and the ordering operators — already gated" — true of the PARSE
    surface only; the runtime deferred path this report measures was never in
    its scope.
  - [0338](./0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md)
    (fixed 0.311.0) — mirrored the 0332 belt into the pure host
    (`evaluateBinaryExpression`), again for the four numeric operators only.
    Its §Non-goals bullet 3 excludes `+`/ordering BY NAME as a scope
    exclusion: "The `+` and ordering operand checks in interpolation
    position. … Their runtime dispositions are not silent-NaN (`+`
    concatenates or adds; ordering yields a boolean), so they are outside
    this report's silent-coercion surface." A scope exclusion, not a
    residual owning the class — no filed report owns the `+`/ordering
    runtime arms.
  - [0345](./0345-interpolation-expressions-skip-all-operand-checks-at-parse.md)
    (fixed 0.317.0) — closed the interpolation PARSE boundary, so
    resolvable mixed pairs inside `${…}` now refuse at load; laundered pairs
    still defer into the unbelted runtime arms measured here. Its §Fix
    §Residuals item 1 is the corpus's only concession of the runtime
    behaviour ("JS coercion for `+`/ordering"), and concedes it narrowly —
    the par-for-in-interpolation deferral posture only.
  - `[bug 0366](./0366-join-element-precondition-no-runtime-belt.md)` and `[bug 0369](./0369-control-flow-runtime-kind-fallbacks-silent.md)` — same
    laundered-runtime-belt family ("parse gate correctly defers on withheld
    operands → runtime raw-JS coerces"), disjoint sinks: 02 is the
    `stdlib-array.ts` `join` element walk; 05 is the boolean/iterand
    control-flow kind discipline. Neither fix closes any row of this one.
  - 0314 (fixed 0.293.0) — the compound sibling: its `+=` desugar routes
    through the same shared `+` arm, so this report's fix also closes
    `s += n` over laundered operands (currently `"x1"` by the same mechanism).
- **Affected** (verified at af476df2, v0.347.0):
  - `src/runtime/statement-executor.ts:1075-1078` — `applyBinaryScalar`'s `+`
    arm: `typeof left === "string" && typeof right === "string" ? left + right
    : (left as number) + (right as number)`. Any pairing that is not
    two-strings takes the numeric add with raw JS coercion: string+number
    concatenates (`"x" + 1` → `"x1"`), `null` coerces to `0`, booleans to
    `0`/`1`, arrays stringify (`[1] + [2]` → `"12"`).
  - `src/runtime/statement-executor.ts:1105-1112` — the ordering arms:
    `(left as number | string) < (right as number | string)` etc. — raw JS
    relational semantics on whatever arrived (boolean→number coercion,
    string-vs-number coercion).
  - `src/extension/production-theta-producer.ts:7483-7486` and `:7512-7521` —
    the pure host's identical `+` and ordering arms
    (`evaluateBinaryExpression`), serving `${…}` interpolations and
    invoke/`.theta`-callable arguments; equally unbelted.
  - `src/runtime/statement-executor.ts:1079-1103` (belt throw at `:1091-1092`)
    — the contrast in the same switch: the `-`/`*`/`/`/`%` arms throw
    `BinaryNonNumericError` on any non-number operand (0332's belt) — the sibling-position asymmetry this
    report closes.
  - `src/parser/type-layer-checks.ts` — `checkPlusOperands` /
    `checkOrderingOperands` defer when either operand's static type is
    unresolvable (the WITHHELD-binder discipline shared with
    `checkArithmeticOperands`); correct, and what routes the class here.
- **Observed at:** 0.347.0 (af476df2), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

Bugs 0332/0338 fixed the "parse gate defers → runtime silently JS-coerces"
defect for the four numeric-only operators by adding loud runtime belts to
both evaluation hosts. The same laundering class exists for `+` and for the
four ordering operators — their parse gates defer on withheld operand types in
exactly the same way — but neither host re-judges the pair at runtime: the `+`
arm falls to a raw JS `+` whenever the pair is not two-strings, and the
ordering arms apply raw JS relational operators to whatever arrived. A mixed
or non-orderable pairing flowing through an unannotated `fn` parameter
therefore binds a silent JS-coerced value (`"x1"`, `5`, `2`, `"12"`, or a
boolean verdict from a cross-type comparison), while the byte-identical
laundering under `-` aborts loudly with `BinaryNonNumericError`. The
disposition of one spec-refused operand pairing depends on which operator the
author picked.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics `[]` in every row (the withheld params defer every gate).

| # | Source (body) | Observed |
|---|---|---|
| D1 | `fn f(a, b) { a + b }` / `f("x", 1)` | `outcome=success value="x1"` |
| D2 | `fn f(a, b) { a + b }` / `f(null, 5)` | `outcome=success value=5` |
| D3 | `fn f(a, b) { a + b }` / `f(true, true)` | `outcome=success value=2` |
| D4 | `fn f(a, b) { a + b }` / `f([1], [2])` | `outcome=success value="12"` |
| D5 | `fn g(a, b) { a < b }` / `g(true, 2)` | `outcome=success value=true` |
| D6 | `fn g(a, b) { a < b }` / `g("5", 3)` | `outcome=success value=false` (string coerced to number) |
| D7 | `fn g(a, b) { a <= b }` / `g(null, 1)` | `outcome=success value=true` |
| D8 (control) | `fn f(a, b) { a - b }` / `f("a", 1)` | `THREW BinaryNonNumericError … (bug 0332)` |

D8 is the asymmetry witness: the identical laundering shape one operator over
is loud.

## Expected behaviour

`docs/spec_topics/expressions.md` §"`+` operator" and §"Ordering comparisons"
refuse every pairing the rows above exercise. Per the settled two-layer
discipline (0332 §Expected: "the same disposition the ordering operators
already have" — at parse — and the runtime belt for deferred pairs; 0338
§Expected: "the disposition must not depend on the evaluation position"), a
deferred pairing reaching the runtime must abort loudly, not bind a JS-coerced
value. D1–D7 should behave as D8 does.

## Actual behaviour / root cause

The 0332/0338 belts were scoped to the operators their reports measured
(`-`/`*`/`/`/`%`); the `+` and ordering arms of both `applyBinaryScalar` and
`evaluateBinaryExpression` retain their pre-0332 raw-JS shape. The `+` arm's
two-string test makes string concatenation correct, but its else-branch is a
JS `+` over unchecked operands — the exact shape 0332 §Affected described for
`-`. The ordering arms have no test at all. `NaN`/`Infinity` operands are
`typeof "number"` and must stay admitted (spec: div/mod-by-zero products flow
through arithmetic and ordering without panic), so the belts' existing
`typeof`-based predicate transfers directly.

## Why it matters

Untyped helper `fn`s are the language's own recommended decomposition unit,
and `a + b` / `a < b` inside one is the ordinary case. A caller passing a
string where a number was meant (or vice versa) gets a silently concatenated
`"x1"` or a coerced comparison verdict that steers an `if` — plausible values
with author intent dropped and zero diagnostics on any channel. D3/D4's finite
plausible results (`2`, `"12"`) are the worst shape: they read as legitimate
computation. Impact class 1, same as the fixed 0332/0338 siblings.

## Non-goals

- The parse gates — `mixed-plus-operands` / `non-orderable-operands` fire
  correctly on resolvable pairs and correctly defer on withheld ones; no
  parse-layer change is owed.
- `==` / `!=` — cross-type equality is defined (`false`/`true`) and correctly
  implemented via `valuesEqual`; not part of this class.
- Boolean-position operands (`&&`/`||` operands, conditions) — a separate
  construct family with its own report, `[bug 0369](./0369-control-flow-runtime-kind-fallbacks-silent.md)`.
- The compound forms — `+=` desugars through the same shared `+` arm, so this
  fix covers it; no separate compound change.

## Fix

Extend the existing belts in the two sinks, mirroring 0332/0338 byte-for-byte
in style:

- `+`: after the two-string arm, require two numbers; otherwise throw a
  `BinaryMixedPlusError extends Error` (or widen `BinaryNonNumericError` with
  the op) routed through `surfaceUnexpectedThrow` → `theta/runtime/internal-error`.
- `<`/`<=`/`>`/`>=`: require two numbers or two strings; otherwise throw the
  same class.

Apply identically in `applyBinaryScalar` (statement-executor.ts) and
`evaluateBinaryExpression` (production-theta-producer.ts) — the 0338 lockstep
obligation. Constraints: two-string `+`/ordering and all-numeric pairs
(including `NaN`/`±Infinity` operands) stay byte-identical; D8's existing
belt unchanged; no new registry code (internal-error routing per precedent).
The compound `+=` path (bug 0314's `applyCompound` `+` mirror) must gain the
same check or keep delegating to the shared arm.

## Provenance

Found by diffing `applyBinaryScalar`'s per-operator arms against the 0332/0338
fix records during the runtime-exec-2 re-sweep at af476df2 — the belts stop at
exactly the four operators those reports measured. All eight rows probed
offline through the production executor harness before filing. Scratch probes
deleted.

## Fix (0.348.0)

- **What shipped** (keyed to §Fix):
  - `src/runtime/statement-executor.ts` — new `export class
    BinaryMixedOperandError extends Error` (plain `Error`, NOT a `ThetaPanic`,
    reframed through `surfaceUnexpectedThrow` → `theta/runtime/internal-error`
    exactly as `BinaryNonNumericError`); `applyBinaryScalar`'s `+` arm
    (two-string concat / two-number add / else throw) and merged ordering block
    (`bothNumbers || bothStrings` guard, else throw; inner switch over the four
    ops); `applyCompound`'s `+=` arm gains the same belt (shared `+` semantics
    per bindings.md `x += e` desugar).
  - `src/extension/production-theta-producer.ts` — imports
    `BinaryMixedOperandError`; `evaluateBinaryExpression`'s `+` and ordering arms
    belted byte-identically (the 0338 pure-host lockstep).
  - `tests/b0368-plus-ordering-laundered-belt.test.ts` — new witness, 19 rows
    (10 flip rows D1–D7/CP/PI/PInvoke + 9 controls) across the executor sink and
    the pure-host sink.
  - `tests/b0345-interpolation-operand-checks-at-parse.test.ts` — PARITY (5c)
    re-anchored to the bug 0368 belt under parent ratification (below); header
    WITNESS-SUMMARY clause updated to match. FLIP SET = exactly this one cell;
    5a (parse-boundary deferral) untouched.
  - `docs/bugs/0345-...md` — dated coordination note: 0345 §Fix §Residuals-1's
    runtime concession for `+`/ordering is superseded by this belt.

- **Gates (verbatim):**
  - Witness revert-red: neutralizing the belt in both sinks reds the 10 flip
    rows naming the coerced value (`D1 expected 'success value "x1"' to be
    'runtime loud throw'`, … `PI expected 'success; sent=["v=x1"]' to be
    'threw; sent=[]'`); restored byte-exact (`git hash-object`
    `statement-executor.ts` = `9572e9ec8a909b3c3c10ee27ef77a602172f310e`,
    `production-theta-producer.ts` = `ab2e64ff7bef2f79d2495d012c4cafbd255ec6da`)
    → witness 19/19 green.
  - Full default suite `npx vitest run` → 528 files / 9975 tests passed.
  - `npm run typecheck` clean (tsc exit 0); `npm run lint` clean (eslint exit 0).
  - Live (under the shared lock) `... vitest.live.config.ts
    tests/live/acceptance/b0345-interpolation-operand-refusal.test.ts` → 1
    passed (7.75s) through the real `pi -p` — the adjacent cell exercising the
    pure-host interpolation-operand sink this belt modifies. Live census of
    `tests/live/` found ZERO flipping cells: the LPA `"x1"` cell (11052/11109)
    is bug 0116's query-render concatenation (literal `x` + unwrapped `1`), NOT
    the binary `+` arm; b0334/b0335 `x + 1` cells are `x: integer` (two-number,
    byte-identical). LPA (line-pinned 14864) not implicated, not edited.

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`, deep) — CLEAN, no findings;
  confirmed belt predicate (throw unless both-strings OR both-numbers),
  NaN/±Infinity still admitted, executor/pure-host lockstep byte-identical,
  0345 5c re-anchor subject-preserving (mirrors 5b, 5a untouched), no house-rule
  or spec defects.

- **Verification:** SOLID (`bug-fix-verifier`). Obligation 1 (witness reds on
  belt revert, greens on restore, both files byte-exact to baseline) discharged;
  obligation 2 (full suite 528/9975) discharged; obligation 3 (end-to-end live)
  discharged by the orchestrator (verifier subagents never run live) — b0345
  acceptance cell green; obligation 4 (lint + typecheck clean) discharged.

- **Ratification (parent, verbatim-summarized):** PARITY (5c) was scaffolding of
  the pre-0368 premise — its own comment pinned bug 0345's scope boundary ("the
  +/ordering runtime surface is unchanged by THIS fix"), not a desired
  end-state. The subject that must be preserved is 0345's deferral parity
  (withheld operands load clean — witnessed by 5a, untouched). The 5c flip is
  FORCED by the parent-adjudicated 0368 belt and is subject-preserving under
  re-anchor (model class: the 0292 (D)-row-v2 / 0347 row-H vehicle-collateral
  flips). FLIP SET = exactly this one cell (both assertions inside it); any
  further un-enumerated red → STOP. 5c was re-anchored to a 5b-mirror: the
  deferred withheld-param `+` and `<` now reach the 0368 belt (loud framed
  abort, `sent == []`). Red-direction proof of the re-anchored cell: neutralizing
  the pure-host belt reds 5c (renders `v=a1` again), restored byte-exact
  (`production-theta-producer.ts` `git hash-object` = baseline `ab2e64ff...`
  before and after) → 5c green.

- **Doc-was-wrong note:** this report's §Related item 0345 characterizes 0345's
  residual concession as "concedes it narrowly — the par-for-in-interpolation
  deferral posture only." INACCURATE: committed cell 5c witnessed 0345's
  concession across the WHOLE deferred interpolation surface — plain
  withheld-param `${x + 1}` / `${x < 1}`, not only `par for`. The 5c flip is a
  direct, foreseeable consequence of §Fix that this doc's flip authority (zero
  enumerated flips) failed to record.

- **Premeasure census miss (disclosed):** the prior premeasure flip-census
  enumerated ZERO committed-cell flips and did NOT identify b0345 PARITY (5c) as
  a foreseeable flip, though §Affected names the pure host's `${…}`
  interpolation arm as a belted sink. Caught at the Phase-2 gate (the one
  un-enumerated red) and escalated for parent ratification, not self-authorized.

- **Bounded self-authorizations (recorded):**
  1. The b0345 header WITNESS-SUMMARY clause describing 5c was updated to the
     re-anchored disposition — comment-only, no assertion, directly entailed by
     the ratified 5c flip; full suite stayed green.
  2. The 0345 dated note was written with LF to match that file's MEASURED
     flavor (388 bare LF, 0 CRLF) — not the task's general "(bug docs CRLF)"
     parenthetical — honouring condition 3's operative rule "match the file's
     existing line-ending flavor exactly" and the hard rule "no EOL rewrites".
     The 0368 doc (measured pure CRLF) keeps CRLF.

- **Residuals:**
  1. Dormant pure-host twin `src/runtime/expression-evaluator.ts:515,547-548`
     (`evaluateSource`/`evaluateNode`) also lacks a `+`/ordering belt — as it
     equally lacks the 0332/0338 numeric belt. ZERO external call sites on the
     production laundered path (importers take only the `EvalHost` type and the
     parse-time checkers), so unreachable by this class; out of scope, matching
     0332/0338's posture. Discovery material for a future re-sweep. (Reviewer V3a.)
  2. Bug 0345 §Residuals-1's par-for-in-interpolation deferral posture is
     unchanged; the deferred `+`/ordering pair now hits THIS belt at runtime
     (loud abort) instead of coercing — runtime backstop strengthened, parse gap
     (0345's stated residual) unclosed.

- **Discharge notes appended:** `docs/bugs/0345-...md` (dated 2026-09-02) —
  residual-1's runtime concession superseded; witness 5c re-anchored.

- **Pinned dispositions / non-goals:** §Non-goals stand — no parse-layer change,
  `==`/`!=` untouched, boolean-position operands are bug 0369's, D8's
  `-`/`*`/`/`/`%` belt unchanged. No new registry code (routes through the
  existing `INTERNAL_ERROR_CODE`); `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged.

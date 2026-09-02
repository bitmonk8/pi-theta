# Bug 0368 — `+` and the four ordering operators have no runtime operand belt, so pairings the spec refuses silently JS-coerce when they reach the runtime through statically-withheld operands: `f("x", 1)` → `"x1"`, `f(null, 5)` → `5`, `f(true, true)` → `2`, `f([1], [2])` → `"12"`, `g(true, 2)` under `<` → `true` — while the identical laundering under `-` throws the bug-0332 belt

- **Status:** open.
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

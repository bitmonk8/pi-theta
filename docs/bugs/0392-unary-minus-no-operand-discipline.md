# Bug 0392 — Unary `-` has no operand discipline at any layer: `let s = "5"` / `-s` loads clean and silently binds the number `-5` on both evaluation hosts, `-x` over a laundered boolean/null/array/enum fabricates `-1`/`-0`/`-1`/`NaN` — while the byte-identical operand under binary `0 - x` throws the bug-0332/0338 belt and the direct spelling `0 - s` is parse-refused

- **Status:** open.
- **Kind:** spec gap with a hazardous implementation disposition (the
  0365/0369 framing). `docs/spec_topics/expressions.md:236` §"Other
  arithmetic" opens with "`-`, `*`, `/`, `%` accept only numeric operands;
  any other operand pairing … is `theta/parse/non-numeric-arithmetic-operands`"
  and then gives unary `-` its only rule: "Unary `-` applies the same rule to
  its single operand: `integer` in yields `integer`, `number` in yields
  `number`" — no result is defined for a non-numeric operand, and no runtime
  disposition exists anywhere for one. The registered code's Trigger
  (`docs/spec_topics/diagnostics/code-registry-parse.md:43`) is written for
  operand *pairs* only, and bug 0332's §Non-goals excluded "unary `-` in
  expression position" from its parse gate by name. Both implementations fill
  the silence with a raw JS cast-and-negate.
- **Related:**
  - 0332 / 0338 (fixed 0.299.0 / 0.311.0) — the binary `-`/`*`/`/`/`%`
    two-layer discipline (parse gate + `BinaryNonNumericError` runtime belt on
    both hosts). Unary `-` was excluded from 0332's scope BY NAME — a scope
    exclusion, not a residual owning the class (the 0368 §Related precedent:
    "no filed report owns the … runtime arms").
  - 0368 (fixed 0.348.0) — belted `+` and ordering; its §Fix touches
    `evalBinary`/`evaluateBinaryExpression` but not the unary short-circuit
    arm, which returns before any belt runs.
  - 0369 (fixed 0.350.0) — belted the OTHER unary operator (`!`) on both
    hosts; its §Pinned dispositions records this report's class as seen and
    deliberately untouched: "The arithmetic unary `-` `as number` cast is the
    0332/0338/0368/0367 arithmetic family, not this boolean/iterand class —
    untouched." None of the four named reports claims it.
  - 0367 (fixed 0.378.0) — made an authored `null - x` distinguishable from
    unary minus (`BinaryExpr.unary` marker) so it reaches the binary belts;
    its §Related states "this report is not about unary `-`". Its fix is what
    makes the unary arm cleanly identifiable (`expr.unary === true`) — and
    that arm is where the coercion now lives.
  - 0166 (fixed 0.91.0) — the `params:`-default sublanguage's unary minus over
    non-numeric literals was fixed as a refusal; the expression-position
    sibling measured here still coerces (`-true` → `-1`, `-null` → `-0`,
    `-"x"` → `NaN` — the same fabricated values 0166's title enumerates).
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/runtime/statement-executor.ts:1206-1211` — `evalBinary`'s unary arm:
    `if (expr.op === "-" && expr.unary === true) { … return { flow: "value",
    value: -(right.value as number) } }`. No kind test; JS unary `-` coerces
    string/boolean/null/array/boxed-String-enum. The arm sits directly between
    the belted `!` arm (`:1204`, `requireBoolean`) and the belted binary arms
    (`applyBinaryScalar` `:1254`).
  - `src/extension/production-theta-producer.ts:7913-7914` — the pure host's
    identical arm: `if (op === "-" && unary === true) { return
    -(evaluatePureExpression(rightExpr, env, chain) as number) }`, serving
    `${…}` interpolations and invoke/`.theta`-callable arguments; equally
    unbelted, likewise sandwiched between the 0369 `!` belt and the 0368/0338
    binary belts.
  - `src/parser/type-layer-checks.ts:3095-3108` — `walkExpr`'s binary arm runs
    `checkArithmeticOperands` only for `ARITHMETIC_OPS.has(e.op) && e.unary
    !== true`; no sibling check judges the unary operand, so the DIRECT
    spelling `-s` (s: string) is parse-clean.
  - `src/parser/type-layer-checks.ts:2797-2807` — the `provableArgType` unary
    arm's own comment narrates the defect: "the runtime reaches that result by
    coercion (`evalBinary`: `-(right.value as number)` …), so `-"5"` evaluates
    to the number `-5` while the operand's own proof says `string`."
- **Observed at:** 0.382.0 (d63c5148), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`), the b0332/b0368 pattern.

## Summary

Every other operator family got the two-layer discipline: a parse gate for
resolvable operands and a loud runtime belt for statically-deferred ones
(0332/0338 for binary arithmetic, 0368 for `+`/ordering, 0369 for `!` and the
boolean positions). Unary `-` got neither. The parse walk explicitly skips the
marked unary node (`e.unary !== true`) and adds no unary-specific check, so
even a fully-resolvable non-numeric operand loads clean; at runtime both hosts
negate through a bare `as number` cast, so JS coercion fabricates a number
from whatever arrived: `-"5"` → `-5`, `-true` → `-1`, `-null` → `-0`,
`-[1]` → `-1`, `-"abc"` → `NaN`, `-E.A` (enum) → `NaN`. The identical operand
one spelling over (`0 - x`) is refused at parse when resolvable and aborts
loudly at the 0332 belt when laundered — the same operator glyph, two
dispositions, chosen by arity.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics `[]` in every row except F2/F5.

| # | Source (body) | Observed |
|---|---|---|
| A1 | `let s = "5"` / `let y = -s` / `y` | `outcome=success value=-5` — DIRECT spelling, no laundering |
| A8 | `let b = true` / `let y = -b` / `y` | `outcome=success value=-1` |
| A2 | `fn f(x) { -x }` / `f("5")` | `value=-5` |
| A3 | `fn f(x) { -x }` / `f("abc")` | `value=NaN` (typeof number) |
| A4 | `fn f(x) { -x }` / `f(true)` | `value=-1` |
| A5 | `fn f(x) { -x }` / `f(null)` | `value=-0` |
| A6 | `fn f(x) { -x }` / `f([1])` | `value=-1` (JS `-[1]`: array → `"1"` → `1`) |
| F4 | `enum E { A }` / `fn f(x) { -x }` / `f(E.A)` | `value=NaN` — the boxed-String carrier coerces |
| F3 | `fn f(x) { -x }` / `let v = f("5")` / `v == -5` | `true` — the fabricated number flows on as a plausible value |
| A7 (control) | `fn f(x) { -x }` / `f(7)` | `value=-7` |
| F1 (contrast) | `fn f(x) { 0 - x }` / `f("5")` | `THREW BinaryNonNumericError … (bug 0332 belt)` |
| F2 (contrast) | `let s = "5"` / `let y = 0 - s` | `PARSE ["theta/parse/non-numeric-arithmetic-operands"]` |

Boundedness note (measured, not claimed away): the direct spelling's ESCAPE
routes are terminal values, composites, equality, and interpolation — a
downstream resolvable numeric sink over the result can still refuse (probed:
`let t = -s` / `t * 2` draws `non-numeric-arithmetic-operands` because the
static layer types the negation by its operand). The laundered rows escape
everywhere.

## Expected behaviour

- `expressions.md:236`: `-` "accept[s] only numeric operands", and unary `-`'s
  result rule admits only `integer` → `integer` / `number` → `number`. A
  non-numeric operand has no prescribed result; under the settled belt
  discipline (0332/0338/0368/0369: a value the gate deferred on "is a loud
  runtime defect, never a fabricated value") the conforming dispositions are a
  parse refusal for the resolvable spelling and a loud runtime abort for the
  laundered one — never a silently fabricated number.
- The disposition must not depend on arity: F1/F2 vs A1/A2 show the identical
  operand class refused under binary `-` and admitted under unary `-`.

## Actual behaviour / root cause

The parse walk's arithmetic gate is keyed off the unary marker
(`type-layer-checks.ts:3106` — correct for the placeholder-left problem, per
bug 0367), and nothing replaces it for the unary operand, so no static
judgement exists. At runtime both hosts' unary arms
(`statement-executor.ts:1211`, `production-theta-producer.ts:7914`) negate
through `as number` casts — the exact shape 0332 §Affected described for
binary `-`, preserved verbatim in the one arm its fix did not reach. The
0369 fix belted the neighbouring `!` arm in the same functions, leaving unary
`-` the only operator on either host with neither a gate nor a belt.

## Why it matters

`-x` over an untyped helper's parameter is ordinary sign-flipping code; a
string/boolean/null arriving there yields a finite plausible number (`-5`,
`-1`, `0`) that flows into arithmetic, interpolations, invoke args, and final
values with zero diagnostics on any channel — author intent dropped, impact
class 1. The direct rows (A1/A8) additionally need no laundering at all: this
is the last operator whose DIRECT non-numeric spelling still evaluates.

## Non-goals

- Bug 0367's authored-`null`-left class — fixed and disjoint (the marker that
  fix minted is what isolates this arm).
- The V3a mini-interpreter (`expression-evaluator.ts`) unary arm — no
  production call site (0332/0338/0368's shared posture).
- The `params:`-default sublanguage — fixed by 0166; cited as the refusal
  precedent for the same fabricated values.

## Fix

Mirror the settled two-layer pattern:

1. **Parse:** a unary-operand check beside `checkArithmeticOperands` (run when
   `e.unary === true`), refusing a resolvable non-numeric operand. Reuse
   `theta/parse/non-numeric-arithmetic-operands` with a Trigger-column
   widening naming the unary position (the 0326 anti-fork law; the 0314
   `mixed-plus-operands` widening is the DIAG-2 precedent), or mint a
   dedicated row if DIAG-2 prefers — the message template's two-operand
   wording (`got <left> and <right>`) is the one adjudication.
2. **Runtime belt:** both unary arms require `typeof value === "number"`
   (NaN/±Infinity stay admitted — same carve-out as the binary belts),
   else throw `BinaryNonNumericError` (or a `UnaryNonNumericError` sibling)
   routed through `surfaceUnexpectedThrow` → `theta/runtime/internal-error`.
   Executor and pure host in lockstep (the 0338 obligation).
3. One same-commit sentence in expressions.md §"Other arithmetic" naming the
   unary operand's refusal and the laundered-path runtime disposition.

Constraints: `-7`, `-(n)` over numeric bindings, and `-0`-producing
expressions stay byte-identical (the `-0` sign is load-bearing —
[bug 0188](./0188-negative-zero-loses-sign-across-subagent-envelope.md)
pins its carriage semantics); bug 0367's `unary` marker semantics
unchanged; the 0369 `!` belt untouched.

Fixer warning: the parse half contradicts bug 0332's pinned
"unary `-` in expression position is NOT gated" disposition, pinned by the
N1a/N1b controls in
`tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts:361-362` —
a same-commit discharge note on
[./0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md](./0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
(§Pinned dispositions and the N1 control framing) is owed with the fix.

## Provenance

Found by diffing `evalBinary`'s per-operator arms against the 0368/0369 fix
records during the runtime-belts-3 sweep at d63c5148 — the unary `-` arm is
the one arm in both hosts' operator switches with neither gate nor belt. All
twelve rows probed offline through the production executor harness before
filing. Scratch probes deleted.

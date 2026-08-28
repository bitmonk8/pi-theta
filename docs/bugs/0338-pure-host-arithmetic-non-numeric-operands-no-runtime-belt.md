# Bug 0338 — The pure-host evaluator `evaluateBinaryExpression` casts non-numeric operands of spelled `-`/`*`/`/`/`%` to `number` with no belt, so a non-numeric operand reaching a pure evaluation position (a query/`system:` `${…}` interpolation, or an `invoke` / `.theta`-callable argument) binds or renders a silent JS-coerced value — `let s = "a"` with `@`…${s - 1}`` renders the literal text `NaN` into the prompt, and `fn f(a) { invoke("./c.theta", a - 1) }` / `f("x")` hands the child `NaN` — where the byte-identical `s - 1` as a `let` RHS throws the bug 0332 runtime belt

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because two production evaluation paths bind
  or render a silent wrong value the spec's operand rule refuses: an interpolated
  `${s - 1}` renders the text `NaN` into a user-visible prompt with no diagnostic
  on any channel, and an `invoke` argument hands a coerced `NaN` across the child
  boundary; D2 because the fix mirrors the already-shipped `applyBinaryScalar`
  belt (bug 0332) into the sibling pure-host `evaluateBinaryExpression` — one
  function, an existing pattern, existing registry code and spec — with no
  DIAG-2 adjudication owed.
- **Kind:** defect against the operator operand rule on the pure evaluation path.
  `docs/spec_topics/expressions.md` §"Other arithmetic" (`expressions.md:236`):
  "`-`, `*`, `/`, `%` accept only numeric operands; any other operand pairing …
  is `theta/parse/non-numeric-arithmetic-operands`." QRY-18
  (`docs/spec_topics/query/query-escapes-stringification.md#qry-18`) makes a
  `${expr}` interpolation evaluate `expr` "per the Expression Sublanguage", so
  the operand rule governs interpolation position too. Bug 0332's fix (0.299.0)
  added a numeric-operand parse gate (`checkArithmeticOperands`) and a runtime
  belt, but the belt was added only to the executor's `applyBinaryScalar`
  (`src/runtime/statement-executor.ts`); the sibling pure-host evaluator
  `evaluateBinaryExpression` (`src/extension/production-theta-producer.ts`) was
  left unbelted, and the parse gate does not reach either surface here (it defers
  on the `invoke`-argument's statically-unresolvable operand, and it is never
  invoked on interpolation expressions at all).
- **Related:**
  - [0332](./0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
    (fixed 0.299.0) — the parent surface. Its `## Fix (0.299.0)` §Residuals
    records both defects this report owns: residual 1 (pure-host coercion of a
    statically-deferred non-numeric operand via `invoke` / `.theta`-callable
    arguments) and residual 2 (interpolation position ungated for all operand
    checks). Its parse gate and runtime belt are the model this report's fix
    mirrors into the pure host.
  - [0314](./0314-compound-assign-non-numeric-silent-zero.md) (fixed 0.293.0) —
    the compound-assignment sibling whose `CompoundNonNumericError` runtime
    throw is the belt-not-brace precedent 0332 followed. Not on this surface.
  - [0166](./0166-unary-minus-default-admits-non-numeric-literal.md)
    (fixed 0.91.0) — unary `-` on a non-numeric literal in the `params:` default
    sublanguage. Unary `-` in expression position is a §Non-goal here, as in
    0332.
  - [0116](./0116-question-unwrapped-interpolation-renders-null.md)
    (fixed 0.128.0) and
    [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)
    (fixed 0.69.0) — other interpolation-render defects. They own the `?`-unwrap
    and `Result`-carrier render dispositions; neither owns the arithmetic-operand
    coercion this report measures.
- **Affected** (verified at HEAD, 337e8d08):
  - `src/extension/production-theta-producer.ts:7059`–`:7095` —
    `evaluateBinaryExpression`: the `-` (`:7089`), `*` (`:7091`), `/` (`:7093`),
    `%` (`:7095`) arms cast both operands `(left as number)` / `(right as
    number)` and apply the JS operator with no numericity check. A non-number
    operand is silently JS-coerced: string operands yield `NaN`; a boolean
    coerces to `0`/`1`; an array stringifies then coerces. This is the exact
    disposition `applyBinaryScalar` had before bug 0332 belted it, and this
    evaluator is not belted.
  - `src/extension/production-theta-producer.ts:6766`–`:6888` —
    `evaluatePureExpression`: its `binary` arm (`:6888`) delegates to
    `evaluateBinaryExpression`. Every pure evaluation position funnels through
    here, so all three reaching surfaces share the one unbelted sink:
    - `:6536`–`:6575` — `renderQueryText` → `stringifyInterpolation` →
      `evaluatePureExpression` (`:6575`): a query/`system:` `${…}` interpolation
      is rendered by evaluating its expression on the pure host. A numeric
      `NaN`/`Infinity` renders as the literal text `NaN`/`Infinity` (not `null`),
      per the QRY-18 renderer.
    - `:3510` (`#resolveInvoke`) and `:3547` (`#resolveCallAsInvoke`): an
      `invoke("./x.theta", …args)` / `.theta`-callable `<name>(args)` binds each
      positional argument through `evaluatePureExpression`, so a non-numeric
      arithmetic argument is coerced before the child is spawned.
  - `src/parser/type-layer-checks.ts:3232`–`:3234` — `walkExpr`'s `case "query"`
    calls `checkQueryInterpolationResults` and returns; it does not descend into
    the interpolation expression, so `checkArithmeticOperands` (`:3709`) — and
    the pre-existing `+` / ordering operand checks — never run on an
    interpolation expression. The gate is absent from this position for all
    operand checks.
  - `src/parser/type-layer-checks.ts:3168`–`:3175` — `walkExpr`'s `case
    "invoke"` descends into each argument (`:3174`), so a statically-resolvable
    non-numeric argument (`invoke("./c.theta", "a" - 1)`) is refused at parse.
    An argument whose operand is a WITHHELD binder (an unannotated `fn`
    parameter) is statically unresolvable, and `checkArithmeticOperands` defers
    on it (mirroring `checkOrderingOperands`), so the pairing reaches the
    unbelted runtime.
  - `src/runtime/statement-executor.ts:1037`–`:1060` — `applyBinaryScalar`: the
    executor's binary arm, belted by bug 0332 (`BinaryNonNumericError` at
    `:653`, thrown at `:1060`). A `let`-RHS / statement-level `-`/`*`/`/`/`%`
    routes here and throws loudly on a non-number, so the two evaluators
    diverge: the same operand pairing is refused on the executor path and
    silently coerced on the pure-host path.

## Summary

Bug 0332's fix (0.299.0) closed the spelled `-`/`*`/`/`/`%` non-numeric-operand
defect on two of the three evaluation surfaces: a parse-time gate
(`checkArithmeticOperands`) refuses a statically-resolvable pairing, and a
runtime belt in the executor's `applyBinaryScalar` throws on a non-number the
gate deferred on. The third surface — the pure-host evaluator
`evaluateBinaryExpression`, which serves every pure evaluation position
(`${…}` interpolation in a query template and the `system:` frontmatter field,
`invoke` arguments, `.theta`-callable call arguments) — was left unbelted, and
the parse gate does not reach these positions: it defers on an
`invoke`-argument's statically-unresolvable operand, and `walkExpr`'s query arm
never hands an interpolation expression to the gate at all. So a non-numeric
operand of a spelled arithmetic operator in a pure position is cast to `number`
and JS-coerced with no diagnostic on any channel: `${s - 1}` with `s = "a"`
renders the literal text `NaN` into the prompt, and `invoke("./c.theta", a - 1)`
with a string `a` hands the child `NaN`. The byte-identical `s - 1` as a `let`
RHS throws the bug 0332 belt, so the disposition depends on the evaluation
position rather than on the operands.

## Reproduction

Offline, deterministic, through the production prompt-mode binding
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`), driven against an in-memory
instant-settle session double (the `tests/b0288-prompt-turn-completion-witness.ts`
harness shape) that records the rendered prompt text handed to
`pi.sendUserMessage`. Each source is prefixed `---\nmode: prompt\n---\n`. Parse
diagnostics are the recorded error-code arrays.

| # | Surface | Source (body) | Parse | Runtime |
|---|---|---|---|---|
| B1 | interpolation, runtime | `let s = "a"` / `` @`v=${s - 1}` `` | `[]` | rendered prompt text `v=NaN` (silent; no throw) |
| B2 | interpolation, parse | `let s = "a"` / `` @`v=${s - 1}` `` | `[]` | — (gate never runs on the interpolation expr) |
| B3 | statement-level control | `let s = "a"` / `let x = s - 1` / `x` | `[theta/parse/non-numeric-arithmetic-operands]` | — (refused at parse) |
| A1 | invoke arg, parse (withheld) | `fn f(a) { invoke("./c.theta", a - 1) }` / `f("x")` | `[]` | — (gate defers on WITHHELD `a`) |
| A2 | invoke arg, parse (literal) | `invoke("./c.theta", "a" - 1)` | `[theta/parse/non-numeric-arithmetic-operands]` | — (refused at parse) |

B1 is the highest-impact observable: the interpolation evaluates via
`renderQueryText` → `stringifyInterpolation` → `evaluatePureExpression` →
`evaluateBinaryExpression` (the unbelted pure host), NOT via the executor's
belted `applyBinaryScalar`, so `"a" - 1` coerces to `NaN` and the QRY-18
renderer emits the literal text `NaN` into the prompt with no throw. B3 shows
the same operand pairing throwing the bug 0332 belt one position over (a `let`
RHS runs on the executor). A1 vs A2 shows the parse gate present on `invoke`
arguments but deferring on a statically-unresolvable operand; the deferred
pairing then reaches the same unbelted pure host at `:3510`, which hands the
coerced value to the child. Scratch probe written, run, and deleted; a
case-insensitive sweep for its stem left no residue.

## Expected behaviour

`docs/spec_topics/expressions.md` §"Other arithmetic" (`expressions.md:236`)
refuses any non-numeric operand pairing of `-`/`*`/`/`/`%` with
`theta/parse/non-numeric-arithmetic-operands`. QRY-18
(`docs/spec_topics/query/query-escapes-stringification.md#qry-18`) evaluates an
interpolation "per the Expression Sublanguage", so that constraint governs the
interpolation position, and `invocation.md` binds `invoke` arguments by
evaluating each expression, so it governs the argument position. A non-numeric
operand of a spelled arithmetic operator in a pure position must not bind or
render a silent JS-coerced value — it must draw the same refusal the executor
path already produces (bug 0332): a statically-resolvable pairing at parse, and
a statically-deferred pairing (a WITHHELD `fn` parameter) as the runtime belt's
loud throw. The disposition must not depend on whether the expression sits in a
`let` RHS or a pure evaluation position.

## Actual behaviour / root cause

`evaluateBinaryExpression`
(`src/extension/production-theta-producer.ts:7059`) casts both operands to
`number` in its `-`/`*`/`/`/`%` arms (`:7089`–`:7095`) and applies the JS
operator with no numericity check. It is the pure-host twin of
`applyBinaryScalar`, but bug 0332 belted only `applyBinaryScalar`
(`src/runtime/statement-executor.ts:1060`), leaving this evaluator on its
original silent-coercion disposition. Every pure evaluation position funnels
through `evaluatePureExpression` (`:6888`) into it:

- **Interpolation.** `walkExpr`'s `case "query"`
  (`src/parser/type-layer-checks.ts:3233`) calls only
  `checkQueryInterpolationResults` and returns; it never descends into the
  interpolation expression, so `checkArithmeticOperands` (and the `+` / ordering
  checks) never run on it — even a statically-resolvable `${s - 1}` parses
  clean. At render, `renderQueryText` → `stringifyInterpolation` →
  `evaluatePureExpression` coerces `"a" - 1` to `NaN`, which the QRY-18 renderer
  emits as the literal text `NaN`.
- **`invoke` / `.theta`-callable arguments.** `walkExpr`'s `case "invoke"`
  (`:3174`) and `case "call"` descend into the arguments, so a
  statically-resolvable non-numeric argument is refused at parse. An argument
  whose operand is a WITHHELD binder (an unannotated `fn` parameter) is
  statically unresolvable, and `checkArithmeticOperands` defers on it. The
  deferred pairing then reaches `#resolveInvoke` (`:3510`) /
  `#resolveCallAsInvoke` (`:3547`), which evaluate each argument through the
  same unbelted `evaluatePureExpression` and hand the coerced value to the
  child.

No throw occurs on either surface; the executor's `BinaryNonNumericError` belt
is unreachable from the pure host.

## Why it matters

An interpolated arithmetic slip renders `NaN` into a user-visible prompt: the
model receives corrupted text with no author-visible sign that a value was
dropped, and no diagnostic at parse or render. An `invoke` / callable-argument
slip is cross-module corruption — the coerced `NaN` (or `0`/`1` from a boolean,
or a coerced integer from an array) crosses the child boundary as a
plausible-looking argument, so a mistake that should be a load failure or a loud
runtime abort instead threads a wrong value into a separate theta's
computation. Both are the silent-wrong-value class the bug 0332 fix set out to
close on the other two surfaces; the disposition currently depends on the
evaluation position, so an author who moves an expression from a `let` RHS into
an interpolation or an argument silently loses the belt.

## Non-goals

- Unary `-` in expression position — a §Non-goal in bug 0332 (pinned by its N1
  controls); not measured here.
- The compound-assignment forms `-=`/`*=`/`/=`/`%=` — bug 0314's
  `CompoundNonNumericError` runtime disposition; unchanged by this report.
- The `+` and ordering operand checks in interpolation position. `walkExpr`'s
  query arm omits all operand checks, not only arithmetic, so `${a + b}` and
  `${a < b}` over mixed operands are also ungated at parse. Their runtime
  dispositions are not silent-NaN (`+` concatenates or adds; ordering yields a
  boolean), so they are outside this report's silent-coercion surface. Closing
  the interpolation parse boundary for all operand checks (routing the
  interpolation expression through `walkExpr`) is a broader, pre-existing
  corpus-wide concern; this report's runtime-belt fix does not depend on it and
  does not resolve it.
- The V3a expression evaluator `src/runtime/expression-evaluator.ts`, whose
  arithmetic arms are likewise unbelted. `rg` at HEAD shows it is imported only
  by `type-layer-checks.ts`, `lexical-environment.ts`, `statement-executor.ts`,
  and its own test; it has no production caller that evaluates a binary through
  it, so its unbelted arms are not a reachable defect (test-only scaffolding).

## Fix

Belt the pure-host evaluator to match the executor. Extend
`evaluateBinaryExpression`'s `-`/`*`/`/`/`%` arms
(`src/extension/production-theta-producer.ts:7089`–`:7095`) to throw on a
non-number operand exactly as `applyBinaryScalar` does
(`src/runtime/statement-executor.ts:1060`): reuse the exported
`BinaryNonNumericError` (`statement-executor.ts:653`), and preserve the `NaN`
carve-out (`NaN` is `typeof "number"`, so `n % 0` → `NaN` and `n / 0` →
`Infinity` keep the spec's non-panic div/mod behaviour). The belt catches the
statically-deferred operand on every surface this evaluator serves — `invoke` /
`.theta`-callable arguments and `${…}` interpolation alike — so the two
evaluators no longer diverge by position.

The fix-lane constraints:

- The throw must surface loudly, not crash. A `BinaryNonNumericError` raised
  during `renderQueryText` must abort the theta with a framed diagnostic
  (the QRY-18 render path already has a runtime raise for
  `INTERPOLATED_RESULT_CODE`; the belt throw must reach the same
  `surfaceUnexpectedThrow` → `INTERNAL_ERROR_CODE` framing the executor belt
  uses, not propagate uncaught out of the producer). A throw raised while
  binding `invoke` / call arguments must surface as the invoking theta's loud
  failure before the child is spawned.
- The numeric controls stay byte-identical: `${n - 1}` with `n = 7`, and every
  numeric arithmetic argument, continue to render / bind exactly as at HEAD.

Extending the parse gate to interpolation position (routing the interpolation
expression through `walkExpr` so a statically-resolvable `${s - 1}` is refused
at load) is available but is a superset of this fix and a broader,
pre-existing boundary (§Non-goals); the runtime belt is the necessary change
because it is the only remedy for the statically-deferred operand, which is the
only way the `invoke`-argument surface slips and one way the interpolation
surface slips. No DIAG-2 adjudication is owed: the belt throws no new registry
code, and `theta/parse/non-numeric-arithmetic-operands` and the spec sentence
already exist from bug 0332.

## Provenance

Filed from bug 0332's `## Fix (0.299.0)` §Residuals (residuals 1 and 2, from
its review round 1 findings F2 and F3) and `.pi/tmp/fixes/0332-report.md`
§Residuals/notes. Reproduced offline at HEAD 337e8d08 through the production
prompt-mode binding: `${s - 1}` with `s = "a"` rendered the prompt text `v=NaN`
with no throw and parsed `[]`; the byte-identical `s - 1` as a `let` RHS
parsed `[theta/parse/non-numeric-arithmetic-operands]`; the `invoke` argument
`a - 1` under a WITHHELD `fn` parameter parsed `[]` while the literal `"a" - 1`
argument parsed `[theta/parse/non-numeric-arithmetic-operands]`. The runtime
sink was confirmed by reading to be `evaluateBinaryExpression`
(`production-theta-producer.ts:7059`) via `evaluatePureExpression`, distinct
from the belted `applyBinaryScalar`. Scratch probe deleted; case-insensitive
sweep for its stem left no residue.

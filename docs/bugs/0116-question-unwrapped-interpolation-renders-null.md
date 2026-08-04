# Bug 0116 — An interpolation of a `?`-unwrapped operand renders `null`: `evaluatePureExpression` has no `try` arm, so `${r?}` over `r = Ok(1)` sends `xnull` to the model while the statement executor's `?` on the identical operand yields `1` — and an `Err` operand's early-return is dropped outright, the query is sent, and the theta reports success

- **Status:** open. §Fix is not settled: the `Ok` arm is mechanical (reuse the
  executor's own `evaluateQuestion` + brand guard), but the `Err` operand's
  disposition inside a synchronous render is an adjudication —
  `expressions.md:186` makes `?` on `Err` early-return the `Err` from the
  enclosing theta, and `evaluatePureExpression` returns `ThetaValue` with no
  channel for a propagate flow. No ordering dependency:
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) is
  fixed (0.69.0) and its static gate skips this form by construction, so nothing
  blocks and nothing masks. One coordination constraint, in §Fix (e): three
  comments in bug 0079's witness record today's `xnull` as the current signature.
- **Sev/Diff estimate:** S1/D3 — the prompt text sent to the model carries
  `null` where the author unwrapped a payload, and an `Err` the author routed
  with `?` disappears while the query goes out and the theta reports success,
  with zero diagnostics on any channel; D3 because §Fix needs the `Err`-arm
  adjudication in-run, the change sits on the shared `?` semantics two
  evaluation paths must keep in lockstep (bug 0027), and three comment sites in
  a sibling witness pin the pre-fix observable.
- **Kind:** defect — implementation diverges from the specified render.
  `docs/spec_topics/expressions.md:3` applies one expression grammar to every
  position including `${…}` interpolations, `:17` lists postfix `?` among the
  supported forms, and `:19` says `${...}` inside a query template "takes any
  expression listed above"; `:40` excludes exactly two forms from that position
  (a nested `@`-query and `match`), and `?` is not one of them. QRY-18
  (`docs/spec_topics/query/query-escapes-stringification.md:16`) then fixes the
  render by the expression's Theta static type, which for `r?` over
  `r = Ok(1)` is `integer` — the `:21` row, canonical decimal `1`. The
  interpolation-render evaluator has no `try` arm
  (`src/extension/production-theta-producer.ts:5795–5887`), so the node falls to
  the switch's `default: return null` (`:5882–5886`) and the render takes
  QRY-18's `null` row (`:24`) faithfully on a value that is already wrong. That
  `default` arm and the function's docstring (`:5786–5793`) both attribute the
  `null` to "the expressions.md safety net";
  **`docs/spec_topics/expressions.md` contains no such sentence** (zero matches
  for `safety net` in that file at HEAD; the render's own file makes the
  attribution four times, `:5621`, `:5661`, `:5791–5792`, `:5885`), so the arm
  implements no spec text. The safety net is the arm itself.
- **Related:**
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the same interpolation position, the opposite concern.
    0079 refuses or panics on a `Result`-valued interpolation
    (`${r}`); here the author has unwrapped correctly and the render is silently
    wrong. Its static gate stays silent on this form deliberately:
    `checkQueryInterpolationResults` skips a `try` node
    (`src/parser/type-layer-checks.ts:1280–1287`) because "`?` UNWRAPS, so
    `${…?}` is never itself the `Result` it consumes", and its witness pins that
    as control cell a7 (`tests/interpolated-result-gate.test.ts:655–668`). So
    0079 neither causes nor masks this; it is 0079's own residual (iii), which
    that report fenced in terms ("Out of scope here … the static gate correctly
    stays silent on that form"). Measured unchanged at this HEAD: `${r}` still
    draws `theta/parse/interpolated-result`.
  - [0019](./0019-question-operand-bypasses-result-normalisation.md) — **fixed
    (0.31.0)**, the sibling `?`-operand report, and a *different position*. 0019
    is about the operand's type: an ERR-18-violating member / index / identifier
    operand reaching the unwrap. Its fix put a brand guard in `evalTry`
    (`src/runtime/statement-executor.ts:1074–1076`), which is on the *statement
    executor's* `?` path only. This report is about the unwrap's *render* in the
    interpolation position, where no `?` implementation exists at all — so
    0019's guard is not merely partial here, it is unreachable. Measured
    contrast on one operand: `let v = o.r?` in a body throws
    `QuestionOperandDefectError` naming ERR-18 and bug 0019; `` @`x${o.r?}` `` sends
    `xnull` and reports success (§Reproduction, rows h1/h2). 0019's own §Fix
    records the same asymmetry from the other side: its coordination note says
    "the sibling position it does not cover — the QRY-18 interpolation render —
    had no gate at all".
  - [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) —
    **fixed (0.39.0)**, the lockstep obligation this fix inherits. Its §Fix
    states it: "One definition point, four call sites. The two hosts move in
    lockstep: the effectful executor and the pure producer implement the same
    dispatch and a gate on one alone leaves the other leaking", and its fix
    record landed the pair as "byte-identical gated arms"
    (`applyStdlibMethod`, `src/runtime/statement-executor.ts:926`, and
    `evaluateStdlibMethod`,
    `src/extension/production-theta-producer.ts:5998`). This report is that rule
    applied to `?`: one host implements it, the other does not.
  - [0017](./0017-ok-field-object-misclassified-as-result.md) — **fixed
    (0.27.0)**, the classification control any change to this render must
    preserve: an ordinary object carrying a boolean `ok` field keeps taking
    QRY-18's object row (`interpolationTypeOf` tests the brand,
    `src/extension/production-theta-producer.ts:5779–5783`).
- **Affected** (every citation verified at HEAD `a410f727`, 0.69.0):
  - `src/extension/production-theta-producer.ts:5794–5888` — **the defect
    site.** `evaluatePureExpression`'s expression-kind switch (`:5795`) carries
    fourteen `case` labels over thirteen bodies (`string` and `bool` share one)
    — `number` `:5796`, `string`/`bool` `:5798–5800`, `null`
    `:5801`, `ident` `:5803`, `array` `:5807`, `object` `:5809`, `member`
    `:5825`, `index` `:5838`, `call` `:5844`, `result-ctor` `:5860`,
    `method-call` `:5865`, `binary` `:5873`, `ternary` `:5875` — and **no
    `try` arm**. `default:` (`:5882–5886`) returns `null`. Confirmed by search:
    the file contains no `case "try"` and no `kind === "try"` at any line.
  - `src/extension/production-theta-producer.ts:5883–5885` — the `default` arm's
    comment: "`try` / `match` / effect forms are driven by the executor (not the
    pure host)". True of every executor-side entry to this function; false of
    the render's, which is the one caller that hands a raw interpolation `Expr`
    to it.
  - `src/extension/production-theta-producer.ts:5657–5682` —
    `stringifyInterpolation`, the caller. `:5658` parses the interpolation
    source, `:5664` evaluates it with `evaluatePureExpression`, `:5665` derives
    the QRY-18 discriminator, `:5675` stringifies, `:5680` raises bug 0079's
    panic. Nothing between `:5658` and `:5665` inspects the node kind, so a
    `try` node reaches the pure host raw.
  - `src/parser/theta-document.ts:1148–1159` — `parseExpressionSource`, the
    parse `:5658` drives. It returns the same `Expr` a `let` RHS parses to;
    measured, `"r?"` parses to a node of kind `try` (not `null`), so the render's
    unparseable-source arm (`:5659–5663`) is not what produces the `null`.
  - `src/extension/production-theta-producer.ts:5626–5636` — `renderQueryText`,
    which concatenates the parts (`:5634`). Its docstring (`:5613–5625`) states
    the two conditions that legitimately yield the inert `null` render — a
    source that does not parse, and an interpolation with "no pure runtime value
    (an effectful `fn` body / tool-call)" — and a `?`-unwrapped operand is
    neither.
  - `src/extension/production-theta-producer.ts:5760–5784` —
    `interpolationTypeOf`. Its `null` arm (`:5770–5772`) fires on the value the
    `default` arm produced, so the wrong render is QRY-18-conformant for the
    value it is handed. `:5779–5781` is bug 0079's brand arm; `:5783` the object
    fall-through (bug 0017's control).
  - `src/extension/production-theta-producer.ts:1476`, `:2350`, `:5050` — the
    three `renderQueryText` call sites: the QRY-6 empty-template short-circuit
    test, the prompt-mode/two-phase dispatch, and `renderTypedAwareQueryText`
    (`:5045`). Every query dispatch shape reads this render.
  - `src/extension/production-theta-producer.ts:1465`, `:1729`, `:2246` — the
    three `evaluatePure` host wirings. `evaluatePureExpression` is therefore
    both the interpolation-render evaluator and the executor's pure
    sub-expression host; the missing arm is reachable only through the render,
    because the executor filters `try` out first (next three citations).
  - `src/runtime/statement-executor.ts:609–616` — `evalExpr`. `:614–616`
    dispatches `expr.kind === "try"` to `evalTry` before anything else, on the
    stated premise at `:610–613` that `?` and `match` "are evaluated by the
    executor (not the pure host) so a `?`-propagation early-returns from the
    body". `:761–766` is the pure fall-through (`host.evaluatePure`), reached
    only after that interception; `evalAsResult`'s pure fall-through is
    `:1010–1012`.
  - `src/runtime/statement-executor.ts:677–693` and `:1096–1106` — the two
    places the executor re-routes an operand subtree or a `match` arm body
    through `evalExpr` expressly to avoid "`evaluatePureExpression`'s
    `default: return null` safety net (a silent `null`, or a coerced derivative
    such as `"nullx"` for `+`)". The interpolation render has no equivalent
    re-route: `stringifyInterpolation` is synchronous and `evalExpr` is `async`.
  - `src/runtime/statement-executor.ts:1058–1082` — `evalTry`, the working `?`.
    `:1059` resolves the operand through `evalAsResult` (`:966`), `:1074–1076`
    is bug 0019's `isResultValue` brand guard, `:1077` applies the shared sync
    primitive `evaluateQuestion`, `:1078–1079` returns the unwrapped `Ok`
    payload and `:1081` the `propagate` flow for `Err`.
  - `src/runtime/runtime-panics.ts:389–396` — `evaluateQuestion`, the sync V4b
    primitive: `Ok` → `{ kind: "value", value }`, `Err` →
    `{ kind: "propagate", err }`. It takes a thunk and returns a value, so it is
    directly callable from a synchronous render — this is the shared definition
    point §Fix (a) requires. `:420–427` is `QuestionOperandDefectError` (bug
    0019's defect class).
  - `src/parser/type-layer-checks.ts:1271–1298` —
    `checkQueryInterpolationResults`, bug 0079's single emission site. The
    `try` skip is `:1280–1287`; `interpolationIsResult` is `:1325–1350`. This is
    why no load-time diagnostic exists for the form.
  - `src/parser/theta-document.ts:6482–6527` —
    `checkQueryTemplateInterpolations`, the only interpolation-position form
    gate. It rejects a nested `match` or a nested `@`-query
    (`firstForbiddenInterpolationForm`, `:6562`) with
    `theta/parse/unsupported-feature`, mirroring `expressions.md:40`. `?` is not
    in that set, so the parse layer admits `${r?}` as a supported form —
    measured, `diagnostics` is `[]`.
  - `src/parser/static-type-inference.ts:234–235` — the `try` arm:
    "`operand?` propagates the operand's success type statically", implemented
    as `#typeExpr(node.operand, …)`, which for an `ident` operand returns the
    very `CompatType` object recorded for that binding. With
    `resultBindings` keyed by object identity
    (`src/parser/type-layer-checks.ts:563`, written at `:644–660`, read at
    `:1333–1336`), this is why the hoist `let v = r?` / `${v}` is refused at
    load (§Reproduction row k2) — the sole route that would have worked around
    this defect.
  - `src/extension/production-theta-producer.ts:6025–6073` —
    `evaluateBinaryExpression`, which recurses into the same pure evaluator
    (`:6037`, `:6044`), so a `?` inside an arithmetic interpolation contributes
    the `default` arm's `null` as an operand: measured, `${r? + 1}` renders
    `x1` where QRY-18 requires `x2`.
  - `docs/spec_topics/expressions.md:3` — one expression grammar for every
    position, `${...}` interpolations named; `:17` — postfix `?` as a supported
    form; `:19` — `${...}` "takes any expression listed above"; `:40` — the two
    forms excluded from interpolation position (`@`-query, `match`), which does
    not name `?`; `:186` — the `?` semantics: "unwraps `Ok` to the inner value;
    on `Err`, *early-returns* the `Err` from the enclosing function (or
    top-level theta)"; `:203` — ERR-18, the operand-type precondition.
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18, the
    render-by-static-type rule; `:21` — the `integer` row (BNDR-4 canonical
    decimal), the expected render for `${r?}` over `r = Ok(1)`; `:20`, `:22–27`
    — the other payload rows this defect also reaches; `:24` — the `null` row
    ("the literal text `null`"), which is what the render legitimately applies
    to the illegitimate value; `:28` — the `Result` row (bug 0079's); `:32` —
    the static-where-possible / runtime-where-not note; `:58` — QRY-21, panics
    during interpolation are not caught by `let _ =`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:72` — the
    `theta/parse/interpolated-result` row. Its *Fix* column reads "Unwrap with
    `?` or `match` before interpolating" and its *Message* "Result value cannot
    be interpolated; unwrap with ? or match first". Both name the form this
    report measures as silently wrong.
  - `src/render/query-render.ts:80`, `:95`, `:110–116` —
    `INTERPOLATED_RESULT_CODE`, `INTERPOLATED_RESULT_MESSAGE`, and
    `InterpolatedResultPanic`, a `ThetaPanic` subclass
    (`src/runtime/runtime-panics.ts:67`) precisely so QRY-21 holds for it. This
    is the routing §Fix (c) weighs for the `Err` arm.
  - `src/parser/system-interpolation.ts:9–13`, `:56`, `:71` — the `system:`
    surface restricts an interpolation body to a bare identifier path
    (`theta/parse/system-interp-not-path` otherwise), so `?` is unspellable
    there. Out of reach, per §Non-goals.
  - **Test coverage of this defect: none.** No test asserts the rendered text of
    a `?`-bearing interpolation. Three cells in bug 0079's witness cover the
    form at parse level only and two of them record the current wrong render in
    a comment: a7 (`tests/interpolated-result-gate.test.ts:655–668`) — "(At HEAD
    the runtime renders `xnull` here — the pure host has no `try` arm and takes
    the expressions.md safety net — which is why this control is parse-level
    only.)"; a14 (`:761–772`, `${r? + 1}`); a15 (`:774–781`,
    `${c ? r? : 0}`). The file's header inventory repeats the signature at
    `:114–115`: "`${r?}` over a `Result`-typed `r` → sends xnull (the pure-host
    safety net; no diagnostic)".
  - No shipped fixture reaches the defect: across the 34 committed `.theta` /
    `.thetalib` files, no `${…}` interpolation contains a `?` at all. No
    acceptance fixture is affected and
    `tests/fixtures/h7a/permitted-codes.json` is out of scope.
- **Observed at:** `0.69.0` (HEAD `a410f727`). Offline and deterministic; no
  live model, no provider. Scratch vitest over the production composition —
  `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody` against the live-session double of
  `tests/interpolated-result-gate.test.ts` groups (b)/(c) (an untyped
  prompt-mode query issues one streamed user turn whose content IS the QRY-18
  rendered template; the injected Clock's `setTimeout` ticks the double). Three
  probe files, written, run, deleted. Observables per row:
  `parseThetaDocument(...).diagnostics` unfiltered, the text handed to
  `pi.sendUserMessage`, and `BodyExecution.outcome` / `.result` / `.error`.

## Summary

`${r?}` where `r` holds `Ok(1)` sends `x1` under QRY-18. Measured, it sends
`xnull`.

The interpolation render evaluates each `${…}` source with
`evaluatePureExpression` (`src/extension/production-theta-producer.ts:5664`),
whose expression-kind switch has no `try` arm. A `?` node therefore falls to
`default: return null` (`:5882–5886`), `interpolationTypeOf` classifies that
`null` as QRY-18's `null` row, and the render emits the literal text `null` — a
conformant render of a value the evaluator invented. Nothing detects it: the
parse layer admits `?` inside an interpolation (only a nested `match` or
`@`-query is excluded, `expressions.md:40`), bug 0079's static gate skips a `try`
node by design, and `diagnostics` is `[]`.

The same operand through the runtime statement executor is correct. `evalExpr`
intercepts `try` (`src/runtime/statement-executor.ts:614–616`) and `evalTry`
(`:1058–1082`) applies the real semantics, so `let v = r?` binds `1` and `?` on
an `Err` early-returns it. Measured at one HEAD on one operand: `let v = r?`
then a tail `v` yields `1` and outcome `success`; `` @`x${r?}` `` sends `xnull`. The
divergence is positional, not value-shaped — `let v = Ok(1)?` then `${v}`
renders `x1`.

The `Err` case is worse than a wrong render. `evaluatePureExpression` returns
`ThetaValue`, which has no channel for `evalTry`'s `propagate` flow, so an `Err`
operand inside an interpolation is not early-returned at all: measured,
`let r = Err(E { m: "boom" })` with `` @`x${r?}` `` sends `xnull`, the query goes to
the model, the theta reports `success`, and no `error` reaches any surface. In
the body position the identical source reports outcome `fail` carrying
`{"m":"boom"}`.

The form is the one the corpus tells authors to write. The
`theta/parse/interpolated-result` row (`code-registry-parse.md:72`) — the load
error bug 0079 made reachable — carries the *Fix* "Unwrap with `?` or `match`
before interpolating" and the *Message* "unwrap with ? or match first". Applied
in place, `?` renders `null` and `match` is refused
`theta/parse/unsupported-feature`; applied by hoisting, `let v = r?` then `${v}`
is refused `theta/parse/interpolated-result` by the same gate that issued the
instruction. All three measured below.

## Reproduction

Offline, at `a410f727`, through the production composition described in
§Observed at. `diags` is the whole unfiltered `diagnostics` array, `sent` the
list of texts handed to `pi.sendUserMessage`, `outcome`/`result`/`error` the
`BodyExecution` fields. Every fixture is `mode: prompt`.

### The measurement

```theta
---
mode: prompt
---
let r = Ok(1)
@`x${r?}`
```

```
diags   :: []
sent    :: ["xnull"]              expected under QRY-18 :21 :: ["x1"]
outcome :: success
```

### Every payload type reaches it, and one row is indistinguishable from correct

| # | prologue | interpolation | sent |
|---|---|---|---|
| a1 | `let r = Ok(1)` | `${r?}` | `xnull` (expected `x1`) |
| a2 | `let r = Ok("hi")` | `${r?}` | `xnull` (expected `xhi`) |
| a3 | `let r = Ok(true)` | `${r?}` | `xnull` (expected `xtrue`) |
| a4 | `schema S { a: integer }` / `let r = Ok(S { a: 1 })` | `${r?}` | `xnull` (expected `x{"a":1}`) |
| a5 | `let r = Ok(null)` | `${r?}` | `xnull` — **correct** (QRY-18 `:24`) |

Row a5 is the reason this defect has no signature at the wire: the wrong render
is byte-identical to the correct render of `Ok(null)`, so neither the model nor
a transcript reader can separate "the payload was `null`" from "the unwrap was
not implemented".

### The operand shape does not matter

| # | source | sent |
|---|---|---|
| b1 | `let r = Ok(1)` / `` @`x${(r)?}` `` | `xnull` |
| b2 | `` @`x${Ok(1)?}` `` (inline constructor) | `xnull` |
| b3 | `fn mk() { Ok(1) }` / `let r = mk()` (laundered, gate blind) | `xnull` |
| b4 | `fn mk(): Result<integer, QueryError> { Ok(1) }` / `let r = mk()` | `xnull` |
| b5 | `let xs = [Ok(1)]` / `` @`x${xs[0]?}` `` | `xnull` |
| b6 | inside a `fn` body: `fn f() { let r = Ok(1)` / `` let s = @`x${r?}`? `` / `s }`, called through `let out = f()?` | `xnull` |
| b7 | `let r = Ok(1)` / `let s = "s"` / `` @`a${s}b${r?}c` `` | `asbnullc` |

b7 pins that only the `?` slot is affected: the sibling `string` slot renders
correctly in the same template. b4 pins that a written `Result<…>` return
annotation — the most statically resolvable form — changes nothing, because the
skip is by node kind, not by type.

### Arithmetic over the unwrapped operand renders a plausible wrong number

```
@`x${r? + 1}` with let r = Ok(1)
   diags :: []      sent :: ["x1"]      expected :: ["x2"]
```

`evaluateBinaryExpression` (`production-theta-producer.ts:6025–6073`) recurses into
the same evaluator for each operand (`:6037`, `:6044`), so the `?` operand
arrives as `null` and the sum renders as an integer that is off by the payload.
This is the fixture bug 0079's control cell a14 uses at parse level.

### The `Err` operand: the early-return is dropped, and the query is sent

```theta
---
mode: prompt
---
schema E { m: string }
let r = Err(E { m: "boom" })
@`x${r?}`
```

```
diags   :: []
sent    :: ["xnull"]
outcome :: success        result :: { present: true }        error :: absent
```

The same source with the query discarded (`` let _ = @`x${r?}` ``) is identical:
`sent :: ["xnull"]`, `outcome :: success`. There is nothing for QRY-21 to be
about today — no panic and no propagation arises, so the discard form contains
nothing.

### The same operands through the statement executor — the divergence

| # | source | observed |
|---|---|---|
| g1 | `let r = Ok(1)` / tail `r?` | `outcome success`, `result { present: true, value: 1 }`, `sent []` |
| g2 | `let r = Ok(1)` / `let v = r?` / tail `v` | `outcome success`, `value 1` |
| g3 | `let r = Err(E { m: "boom" })` / `let v = r?` / tail `v` | `outcome fail`, `error {"m":"boom"}` |

g1/g2 against a1, and g3 against the `Err` row above, are the whole defect: one
HEAD, one operand, two evaluation paths, opposite answers. `1` and a real `fail`
in the body; `null` and a `success` in the query.

### The bug-0019 position, measured on both paths

| # | source | observed |
|---|---|---|
| h1 | `schema S { r: integer }` / `let o = S { r: 1 }` / `let v = o.r?` | **throws** `QuestionOperandDefectError`: "internal defect: '?' operand evaluated to a non-Result value (a number); the parse-time ERR-18 operand gate (theta/parse/question-on-non-result) did not reject this site — a gate gap (bug 0019)" |
| h2 | the same `o` / `` @`x${o.r?}` `` | `diags []`, `sent ["xnull"]`, `outcome success` |

h1 is bug 0019's fix working. h2 is the same ERR-18 violation in the
interpolation position, where no unwrap runs, so no guard can fire: the operand
type is never examined and the site is indistinguishable from a1.

### Controls that render correctly — the position, not the value

| # | source | observed |
|---|---|---|
| k1 | `let v = Ok(1)?` / `` @`x${v}` `` | `sent ["x1"]` |
| k2 | `let r = Ok(1)` / `let v = r?` / `` @`x${v}` `` | **REFUSED** `theta/parse/interpolated-result` |
| k3 | `let r = Ok(1)` / `let v = match r { Ok(v) => v, Err(e) => 0 }` / `` @`x${v}` `` | `sent ["x1"]` |
| k4 | `let r = Ok(1)` / `` @`x${match r { Ok(v) => v, Err(e) => 0 }}` `` | **REFUSED** `theta/parse/unsupported-feature` |
| k5 | `let r = Ok(1)` / `` @`x${r}` `` | **REFUSED** `theta/parse/interpolated-result` (bug 0079, unchanged) |

k1 proves the render is capable of the value: an unwrap hoisted to a `let` whose
recorded type object is freshly minted renders `x1`. k2 is the same hoist over an
identifier operand and is refused at load — `static-type-inference.ts:234–235`
propagates the operand's `CompatType` **object** verbatim, and
`resultBindings` is keyed by object identity, so `v` inherits `r`'s recorded
`Result` provenance even though `?` consumed it. k4 is `expressions.md:40` doing
its job. k5 is the control that bug 0079's gate is untouched by this report.

Taken together, k1–k5 exhaust the routes the registry row's *Fix* column names:
`?` in place is silently wrong (a1), `match` in place is refused (k4), the `?`
hoist is refused (k2). Only the `match` hoist (k3) and an inline-constructed
operand (k1) work.

## Expected behaviour

Four sentences govern, and they agree.

1. **`expressions.md:3`** — "The same grammar applies wherever an expression is
   expected: the RHS of `let`, `if` / `match` scrutinees, function arguments, and
   inside `${...}` template interpolations." One grammar, so one evaluation
   semantics.
2. **`expressions.md:17`** and **`:19`** — postfix `?` is a supported form, and
   `${...}` "takes any expression listed above". **`:40`** removes exactly two
   forms from that position, a nested `@`-query and `match`, and `?` is not
   among them. The implementation agrees at the parse layer: measured,
   `${r?}` yields `diagnostics []` and `${match …}` yields
   `theta/parse/unsupported-feature`.
3. **`expressions.md:186`** — `?` "unwraps `Ok` to the inner value; on `Err`,
   *early-returns* the `Err` from the enclosing function (or top-level theta)".
   Both halves are specified; neither is positional.
4. **QRY-18** (`query-escapes-stringification.md:16`) — the interpolation
   renders "by the **Theta static type** of the expression". The static type of
   `r?` is the operand's success type, which
   `static-type-inference.ts:234–235` states in the implementation as well
   ("`operand?` propagates the operand's success type statically").

So for `let r = Ok(1)` / `` @`x${r?}` ``: `?` unwraps to the `integer` `1`, QRY-18's
`:21` row renders it as canonical decimal, and the rendered turn is `x1`. For
each §Reproduction payload row: `xhi` (`:20`), `xtrue` (`:23`), `x{"a":1}`
(`:27` with outbound wire-name translation), `xnull` for `Ok(null)` (`:24`) —
and `x2` for `${r? + 1}`.

For an `Err` operand, `:186` gives one answer directly: the `Err` early-returns
from the enclosing theta. The query is a statement whose rendered text is being
built, so the early return precedes any dispatch — nothing is sent and the
theta's terminal `Result` is that `Err`, which is exactly the observed body-path
behaviour (§Reproduction g3). Two constraints qualify it, and reconciling them is
§Fix (c)'s adjudication: `renderQueryText` is a synchronous `string`-returning
function called from three sites with no propagate channel, and QRY-21 (`:58`)
already establishes that an interpolation-time abort is a panic that `let _ =`
cannot contain. What is not in doubt is the disposition the implementation
currently has: neither of them. The failure is discarded and the query is sent.

`expressions.md` prescribes no third option for a valueless `?`. The
implementation's `null` is attributed to "the expressions.md safety net" at four
places in the render's own file (`production-theta-producer.ts:5621`, `:5661`,
`:5791–5792`, `:5885`), and no such sentence exists there — the string
`safety net` does not occur in `docs/spec_topics/expressions.md` at this HEAD. QRY-18's `:24` `null` row is
the nearest text, and it is about an expression whose Theta static type *is*
`null`, not about an expression the evaluator declines to evaluate.

## Actual behaviour / root cause

**One operator, two evaluators, three disagreements.** The sharpest statement of
the defect is the pair, measured on one HEAD and one operand:

| | body position (`let x = r?`) | interpolation position (`${r?}`) |
|---|---|---|
| `r = Ok(1)` | `1` | `null` → the model receives `xnull` |
| `r = Err(E { m: "boom" })` | outcome `fail`, `error {"m":"boom"}` | query SENT, outcome `success`, no `error` |
| `r` is not a `Result` (`o.r?`) | `QuestionOperandDefectError` (bug 0019) | `null`, no diagnostic |

The runtime statement executor implements `?`: `evalExpr` intercepts
`expr.kind === "try"` at `src/runtime/statement-executor.ts:614–616` and
`evalTry` (`:1058–1082`) resolves the operand, brand-guards it (`:1074–1076`),
applies `evaluateQuestion` (`:1077`), and returns either the unwrapped payload
(`:1079`) or the `propagate` flow (`:1081`). The interpolation-render evaluator
does not: `evaluatePureExpression`'s switch (`:5795–5887` in
`src/extension/production-theta-producer.ts`) has fourteen `case` labels and no
`try`, so the node reaches `default: return null` (`:5882–5886`).

**Why the missing arm is invisible everywhere except the render.**
`evaluatePureExpression` is also the executor's pure sub-expression host (wired
at `:1465`, `:1729`, `:2246`), and on that path a `try` node can never arrive:
`evalExpr` filters it out before the pure fall-through
(`statement-executor.ts:761–766`), `evalAsResult` before its own (`:1010–1012`),
the composite-literal arms recurse through `evalExpr` (`:648–676`), the pure
OPERATOR arms re-route each operand subtree through `evalExpr` for exactly this
reason (`:677–693`), and `evalMatch` evaluates the selected arm body through
`evalExpr` rather than the pure host for the same stated reason (`:1096–1106`).
The `default` arm's own comment records the resulting premise — "`try` / `match`
/ effect forms are driven by the executor (not the pure host)". The render
breaks it: `stringifyInterpolation` (`:5657`) parses the interpolation source at
`:5658` and hands the node straight to `evaluatePureExpression` at `:5664`. It
is the one caller that can present a `try` node, and it is synchronous, so the
executor's re-route strategy is unavailable to it (`evalExpr` is `async`).

**The `null` is then rendered correctly, which is what makes it silent.**
`interpolationTypeOf` (`:5760`) reads the *runtime value*, not the expression:
the `null` arm (`:5770–5772`) fires and `stringifyInterpolatedValue` emits
QRY-18's `:24` literal text. Each layer honours its own contract; the value is
already wrong when it arrives. There is no post-condition to violate —
`ThetaValue` includes `null`, so a `null` from the `default` arm and a `null`
from a genuine `Ok(null)` payload (§Reproduction a5) are the same value of the
same type.

**The `Err` loss is structural, not an oversight in the same place.**
`evaluatePureExpression` returns `ThetaValue`. `evalTry`'s two outcomes are a
value and a `propagate` flow (`EvalResult`), and the second has no
representation in `ThetaValue`. So even a correct `Ok`-unwrapping arm added to
the switch could not express `expressions.md:186`'s second half; the render
would have to raise, or the propagate flow would have to be plumbed out through
`renderQueryText` and its three call sites (`:1476`, `:2350`, `:5050`). Today it
does neither: measured, the `Err` is discarded, the rendered text goes to the
model, and the theta reports `success`.

**Nothing on any layer can see it.** Four gates could have:

- the interpolation-position form gate
  (`src/parser/theta-document.ts:6482–6527`) rejects only a nested `match` or
  `@`-query, mirroring `expressions.md:40` — `?` is admitted, correctly;
- bug 0079's static gate skips a `try` node deliberately
  (`src/parser/type-layer-checks.ts:1280–1287`), correctly — `r?` is not a
  `Result`;
- ERR-18's operand gate is a parse-time check on the operand's type
  (`type-layer-checks.ts`, `questionOperandKind`), which is unrelated to the
  render, and bug 0019's runtime brand guard lives in `evalTry`, which this path
  never enters (§Reproduction h1/h2);
- the render's own two documented `null` fallbacks — an unparseable source and
  an expression with "no pure runtime value" (`:5613–5625`) — describe neither
  case: measured, `"r?"` parses to a `try` node, and the operand has a value.

**Reach.** One evaluator, three render call sites, every query dispatch shape:
the QRY-6 empty-template short-circuit test (`:1476`), the prompt-mode /
two-phase dispatch (`:2350`), and `renderTypedAwareQueryText` (`:5050`). The
`system:` interpolation surface is out of reach by grammar
(`src/parser/system-interpolation.ts:9–13`). Measured, the defect is not
top-level-only: a query inside a `fn` body renders identically
(§Reproduction b6).

**The lockstep rule this violates is already recorded.** Bug 0027's §Fix states
it for the same two hosts: "One definition point, four call sites. The two hosts
move in lockstep: the effectful executor and the pure producer implement the
same dispatch and a gate on one alone leaves the other leaking." Its fix landed
`applyStdlibMethod` / `evaluateStdlibMethod` as byte-identical arms
(`statement-executor.ts:926`, `production-theta-producer.ts:5998`). `?` has one
implementation and one omission across the same pair.

**The workaround is refused by a sibling fix.** `let v = r?` then `${v}` is
refused `theta/parse/interpolated-result` (§Reproduction k2). Mechanism, by
construction and by measurement: `static-type-inference.ts:234–235` returns the
operand's own `CompatType` object for a `try` node, so `let v = r?` records for
`v` the identical object `let r = Ok(1)` recorded for `r`; bug 0079's
`resultBindings` is a `Set<CompatType>` keyed by object identity
(`type-layer-checks.ts:563`, written `:644–660`) and `interpolationIsResult`'s
`ident` arm tests membership (`:1333–1336`). The inline-constructed form escapes
it (k1) because `#typeExpr`'s `result-ctor` arm mints a fresh object per call.
That refusal is a separate defect — a valid theta refused — and is fenced in
§Non-goals; it is measured here because it closes the only obvious route around
this one.

## Why it matters

- **The prompt text is silently wrong on a production path.** Measured: the
  model receives `xnull` where the author wrote an unwrap, with `diagnostics []`,
  no panic, no system note, and outcome `success`. Nothing on any channel
  records that the payload never reached the template.
- **The wrong render has no signature.** It is byte-identical to the correct
  render of `Ok(null)` (§Reproduction a5), so it cannot be distinguished at the
  wire, in a transcript, or by a model. An arithmetic interpolation is worse
  still: `${r? + 1}` renders `x1` instead of `x2` — a well-formed number that is
  wrong by the payload.
- **A routed failure disappears.** With an `Err` operand the theta sends the
  query anyway and reports `success` with no `error`, where the identical source
  in body position reports `fail` carrying the payload. `?` is the spec's
  propagation operator; in this one position it neither propagates nor reports.
- **The corpus prescribes the broken form.** The registry *Fix* for
  `theta/parse/interpolated-result` is "Unwrap with `?` or `match` before
  interpolating" and its *Message* says the same. Of the three routes that text
  implies, one is silently wrong (a1), one is refused as unsupported (k4), and
  one is refused by the gate that issued the instruction (k2). An author
  following the diagnostic lands on the defect.
- **Two evaluators disagree about one operator.** Bug 0027 recorded the lockstep
  obligation for this exact host pair after a leak; `?` is the next instance,
  and the divergence is measurable in three directions at once (payload,
  failure, ERR-18 violation).
- **The forms are ordinary.** `${r?}`, `${xs[0]?}`, `${o.field?}` and
  `${r? + 1}` are the natural ways to place an unwrapped value in a prompt, and
  the corpus admits all of them (`expressions.md:19`).
- **Nothing in the suite scores it.** No test asserts the render of a
  `?`-bearing interpolation; the three cells that use the form assert parse
  silence, and two of them record the wrong render in a comment rather than a
  failing assertion (`tests/interpolated-result-gate.test.ts:661–663`,
  `:114–115`). A silent wrong observable that is documented in a passing test's
  comment stays wrong indefinitely.

## Non-goals

- **Rendering a `Result` itself as its payload.** Bug 0079 pinned that
  disposition: QRY-18 fixes `Result` as a rejection, and changing it is a GOV-30
  spec edit. This report is about an expression whose static type is *not* a
  `Result` because `?` consumed it.
- **The `match`-in-interpolation refusal** (`expressions.md:40`,
  `theta-document.ts:6482–6527`). By design, so that template evaluation stays
  code-only; measured firing correctly (k4). The corpus's advice to `match`
  first therefore means "in a `let`, then interpolate the binding" (k3).
- **The hoist false positive** (k2): `let v = r?` then `${v}` refused
  `theta/parse/interpolated-result`. A consequence of bug 0079's identity-keyed
  `resultBindings` meeting `static-type-inference.ts:234–235`'s verbatim type
  propagation, and outside the registered Trigger (`v` is not `Result`-typed —
  the same sentence the skip at `type-layer-checks.ts:1280–1287` relies on). A
  refusal of a valid theta rather than a silent wrong value, so a different
  class; it needs its own report and its own adjudication. Measured here only
  because it removes the workaround.
- **A `Result` nested inside an interpolated array or object** — bug 0079
  residual (i), unfixed and fenced by that report's §Non-goals; filed as
  [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md). Disjoint
  input class: there the interpolated expression IS a container holding a
  `Result`, here it is a `?` that consumed one.
- **Effect forms in interpolation position.** An `invoke(…)` or a Pi-tool /
  `.theta`-callable call inside `${…}` also lands on the same `default` arm (the
  `call` arm returns `null` for a non-`fn` callee,
  `production-theta-producer.ts:5844–5859`), and `renderQueryText`'s docstring
  names that as intended ("no pure runtime value"). Whether an admitted-but-
  inert effect interpolation owes a diagnostic is a separate adjudication; this
  report's subject is a *pure* form the evaluator does not implement.
- **The `system:` interpolation surface**, whose grammar admits only a bare
  identifier path (`src/parser/system-interpolation.ts:9–13`, `:71`), so `?`
  cannot be written there.
- **ERR-18's static operand gate.** Its partiality is bug 0019's subject and its
  §Fix's deliberate posture. This report adds only the measurement that bug
  0019's runtime guard is unreachable from the render (h2); it does not reopen
  the gate's coverage.

## Fix

**Not settled.** The `Ok` arm is mechanical; the `Err` arm needs an adjudication
that the render's synchronous signature forces. Six constraints bind any route,
and (c) is the open question.

**(a) The `?` semantics must be shared, not reimplemented.** Bug 0027's rule
governs this host pair by name: one definition point, both hosts. The definition
point already exists and is synchronous — `evaluateQuestion`
(`src/runtime/runtime-panics.ts:389–396`) takes a thunk and returns
`{ kind: "value" } | { kind: "propagate" }`, and `evalTry` calls it at
`statement-executor.ts:1077`. An added `try` arm calls the same primitive on the
pure-evaluated operand. A second copy of the `Ok`/`Err` discrimination in
`production-theta-producer.ts` is the failure mode to avoid: it is what leaves
the two paths free to drift again, which is the drift this report measures.

**(b) The ERR-18 brand guard travels with it.** `evalTry` guards with
`isResultValue` before unwrapping and throws `QuestionOperandDefectError`
otherwise (`:1074–1076`, bug 0019). The interpolation position reaches the same
unclassifiable operands — member, index and identifier reads (§Reproduction h2)
— so an arm that calls `evaluateQuestion` without the guard imports bug 0019's
forged-`Err` corruption into a new position. Guard placement and defect class
are already decided by 0019; reuse both. One consequence the fix states
explicitly: h2 changes from a silent `xnull` to a loud defect abort, which is
0019's intended disposition for that operand.

**(c) The `Err` arm — the adjudication this report owes.** Two readings, and the
choice is not free:

1. **Propagate.** `expressions.md:186` says `?` on `Err` early-returns the `Err`
   from the enclosing theta, without positional qualification, and that is what
   the body path does (g3). Realising it means giving the render a channel for
   `evalTry`'s `propagate` flow: `renderQueryText` returns `string` and is called
   from `:1476`, `:2350` and `:5050`, so the flow has to be carried out of three
   sites and through the query-effect dispatch. The upside is that one operator
   then means one thing everywhere, which is (a)'s whole point.
2. **Panic on the routing bug 0079 established.** `InterpolatedResultPanic`
   (`src/render/query-render.ts:110–116`) is a `ThetaPanic` subclass expressly so
   that QRY-21 (`query-escapes-stringification.md:58`) holds — a panic raised
   during interpolation propagates before a `let _ =` binding completes and the
   discard form cannot contain it. That is the only exit a synchronous
   `string`-returning render has today, and QRY-18's `:32` note establishes the
   precedent that the interpolation surface may answer with a panic where the
   static layer cannot decide.

Whichever is chosen, three properties are not negotiable and are measured absent
today: the `Err` is **not discarded**; **no query text is sent** on that path
(measured: `sent :: ["xnull"]` today); and the disposition is **not containable
by `let _ =`** (QRY-21). Reading 2 satisfies all three with existing mechanism
and diverges from `:186` inside interpolations, which then needs one sentence of
spec text saying so — at `:186` or beside QRY-18 — because the corpus currently
states the early-return unqualified. Reading 1 satisfies all three and keeps the
corpus as written, at the cost of the propagate plumbing. Pick and record the
reason; do not leave the observable to fall out of the implementation.

**(d) Bug 0079's structure is preserved.** One emission site in `src/` for
`theta/parse/interpolated-result` (`checkQueryInterpolationResults`) and one
runtime raise (`stringifyInterpolation:5680`); `InterpolatedResultPanic` stays a
`ThetaPanic`; `interpolationTypeOf` keeps classifying a `Result` by brand and an
ordinary boolean-`ok` object by the object arm (bug 0017,
`:5779–5783`). If (c) reading 2 is taken, the spec silence
[0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) records —
`error-model.md` §"Runtime panics" does not enumerate the parse-coded
interpolation panic — covers this raise too, and that report's adjudication
governs whether the list is edited; this fix does not decide it. If (c) reading 2 is taken, the `Err` arm must not become a second
raise of the same code from a second site — either it reuses the one raise or it
carries its own disposition, stated. No new registry row is needed for reading 2;
if the adjudication mints a code instead, DIAG-2 puts its registry row and both
mirrors (`docs/reference/diagnostics.md`) in the same commit.

**(e) Sibling-witness coordination — three comment sites.**
`tests/interpolated-result-gate.test.ts` records today's `xnull` in prose at
`:114–115` (header inventory) and `:661–663` (cell a7's parenthetical). Cells a7,
a14 and a15 must stay **green** — the 0079 gate's silence on `${r?}`,
`${r? + 1}` and `${c ? r? : 0}` remains correct after this fix — while their
comments become false and must be corrected in the same commit. The a14 fixture
is also this report's arithmetic row, so the fix has a render assertion to add
where a14 asserts parse silence.

**(f) Controls to preserve, all measured today.** `${r}` still refused
`theta/parse/interpolated-result` (k5); `let v = Ok(1)?` / `${v}` still renders
`x1` (k1); the `match` hoist still renders `x1` (k3); `${match …}` still refused
`theta/parse/unsupported-feature` (k4); `Ok(null)` still renders `xnull` (a5) —
which after the fix is the only input that may render `null`; an ordinary object
carrying a boolean `ok` field still renders through the object arm (bug 0017's
c-cells). k2's refusal is expected to survive this fix unchanged: it is the
separate defect fenced in §Non-goals, and a fix here that silently changes it has
changed something it did not adjudicate.

**Witness — offline, provider-free.** Every §Reproduction row settles inside one
`parseThetaDocument` plus one `executeBody` over the live-session double already
in `tests/interpolated-result-gate.test.ts` groups (b)/(c), so the harness exists
and the file to extend (or the model for a new one) is that one. Required: the
payload matrix a1–a5 with its expected renders, the operand-shape rows b1–b7,
the arithmetic row, the `Err` row and its `let _ =` twin, the executor pairs
g1–g3 and h1–h2 (which are what make the divergence assertable in one file), and
every control of (f). Read expected diagnostic messages from the registry per
DIAG-4, as that file already does.

## Provenance

- **Origin:** bug 0079's fix (0.69.0, commit `a410f727`) — residual (iii) of its
  `## Fix (0.69.0)` record and the third item of its fix report's
  §"Residuals / notes": "An interpolation of a `?`-unwrapped operand renders
  `null`, not the unwrapped payload. `evaluatePureExpression` has no `try` arm,
  so `${r?}` falls to the expressions.md safety net and the model receives
  `xnull` where the author wrote the unwrap. Found by the Phase-1 test writer; a
  wrong observable, distinct from 0079's rejection concern. The static gate
  correctly stays silent on the form (witness a7)." Attribution: the `${r?}` →
  `xnull` observable and the missing-arm diagnosis are that report's; everything
  else below was measured for this one at `a410f727`.
- **Added by this report:** the payload matrix and its per-row expected renders
  (a1–a5, including the `Ok(null)` collision); the operand-shape rows (b1–b7);
  the arithmetic row (`x1` for `${r? + 1}`, expected `x2`); the `Err`-operand
  measurement (query sent, outcome `success`, no `error`) and its `let _ =`
  twin; the two-evaluator divergence measured on one operand (g1–g3); the
  bug-0019 contrast on one operand across both paths (h1–h2); the five controls
  (k1–k5), which establish that the registry row's own *Fix* text leads to the
  defect; the identification of the "safety net" as the switch's own `default`
  arm with no anchoring sentence in `expressions.md`; the confirmation that
  `parseExpressionSource("r?")` yields a `try` node, ruling out the render's
  unparseable-source fallback; the reach across the three `renderQueryText` call
  sites; and the `ThetaValue`-return argument that makes the `Err` arm an
  adjudication rather than an omission.
- **Spec:** `docs/spec_topics/expressions.md:3` (one grammar, every position),
  `:17` (postfix `?` supported), `:19` (`${...}` takes any supported
  expression), `:40` (the two forms excluded from interpolation position),
  `:186` (the `?` unwrap / early-return semantics), `:203` (ERR-18);
  `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18), `:20`,
  `:21`, `:22`, `:23`, `:24`, `:25`, `:26`, `:27` (the render rows), `:28` (the
  `Result` row), `:32` (static-where-possible note), `:58` (QRY-21);
  `docs/spec_topics/diagnostics/code-registry-parse.md:72` (the
  `theta/parse/interpolated-result` row, its *Fix* and *Message* columns).
  Verified absent: any "safety net" sentence in
  `docs/spec_topics/expressions.md`.
- **Implementation evidence at `a410f727`:**
  `src/extension/production-theta-producer.ts:5786–5793` (the docstring),
  `:5794–5888` (**`evaluatePureExpression`**, the fourteen `case` labels and the
  `default: return null` at `:5882–5886`), `:5613–5636` (`renderQueryText` and
  its docstring), `:5657–5682` (`stringifyInterpolation`; the evaluate at
  `:5664`), `:5760–5784` (`interpolationTypeOf`; the `null` arm `:5770–5772`,
  the brand arm `:5779–5781`, the object fall-through `:5783`), `:6025–6073`
  (`evaluateBinaryExpression`), `:5844–5859` (the `call` arm's `null` for a
  non-`fn` callee), `:1465`, `:1729`, `:2246` (the `evaluatePure` wirings),
  `:1476`, `:2350`, `:5050` (the three render call sites), `:5998`
  (`evaluateStdlibMethod`, bug 0027's lockstep twin);
  `src/runtime/statement-executor.ts:609–616` (`evalExpr` and its `try`
  interception), `:648–676` (the composite arms), `:677–693` (the operator
  re-route and its `default: return null` rationale), `:761–766` and
  `:1010–1012` (the two pure fall-throughs), `:926` (`applyStdlibMethod`),
  `:966` (`evalAsResult`), `:1047–1049` (`asResultValue`), `:1058–1082`
  (**`evalTry`**: the guard `:1074–1076`, `evaluateQuestion` `:1077`, the
  propagate `:1081`), `:1096–1106` (`evalMatch`'s arm-body re-route);
  `src/runtime/runtime-panics.ts:67` (`ThetaPanic`), `:389–396`
  (`evaluateQuestion`), `:420–427` (`QuestionOperandDefectError`);
  `src/render/query-render.ts:80`, `:95`, `:110–116`, `:396`
  (`stringifyInterpolatedValue`); `src/parser/type-layer-checks.ts:563`,
  `:644–660`, `:1271–1298` (the `try` skip at `:1280–1287`), `:1325–1350` (the
  `ident` arm at `:1333–1336`);
  `src/parser/static-type-inference.ts:234–235`;
  `src/parser/theta-document.ts:1148–1159` (`parseExpressionSource`),
  `:6482–6527` and `:6562` (the interpolation-position form gate);
  `src/parser/system-interpolation.ts:9–13`, `:56`, `:71`.
- **Reports read in full for duplicate separation:** 0079 (and its fix report),
  0019, 0027, 0113 (structure).
- **Observations:** three scratch vitest files over the production composition
  drive harness of `tests/interpolated-result-gate.test.ts` groups (b)/(c),
  written, run at `a410f727`, and deleted. All rows offline and deterministic;
  no live model, no provider.

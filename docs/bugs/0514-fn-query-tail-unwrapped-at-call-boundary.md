# Bug 0514 — a call to a `fn` whose tail is a bare `@`-query hands the caller the RAW query outcome, not the `Result<T, QueryError>` FN-3 assigns it: `evalUserFnCall` runs the body with its tail at the terminal disposition and nothing re-wraps at the fn-call boundary, so `let r = f()` binds the raw reply (`match r { Ok … Err … }` panics `MatchError`) and a failing query aborts the caller even when a `match` consumes the call — newly reachable in multi-statement bodies since the 0510 fix

- **Status:** open — filed 2026-10-03 as residual 4 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix
  (0.496.0)` Residuals, item 4)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S1/D2 — S1: `let r = f()` binds a raw payload where
  the spec types a `Result`, with no diagnostic at load. The documented
  consumption then aborts on the success path (`MatchError`), and on the
  failure path the theta fails even though the author's `match` consumes
  the call. This is the shape bug 0351 fixed for a direct `let r = @`q``.
  D2: the change is confined to `src/runtime/statement-executor.ts`
  (thread the call site's disposition into the fn body's tail and fn-level
  `return` operands), with one existing pin re-pinned by design
  (`tests/b0510-block-trailing-call-tail.test.ts:370`) and no new registry
  row.
- **Kind:** implementation defect (runtime, user-fn call boundary).
- **Observed at:** main 0eb38a8a (0.496.0), 2026-10-03; scratch vitest over
  `parseThetaDocument` + `executeBody`, provider-free; scratch deleted.
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/runtime/statement-executor.ts:286` — `evalUserFnCall`. It runs
    the body with `executeBlock(fn.body, scope, bodyDeps)` (`:345`),
    passing no disposition, so the default `atTerminal = true` (`:815`)
    applies. The flow switch (`:360-377`) passes a `value` / `return` flow
    through unwrapped (`:365`) and a `fail` flow through as `fail`
    (`:373-374`). Only a `?`-propagation is turned into a carried value,
    `makeErr(flow.err)` (`:369-372`).
  - `src/runtime/statement-executor.ts:840-847` — `executeBlock` evaluates
    the tail with the caller-supplied `atTerminal`. Its comment says a
    body block's tail is "a returned/discarded value at a body/statement
    block (the caller's own terminal boundary re-wraps once)". The
    user-fn call boundary performs no such re-wrap.
  - `src/runtime/statement-executor.ts:781-790` — the `return` arm
    evaluates its operand with `atTerminal = true` (`:787`) in every body,
    a fn body included.
  - `src/runtime/executor-result-flow.ts:140` — `evalCheckpointedEffect`.
    At `atTerminal = true` a query success stays RAW (`:204-207`) and a
    query failure becomes `flow: "fail"` (`:226-233`). The comment at
    `:200-203` names the positions that re-wrap a raw terminal value: "the
    body boundary (`makeOk(flow.value)`) and the par-for element
    normaliser". The user-fn call boundary is not one of them.
  - `src/runtime/statement-executor.ts:730` — the direct binding
    `let r = @`q`` evaluates its initialiser at the default
    `atTerminal = false`, so the same effect arm binds `Ok(payload)`
    (`executor-result-flow.ts:205`) or `Err(error)` (`:227`).
  - `src/runtime/executor-result-flow.ts:77` — `evalAsResult`. For a
    user-fn call as a `?` operand or `match` scrutinee it applies
    `asResultValue` to a `value` flow (`:93-101`), which hides the raw
    success at those two positions. A `fail` flow returns unchanged
    (`:97-98`), so the failure still aborts there.
  - `src/runtime/statement-executor.ts:460-469` — `evalExpr`'s call arm
    routes an ordinary `fn` to `evalUserFnCall` and does not forward its
    own `atTerminal` (`:468`).
  - `src/parser/static-type-inference.ts:420-433` — the static pass types
    a user-fn call as the nominal `named(<callee>)`, and a query as
    `named(<schema> ?? "query")` (`:440-441`). No load-time check
    compares the call's value against FN-3's `Result` type:
    `let r: string = f(1)` loads clean.
- **Spec:**
  - `docs/spec_topics/query/query-forms.md:11` (QRY-1) — untyped query
    "Return type: `Result<string, QueryError>`"; `:21` (QRY-2) — typed
    query "Return type: `Result<Schema, QueryError>`".
  - `docs/spec_topics/query/query-failure-and-repair.md:9` (QRY-8) — "A
    query never throws. Both forms return a `Result`".
  - `docs/spec_topics/functions.md:26` (FN-3) — a fn with no return
    annotation infers its type from the tail and every `return` operand;
    `:28` — "The inferred type is wrapped in `Result<T, QueryError>` …
    when any contributing operand is itself `Result`-typed", where `T` is
    the success payload. A bare `@`q`` tail is such an operand, so
    `fn f() { … @`q` }` has type `Result<string, QueryError>`.
  - `docs/spec_topics/functions.md:44` (FN-5) — a function's final value
    "is the value of its tail expression on the success path, the operand
    of an explicit `return expr`" otherwise.
  - `docs/spec_topics/errors-and-results/error-model.md:10` — an
    `Err`-class outcome reaches the *fail* arm "only when the resulting
    `Err` is unhandled — propagated via `?` or returned, not consumed by a
    caller `match`".
  - `docs/reference/grammar.md:279` — `FnBody ::= "{" Stmt* Expr? "}"`.

## Symptom

```
fn f(n: number) { let z = 1
  @`q ${n}` }
let r = f(1)
match r { Ok(v) => "OK:" + v, Err(e) => "ERR" }
```

The query runs and settles. The theta then aborts with
`MatchError: no arm matched settled-reply`: `r` holds the reply string, not
`Ok("settled-reply")`. The single-form body `fn f(n: number) { @`q ${n}` }`
aborts identically. Replacing `let r = f(1)` with `let r = @`q 1`` yields
`"OK:settled-reply"`.

When the query fails, `let r = f(1)` does not bind `Err(e)`: the whole theta
ends `fail` with the query's error, and the `Err` arm never runs. The same
holds for `match f(1) { Ok(v) => …, Err(e) => … }`, where the call is the
`match` scrutinee itself.

## Observed (0eb38a8a, 0.496.0, 2026-10-03)

Harness 1: scratch vitest over the production `parseThetaDocument` and the
real `executeBody`, on the `ScriptedHost` seam bugs 0351 and 0387 use, with
the query scripted to succeed with `"PAYLOAD"` or fail with
`{ kind: "transport" }`. Every fixture loads with zero diagnostics. `M` is
`match r { Ok(v) => v, Err(e) => "ERRARM" }`.

| cell | source | query succeeds | query fails |
|---|---|---|---|
| M1 | `fn f(n: number) { let z = 1⏎ @`q` }` ⏎ `let r = f(1)` ⏎ `M` | `MatchError: no arm matched PAYLOAD` | outcome `fail` |
| S1 | `fn f(n: number) { @`q` }` ⏎ `let r = f(1)` ⏎ `M` | `MatchError: no arm matched PAYLOAD` | outcome `fail` |
| D1 | `let r = @`q`` ⏎ `M` (direct binding) | `"PAYLOAD"` | `"ERRARM"` |
| M2 | M1's `f` ⏎ `match f(1) { Ok(v) => v, Err(e) => "ERRARM" }` | `"PAYLOAD"` | outcome `fail` |
| M3 | M1's `f` ⏎ `let v = f(1)?` ⏎ `v` | `"PAYLOAD"` | outcome `fail` |
| M4 | M1's `f` ⏎ `let a = [f(1)]` ⏎ `a` | `["PAYLOAD"]` | outcome `fail` |
| M5 | `fn f(n: number): Result<string, QueryError> { let z = 1⏎ @`q` }` ⏎ `let r = f(1)` ⏎ `M` | `MatchError: no arm matched PAYLOAD` | outcome `fail` |
| M6 | `fn f(n: number) { let z = 1⏎ return @`q` }` ⏎ `let r = f(1)` ⏎ `M` | `MatchError: no arm matched PAYLOAD` | outcome `fail` |
| C1 | `fn f(n: number) { let z = 1⏎ let s = @`q`⏎ s }` ⏎ `let r = f(1)` ⏎ `M` | `"PAYLOAD"` | `"ERRARM"` |
| T1 | M1's `f` ⏎ `f(1)` (theta tail) | outcome `success`, value `"PAYLOAD"` | outcome `fail` |
| T2 | `@`q`` (theta tail) | outcome `success`, value `"PAYLOAD"` | outcome `fail` |

M2 and M3 succeed only because `evalAsResult` wraps a user-fn call's value
at those two positions. C1 is the control: a tail that reads a `let`-bound
query carries the `Result` the binding made. T1 and T2 show that a call at
the theta's own tail position behaves as the query does there.

Harness 2: the production-producer instant-settle drive (`driveInterp` from
`tests/helpers/runtime-belt-probe-harness.ts`). M1 and S1 with
`match r { Ok(v) => "OK:" + v, Err(e) => "ERR" }` both throw
`MatchError: no arm matched settled-reply`. D1 yields `"OK:settled-reply"`.

## History: why the multi-statement form is newly reachable

The single-form `fn f() { @`q` }` has produced this result since before the
0510 fix (0510 probe B3b). Before 0.496.0 the multi-statement form never
ran. Its trailing query was not promoted to `Block.tail`, so it parsed as a
bare query statement. Under a strict parse that drew QRY-19
`theta/parse/discarded-query-result`
(`docs/spec_topics/query/query-escapes-stringification.md:43`, registry row
`docs/spec_topics/diagnostics/code-registry-parse.md:85`). The 0510 fix
record corrects its own §Symptom on this point: the shape was a parse
error, not a silent `null`. Since 0510's `"final-form"` promotion the query
is the `FnBody` tail, the QRY-19 refusal no longer fires (pinned by
`tests/b0510-block-trailing-call-tail.test.ts:195`), and the body reaches
the runtime with the same result as the single form.

The 0510 witness pins the current shared result in two cells:

- `tests/b0510-block-trailing-call-tail.test.ts:292` — "fn body ending in
  a bare `@`-query yields the same value as the single-form `{ @`q` }`
  control" asserts that the multi-statement and single-form values are
  equal and that the single-form value is not null. It does not name the
  value.
- `tests/b0510-block-trailing-call-tail.test.ts:365` — the single-form
  reference cell asserts the raw value at `:370`:
  `expect(q.value, "single-form query tail").toBe("settled-reply")`.

## Expected (spec citations)

A query returns a `Result` (QRY-1 `query-forms.md:11`, QRY-2 `:21`, QRY-8
`query-failure-and-repair.md:9`). A fn whose tail or `return` operand is a
query has type `Result<T, QueryError>` (FN-3, `functions.md:26-28`), and
its final value is that operand's value (FN-5, `functions.md:44`). An
explicit `): Result<string, QueryError>` annotation (M5) states the same
type. So in M1, S1, M5 and M6 the call `f(1)` is `Ok(payload)` on success
and `Err(error)` on failure, exactly as the direct binding D1 sees. An
`Err` that the caller binds and `match`es is handled, so the theta does not
fail (`error-model.md:10`). Single-form and multi-statement bodies are the
same `FnBody` (`grammar.md:279`) and give the same result.

## Actual (implementation citations)

`evalUserFnCall` (`statement-executor.ts:286`) runs the fn body through
`executeBlock` at the default terminal disposition (`:345`, default at
`:815`). `executeBlock` hands that disposition to the tail (`:847`), and the
`return` arm uses the terminal disposition for its operand (`:787`). At the
terminal disposition `evalCheckpointedEffect` returns a query success raw
(`executor-result-flow.ts:204-207`) and a query failure as `flow: "fail"`
(`:226-233`). This is correct for the positions that re-wrap once
downstream (the theta body boundary and the `par for` element normaliser,
`par-for-executor.ts:117`). The fn-call boundary does not re-wrap
(`statement-executor.ts:360-377`): a `value` / `return` flow returns its
raw value (`:365`) and a `fail` flow propagates as `fail` (`:373-374`).

The caller therefore sees a raw value where a value position binds a
`Result` (`let`, array element, argument), and a `fail` where a `match` or
`?` should see `Err(error)`. `evalAsResult` (`executor-result-flow.ts:77`)
`asResultValue`-wraps a user-fn call's `value` flow when the call is the
direct `?` operand or `match` scrutinee (`:93-101`). That hides the success
half at those two positions (M2, M3). A `fail` flow returns from it
unchanged (`:97-98`), so the failure half is visible there too.

The static pass types the call as a nominal (`static-type-inference.ts:433`)
and does not compare it with FN-3's `Result`. No load-time diagnostic
flags either the raw binding or the `match` over it.

## Root cause

The terminal disposition exists so that a returned query outcome is
wrapped exactly once, at the boundary that receives it. Bug 0387 threaded a
value-position `BlockExpr`'s disposition into `executeBlock`. The call arm
of `evalExpr` (`statement-executor.ts:460-469`) does not thread its
disposition into `evalUserFnCall`. So a user fn's body tail is always
evaluated as if the fn were the theta body. The theta body has a downstream
re-wrap; a fn call does not.

## Fix direction

In `src/runtime/statement-executor.ts`, treat a call to an ordinary
(non-`subagent`, non-`void`) user `fn` as a pass-through position, as
`match` and ternary already are. The call site's disposition threads into
the fn body's result-producing positions:

1. `evalExpr`'s call arm (`:468`) passes its `atTerminal` to
   `evalUserFnCall`. `evalUserFnCall` passes it to `executeBlock` at
   `:345` as the fourth argument added by bug 0387.
2. A `return expr` inside the fn activation takes the same disposition. The
   `return` arm (`:787`) currently uses `true` for every body. A `return`
   can sit inside any nested `StmtBlock`, so the disposition rides on the
   activation's body deps, set by `evalUserFnCall` and read by the `return`
   arm. The theta body, with no fn activation, keeps `true`.
3. The result: a call at a value position (`let`, array element, object
   field, argument, `?` operand, `match` scrutinee) evaluates the tail
   query at the non-terminal disposition. `f()` is then `Ok(payload)` or
   `Err(error)` (`executor-result-flow.ts:205`, `:227`), the same value
   `let r = @`q`` binds. A call at a terminal position (theta tail, bare
   statement, `return` operand, `par for` body tail) keeps today's terminal
   disposition, so T1 still behaves as T2. Nesting is transitive:
   `fn h() { f(1) }` called at a value position runs `f`'s tail at the
   non-terminal disposition too.

Constraints:

- Direct query semantics are unchanged: `let r = @`q`` (0351), a
  failing-query binding (0307), `let r = { @`q` }` (0387), the theta-tail
  `@`q`` (T2), and a direct `?` / `match` over a query.
- No double wrap. A terminal call site stays terminal. The `par for`
  element normaliser (`par-for-executor.ts:117`, `makeOk(flow.value)`,
  not idempotent) and the theta body boundary therefore keep receiving the
  raw value they wrap today. A `Result` value at the theta tail ends
  `success` carrying `Err` (measured: `fn g(n: number) { let s = @`q`⏎ s }`
  then tail `g(1)` with a failing query yields outcome `success`, value
  `Err(…)`). Delivering a `Result` at a terminal call site would turn T1's
  `fail` into that shape. `asResultValue` in `evalAsResult` (`:101`) is
  idempotent over an already-`Result` value.
- Single-form and multi-statement bodies stay in parity. Both are
  `Block.tail` since 0.496.0, so they share this path.
- `evalSubagentFnCall` (`:467`) and the `void` arm (`discardForVoid`,
  `:365`) are untouched (see Scope).

Witness: M1, S1, M5 and M6 bind `Ok(payload)` on success and take the
`Err` arm on failure. M2 and M3 reach the `Err` arm and propagate
`Err(error)`, respectively, on failure. M4 binds `[Ok(payload)]` /
`[Err(error)]`. Controls D1, C1, T1 and T2 do not change. The 0510
single-form reference assertion at
`tests/b0510-block-trailing-call-tail.test.ts:370` flips from
`"settled-reply"` to `Ok("settled-reply")`; this is the re-pin this report
authorises. The parity cell at `:292` stays green, since both forms move
together. Other committed cells that bind a query-tailed fn's call at a
value position and read the raw value are found by the full suite and
re-pinned under the same authority. No spec edit and no registry row.

## Scope

Same boundary, outside this report:

- A `?`-bearing fn whose tail is a non-`Result` value. Example:
  `fn g(n: number) { let s = @`q`?⏎ s }` with `let r = g(1)` and `M`. This
  shape panics `MatchError` on success and takes the `Err` arm on failure.
  FN-3 (`functions.md:28`) gives the success path "an implicit `Ok(X)`".
  The missing piece is the implicit-`Ok` carriage of a plain value, not a
  query outcome's disposition.
- A `void` fn with a query tail. `fn f(n: number): void { … @`q` }` yields
  `null` on success and ends the caller `fail` on failure. QRY-19's last
  paragraph (`query-escapes-stringification.md:53`) specifies that `Err`
  as suppressed at the user-facing surface and emitted on the
  operator-facing channel.
- `subagent fn` calls (`evalSubagentFnCall`). Their call value follows
  `functions.md:62` ("**Call value.**").

## Related

- [0510](./0510-block-trailing-call-value-discarded.md) — parent fix. This
  report is its residual 4. Its "final-form" promotion made the
  multi-statement shape reachable. Its residual-4 text writes the
  consumer as `match f()`, but M2 shows that a direct-scrutinee `match`
  succeeds on the success path. The aborting spelling is `let r = f()`
  followed by `match r` (the 0510 fix report's wording).
- [0387](./0387-block-expr-tail-query-raw-payload-and-err-abort.md) —
  fixed (0.383.0). The same disposition defect at a value-position
  `BlockExpr` tail. Its fix added `executeBlock`'s `atTerminal`
  parameter, which this fix reuses. It kept "every body / statement /
  control-flow / par-for call site terminal", which includes the user-fn
  body.
- [0351](./0351-value-position-query-success-binds-raw-payload.md) —
  fixed (0.351.0). The success half of the direct value-position binding
  (D1).
- [0307](./0307-value-position-query-err-aborts-body-instead-of-binding.md)
  — fixed (0.298.0). The failure half of the direct value-position
  binding.
- [0513](./0513-call-static-type-nominal-not-return-type.md) — 0510
  residual 3: the static pass types a call as `named(<callee>)`, which is
  why no load-time check sees this report's divergence.
- [0017](./0017-ok-field-object-misclassified-as-result.md) — the CONV-6
  user-fn-call wrap in `evalAsResult` that hides the success half at the
  `?` / `match` positions.

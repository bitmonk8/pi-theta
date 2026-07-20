# Control Flow

Theta has three loop and branch forms. Because a query returns a value, control flow can branch on what the model just said.

**`if` / `else`** — statement form (the ternary `cond ? a : b` is the expression form):

```theta
if author.experience_years < 2 {
  @`Re-explain your top recommendation in simple language.`?
}
```

**`for` ... `in`** — iterates an array, binding the iteration variable as a fresh immutable local per iteration. The expression after `in` must have type `array<T>` for some `T`; iterating strings, objects, or numbers is `theta/parse/non-array-iterand` (use `obj.keys()` for objects, `s.split(...)` for strings). The iterand position is **not** an element-type sink for empty-array literals — `for x in []` with no surrounding sink is `theta/parse/array-no-common-type`, the same diagnostic that `let xs = []` raises in unannotated position. Annotate via a `let xs: array<T> = []` immediately above the loop, or inline the literal under a sink that supplies `T` (see [Grammar Appendix — `array<T>` literal type-sink rule](./grammar.md#arrayt-literal-type-sink-rule)).

<a id="ctrl-1"></a> **CTRL-1.** The iterand expression MUST be evaluated exactly once, at loop entry, before the first iteration; the loop then iterates the resulting `array<T>` snapshot. Where the iterand carries effects (for instance a function-call iterand, an `@`-query iterand, or an `invoke` child iterand), that effect commits exactly once at loop entry — including when the resulting array is empty and the body never runs — and reassigning a `let mut` from inside the body does not change the already-snapshotted sequence.

```theta
for area in focus_areas {
  let issues: IssueList = @`
    Review the code specifically for ${area} concerns:
    ${code}
  `?

  if issues.severity == "high" {
    @`Suggest concrete fixes for the high-severity ${area} issues you just listed.`?
  }
}
```

**`while`** — repeats while the condition is `true`. The condition must be `boolean`; theta performs no truthiness coercion, so a non-boolean condition is `theta/parse/non-boolean-condition` (see [Truthiness](./expressions.md#truthiness)):

```theta
let mut round = 0
let mut satisfied = false
while !satisfied && round < 5 {
  let critique = @`Critique round ${round + 1}: ${draft}`?
  let verdict: Verdict = @`Is the critique addressed? ${critique}`?
  satisfied = verdict.done
  round += 1
}
```

**`break` / `continue`** — bare statements; legal only inside `for` / `while` bodies. `break` outside a loop is `theta/parse/break-outside-loop`; `continue` outside a loop is `theta/parse/continue-outside-loop`. `break` exits the innermost enclosing loop; `continue` skips to the next iteration. Neither carries a value in theta 1.0: `break expr` is `theta/parse/break-with-value`. See [Future Considerations](./future-considerations.md) and [Diagnostics](./diagnostics.md).

```theta
for area in focus_areas {
  let issues: IssueList = @`Review for ${area}`?
  if issues.findings.length == 0 {
    continue
  }
  if issues.severity == "critical" {
    break
  }
  @`Drafting fixes for ${area}...`?
}
```

<a id="par-for"></a>
## Parallel fan-out — `par for`

`par for` is the parallel, value-producing counterpart of `for` (theta 1.1). It evaluates its body concurrently for each element of the iterand and collects one `Result` per element, in input order:

```theta
let reviews = par for f in findings max 8 {
  invoke<Review>("./lens.theta", f)
}
// reviews: array<Result<Review, QueryError>>
```

`par for` reuses the `for` iterand contract unchanged: the iterand must be `array<T>` (a non-array is `theta/parse/non-array-iterand`), it is evaluated exactly once at loop entry (CTRL-1), and each iteration binds a fresh immutable loop variable. Unlike `for`, `par for` is an expression: it produces a value and may appear anywhere an expression is admitted, or stand alone as an expression statement with its value discarded. The surface production is in [Grammar — Blocks](../reference/grammar.md#blocks).

<a id="ctrl-2"></a> **CTRL-2 (scheduling & width throttle).** Iterations are scheduled concurrently. When the optional `max` clause is present, at most `max n` iterations are in flight; `n` is any `integer`-typed expression, evaluated once at loop entry, and `max` only *lowers* the in-flight width. Independently of `max`, fan-out width is bounded by a throttle of **64** in-flight iterations; a `max` value exceeding the throttle clamps to it. Excess iterations queue and start as slots free, so a large iterand runs to completion 64-at-a-time. The throttle applies per loop, not per theta; nesting `par for` within `par for` is therefore legal, and worst-case concurrency multiplies (64×64). The throttle is a scheduling bound, not a runtime ceiling — reaching it queues rather than breaches (NOCEIL-5, [Hard ceilings — `par for` width throttle](../reference/hard-ceilings.md#par-for-width-throttle)). The depth-32 `invoke`-chain ceiling applies per iteration unchanged; sibling iterations do not share depth budget ([Hard ceilings](../reference/hard-ceilings.md)).

<a id="ctrl-3"></a> **CTRL-3 (value & ordering).** The value is `array<Result<T, QueryError>>`, where `T` is the body tail type (absent tail → `null`); element `i` corresponds to input element `i`. Ordering is by **input index, regardless of completion order** — the array is deterministic even though iterations complete nondeterministically. Child diagnostics aggregate to the enclosing theta's drain grouped first by input index, then by the existing `(file, line, col)` order, so diagnostic output is deterministic as well.

<a id="ctrl-4"></a> **CTRL-4 (body restrictions).** The body is **isolation-only**: it may run `invoke(...)`, `.theta` callable calls, `subagent fn` calls, Pi-tool calls, and pure computation — each child session private to its iteration, as under sequential execution. A query against the enclosing conversation (`@`...``) inside the body is `theta/parse/par-query-in-body`: a conversation is a linear transcript and concurrent `@` queries against it have no defined interleaving. Because this rule severs the only link between the body and the enclosing conversation, `par for` is legal in both prompt- and subagent-mode thetas — iteration isolation is independent of the enclosing theta's mode. Outer bindings and the loop variable are readable, but assignment to a `let mut` declared outside the body is `theta/parse/par-shared-mutation`. `break` and `continue` are `theta/parse/par-break-continue` (no defined meaning under concurrent scheduling). Pi-tool calls with observable side effects (`bash`, `edit`, `write`) are admitted, but iterations carry no defined relative order: interleaving, idempotency, and compensation are the author's responsibility, under the same no-rollback contract that governs sequential thetas (ERR-13, [Errors and results](../reference/errors-and-results.md)).

<a id="ctrl-5"></a> **CTRL-5 (run-to-completion failure & cancellation).** Iterations run to completion independently. An `Err` in one iteration does not cancel siblings; it becomes that element's value, and a postfix `?` inside the body propagates to the iteration's result, not out of the loop. A runtime panic inside one iteration does not abort the theta: the iteration boundary is a panic-downgrade point and the panic becomes that element's `Err(QueryError { kind: "invoke_infra", cause: "panic", ... })`, with siblings running to completion and the loop still yielding a full array (ERR-20, [Errors and results](../reference/errors-and-results.md#err-20)). Cancelling the enclosing theta cancels in-flight iterations and prevents not-yet-started iterations from starting; cancelled elements carry the `CancelledError` envelope.

# Control Flow

Theta has three loop and branch forms. Because a query returns a value, control flow can branch on what the model just said.

**`if` / `else`** — statement form (the ternary `cond ? a : b` is the expression form):

```theta
if author.experience_years < 2 {
  @`Re-explain your top recommendation in simple language.`?
}
```

**`for` ... `in`** — iterates an array, binding the iteration variable as a fresh immutable local per iteration. The expression after `in` must have type `array<T>` for some `T`; iterating strings, objects, or numbers is `theta/parse/non-array-iterand` (use `obj.keys()` for objects, `s.split(...)` for strings). The loop variable's static type is the iterand's element type `T`, under [TYPE-11](./type-system.md#type-11) transparency (an `array<T>` alias supplies the same `T`), and a non-`array` iterand — already rejected by `theta/parse/non-array-iterand` — leaves the variable with no resolvable type, at which point [Type System — Type compatibility](./type-system.md#type-compatibility) (*Unresolvable operands*) applies and body checks defer. The iterand position is **not** an element-type sink for empty-array literals, and that absence draws no diagnostic: `for x in []` with no surrounding sink types the literal as `array<unknown>`, the same type `let xs = []` gets in unannotated position, and the loop variable is then bound to that unresolvable element, so body checks defer under the *Unresolvable operands* rule cited above — over a body that never runs (CTRL-1, below). Annotate via a `let xs: array<T> = []` immediately above the loop, or inline the literal under a sink that supplies `T`, to give the body's checks a resolvable element to run against (see [Grammar Appendix — `array<T>` literal type-sink rule](./grammar.md#arrayt-literal-type-sink-rule)).

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

`par for` reuses the `for` iterand contract unchanged: the iterand must be `array<T>` (a non-array is `theta/parse/non-array-iterand`), it is evaluated exactly once at loop entry (CTRL-1), and each iteration binds a fresh immutable loop variable whose static type is the `array<T>` iterand's element type `T`. Unlike `for`, `par for` is an expression: it produces a value and may appear anywhere an expression is admitted, or stand alone as an expression statement with its value discarded. The surface production is in [Grammar — Blocks](../reference/grammar.md#blocks).

<a id="ctrl-2"></a> **CTRL-2 (scheduling & width throttle).** Iterations are scheduled concurrently. When the optional `max` clause is present, at most `max n` iterations are in flight; `n` is any `integer`-typed expression, evaluated once at loop entry, and `max` only *lowers* the in-flight width — except that a resolved width below 1 clamps UP to 1 (the single documented exception; see below). Independently of `max`, fan-out width is bounded by a throttle of **64** in-flight iterations; a `max` value exceeding the throttle clamps to it. Excess iterations queue and start as slots free, so a large iterand runs to completion 64-at-a-time. The throttle applies per loop, not per theta; nesting `par for` within `par for` is therefore legal, and worst-case concurrency multiplies (64×64). The throttle is a scheduling bound, not a runtime ceiling — reaching it queues rather than breaches (NOCEIL-5, [Hard ceilings — `par for` width throttle](../reference/hard-ceilings.md#par-for-width-throttle)). The depth-32 `invoke`-chain ceiling applies per iteration unchanged; sibling iterations do not share depth budget ([Hard ceilings](../reference/hard-ceilings.md)). A `max` operand whose static type is statically resolvable and incompatible with `integer` loads as `theta/parse/non-integer-max` (a `number`-typed operand instead keeps `theta/parse/integer-narrowing`); if the operand's type is not statically resolvable, a non-`number` or non-finite value it evaluates to at runtime clamps the in-flight width DOWN to 1 and emits `theta/runtime/par-max-non-integer`, never the clause-absent 64 throttle. A finite `integer` operand that resolves below 1 (`max 0`, a negative value) clamps the in-flight width UP to 1 and emits `theta/runtime/par-max-non-positive` instead — the diagnostic fires whenever the resolved width is below 1, whether or not the iterand is empty.

<a id="ctrl-3"></a> **CTRL-3 (value & ordering).** The value is `array<Result<T, QueryError>>`, where `T` is the body tail type (absent tail → `null`); element `i` corresponds to input element `i`. Ordering is by **input index, regardless of completion order** — the array is deterministic even though iterations complete nondeterministically. Child diagnostics aggregate to the enclosing theta's drain grouped first by input index, then by the existing `(file, line, col)` order, so diagnostic output is deterministic as well.

<a id="ctrl-4"></a> **CTRL-4 (body restrictions).** The body is **isolation-only**: it may run `invoke(...)`, `.theta` callable calls, `subagent fn` calls ([Functions — FN-6](./functions.md#subagent-fn)), Pi-tool calls, and pure computation — each child session private to its iteration, as under sequential execution. A query against the enclosing conversation (`@`...``) inside the body is `theta/parse/par-query-in-body`: a conversation is a linear transcript and concurrent `@` queries against it have no defined interleaving. Because this rule severs the body's only query link to the enclosing conversation, `par for` is legal in both prompt- and subagent-mode thetas — iteration isolation is independent of the enclosing theta's mode. One non-query channel to the enclosing conversation survives the severing: a body whose code calls an extension tool — including inside a `subagent fn` call, whose isolation is scoped to the body's conversation ([Functions — FN-6](./functions.md#fn-6)) — dispatches through the process's backing host session per [PIC-64](./pi-integration-contract/subagent.md#pic-64), so in a prompt-mode theta the fabricated dispatch turns land in the enclosing conversation. PIC-64 (f) serialises code-side dispatches, so concurrent iterations append those turns whole — never interleaved mid-dispatch. Outer bindings and the loop variable are readable, but assignment to a `let mut` declared outside the body is `theta/parse/par-shared-mutation`. `break` and `continue` are `theta/parse/par-break-continue` (no defined meaning under concurrent scheduling). A `return` statement inside the body is `theta/parse/par-return-in-body`: `return`'s documented meaning ("exits the enclosing function or top-level theta", [Return Statement](./return.md)) has no realisation across an iteration boundary. The refusal applies at **every** nesting depth inside the body, including inside a nested plain `for` / `while` — unlike `break` / `continue`, which are refused only where they target the `par for` itself and stay legal at any depth inside a nested plain loop, a `return` at any depth crosses that nested loop and reaches the `par for` boundary, so the depth discrimination does not transfer. The reach is the body's own statement tree and stops at a nested `fn`: a `return` inside a `fn` declared in the body is not refused under this rule, because that `fn` body is its own return scope — and the declaration itself is already `theta/parse/nested-fn` ([Functions — FN-1](./functions.md#fn-1)). The bare spelling (`return` with no operand) is refused on the same terms as the valued spelling. The refusal does not withhold the neighbouring return-family verdicts: `theta/parse/bare-return-in-non-void` (judged, as elsewhere, against the enclosing scope's return-type annotation) and `theta/parse/unreachable-code` still fire beside it, one diagnostic per `(code, range)`. Pi-tool calls with observable side effects (`bash`, `edit`, `write`) are admitted, but iterations carry no defined relative order: interleaving, idempotency, and compensation are the author's responsibility, under the same no-rollback contract that governs sequential thetas (ERR-13, [Errors and results](../reference/errors-and-results.md)).

<a id="ctrl-5"></a> **CTRL-5 (run-to-completion failure & cancellation).** Iterations run to completion independently. An `Err` in one iteration does not cancel siblings; it becomes that element's value, and a postfix `?` inside the body propagates to the iteration's result, not out of the loop. A runtime panic inside one iteration does not abort the theta: the iteration boundary is a panic-downgrade point and the panic becomes that element's `Err(QueryError { kind: "invoke_infra", cause: "panic", ... })`, with siblings running to completion and the loop still yielding a full array (ERR-20, [Errors and results](../reference/errors-and-results.md#err-20)). Cancellation has two distinct forms that must not be conflated. **Whole-theta cancellation** — the enclosing theta's `AbortSignal` fires — is a terminal `Cancelled` outcome: in-flight iterations are cancelled, not-yet-started iterations do not start, and **no final value flows** — the partial result array is NOT surfaced as a top-level value; the caller observes only `Err(QueryError { kind: "cancelled", ... })`. This is the `Cancelled` arm of the closed terminal-outcome trichotomy, consistent with FN-5 (cancellation → no final value) and the mid-stream non-mutation obligations ERR-8…ERR-13 ([Errors and results](../reference/errors-and-results.md#terminal-outcomes-closed-set)). **Per-element cancellation** is observed only when the loop itself runs to completion (the enclosing signal never fires): an individual iteration whose child work is cancelled within the run-to-completion model carries `Err(QueryError { kind: "cancelled", ... })` as its element value in the collected `array<Result<T, QueryError>>`, exactly like any other per-element `Err`. This per-element `CancelledError` envelope is the element value a consumer — or an enclosing `par for` iteration, in the nested case — observes for that element; it is never the theta's top-level outcome under whole-theta cancellation.

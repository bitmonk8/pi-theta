# How to fan out in parallel

You have N independent units of work — a review lens per file, a fix per finding,
a classification per record — and each one returns a typed value. Running them one
at a time with sequential `invoke`s or `.theta` callable calls is correct but slow:
the work is embarrassingly parallel and the wall-clock time is spent waiting on
model round-trips. `par for` runs the body concurrently for every element of the
iterand and collects one typed `Result` per element. It is the breadthwise
counterpart of the [agent loop](./write-an-agent-loop.md): that loop is one worker
re-run in sequence; this is many workers run at once.

`par for` is an expression (theta 1.1). Its value is
`array<Result<T, QueryError>>`, where `T` is the body's tail type, and element `i`
corresponds to input element `i` **in input order, regardless of completion
order** — the array is deterministic even though iterations finish
nondeterministically.

## When to use it

- The iterations are independent — no iteration reads what another wrote.
- Each iteration does isolated work: an `invoke(...)`, a `.theta` callable call, a
  Pi-tool call, or pure computation. Model round-trips are the cost you are
  parallelising.
- You want the per-element results back as typed values, not as one freeform
  string. If you need cross-iteration state or early exit on a signal, use the
  sequential [agent loop](./write-an-agent-loop.md) instead.

## Syntax

```
par for <var> in <array-expr> [max <n>] { <body> }
```

- The iterand reuses the `for` contract: it must be `array<T>` (a non-array is
  `theta/parse/non-array-iterand`), it is evaluated **exactly once** at loop entry
  (CTRL-1), and each iteration binds a fresh immutable loop variable.
- The optional `max <n>` clause caps how many iterations are in flight at once.
  `n` is any `integer`-typed expression, evaluated once at loop entry; `max` only
  *lowers* the width — except that a value resolving below 1 clamps up to 1 and
  draws `theta/runtime/par-max-non-positive`
  ([Control flow — CTRL-2](../spec_topics/control-flow.md#ctrl-2)).
- Independently of `max`, fan-out width is bounded by a throttle of **64**
  in-flight iterations, applied **per loop**. Excess iterations queue and start as
  slots free, so a large iterand runs to completion 64-at-a-time. A `max` above 64
  clamps to the throttle. The throttle is a scheduling bound, not a hard ceiling —
  reaching it queues, it does not fail
  ([Hard ceilings — `par for` width throttle](../reference/hard-ceilings.md#par-for-width-throttle)).

## Body restrictions

The body is **isolation-only** — each iteration's work is private to that
iteration, with no link to the enclosing conversation. Four constructs are
parse errors inside a `par for` body:

- A query against the enclosing conversation (`` @`...` ``) —
  `theta/parse/par-query-in-body`. A conversation is a linear transcript;
  concurrent `@` queries against it have no defined interleaving. (Run queries
  inside a callee you `invoke` instead — that callee has its own conversation.)
- Assignment to a `let mut` declared outside the body —
  `theta/parse/par-shared-mutation`. Outer bindings and the loop variable are
  readable; reduce *after* the loop, over the collected array.
- `break` / `continue` — `theta/parse/par-break-continue`. Neither has a defined
  meaning under concurrent scheduling.
- `return`, at any depth of the body's own statement tree — including inside a
  nested `if` block or a nested plain `for` / `while` —
  `theta/parse/par-return-in-body`. Its documented meaning (exiting the
  enclosing function or top-level theta) has no realisation across an
  iteration boundary; collect the value as the body's tail expression instead.
  A `return` inside a `fn` declared in the body is outside this rule: that `fn`
  body is its own return scope, and the nested declaration is already
  `theta/parse/nested-fn`.

Because the isolation rule severs the only link to the enclosing conversation,
`par for` is legal in both prompt- and subagent-mode thetas.

## Failure, panic, and cancellation

- **Run to completion.** An `Err` in one iteration does not cancel its siblings —
  it becomes that element's value. A postfix `?` inside the body propagates to
  that iteration's element, not out of the loop. The loop still yields a full
  array.
- **Per-element panic downgrade (ERR-20).** A runtime panic inside one iteration —
  a non-exhaustive `match`, an out-of-bounds index, `invoke`-depth exhaustion, a
  pure-computation panic — does not abort the theta. The iteration boundary
  downgrades it to that element's
  `Err(QueryError { kind: "invoke_infra", cause: "panic", ... })`; siblings run to
  completion ([Errors and results — ERR-20](../reference/errors-and-results.md#err-20)).
- **Whole-theta cancellation yields no final value.** If the enclosing theta's
  `AbortSignal` fires, in-flight iterations are cancelled, not-yet-started ones do
  not start, and **no final value flows** — the partial result array is not
  surfaced. The caller observes only `Err(QueryError { kind: "cancelled", ... })`.
  This is distinct from *per-element* cancellation: when the loop itself runs to
  completion, an individual iteration whose child work was cancelled carries
  `Err(QueryError { kind: "cancelled", ... })` as its element value, exactly like
  any other per-element `Err`.

## Working example

The child [`docs/examples/review-lens.theta`](../examples/review-lens.theta) takes
one `path`, reviews that file, and returns a typed `Review`:

```theta
---
description: Review one file and report a typed risk summary
mode: subagent
tools:
  - read
params:
  path: string
---
schema Review {
  file: string,
  summary: string,
  risk: "low" | "medium" | "high"
}

let review: Review = @`Read the file at ${path} and report a one-line risk summary.
Set "file" to the path you reviewed, "summary" to the one-line finding, and "risk"
to one of low, medium, or high.`?
review
```

The parent [`docs/examples/fan-out-reviews.theta`](../examples/fan-out-reviews.theta)
fans the child over a list, then reduces the `array<Result<Review, QueryError>>`
with a plain `for` and a `match` — the reduce runs after the loop, so mutating the
accumulator is legal there:

```theta
---
description: Review several files in parallel, then reduce the per-file results
mode: subagent
tools:
  - ./review-lens.theta
---
// The fan-out iterand. Like every `for` iterand it is evaluated exactly once, at
// loop entry (CTRL-1). A real theta might build this list earlier in code.
let targets = [
  "docs/guide.md",
  "docs/tutorial.md",
  "docs/STYLE.md",
]

// One isolated child conversation per file, at most 2 in flight at once. `par for`
// is an expression: its value is array<Result<Review, QueryError>> in input order,
// regardless of which iteration finishes first. A postfix `?` in the body
// propagates to that element's Result, not out of the loop.
let reviews = par for path in targets max 2 {
  review_lens(path)?
}

// Reduce the per-element Results into one report string. This is a plain `for`, so
// mutating the outer accumulator is legal — it would be theta/parse/par-shared-mutation
// inside the `par for` body above. Each element is handled with `match`: an `Ok`
// carries the review, an `Err` is that element's failure and does not abort the run.
let mut report = ""
for r in reviews {
  let line = match r {
    Ok(review) => review.file + ": " + review.summary,
    Err(QueryError { kind: "cancelled" }) => "a review was cancelled",
    Err(other) => "a review failed: " + other.kind,
  }
  report = report + line + "\n"
}

@`Summarise this review batch for the user, one line per file:

${report}`
```

Run it inside the repository:

```
pi --theta docs/examples -p "/fan-out-reviews"
```

Each `review_lens(path)` runs in its own isolated subagent conversation, at most
two at a time. The three reviews are collected into `reviews` in the order of
`targets` — not the order they finish — and the reduce turns each `Result` into a
line, recovering from a per-element `Err` instead of aborting the whole batch.

## Notes

- The reduce over `array<Result<T, QueryError>>` is where the per-element `Err`
  handling lives. Use `match` for arm-specific recovery (as above), or `?` inside
  a reducing function when you want the first failure to propagate. See
  [How to handle a QueryError](./handle-a-queryerror.md) for the variant patterns.
- Pi-tool calls with side effects (`bash`, `edit`, `write`) are admitted in the
  body, but iterations carry no defined relative order — interleaving, idempotency,
  and compensation are your responsibility, under the same no-rollback contract as
  sequential thetas.
- Nesting `par for` within `par for` is legal; the throttle is per loop, so
  worst-case concurrency multiplies (64×64). The depth-32 `invoke`-chain ceiling
  applies per iteration unchanged — siblings do not share depth budget.

## Reference

- [Grammar — Control flow](../reference/grammar.md#control-flow) and
  [Blocks](../reference/grammar.md#blocks) — `ParForExpr`, `MaxClause`, the
  contextual `par` keyword, and the four body parse errors.
- [Errors and results — ERR-20](../reference/errors-and-results.md#err-20) — the
  iteration-boundary panic downgrade and the `array<Result<T, QueryError>>` value.
- [Hard ceilings — `par for` width throttle](../reference/hard-ceilings.md#par-for-width-throttle)
  — the 64-in-flight, per-loop scheduling bound.
- [Diagnostics](../reference/diagnostics.md) — `theta/parse/par-query-in-body`,
  `theta/parse/par-shared-mutation`, `theta/parse/par-break-continue`,
  `theta/parse/par-return-in-body`.
- [How to write an agent loop](./write-an-agent-loop.md) — the sequential
  counterpart.

## Provenance

- `par for` scheduling, value, ordering, isolation-only body, run-to-completion
  failure, and the two cancellation forms: `docs/spec_topics/control-flow.md`
  (CTRL-2…CTRL-5, `#par-for`).
- Grammar surface (`ParForExpr` / `MaxClause` / `ParForBody`, contextual `par`,
  `match` pattern grammar): `docs/reference/grammar.md`.
- Per-element panic downgrade: `docs/reference/errors-and-results.md#err-20`.
- 64-in-flight per-loop throttle (NOCEIL-5):
  `docs/reference/hard-ceilings.md#par-for-width-throttle`.
- The three `par for` body parse-error codes: `docs/reference/diagnostics.md`.
- RFC: `docs/rfcs/0003-parallel-fanout.md` (accepted).
- Examples `fan-out-reviews.theta` and `review-lens.theta` verified against the
  committed-fixture parse gate (`tests/committed-fixture-parse-gate.test.ts`).

# RFC 0003 — `par for`: structured parallel fan-out

- **Status:** accepted
- **Scope:** theta 1.x language surface (governed by
  `../spec_topics/governance/release-version-naming.md`)
- **Affects:** lexical (new contextual keyword), grammar, type system, runtime
  scheduling, hard ceilings, diagnostics

## Summary

Add a parallel loop form that evaluates its body concurrently for each element
of the iterand and collects per-iteration results, in input order:

```theta
let reviews = par for f in findings max 8 {
  invoke<Review>("./lens.theta", f)
}
// reviews: array<Result<Review, QueryError>>
```

Each iteration runs the body against isolated work only — child sessions and
tool calls, never the enclosing conversation. The form is value-producing: an
`array<Result<T, QueryError>>` where `T` is the body's tail type, ordered by
input index regardless of completion order.

## Motivation

Theta 1.0 is strictly sequential. Pi's host `subagent` tool runs a task batch
in parallel (its `tasks` array mode); a theta can reach that capability only by
spending a model turn — the model composes and emits the `subagent` tool call —
and the batch result comes back as one freeform string, outside the type
system. The language's own child-session primitives (`invoke`,
`.theta` callables, and RFC 0001's `subagent fn`) execute one at a time.

The consequence for orchestration thetas is structural: the fan-out stage of a
review pipeline (N independent lenses over the same corpus, N independent
per-finding fixes) is embarrassingly parallel, has typed per-task results, and
is exactly the stage where wall-clock time concentrates. Today the author must
choose between sequential typed `invoke`s (slow) and a model-mediated
`subagent` batch (parallel, but untyped, and one paid turn per dispatch).

Parity target: at minimum the host `subagent` tool's parallel mode — N isolated
tasks, run concurrently, all run to completion, per-task success/failure
reported. The tool's other modes need no language change: *single* is
`invoke`; *chain* is sequential code, which theta already expresses directly
with data flow through `let` instead of a `{previous}` placeholder.

## Proposal

Introduce `par` as a modifier on the `for` form. `par for` shares the `for`
iterand rules — `array<T>` iterand, fresh immutable loop variable per
iteration, iterand evaluated exactly once at loop entry (CTRL-1,
[Control flow](../spec_topics/control-flow.md)) — and differs in scheduling,
body restrictions, and value.

### Semantics

- **Concurrency.** Iterations are scheduled concurrently, at most `max n` in
  flight when the optional `max` clause is present. `n` is any `integer`-typed
  expression, evaluated once at loop entry; `max` only *lowers* the in-flight
  width, and a value exceeding the width throttle (below) clamps to it. Without
  `max`, the throttle is the only bound.
- **Value-producing.** The form is an expression. Its value is
  `array<Result<T, QueryError>>`, `T` the body tail type, element `i`
  corresponding to input element `i`. Plain `for` remains a statement; the
  asymmetry is deliberate — collecting results is the point of a parallel
  loop, and a discarded-value `par for` is still legal as an expression
  statement.
- **Isolation-only body.** A conversation is a linear transcript; concurrent
  `@` queries against it have no defined interleaving. A query against the
  enclosing conversation inside a `par for` body is a parse error
  (`theta/parse/par-query-in-body`). Admissible in the body: `invoke(...)`,
  `.theta` callable calls, `subagent fn` calls (RFC 0001), Pi-tool calls, and
  pure computation. Each child session is private to its iteration, as today.
  Because this rule severs the only link between the body and the enclosing
  conversation, the form is legal in both `prompt`- and `subagent`-mode thetas
  — iteration isolation is independent of the enclosing theta's mode.
- **Side effects have no defined ordering.** Pi-tool calls with observable
  side effects (`bash`, `edit`, `write`) are admitted in the body under a
  no-ordering guarantee: iterations carry no defined relative order, and
  interleaved side effects, idempotency, and compensation are the author's
  responsibility — the same no-rollback contract that already governs
  sequential thetas (ERR-13, [Errors and results](../reference/errors-and-results.md)).
- **No shared mutation.** Assignment to a `let mut` declared outside the body
  is a parse error (`theta/parse/par-shared-mutation`). Outer bindings and the
  loop variable are readable. `break` / `continue` are parse errors inside a
  `par for` body (no defined meaning under concurrent scheduling).
- **Run to completion; per-element failure.** An `Err` in one iteration does
  not cancel siblings — matching the host tool's parallel mode, where each
  task reports independently. The iteration's `Err` becomes that element's
  value. `?` inside the body propagates to the iteration's result, not out of
  the loop.
- **Per-element panic.** A runtime panic inside an iteration (a non-exhaustive
  `match`, an out-of-bounds index, `invoke`-depth exhaustion, etc.) does not
  abort the theta. The iteration boundary is a panic-downgrade point: the panic
  becomes that element's
  `Err(QueryError { kind: "invoke_infra", cause: "panic", ... })`, siblings run
  to completion, and the loop still yields a full array. This extends the
  existing invoke-boundary downgrade to the iteration boundary, so a
  pure-computation panic in a body with no `invoke` is downgraded the same way.
  For that no-`invoke` case, the `InvokeInfraError`'s required `callee_path` is
  the path of the `.theta` file containing the `par for` body, since there is no
  invoked callee to name.
- **Cancellation.** Two distinct forms. *Whole-theta cancellation* (the
  enclosing theta's `AbortSignal` fires) is a terminal `Cancelled` outcome:
  in-flight iterations are cancelled, not-yet-started iterations do not start,
  and no final value flows — the partial result array is not surfaced as a
  top-level value (consistent with FN-5 and the cancellation trichotomy,
  ERR-8…ERR-13). *Per-element cancellation* is observed only when the loop
  runs to completion: an iteration whose child work is cancelled carries
  `Err(QueryError { kind: "cancelled", ... })` as its element value in the
  collected array, exactly like any other per-element `Err` — this envelope is
  the element value a consumer (or an enclosing nested `par for` iteration)
  observes, never the top-level outcome under whole-theta cancellation.
- **Width throttle.** Fan-out width is bounded by a throttle of **64**
  in-flight iterations — a throttle, not a routing-class hard ceiling. Excess
  iterations queue and start as slots free, so a large iterand runs to
  completion 64-at-a-time with no breach surface; the four-ceiling
  routing-class table and the panic-uniqueness invariant are untouched. The
  throttle applies independently to each loop, not per theta, so nesting
  `par for` within `par for` is legal (worst-case concurrency is
  multiplicative, 64×64). This mirrors Ceiling #1's per-chain — not
  per-process — accounting and avoids a contended process-global counter. The
  depth-32 invoke-chain ceiling applies per iteration unchanged — sibling
  invokes already do not share depth budget
  ([Hard ceilings](../reference/hard-ceilings.md) Ceiling #1).
- **Diagnostics drain.** Child diagnostics aggregate to the enclosing theta's
  drain grouped by input index, then by the existing `(file, line, col)`
  order — deterministic output despite nondeterministic completion order.
- **Lexical.** `par` is not in the theta 1.0 reserved-keyword set. It is a
  contextual keyword recognised only immediately before `for`, so existing
  identifiers named `par` do not break. This RFC introduces the contextual-keyword
  recognition mechanism; RFC 0001's `subagent` modifier reuses it when it lands.

### Relationship to RFC 0002 (computed tool arguments)

With RFC 0002, code can call the host `subagent` tool directly with a computed
task batch — engine-side parallelism with no language change. That path
remains useful for fanning out over *host* agents (Markdown agents, glob
selection), but its result is a single freeform string and its per-task
configuration lives outside the type system. `par for` is the language-native
form: typed per-element results, `Result` error isolation, and no dependency
on the host tool being in the callable set. The two are complementary, not
competing. `par for` also inherits RFC 0002's posture on computed arguments:
the `max` clause admits any `integer`-typed expression, not only a literal.

## Alternatives considered

- **Status quo: model-mediated `subagent` batch.** One paid turn per dispatch,
  untyped batch result, and the model must transcribe computed task lists into
  the tool call. This is the gap the RFC closes.
- **Futures / `async`-`await`.** Requires first-class values for pending
  computations and arbitrary join points. The language excludes first-class
  functions (`theta/parse/function-as-value`); pending-computation values
  would reintroduce the same category. Structured fan-out with a single
  implicit join covers the observed use cases at a fraction of the surface.
  Rejected.
- **Implicit parallelisation** of adjacent independent `invoke`s. Silent
  reordering of side effects, and "independent" is undecidable once Pi-tool
  calls (e.g. `bash`) are involved. Rejected.
- **A read-only body.** Restricting the body to a side-effect-free tool subset
  would need a new tool-capability taxonomy and would not close the transitive
  path — an `invoke`d child can call any tool regardless. Rejected in favour of
  the documented no-ordering guarantee above.

## Specification impact

- **Grammar.** The `par` contextual keyword, the `max` expression clause, and
  the parse errors `theta/parse/par-query-in-body`,
  `theta/parse/par-shared-mutation`, and `break`/`continue`-in-body.
- **Control flow.** `par for` scheduling, value, and body restrictions
  ([Control flow](../spec_topics/control-flow.md)).
- **Errors and results.** The iteration boundary as a panic-downgrade point
  ([Errors and results](../reference/errors-and-results.md)).
- **Hard ceilings.** The width throttle, documented explicitly as *not* a fifth
  routing-class ceiling ([Hard ceilings](../reference/hard-ceilings.md)).
- **Diagnostics.** New parse-error codes registered in
  [Diagnostics](../reference/diagnostics.md).
- **Contextual-keyword mechanism.** This RFC owns and introduces the
  contextual-keyword recognition (recognised only immediately before `for`);
  RFC 0001's `subagent` modifier reuses the same mechanism when it lands.

## Prior art in this repository

- Sequential-only execution and the child-session boundary:
  [Invocation](../spec_topics/invocation.md),
  [Tool Calls](../spec_topics/tool-calls.md).
- Loop semantics reused by `par for` (iterand snapshot, fresh loop variable):
  [Control flow](../spec_topics/control-flow.md) (CTRL-1).
- Depth accounting that already treats siblings independently:
  [Hard ceilings](../reference/hard-ceilings.md) (Ceiling #1).
- Inline isolated children this form composes with:
  [RFC 0001 — `subagent fn`](./0001-subagent-fn.md).
- The pattern this RFC serves:
  [How to write an agent loop](../how-to/write-an-agent-loop.md) (per-round
  isolation; `par for` is its breadthwise counterpart).

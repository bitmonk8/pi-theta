# RFC 0003 — `par for`: structured parallel fan-out

- **Status:** draft
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
  flight when the optional `max` clause is present (`n` a positive integer
  literal). Without `max`, the fan-out width ceiling applies (below).
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
- **No shared mutation.** Assignment to a `let mut` declared outside the body
  is a parse error (`theta/parse/par-shared-mutation`). Outer bindings and the
  loop variable are readable. `break` / `continue` are parse errors inside a
  `par for` body (no defined meaning under concurrent scheduling).
- **Run to completion; per-element failure.** An `Err` in one iteration does
  not cancel siblings — matching the host tool's parallel mode, where each
  task reports independently. The iteration's `Err` becomes that element's
  value. `?` inside the body propagates to the iteration's result, not out of
  the loop.
- **Cancellation.** Cancelling the enclosing theta cancels in-flight
  iterations; not-yet-started iterations do not start. Cancelled elements
  carry the cancellation `Err` envelope.
- **Ceilings.** A new hard ceiling bounds fan-out width (proposed: **64**
  concurrently scheduled iterations; `max` may lower, not raise it). The
  depth-32 invoke-chain ceiling applies per iteration unchanged — sibling
  invokes already do not share depth budget
  ([Hard ceilings](../reference/hard-ceilings.md) Ceiling #1).
- **Diagnostics drain.** Child diagnostics aggregate to the enclosing theta's
  drain grouped by input index, then by the existing `(file, line, col)`
  order — deterministic output despite nondeterministic completion order.
- **Lexical.** `par` is not in the theta 1.0 reserved-keyword set. Proposed as
  a contextual keyword recognised only immediately before `for`, so existing
  identifiers named `par` do not break. (RFC 0001's `subagent` modifier has
  the same need; the two should land with one mechanism.)

### Relationship to RFC 0002 (computed tool arguments)

With RFC 0002, code can call the host `subagent` tool directly with a computed
task batch — engine-side parallelism with no language change. That path
remains useful for fanning out over *host* agents (Markdown agents, glob
selection), but its result is a single freeform string and its per-task
configuration lives outside the type system. `par for` is the language-native
form: typed per-element results, `Result` error isolation, and no dependency
on the host tool being in the callable set. The two are complementary, not
competing.

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
- **Heterogeneous `par { a = invoke(...), b = invoke(...) }` block.** Covers
  the two-distinct-children case that `par for` expresses awkwardly. Deferred
  as a follow-on; the homogeneous loop is the dominant pattern (lens fan-out,
  per-finding fixes) and settles the scheduling, ceiling, and diagnostics
  questions the block form would reuse.

## Open questions

- Panic semantics per element: does a runtime panic inside an iteration
  convert to that element's `Err` envelope (fully matching per-task
  isolation), or does it fail the whole theta after in-flight siblings settle?
  The `InvokeInfraError { cause: "panic" }` surface suggests the former is
  already the cross-boundary convention for `invoke`d children.
- Nesting: is `par for` inside `par for` legal, and does the width ceiling
  apply per loop or per theta?
- Pi-tool calls with observable side-effect ordering (`bash`, `edit`, `write`)
  inside the body: admitted with a documented no-ordering guarantee, or
  restricted to a read-only tool subset?
- `max` argument: integer literal only, or any `integer`-typed expression?
  (Literal-only mirrors the theta 1.0 posture; RFC 0002 argues against that
  posture for tool arguments.)
- Whether a `prompt`-mode theta may contain `par for` (children are isolated
  either way; proposed: yes).
- The width-ceiling value, and whether it joins the existing four hard
  ceilings' routing-class table as a runtime panic or a recoverable `Err`.

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

# Reference — Hard runtime ceilings & invariants

The four theta 1.0.0 runtime ceilings, their routing classes, the fixed evaluation
order, the `masked` co-fire field, and the five enumerated non-existence claims
(NOCEIL-5 added in theta 1.1 for the `par for` width throttle).
See [Errors and results](./errors-and-results.md) for `QueryError` shapes,
[Schema subset](./schema-subset.md) for depth enforcement, [Diagnostics](./diagnostics.md)
for codes.

## The four ceilings

| # | Ceiling | Routing class | First surface |
|---|---|---|---|
| 1 | `invoke`-chain nesting depth **32** | runtime panic | `theta/runtime/invoke-depth-exceeded` |
| 2 | `tool_loop.max_rounds` (per-query free-phase round cap) | recoverable `Err` | `Err(QueryError { kind: "tool_loop_exhausted", ... })` |
| 3 | binder per-class retry budget | load-time system note | binder failure-mode template |
| 4 | JSON-document depth **5** | boundary-dependent | per-boundary table below |

## Ceiling #1 — invoke-chain depth (INV-4)

Caps the nesting depth of an `invoke` chain at **32**. A *countable frame* is any
direct `invoke(...)`, any `.theta` callable call through a `tools:` entry, any
cross-file `.thetalib` `fn` call, or any `subagent fn` call (theta 1.2; ordinary
intra-file `fn` calls remain not countable — a `subagent fn` counts because it
spawns a fresh subagent session, [Functions — FN-6](../spec_topics/functions.md#fn-6)). Per-chain,
not per-process — sibling invokes do not share budget. The slash-invoked top-level
theta is depth 0; the first nested frame is depth 1; legal range `1 ≤ depth ≤ 32`.
The cap is breached when the runtime is about to push a 33rd frame; the diagnostic
renders `invoke chain depth exceeded: 33 > 32`. The counter crosses subagent-mode
boundaries unchanged (a `subagent → subagent` or `prompt → subagent` invoke does
not reset it). A top-level overflow surfaces as a Pi system note; an overflow
inside a chain surfaces to the parent as
`Err(InvokeInfraError { cause: "panic", ... })`.

## Ceiling #2 — tool-call loop bound

`tool_loop.max_rounds` bounds free-phase tool-call rounds per query (see
[Frontmatter — `tool_loop`](./frontmatter.md)). One round = the model emits one or
more `tool_use` blocks, the runtime executes them, and feeds results back. The
typed-query forced respond turn is exempt (the exempt-routed terminator). On
exhaustion without a terminating turn:
`Err(QueryError { kind: "tool_loop_exhausted", ... })`.

## Ceiling #3 — binder per-class retry budget

Routing class **load-time system note**: the theta does not start; the note is
rendered from the failure-mode template matching the *most recent* failure's
class. Not an evaluation outcome. Sub-obligations:

- **HC3-a.** At most one transport-class retry per slash invocation.
- **HC3-b.** At most one malformed-envelope-class retry per slash invocation.
- **HC3-c.** AJV-on-`args` failures are not retried.
- **HC3-d.** Worst-case sum: 3 binder LLM calls per slash invocation (1 initial +
  1 transport-class retry + 1 malformed-envelope-class retry).
- **HC3-e.** When both budgets are exhausted, the surfaced note is the row matching
  the *most recent* failure observed.

## Ceiling #4 — JSON-document depth (5)

Every breach carries `schema_keyword: "maxDepth"` and the canonical message
`"JSON document depth exceeds 5"`. Carrier and destination depend on the
enforcement point:

| Check point | Destination | Surface |
|---|---|---|
| Typed-query response | theta code | `Err(QueryError { kind: "validation", cause: "schema_validation", validation_errors: [{ schema_keyword: "maxDepth", ... }], ... })` |
| Tool-call args, model-driven (`@`...`` loop) | the model (loop continues; round counts against `tool_loop.max_rounds`) | tool-error result fed back as next user turn; no `QueryError` unless the loop later hits ceiling #2 |
| Tool-call args, code-driven (`<name>(args)`) | theta code | `Err(CodeToolError { cause: "validation", validation_errors: [...], ... })` |
| `params` validation | depends on call site | `invoke(...)`: `Err(InvokeInfraError { cause: "validation", ... })`. Slash-load: routes through ceiling #3's no-retry classification; not an evaluation outcome |
| `invoke<T>` return value | invoke parent | `Err(InvokeInfraError { cause: "return_validation", ... })` |

The model-driven row is the only one silent at the theta-code level (the
`validation` runtime event does not fire on it). The slash-load `params` arm is the
only row that crosses ceilings.

## Interaction between ceilings (CIO-1 … CIO-6)

Each ceiling is checked at a distinct point in single-threaded execution. The
first ceiling reached along an event's control-flow path whose precondition is
satisfied fires and ends the event; later ceilings on the same path are not
evaluated. Fixed evaluation order:

- **CIO-1.** Ceiling #3 is evaluated at slash-load time, before any runtime-class
  ceiling; the slash-load `params` arm of ceiling #4 also occurs at slash-load time
  and is routed by ceiling #3's templates.
- **CIO-2.** Ceiling #1 is evaluated at `invoke` entry, before the callee body
  runs.
- **CIO-3.** Ceiling #4 is the first sub-check at every AJV validation boundary
  (five sites, in the per-boundary-table order); the depth walk runs before AJV at
  the same site.
- **CIO-4.** Ceiling #2 is evaluated at the tool-call-round boundary — after the
  round's calls complete and the slot count is incremented for the just-completed
  free-phase round, before the next free-phase turn. Two outcomes: *free-phase
  continuation* (`slot_count < max_rounds`) and the *`max_rounds`-final branch*
  (`slot_count == max_rounds`: untyped queries surface
  `Err(kind: "tool_loop_exhausted")`; typed queries dispatch the forced respond
  turn as the exempt-routed terminator, not counted against `max_rounds`).
  `max_rounds: 0` typed-query is this branch at typed-query start (0 == 0).
- **CIO-5.** Ceiling #3 never interleaves with #1, #2, or #4 (the binder runs only
  at slash-invocation load time; `invoke(...)` calls do not invoke the binder).
- **CIO-6.** At most one ceiling surfaces per event; the surfaced diagnostic /
  runtime event carries an optional `masked` field enumerating any sibling ceiling
  whose precondition was also satisfied at the same check site.

## Ceiling-set invariants

- **Audience-coverage invariant.** Each ceiling has an observable failure surface
  addressed to at least one of *theta code*, *the model*, or *the operator*; none is
  unobservable to all three. (Ceiling #4's model-driven row is silent at the
  theta-code level but observable to the model directly, and to the operator via
  ceiling #2 if the loop later exhausts.)
- **Ceiling-#1 panic-uniqueness invariant.** Of the four, ceiling #1 is the *only*
  one whose breach reaches the *fail* arm via the panic path. Ceiling #2 and
  ceiling #4's query-terminating arms reach *fail* only via unhandled
  query-terminating `Err`; ceiling #3 is load-time and off the trichotomy.

## `par for` width throttle (not a ceiling)

<a id="par-for-width-throttle"></a> `par for`
([Control flow](../spec_topics/control-flow.md#par-for), theta 1.1) bounds fan-out
width by a throttle of **64** in-flight iterations. The throttle is a *scheduling
bound*, not a routing-class hard ceiling, and is deliberately kept outside the
four-ceiling model:

- It is **not** a fifth ceiling and does **not** appear in the four-ceiling
  routing-class table above. Excess iterations queue and start as slots free, so a
  large iterand runs to completion 64-at-a-time with no breach surface — there is
  no routing class, no `masked` token, and no diagnostic for reaching the throttle.
- The [Ceiling-#1 panic-uniqueness invariant](#ceiling-set-invariants) is
  untouched: ceiling #1 remains the only ceiling whose breach reaches the *fail*
  arm via the panic path.
- CIO-1 … CIO-6 and the `masked` enumeration (`"ceiling#1"` … `"ceiling#4"`) are
  unchanged; the throttle adds no member to either.
- The throttle applies **per loop, not per theta**, mirroring Ceiling #1's
  per-chain (not per-process) accounting and avoiding a contended process-global
  counter. Nesting `par for` within `par for` is therefore legal; worst-case
  concurrency multiplies (64×64).
- The **depth-32 `invoke`-chain ceiling (Ceiling #1) applies per iteration
  unchanged** — sibling iterations do not share depth budget, exactly as sibling
  `invoke`s do not.

## `masked` field

Each entry is one of `"ceiling#1"`, `"ceiling#2"`, `"ceiling#3"`, `"ceiling#4"`;
omitted when no co-fire occurred (never `masked: []`). Wire location:
`details.masked` for diagnostic surfaces (the `theta/runtime/invoke-depth-exceeded`
panic), `details.event.masked` for runtime-event surfaces (the `validation` and
`tool_loop_exhausted` cases). In theta 1.0 the only non-empty `masked` reachable is
`["ceiling#2"]` on the runtime-event channel — it fires on a typed-query response
whose forced respond turn's origin round left `slot_count == max_rounds` after
CIO-4's increment. `masked` is never populated on a diagnostic-shape surface in
theta 1.0.

## No additional runtime ceiling (NOCEIL-1 … NOCEIL-5)

- **NOCEIL-1.** No wall-clock timeout per query / tool-call / invoke. Per-call
  timeouts are deferred; the absence is enforced at parse time by rejecting any
  `timeout:` field (`theta/parse/timeout-field-rejected`).
- **NOCEIL-2.** No per-query response-token cap and no cumulative-token budget. The
  only token-domain failure surface is provider-detected `ContextOverflowError`.
- **NOCEIL-3.** No runtime-value memory ceiling. String length, array length, and
  total heap are bounded only by the host process. Catchable host allocation
  failures (`RangeError: Invalid string length` / `Invalid array length` /
  `Maximum call stack size exceeded`) route through `theta/runtime/internal-error`;
  uncatchable host fatals (V8 heap-OOM) terminate the host process and emit no
  diagnostic.
- **NOCEIL-4.** No theta-level host-language stack-depth ceiling distinct from the
  32-level `invoke`-chain bound. The host's native call-stack bound is not
  separately ceilinged; exhaustion surfaces through NOCEIL-3's catchable-`RangeError`
  arm.
- **NOCEIL-5.** The `par for` width throttle (64 in-flight iterations, per loop) is
  a scheduling bound, not a runtime ceiling: reaching it queues iterations rather
  than breaching, so it has no routing class, no `masked` token, and no failure
  surface (theta 1.1; [`par for` width throttle](#par-for-width-throttle)).

Provider-side rate-limit / quota exhaustion is outside the ceiling closure and
surfaces as `Err(kind: "transport", http_status: 429, ...)`. Host-tool resource
exhaustion is outside the closure and surfaces as `Err(kind: "code_tool", ...)`.

## Provenance

- Ceiling list, per-ceiling routing one-liners, cross-ceiling ownership:
  `docs/spec_topics/hard-ceilings.md`.
- Ceiling #3 sub-obligations (HC3-a…HC3-e), ceiling #4 per-boundary table,
  interaction order (CIO-1…CIO-6), ceiling-set invariants, `masked` field:
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md`.
- NOCEIL-1…NOCEIL-4, audit methodology:
  `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md`.
- Ceiling #1 depth bound (INV-4): `docs/spec_topics/invocation.md#inv-4`.
- `par for` width throttle (NOCEIL-5; throttle-not-a-ceiling, per-loop accounting,
  multiplicative nesting, per-iteration Ceiling #1): `docs/rfcs/0003-parallel-fanout.md`
  (accepted; Specification impact — Hard ceilings).
- Ceiling #4 depth counting/enforcement: `docs/spec_topics/schema-subset.md`.
- Implementation confirmation: `INVOKE_DEPTH_CAP = 32`
  (`src/runtime/runtime-panics.ts:51`); `MAX_JSON_DEPTH = 5`
  (`src/runtime/depth-walk.ts:40`).

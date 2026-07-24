# Reference — Error & result model

Terminal outcomes, the pre-evaluation failure surface, runtime panics, the
`QueryError` variant schemas, and the final-value contract. See
[Grammar](./grammar.md) for `match`/`?`, [Diagnostics](./diagnostics.md) for
`theta/runtime/*` codes, [Hard ceilings](./hard-ceilings.md) for ceiling routing.

All queries return `Result<T, QueryError>`. `Result<T, E>` is a built-in
two-variant type with constructors `Ok(value)` and `Err(error)`; observed only via
`Ok`/`Err` constructors, `match`, and `?`. User-defined error types beyond
`QueryError` are out of scope for theta 1.0.

## Terminal outcomes (closed set)

Theta evaluation produces one of three terminal outcomes:

- **Success.** The body ran to completion. Appended turns remain in the driven
  conversation; the theta's *final value* is available to programmatic callers.
- **Failure.** The body returned `Err` (via `?` or explicit `Err(...)`), panicked
  (closed list below), or exhausted a runtime-class hard ceiling whose breach
  reaches the *fail* arm (panic-class breaches unconditionally; `Err`-class
  breaches only when the `Err` is unhandled — propagated via `?` or returned, not
  consumed by a caller `match`, not discarded via `let _ = …`). No final value
  flows.
- **Cancelled.** An `AbortSignal` aborted a query, tool call, or `invoke` child
  mid-execution. No final value flows; the caller observes
  `Err(QueryError { kind: "cancelled", ... })`.

Excluded from the *fail* arm (not evaluation Failures): (a) binder
argument-binding failure, including ceiling #4's slash-load `params` arm; (b)
ceiling #4's in-loop model-driven tool-call args row — when it fires, no `Err`
flows to theta code and no `theta-system-note` is rendered at that event; an `Err`
reaches theta code only if ceiling #2 subsequently exhausts, and its `kind` is
`tool_loop_exhausted`.

## Pre-evaluation failure surface

The trichotomy applies only once evaluation has begun. The complete theta 1.0.0 set
of failures occurring *before* evaluation begins (eight items; each surfaces on the
`theta-system-note` channel with `triggerTurn: false`, produces no final value, and
is not subject to cancellation):

1. **ERR-1** — host-incompatibility detected by the capability probe.
2. **ERR-2** — lex / parse / type batches.
3. **ERR-3** — frontmatter rejection.
4. **ERR-4** — binder-model resolution failure.
5. **ERR-5** — binder argument-binding failure.
6. **ERR-6** — `tools:` resolution failure.
7. **ERR-7** — watcher-time reload failures.
8. **ERR-16** — slash-load `params` arm of ceiling #4, cross-routed through
   ceiling #3's no-retry classification.

(The `ERR-N` anchors are deliberately non-contiguous: `ERR-8`–`ERR-13` are the
mid-stream-cancellation obligations below, `ERR-14`–`ERR-15` and `ERR-17`–`ERR-19`
are in the variant section.) An `invoke` parent whose callee fails to load observes
a separate evaluation-time failure of its own,
`InvokeInfraError { cause: "load_failure", ... }`.

## No-rollback contract

- **ERR-13 (No rollback).** Neither `?` nor a panic nor cancellation unwinds prior
  side effects. Tool calls already returned, queries already appended, and `invoke`
  children already run remain final on early return, abort, or cancellation.
  Applies uniformly to `?` early-return, top-of-theta `?`, a slash-command panic,
  and a panic in an `invoke` child. Idempotency and compensation are the author's
  responsibility.
- **Partial-append contract.** Turns appended *before* the terminal event remain in
  the conversation the theta was driving (caller's conversation in prompt mode; the
  disposable subagent conversation in subagent mode). The runtime performs no
  implicit rollback; the contract is turn-grain.
- **Mid-stream cancellation** (ERR-8…ERR-12): the runtime MUST NOT mutate
  Pi-committed conversation surfaces (assistant tokens, tool-call cards, system
  notes) — no truncate/rewrite/replace/remove (ERR-8), no compensating injection
  (ERR-9); symmetric across the cancellation and `?`-propagation paths (ERR-10);
  bounded between the cancelled streaming turn and the next driver send for typed
  respond-repair (ERR-11); still holds within a subagent (ERR-12).

## Runtime panics

Some failures cannot be expressed as a `Result` and are surfaced as **panics** that
abort the theta immediately, bypassing `?` and `match`. The closed theta 1.0.0
panic-source list, each with its registered `theta/runtime/*` code:

- Non-exhaustive `match` — `theta/runtime/match-error`.
- Array index out of bounds — `theta/runtime/index-out-of-bounds`.
- `.field` access on `null` — `theta/runtime/null-member-access`.
- `[i]` access on `null` — `theta/runtime/null-index-access`.
- Indexed access on a missing object key — `theta/runtime/missing-object-key`.
- `invoke` chain depth exceeded — `theta/runtime/invoke-depth-exceeded`.

Division by zero, modulo by zero, integer overflow, and explicit author-driven
panics are deliberately excluded. Separately, *unexpected interpreter exceptions*
(any throw the runtime did not anticipate, outside the six sources — including
throws from the pre-evaluation dispatch-setup frame) form the **runtime-defect
surface**: same routing channels as panics, but code `theta/runtime/internal-error`
and `cause: "internal_error"` on `InvokeInfraError`. The catchable
allocation-failure family (`RangeError: Invalid string length` / `Invalid array
length` / `Maximum call stack size exceeded`) routes here; *uncatchable* host
fatals (V8 heap-OOM) terminate the host process and emit no diagnostic.

**Panic message string (normative).** Every panic carries one message string
formatted from its registered *Message template* (see [Diagnostics](./diagnostics.md)):

| Code | Message template |
|---|---|
| `theta/runtime/match-error` | `MatchError: no arm matched <scrutinee summary>` |
| `theta/runtime/index-out-of-bounds` | `index out of bounds: <i> not in 0..<length>` |
| `theta/runtime/null-member-access` | `null member access: .<field>` |
| `theta/runtime/null-index-access` | `null index access: [<i>]` |
| `theta/runtime/missing-object-key` | `missing object key: <key>` |
| `theta/runtime/invoke-depth-exceeded` | `invoke chain depth exceeded: <depth> > 32` |

There is exactly one message string per panic, unchanged across every routing
surface. Panics surface to the caller as: **slash-command / prompt-mode** — one
`theta-system-note` `"theta /<name> aborted: <message>"` (session not torn down);
**`invoke` parent** — `Err(QueryError { kind: "invoke_infra", cause: "panic",
message: <message>, ... })`. Panics are not values — they do not flow through `?`
and cannot be caught by `match`.

<a id="err-20"></a> **ERR-20 (`par for` iteration boundary — panic downgrade).** The
`par for` iteration boundary ([Control flow](../spec_topics/control-flow.md#par-for))
is a panic-downgrade point. A runtime panic raised inside one iteration — from any
of the six panic sources above — does not abort the theta: it is downgraded to that
element's `Err(QueryError { kind: "invoke_infra", cause: "panic", message: <message>,
... })`, siblings run to completion, and the loop still yields a full
`array<Result<T, QueryError>>`. This extends the existing invoke-boundary downgrade
(an `invoke` parent already observes a callee panic as `Err(InvokeInfraError { cause:
"panic", ... })`) to the iteration boundary, so a pure-computation panic in a
`par for` body that runs no `invoke` is downgraded the same way. In that
no-callee case there is no invoked callee to name, so the required
`callee_path` field is set to the path of the `.theta` file containing the
`par for` body (the enclosing source file). The closed
panic-source list above is unchanged — `par for` adds a downgrade *boundary*, not a
panic source.

## `QueryError` variants

```theta
schema QueryError = ValidationError
                  | TransportError
                  | ModelToolError
                  | ContextOverflowError
                  | CancelledError
                  | ToolLoopExhaustedError
                  | CodeToolError
                  | InvokeInfraError
                  | InvokeCalleeError
```

The `kind` discriminator is the wire form (snake_case of the schema identifier
with trailing `Error` dropped: `ValidationError` → `"validation"`,
`InvokeInfraError` → `"invoke_infra"`, `InvokeCalleeError` → `"invoke_callee"`).

**Discriminator type-openness (ERR-15).** `kind` is typed `string`, not a closed
enum of the nine variant tags, so a future tenth variant does not break the
type-shape of code destructuring `QueryError`. The runtime never emits an unlisted
`kind`; for a finite-set guarantee at a call site use a catch-all `_ => …` arm.

### `ValidationError`

Fires when a typed query's final response fails AJV validation (incl.
respond-repair exhaustion), or on the empty-rendered-template short-circuit.

```theta
schema ValidationIssue {
  path: string,           // JSON pointer, e.g. "/issues/0/severity"
  message: string,
  schema_keyword: string  // "type", "required", "enum", "const", ...
}

schema ValidationError {
  kind: "validation",
  cause: "schema_validation" | "empty_template",
  message: string,
  attempts: number,                          // respond-repair follow-ups made before giving up
  validation_errors: array<ValidationIssue>, // empty when cause = "empty_template"
  raw_response: string | null                // final malformed assistant text; null when cause = "empty_template"
}
```

- `cause: "schema_validation"` — a response was produced and AJV (or the depth
  walk) rejected it. Also fires on forced-respond non-compliance (ERR-17).
- `cause: "empty_template"` — the runtime refused to issue a fully-rendered turn
  whose body is empty / ASCII-whitespace-only. No provider round-trip;
  `validation_errors` is `[]`, `raw_response` is `null`.

**ERR-14 (`ValidationIssue` ordering).** `validation_errors` is emitted in a
canonical deterministic order: a stable ascending sort keyed on the tuple
(`path`, `schema_keyword`, `message`), each field compared by Unicode code point.
`validation_errors[0]` is therefore well-defined.

**ERR-17 (forced-respond non-compliance).** When a typed query's forced respond
turn does not invoke `__theta_respond_<slug>`, the runtime synthesises one
`ValidationIssue` (`path: ""`, `schema_keyword: "required"`) and feeds it into the
`schema_validation` respond-repair pipeline. The `message` literal is
`"model returned plain text instead of calling the forced respond tool"`
(plain-text branch) or
`"model invoked tool '<provider-emitted-tool-name>' instead of the forced respond
tool '__theta_respond_<slug>'"` (wrong-tool branch). Terminal exhaustion returns
`kind: "validation", cause: "schema_validation", message: "model did not call the
forced respond tool"`.

### `TransportError`

```theta
schema TransportError {
  kind: "transport",
  message: string,
  http_status: number | null,   // null on network-level failure
  provider: string,             // resolved Model<Api>.api value (e.g. "anthropic-messages")
  retryable: boolean
}
```

### `ModelToolError`

Fires on a non-recoverable adapter-layer failure of the model's tool-call loop
(named tool absent from the callable set, or a Pi-adapter/transport failure while
feeding a tool-result back). An in-loop tool failure the runtime can lower to a
tool-result does **not** fire this variant.

```theta
schema ModelToolError {
  kind: "model_tool",
  message: string,
  tool_name: string,
  tool_call_id: string,
  raw_response: string | null
}
```

### `ContextOverflowError`

```theta
schema ContextOverflowError {
  kind: "context_overflow",
  message: string,
  tokens_used: number | null,
  tokens_limit: number | null,
  raw_response: string | null   // partial text on an output-boundary overflow; null otherwise
}
```

### `CancelledError`

```theta
schema CancelledError {
  kind: "cancelled",
  message: string
}
```

### `ToolLoopExhaustedError` (ERR-19)

Fires when the per-query tool-call round cap is reached without a terminating turn.

```theta
schema ToolLoopExhaustedError {
  kind: "tool_loop_exhausted",
  message: string,
  rounds: number,                // == tool_loop.max_rounds on exhaustion
  last_tool_name: string | null, // null branch has no theta 1.0-reachable case; retained for forward compat
  raw_response: string | null
}
```

### `CodeToolError`

Fires when theta code invoked a tool via `<name>(args)` and the call failed.

```theta
schema CodeToolError {
  kind: "code_tool",
  message: string,
  tool_name: string,             // post-rename name as seen in tools:
  cause: "validation"            // arguments failed input-schema validation
       | "execution"             // tool's execute() threw or returned isError: true
       | "cancelled"             // AbortSignal fired
       | "unknown_tool"          // callable lost across a file-watcher reload
}
```

### `InvokeInfraError`

Covers everything *around* the callee body.

```theta
schema InvokeInfraError {
  kind: "invoke_infra",
  message: string,
  callee_path: string,
  cause: "load_failure"              // callee file unreadable
       | "parse_failure"             // callee file failed to parse
       | "validation"                // args/params failed input-schema validation
       | "return_validation"         // typed invoke: return value failed AJV validation
       | "panic"                     // callee aborted via runtime panic
       | "internal_error"            // callee threw an unexpected interpreter exception
       | "subagent_model_unresolved" // subagent callee's model resolved to undefined before spawn
}
```

### `InvokeCalleeError`

Wraps an `Err` the callee itself returned.

```theta
schema InvokeCalleeError {
  kind: "invoke_callee",
  message: string,
  callee_path: string,
  inner: QueryError              // the original Err the callee returned
}
```

`raw_response` appears only where the model produced (or attempted) a final text
response. `cancelled` and `transport` carry none. `ToolLoopExhaustedError` carries
it only when text accompanied the terminating tool-use block.

## Final value (FN-5)

A theta's or function's *final value* is the value of its tail expression on the
success path, the operand of a short-circuiting `return expr`, or the literal
`null` (empty-tail body). It is observable to programmatic callers in two places:
an `invoke` parent receives it as the `Ok` payload; a subagent-mode parent
receives it across the subagent boundary. A subagent-mode callee runs the whole
theta in a spawned child `pi` process and returns its value as a single
`{"theta_result": {"v": 1, "ok": …}}` / `{"theta_result": {"v": 1, "err": …}}` line on the
child's stdout; the parent reconstructs the `Ok`/`Err` from that envelope with
full `Result` fidelity (every `QueryError` variant, `CodeToolError`, and the
`InvokeInfraError` causes are representable). A child that exits **without**
emitting an envelope (crash, kill, timeout) maps fail-closed to
`Err(InvokeInfraError { cause: "internal_error", ... })` — never a fabricated
value. On failure (`?` propagation, panic, exhausted ceiling) and on
cancellation, **no final value flows** — the caller observes only the `Err`
envelope.

## Provenance

- Terminal outcomes, pre-evaluation failure list (ERR-1…ERR-7, ERR-16),
  mid-stream cancellation (ERR-8…ERR-13), runtime panics, panic message templates:
  `docs/spec_topics/errors-and-results/error-model.md`.
- `QueryError` union and every variant schema, discriminator type-openness
  (ERR-15), `ValidationIssue` ordering (ERR-14), forced-respond non-compliance
  (ERR-17), `ToolLoopExhaustedError` (ERR-19):
  `docs/spec_topics/errors-and-results/queryerror-variants.md`.
- `par for` iteration-boundary panic downgrade (ERR-20):
  `docs/rfcs/0003-parallel-fanout.md` (accepted; Specification impact — Errors and results).
- Final value (FN-5): `docs/spec_topics/functions.md#final-value-language-definition`.
- Errors hub: `docs/spec_topics/errors-and-results.md`.
- Query forms / empty-template short-circuit / typed-query loop:
  `docs/spec_topics/query/query-forms.md`, `docs/spec_topics/query/query-tool-loop.md`.
- Implementation confirmation: panic sources and codes in
  `src/runtime/runtime-panics.ts` match the closed list;
  `src/runtime/query-error.ts` / `src/runtime/query-respond-repair.ts` back the
  variant surface.

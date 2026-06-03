# Errors and Results

All queries return `Result<T, QueryError>`. The language provides two destructuring forms.

**`match` expression** — exhaustive destructuring; arms evaluate to a value, so `match` is itself an expression:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(e) => ReviewScore { value: 0, reason: "unrated: ${e.message}" }
}
```

**Pattern grammar (loom 1.0).** A `match` arm's left-hand side is one of:

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything; binds nothing |
| Identifier | `x` | anything; binds the value to `x` |
| Literal | `"validation"`, `0`, `true`, `null` | structural equality |
| Constructor | `Ok(p)`, `Err(p)` | the named `Result` variant; recurses into `p` |
| Object/schema | `QueryError { kind: "validation", cause: "schema_validation", attempts }` | object whose listed fields match the inner patterns; unlisted fields are ignored. Field shorthand `{ attempts }` is sugar for `{ attempts: attempts }` |
| Array | `[a, b]`, `[first, _, _]` | exact-length array; each slot matches its pattern |

Disambiguation: lowercase identifiers bind, capitalised identifiers refer to constructors or schema names. `Ok` and `Err` are reserved.

Guards (`Ok(x) if x.value > 3 => ...`) and rest patterns (`[first, ...rest]`, `{ kind, ...other }`) are not in loom 1.0: their use surfaces as `loom/parse/match-guard-not-supported` and `loom/parse/rest-pattern-not-supported` respectively. See [Future Considerations](./future-considerations.md).

**Exhaustiveness.** Not statically checked in loom 1.0. The analyser cannot enumerate the runtime values of `QueryError.kind` from the type system, so static exhaustiveness would be unsound. A `match` whose arms collectively fail to cover the scrutinee at runtime raises a `MatchError` (`loom/runtime/match-error`). Authors who want a catch-all should add a final `_ => ...` arm.

**Arm syntax.** `pattern => expression`, comma-separated. The trailing comma after the last arm is optional. All arms must produce values of the same type, or values whose types share a common upper bound under [Type System — Type compatibility](./type-system.md#type-compatibility) (every arm `⊑` the chosen common type, narrowed by any sink in scope on the `match` expression itself); a mismatched-arm `match` is `loom/parse/match-arm-type-mismatch`. An arm body is a single expression — statements (`if`, `for`, `while`, `let`, assignment, `break`, `continue`, `return`) are not expressions in Loom and are not admissible as arm bodies on their own. To execute statements before producing the arm's value, wrap them in a block expression `{ ... }` whose tail expression is the arm's value; the ternary `cond ? a : b` is the expression form of conditional and is admissible directly. A bare statement in arm-body position is `loom/parse/statement-in-arm-body`. The full grammar lives in [Grammar Appendix — `match` arm body](./grammar.md#match-arm-body).

**`?` operator** — unwraps `Ok` to the inner value; on `Err`, *early-returns* the `Err` from the enclosing function (or top-level loom). The enclosing scope's return type must therefore be `Result<_, QueryError>` (or convertible) — otherwise the use of `?` is `loom/parse/question-outside-result-fn`. Concretely:

```loom
let critique = @`Critique this code:\n${code}`?  // string on success; early-return Err otherwise
```

Is equivalent to:

```loom
let critique = match @`Critique this code:\n${code}` {
  Ok(s)  => s,
  Err(e) => return Err(e)
}
```

A function or loom that uses `?` thus implicitly returns `Result<T, QueryError>` where `T` is the type of its last expression. A function that uses neither `?` nor an explicit `Result` return type is required to handle every query failure with `match` (or to discard explicitly per [Query — Discarded query results](./query.md), which defines the user-facing-vs-operator-facing observability contract for the discarded `Err`).

<a id="terminal-outcomes"></a>

**Terminal outcomes.** Loom evaluation produces one of three terminal outcomes; the set is closed:

- **Success.** The body ran to completion. Turns appended along the way remain in the driven conversation; the loom's *final value* (per [Function Definitions — Final value](./functions.md#final-value-language-definition)) is available to programmatic callers.
- **Failure.** The body returned `Err` (whether via `?` propagation or an explicit `Err(...)` return), panicked (the closed list under **Runtime panics** below), or exhausted a runtime-class hard ceiling whose breach reaches the *fail* arm per the per-ceiling resolution in the [`query-terminating` glossary entry](./glossary.md#query-terminating) (panic-class breaches unconditionally reach *fail*; `Err`-class breaches reach *fail* only when the resulting `Err` is unhandled — propagated via `?` or returned, not consumed by a caller `match` and not discarded via `let _ = …` (or the equivalent `void`-tail-expression form)). The following hard-ceiling cases are excluded from the Failure-cause enumeration: (a) binder argument-binding failure — including ceiling #4's slash-load `params` arm cross-routed through ceiling #3 per [Hard Runtime Ceilings — Per-boundary destination/surface table (ceiling #4)](./hard-ceilings.md#ceiling-4-table) (slash-load only; the `invoke(...)` `params` arm of ceiling #4 IS an evaluation Failure that surfaces as `Err(InvokeInfraError { cause: "validation", ... })` per [Invocation — Failures](./invocation.md)) — per the [binder argument-binding failure item](#err-5) in the pre-evaluation failure list in the next paragraph below; see ceiling #3 in [`spec.md` — Hard ceilings](../spec.md#hard-runtime-ceilings); (b) ceiling #4's [in-loop](./glossary.md#in-loop) model-driven tool-call args row (per [Hard Runtime Ceilings — Per-boundary destination/surface table (ceiling #4)](./hard-ceilings.md#ceiling-4-table)) — when this row fires, no `Err` flows to loom code at that event and no `loom-system-note` is rendered to the operator at that event (per [Hard Runtime Ceilings — reconciliation paragraph following the per-boundary table](./hard-ceilings.md#ceiling-4-table-reconciliation), the `validation` runtime event does not fire on the model-driven tool-call args row); an `Err` reaches loom code only if ceiling #2 subsequently exhausts, and that `Err`'s `kind` is `tool_loop_exhausted` (no `QueryError` of any variant is produced for the model-driven tool-call args row's firing — in particular none of the ceiling-#4 query-terminating-arm carriers `ValidationError`, `CodeToolError`, or `InvokeInfraError`). For the Failure-cause enumeration, no final value flows; the caller observes only the `Err` envelope per the per-surface mappings below.
- **Cancelled.** An `AbortSignal` aborted a query, tool call, or `invoke` child mid-execution per [Cancellation](./cancellation.md). No final value flows; the caller observes `Err(QueryError { kind: "cancelled", ... })` per the `CancelledError` variant under [QueryError variants](#queryerror-variants).

The trichotomy applies only once evaluation has begun. The complete loom 1.0.0 set of failures that occur *before* evaluation begins is the seven below; each surfaces per [Diagnostics](./diagnostics.md) on the `loom-system-note` channel, does not fire a new turn (`triggerTurn: false`) and produces no final value, and is not subject to cancellation. The note itself enters subsequent provider calls as a `user`-role transcript entry per Pi's `convertToLlm` transform — see [Pi Integration Contract — Delivery surface](./pi-integration-contract.md):

1. <a id="err-1"></a> **ERR-1.** host-incompatibility detected by the capability probe (per [Pi Integration Contract — Step 0](./pi-integration-contract.md#entry-capability-probe))
2. <a id="err-2"></a> **ERR-2.** lex / parse / type batches (per [Diagnostics](./diagnostics.md))
3. <a id="err-3"></a> **ERR-3.** frontmatter rejection (per [Parameters and Frontmatter](./frontmatter.md))
4. <a id="err-4"></a> **ERR-4.** binder-model resolution failure (per [Slash-Command Argument Binding — Strict-capability requirement](./binder.md#strict-capability-requirement))
5. <a id="err-5"></a> **ERR-5.** binder argument-binding failure (per [`spec.md` — Hard ceilings, ceiling #3](../spec.md#hard-runtime-ceilings) — and the slash-load `params` arm of ceiling #4 cross-routed per CIO-1 through ceiling #3's no-retry classification (the same disposition HC3-c defines for AJV-on-`args` failures) per [Hard Runtime Ceilings — Per-boundary destination/surface table (ceiling #4)](./hard-ceilings.md#ceiling-4-table))
6. <a id="err-6"></a> **ERR-6.** `tools:` resolution failure (per [Parameters and Frontmatter — `tools`](./frontmatter.md#tools))
7. <a id="err-7"></a> **ERR-7.** watcher-time reload failures (per [Discovery](./discovery.md))

No additional pre-evaluation failure surface applies in loom 1.0 — a future leaf that introduces one updates this list and the new failure's owner page in the same commit per the GOV-12 lock-step convention extended to this paragraph. Each of the seven list items above is an independent normative obligation in its own right — each names a distinct failure surface that sibling pages cite into individually — so each item carries a separate `ERR-N` REQ-ID anchor (per [Governance — GOV-1](./governance.md)) rather than a single `ERR-N` for the list as a whole, so that cross-references from `hard-ceilings.md`, `binder.md`, `frontmatter.md`, `discovery.md`, and `pi-integration-contract.md` into one specific pre-evaluation failure bind to the per-item anchor. Any insertion or reordering of items, and the `the seven below` count assertion in the preceding paragraph, moves in lock-step with the list under the same co-edit obligation.

An `invoke` parent whose callee fails to load observes a separate evaluation-time failure of its own: `InvokeInfraError { cause: "load_failure", ... }` per [Invocation — Failures](./invocation.md), which IS an evaluation outcome of the *parent*.

*Per-cause caller surfaces.* The mapping from internal failure cause to caller-observable surface is owned by the relevant per-cause topic page; the table below indexes them:

| Cause | `invoke` parent | Slash caller (user-visible) | Operator (`loom-system-note`) |
|---|---|---|---|
| Author-returned `Err` | corresponding `QueryError` variant per [Invocation — Failures](./invocation.md) (wrapped in `InvokeCalleeError`) | per-`kind` row in [Slash-Command Invocation — Top-level `Err`](./slash-invocation.md#slsh-3) | runtime event when `kind` is in the always-log set per [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md) |
| Panic | `InvokeInfraError { cause: "panic", ... }` per **Runtime panics** below | `"loom /<name> aborted: <message>"` system note per **Runtime panics** below | `loom-system-note` carrying `details: { diagnostics: [Diagnostic] }` (PIC group B) |
| Hard-ceiling exhaustion | per the per-ceiling routing class named at [`spec.md` — Hard ceilings](../spec.md#hard-runtime-ceilings) | same | same |
| Cancellation | per the two-arm `invoke`-parent rule in [Cancellation — Surfacing](./cancellation.md#surfacing) (a child-internal abort wraps `kind: "invoke_callee_error", inner: { kind: "cancelled", ... }`; a parent-own-signal abort surfaces bare `kind: "cancelled"`) | per [Cancellation — Surfacing](./cancellation.md) | not in the always-log set |

<a id="partial-append-contract"></a>

**Partial-append contract.** Turns appended *before* the terminal event remain in the conversation the loom was driving, regardless of which outcome fires — the caller's conversation in `prompt` mode, or the disposable subagent conversation in `subagent` mode. The runtime performs no implicit rollback. The contract is *turn-grain*: a turn is appended to the conversation at the granularity of the **No rollback** rule below — once a query's `Ok` is observable to loom code (and once a tool call has returned, or an `invoke` child has run to its terminal event), the corresponding conversation turn is final. Mid-stream user-visible streaming fragments are governed separately by [Slash-Command Invocation — User-visible streaming](./slash-invocation.md#slsh-2); a turn whose stream is interrupted by cancellation before its `Ok` materialises does not yield a partial-append-contract obligation — *visibility* of the partial fragment in the conversation observed by a subsequent `@`-query is determined entirely by Pi's session semantics — but the runtime's *non-mutation* obligation defined immediately below still applies.

<a id="mid-stream-cancellation-conversation-state"></a>

<a id="err-8"></a> **ERR-8.** **Mid-stream cancellation, non-mutation of committed surfaces.** When a query's stream is interrupted by cancellation before its `Ok` materialises, the loom runtime MUST NOT mutate the conversation maintained by Pi: it MUST NOT truncate, re-write, replace, or remove any assistant tokens, tool-call cards, or system notes that Pi has committed to the conversation. Whether the partial fragment appears in the conversation observed by a subsequent `@`-query in the same prompt-mode loom is determined entirely by Pi's session semantics; the loom runtime's obligation is non-mutation.

<a id="err-9"></a> **ERR-9.** **Mid-stream cancellation, no compensating injection.** On the same path, the loom runtime MUST NOT inject compensating turns into the Pi-committed conversation after a mid-stream cancellation.

<a id="err-10"></a> **ERR-10.** **Mid-stream cancellation, cancellation/`?`-propagation symmetry.** The non-mutation and no-compensating-injection obligations above apply symmetrically to the cancellation path *and* to `?`-propagation after a partial stream — the [Slash-Command Invocation — User-visible streaming](./slash-invocation.md#slsh-2) edge cases cover *visibility* of the partial prefix and the trailing system note, while these paragraphs bind the runtime against *mutation* of those committed surfaces.

<a id="err-11"></a> **ERR-11.** **Mid-stream cancellation, respond-repair scope window.** For typed queries with respond-repair follow-ups, the non-mutation and no-compensating-injection obligations above bind the runtime between the cancelled streaming turn and the next driver send; the respond-repair loop's own conversation appends remain governed by [Query — Schema-validation respond-repair](./query.md#schema-validation-respond-repair).

<a id="err-12"></a> **ERR-12.** **Mid-stream cancellation, subagent-mode internal binding.** Subagent mode has no external observer of its conversation outside the subagent itself, but the non-mutation obligation still holds within the subagent loom.

<a id="no-rollback"></a>

<a id="err-13"></a> **ERR-13.** **No rollback.** Neither `?` nor a panic nor cancellation unwinds prior side effects. Tool calls that have already returned, queries already appended to the conversation, and `invoke` children that have already run remain final on early return, abort, or cancellation. This applies uniformly to `?` early-return inside a function, `?` early-return at the top of a loom block, a panic in a slash-command loom (surfaced per the **Runtime panics** paragraph below), and a panic in an `invoke` child (surfaced to the parent as `kind: "invoke_failure", cause: "panic"` — wrapped in an `InvokeInfraError` per [Invocation](./invocation.md)) — in the last case, the child's already-committed tool calls remain committed even though the parent observes only the failure envelope.

*Cancellation behaves the same way.* A tool call, query, or `invoke` child whose signal aborts mid-execution leaves any external side effect already produced (filesystem writes, network requests, calls into Pi-side services, sub-loom mutations) in place; the runtime does not roll back, compensate, or enumerate completed side effects to the caller or to the operator. Tool-call completion is not transcript-visible (see [Tool Calls — No conversation turn](./tool-calls.md)) and is not in the [always-log set](./pi-integration-contract.md#runtime-event-channel), so a panic-, cancellation-, or `?`-driven terminal event surfaces only the failure envelope — not a manifest of what completed before it. Idempotency and compensation are the loom author's responsibility.

Loom has no implicit transactional layer; authors who need compensating actions must `match` on the failing `Result` and execute the undo logic explicitly before re-`Err`-ing or returning. Panics cannot be intercepted at all — code that needs cleanup on a panicking path must avoid the panic source (bounds-check before indexing, exhaustive `match` arms). This note is complementary to the [respond-repair follow-up paragraph in Query](./query.md): respond-repair describes what the runtime declines to do *to* the conversation on failure; this paragraph describes what the runtime declines to do *for* the author on failure.

**`Result` as a user-visible type.** `Result<T, E>` is a built-in two-variant type with constructors `Ok(value)` and `Err(error)`. Looms may declare functions returning `Result<T, QueryError>` explicitly, and may construct `Ok` / `Err` directly to bridge to code-side error handling. User-defined error types beyond `QueryError` are out of scope for loom 1.0.

<a id="runtime-panics"></a>

**Runtime panics.** Some failures cannot be expressed as a `Result` and are surfaced as **panics** that abort the loom immediately, bypassing `?` and `match`. V1 panic sources — each carrying its registered `loom/runtime/*` code from [Diagnostics](./diagnostics.md):

- Non-exhaustive `match` — `loom/runtime/match-error` (the implementation refers to this as `MatchError`).
- Array index out of bounds (`arr[i]` with `i < 0` or `i >= arr.length`) — `loom/runtime/index-out-of-bounds`.
- `.field` access on `null` — `loom/runtime/null-member-access`.
- `[i]` access on `null` — `loom/runtime/null-index-access`.
- Indexed access on a missing object key — `loom/runtime/missing-object-key`.
- `invoke` chain depth exceeded — `loom/runtime/invoke-depth-exceeded` (per the depth bound stated in [Invocation — Invocation depth bound](./invocation.md)).

This list is closed for *spec-defined* panic sources: division by zero, integer overflow, and explicit author-driven panics are deliberately excluded (see [Diagnostics](./diagnostics.md)). Separately, *unexpected interpreter exceptions* — any throw originating inside the runtime, an adapter it called, or a host function the runtime did not anticipate, that is not one of the six closed-list sources above, **whether observed during evaluation of a loom body or during the pre-evaluation dispatch-setup frame at any of the three insertion sites enumerated in [Pi Integration Contract — `ActiveInvocationRegistry`](./pi-integration-contract.md#active-invocation-registry)** (slash-command handler entry, `tool.execute(...)` adapter entry for a `.loom` callable, and `invoke(...)` spawn-site entry; the dispatch-setup throws covered are specifically `new AbortController()`, the `ActiveInvocationRegistry` insertion / `Set.add` step, and the awaited `createAgentSession(...)` rejection in subagent mode) — form a distinct **runtime-defect surface**. They are not a new authoring concept (no loom expression "causes" one) and they do not extend the closed list. They share the same routing channels as panics (slash-command system note + `InvokeInfraError` to an `invoke` parent), but carry the dedicated code `loom/runtime/internal-error` and a separate `cause: "internal_error"` arm on `InvokeInfraError`. The slash-command surface formats the system note as `"loom /<name> aborted with internal error: <error.message>"`; the `loom/runtime/internal-error` diagnostic carries `error.message` in its `message` and `error.stack` (or `"<no stack available>"` when falsy) in its `hint` for operator-facing triage. The user session is not torn down. The runtime-defect surface is bounded to throws the JavaScript exception machinery actually delivers to the runtime's catch sites: *uncatchable* host fatals — V8's `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` and any other engine fatal that bypasses the JavaScript exception machinery (the `OOMErrorCallback` / `abort()` path) — terminate the host process before any wrap can observe them, and `loom/runtime/internal-error` therefore emits no diagnostic for them. The catchable allocation-failure family (`RangeError: Invalid string length`, `RangeError: Invalid array length`, `RangeError: Maximum call stack size exceeded`) does reach the runtime-defect surface and routes here normally. This carve-out is the source of the NOCEIL-3 partition pinned in [`spec.md` — Hard ceilings, NOCEIL-3](../spec.md#no-additional-ceilings).

**Panic message string (normative).** Every panic carries a single human-readable message string formatted at the panic site according to the *Message template* registered for its `loom/runtime/*` code in the [Diagnostics code registry](./diagnostics.md#loomruntime--runtime-panics). The templates are normative: a conformant runtime MUST emit the registered string (with template placeholders filled from the offending value) for every panic of that source, and conformance tests MAY assert on the exact string. The `<…>` placeholders inside each template are interpolated by the per-category rules in [Diagnostics — Placeholder rendering](./diagnostics.md#placeholder-rendering-normative); the table summary below is shorthand for the registry rows and inherits the same placeholder rendering. The six V1 templates and their placeholders are summarised below — the registry is authoritative if the two ever drift:

| Code | Message template |
|---|---|
| `loom/runtime/match-error` | `MatchError: no arm matched <scrutinee summary>` |
| `loom/runtime/index-out-of-bounds` | `index out of bounds: <i> not in 0..<length>` |
| `loom/runtime/null-member-access` | `null member access: .<field>` |
| `loom/runtime/null-index-access` | `null index access: [<i>]` |
| `loom/runtime/missing-object-key` | `missing object key: <key>` |
| `loom/runtime/invoke-depth-exceeded` | `invoke chain depth exceeded: <depth> > 32` |

There is exactly one message string per panic. The same string flows unchanged to every routing surface listed below — it is *not* re-formatted per surface, and surface-specific framing (the `"loom /<name> aborted: "` prefix, the `InvokeInfraError` envelope) wraps the message rather than replacing it. The panic site itself is reported separately through the diagnostic's `file` / `range` (per [Diagnostics](./diagnostics.md)) and is not embedded in the message string. For panics inside a `.warp`-imported frame, the panic site is the leaf source location, not the importer.

Panics surface to the loom's caller as:

- **Slash-command / prompt-mode invocation** — a Pi system note formatted as "loom `/<name>` aborted: `<message>`", where `<message>` is the panic message string defined above. The user's session is not torn down; the user can type a follow-up turn. The runtime emits this surface as **one** `loom-system-note` carrying `details: { diagnostics: [Diagnostic] }` with the `loom/runtime/*` diagnostic and the `"loom /<name> aborted: <message>"` string in `content` — not two notes. See [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md) for the partition rule that routes panics through the `diagnostics` shape rather than `details: { event }`.
- **`invoke` parent** — `Err(QueryError { kind: "invoke_failure", cause: "panic", message: <message>, ... })` (see [Invocation](./invocation.md)), where `<message>` is the same panic message string. Author code that pattern-matches on `InvokeInfraError.message` to discriminate panic causes can therefore rely on the registered template, though matching on the `loom/runtime/*` code (when surfaced through the diagnostics channel) is the more stable discriminator.

Panics are not values — they do not flow through `?` and cannot be caught by `match`. Authors who need recoverable behaviour must write code that cannot panic (bounds-check before indexing, add a final `_ => ...` arm to `match`).

## QueryError variants

The canonical declaration of `QueryError` and every variant it carries lives here. Feature pages ([Query](./query.md), [Tool Calls](./tool-calls.md), [Invocation](./invocation.md)) describe **when** each variant fires and the design intent behind its fields, then cross-link this section for the schema shape. The variant order below matches the union declaration so the page reads top-to-bottom.

```loom
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

The `kind` discriminator is the wire form (snake_case noun); the schema identifier is the loom-side form authors use in `match` arms. The two are deliberately distinct: discriminator strings are stable wire contract; schema names belong to the loom surface.

**Discriminator type-openness.** The `kind` field is typed as `string` at the type-system level, **not** as a closed enum of the nine loom 1.0.0 variant tags. Call sites still exhaustively `match` on the loom 1.0.0 variant set (the runtime never produces an unlisted `kind` value, and loom 1.0.0 conformance tests assert the closed set), but the *type* does not foreclose future variants — adding a tenth variant in a minor revision (e.g. `BinderError`, a user-defined error type) does not break the type-system shape of code that already destructures `QueryError`. The seam is what lets the deferred user-defined-error-type and `BinderError`-as-variant extensions in [Future Considerations](./future-considerations.md) land without rewriting the discriminator's type. Authors who want a finite-set guarantee at the call site should rely on the catch-all `_ => …` arm pattern (see the **Pattern grammar (loom 1.0)** table at the top of this file) rather than a closed-enum type.

> **loom 1.0 seam — discriminator type-openness.** <a id="loom-1-0-seam-discriminator-type-openness"></a><a id="v1-seam-discriminator-type-openness"></a> The `kind` field of `QueryError` MUST be typed as `string` at the type-system level rather than as a closed enum of the loom 1.0.0 variant tags. loom 1.0.0 conformance tests assert that the runtime never emits an unlisted `kind` value, but the *type* MUST remain open so the deferred user-defined-error-type and `BinderError`-as-variant extensions in [Future Considerations — Surface extensions](./future-considerations.md#surface-extensions-v1-leaves-a-seam) can be added in a minor revision without rewriting the discriminator's type or breaking call sites that already destructure `QueryError`. One callout covers both deferred items because both ride the same single discriminator-type-openness seam; tightening `kind` to a closed enum at any point in the loom 1.0 lifetime is a non-conformant simplification.

### Query-time variants

Fires when a typed query's final response fails AJV validation, including respond-repair exhaustion (see [Query — Schema-validation respond-repair](./query.md)).

```loom
schema ValidationIssue {
  path: string,           // JSON pointer, e.g. "/issues/0/severity"
  message: string,        // human-readable summary of the failure
  schema_keyword: string  // "type", "required", "enum", "const", ...
}

schema ValidationError {
  kind: "validation",
  cause: "schema_validation" | "empty_template",  // required; disjoint subcauses, see below
  message: string,
  attempts: number,                          // respond-repair follow-ups made before giving up
  validation_errors: array<ValidationIssue>, // empty when cause = "empty_template"
  raw_response: string | null                // final malformed assistant text; null when cause = "empty_template"
}
```

`cause` is the wire-level subcause discriminator within `kind: "validation"`. Two arms:

- `cause: "schema_validation"` — the runtime issued a user turn, the model produced a response, and AJV (or the depth walk in [Schema Subset](./schema-subset.md)) rejected it. Fires on initial AJV failure, on terminal exhaustion of the respond-repair loop ([Query — Schema-validation respond-repair](./query.md)), and on depth-5 violations (`ValidationIssue { schema_keyword: "maxDepth" }`). Also fires when a typed query's forced respond turn does not invoke the synthesised `__loom_respond_<slug>` tool — either by emitting plain text, or by invoking a `tool_use` block whose `name` is not the synthesised respond tool: per [Pi Integration Contract — loom 1.0 diagnostic limitation](./pi-integration-contract.md#pic-typed-query-noncompliance), the runtime synthesises a single `ValidationIssue` (with `path: ""` and `schema_keyword: "required"`; the `message` literal varies by branch and is fixed by the PIC section's two-arm contract) for that turn and feeds it into the same respond-repair pipeline. The author's recovery path is to tighten the schema, raise `respond_repair.attempts`, or switch methodology. Untyped queries never produce this cause (no AJV step runs on an untyped response).
- `cause: "empty_template"` — the runtime refused to issue a fully-rendered user turn whose body matches `^\s*$` ([Query — Degenerate rendered templates](./query.md)). No provider round-trip occurred, no model output exists. The author's recovery path is to fix the template; this cause is a programming defect, not a model-quality signal. Fires on both typed and untyped queries. `validation_errors` is `[]` and `raw_response` is `null` on this arm.

Authors who want to handle the two arms differently destructure `cause` (consistent with the established `CodeToolError.cause` / `InvokeInfraError.cause` patterns — every `QueryError` variant whose `kind` partitions into multiple sub-arms uses the field name `cause`, per [Glossary — `cause`](./glossary.md)); authors who match `ValidationError { ... }` without inspecting `cause` get arm-uniform handling — the same retry / report path runs for both.

Fires on provider transport / network failure for a query turn (see [Query — Failure modes](./query.md)).

```loom
schema TransportError {
  kind: "transport",
  message: string,
  http_status: number | null,                // null on network-level failure (no HTTP response)
  provider: string,                          // "openai" | "anthropic" | ...
  retryable: boolean                         // whether the runtime considers a retry worth attempting
}
```

Fires on a non-recoverable adapter-layer failure of the model's tool-call loop — the named tool is absent from the resolved callable set, or a Pi-adapter / transport failure occurs while feeding a tool-result back to the model (see [Query — Tool calls during a query](./query.md)). An in-loop tool failure the runtime can lower to a tool-result — `execute()` throwing or resolving `{ content, isError: true }` — does **not** fire this variant: it is fed back to the model as that `tool_use` block's result and the loop continues. A non-conforming `{ content, isError }` envelope is routed off this surface through `loom/runtime/internal-error`, symmetric to the code-side rule in [Tool Calls — Failures](./tool-calls.md).

```loom
schema ModelToolError {
  kind: "model_tool",
  message: string,
  tool_name: string,
  tool_call_id: string,
  raw_response: string | null                // any text the model produced before the tool loop crashed
}
```

Fires when the provider reports a context overflow for a query (see [Query — Detection of `ContextOverflowError`](./query.md)).

```loom
schema ContextOverflowError {
  kind: "context_overflow",
  message: string,
  tokens_used: number | null,
  tokens_limit: number | null
}
```

Fires when an `AbortSignal` aborted a query, tool call, or invoke (see [Cancellation](./cancellation.md)).

```loom
schema CancelledError {
  kind: "cancelled",
  message: string
}
```

Fires when the per-query tool-call round cap is reached without the model producing a terminating turn (see [Query — Tool-call loop bound](./query.md)).

```loom
schema ToolLoopExhaustedError {
  kind: "tool_loop_exhausted",
  message: string,
  rounds: number,                            // == tool_loop.max_rounds on exhaustion
  last_tool_name: string | null,             // most recent tool the model called on the loop's terminal free-phase round; the typed-query forced respond turn never reaches this exhaustion path (see Query — Tool-call loop bound), so the `| null` branch has no loom 1.0-reachable case and is retained for forward compatibility
  raw_response: string | null                // any text the model emitted alongside the final tool call, when surfaced by the provider
}
```

### Code-side tool-call variant

Fires when **loom code** invoked a tool directly via `<name>(args)` and the call failed (see [Tool Calls — Failures](./tool-calls.md)). Distinct from `ModelToolError` because the contexts diverge: a code-side call has no `tool_call_id` from Pi's tool-loop machinery and no model-emitted `raw_response`, but does carry a structured `cause` enum.

```loom
schema CodeToolError {
  kind: "code_tool",
  message: string,
  tool_name: string,                  // post-rename name as seen in `tools:`
  cause: "validation"                 // arguments failed input-schema validation
       | "execution"                  // tool's `execute()` threw or returned `isError: true`
       | "cancelled"                  // AbortSignal fired (e.g., user cancelled the loom)
       | "unknown_tool"               // callable was lost across a file-watcher reload
}
```

<a id="invoke-variants"></a>

### Invoke variants

Fires when the loom infrastructure could not run an invoked callee to completion, or the callee panicked, or its return value failed AJV validation (see [Invocation — Failures](./invocation.md)). The `Infra` qualifier marks the infra-vs-callee split: this variant covers everything *around* the callee body, while `InvokeCalleeError` wraps an `Err` the callee itself returned.

```loom
schema InvokeInfraError {
  kind: "invoke_failure",
  message: string,
  callee_path: string,
  cause: "load_failure"      // callee file unreadable
       | "parse_failure"     // callee file failed to parse
       | "validation"        // typed invoke: child's return value failed AJV validation
       | "panic"             // callee aborted via runtime panic (see Runtime panics above)
       | "internal_error"    // callee threw an unexpected interpreter exception outside the closed loom 1.0.0 panic-source list
}
```

Fires when an invoked callee returned `Err`; the inner `QueryError` is the callee's original failure (see [Invocation — Failures](./invocation.md)). The recursive `inner: QueryError` field is now self-referential within this section.

```loom
schema InvokeCalleeError {
  kind: "invoke_callee_error",
  message: string,
  callee_path: string,
  inner: QueryError                          // the original Err the callee returned
}
```

### Notes

Each variant carries only its meaningful fields; there are no null-padded sentinel fields shared across variants. Authors `match` on `QueryError { kind: "...", ... }` (pattern grammar above) and only the relevant variant's fields are in scope.

`validation_errors` is an `array<ValidationIssue>`, a Loom schema rather than raw AJV objects. This isolates Loom's surface from the AJV API: a future validator swap is not a breaking change.

<a id="validation-issue-ordering"></a>
<a id="err-14"></a> **ERR-14.** **`ValidationIssue` ordering.** The entries of `validation_errors` (and of the `<ajv-summary>` source in [Binder — Failure-mode templates](./binder.md#failure-mode-templates-normative)) are emitted in a canonical deterministic order: a stable ascending sort keyed on the tuple (`path`, `schema_keyword`, `message`), comparing each field by Unicode code point. The underlying validator emits its own errors in an implementation-defined order (see [Implementation Notes — Schema validation](./implementation-notes.md#schemavalidator-interface)); the runtime applies this canonical order when mapping those errors into `ValidationIssue` entries, so the array is reproducible across conforming validators. `validation_errors[0]` is therefore well-defined (the canonically-first issue), and conformance tests compare the issue array under this order rather than under the validator's native emission sequence.

`raw_response` only appears on variants where the model produced (or attempted to produce) a final text response. `cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response. `ToolLoopExhaustedError` carries `raw_response` only when the model emitted text alongside its terminating tool-use block; the field is `null` when exhaustion fired on a pure tool-use turn.

`ToolLoopExhaustedError` is distinct from `CancelledError`: the former is the runtime giving up on the model; the latter is the user or parent giving up on the runtime. `last_tool_name` names the tool the model invoked on the loop's terminal free-phase round. The typed-query forced respond turn does not reach this exhaustion path — it is the exempt-routed terminator dispatched by CIO-4's `max_rounds`-final branch per [Hard Runtime Ceilings — CIO-4](./hard-ceilings.md#ceiling-interaction-order), and forced-respond non-compliance routes through the `validation` / `schema_validation` path per [Query — Forced respond turn non-compliance](./query.md#forced-respond-turn-non-compliance); the `| null` branch is retained for forward compatibility but has no loom 1.0-reachable case.

`InvokeInfraError`'s wire `kind` remains `"invoke_failure"` — snake_case discriminants are wire contract and are not renamed when the schema name changes. Code that pattern-matches on `kind: "invoke_failure"` is unaffected by the schema rename.

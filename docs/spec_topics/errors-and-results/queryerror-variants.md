# Queryerror variants

## QueryError variants

The canonical declaration of `QueryError` and every variant it carries lives here. Feature pages ([Query](../query.md), [Tool Calls](../tool-calls.md), [Invocation](../invocation.md)) describe **when** each variant fires and the design intent behind its fields, then cross-link this section for the schema shape. The variant order below matches the union declaration so the page reads top-to-bottom.

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

The `kind` discriminator is the wire form — the snake_case rendering of the schema identifier with the trailing `Error` dropped, applied uniformly to all nine loom 1.0.0 variants (e.g. `ValidationError` → `"validation"`, `InvokeInfraError` → `"invoke_infra"`, `InvokeCalleeError` → `"invoke_callee"`); the schema identifier is the loom-side form authors use in `match` arms. The two are deliberately distinct: discriminator strings are stable wire contract; schema names belong to the loom surface.

**Discriminator type-openness.** The `kind` field is typed as `string` at the type-system level, **not** as a closed enum of the nine loom 1.0.0 variant tags. Call sites still exhaustively `match` on the loom 1.0.0 variant set (the runtime never produces an unlisted `kind` value, and loom 1.0.0 conformance tests assert the closed set), but the *type* does not foreclose future variants — adding a tenth variant in a minor revision (e.g. `BinderError`, a user-defined error type) does not break the type-system shape of code that already destructures `QueryError`. The seam is what lets the deferred user-defined-error-type and `BinderError`-as-variant extensions in [Future Considerations](../future-considerations.md) land without rewriting the discriminator's type. Authors who want a finite-set guarantee at the call site should rely on the catch-all `_ => …` arm pattern (see the **Pattern grammar (loom 1.0)** table at the top of this file) rather than a closed-enum type.

> <a id="err-15"></a> **ERR-15.** **Discriminator type-openness seam.**
>
> **loom 1.0 seam — discriminator type-openness.** <a id="loom-1-0-seam-discriminator-type-openness"></a><a id="v1-seam-discriminator-type-openness"></a> The `kind` field of `QueryError` MUST be typed as `string` at the type-system level rather than as a closed enum of the loom 1.0.0 variant tags. loom 1.0.0 conformance tests assert that the runtime never emits an unlisted `kind` value, but the *type* MUST remain open so the deferred user-defined-error-type and `BinderError`-as-variant extensions in [Future Considerations — Surface extensions](../future-considerations/surface-extensions.md#surface-extensions-v1-leaves-a-seam) can be added in a minor revision without rewriting the discriminator's type or breaking call sites that already destructure `QueryError`. One callout covers both deferred items because both ride the same single discriminator-type-openness seam; tightening `kind` to a closed enum at any point in the loom 1.0 lifetime is a non-conformant simplification.

### Query-time variants

Fires when a typed query's final response fails AJV validation, including respond-repair exhaustion (see [Query — Schema-validation respond-repair](../query.md)).

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

- `cause: "schema_validation"` — the runtime issued a user turn, the model produced a response, and AJV (or the depth walk in [Schema Subset](../schema-subset.md)) rejected it. Fires on initial AJV failure, on terminal exhaustion of the respond-repair loop ([Query — Schema-validation respond-repair](../query.md)), and on depth-5 violations (`ValidationIssue { schema_keyword: "maxDepth" }`). Also fires when a typed query's forced respond turn does not invoke the synthesised `__loom_respond_<slug>` tool — either by emitting plain text, or by invoking a `tool_use` block whose `name` is not the synthesised respond tool: per [Forced-respond non-compliance synthesised shapes (ERR-17)](#err-17) below, the runtime synthesises a single `ValidationIssue` (with `path: ""` and `schema_keyword: "required"`; the `message` literal varies by branch and is fixed by the two-arm contract there) for that turn and feeds it into the same respond-repair pipeline. The author's recovery path is to tighten the schema, raise `respond_repair.attempts`, or switch methodology. Untyped queries never produce this cause (no AJV step runs on an untyped response).
- `cause: "empty_template"` — the runtime refused to issue a fully-rendered user turn whose body is empty or contains only ASCII whitespace per [System-note rendering](../binder/defaulting-system-note-echo.md#system-note-rendering) rule 1 (the language-dependent `\s` class is not used) ([Query — Degenerate rendered templates](../query.md)). No provider round-trip occurred, no model output exists. The author's recovery path is to fix the template; this cause is a programming defect, not a model-quality signal. Fires on both typed and untyped queries. `validation_errors` is `[]` and `raw_response` is `null` on this arm.

Authors who want to handle the two arms differently destructure `cause` (consistent with the established `CodeToolError.cause` / `InvokeInfraError.cause` patterns — every `QueryError` variant whose `kind` partitions into multiple sub-arms uses the field name `cause`, per [Glossary — `cause`](../glossary.md)); authors who match `ValidationError { ... }` without inspecting `cause` get arm-uniform handling — the same retry / report path runs for both.

<a id="validation-issue-ordering"></a>
<a id="err-14"></a> **ERR-14.** **`ValidationIssue` ordering.** The entries of `validation_errors` (and of the `<ajv-summary>` source in [Binder — Failure-mode templates](../binder/determinism-cancellation-failure.md#failure-mode-templates-normative)) are emitted in a canonical deterministic order: a stable ascending sort keyed on the tuple (`path`, `schema_keyword`, `message`), comparing each field by Unicode code point. The underlying validator emits its own errors in an implementation-defined order (see [Pi Integration Contract — `SchemaValidator` interface](../pi-integration-contract/host-interfaces-services.md#schemavalidator-interface)); the runtime applies this canonical order when mapping those errors into `ValidationIssue` entries, so the array is reproducible across conforming validators. `validation_errors[0]` is therefore well-defined (the canonically-first issue), and conformance tests compare the issue array under this order rather than under the validator's native emission sequence.

<a id="forced-respond-noncompliance-shapes"></a>
<a id="err-17"></a> **ERR-17.** **Forced-respond non-compliance synthesised shapes.** When a typed query's forced respond turn does not invoke the synthesised `__loom_respond_<slug>` tool — by emitting plain text, or by invoking a `tool_use` block whose `name` is not the synthesised respond tool — the runtime synthesises a single `ValidationIssue` and feeds it into the same `schema_validation` respond-repair pipeline as an AJV failure. The behavioural classification of this case (the loom 1.0 diagnostic limitation that the runtime cannot distinguish model non-compliance from any other respond-tool miss) is described at [Pi Integration Contract — loom 1.0 diagnostic limitation](../pi-integration-contract/conversation-drive.md#pic-typed-query-noncompliance). The synthesised issue's `path` is `""` (the JSON Pointer to the document root, matching AJV's empty-path convention for root-level failures) and its `schema_keyword` is `"required"` on both branches; only the `message` literal varies by branch.

*Plain-text branch* — the forced respond turn carried plain text and no `tool_use` block:

```
{ path: "",
  schema_keyword: "required",
  message: "model returned plain text instead of calling the forced respond tool" }
```

*Wrong-tool branch* — the forced respond turn carried only `tool_use` blocks whose `name` is not `__loom_respond_<slug>` (independent of whether plain text accompanies them):

```
{ path: "",
  schema_keyword: "required",
  message: "model invoked tool '<provider-emitted-tool-name>' instead of the forced respond tool '__loom_respond_<slug>'" }
```

The `<provider-emitted-tool-name>` placeholder is the `name` field of the provider's `tool_use` block, verbatim; when multiple wrong-tool calls appear in the same turn, the first block's `name` is used (consistent with the single-`ValidationIssue` rule above).

The synthesised issue feeds the same respond-repair pipeline as an AJV failure: it consumes one `respond_repair.attempts` slot, and the follow-up template is the methodology-appropriate one (the `validator_error` template's `<ajv-summary>` placeholder is rendered from this synthesised issue exactly as if AJV had produced it). Terminal exhaustion returns:

```
Err(QueryError {
  kind: "validation",
  cause: "schema_validation",
  attempts: respond_repair.attempts,                  // the configured budget
  validation_errors: [<synthesised issue from final attempt>],
  raw_response: <plain-text body of the final forced respond turn, or null when that turn carried no plain-text body>,
  message: "model did not call the forced respond tool"
})
```

`raw_response` disambiguation: the `raw_response: null` case is the wrong-tool branch when the model emitted a `tool_use` block with no accompanying plain text; this matches the `ToolLoopExhaustedError` precedent under [`raw_response`](#queryerror-variants) ("`null` when exhaustion fired on a pure tool-use turn"). When the wrong-tool turn does carry plain text alongside the `tool_use` block, `raw_response` is that plain-text body. With `respond_repair.methodology: none`, the *first* forced respond turn that does not invoke `__loom_respond_<slug>` returns the same `Err` shape with `attempts: 0` (no follow-ups issued, consistent with the existing `none` contract). When a stub provider alternates plain-text and wrong-tool payloads across respond-repair attempts, only the *last attempt's* issue appears in `validation_errors`, and `raw_response` is the plain-text body of the *last* forced respond turn (or `null` when that turn carried no plain-text body) — not a concatenation across attempts.

Fires on provider transport / network failure for a query turn (see [Query — Failure modes](../query.md)). The `retryable` field is populated by transport-error class per [Pi Integration Contract — Provider error mapping](../pi-integration-contract/provider-error-mapping.md#transport-error-retryable).

```loom
schema TransportError {
  kind: "transport",
  message: string,
  http_status: number | null,                // null on network-level failure (no HTTP response)
  provider: string,                          // resolved Model<Api>.api value (api-shaped, e.g. "anthropic-messages"); see provider derivation below
  retryable: boolean                         // populated by transport-error class; see Provider error mapping
}
```

`message` derivation (prompt mode): a transport failure detected after `waitForIdle()` sources `message` from the `errorMessage` field of the driven turn's trailing `assistant` message — the `stopReason: "error"` probe pinned at [Pi Integration Contract — prompt-mode error detection](../pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) — falling back to the fixed string `"provider transport failure"` when that field is absent.

`provider` derivation: the `provider` field is an `api`-shaped [`Model<Api>.api`](../pi-integration-contract/host-interfaces-core.md#model-registry-pin) value — the same `api`-shaped field the [Provider error mapping](../pi-integration-contract/provider-error-mapping.md#provider-error-mapping) table is keyed on (e.g. `anthropic-messages`, `openai-completions`), not a short provider-id form such as `"openai"`. Its value space is the externally-owned `Api` union declared in `@earendil-works/pi-ai`; loom does not redefine that union here. The `Api` value's source depends on which surface synthesised the error, because loom cannot always observe the model a failing turn routed through: failures whose model loom itself resolved (the binder pass and the typed-query forced respond turn, both off-session through `complete()`; the subagent-mode driven turn, whose spawned session runs the loom-resolved model; and the load/dispatch-time unsupported-provider synthesis) take that resolved model's `.api`, whereas prompt-mode driven-turn failures take the user session's selected-model `.api` (`ctx.model`), substituting the fixed sentinel `"unknown"` when `ctx.model` is `undefined`, per [prompt-mode error detection](../pi-integration-contract/conversation-drive.md#prompt-mode-error-detection).

Fires on a non-recoverable adapter-layer failure of the model's tool-call loop — the named tool is absent from the resolved callable set, or a Pi-adapter / transport failure occurs while feeding a tool-result back to the model (see [Query — Tool calls during a query](../query.md)). An in-loop tool failure the runtime can lower to a tool-result — `execute()` throwing or resolving `{ content, isError: true }` — does **not** fire this variant: it is fed back to the model as that `tool_use` block's result and the loop continues. A non-conforming `{ content, isError }` envelope is routed off this surface through `loom/runtime/internal-error`, symmetric to the code-side rule in [Tool Calls — Failures](../tool-calls.md).

```loom
schema ModelToolError {
  kind: "model_tool",
  message: string,
  tool_name: string,
  tool_call_id: string,
  raw_response: string | null                // any text the model produced before the tool loop crashed
}
```

Fires when the provider reports a context overflow for a query (see [Query — Detection of `ContextOverflowError`](../query.md)).

```loom
schema ContextOverflowError {
  kind: "context_overflow",
  message: string,
  tokens_used: number | null,
  tokens_limit: number | null,
  raw_response: string | null                // partial assistant text captured when an output-boundary overflow truncated a response mid-emission; null when the overflow fired before any output text was emitted
}
```

Fires when an `AbortSignal` aborted a query, tool call, or invoke (see [Cancellation](../cancellation.md)).

```loom
schema CancelledError {
  kind: "cancelled",
  message: string
}
```

<a id="err-19"></a> **ERR-19.** Fires when the per-query tool-call round cap is reached without the model producing a terminating turn (see [Query — Tool-call loop bound](../query.md)).

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

Fires when **loom code** invoked a tool directly via `<name>(args)` and the call failed (see [Tool Calls — Failures](../tool-calls.md)). Distinct from `ModelToolError` because the contexts diverge: a code-side call has no `tool_call_id` from Pi's tool-loop machinery and no model-emitted `raw_response`, but does carry a structured `cause` enum.

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

Fires when the loom infrastructure could not run an invoked callee to completion, or the callee panicked, or its return value failed AJV validation (see [Invocation — Failures](../invocation.md)). The `Infra` qualifier marks the infra-vs-callee split: this variant covers everything *around* the callee body, while `InvokeCalleeError` wraps an `Err` the callee itself returned.

```loom
schema InvokeInfraError {
  kind: "invoke_infra",
  message: string,
  callee_path: string,
  cause: "load_failure"               // callee file unreadable
       | "parse_failure"              // callee file failed to parse
       | "validation"                 // args/params failed input-schema validation (input side, like CodeToolError.cause "validation")
       | "return_validation"          // typed invoke: child's return value failed AJV validation
       | "panic"                      // callee aborted via runtime panic (see Runtime panics above)
       | "internal_error"             // callee threw an unexpected interpreter exception outside the closed loom 1.0.0 panic-source list
       | "subagent_model_unresolved"  // subagent callee's model resolved to undefined before spawn (see Diagnostics: loom/runtime/subagent-model-unresolved)
}
```

Fires when an invoked callee returned `Err`; the inner `QueryError` is the callee's original failure (see [Invocation — Failures](../invocation.md)). The recursive `inner: QueryError` field is now self-referential within this section.

```loom
schema InvokeCalleeError {
  kind: "invoke_callee",
  message: string,
  callee_path: string,
  inner: QueryError                          // the original Err the callee returned
}
```

### Notes

Each variant carries only its meaningful fields; there are no null-padded sentinel fields shared across variants. Authors `match` on `QueryError { kind: "...", ... }` (pattern grammar above) and only the relevant variant's fields are in scope.

`validation_errors` is an `array<ValidationIssue>`, a Loom schema rather than raw AJV objects. This isolates Loom's surface from the AJV API: a future validator swap is not a breaking change.

<!-- ERR-14 (`ValidationIssue` ordering) relocated to ### Query-time variants, co-located with the ValidationError schema, for discoverability. Anchors carried verbatim. -->

`raw_response` only appears on variants where the model produced (or attempted to produce) a final text response. `context_overflow` carries `raw_response` only when an output-boundary overflow truncated a streamed (or clean output-boundary) response mid-emission, in which case it is the partial text; the field is `null` when the overflow fired before any output text was emitted. `cancelled` has no `raw_response` field — its firing path holds no partial assistant text the runtime is positioned to surface. `transport` failures by definition have no assistant response. `ToolLoopExhaustedError` carries `raw_response` only when the model emitted text alongside its terminating tool-use block; the field is `null` when exhaustion fired on a pure tool-use turn.

`ToolLoopExhaustedError` is distinct from `CancelledError`: the former is the runtime giving up on the model; the latter is the user or parent giving up on the runtime. `last_tool_name` names the tool the model invoked on the loop's terminal free-phase round. The typed-query forced respond turn does not reach this exhaustion path — it is the exempt-routed terminator dispatched by CIO-4's `max_rounds`-final branch per [Hard Runtime Ceilings — CIO-4](../hard-ceilings/ceilings-3-and-4.md#cio-4), and forced-respond non-compliance routes through the `validation` / `schema_validation` path per [Query — Forced respond turn non-compliance](../query/query-failure-and-repair.md#forced-respond-turn-non-compliance); the `| null` branch is retained for forward compatibility but has no loom 1.0-reachable case.

# Query tool loop

## Tool calls during a query

<a id="qry-13"></a> **QRY-13.** If the model responds with tool-use, the runtime executes the requested tool against the theta's callable set, feeds the result back to the model, and loops until the model produces a final (non-tool-call) response or the round cap fires (see **Tool-call loop bound** below). That final response is what the query returns. A response schema, if given, is enforced against the final response only — not against intermediate tool-call payloads. The lifetime and visibility of the theta's callable set (including the typed-query `__theta_respond_<slug>` tool when a schema is in force) is governed by [Pi Integration Contract — Tool-registration lifetime and visibility](../pi-integration-contract.md): subagent-mode queries see the callable set via the spawned child `pi` process's `--tools` allowlist (its model reaches the tools registered natively in the child); prompt-mode queries see it via a `pi.setActiveTools` snapshot/restore around the turn, so the user's bare session never inherits the theta's callable set.

When a tool the model invoked inside this loop fails — `execute()` throws, or resolves `{ content, isError: true }` — the runtime lowers that outcome to the failing `tool_use` block's tool-result (an `isError: true` result carrying the tool's text content, lowered as for code-side calls in [Pi Integration Contract — Tool execution from theta code](../pi-integration-contract/host-interfaces-core.md#tool-execution-from-theta-code)) and feeds it back to the model alongside any sibling results; the round counts against `tool_loop.max_rounds` per [CIO-4](../hard-ceilings/ceilings-3-and-4.md#cio-4) and the loop continues. Such an in-loop tool failure does **not** raise `ModelToolError` — that variant is reserved for the non-recoverable adapter-layer conditions enumerated in [Errors and Results — `ModelToolError`](../errors-and-results/queryerror-variants.md#queryerror-variants). Cancellation of a model-driven `execute()` continues to surface as `CancelledError` and is never fed back as a tool-result (see [Cancellation](../cancellation.md)).

## Typed queries are tool-loop-shaped

<a id="qry-14"></a> **QRY-14.** A typed query is an ordinary tool-loop conversation whose *final* response is structured. The runtime presents the theta's frontmatter `tools:` to the model alongside a synthesised one-shot respond tool (`__theta_respond_<slug>`, see [Implementation Notes — Runtime](../implementation-notes.md#runtime)) and runs a **two-phase** loop:

1. *Free phase.* Each turn, the model may call any frontmatter tool (serviced and looped, exactly as for an untyped query) or emit a plain text turn. Tool calls in this phase satisfy `frontmatter.md`'s "available to the model during query-time tool loops" guarantee and can surface `ModelToolError` exactly as for untyped queries. The runtime issues the opening free-phase user turn carrying the rendered query template body (post-interpolation, post-newline-trim, post-dedent — see [Query forms](./query-forms.md) and [Query escapes and stringification](./query-escapes-stringification.md)) as its sole content; the `max_rounds: 0` boundary case (step 2 below) is the same dispatch with the forced respond turn's instruction wording concatenated after a single U+000A separator, not a second code path.
2. *Forced respond turn.* Once the model emits a plain text turn (provider stop reason `end_turn` / `stop`), the runtime issues one additional follow-up user turn — its body the [Initial forced respond turn template](#initial-forced-respond-turn-template-normative) below, rendered with the lowered response schema interpolated into the template's `<schema-json>` placeholder — and forces the provider's tool choice to the respond tool for that turn. The respond tool's `execute` AJV-validates the call payload against the lowered response schema and resolves the query's promise with the validated value. At `max_rounds: 0` the forced respond turn is the first and only turn of the typed query: no free-phase provider call is issued, and the inlined-schema follow-up is the typed query's opening provider call, carrying the user-supplied prompt text of the `@<T>`...`` expression as the leading content of its user-message body, separated from the forced respond turn's instruction wording (the [Initial forced respond turn template](#initial-forced-respond-turn-template-normative) below, which pins a single U+000A line feed between its instruction sentence and the `<schema-json>` placeholder) by a single U+000A line feed — the `max_rounds: 0` boundary case of the same dispatch mechanism, with CIO-4's `max_rounds`-final branch (see [Hard Runtime Ceilings — CIO-4](../hard-ceilings/ceilings-3-and-4.md#cio-4)) firing at typed-query start (`slot_count == max_rounds` holds at initialisation, 0 == 0). The runtime right-trims any trailing U+000A bytes the rendered prompt text carries before inserting this separator — the newline-trim rule above strips only the single newline immediately before the closing backtick, so an author who writes extra trailing blank lines would otherwise leak a second line feed into the boundary — keeping the prompt-to-instruction gap exactly one line feed in every case.

The forced respond turn is the exempt-routed terminator that CIO-4's `max_rounds`-final branch routes to (see [Hard Runtime Ceilings — CIO-4](../hard-ceilings/ceilings-3-and-4.md#cio-4)): the runtime dispatches it on every typed query reaching that branch — including `max_rounds: 0`, where it is the only turn issued — and CIO-4's slot-accounting check is not evaluated against it (it does not count against `max_rounds`). Respond-repair follow-ups (see **Schema-validation respond-repair** below) restart the *whole* two-phase loop — the model may need to retool (re-read a file, re-issue a search) before answering the repair request — and each follow-up gets a fresh `tool_loop` budget. Provider stop reasons other than `end_turn` / `stop` / `tool_use` (e.g. `length`, content filter) are classified to a `QueryError` variant by [Pi Integration Contract — Stop-reason classification](../pi-integration-contract/provider-error-mapping.md#stop-reason-classification).

The technique used to obtain the structured payload is provider-specific (synthesised one-shot tool + forced tool choice for the theta 1.0 reference; native structured output where supported in future revisions); the *behavioural* contract above is what authors and tests rely on. Provider compatibility is bounded by **Provider compatibility for typed queries** in [Pi Integration Contract](../pi-integration-contract.md).

### Initial forced respond turn template (normative)

<a id="initial-forced-respond-turn-template-normative"></a>

<a id="qry-15"></a> **QRY-15.** The forced respond turn issues its user-turn instruction wording from a normative template. The renderer MUST emit the fenced body verbatim — every character between the opening and closing fence is emitted, the fence lines themselves are not — interpolating only the `<slug>` and `<schema-json>` placeholders from the same definitions the respond-repair templates use (see [Follow-up turn templates (normative)](./query-failure-and-repair.md#follow-up-turn-templates-normative)). The body is byte-identical to the `schema_repeat` respond-repair template minus that template's leading non-compliance sentence, and carries a single U+000A line feed between the instruction sentence and the `<schema-json>` placeholder.

~~~text
Return your final answer using the `__theta_respond_<slug>` tool, conforming to this schema:
<schema-json>
~~~

## Tool-call loop bound

<a id="tool-call-loop-bound"></a>

<a id="qry-16"></a> **QRY-16.** Every query — untyped, typed, and any respond-repair follow-up — runs its tool-call loop under a per-query round cap configured by the theta's `tool_loop` frontmatter block (see [Parameters and Frontmatter — `tool_loop`](../frontmatter.md)). The cap counts *tool-call rounds* (one round = the model emits one or more `tool_use` blocks, the runtime executes them all in parallel where the provider supports parallel tool calls, awaits the whole batch to settle, feeds every call's result back — successful and failing siblings alike, each lowered independently per [Tool Calls — Concurrency](../tool-calls.md#concurrency) — and the model produces its next turn) — a model that emits three parallel tool calls in one round consumes one slot. The cap counts free-phase tool-call rounds only; the forced respond turn that terminates a typed query is the exempt-routed terminator dispatched by CIO-4's `max_rounds`-final branch (see [Hard Runtime Ceilings — CIO-4](../hard-ceilings/ceilings-3-and-4.md#cio-4)) and is not counted against `max_rounds`. When the cap is reached without an untyped query's model producing a terminating plain text turn, the runtime returns `Err(QueryError { kind: "tool_loop_exhausted", ... })` with the fields documented in **Failure modes** below; on a typed query the `max_rounds`-final branch instead dispatches the forced respond turn, so `tool_loop_exhausted` is unreachable on that path (non-compliance handling for the forced respond turn is covered under [Forced respond turn non-compliance](./query-failure-and-repair.md#forced-respond-turn-non-compliance) in **Failure modes** below). Cancellation via `AbortSignal` (see [Cancellation](../cancellation.md)) preempts the loop at any round boundary; the cap is a ceiling, not a floor. Each respond-repair follow-up gets a *fresh* `tool_loop` budget — the existing rule that "each follow-up counts as one against `respond_repair.attempts` regardless of how many tool-call rounds it contains" composes naturally with this. The `tool_loop.max_rounds` budget is scoped to a single query within a single invocation; it is not shared, pooled, or replenished across sibling queries or across sibling invocations, and is not a per-session or per-theta resource.

### Worked example: depth-6 forced respond at `max_rounds`

<a id="worked-example-depth-6-forced-respond"></a>

This example pins the only V1-reachable hard-ceiling co-fire (per [Pi Integration Contract — PIC-1 *Hard-ceiling co-fire (`masked`)*](../pi-integration-contract/runtime-event-channel.md#pic-1) and CIO-3 / CIO-4 / CIO-6 in [Hard Runtime Ceilings — Interaction between ceilings](../hard-ceilings/ceilings-3-and-4.md#ceiling-interaction-order)). It is normative: the `RuntimeEvent`-shape conformance test and the typed-query test suite both cite this vector.

*Theta source* (`depth-6-co-fire.theta` — a typed query with `tool_loop.max_rounds: 2` and a single frontmatter tool the model uses to occupy the free phase; the `/depth-6-co-fire` slash name in the `RuntimeEvent` payload below derives from this filename stem per [Parameters and Frontmatter — Naming convention](../frontmatter.md)):

~~~theta
---
mode: subagent
tools: [search]
tool_loop: { max_rounds: 2 }
respond_repair: { attempts: 0 }
---
@<{ deeply: { nested: { value: string } } }>`Probe.`
~~~

*Mock provider transcript* (two tool-using free-phase rounds, then a forced respond turn whose response payload is a depth-6 JSON document):

1. Round 1 — model emits one `tool_use` for `search`; runtime executes it, feeds the result back. Slot count after CIO-4's increment: 1.
2. Round 2 — model emits one `tool_use` for `search`; runtime executes it, feeds the result back. Slot count after CIO-4's increment: 2 (`= max_rounds`). Per CIO-4, the next turn issued is the forced respond turn (the `max_rounds`-final branch).
3. Forced respond turn — the synthesised `__theta_respond_<slug>` tool is invoked by the model with a depth-6 payload, e.g. `{"deeply":{"nested":{"value":{"a":{"b":"x"}}}}}` (five nested object levels terminating in a string scalar — depth 6 under the counting algorithm). The depth-walk in [Schema Subset — Depth Enforcement](../schema-subset.md) fires *inside* the respond tool's `execute` (per CIO-3) before AJV runs.

*Expected outcome.* The query returns:

~~~ts
Err(QueryError {
  kind: "validation",
  cause: "schema_validation",
  attempts: 0,
  validation_errors: [
    { schema_keyword: "maxDepth", path: "<JSON Pointer to first too-deep node>", message: "JSON document depth exceeds 5" }
  ],
  raw_response: "<the depth-6 payload as JSON text>",
  message: "<the validation message>"
})
~~~

The corresponding `RuntimeEvent` payload, surfaced via `details.event` per [Pi Integration Contract — Runtime event channel](../pi-integration-contract.md), carries:

~~~ts
{
  kind: "validation",
  theta: "/depth-6-co-fire",
  query_site: { file: <abs-path>, line: <line>, column: <col> },
  message: "<the validation message>",
  attempts: 0,
  masked: ["ceiling#2"],
  occurred_at: <epoch-ms>
}
~~~

The `masked: ["ceiling#2"]` is the only non-empty `masked` value reachable in V1 — it fires because PIC-1's V1 reachable predicate holds: the surfaced event was raised on a forced respond turn whose origin round, after CIO-4's slot increment, leaves the slot count equal to `max_rounds` (2 = 2). On a respond-repair follow-up of the same query, the predicate is re-evaluated against the follow-up's *fresh* `tool_loop` budget (each follow-up gets a new budget per the rule above), not the parent query's exhausted budget. With `max_rounds: 0`, no free-phase provider call is issued (per [Typed queries are tool-loop-shaped](#typed-queries-are-tool-loop-shaped) step 2's `max_rounds: 0` boundary case), the forced respond turn is the only turn, and `masked` is omitted on the surfaced event.

### Untyped return type (theta 1.0)

The `Ok` payload of an untyped query is a plain `string` containing the assistant's final text. theta 1.0 deliberately keeps it as `string` to minimise surface area; freezing a richer structure before real provider integration would lock in details that real-world use is likely to revise. See [Future Considerations](../future-considerations.md). The mechanism that produces this `string` from the provider transcript — which session surface is read, how the final turn is delimited against a long-lived session, and how assistant content is assembled — is pinned by [Pi Integration Contract — untyped-query `Ok(string)` extraction](../pi-integration-contract/conversation-drive.md#untyped-query-ok-extraction) and is symmetric across prompt mode and subagent mode.

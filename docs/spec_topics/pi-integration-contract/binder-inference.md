# Binder inference

<a id="binder-inference-call"></a>

**Binder inference call.** The binder pass described in [Slash-Command Argument Binding](../binder.md) issues its one-shot structured-output completion through `@earendil-works/pi-ai`'s `complete` free function — `complete<TApi extends Api>(model, context, options?): Promise<AssistantMessage>`, declared at `dist/stream.d.ts` in `@earendil-works/pi-ai` (the sibling package re-exported through the [model-registry surface](./host-interfaces-core.md#model-registry-pin) above, resolved at the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin)). The `Context`, `Tool`, `StreamOptions` (the base of `ProviderStreamOptions = StreamOptions & Record<string, unknown>`), `AssistantMessage`, and `ToolCall` types the call consumes and returns are declared at `dist/types.d.ts` in the same package. The symbol, its signature, and the structured-output surface are loom-load-bearing and MUST be re-validated against those files on each Pi minor bump per [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below; this paragraph pins loom's *use* of that surface, not the surface itself, which `@earendil-works/pi-ai` owns.

Unlike the prompt-mode and subagent-mode drivers above, the binder call uses neither the user `AgentSession` nor a spawned `AgentSession`: it runs at loom-load time before any conversation exists, attaches no turns, and resolves directly from the `Promise<AssistantMessage>` the entry point returns. Its terminal signal is therefore the resolution (or rejection) of that promise, not an `agent_end` event — the `pi.on("agent_end", …)` and session-local `subscribe` channels that the prompt-mode and subagent-mode drivers consume play no part in the binder call, and the global-`agent_end` bans those drivers impose do not apply to it.

The runtime populates one `complete(model, context, options)` call per binder attempt as follows:

- `model` is the resolved binder `Model<Api>` handle (per [binder-model parse rule](../binder/binder-model-and-context.md#binder-model-parse-rule)).
- `context.systemPrompt` is the rendered binder system prompt (per [System-prompt structure](../binder/binder-bypass-and-envelope.md#system-prompt-structure-normative)).
- `context.messages` is the rendered binder input transcript.
- `context.tools` carries exactly one entry — the **binder's structured-output tool** — whose `parameters` is the [binder envelope schema](../binder/binder-bypass-and-envelope.md#binder-envelope-schema-constructed-dynamically-from-params) wrapped as `Type.Unsafe<unknown>(envelopeSchema)` on the same lowered-JSON-Schema → TypeBox bridge the **Per-loom registration** section above uses. The provider's tool choice is forced to that single tool through the same per-provider `options.toolChoice` mechanism the typed-query forced respond turn uses (see [Implementation Notes — Runtime](../implementation-notes.md#runtime)); loom 1.0 attaches the envelope as a single forced tool, not as a provider-native structured-output / JSON-schema response field.
- `options.temperature` is `0` (per [Determinism](../binder/determinism-cancellation-failure.md#determinism)).
- `options.signal` is `loomAbort.signal` (always defined; see **Cancellation source** below). This is the cancellation wiring [Slash-Command Argument Binding — Cancellation](../binder/determinism-cancellation-failure.md#cancellation) forwards into the call.
- the fixed seed, when the resolved provider's `Api` carries a seed field, is placed under that field name as a `Record<string, unknown>` key on `options` per [Provider seed-field mapping](./provider-error-mapping.md#provider-seed-field-mapping); providers whose row omits the seed field receive no seed key.

The structured-output result is extracted from the returned `AssistantMessage.content`: the first `ToolCall` whose `name` matches the binder's structured-output tool supplies the envelope JSON in its `arguments`. An `AssistantMessage` carrying no such `ToolCall` — plain text only, or a `ToolCall` with a different `name` — is the malformed-envelope condition pinned by [Failure-class taxonomy](../binder/determinism-cancellation-failure.md#failure-class-taxonomy). A `stopReason` other than `"stop"`, a non-empty `errorMessage`, a rejected promise, or any 4xx/5xx/network failure is classified through the [Provider error mapping](./provider-error-mapping.md#provider-error-mapping) table exactly as the typed and untyped query paths classify provider failures. How many times this entry point is invoked per slash invocation is governed by the binder's [per-invocation retry budget](../binder/determinism-cancellation-failure.md#per-invocation-retry-budget); inter-attempt timing is out of scope here.

**System notes.** Echoes (binder result), `Err`-in-prompt-mode notes, binder failure messages, watcher structural-change notes, and operator-facing runtime events all emit through a single call shape:

```ts
pi.sendMessage(
  { customType: "loom-system-note", content, display, details },
  { triggerTurn: false },
);
```

The `display` and `content` arguments vary per the `details` variant documented below — they are not fixed to `display: true` or to a non-empty string. A `pi.registerMessageRenderer("loom-system-note", renderer)` registered by the loom extension factory formats these as one-line, dim-styled notes in the transcript. The custom-type approach (rather than `ctx.ui.notify(...)`) is chosen because notes need to persist in the session transcript for replay and `/tree` navigation, not just appear transiently.

**Renderer registration (`pi.registerMessageRenderer`).** The pinned signature, lifecycle, and ownership rules below are normative for the loom extension. The canonical Pi-side declarations live at `dist/core/extensions/types.d.ts` in `@earendil-works/pi-coding-agent` (the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) from **Host prerequisites** above) and the `Component` interface lives at `@earendil-works/pi-tui`'s `dist/tui.d.ts`; the inline shapes below are the loom-load-bearing subset and MUST be re-validated against those files on each Pi minor bump (per the re-validating obligation in **Host prerequisites** above).

*Signature.* The Pi-side surface, reproduced verbatim from `dist/core/extensions/types.d.ts`:

```ts
export interface MessageRenderOptions {
  expanded: boolean;
}

export type MessageRenderer<T = unknown> = (
  message: CustomMessage<T>,
  options: MessageRenderOptions,
  theme: Theme,
) => Component | undefined;

// On `pi: ExtensionAPI`:
registerMessageRenderer<T = unknown>(
  customType: string,
  renderer: MessageRenderer<T>,
): void;
```

The call returns `void` (synchronous); the loom extension factory MUST NOT `await` it and MUST NOT attach a `.then`/`.catch`. Failures propagate as synchronous throws and fault the extension factory body — there is no separate Promise rejection path.

The `Component` return type is the `pi-tui` widget interface (`{ render(width: number): string[]; handleInput?(...): void; invalidate(): void; ... }`), **not** a string and **not** a React node. A renderer body of the form `(message) => message.content` is therefore a type error that silently leaves the channel unrendered — the loom renderer MUST construct a `pi-tui` `Component` instance (e.g. a text component composed from the `theme` parameter) and return it. Returning `undefined` is legal and tells Pi to skip rendering this message; the loom 1.0 loom renderer uses `undefined` only when `display === false` (see **Empty `content` is legal** below).

The `theme: Theme` parameter is Pi's active TUI theme; the loom renderer MUST source any styling (dim text colour, etc.) from `theme` rather than hard-coding ANSI escapes, so re-themes propagate without renderer changes.

The `options: MessageRenderOptions` carries `{ expanded: boolean }` from the Pi host; `expanded` is the Pi-host hint for whether the user has requested an expanded view of this message in the transcript. The loom 1.0 loom renderer MUST be defined for both `expanded === false` and `expanded === true`; loom 1.0 MAY render identically in both modes. Widening the renderer to use `expanded` to disclose the structured `details` payload (e.g. expanding the diagnostic batch or runtime-event fields) is reserved for a future revision and is not part of loom 1.0 conformance.

*Lifecycle.*

- **Registration timing.** The loom extension factory MUST call `pi.registerMessageRenderer("loom-system-note", renderer)` synchronously inside the factory body, before the factory returns. Registration after the factory returns (e.g. inside an event subscriber that fires asynchronously) is undefined behaviour at the Pi-SDK level and the loom runtime MUST NOT rely on it.
- **Re-registration within an extension.** Pi's loader stores renderers in a `Map<string, MessageRenderer>` keyed by `customType` (`@earendil-works/pi-coding-agent`'s `dist/core/extensions/loader.js`), so a second call from the same factory with the same `customType` silently overwrites the first; Pi emits no warning. The loom factory MUST register exactly once per factory invocation.
- **Teardown.** Pi exposes no `unregisterMessageRenderer` API. The renderer entry lives for the lifetime of the extension instance; on `ctx.reload()` or any other path that replaces the extension instance, Pi discards the prior `Map` along with the old extension, and the freshly loaded factory registers afresh against a Pi state that has no prior `loom-system-note` registration. The loom runtime MUST NOT attempt to clean up the registration in its `session_shutdown` handler.

*`customType` ownership and collision rule.*

- The literal `"loom-system-note"` is owned by the pi-loom extension. No other extension SHOULD register a renderer for this `customType`.
- Pi does not enforce ownership: collision is a coordination failure between extensions, not a Pi-level error. Pi's runner resolves a `customType` by iterating `this.extensions` in load order and returning the first hit (`@earendil-works/pi-coding-agent`'s `dist/core/extensions/runner.js` `getMessageRenderer`), so when two installed extensions both register `"loom-system-note"` the **first-loaded** extension's renderer wins and the later registration is unreachable. Whether pi-loom or the other extension wins is non-deterministic from loom's point of view (Pi controls extension load order).
- Loom emits no diagnostic for this case in loom 1.0 — ownership is by convention.
- The `customType` naming convention for loom-internal channels is `loom-<purpose>` (kebab-case, `loom-` prefix). Future loom channels MUST follow this convention; other extensions SHOULD NOT use the `loom-` prefix. loom 1.0.0 ships exactly one channel under this prefix (`loom-system-note`).

**Delivery surface.** All three `details` payload variants below emit through the single `pi.sendMessage` call above. The runtime has no second channel for `display: false` notes; they land in the same session transcript as `display: true` notes and are filtered out of visible rendering by the renderer (or by Pi's own `display` handling), but remain available to transcript-replay and `/tree` consumers. *Subagent-mode `display: false` cascades* (the subagent top-level `Err` case noted under **Runtime event channel** below) use the same `pi.sendMessage` call against the spawned `AgentSession` — i.e., they reach `pi.sendMessage` after the per-loom `sessionManager` swap from **Tool execution from loom code** above has routed messaging at the spawned session — so the note lands in the subagent's private transcript, not the parent user session's.

*Custom-message channel persistence and LLM-context entry.* Per `@earendil-works/pi-coding-agent`'s `dist/core/messages.js` `convertToLlm` transformer, every `CustomMessage` (including `loom-system-note`) is converted to `{ role: "user", content }` on every subsequent provider call. `triggerTurn: false` suppresses the immediate turn fire only; it does not exclude the message from the LLM context window. The `display` flag controls renderer behaviour, not serialization. Loom diagnostics therefore enter the user-session model context durably and contribute to `ctx.getContextUsage()` and compaction decisions. Operators authoring looms should expect parse errors, binder failures, panic notes, and always-log runtime events emitted in a session to be visible to subsequent model turns. The [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) exposes no `CustomMessage.excludeFromContext` opt-out analogous to `BashExecutionMessage.excludeFromContext`; a future Pi minor that adds such a field would be picked up by the `pi-version-bump-procedure` re-validation gate, at which point the runtime SHOULD set the opt-out on the canonical `sendSystemNote` call.

**Empty `content` is legal.** When the variant prescribes `content: ""` (the `display: false` runtime-event case below), the runtime passes the empty string verbatim. `pi.sendMessage`'s `content` parameter accepts any string per Pi's `CustomMessage<T>` interface; no placeholder substitution is required or permitted. The renderer registered for `loom-system-note` MUST tolerate `content === ""` — in loom 1.0 this only ever co-occurs with `display: false` and `details: { event: RuntimeEvent }`, so the renderer MAY short-circuit on `display === false` without inspecting `content`.

The `details` field carries one of three normative payload shapes, distinguished by which key is present:

- `details: { diagnostics: Diagnostic[] }` — a parse / load / type / runtime-panic diagnostic batch, exactly the shape defined in [Diagnostics](../diagnostics.md). The companion `content` is the serialised `<file>:<line>:<col>: <code>: <message>` line(s) for parse / load / type batches; for the runtime-panic case (a single-element batch carrying a `loom/runtime/*` diagnostic) the companion `content` is the user-facing framing `"loom /<name> aborted: <message>"` (or `"loom /<name> aborted with internal error: <message>"` for `loom/runtime/internal-error`) per [Errors and Results — Runtime panics](../errors-and-results.md). See **Runtime event channel** below for the partition rule that routes panics through this shape rather than `details: { event }`.
- `details: { event: RuntimeEvent }` — a runtime failure event from one of the always-log kinds (see **Runtime event channel** below). The companion `content` is the normative user-facing template from [Slash-Command Invocation — Top-level `Err` in prompt mode](../slash-invocation.md#slsh-3) when `display: true`, or omitted (empty string) when `display: false`.
- `details: { structural: { added: string[]; removed: string[] } }` — informational note for watcher-observed structural changes (added or removed `.loom` files, settings-array changes that add or remove sources); `added` and `removed` carry absolute file paths from the debounce-window batch. Settings-array edits surface as the resolved `.loom` file paths the source change brought in or removed, not the settings-file path itself, so a single settings edit that adds N sources contributes N entries to `added`. The shape is disjoint from the `diagnostics` and `event` shapes by key, per the additive-only convention below. The companion `content` is the verbatim template defined under **Structural changes** above; `display: true` always.

Per-variant `display` / `content` pairings (normative):

| Variant | `display` | `content` |
|---|---|---|
| `details: { diagnostics: Diagnostic[] }`, parse / load / type batch | `true` | serialised `<file>:<line>:<col>: <code>: <message>` line(s) (multi-line for batches) — non-empty |
| `details: { diagnostics: [Diagnostic] }`, runtime panic (single-element batch, `loom/runtime/*` code) | `true` | `"loom /<name> aborted: <message>"` (or `"loom /<name> aborted with internal error: <message>"` for `loom/runtime/internal-error`) per [Errors and Results — Runtime panics](../errors-and-results.md) — non-empty |
| `details: { event: RuntimeEvent }`, top-level cascade in prompt mode | `true` | normative user-facing template per [Slash-Command Invocation — Top-level `Err` in prompt mode](../slash-invocation.md#slsh-3) — non-empty |
| `details: { event: RuntimeEvent }`, author-handled or subagent-mode cascade | `false` | `""` (empty string, verbatim) |
| `details: { structural: { added; removed } }` | `true` | verbatim template from **Structural changes** above — non-empty |

The three `details` shapes are disjoint by key; renderers MUST NOT assume more than one is present. Future payload shapes added to this channel are additive and disjoint by the same convention. Future variants MAY widen the `display: false` + `content: ""` combination to other `details` shapes additively; the renderer's `display === false` short-circuit above remains safe under that widening because it does not inspect `content`.

**Runtime event channel.** A subset of `QueryError` failures — the **always-log set** — emit a structured note through the `loom-system-note` channel exactly once per occurrence, regardless of whether the author matched the `Err`, propagated it via `?`, or discarded it via `let _ =`. The always-log set partitions by routing channel: members in **group A** emit `details: { event: RuntimeEvent }`; members in **group B** emit `details: { diagnostics: Diagnostic[] }`. A given failure emits through exactly one shape — there is no fan-out across the two `details` variants for a single failure.

`display: false` gates only renderer visibility; the underlying `CustomMessage` still enters subsequent provider calls per **Delivery surface** above (Pi's `convertToLlm` transform converts every `CustomMessage` to a `user`-role transcript entry on every subsequent provider call, with no opt-out under the loom 1.0 SDK pin). Operators MUST treat all `loom-system-note` content (regardless of `display`) as durable session-context input.

*Engine-assumption carve-out.* The exactly-once emission guarantee assumes the [Runtime Value Model — JavaScript engine assumptions](../runtime-value-model.md#javascript-engine-assumptions) hold (IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, `Object.is` equality — a non-checked invariant). Under a violation of those assumptions, emission may be silently dropped (e.g. a corrupted `Map` loses the dedup key), duplicated, or skipped entirely (e.g. a `pi.sendMessage` host throw bypasses the helper); some manifestations land on `loom/runtime/internal-error` via the runtime-defect surface in [Errors and Results — Runtime panics](../errors-and-results.md), but silent value corruption has no observable signal. Operators MUST treat a missing terminal event as one of: (a) the loom did not fail; (b) the loom failed with a kind not in the always-log set; (c) an engine-assumption violation. There is no in-band signal that distinguishes (a) from (c).

Group A — `details: { event: RuntimeEvent }`:

- `transport`
- `model_tool`
- `code_tool`
- `tool_loop_exhausted`
- `invoke_infra_error`
- Binder failures (every row of [Binder — Failure modes](../binder.md), including `needs_info`, `ambiguous`, malformed envelope, AJV validation, transport, cancellation)

Group B — `details: { diagnostics: Diagnostic[] }`:

- Runtime panics — every row of [Diagnostics — `loom/runtime/*`](../diagnostics.md) plus the four console.error-routed teardown-handler `loom/host/session-shutdown-*` codes enumerated in the exclusion list below, routed through the `details: { diagnostics: [...] }` shape per the panic-emission rule under **Deduplication and lifetime rules** below, with five console.error-routed teardown-handler exclusions: `loom/runtime/reload-teardown-timeout`, `loom/host/session-shutdown-reason-unknown`, `loom/host/session-shutdown-pinned-constant-unreadable`, `loom/host/session-shutdown-teardown-step-failed`, and `loom/host/session-shutdown-runtime-degraded` (per the **Edge cases** bullet under **Extension entry point** sub-step 4 above and the **Persistent diagnostics** paragraph in [Diagnostics](../diagnostics.md)). A new diagnostic added to either of those sinks MUST be added to this exclusion list in the same edit. The `RuntimeEvent` payload shape and the `(kind, query_site, message, occurred_at)` dedup key defined below apply to group A only and have no analogue for group B.

`validation`, `context_overflow`, `cancelled`, and `invoke_callee_error` are deliberately **not** in the always-log set: `validation` is a query-internal repair signal whose final outcome is what matters (the `attempts` field on the eventual terminal event captures the count); `context_overflow` and `cancelled` are user/operator-initiated and self-explanatory in context; `invoke_callee_error` wraps an inner `Err` whose origin already emitted its own runtime event at the originating site.

*Discard-site disposition.* The four excluded kinds emit nothing on this channel even at a discard site (`let _ = @"…"`, `void`-tail-expression discard, or any other disposition that drops the `Err`). The exclusion rationale survives the discard case for each kind: for `validation`, a discarded validation failure is by construction a programming error — the author wrote `let _ = @<Schema>\`…\`` and ignored the schema mismatch; the diagnostic at the originating site (when one fires — depth-5 violations and respond-repair failures both have `loom/runtime/*` codes available) plus the absence of any user-visible outcome is the intended signal. For `cancelled`, the author's choice to discard a user/operator-initiated outcome is itself the disposition. For `context_overflow`, the author's choice to discard a model-state outcome is itself the disposition. For `invoke_callee_error`, the inner `Err`'s origin-site emission is unchanged by the wrapper's disposition. The symmetric statement on the consumer side is owned by [Query — Observability of discarded results](../query.md).

<a id="success-side-null-policy"></a>*Success-side null-policy.* A loom terminating with `Ok(v)` — including the case where a child loom's `Ok(v)` flows to its `invoke` parent per [Invocation — Final-value propagation across callees](../invocation.md#final-value-propagation) — emits no `loom-system-note` keyed on the `Ok(v)` outcome. This follows by construction from the always-log set above, whose members are all `QueryError` kinds (group A) or runtime panics (group B); an `Ok(v)` termination is neither, so no always-log entry has a satisfied emission predicate for it. Earlier mid-run emissions on the same channel — always-log members raised inside the loom body before its terminating expression — are governed by the **Runtime event channel** paragraph above and are unaffected; this paragraph adds no new emission predicate and removes none. The operator-observable surfaces on the success side are mode-dependent: in prompt mode the driven conversation per [Slash-Command Invocation](../slash-invocation.md) is the user-facing surface (any value the author wants the user to see should be issued by the author as a final query), and the `Ok(v)` return value reaches a programmatic caller only when one exists (none on a user-typed slash dispatch; an `invoke` parent otherwise); in subagent mode there is no user-facing surface for the terminating value (the intermediate subagent transcript stays private per [Slash-Command Invocation — User-visible streaming](../slash-invocation.md#slsh-2)), and the `Ok(v)` return value reaches a programmatic caller only when one exists (none on a user-typed slash dispatch; an `invoke` parent otherwise, per [Invocation — Final-value propagation across callees](../invocation.md#final-value-propagation)). The two pre-evaluation surfaces — the binder echo on `bind_echo: true` per [Slash-Command Argument Binding](../binder.md) and the no-params overflow note per [Slash-Command Invocation — No-params overflow](../slash-invocation.md#slsh-1) — emit before the loom's terminating expression evaluates and are unaffected by this paragraph regardless of the run's outcome.

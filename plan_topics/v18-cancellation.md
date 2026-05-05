# V18 — Cancellation, file watcher, system notes, panics, diagnostics rollup

## V18a — `AbortSignal` at every loop iteration boundary

- **Spec.** [Cancellation](../spec_topics/cancellation.md).
- **Adds.** Interpreter checks signal before each `for`/`while` iteration's body.
- **Tests.** Signal fired mid-loop: next iteration body not executed; `Err({kind:"cancelled"})` returned (or panic-routed for top-level).
- **Deps.** V8b, V8c.
- **Ships when.** Loops cancellable.

## V18b — `AbortSignal` before every `@` query

- **Spec.** [Cancellation](../spec_topics/cancellation.md).
- **Adds.** Pre-query signal check; in-flight query aborted via the underlying provider's abort path.
- **Tests.** Pre-flight abort: query never sent; mid-flight abort: `Err({kind:"cancelled"})`.
- **Deps.** V5e.
- **Ships when.** Queries cancellable.

## V18c — `AbortSignal` before every tool call

- **Spec.** [Cancellation](../spec_topics/cancellation.md).
- **Adds.** Pre-call check; signal forwarded to tool's `execute(toolCallId, params, signal, ...)`.
- **Tests.** Pre-flight abort: tool never invoked; mid-flight abort: `CodeToolError{cause:"cancelled"}` (wire `kind: "code_tool"`).
- **Deps.** V14c.
- **Ships when.** Tool calls cancellable.

## V18d — `AbortSignal` before every `invoke`

- **Spec.** [Cancellation](../spec_topics/cancellation.md), [Pi Integration Contract — Subagent session lifecycle](../spec_topics/pi-integration-contract.md).
- **Adds.** Pre-invoke check; child inherits derived signal from caller.
- **Tests.** Pre-flight abort: child never spawned; mid-flight abort: `Err({kind:"cancelled"})` or `InvokeCalleeError{inner:cancelled}` per origin; for subagent-mode children, cancellation observed before the first turn still triggers `AgentSession.dispose()` via the `finally` block (cross-checked with V12a's disposal-on-spawn-then-immediate-cancel test).
- **Deps.** V15a.
- **Ships when.** Invokes cancellable.

## V18e — Cancellation propagates downward only

- **Spec.** [Cancellation](../spec_topics/cancellation.md) (propagation).
- **Adds.** Parent cancellation fires child's signal; child cancellation does not fire parent's signal — surfaces as `Err`.
- **Tests.** Parent abort cancels child mid-execution; child internal cancel surfaces as `InvokeCalleeError{inner:cancelled}` to parent without aborting parent.
- **Deps.** V18b, V18c, V18d.
- **Ships when.** Direction rule enforced.

## V18p — `AbortSignal` before and during the binder LLM call

- **Spec.** [Cancellation](../spec_topics/cancellation.md) (Granularity, Surfacing — cancelled binder), [Slash-Command Argument Binding — Cancellation, Failure modes](../spec_topics/binder.md).
- **Adds.** Pre-call signal check immediately before the binder LLM call; signal forwarded to the binder model's provider invocation so an abort observed mid-call surfaces; the single transport-failure retry honours the signal (an abort observed during the retry suppresses it). A cancelled binder produces the system note `loom /<name>: argument binding cancelled` per the failure-modes table and the loom does not run. Bypass-eligible looms (no-params, single-string) do **not** emit the cancelled-binder note — they have no binder call to cancel and remain cancellable at the next regular checkpoint inside the loom body.
- **Tests.** Pre-call abort: binder request never issued (asserted via injected provider probe); cancelled-binder system note text matches the failure-modes table verbatim; the loom never starts. Mid-call abort: in-flight binder request observes the forwarded signal and the same system note surfaces. Abort observed during the transport-failure retry suppresses the retry (provider sees one request, not two) and surfaces the cancelled-binder note rather than the transport-unavailable note. Bypass-eligible looms (no-params; single-string) under abort emit no cancelled-binder note; the loom either runs to its first in-loom checkpoint and surfaces `Err({kind:"cancelled"})` there or completes (per the no-retroactive-`Ok`-to-`Err` rule). An abort observed *after* `ok` envelope return but *before* AJV validation lets validation complete (AJV is uncancellable per `cancellation.md`) and surfaces at the next in-loom checkpoint.
- **Deps.** V16e, V16n, V18h.
- **Ships when.** Binder calls are cancellable at the same granularity as queries, tools, and invokes, and the cancelled-binder failure-mode row is observable.

## V18f — File watcher (chokidar) over discovery roots

- **Spec.** [Pi Extension Integration](../spec_topics/pi-integration.md), [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md), [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime).
- **Adds.** Chokidar watcher over the discovered roots, debounced 250 ms (to coalesce editor `change` + `rename` bursts). On a content edit to an existing `.loom` or `.warp` file the watcher re-parses just the changed file plus every transitive `.warp` importer reached through an in-memory import graph, then atomically swaps the affected entries in the in-process `LoomRegistry`. **No `ctx.reload()` call** for content edits. The slash-command `handler` registered in step 3 closes over `LoomRegistry.dispatch`, which reads the entry once at handler entry; in-flight invocations therefore run against the pre-swap snapshot and the next invocation sees the new version. Structural changes — a brand-new `.loom` file added or an existing one removed, including settings-array changes that add or remove sources — cannot register/unregister a slash command after extension load and instead emit a one-line `loom-system-note` informational message prompting the user to run `/reload`. Tools synthesised from prompt-mode loom callees are re-registered through `pi.registerTool` only when the swap produces a new lowered-schema hash; cached registrations under unchanged hashes are reused. The atomic swap also drops the changed file's compiled-validator cache entry and the entries for every transitive `.warp` importer; the validator-cache key remains the lowered-schema hash, so a re-parse producing an identical lowered schema reuses cached validators across the swap. The per-extension tool-registration cache (`Map<schema-hash, registeredToolName>`) is **not** cleared on content edits — it lives for the extension-instance lifetime and only `/reload` recreates it empty.
- **Tests.** Editing the body of an existing `.loom` triggers exactly one re-parse + swap (debounce coalesces a `change` + `rename` burst); the next slash invocation runs the new version while an in-flight invocation completes against the pre-swap snapshot. Editing a `.warp` invalidates every transitive importer (synthetic 3-level import chain). Adding a brand-new `.loom` file emits the structural-change `loom-system-note` and does **not** auto-register; running `/reload` then registers it. Removing an existing `.loom` likewise emits the note and the slash command stays registered until `/reload`. The watcher never calls `ctx.reload()` for content edits (asserted by an injected probe on the `ExtensionContext`). Editing a `.loom` whose `tools:` set contains a prompt-mode loom callee re-uses the existing `pi.registerTool` registration when the lowered schema hash is unchanged; a hash change triggers exactly one new `pi.registerTool` call. After a `/reload` invoked in response to a structural-change note, `ctx.reload()` is observed to fire exactly once, the extension factory is re-invoked exactly once (asserted via a probe injected into the factory entry point), the resulting `PiExtensionAPI` instance owns a fresh empty `Map<schema-hash, registeredToolName>` registration cache, and the prior instance's registration cache is unreachable from any live reference held by the watcher, the registry, or the slash-command handler. A schema edit drops the matching validator-cache entry as part of the swap (asserted via a probe on the validator service) and the next query recompiles; non-changed files retain their cache hit; a re-parse producing an identical lowered schema reuses the cached validator (no recompile observed); the tool-registration cache survives a content-edit swap and is empty only after a real `/reload`.
- **Deps.** V14k–p.
- **Ships when.** Edits to existing files take effect without a session restart, structural changes prompt for `/reload`, and `ctx.reload()` is never called for content edits; validator-cache stays consistent under live edits; registration-cache lifetime matches the extension-instance lifetime.

## V18r — Settings-file watcher (`~/.pi/agent/settings.json`, `.pi/settings.json`)

- **Spec.** [Directory Convention — Settings file reads](../spec_topics/discovery.md), [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md), [Slash-Command Argument Binding — Binder model](../spec_topics/binder.md).
- **Adds.** A second chokidar watcher (re-using the V18f bring-up) over the two settings paths `~/.pi/agent/settings.json` and `.pi/settings.json`, debounced 250 ms to absorb partial writes from editors-in-progress. On a debounced change the watcher calls `V14n.invalidate()` and re-runs the project-over-global merge via the V14n reader. A delta in the `looms` array (additions, removals, or in-place edits — including the case where the global file changes while the project file already supplies an overriding `looms` array) is routed to the structural-change `loom-system-note` path that V18f uses for added/removed `.loom` files, prompting the user to run `/reload`; the watcher does not register/unregister slash commands itself. A delta in `looms.binderModel` only invalidates the V14n cache so that the next loom load picks up the new value (per V16e); already-loaded looms keep their resolved model and already-failed loads are not retroactively re-attempted. A malformed intermediate JSON read during the debounce window is treated as `loom/load/settings-invalid-json` (severity `W`); the prior cache stays live (last-known-good fallback) and the watcher waits for the next debounced event. The watcher must not depend on Pi-internal mutation hooks — chokidar fires on edits made by any tool. A `looms.binderModel` change observed while a loom invocation is mid-flight does not retroactively swap the binder model on the in-flight call (the V16e "captured at handler entry" snapshot rule applies symmetrically).
- **Tests.** (a) Editing `~/.pi/agent/settings.json` to add a new `looms` entry triggers exactly one debounced re-merge via the V14n reader and emits exactly one structural-change `loom-system-note`; the slash command is not auto-registered until `/reload`. (b) Editing `.pi/settings.json` to remove a `looms` entry emits the same structural-change note. (c) Editing the global file's `looms` array while the project file's `looms` array overrides it still triggers re-merge (the cache key cannot collapse to a single file's mtime). (d) Editing `looms.binderModel` invalidates the V14n cache and the next loom load resolves the new model; an already-loaded loom retains its prior model; an already-failed load stays unregistered until `/reload`. (e) A malformed-intermediate JSON write observed mid-debounce surfaces exactly one `loom/load/settings-invalid-json` diagnostic; the prior cache remains live (a follow-up read returns the last-known-good value); a subsequent valid write triggers re-merge normally. (f) Settings edits made by an external tool (probe injects a write through the raw `FileSystem` seam, bypassing any Pi mutation hook) still fire chokidar. (g) A `looms.binderModel` change observed while a binder call is in flight does not swap the model on the in-flight call (cross-checked with V16e's snapshot rule).
- **Deps.** V14n, V18f, V18h.
- **Ships when.** Settings-file edits invalidate the V14n cache, route `looms`-array deltas through the structural-change `loom-system-note`, and absorb malformed intermediate writes without crashing.

## V18h — Custom Pi message type `loom-system-note` and renderer

- **Spec.** [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (system notes), [Diagnostics — renderer registration and fallback](../spec_topics/diagnostics.md).
- **Adds.** `pi.sendMessage({ customType: "loom-system-note", content, display: true, details }, { triggerTurn: false })` for the happy path. Renderer formats as one-line dim entry and is registered via `pi.registerMessageRenderer("loom-system-note", …)` **synchronously inside the extension factory before the first `resources_discover` subscription fires**. On `sendMessage` throw or reject, the runtime falls back in order: (1) `ctx.ui.notify(content, "error")` wrapped in `try`/`catch` (it can throw in print mode); (2) emit `loom/runtime/system-note-delivery-failed` (severity `E`, `message` = original note's `content`, `hint` = underlying `sendMessage` error's `message`) through the standard diagnostics channel; (3) `console.error`. The fallback is single-shot (no retry of `sendMessage`), never aborts the slash handler or subagent session, and the diagnostic step MUST NOT re-invoke `pi.sendMessage` (re-entry guard, gated by an in-flight flag scoped to the fallback path). The `details` field accepts either `{ diagnostics: Diagnostic[] }` or `{ event: RuntimeEvent }` per the disjoint-payload rule in the spec; the runtime-event population path is owned by V18q.
- **Tests.** Note persists in transcript; survives `/tree` navigation; renderer applies dim style. Renderer registration is observable before the first `resources_discover` scan: instrument the `FakeExtensionAPI` to record the order of `registerMessageRenderer` and `subscribe("resources_discover", …)` calls and assert the renderer call precedes the subscription. Inject a `FakeExtensionAPI` whose `sendMessage` throws → assert exactly one `ctx.ui.notify(content, "error")` call with the original `content`. Both `sendMessage` and `notify` throw → assert exactly one `loom/runtime/system-note-delivery-failed` diagnostic with `message` = original `content` and `hint` = `sendMessage` error message. All three (`sendMessage`, `notify`, diagnostics-channel emit) throw → assert exactly one `console.error` call and the slash handler still resolves normally. Re-entry guard: rig the diagnostics channel for `system-note-delivery-failed` to itself route through `loom-system-note` and assert `pi.sendMessage` is invoked exactly once across the whole sequence (no recursion). `ctx.ui.notify` throwing synchronously vs. rejecting asynchronously both route to the diagnostics step.
- **Deps.** H3, H4.
- **Ships when.** System notes have a stable channel and the three-tier delivery fallback is observable end-to-end.

Edge cases the implementer must watch:

- The re-entry guard's in-flight flag is per-fallback-call, not global; concurrent unrelated notes must still each be able to emit their own `system-note-delivery-failed`.
- `ctx.ui.notify` rejection (`Promise<void>` API) and synchronous throw are both observed; the wrapping `try`/`catch` must `await` inside the `try`.
- "Before the first discovery scan" is the first `resources_discover` subscription firing, not the first `LoomRegistry` mutation; in print mode where `ctx.ui` is absent, step 1 is treated as a throw and the chain proceeds to step 2.

## V18i — Per-`kind` formatting for prompt-mode top-level `Err`

- **Spec.** [Invocation from Pi](../spec_topics/slash-invocation.md) (top-level Err in prompt mode table).
- **Adds.** Per-kind system-note formatter; chain identification when leaf failure originated in invoked child (`"... from child.loom invoked at parent.loom:42"`); catch-all formatter for any unlisted `kind`; literal `"respond"` substitution when `last_tool_name` is `null`; recursive descent into `InvokeCalleeError.inner` for chain attribution at any depth. The user-facing top-level `Err` note also populates `details: { event }` with the same `RuntimeEvent` payload V18q emits at the originating site; consumers deduplicate on `(kind, query_site, message, occurrence-timestamp)`.
- **Tests.** Each named `kind` row produces the spec's exact text; an unknown synthetic `kind` (e.g. `"unknown_future"`) renders the catch-all row verbatim including `<kind>` and `<message>`; `tool_loop_exhausted` with `last_tool_name: null` renders the literal string `respond` (not `null`/`undefined`/empty); chain attribution works for a two-level `invoke_callee_error` cascade and recurses through a three-level `invoke_callee_error → invoke_callee_error → leaf` cascade so the descriptive text reflects the leaf `kind` and the suffix prints the full chain `"... from grandchild.loom invoked at child.loom:N from child.loom invoked at parent.loom:M"`; the chain suffix also fires on the catch-all row when an unknown-`kind` failure cascaded from a child.
- **Deps.** V18h.
- **Ships when.** Prompt-mode `Err` surfaces are uniform.

## V18q — Runtime event channel and always-log emission

- **Spec.** [Pi Integration Contract — Runtime event channel](../spec_topics/pi-integration-contract.md), [Query — discarded results](../spec_topics/query.md), [Invocation from Pi](../spec_topics/slash-invocation.md), [Diagnostics](../spec_topics/diagnostics.md).
- **Adds.** A single emission helper invoked at every origin site for the always-log set (`transport`, `code_tool`, `model_tool`, `tool_loop_exhausted`, `invoke_failure`, every binder-failure cause). The helper builds a `RuntimeEvent` payload matching the spec shape (`kind`, optional `code`, `loom`, optional `query_site`, `message`, optional `attempts`, optional `tokens_used`) and calls `pi.sendMessage({ customType: "loom-system-note", content, display, details: { event } }, { triggerTurn: false })`. `display` is `false` when the `Err` is handled / discarded / propagated to a non-top-level frame that handles it, and `true` when the failure cascades out as a top-level `Err` in prompt mode (subagent-mode top-level cascades emit `display: false`). A per-failure-instance dedup key `(kind, query_site, message, occurrence-timestamp)` prevents duplicate emission across `?`-propagation chains: the event fires once at the originating site only. Panic emissions flow through `details: { diagnostics: [...] }`, not `details: { event: ... }`, per spec.
- **Tests.** (a) Each always-log member emits exactly one `display: false` event when its `Err` is handled (matched), discarded (`let _ =`), or `?`-propagated to a frame that handles it; emits exactly one `display: true` event when it cascades to the slash boundary; emits exactly one `display: false` event when it cascades to a subagent-mode boundary. (b) The four excluded kinds (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) produce zero events at the always-log channel. (c) A failure originating at site A and `?`-propagated through frames B → C → D produces one event with `query_site` = A (asserted via injected probe on the channel). (d) An `Ok` discard produces zero events. (e) A typed query that exhausts coercion emits one terminal `validation` event with `attempts` set to the exhausted count, not one event per failed attempt. (f) `RuntimeEvent` payload shape conforms to the spec TypeScript declaration (every required field present, optional fields populated per the spec's per-kind rules). (g) Panic emissions arrive through `details: { diagnostics: [...] }` and never through `details: { event: ... }`. (h) Tool-host emissions are not cross-correlated with `code_tool` / `model_tool` events (asserted by injecting a fake tool host that emits its own diagnostic; the loom runtime event still fires independently).
- **Deps.** V18h, V18i, V5f, V6a, V14f–V14i, V15l, V15m, V16e–V16p.
- **Ships when.** Every always-log origin emits exactly once with the correct `display` flag and conformant `RuntimeEvent` payload, and the four excluded kinds emit nothing.

## V18j — Multi-error rollup across file + transitive `.warp` imports + transitive `.loom` callees

- **Spec.** [Diagnostics](../spec_topics/diagnostics.md) (multi-error reporting), [Invocation — Static resolution](../spec_topics/invocation.md#static-resolution).
- **Adds.** Every parse/type pass collects all errors from a file plus its transitive `.warp` imports plus the transitive `.loom` callees reached by literal `invoke(...)` paths and `tools:` `.loom` entries (one per-load-pass parse cache, per the Static-resolution load pass); one diagnostics call per top-level loom. Reachable-callee diagnostics are surfaced as `loom/load/callee-has-errors` at the parent's referencing site — severity `E` for `tools:` entries, `W` for `invoke(...)` literals — with the callee's own diagnostic codes carried via `related`.
- **Tests.** Loom with 5 distinct parse errors + 1 type error in imported `.warp` produces all 6 in single drain, sorted by `(file, line, col)`. Loom with an `invoke("./broken.loom", ...)` literal where `broken.loom` has 2 parse errors produces a `loom/load/callee-has-errors` warning at the invoke site whose `related` enumerates both callee codes; parent still registers. Loom with a `tools: [./broken.loom]` entry where `broken.loom` has 1 parse error produces a `loom/load/callee-has-errors` error at the `tools:` entry; parent does not register. A callee referenced from both a `tools:` entry and an `invoke(...)` literal in the same parent is parsed once (single cache hit on the second visit).
- **Deps.** H3, V17c, V15a, V15e.
- **Ships when.** Authors get every problem at once across `.warp` imports and `.loom` callees.

## V18k — Runtime panic: array index out of bounds

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (panic sources).
- **Adds.** `arr[i]` with `i < 0` or `i >= length` panics with descriptive message.
- **Tests.** Both bounds; message includes index and length.
- **Deps.** V2d.
- **Ships when.** OOB caught early.

## V18l — Runtime panic: indexed access on `null` / missing key

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (panic sources).
- **Adds.** `null[i]`, `null.field`, `obj["missing"]` panic.
- **Tests.** Each form panics; message identifies the access type.
- **Deps.** V2d.
- **Ships when.** Null/missing-access caught early.

## V18m — Panic routing: slash-command surface

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (panic routing).
- **Adds.** Top-level slash-command/prompt-mode panic produces system note `"loom /<name> aborted: <message>"`. User session not torn down. An unexpected interpreter throw outside the closed V1 panic-source list (a `TypeError` from a host function, an internal invariant violation, an unanticipated SDK reject) is caught at the same top-level wrap and routed to a single `loom-system-note` formatted `"loom /<name> aborted with internal error: <error.message>"` plus exactly one `loom/runtime/internal-error` diagnostic whose `hint` carries `error.stack` (or `"<no stack available>"` when falsy); user session is not torn down.
- **Tests.** `MatchError`, OOB, null-access each route to a system note; user can type follow-up turn after. An unexpected interpreter throw (synthesised by injecting a probe that throws a fresh `TypeError` from inside the body) routes to a single `loom-system-note` whose content matches the `internal-error` template, emits exactly one `loom/runtime/internal-error` diagnostic carrying the stack in `hint`, and leaves the user session live (the user can type a follow-up turn). Panic emission arrives through `details: { diagnostics: [...] }` (per V18q), not through `details: { event: ... }`.
- **Deps.** V7i, V18h, V18k, V18l. (No new dep — the same probe seam V18h uses.)
- **Ships when.** Panics never tear down user session, including unexpected interpreter exceptions.

## V18n — Panic routing: `invoke` parent surface

- **Spec.** [Errors and Results — Runtime panics](../spec_topics/errors-and-results.md), [Invocation — Invocation depth bound, Failures](../spec_topics/invocation.md), [Pi Integration Contract — Subagent session lifecycle](../spec_topics/pi-integration-contract.md).
- **Adds.** Panic in invoked child surfaces to parent as `Err(InvokeInfraError { kind:"invoke_failure", reason:"panic", ... })`. The depth-cap source `loom/runtime/invoke-depth` (per-chain count of 32 across direct `invoke`, registered-loom calls, and `.warp` `fn` invokes) is one of the tested panic sources at this surface. For subagent-mode children, the panic still triggers `AgentSession.dispose()` via the `finally` block, and the parent observes the `Err` only after disposal has run. An unexpected interpreter throw inside the child (outside the closed V1 panic-source list) is caught at the `invoke` boundary and surfaces to the parent as `Err(InvokeInfraError { kind:"invoke_failure", reason:"internal_error", message: <error.message>, ... })`, with one `loom/runtime/internal-error` diagnostic emitted at the child's site before the parent observes the `Err`.
- **Tests.** Each panic source in child becomes parent-side `Err` with `reason:"panic"`, including a synthesized 33-deep `invoke` chain that fires `loom/runtime/invoke-depth` and surfaces as `InvokeInfraError { reason: "panic" }` to the parent and as a top-level system note when the chain originates at the slash boundary; sibling invokes do not share the depth budget (two depth-30 sibling chains both succeed); for subagent-mode children, `AgentSession.dispose()` is invoked exactly once before the parent observes the `Err` (cross-checked with V12a's disposal-on-panic test). An unexpected interpreter throw inside the invoked child (same probe) surfaces to the parent as `Err(InvokeInfraError { kind: "invoke_failure", reason: "internal_error", message: <error.message>, ... })`; exactly one `loom/runtime/internal-error` diagnostic is emitted at the child's site; the parent's `?` / `match` arm runs after the diagnostic. Panic emission arrives through `details: { diagnostics: [...] }` (per V18q), not through `details: { event: ... }`.
- **Deps.** V15l, V18k, V18l, V7i, V12a.
- **Ships when.** `invoke` panic semantics complete and the depth cap is observable on both the top-level and `invoke`-parent surfaces.

## V18o — Per-call timeout marker / coverage-matrix closing gate

- **Spec.** [Cancellation](../spec_topics/cancellation.md) (per-call timeouts deferred), [`../spec.md` Appendix — REQ-ID prefix table](../spec.md), [Conventions — REQ-ID discipline](conventions.md).
- **Adds.** Two acceptance criteria in one closing leaf:
  1. *Per-call timeout marker (no-op confirmation).* Assert that no timeout config is accepted on queries/tools/invokes; any `timeout:` field is `loom/load/unknown-frontmatter-field` warning. (Future feature.)
  2. *Coverage-matrix closing gate.* Every REQ-ID emitted by any spec page (per the Appendix prefix table) maps to at least one closing leaf in [`coverage-matrix.md`](coverage-matrix.md). Implementable as a CI check that diffs the REQ-IDs grepped from `spec_topics/*.md` against the REQ-IDs grepped from `coverage-matrix.md` (e.g. `comm -23 <(grep -roh 'PREFIX-[0-9]\+' spec_topics/) <(grep -roh 'PREFIX-[0-9]\+' plan_topics/coverage-matrix.md)`); any unmapped REQ-ID fails the gate. Pure-narrative pages contribute no REQ-IDs and therefore no rows.
- **Tests.** `timeout:` rejected at frontmatter; per-query/per-call ascription rejected. CI check returns empty diff (every spec REQ-ID has at least one matrix mapping); a synthetic spec edit that introduces an un-mapped REQ-ID flips the check to non-zero.
- **Deps.** V3a; every leaf whose `Tests.` bullets cite the REQ-IDs they implement (the citation pass is editorial and ships incrementally with the leaves themselves).
- **Ships when.** Both criteria observable in CI.

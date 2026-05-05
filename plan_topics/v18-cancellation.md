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

## V18f — File watcher (chokidar) over discovery roots

- **Spec.** [Pi Extension Integration](../spec_topics/pi-integration.md), [Pi Integration Contract — Extension entry point](../spec_topics/pi-integration-contract.md).
- **Adds.** Chokidar watcher over the discovered roots, debounced 250 ms (to coalesce editor `change` + `rename` bursts). On a content edit to an existing `.loom` or `.warp` file the watcher re-parses just the changed file plus every transitive `.warp` importer reached through an in-memory import graph, then atomically swaps the affected entries in the in-process `LoomRegistry`. **No `ctx.reload()` call** for content edits. The slash-command `handler` registered in step 3 closes over `LoomRegistry.dispatch`, which reads the entry once at handler entry; in-flight invocations therefore run against the pre-swap snapshot and the next invocation sees the new version. Structural changes — a brand-new `.loom` file added or an existing one removed, including settings-array changes that add or remove sources — cannot register/unregister a slash command after extension load and instead emit a one-line `loom-system-note` informational message prompting the user to run `/reload`. Tools synthesised from prompt-mode loom callees are re-registered through `pi.registerTool` only when the swap produces a new lowered-schema hash; cached registrations under unchanged hashes are reused.
- **Tests.** Editing the body of an existing `.loom` triggers exactly one re-parse + swap (debounce coalesces a `change` + `rename` burst); the next slash invocation runs the new version while an in-flight invocation completes against the pre-swap snapshot. Editing a `.warp` invalidates every transitive importer (synthetic 3-level import chain). Adding a brand-new `.loom` file emits the structural-change `loom-system-note` and does **not** auto-register; running `/reload` then registers it. Removing an existing `.loom` likewise emits the note and the slash command stays registered until `/reload`. The watcher never calls `ctx.reload()` for content edits (asserted by an injected probe on the `ExtensionContext`). Editing a `.loom` whose `tools:` set contains a prompt-mode loom callee re-uses the existing `pi.registerTool` registration when the lowered schema hash is unchanged; a hash change triggers exactly one new `pi.registerTool` call.
- **Deps.** V14k–p.
- **Ships when.** Edits to existing files take effect without a session restart, structural changes prompt for `/reload`, and `ctx.reload()` is never called for content edits.

## V18g — AJV cache invalidation on file change

- **Spec.** [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime), [Pi Integration Contract — Extension entry point, Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md).
- **Adds.** AJV cache invalidation **collapses into the V18f `LoomRegistry` swap**: dropping the changed file's compiled-validator entry (and entries for every transitive `.warp` importer) is part of the swap, not a separate watcher-driven path. The validator-cache key remains the lowered-schema hash, so a re-parse that produces an identical lowered schema reuses cached validators across reload (no false eviction). The per-extension tool-registration cache (`Map<schema-hash, registeredToolName>`) is **not** cleared on content edits — it lives for the extension instance lifetime, and only `/reload` (which actually re-runs the factory) recreates it empty.
- **Tests.** Schema edit drops the matching cache entry as part of the swap (asserted by injecting a probe on the validator service); next query recompiles; non-changed files retain cache hit; a re-parse producing an identical lowered schema reuses the cached validator (no recompile observed); the tool-registration cache survives a content-edit swap (cached registrations are reused) and is empty only after a real `/reload`.
- **Deps.** V18f, V4a.
- **Ships when.** Cache stays consistent under live edits and the registration cache lifetime matches the extension-instance lifetime.

## V18h — Custom Pi message type `loom-system-note` and renderer

- **Spec.** [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (system notes).
- **Adds.** `pi.sendMessage({ customType: "loom-system-note", content, display: true, details }, { triggerTurn: false })`. Renderer formats as one-line dim entry.
- **Tests.** Note persists in transcript; survives `/tree` navigation; renderer applies dim style.
- **Deps.** H4.
- **Ships when.** System notes have a stable channel.

## V18i — Per-`kind` formatting for prompt-mode top-level `Err`

- **Spec.** [Invocation from Pi](../spec_topics/slash-invocation.md) (top-level Err in prompt mode table).
- **Adds.** Per-kind system-note formatter; chain identification when leaf failure originated in invoked child (`"... from child.loom invoked at parent.loom:42"`).
- **Tests.** Each `kind` row produces the spec's exact text; chain attribution works for two-level cascade.
- **Deps.** V18h.
- **Ships when.** Prompt-mode `Err` surfaces are uniform.

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
- **Adds.** Top-level slash-command/prompt-mode panic produces system note `"loom /<name> aborted: <message>"`. User session not torn down.
- **Tests.** `MatchError`, OOB, null-access each route to a system note; user can type follow-up turn after.
- **Deps.** V7i, V18h, V18k, V18l.
- **Ships when.** Panics never tear down user session.

## V18n — Panic routing: `invoke` parent surface

- **Spec.** [Errors and Results — Runtime panics](../spec_topics/errors-and-results.md), [Invocation — Invocation depth bound, Failures](../spec_topics/invocation.md), [Pi Integration Contract — Subagent session lifecycle](../spec_topics/pi-integration-contract.md).
- **Adds.** Panic in invoked child surfaces to parent as `Err(InvokeInfraError { kind:"invoke_failure", reason:"panic", ... })`. The depth-cap source `loom/runtime/invoke-depth` (per-chain count of 32 across direct `invoke`, registered-loom calls, and `.warp` `fn` invokes) is one of the tested panic sources at this surface. For subagent-mode children, the panic still triggers `AgentSession.dispose()` via the `finally` block, and the parent observes the `Err` only after disposal has run.
- **Tests.** Each panic source in child becomes parent-side `Err` with `reason:"panic"`, including a synthesized 33-deep `invoke` chain that fires `loom/runtime/invoke-depth` and surfaces as `InvokeInfraError { reason: "panic" }` to the parent and as a top-level system note when the chain originates at the slash boundary; sibling invokes do not share the depth budget (two depth-30 sibling chains both succeed); for subagent-mode children, `AgentSession.dispose()` is invoked exactly once before the parent observes the `Err` (cross-checked with V12a's disposal-on-panic test).
- **Deps.** V15l, V18k, V18l, V7i, V12a.
- **Ships when.** `invoke` panic semantics complete and the depth cap is observable on both the top-level and `invoke`-parent surfaces.

## V18o — Per-call timeout marker

- **Spec.** [Cancellation](../spec_topics/cancellation.md) (per-call timeouts deferred).
- **Adds.** This leaf is a *no-op confirmation*: assert that no timeout config is accepted on queries/tools/invokes; any `timeout:` field is `loom/load/unknown-frontmatter-field` warning. (Future feature.)
- **Tests.** `timeout:` rejected at frontmatter; per-query/per-call ascription rejected.
- **Deps.** V3a.
- **Ships when.** Spec-mandated absence is enforced.

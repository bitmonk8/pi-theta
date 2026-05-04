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
- **Tests.** Pre-flight abort: tool never invoked; mid-flight abort: `ToolCallError{cause:"cancelled"}`.
- **Deps.** V14c.
- **Ships when.** Tool calls cancellable.

## V18d — `AbortSignal` before every `invoke`

- **Spec.** [Cancellation](../spec_topics/cancellation.md).
- **Adds.** Pre-invoke check; child inherits derived signal from caller.
- **Tests.** Pre-flight abort: child never spawned; mid-flight abort: `Err({kind:"cancelled"})` or `InvokeCalleeError{inner:cancelled}` per origin.
- **Deps.** V15a.
- **Ships when.** Invokes cancellable.

## V18e — Cancellation propagates downward only

- **Spec.** [Cancellation](../spec_topics/cancellation.md) (propagation).
- **Adds.** Parent cancellation fires child's signal; child cancellation does not fire parent's signal — surfaces as `Err`.
- **Tests.** Parent abort cancels child mid-execution; child internal cancel surfaces as `InvokeCalleeError{inner:cancelled}` to parent without aborting parent.
- **Deps.** V18b, V18c, V18d.
- **Ships when.** Direction rule enforced.

## V18f — File watcher (chokidar) over discovery roots

- **Spec.** [Pi Extension Integration](../spec_topics/pi-integration.md), [Pi Integration Contract](../spec_topics/pi-integration-contract.md).
- **Adds.** Watch every directory found by discovery; on change call `ctx.reload()` via `_loom-reload` command.
- **Tests.** Add/modify/remove `.loom` triggers reload; debounced (multiple changes within window → one reload); add/modify `.warp` invalidates importing looms.
- **Deps.** V14k–p.
- **Ships when.** Edits take effect without session restart.

## V18g — AJV cache invalidation on file change

- **Spec.** [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime) (schema-validation contract; cache invalidation as a property of the validator service).
- **Adds.** File-watcher event invalidates compiled-schema cache for the changed file and any transitive importer.
- **Tests.** Schema edit invalidates cache key; next query recompiles; non-changed files retain cache hit.
- **Deps.** V18f, V4a.
- **Ships when.** Cache stays consistent under live edits.

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

## V18j — Multi-error rollup across file + transitive `.warp` imports

- **Spec.** [Diagnostics](../spec_topics/diagnostics.md) (multi-error reporting).
- **Adds.** Every parse/type pass collects all errors from a file plus its transitive `.warp` imports before failing; one diagnostics call.
- **Tests.** Loom with 5 distinct parse errors + 1 type error in imported `.warp` produces all 6 in single drain, sorted by `(file, line, col)`.
- **Deps.** H3, V17c.
- **Ships when.** Authors get every problem at once.

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

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (panic routing), [Invocation](../spec_topics/invocation.md).
- **Adds.** Panic in invoked child surfaces to parent as `Err({kind:"invoke_failure", reason:"panic", ...})`.
- **Tests.** Each panic source in child becomes parent-side `Err` with `reason:"panic"`.
- **Deps.** V15l, V18k, V18l, V7i.
- **Ships when.** `invoke` panic semantics complete.

## V18o — Per-call timeout marker

- **Spec.** [Cancellation](../spec_topics/cancellation.md) (per-call timeouts deferred).
- **Adds.** This leaf is a *no-op confirmation*: assert that no timeout config is accepted on queries/tools/invokes; any `timeout:` field is `loom/load/unknown-frontmatter-field` warning. (Future feature.)
- **Tests.** `timeout:` rejected at frontmatter; per-query/per-call ascription rejected.
- **Deps.** V3a.
- **Ships when.** Spec-mandated absence is enforced.

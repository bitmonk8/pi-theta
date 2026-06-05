# Extension bootstrap and per loom

**Extension-bootstrap SDK failures.** A throw or rejection from any of the registration calls in steps 1–5 above is fatal at the granularity of the failing surface; the granularity rule is per call type, not per call site:

- **`pi.registerMessageRenderer` failure (factory-time, step 0 having succeeded so the capability is present but the call itself rejects).** The renderer registration is dropped; the extension factory still completes the remaining steps. System notes for this extension instance permanently degrade to the `ctx.ui.notify` arm of the **System notes** fallback chain below (the persistent-transcript surface is unavailable; the transient toast and the `console.error` last-resort arms remain). The runtime emits `loom/load/extension-bootstrap-failed` (E, load) with `details: { capability: "pi.registerMessageRenderer", error: <error.message> }` and proceeds.
- **`pi.registerCommand` failure (factory-time *or* `session_start`-time, per-loom).** Only the loom whose registration call failed is dropped; sibling looms in the pending registration list still register through their own `pi.registerCommand` calls. The runtime emits one `loom/load/extension-bootstrap-failed` (E, load) per failing loom with `details: { capability: "pi.registerCommand", loom: <slash-name>, error: <error.message> }`. The factory does not re-attempt the failing call within the same factory invocation; a `/reload` is the recovery path.
- **`pi.registerFlag` failure (factory-time, step 1).** Fatal to the whole extension because step 1's `--loom` flag value is what step 1's discovery walk and every subsequent `resources_discover` re-walk consume via `pi.getFlag('loom')`; a flag-less factory cannot honour the `--loom` source. The factory skips every subsequent `pi.register*` and `pi.on` call (steps 2–5 do not execute, mirroring the step-0 failure semantics) and emits a single `loom/load/extension-bootstrap-failed` (E, load) with `details: { capability: "pi.registerFlag", error: <error.message> }`.

The `loom/load/extension-bootstrap-failed` diagnostic routes through the same channel that step 0's `loom/load/host-incompatible` uses (the **System notes** fallback chain — `sendSystemNote` → `ctx.ui.notify` → `console.error`), because the renderer may itself have failed. The factory MUST NOT throw out of `default function (pi: ExtensionAPI)`; per-call `try`/`catch` around each step keeps the failure local to its granularity rule above. None of these three rules apply to the step-0 capability probe — a missing capability is `loom/load/host-incompatible` and stops the factory before it ever attempts a `pi.register*` call. `pi.registerTool` failures at factory time are governed by the prompt-mode registration cache rule under **Tool-registration lifetime and visibility** below; this paragraph does not duplicate that rule.

<a id="renderer-registration"></a>

**Renderer registration (`pi.registerMessageRenderer`).** The pinned signature, lifecycle, and ownership rules below are normative for the loom extension. The canonical Pi-side declarations live at `dist/core/extensions/types.d.ts` in `@earendil-works/pi-coding-agent` (the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) from **Host prerequisites** above) and the `Component` interface lives at `@earendil-works/pi-tui`'s `dist/tui.d.ts`; the inline shapes below are the loom-load-bearing subset and MUST be re-validated against those files on each Pi minor bump (per the re-validating obligation in **Host prerequisites** above). The loader-`Map` overwrite semantics narrated under *Re-registration within an extension* (`dist/core/extensions/loader.js`) and the runner's first-hit `getMessageRenderer` iteration narrated under *`customType` ownership and collision rule* (`dist/core/extensions/runner.js`) below are likewise **known-fragile evidence** at the loom 1.0 pin — diffable witnesses of the overwrite-last-wins and first-loaded-wins behaviour, not load-bearing claims about the bundled symbols' stable shape across patches; that behaviour is re-audited on each Pi minor bump via [item (q) of the *Editorial-review checklist for unpinned host presuppositions*](./version-bump-step2.md#bump-checklist-pre-bind-and-renderer-resolution) under [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below.

*Signature.* The Pi-side surface at the loom 1.0 pin — the loom-load-bearing subset to be re-validated against `dist/core/extensions/types.d.ts` per the section preamble above, not a loom-owned verbatim contract (a future Pi rename of these members makes the inline shape stale and is caught at the next re-validation, rather than making the spec wrong):

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

The `Component` return type is the `pi-tui` widget interface (`{ render(width: number): string[]; handleInput?(...): void; invalidate(): void; ... }`), **not** a string and **not** a React node. A renderer body of the form `(message) => message.content` is therefore a type error that silently leaves the channel unrendered — the loom renderer MUST construct a `pi-tui` `Component` instance (e.g. a text component composed from the `theme` parameter) and return it. Returning `undefined` is legal and tells Pi to skip rendering this message; the loom 1.0 loom renderer uses `undefined` only when `display === false` (see **Empty `content` is legal** in [Runtime event channel](./runtime-event-channel.md) below).

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

**Per-loom registration.** For each `.loom` file:

- The slash-command `handler` runs the binder (when applicable) and then the loom interpreter against the appropriate conversation.
- When a loom is referenced by another loom's `tools:` (i.e., exposed as a tool to a model), the runtime materialises a Pi `ToolDefinition` for it. *How* that definition reaches the model depends on the calling loom's mode and is specified in **Tool-registration lifetime and visibility** below; the *shape* of the definition is mode-independent and is specified here. All five fields (`name`, `label`, `description`, `parameters`, `execute`) are required by Pi's `ToolDefinition` interface. *Non-normative implementation note.* loom 1.0 expects the runtime to construct the definition through `defineTool(...)` (exported from `@earendil-works/pi-coding-agent`) rather than a bare object literal, so TypeBox's generic inference on `parameters` is preserved when the resulting value is spread into a `customTools: ToolDefinition[]` array (subagent path) or passed to `pi.registerTool` (prompt-mode path); the construction-helper choice is a maintainability convention, not an observable conformance point. Field derivations:
    - `name` — the loom's registered tool name from its frontmatter / discovery (per [Directory Convention](../discovery.md)).
    - `label` — the loom file's basename with hyphens preserved and the leading character capitalised: `summarise.loom` → `"Summarise"`, `code-review.loom` → `"Code-Review"`. For the synthesised typed-query one-shot tool described in [Implementation Notes — Runtime](../implementation-notes.md#runtime) the label is the literal string `"Loom typed-query response"`.
    - `description` — the loom's frontmatter `description`.
    - `parameters` — a TypeBox `TSchema`, **not** a raw JSON Schema document. The lowered JSON Schema artefact produced by [Schema Subset — Lowering Algorithm](../schema-subset.md#lowering-algorithm) is wrapped via `Type.Unsafe<unknown>(loweredJsonSchema)` (imported from the `typebox` peer dependency declared in `package.json`; the presence of `Type.Unsafe` as a callable function is the load-bearing host-shape precondition checked at extension-factory entry by **Step 0 (e)** above, so a missing or renamed member surfaces as `loom/load/host-incompatible` with `details.kind = "typebox-shape"` rather than as a runtime-time `TypeError` at this call site) before being handed to `pi.registerTool`. The `Type.Unsafe` wrapper exists solely to satisfy Pi's structural type and to let TypeBox carry the JSON Schema through to the provider lowering layer; `Static<…>` is unused at runtime. Because the wrap is `Type.Unsafe<unknown>`, the `params` argument observed inside `execute` is effectively `unknown`, so the adapter MUST AJV-validate `params` against the original lowered JSON Schema before forwarding — Pi's structural typing offers no guarantees here. The optional `prepareArguments?: (args: unknown) => Static<TParams>` hook on `ToolDefinition` is the documented site for argument shaping in Pi's `ToolDefinition` contract; loom's respond-repair flow instead operates at the response-validation boundary (see [Query — Schema-validation respond-repair](../query.md)) rather than at this per-call argument boundary.
    - `execute` — the adapter that spawns the loom as a subagent invocation (equivalent to `invoke<T>(path, ...)`) and returns its result envelope.

    The adapter is **re-entrant**: when the model emits parallel tool calls (Pi's parallel-tool-mode behaviour, see [Tool Calls — Concurrency](../tool-calls.md)) targeting the same `.loom` callable, two concurrent calls into the same `execute` adapter spawn two independent subagent invocations on the event loop. Adapter implementations MUST NOT serialise calls on shared closure state.

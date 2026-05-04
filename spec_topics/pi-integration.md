# Pi Extension Integration

`pi-loom` registers with Pi Agent as an extension in the standard way, providing:

- **Slash-command discovery** of `.loom` files — each loom appears in autocomplete as `/<filename>` (without `.loom`), exactly mirroring Pi's prompt-template behaviour. The `description` and `argument-hint` from frontmatter populate the autocomplete entry. `.warp` files are deliberately *excluded* from slash-command discovery; they are library code, never commands. Three of the five discovery sources — the `pi.looms` package-manifest entry, the `looms` settings array, and the `--loom` CLI flag — are conventions defined by **this extension**, not Pi: Pi's `resources_discover` event has no `loomPaths` slot, the `pi` manifest namespace does not enumerate `pi.looms`, and `--loom` is a flag the extension registers itself in its factory. The extension reads each of these channels directly. Full discovery rules and package-walk semantics are in [Directory Convention](./discovery.md).
- A **file watcher** (optional) so edits to `.loom` and `.warp` files take effect without a session restart.
- **Parse-time:** schema lowering and structural subset checks (per [Schema Subset — Lowering Algorithm](./schema-subset.md#lowering-algorithm)) surface as parse diagnostics with Pi-compatible codes (per [Diagnostics](./diagnostics.md)).
- **Runtime:** AJV validation of model responses (typed `@`-queries), bound slash-command args, `invoke<Schema>` return values, and tool input/output surfaces through `QueryError` / `ToolCallError` / `InvokeFailure` and the system-note channel — never as parse diagnostics.

Detailed sub-topics:

- [Directory Convention](./discovery.md) — discovery sources, priority, collision rules.
- [Invocation from Pi](./slash-invocation.md) — how a slash command runs, prompt-mode `Err` surfacing.
- [Slash-Command Argument Binding](./binder.md) — LLM-driven binding of slash arguments to typed `params`.
- [Cancellation](./cancellation.md) — `AbortSignal` propagation and surfacing.
- [Diagnostics](./diagnostics.md) — diagnostic shape, codes, and serialisation.
- [Pi Integration Contract](./pi-integration-contract.md) — the Pi SDK surface the runtime depends on.

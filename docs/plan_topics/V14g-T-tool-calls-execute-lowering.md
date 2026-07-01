# `V14g-T` — Code-side `execute()` envelope-lowering (runtime surface) (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md#tool-execution-from-loom-code) §*Tool execution from loom code*; [`../spec_topics/cancellation.md`](../spec_topics/cancellation.md) §*Granularity*.

**Adds.** Failing tests for the paired `V14g` implementation leaf.

**Tests.**
- [host-interfaces-core.md — *Tool execution from loom code*](../spec_topics/pi-integration-contract/host-interfaces-core.md#tool-execution-from-loom-code) (un-anchored; GOV-22 residue): the accepted-path `execute()` envelope-lowering mechanics, on the post-F-1578 `AgentToolResult` shape (the code-side return type carries **no** `isError` field; loom reads only `content`, so a cleanly-resolving envelope always lowers to `Ok` and the only code-side `CodeToolError { cause: "execution" }` path is the `execute()` throw) — (1) `content` is filtered to `type === "text"` entries and their `.text` values joined with a single `"\n"` (no separator before the first or after the last block); non-text blocks are discarded with **no** `RuntimeEvent` / `loom-system-note` / diagnostic on the discard path; (2) an empty result (`content: []` or no surviving text blocks) lowers to `Ok("")` with no diagnostic; (3) an `execute()` throw lowers to `Err(CodeToolError { cause: "execution", message: <m>, tool_name, ... })` whose `<m>` is the thrown value coerced to the underlying-error string and truncated to at most 4096 bytes on a Unicode code-point boundary (a code point that would straddle the limit is dropped entirely; result MAY be up to three bytes short). (The non-conforming-shape / non-settling-Promise dispositions routed off `CodeToolError` are owned by `V14c`, not asserted here.)

- Checkpoint before tool call ([cancellation.md — *Granularity*](../spec_topics/cancellation.md), [`coverage-matrix.md`](./coverage-matrix.md) code-keyed-area token `cka-47`, `V14g` facet — the tool-call checkpoint site distributed off [`V17c`](./V17c-checkpoint-granularity.md); testability hook: the [`V8a`](./V8a-checkpoint-validator-seams.md) `Checkpoint` seam, [`host-interfaces-services.md#checkpoint-seam`](../spec_topics/pi-integration-contract/host-interfaces-services.md#checkpoint-seam)): drive the seam to assert a cancellation checkpoint fires immediately before each code-side `<name>(args)` tool call on the live execution surface.

- `ERR-13` (delegated live-carrier witness for `V4f`'s completed-callee-finality deferral): a code-side tool call driven to completion on the live execution surface, then a downstream `?`/panic/cancel fired, leaves the completed callee's side effect in place with no compensating turn injected. These live surfaces are loom-runtime-internal, so this witness is `npm test`-assertable (no real-host-only smoke gate).

**Deps.** `V14a`, `V15a`, `V9f`, `V8a`, `V4f`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

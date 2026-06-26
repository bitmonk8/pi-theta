# `V15a-T` — Invocation core (tests)

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`../spec_topics/return.md`](../spec_topics/return.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** Failing tests for the paired `V15a` implementation leaf.

**Tests.**
- `INV-1`: load-time and invocation-time re-checks use identical `realpath` + segment-boundary containment; an escape surfaces on both channels (diagnostic + `InvokeInfraError{load_failure}`).
- `INV-2`: the AST arg list carries `style:"positional"|"named"`; only positional is defined in 1.0.
- `INV-3`: the invoke-options record is an open struct (additive per-call-timeout seam).
- [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) (IMPL area), via [invocation.md — Static resolution](../spec_topics/invocation.md#static-resolution): the static-resolution pass walks transitively from the entry loom across literal `invoke` paths and `.loom` `tools:` entries, parsing and lowering each visited file exactly once into the static-resolution per-pass parse cache.
- [return.md — final-value contract](../spec_topics/return.md) (RET code-keyed area), against the function-result seam `V3d` defines: the callee's produced final value propagates to the `invoke` caller on success and is absent on fail/cancel.
- [invocation.md — cross-mode matrix](../spec_topics/invocation.md) (INV area): the cross-mode matrix selects fresh-vs-attach by callee mode and a child uses its own model/tools/system. (The prompt→prompt parent-suspend facet is owned by `V15d`.)

- Checkpoint before `invoke` ([cancellation.md — *Granularity*](../spec_topics/cancellation.md), [`coverage-matrix.md`](./coverage-matrix.md) code-keyed-area token `cka-47`, `V15a` facet — the `invoke` checkpoint site distributed off [`V17c`](./V17c-checkpoint-granularity.md); testability hook: the [`V8a`](./V8a-checkpoint-validator-seams.md) `Checkpoint` seam, [`host-interfaces-services.md#checkpoint-seam`](../spec_topics/pi-integration-contract/host-interfaces-services.md#checkpoint-seam)): drive the seam to assert a cancellation checkpoint fires immediately before each `invoke` on the live `V15a` surface.

- `ERR-13` (delegated live-carrier witness for `V4f`'s completed-callee-finality deferral): an `invoke` child driven to completion on the live `V15a` surface, then a downstream `?`/panic/cancel fired, leaves the completed callee's side effect in place with no compensating turn injected. These live surfaces are loom-runtime-internal, so this witness is `npm test`-assertable (no real-host-only smoke gate).

**Deps.** `V10a`, `V2b`, `V3d`, `V8a`, `V8b`, `V4f`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

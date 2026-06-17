# `V15a` — Invocation core

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`../spec_topics/return.md`](../spec_topics/return.md), [`../spec_topics/implementation-notes.md`](../spec_topics/implementation-notes.md).

**Adds.** The `invoke(...)` core: path + `realpath` discovery-root containment (load-time and invocation-time), the static-resolution per-pass parse cache and its transitive parse/lower walk, and the fresh-vs-attach cross-mode matrix selection, propagating the callee's produced final value to the `invoke` caller on success (absent on fail/cancel). The post-`realpath` parent loom path this leaf captures for discovery-root containment is the same value the per-frame invocation-record provenance seam consumes. The prompt→prompt parent-suspend with the `setActiveTools` snapshot/restore is owned by [`V15d`](./V15d-prompt-suspend-snapshot.md); the six `invoke` parse/load diagnostic codes by [`V15f`](./V15f-invoke-diagnostics.md); the per-`invoke`-hop invocation-record provenance seam by [`V15g`](./V15g-invoke-provenance.md); and the ceiling-#4 depth surfaces and `invoke`-child swallowing-handler suppression by [`V15h`](./V15h-invoke-ceiling-swallowing.md).

**Tests.**
- `INV-1`: load-time and invocation-time re-checks use identical `realpath` + segment-boundary containment; an escape surfaces on both channels (diagnostic + `InvokeInfraError{load_failure}`).
- `INV-2`: the AST arg list carries `style:"positional"|"named"`; only positional is defined in 1.0.
- `INV-3`: the invoke-options record is an open struct (additive per-call-timeout seam).
- [implementation-notes.md — Static-resolution load pass](../spec_topics/implementation-notes.md) (IMPL area), via [invocation.md — Static resolution](../spec_topics/invocation.md#static-resolution): the static-resolution pass walks transitively from the entry loom across literal `invoke` paths and `.loom` `tools:` entries, parsing and lowering each visited file exactly once into the static-resolution per-pass parse cache.
- [return.md — final-value contract](../spec_topics/return.md) (RET code-keyed area), against the function-result seam `V3d` defines: the callee's produced final value propagates to the `invoke` caller on success and is absent on fail/cancel.
- [invocation.md — cross-mode matrix](../spec_topics/invocation.md) (INV area): the cross-mode matrix selects fresh-vs-attach by callee mode and a child uses its own model/tools/system. (The prompt→prompt parent-suspend facet of the matrix is owned by [`V15d`](./V15d-prompt-suspend-snapshot.md).)

**Deps.** `V15a-T`, `V10a`, `V2b`, `V3d`, `V8b`

**Ships when.** `npm test` resolves and spawns an invoke across the fresh-vs-attach cross-mode matrix, asserts `INV-1` load-time and invocation-time `realpath` containment on both channels (diagnostic + `InvokeInfraError{load_failure}`), drives the static-resolution per-pass parse cache's transitive walk over a multi-file entry loom (each visited file parsed and lowered exactly once), and asserts the callee's produced final value propagates to the `invoke` caller on success and is absent on fail/cancel.

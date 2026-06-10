# `V15a` — Invocation core

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md).

**Adds.** The `invoke(...)` core: path + `realpath` discovery-root containment (load-time and invocation-time), the static-resolution parse cache, the `invoke<T>` return-type check, the cross-mode matrix, and the prompt→prompt parent-suspend with the `setActiveTools` snapshot/restore.

**Tests.**
- `INV-1`: load-time and invocation-time re-checks use identical `realpath` + segment-boundary containment; an escape surfaces on both channels (diagnostic + `InvokeInfraError{load_failure}`).
- `INV-2`: the AST arg list carries `style:"positional"|"named"`; only positional is defined in 1.0.
- `INV-3`: the invoke-options record is an open struct (additive per-call-timeout seam).
- [invocation.md — cross-mode matrix](../spec_topics/invocation.md) (INV area): the cross-mode matrix selects fresh-vs-attach by callee mode; a child uses its own model/tools/system; prompt→prompt suspends the parent.

**Deps.** `V15a-T`, `V10a`, `V2b`, `V3d`

**Ships when.** `npm test` resolves and spawns an invoke across the cross-mode matrix and asserts `INV-1` containment on both channels.

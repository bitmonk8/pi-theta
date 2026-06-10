# `V11a` — Binder-model resolution and strict-capability probe

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder.md`](../spec_topics/binder.md).

**Adds.** The two-step binder-model resolution via `findExactModelReferenceMatch` (no `model:` fallback) and the three-valued `strictCapable` probe, with the per-loom-load verification and the hot-reload recovery note.

**Tests.**
- `loom/load/binder-model-unresolved` fires when no exact model reference matches.
- The `strictCapable` probe: `false` → `loom/load/binder-model-not-strict-capable` (E); `undefined` → `binder-model-strict-capability-unknown` (W); `true` → resolves.
- [binder-model-and-context.md — hot-reload recovery note](../spec_topics/binder/binder-model-and-context.md#binder-model-hot-reload) (BNDR area; informational `loom-system-note`, no `loom/load/*` code): a hot reload that recovers a previously-unresolved model emits the recovery note.

**Deps.** `V11a-T`, `V9b`, `V10c`

**Ships when.** `npm test` asserts the resolution chain and the three strict-capability outcomes.

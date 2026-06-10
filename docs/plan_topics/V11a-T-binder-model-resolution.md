# `V11a-T` — Binder-model resolution and strict-capability probe (tests)

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder.md`](../spec_topics/binder.md).

**Adds.** Failing tests for the paired `V11a` implementation leaf.

**Tests.**
- `loom/load/binder-model-unresolved` fires when no exact model reference matches.
- The `strictCapable` probe: `false` → `loom/load/binder-model-not-strict-capable` (E); `undefined` → `binder-model-strict-capability-unknown` (W); `true` → resolves.
- [binder-model-and-context.md — hot-reload recovery note](../spec_topics/binder/binder-model-and-context.md#binder-model-hot-reload) (BNDR area; informational `loom-system-note`, no `loom/load/*` code): a hot reload that recovers a previously-unresolved model emits the recovery note.

**Deps.** `V9b`, `V10c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

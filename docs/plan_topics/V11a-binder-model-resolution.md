# `V11a` — Binder-model resolution and strict-capability probe

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder.md`](../spec_topics/binder.md).

**Adds.** The two-step binder-model resolution via loom's own exact-match resolver over `ctx.modelRegistry.getAvailable()` (no `model:` fallback) and the three-valued `strictCapable` probe, with the per-loom-load verification and the hot-reload recovery note. This resolution — loom's own exact-match resolver run over `ctx.modelRegistry.getAvailable()`, accepting a canonical `provider/modelId` reference or a bare `modelId` and treating a bare `modelId` matching models under more than one provider as ambiguous (resolving to no model, not pick-first) — is the shared model-reference-matcher contract that [`V6a`](./V6a-frontmatter-contract.md)'s load-time `model:` resolution also binds through the injection seam `V6a` defines, so the two paths cannot diverge on the "reference matches no available model" condition; the concrete matcher is constructed and injected into the parser at the load pass by [`V9b`](./V9b-registration-reload-wiring.md).

**Tests.**
- `loom/load/binder-model-unresolved` fires when no exact model reference matches.
- The `strictCapable` probe: `false` → `loom/load/binder-model-not-strict-capable` (E); `undefined` → `loom/load/binder-model-strict-capability-unknown` (W); `true` → resolves.
- The binder-model two-step chain ([binder-model](../spec_topics/binder/binder-model-and-context.md#binder-model)) falls back to `looms.binderModel`: with merged settings `looms.binderModel` set and a non-bypass loom whose frontmatter `bind_model:` is omitted, the merged `binderModel` value resolves the binder model (no `loom/load/binder-model-unresolved`) — asserting the value reaches the binder from `V10c`'s merged settings, not a hardcoded model.
- [binder-model-and-context.md — hot-reload recovery note](../spec_topics/binder/binder-model-and-context.md#binder-model-hot-reload) (BNDR area; informational `loom-system-note`, no `loom/load/*` code): a hot reload that recovers a previously-unresolved model emits the recovery note.
- single-matcher cross-resolution reconciliation ([`host-interfaces-core.md` model-registry surface](../spec_topics/pi-integration-contract/host-interfaces-core.md#model-registry-pin)): the matcher instance [`V9b`](./V9b-registration-reload-wiring.md) constructs and injects at the load pass is the same instance servicing both `V6a`'s `loom/load/model-unresolved` resolution and this leaf's binder-model resolution — observed by single-source-of-construction (instance identity), not equivalence-of-outcome against a shared fake — so the two paths cannot diverge on the "reference matches no available model" condition.

**Deps.** `V11a-T`, `V9b`, `V10c`

**Ships when.** `npm test` asserts the resolution chain, the three strict-capability outcomes, and that `V6a`'s `loom/load/model-unresolved` resolution and this leaf's binder-model resolution bind the single matcher instance `V9b` constructs (instance identity, not equivalence-of-outcome).

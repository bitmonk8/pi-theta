# `V5e-T` — JSON document depth enforcement (hard ceiling #4) (tests)

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** Failing tests for the paired `V5e` implementation leaf.

**Tests.**
- A materialised value of depth 6, driven through the loom-owned depth walk in isolation against the harness — mirroring `V16a`'s seam pattern, where the decision is exercised directly and the live AJV-boundary sites are built downstream — fires `schema_keyword:"maxDepth"`, message `"JSON document depth exceeds 5"`, `cause:"schema_validation"`.
- Per-boundary routing *decision* — which of the five site-classes maps to which destination surface class: typed-query response → `ValidationError`, model-driven tool args → model feedback, code-driven tool args → `CodeToolError`, `params` and `invoke<T>` return → `InvokeInfraError`, slash-load `params` → ceiling-#3 cross-route — asserted in isolation against the harness. The actual wrapping of a depth-6 breach into each carrier is asserted at the site owner: `ValidationError` at `V13c`, `CodeToolError` at `V14e`, `InvokeInfraError` at `V15a`, the slash-load cross-route at `V4e`. The model-driven and slash-load `params` rows produce no loom-code `Err` (model feedback / load-time respectively) and are decision-only here.
- The walk runs before AJV; respond-repair applies only at site #1.

**Deps.** `V5d`, `V16a`, `V4d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

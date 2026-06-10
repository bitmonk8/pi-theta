# `V5e-T` — JSON document depth enforcement (hard ceiling #4) (tests)

**Spec.** [`../spec_topics/schema-subset.md`](../spec_topics/schema-subset.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** Failing tests for the paired `V5e` implementation leaf.

**Tests.**
- A materialised value of depth 6 fires `schema_keyword:"maxDepth"`, message `"JSON document depth exceeds 5"`, `cause:"schema_validation"`, at each of the five sites (typed-query response, model-driven tool args, code-driven tool args, `params`, `invoke<T>` return).
- Per-boundary routing maps each site to its surface (`ValidationError` / model feedback / `CodeToolError` / `InvokeInfraError` / slash-load cross-route to ceiling #3).
- The walk runs before AJV; respond-repair applies only at site #1.

**Deps.** `V5d`, `V16a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

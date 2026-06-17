# `V2e-T` — Wire-name translation boundary (tests)

**Spec.** [`../spec_topics/runtime-value-model.md`](../spec_topics/runtime-value-model.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** Failing tests for the paired `V2e` implementation leaf.

**Tests.**
- [runtime-value-model.md — Wire-name translation](../spec_topics/runtime-value-model.md) (RVM code-keyed area): inbound translation rebuilds loom-side names so loom code never sees wire names; defaults bypass inbound translation.

**Deps.** `V2a`, `V5f`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

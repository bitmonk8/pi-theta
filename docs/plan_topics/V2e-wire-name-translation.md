# `V2e` — Wire-name translation boundary

**Spec.** [`../spec_topics/runtime-value-model.md`](../spec_topics/runtime-value-model.md), [`../spec_topics/schemas.md`](../spec_topics/schemas.md).

**Adds.** The inbound/outbound wire-name translation boundary (post-AJV loom-side rebuild with enum-tag reattach via the `V5f`-produced per-schema sidecar; outbound wire-name JSON).

**Tests.**
- [runtime-value-model.md — Wire-name translation](../spec_topics/runtime-value-model.md) (RVM code-keyed area): inbound translation rebuilds loom-side names so loom code never sees wire names; defaults bypass inbound translation.

**Deps.** `V2e-T`, `V2a`, `V5f`

**Ships when.** `npm test` asserts the wire-translation vectors above.

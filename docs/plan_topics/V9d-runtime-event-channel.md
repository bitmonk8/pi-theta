# `V9d` — Runtime-event channel and `masked` co-fire

**Spec.** [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md), [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md).

**Adds.** The single `sendMessage` runtime-event shape (four `details` variants, group-A/B routing, dedup tuple, `display`/`content` matrix), the always-log set with the success-side null-policy, and the `masked` co-fire field.

**Tests.**
- `PIC-1`: `masked` carries a closed id set, is omitted (not `[]`) when empty, has the per-site reachable domain (only `["ceiling#2"]` on a typed-query response in V1), is a pure read, and is cascade-copied verbatim with non-inclusion under dedup.
- Each always-log kind emits exactly once; the success side honours the null-policy.

**Deps.** `V9d-T`, `V7a`

**Ships when.** `npm test` asserts the always-log exactly-once emission and the `masked` omit-when-empty rule.

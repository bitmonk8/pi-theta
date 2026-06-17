# `V9d` — Runtime-event channel and `masked` co-fire

**Spec.** [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md), [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md).

**Adds.** The single `sendMessage` runtime-event shape (four `details` variants, group-A/B routing, dedup tuple, `display`/`content` matrix), the always-log set with the success-side null-policy, and the `masked` co-fire field.

**Tests.**
- `PIC-1`: `masked` carries a closed id set, is omitted (not `[]`) when empty, has the per-site reachable domain (only `["ceiling#2"]` on a typed-query response in loom 1.0), is a pure read, and is cascade-copied verbatim with non-inclusion under dedup.
- Each always-log kind emits exactly once; the success side honours the null-policy.
- Per-variant `(details-key, display, content)` triple: a fixture per row of the spec's [*Per-variant `display`/`content` pairings* matrix](../spec_topics/pi-integration-contract/runtime-event-channel.md#system-note-details-shapes) witnesses the prescribed `display` flag and companion `content` for that `details` variant; a wrong `display` or wrong `content` for any row reds the test.
- Group-A/B single-shape routing: a single always-log failure routes to exactly one of the spec's `details` shapes per the [group-A / group-B partition](../spec_topics/pi-integration-contract/runtime-event-channel.md) with no fan-out across variants — a fixture per group asserts exactly one emission of the routed shape and zero of the sibling shape.

**Deps.** `V9d-T`, `V7d`

**Ships when.** `npm test` asserts the always-log exactly-once emission, the per-variant `(details-key, display, content)` triple and group-A/B single-shape routing, and the `masked` omit-when-empty rule.

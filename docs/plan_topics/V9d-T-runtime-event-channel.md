# `V9d-T` — Runtime-event channel and `masked` co-fire (tests)

**Spec.** [`../spec_topics/pi-integration-contract/runtime-event-channel.md`](../spec_topics/pi-integration-contract/runtime-event-channel.md), [`../spec_topics/diagnostics.md`](../spec_topics/diagnostics.md).

**Adds.** Failing tests for the paired `V9d` implementation leaf.

**Tests.**
- `PIC-1`: `masked` carries a closed id set, is omitted (not `[]`) when empty, has the per-site reachable domain (only `["ceiling#2"]` on a typed-query response in loom 1.0), is a pure read, and is cascade-copied verbatim with non-inclusion under dedup.
- Each always-log kind emits exactly once; the success side honours the null-policy.
- Per-variant `(details-key, display, content)` triple: a fixture per row of the spec's [*Per-variant `display`/`content` pairings* matrix](../spec_topics/pi-integration-contract/runtime-event-channel.md#system-note-details-shapes) witnesses the prescribed `display` flag and companion `content` for that `details` variant; a wrong `display` or wrong `content` for any row reds the test.
- Group-A/B single-shape routing: a single always-log failure routes to exactly one of the spec's `details` shapes per the [group-A / group-B partition](../spec_topics/pi-integration-contract/runtime-event-channel.md) with no fan-out across variants — a fixture per group asserts exactly one emission of the routed shape and zero of the sibling shape.

**Deps.** `V7a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

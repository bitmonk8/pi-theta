# `V9h-T` — Unknown-reason rule (tests)

**Spec.** [`../spec_topics/pi-integration-contract/session-only-degraded-state.md`](../spec_topics/pi-integration-contract/session-only-degraded-state.md), [`../spec_topics/pi-integration-contract/unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md).

**Adds.** Failing tests for the paired `V9h` implementation leaf.

**Tests.**
- [unknown-reason-rule.md — closed-set membership check](../spec_topics/pi-integration-contract/unknown-reason-rule.md#pic-45) (`PIC-45`): a reason outside the closed set (or one whose property access throws) routes through full teardown and emits `loom/host/session-shutdown-reason-unknown` (W), the membership branch reading the snapshot's `literals` field with the unknown-reason fallback.
- A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` carrying a `details.failure` discriminator from the closed set defined by [`unknown-reason-rule.md#pic-47`](../spec_topics/pi-integration-contract/unknown-reason-rule.md#pic-47) (`PIC-47`) — the two literals `"missing-entry"` and `"literals-shape-invalid"`, plus the `"throw:<String(error)>"` template family — with the four `"literals-shape-invalid"` sub-cases each witnessed by their own fixture; the closed-set literal and the two diagnostic codes are read from the anchor-stable contract surface ([`#pic-48`](../spec_topics/pi-integration-contract/unknown-reason-rule.md#pic-48), `PIC-48`) and pinned from a single constant source ([`#pic-46`](../spec_topics/pi-integration-contract/unknown-reason-rule.md#pic-46), `PIC-46`).

**Deps.** `V9m`, `V18c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.

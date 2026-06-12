# `V9h` — Unknown-reason rule

**Spec.** [`../spec_topics/pi-integration-contract/unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md), [`../spec_topics/pi-integration-contract/session-only-degraded-state.md`](../spec_topics/pi-integration-contract/session-only-degraded-state.md) (read for normative-cross-link closure: the unknown-reason rule's `pinnedConstantReadOk` seam feeds that page's *Predicate split* clause, whose degraded-branch obligations close on [`V9l`](./V9l-session-only-degraded-branch.md)), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md#degraded-state-host-prerequisites).

**Adds.** The unknown-reason partition (closed-set validation; read order snapshot → `event.reason`; the four-arm routing). The session-only degraded-state branch for `new`/`resume`/`fork` is split out to [`V9l`](./V9l-session-only-degraded-branch.md), which is blocked on the host-prerequisites clause (a) resolution; the unknown-reason / closed-set / snapshot-failure obligations this leaf owns are unaffected by clause (a) and remain pickable.

**Tests.**
- A reason outside the closed set (or one whose property access throws) routes through full teardown and emits `loom/host/session-shutdown-reason-unknown` (W).
- A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` carrying a `details.failure` discriminator from the closed set defined by [`unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md#unknown-reason-rule-handler-trycatch) — the two literals `"missing-entry"` and `"literals-shape-invalid"`, plus the `"throw:<String(error)>"` template family — with the four `"literals-shape-invalid"` sub-cases each witnessed by their own fixture.

**Deps.** `V9h-T`, `V9m`, `V18c`

**Ships when.** `npm test` exercises the closed-set, unknown, and snapshot-failure paths with their codes.

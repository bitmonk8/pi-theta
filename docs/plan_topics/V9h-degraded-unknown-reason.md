# `V9h` — Session-only degraded state and unknown-reason rule

**Spec.** [`../spec_topics/pi-integration-contract/session-only-degraded-state.md`](../spec_topics/pi-integration-contract/session-only-degraded-state.md), [`../spec_topics/pi-integration-contract/unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md#degraded-state-host-prerequisites).

**Precondition — degraded-state branch is gated.** The session-only degraded-state branch (the `new`/`resume`/`fork` arm: tag write, `"degraded-needs-reload"` transition, `loom/host/session-shutdown-runtime-degraded` emission, `/reload`-only recovery) rests on [Host prerequisites for the degraded-state branch](../spec_topics/pi-integration-contract/host-prerequisites.md#degraded-state-host-prerequisites) clause **(a)**, which the spec records as an **open contradiction** — not an accepted presupposition — against Pi's documented teardown-and-rebind extension lifecycle at the loom 1.0 Pi-SDK pin (Pi reloads-and-rebinds the extension for the new session, so the drained `LoomRegistry` the branch depends on does not survive). Clause (a) MUST be authoritatively resolved — tracked at version-bump editorial-review checklist item (a) ([`version-bump-step2.md#bump-checklist-instance-survival`](../spec_topics/pi-integration-contract/version-bump-step2.md#bump-checklist-instance-survival)) — before the SM-4 / SM-5 / SM-6 / SM-3b degraded-state obligations are implemented; the resolution may find the branch unreachable as written and require those obligations to be reworked. The unknown-reason-rule obligations this leaf also closes are unaffected by clause (a) and remain pickable.

**Adds.** The unknown-reason partition (closed-set validation; read order snapshot → `event.reason`; the four-arm routing) and the session-only degraded state for `new`/`resume`/`fork` (tag write via `markRuntimeDegraded`, recovery prohibitions until `/reload`, the tag-transition vs diagnostic-emission predicate split).

**Tests.**
- A reason outside the closed set (or one whose property access throws) routes through full teardown and emits `loom/host/session-shutdown-reason-unknown` (W).
- A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` with its four discriminators.
- On `new`/`resume`/`fork` with a successful snapshot read, the runtime emits `loom/host/session-shutdown-runtime-degraded` and fronts later slash invocations with the degraded note until `/reload`.

**Deps.** `V9h-T`, `V9b`, `V18c`

**Ships when.** `npm test` exercises the closed-set, unknown, snapshot-failure, and degraded paths with their codes.

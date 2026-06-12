# `V9l-T` — Session-only degraded-state branch (tests)

**Spec.** [`../spec_topics/pi-integration-contract/session-only-degraded-state.md`](../spec_topics/pi-integration-contract/session-only-degraded-state.md), [`../spec_topics/pi-integration-contract/unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md) (read for normative-cross-link closure: the *Predicate split* clause consumes the unknown-reason rule's `pinnedConstantReadOk` seam), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md#degraded-state-host-prerequisites).

**Adds.** The failing test suite for the `new`/`resume`/`fork` session-only degraded-state branch lifted out of `V9h`: the state-independent drain-state tag write, the `"degraded-needs-reload"` transition, the `loom/host/session-shutdown-runtime-degraded` emission, the recovery-path prohibition until `/reload`, and the diagnostic-emission-vs-tag-transition predicate split.

**Tests.**
- `session-only-degraded-state.md` §degraded branch (un-anchored; GOV-22 residue): on `new`/`resume`/`fork` with a successful snapshot read, the runtime writes the state-independent drain-state degraded tag via `markRuntimeDegraded`, transitions to `"degraded-needs-reload"`, emits `loom/host/session-shutdown-runtime-degraded`, and fronts later slash invocations with the degraded note until `/reload`.
- `session-only-degraded-state.md` §Recovery-path prohibition (un-anchored; GOV-22 residue): until `/reload`, no un-drain, re-subscribe, poll, or other self-recovery path fires.
- `session-only-degraded-state.md` §Predicate split (un-anchored; GOV-22 residue): the diagnostic-emission-vs-tag-transition predicate split holds — the tag write is state-independent, the emission is gated separately.
- `session-only-degraded-state.md` §Seam-minimality + *Inline triplet is normative* (un-anchored; GOV-22 residue): no handler-scoped state seam is introduced.

**Deps.** `V9h`, `V9b`, `V18c` — `V18c` is the clause-(a) resolution owner: this tests task is **blocked** with its `V9l` implementation partner until the version-bump editorial-review checklist item (a) authoritatively resolves the host-prerequisites clause (a) open contradiction (see [`plan.md` §Blocked obligations](../plan.md#blocked-obligations)); authoring these degraded-path tests before the resolution risks asserting contradicted behaviour.

**Ships when.** The tests above exist, compile, and fail red for the intended reason (per [`conventions.md`](./conventions.md) §Per-phase TDD ritual); tag the commit `V9l-T-complete`.

# `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate)

**Convention.** [`conventions.md`](./conventions.md) — *REQ-ID discipline* (the live-corpus footing of the closing gate) and the [`coverage-matrix.md`](./coverage-matrix.md) closure obligation.

**Adds.** The terminal release-gate step that flips [`H5a`](./H5a-closing-gate-automation.md)'s closing gate from its seeded-fixture footing to its live-corpus footing: the gate is reconfigured to reconcile the live spec REQ-ID set and the live `spec_topics/**` normative-MUST set against the live [`coverage-matrix.md`](./coverage-matrix.md), so that from this leaf onward an unmapped executable REQ-ID or an un-enumerated un-anchored MUST reddens `npm test`. This is the "loom 1.0 release gate" named in [`plan.md`](../plan.md) item 5 and the [`coverage-matrix.md`](./coverage-matrix.md) release-gate clause; until this leaf lands those two failure modes are exercised only against the seeded fixtures at `H5a`. Because the live-corpus footing reddens CI the moment any executable REQ-ID lacks a mapping, this leaf MUST be sequenced after every leaf that can introduce an executable REQ-ID or an un-anchored normative MUST (see **Deps.**); activating it earlier would redden `main` on coverage that later leaves are still landing.

**Tests.**
- `Convention:` (*REQ-ID discipline* — live-corpus footing) `npm test` runs the closing gate against the live spec corpus and the live [`coverage-matrix.md`](./coverage-matrix.md), green: every executable spec REQ-ID maps to a closing leaf and every un-anchored normative MUST/MUST-NOT is enumerated with a closing leaf.
- `Convention:` (*REQ-ID discipline* — live-corpus footing) the gate reddens when a live executable spec REQ-ID has no `coverage-matrix.md` row (asserted by removing one mapping within the test and restoring it), confirming the non-gating→gating flip is active rather than still fixture-only.

**Deps.** `H5a`, `M`, `V1a`–`V18c`

_(The dependency set is the complete coverage-producing set: `H5a` supplies the gate machinery, and every MVP and vertical implementation leaf (`V1a`–`V18c`) can introduce an executable REQ-ID or an un-anchored normative MUST. The set MUST stay transitively complete — any future leaf that can introduce an executable REQ-ID or an un-anchored MUST is a new dependency of this leaf, otherwise the gate can activate against incomplete coverage.)_

**Ships when.** `npm test` runs the closing gate on its live-corpus footing — the live spec REQ-ID set and the live `spec_topics/**` normative-MUST set reconciled against the live [`coverage-matrix.md`](./coverage-matrix.md) — and passes green, and the removed-mapping check above confirms the gate reddens on an unmapped executable REQ-ID. From this leaf onward the live-corpus failure modes gate `npm test`.

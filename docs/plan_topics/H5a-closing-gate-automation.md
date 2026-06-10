# `H5a` — REQ-ID / diagnostic-code closing-gate automation

**Convention.** [`conventions.md`](./conventions.md) — *REQ-ID discipline*, *Diagnostic message anchors*, and the [`coverage-matrix.md`](./coverage-matrix.md) closure obligation.

**Adds.** The CI gate that reconciles the spec REQ-ID set and the diagnostics code registry against the plan's [`coverage-matrix.md`](./coverage-matrix.md) and the asserting tests — failing on an unmapped executable REQ-ID, a registry code with no asserting test, an asserted code absent from the registry, an un-anchored normative MUST/MUST-NOT (one carrying no numbered `PREFIX-N` REQ-ID and no `loom/...` registry code, and not a named cross-leaf seam) absent from [`coverage-matrix.md`](./coverage-matrix.md)'s *Code-keyed obligation areas (no numbered REQ-IDs)* table with a closing leaf, a retired/live ID clash, or a per-prefix numbering hole. At `H5a` the gate's pass/fail is evaluated against the seeded fixtures below; the live-corpus unmapped-executable-REQ-ID failure mode — the live spec REQ-ID set reconciled against the live [`coverage-matrix.md`](./coverage-matrix.md) — does not gate `npm test` at this leaf and first becomes binding at the loom 1.0 release gate activated by [`H6a`](./H6a-live-corpus-activation.md), per [`conventions.md`](./conventions.md) *REQ-ID discipline*. The live-corpus un-anchored-MUST failure mode — the live `spec_topics/**` normative MUST/MUST-NOT set reconciled against the same table — shares that posture: it is exercised against the seeded fixtures here and first becomes binding at the same [`H6a`](./H6a-live-corpus-activation.md) release-gate activation.

**Tests.**
- `Convention:` (*REQ-ID discipline*) the gate fails when a fixture spec REQ-ID has no coverage-matrix row.
- `Convention:` (*Diagnostic message anchors*) the gate fails when a test asserts a diagnostic code absent from the registry, and when a registry code has no asserting test.
- `Convention:` (*REQ-ID discipline*) the gate excludes the `loom/typecheck/*` build-time brand-string prefix from registry reconciliation.
- `Convention:` (*REQ-ID discipline* — un-anchored obligations) the gate fails when a fixture spec page carries a normative MUST/MUST-NOT with no `PREFIX-N` REQ-ID and no registry code that is absent from the [`coverage-matrix.md`](./coverage-matrix.md) *Code-keyed obligation areas (no numbered REQ-IDs)* table with a closing leaf, and passes when every such fixture MUST is enumerated with a closing leaf.

**Deps.** `H4a`

**Ships when.** `npm test` runs the closing gate green against the seeded no-violation fixture — which includes a fixture page whose un-anchored normative MUST is enumerated in the *Code-keyed obligation areas* table with a closing leaf — and red against each seeded violation fixture, including a seeded un-enumerated-MUST fixture page that carries a `PREFIX-N`-less, registry-code-less, non-seam normative MUST mapped to no closing leaf.

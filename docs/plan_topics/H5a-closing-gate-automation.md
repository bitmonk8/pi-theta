# `H5a` — REQ-ID / diagnostic-code closing-gate automation

**Convention.** [`conventions.md`](./conventions.md) — *REQ-ID discipline*, *Diagnostic message anchors*, and the [`coverage-matrix.md`](./coverage-matrix.md) closure obligation.

**Adds.** The CI gate that reconciles the spec REQ-ID set and the diagnostics code registry against the plan's [`coverage-matrix.md`](./coverage-matrix.md) and the asserting tests — failing on an unmapped executable REQ-ID, a registry code with no asserting test, an asserted code absent from the registry, a retired/live ID clash, or a per-prefix numbering hole. At `H5a` the gate's pass/fail is evaluated against the seeded fixtures below; the live-corpus unmapped-executable-REQ-ID failure mode — the live spec REQ-ID set reconciled against the live [`coverage-matrix.md`](./coverage-matrix.md) — does not gate `npm test` at this leaf and first becomes binding at the loom 1.0 release gate, per [`conventions.md`](./conventions.md) *REQ-ID discipline*.

**Tests.**
- `Convention:` (*REQ-ID discipline*) the gate fails when a fixture spec REQ-ID has no coverage-matrix row.
- `Convention:` (*Diagnostic message anchors*) the gate fails when a test asserts a diagnostic code absent from the registry, and when a registry code has no asserting test.
- `Convention:` (*REQ-ID discipline*) the gate excludes the `loom/typecheck/*` build-time brand-string prefix from registry reconciliation.

**Deps.** `H4a`

**Ships when.** `npm test` runs the closing gate green against the seeded no-violation fixture and red against each seeded violation fixture.

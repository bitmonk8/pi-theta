# `H7a` — Terminal integration-acceptance run (cross-slice end-to-end gate)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — end-to-end harness).

**Adds.** A terminal integration-acceptance gate that runs a single representative multi-feature fixture `.loom` through the [`H4a`](./H4a-factory-shell-and-harness.md) end-to-end harness against the in-process Pi session double, driving the integrated pipeline — typed query → tool loop → code-tool invoke → schema lowering/validation → binder → cancellation — in a single run. It closes no new spec REQ-ID; it is a cross-slice integration-regression gate that exercises the composition the per-leaf gates verify only in isolation. Because the run executes against the session double, its fidelity is bounded by that double's contract ([`H4a`](./H4a-factory-shell-and-harness.md)); the gate targets the cross-slice composition the per-leaf gates cannot see, not host-level realism (the real-host backstop remains [`V18c`](./V18c-version-bump-checklist.md)'s version-bump runtime-evidence gate).

**Tests.**
- `Convention:` (phase categories — end-to-end harness) running the representative multi-feature fixture `.loom` through the `H4a` harness drives the integrated pipeline (typed query, tool loop, code-tool invoke, schema lowering/validation, binder, cancellation) and the run produces the expected appended turns.
- `Convention:` (phase categories — end-to-end harness) the same run emits the expected `loom-system-note` diagnostics for the integrated path, asserted against the diagnostics-registry *Message* strings per [`conventions.md`](./conventions.md) *Diagnostic message anchors*.

**Deps.** `H4a`, `V5d`, `V8a`, `V11f`, `V13c`, `V14a`, `V17a`

**Ships when.** `npm test` runs the terminal integration-acceptance fixture `.loom` end-to-end through the `H4a` harness against the in-process Pi session double, green: the integrated typed-query → tool-loop → code-tool-invoke → schema-lowering/validation → binder → cancellation pipeline produces the expected appended turns and the expected `loom-system-note` diagnostics.

# Bug 0376 — `TEARDOWN_STEP_CALL_LABELS[4]` omits `"debouncer.whenIdle(awaitCap)"`: the exported constant that documents itself as the closed normative `details.call` set (wire contract) under-enumerates the label the same module emits five hundred lines later

- **Status:** fixed (0.372.0).
- **Sev/Diff estimate:** S4/D1 — S4: pure registry/constant inconsistency; the
  emission site uses the correct spec literal inline, so emitted diagnostics
  are right and no operator-visible value is wrong. The exported constant is
  consumed only by `tests/session-shutdown.test.ts` today, and it exists
  precisely to be the enumerable wire-contract source a gate or dedup consumer
  keys on (the module comment: "The labels are wire contract … so operator
  dedup on `(code, details.step, details.call)` is meaningful") — so the
  defect is enumeration drift between the declared source of truth and the
  emitter, impact class 5. D1: one array literal edit + routing the emission
  through the constant.
- **Kind:** defect — doc/registry inconsistency (impact class 5, crisp:
  spec's closed set for sub-step 4 has four members; the constant has three;
  the code emits the fourth).
- **Related:**
  - 0047 (fixed 0.223.0) — permitted-code registry blind to a namespace the
    runtime emits; same "enumeration lags the emitter" class at smaller
    scale.
  - [0034](./0034-supersession-does-not-await-whenidle.md) (fixed 0.46.0) —
    nearest ancestor: its fix minted the supersession label
    `hotReloadHandle.whenIdle(awaitCap)` and reused the teardown's existing
    `debouncer.whenIdle(awaitCap)` label; its §Fix constraints do not record
    this constant's omission of that label.
  - [0323](./0323-probe-failed-step-set-registry-contradiction.md) (fixed
    0.342.0) — SIBLING registry only: the capability-probe `details.step`
    closed set; different constant, no shared fix surface.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/extension/session-shutdown.ts:65-74` — `TEARDOWN_STEP_CALL_LABELS`,
    step 4 row: `["discoveryWatcher.close", "settingsWatcher.close",
    "Clock.clearTimeout(debounce)"]` (three members), with the doc comment
    declaring it "The closed normative `details.call` label set per
    `details.step` (session-shutdown-semantics.md **Per-step isolation** —
    the source of truth)".
  - `src/extension/session-shutdown.ts:599-611` — the sub-step-4 quiesce arm,
    with the inline emission at `:609`:
    `teardownStepFailedDiagnostic(4, "debouncer.whenIdle(awaitCap)",
    quiesceError)` — the fourth label, inlined, not drawn from the constant.
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:15`
    — the closed set: "sub-step 4: `"discoveryWatcher.close"`,
    `"settingsWatcher.close"`, `"Clock.clearTimeout(debounce)"`,
    `"debouncer.whenIdle(awaitCap)"`" (four members), and "Adding a new call
    site under any of these sub-steps requires a spec edit to extend this
    closed set in the same commit; an implementation MUST NOT introduce a
    `details.call` value outside this enumeration."

## Summary

The spec's Per-step isolation paragraph pins a four-member closed label set
for sub-step 4; PIC-57's quiesce-await label was added to the spec set when
the debouncer quiesce landed. The implementation emits that label correctly
but never extended the exported constant that mirrors the closed set, so the
in-repo "source of truth" enumerates 11 of the 12 spec labels. Behaviour and
registry disagree inside one module.

## Reproduction

`TEARDOWN_STEP_CALL_LABELS[4].includes("debouncer.whenIdle(awaitCap)")` →
`false`, while a `session_shutdown` teardown whose injected
`debouncer.whenIdle` rejects emits `theta/host/session-shutdown-teardown-step-failed`
with `details: { step: 4, call: "debouncer.whenIdle(awaitCap)" … }` (the
quiesce catch at session-shutdown.ts:606-611; exercised by the
existing suite).

## Expected behaviour

The constant carries all four sub-step-4 labels, byte-equal to the spec's
closed set, so enumeration-driven consumers (dedup tooling, permitted-label
gates, conformance fixtures) and the emitter cannot drift apart.

## Actual behaviour / root cause

The quiesce arm (bug-0034-era PIC-57 work) added the emission with an inline
literal and did not touch the constant declared some 540 lines earlier.

## Why it matters

The constant documents itself as the closed normative `details.call` set and
the spec makes that set same-commit-maintained ("Adding a new call site under
any of these sub-steps requires a spec edit to extend this closed set in the
same commit"); an in-repo source of truth that under-states the emitter by
one label defeats the enumerability the wire-contract comment promises. The
drift is decidable by read — spec says four, constant says three, code emits
the fourth — the same filed enumeration-lag class as 0117/0323.

## Non-goals

- No change to the emitted label or the spec set — both agree; only the
  constant lags.

## Fix

Add `"debouncer.whenIdle(awaitCap)"` to `TEARDOWN_STEP_CALL_LABELS[4]` and
route the inline emission at `session-shutdown.ts:609` through the constant
(with a test asserting every emitted `details.call` is a member of the
constant's row), closing the drift channel structurally.

## Provenance

Found while mapping the spec's closed `details.call` set onto the teardown
implementation's emission sites; verified by reading both cited sites and the
constant's single test consumer.

## Fix (0.372.0)

- What shipped: `src/extension/session-shutdown.ts` — (§Fix act 1) added the
  fourth spec label `"debouncer.whenIdle(awaitCap)"` to the
  `TEARDOWN_STEP_CALL_LABELS` step-4 row, bringing the exported closed set to
  the spec's four members; (§Fix act 2) routed the sub-step-4 quiesce-catch
  emission through the constant (`TEARDOWN_STEP_CALL_LABELS[4][3]`) so the sole
  literal occurrence lives in the constant and the emitter cannot drift from
  the declared closed set. The emitted wire value is byte-identical
  (`"debouncer.whenIdle(awaitCap)"`, `step 4`). A pre-existing doc comment on
  `TeardownAwareDebouncer` that re-quoted the literal was reworded to cite the
  constant, preserving the single-source invariant. No spec edit (spec, DIAG
  registry, constant and emission all agree at four members).
- Gates: witness `tests/b0376-teardown-call-label-set-underenumerates.test.ts`
  RED→GREEN (2/2; reverting `session-shutdown.ts` to HEAD reds both assertions
  with the bug signature — three-member row / emitted label not a member — and
  restoring the byte-identical fix greens them); full default suite
  `npx vitest run` green (one unrelated `shared-subtree-…` test-timeout under
  16-lane load, green isolated, no `session-shutdown` reference — load noise);
  `npm run typecheck` (`tsc --noEmit`) clean; `npm run lint` (eslint) clean.
- Review: 1 round — `bug-fix-reviewer` CLEAN (full-module sweep confirmed all
  12 emitted labels ∈ constant = spec's 12; `[4][3]` guarded by
  `reload-teardown-quiesce.test.ts` which pins the emitted label byte-exact;
  spec = registry = constant = emission), one non-blocking `test` residual
  (R1) recorded below.
- Verification: `bug-fix-verifier` SOLID — (1) witness reds-then-greens with a
  byte-identical restore (post-fix blob `c12dc8ea`); (2) full suite green
  modulo one isolated-green load-noise timeout; (3) live obligation — an
  adjacent existing shutdown/teardown cell run under the mandatory live-lock
  (`tests/live/double-session-start-live.test.ts`, PIC-57 quiesce path) passed
  (1/1, 5.47 s), the proportionate witness since 0376 changes no
  registration/drive outcome; (4) lint + typecheck clean.
- Residuals: (R1, non-blocking, test) the structural drift-closer test drives
  only the quiesce arm's emission; a hypothetical future out-of-set label at a
  *different* teardown arm would not red it. Accepted: every current emission
  site was swept in-set during review, step-5 labels are additionally union-
  typed, `as const` tuples make a row shrink a compile error, and the spec's
  same-commit closed-set rule governs future additions. The filed drift
  channel (the quiesce inline literal) is closed and locked.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the emitted `details.call` value and the
  spec's closed set are unchanged — only the in-repo constant that lagged the
  emitter was corrected (bug-doc *Non-goals*).


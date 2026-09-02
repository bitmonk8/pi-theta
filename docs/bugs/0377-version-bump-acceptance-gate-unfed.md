# Bug 0377 — the cka-19 version-bump acceptance gate is a pure seam nothing feeds: `runtimeEvidenceAcceptanceFailures` and `verifyRevertSequence` have no caller outside hand-operand unit tests, the composition their module header promises ("wires the live `H4a` harness run and the re-run `V18c` static gates into these seams") exists nowhere, and the plan leaf the spec cites as owning the harness contract is a pruned tombstone

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — no wrong runtime bytes: the subject is a
  release-procedure gate, and the six surfaces its acceptance run must drive
  are each exercised by ordinary suite tests today. S4 rather than S5 because
  the gate guards a normative merge-blocking MUST ("a bump whose
  runtime-evidence run is red MUST NOT be merged at the candidate pin") whose
  verdict is at HEAD computed by nothing during any real bump — the
  0216-shape "holds only inside a unit test", on a process gate instead of a
  registered code. D2 because the honest fixes are either (a) a bump-time
  driver that derives a real `HarnessRunOutcome` from the `npm test` run
  (surface-tagging the six e2e cells) and feeds both seams, or (b) a GOV-22
  style re-anchoring of `cka-19`/`cka-56` to the witnesses that actually
  discharge the six-surface claim, plus the module-header correction — the
  0360 §Fix shape.
- **Kind:** test-infrastructure — a gate that cannot witness what it claims
  to (the coverage matrix reports the area closed by V18d; V18d's tests are
  satisfiable — and satisfied — by an implementation in which the acceptance
  verdict is never computed over real evidence).
- **Related:**
  - [0360](./0360-desc-gate-witnesses-dead-seams.md) — open.
    The pattern this generalises: a cka row mapped to a leaf whose tests
    drive seam functions in isolation while the seams have no production
    call sites. Distinguishing mechanism: 0360's gate blindness masks
    PRESENT divergences (0357/0358), while this gate's predicate is sound
    and reds in both directions — the defect here is a total absence of
    operand feed, a latent process MUST evaluated by no code. Do not fold
    this into 0360's records-only residual.
  - [0216](./0216-shutdown-reason-classification-unwired.md)
    — fixed (0.153.0). The "holds only inside a unit test" wording is its
    shape: seam + tests green, zero production callers.
  - [0112](./0112-containment-records-inv5-label-and-coverage-row.md)
    — fixed (0.237.0). Precedent for filing a coverage-matrix row whose
    mapped leaf is not reachable from the witness that discharges the site.
  - [0230](./0230-diag-2-closed-set-not-gated-corpus-wide.md)
    — fixed (0.184.0). Precedent that an ungated governance MUST (a gate
    driven only by hand-written operands while the corpus-wide claim goes
    unchecked) is a fileable defect class here.
- **Affected** (verified at `9474dfa8`, v0.347.0):
  - `src/extension/version-bump-acceptance.ts:83` —
    `runtimeEvidenceAcceptanceFailures`, the output-(c) acceptance gate.
    `rg -n 'runtimeEvidenceAcceptanceFailures' src/ tools/ scripts/ config/`
    matches only the definition; the only external references are
    `tests/version-bump-acceptance.test.ts:8,126,139,153`.
  - `src/extension/version-bump-acceptance.ts:163` — `verifyRevertSequence`,
    the merge-blocking revert verification. Same census: definition plus
    `tests/version-bump-acceptance.test.ts:9,183,203` only.
  - `src/extension/version-bump-acceptance.ts:14–18` — the module header's
    wiring promise: "Both seams are PURE functions over injected operands …
    the paired `V18d` implementation wires the live `H4a` harness run and
    the re-run `V18c` static gates into these seams." No such wiring exists
    in `src/**`, `tools/**`, `scripts/**`, `config/**`, or `package.json`
    (`"version": "0.347.0"` — no bump-related script).
  - `tests/version-bump-acceptance.test.ts:120–127` — the "full H4a harness
    run … satisfies acceptance" cell constructs `fullGreenRun` as a hand-
    written object literal (`harnessDriven: true`, the six surfaces spread
    from `ACCEPTANCE_SURFACES`, `allAssertionsPassed: true`); no test in the
    file (or anywhere) derives a `HarnessRunOutcome` from a real harness
    run. The one cell that touches the real harness (`:113`,
    `loadExtension({ fixtures: [noop] })`) dispatches a no-op fixture and
    feeds nothing into the gate.
  - `docs/plan_topics/coverage-matrix.md:144` — `cka-19` |
    `version-bump-triggers.md` runtime-evidence acceptance-gate MUST |
    `V18d`; `:181` — `cka-56` | patch-skew fixture-obligation categories
    including "the version-bump-procedure category" | `V18d`.
  - `docs/plan_topics/H4a-factory-shell-and-harness.md:1–5` — "# H4a —
    retired plan leaf … This leaf's body has been pruned as historical
    cruft. The file is retained (filename only) because
    `tools/closing-gate/live-corpus.js` derives the release-gate leaf-ID
    universe" — while `version-bump-triggers.md:7` cites it as the page
    "whose existence and session-double fidelity contract are owned by
    `docs/plan_topics/H4a-factory-shell-and-harness.md` (cited here, not
    redefined)". The cited owner owns nothing at HEAD.
- **Observed at:** 0.347.0 (`9474dfa8`). Offline: caller census via `rg`
  over `src/ tools/ scripts/ config/ tests/`; `tests/version-bump-acceptance.test.ts`
  read in full; `npx vitest run tests/version-bump-acceptance.test.ts` green
  at HEAD (7 tests) with every gate operand hand-built.

## Summary

`version-bump-triggers.md` output (c) makes green end-to-end runtime
evidence a merge-blocking MUST for every Pi-SDK version bump: an integrated
`.theta` driven through the H4a end-to-end harness against the bumped pin,
exercising six named surfaces, with every assertion passing — "a bump whose
runtime-evidence run is red MUST NOT be merged at the candidate pin". The
coverage matrix reports this obligation (cka-19, and the version-bump
category of cka-56) discharged by leaf V18d. V18d ships two pure functions
that can compute the acceptance verdict and the revert verdict — and
nothing anywhere constructs their operands from a real run: no bump-time
script, no CI hook, no test that derives `harnessDriven` /
`surfacesExercised` / `allAssertionsPassed` from an actual `npm test`
harness execution. The unit tests pass hand-written literals in both
directions, so they stay green whether or not any real bump ever consults
the gate. The module header still promises the wiring as the paired
implementation's deliverable; the plan-leaf page the spec cites as owning
the harness's "existence and session-double fidelity contract" is a pruned
tombstone retained for a leaf-ID universe.

## Reproduction

At `9474dfa8`:

1. `rg -n 'runtimeEvidenceAcceptanceFailures|verifyRevertSequence' src/ tools/ scripts/ config/`
   → definitions only (`src/extension/version-bump-acceptance.ts:83,163`).
2. `rg -ln 'runtimeEvidenceAcceptanceFailures|verifyRevertSequence' tests/`
   → `tests/version-bump-acceptance.test.ts` only; every call site in that
   file passes object-literal operands (`:120–127`, `:139–146`, `:183+`).
3. `npx vitest run tests/version-bump-acceptance.test.ts` → green (the
   gate's own cells cannot red on an unfed composition — they never consult
   one).
4. `head -5 docs/plan_topics/H4a-factory-shell-and-harness.md` → "retired
   plan leaf … pruned as historical cruft".

Both directions: the seam functions themselves behave conformantly (the
unit cells red if their arithmetic drifts — verified by inspection of the
assertions, which pin both the green and the red operand direction), so
the gap is exclusively the absent operand feed: there is no code path on
which a real red runtime-evidence run produces a non-empty failure list
anyone reads.

## Expected behaviour

`docs/spec_topics/pi-integration-contract/version-bump-triggers.md:7`:
"A bump is therefore not considered landed until the runtime evidence in
(c) is green — *green* meaning that `npm test` harness run completing with
each of the six surfaces above exercised and all of the run's assertions
passing: a bump whose runtime-evidence run is red MUST NOT be merged at the
candidate pin."

`docs/plan_topics/coverage-matrix.md:144` (cka-19) and `:181` (cka-56)
claim the obligation discharged by V18d. Per the matrix's own purpose, the
mapped leaf's witnesses must be able to red when the obligation is
violated: a discharge claim requires either a real operand feed into the
shipped gate at bump time, or witnesses stated over the artefacts a bump
actually produces.

## Actual behaviour / root cause

The V18d-T/V18d task pair shipped its tests against the seam functions and
its implementation *of the seam functions*, and the integration step —
named in the module header as the paired implementation's remit
(`version-bump-acceptance.ts:14–18`) — never landed. Because the tests
bind the functions with hand-built operands, filling the stub bodies
turned them green without the composition existing; nothing since can red
on its absence. The spec's citation anchor for the harness contract
(`H4a-factory-shell-and-harness.md`) was subsequently pruned to a
tombstone, so even the documentary chain from the MUST to a concrete
harness is broken: the sentence cites a page that owns nothing.

Concretely, at the next Pi-SDK bump the procedure's step (c) is manual
convention: an operator may run `npm test` and eyeball it, but the
six-surface coverage requirement, the harness-driven requirement, and the
revert-widening verification are computed by no code, and a bump merged
with a red or surface-incomplete run trips nothing.

## Why it matters

- The merge-blocking MUST is the corpus's only runtime regression gate for
  Pi-SDK pin changes — the exact class of change (host behaviour shifting
  behind an unchanged typed surface) that build-time gates cannot see, as
  the spec sentence itself states. Its enforcement being a convention
  rather than the shipped gate is invisible to every audit that trusts the
  coverage matrix: both cka rows report closed.
- The 0360 mechanism — green seam-function tests standing in for an
  integration that never landed — has now been observed on two independent
  leaves (V5c, V18d). Each instance found mechanically here strengthens
  the case that the matrix's leaf-mapping convention needs a
  reachability check, which is 0360's residual fix item 1 generalised.

## Non-goals

- The seam functions' internal arithmetic — conformant; their unit cells
  can stay as implementation tests once a real operand feed exists.
- The V18c build-time gates (`version-bump-gates.ts`) — separately
  witnessed by `tests/version-bump-gates.test.ts` over real `package.json`
  / inventory operands; not audited here beyond confirming they are real
  doubles.
- Whether the six surfaces are in fact covered by today's suite (they
  are, severally); the subject is the absent *composition* that turns that
  coverage into the gate's operands at bump time.
- The live-suite H8a/H9a harnesses — different subsystem; the spec's H4a
  is the offline factory-shell harness (`tests/harness/`), which exists
  and loads; only its acceptance-gate consumption is absent.

## Fix

Not yet decided; constraints any fix must satisfy:

1. Either wire it or re-anchor it — do not leave both the promise and the
   tombstone: (a) a bump-time driver (script or gated test) that runs the
   offline suite, tags the six acceptance surfaces to concrete test cells,
   derives a real `HarnessRunOutcome`, and feeds
   `runtimeEvidenceAcceptanceFailures` (red list fails the bump commit) —
   with `verifyRevertSequence` fed from the V18c gates re-run against the
   restored pin on the revert path; or (b) rescope cka-19/cka-56 to the
   witnesses that actually discharge the six-surface claim and rewrite the
   module header and the spec's H4a citation to match reality (the 0360 /
   0112 records-fix shape).
2. If (a): the surface-tagging must fail loudly when a named surface has
   no green cell (no silent vacuous acceptance) — the same no-silent-skip
   rule every harness here already follows.
3. The spec's citation of `H4a-factory-shell-and-harness.md` must either
   point at a page that owns the stated contract or state the contract
   inline; a normative sentence must not cite a pruned tombstone as its
   authority.

## Provenance

- Hunt area: dead-enforcement-sweep (wave-2 mechanical audit:
  registered-but-unwired enforcement), pass 2 (exported checker↔caller:
  `verifyRevertSequence` surfaced with zero call sites, in-file included).
- Spec measured against:
  `docs/spec_topics/pi-integration-contract/version-bump-triggers.md:7`;
  `docs/plan_topics/coverage-matrix.md:144,181`;
  `docs/plan_topics/H4a-factory-shell-and-harness.md:1–5`.
- Implementation read at `9474dfa8`:
  `src/extension/version-bump-acceptance.ts` (whole module),
  `src/extension/version-bump-gates.ts` (headers + gate signatures),
  `tests/version-bump-acceptance.test.ts` (whole file).
- Probe: caller census (`rg` over `src/ tools/ scripts/ config/ tests/`,
  recorded in §Reproduction) + `npx vitest run
  tests/version-bump-acceptance.test.ts` green at HEAD. No scratch file
  needed; nothing to delete.

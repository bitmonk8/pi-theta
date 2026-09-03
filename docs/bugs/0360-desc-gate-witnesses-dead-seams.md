# Bug 0360 — the DESC coverage gate cannot witness what it claims: `cka-9` maps descriptions.md to leaf V5c, whose tests drive the four seam functions in isolation — three of which have zero production call sites and the fourth of which production only ever calls with anchor strings the tests' eligible cases never take — so the suite is green while every end-to-end descriptions.md behaviour diverges

- **Status:** fixed (0.374.0).
- **Sev/Diff estimate:** S4/D1 — no wrong runtime bytes of its own; after
  rescoping, this report's own fix is one coverage-matrix annotation, one
  module-header comment block, and a test-comment correction (the 0112
  shape: a records defect over a discharged site). The pipeline witnesses
  themselves are owed by the fixes of `[bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)`
  and `[bug 0358](./0358-doc-comment-descriptions-never-lower.md)` (they red at HEAD on exactly
  those defects), so this report lands with or after both.
- **Kind:** verification gap — test infrastructure (a gate that cannot
  witness what it claims to).
- **Related:**
  - [Bug 0357](./0357-doc-comment-field-variant-anchors-refused.md) and
    [bug 0358](./0358-doc-comment-descriptions-never-lower.md) — the two divergences the gate is
    blind to; this report is the blindness itself. Ordering: lands
    with/after [bug 0357](./0357-doc-comment-field-variant-anchors-refused.md) +
    [bug 0358](./0358-doc-comment-descriptions-never-lower.md), whose fixes own the pipeline
    witnesses.
  - [0112](./0112-containment-records-inv5-label-and-coverage-row.md) —
    the cka-row precedent: a coverage-matrix row whose mapped leaf is not
    reachable from the witness that actually discharges the site, filed
    standalone as a records defect (S4/D1). This report's residual takes
    the same shape.
  - [0048](./0048-double-session-start-live-vacuous-quiesce-witness.md),
    [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md),
    [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — the
    filed precedent family for "a shipped gate that cannot red on the
    class it guards"; 0132 is the shape of the corpus-census half here
    (the committed-fixture gate is structurally blind to `///`).
- **Affected** (verified at af476df2, v0.347.0):
  - `docs/plan_topics/coverage-matrix.md:134` — `cka-9` |
    `descriptions.md` (DESC) | `V5c`: the area's coverage claim.
  - `tests/descriptions.test.ts` — the V5c witness file. Every `describe`
    is labelled "V5c-T … (DESC code-keyed area)" and asserts on direct
    calls: `lowerDescription` (`:52–88`), `checkDocCommentPlacement` with
    hand-written production strings including `"field"` / `"variant"`
    (`:93–121`), `joinDocComment` (`:125–147`), `extractDescription`
    (`:148+`). No test in the file parses theta source.
  - `src/parser/descriptions.ts:1–22` — the module header still describes
    itself as the tests-task seam ("V5c-T … stubs the behaviour-bearing
    functions so the failing tests compile and red … The paired V5c
    implementation leaf fills these in"): the functions were filled in, the
    integration was not, and the tests kept passing because they bind the
    functions, not the pipeline.
  - `src/parser/theta-document.ts:63` — production imports only
    `checkDocCommentPlacement`; `:1652–1655` — production anchors are drawn
    from `{"schema","enum","fn","other"}` only, so the unit tests' eligible
    `"field"` / `"variant"` cases (`descriptions.test.ts:113–120`) exercise
    arms no production input reaches, and the integrated behaviour on real
    field/variant anchors (an error) is the opposite of what those green
    cases suggest.
  - `tests/whole-program-parser.test.ts:364–387` — the only pipeline-level
    `///` test in the suite (cka-49 aggregation); its fixture is a
    genuinely-misplaced `/// stray doc` above `let`, so it asserts the code
    fires where it should and can never see it firing where it should not.
  - `tests/committed-fixture-parse-gate.test.ts` + the committed corpus —
    zero `///` lines in any tracked `.theta`/`.thetalib` (grep over
    `docs/examples/`, `tests/fixtures/`, `tests/live/acceptance/fixtures/`),
    so the corpus gate is blind to the whole area.
- **Observed at:** 0.347.0 (af476df2). Offline: `npx vitest run
  tests/descriptions.test.ts` green at HEAD (4 tests) while the scratch
  pipeline probes recorded in candidates 01/02 show every integrated
  behaviour diverging; grep evidence for the dead exports
  (`joinDocComment|extractDescription|lowerDescription` → definitions and
  this test file only).

## Summary

The DESC area's obligations are behavioural: placement acceptance on five
anchors, refusal elsewhere, multi-line join + dedent, byte-for-byte
lowering into `description:` fields. The area's registered leaf (V5c)
discharges them with unit tests over four exported functions. Three of the
four (`extractDescription`, `joinDocComment`, `lowerDescription`) have no
production caller — their green proves the functions work, not that theta
does. The fourth (`checkDocCommentPlacement`) is integrated, but through an
adapter that can only supply `{"schema","enum","fn","other"}`; the unit
tests additionally pass `"field"` and `"variant"` and observe acceptance,
while the real pipeline classifies those anchors `"other"` and errors. The
net effect is a gate whose every assertion is satisfiable — and satisfied —
by an implementation in which the documented feature does not exist.

## Reproduction

At af476df2:

1. `npx vitest run tests/descriptions.test.ts` → 4/4 green.
2. `grep -rn "joinDocComment\|extractDescription\|lowerDescription" src/`
   → hits in `src/parser/descriptions.ts` only (definitions).
3. `[bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)`'s fixture A (descriptions.md's own
   example) through `parseDoc` → four `theta/parse/doc-comment-misplaced`
   errors; `[bug 0358](./0358-doc-comment-descriptions-never-lower.md)`'s fixture → lowered `$defs`
   with no `description` key. Both under a green default suite.

Both directions: a pipeline-shaped witness (parse source → assert lowered
`description` bytes / assert zero diagnostics on the five anchors) reds at
HEAD on exactly the sibling defects — confirmed by the scratch probes —
so the gap is the witness's shape, not its strength.

## Expected behaviour

The coverage-matrix row's claim — descriptions.md discharged by V5c —
requires witnesses whose failure would follow from the obligations'
violation. For behavioural obligations stated over theta source
("Consecutive `///` lines are joined…", "Theta emits description text
byte-for-byte into the lowered schema", the placement list), that means
assertions over `parseThetaDocument` outputs (diagnostics; lowered
schema bytes), as every neighbouring area's e2e tests already do
(`tests/helpers/e2e-s1.ts` exists for exactly this).

## Actual behaviour / root cause

The V5c-T/V5c task pair shipped its tests against the seam module and its
implementation *of the seam module*, and the integration step wired only
the placement check — with a narrower anchor adapter than the checker
supports. Because the tests bind the seam functions directly, the missing
integration turned them from red-until-implemented into
green-while-unintegrated. The module header's "stubs … so the failing
tests compile and red" contract silently inverted: the tests can no longer
red on anything the pipeline does.

## Why it matters

- This is the mechanism by which two substantial defects (a documented
  feature that errors on its own example; a silent whole-feature no-op)
  survived 347 releases under a green gate and a coverage matrix that
  reports the area closed.
- The `"field"`/`"variant"` unit cases are actively misleading: they
  assert acceptance for anchors the integrated system rejects, so a reader
  auditing coverage by test names concludes the opposite of the truth.

## Non-goals

- The two functional defects themselves (candidates 01/02).
- The seam functions' internal correctness — not contested; their unit
  assertions can stay as implementation tests once a pipeline witness
  exists.
- Coverage-matrix process/governance questions beyond this row.

## Fix

This report's own deliverable is the residual no 01/02 fix touches:

1. Re-point the `cka-9` row (`coverage-matrix.md:134`) at witnesses that
   bind the pipeline, so the matrix's reachability claim becomes true.
2. Replace `src/parser/descriptions.ts:1–22`'s stale V5c-T framing
   ("stubs … so the failing tests compile and red") with the actual
   disposition of the module.
3. Correct the actively-misleading `"field"`/`"variant"` unit cases in
   `tests/descriptions.test.ts` — they assert acceptance for anchors the
   integrated system rejects; rename/annotate them as seam-function tests
   over arms production cannot reach (or drop them once the pipeline
   witnesses exist).

The pipeline witnesses themselves (source in, diagnostics + lowered bytes
out: the five-anchor acceptance set including a field, a variant, and a
`subagent fn`; the misplaced set; the multi-line join + dedent +
blank-line vector asserted on lowered `description` bytes; the
`//`-not-propagated rule; the `////` non-doc rule) red at HEAD on
`[bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)` and `[bug 0358](./0358-doc-comment-descriptions-never-lower.md)`
by construction, so they land as those fixes' witnesses — stated here as
a constraint on those fixes, not as this report's deliverable. Ordering:
this report lands with/after `[bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)` +
`[bug 0358](./0358-doc-comment-descriptions-never-lower.md)`. Keep the existing unit tests as
secondary implementation tests.

## Provenance

Found while hunting candidates 01/02: the first question after probe 1
("how did this ship?") is answered by this report. Evidence gathered at
af476df2: the grep in §Reproduction, `tests/descriptions.test.ts` read in
full, `tests/whole-program-parser.test.ts:355–395`, coverage-matrix.md:134,
and the corpus `///` census (one hit, a `//` comment *about* `///` in
`tests/fixtures/h7b-invalid/malformed.theta:8`).

## Fix (0.374.0)

- What shipped (records-only; 0112-shape verification-gap; lands after 0357/0358 which own the pipeline witnesses):
  - `docs/plan_topics/coverage-matrix.md` — `cka-9` row re-pointed: `V5c` kept as the sole backtick leaf (H5d tokenizes the closing-leaf cell to exactly {V5c}; single-leaf, so the H5f per-facet arm is not triggered) plus a bare-prose annotation naming the pipeline witnesses that now bind the area — `tests/b0357-doc-comment-field-variant-anchors.test.ts` (parse-source → placement diagnostics + registration) and `tests/b0358-doc-comment-descriptions-lower.test.ts` (lowered-schema description bytes) — with `tests/descriptions.test.ts` cited as secondary seam-level implementation tests (deliverable 1). Mirrors the shipped INV-1 annotation form; CRLF preserved.
  - `src/parser/descriptions.ts` — the stale "V5c-T … stubs the behaviour-bearing functions so the failing tests compile and red" header framing replaced with the actual post-0357/0358 disposition: `joinDocComment` and `checkDocCommentPlacement` are production-wired via `scanDocComments` (over the five anchors `classifyDocAnchor` now mints, including field/variant); `extractDescription` and `lowerDescription` have no production caller (production attaches descriptions onto the AST anchor in `attachDocDescriptions` and the schema lowering carries them into `$defs`), exercised only as seam-level implementation tests; the end-to-end pipeline is witnessed by b0357-* / b0358-* (deliverable 2). The 0358-era forward pointer "its disposition is tracked by bug 0360" recast to settled provenance (review F1; comment-only).
  - `tests/descriptions.test.ts` — file header and describe/it comments re-judged to the truth: the `checkDocCommentPlacement` `field`/`variant` cases now MATCH production reality (annotated PRODUCTION-WIRED — `classifyDocAnchor` mints those anchors structurally since 0357, so they are no longer arms production cannot reach); `lowerDescription`'s `field`/`variant` arms annotated SEAM-ONLY (no production caller); the stale "these tests red because … every seam is an inert stub" framing corrected (deliverable 3; comment/label-only, zero assertion changes).
- Re-measured premise (doc's was STALE): the doc claimed production only supplies `{schema,enum,fn,other}` anchors; 0357 (0.356.0) made `classifyDocAnchor` mint `field`/`variant` structurally, so `checkDocCommentPlacement` now receives them in production. The field/variant placement cases are therefore no longer misleading — corrected to reflect that rather than annotated as unreachable.
- Gates: full suite `npx vitest run` → 550 files / 10232 tests green (identical to fork baseline 074740b1); `tests/descriptions.test.ts` 4/4 green (assertions unchanged); closing-gate / whole-program-parser / b0357 / b0358 green; `npm run typecheck` clean; `npm run lint` clean; live `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0358-doc-comment-description-lowering.test.ts` → PASS under the live lock (adjacent existing cell; NO registration/drive change, so no new cell).
- Review: 1 round + comment-only polish. R1 (`bug-fix-reviewer`, deep) — one fidelity finding F1 (header kept 0358's open-tracker clause this fix settles); fixed by recasting the clause to settled provenance (comment-only). The reviewer also ran the gate's own tokenization functions and confirmed `cka-9` → {V5c} and the H5f arm skips the single-leaf row. Post-polish confirmation: F1 hunk comment-only + targeted gate re-run green → confirmation review round skipped (polish verified by gate-diff).
- Verification: PASS. `bug-fix-verifier` (lean) plus orchestrator gate re-runs and the independent deep review all discharge the obligations (records-only 0112-shape fix: no behavioural Phase-1 witness to revert→red; the corrected records verified TRUE against re-measured production reality — production callers grepped, `classifyDocAnchor` / `attachDocDescriptions` read; `cka-9` tokenises to exactly {`V5c`}; all diffs comment/prose-only by `git diff -U0`).
- Residuals: R1 (non-blocking, follow-up) — the seam placement test's `ineligible` list omits `"other"`, the only misplaced string production actually mints; correcting it is a §Fix-forbidden assertion change, so left for a later assertion-touching change (the production `"other"` path is already pipeline-witnessed by whole-program-parser.test.ts and b0357).
- Discharge notes appended: `src/parser/descriptions.ts`'s 0358-era "tracked by bug 0360" clause is settled by this fix (recast in place; the clause lived inside this fix's deliverable-2 surface, so no separate sibling-doc note is owed).
- Pinned dispositions / non-goals: the two functional divergences (0357/0358) are NOT this fix's deliverable — they landed as sibling fixes and own the pipeline witnesses. The seam functions' internal correctness is not contested; `tests/descriptions.test.ts` is kept as secondary implementation tests (comment/label edits only, per §Fix — no assertion moved).

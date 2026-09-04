# Bug 0404 — The custom-type-unsafe note's shipped pairing (`display: true`, failure-mode-template `content`, `details: { diagnostics: [Diagnostic] }`) fits no row of the normative per-variant matrix — and the single-element `theta/runtime/*` row's parenthetical selector is ambiguous enough to over-match the note against the `"theta /<name> aborted: …"` framing

- **Status:** fixed (0.414.0).
- **Kind:** spec gap — two normative surfaces in `runtime-event-channel.md`
  disagree: the group-B partition bullet (`:60`, added by 0398) classifies
  the BNDR-9 note's structured half as a single-element diagnostics batch,
  while the four-shape bullet (`:22`) and the per-variant matrix (`:29–36`)
  enumerate exactly two content pairings for diagnostics-shaped notes —
  serialised diagnostic lines, or the `aborted:` panic framing — neither of
  which the shipped (and BNDR-9-mandated) failure-mode template satisfies.
  No matrix row fits the shipped pairing (the 0401 matrixless-note pattern,
  one rung up).
- **Sev/Diff estimate:** S5/D1 — S5: doc/registry inconsistency, but crisp
  and consumer-relevant (a matrix-driven consumer classifying
  diagnostics-notes by the two enumerated content forms mis-parses this
  note; the note is rowless under the matrix's label-inclusive reading and
  over-matched under its parenthetical reading). D1: one additive matrix row + one clause in the
  four-shape bullet, exactly what 0398's Residual 1 already drafted.
- **Related:**
  - 0398 (fixed 0.391.0) — the parent fix; its §Residuals item 1 (reviewer
    F1, deferred as beyond the parent's settlement) names this exact gap and
    closes "Recommend a follow-on bug/parent decision to add the additive
    matrix row + four-shape content-case." No follow-on was filed; this is
    it.
  - 0265 — the spec-text byte-stability gate constraining edits to these
    lines (`tests/b0265-…-gate.test.ts`); any fix must move it additively.
  - 0401 (fixed 0.390.0) — the sibling partition clarification
    ("Informational notes carry no `details`", `:40`) showing the house
    pattern for closing exactly this kind of partition hole.
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:22` —
    the `diagnostics` shape's content enumeration: serialised
    `<file>:<line>:<col>: <code>: <message>` lines for parse/load/type
    batches; the `aborted:`/`aborted with internal error:` framing for the
    runtime-panic single-element case. No third case.
  - same file `:29–36` — "Per-variant `display` / `content` pairings
    (normative)": row `:31` (parse/load/type batch) and row `:32`
    (single-element batch, `theta/runtime/*` code → content
    `"theta /<name> aborted: <message>"`). Row `:32`'s label is "runtime
    panic (single-element batch, `theta/runtime/*` code …)": read
    label-inclusively, no row selects the custom-type-unsafe note at all;
    read by the parenthetical alone, the row over-matches the note — which
    IS a single-element batch carrying a `theta/runtime/*` code — and
    mandates a content it does not have.
  - same file `:60` — the group-B bullet: the BNDR-9 rejection's structured
    half is its registered diagnostic, `details: { diagnostics: [Diagnostic] }`.
  - `docs/spec_topics/binder/binder-model-and-context.md:137` (BNDR-9) — the
    user-facing note "resolves through the Failure-mode templates
    (normative) row for the custom-type-unsafe cause" — i.e. content
    `theta /<name>: custom-message type is not transcript-safe: '<value>'`,
    NOT the `aborted:` framing.
  - `src/extension/production-theta-producer.ts:1401–1411` —
    `#emitCustomTypeUnsafeNote`: ships `content:
    renderCustomTypeUnsafeNote(...)` (`src/binder/compact-transcript.ts:347`),
    `display: true`, `details: { diagnostics:
    [customTypeUnsafeDiagnostic(value)] }` — conformant to `:60` + BNDR-9,
    outside every `:29–36` row.
- **Observed at:** v0.398.0 (`c2c25d81`), offline — documentary (all cited
  lines read at pin); the shipped note shape is pinned by the committed
  0398 witness `tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts`
  (green in the default suite), so no new probe was needed.

## Summary

Bug 0398 made the custom-type-unsafe note carry its registered diagnostic in
`details` (group B) and added the group-B classification bullet to
`runtime-event-channel.md`. That made the note the first non-panic
single-element diagnostics-batch note. The per-variant matrix — the page's
own "(normative)" pairing table — was not extended (deliberately: 0398's
§Fix constraint 2 scoped the same-commit DIAG-2 obligation to the group-A/B
classification, and the matrix carries b0265 byte-stability pins the lane
could not self-authorise moving). Result at pin: no matrix row fits the
shipped pairing. Row `:32` is labelled "runtime panic", which on a
label-inclusive reading excludes the note (leaving it rowless); its
parenthetical ("single-element batch, `theta/runtime/*` code") over-matches
the note and would mandate `content = "theta /<name> aborted: <message>"`,
while BNDR-9 and the shipped emission use the failure-mode template
(`theta /<name>: custom-message type is not transcript-safe: '<value>'`).
The ambiguity makes the row's selector unusable either way; the
classification bullet (`:60`) says the note is well-formed while the
pairing table gives it no row.

## Reproduction

Documentary; no runtime divergence is claimed (the implementation matches
`:60` + BNDR-9 and is witnessed by the committed b0398 test):

1. Read `runtime-event-channel.md:22` — two content cases for the
   `diagnostics` shape.
2. Read `:32` — the single-element `theta/runtime/*` row's mandated content.
3. Read `:60` — custom-type-unsafe is group B (diagnostics shape).
4. Read `binder-model-and-context.md:137` — its content is the failure-mode
   template.
5. Observe `production-theta-producer.ts:1401–1411` — the shipped note is
   (display: true, failure template, single-element `theta/runtime/*`
   diagnostics batch): satisfying `:60`; enumerated by neither `:22` case;
   rowless under `:32`'s label-inclusive reading, over-matched (with the
   wrong content mandate) under its parenthetical reading.

## Expected behaviour

The matrix header declares the pairings normative; the four-shape bullet
declares the content companions per shape. A note the same page classifies
as group B must have a row whose selector matches it and whose content cell
names the failure-mode template — the additive row 0398's Residual 1
recommended (selector: "single-element batch, registered `theta/runtime/*`
diagnostic routed as an operator-facing note rather than a top-level panic
(the BNDR-9 custom-type-unsafe rejection)"; display `true`; content: the
Failure-mode templates row for the custom-type-unsafe cause). Row `:32`'s
selector must be narrowed to the panic case it describes ("runtime panic"
is already in its label; the parenthetical selector "(single-element batch,
`theta/runtime/*` code …)" is what over-matches).

## Actual behaviour / root cause

0398 landed the classification half of the spec change and deferred the
content-pairing half as beyond its parent adjudication (a defensible lane
boundary, recorded honestly). The deferral's recommended follow-on bug was
never filed (the fixer filed zero residual bugs across 0386–0401), so the
gap has no tracking artifact and would survive indefinitely.

## Why it matters

The matrix is the page's machine-checkable contract for consumers
(renderers, transcript tooling, conformance gates). Under its current text a
conformance checker either (a) finds no row for the note — or, reading row
`:32` by its parenthetical, flags it as a content violation — or (b)
special-cases the note with knowledge
the spec does not state — both are the definition of an unwitnessable
contract. The group-B dedup/emission reasoning 0398 built ("the registered
diagnostic lands on the wire exactly once") is normatively anchored on a
table that gives its note no row.

## Non-goals

- The note's shipped bytes, the BNDR-9 predicate, and the group-B
  classification (all correct per `:60` + BNDR-9; nothing behavioural moves).
- The group-A rows, the informational-notes clause, and the panic rows of
  the matrix.
- The `theta/parse/interpolated-result` exception wiring (already enumerated
  in both `:22` and `:32`).

## Fix

One additive edit set to `runtime-event-channel.md`: (1) a third content
case in the `:22` bullet for "a registered `theta/runtime/*` diagnostic
routed as an operator-facing note (BNDR-9 custom-type-unsafe)" whose content
is the failure-mode template; (2) the matching matrix row; (3) one
narrowing parenthetical on row `:32` scoping it to the panic framing
(exclude notes the new row claims). Constraint from the b0265 gate
(`tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts`): `locateSite`
locates its sites by content with an exactly-one-match precondition; the
matrix-row predicate is `l.startsWith("|") &&
l.includes("runtime panic (single-element batch")`, so the additive row
MUST NOT contain the substring `runtime panic (single-element batch`, and
the `:22` bullet must remain a single line starting
`` - `details: { diagnostics: Diagnostic[] }` `` that still contains
"runtime-panic case" and its `errors-and-results.md` cross-reference. Must
also keep the DIAG-2 corpus gate green (0398's fix demonstrated additive
edits to this page pass both). Requires the parent-decision step 0398's residual named —
this is a spec-meaning change, deliberately not self-authorised by the fix
lane.

## Provenance

fix-residuals-4 sweep over bugs 0386–0401: developed from 0398 §Residuals
item 1 (named-but-unfiled follow-on). All lines re-verified at `c2c25d81`;
shipped note shape confirmed via the committed b0398 witness rather than a
new probe. Dup check: README index carries no report on the matrix pairing;
0398, 0401, 0397 read in full (0401's clause covers detail-LESS notes only;
this note carries details and is outside that clause).

## Fix (0.414.0)

- What shipped: one additive edit set to `docs/spec_topics/pi-integration-contract/runtime-event-channel.md`, docs-only (0398 Residual 1, ratified by this lane dispatch). (1) The four-shape `details: { diagnostics: Diagnostic[] }` bullet gains a third content case (in place, one physical line): a registered `theta/runtime/*` diagnostic routed as an operator-facing note rather than a top-level panic (the BNDR-9 custom-type-unsafe rejection) whose companion content is the Failure-mode-templates row `theta /<name>: custom-message type is not transcript-safe: '<value>'`. (2) A new per-variant matrix row selecting that operator-facing-note case (display `true`, content = the failure-mode template, linking `#failure-mode-templates-normative`), placed under the panic row and NOT containing the substring `runtime panic (single-element batch`. (3) The panic row is narrowed with one clause scoping it to the top-level-panic framing, keeping its `runtime panic (single-element batch` substring, its `theta/parse/interpolated-result` qualifier, and its errors-and-results.md cross-reference. Net: the shipped BNDR-9 note is now covered by exactly one matrix row; nothing behavioural moves.
- Gates: witness `tests/b0404-custom-type-unsafe-note-matrix-row.test.ts` 6/6 (RED at fork on cells 1/2/3 — the note is rowless / the bullet enumerates only two content cases / the panic row is unnarrowed; green after); b0265 gate 5/5; b0398 3/3; b0397 7/7; b0401 10/10; corpus citation gate `tests/citation-symbol-form-gate.test.ts` 3/3; full default suite 572 files / 10442 tests green; `npm run typecheck` clean; `npm run lint` clean.
- Review: 1 round. Round 1 (bug-fix-reviewer) — CLEAN, no blocking finding; two non-blocking follow-on residuals recorded below.
- Verification: bug-fix-verifier verdict SOLID. Revert-witness — deleting the new matrix row reds cell 1, removing the third content case reds cell 2, dropping the narrowing clause reds cell 3; all three restore to 6/6 byte-exact (numstat 3/2, 0 EOL churn). Full suite 572/10442 green in one run. b0265 + citation gate green; no bare `:N` continuation remains in the witness. Typecheck + lint clean. Live: the orchestrator ran the adjacent theta-system-note emission cell `tests/live/err-note-render-record-error-field-live-cell.test.ts` green (WHY: documentary, note bytes/details byte-unchanged and b0398-unit-pinned, no drive/registration outcome changes; the cell witnesses the real theta-system-note err-note emission path is unaffected).
- Residuals: 1. Sibling single-element operator-facing-note diagnostics one rung over (e.g. `theta/runtime/watcher-terminated` and the other `theta-system-note`-routed registry rows) remain rowless under the same matrix reading — the same defect class 0404 fixed for the BNDR-9 note; adding rows for them exceeds this lane's ratified 3-edit settlement, so a follow-on bug continuing the 0401 -> 0398 -> 0404 ladder is warranted (reviewer R1). 2. The four-shape bullet's head still classifies the shape as "parse / load / type / runtime-panic diagnostic batch" while its tail now carries a fifth content companion; a follow-on editorial head-widening (tolerated by the b0265 predicates) would remove the tension (reviewer R2). 3. Comment-citation drift: the new matrix row adds one line, so `runtime-event-channel.md:N` line-cites for N >= 33 (notably `:83`) in sibling comments/messages — bug docs (0066, 0355, 0356, 0397, 0398, 0399), tests (b0355, b0397, b0399, binder-post-merge-ajv-enforcement), and src WHY-comments (production-theta-producer.ts, theta-composition-producer.ts, active-invocation-registry.ts) — now point one line early. All are comment/message-only (no assertion keys on those line numbers; b0397 asserts behaviour, b0265 locates by content), so nothing reds; matching 0398's same-page additive precedent these are left for a follow-on citation-drift sweep rather than swept across un-owned files here.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: honoured the b0265 byte-stability pins (panic-row substring + qualifier + xref preserved; bullet stays one line with "runtime-panic case"; group-B bullet, group A/B partition, and `console.error` exclusions unchanged), the shipped note bytes / BNDR-9 predicate / group-B classification (nothing behavioural moved), and the LPA line-pin (`tests/live/live-production-acceptance.test.ts` not touched).

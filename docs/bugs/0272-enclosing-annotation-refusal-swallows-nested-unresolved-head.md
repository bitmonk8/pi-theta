# Bug 0272 — an enclosing construct's `theta/parse/annotation-type-not-expression`, which carries the whole declaration's range, satisfies `captureWindowAlreadyRefused` for every `unresolved-named-type` capture nested in that declaration's body, so `fn f(): integer-- { let y: Gone = 1  1 }` draws one diagnostic where the widened registry row promises two

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because registration is refused either way
  (the enclosing refusal is error-severity, so the theta does not register) and
  the cost is one missing line plus a registry row whose prose promises more
  than fires; D1 because the remedy is either one qualifying clause in one
  registry row or a one-predicate narrowing of an existing filter, both bounded
  by bug 0262's landed 26-cell witness.
- **Kind:** defect — divergence between the widened
  `theta/parse/unresolved-named-type` registry row's glosses and the landed
  suppression predicate. The predicate implements bug 0262's operator ruling
  clause (iv)(3) literally; the row states a stronger promise than the
  predicate keeps.
- **Affected:** `src/parser/theta-document.ts`
  (`captureWindowAlreadyRefused`, its same-walk-refusal filter keyed on
  `UNRESOLVED_NAMED_TYPE_CODE`, `captureAbsorptionWindow`, `fnHeaderWindow`,
  and the three call sites in `walkStatement`'s `"let"`, `"fn"` parameter and
  `"fn"` return arms plus `walkExpr`'s `"invoke"` arm;
  `annotationTypeNotExpressionDiagnostic`, which is minted with the enclosing
  statement's `s.range`);
  `docs/spec_topics/diagnostics/code-registry-parse.md` (line 112, the
  `theta/parse/unresolved-named-type` row's *Trigger*, sentences "A refusal
  drawn for ANOTHER capture's head is never such cover…" and "One written
  mistake draws one diagnostic naming it, and two written mistakes draw two.").
- **Observed at:** HEAD `76489c61`, v0.266.0.

## Summary

Bug 0262's widening (0.266.0) added `theta/parse/unresolved-named-type` at four
captures and bounded it with clause (iv)(3): the refusal is withheld when the
capture's absorption window is already covered by an error-severity diagnostic
naming the real fault. `captureWindowAlreadyRefused`
(`src/parser/theta-document.ts`) tests position-precise overlap between that
window and any error-severity diagnostic, filtering out only rows this same
walk drew under `UNRESOLVED_NAMED_TYPE_CODE`.

`annotationTypeNotExpressionDiagnostic` is minted with the whole enclosing
statement's range. For an `fn`, that range spans the body. Every
`unresolved-named-type` capture nested inside the body therefore overlaps it,
and every such capture withholds — even though the enclosing refusal names a
different construct's annotation and says nothing about the nested head.

`fn f(): integer-- { let y: Gone = 1  1 }` draws
`theta/parse/annotation-type-not-expression` for `f`'s return annotation alone.
`Gone` is a written, unresolvable `NamedType` head at reference position r1, and
the same `let` in a well-formed `fn` draws the refusal. The behaviour is
byte-identical to pre-0262 HEAD and registration is refused either way; what
moved in 0.266.0 is the registry row, which now promises that two written
mistakes draw two diagnostics.

## Reproduction

At HEAD `76489c61`, each body appended to a minimal frontmatter (`name`,
`description`) and parsed through `parseDoc` (`tests/helpers/e2e-s1.ts`).
Load-stage rows (`theta/load/missing-mode`,
`theta/load/unknown-frontmatter-field`) are elided; only `theta/parse/*` rows
are listed, with ranges as `line:column`.

| # | body | `theta/parse/*` drawn | reading |
|---|---|---|---|
| a | `fn f(): integer-- {`<br>`  let y: Gone = 1`<br>`  1`<br>`}`<br>`1` | `annotation-type-not-expression` @5:1–8:2 | the subject: two written mistakes, one diagnostic; the enclosing range spans the body |
| b | `fn f(): integer {`<br>`  let y: Gone = 1`<br>`  1`<br>`}`<br>`1` | `unresolved-named-type` @6:3–6:18 | control — the nested head refuses when the enclosing annotation is well formed |
| c | `fn f(): integer-- {`<br>`  let y: number = 1`<br>`  1`<br>`}`<br>`1` | `annotation-type-not-expression` @5:1–8:2 | control — the enclosing refusal alone, no nested head |
| d | `let q: integer-- = 1`<br>`let y: Gone = 1`<br>`1` | `annotation-type-not-expression` @5:1–5:21, `unresolved-named-type` @6:1–6:16 | sibling-statement control — both emit; the enclosing range does not reach the second statement |
| e | `let y: Gone = 1`<br>`let q: integer-- = 2`<br>`1` | `unresolved-named-type` @5:1–5:16, `annotation-type-not-expression` @6:1–6:21 | same control, reversed order — order does not matter |
| f | `fn f(): integer-- {`<br>`  fn g(z: Gone): number { 2 }`<br>`  1`<br>`}`<br>`1` | `annotation-type-not-expression` @5:1–8:2, `nested-fn` @6:3–6:30 | the nested `fn` parameter head is swallowed too; two coverers overlap it here |

Lawful same-construct suppression, fenced — these are clause (iv)(3)'s decided
behaviour and are not part of this report's subject:

| # | body | `theta/parse/*` drawn | reading |
|---|---|---|---|
| g | `let x: Gone-- = 1`<br>`1` | `annotation-type-not-expression` @5:1–5:18 | one construct, one written annotation, one diagnostic |
| h | `fn f(): Gone-- { 1 }`<br>`1` | `annotation-type-not-expression` @5:1–5:21 | same, at the return slot |

Cells (a) and (b) differ by two characters in `f`'s return annotation. That
difference removes the nested head's diagnostic.

## Expected behaviour

One of the two, adjudicated:

- The nested written head also draws
  `theta/parse/unresolved-named-type` in cell (a) — the suppression covers only
  a diagnostic ranged over the same construct whose capture is being judged, so
  cell (a) draws two rows and cells (g) and (h) stay at one; or
- `docs/spec_topics/diagnostics/code-registry-parse.md`'s
  `theta/parse/unresolved-named-type` row states the exception — an
  error-severity refusal carrying an ENCLOSING declaration's range covers every
  capture window nested inside that declaration's body, and the nested head
  stays silent — so the row's promise and the predicate agree.

Either way, the row's *Trigger* and the predicate describe the same input set.

## Actual behaviour / root cause

`captureWindowAlreadyRefused` (`src/parser/theta-document.ts`) answers `true`
when any error-severity diagnostic's range overlaps the capture's absorption
window, with one exclusion: a row drawn by this same walk under
`UNRESOLVED_NAMED_TYPE_CODE`. That exclusion exists so one head's refusal cannot
swallow another head's. No exclusion covers a refusal of a different code drawn
for a different construct.

`annotationTypeNotExpressionDiagnostic` is called at three sites in
`walkStatement` with the enclosing statement's `s.range`, and the registry row
for `theta/parse/annotation-type-not-expression`
(`docs/spec_topics/diagnostics/code-registry-parse.md` line 107) states that
range choice normatively: "Every diagnostic carries the declaration's range — a
`let` statement's, or an `fn` declaration's". An `fn` declaration's range spans
its body, so it overlaps every capture window inside the body:
`captureAbsorptionWindow` narrows the NESTED capture's window, but nothing
narrows the COVERING diagnostic's range.

The predicate is therefore a literal implementation of clause (iv)(3)'s trigger
("suppress where an error-severity diagnostic already covers the capture's
window"). The trigger's justification — capture debris absorbed from a
different authoring mistake — does not hold for this shape: the covering
diagnostic names a different construct's annotation, and the nested head is
text the author wrote at a covered position.

The registry row's own glosses assert the opposite outcome. Line 112 states "A
refusal drawn for ANOTHER capture's head is never such cover: it names that
head and says nothing about a head written at a reference position nested inside
its window, so an `fn` parameter type and a `let` annotation in that function's
body … each keep their own refusal", and closes "One written mistake draws one
diagnostic naming it, and two written mistakes draw two." Cell (a) has two
written mistakes and draws one diagnostic. The first sentence is true as
written — it scopes itself to a refusal drawn for another capture's HEAD, which
is exactly the filtered `UNRESOLVED_NAMED_TYPE_CODE` case — but the second
sentence states the general rule the shape breaks.

## Why it matters

The widened row's head sentence promises one diagnostic per written mistake and
the row's closing sentence states the count rule without qualification. An
author reading the row expects `Gone` to be named and receives no line for it;
a reader deriving witness cells from the row derives a cell the code fails.
This repeats bug 0262's own pattern — a registry row's head sentence promising
more than the predicate fires — one level down, in the row the 0262 fix itself
rewrote.

The cost is bounded: the enclosing refusal is error-severity, so the theta does
not register in either reading, and no program loads that should not.

## Non-goals

- Clause (iv)(3)'s same-construct suppression. Cells (g) and (h) are the decided
  behaviour under bug 0262's operator ruling, ratified by that fix's review
  rounds 3 and 4, and stay. A route that widens the filter keeps them at one
  diagnostic each.
- Bug 0262's r1–r9 emissions, its clause-(iv)(1) builtin error-model admission,
  its clause-(iv)(2) propagation withholds, and the seven already-emitting
  positions. All byte-stable under either route.
- The initialiser-less `let` / body-less `fn` fallback window (bug 0262
  residual 2) and the propagated `Result` E-side silence (residual 3). Separate
  subjects.
- The range `annotationTypeNotExpressionDiagnostic` carries. Narrowing it would
  move bug 0124's registered behaviour and every witness pinned to it.

## Fix

Adjudicable between two routes.

**(a) Qualify the registry row.** Add one clause to
`docs/spec_topics/diagnostics/code-registry-parse.md`'s
`theta/parse/unresolved-named-type` *Trigger* (line 112) stating the exception:
an error-severity refusal ranged over an ENCLOSING declaration — an `fn` whose
own header annotation is refused, whose diagnostic carries the whole
declaration's range — covers every capture window nested in that declaration's
body, and a head written there stays silent. Qualify the closing count sentence
accordingly. No source change, no witness change; bug 0262's 26 cells stay
byte-green.

**(b) Narrow the filter.** Change `captureWindowAlreadyRefused` so `own`
counts only a diagnostic whose range is contained in the construct whose capture
is being judged, rather than any overlapping one. Cell (a) then draws two rows,
cells (g) and (h) stay at one, and the registry row needs no edit. This adds an
emission to an input that currently loads refused-but-unnamed, so it is a
further `GOV-15` diagnostic-registry carve-out over the same in-scope set bug
0262's carve-out names, and requires a corpus sweep at the fix's own HEAD.

Locks either route must hold byte-green:

- `tests/b0262-unresolved-named-type-reference-positions.test.ts`, all 26 cells,
  including its artefact-suppression cells (groups D6 and D6 cont.), its
  capture-window geometry cells and its nested-capture cells (group D8). Route
  (b) adds cells rather than moving these.
- The seven already-emitting positions' bytes and the `unresolved named type
  '<name>'` *Message*.
- `tests/committed-fixture-parse-gate.test.ts` and the corpus sweep over
  `git ls-files '*.theta' '*.thetalib'` — zero newly-refusing shipped files.
- `tests/citation-symbol-form-gate.test.ts`.

## Provenance

Residual 1 of bug 0262's fix record
([0262](./0262-unresolved-named-type-silent-at-nine-reference-positions.md)
§Fix (0.266.0) → *Residuals*), which recorded the shape, its byte-identity with
pre-fix HEAD and both candidate closures. Filed as the sixteenth set's
residual-lift pass. The suppression predicate implements clause (iv)(3) of that
bug's operator ruling. The enclosing refusal's code and its declaration-ranged
diagnostic are
[0124](./0124-parsetype-trailing-punctuation-leniency.md)'s. All eight cells
above re-measured at HEAD `76489c61`, v0.266.0.

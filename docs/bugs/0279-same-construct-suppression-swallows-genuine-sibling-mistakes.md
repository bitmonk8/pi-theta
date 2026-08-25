# Bug 0279 — `theta/parse/unresolved-named-type`'s same-construct cover is decided by RANGE alone, and a coverer ranged over a whole declaration (`annotationTypeNotExpressionDiagnostic`'s statement-wide mint) or a whole nested declaration (`theta/parse/nested-fn`) contains a SIBLING head the author wrote, so `fn f(p: integer--, q: Gone): number { 1 }` and `fn f(): integer-- { fn g(z: Gone): number { 2 }  1 }` each draw ONE diagnostic for TWO genuinely-written mistakes

- **Status:** fixed (0.278.0).
- **Sev/Diff estimate:** S3/D2 — S3 because registration is refused either way
  (every row in §Reproduction carries an error-severity `theta/parse/*`
  diagnostic, so `hasLoadParseError` denies registration on both readings) and
  the measured cost is one missing line plus one extra edit-reload cycle for the
  author, who fixes the named fault and then learns of the second. D2 because
  the change reaches the coverer's minted range — which does not exist today as
  a value (`LetStmt.annotation`, `FnParam.type` and `FnDecl.returnType` are bare
  strings, `src/parser/theta-document.ts:458`, `:513`, `:580`) — plus bug 0124's
  range choice and an enumerated set of witness cells across three files. Argue
  D3 at pickup if the §Fix re-derivation's finding below holds under
  measurement: the narrowed mint alone moves neither subject cell, so the cover
  PREDICATE moves with it, and the true-debris fence and the sibling-head fix
  pull in opposite directions under any purely range-based test.
- **Kind:** defect — a diagnostic-completeness defect. Two mistakes the author
  wrote draw one diagnostic. No input registers that should not, and no legal
  source is refused; the divergence is between the count rule
  `docs/spec_topics/diagnostics/code-registry-parse.md:112` states ("One written
  mistake draws one diagnostic naming it, and two written mistakes draw two")
  and the shape that row's own next sentence now carves out.
- **Affected** (every citation re-derived at HEAD `48d5a3e1`;
  `src/parser/theta-document.ts` is 9296 lines at HEAD):
  - `src/parser/theta-document.ts:7578` — `captureWindowAlreadyRefused`, the
    clause-(iv)(3) predicate. Its `own` branch counts a coverer when
    `overlaps(d)` (the coverer's range meets the capture's absorption window)
    and `containedInConstruct(d)` (the coverer's range sits inside the construct
    whose capture is judged) both hold, with one exclusion: a row this walk drew
    under `UNRESOLVED_NAMED_TYPE_CODE` (`:6459`). Both terms are range tests.
  - `src/parser/theta-document.ts:6567` —
    `annotationTypeNotExpressionDiagnostic`, minted with the range its caller
    passes; every caller passes `s.range`, the enclosing statement's:
    `:8141` (`walkStatement`'s `"let"` arm), `:8266` (the `"fn"` parameter
    loop), `:8314` (the `"fn"` return slot).
  - `src/parser/theta-document.ts:8164`, `:8284`, `:8328`, `:8751` — the four
    `captureWindowAlreadyRefused` call sites (`let` annotation, `fn` parameter
    type, `fn` return type, `invoke<T>` ascription).
  - `src/parser/theta-document.ts:7611` — `captureAbsorptionWindow`; `:7626` —
    `fnHeaderWindow`. Both parameter captures and the return capture of one `fn`
    share ONE header window, which is why a coverer inside that header meets
    every one of that header's captures.
  - `src/parser/theta-document.ts:458`, `:513`, `:580` —
    `LetStmt.annotation: string | null`, `FnParam.type: string`,
    `FnDecl.returnType: string | null`. No annotation carries a range.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:112` — the
    `theta/parse/unresolved-named-type` *Trigger*, whose sentence "A refusal
    ALREADY drawn over the capture's OWN construct is cover whichever of that
    construct's captures earned it and whichever code OTHER THAN THIS ROW'S OWN
    it carries, so two written mistakes inside ONE construct draw one diagnostic
    when the coverer names a DIFFERENT fault" states this shape (bug 0272's
    same-commit spec edit) and cites both subject fixtures verbatim.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:107` — the
    `theta/parse/annotation-type-not-expression` *Trigger*: "Every diagnostic
    carries the declaration's range — a `let` statement's, or an `fn`
    declaration's".
  - `docs/spec_topics/diagnostics/code-registry-parse.md:93` — the
    `theta/parse/nested-fn` row, the second coverer in this report.
- **Observed at:** HEAD `48d5a3e1`, v0.272.0.
- **Scope:** the four widened captures of bug 0262 (`let` annotation, `fn`
  parameter type, `fn` return type, `invoke<T>` ascription). The `params:`,
  `@<T>`, schema-field, alias-arm, object-constructor and pattern-head positions
  do not consult this predicate and are unaffected.

## Summary

Bug 0272 (0.269.0) narrowed clause (iv)(3)'s suppression so a coverer ranged
over an ENCLOSING declaration is no cover for a capture nested in that
declaration's body. What it left standing is cover decided inside ONE construct,
where the test is still range containment alone. Two coverers reach that shape
with a range wide enough to contain a sibling's genuinely-written head:

- `annotationTypeNotExpressionDiagnostic`, minted with the whole statement's
  range, contains every other capture of the same header. `fn f(p: integer--,
  q: Gone): number { 1 }` draws the annotation refusal at 6:1–6:42 alone; `Gone`
  is an undeclared name the author typed in the parameter list, and it is
  silent.
- `theta/parse/nested-fn`, ranged over the inner declaration, contains that
  declaration's own parameter annotations. `fn f(): integer-- { fn g(z: Gone):
  number { 2 }  1 }` draws the enclosing annotation refusal and `nested-fn`;
  `Gone` is silent.

Neither head is capture debris. `fn f(q: Gone): number { 1 }` — the same
parameter list with the junk annotation removed — draws
`theta/parse/unresolved-named-type` naming `Gone`, and
`fn f(p: Nope, q: AlsoNope): number { 1 }` draws two refusals, one per head. The
range test cannot separate these from the true-debris case (`fn h(a: string`
followed by `let x = 1`, whose capture ABSORBED the spelling `stringletx`),
because in both the silenced text sits inside a range the coverer carries.

Registration is refused in every row of §Reproduction. This is a
diagnostic-completeness defect, not a silent-acceptance defect.

## Reproduction

At HEAD `48d5a3e1`, each body appended to the frontmatter
`---\ndescription: d\nmode: prompt\n---\n\n` and parsed through `parseDoc`
(`tests/helpers/e2e-s1.ts`). Every `theta/parse/*` row is listed with its full
extent as `startLine:startColumn-endLine:endColumn`; `Gone`, `Nope` and
`AlsoNope` are declared in no fixture. `registered` is read off the composition
root's predicate mirrored (`hasLoadParseError`,
`src/extension/production-composition.ts`): a document carrying an
error-severity `theta/load/*` or `theta/parse/*` row is not registered.

**(a) The subject — two written mistakes inside one construct.**

| # | body | drawn | registered |
|---|---|---|---|
| a1 | `fn f(p: integer--, q: Gone): number { 1 }`<br>`1` | `annotation-type-not-expression` @6:1-6:42 (`'p'`) | no |
| a2 | `fn f(): integer-- {`<br>`  fn g(z: Gone): number { 2 }`<br>`  1`<br>`}`<br>`1` | `annotation-type-not-expression` @6:1-9:2 (`'f'`), `nested-fn` @7:3-7:30 | no |

In a1 the coverer's extent (6:1–6:42) is the WHOLE declaration, so it contains
`q: Gone` at columns 20–27. In a2 the coverer for `z: Gone` is `nested-fn`,
whose extent (7:3–7:30) is the whole inner declaration and contains `z: Gone`.

**(b) Controls.**

| # | body | drawn | reading |
|---|---|---|---|
| b1 | `let q: integer-- = 1`<br>`let y: Gone = 1`<br>`1` | `annotation-type-not-expression` @6:1-6:21, `unresolved-named-type` @7:1-7:16 | two constructs draw two — 0272's landed behaviour, witness cell `b0272-SIB` (`tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:367`) |
| b2 | `fn f(): integer-- {`<br>`  let y: Gone = 1`<br>`  1`<br>`}`<br>`1` | `annotation-type-not-expression` @6:1-9:2, `unresolved-named-type` @7:3-7:18 | 0272's subject, fixed: the enclosing coverer is not contained in the `let` construct — witness cell `b0272-S` (`:299`) |
| c1 | `fn h(a: string`<br>`let x = 1`<br>`"ok"` | `single-line-if` @6:1-6:3, `fn-param-list-unclosed` @6:5-6:6 | TRUE DEBRIS: the parameter capture absorbed `stringletx`; ONE mistake, and the absorbed spelling must STAY silent (0262 witness group D6, `tests/b0262-unresolved-named-type-reference-positions.test.ts:1141`) |
| c2 | `fn f(): number 1`<br>`"ok"` | `single-line-if` @6:1-6:3 | TRUE DEBRIS: the return capture absorbed `number1`; must STAY silent (same group) |
| d1 | `fn f(q: Gone): number { 1 }`<br>`1` | `unresolved-named-type` @6:1-6:28 (`'Gone'`) | the baseline the rule restores: the same parameter list, junk annotation removed, names the head |
| d2 | `fn f(p: Nope, q: AlsoNope): number { 1 }`<br>`1` | `unresolved-named-type` @6:1-6:41 (`'Nope'`), `unresolved-named-type` @6:1-6:41 (`'AlsoNope'`) | two heads in ONE construct already draw two, because this row's own code is filtered out of `own` (`:6459`) — the count rule holds whenever both mistakes are heads |
| e1 | `let x: Gone-- = 1`<br>`1` | `annotation-type-not-expression` @6:1-6:18 | fence: ONE written annotation, ONE diagnostic — stays one under any fix (witness cell `b0272-F`, `:405`) |
| e2 | `fn f(): Gone-- { 1 }`<br>`1` | `annotation-type-not-expression` @6:1-6:21 | same fence at the return slot |

`registered` is `false` for every row above, a1 through e2, on both readings.

Cells d1 and d2 locate the inconsistency precisely: the count rule holds inside
one construct when the second mistake is a head this row itself names (the
`UNRESOLVED_NAMED_TYPE_CODE` filter), and fails when the coverer carries any
other code.

Measured with a throwaway offline probe over the ten bodies above
(`tests/b0279scratch.test.ts`, `parseDoc`, no provider), deleted per scratch
policy.

## Expected behaviour

Every genuinely-written unresolvable `NamedType` head draws its own
`theta/parse/unresolved-named-type` line naming it, whatever else in its
construct is already refused. Only text a capture ABSORBED from a different
authoring mistake — the class clause (iv)(3) names, `stringletx` and `number1`
— is suppressed.

Concretely: a1 draws the annotation refusal AND names `Gone`; a2 draws the
enclosing refusal, `nested-fn`, AND names `Gone`; c1 and c2 stay byte-identical
at one and two rows respectively; e1 and e2 stay at one; d1, d2, b1 and b2 stay
as measured. `docs/spec_topics/diagnostics/code-registry-parse.md:112`'s count
sentence then holds without the same-construct carve-out bug 0272 added to it.

## Actual behaviour / root cause

Cover is a range judgement, and neither coverer's range is the fault's own
extent.

1. `captureWindowAlreadyRefused` (`src/parser/theta-document.ts:7578`) answers
   `true` for an `own` coverer when its range overlaps the capture's absorption
   window and is contained in the judged construct. For an `fn` parameter type
   the window is `fnHeaderWindow(s)` (`:7626`) — the whole header, shared by
   every parameter and by the return slot — and the construct is `s.range`, the
   whole declaration. A coverer anywhere in the header therefore covers every
   capture of that header.
2. `annotationTypeNotExpressionDiagnostic` (`:6567`) is minted with `s.range` at
   all three call sites (`:8141`, `:8266`, `:8314`). Cell a1's coverer is
   `'p'`'s refusal carrying 6:1–6:42, so it covers `q`'s capture.
3. `theta/parse/nested-fn` (registry `:93`) is ranged over the inner `fn`
   declaration. In cell a2 the judged construct for `z`'s capture IS that inner
   declaration, so the coverer is contained in it and covers `z`.

The discriminating property — did the author WRITE this text, or did the
capture ABSORB it? — is not represented anywhere in the data the predicate
reads. `LetStmt.annotation` (`:458`), `FnParam.type` (`:513`) and
`FnDecl.returnType` (`:580`) are bare strings with no range and no provenance,
so the predicate has only ranges to reason with, and the ranges of a1's
absorbed-debris case and a1's written-sibling case are indistinguishable in
shape: in both, the silenced text lies inside the coverer's range or inside the
window the coverer meets.

**Bug 0124's range choice, re-derived (the §Fix prerequisite).** Bug 0124's fix
record states the choice without a separate justification: "Text at the three
`Type` positions outside a schema … is refused with one error-severity
`theta/parse/annotation-type-not-expression` at the declaration's range, and the
theta does not register"
(`docs/bugs/0124-parsetype-trailing-punctuation-leniency.md:1305`–`:1311`,
§Fix (0.121.0), the only sentence in that document that mentions the range).
The reason is structural rather than adjudicated, and it is stated for the
sibling row it was modelled on: `theta/parse/schema-type-not-expression`'s
*Trigger* reads "Every diagnostic carries the DECLARATION's range
(`SchemaFieldSource` and an arm string carry no range of their own)"
(`code-registry-parse.md:106`), and
`annotationTypeNotExpressionDiagnostic`'s own header comment declares itself
"Sibling to `schemaTypeNotExpressionDiagnostic` above" with ONE stated
difference — what `<name>` renders, not the range
(`src/parser/theta-document.ts:6559`–`:6567`). The annotation is in the same
position as an arm string: `parseType` returns text, and the three annotation
fields hold that text with no range beside it (`:458`, `:513`, `:580`). So the
declaration's range is used because it is the only range in hand at the emission
site, and the registry states that as normative after the fact
(`code-registry-parse.md:107`).

What else reads that range:

- `captureWindowAlreadyRefused`'s containment filter (`:7578`), bug 0272's
  landed narrowing — the subject here.
- Author-visible rendering: `src/diagnostics/diagnostic.ts:87` renders
  `${file}:${range.start.line}:${range.start.column}`. A narrowed mint moves the
  reported column for a `let` (from the statement's column 1 to the annotation's
  own start) and for an `fn` parameter (from the `fn` keyword to the parameter's
  type text).
- Witnesses that pin the extent, three files:
  `tests/qry4-refused-annotation-withhold.test.ts` (12 cells assert this code's
  extent explicitly, `:319`, `:341`, `:363`, `:408`, `:429`, `:437`, `:445`,
  `:453`, `:477`, `:511`, `:520`, and the file's header states "RANGES ARE PART
  OF EVERY EXPECTATION", `:62`–`:65`);
  `tests/fn-param-list-unclosed.test.ts:885`–`:886` and `:946`–`:948`;
  `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts`, every cell.
  Bug 0124's own witness (`tests/annotation-nontype-text-refusal.test.ts`) pins
  codes and messages, not this code's extent.

**What the re-derivation shows about route (2a).** Narrowing the mint alone
moves neither subject cell, derived from the predicate at HEAD:

- a1: with `'p'`'s refusal narrowed to `integer--`'s own span, that span still
  lies inside `fnHeaderWindow(s)` (so `overlaps` holds for `q`'s capture, which
  shares the header window) and still lies inside `s.range` (so
  `containedInConstruct` holds). `q: Gone` stays silent. The mint narrowing
  changes cell a1 only if the cover test is changed with it — cover measured
  against the JUDGED CAPTURE's own span rather than the shared header window.
- a2: the coverer is `theta/parse/nested-fn`, not this mint at all, so a1's
  narrowing is a no-op there. `nested-fn`'s range is the inner declaration's own
  extent — the fault's true extent — and it contains `z: Gone` legitimately.
  No narrowing of any range separates a2's written head from debris.
- The true-debris fence pulls the other way: in cell c1 the coverers are
  `single-line-if` @6:1-6:3 and `fn-param-list-unclosed` @6:5-6:6, and the
  absorbed capture `stringletx` starts at the parameter's type text (6:8) and
  runs to line 7. A cover test measured against the judged capture's own span
  therefore stops counting those coverers and c1 gains a refusal for absorbed
  debris — the outcome clause (iv)(3) exists to prevent.

## Why it matters

`docs/spec_topics/diagnostics/code-registry-parse.md:112` states the rule "One
written mistake draws one diagnostic naming it, and two written mistakes draw
two" and then carves this shape out of it in the following sentence. That
carve-out is the last documented exception to one-mistake-one-line in the parse
registry, and it is not derivable from anything an author can see: cells d1 and
d2 name `Gone` and name both heads, and cell a1 — the same parameter list with
one junk annotation added — stops naming `Gone`. An author fixing a1 removes
`--`, reloads, and only then learns that `q`'s type does not resolve.

The bound is exact: every affected input carries an error-severity
`theta/parse/*` row, so none registers on either reading, and no shipped source
moves. The cost is one missing line and one extra edit-reload cycle.

## Non-goals

- Bug 0272's landed containment filter (`src/parser/theta-document.ts:7578`,
  `own`'s `containedInConstruct` conjunct). It stays; cell b2 stays at two rows.
- Clause (iv)(3)'s suppression of capture DEBRIS. It stays. Cells c1 and c2 stay
  byte-identical. This report refines the clause's TRIGGER so that it selects
  the class the clause names, and does not reverse the clause.
- Bug 0262's r1–r9 emissions, its clause-(iv)(1) builtin error-model admission,
  its clause-(iv)(2) propagation withholds and the seven already-emitting
  positions.
- The `prior` branch's unnarrowed overlap test (bug 0272 residual 2). Separate
  subject, unobserved.
- The `@<T>`, `params:`, schema-field, alias-arm, object-constructor and
  pattern-head positions, which never consult this predicate.

## Fix

**Operator direction, recorded verbatim (this session):**

> file it and fix it properly — restore the clean rule 'every genuinely-written
> mistake gets its own line; only actual debris is suppressed', with route (2a)
> as the LEADING candidate: narrow the coverer's minted range to the malformed
> annotation's own span instead of the whole statement — with the explicit
> prerequisite that bug 0124's statement-range choice be re-derived and its
> rationale recorded BEFORE reversing it; route (2b) provenance-marking of debris
> fragments is the fallback if 0124's reason turns out load-bearing. The final
> route ruling happens at pickup, informed by the 0124 re-derivation this doc
> must carry.

**The prerequisite is discharged in §Actual behaviour / root cause.** Bug 0124's
statement-range choice is structural, not adjudicated: the annotation is a bare
string with no range of its own, and the declaration's range is the only range in
hand at the emission site. Nothing decided the width on its merits, so reversing
it costs a range threaded from `parseType`'s capture onto `LetStmt.annotation`,
`FnParam.type` and `FnDecl.returnType` (or beside them), plus the three consumers
listed there: the containment filter, the rendered column, and the three witness
files that pin the extent.

**Route (2a) — narrow the coverer's minted range to the annotation's own span.**
Thread a range for each captured annotation; mint
`annotationTypeNotExpressionDiagnostic` with it at `:8141`, `:8266`, `:8314`
instead of `s.range`; and measure the predicate with it. The re-derivation above
records what (2a) does NOT reach on its own: cell a1 needs the cover test
measured against the judged capture's own span, not the shared
`fnHeaderWindow`; cell a2's coverer is `theta/parse/nested-fn`, which no
narrowing of this mint touches; and a capture-span cover test reds the
true-debris fence (cell c1), because that fixture's coverers are token-ranged
and sit outside the absorbed capture's text. Any (2a) change-set therefore
either lands with a second discriminator or leaves a2 open and states so.

**Route (2b) — mark provenance on the capture.** Record, at capture time,
whether the captured annotation text is the text the author spelled at that
position or text absorbed past a syntax fault, and let clause (iv)(3) suppress
on that mark rather than on geometry. This addresses a1, a2 and the c1/c2 fence
by construction, since the property the clause names is exactly provenance, and
it leaves every minted range where bug 0124 put it — so the rendered column, the
three range-pinning witness files and bug 0272's containment filter all stay put.
Its cost is in `parseType`'s capture surface rather than in the diagnostic mint.

**The route ruling happens at pickup**, informed by the re-derivation above.
Either route is a further `GOV-15` diagnostic-registry addition inside the
in-scope set bug 0262's carve-out already names (a written, unresolvable
`NamedType` head at one of the ten reference positions), and requires the corpus
sweep at the fix's own HEAD.

**Ordering.** No fix ordering dependency on another open bug. Bug 0272's fix
(0.269.0) is landed and is the floor this builds on; bug 0124's fix (0.121.0) is
landed and its range choice is the prerequisite, discharged above.

**Locks — must stay byte-green.**

- `tests/b0262-unresolved-named-type-reference-positions.test.ts`, all 26 cells,
  and in particular the artefact-suppression groups D6 (`:1141`) and D6 cont.
  Route (2b) leaves them untouched; a route that reds them re-founds clause
  (iv)(3) rather than refining it, which is outside this report.
- Cells e1, e2 (bug 0272 witness group F, `:405`) at ONE diagnostic each, and
  cells b1, b2, d1, d2 as measured.
- `tests/committed-fixture-parse-gate.test.ts` and the corpus sweep over
  `git ls-files '*.theta' '*.thetalib'` — zero newly-refusing shipped files.
- `tests/citation-symbol-form-gate.test.ts`.

**Flips — each named, and each owed a re-founding or a re-pin.**

- `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts`, 8 cells. Under
  (2b): cell `b0272-F` (`:405`) row F3
  (`fn f(p: integer--, q: Gone): number { 1 }`, asserted `[ANNOTATION]` @6:1-6:42,
  `:428`) and cell `b0272-N` (`:437`, asserted
  `[ANNOTATION, NESTED_FN]` @6:1-9:2 / 7:3-7:30, `:460`) each gain the nested
  head's refusal and must be re-founded, since both are currently authored as
  fences on clause (iv)(3)'s decided behaviour. Under (2a) every cell that
  asserts an `annotation-type-not-expression` extent additionally re-pins:
  `b0272-S` (`:321`), `b0272-B-no-head` (`:359`), `b0272-SIB` both orders
  (`:394`–`:395`), F1/F2/F3 (`:428`), `b0272-N` (`:460`), `b0272-J` (`:503`),
  `b0272-K` (`:531`).
- `tests/qry4-refused-annotation-withhold.test.ts` — 12 pinned extents (`:319`,
  `:341`, `:363`, `:408`, `:429`, `:437`, `:445`, `:453`, `:477`, `:511`,
  `:520`). Re-pinned under (2a); untouched under (2b).
- `tests/fn-param-list-unclosed.test.ts:885`–`:886`, `:946`–`:948` — two pinned
  extents. Same disposition.
- `docs/spec_topics/diagnostics/code-registry-parse.md:112` — the
  same-construct sentence bug 0272 added, and the count sentence it qualifies.
  A same-commit spec edit under DIAG-2 restores the count rule and states the
  suppressed class as absorbed text rather than as a range relation.
- `docs/spec_topics/diagnostics/code-registry-parse.md:107` — under (2a) only,
  the sentence "Every diagnostic carries the declaration's range — a `let`
  statement's, or an `fn` declaration's" is false and moves with the mint.
  `docs/reference/diagnostics.md` mirrors code / severity / phase / *Message*
  only, so no mirror edit is owed for either route.

## Provenance

Residual 1 of bug 0272's fix record
([0272](./0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md)
§Fix (0.269.0) → *Residuals*), recorded-not-owned there: "**Two written mistakes
inside ONE construct still draw one diagnostic when the coverer names a
different fault.** `fn f(p: integer--, q: Gone): number { 1 }` draws the
annotation refusal alone, and `fn f(): integer-- { fn g(z: Gone): number { 2 }
1 }` keeps the inner `fn`'s own `theta/parse/nested-fn` as cover for `Gone` …
This is clause (iv)(3)'s decided same-construct behaviour, a §Non-goal here, and
it is now STATED in the registry row rather than left implicit — but it remains a
shape where the author receives no line for a head they wrote."

The suppression's charter is clause (iv)(3) of bug 0262's operator ruling
([0262](./0262-unresolved-named-type-silent-at-nine-reference-positions.md):642):
"(3) artefact spellings (stringletx, number1 — capture debris from other syntax
errors) are SUPPRESSED: the new emission is withheld when the capture's source
window is already covered by an error-severity diagnostic naming the real fault
— the generalization of the landed per-capture guard shape; one written mistake
draws one diagnostic naming it." This filing implements that clause's INTENT
more precisely and does not reverse it: the suppressed class stays "capture
debris from other syntax errors", and what moves is the trigger that selects it,
which today admits text the author wrote.

The coverer's declaration-wide range is
[0124](./0124-parsetype-trailing-punctuation-leniency.md)'s
(§Fix (0.121.0)), re-derived above as the §Fix prerequisite.

Filed by operator direction in the seventeenth session, elevating 0272's
residual 1 to a report of its own. All ten cells above measured at HEAD
`48d5a3e1`, v0.272.0, through an offline `parseDoc` probe deleted after use.

## Fix (0.278.0)

**Route ruling, adjudicated at pickup on the record.** Route **(2b) —
provenance-marked captures**, with no (2a) element. The §Fix re-derivation's
(2a)-insufficiency finding was re-measured at this fix's HEAD `8b39e071`
(v0.275.0, three moves of `src/parser/theta-document.ts` after filing) through
an offline `parseDoc` probe over all ten §Reproduction bodies: every row
reproduced byte-identically to the filing measurement, so the derivation stands.
Narrowing `annotationTypeNotExpressionDiagnostic`'s mint to `integer--`'s own
span leaves that span inside both `fnHeaderWindow(s)` and `s.range`, so cell a1
is unmoved; cell a2's coverer is `theta/parse/nested-fn`, which no mint change
reaches; and a capture-span cover test reds the true-debris fence, cell c1,
whose coverers are token-ranged at 6:1-6:3 and 6:5-6:6 and sit ahead of the
absorbed text. Route (2b) addresses a1, a2 and the c1/c2 fence by construction,
and it leaves every minted range where bug 0124 put it — so
`src/diagnostics/diagnostic.ts`'s rendered column, the 12 pinned extents of
`tests/qry4-refused-annotation-withhold.test.ts`, the two of
`tests/fn-param-list-unclosed.test.ts` and bug 0272's remaining extent pins are
byte-green rather than re-pinned. The ruling was validated by prototype before
dispatch: the prototype's full-suite run reded exactly the two flips this report
enumerates and nothing else.

The suppressed class is now stated as the capture's own provenance. A capture
that ENDED AT its own grammatical terminator holds exactly the text the author
spelled there, and no coverer is a verdict on it; a capture that did not is the
debris case clause (iv)(3) names. The clause's charter is refined, not reversed.

- What shipped:
  - `src/parser/theta-document.ts` — four optional AST provenance marks
    (`LetStmt.annotationAbsorbed`, `FnParam.typeAbsorbed`,
    `FnDecl.returnTypeAbsorbed`, `InvokeExpr.returnSchemaAbsorbed`), each set at
    capture time when the capture did not end at its own terminator (`=`; `,` or
    the list's `)`; the body `{` or a contextual `with`; the ascription's own
    `>`), and present only when true so a capture that ended at its terminator
    yields a node byte-identical in shape to before. The four
    `captureWindowAlreadyRefused` call sites gate the whole withhold on the
    judged capture's mark. Both branches are gated: the refined trigger is a
    property of the capture, not of the pass that drew the coverer.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the
    `theta/parse/unresolved-named-type` *Trigger*'s same-construct sentence
    replaced under DIAG-2. The count rule holds without the same-construct
    carve-out, and cover is stated as the capture's own provenance in its two
    shapes. Row `:107` is byte-unchanged, route (2b) moving no mint;
    `docs/reference/diagnostics.md` mirrors code / severity / phase / *Message*
    only, none of which moves, so no mirror edit is owed.
  - `tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts`
    — the nine-cell offline witness.
  - `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts` — witness
    cells `b0272-F` row F3 and `b0272-N` re-founded (subjects preserved,
    expectations and prose re-authored on the fixed behaviour) under this
    report's enumerated flip authority.
  - `docs/bugs/0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md`
    — dated coordination note discharging its residual 1 and recording the
    re-founding.
- Gates:
  - Witness — `npx vitest run tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts`:
    `Test Files  1 passed (1)` / `Tests  9 passed (9)`. Red before the fix on
    cells a1 and a2 for the filed reason, a missing
    `theta/parse/unresolved-named-type` naming `Gone`.
  - Full default suite — `npm test`: `Test Files  454 passed (454)` /
    `Tests  9349 passed (9349)`.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`): clean, no output.
  - `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`):
    clean, no output.
  - Enumerated locks re-run individually and green: the 26 cells of
    `tests/b0262-unresolved-named-type-reference-positions.test.ts` (the
    true-debris fence), `tests/qry4-refused-annotation-withhold.test.ts`,
    `tests/fn-param-list-unclosed.test.ts`,
    `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts`,
    `tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts`,
    `tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts`,
    `tests/b0273-query-result-error-side-unresolved-name.test.ts`,
    `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`,
    `tests/committed-fixture-parse-gate.test.ts`,
    `tests/citation-symbol-form-gate.test.ts`,
    `tests/conformance/production-conformance.test.ts`.
- Review: 2 rounds, plus one comment-only polish round.
  - Round 1 (deep) — three findings. (F1, spec) the registry *Trigger* and the
    capture comments overstated the implemented test as "ran past its terminator
    AND SO absorbed text", where the shipped test is the weaker "did not END AT
    its terminator", which also catches a capture that stops early having
    absorbed nothing. (F2, prose) `absent` written where `present` was meant in
    the `parseLet` capture comment. (F3, prose) a banned word in the witness.
    The predicate cannot be tightened to match the stronger prose — cell c1's
    genuine debris capture also halts at an `=`, so the weaker test is
    load-bearing for the fence — so F1's remedy is prose: the *Trigger* states
    cover in its two shapes and qualifies the count sentence for the
    stopped-early class.
  - Round 2 (deep) — clean, with two prose residuals in the witness header
    (single-shape wording surviving F1, and a misattribution of the e1/e2
    withhold to clause (iv)(3) where bug 0124's guard 1 decides).
  - Polish round (comment-only) — both residuals reworded. Zero executable
    hunks, verified by gate-diff: the executable lines are byte-identical to the
    prototype the route ruling was validated against. Confirmation review round
    skipped on that evidence.
- Verification: SOLID.
  - The witness genuinely witnesses. The four provenance gates were neutralised
    by a temporary local edit, reducing the withhold to geometry alone; cells a1
    and a2 red for the filed reason and the re-founded `b0272-F` row F3 and
    `b0272-N` red with them, proving the re-founding load-bearing. Restored
    byte-exact: `git hash-object src/parser/theta-document.ts` reads
    `aca81cfbe970b56e3b71f0ce1ad86cf9862a7b4e` before and after.
  - The full default suite is green, and each enumerated lock is green
    individually.
  - No live cell is owed, and the ruling was audited rather than asserted.
    `captureWindowAlreadyRefused` counts only error-severity coverers, and every
    error-severity code the parser mints carries a `theta/parse/` or
    `theta/load/` prefix, so a document this change adds a row to already
    carried an error-severity row and was already refused by `hasLoadParseError`
    (`src/extension/production-composition.ts`). A twelve-body offline probe run
    with the fix active and with it neutralised — including inputs that carry no
    error-severity row and register on both readings — returned an identical
    `registered` verdict for every body.
    `tests/committed-fixture-parse-gate.test.ts` is green, so no shipped
    `.theta` or `.thetalib` moves. Precedent: bugs 0254 and 0276.
  - Lint and typecheck are clean.
- Residuals:
  1. **A capture that STOPS EARLY, having absorbed nothing, still carries the
     provenance mark and is still covered.** `fn f(a: Gone = 1): number { 1 }`
     draws `theta/parse/fn-param-not-identifier` @6:14-6:15 alone; the parameter
     capture holds exactly `Gone`, the text the author spelled, and that head
     stays silent. `fn f(): Gone = 1` is the same shape at the return slot,
     beside `theta/parse/unsupported-feature`. Behaviour is identical to the
     pre-fix reading on both inputs, and the *Trigger* states the class
     explicitly rather than leaving it implicit. It cannot be closed by
     tightening the predicate to "ran past the terminator": cell c1's genuine
     debris capture (`stringletx`) also halts at an `=`, so that tightening reds
     the true-debris fence this report names as its hard constraint. Closing it
     needs a further discriminator and is a separate filing.
  2. **An unclosed `invoke<T>` ascription with no argument list draws nothing
     and registers.** `let r = invoke<Gone("a.theta")` parses to
     `returnSchema: "Gone(\"a.theta\")\n1"`, `returnSchemaAbsorbed: true`, and an
     empty diagnostic list. Pre-existing at base — with no coverer the gated and
     ungated predicates agree — and outside this report's charter. The new mark
     is what makes the shape visible on the AST. Separate filing.
  3. **Bug 0272's residual 2 stays open.** The `prior` branch's overlap test is
     still unnarrowed by containment. This fix gates the whole predicate on the
     judged capture's provenance, upstream of both branches, and narrows
     neither.
- Discharge notes appended:
  `docs/bugs/0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md`
  (residual 1 discharged; witness cells F3 and N re-founded; residual 2 restated
  as still open).
- Pinned dispositions / non-goals: bug 0272's landed containment filter stays.
  Clause (iv)(3)'s suppression of capture debris stays — cells c1 and c2 are
  byte-identical. Bug 0262's r1–r9 emissions, its clause-(iv)(1) admission and
  its clause-(iv)(2) withholds are untouched. Bug 0124's declaration-wide mint
  stays where it is, at all three call sites. The `@<T>`, `params:`,
  schema-field, alias-arm, object-constructor and pattern-head positions never
  consult this predicate and are unaffected.

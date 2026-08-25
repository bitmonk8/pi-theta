# Bug 0273 — an unresolvable `NamedType` written in the `E` argument of a `Result<T, E>` annotation that reaches the `@<T>` query capture draws nothing: ``let a: Result<integer, Nope> = @`q` `` and ``let r = @<Result<integer, Nope>>`q` `` both load clean, while the same `E`-side head refuses at an `fn` return (`fn f(): Result<integer, Nope>`), an `fn` parameter, and a non-query `let` — `queryResponseAnnotation` (`src/parser/theta-document.ts:6670`) hands only the `T` argument to the resolution pass

- **Status:** fixed (0.267.0).
- **Sev/Diff estimate:** S3/D1 — S3 because a written, unresolvable head is
  accepted at one position-face after bug 0262 closed the position-silence
  class, and the widened registry row already promises the opposite for this
  face; the affected input is one annotation shape, and the theta registers
  and runs with a name that resolves to nothing. D1 because the change is to
  one 5-line function's contract plus the cells that lock it, with no new
  resolver and no message-byte change.
- **Kind:** defect — a name-resolution pass reaches one of the two type
  arguments the grammar puts in `Result<T, E>`.
- **Affected:** `src/parser/theta-document.ts` (`queryResponseAnnotation`,
  line 6670, and its call site at line 8752 inside `walkExpr`'s `"query"` arm);
  `docs/spec_topics/diagnostics/code-registry-parse.md` line 112 (the
  `theta/parse/unresolved-named-type` row, whose *Trigger* names "every generic
  type argument, union arm, `Result` argument, and inline object field nested
  inside one of those ten" positions without excepting this one).
- **Observed at:** HEAD `76489c61`, v0.266.0.

## Summary

`queryResponseAnnotation` peels a `Result<T, E>` application down to `T` before
`walkExpr`'s `"query"` arm resolves names in it
(`src/parser/theta-document.ts:8752`, resolution at line 8811). The peel exists
to protect the builtin `QueryError`, which the `E` side carries whenever a query's
declared value type `Result<T, QueryError>` (QRY-1) reaches this capture, and
which resolves to no declaration by design
(`src/parser/theta-document.ts:6630`–`6639`). It protects the whole `E` side,
not the builtin: any head written there is discarded unseen.

Two routes reach the capture with author-written `E`-side text. Bug 0093's
route 2 propagates a `let` annotation verbatim onto a bare-query initialiser,
and bug 0262 §Fix clause (iv)(2) makes this arm that text's sole emitter — the
`let` capture withholds its own resolution of it. An author-written
`@<Result<T, E>>` ascription arrives here directly. Both spellings load clean
with an undeclared `E` head. The `T` side of the identical annotations refuses,
as does the `E` side at every non-query capture bug 0262 widened.

Bug 0262 measured this and recorded it as residual 3 (its §Fix, *Residuals*
item 3, lines 715–720): identical at pre-fix r11, therefore outside its r1–r9
mandate, left untouched deliberately. The peel is bug 0028's
(`./0028-unresolved-annotation-silent-permissive-lowering.md`, v0.38.0), refined
by bug 0204 and bug 0236 for its argument split; the propagation rule feeding it
is bug 0093's (`./0093-let-annotation-query-position-double-emission.md`).

## Reproduction

At HEAD `76489c61`. One sweep, offline, through the shipped front end
(`parseThetaDocument` via `tests/helpers/e2e-s1.ts`'s `parseDoc`); scratch token
`b0273scratch`, written, run, deleted. Frontmatter `description: d` /
`mode: prompt`; body tail `"ok"` where required. Neither `Nope` nor `nope` is
declared or imported in any fixture. `SILENT` is the empty diagnostic list.
Every non-silent cell is one `error theta/parse/unresolved-named-type:
unresolved named type '<name>'` and nothing else. "Registers" is the GOV-15
loads-cleanly reading (`docs/spec_topics/governance/source-language-stability.md:9`):
an `E` denies registration.

| # | fixture | result | registers |
|---|---|---|---|
| a | ``let a: Result<integer, Nope> = @`q` `` (propagated) | SILENT | yes |
| b | ``let r = @<Result<integer, Nope>>`q` `` (author-written) | SILENT | yes |
| c | ``let a: Result<integer, nope> = @`q` `` | SILENT | yes |
| d | ``let r = @<Result<integer, nope>>`q` `` | SILENT | yes |
| e | `fn f(): Result<integer, Nope> { Ok(1) }` (r8, `E` side) | `'Nope'` | no |
| f | `fn f(): Result<integer, nope> { Ok(1) }` | `'nope'` | no |
| g | `fn f(): Result<Nope, string> { Ok(1) }` (r8, `T` side) | `'Nope'` | no |
| h | `fn f(x: Result<integer, Nope>): number { 1 }` + `let r = f(Ok(1))` | `'Nope'` | no |
| i | `let a: Result<integer, Nope> = Ok(1)` (non-query `let`) | `'Nope'` | no |
| j | ``let a: Result<Nope, QueryError> = @`q` `` (`T` side, propagated) | `'Nope'` | no |
| k | ``let r = @<Result<Nope, QueryError>>`q` `` (`T` side, written) | `'Nope'` | no |
| l | `schema Nope { a: number }` + fixture a | SILENT | yes |
| m | ``let a: Result<integer, QueryError> = @`q` `` | SILENT | yes |

Rows e–i are the sharp face: the same `E`-side head refuses at the `fn` return
bug 0262 widened as r8, at the `fn` parameter, and at a `let` whose initialiser
is not a query. Only the query capture drops it. Rows j–k bound the defect to
the `E` side; rows l–m are the negative controls — a declared `E` head and the
builtin `QueryError` stay silent, which is the peel's stated purpose.

## Expected behaviour

The `E` argument of a `Result<T, E>` annotation reaching the `@<T>` query
capture resolves like every other type interior. `docs/spec_topics/grammar.md:107`
makes both arguments of a `Result` application a recursive `Type`, so a
`NamedType` written in `E` is a reference position, and
`docs/spec_topics/diagnostics/code-registry-parse.md:112` already states that
every `Result` argument nested inside the `@<T>` query annotation refuses an
unresolvable head. Fixtures a–d draw
`error theta/parse/unresolved-named-type: unresolved named type 'Nope'` (and
`'nope'`), once per written annotation, and do not register. Fixtures l and m
stay silent.

## Actual behaviour / root cause

`queryResponseAnnotation` (`src/parser/theta-document.ts:6670`) returns
`args[0]` of a two-argument `Result` application and discards `args[1]`:

```
const args = splitTopLevel(application[1] ?? "", ",", "angle-and-brace");
return args.length === 2 ? args[0] : undefined;
```

`walkExpr`'s `"query"` arm calls it at line 8752 and every judgement below —
the position-rule walk, the `annotationSourceIsNotTypeExpression` refusal, the
reserved-keyword loop, and `collectUnresolvedNamedTypes` at line 8811 — sees
only that returned `T` text. The function's own doc block states the intent as
protecting the builtin `QueryError` (lines 6629–6639); the implementation
protects the argument slot instead, so a declaration-free head written there is
never presented to the resolver.

Nothing downstream compensates. For the propagated route, bug 0262 §Fix clause
(iv)(2) withholds the `let` capture's resolution of the same text
(`schemaFromLetAnnotation === true`, `src/parser/theta-document.ts:8781`), which is why fixture a differs from fixture i: the sole emitter drops
the `E` side. For the author-written route there is no second capture at all.
The `fn` return capture resolves the whole annotation text through
`collectUnresolvedNamedTypes` (line 8240) with no peel, which is why fixture e
draws.

## Why it matters

A theta carrying `Result<integer, Nope>` at a query registers and runs. The
name is dead text: no declaration backs it, and no diagnostic names it, so the
author's typo in an error-model type survives to runtime as an annotation the
type layer cannot act on. Bug 0262 closed the class "a written, unresolvable
head is silent at a reference position" and widened the registry row to promise
every `Result` argument nested inside the ten positions; this face contradicts
that promise, so the row overclaims at HEAD. The asymmetry is also authoring-
visible: moving the identical annotation from an `fn` return to a query
initialiser turns a refusal into silence.

## Non-goals

- Bug 0262 §Fix clause (iv)(2)'s landed withhold. One emission per written
  annotation stays the rule; the query arm stays the propagated text's sole
  emitter. This bug raises that arm's coverage from one argument to two, not
  the emission count from one to two.
- The `T`-side behaviour (fixtures j–k), which is correct and byte-stable.
- The builtin admission. `QueryError` in `E` stays silent (fixture m), as does
  any declared head (fixture l).
- `queryResponseAnnotation`'s non-arity-2 path and its bracket-blind split,
  which are bug 0204 §Fix (b)(3) and bug 0236's recorded residual.
- The response-schema selection itself: `T` remains what the response is
  validated against, and no `E`-side text is lowered to a JSON Schema fragment.

## Fix

Split the peel's two jobs. `queryResponseAnnotation` keeps returning `T` as the
text the position-rule walk, the `annotationSourceIsNotTypeExpression` refusal
and the schema-shape reads consume. Beside it, the `"query"` arm resolves names
in the `E` argument as well: on the arity-2 path, run
`collectUnresolvedNamedTypes` over `args[1]` against the same
`refs.typeNames` universe and push `unresolvedNamedTypeDiagnostic` for each
name it returns, at the query expression's range, exactly as line 8811 does for
the response part. `Result` itself is never a `NamedType` atom
(`lowerTypeExpr` reads the constructor head structurally), and `QueryError` is
admitted at this capture by the same builtin error-model admission the widened
registry row already carries for the `let`, `fn` parameter, `fn` return and
`invoke<Type>` captures — so no new admission predicate is minted.

Constraints the change is pinned by:

- The 26 cells of `tests/b0262-unresolved-named-type-reference-positions.test.ts`
  stay green unchanged, including every propagation-withhold cell (its groups
  D2, D2-indirect, D5) and both artefact-suppression cells. The emission count
  for one written annotation stays exactly one.
- Bug 0093's per-query rule holds: the query arm emits once for the propagated
  text and the `let` capture stays withheld. An `E`-side name adds one
  diagnostic for one written name, not a second diagnostic for a name already
  reported.
- The non-arity-2 path is untouched: it still returns `undefined` and still
  descends nothing, so `theta/parse/generic-arity-mismatch` keeps its interior.
- `tests/committed-fixture-parse-gate.test.ts` stays green — the shipped
  `docs/examples/personas.thetalib` spells `Result<integer, QueryError>`, which
  the builtin admission keeps clean.
- Registry `Message` bytes are unchanged; the row at
  `docs/spec_topics/diagnostics/code-registry-parse.md:112` needs no widening,
  since its *Trigger* already names this face — the change makes the code match
  the row.
- New cells lock the thirteen fixtures of §Reproduction, red-first at both the
  `Nope` and `nope` spellings for rows a–d.

## Provenance

Bug 0262 §Fix (0.266.0), *Residuals* item 3
(`./0262-unresolved-named-type-silent-at-nine-reference-positions.md`, lines
715–720), and the ruled fix report `.pi/tmp/fixes/0262-report-ruled.md`
§Residuals 3, which record the measurement as identical at pre-fix r11 and
therefore outside that bug's r1–r9 mandate. Filed in the sixteenth set's
residual wave. All rows above re-measured at HEAD `76489c61`, v0.266.0.

## Fix (0.267.0)

- **What shipped:**
  - `src/parser/theta-document.ts` — a sibling `queryErrorModelAnnotation`
    beside `queryResponseAnnotation`, running the same `RESULT_APPLICATION`
    match and the same `splitTopLevel(…, ",", "angle-and-brace")` and returning
    `args[1]` on the arity-2 path alone (`undefined` for a non-`Result` schema
    and for every other argument count), per §Fix's "split the peel's two
    jobs". `queryResponseAnnotation`'s signature, body and return value for
    every input are byte-identical to the pre-fix function; only its doc block
    changed.
  - `src/parser/theta-document.ts` — `walkExpr`'s `"query"` arm now resolves
    the `E` argument beside the response part: `collectUnresolvedNamedTypes`
    over `queryErrorModelAnnotation(e.schema)` against
    `withBuiltinErrorModelNames(refs.typeNames)`, pushing
    `unresolvedNamedTypeDiagnostic` per name at the query expression's range.
    The block sits AFTER the response-side loop, so bug 0203's
    `annotationSourceIsNotTypeExpression` early `return` — the annotation's
    whole disposition — still short-circuits it; and it is NOT gated by
    `e.schemaFromLetAnnotation`, because bug 0262 §Fix clause (iv)(2) makes
    this arm the propagated text's sole emitter.
  - `src/parser/theta-document.ts` — a per-annotation seen-set filters the
    `E`-side names against the response-side loop's own result, so a head
    spelled in BOTH `Result` slots of one annotation draws one line, at parity
    with the `fn`-return, `fn`-parameter and non-query-`let` siblings. §Fix's
    pin is literal: "An `E`-side name adds one diagnostic for one written name,
    not a second diagnostic for a name already reported." The set is local to
    one annotation walk — nothing dedupes across annotations or statements.
  - `src/parser/theta-document.ts` — `queryResponseAnnotation`'s doc block
    corrected in place: the peel protects the BUILTIN `QueryError`, through the
    same `withBuiltinErrorModelNames` admission the `let`, `fn` parameter, `fn`
    return and `invoke<Type>` captures carry, rather than the argument SLOT. The
    arity rationale, the brace-depth rationale and the bug-0204/0236 bracket
    residual are unchanged.
  - `tests/b0273-query-result-error-side-unresolved-name.test.ts` — new, 10
    cells (see *Tests that lock it* below).
  - `tests/live/live-production-acceptance.test.ts` — additive H8a cell 89.
    No existing cell reworded, reordered, renumbered or deleted (242
    insertions, 0 deletions).
  - No registry or spec edit. See *Adjudications* item 3.

- **Gates:**
  - Witness, pre-fix (RED for the right reason):
    `Test Files 1 failed (1) / Tests 3 failed | 5 passed (8)` — rows a–d
    observed `Array []` where one `theta/parse/unresolved-named-type` was
    expected, i.e. the §Reproduction silence, with every control cell passing.
  - Witness, post-fix: `Test Files 1 passed (1) / Tests 10 passed (10)`.
  - Full default suite: `Test Files 445 passed (445) / Tests 9263 passed
    (9263)`.
  - `npx tsc -p tsconfig.json --noEmit` — no output, exit 0.
  - `npm run lint` — no output, exit 0.
  - Live H8a cell 89 (orchestrator, under the shared live lock):
    `Test Files 1 passed (1) / Tests 1 passed | 89 skipped (90)`.
  - `tests/fixtures/h7a/permitted-codes.json` byte-unchanged —
    `git hash-object` = `a4a8da04209f90e13d815edd92c1fc682e2a2236`, the
    pre-change blob. `theta/parse/unresolved-named-type` is a pre-existing
    code, so no H9a permitted-codes movement was possible.

- **Review:** 2 rounds, clean at round 2.
  - Round 1 (deep) — findings. One `correctness` blocker: the `T`-side and
    `E`-side resolutions are two `collectUnresolvedNamedTypes` calls and that
    function dedupes only within a call, so `Result<Nope, Nope>` drew two
    byte-identical lines at the query capture where the sibling captures draw
    one — a violation of §Fix's not-a-second-diagnostic pin and a re-opening of
    the very asymmetry axis this bug closes. One `test` residual: the witness's
    group-(E) comment named the bare `refs.typeNames` universe where the code
    uses the widened one. Both fixed in the same round.
  - Round 2 (fast) — clean, no escalation. It re-probed the filter's bounds
    offline (`Result<Array<Nope>, Nope | Gone>` → two lines; `Result<integer,
    Nope | Gone>` → two; `Result<integer, { x: Nope }>` → one; two separate
    statements → one each, no cross-statement bleed) and confirmed the delta
    neither pre-fixes nor half-fixes bug 0272's `captureWindowAlreadyRefused`
    surface.

- **Verification:** solid.
  - The witness genuinely witnesses. Neutralisation (a) — the whole `E`-side
    block removed — reds rows a–d and the count cell with `Array []` against
    the expected single code. Neutralisation (b) — only the seen-set filter
    removed — reds the (both) cell alone with two identical codes where one
    is expected, (both-distinct) staying green. Both restored by writing the
    original bytes back, hash-verified identical
    (`6f6d504dfcb16906b3df3b7c4b6205a5b7890527` before and after each), and
    green afterwards. No `git stash`, no `git checkout`, no `git restore`.
  - Full default suite green; bug 0262's 26-cell lock green and its `git diff`
    EMPTY; `tests/committed-fixture-parse-gate.test.ts`,
    `tests/let-annotation-query-double-emission.test.ts` and
    `tests/citation-symbol-form-gate.test.ts` green.
  - Typecheck and lint green.
  - All thirteen §Reproduction rows independently re-measured post-fix through
    `parseDoc`: a–d each one refusal and not registering; e–k byte-identical to
    the pre-fix baseline; l and m silent and registering. Matches §Expected
    behaviour exactly.
  - Live: exercised by cell 89, run only by the orchestrator under the lock.

- **Tests that lock it:**
  - `tests/b0273-query-result-error-side-unresolved-name.test.ts` — groups
    (E) and (E-registration) for rows a–d at both the `Nope` and `nope`
    spellings; (both) and (both-distinct) for the one-diagnostic-per-written-name
    parity against the `fn`-return sibling; (count) for row a's single
    emission at the query's range rather than the `let`'s; (asym) for rows e–i,
    the r8-vs-r11 face; (T) for rows j–k; (neg) for rows l–m; (arity) for the
    untouched non-arity-2 path; (DIAG-2) for registry-row presence. Every
    expected message is read through `registryMessage`, never transcribed.
  - `tests/live/live-production-acceptance.test.ts` cell 89 — the offender
    (``let a: Result<integer, Nope> = @`q` ``) is absent from
    `registeredNames()` and the reason is read off the settled in-memory
    `SessionManager`'s `theta-system-note` entries; the declared-`E` twin
    registers and drives one real turn to normal completion with an empty
    per-drive note slice and a fixture-pinned sentinel over the theta's own
    computed value. Two asserted-first real registrations keep the absence
    assertion non-vacuous.

- **Adjudications on the record:**
  1. **The `E`-argument name universe is
     `withBuiltinErrorModelNames(refs.typeNames)`, not the bare set.** §Fix's
     phrase "the same `refs.typeNames` universe" names the source; its next
     sentence settles the admission, and §Expected behaviour (fixture m
     silent), §Non-goals ("The builtin admission") and §Fix's own
     `tests/committed-fixture-parse-gate.test.ts` constraint over
     `docs/examples/personas.thetalib`'s `Result<integer, QueryError>` each red
     under the bare set. Reusing the existing helper is what "no new admission
     predicate is minted" means.
  2. **No reserved-keyword emission for the `E` side.** §Fix names one
     builder, `unresolvedNamedTypeDiagnostic`. Emitting
     `reservedKeywordAsIdentifierDiagnostic` for `args[1]` would widen that
     code's registered *Trigger*, a DIAG-2 same-commit spec edit outside this
     §Fix. No `reservedKeywords` sink is passed. See *Residuals* item 1.
  3. **No registry or spec edit is owed** — the measurement §Fix asks for.
     `docs/spec_topics/diagnostics/code-registry-parse.md` line 112, the
     `theta/parse/unresolved-named-type` row's *Trigger*, already reads
     "together with every generic type argument, union arm, `Result` argument,
     and inline object field nested inside one of those ten", and "the `@<T>`
     query annotation" is among the ten. The row promised this face before the
     fix; the change makes the code match the row rather than the row match the
     code. Verified at HEAD by the implementer, the round-1 reviewer and the
     verifier independently. No `docs/spec_topics/**` or `docs/reference/**`
     file is touched.

- **Residuals:**
  1. **A reserved-keyword spelling written in the `E` argument at this capture
     stays silent.** Scope, not defect: §Fix authorises one diagnostic builder
     for this slot, and DIAG-2 makes any trigger widening for
     `theta/parse/reserved-keyword-as-identifier` a same-commit spec edit,
     which §Fix does not open. The response part's own reserved-keyword loop is
     unchanged. Evidence: the new `E`-side call passes no `reservedKeywords`
     sink, and `collectUnresolvedNamedTypes` exports keyword hits only through
     that optional parameter.
  2. **`queryErrorModelAnnotation` re-runs the `RESULT_APPLICATION` match and
     the argument split that `queryResponseAnnotation` already ran.** §Fix's
     "beside it" was implemented as a sibling rather than as a shared-split
     refactor, on the ground that a refactor risks moving
     `queryResponseAnnotation`'s observable return value, which §Fix requires
     byte-stable. Both functions decline identically on every non-arity-2
     input, so the two calls cannot disagree. Evidence: the (arity) group is
     green, and the bracket-blind residual of bug 0204 §Fix (b)(3) and bug 0236
     is inherited unchanged by the sibling.
  3. **Live cell 89 red once out of three runs, at the drive sentinel only.**
     Failure name: "the declared-`E` twin's drive did not answer the task
     question over its own computed value" — the assertion at the very end of
     the cell, reached only after the offender's absence from the registered
     set and the note naming the head had both already passed. This is the
     known prober-arithmetic-variance mode of the live axis, not a
     registration-path failure. One isolated re-run under the lock was green,
     as was the first run: 2 of 3 green, the red confined to the stochastic
     assertion.
  4. **Pre-existing stale `src/parser/theta-document.ts` line citations in
     unrelated test files.** The round-1 reviewer swept every such citation at
     or after this change's first shifted line
     (`tests/type-name-as-value-refusal.test.ts`,
     `tests/non-literal-by-field-refusal.test.ts`, `tests/par-for.test.ts`,
     `tests/let-annotation-query-double-emission.test.ts`,
     `tests/live/live-production-acceptance.test.ts`, and ten further sites)
     against the pre-change file and established that every stale one was
     ALREADY stale before this change. No citation was made stale by this
     change, so no correction round was owed and no test file was edited for
     it. `tests/citation-symbol-form-gate.test.ts` is green.

- **Discharge notes appended:**
  `./0262-unresolved-named-type-silent-at-nine-reference-positions.md` — its
  §Fix *Residuals* item 3 (the propagated `Result` `E`-side silence) is closed
  by this fix; a dated closure note is appended there, its existing text
  unmodified.

- **Pinned dispositions / non-goals held:**
  Bug 0262 §Fix clause (iv)(2)'s landed withhold is untouched — the `let`
  capture still withholds and the query arm is still the propagated text's sole
  emitter; this fix raises that arm's coverage from one `Result` argument to
  two, not the emission count from one to two. Bug 0093's per-query rule holds.
  The `T`-side behaviour (rows j–k) is byte-stable. The builtin admission
  stands (rows l–m silent). The non-arity-2 path still returns `undefined` and
  descends nothing, so `theta/parse/generic-arity-mismatch` keeps its interior.
  No `E`-side text is lowered to a JSON Schema fragment and the response-schema
  selection is unchanged: `T` remains what the response is validated against.
  Bug 0272's subject — the enclosing-refusal swallow over
  `captureWindowAlreadyRefused` — is untouched by every hunk.

## Coordination note (0.272.0) — adjudication B(2) and residual D(1) closed

2026-08-24. [Bug 0274](./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md)
§Fix route (a), taken A-SCOPED under the operator's re-ruling, wires a
`reservedKeywords` sink at this report's own `E`-side block and at the four
captures bug 0262 wired for the name class alone. That closes this report's
adjudication B(2) — the declined `reservedKeywordAsIdentifierDiagnostic`
emission for `args[1]` — and its residual D(1), "a reserved-keyword spelling
written in the `E` argument at this capture stays silent": such a spelling now
draws that row at the query's own range and the theta does not register. The
declining source comment this report shipped is replaced by the sink's own
statement of the admission.

The admission is scoped rather than blanket: at the five newly-wired sites the
sink withholds the two `GenericType` heads `Result` and `array` and the two
`Result` value constructors `Ok` and `Err`, so no spelling the type grammar
admits as a type head is refused there.

This report's own subject is untouched. The `E`-side unresolved-name walk, its
per-annotation seen-set and its one-diagnostic-per-written-name count are
byte-preserved; the keyword loop stands beside that walk with a seen-set of its
own over the response part's hits, so one written keyword still draws one line
per annotation. All ten cells of
`tests/b0273-query-result-error-side-unresolved-name.test.ts` and live H8a cell
89 are green and unreworded.

## Coordination note (0.273.0) — group `(arity)`'s author-written rows re-vehicled under bug 0278's fix

2026-08-25. [Bug 0278](./0278-result-arity-mismatch-silent-at-query-response-annotation.md)
§Fix hands the WHOLE `@<T>` annotation to the query capture's position-rule
pass, so an author-written non-arity-2 `Result` application now draws one
error-severity `theta/parse/generic-arity-mismatch` and is refused
registration. Two sub-rows of this report's witness —
`tests/b0273-query-result-error-side-unresolved-name.test.ts`, group `(arity)`,
cell `b0273-arity`, rows `arity-w1` and `arity-w3` — pinned that silence as
their VEHICLE: they asserted an empty diagnostic list and `registered: true`
for `let r = @<Result<integer>>`q`` and its arity-3 sibling. That is the exact
disposition 0278 §Expected behaviour removes, so no implementation of 0278's
settled §Fix can keep those two rows green.

The rows were RESTATED, not deleted, under the operator's ratification of the
flip as vehicle-collateral and subject-preserving. They now assert the FIXED
behaviour: one arity verdict with the registry-rendered *Message* (`got 1` /
`got 3`) and `registered: false`. The bound was exactly those two sub-rows in
exactly this file; the propagated rows `arity-p1` / `arity-p3` are byte-stable,
still one arity line at `6:1` from `walkStatement`'s `let` arm, and the group's
header bullet was updated to match.

This report's own subject is untouched and its witness remains a lock at full
strength. The `E`-side unresolved-name walk still runs on the arity-2 path
alone: `arity-w3`'s undeclared `Nope` in a non-`T` argument still draws NO
`theta/parse/unresolved-named-type` line, the whole-list equality is unchanged
in kind, and the cell still reds on a route that widened the peel instead of
adding beside it. All ten cells are green after the restatement; live H8a cell
89 is unaffected.

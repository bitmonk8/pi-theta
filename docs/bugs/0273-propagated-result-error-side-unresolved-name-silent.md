# Bug 0273 — an unresolvable `NamedType` written in the `E` argument of a `Result<T, E>` annotation that reaches the `@<T>` query capture draws nothing: ``let a: Result<integer, Nope> = @`q` `` and ``let r = @<Result<integer, Nope>>`q` `` both load clean, while the same `E`-side head refuses at an `fn` return (`fn f(): Result<integer, Nope>`), an `fn` parameter, and a non-query `let` — `queryResponseAnnotation` (`src/parser/theta-document.ts:6670`) hands only the `T` argument to the resolution pass

- **Status:** open.
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

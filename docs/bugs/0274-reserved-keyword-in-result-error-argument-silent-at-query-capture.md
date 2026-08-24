# Bug 0274 — a reserved-keyword spelling written where a `NamedType` is read draws `theta/parse/reserved-keyword-as-identifier` at the `@<T>` query capture's `T` argument and nothing at the same annotation's `E` argument: ``let r = @<Result<integer, match>>`q` `` and ``let a: Result<integer, return> = @`q` `` load with zero diagnostics and register, while ``@<Result<match, QueryError>>`` refuses — `collectUnresolvedNamedTypes` computes the keyword class and discards it wherever the caller passes no `reservedKeywords` out-parameter, which is the `E`-side block bug 0273 landed (`src/parser/theta-document.ts:8859`–`8880`) and the four captures bug 0262 wired (`:8120`, `:8230`, `:8269`, `:8691`)

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — S3 because a spelling
  `docs/spec_topics/lexical.md:20` refuses as an identifier is accepted at a
  type-name position with no diagnostic on any channel and the theta registers
  and runs (§Reproduction rows E1–E7, F1–F8), and the same spelling refuses at
  the `T` argument of the identical annotation, so the accepted set is decided
  by which argument slot the author wrote in rather than by any stated rule;
  the affected input set is a written reserved-keyword head, and no wire value
  or lowered schema is corrupted by it. D1 because the class is already
  computed at every one of these captures and travels through one existing
  optional out-parameter plus one existing builder — the change is an argument
  at five call sites and one registry *Trigger* sentence, with no new
  resolver, no new code and no *Message* byte moving.
- **Kind:** defect — a computed diagnostic class is dropped at five of the
  eight callers that compute it; and, on the registry side, a *Trigger* that
  names no position while the emission set is decided per call site.
- **Affected:** `src/parser/theta-document.ts` — `walkExpr`'s `"query"` arm,
  the `E`-side block at `:8859`–`:8880` (no third argument to
  `collectUnresolvedNamedTypes` at `:8861`) beside the response part's own sink
  at `:8839`–`:8848`; and the four captures bug 0262 wired without a sink, the
  `let` annotation (`:8120`), the `fn` parameter type (`:8230`), the `fn`
  return type (`:8269`) and the `invoke<Type>` ascription (`:8691`).
  `src/parser/body-type-lowering.ts` — `collectUnresolvedNamedTypes`
  (`:608`), whose `keywordHits` list is published only through the optional
  `reservedKeywords` parameter (`:626`); `src/parser/params.ts:815`–`:839`, the
  type-atom classification that produces the hit.
  `docs/spec_topics/diagnostics/code-registry-parse.md:21` — the
  `theta/parse/reserved-keyword-as-identifier` row, whose *Trigger* reads
  "Reserved keyword used in an identifier position." and enumerates no
  position.
- **Observed at:** HEAD `bb7546e0`, v0.267.0 (bug 0273's fix commit).

## Summary

`collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts:608`) walks a
captured type text and separates two classes: names that resolve to no
declaration, returned; and reserved-keyword spellings read where a `NamedType`
is read, published only into the optional, caller-owned `reservedKeywords`
out-parameter (`:626`). The separation is bug 0044's — a reserved spelling is
not an `Ident` (`docs/spec_topics/lexical.md:20`), so it is not a `NamedType`
(`docs/spec_topics/grammar.md:98`) and cannot travel in a list of unresolved
names.

Three of the eight `collectUnresolvedNamedTypes` call sites in
`src/parser/theta-document.ts` pass the out-parameter: the `schema X = …`
alias/union right-hand side (`:7780`), the `schema` body field type (`:8369`),
and the response part of the `@<T>` query capture (`:8839`–`:8848`); the
`params:` right-hand side reaches the same sink through its own lowering
(`src/parser/params.ts:209`, `:240`), making four emitting callers in all — the
four the sink's own comment names (`src/parser/params.ts:837`). Five call sites
pass none: the `E`-side block bug 0273 §Fix landed at
this same query capture (`:8859`–`:8880`), and the `let` annotation (`:8120`),
`fn` parameter type (`:8230`), `fn` return type (`:8269`) and `invoke<Type>`
ascription (`:8691`) bug 0262 §Fix wired for the unresolved-name class alone.
At those five the keyword class is computed and discarded.

The observable is an asymmetry inside one annotation. ``@<Result<match,
QueryError>>`q` `` refuses; ``@<Result<integer, match>>`q` `` is silent and
registers. The `E` side is reached — the walk that drops `match` there reports
an undeclared `Nope` written beside it in the same union (row E8) — so the
silence is the missing sink, not an unvisited slot. The same silence covers the
`E` argument at the `fn` return, `fn` parameter, non-query `let` and
`invoke<Type>` captures, and the whole annotation at those four (rows F1–F8),
where the keyword class has never been wired.

Bug 0273's fix recorded this as adjudication B(2) and residual D(1): "**No
reserved-keyword emission for the `E` side.** §Fix names one builder,
`unresolvedNamedTypeDiagnostic`. Emitting
`reservedKeywordAsIdentifierDiagnostic` for `args[1]` would widen that code's
registered *Trigger*, a DIAG-2 same-commit spec edit outside this §Fix. No
`reservedKeywords` sink is passed." The declination is repeated in the shipped
source comment at `:8856`–`:8858`.

## Reproduction

At HEAD `bb7546e0`. One case-insensitive sweep, offline, through the shipped
front end (`parseThetaDocument` via `tests/helpers/e2e-s1.ts`'s `parseDoc`);
scratch token `b0274scratch`, written, run, deleted. Frontmatter
`description: d` / `mode: prompt`; body tail `"ok"` on every fixture. No
fixture declares or imports `Nope`. Two reserved spellings are measured,
`match` and `return`, chosen because neither is a member of the lexer's
control-head set; `fn` is measured separately below as a confound. `SILENT` is
the empty diagnostic list. "Registers" is the GOV-15 loads-cleanly reading
(`docs/spec_topics/governance/source-language-stability.md:9`): an
error-severity `theta/parse/…` denies registration. Positions are
`line:column` of the diagnostic's range start.

Query capture, `T` argument — the row fires:

| # | fixture | diagnostics | registers |
|---|---|---|---|
| T1 | ``let r = @<Result<match, QueryError>>`q` `` | `reserved-keyword-as-identifier` @6:9 (`'match'`) | no |
| T2 | ``let r = @<Result<return, QueryError>>`q` `` | `reserved-keyword-as-identifier` @6:9 (`'return'`) | no |
| T3 | ``let a: Result<match, QueryError> = @`q` `` (propagated) | `reserved-keyword-as-identifier` @6:36 | no |
| T4 | ``let r = @<Result<array<match>, QueryError>>`q` `` | `reserved-keyword-as-identifier` @6:9 | no |

Query capture, `E` argument — silent:

| # | fixture | diagnostics | registers |
|---|---|---|---|
| E1 | ``let r = @<Result<integer, match>>`q` `` | SILENT | yes |
| E2 | ``let r = @<Result<integer, return>>`q` `` | SILENT | yes |
| E3 | ``let a: Result<integer, match> = @`q` `` (propagated) | SILENT | yes |
| E4 | ``let a: Result<integer, return> = @`q` `` (propagated) | SILENT | yes |
| E5 | ``let r = @<Result<integer, array<match>>>`q` `` | SILENT | yes |
| E6 | ``let r = @<Result<integer, match \| integer>>`q` `` | SILENT | yes |
| E7 | ``let r = @<Result<integer, { x: match }>>`q` `` | SILENT | yes |
| E8 | ``let r = @<Result<integer, match \| Nope>>`q` `` | `unresolved-named-type` @6:9 (`'Nope'`) — one line, `match` unnamed | no |
| E9 | ``let r = @<Result<match, match>>`q` `` | `reserved-keyword-as-identifier` @6:9 — one line, from the `T` side | no |
| E10 | ``let r = @<Result<integer, match, string>>`q` `` (arity 3) | SILENT | yes |

Row E8 is the sharp cell: one walk over the `E` text reports the undeclared
name and drops the keyword beside it. Row E10 is the non-arity-2 path, which
descends nothing at all.

Other captures — the keyword class is unwired at both argument slots and at the
bare annotation:

| # | fixture | diagnostics | registers |
|---|---|---|---|
| F1 | `fn f(): Result<match, integer> { Ok(1) }` (`T` side) | SILENT | yes |
| F2 | `fn g(): Result<integer, match> { Ok(1) }` (`E` side) | SILENT | yes |
| F3 | `fn f(): match { 1 }` | SILENT | yes |
| F4 | `fn h(x: Result<integer, match>): number { 1 }` + `let r = h(Ok(1))` | SILENT | yes |
| F5 | `let a: match = 3` | SILENT | yes |
| F6 | `let a: Result<integer, match> = Ok(1)` (non-query `let`) | SILENT | yes |
| F7 | `let r = invoke<Result<integer, match>>("./x.theta", "hi")` | SILENT | yes |
| F8 | `let r = invoke<match>("./x.theta", "hi")` | SILENT | yes |

Controls where the row fires today, at the same two spellings:

| # | fixture | diagnostics | registers |
|---|---|---|---|
| C1 | ``let r = @<match>`q` `` (bare query ascription) | `reserved-keyword-as-identifier` @6:9 | no |
| C2 | `schema S { a: match }` (schema body field type) | `reserved-keyword-as-identifier` @6:1 | no |
| C3 | `schema S { p: { match: string } }` (inline object key, bug 0249) | `reserved-keyword-as-identifier` @6:1 | no |
| C4 | `let match = 3` (binder, lexer site) | `reserved-keyword-as-identifier` @6:5 | no |
| C5 | `enum E { match }` (variant name, bug 0153) | `reserved-keyword-as-identifier` @6:10 | no |

The `fn` spelling confound, measured at the same shapes: `fn` is a member of
the lexer's `controlHeads` set (`src/lexer/lexer.ts:1026`), so its contextual
scan draws `theta/parse/single-line-if` — a row whose *Trigger* is a non-braced
control body — wherever no `{` follows on the line.
``let r = @<Result<integer, fn>>`q` `` therefore draws `single-line-if` @6:27
and does not register, while `fn g(): Result<integer, fn> { Ok(1) }` is SILENT
and registers, because the function body's `{` satisfies that scan. The
misfiring row is the class bug 0249 §Summary already records for its own two
positions; `fn`, `for`, `if` and `while` are consequently unusable as
discriminators here, which is why `match` and `return` carry the measurement.

## Expected behaviour

`docs/spec_topics/lexical.md:20` states that using one of the 32 reserved
spellings in identifier position is
`theta/parse/reserved-keyword-as-identifier`, and
`docs/spec_topics/grammar.md:100` and `:107` make both arguments of a `Result`
application a recursive `Type`, whose `NamedType` alternative is `Ident`
(`:98`). Rows
E1–E7 and F1–F8 therefore draw exactly one
`error theta/parse/reserved-keyword-as-identifier: reserved keyword '<keyword>'
cannot be used as an identifier` for each written keyword head and do not
register, at parity with rows T1–T4 and C1–C5. Row E8 draws that line beside
the existing `unresolved-named-type` line — two written mistakes, two
diagnostics. Row E9 draws one line for the one spelling written twice in one
annotation, matching the response side's own dedup. Row E10 stays silent (the
non-arity-2 path).

## Actual behaviour / root cause

`collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts:608`) collects
`keywordHits` during the walk and publishes them only if the caller supplied a
sink: `reservedKeywords?.push(...new Set(keywordHits))` (`:626`). The class is
therefore computed at every capture and observable at four.

A reserved spelling does reach the type-atom classification: the walk's atom
arm tests membership in the lexer's own 32-member set
(`src/lexer/lexer.ts:159`) at `src/parser/params.ts:815`, ahead of the
`IDENTIFIER` test and the resolution map, and pushes every spelling other than
`true`, `false` and `void` into `lowerCtx.reservedKeywords` (`:839`) — the sink
`collectUnresolvedNamedTypes` forwards. The comment at that push names the
consumers as "each of the four callers from this sink". Nothing in the type
parser refuses a keyword head earlier, so where no caller sink exists the
silence is total rather than a substituted diagnostic.

At the query capture the two slots are wired differently in adjacent lines. The
response part allocates a sink and emits from it:

```
const annotationReservedKeywords: string[] = [];
const annotationUnresolved = collectUnresolvedNamedTypes(
  responseAnnotation,
  refs.typeNames,
  annotationReservedKeywords,
);
for (const keyword of annotationReservedKeywords) {
  out.push(reservedKeywordAsIdentifierDiagnostic(keyword, e.range, file));
}
```

(`src/parser/theta-document.ts:8839`–`:8848`.) The `E`-side block, twelve lines
below, calls the same function with two arguments (`:8861`–`:8864`) and its
source comment states the omission as deliberate: "No reserved-keyword sink is
passed: widening that diagnostic's registered trigger to this argument slot is
outside this fix's scope" (`:8856`–`:8858`). The four captures bug 0262 wired
(`:8120`, `:8230`, `:8269`, `:8691`) call it the same two-argument way, which is
why rows F1–F8 are silent at both slots and at the bare annotation alike.

`reservedKeywordAsIdentifierDiagnostic` (`:6486`) already renders the registered
*Message* for any `(keyword, range, file)`, and the range every one of these
captures would use is the range its sibling `unresolvedNamedTypeDiagnostic`
call already passes. No builder, resolver or code is missing; the argument is.

On the registry side the row's *Trigger* is one position-free sentence
(`docs/spec_topics/diagnostics/code-registry-parse.md:21`): "Reserved keyword
used in an identifier position." It enumerates no position, so it neither
promises nor excepts these captures, and the emission set is decided entirely
by which call site holds a sink. The `theta/parse/unresolved-named-type` row
beside it (`:112`) asserts a division of labour the code does not keep — "A
reserved-keyword spelling read where a `NamedType` is read is
`theta/parse/reserved-keyword-as-identifier`'s to report at every position
alike, never this row's — a reserved head (`let a: match = 3`) is silent under
this row rather than misreported" — while the example it names, `let a: match =
3`, is row F5: silent under both rows (measured), not reported by the sibling.

## Why it matters

A theta whose query carries `Result<integer, match>` registers and runs with a
reserved spelling standing where a declaration name belongs. The reading of the
authored text is decided by the argument slot: moving `match` from `T` to `E`
inside one annotation turns a refusal into silence, and moving the identical
annotation from the query capture to an `fn` return removes even the `T`-side
refusal. Bug 0262 closed "a written, unresolvable head is silent at a reference
position" for the name class and bug 0273 extended it to the `E` argument; the
keyword class at those same captures is the remaining half, and the registry
pair at `:21` and `:112` reads at HEAD as if it were already covered.

## Non-goals

- Bug 0273's landed `E`-side unresolved-name walk (`:8859`–`:8880`), its
  per-annotation seen-set dedup and the one-diagnostic-per-written-name count.
  This report adds a second class beside that walk; it does not reopen the walk
  or its emission count.
- `queryResponseAnnotation`'s peel (`:6675`) and `queryErrorModelAnnotation`
  (`:6699`) — their return values for every input, including the non-arity-2
  declination (row E10) and the bracket-blind split recorded as bug 0236's
  residual.
- Bug 0262 §Fix clause (iv)(2)'s propagation withhold and clause (iv)(3)'s
  capture-absorption suppression. Both stay as landed: the query arm remains
  the propagated text's sole emitter (rows E3, E4, T3), and a keyword spelling
  the capture absorbed from a different authoring mistake is not this report's
  subject — only a spelling the author wrote.
- Bug 0249's landed rows at the inline object type's field key and the typed
  object-literal key (row C3), and bug 0153's six name positions (row C5).
- The `fn` / `for` / `if` / `while` misfire through
  `theta/parse/single-line-if` (`src/lexer/lexer.ts:1026`, `:1132`). Those four
  spellings draw a wrongly-Triggered row at many positions, which is a distinct
  defect from the silence measured here; this report measures around it and
  does not repair it.
- The builtin error-model admission. `QueryError` in `E` stays silent, and
  `withBuiltinErrorModelNames` is not consulted for the keyword class at all —
  no reserved spelling is a builtin error-model name.

## Fix

Not settled. Two routes, each adjudicable; the run selects one and records
which.

**Route (a) — wire the sink and widen the *Trigger*.** Pass a
`reservedKeywords` out-parameter at the five sinkless call sites — the
`E`-side block (`:8861`), the `let` annotation (`:8120`), the `fn` parameter
type (`:8230`), the `fn` return type (`:8269`) and the `invoke<Type>`
ascription (`:8691`) — and emit `reservedKeywordAsIdentifierDiagnostic`
(`:6486`) per hit at the range each site's sibling
`unresolvedNamedTypeDiagnostic` call already uses, mirroring the response
part's shape at `:8839`–`:8848` verbatim. At the query capture the two slots
share one annotation, so the `E`-side keyword loop filters against the
response part's own hits exactly as bug 0273's seen-set filters the name class
(row E9 stays at one line). The row's *Trigger*
(`docs/spec_topics/diagnostics/code-registry-parse.md:21`) gains the position
enumeration it lacks — a DIAG-2 same-commit spec edit, and a GOV-15
source-language-stability carve-out whose in-scope input set is a written
reserved-keyword head at these type-name positions and nothing else, every one
of which loads cleanly at HEAD. The route may be taken at the `E` argument
alone or at all five sites; whichever is chosen, the report records the
positions left unwired.

**Route (b) — record the silence as specified.** Keep the code as landed and
make the registry state the division of labour it actually implements: the row
at `:21` names the positions that emit (the binder and declarator-name sites,
the `schema` body field type, the alias/union right-hand side, the `@<T>` query
annotation's response part, bug 0249's two key positions, bug 0153's six name
positions) and states that a keyword head at the query capture's `E` argument
and at the four bug-0262 captures is admitted. The sentence in the
`theta/parse/unresolved-named-type` row at `:112` claiming the sibling reports
"at every position alike" is corrected in the same commit, since row F5 shows
it false at the example it names.

Constraints either route is pinned by:

- Bug 0273's witness, `tests/b0273-query-result-error-side-unresolved-name.test.ts`
  (10 cells), stays green unchanged, including its ordered whole-list equalities
  over `doc.diagnostics` — a new emission at the `E` side must not appear in any
  fixture of that file, none of which spells a reserved head.
- Bug 0273's live H8a cell 89 in `tests/live/live-production-acceptance.test.ts`
  stays green and unreworded.
- Bug 0262's witness,
  `tests/b0262-unresolved-named-type-reference-positions.test.ts` (26 cells),
  stays green unchanged, including every propagation-withhold and
  artefact-suppression cell.
- Bug 0249's witness,
  `tests/reserved-keyword-inline-object-and-literal-keys.test.ts`, and bug
  0044's and bug 0153's witnesses stay green: the keyword class's existing three
  emission sites keep their ranges, counts and *Message* bytes.
- `tests/committed-fixture-parse-gate.test.ts` stays green — the shipped corpus
  spells no reserved head at any of these positions, which route (a) must
  confirm rather than assume.
- Registry *Message* bytes do not move under either route. Route (a) moves one
  *Trigger* cell; route (b) moves that cell and one sentence of the `:112` row.
- New cells lock the fixtures of §Reproduction at both the `match` and `return`
  spellings, red-first for whichever rows the chosen route changes, and hold
  rows E9, E10 and C1–C5 at their measured dispositions either way.

## Provenance

Bug 0273's `## Fix (0.267.0)` record
(`./0273-propagated-result-error-side-unresolved-name-silent.md`),
*Adjudications* item 2 (adjudication B(2), the declined reserved-keyword
emission) and *Residuals* item 1 (residual D(1), "A reserved-keyword spelling
written in the `E` argument at this capture stays silent"). Filed in the
seventeenth session's residual wave. Every row of §Reproduction measured at
HEAD `bb7546e0`, v0.267.0; the wider face at rows F1–F8 is the same missing
sink at the four captures bug 0262 §Fix (0.266.0) wired for the name class
alone (`./0262-unresolved-named-type-silent-at-nine-reference-positions.md`).

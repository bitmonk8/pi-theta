# Bug 0274 — a reserved-keyword spelling written where a `NamedType` is read draws `theta/parse/reserved-keyword-as-identifier` at the `@<T>` query capture's `T` argument and nothing at the same annotation's `E` argument: ``let r = @<Result<integer, match>>`q` `` and ``let a: Result<integer, return> = @`q` `` load with zero diagnostics and register, while ``@<Result<match, QueryError>>`` refuses — `collectUnresolvedNamedTypes` computes the keyword class and discards it wherever the caller passes no `reservedKeywords` out-parameter, which is the `E`-side block bug 0273 landed (`src/parser/theta-document.ts:8859`–`8880`) and the four captures bug 0262 wired (`:8120`, `:8230`, `:8269`, `:8691`)

- **Status:** fixed (0.272.0).
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

## Fix (0.272.0)

Route (a), taken A-SCOPED under the operator's re-ruling: the sink is wired at
all five sinkless call sites, and at those five sites it admits only reserved
spellings the type grammar never admits as a type head.

- **What shipped:**
  `src/parser/theta-document.ts` — a `reservedKeywords` out-parameter at the
  five sinkless `collectUnresolvedNamedTypes` call sites (the `let` annotation,
  the `fn` parameter type, the `fn` return type, the `invoke<Type>` ascription
  and the `@<T>` query capture's `E` argument), each emitting
  `reservedKeywordAsIdentifierDiagnostic` per admitted hit at the range its
  site's sibling `unresolvedNamedTypeDiagnostic` call already passes, inside
  that site's pre-existing guard block; a module-level
  `WITHHELD_TYPE_HEAD_KEYWORDS` set and the pure `admittedReservedKeywords`
  filter carrying the scoping; a per-annotation keyword seen-set over the
  response part's own hits at the query capture, mirroring the name class's;
  and the source comment that declined the sink replaced by the admission's own
  statement. `src/parser/params.ts` — comment-only: the sink's three doc
  comments state the caller set as it now is (nine consumers, five of them
  filtered) rather than four.
  `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`,
  `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts` — the
  offline witness and the live registration cell.
  Four existing witnesses carry the ruling's authorized 7-cell flip; four
  owning reports carry a dated coordination note each.

- **The withheld set, derived:** at the five new sites the sink withholds
  `Result`, `array`, `Ok` and `Err`, admitting the other twenty spellings that
  reach it (`let`, `mut`, `fn`, `if`, `else`, `for`, `in`, `while`, `break`,
  `continue`, `return`, `match`, `schema`, `enum`, `import`, `export`, `from`,
  `as`, `by`, `invoke`). Three independent sources settle the membership.
  (1) The type grammar: `GenericType ::= "array" "<" Type ">" | "Result" "<"
  Type "," Type ">"` (`docs/spec_topics/grammar.md` §Type grammar) makes
  `array` and `Result` constructor heads, and the same section states that both
  heads are reserved keywords reachable in type position for that reason; the
  same page's `PrimitiveType ::= "string" | "number" | "integer" | "boolean" |
  "null"` covers five further spellings, which never reach the sink because
  `src/parser/params.ts`'s atom arm tests `PRIMITIVE_TYPES` ahead of
  `RESERVED_KEYWORDS`, and `true` / `false` / `void` are dispositioned inside
  that reserved branch before the push. (2) The committed corpus spells both
  constructor heads at these positions — `docs/examples/personas.thetalib`'s
  `fn rate_strictness(a: Author): Result<integer, QueryError>` and
  `docs/examples/summarise-doc.theta`'s `themes: array<string>` — and
  `tests/committed-fixture-parse-gate.test.ts` covers every shipped fixture,
  36/36. (3) The production-conformance corpus drives a bare `Result` return
  annotation, `fn step(): Result { … }`, at V20g-T; the premeasure recorded in
  `.pi/tmp/fixes/0274-report.md` measured an unscoped sink refusing exactly
  that source. `Ok` and `Err` are `Result`'s value constructors: no `Type`
  production spells either, and neither the committed corpus nor the
  conformance corpus writes either in a type position, so withholding them is
  the ruling's conservative enumeration rather than a grammar clause.

- **Gates:** witness red before the change (`7 failed | 7 passed (14)`,
  "expected [theta/parse/reserved-keyword-as-identifier], received []") and
  green after (`14 passed (14)`); the same file red under a neutralised
  `admittedReservedKeywords` and green on byte-exact restoration
  (`git hash-object src/parser/theta-document.ts` round-tripping to
  `9e8d97f680e5140124eed22bab38a66cf6ec6b74`); full default suite
  `449 test files passed | 9302 tests passed`, zero failures;
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean; `npm run lint`
  (`eslint "src/**/*.ts"`) clean; `tests/committed-fixture-parse-gate.test.ts`
  36/36; `tests/conformance/production-conformance.test.ts` 27/27 with V20g-T
  green; `tests/fixtures/h7a/permitted-codes.json` byte-unchanged
  (`a4a8da04209f90e13d815edd92c1fc682e2a2236`).

- **Live:** `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts`
  green under the fix (1 passed) and red under the neutralised build at both
  carriers, restored byte-exact between the two runs. Bug 0273's live H8a cell
  89 re-run green and unreworded. The carrier stems are all-lowercase because
  the composition root refuses a slash name that is not lowercase kebab/snake
  before this bug's own diagnostic can decide the theta's fate; an uppercase
  stem made one carrier's absence unattributable, which the red-direction run
  exposed and the cell now records.

- **Review:** one round. `bug-fix-reviewer` returned prose-only findings — a
  section banner, a header bullet and a describe title left asserting the
  flipped cells' old silence, and one banned word in the new witness — with no
  correctness, fidelity or spec finding; a `bug-fix-fixer-light` round closed
  them together with the coordination notes' misquotation of the ruling.
  Post-polish diff inspected: comments, titles and prose only, gates re-run
  green, so the confirmation round was skipped and is recorded here instead.

- **Verification:** solid. The witness reds on the fix's neutralisation and on
  the scoping's neutralisation separately (the second also reds V20g-T, which
  is what makes the withheld-spelling group a lock rather than a vacuous
  group); restoration hash-verified on every cycle; the default suite, lint and
  typecheck green; the live obligation discharged by the orchestrator's own
  runs under the shared lock, with the live cell's assertions judged for
  vacuity and one such assertion fixed.

- **The seven flips, all authorized as a closed batch by the re-ruling:**
  `tests/b0262-unresolved-named-type-reference-positions.test.ts` cell D3's
  four rows (D3a–D3d), `tests/fn-param-name-reserved-keyword.test.ts` cell
  e10, `tests/inline-object-field-name-case.test.ts` cell r5, and
  `tests/reserved-keyword-type-position.test.ts` cell h5's two fixtures. Each
  keeps its subject and its file's own assertion idiom; every other assertion
  in those four files is byte-preserved. No eighth cell moved — the full-suite
  premeasure under the scoped change flipped exactly these four `it`s and
  nothing else. Each owning report carries a dated coordination note.

- **No registry edit owed, measured:** the *Trigger* of the
  `theta/parse/reserved-keyword-as-identifier` row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:21`) enumerates no
  position, and the four prior widenings of that row's emission set — bug 0044
  (0.54.0), bug 0148 (0.81.0), bug 0153 (0.194.0, six positions) and bug 0249
  (0.240.0) — each landed with no registry edit at all. The `:112` sentence in
  the `theta/parse/unresolved-named-type` row becomes true unedited at the
  example it names: `let a: match = 3` now draws the sibling row.

- **Residuals:**
  1. **Finding (4), unfixed and out of scope by the ruling.** A bare `Result`
     head is refused at the four already-wired callers and admitted at the five
     newly-wired ones: measured at this HEAD, ``let r = @<Result>`q` `` draws
     `theta/parse/reserved-keyword-as-identifier 'Result'` while
     `fn step(): Result { Ok(700) }`, `let a: Result = Ok(1)`,
     `let r = invoke<Result>("./x.theta", "hi")` and ``@<Result<integer, Ok>>``
     all load clean and register (witness group (X), 13 rows). The same
     position-decided reading of one spelling this report describes for
     `match`, at a spelling this report never measured. The parent files it.
  2. **`Ok` and `Err` are silent at the five new sites by the ruling's
     withhold**, so `docs/spec_topics/diagnostics/code-registry-parse.md:112`'s
     "at every position alike" stays an over-claim for those two spellings
     there. Same subject as residual 1; no same-commit spec edit is authorized
     under this §Fix.
  3. **Composed dispositions not locked.** `fn f(p: match, q: return)` and
     `fn f(p: match, q: Nope)` each draw one line while
     `fn f(p: Nope, q: match)` draws two — the pre-existing clause (iv)(3)
     cover semantics composing unchanged, measured but pinned by no cell in
     either witness.
  4. **Stale line citations in this report's own §Affected and §Actual
     behaviour**, derived at `bb7546e0`: `src/parser/theta-document.ts`'s
     numbers are low by roughly twenty lines at the fixed HEAD and the builder
     is at `:6485`, not `:6486`; `src/parser/params.ts`'s atom classification
     is at `:811`–`:841`. The citations above are not rewritten; this entry is
     the appended correction.

- **Discharge notes appended:**
  `./0273-propagated-result-error-side-unresolved-name-silent.md` —
  adjudication B(2) and residual D(1) closed;
  `./0262-unresolved-named-type-silent-at-nine-reference-positions.md`,
  `./0148-reserved-keyword-fn-parameter-position-silent.md`,
  `./0154-inline-object-type-field-name-rules-unenforced.md` and
  `./0044-unresolved-named-type-fires-for-keyword-shaped-text.md` — the flipped
  cells, their authority and what stayed byte-preserved. Every existing text in
  all five reports is unmodified.

- **Pinned dispositions / non-goals held:** the four already-wired callers are
  behaviourally byte-identical, so `@<Result>` and `@<match>` refuse exactly as
  they did (rows C1–C5 unmoved) and finding (4) is not repaired in passing; bug
  0273's `E`-side name walk, its seen-set and its emission count are
  byte-preserved; bug 0262 clause (iv)(2)'s propagation withhold and clause
  (iv)(3)'s capture-absorption suppression carry the new emissions unchanged,
  because each one sits inside its site's existing guard chain; bug 0272's
  containment filter composes through that same chain and no second suppression
  path was minted; row E10's non-arity-2 path still descends nothing; row E9
  still draws one line; the `fn` / `for` / `if` / `while` `single-line-if`
  misfire is untouched; no *Message* byte and no registry row moved.

## Coordination note (0.273.0) — row E10 restated under bug 0278's fix

2026-08-25. [Bug 0278](./0278-result-arity-mismatch-silent-at-query-response-annotation.md)
§Fix feeds the WHOLE `@<T>` query annotation to the capture's position-rule
pass, so an author-written non-arity-2 `Result` application now draws one
error-severity `theta/parse/generic-arity-mismatch` and is refused
registration where it was silent. Row E10 of
`tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` is
stated by that file's header as measuring the non-arity-2 path and pinned that
silence, so the flip was unavoidable. It was taken under this report's own §Fix
Locks clause — a flip there is authorized only with the cell's subject restated
in the same commit — and under 0278 §Fix's naming of E10 as the cell it was
most likely to move.

The cell was RESTATED, not deleted, and its subject survives: an arity-3
application carrying a reserved head still draws the arity verdict and NO
`theta/parse/reserved-keyword-as-identifier` line, because the withhold and the
sink this report landed are untouched — the interior of a wrong-arity
application stays undescended. The file's header bullet was updated to match
and the DIAG-2 group was closed over the pre-existing `generic-arity-mismatch`
row. All fourteen cells are green, and the live sibling
`tests/live/b0274live-reserved-keyword-type-head-registration.test.ts` was
re-run under the shared live lock and is green.

The four already-wired callers stay behaviourally byte-identical, rows C1–C5
are unmoved, row E9 still draws one line, and no *Message* byte and no registry
row moved.

## Coordination note (0.275.0) — the a-scoped withhold removed, row group (X) inverted, live control respelled

2026-08-25. [Bug 0277](./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md)
§Fix route (a) removed this report's own `WITHHELD_TYPE_HEAD_KEYWORDS` set and
the `admittedReservedKeywords` filter it fed (`src/parser/theta-document.ts`).
Bug 0277 measured that the set protects no APPLIED `Result<…>` / `array<…>` —
neither ever reaches `lowerTypeExpr`'s atom arm, the only seam the withhold sat
on — so it withheld only the UNAPPLIED, zero-argument spelling, which no
`Type` production derives. This report's own residual 1 handed that split over
as a separate subject; bug 0277's fix is that subject's disposition.

Each of the five sinks this report wired now renders every hit directly,
exactly as the four already-unfiltered callers this report left untouched
always have. Group (X) of
`tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` —
the cell that locked the withheld set's scope — is RESTATED, not deleted,
following the same discipline this report's own row-E10 restatement above
used: eight of its thirteen rows (the UNAPPLIED `Result` / `array` / `Ok` /
`Err` spellings) now draw `theta/parse/reserved-keyword-as-identifier` and
deny registration; the remaining five — two primitives (X3, X12), one
primitive union arm (X4), and two APPLIED heads (X9, X13) — are unmoved,
because they never reached the atom arm either before or after. The file's
header commentary carries a matching coordination note rather than being
silently left to describe a withhold that no longer exists.

`tests/live/b0274live-reserved-keyword-type-head-registration.test.ts`'s
CONTROL theta is respelled for the same reason: its `fn step(): Result { … }`
return annotation was the UNAPPLIED shape, legal there only under the withhold
this note records as removed. Respelled `Result<integer, QueryError>` — an
APPLIED head, admitted under bug 0277 §Fix route (a) exactly as it was under
this report's own — the control still registers and drives a real turn, its
declared purpose; `step` is declared and never called, so the respelling
changes no assertion.

The four already-wired callers, rows C1–C5, row E9, row E10 and the *Message*
and registry rows all stay exactly as this report and its 0.273.0 note left
them — bug 0277 §Fix route (a) touches only the five-site withhold and its own
named witnesses.

# Bug 0044 — `theta/parse/unresolved-named-type` fires for reserved-keyword-shaped text, which is not a `NamedType`: `schema X { f: void }` and `schema X = void` each emit the registered `void-in-non-return-position` AND `unresolved named type 'void'`, and 25 of the 32 reserved keywords draw the row at the schema-body field and `@<T>` positions, 27 at the `params:` right-hand side

- **Status:** fixed (0.54.0). §Fix as settled — the atom section classifies a
  reserved-keyword spelling before the `NamedType` resolution can reach it, and
  `void`'s own registered row is wired at the two positions that lacked it. See
  §Fix (0.54.0) below.
- **Kind:** defect — an emission outside its registry row's trigger. The row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:89`) triggers on "A
  `NamedType` that resolves to no declaration usable at the position it is
  written". `NamedType ::= Ident` (`docs/spec_topics/grammar.md:98`), and a
  reserved keyword cannot be an `Ident`
  (`docs/spec_topics/lexical.md:20`: "Cannot be used as identifiers", with
  `array` and `Result` singled out — "keeping them reserved is what stops them
  matching `NamedType ::= Ident`"). Keyword-shaped source text is therefore
  outside the row's trigger at every position, and the diagnostic's own message
  (`unresolved named type '<name>'`) asserts a resolution failure for something
  that is not a name. Two observable shapes:
  1. **Double emission where the position has its own registered rejection.**
     `schema X = void` and `schema X { f: void }` each emit
     `theta/parse/void-in-non-return-position` — the correct, registered
     rejection — followed by `theta/parse/unresolved-named-type` naming `void`.
     The two emissions are byte-identical across the alias-RHS and
     schema-body-field positions.
  2. **Sole wrong emission where the position has none.** For 20 of the 32
     reserved keywords at the schema-body field position, 21 at the `@<T>`
     annotation and 27 at the `params:` right-hand side,
     `unresolved-named-type` is the *only* diagnostic: `schema X { f: match }`
     reports `unresolved named type 'match'` and nothing else. `void` at the
     `params:` RHS and at `@<T>` is in this class — the registered
     `void-in-non-return-position` is not wired at those two positions, so the
     wrong row is the sole rejection.

  The two boolean `LiteralType` atoms are a third shape: `true` and `false` are
  reserved keywords *and* legal `Type` atoms
  (`LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`,
  `docs/spec_topics/grammar.md:102`). `schema X { f: true | string }` emits
  `unresolved named type 'true'`, as does `params: p: true` for the bare atom,
  while `schema X { f: true }` lowers `{"const":true}` and reports nothing.
- **Related:**
  - [0033](./0033-body-level-schema-alias-unsupported.md) — the alias-RHS half
    arrived with its §Fix (0.45.0), deliberately, as field-position parity, and
    is pinned by that fix's witness cell n8
    (`tests/schema-alias-union-decl.test.ts:1771–1790`): "`unresolved named
    type 'void'` … is what the whole-file name walk makes of the keyword at
    BOTH positions, and rescuing the arm means reproducing the field position
    exactly rather than improving on it … belongs to a report that takes the
    field position as its subject" (`:1774–1778`). This is that report. 0033
    §Fix residual (iii) (`:202–205`) and
    `.pi/tmp/fixes/0033-report.md:11` record the behaviour as pre-existing and
    unfiled. **Both records name the wrong sibling code** —
    `theta/parse/unknown-identifier` — where the emission observed at HEAD, and
    the one n8 itself pins, is `theta/parse/void-in-non-return-position`
    (`tests/schema-alias-union-decl.test.ts:1603` binds `VOID_POSITION` and
    `:178` binds `UNRESOLVED`; both are read out of the registry through
    `registryMessage`). The correction lands with this fix.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — the
    walk's origin. Its §Fix (0.38.0) added `collectUnresolvedNamedTypes` and
    wired the schema-body field type and the `@<T>` annotation through the
    shared builder (`:191–208`), which is where shapes 1 and 2 at those two
    positions begin. Its `:207–208` also fixes the row's negative boundary —
    "`let x: Nope = 1`, `fn f(a: Nope)`, a union arm and `invoke<Nope>` all
    stay silent" — which holds for keyword spellings too and bounds this
    defect to the row's own positions.
  - [0025](./0025-ctor-unresolved-schema-name-passthrough.md) — wrote the
    widened four-position row 0028 then implemented (0028 §Fix `:240–242`), and
    owns the fifth position, the object-constructor name. That position is
    **unreachable** for keyword-shaped text: the lexer tags a reserved
    spelling `keyword`, not `ident` (`src/lexer/lexer.ts:665`), so
    `match { f: 1 }` draws `theta/parse/bare-object-literal` and never reaches
    `checkObjectExpr` (`src/parser/theta-document.ts:5868`). The defect covers
    four of the row's five positions.
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — the sibling
    defect in the same frame, `lowerTypeExpr`
    (`src/parser/params.ts:357–411`). 0043 owns the arm *order* (generic tested
    before union); this report owns the atom *classification* (keyword
    spellings admitted as `NamedType`). The two edits touch different blocks of
    one function and are independent in either order.
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — the inline-object annotation interior reaches the same walk
    (`collectUnresolvedNamedTypes` dispatches `{ … }` to `lowerInlineObject`,
    `src/parser/body-type-lowering.ts:342–345`), so `@<{ f: match }>` emits
    `unresolved named type 'match'` on the same mechanism.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/params.ts:329` — `const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/`.
    Every reserved keyword's spelling matches it.
  - `src/parser/params.ts:395–411` — `lowerTypeExpr`'s atom section, the frame.
    `PRIMITIVE_TYPES` is tested first (`:396`, admitting `string`, `number`,
    `integer`, `boolean`, `null`); the next test is `IDENTIFIER.test(s)`
    (`:399`) whose comment reads "An identifier-shaped atom is a `NamedType`:
    resolve whole-file". The resolution set (`lowerCtx.bodyTypeMap`) carries
    declaration names only, so an unresolved lookup (`:402`) appends the
    spelling to the sink (`:403`) and returns `{}` (`:404`). No keyword test
    exists between `:396` and `:399`, and no `LiteralType` test for `true` /
    `false` exists before `:399` either — the trailing comment at `:409–410`
    says literal lowering "is owned by the schema-subset leaves", which is true
    for string and number literals (they fail the regex) and false for the two
    boolean spellings (they pass it).
  - `src/parser/body-type-lowering.ts:334–350` — `collectUnresolvedNamedTypes`,
    the walk three of the four positions share. It builds the resolution map
    from `declared` (`:338–340`), dispatches a brace-rooted source to
    `lowerInlineObject` (`:342–345`) and everything else to `lowerTypeSource`
    (`:346`), and returns `[...new Set(unresolved)]` (`:348`) — so a repeated
    keyword within one type source reports once.
  - `src/parser/body-type-lowering.ts:131–154` — `lowerTypeSource`. Its
    top-level `parseLiteralArm` pre-check (`:139–150`, the helper at
    `:357–383`) recognises `true`, `false`, `null` and quoted/numeric literals
    and returns `{const: …}`, which is why a *bare* `true` is silent at the
    three positions routed through this function. The check applies to the
    whole source and to an all-literal union only; a mixed union
    (`true | string`) falls through to `lowerTypeExpr` (`:153`), whose arm loop
    re-enters the atom section with no literal recognition.
  - `src/parser/theta-document.ts:5823` — the schema-body field-type call,
    ranged at the declaration (`:5817–5822`); `:5425` — the alias-RHS call over
    `s.arms.join(" | ")` (bug 0033 §Fix, `:5419–5424`); `:6075` — the `@<T>`
    annotation call.
  - `src/parser/params.ts:159–167` — the `params:` RHS emission site.
    `parseParams` iterates `lowerCtx.unresolved` **without deduping**, so
    `p: match | match` emits the row twice where the schema-body field position
    emits it once.
  - `src/parser/theta-document.ts:4663–4672` — the shared builder's docstring,
    which states the row's closed five-position list and that positions outside
    it resolve and report nothing. It does not contemplate keyword-shaped
    input at any of the five; `:4718–4730` is the builder.
  - `src/parser/theta-document.ts:5812` and `:5407` —
    `parseTypeExpression(…, "schema-feeding")` at the schema-body field and
    alias-arm positions. This is the only wiring of the type-grammar checks, so
    `void-in-non-return-position` fires at exactly those two of the four
    positions. There is no such call for the `params:` RHS or the `@<T>`
    annotation.
  - `src/parser/type-grammar.ts:207–254` — `TypeParser.parsePrimary`, the
    second type parser, which already carries the classification the frame
    lacks: `void` → `{kind:"void"}` (`:235–237`), `true` / `false` →
    `{kind:"literal"}` (`:238–240`), primitives → `{kind:"prim"}`
    (`:250–252`). It has no reserved-keyword case either — every other keyword
    falls to `{kind:"named"}` (`:253`) — but it raises nothing for a `named`
    node, so it contributes no diagnostic. `walkType` (`:324–388`) is where
    `void-in-non-return-position` is raised (`:332–345`).
  - `src/lexer/lexer.ts:152–160` — `reservedKeywords()`, the 32-member set,
    module-private (not exported); `:665` — the `keyword` / `ident` token-kind
    split that consumes it; `:787–797` — `contextualDiagnostics`, whose scope
    note reads "full identifier-position coverage (every reserved word in every
    identifier slot) is a parser-leaf obligation; the lexer core enforces the
    positions its closed Tests obligations name", and `:807–815` — the
    `theta/parse/reserved-keyword-as-identifier` emission it does raise, at
    declarator-name positions only (`checkName` calls at `:870`, `:872`,
    `:874`).
  - `tests/schema-alias-union-decl.test.ts:1771–1790` — cell n8, the pin.
    `:345–348` — its four fixtures (`F_ALIAS_VOID`, `F_FIELD_VOID`,
    `F_ALIAS_VOID_UNION`, `F_FIELD_VOID_UNION`); `:587–607` —
    `expectArmMatchesFieldControl`, which asserts the alias list EQUALS the
    field control's, so the pin holds both halves of the double emission at
    both positions and inverts if either moves.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:89` — the row whose
    trigger the emission escapes; `:59` — `void-in-non-return-position`, whose
    trigger already names "schema or `params:` field" and "type ascription"
    among its positions but which is implemented at two of the four; `:21` —
    `theta/parse/reserved-keyword-as-identifier`, trigger "Reserved keyword
    used in an identifier position", message `reserved keyword '<keyword>'
    cannot be used as an identifier`.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument` (via
  `tests/helpers/e2e-s1.ts`), `lowerTypeSource` and `lowerTypeExpr` over all 32
  reserved keywords × four positions; written, run, deleted.

## Fix (0.54.0)

The settled §Fix, implemented as written. Two review rounds, one fixer round
and one verification round; line anchors are at the fix commit.

**Classification.** `lowerTypeExpr`'s atom section (`src/parser/params.ts`)
tests the lexer's own 32-member set between `PRIMITIVE_TYPES` and the
`IDENTIFIER` regex, so no reserved spelling reaches the `NamedType` resolution
that was guaranteed to miss it. `true` / `false` lower `{const: true}` /
`{const: false}` and report nothing (`LiteralType`, grammar.md:102), matching
what `parseLiteralArm` already returned for the same atom at the top level;
`void` lowers `{}` and records nothing, its own registered row being the
rejection; every other reserved spelling lowers `{}` and records on a second
sink, `LowerCtx.reservedKeywords`, which each of the four callers drains as
`theta/parse/reserved-keyword-as-identifier`. The set is
`reservedKeywords()` (`src/lexer/lexer.ts`), exported for this use rather than
restated — one source of truth for the 32 spellings, and the export closes no
cycle. It is bound once as an immutable module-level `ReadonlySet` beside
`PRIMITIVE_TYPES`; a `Set` and not a record keyed by author text, which would
need a null prototype and an own-key guard to be indexed by source spellings
safely.

**Wiring `void`'s own row.** `parseTypeExpression` now runs at the `params:`
right-hand side and the `@<T>` annotation root, the two of the four positions
that lacked it, so `void` draws `theta/parse/void-in-non-return-position` at
every position and nothing else. Two route choices inside §Fix's constraints,
settled here:

- **The `params:` RHS runs at `"schema-feeding"`**, §Fix's literal text. That is
  also what the seam's own closed `TypePosition` classification
  (`src/parser/type-grammar.ts`) names a `params:` field type, and both rows the
  position newly draws beyond `void` are already registered *for that position*:
  `theta/parse/result-in-schema-position`
  (`docs/spec_topics/diagnostics/code-registry-parse.md:60` — "a schema field
  type, a `params:` field type, or any type reachable transitively from those")
  and `theta/parse/generic-arity-mismatch` (`:58`, whose trigger is
  position-independent). `params: p: Result<string, string>` and
  `params: p: array<integer, string>` therefore move from silent to their own
  registered rejections.
- **The `@<T>` annotation root runs at `"value"`, not `"schema-feeding"`.**
  `@<Schema>` is a type ascription (`docs/spec_topics/query/query-forms.md:44`,
  `:57` — the same citation §Expected behaviour uses to put `void` there), and
  `TypePosition` places ascriptions in `"value"`: `void` rejected, `Result`
  admitted. `docs/spec_topics/grammar.md` §Type grammar says so directly —
  `Result` "remains admitted in … `invoke<Type>` / type-ascription contexts" —
  and `:60` does not name the annotation among its positions. Running the
  annotation at `"schema-feeding"` would have widened that row's trigger, which
  §Blast radius forbids ("**Registry.** No new code and no *Message* edit"), so
  the position argument is the one that leaves the trigger where the registry
  has it. `@<array<Result<string, string>>>` staying silent is pinned as the
  guard cell for this choice; `@<array<integer, string>>` draws the
  position-independent arity row.

**Emission order.** At all four callers the `parseTypeExpression` diagnostics
drain first, then the keyword sink, then `unresolved` — the order the
schema-body field position already had, where `parseTypeExpression` precedes the
walk. The two sinks can never name the same spelling (`NamedType ::= Ident`
bars a keyword from `unresolved`), so the order is only observable when one
source carries both classes: `schema X = Nope | mut` reports the keyword, then
the name.

**No spec, registry, `docs/reference/` or `permitted-codes.json` edit.** DIAG-2
held: no new code, no new row, no widened trigger. Every code emitted was
already registered with a trigger covering the position it now fires at — `:21`
("Reserved keyword used in an identifier position", and `NamedType ::= Ident`
is one), `:59` (already naming "schema or `params:` field" and "type
ascription"), `:58`, `:60`. `theta/parse/unresolved-named-type`'s row (`:90` —
`:89` in this report's cites, one line of drift since 0042 landed a row above
it) states its trigger as "a `NamedType` that resolves to no declaration usable
at the position it is written"; the narrowing brings the implementation *into*
that trigger rather than out of it, so the prose needed no edit — before the
fix the implementation over-stepped the row, after it the two agree.
`docs/reference/diagnostics.md` mirrors messages only, and no message moved.
No committed `.theta` / `.thetalib` fixture writes a reserved keyword in a
`Type` position, so no committed fixture emits any of the four codes and the
H9a EMPTY-CAPTURE permitted-code list is unchanged — verified by an acceptance
run, not inferred. GOV-15: every input whose code changes carried an `E` at
baseline except the `true` / `false` class (which the fix makes load, per
grammar.md:102) and the `params:` `Result` / arity classes (silent → their own
registered rows); all of it is the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)'s
addition-and-removal arm over already-registered triggers.

**The stale records §Fix names are corrected in the same commit.** 0033 §Fix
(0.45.0) residual (iii) gained an appended discharge note naming the correct
sibling code — the emission beside `unresolved-named-type` is
`theta/parse/void-in-non-return-position`, never
`theta/parse/unknown-identifier` — and recording that the residual is now both
filed and closed. Nothing was deleted from it. 0039 §Fix (0.49.0) residual (vi)
gained the same treatment: the newly-descended inline-object sites still refuse
`@<{a: {b: match}}>`, under this report's row rather than the one that residual
names. Two further restatements of the `unknown-identifier` misnaming, in
`docs/bugs/0042-…md` and the still-open `docs/bugs/0046-…md`, are left to their
owners and recorded as residuals below.

**The defect family reproduced byte for byte at HEAD.** §Reproduction was
written at 0.45.0 and six fixes landed between; the baseline was re-derived at
`af7f932e` with a scratch probe over all 32 keywords × four positions before
any assertion was pinned. Every count holds — `U` at the alias RHS for 10
keywords, the schema-body field for 25, the `params:` RHS for 27, `@<T>` for
25, sole for 9 / 20 / 27 / 21 — as do the 15 alias-arm-stopped cells' residue
codes, the boolean-`LiteralType` split, the multiplicity table and the
unreachable object-constructor position. Only `path:line` drifted: the registry
row is `:90`; `params.ts`'s frame is `lowerTypeExpr` at `:394` with the atom
section at `:439–465`, `IDENTIFIER` at `:357` and the `params:` emission site at
`:155–176`; `body-type-lowering.ts`'s `lowerTypeSource` is `:336`,
`collectUnresolvedNamedTypes` `:671`, `parseLiteralArm` `:694`;
`theta-document.ts`'s four call sites are `:5632` / `:5650` (alias), `:6037` /
`:6048` (field) and `:6300` (annotation), with `unresolvedNamedTypeDiagnostic`
at `:4943`; `lexer.ts`'s `reservedKeywords()` is `:153`; cell n8 is `:1773–1792`.
One fact §Reproduction under-states: `false | integer` reds at all four
positions, not only at `params:` — same mechanism as `true | string`.

**Boundary against the open siblings.** Keyword-shaped text at a `Type`
position is this report's subject and is now `reserved-keyword-as-identifier`.
Lowercase *non-keyword* text at a reference position — the `NamedType` casing
rule — remains [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s,
untouched here: such text still resolves or draws `unresolved-named-type`.
Junk and operator-absorbed arm text is
[0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)'s, the
inline `{}` [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)'s,
and `params:` scalar non-type text
[0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s;
none of the three is a reserved spelling, so none moves.

**Offline lock.** `tests/reserved-keyword-type-position.test.ts` (42 cells,
unit, offline, provider-free): the whole 32-keyword × four-position matrix as
one pinned table per position, tied to `lexical.md` §Reserved keywords by a
cell that reads the spec list itself, including the alias column's 15
residue-bearing cells as controls; `void` as the sole emission at all four
positions plus `array<void>`, the union arm, `@<{ f: void }>` and
`params: p: { f: void }`; the boolean-`LiteralType` set at all four positions
with `lowerTypeSource`-beside-`lowerTypeExpr` byte pins and a real
`AjvSchemaValidator` accept/reject table over
`{"anyOf":[{"const":true},{"type":"string"}]}`; the multiplicity cells; the
drain-order cells; the two new positions' collateral including the
`@<array<Result<…>>>` guard; and no-op cells for the five primitives,
`array<integer>`, `Result<string, string>`, `Nope`, `let a: match = 1` and
`fn f(p: match)`. Every expected message is read from the registry through
`registryMessage` (DIAG-4), never copied prose. Three existing cells moved
under §Fix's own authority: cell n8
(`tests/schema-alias-union-decl.test.ts`) to the single-line expectation §Blast
radius specifies, keeping `expectArmMatchesFieldControl` as the equality
assertion; cell e-M3 (`tests/params-block-mapping-rhs-refusal.test.ts`) from
pinning the mis-classification of `params: p: true` to pinning that it loads
and lowers `{"const": true}` — its comment's attribution of the
mis-classification to 0056 is corrected, 0056 owning only the non-keyword
literal forms; and cells g5 / g6 / j1 / j2
(`tests/union-generic-arm-lowering.test.ts`), where the `params:` position
joins the alias and field positions as one that runs the schema-feeding gate.
No other existing test moved: `collectUnresolvedNamedTypes` keeps its
signature and return type, taking the keyword class through a trailing optional
out-param sink in the shape `lowerTypeSource` already uses for `unresolved`, so
0039's three walker cells needed no edit.

**Both directions verified.** Each of the three parts was neutralised
separately and restored byte-exactly (blob-hash proved): removing the
classification reds 31 cells, removing the `params:` call reds 11, removing the
annotation call reds 8. Default suite 244 files / 3327 tests green; typecheck
and lint clean. Live: H8a `live-production-acceptance` 7/7 and the H9a
acceptance half 11/11, each twice. No shipped live test writes a reserved
keyword in a `Type` position, so a scratch live probe drove three planted
thetas (`params: p: void`, `@<void>`, `schema Flag { v: true | string }` behind
a typed query) through the shipped extension — red with the fix neutralised,
green with it in place, then deleted, per the 0033 precedent.

**Residuals.** (i) The `params:`-site dedup asymmetry is inherited by both
sinks, as §Non-goals directs: `p: match | match` reports twice where
`f: match | match` reports once. Unfiled. (ii) The `unknown-identifier`
misnaming this fix corrects on 0033 is restated independently in
`docs/bugs/0042-schema-decl-same-line-residue-silent.md` (fixed, so historical)
and in the still-open `docs/bugs/0046-by-clause-undecided-inputs-load-silently.md`,
which this fix does not own and did not edit. (iii) `parseParams`'s docstring
lists the three codes its schema-feeding call can raise in a different order
from `walkType`'s own emission sequence (`generic-arity-mismatch`,
`result-in-schema-position`, `void-in-non-return-position`); the group-level
order it asserts is correct. Prose only. (iv) A bare generic head
(`array`, `Result` without arguments) draws `reserved-keyword-as-identifier`
under this fix; whether an unapplied constructor head deserves its own row is
the registry question §Non-goals declines to open.

## Summary

`unresolved-named-type`'s trigger is a `NamedType` that resolves to nothing.
`NamedType ::= Ident`, and reserved status is precisely what stops a keyword
being an `Ident` — `docs/spec_topics/lexical.md:20` says so, and says it about
`array` and `Result` by name. The lexer implements that split at
`src/lexer/lexer.ts:665`, tagging the 32 spellings `keyword` rather than
`ident`.

The resolution walk does not consult that split. `lowerTypeExpr`'s atom section
(`src/parser/params.ts:395–411`) tests `PRIMITIVE_TYPES` and then a bare
`^[A-Za-z_][A-Za-z0-9_]*$` regex, calls whatever matches a `NamedType`, and
looks it up in a map built from declaration names. Keyword spellings match the
regex and are absent from the map, so each lands in the `unresolved` sink and is
reported as an unresolved name.

Consequences at the four positions the row registers and the walk serves:

- **The declaration's real error is reported alongside a false one.**
  `schema X = void` and `schema X { f: void }` emit
  `void-in-non-return-position` — which is what `docs/spec_topics/grammar.md:105`
  and the registry row at `:59` prescribe — and then `unresolved named type
  'void'`, which claims the file declares no type called `void`.
- **Where no other check is wired, the false diagnostic is the only one.**
  `schema X { f: match }`, `@<match>` and `params: p: match` each report only
  `unresolved named type 'match'`. So does `void` at the `params:` RHS, at
  `@<T>`, and inside an inline-object annotation — the registered
  `void-in-non-return-position` is not wired at those positions, so the author
  is told the wrong thing about the right rejection.
- **Two legal `Type` atoms are refused.** `true` and `false` are reserved
  keywords and `LiteralType` atoms. Written alone at a position routed through
  `lowerTypeSource`, they lower `{"const":true}` and report nothing; written as
  one arm of a mixed union, or anywhere on the `params:` RHS, they report
  `unresolved named type 'true'`.

The mechanism is one frame and predates the alias position. The `params:` half
is the walk's original site (`src/parser/params.ts:159–167`); the field and
`@<T>` halves arrived with 0028's fix (0.38.0); the alias half arrived with
0033's fix (0.45.0), which reproduced the field position deliberately and
recorded the result as residual (iii) rather than improving on it.

## Reproduction

Offline, at `f959f8de`. Scratch vitest: `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
plus direct `lowerTypeSource` / `lowerTypeExpr` calls for the lowered bytes.
Every fixture ends `let a = 1` + `a` so the file has a tail expression; the
`params:` fixtures carry `mode: prompt` so no `theta/load/missing-mode` noise
is present. Diagnostics are listed in emission order.

### The double emission, both positions, byte-identical

```
@@ schema X = void
   ["theta/parse/void-in-non-return-position :: 'void' is only permitted as a function or theta return type",
    "theta/parse/unresolved-named-type :: unresolved named type 'void'"]
@@ schema X { f: void }
   ["theta/parse/void-in-non-return-position :: 'void' is only permitted as a function or theta return type",
    "theta/parse/unresolved-named-type :: unresolved named type 'void'"]
@@ schema X = void | string          same two lines, same order
@@ schema X { f: void | string }     same two lines, same order
@@ schema X { f: array<void> }       same two lines, same order
```

Cell n8 (`tests/schema-alias-union-decl.test.ts:1771`) asserts list equality
between the alias and field forms for the two `void` pairs — the first four
fixtures above. The `array<void>` field is unpinned.

### `void` where its own row is not wired — the wrong code alone

```
@@ params: p: void                   ["theta/parse/unresolved-named-type :: unresolved named type 'void'"]
@@ params: p: array<void>            ["theta/parse/unresolved-named-type :: unresolved named type 'void'"]
@@ let r = @<void>`hi`               ["theta/parse/unresolved-named-type :: unresolved named type 'void'"]
@@ let r = @<array<void>>`hi`        ["theta/parse/unresolved-named-type :: unresolved named type 'void'"]
@@ let r = @<{ f: void }>`hi`        ["theta/parse/unresolved-named-type :: unresolved named type 'void'"]
```

Controls, where the type-grammar walk *is* wired:

```
@@ let a: void = 1                   ["theta/parse/void-in-non-return-position :: …"]
@@ fn f(): void { … }                []                       (the one admitted position)
   (braced body across lines — a single-line body is `theta/parse/single-line-if`)
```

### The reachable matrix — all 32 reserved keywords × four positions

`U` = `theta/parse/unresolved-named-type` fires. Fixtures: `schema X = <kw>`
(alias RHS), `schema X { f: <kw> }` (schema-body field), `params: p: <kw>`
(`params:` RHS), `let r = @<<kw>>`hi`` (`@<T>` annotation). "+ …" lists the
other codes the same file emits.

| keyword | alias RHS | field | `params:` | `@<T>` |
| --- | --- | --- | --- | --- |
| `let` | — (stopped: `empty-schema-body`, `let-without-initialiser`) | **U** alone | **U** alone | **U** alone |
| `mut` | **U** alone | **U** alone | **U** alone | **U** alone |
| `fn` | — (stopped) | **U** + `single-line-if` | **U** alone | **U** + `single-line-if` |
| `if` | — (stopped) | **U** + `single-line-if` | **U** alone | **U** + `single-line-if` |
| `else` | **U** alone | **U** alone | **U** alone | **U** alone |
| `for` | — (stopped) | **U** + `single-line-if` | **U** alone | **U** + `single-line-if` |
| `in` | **U** alone | **U** alone | **U** alone | **U** alone |
| `while` | — (stopped) | **U** + `single-line-if` | **U** alone | **U** + `single-line-if` |
| `break` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `continue` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `return` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `match` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `schema` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `enum` | **U** alone | **U** alone | **U** alone | **U** alone |
| `import` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `export` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `from` | **U** alone | **U** alone | **U** alone | **U** alone |
| `as` | **U** alone | **U** alone | **U** alone | **U** alone |
| `by` | **U** alone | **U** alone | **U** alone | **U** alone |
| `invoke` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `true` | — (`{"const":true}`) | — (`{"const":true}`) | **U** alone | — |
| `false` | — (`{"const":false}`) | — (`{"const":false}`) | **U** alone | — |
| `null` | — (primitive) | — (primitive) | — (primitive) | — (primitive) |
| `Ok` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `Err` | — (stopped) | **U** alone | **U** alone | **U** alone |
| `Result` | **U** alone | **U** alone | **U** alone | **U** alone |
| `string` | — (primitive) | — (primitive) | — (primitive) | — (primitive) |
| `number` | — (primitive) | — (primitive) | — (primitive) | — (primitive) |
| `integer` | — (primitive) | — (primitive) | — (primitive) | — (primitive) |
| `boolean` | — (primitive) | — (primitive) | — (primitive) | — (primitive) |
| `array` | **U** alone | **U** alone | **U** alone | **U** alone |
| `void` | **U** + `void-in-non-return-position` | **U** + `void-in-non-return-position` | **U** alone | **U** alone |

Counts: **U** fires at the alias RHS for 10 keywords, at the schema-body field
for 25, at the `params:` RHS for 27, at `@<T>` for 25. It is the **sole**
diagnostic for 9 / 20 / 27 / 21 respectively.

Reading the matrix:

- **The five primitive spellings never reach the arm.** `PRIMITIVE_TYPES`
  (`src/parser/params.ts:321–327`) is tested first, so `string`, `number`,
  `integer`, `boolean`, `null` are correct at every position.
- **`array` and `Result` reach it only written bare.** With arguments they take
  the generic arm; `array<integer>` and `Result<string, string>` are unaffected
  (`Result` in a schema-feeding position draws its own
  `theta/parse/result-in-schema-position` where the type-grammar walk is
  wired).
- **The alias RHS column is short because of 0033's arm-boundary stops.**
  `ALIAS_ARM_STOP_KEYWORDS` (`src/parser/theta-document.ts:1445–1461`) holds 15
  spellings — `let`, `fn`, `if`, `while`, `for`, `break`, `continue`, `return`,
  `schema`, `import`, `export`, `match`, `invoke`, `Ok`, `Err` — and each of
  those ends the right-hand-side capture instead of becoming an arm, so
  `schema X = match` draws `empty-schema-body` plus whatever the residue
  statement draws, not `U`. `enum` is deliberately absent from the set (it must
  reach `checkInlineEnumForm`), as are `true` / `false` / `null` (they are
  `LiteralType` atoms), which is why those four appear in the alias column at
  all. The other 17 spellings reach the arm.
- **The `params:` column is the longest** because it is the only one of the four
  that does not route through `lowerTypeSource` — so it also loses the
  `parseLiteralArm` pre-check, and `true` / `false` join the column.
- **`single-line-if` at the `fn` / `if` / `for` / `while` cells** is the
  statement loop's reading of the residue, unrelated to the type position.

### Multiplicity

```
@@ schema X { f: match | match }           1 × U      (collectUnresolvedNamedTypes dedups per type source)
@@ schema X { f: match, g: match }         2 × U      (one walk per field)
@@ params: p: match | match                2 × U      (parseParams does not dedup)
@@ params: p: true | false                 U 'true', U 'false'
```

### The boolean `LiteralType` atoms

Seam-level, `lowerTypeSource` (the field / alias / annotation route) beside
`lowerTypeExpr` (the `params:` route), empty resolution set:

```
                    lowerTypeSource                     lowerTypeExpr
true                {"const":true}       []             {}                       ["true"]
false               {"const":false}      []             {}                       ["false"]
null                {"const":null}       []             {"type":"null"}          []
true | false        {"enum":[true,false]} []            {"anyOf":[{},{}]}        ["true","false"]
true | string       {"anyOf":[{},{"type":"string"}]}     ["true"]   (both lowerers, byte-identical)
false | integer     {"anyOf":[{},{"type":"integer"}]}    ["false"]  (both lowerers, byte-identical)
match               {}                   ["match"]      {}                       ["match"]
void                {}                   ["void"]       {}                       ["void"]
array               {}                   ["array"]      {}                       ["array"]
Result              {}                   ["Result"]     {}                       ["Result"]
array<match>        {"type":"array","items":{}}          ["match"]  (both lowerers, byte-identical)
Nope                {}                   ["Nope"]       {}                       ["Nope"]  ← the row's real subject
```

End-to-end, the same split:

```
@@ schema X { f: true }                    []
@@ schema X { f: true | false }            []
@@ schema X { f: true | string }           ["theta/parse/unresolved-named-type :: unresolved named type 'true'"]
@@ let r = @<true | string>`hi`            ["theta/parse/unresolved-named-type :: unresolved named type 'true'"]
@@ let r = @<true>`hi`                     []
@@ schema X { f: "a" | string }            []
@@ schema X { f: 1 | string }              []
@@ schema X { f: null | string }           []
```

Only the boolean spellings diverge from their sibling literal forms, and only
because they match the identifier regex.

### The row's real subject, unchanged

```
@@ schema Y { g: string }  +  schema X { f: Y }     []
@@ schema X { f: Nope }                             ["theta/parse/unresolved-named-type :: unresolved named type 'Nope'"]
```

### The fifth registered position is unreachable

All 32 spellings at the object-constructor position (`let r = <kw> { f: 1 }`)
draw the statement loop's or the lexer's reading of the residue —
`theta/parse/bare-object-literal`, `theta/parse/unknown-identifier`,
`theta/parse/empty-schema-body`, `theta/parse/single-line-if` and similar — and
none draws `unresolved-named-type`. The lexer's `keyword` tagging
(`src/lexer/lexer.ts:665`) is what keeps `checkObjectExpr` out of reach.

### Positions outside the row, silent as 0028 §Fix records

```
@@ let a: match = 1                        []
@@ fn f(p: match): integer { 1 }           []
```

## Expected behaviour

- `docs/spec_topics/diagnostics/code-registry-parse.md:89` triggers
  `theta/parse/unresolved-named-type` on "A `NamedType` that resolves to no
  declaration usable at the position it is written". Keyword-shaped text is not
  a `NamedType`: `NamedType ::= Ident` (`docs/spec_topics/grammar.md:98`) and
  `docs/spec_topics/lexical.md:20` bars every one of the 32 spellings from
  identifier position, stating for `array` and `Result` that "keeping them
  reserved is what stops them matching `NamedType ::= Ident`". So no keyword
  spelling emits this row at any position, and its message —
  `unresolved named type '<name>'` — is never rendered with a keyword in the
  `<name>` slot.
- `docs/spec_topics/diagnostics/code-registry-parse.md:21` is the registered
  disposition for the class: "Reserved keyword used in an identifier position",
  message `reserved keyword '<keyword>' cannot be used as an identifier`.
  `NamedType ::= Ident` is an identifier position, so the trigger already
  covers a keyword written where a `NamedType` is read; no trigger edit is
  required. `src/lexer/lexer.ts:794–796` states the residual obligation in the
  code: "full identifier-position coverage (every reserved word in every
  identifier slot) is a parser-leaf obligation".
- `docs/spec_topics/grammar.md:105` and
  `docs/spec_topics/diagnostics/code-registry-parse.md:59`: `void` in any
  `Type` position other than a function/theta return type is
  `theta/parse/void-in-non-return-position`, and the row names "schema or
  `params:` field" and "type ascription" among those positions.
  `docs/spec_topics/type-system.md:15` names "`@<T>`…`` explicit query
  schemas" among the type-annotation positions the one type grammar applies in,
  `docs/spec_topics/query/query-forms.md:44` and `:57` call `@<Schema>` an
  ascription, and `docs/spec_topics/grammar.md:105` lists type-ascription
  contexts as bare-`Type` positions. So `params: p: void` and `@<void>` draw
  `void-in-non-return-position`, and every `void` position draws it exactly
  once and nothing else.
- `docs/spec_topics/grammar.md:102` admits `LiteralType ::= STRING | NUMBER |
  BOOLEAN | NULL` in every `Type` position, `:94` admits `Type "|" Type`
  recursively, and `:105` names union arms a bare-`Type` position. So
  `true` and `false` are `Type` atoms wherever they are written:
  `schema X { f: true | string }` and `params: p: true` report nothing, and the
  boolean arm reaches the lowered fragment rather than being replaced by `{}`.
- `docs/spec_topics/type-system.md:15` applies one type grammar to every
  annotation position, so the same source text reports the same codes at the
  alias RHS, the schema-body field, the `params:` RHS and `@<T>`.

## Actual behaviour / root cause

One frame: the atom section of `lowerTypeExpr`, `src/parser/params.ts:395–411`.

```ts
  // Atom.
  if (PRIMITIVE_TYPES.has(s as LoweredPrimitiveType)) {
    return { type: s };
  }
  if (IDENTIFIER.test(s)) {
    // An identifier-shaped atom is a `NamedType`: resolve whole-file.
    const resolved = lowerCtx.bodyTypeMap.get(s);
    if (resolved === undefined) {
      lowerCtx.unresolved.push(s);
      return {};
    }
```

Two facts meet here. `IDENTIFIER` (`:329`) is
`/^[A-Za-z_][A-Za-z0-9_]*$/` — a *shape* test, which every reserved keyword's
spelling passes. And `lowerCtx.bodyTypeMap` is the resolution set built from
declaration names alone: `collectUnresolvedNamedTypes` maps `declared` to
placeholder fragments (`src/parser/body-type-lowering.ts:338–340`), and
`declared` is `checkStructural`'s `schemas ∪ enums ∪ imports`. No keyword can
be a member — `schema void { … }` is refused at the declaration site by the
lexer's own `reserved-keyword-as-identifier` check
(`src/lexer/lexer.ts:807–815`, `checkName(k + 1, "type")` at `:874`). So every
keyword spelling that reaches `:399` is guaranteed to miss at `:401` and land
in the sink at `:403`.

Between `:396` and `:399` there is no keyword test. The five primitive
spellings are caught by `:396`; the other 27 fall through to the `NamedType`
arm. `array` and `Result` are caught earlier only when written with type
arguments, by the generic arm at `:360–375`.

The four callers then render whatever is in the sink as the row's message:
`src/parser/theta-document.ts:5823` (schema-body field), `:5425` (alias RHS),
`:6075` (`@<T>` annotation) through `unresolvedNamedTypeDiagnostic` (`:4718`),
and `src/parser/params.ts:159–167` (`params:` RHS) from its own site. None
inspects the spelling.

**Why the double emission is exactly two positions.** The type-grammar checks —
`void-in-non-return-position`, `generic-arity-mismatch`,
`result-in-schema-position` — live in a *second* type parser,
`src/parser/type-grammar.ts`, and are wired at the schema-body field type
(`src/parser/theta-document.ts:5812`) and each alias arm (`:5407`) only. So at
those two positions a `void` draws its own correct rejection *and* the walk's
wrong one; at the `params:` RHS and at `@<T>` it draws the wrong one alone.
That second parser already classifies the atoms the frame does not:
`type-grammar.ts:235–237` recognises `void`, `:238–240` recognises `true` /
`false`, `:250–252` recognises the primitives. It has no reserved-keyword case
either (everything else becomes `{kind:"named"}` at `:253`), but a `named` node
raises nothing there, so it adds no diagnostic — the wrong emission is the
walk's alone.

**Why the two boolean spellings behave inconsistently.** `lowerTypeSource`
(`src/parser/body-type-lowering.ts:131–154`) applies `parseLiteralArm`
(`:357–383`) to the whole source and to an all-literal union before delegating.
That covers a bare `true` and `true | false`. A mixed union fails the
`literals.every(…)` test at `:142` and the whole source is handed to
`lowerTypeExpr` (`:153`), whose per-arm recursion has no literal recognition —
so the boolean arm reaches `:399`. The `params:` RHS never gets the pre-check at
all: `parseParams` calls `lowerParamsFieldType` → `lowerTypeExpr` directly
(`src/parser/params.ts:151`), which is why `params: p: true` reports where
`schema X { f: true }` does not.

**Pre-existence.** The `params:` site is the walk's original emission point.
0028's fix (0.38.0) added the schema-body field and `@<T>` positions
(0028 §Fix `:191–208`), which is when the field-position half of the `void`
double emission began; before 0033, `schema X = void` did not parse at all
(`stray '='`), so the alias half could not exist. 0033's fixer round 2
reproduced the field position deliberately — its cell n8 asserts list equality
with the field control rather than a better answer — and recorded the result as
residual (iii) at both positions
(`docs/bugs/0033-body-level-schema-alias-unsupported.md:202–205`;
`.pi/tmp/fixes/0033-report.md:11`). Both records name the sibling code
`theta/parse/unknown-identifier`; the emission is
`theta/parse/void-in-non-return-position`, as n8's own expectation
(`tests/schema-alias-union-decl.test.ts:1779–1782`) states.

## Why it matters

- The diagnostic asserts something false about the file. `unresolved named type
  'void'` tells an author that `void` is a type name their file fails to
  declare; the fix is to declare it, which
  `docs/spec_topics/lexical.md:20` forbids. The registry row carries no *Hint*
  column entry, so the message is the whole of the guidance.
- Where the wrong row is the sole diagnostic — 20 keywords at the schema-body
  field, 21 at `@<T>`, 27 at the `params:` RHS — it is the only thing the author
  is told, including for `void` at the two positions whose own registered
  rejection is unwired. `docs/spec_topics/grammar.md:105`'s rule and the
  registry's *Hint* for `void-in-non-return-position` ("`void` is a return-only
  annotation; use a value type (or `null`) in this position") never reach those
  authors.
- Two grammar-admitted inputs fail to load. `schema X { f: true | string }` and
  `params: p: true` carry `E`-severity diagnostics, so neither loads;
  `docs/spec_topics/grammar.md:102` admits both, and the same atom written
  alone at the same position loads and lowers `{"const":true}`.
- The boolean arm is also dropped from the lowered fragment.
  `true | string` lowers `{"anyOf":[{},{"type":"string"}]}` at all four
  positions, so were the diagnostic removed without the literal handling, the
  declaration would silently accept every instance on one arm. That fragment is
  AJV-enforced and is interpolated verbatim into the QRY-15 instruction text.
- A closed DIAG-2 row over-states its own domain. The row is the authority for
  what the implementation emits (DIAG-2), and it emits for a class its trigger
  excludes at four of its five positions — the same honesty problem 0028 and
  0033 each closed for this row in the other direction (positions the row named
  but the implementation did not serve).
- The multiplicity differs across positions for one input: `p: match | match`
  reports twice, `f: match | match` once, because the `params:` site does not
  dedup. Diagnostic-code *sequence* is GOV-15 observable (b).
- No gate scores it. No committed `.theta` / `.thetalib` fixture writes a
  reserved keyword in a `Type` position (`rg` over both extensions for
  `: <keyword>` and `@<keyword>` returns nothing), so
  `tests/committed-fixture-parse-gate.test.ts` never witnesses it. The one
  in-tree pin, cell n8, pins the double emission as *intended parity* and will
  invert on the fix — by design, as its own comment says.

## Fix

Classify the atom before resolving it. In `lowerTypeExpr`'s atom section
(`src/parser/params.ts:395–411`), a reserved-keyword spelling is dispositioned
by which keyword it is, and only a non-keyword identifier reaches the
`NamedType` resolution at `:399–408`. The classification mirrors the one
`TypeParser.parsePrimary` already carries (`src/parser/type-grammar.ts:235–253`),
so the two type parsers stop disagreeing about the same atom:

1. **`true` / `false`** — `LiteralType` (`docs/spec_topics/grammar.md:102`).
   Lower to `{const: true}` / `{const: false}`, no diagnostic, matching what
   `parseLiteralArm` (`src/parser/body-type-lowering.ts:357–383`) already
   returns for the same atom at the top level. This makes the mixed-union arm
   and the `params:` RHS agree with the bare-atom case that loads today.
   `null` needs nothing — `PRIMITIVE_TYPES` catches it at `:396`.
2. **`void`** — return `{}` and record nothing. The position's own registered
   row, `theta/parse/void-in-non-return-position`, is the correct rejection, and
   it must be wired at the two positions that lack it (below) so no `void`
   input goes from loud to silent.
3. **Every other reserved keyword** (the remaining 24, of which `array` and
   `Result` reach the arm only when written without type arguments) — return
   `{}` and record the spelling on a **second sink**, distinct from
   `unresolved`, which each of the four callers renders as
   `theta/parse/reserved-keyword-as-identifier` with the registry's message
   `reserved keyword '<keyword>' cannot be used as an identifier`
   (`docs/spec_topics/diagnostics/code-registry-parse.md:21`). Same range, same
   severity and same emission order as the `unresolved` sink each caller
   already drains, so the sequence position is unchanged for every affected
   input.

The keyword set is the lexer's — `reservedKeywords()`,
`src/lexer/lexer.ts:152–160`, which is module-private today and is exported for
this use. The export closes no cycle: `src/lexer/lexer.ts` imports only
`src/diagnostics/diagnostic` and `src/extension/system-note-channel`
(`:16–20`), and `src/parser/params.ts` imports neither the lexer nor
`src/parser/theta-document.ts` today (`:34–45`).

**Wiring `void`'s own row at the two positions that lack it.** The type-grammar
walk runs at the schema-body field type
(`src/parser/theta-document.ts:5812`) and each alias arm (`:5407`) and nowhere
else. Add the same `parseTypeExpression(…, "schema-feeding")` call for the
`params:` RHS and the `@<T>` annotation root, whose absence is why `void` is
loud there only through the wrong row. The registry row already names both
positions ("schema or `params:` field", "type ascription",
`code-registry-parse.md:59`), so this implements a registered trigger rather
than widening one — the same relationship 0028's fix had to the four-position
`unresolved-named-type` row it inherited from 0025.

**No input goes from loud to silent.** The `E`-emitting inputs the fix touches,
and what each draws after it:

| input class | today | after |
| --- | --- | --- |
| `void` at alias RHS / schema-body field | `void-in-non-return-position` + `unresolved-named-type` | `void-in-non-return-position` alone |
| `void` at `params:` RHS / `@<T>` / inline-object annotation field | `unresolved-named-type` alone | `void-in-non-return-position` alone |
| the other 24 keywords, any of the four positions | `unresolved-named-type` (sole, or beside a residue code) | `reserved-keyword-as-identifier` (residue codes unchanged) |
| bare `array` / `Result` (no type arguments) | `unresolved-named-type` | `reserved-keyword-as-identifier` |
| `true` / `false` in a mixed union, or anywhere on the `params:` RHS | `unresolved-named-type` | nothing; the arm lowers `{const: …}` |
| a real undeclared `NamedType` (`Nope`) | `unresolved-named-type` | unchanged |

The `true` / `false` row is the only one whose *severity outcome* changes: that
class goes from refusing to loading, which is the `LiteralType` rule of
`docs/spec_topics/grammar.md:102`. Every other affected
input stays `E` and stays refused; only the code and message change. `array` /
`Result` written *with* arguments, all five primitive spellings, the 15
alias-arm-stopped spellings' residue diagnostics, and every non-keyword name
are untouched.

**Blast radius.**

- **GOV-15.** Every input whose emitted code changes carries an `E` diagnostic
  at 0.45.0 and is therefore outside GOV-15's loads-cleanly input set
  (`docs/spec_topics/governance/source-language-stability.md:9`). The change is
  in any case a DIAG-2 trigger change dispositioned by the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`) — a removal for inputs taken out of `unresolved-named-type`'s
  emission set, an addition for those brought into
  `reserved-keyword-as-identifier`'s and `void-in-non-return-position`'s. No
  code is renamed and no *Message* is reworded, so nothing crosses into the
  theta-2.0 class.
- **Registry.** No new code and no *Message* edit. `:21`'s trigger already
  reads "Reserved keyword used in an identifier position"; `:59`'s already
  names the `params:` field and type-ascription positions. `:89`'s trigger,
  which names the five positions and their resolution rule, likewise needs no
  edit — it never claimed keyword-shaped text. `tests/fixtures/h7a/permitted-codes.json`
  carries no `theta/parse/*` entry and is unchanged.
- **Cell n8 inverts, by design.** `tests/schema-alias-union-decl.test.ts:1771–1790`
  expects both lines at both positions and its own comment defers the narrowing
  to this report (`:1776–1778`). The fix updates it to the single-line
  expectation and keeps `expectArmMatchesFieldControl` (`:587–607`) as the
  equality assertion, so the alias/field parity 0033 established still holds
  and still inverts if either position drifts. 0033 §Fix residual (iii)
  (`:202–205`) is deleted with it, and the `unknown-identifier` misnaming goes
  with it.
- **Lowered bytes move for the boolean-literal class only.**
  `true | string` becomes `{"anyOf":[{"const":true},{"type":"string"}]}` where
  it was `{"anyOf":[{},{"type":"string"}]}`, and `params: p: true` becomes
  `{"const":true}` where the field lowered nothing (the file was refused).
  Those bytes are AJV-enforced, interpolated into the QRY-15 instruction and
  hashed into `respondSchemaSlug` (`src/runtime/typed-query-validation.ts:347`),
  so the affected annotations change respond-tool name — for inputs that do not
  load at all today. Every keyword class keeps its `{}` lowering; the fix
  changes which diagnostic names it, not the fragment.
- **The row's own positions are unchanged for its real subject.** The
  resolution arm at `:399–408` is entered by exactly the identifiers it was
  meant for, so `Nope`, forward references, imported symbols and the
  brace-rooted inline-object walk owned by
  [0035](./0035-params-rhs-inline-object-under-emission.md) and
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  all behave as they do today.
- **Ordering against [0043](./0043-union-nonprimitive-arm-lowers-permissive.md).**
  Both edit `lowerTypeExpr`. 0043 moves the union block (`:377–393`) above the
  generic block (`:360–375`); this fix inserts a classification into the atom
  section (`:395–411`). Disjoint blocks, no dependency in either direction. If
  0043 lands first, this fix's boolean-arm cells see 0043's corrected `anyOf`
  for generic-tailed unions; if this lands first, 0043's `Ghost`-resolution
  cells are unaffected because `Ghost` is not a keyword.

**Test witness — unit, offline, no live provider.** Every fixture in
§Reproduction is a `parseThetaDocument`, `lowerTypeSource` or `lowerTypeExpr`
call. Required beyond the probes: the full 32-keyword × four-position matrix as
a pinned table so the reachable set is asserted rather than sampled, including
the `— (stopped)` cells whose residue codes must not move; a single-emission
pin for `void` at all four positions plus `array<void>`, the union arm and the
inline-object annotation field; a `reserved-keyword-as-identifier` message
parity cell read out of the registry through `registryMessage`, as
`tests/schema-alias-union-decl.test.ts` already does for its seven codes; the
boolean-literal set (`true`, `false`, `true | false`, `true | string`,
`false | integer`) at all four positions with lowered-byte pins and a real-AJV
accept/reject table over `{"anyOf":[{"const":true},{"type":"string"}]}`;
multiplicity cells for `f: match | match`, `f: match, g: match` and
`p: match | match`; and no-op cells for the five primitives, `array<integer>`,
`Result<string, string>`, `Nope`, `let a: match = 1` and `fn f(p: match)`
proving the untouched positions stay untouched.

## Non-goals

- **The `params:`-site dedup asymmetry.** `p: match | match` emitting twice
  where `f: match | match` emits once is a property of
  `src/parser/params.ts:159–167` iterating the sink where
  `collectUnresolvedNamedTypes` returns `[...new Set(unresolved)]`
  (`src/parser/body-type-lowering.ts:348`). The fix routes the keyword sink the
  same way each caller routes the existing one, so the asymmetry is inherited
  unchanged for both sinks. Unfiled.
- **Positions outside the row.** `let a: match = 1` and `fn f(p: match)` report
  nothing and continue to. That boundary is 0028 §Fix `:207–208`'s decision
  ("`let x: Nope = 1`, `fn f(a: Nope)`, a union arm and `invoke<Nope>` all stay
  silent"), reached for named types; nothing here revisits it for keywords.
- **A bare generic head as a distinct diagnosis.** `array` and `Result` written
  without type arguments draw `reserved-keyword-as-identifier` under this fix.
  Whether a constructor head used unapplied deserves its own row —
  `generic-arity-mismatch`'s trigger is "a generic-type application", which a
  bare head is not — is a registry question this report does not open.
- **The 15 alias-arm-stopped spellings' residue diagnostics.**
  `schema X = match` drawing `empty-schema-body` plus the residue statement's
  own codes is 0033's arm-boundary design
  (`src/parser/theta-document.ts:1445–1461` and its docstring `:1412–1444`).
  Those cells are pinned as controls here, not changed.
- **`theta/parse/empty-schema-body` for an inline `{}`.**
  `docs/spec_topics/grammar.md:109`'s rule is unimplemented at every `Type`
  position — 0033 §Fix residual (iv), filed as
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md). `{}` is
  brace-rooted, so it never reaches the atom section this fix edits.
- **The permissive `{}` for unlowerable forms.** Every keyword class keeps
  lowering `{}` after the fix; whether `{}` should ever be a lowering is
  0028's inventory question
  (`src/runtime/query-schema-lowering.ts:25–61`).

## Provenance

- Origin: bug [0033](./0033-body-level-schema-alias-unsupported.md) fixer round
  2's n8 rebuttal, accepted in review round 3, which recommended filing. The
  finding is recorded as 0033 §Fix (0.45.0) residual (iii) (`:202–205`) and in
  `.pi/tmp/fixes/0033-report.md:11`, and is pinned in-tree by cell n8
  (`tests/schema-alias-union-decl.test.ts:1771–1790`), whose comment names this
  report's subject: "Narrowing that walk moves the object form's behaviour too,
  and belongs to a report that takes the field position as its subject"
  (`:1776–1778`). This report files it, re-derives it at HEAD, enumerates the
  reachable matrix the record does not (four positions × 32 keywords, plus the
  boolean-`LiteralType` class and the `params:`-only literal divergence), and
  corrects the record in one place: the sibling code is
  `theta/parse/void-in-non-return-position`, not
  `theta/parse/unknown-identifier`.
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:89`
  (`unresolved-named-type` — the five-position row whose trigger this escapes),
  `:59` (`void-in-non-return-position` — trigger, *Hint* and *Message*), `:21`
  (`reserved-keyword-as-identifier` — trigger and *Message*), `:58`
  (`generic-arity-mismatch`, whose trigger is an application);
  `docs/spec_topics/grammar.md:89–102` (§Type grammar — `ReturnType` `:89`,
  `Type` `:90–95`, `PrimitiveType` `:97`, `NamedType ::= Ident` `:98`,
  `GenericType` `:99–100`, `ObjectType` `:101`, `LiteralType` `:102`), `:105`
  (the bare-`Type` position list, the return-only `void` rule and the
  `void-in-non-return-position` prescription), `:107` (§Generic-application
  constructors — both heads reserved, "appear here as constructor keywords, not
  as `NamedType ::= Ident`"); `docs/spec_topics/lexical.md:20` (§Reserved
  keywords — the 32 spellings, the `reserved-keyword-as-identifier` rule, and
  the `array` / `Result` clause); `docs/spec_topics/type-system.md:15` (one type
  grammar per annotation position);
  `docs/spec_topics/query/query-forms.md:44`, `:57` (`@<Schema>` as an
  ascription); `docs/spec_topics/governance/source-language-stability.md:9`
  (loads-cleanly predicate), `:25` (diagnostic-registry carve-out). User-facing
  reference: `docs/reference/diagnostics.md:67`
  (`reserved-keyword-as-identifier` message), `:105`
  (`void-in-non-return-position`), `:138` (`unresolved-named-type`).
- Implementation evidence at `f959f8de`: `src/parser/params.ts:321–327`
  (`PRIMITIVE_TYPES`), `:329` (`IDENTIFIER`), `:357` (`lowerTypeExpr`),
  `:360–375` (the generic arm — why applied `array` / `Result` never reach the
  atom section), `:377–393` (the union split), `:395–411` (the atom section —
  the frame; `:399` the `NamedType` test, `:403` the sink append, `:409–411`
  the catch-all), `:151` (`parseParams`'s per-field
  `lowerParamsFieldType` call), `:159–167` (the `params:` emission site, no
  dedup); `src/parser/body-type-lowering.ts:79` (`lowerObjectFields`'s
  per-field call), `:131–154` (`lowerTypeSource`, literal pre-check `:139–150`,
  delegation `:153`), `:245` (`buildBodyTypeSchemas` pass 2's alias-RHS call),
  `:334–350` (`collectUnresolvedNamedTypes`, resolution map `:338–340`,
  inline-object dispatch `:342–345`, dedup `:348`), `:357–383`
  (`parseLiteralArm`); `src/parser/theta-document.ts:1412–1461`
  (`ALIAS_ARM_STOP_KEYWORDS` and its docstring — the 15 spellings and the
  deliberate omissions), `:4663–4672` (the shared builder's docstring and the
  row's closed five-position list), `:4718–4730`
  (`unresolvedNamedTypeDiagnostic`), `:5405–5408` (the alias-arm
  `checkInlineEnumForm` + `parseTypeExpression` pass), `:5425` (the alias-RHS
  walk call), `:5804–5825` (the schema-body field pass — `parseTypeExpression`
  `:5812`, the walk call `:5823`), `:5868` (`checkObjectExpr`), `:6075` (the
  `@<T>` annotation walk call); `src/parser/type-grammar.ts:207–254`
  (`TypeParser.parsePrimary` — `void` `:235–237`, `true` / `false` `:238–240`,
  primitives `:250–252`, the `named` fallthrough `:253`), `:311–350`
  (`walkType`, the `void` case `:332–345`), `:67` (`parseTypeExpression`);
  `src/lexer/lexer.ts:152–160` (`reservedKeywords`, module-private), `:665`
  (the `keyword` / `ident` token-kind split), `:787–797`
  (`contextualDiagnostics` and its parser-leaf scope note), `:807–815` (the
  `reserved-keyword-as-identifier` emission), `:870`, `:872`, `:874` (its three
  call sites); `src/runtime/typed-query-validation.ts:347`
  (`respondSchemaSlug`).
- Test evidence at `f959f8de`: `tests/schema-alias-union-decl.test.ts:178`
  (`UNRESOLVED`), `:345–348` (the four `void` fixtures), `:587–607`
  (`expectArmMatchesFieldControl`), `:1603` (`VOID_POSITION`), `:1771–1790`
  (cell n8, the pin); `tests/lexer-core.test.ts:164–170` (the existing
  `reserved-keyword-as-identifier` cell, at a declarator-name position);
  `tests/committed-fixture-parse-gate.test.ts` (the zero-diagnostics walk over
  committed fixtures, none of which writes a keyword in a `Type` position);
  `tests/fixtures/h7a/permitted-codes.json` (11 entries, no `theta/parse/*`).
- Reproduction: scratch vitest at `f959f8de` — all 32 reserved keywords at the
  alias RHS, the schema-body field type, the `params:` RHS and the `@<T>`
  annotation, plus the union-arm, `array<…>`-argument, inline-object-annotation,
  `let`-annotation, `fn`-parameter and object-constructor contexts; the `void`
  single/union/generic set at every position; the boolean-`LiteralType` set
  against its string / number / `null` siblings; multiplicity cells; and
  `lowerTypeSource` beside `lowerTypeExpr` over thirteen atoms for the lowered
  bytes and sink contents. Run on the outputs quoted above, then deleted per
  scratch policy.

## Coordination note (0.272.0) — cell h5's silence flipped to a refusal

2026-08-24. [Bug 0274](./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md)
§Fix route (a), taken A-SCOPED, is authorised by the operator's re-ruling,
which wires the reservedKeywords sink at all five sinkless
collectUnresolvedNamedTypes call sites, admits at the new sites only
never-legal-as-type keywords (match, fn, let, …, excluding Result/Ok/Err/array)
while keeping V20g-T green, and authorises the seven tripwire flips as a batch
(0262 D3a/D3b/D3c/D3d, 0148 e10, inline-object r5, 0044 h5), re-vehicled/flipped
with dated coordination notes, subjects preserved (0165/0251 precedent). This
report's own §Non-goals did not foresee that
re-ruling: row h5 stated "a `let` annotation is not one of the row's five
[registered] positions" and "a `fn` parameter type is likewise outside the
row" — a statement about THIS report's own four-position sink, not a claim
that either position stays silent forever.

At version 0.272.0, `tests/reserved-keyword-type-position.test.ts` cell h5 (`let
a: match = 1` — the `let` annotation — and `fn f(p: match): integer { 1 }` —
the `fn` parameter type) is flipped: both fixtures now pin
`theta/parse/reserved-keyword-as-identifier` (rendered through this file's own
`kw()` helper, reused rather than duplicated) where each previously pinned an
empty list. The scoping is withheld rather than blanket: `Result`, `array`,
`Ok` and `Err` remain silent at these same positions, pinned by group (X) of
`tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`.

This report's own subject — this report's own four registered positions (the
`schema X = …` alias/union right-hand side, the `schema` body field type, the
`params:` right-hand side, and the `@<T>` query annotation) — is untouched:
every one of h1 through h4, and every other cell of this file, is
byte-preserved and green. Bug 0274 wires the `reservedKeywords` sink at the
`let` annotation and the `fn` parameter type, two of its five newly-wired
captures, entirely outside this report's own sink; it does not touch this
report's own emission sites or *Message* bytes. Every other assertion in
`tests/reserved-keyword-type-position.test.ts` is byte-unmodified.

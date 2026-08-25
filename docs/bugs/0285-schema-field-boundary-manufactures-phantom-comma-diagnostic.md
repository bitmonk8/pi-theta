# Bug 0285 — `parseType`'s schema-field-boundary stop ends a field's type capture at ANY value-ish token whose predecessor is not `|` (`theta-document.ts:3937`–`:3946`), so one written type text carrying a `.` or `-` (`Nope.Sub`, `a-b`, `string.b`) is cut into a type shard plus a phantom next field: the shard draws `theta/parse/schema-type-not-expression`, the phantom draws `theta/parse/unsupported-feature` rendering `schema fields must be comma-separated` over a body that spells one field and no missing comma, and the same phantom draws `theta/parse/malformed-schema-field` — three diagnostics, one of them stating a construct the source does not exhibit, where the byte-neighbour `f()<integer>` draws exactly one

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 by the letter on "wrong diagnostic
  code/text, spurious duplicate diagnostics": the second line asserts that the
  body's fields are not comma-separated (`placeholder-rendering-a.md:93` fixes
  that construct string to exactly that input class) over a body declaring ONE
  field with no separator position in it at all, and the third names a field
  the source never spells. Registration is refused either way, on the
  type-side line alone, so nothing is silently admitted and no wrong value
  reaches the wire; the measured cost is two extra lines, one of them false,
  pointing the author at a comma instead of at the `.` they wrote. Not S1 — no
  silence, no permissive lowering, no unenforced constraint. Not S4 — the
  registry prose is consistent; the emission is what departs from it. D2
  because the route is one condition at one emission site in one file
  (`src/parser/theta-document.ts:3276`), mints no code, owes one DIAG-2
  sentence and one witness file, and the flip-authority sweep over `tests/`
  found zero pinned cells to re-found (§Fix). Argue D3 at pickup only if the
  sub-choice in §Fix is reopened toward the splitter itself, which moves the
  registry's own pinned `schema S { a: -1 }` reading.
- **Kind:** defect — a diagnostic names a cause the source does not exhibit,
  and a second names a construct the source does not contain. `SchemaShape ::=
  "{" Field ("," Field)* ","? "}"` (`docs/spec_topics/grammar.md:172`) makes
  the comma a separator BETWEEN fields; `schema S { a: Nope.Sub }` spells one
  `Field` and therefore no separator position, yet draws
  `theta/parse/unsupported-feature` with the construct tail
  `schema fields must be comma-separated`, whose registered input class is "a
  schema object body whose fields are not comma-separated"
  (`docs/spec_topics/diagnostics/placeholder-rendering-a.md:93`). The third
  line, `theta/parse/malformed-schema-field`, is anchored on `Sub` — a token
  the author wrote inside a type, read as a field name because the capture
  stopped in front of it. The text `Nope.Sub` is itself illegal (`NamedType ::=
  Ident`, `grammar.md:98`; `Ident` is `[A-Za-z_][A-Za-z0-9_]*`,
  `docs/spec_topics/lexical.md:13`; `Type`'s six alternatives at
  `grammar.md:90`–`:95` derive none of it), and the line that says so —
  `theta/parse/schema-type-not-expression` — is present and correct. The
  defect is the two lines beside it.
- **Affected** (every citation re-derived at HEAD `d0fffd87`, v0.281.0;
  `src/parser/theta-document.ts` is 9416 lines at that HEAD):
  - `src/parser/theta-document.ts:3937`–`:3946` — `parseType`'s
    `stopAtFieldBoundary` arm, the seam. It ends the capture at any
    ident/keyword/string/number token once `parts.length > 0`, gated on one
    thing only: `prevText !== "|"`. It never asks whether the PRECEDING token
    can END a `Type` atom, so a trailing `.` or `-` — punctuation that joined
    the capture because it is in none of the depth-0 stop set at `:3913`–`:3921`
    (`,` `)` `{` `}` `=`) — satisfies the gate exactly as a completed `Ident`
    does.
  - `src/parser/theta-document.ts:3254` — the sole caller that passes
    `stopAtFieldBoundary`: `const typeSource = this.parseType(true)` inside
    `parseSchemaObjectBody` (`:3135`). This is why the pileup is confined to a
    `schema` object-body field type at depth 0.
  - `src/parser/theta-document.ts:3276`–`:3287` — the separator arm. With no
    `,` ahead, `startsNextField` is `boundary.kind === "ident" ||
    boundary.kind === "keyword"`, and the `theta/parse/unsupported-feature`
    line is pushed at the boundary token's range. The arm cannot distinguish a
    boundary the author wrote (`schema S { a: string b: integer }`) from one
    the stop above manufactured, because both arrive as the same token kind at
    the same cursor.
  - `src/parser/theta-document.ts:3192`–`:3197` — the loop's next iteration
    reads the boundary token as a field name and, finding no `:` behind it,
    calls `recoverMalformedSchemaField` (`:3329`, emission at `:3339`), which
    also runs `skipBraceRemainder` (`:3294`) and so discards every field
    written after the offending one.
  - `src/parser/theta-document.ts:8533`–`:8537` — the checker-time field-type
    walk's bug 0061 guard-1: the type-side refusal is withheld when the
    field's own walk already drew an error-severity diagnostic. It reads
    `out`, the checker pass's own array; the two parse-time lines live in
    `this.diagnostics` and are invisible to it, which is why all three stand.
    The alias position solves the same visibility problem with a node flag
    (`s.aliasRhsRefused`, consulted at `:7917`).
  - `src/parser/theta-document.ts:6611`–`:6624` —
    `schemaTypeNotExpressionDiagnostic`, the line that IS correct here; ranged
    at the declaration because `SchemaFieldSource` carries no range.
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:93` — the
    construct row fixing the tail `schema fields must be comma-separated` to
    "a schema object body whose fields are not comma-separated".
  - `docs/spec_topics/diagnostics/code-registry-parse.md:30` — the
    `theta/parse/unsupported-feature` row. Its *Trigger* names deferred and
    non-Theta constructs and says nothing about a manufactured field
    boundary.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:99` — the
    `theta/parse/malformed-schema-field` row: "reaches a token from which no
    further `Field` derives … a field name is not followed by `:`", with the
    retained prefix reaching "the field-type walk (which can itself draw
    `theta/parse/schema-type-not-expression` on a retained field's junk
    type)".
  - `docs/spec_topics/diagnostics/code-registry-parse.md:106` — the
    `theta/parse/schema-type-not-expression` row, which pins the sanctioned
    two-line reading verbatim: "`schema S { a: -1 }` draws this row BESIDE
    `theta/parse/malformed-schema-field`", and separately states the
    manufactured-shard principle this pileup strains: "Excluded from the
    judged set is a fragment the generic-argument split itself MANUFACTURES by
    cutting a `{...}`/`[...]` group the author wrote as one unit".
  - `docs/spec_topics/grammar.md:172` (`SchemaShape`), `:90`–`:95` (`Type`'s
    six alternatives), `:98` (`NamedType ::= Ident`),
    `docs/spec_topics/lexical.md:13` (`Ident`).
- **Observed at:** HEAD `d0fffd87`, v0.281.0. All rows below are this report's
  own measurements, taken by one offline provider-free scratch probe over
  `parseDoc` (`tests/helpers/e2e-s1.ts`, the real `lexTheta` /
  `parseThetaDocument` front end), token `b0285scratch`, deleted after the
  sweep.
- **Scope:** a `schema` object-body field type at depth 0. Measured NOT
  reached: the same text one level down inside a generic argument or an inline
  object, and every non-`schema` type capture (§Reproduction (c)).

## Summary

`parseType(true)` ends a schema field's type capture in front of the first
ident/keyword/string/number token whose predecessor is not `|`. A `.` or `-`
inside the written type is punctuation in no stop set, so it JOINS the capture
and then satisfies that gate: `Nope.Sub` is cut into the type shard `Nope.` and
a residue starting at `Sub`. The residue is read as the start of a second
field, which draws `theta/parse/unsupported-feature` rendering
`schema fields must be comma-separated` — over a body that spells one field —
and then, having no `:` behind it, `theta/parse/malformed-schema-field`. The
shard `Nope.` separately and correctly draws
`theta/parse/schema-type-not-expression`. Three lines for one written mistake;
the byte-neighbour `f()<integer>`, whose text carries no `.` or `-`, is
captured whole and draws one. Registration is refused in every case.

## Reproduction

Body fixture: `---\ndescription: d\nmode: prompt\n---\n\n<body>\n"ok"\n`, so
the body sits on line 6. Diagnostics are listed in emission order as
`[line:column] code: message`.

### (a) The subject — one written mistake, three diagnostics

```
=== schema S { a: Nope.Sub<integer> }  (count=3, registered=false)
  [6:1]  error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
  [6:20] error theta/parse/unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated
  [6:20] error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'
  captured fields=[{"name":"a","typeSource":"Nope."}]

=== schema S { a: a-b<integer> }  (count=3, registered=false)
  [6:1]  error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
  [6:17] error theta/parse/unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated
  [6:17] error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'
  captured fields=[{"name":"a","typeSource":"a-"}]
```

Column 20 is `Sub`; column 17 is `b`. Both are tokens the author wrote INSIDE
the type. The captured `typeSource` is the shard, not the written text.

### (b) The generic application is incidental — the bare spellings pile up identically

```
=== schema S { a: Nope.Sub }   (count=3, registered=false)   [6:1] schema-type-not-expression / [6:20] unsupported-feature / [6:20] malformed-schema-field
=== schema S { a: a-b }        (count=3, registered=false)   [6:1] schema-type-not-expression / [6:17] unsupported-feature / [6:17] malformed-schema-field
=== schema S { a: string.b }   (count=3, registered=false)   [6:1] schema-type-not-expression / [6:22] unsupported-feature / [6:22] malformed-schema-field
```

`string.b` leads with a primitive that resolves, so nothing about the pileup
depends on the head being unresolvable either.

### (c) Controls — where the same text draws one line

```
=== schema S { a: f()<integer> }     (count=1, registered=false)  [6:1] schema-type-not-expression   typeSource="f()<integer>"
=== schema S { a: array<Nope.Sub> }  (count=1, registered=false)  [6:1] schema-type-not-expression   typeSource="array<Nope.Sub>"
=== schema S { a: {b: Nope.Sub} }    (count=1, registered=false)  [6:1] schema-type-not-expression   typeSource="{b: Nope.Sub}"
=== schema S { a: Nope }             (count=1, registered=false)  [6:1] unresolved-named-type: unresolved named type 'Nope'
=== schema S { a: Nope<integer> }    (count=1, registered=false)  [6:1] unresolved-named-type: unresolved named type 'Nope'
=== let x: Nope.Sub<integer> = 1     (count=1, registered=false)  [6:1] annotation-type-not-expression: 'x' declares a type that is not a theta type expression
=== let x: a-b<integer> = 1          (count=1, registered=false)  [6:1] annotation-type-not-expression: 'x' declares a type that is not a theta type expression
=== fn g(p: Nope.Sub<integer>): integer { 1 }
                                     (count=1, registered=false)  [6:1] annotation-type-not-expression: 'p' declares a type that is not a theta type expression
```

`f()<integer>` is the spelling bug 0284's witness scoped its `schema` cell to;
its text carries no `.` and no `-`, so no boundary is manufactured. The
generic-argument and inline-object rows are the depth bound: at depth > 0 the
`stopAtFieldBoundary` arm is gated on `depth === 0` and never fires. The three
non-`schema` captures pass no `stopAtFieldBoundary` at all.

### (d) The registry's own sanctioned pair, for contrast

```
=== schema S { a: -1 }    (count=2, registered=false)
  [6:1]  error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
  [6:16] error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'
=== schema S { a: 1-2 }   (count=2, registered=false)   same two codes, malformed at [6:17]
=== schema S { a: Cat + } (count=1, registered=false)   [6:1] schema-type-not-expression   typeSource="Cat+"
```

`schema S { a: -1 }` is `code-registry-parse.md:106`'s verbatim example of the
sanctioned co-firing. It draws TWO lines: the boundary token there is a number,
which `startsNextField` excludes, so the comma rule stays silent. The subject's
third line exists only because `Sub` and `b` are ident tokens.

### (e) The true positive the arm exists for is unaffected

```
=== schema S { a: string b: integer }  (count=1, registered=false)
  [6:22] error theta/parse/unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated
  captured fields=[{"name":"a","typeSource":"string"},{"name":"b","typeSource":"integer"}]
=== schema S { a: string, b: integer } (count=0, registered=true)
```

A genuine missing comma draws one line, keeps both fields, and names a
boundary the source does spell.

### (f) Collateral: the fields written after the offending one are discarded

```
=== schema S { a: Nope.Sub, b: integer, c: string }  (count=3, registered=false)
  [6:1] schema-type-not-expression / [6:20] unsupported-feature / [6:20] malformed-schema-field
  captured fields=[{"name":"a","typeSource":"Nope."}]
=== schema S { a: string, b: Nope.Sub }  (count=3, registered=false)
  [6:1] schema-type-not-expression / [6:31] unsupported-feature / [6:31] malformed-schema-field
  captured fields=[{"name":"a","typeSource":"string"},{"name":"b","typeSource":"Nope."}]
```

`b` and `c` in the first row are well-formed and are consumed unreported by
`skipBraceRemainder`. That discard is `theta/parse/malformed-schema-field`'s
registry-stated behaviour once it fires ("The remainder of the brace group past
the offending token is still consumed as a balanced group", `:99`), so it is a
consequence of the phantom field rather than an independent defect — it is
listed here because it is what makes the phantom's cost more than two lines of
text.

### (g) Corpus

All 34 committed `.theta` / `.thetalib` files sweep clean for a `.`- or
`-`-carrying schema field type (`git ls-files '*.theta' '*.thetalib'` plus a
`git grep -E '^\s*[a-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_][A-Za-z0-9_]*[.-]'` over
that set: zero hits outside frontmatter scalars). No shipped source moves under
any route below.

## Expected behaviour

One written mistake draws one diagnostic naming it, and a diagnostic names a
cause the source exhibits. `schema S { a: Nope.Sub }` declares one field whose
type text derives from no `Type` production. The refusal it earns is
`theta/parse/schema-type-not-expression`, ranged at the declaration and naming
`S` — the line it already draws. It earns no statement about comma separation,
because the body spells one `Field` and therefore no separator position; and no
statement about a malformed field, because `Sub` is not a field the author
wrote. The measured target is the reading its byte-neighbour already gets:
`schema S { a: f()<integer> }` — one line, count 1, registration refused.

## Actual behaviour / root cause

Three steps, all inside `parseSchemaObjectBody` and the `parseType` call it
makes.

1. **The `.` or `-` joins the capture.** `parseType`'s depth-0 stop set is
   `,` `)` `{` `}` `=` (`theta-document.ts:3913`–`:3921`). A `.` and a `-` are
   in none of it, so each is pushed onto `parts` and the scan continues.
2. **The next token ends the capture.** The `stopAtFieldBoundary` arm
   (`:3937`–`:3946`) asks two questions: is the incoming token value-ish, and
   is the PREVIOUS part something other than `|`. It does not ask whether the
   previous part can END a `Type` atom. `.` and `-` pass, so the capture
   returns the shard `Nope.` / `a-` and the cursor is left on `Sub` / `b`.
   The function already computes a related notion one arm away — `armComplete`
   at `:3965` — but that flag is consulted only in `aliasArmBoundary` mode and
   would not discriminate here either: it is set for any token leaving the
   scan at depth 0, including `.` and `-`.
3. **The residue is read as a second field, twice.** The separator arm
   (`:3276`–`:3287`) sees an ident at the cursor with no `,` behind it and
   pushes `theta/parse/unsupported-feature` with the comma-separation tail. The
   loop then re-enters, takes `Sub` as a field name (`:3192`), finds no `:`,
   and calls `recoverMalformedSchemaField` (`:3197`, `:3329`), which pushes
   `theta/parse/malformed-schema-field` at the same token and skips the
   remainder of the brace group.

The third line, the type-side refusal, is emitted much later, by the
checker-time field-type walk over the RETAINED field `a` whose `typeSource` is
now the shard. Its bug 0061 guard-1 (`:8533`) would have withheld it had the
field's own walk already drawn an error, but that guard inspects `out` — the
checker pass's array — while steps 2 and 3 wrote to `this.diagnostics` at parse
time. The alias position has the same split and closes it with a node flag
(`s.aliasRhsRefused`, `:7917`); the object-body position has no equivalent,
which `:8524`–`:8532` records in prose as "the object body has no parse-time
refusal to mirror the alias position's guard 2".

Against the registry: the pair `schema-type-not-expression` +
body-level `malformed-schema-field` is explicitly sanctioned
(`code-registry-parse.md:106`, the `schema S { a: -1 }` sentence;
`:99`, the retained-prefix sentence). What is not sanctioned is the
`unsupported-feature` line, whose registered construct string is fixed to "a
schema object body whose fields are not comma-separated"
(`placeholder-rendering-a.md:93`) and which fires here over a one-field body.
Nor does the manufactured boundary sit comfortably with `:106`'s stated
principle that a fragment a splitter MANUFACTURES from text the author wrote as
one unit is excluded from judgement — stated there for the generic-argument
split, and applying by the same reasoning to this one.

## Why it matters

The author wrote one wrong character. The diagnostic set names three faults at
two source positions, of which the loudest — the second line, anchored on
`Sub`, telling the author to add a comma — points at a repair that makes the
source worse (`schema S { a: Nope, Sub<integer> }` trades three lines for a
different three). Every field written after the offending one is dropped
unreported with it (§Reproduction (f)), so a body's remaining fields go
unchecked behind a diagnostic set that says nothing about them. The class is
reached by the common authoring slip of writing a dotted or hyphenated name in
a type position, and it is exactly the shape a model-generated theta produces
when it borrows a namespaced type name.

## Non-goals

- **Bug 0284's landed class is not reopened.**
  `./0284-non-identifier-applied-generic-head-silent-at-five-captures.md` is
  fixed (0.281.0). Non-identifier applied heads keep refusing through the
  not-expression family at all five captures; §Reproduction (c) measures the
  `let` / `fn` rows green under it. This report changes no head judgement.
- **Bug 0282's and bug 0281's codes are not reopened.**
  `./0282-unknown-applied-generic-head-silent-at-every-position.md` and
  `./0281-applied-ok-err-generic-application-silent-at-every-capture.md` are
  fixed; `Nope<integer>` keeps `theta/parse/unresolved-named-type`
  (§Reproduction (c)) and `Ok<integer>` keeps
  `theta/parse/reserved-keyword-as-identifier`.
- **The refusal itself is not at issue.** Every row in §Reproduction carries an
  error-severity `theta/parse/*` diagnostic and none registers. No route below
  may admit any of this text.
- **The sanctioned two-line reading stays.** `schema S { a: -1 }` and
  `schema S { a: 1-2 }` keep `theta/parse/schema-type-not-expression` beside
  `theta/parse/malformed-schema-field` (`code-registry-parse.md:106`). A route
  that moves those rows is out of scope.
- **The retention/discard rule is bug 0133's landed class.**
  `./0133-field-list-discard-recovery-unsettled.md` is fixed (0.203.0);
  `skipBraceRemainder`'s consumption of the brace remainder and the retention
  of the captured prefix are unchanged. §Reproduction (f) is measured as a
  consequence, not filed as a subject.
- **The genuine missing-comma refusal stays.** `schema S { a: string b:
  integer }` keeps its one line at the boundary it names (§Reproduction (e)).
- **The `theta/parse/unsupported-feature` construct tail's absence from
  `placeholder-rendering-a.md` §3's closed token table is bug 0063's subject**
  (`./0063-two-unsupported-feature-tails-missing-from-construct-table.md`,
  fixed), not this report's: the tail is now listed at `:93`, and what this
  report contests is the input the emission fires on, not the rendering.
- **The alias-declaration position is outside the subject.**
  `schema T = Nope.Sub<integer>` draws its own three-code set
  (`malformed-alias-rhs`, `unknown-identifier`, a stray-`>`
  `unsupported-feature`) through `finishAliasSchema` and
  `ALIAS_ARM_STOP_PUNCT`, a different seam with a different owner.

## Fix

Withhold the comma-separation line when the boundary that triggered it was
manufactured by the type capture rather than written by the author. Concretely,
at `src/parser/theta-document.ts:3276`, `startsNextField` gains a second
conjunct: the field's captured `typeSource` must END a `Type` atom. A capture
whose last token is punctuation that no `Type` can end on (`.`, `-`, and the
other trailers `parseType` joins for want of a stop-set entry) did not reach a
field boundary; it stopped inside one field's text, so no separator is missing
and the line is not emitted. `schema S { a: string b: integer }` is unaffected
— `string` ends an atom — and so is every row of §Reproduction (d), whose
boundary tokens are numbers the arm already excludes.

The resulting reading for the subject is the two-line pair the registry already
sanctions at `schema S { a: -1 }`: `theta/parse/schema-type-not-expression`
naming the declaration, beside body-level `theta/parse/malformed-schema-field`
anchored at the token from which no further `Field` derives. No code is minted
and no `Message` moves.

DIAG-2 obligation: one sentence stating the withhold, in the register that owns
the comma arm.

**Ordering.** No dependency in either direction. Bug 0284 is fixed (0.281.0)
and this seam is untouched by its gate; the type-side line the subject draws is
`schema-type-not-expression`'s ordinary field-type judgement, present at HEAD
before and after that fix.

**Flip-authority sweep (scaffolding-aware).** Every pinned cell asserting the
comma-separation line was enumerated by sweeping `tests/` for the message
string; eight files carry it. **Zero flip** under the route above, because in
every pinned fixture the boundary's predecessor ENDS a `Type` atom:

- `tests/schema-field-discard-prefix-retention.test.ts:791`–`:805` (5c,
  `schema S { f: Cat Cat }`, predecessor `Cat`), `:1060`–`:1076` (8c,
  `schema S { a: string, b: { }` + `schema T …`, predecessor `}`),
  `:1107`–`:1111` (9a, `schema S { a: string b: integer }`, predecessor
  `string`).
- `tests/schema-body-nontype-text-refusal.test.ts:1115`–`:1129` (f8,
  `schema S { f: Cat Cat }`, predecessor `Cat`).
- `tests/schema-alias-rhs-malformed.test.ts:1218`–`:1242` (e2, fixture `F1D`
  at `:314`, `schema S { f: Cat Cat }`, predecessor `Cat`).
- `tests/brace-rooted-union-arm-capture.test.ts:888`–`:893` (4c,
  `schema S { f: {} g: string }`, predecessor `}`).
- `tests/discriminator-field-classifier-brace-group.test.ts:688`–`:690`
  (`schema Cat { kind: {a: integer} | {b: string} name: string }`, predecessor
  `}`).
- `tests/reserved-keyword-misfire-faces.test.ts:1206`–`:1219` (M1, a
  comma-less multiline body whose predecessor is `string`).
- `tests/fix1-parser-structural.test.ts:10`–`:12` (B1, a newline-separated
  comma-missing body).
- `tests/construct-token-table-tails.test.ts:191` holds the tail as a string
  constant for bug 0063's table check and asserts no fixture of this shape.

**Sub-choices, adjudicable in lane from the evidence above.**

1. *The predicate's site.* (a) Classify the last character of `typeSource` in
   `parseSchemaObjectBody` — local, one expression, no signature change; or
   (b) have `parseType` report whether it stopped at the `stopAtFieldBoundary`
   arm with a non-atom-completing predecessor — exact, but changes the
   function's return shape and its four other callers' call sites. Evidence
   favours (a): `typeSource` is the only value the loop already holds and its
   last character is decided by the same token the arm inspected.
2. *Whether the phantom `malformed-schema-field` also withholds.* Evidence
   favours NO. Its *Trigger* (`code-registry-parse.md:99`) is literally
   satisfied — `Sub` is a token from which no further `Field` derives — and
   the resulting pair is the one `:106` pins for `schema S { a: -1 }`. A lane
   that decides YES must also decide what consumes the brace remainder, which
   reaches bug 0133's landed class and is a §Non-goals crossing.
3. *Which register carries the DIAG-2 sentence.*
   `code-registry-parse.md:30`'s `theta/parse/unsupported-feature` row (the
   code's own register) or `placeholder-rendering-a.md:93`'s construct row
   (which owns the input-class wording the withhold narrows). Either is a
   *Trigger*-side addition; no `Code` / `Severity` / `Phase` / `Message` /
   `Fix hint` byte moves.

A route that instead changes the SPLITTER — requiring the
`stopAtFieldBoundary` arm's predecessor to end a `Type` atom before the capture
stops — is rejected on measurement, not on taste: it changes `schema S { a: -1
}`'s captured `typeSource` from `-` to `-1` and removes that body's
`theta/parse/malformed-schema-field` line, moving the reading
`code-registry-parse.md:106` pins verbatim.

## Provenance

Filed in the nineteenth fix-open-bugs session at HEAD `d0fffd87`, v0.281.0,
from residual 3 of bug 0284's fix record, which measured the pileup while
scoping its own `schema` witness cell to `f()<integer>` and recorded the class
as unowned, out of scope, and a candidate report. Every citation above
re-derived at that HEAD. All measurements are this report's own, taken by one
offline provider-free scratch probe over `parseDoc` (token `b0285scratch`,
deleted after the sweep) plus one `git ls-files` / `git grep` corpus sweep and
one message-string sweep of `tests/`. No live test was run.

Ownership check: `docs/bugs/` carries no open report. The seam's landed owners
— `./0133-field-list-discard-recovery-unsettled.md` (0.203.0, the recovery
arms and the retained prefix), `./0231-well-formed-field-behind-malformed-entry-unchecked.md`
(0.189.0), `./0232-unterminated-literal-params-type-drops-inline-fields.md`
(0.188.0), `./0256-generic-argument-stranded-entry-registers-permissive.md`
(0.251.0) and `./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md`
(0.262.0) — are all fixed, and none of them judges a boundary the schema
object-body capture manufactures at depth 0. `./0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md`
(0.278.0) settled the opposite direction of the same principle (a suppression
that swallowed genuinely-written sibling mistakes); this report is its
over-reporting counterpart and takes nothing back from it — every line
withheld here names a construct the source does not spell.

Three corrections to the handover this filing carries.

1. The residual attributes the pileup to the field scanner splitting "on `.`
   and `-`". Measured, the splitter is character-agnostic: `parseType`'s
   `stopAtFieldBoundary` arm stops in front of any ident/keyword/string/number
   token whose predecessor is not `|`, and `.` / `-` reach that position only
   because they are in no stop set. `string.b` and `1-2` split the same way.
2. The residual scopes the pileup to the applied spellings
   `Nope.Sub<integer>` and `a-b<integer>`. Measured, the application is
   incidental: bare `Nope.Sub` and `a-b` draw the identical three-code set
   (§Reproduction (b)), and the pileup is bounded instead by depth (0 only)
   and by capture (`schema` object body only) — §Reproduction (c).
3. The candidate brief's `S4` estimate is corrected to **S2**. The second line
   is not noise with correct content; it states a construct the source does not
   contain, which is the `S2` register ("wrong diagnostic code/text, spurious
   duplicate diagnostics"). The brief's "registration refused in all offender
   cases" is confirmed: all sixteen measured offender rows report
   `registered=false`.

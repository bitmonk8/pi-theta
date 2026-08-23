# Bug 0249 — a reserved keyword spelled as an inline object type's field key or as a typed object-literal key reaches no parser leaf: 28 of the 32 spellings load with zero diagnostics at both positions (`schema S { p: { let: string } }`, `let x = [schema T { a: "s", let: 1 }]`), the remaining four (`fn`, `for`, `if`, `while`) are refused only by the lexer's `theta/parse/single-line-if` — a row whose *Trigger* is a non-braced body — and at the literal position the key is not merely unrefused but dropped token-by-token, so `schema T { a: "s", let: nope }` re-reads `nope` as the next field name and reports `extra field 'nope'`

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because both positions accept spellings
  `docs/spec_topics/lexical.md:20` refuses, with no diagnostic on any channel:
  28 of 32 at the inline-object-type key (32 of 32 at the `fn` parameter and
  `fn` return-type positions, §Reproduction (A)) and 28 of 32 at the typed
  object-literal key, and the literal position additionally corrupts the
  parsed field set — the key, its `:` and its value are discarded, so
  `{ let: 1 }` is not an extra field and `{ a: "s", let: nope }` manufactures a
  field named `nope` whose value expression is never walked (§Reproduction (B)
  rows B4, B6). D2 because the refusal reuses an already-registered code at two
  parser leaves in one subsystem — `TypeParser`'s identifier pass over
  `TypeNode.fieldNames` (`src/parser/type-grammar.ts:1232`), which already
  reads the lexer's reserved set and skips it by an explicit `continue`
  (`:1234`), and `ThetaParser.parseObjectLiteral`'s field-name gate
  (`src/parser/theta-document.ts:4446`) — with no new registry row and no spec
  edit, against eight pinned rows to retake in bug 0242's witness (§Fix
  constraint 1).
- **Kind:** defect — implementation. Two positions, two leaves, one
  consequence.
  1. **The inline object type's field key** (`ObjectType`,
     `docs/reference/grammar.md:225`, whose fields "reuse the object-schema
     `Field` form" `:238` and whose names "are identifiers" `:243–:244`).
     `TypeParser.parseObject` retains the key in `TypeNode.fieldNames`
     (`src/parser/type-grammar.ts:865`), and bug 0154's identifier pass over
     that list (`:1232–:1249`) opens with `if (RESERVED_KEYWORDS.has(name)) {
     continue; }` (`:1234–:1236`). The exclusion is deliberate and documented
     (`:1029–:1031`, "a keyword-shaped inline field name stays with the
     reserved-keyword class's own open report, not this one") — but the report
     it defers to, [0153](./0153-reserved-keyword-remaining-identifier-positions.md),
     shipped (0.194.0) covering six named positions, none of which is this one,
     and closed.
  2. **The typed object-literal key** (`NamedObjectLit ::= Ident "{"
     (FieldEntry …)? "}"`, `FieldEntry ::= Ident ":" Literal`,
     `docs/reference/grammar.md:593–:594`; `Schema { field: expr, … }`,
     `docs/spec_topics/expressions.md:211`).
     `ThetaParser.parseObjectLiteral` (`src/parser/theta-document.ts:4440`)
     gates the field-name position on token KIND — `if (nameTok.kind !==
     "ident" && nameTok.kind !== "string")` (`:4446–:4451`) — and a reserved
     spelling lexes as `keyword`, so the arm takes the progress branch: "Not a
     field name: drop the token to guarantee progress" (`:4448–:4450`), with no
     diagnostic. The `:` and the value are dropped by the same loop on the next
     two turns.
  3. **The refusal that does fire at four spellings is not the row that
     describes the position.** Bug 0242's fix (0.215.0) added
     `isNameSlot` (`src/lexer/lexer.ts:928`); its block branch (`:940–:949`)
     recognises only the `for` / `par for` iteration variable, so neither
     position is a name slot and the `controlHeads` scan (`:972`, push
     `:1076–:1082`) still fires there for `fn`, `for`, `if` and `while`. The
     emitted code is `theta/parse/single-line-if`, *Trigger* "`if` / `for` /
     `while` / `fn` body is not a braced block (e.g. `if (x) stmt`)"
     (`docs/spec_topics/diagnostics/code-registry-parse.md:23`), *Hint* "Wrap
     the body in `{ ... }`" — at a field key with no body. The row whose
     *Trigger* holds, `theta/parse/reserved-keyword-as-identifier` ("Reserved
     keyword used in an identifier position", `:21`), never fires at either
     position.
- **Related:**
  - [0242](./0242-reserved-keyword-refusal-misfires-on-three-faces.md) —
    **fixed (0.215.0)**, the origin. This report is its §Fix (0.215.0)
    *Residuals* items 1 and 2, which pin both positions UNCHANGED (witness
    groups `(N)` and `(O)`) on the stated ground that silencing the
    off-Trigger emission alone "would turn a refused source into an admitted
    one", and name "a parser-leaf refusal at the inline-object field name — a
    candidate follow-up filing". Not a duplicate: 0242 is closed on the three
    lexer-side misfire faces, and its group `(N)` / `(O)` pins are what this
    report authorises to move.
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) —
    **fixed (0.165.0)**, the owner of the inline-field-name identifier pass and
    of the `RESERVED_KEYWORDS` skip this report removes. Its §Fix records the
    skip as "Disposition A" and defers the class explicitly. Its witness
    `tests/inline-object-field-name-case.test.ts` (30 cells) holds the case
    rule at the same list and is a LOCK apart from any cell that asserts a
    reserved spelling's silence.
  - [0153](./0153-reserved-keyword-remaining-identifier-positions.md) —
    **fixed (0.194.0)**, the report 0154 deferred to. Its six positions are the
    `for` / `par for` variable, the schema field NAME, the enum variant, the
    two import/export specifier arms and the `params:` key; the inline object
    type's key and the object-literal key are outside all six, which is why the
    deferral left a hole. Its 76-cell witness is a LOCK.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, owner of the shared builder
    `reservedKeywordAsIdentifierDiagnostic`
    (`src/parser/theta-document.ts:6361`) both new emissions call. Disjoint
    subject (TYPE slots); its witness `tests/reserved-keyword-type-position.test.ts`
    (42 cells) is a LOCK.
  - [0244](./0244-colon-less-inline-object-entry-silently-discarded.md) —
    **open**, the same function (`TypeParser.parseObject`) and the adjacent
    class: an entry that spells NO top-level `:` never reaches `fieldNames` at
    all. Disjoint — this report's entries do spell `Ident ":"` and do reach
    `fieldNames`; whichever lands second re-measures the other's rows in that
    loop.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **fixed
    (0.198.0)**, the citation convention. Every citation here is symbol-named
    beside its line number and verified at HEAD `b9cf2f26`.
- **Affected** (every citation verified against the tree at HEAD `b9cf2f26`,
  v0.219.0 — `package.json:3`):
  - **The inline-object-type leaf** — `TypeParser.parseObject`
    (`src/parser/type-grammar.ts`), field-name retention `fieldNames.push`
    (`:865`); the bug-0154 identifier pass (`:1232–:1249`), its
    closing-brace gate (`:1232`, `node.closingBraceSpelled`) and its
    reserved-spelling `continue` (`:1234–:1236`); the module-level
    `RESERVED_KEYWORDS` (`:119`, `= reservedKeywords()`); the doc clause that
    records the deferral (`:1024–:1031`).
  - **The object-literal leaf** — `ThetaParser.parseObjectLiteral`
    (`src/parser/theta-document.ts:4440`), field-name gate `:4446–:4451`,
    field push `:4457`; its two call sites `:4397` (named constructor) and
    `:4426` (bare literal).
  - **The consumer that never sees the dropped key** — `checkObjectExpr`
    (`src/parser/theta-document.ts:7991`), whose `present` list is
    `e.fields.map((f) => f.name)` (`:8046`) and whose `extra-object-field`
    push is `:8049–:8055`.
  - **The shared builder to reuse** —
    `reservedKeywordAsIdentifierDiagnostic`
    (`src/parser/theta-document.ts:6361–:6373`).
  - **The off-Trigger emission standing in for the refusal** —
    `isNameSlot` (`src/lexer/lexer.ts:928`), block branch `:940–:949`;
    `contextualDiagnostics` (`:970`), `controlHeads` (`:972`), the
    `single-line-if` push (`:1076–:1082`).
  - **The registry rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:21`
    (`theta/parse/reserved-keyword-as-identifier`) and `:23`
    (`theta/parse/single-line-if`).
  - **The spec sentences the two positions rest on** —
    `docs/spec_topics/lexical.md:20` (the 32 reserved spellings; "Using one of
    these in identifier position is
    `theta/parse/reserved-keyword-as-identifier`"),
    `docs/reference/grammar.md:225` (`ObjectType`), `:238` (fields reuse the
    object-schema `Field` form), `:243–:244` ("Field names are identifiers"),
    `:593–:594` (`FieldEntry ::= Ident ":" Literal`, `NamedObjectLit`),
    `docs/spec_topics/expressions.md:211` (constructor field sets; "extra
    fields are `theta/parse/extra-object-field`").
  - **Witnesses that pin the current behaviour** —
    `tests/reserved-keyword-misfire-faces.test.ts` (112 cells, green at HEAD)
    groups `(N)` rows `N1`–`N4` and `(O)` rows `O1`–`O3`, `O6`;
    `tests/inline-object-field-name-case.test.ts` (bug 0154);
    `tests/reserved-keyword-remaining-identifier-positions.test.ts` (bug 0153);
    `tests/reserved-keyword-type-position.test.ts` (bug 0044).
- **Observed at:** HEAD `b9cf2f26`, v0.219.0 (`package.json:3`). Measured by
  scratch vitest probes through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the
  real `parseThetaDocument` over the real production parse deps.

## Summary

Two identifier positions have no parser-leaf reserved-keyword refusal: the
field key of an inline object type (`{ let: string }`, at any `Type` position
and any nesting depth) and the field key of a typed object literal
(`schema T { let: 1 }`).

At the first position bug 0154's identifier pass already holds the key and
already reads the lexer's reserved set — to `continue` past it, deferring the
class to bug 0153, which then shipped without covering it. At the second the
key never becomes a key at all: `parseObjectLiteral` gates the field-name slot
on token kind, and a reserved spelling lexes as `keyword`, so the loop's
progress branch discards the token silently.

Four of the 32 spellings — `fn`, `for`, `if`, `while` — are refused anyway, by
the lexer's `theta/parse/single-line-if` scan, at a position with no body. Bug
0242's fix pinned that emission in place (groups `(N)`, `(O)`) precisely
because it is the only refusal these positions have; the code that fires is not
the row whose *Trigger* describes the position, and the other 28 spellings load
clean.

## Reproduction

Every row is one scratch-probe run's output verbatim: `parseDoc(src)` and
`doc.diagnostics` unfiltered, in emission order, rendered
`<severity> <code> @<line>:<col>-<line>:<col>: <message>`. Sources carry the
three-line prompt frontmatter `---\nmode: prompt\n---\n` unless the row says
otherwise, so body line 1 is source line 4. Sweeps substitute each of the 32
spellings of `docs/spec_topics/lexical.md:20`, read from `reservedKeywords()`
(`src/lexer/lexer.ts:159`).

### (A) The inline object type's field key

| # | source (body) | diagnostics |
|---|---|---|
| A1 | `schema S { p: { let: string } }` + `1` | `[]` |
| A2 | `schema S { p: { fn: string } }` + `1` | `error theta/parse/single-line-if @4:17-4:19: single-line body not permitted; wrap in { ... }` |
| A3 | `schema S { p: { q: { let: string } } }` + `1` | `[]` |
| A4 | `let x: { let: string } = 1` + `1` | `[]` |
| A5 | `let x: { outer: { let: string } } = 1` + `1` | `error theta/parse/let-rhs-type-mismatch @4:1-4:38: let binding 'x' initialiser type mismatch: expected { outer: { let: string } }, got integer` |
| A6 | `fn h(p: { outer: { let: string } }): number { 1 }` + `1` | `[]` |
| A7 | `fn h(): { outer: { let: string } } { 1 }` + `1` | `[]` |
| A8 | `let x: array<{ outer: { let: string } }> = []` + `1` | `[]` |
| A9 | `.thetalib`: `schema S { p: { let: string } }` / `fn f(): number { 1 }` | `[]` |
| A10 | frontmatter `params:` `p: { outer: { let: string } }`, body `let y = 1` / `1` | `[]` |
| A11 | control, lowercase key: `schema S { p: { ok: string } }` + `1` | `[]` |
| A12 | control, uppercase key: `schema S { p: { Ys: string } }` + `1` | `error theta/parse/binding-case-mismatch @4:1-4:31: binding name must start with a lowercase letter or _` |
| A13 | control, the DECLARATION body one level out: `schema S { let: string }` + `1` | `error theta/parse/reserved-keyword-as-identifier @4:12-4:15: reserved keyword 'let' cannot be used as an identifier` |

A12 proves the identifier pass reaches the nested key: an uppercase spelling at
the identical slot draws bug 0154's case rule. A13 is the position bug 0153
does cover — one brace outward, the same spelling is refused by the correct
row.

The sweep over all 32 spellings, five `Type` positions, counts of spellings per
outcome:

| shape | `[]` | `single-line-if` alone | other |
|---|---|---|---|
| `schema S { p: { <kw>: string } }` | 28 | 4: `fn`, `for`, `if`, `while` | 0 |
| `schema S { p: { q: { <kw>: string } } }` | 28 | 4, as above | 0 |
| `let x: { <kw>: string } = 1` | 1: `void` | 4 (beside `let-rhs-type-mismatch`) | 27: `let-rhs-type-mismatch` alone |
| `fn h(p: { <kw>: string }): number { 1 }` | 32 | 0 | 0 |
| `fn h(): { <kw>: string } { 1 }` | 32 | 0 | 0 |
| `let x: array<{ <kw>: string }> = []` | 28 | 4, as above | 0 |

`schema S { <kw>: string }` is absent from that table on purpose: it is a
schema DECLARATION body, not an inline object type, and it is bug 0153's
covered position (A13). The two
`fn` positions draw nothing at all for any spelling: the `fn` head puts a `{`
on the logical line, so the `controlHeads` scan is satisfied and even the four
off-Trigger refusals are absent. The `void` cell at the `let` annotation
reports `[]` where the other 31 draw the RHS mismatch; the mismatch check's
disposition on a `void`-bearing type is not this report's subject.

### (B) The typed object-literal key

All rows declare `schema T { a: string }` as body line 1, so body line 2 is
source line 5.

| # | source (body line 2) | diagnostics |
|---|---|---|
| B1 | `let x = [schema T { a: "s", let: 1 }]` | `[]` |
| B2 | `let x = [schema T { a: "s", fn: 1 }]` | `error theta/parse/single-line-if @5:29-5:31: single-line body not permitted; wrap in { ... }` |
| B3 | `fn g(p: T): number { 1 }` + `g(schema T { a: "s", let: 1 })` | `[]` |
| B4 | `let x = [schema T { let: 1 }]` | `error theta/parse/missing-object-field @5:17-5:29: missing field 'a' on schema 'T'` |
| B5 | control: `let x = [schema T { Ys: 1 }]` | `error theta/parse/extra-object-field @5:17-5:28: extra field 'Ys' on schema 'T'`, `error theta/parse/missing-object-field @5:17-5:28: missing field 'a' on schema 'T'` |
| B6 | `let x = [schema T { a: "s", let: nope }]` | `error theta/parse/extra-object-field @5:17-5:40: extra field 'nope' on schema 'T'` |
| B7 | control: `let x = [schema T { a: "s", Ys: nope }]` | `error theta/parse/extra-object-field @5:17-5:39: extra field 'Ys' on schema 'T'`, `error theta/parse/unknown-identifier @5:33-5:37: unknown identifier 'nope'` |
| B8 | control, quoted key: `let x = [schema T { "let": 1 }]` | `error theta/parse/extra-object-field @5:17-5:31: extra field '"let"' on schema 'T'`, `error theta/parse/missing-object-field @5:17-5:31: missing field 'a' on schema 'T'` |
| B9 | control, legal: `let x = [schema T { a: "s" }]` | `[]` |
| B10 | `.thetalib`: `schema T { a: string }` / `fn f(): array<T> { [schema T { a: "s", let: 1 }] }` | `[]` |

B4 against B5 isolates the drop: an uppercase key is an extra field, a reserved
key is not a field at all. B6 against B7 isolates its blast radius: with the
key and its `:` discarded, the loop re-enters at the VALUE, reads `nope` as the
next field name, and reports an extra field the author never wrote — while the
value expression that name displaced is never walked, so B7's
`unknown-identifier` is withheld. B8 shows the quoted spelling is a different
key entirely (`string`-kind token, retained verbatim).

The sweep, two literal positions:

| shape | `[]` | `single-line-if` alone |
|---|---|---|
| `let x = [schema T { a: "s", <kw>: 1 }]` | 28 | 4: `fn`, `for`, `if`, `while` |
| `g(schema T { a: "s", <kw>: 1 })` | 28 | 4, as above |

### (C) Three shapes that look covered and are not

These draw `theta/parse/reserved-keyword-as-identifier`, but not from the
literal leaf: the statement mis-splits and `schema T { … }` is re-read as a
schema DECLARATION, so bug 0153's `parseSchemaObjectBody` arm answers. The
`let-without-initialiser` beside each is the tell.

| # | source (body line 2) | diagnostics |
|---|---|---|
| C1 | `let x = schema T { a: "s", let: 1 }` | `error theta/parse/let-without-initialiser @5:1-5:8: let binding 'x' has no initialiser`, `error theta/parse/reserved-keyword-as-identifier @5:28-5:31: reserved keyword 'let' cannot be used as an identifier` |
| C2 | `let x: T = schema T { a: "s", let: 1 }` | `… let-without-initialiser @5:1-5:11 …`, `… reserved-keyword-as-identifier @5:31-5:34 …` |
| C3 | `fn g(): T { schema T { a: "s", let: 1 } }` | `error theta/parse/reserved-keyword-as-identifier @5:32-5:35: reserved keyword 'let' cannot be used as an identifier` |

Bracketing the same constructor (B1) or passing it as an argument (B3) removes
the mis-split and the refusal together.

### (D) The committed corpus

`rg` over all 34 committed `*.theta` / `*.thetalib` files
(`git ls-files "*.theta" "*.thetalib"`) for a brace-interior entry whose key is
one of the 32 spellings returns nothing. No shipped fixture reaches either
position, so the fix moves no corpus row and
`tests/committed-fixture-parse-gate.test.ts` is unaffected.

## Expected behaviour

1. `schema S { p: { let: string } }` reports
   `theta/parse/reserved-keyword-as-identifier` against `let`, and so does each
   of the other 31 spellings at that key, at every `Type` position and every
   nesting depth — the same rule `schema S { let: string }` already draws one
   brace outward (A13). `ObjectType` fields reuse the object-schema `Field`
   form (`grammar.md:238`) and their names are identifiers (`:243–:244`), so
   `lexical.md:20` holds of them.
2. `let x = [schema T { a: "s", let: 1 }]` reports the same refusal against the
   key. `FieldEntry ::= Ident ":" Literal` (`grammar.md:593`) admits an
   `Ident`, and a reserved spelling is not one.
3. `let x = [schema T { let: 1 }]` reports the refusal AND `extra field 'let'`
   — the key is a key, so the field-set checks see it — and
   `let x = [schema T { a: "s", let: nope }]` reports the refusal against `let`
   and `unknown identifier 'nope'`, not `extra field 'nope'`. A reserved key
   must not move the field boundary.
4. Neither position draws `theta/parse/single-line-if`. Its *Trigger* is a body
   that is not a braced block (`code-registry-parse.md:23`); a field key has no
   body, and its *Hint* names an edit that does not apply.
5. Every control keeps what it has today: A11, A12, B5, B7, B8, B9 unchanged,
   and the genuine subjects of `single-line-if` (`if (x) 1`,
   `fn f(): number 1`) unmoved.

## Actual behaviour / root cause

**The inline object type's key.** `TypeParser.parseObject` records the key in
`TypeNode.fieldNames` (`type-grammar.ts:865`) once the entry has spelled
`Ident ":"`. Bug 0154's identifier pass reads that list behind the
closing-brace gate (`:1232`) and opens each iteration with

```ts
if (RESERVED_KEYWORDS.has(name)) {
  continue;
}
```

(`:1234–:1236`). The skip is documented as Disposition A (`:1029–:1031`,
`:1226–:1231`): the case rule must not draw `binding-case-mismatch` on `Ok` /
`Err` / `Result`, which `tokeniseType` presents as plain `ident` text because it
has no keyword kind, and 0154 declined to mint the reserved-keyword refusal
itself, leaving "a keyword-shaped inline field name … with the reserved-keyword
class's own open report". That report was 0153; it shipped (0.194.0) at six
positions — the `for` / `par for` variable, the schema field NAME, the enum
variant, the two import/export specifier arms and the `params:` key — and this
one is none of them. The deferral therefore terminates nowhere: the guard that
protects the case rule from `Ok` also withholds every refusal from `let`.

**The typed object-literal key.** `ThetaParser.parseObjectLiteral`
(`theta-document.ts:4440`) reads each field head as

```ts
const nameTok = this.peek();
if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
  // Not a field name: drop the token to guarantee progress.
  this.advance();
  continue;
}
```

(`:4446–:4451`). A reserved spelling lexes as `keyword`, so the head is
discarded with no diagnostic; the following `:` (punct) and, when it is a
literal, the value are discarded by the same branch on the next turns. Nothing
is pushed to `fields` (`:4457`), so `checkObjectExpr`'s `present` list
(`:8046`) never contains the key and neither `extra-object-field` (`:8049`) nor
any type check can name it. When the value is an identifier the loop re-enters
at a token the gate DOES admit, and that token becomes the next field's name —
B6's `extra field 'nope'`.

**Why four spellings are refused anyway.** Bug 0242's fix (0.215.0) taught
`contextualDiagnostics` a brace-region stack so a member NAME slot skips both
the declarator arms and the `controlHeads` scan. `isNameSlot`'s block branch
(`lexer.ts:940–:949`) recognises exactly one name slot — the `for` / `par for`
iteration variable past the `mut` recovery — and `classifyBrace` (`:850`)
assigns `member` only to the three declaration forms whose keys bug 0153's
leaves refuse. An inline object type and a constructor literal are both block
regions by construction, so the scan at `:1076–:1082` still fires for the four
`controlHeads` spellings. That fix recorded the consequence as its Residuals 1
and 2 and pinned both shapes unchanged, on the ground that the off-Trigger
emission is the only refusal there is: removing it without adding the parser
leaf would take a refused source to an admitted one.

## Why it matters

- **28 of 32 spellings load and register.** A `.theta` whose schema declares
  `p: { let: string }`, or whose constructor writes `let: 1`, carries no
  diagnostic on any channel. The declared constraint `lexical.md:20` states is
  unenforced at two positions the grammar routes identifiers through.
- **At the literal position the parsed field set is wrong, not merely
  permissive.** The key is not recorded, so `extra-object-field` cannot name
  it; and when its value is an identifier the field boundary shifts by one, so
  the reported error names a token the author wrote as a VALUE and the real
  value expression is never checked (B6 against B7).
- **The four spellings that are refused are refused by the wrong row.** The
  author of `schema S { p: { fn: string } }` is told "single-line body not
  permitted; wrap in { ... }" and hinted to brace a body that does not exist,
  at a field key. Both the code and the hint are unactionable, and the
  registered *Trigger* does not hold of the input — a DIAG-2 property of the
  row (`diagnostic-shape.md:72`).
- **The two positions disagree with their own neighbours by one brace.**
  `schema S { let: string }` is refused; `schema S { p: { let: string } }` is
  not. `schema T { Ys: 1 }` reports an extra field; `schema T { let: 1 }`
  reports a missing one.

## Non-goals

- Changing the *Trigger*, *Message*, *Hint* or severity of
  `theta/parse/reserved-keyword-as-identifier` or
  `theta/parse/single-line-if`. Both rows are correct as written; the
  emissions do not match them, and no new code is minted.
- Bug 0154's case rule and the reason its `RESERVED_KEYWORDS` guard exists.
  `Ok` / `Err` / `Result` keep drawing no `binding-case-mismatch`; they draw
  the reserved-keyword refusal instead.
- Bug 0244's colon-less entry, which never reaches `fieldNames`. Disjoint
  class, same loop.
- The quoted key (`{ "let": 1 }`, B8) — bug 0176's and bug 0161's subject at
  the type position, and a `string`-kind token at the literal position.
- The `match` object-pattern head (bugs 0219, 0226, both fixed) and the
  `params:` key (bug 0153's sixth position).
- The `void` cell of the `let`-annotation sweep, which reports `[]` where the
  other 31 draw the RHS mismatch (§Reproduction A). Whatever governs it is a
  disposition of the mismatch check, not of this rule.

## Fix

Emit `theta/parse/reserved-keyword-as-identifier` at both leaves through the
shared builder `reservedKeywordAsIdentifierDiagnostic`
(`theta-document.ts:6361`), then withdraw the off-Trigger residue in the lexer
in the same commit, so no shape passes through a state where it is admitted.

1. **Inline object type.** In the bug-0154 identifier pass
   (`type-grammar.ts:1232–:1249`), replace the bare `continue` on
   `RESERVED_KEYWORDS.has(name)` (`:1234`) with the refusal: the entry stays
   outside the case rule (0154's Disposition A holds — `Ok` must not draw
   `binding-case-mismatch`) and draws the reserved-keyword row instead. The
   range is the pass's existing `site.range`, the declaration-ranged site every
   other rule at this arm already uses (A12 shows the shape); no `TypeToken`
   range work is owed, and `tokeniseType` stays byte-unmodified. The gate stays
   `node.closingBraceSpelled`, so an interior that never closes is unchanged
   (bug 0052's boundary, inherited), and the pass keeps running under every
   `rules` value and at every depth, including beneath a generic argument
   (A8).
2. **Typed object literal.** In `parseObjectLiteral`
   (`theta-document.ts:4446–:4451`), admit a `keyword`-kind head as a field
   NAME — push it to `fields` and consume its `:` and value on the normal path
   — and emit the refusal ranged on `nameTok.range`. Admitting it is what makes
   §Expected 3 hold: the key must reach `checkObjectExpr`'s `present` list so
   `extra-object-field` names it and the value expression is walked. The
   progress branch stays for every other token kind.
3. **Lexer residue.** Extend `isNameSlot`'s block branch
   (`lexer.ts:940–:949`) so a key position inside a non-member brace region —
   the token after `{`, `,` or a statement separator at brace depth > 0, when
   the next token is `:` — is a name slot, which suppresses both the
   `controlHeads` scan and the declarator arms there. The four `fn` / `for` /
   `if` / `while` spellings then draw the parser leaf's refusal alone, which is
   what §Expected 4 requires. Bug 0242's `classifyBrace` and its `member`
   branch are untouched.

Constraints:

1. **Pinned rows to retake, in place, ids and subjects preserved.**
   `tests/reserved-keyword-misfire-faces.test.ts` group `(N)` rows `N1`–`N4`
   and group `(O)` rows `O1`–`O3` and `O6` assert the current off-Trigger lists
   as ordered whole lists; bug 0242's Residuals 1 and 2 record them as pinned
   pending this filing. `N5`, `N6`, `O4`, `O5`, `O7`–`O12` and every other cell
   of that 112-cell file are LOCKS. `O5` and `O7` state the §Reproduction (C)
   mis-split shapes and must keep their lists exactly.
2. **LOCK set.** `tests/inline-object-field-name-case.test.ts` (bug 0154),
   `tests/reserved-keyword-remaining-identifier-positions.test.ts` and
   `tests/fn-param-name-reserved-keyword.test.ts` (0153, 0148),
   `tests/schema-field-name-case.test.ts` (0149),
   `tests/reserved-keyword-type-position.test.ts` (0044). Any cell of 0154's
   file that asserts a reserved spelling's SILENCE at an inline key is retaken
   under this report's authority; every other cell in the set stays green
   unchanged, and the count is asserted before and after.
3. **No registry change and no spec edit.** DIAG-2 is not engaged: no code is
   added, removed, re-namespaced or re-triggered. `lexical.md:20`,
   `grammar.md:238`, `:243–:244` and `:593` already prescribe the behaviour;
   the fix makes the emissions match rows and sentences that exist.
4. **The field-boundary repair must be witnessed separately from the
   refusal.** §Reproduction B6's row must assert the whole post-fix list —
   the refusal against `let` and `unknown identifier 'nope'`, with NO `extra
   field 'nope'` — so a fix that emits the refusal while leaving the key
   dropped reds.
5. **The genuine subjects must red on over-reach.** Cells for `if (x) 1` and
   `fn f(): number 1` keep `theta/parse/single-line-if`, and bug 0154's case
   rule keeps firing on `{ Ys: string }` (A12) and staying silent on
   `{ Ok: string }`.
6. **Witness form.** One new witness file, every assertion an ordered
   whole-list `toEqual` over unfiltered `doc.diagnostics` through `parseDoc`
   (`tests/helpers/e2e-s1.ts:39`), every expected message read through
   `parseRegistry` / `registryMessage` with the `<keyword>` slot filled
   (DIAG-4). Required cells: A1–A13, the seven sweep rows of (A), B1–B10, the
   two sweep rows of (B), C1–C3, and the `.thetalib` routes A9 and B10.
7. **Corpus.** Zero committed fixtures reach either position (§Reproduction D),
   so no baseline entry and no fixture edit is owed;
   `tests/committed-fixture-parse-gate.test.ts` and
   `tests/registry-closed-set-corpus-gate.test.ts` stay green unchanged.
8. **A live cell is owed.** Every measured shape at both positions currently
   REGISTERS (zero diagnostics, 28 of 32 spellings) and after the fix must not,
   so the load-time refusal is an end-to-end change, not a message change: one
   H8a registration-denial cell over `schema S { p: { let: string } }` and
   `let x = [schema T { a: "s", let: 1 }]`, zero model turns.
9. **Shifted citations.** The fix edits `src/lexer/lexer.ts`, where open bug
   [0051](./0051-lowercase-named-type-reference-positions-silent.md) holds
   citations. 0051 stays unedited under bug 0134's adjudication; the fix record
   names 0051's new positions so the next run re-derives them.

## Provenance

- **Origin:** bug 0242's `## Fix (0.215.0)` *Residuals* items 1 and 2 — "Nested
  inline-object field keys have no parser-leaf backstop … Closing it properly
  needs a parser-leaf refusal at the inline-object field name — a candidate
  follow-up filing, outside this report's subject" and "The same gap at the
  typed object-literal expression … group `(O)` pins it unchanged for the same
  reason."
- **Ownership check performed before any probe.** All 25 documents in
  `docs/bugs/` whose Status is `open` were enumerated at HEAD; none claims
  either position. The two closed documents that own the leaves — 0154 (the
  inline identifier pass, fixed 0.165.0) and 0153 (the six reserved-keyword
  positions, fixed 0.194.0) — are both fixed, and 0154's deferral names 0153,
  which closed without covering these keys. The one open document at the same
  function, 0244, owns the colon-less entry, which never reaches `fieldNames`.
  The one open document citing `src/lexer/lexer.ts`, 0051, owns the case rule
  at reference positions.
- **Re-measured at HEAD `b9cf2f26` (v0.219.0), not copied.** 0242's residuals
  name two shapes; this report measures the partition at seven `Type` positions
  and two literal positions over all 32 spellings, and adds what the residuals
  do not: the 32-of-32 silence at the `fn` parameter and `fn` return positions
  (§Reproduction A), the field-set corruption at the literal position (B4, B6
  against their controls B5, B7), the `.thetalib` and `params:` routes (A9,
  A10, B10), the boundary against the covered declaration body one brace out
  (A13), and the three mis-split shapes that make the position look covered
  (§Reproduction C).
- **Measurement:** four scratch vitest probe files (filenames containing
  `scratch`), written, run and deleted. A sweep of `git status --short` and of
  `tests/` at exit reports no scratch file of this filing's in the tree; five
  `scratch-*` files belonging to concurrent sibling filings (0245, 0247) remain
  and are not this report's. Zero model turns, no provider contacted.
- **Lock count taken at HEAD:** `npx vitest run
  tests/reserved-keyword-misfire-faces.test.ts` → `Tests 112 passed (112)`.
- **Not verified end to end:** nothing in §Reproduction is inferred — every
  diagnostic cell is that run's output verbatim through the real
  `parseThetaDocument`. No live cell was run (offline filing); the registration
  claim in §Fix constraint 8 rests on the measured empty diagnostic lists, not
  on an observed load.

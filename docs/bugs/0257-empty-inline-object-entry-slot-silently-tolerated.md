# Bug 0257 — an inline object entry slot spelling NO token — the segment a doubled, leading or lone top-level comma opens (`{a: integer,,b: string}`, `{,a: integer}`, `{,}`) — derives from no `Field` and draws nothing at all twelve `Type` positions, because `TypeParser.parseObject` reads a `,` at a field-name position as a closed empty slot and returns before bug 0244's keyless-entry emission: the theta registers, `let x: {a: integer,,b: string} = 1` withholds the `let-rhs-type-mismatch` its byte-neighbour draws, and `{,}` lowers the byte-identical fragment `{}` is refused for producing

- **Status:** fixed (0.258.0).
- **Sev/Diff estimate:** S3/D1 — S3 because the theta LOADS AND REGISTERS with
  zero diagnostics on any channel over source no production derives, and two
  further rows are withheld with it (TYPE-8's `let-rhs-type-mismatch` /
  `reassign-rhs-type-mismatch` at a `let` annotation, §Reproduction (d); and
  the permissive `params:` lowering for a comma-only interior, §(f)), while the
  harm stays bounded — every sibling entry that spells `Ident ":"` keeps its
  own verdict and its own lowered property (§(c), §(f)), so no well-formed
  field is starved and no wrong key reaches the wire. D1 because the site is
  one existing arm — `TypeParser.parseObject`'s `fieldName?.text === ","`
  branch, which no grammar-legal spelling reaches (the legal trailing comma is
  consumed by the loop's own `eatPunct(",")` and the loop then exits on `}`) —
  and the registry disposition needs no mint: `theta/parse/malformed-schema-field`
  and `theta/parse/empty-schema-body` already partition this input at the
  declaration position (§(e)), and the fix mirrors that partition.
- **Kind:** defect — implementation, one recovery arm, three consequences.
  1. **The empty slot is passed over with no record.** In
     `TypeParser.parseObject`'s field loop, a field-name position holding a `,`
     takes the `if (fieldName?.text === ",")` branch of the non-`ident` arm:
     that branch resets `entryStart` and clears the `entryRefused` latch on the
     stated ground that "a skipped separator closes an EMPTY entry rather than
     opening one", then falls through to `this.next(); continue;`. Bug
     [0244](./0244-colon-less-inline-object-entry-silently-discarded.md)'s
     emission — the `entryQualifiesForRefusal` / `discardedEntryRefusal` pair
     in the same arm — sits in the sibling `else if`, so it never runs for the
     slot the comma opened.
  2. **The raw-key split spells the slot and yields no key.**
     `splitTopLevelSegments("a: integer,,b: string", ",", "angle-and-brace")`
     (`src/parser/params.ts`) returns three segments — `"a: integer"`, `""`,
     `"b: string"` — and `inlineObjectFieldKeys` (`src/parser/type-grammar.ts`)
     `continue`s on the empty one (`topLevelColon` is `-1`). So the slot is in
     neither judged input: not `TypeNode.fieldNames` / `fieldTypes`, not the
     key split.
  3. **The `let`-annotation conversion treats the same slot as malformation and
     declines silently.** `inlineObjectAnnotationToCompatType`
     (`src/parser/type-layer-checks.ts`) strips the ONE trailing comma
     `ObjectType` admits (`stripOneTrailingComma`), then requires every
     remaining segment to spell an `Ident` key; an empty segment fails and the
     whole interior returns `undefined`, falling back to `convertAnnotation`'s
     deferring `named` arm. TYPE-8's operand is then a nominal, so
     `theta/parse/let-rhs-type-mismatch` and
     `theta/parse/reassign-rhs-type-mismatch` are withheld (§Reproduction (d)).
     The conversion and the parser disagree on one interior: the conversion
     calls it malformed, the parser admits it.
- **Related:**
  - [0244](./0244-colon-less-inline-object-entry-silently-discarded.md) —
    **fixed (0.238.0)**, the origin and the emission this report extends. Its
    §Fix *Residuals* item 2 (`docs/bugs/0244-…:670`) records
    `{a: integer,,b: string}` and `{,}` reporting `[]` before and after that
    change and states that no cell of its §Reproduction claims them. This
    report is that filing. Its witness,
    `tests/inline-object-keyless-entry-refusal.test.ts`, is a lock here — but
    it carries NO cell for this class (see §Provenance).
  - [0237](./0237-empty-inline-field-type-truncates-interior.md) — **fixed
    (0.207.0)**, whose subject is the empty TYPE position (`{a: }`), a
    different slot: this report's subject entry spells no token at all, not a
    key with an empty type behind it. Its §Fix residual 1 keeps `{a: }`.
  - [0238](./0238-stray-close-token-underflows-top-level-split.md) — **fixed
    (0.218.0)**, whose stray-close class is 0244's first carve-out. No interior
    measured below carries a stray close token, so no cell here touches it; its
    witness is a lock.
  - [0252](./0252-brace-and-angle-annotation-junk-exempt-from-refusal.md) —
    **fixed (0.225.0)**, the colon-PRESENT junk-tail class 0244's adjudication
    pins as unmoved. This report's subject entries spell no token, so they are
    outside it; its witness is a lock.
  - [0256](./0256-generic-argument-stranded-entry-registers-permissive.md) —
    **open**, the sibling filing of bug 0244's OTHER unfixed residual (an entry
    stranded behind the field loop's exit). It and this report extend the same
    emission from opposite sides — that one widens the loop's REACH, this one
    fires in an arm the loop already reaches — so both touch
    `TypeParser.parseObject`'s field loop and whichever lands second re-derives
    the other's cells. Neither blocks the other.
  - [0211](./0211-separator-degenerate-specifier-lists-parse-clean.md) —
    **fixed (0.150.0)**, the same separator-degenerate shape in `import` /
    `export` specifier lists, refused there since 0.150.0
    (`theta/parse/import-malformed-specifier-list`, §Reproduction (e)). It is
    the precedent for refusing an empty slot rather than recovering it.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) —
    **fixed**, the count-consequence law any refusal added here satisfies
    (`code-registry-parse.md:104`).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for positional drift in `src/parser/type-grammar.ts`
    citations. Every `type-grammar.ts`, `params.ts` and `type-layer-checks.ts`
    citation here is by SYMBOL for that reason (`docs/STYLE.md` §Citations).
    The class reaches registry citations too: bug 0244 cites the
    count-consequence law as `code-registry-parse.md:103`, which at HEAD is
    `theta/parse/renamed-inline-field-name`'s row — the law is at `:104`, the
    line this report cites.
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - **The tolerating arm** — `src/parser/type-grammar.ts`:
    `TypeParser.parseObject`'s field loop, the `if (fieldName?.text === ",")`
    branch of its non-`ident` field-name-position arm (`entryStart = this.pos + 1`,
    `entryRefused = false`), and the `else if
    (!entryRefused && this.entryQualifiesForRefusal(...))` branch beside it
    that bug 0244 added and this branch bypasses; `TypeParser.classifyEntry`
    and `TypeParser.entryQualifiesForRefusal`, which are never consulted for
    the slot; the loop's `if (!this.eatPunct(","))` exit, which is why the
    grammar-legal trailing comma never reaches the branch.
  - **The consumers that hold no slot** — `inlineObjectFieldKeys`
    (`src/parser/type-grammar.ts`) over `splitTopLevel(interiorSource, ",",
    "angle-and-brace")` and `topLevelColon` (`src/parser/params.ts`);
    `TypeNode.fieldNames` / `TypeNode.fieldTypes`.
  - **The conversion that declines** — `inlineObjectAnnotationToCompatType`,
    `stripOneTrailingComma`, `convertAnnotation` and
    `letAnnotationToCompatType` (`src/parser/type-layer-checks.ts`).
  - **The lowerers** — `hoistInlineObjectType` (`src/parser/params.ts`),
    `lowerInlineObject` (`src/parser/body-type-lowering.ts`),
    `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts`): all
    keyed on the same split, so the empty slot contributes no property and a
    comma-only interior lowers the empty-object fragment (§Reproduction (f)).
  - **The registered rows withheld** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:99`
    (`theta/parse/malformed-schema-field`), `:98`
    (`theta/parse/empty-schema-body`), and TYPE-8's
    `theta/parse/let-rhs-type-mismatch` /
    `theta/parse/reassign-rhs-type-mismatch`.
  - **The registry Trigger this input falls through** —
    `code-registry-parse.md:99`, whose inline clause states the loop "refuses
    each KEYLESS entry its entry walk reaches" with three stated exclusions
    (a colon-present entry, a stray-close-carrying keyless entry, and an entry
    the loop never reaches). The empty slot IS keyless and IS reached, and is
    in none of the three exclusions, so the row's stated reach and the
    implementation diverge on it.
  - **The contract** — `docs/spec_topics/grammar.md:101`
    (`ObjectType ::= "{" Field ("," Field)* ","? "}"` — one optional TRAILING
    comma, and no `Field` deriving from an empty slot), `:109` (§"Inline object
    types", the inline `Field` reuses the object-schema `Field` form at any
    `Type` position and depth), `:172` (`SchemaShape`, the identical
    production at the declaration position);
    `docs/spec_topics/schemas.md:17` ("Fields are comma-separated; the trailing
    comma is optional. Field names are identifiers"), `:19` (the declaration
    position's `theta/parse/malformed-schema-field` and `empty-schema-body`
    partition). Mirror: `docs/reference/grammar.md:225`, `:238`.
  - **The witness locks** —
    `tests/inline-object-keyless-entry-refusal.test.ts` (bug 0244's witness,
    groups (A)–(L), inventory check at group (L));
    `tests/inline-object-stray-close-token-split.test.ts` (0238);
    `tests/brace-and-angle-annotation-junk-refusal.test.ts` (0252);
    `tests/inline-object-empty-field-type-truncation.test.ts` (0237);
    `tests/let-annotation-inline-object-compat.test.ts` (0130);
    `tests/committed-fixture-parse-gate.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files;
    `git grep -nE ",[[:space:]]*,|\{[[:space:]]*," -- '*.theta' '*.thetalib'`
    returns no hit. No committed source moves under any refusal added here.
- **Observed at:** `0.240.0` (HEAD `53cd0d86`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, frontmatter
  `---\nmode: subagent\n---` where a `.theta` body is required; the `.thetalib`
  row passes `path = "lib.thetalib"` with no frontmatter; the `params:` rows
  pass the whole document verbatim. Diagnostic cells are the whole unfiltered
  `doc.diagnostics` in emission order rendered `<severity> <code>: <message>`;
  "registers" is the house definition (no error-severity `theta/parse/` or
  `theta/load/` code), so a `[]` cell registers by construction. Lowerings are
  `lowerQueryResponseSchema(<annotation>, [], [])` and
  `doc.frontmatter.params.loweredSchema` verbatim. Split cells are
  `splitTopLevelSegments` / `topLevelColon` called directly. One scratch vitest
  file over those entry points, run in five rounds on the outputs quoted below,
  then deleted.

## Summary

`ObjectType ::= "{" Field ("," Field)* ","? "}"` (`grammar.md:101`) admits ONE
optional trailing comma and derives no `Field` from an empty slot. A doubled
comma (`{a: integer,,b: string}`), a leading comma (`{,a: integer}`), a comma
after the legal trailing one (`{a: integer,,}`) and a comma-only interior
(`{,}`, `{,,}`) each open a slot spelling no token, and each derives from
nothing.

Every such spelling reports `[]` and registers at all twelve `Type` positions,
including the verbatim `params:` position, a `.thetalib`, inside `array<…>`, at
nested depth and in a union arm (§Reproduction (b)).

`TypeParser.parseObject` reaches the slot and returns from it. Its non-`ident`
field-name-position arm splits on the token's text: a `,` takes the branch that
resets the entry cursor and the refusal latch — the branch's own comment states
the reading, that a skipped separator closes an empty entry rather than opening
one — and bug 0244's keyless-entry emission sits in the `else if` beside it,
which the branch never reaches. Bug 0244 shipped that emission for entries with
at least one token; a slot with none draws nothing.

The consequence is not confined to the missing refusal. At a `let` annotation,
`inlineObjectAnnotationToCompatType` treats the same interior as malformed —
it strips the one legal trailing comma, then requires an `Ident` key in every
remaining segment — and declines to the deferring nominal, so
`let x: {a: integer,,b: string} = 1` reports `[]` where
`let x: {a: integer,b: string} = 1` and the grammar-legal
`let x: {a: integer,} = 1` both draw `theta/parse/let-rhs-type-mismatch`
(§Reproduction (d)). And a comma-only interior lowers the empty-object
fragment: `{,}` produces the bytes `{}` draws
`theta/parse/empty-schema-body` for, and `params:` `p: '{,}'` lowers `p` to the
permissive `{}` where `p: '{}'` is refused (§(f)).

The declaration position already refuses every illegal spelling, and with the
partition `code-registry-parse.md:99` states:
`schema S { a: integer,, b: string }` draws
`theta/parse/malformed-schema-field` (a `Field` derived first) and
`schema S { , a: integer }` / `schema S { , }` draw
`theta/parse/empty-schema-body` (none did), while
`schema S { a: integer, }` — the legal trailing comma — is `[]`
(§(e)). `grammar.md:109` states the inline `Field` is the same form.

## Reproduction

Each cell is the whole `doc.diagnostics` list in emission order.

### (a) The class, the legal subset, and the well-formed control

Each row `fn f(p: <I>): integer { 1 }`.

| # | interior | diagnostics | registers | derives |
|---|---|---|---|---|
| a1 | `{a: integer,,b: string}` | `[]` | yes | no |
| a2 | `{a: integer, ,b: string}` | `[]` | yes | no |
| a3 | `{a: integer,,,b: string}` | `[]` | yes | no |
| a4 | `{,a: integer}` | `[]` | yes | no |
| a5 | `{, a: integer}` | `[]` | yes | no |
| a6 | `{,,a: integer}` | `[]` | yes | no |
| a7 | `{a: integer,,}` | `[]` | yes | no |
| a8 | `{,}` | `[]` | yes | no |
| a9 | `{, }` | `[]` | yes | no |
| a10 | `{,,}` | `[]` | yes | no |
| a11 | `{a: integer,}` | `[]` | yes | **yes** — `","?` |
| a12 | `{a: integer, }` | `[]` | yes | **yes** — `","?` |
| a13 | `{}` | `error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.` | no | no |
| a14 | `{a: integer,b: string}` | `[]` | yes | yes |

a11 and a12 are the legal subset this report does not claim: `grammar.md:101`
spells `","?` and `schemas.md:17` states the trailing comma is optional, so
their `[]` is correct. a7 is the discriminator — one comma past the legal one —
and reports the same `[]`. a8 vs a13 is the sharpest pair: both lower the same
bytes (§(f) rows f6 and f9) and only one is refused.

The split's own view of a11 and a1, measured directly
(`splitTopLevelSegments(<interior text>, ",", "angle-and-brace")`):

| interior text | segments | `topLevelColon` |
|---|---|---|
| `a: integer,,b: string` | `["a: integer", "", "b: string"]` | `1` |
| `,a: integer` | `["", "a: integer"]` | `2` |
| `a: integer,` | `["a: integer", ""]` | `1` |
| `,` | `["", ""]` | `-1` |
| `,,` | `["", "", ""]` | `-1` |
| `a: integer,,` | `["a: integer", "", ""]` | `1` |

An empty segment stands in the split for the legal spelling too, so the split
alone does not divide legal from illegal: the derivable interiors are those
whose every segment but possibly the LAST spells a `Field`, with at least one
`Field` derived.

### (b) The class at twelve `Type` positions

Each cell is the diagnostics list; `[]` registers by construction.

| # | position | `{a: integer,,b: string}` | `{,a: integer}` | `{,}` | control `{a: integer,b: string}` |
|---|---|---|---|---|---|
| b1 | `fn f(p: <I>): integer { 1 }` | `[]` | `[]` | `[]` | `[]` |
| b2 | `fn f(): <I> { 1 }` | `[]` | `[]` | `[]` | `[]` |
| b3 | `schema S { a: <I> }` | `[]` | `[]` | `[]` | `[]` |
| b4 | `schema T = <I>` | `[]` | `[]` | `[]` | `[]` |
| b5 | `let x: <I> \| null = null` | `[]` | `[]` | `[]` | `[]` |
| b6 | `let x: <I> = 1` | `[]` | `[]` | `[]` | `let-rhs-type-mismatch` |
| b7 | `let r = @<<I>>` + backtick body | `[]` | `[]` | `[]` | `[]` |
| b8 | b3 in `lib.thetalib`, no frontmatter | `[]` | `[]` | `[]` | `[]` |
| b9 | `params:` → `p: '<I>'` | `[]` | `[]` | `[]` | `[]` |
| b10 | `schema S { a: { p: <I> } }` | `[]` | `[]` | `[]` | `[]` |
| b11 | `fn f(p: array<<I>>): integer { 1 }` | `[]` | `[]` | `[]` | `[]` |
| b12 | `schema S { a: <I> \| integer }` | `[]` | `[]` | `[]` | `[]` |

`{a: integer, ,b: string}`, `{a: integer,,,b: string}`, `{, a: integer}`,
`{,,a: integer}`, `{a: integer,,}`, `{, }` and `{,,}` were measured at the same
twelve positions and are `[]` in every cell. Row b6 is the only position where
the control carries a line, and it is the row this class withholds (§(d)).

### (c) Bug 0244's emission still fires for the entry BEHIND the slot

Each row `fn f(p: <I>): integer { 1 }`.

| # | interior | diagnostics |
|---|---|---|
| c1 | `{a: integer,,void}` | `error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'` |
| c2 | `{,void}` | `error theta/parse/malformed-schema-field: …` |
| c3 | `{a: integer,,zs}` | `error theta/parse/malformed-schema-field: …` |
| c4 | `{a: integer,,Zs: string}` | `error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _` |
| c5 | `{a: integer,,a: integer}` | `error theta/parse/duplicate-inline-field-name: …` |
| c6 | `{a: integer,,"q": string}` | `error theta/parse/quoted-inline-field-name: …` |
| c7 | `{a: integer,,p: void}` | `error theta/parse/void-in-non-return-position: …` |
| c8 | `{a: {b: integer,,c: string}}` | `[]` |

c1–c3 are the bound: a keyless entry with at least one token behind the slot
draws bug 0244's one line, and the slot itself adds none — c1 and c2 are ONE
line, not two. c4–c7 show every sibling rule intact. c8 is the class at nested
depth, where nothing else in the interior is faulty.

### (d) TYPE-8 withheld at a `let` annotation

| # | source | diagnostics |
|---|---|---|
| d1 | `let x: {a: integer,,b: string} = 1` | `[]` |
| d2 | `let x: {a: integer,b: string} = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected { a: integer, b: string }, got integer` |
| d3 | `let x: {a: integer,} = 1` | `error theta/parse/let-rhs-type-mismatch: … expected { a: integer }, got integer` |
| d4 | `let x: {,a: integer} = 1` | `[]` |
| d5 | `let x: {,} = 1` | `[]` |
| d6 | `let mut x: {a: integer,,b: string} = { a: 1, b: "s" }` then `x = 1` | `error theta/parse/bare-object-literal: …` |
| d7 | `let mut x: {a: integer,b: string} = { a: 1, b: "s" }` then `x = 1` | `error theta/parse/bare-object-literal: …`, `error theta/parse/reassign-rhs-type-mismatch: reassignment of 'x' type mismatch: expected { a: integer, b: string }, got integer` |

d3 is the legal trailing comma converting (`stripOneTrailingComma`), so the
withholding at d1 is caused by the extra comma alone. d6/d7 carry the same
withholding to reassignment; the `bare-object-literal` line in both is the
fixture's own initialiser spelling and does not move.

### (e) The declaration position refuses, with the registry's own partition

| # | source | diagnostics |
|---|---|---|
| e1 | `schema S { a: integer,, b: string }` | `error theta/parse/malformed-schema-field: …` |
| e2 | `schema S { a: integer,, }` | `error theta/parse/malformed-schema-field: …` |
| e3 | `schema S { , a: integer }` | `error theta/parse/empty-schema-body: 'S' has no fields; …` |
| e4 | `schema S { , }` | `error theta/parse/empty-schema-body: 'S' has no fields; …` |
| e5 | `schema S { a: integer, }` | `[]` |
| e6 | `fn f(p: {a: integer,, b: string}): integer { 1 }` | `[]` |
| e7 | `fn f(p: {, a: integer}): integer { 1 }` | `[]` |
| e8 | `import { a, , b } from "./lib.thetalib"` in `lib2.thetalib` | `error theta/parse/import-malformed-specifier-list: …`, `error theta/parse/thetalib-top-level-statement: …` |
| e9 | `import { , a } from "./lib.thetalib"` in `lib2.thetalib` | `error theta/parse/import-malformed-specifier-list: …`, `error theta/parse/thetalib-top-level-statement: …` |

e1/e6 and e3/e7 are the position asymmetry over one `Field` form
(`grammar.md:109`). e5 fixes the legal spelling at the declaration position
too. e1–e4 also fix the disposition the inline position owes: a `Field` derived
before the slot is `malformed-schema-field`, no `Field` derived is
`empty-schema-body`, exactly the partition `code-registry-parse.md:99` states.
The second line in e8/e9 is the fixture's own trailing statement in a
`.thetalib`; the first is bug 0211's landed refusal of the same shape in a
sibling list construct.

### (f) What lowers, and what reaches the provider

`lowerQueryResponseSchema(<annotation>, [], [])`, and for `params:`
`doc.frontmatter.params.loweredSchema` verbatim.

| # | annotation | lowered |
|---|---|---|
| f1 | `{a: integer,,b: string}` | `{"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false}` |
| f2 | `{a: integer,b: string}` | same bytes as f1 |
| f3 | `{,a: integer}` | `{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false}` |
| f4 | `{a: integer,,}` | same bytes as f3 |
| f5 | `{a: integer,}` | same bytes as f3 |
| f6 | `{,}` | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` |
| f7 | `{, }` | same bytes as f6 |
| f8 | `{,,}` | same bytes as f6 |
| f9 | `{}` | same bytes as f6 (and refused, §(a) row a13) |
| f10 | `params:` → `p: '{a: integer,,b: string}'` | `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_9b890568745f5ea5"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_9b890568745f5ea5":{"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false}}}` |
| f11 | `params:` → `p: '{a: integer,b: string}'` | same bytes as f10, same `__inline_9b890568745f5ea5` slug |
| f12 | `params:` → `p: '{,}'` | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| f13 | `params:` → `p: '{}'` | `null` (the document is refused, §(a) a13) |

f1/f2 and f10/f11 are the bound at the wire: a mixed interior lowers exactly
what its well-formed byte-neighbour lowers, down to the `$defs` slug, so no
property is lost or renamed. f6–f9 and f12/f13 are the harm: a comma-only
interior lowers the fragment `theta/parse/empty-schema-body` exists to refuse —
whose registry text calls it a shape that "would silently accept every object"
(`schemas.md:19`) — and at `params:` lowers `p` to the permissive `{}`, an
unconstrained parameter, with no diagnostic.

## Expected behaviour

An interior derives from `ObjectType` (`grammar.md:101`) only when every
top-level segment but possibly the last spells a `Field` and at least one
`Field` derives. Specifically:

1. Every cell of §Reproduction (a) rows a1–a10, of §(b)'s first three columns
   and of §(e) rows e6–e7 carries at least one error-severity diagnostic, and
   the theta does not register.
2. The legal subset is unmoved: §(a) rows a11–a12, §(e) row e5, §(d) row d3 and
   §(f) row f5 keep exactly today's values.
3. The disposition follows the partition `code-registry-parse.md:99` states and
   the declaration position implements (§(e) e1–e4): an interior in which a
   `Field` derived before the offending slot draws
   `theta/parse/malformed-schema-field`; one in which none did (`{,}`, `{,,}`,
   `{,a: integer}`) draws `theta/parse/empty-schema-body`.
4. One line per offending slot (bug 0129's count-consequence law,
   `code-registry-parse.md:104`), and a slot standing beside an entry that
   already draws its own refusal does not add a second to that entry: §(c) rows
   c1–c3 stay ONE line.
5. The disposition holds at all twelve positions of §(b), inside a generic
   argument (b11), at nested depth (b10, §(c) c8), in a union arm (b12), in a
   `.thetalib` (b8) and at the verbatim `params:` position (b9).
6. No comma-only interior lowers the fragment `theta/parse/empty-schema-body`
   refuses (§(f) f6–f8), and no `params:` field lowers to a permissive `{}`
   from this shape (f12).

## Actual behaviour / root cause

`TypeParser.parseObject`'s field loop runs while the next token is neither
absent nor `}`. A field-name position holding a non-`ident` token takes one
arm, and that arm splits on the token's text. When the text is `,` it takes the
`if (fieldName?.text === ",")` branch, which sets `entryStart = this.pos + 1`
and `entryRefused = false` — its comment states the reading: "A skipped `,` at
a field-name position closes an EMPTY entry rather than opening one" — and then
falls through to `entryTainted = fieldName?.text !== ","` (false),
`this.next()`, `continue`. Bug 0244's emission is the `else if
(!entryRefused && this.entryQualifiesForRefusal(entryStart, interiorStart))`
branch beside it, so `classifyEntry` is never consulted for this slot and no
diagnostic is buffered.

No grammar-legal spelling reaches that branch. A well-formed entry ends at the
loop's `if (!this.eatPunct(","))`: the legal trailing comma is consumed there,
the loop condition then sees `}` and exits, and the branch is never entered.
Every entry into the branch is therefore an undecidable slot — a leading comma,
a comma doubled between two entries, or a comma past the legal trailing one.

Downstream nothing recovers it. `inlineObjectFieldKeys` reads the whole
`interiorSource` but `continue`s on a segment whose `topLevelColon` is `-1`, and
the empty segment is exactly such a segment (§Reproduction (a), the split
table); `TypeNode.fieldNames` and `fieldTypes` were never written for it. The
same split keys `hoistInlineObjectType` and `lowerInlineObject`, so the slot
contributes no property — which is why a mixed interior lowers its
well-formed neighbour's bytes and a comma-only interior lowers the empty-object
fragment rather than a corrupted one.

`theta/parse/empty-schema-body` does not catch the comma-only interior either.
Its inline gate is `TypeNode.interiorHasTokens`, computed as
`this.peek() !== undefined && this.peek()?.text !== "}"` before the loop runs;
`{,}` spells a comma, so the interior has tokens and the row withholds.

At a `let` annotation the same interior is judged malformed by the other layer.
`inlineObjectAnnotationToCompatType` strips the one legal trailing comma
(`stripOneTrailingComma`), splits the rest, and returns `undefined` for any
segment whose pre-colon text fails `/^[A-Za-z_][A-Za-z0-9_]*$/` — the empty
segment does. `convertAnnotation` then falls back to `{kind: "named", name:
<annotation text>}`, a deferring nominal, and TYPE-8 has no field set to
compare, so `let-rhs-type-mismatch` and `reassign-rhs-type-mismatch` are
withheld (§Reproduction (d)). The annotation text is brace-carrying, which the
brace exemption at `code-registry-parse.md:106` keeps out of
`theta/parse/annotation-type-not-expression`, so nothing is emitted in its
place.

## Why it matters

The theta registers and runs with source no production derives. `fn f(p: {a:
integer,,b: string}): integer { 1 }` loads clean, and so do `{,a: integer}`,
`{a: integer,,}` and `{,}`, at all twelve `Type` positions including
`params:`.

A second, silent consequence follows at a `let` annotation: one extra comma
turns the static check off. `let x: {a: integer,,b: string} = 1` reports
nothing where both `let x: {a: integer,b: string} = 1` and the legal
`let x: {a: integer,} = 1` report the initialiser mismatch, so the typo does
not merely go unreported — it suppresses a report the author would otherwise
get about a different mistake.

At the wire, a comma-only interior lowers the permissive fragment. `params:`
`p: '{,}'` lowers `p` to `{}` — every value accepted — where `p: '{}'` is
refused for producing those exact bytes.

The inline and declaration positions disagree on one `Field` form that
`grammar.md:109` states is the same, and the disagreement is one-sided: the
declaration position refuses each illegal spelling with the partition the
registry states, and the inline position admits all of them. The registry's own
row already claims the inline reach: `code-registry-parse.md:99` says the loop
refuses each keyless entry its walk reaches, lists three exclusions, and the
empty slot is keyless, reached, and in none of them.

## Non-goals

- The grammar-legal trailing comma. `{a: integer,}` and `{a: integer, }` derive
  from `ObjectType`'s `","?` and must keep reporting `[]` (§(a) a11–a12, §(e)
  e5, §(d) d3, §(f) f5).
- The empty TYPE position (`{a: }`, `{a:}`), which is bug 0237's §Fix
  residual 1.
- A keyless entry with at least one token (`{void}`, `{a: integer, Zs}`), which
  bug 0244 closed at 0.238.0 — the emission this report extends.
- A keyless entry carrying a stray depth-0 close token, which keeps bug 0238's
  silent tolerant registration, and a colon-PRESENT entry with a junk tail,
  which stays bug 0252's business at an annotation and the tolerant skip
  elsewhere. Both are 0244's adjudicated carve-outs; no interior measured here
  carries either shape.
- An entry stranded behind the field loop's exit on a missing entry separator
  (`array<{a: b c, d e}>`), bug 0244's §Fix residual 1 and its witness group
  (K), filed as
  [0256](./0256-generic-argument-stranded-entry-registers-permissive.md).
  Every interior measured here spells an entry separator between every pair of
  entries, so no cell above reaches that exit.
- The same separator-degenerate shape in other list constructs. Measured at
  HEAD and outside this report: a generic argument list
  (`array<integer,,>` → `[]`), a named object literal (`S { a: 1,, b: "x" }` →
  `[]`), an array literal (`[1,,2]` → `[]`), an inline `enum[...]`
  (`enum["a",,"b"]` → `[]`), a `tools:` scalar (`"a,,b"` → `[]`) and a call
  argument list (`g(1,,)` → `[]`). Each needs its own measurement and its own
  filing; none is claimed here.

## Fix

Emit in the arm that tolerates the slot: in `TypeParser.parseObject`'s
non-`ident` field-name-position arm, the `if (fieldName?.text === ",")` branch
buffers one error-severity diagnostic for the slot the comma opens, through the
same `pending` buffer and closing-brace flush gate bug 0244 built, before
resetting the entry cursor and the refusal latch. The emission belongs there
and not at `walkType` or in the key split: the slot is absent from
`fieldNames`, from `fieldTypes` and from `inlineObjectFieldKeys`' output, so no
later pass holds it, and widening `topLevelColon`'s key rule to mint a key for
an empty segment would move the four raw-key rows and both lowerers keyed on
the same split (bug 0159's by-construction agreement).

Binding on the fix:

- **Ordering.** This extends bug
  [0244](./0244-colon-less-inline-object-entry-silently-discarded.md)'s landed
  emission machinery (`pending`, `entryStart`, `entryRefused`,
  `entryQualifiesForRefusal`, the closing-brace flush) and must not be
  attempted independently of it. 0244 is fixed at 0.238.0, so the dependency is
  satisfied at HEAD; the fix reuses that machinery rather than adding a second
  buffer.
- **The legal subset is a hard bound.** `ObjectType`'s `","?`
  (`grammar.md:101`, `schemas.md:17`) makes `{a: integer,}` and
  `{a: integer, }` derivable, and the loop's `eatPunct(",")` path means no
  legal spelling reaches the branch today. The fix states that reachability
  argument and pins it: §(a) a11–a12, §(e) e5, §(d) d3, §(f) f5 are unmoved
  cells, re-derived and not weakened.
- **The registry disposition is REUSE, and the partition is stated.** No mint.
  A slot behind at least one derived `Field` draws
  `theta/parse/malformed-schema-field` (`code-registry-parse.md:99`); a slot
  with no `Field` derived before it — `{,}`, `{,,}`, `{,a: integer}` — draws
  `theta/parse/empty-schema-body` (`:98`), which is the partition sentence the
  same row already states and the declaration position already implements
  (§(e) e1–e4). Row 99's inline clause is amended to name this class inside its
  stated reach rather than leaving it to a fourth unstated exclusion; row 98's
  Trigger is amended to cover the inline comma-only interior beside `{}`. The
  amendment is mirrored where 0244 mirrored its own: `docs/spec_topics/grammar.md`
  §"Inline object types", `docs/reference/grammar.md`'s `ObjectType` bullet and
  `docs/reference/schema-subset.md`. `docs/reference/diagnostics.md` needs no
  edit (code / severity / phase / Message only, and no Message changes); nor
  does `tests/fixtures/h7a/permitted-codes.json` (no `theta/parse/` code).
- **The count law, and the `{,,}` count.** One line per offending slot, and a
  slot beside an entry that already draws its own refusal adds nothing to that
  entry (§(c) c1–c3 stay one line). `{,,}` spells three empty segments and two
  commas; the fix states which count it emits and pins it at a cell rather than
  leaving it to be discovered.
- **The `let`-annotation layer.** Refusing the document makes §(d) d1/d4/d5
  carry an error-severity line. Whether TYPE-8's own row then also fires is
  the fix's call to state: the honest floor is that
  `inlineObjectAnnotationToCompatType` keeps declining (it already reads the
  slot as malformation) and the parse refusal stands alone, one line for one
  written mistake, consistent with bug 0129's law. Either way the divergence
  between the two layers' verdicts on one interior is recorded as closed or
  kept, explicitly.
- **Reach.** Every cell of §(b)'s first three columns, §(a) a1–a10, §(e)
  e6–e7 and §(c) c8's interior carries an error-severity diagnostic and does
  not register, at all twelve positions, inside `array<…>`, at nested depth, in
  a union arm, in a `.thetalib` and at `params:`.
- **What must not move.** §(a) a11–a14 and a13's single line, §(b)'s control
  column, §(c)'s every cell (c1–c3 at ONE line, c4–c7 unchanged), §(d) d2, d3,
  d7, §(e) e1–e5, e8, e9, §(f) f1, f2, f5, f10, f11 (including the
  `__inline_9b890568745f5ea5` slug), and the witness locks named in §Affected —
  re-derived, not weakened. Bug 0244's witness
  (`tests/inline-object-keyless-entry-refusal.test.ts`) has no cell for this
  class, so a cell it flips is a finding to state, not an expected additive
  change; bug 0238's and bug 0252's witnesses take zero flips.
- **Witness.** One new test file over `parseDoc`, `lowerQueryResponseSchema`,
  `doc.frontmatter.params.loweredSchema` and `splitTopLevelSegments` /
  `topLevelColon`, carrying §Reproduction (a)–(f) with every control column,
  the twelve positions, the legal subset as its own fence group, and the
  no-move cells above. Bug 0244's witness gains cells for this class in the
  same change, or the new file states why it does not. Live cover is owed only
  if the refusal changes what reaches a provider-facing schema — §(f) f12 says
  it does, by refusing the document that produced it.

## Provenance

Filed as the forward filing of bug 0244's §Fix *Residuals* item 2
(`docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:670`),
which recorded `{a: integer,,b: string}` and `{,}` reporting `[]` before and
after that change and stated that no cell of its §Reproduction claims them; the
same residual is item 3 of that run's filing material
(`.pi/tmp/fixes/0244-report-resumed.md`, "Also filing material").

Independently re-derived at HEAD `53cd0d86` (0.240.0): one scratch vitest file
over `parseDoc` (`tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`
(`src/runtime/query-schema-lowering.ts`),
`doc.frontmatter.params.loweredSchema`, and `splitTopLevelSegments` /
`topLevelColon` (`src/parser/params.ts`), run in five rounds covering
seventeen interiors at the twelve `Type` positions of §(b), the fourteen rows
of §(a) with the split table, the eight bound rows of §(c), the seven rows of
§(d), the nine rows of §(e) and the thirteen lowerings of §(f); plus the corpus
census over `git ls-files -- '*.theta' '*.thetalib'` (34 files, no hit for
`,[[:space:]]*,` or `\{[[:space:]]*,`). The scratch file was deleted.

Ownership checked at HEAD: bug 0244's emission is fixed (0.238.0) and does not
reach a zero-token slot, which its own residual 2 states; 0237's subject is the
empty TYPE position; 0238's and 0252's classes are 0244's adjudicated
carve-outs and neither covers this shape; 0211 is fixed (0.150.0) and its
subject is `import` / `export` specifier lists. No open report claims an empty
inline-object entry slot.

Two facts beyond 0244's residual are added by this measurement: the class also
withholds TYPE-8's `let-rhs-type-mismatch` and `reassign-rhs-type-mismatch`,
because `inlineObjectAnnotationToCompatType` reads the same slot as
malformation and declines to the deferring nominal while the parser admits it
(§(d)) — and the declaration position already implements the exact partition
the inline position owes, refusing `schema S { a: integer,, b: string }` with
`malformed-schema-field` and `schema S { , }` with `empty-schema-body` while
leaving the legal `schema S { a: integer, }` clean (§(e)).

Bug 0244's new witness does NOT pin this class: a search of
`tests/inline-object-keyless-entry-refusal.test.ts` for a doubled, leading or
lone comma returns no hit, and its RESIDUAL FENCE group (K) pins the OTHER
unfixed residual (an entry stranded behind the field loop's exit). This class
is unfenced at HEAD.

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.

## Fix (0.258.0)

- **Re-measurement at HEAD `206e0da9` (0.251.0, bug 0256 landed in the SAME
  field loop).** Every cell of §Reproduction (a)–(f) was re-derived before any
  edit. NO cell moved: bug 0256's resync-and-tolerate ruling changed the
  entry-SEPARATOR read, and every interior this report measures spells a
  separator between every pair of entries, so 0256's resync is never reached
  from them (§Non-goals already states this). All twelve §(b) positions still
  report `[]` for the three subject columns; §(c) c1–c8, §(d) d1–d7, §(e)
  e1–e9 and §(f) f1–f13 reproduce byte-identically. ONE filed cell was
  corrected, and by the fixture rather than by 0256: §(e) e8/e9 draw ONE
  `theta/parse/import-malformed-specifier-list` line, not two — the second line
  in the filing was that fixture's own trailing `.thetalib` statement. The
  attribution for every cell is therefore "unmoved by 0256"; no cell is
  discharged to it.
- **A stale quotation in the report, corrected.** §(f)'s rationale cites
  `docs/spec_topics/schemas.md:19` as calling the empty-object fragment a shape
  that "would silently accept every object". Bug
  [0094](./0094-schemas-md-closed-fragment-rationale-inverted.md) (0.248.0)
  rewrote exactly that clause: line 19 of `docs/spec_topics/schemas.md` still
  resolves to the same `theta/parse/empty-schema-body` rule, but now states
  that the lowered fragment "accepts only the empty object `{}` and rejects
  every non-empty object". The RULE the report leans on is unchanged and the
  §(f) f12 harm stands on its own measurement (a `params:` field lowering to a
  bare `{}` fragment IS unconstrained), so nothing shipped here repeats the
  retired wording.
- **What shipped:**
  - `src/parser/type-grammar.ts` — `TypeParser.parseObject`'s
    `if (fieldName?.text === ",")` branch now buffers ONE error-severity
    diagnostic for the slot the comma opens, through bug 0244's existing
    `pending` buffer and closing-brace flush gate, before resetting the entry
    cursor and the refusal latch. Five clauses, all local to that call's own
    state (no new module state, no second buffer):
    - **SL1** one buffered line per slot, flushed only under the existing
      `closingBraceToken !== undefined` gate, so an interior that never closes
      still emits nothing (bug 0232's class unflipped).
    - **SL1a** a comma OPENS a slot only when no token has yet been consumed
      for the current entry (`this.pos === entryStart`) — the report's own
      definition, an entry "spelling NO token". A comma reached after tokens
      were consumed is the ordinary separator ending an entry this arm was
      already discarding one token at a time, and draws nothing: that keeps
      bug 0238's stray-close class (`{b >, m: integer}`) and bug 0252's
      colon-present class exactly where they were.
    - **SL2** the partition `code-registry-parse.md:99` already states and the
      declaration position already implements (§(e) e1–e4): a `Field` derived
      earlier in this interior ⇒ `theta/parse/malformed-schema-field` (0244's
      `discardedEntryRefusal`); none ⇒ `theta/parse/empty-schema-body`
      rendered with the anonymous `{}` subject
      (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:55`). No mint.
    - **SL3** `empty-schema-body` is a per-INTERIOR verdict — "'`<X>`' has no
      fields" cannot be true twice of one interior — so it is buffered at most
      once per interior. `{,,}` draws ONE line (the count §Fix asked to be
      pinned rather than discovered).
    - **SL4** `malformed-schema-field` is a per-FIELD row: one line per
      offending slot. `{a: integer,,,b: string}` draws TWO.
    - **SL5** adjacency collapse (bug 0129's count law,
      `code-registry-parse.md:104`): an entry standing IMMEDIATELY behind a
      slot that itself qualifies for 0244's keyless refusal draws that refusal
      ALONE — its line REPLACES the slot's rather than joining it — so §(c)
      c1–c3 stay at ONE line and keep their filed code.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — row 98's Trigger
    covers the inline no-`Field`-derived-yet slot beside `{}` (with SL3's cap
    and its `{,,}` example); row 99's inline clause names the slot as a third
    shape inside its stated reach (with SL4's `{a: integer,,,b: string}`
    example and SL5's replace-not-join rule). Both rows' Messages are
    unchanged.
  - `docs/spec_topics/grammar.md` §"Inline object types",
    `docs/reference/grammar.md`'s `ObjectType` bullet and
    `docs/reference/schema-subset.md` — the same rule, mirrored where bug 0256
    mirrored its own.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — the `<X>`
    anonymous-inline carve-out widened by one clause to cover the slot that
    renders the same literal `{}`.
  - `docs/reference/diagnostics.md` and `tests/fixtures/h7a/permitted-codes.json`
    — untouched, as §Fix requires (no mint, no Message change; verified
    byte-unchanged).
- **The reachability bound, re-derived and pinned.** No grammar-legal spelling
  reaches the branch: a well-formed entry's trailing comma is consumed by the
  loop's own `eatPunct(",")` and the loop then exits on `}`. §(a) a11–a12,
  §(e) e5, §(d) d3 and §(f) f5 are unmoved, each fenced as its own group in the
  witness.
- **The `let`-annotation layer: divergence KEPT, explicitly.**
  `inlineObjectAnnotationToCompatType` is untouched and keeps declining the
  interior as malformation; the parse refusal stands alone, so §(d) d1/d4/d5
  each carry exactly ONE line and TYPE-8's own row does not additionally fire.
  That is §Fix's stated honest floor — one line for one written mistake, bug
  0129's law — and the two layers' verdicts on one interior now AGREE in
  direction (both refuse) while the conversion's own deferral is unchanged.
- **Gates** (all re-run by the orchestrator after the last edit):
  - Witness RED before / GREEN after, proven by neutralisation: with
    `src/parser/type-grammar.ts` reverted to its HEAD blob `55204fc7`,
    `npx vitest run tests/inline-object-empty-entry-slot-refusal.test.ts`
    → `Tests 7 failed | 5 passed (12)`, every red the refusal MISSING; restored
    by writing the saved bytes back (`git hash-object` `5061496c` before and
    after the neutralisation — byte-exact), re-run → `12 passed (12)`.
  - `npm test` → `Test Files 430 passed (430)`, `Tests 9072 passed (9072)`.
  - `npm run typecheck` → clean, exit 0. `npm run lint` → clean, exit 0.
  - Live, run by the orchestrator under the exclusive lock, RC=0 each:
    `tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts`
    → `1 passed`; and the enumerated blast-radius surfaces in one run —
    `b0256live`, `b0244live`, `b0252live`,
    `inline-object-stray-close-token-live-cell` (0238) and
    `inline-object-malformed-entry-resync-live-cell` (0231) → `5 passed`.
- **Review:** 1 round — `bug-fix-reviewer`, verdict CLEAN, zero findings; two
  non-blocking residuals raised (both since pinned as cells, see Residuals).
- **Verification:** verified. Witness reds without the fix and greens with it
  (byte-exact restore proven by hash); default suite green; lint and typecheck
  clean; the live cell audited as non-vacuous end-to-end coverage of the fixed
  path (offender absent from the real registered set, byte-neighbour control
  registers and drives a real turn, task-framed 263+514 oracle, fail-loud on a
  missing provider); zero flips in all six witness locks; `permitted-codes.json`
  byte-unchanged; `docs/reference/grammar.md` still 701 lines and
  `docs/spec_topics/grammar.md` still 223, so no citation shifted.
- **Tests that lock it:**
  - `tests/inline-object-empty-entry-slot-refusal.test.ts` — the new witness,
    twelve groups over `parseDoc`, `lowerQueryResponseSchema`,
    `frontmatter.params.loweredSchema` and `splitTopLevelSegments` /
    `topLevelColon`: 92 whole-list diagnostic cells, 14 lowering cells, 6 split
    observables. Carries §(a)–(f) with every control column, the twelve
    positions, the legal subset as its own fence group, the split fence, the
    registry-REUSE fence and the slot-composition group.
  - `tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts` — the
    registration-outcome cell at the verbatim `params:` position, mirroring
    `b0256live`'s shape.
- **Residuals:**
  1. **A slot following an SL5-collapsed run before any `Field` draws nothing.**
     `{,void,,x: integer}` reports exactly ONE `malformed-schema-field`: slot 1
     buffers `empty-schema-body`, `void` collapses it per SL5, and the second
     slot buffers nothing because SL3's per-interior cap already fired. This is
     inside the shipped rule's letter (buffered once, then replaced) and the
     document is refused either way, so no silent registration survives. Pinned
     as a cell in the witness's slot-composition group rather than left to be
     discovered.
  2. **`{a: ,,b: string}` and `{a: ,,}` route to `empty-schema-body`.** SL2's
     test is a DERIVED `Field`, and bug 0237's empty TYPE position derives none
     (`parseUnion` yields `undefined`), so a slot behind `a: ` is judged as
     though no field preceded it. It is the same disposition the settled
     partition already gives `{,a: integer}` (§(e) e3's declaration analogue),
     the inputs flip from `[]`-and-registering to refused, and the empty TYPE
     position itself stays bug 0237's §Fix residual 1. Pinned as cells, with the
     non-slot control `{a: ,b: string}` fenced at its unchanged `[]`.
  3. **Two cells in other files were re-derived, strictly additively** — see
     "Adjudications on the record" below.
  4. **§Non-goals unchased and unmeasured-by-this-fix:** `array<integer,,>`,
     `S { a: 1,, b: "x" }`, `[1,,2]`, `enum["a",,"b"]`, `tools: "a,,b"`,
     `g(1,,)` each still register silently. Each needs its own filing.
- **Adjudications on the record** (the `question` tool is unavailable in this
  lane; both are stated here rather than left invisible):
  1. *Question that would have been asked:* "§Fix's §(c) note says c4–c7 are
     'unchanged', but §Expected behaviour 1 and 5 require the class to be
     refused at every position — does the slot's line ADD beside those cells'
     existing sibling-rule line, or is it withheld?" *Decision:* it ADDS.
     Evidence: (i) §Expected behaviour 1 and 5 demand an error-severity
     diagnostic for the class at all twelve positions; (ii) the alternative
     rule — withhold whenever any LATER pass fires on the interior — is not
     computable at the parser arm §Fix names, since `binding-case-mismatch` and
     the raw-key rows run over `interiorSource` after `parseObject` returns;
     (iii) §Fix's own count law scopes the collapse to "an entry that already
     draws its OWN refusal", which is 0244's keyless refusal (c1–c3), not a
     different row's line. The cells' existing lines are retained in place and
     order; nothing is displaced.
  2. *Question that would have been asked:* "Two test files outside §Fix's named
     surface pin the pre-fix silence for inputs INSIDE this report's class —
     may their expectations be re-derived?" *Decision:* yes, bounded to exactly
     two cells. Evidence: (i) §Fix "What must not move" binds the §Affected
     witness locks as "re-derived, not weakened", and an ADDED error line is a
     re-derivation, not a weakening; (ii) both inputs are this report's own
     class — `let x: {a: integer,,} = 1` is §(a) a7 at §(b) b6, and
     `schema S { a: { , Bad: string } }` / `{ b: string,, Bad: string }` are the
     leading- and doubled-comma spellings at nested depth (§(b) b10); (iii) each
     cell's stated intent survives intact — e7.6 measures that the CONVERSION
     still declines (it does; no TYPE-8 line renders), and h10 measures that the
     name behind an empty entry still reaches the case rule (it does; `bcm(...)`
     is retained). *Bound:* `tests/let-annotation-inline-object-compat.test.ts`
     cell e7.6 and `tests/inline-object-field-name-case.test.ts` cell h10, two
     cells, both additive, no assertion removed and no code changed. *Stop
     valve declared and not tripped:* had a third test file redded, or had any
     flip dropped or re-coded a pre-existing line, the run would have stopped
     and reported instead. The full suite is green with no other file touched.
- **Discharge notes appended to sibling docs:** none. Bug 0256's landed cells
  are unflipped (its witness and its live cell both green), so it needs no note.
- **Pinned dispositions / non-goals:** the grammar-legal trailing comma stays
  admitted (`grammar.md:101`'s `","?`); bug 0238's stray-close class and bug
  0252's colon-present class keep their tolerant dispositions (SL1a is what
  keeps them); bug 0237's empty TYPE position stays its own residual;
  `inlineObjectAnnotationToCompatType`'s decline is KEPT, not closed; the
  cross-position empty-slot tolerance in other list constructs is unclaimed.

# Bug 0244 — an inline object entry that spells no top-level `:` is discarded by `TypeParser.parseObject`'s resync and is invisible to every rule: `{a: ,void}` and `{a: integer,void}` both report `[]` and register at twelve `Type` positions, the entry reaches neither `fieldNames`/`fieldTypes` (the resync consumes it) nor `inlineObjectFieldKeys` (no top-level colon, no key), so the eight refusals the same entry draws once a `:` is added — `void-in-non-return-position`, `generic-arity-mismatch`, `empty-schema-body`, `binding-case-mismatch` and all four raw-key rows — are withheld, and `{void}` lowers the byte-identical fragment `{}` draws `theta/parse/empty-schema-body` for

- **Status:** fixed (0.238.0).
- **Sev/Diff estimate:** S2/D2 — S2 because the theta LOADS AND REGISTERS with
  zero diagnostics on any channel while junk stands at a `Type` position:
  `fn f(p: {a: integer, array<integer, integer>}): integer { 1 }` reports `[]`,
  and the harm is bounded to what the discarded entry itself would have drawn —
  every sibling entry that does spell `Ident ":"` keeps its verdict
  (§Reproduction (a) rows a4–a5), so no well-formed field is starved and no key
  the case rule refuses reaches the wire from this shape. D2 because the site
  is one already-existing recovery arm (`TypeParser.parseObject`'s
  `skipMalformedEntry` call behind the colon gate) and the registry disposition
  has a stated precedent at the declaration position
  (`theta/parse/malformed-schema-field`, `schemas.md:19`), but the fix must
  reach a key the raw-key rules structurally cannot see and must not move bug
  0231's four locked witnesses.
- **Kind:** defect — implementation, one recovery arm, two consequences.
  1. **The entry is consumed with no record.** `TypeParser.parseObject`'s field
     loop reads an `ident` at a field-name position and requires `:` behind it.
     When `this.eatPunct(":")` fails it calls `TypeParser.skipMalformedEntry`,
     which advances to this interior's next depth-0 `,` (or returns at a
     depth-0 `}` / `>`) and continues the loop. That is bug
     [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md)'s
     landed resync, and it does what 0231 asked: siblings behind the entry
     survive. Nothing emits for the entry the skip swallowed. A field-name
     position holding a non-`ident` token takes the neighbouring arm
     (`entryTainted = …; this.next(); continue;`) and is discarded the same way.
  2. **The raw-key rules structurally cannot see it.**
     `inlineObjectFieldKeys` splits `TypeNode.interiorSource` on top-level
     commas and keys each entry on its text before that entry's own top-level
     `:` (`topLevelColon`, `src/parser/params.ts`); its own doc comment states
     the exclusion — "An entry with no top-level `:` contributes no key". The
     four raw-key rows (`duplicate-inline-field-name`,
     `quoted-inline-field-name`, `renamed-inline-field-name`,
     `inline-field-name-not-identifier`) are the rules that survived 0231's
     truncation precisely because they read the raw interior, and they are
     blind to exactly this entry shape. So the entry is in no consumer: not
     `fieldNames`, not `fieldTypes`, not the key split. Adding a `:` to the
     same entry text turns every one of eight registered rows on
     (§Reproduction (c)).
- **Related:**
  - [0237](./0237-empty-inline-field-type-truncates-interior.md) — **fixed
    (0.207.0)**, the immediate origin. Its §Fix *Residuals* item 4 records
    `{a: integer,void}` drawing nothing on any channel in both trees and names
    it "bug 0231's class, surfaced by residual row `{a: ,void}` above rather
    than introduced here", leaving it unfiled. This report is that filing. The
    seed row is re-derived at HEAD: `{a: ,void}` and its control
    `{a: integer,void}` are `[]` at every position measured
    (§Reproduction (a), (b)).
  - [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) —
    **fixed (0.189.0)**, whose resync is the discard site here. Its subject was
    the SIBLINGS behind a malformed entry, not the entry itself: its witness
    pins the malformed entry's own line for the four spellings that DO carry a
    colon (`{a b: integer, …}`, `{"q": string, …}`, `{3: string, …}`,
    `{w as "x": integer, …}`). A colon-less entry has no such line to pin, and
    the report does not claim one. That witness,
    `tests/inline-object-malformed-entry-resync.test.ts`, is a lock here.
  - [0233](./0233-generic-argument-inline-field-key-rules-withheld.md) —
    **fixed (0.196.0)**, the widen that carried the four raw-key rules into a
    generic argument's interior. It does not reach this shape either, for the
    same reason: the widen changed where the key split is consulted, not which
    entries yield a key (§Reproduction (b) row b11).
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) —
    **fixed (0.165.0)**, whose lowercase-first pass over `TypeNode.fieldNames`
    is one of the eight rules withheld: `{a: integer, Zs}` draws nothing where
    `{a: integer, Zs: string}` draws `theta/parse/binding-case-mismatch`
    (§Reproduction (c) row c6).
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) —
    **fixed**, the count-consequence law any refusal added here satisfies: the
    refused entry draws one error-severity line and no second
    (`code-registry-parse.md:103`, "A field this row refuses draws no other
    error-severity diagnostic on that field").
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for positional drift in `src/parser/type-grammar.ts`
    citations. Every `type-grammar.ts` and `params.ts` citation below is by
    SYMBOL for that reason (`docs/STYLE.md` §Citations).
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0):
  - **The discard site** — `src/parser/type-grammar.ts`:
    `TypeParser.parseObject`'s field loop, its colon gate
    `if (!this.eatPunct(":"))` and the `this.skipMalformedEntry()` /
    `entryTainted = false` / `continue` behind it; the non-`ident`
    field-name-position arm beside it (`entryTainted = fieldName?.text !== ","`,
    `this.next()`, `continue`); and `TypeParser.skipMalformedEntry` itself, the
    brace-and-angle-aware advance to the next depth-0 `,`.
  - **The consumers that never see the entry** —
    `TypeNode.fieldNames` and `TypeNode.fieldTypes` (`src/parser/type-grammar.ts`),
    read by `walkType`'s case pass over `node.fieldNames` and its field descent
    `for (const fieldType of node.fieldTypes)`; and `inlineObjectFieldKeys`
    (same file), whose doc comment states the colon-less exclusion, over the
    split `splitTopLevel(interiorSource, ",", "angle-and-brace")` and
    `topLevelColon` (both `src/parser/params.ts`).
  - **The lowerers keyed on the same split** — `hoistInlineObjectType`
    (`src/parser/params.ts`), `lowerInlineObject`
    (`src/parser/body-type-lowering.ts`) and `lowerQueryResponseSchema`
    (`src/runtime/query-schema-lowering.ts`): a colon-less entry contributes no
    property, so an interior whose every entry is colon-less lowers the empty
    object fragment (§Reproduction (e)).
  - **The registered rows withheld** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`
    (`theta/parse/binding-case-mismatch`), `:65`
    (`theta/parse/generic-arity-mismatch`), `:66`
    (`theta/parse/void-in-non-return-position`), `:98`
    (`theta/parse/empty-schema-body`), `:100`
    (`theta/parse/duplicate-inline-field-name`), `:101`
    (`theta/parse/quoted-inline-field-name`), `:102`
    (`theta/parse/renamed-inline-field-name`), `:103`
    (`theta/parse/inline-field-name-not-identifier`).
  - **The declaration-position precedent** —
    `docs/spec_topics/schemas.md:19` ("a field name with no following `:` — is
    `theta/parse/malformed-schema-field`") and its registry row
    `code-registry-parse.md:99`, which is what
    `schema S { a: integer, void }` draws today (§Reproduction (d)).
  - **The contract** — `docs/spec_topics/grammar.md:101`
    (`ObjectType ::= "{" Field ("," Field)* ","? "}"`), `:109` (§"Inline object
    types" — the inline `Field` reuses the object-schema `Field` form in any
    `Type` position and at any depth); `docs/spec_topics/schemas.md:17`
    ("Field names are identifiers; field types are any expression from the Type
    System grammar"), which admits no entry without a type;
    `docs/spec_topics/lexical.md:13` and `:16` (`Ident`, and the lowercase-first
    rule stated of each field name). Mirror: `docs/reference/grammar.md:225`,
    `:238`.
  - **The witness locks** —
    `tests/inline-object-malformed-entry-resync.test.ts` (bug 0231's witness,
    64 diagnostic-list cells, LEDGER at `:95`);
    `tests/inline-object-empty-field-type-truncation.test.ts` (bug 0237's
    witness, which pins `{a: integer,void}` and `{a: ,void}` at their current
    values);
    `tests/generic-argument-inline-field-key-rules.test.ts` (bug 0233's
    witness, LEDGER at `:119`);
    `tests/inline-object-field-name-case.test.ts` (bug 0227's 62-cell witness,
    count stated at `:196`);
    `tests/inline-object-type-source-capture.test.ts` (bug 0228's capture,
    `TOTAL_LIST_CELLS = 102` at `:658`);
    `tests/params-inline-object-lowering.test.ts`;
    `tests/committed-fixture-parse-gate.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files and
    holds one inline object type,
    `tests/live/acceptance/fixtures/acc-typed-inline.theta:14`
    (`let r: { ok: boolean, label: string } = @…`), whose every entry spells
    `Ident ":"`. No committed source moves under any refusal added here.
- **Observed at:** `0.219.0` (HEAD `b9cf2f26`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, frontmatter
  `---\nmode: subagent\n---` where a `.theta` body is required; the `.thetalib`
  row passes `path = "lib.thetalib"` with no frontmatter; the `params:` rows
  pass the whole document verbatim. Diagnostic cells are the whole unfiltered
  `doc.diagnostics` in emission order rendered `<severity> <code>: <message>`;
  "registers" is the house definition (no error-severity `theta/parse/` or
  `theta/load/` code), so a `[]` cell registers by construction. Lowerings are
  `lowerQueryResponseSchema(<annotation>, [], [])` and
  `doc.frontmatter.params.loweredSchema` verbatim. One scratch vitest file over
  those entry points, run in four rounds on the outputs quoted below, then
  deleted.

## Summary

`TypeParser.parseObject` reads an inline object interior entry by entry. An
entry whose field-name position holds an `ident` with no `:` behind it reaches
bug 0231's resync — `skipMalformedEntry` advances to the next depth-0 `,` and
the loop continues — and an entry whose field-name position holds a non-`ident`
token is skipped by the arm beside it. Both discard the entry. Neither emits.

The rules that judge an interior read one of two inputs, and the discarded
entry is in neither. `walkType`'s case pass and its field descent read
`TypeNode.fieldNames` / `TypeNode.fieldTypes`, which the resync never wrote.
The four raw-key rules read `inlineObjectFieldKeys`, whose split keys each
entry on its text before that entry's own top-level `:` and skips an entry that
spells none — the exclusion the function's own doc comment states.

So a colon-less entry is unjudged text at a `Type` position. Adding one `:` to
the same entry turns on eight registered rows: `{a: integer, void}` reports
`[]` and `{a: integer, p: void}` draws
`theta/parse/void-in-non-return-position`; `{a: integer, array<integer,
integer>}` reports `[]` and `{a: integer, p: array<integer, integer>}` draws
`theta/parse/generic-arity-mismatch`; the same holds for `{}`,
an uppercase key, a repeated key, a quoted key, a rename and a non-identifier
key (§Reproduction (c)). The silence holds at twelve `Type` positions including
the verbatim `params:` one, in a `.thetalib`, inside `array<…>`, at nested
depth and in a union arm (§(b)).

The bug 0237 seed row is the same silence beside an empty type position:
`{a: ,void}` reports `[]` and registers, byte-for-byte what its control
`{a: integer,void}` reports. The empty type position contributes nothing to the
difference — 0237's fix left it drawing nothing when no entry follows it
(that report's §Fix residual 1), and the entry that does follow it here is
dropped by this defect.

Two bounds are measured with it. Sibling entries that spell `Ident ":"` keep
every verdict (`{a: ,void, Zs: string}` still draws
`theta/parse/binding-case-mismatch` on `Zs`), so this is a MISSING diagnostic
on the discarded entry alone and not a truncation. And the declaration position
already refuses the same spelling: `schema S { a: integer, void }` draws
`theta/parse/malformed-schema-field` where the inline interior
`grammar.md:109` says reuses the same `Field` form draws nothing (§(d)).

## Reproduction

Each cell is the whole `doc.diagnostics` list in emission order.

### (a) The subject, its seed control, and the bounds

Each row `fn f(p: <I>): integer { 1 }`.

| # | interior | diagnostics | registers |
|---|---|---|---|
| a1 | `{a: ,void}` | `[]` | yes |
| a2 | `{a: integer,void}` | `[]` | yes |
| a3 | `{a: integer, void}` | `[]` | yes |
| a4 | `{a: ,void, Zs: string}` | `error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _` | no |
| a5 | `{a: integer,void, Zs: string}` | `error theta/parse/binding-case-mismatch: …` | no |
| a6 | `{a: integer, Zs: string}` | `error theta/parse/binding-case-mismatch: …` | no |
| a7 | `{void}` | `[]` | yes |
| a8 | `{zs}` | `[]` | yes |
| a9 | `{Zs}` | `[]` | yes |
| a10 | `{zs, ys}` | `[]` | yes |
| a11 | `{}` | `error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.` | no |

a1 vs a2 is the bug 0237 seed row: the empty type position makes no difference,
both cells are `[]`. a4 and a5 are the bound — a sibling that spells
`Ident ":"` keeps its own refusal, so nothing behind the discarded entry is
lost. a7 vs a11 is the sharpest pair: both lower the same bytes
(§Reproduction (e)) and only one is refused.

### (b) The subject at twelve `Type` positions

Fixture interior `{a: ,void}`; the second column is the same interior spelled
`{a: integer,void}`; the control column is the byte-neighbour
`{a: integer, Zs: string}` at the same position.

| # | position | `{a: ,void}` | `{a: integer,void}` | control |
|---|---|---|---|---|
| b1 | `fn f(p: <I>): integer { 1 }` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b2 | `fn f(): <I> { 1 }` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b3 | `schema S { a: <I> }` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b4 | `schema T = <I>` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b5 | `let x: <I> \| null = null` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b6 | `let x: <I> = 1` | `[]`, registers | `[]`, registers | `binding-case-mismatch` + `let-rhs-type-mismatch` |
| b7 | `let r = @<<I>>` + backtick body | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b8 | b3 in `lib.thetalib`, no frontmatter | `[]` | `[]` | `binding-case-mismatch` |
| b9 | `params:` → `p: '<I>'` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b10 | `schema S { a: { p: <I> } }` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b11 | `fn f(p: array<<I>>): integer { 1 }` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |
| b12 | `schema S { a: <I> \| integer }` | `[]`, registers | `[]`, registers | `binding-case-mismatch` |

Row b11 is measured against bug 0233's landed widen (0.196.0): the control is
refused inside `array<…>` and the subject is not, because the widen changed
where the key split is consulted and not which entries yield a key.

### (c) One colon, eight rules

Subject and control differ by the colon (and, where a type is required, its
type text). Each row `fn f(p: <I>): integer { 1 }`.

| # | subject | subject diagnostics | control | control diagnostics |
|---|---|---|---|---|
| c1 | `{a: integer, void}` | `[]` | `{a: integer, p: void}` | `theta/parse/void-in-non-return-position` |
| c2 | `{a: integer, b c}` | `[]` | `{a: integer, b c: integer}` | `theta/parse/inline-field-name-not-identifier` (`'b c'`) |
| c3 | `{a: integer, "q"}` | `[]` | `{a: integer, "q": string}` | `theta/parse/quoted-inline-field-name` |
| c4 | `{a: integer, 3}` | `[]` | `{a: integer, 3: string}` | `theta/parse/inline-field-name-not-identifier` (`'3'`) |
| c5 | `{a: integer, a}` | `[]` | `{a: integer, a: integer}` | `theta/parse/duplicate-inline-field-name` |
| c6 | `{a: integer, Zs}` | `[]` | `{a: integer, Zs: string}` | `theta/parse/binding-case-mismatch` |
| c7 | `{a: integer, array<integer, integer>}` | `[]` | `{a: integer, p: array<integer, integer>}` | `theta/parse/generic-arity-mismatch` |
| c8 | `{a: integer, {}}` | `[]` | `{a: integer, p: {}}` | `theta/parse/empty-schema-body` |
| c9 | `{a: integer, w as "x"}` | `[]` | `{a: integer, w as "x": integer}` | `theta/parse/renamed-inline-field-name` |
| c10 | `{a: integer, Élan}` | `[]` | `{a: integer, Élan: string}` | `theta/parse/inline-field-name-not-identifier` (`'Élan'`) |

Rows c1, c6 and c5 were re-measured at the `schema` field position
(`schema S { f: <I> }`) and agree: `[]` in every subject cell. c7 shows the
resync's angle-awareness carrying the whole over-applied application away with
the entry.

### (d) The declaration position refuses the same spelling

| # | source | diagnostics |
|---|---|---|
| d1 | `schema S { a: integer, void }` | `error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'` |
| d2 | `schema S { a: integer, b c }` | `error theta/parse/malformed-schema-field: …` |
| d3 | `fn f(p: {a: integer, void}): integer { 1 }` | `[]` |
| d4 | `fn f(p: {a: integer, b c}): integer { 1 }` | `[]` |
| d5 | `schema S { void }` | `error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated.` |

d1/d3 and d2/d4 are the position asymmetry: `schemas.md:19` refuses "a field
name with no following `:`" at the declaration position, and `grammar.md:109`
says the inline `Field` is the same form.

### (e) What lowers, and what reaches the provider

`lowerQueryResponseSchema(<annotation>, [], [])`, and for `params:`
`doc.frontmatter.params.loweredSchema` verbatim.

| # | annotation | lowered |
|---|---|---|
| e1 | `{void}` | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` |
| e2 | `{zs}` | same bytes as e1 |
| e3 | `{}` | same bytes as e1 (and refused, §(a) row a11) |
| e4 | `{a: ,void}` | same bytes as e1 |
| e5 | `{a: integer,void}` | `{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false}` |
| e6 | `{a: integer,void, Zs: string}` | `{"type":"object","properties":{"a":{"type":"integer"},"Zs":{"type":"string"}},"required":["a","Zs"],"additionalProperties":false}` |
| e7 | `params:` → `p: '{void}'` | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| e8 | `params:` → `p: '{a: ,void}'` | same bytes as e7 |
| e9 | `params:` → `p: '{a: integer,void}'` | `…"p":{"$ref":"#/$defs/__inline_df817b794ef788ce"}…,"$defs":{"__inline_df817b794ef788ce":{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false}}` |

e1–e3 are the wire consequence of the parser's and the lowerer's shared
blindness: `{void}` and `{}` produce the identical fragment — the one
`theta/parse/empty-schema-body` exists to refuse, whose registry text calls it
a shape that "would silently accept every object" (`schemas.md:19`) — and only
`{}` is refused. e7/e8 carry that to the provider: the `params:` field `p`
lowers to the permissive `{}`, an unconstrained parameter, with no diagnostic.

## Expected behaviour

An entry that spells no `Ident ":"` derives from no `Field` (`grammar.md:101`,
`schemas.md:17`), so the source is refused. Specifically:

1. Every cell of §Reproduction (a) rows a1–a3 and a7–a10, of §(b), of §(c)'s
   subject column and of §(d) rows d3–d4 carries at least one error-severity
   diagnostic, and the theta does not register.
2. The refusal is one line per discarded entry — bug 0129's count-consequence
   law (`code-registry-parse.md:103`) — and does not depend on the entry's own
   text: `{a: integer, void}`, `{a: integer, Zs}` and `{a: integer, "q"}` are
   refused alike.
3. The disposition holds at all twelve positions of §(b), inside a generic
   argument (b11), at nested depth (b10), in a union arm (b12), in a
   `.thetalib` (b8) and at the verbatim `params:` position (b9).
4. The inline position and the declaration position agree: §(d) row d3 draws a
   refusal where d1 does, and d4 where d2 does.
5. An interior whose every entry is discarded never lowers the fragment
   `theta/parse/empty-schema-body` refuses (§(e) rows e1–e3), and a `params:`
   field never lowers to a permissive `{}` from this shape (e7–e8).

## Actual behaviour / root cause

`TypeParser.parseObject`'s field loop holds a field-name token, requires `:`
behind it, and on failure calls `TypeParser.skipMalformedEntry`, clears
`entryTainted` and continues. `skipMalformedEntry` advances token by token,
tracking `{`/`<` nesting, and returns after consuming this interior's next
depth-0 `,`, or without consuming at a depth-0 `}` or `>`. The abandoned entry
is never pushed to `fieldNames` (the push happens after the colon is eaten) and
never yields a `TypeNode` for `fieldTypes` (`parseUnion` is not called). That
is bug 0231's route-1 resync working as designed for the siblings; the entry
itself has no emission point.

The other half of the same `if` handles a field-name position holding a
non-`ident` token: it sets `entryTainted` and calls `this.next()` on the token,
so a quoted, numeric or non-ASCII head with no colon behind it is likewise
walked past.

Nothing downstream recovers the entry. `walkType`'s case pass runs over
`node.fieldNames` and its field descent over `node.fieldTypes`, both short by
the discarded entry, which is why the four `fieldNames`/`fieldTypes`-fed rows
of §Reproduction (c) (c1, c6, c7, c8) are silent. `inlineObjectFieldKeys` reads
the complete `interiorSource`, but keys each split entry on `topLevelColon`
and `continue`s when that returns `< 0` — its doc comment states the rule ("An
entry with no top-level `:` contributes no key"). That is why the four raw-key
rows (c2, c3, c4, c5, c9, c10) are silent too. The blindness is exhaustive by
construction: the two inputs that judge an interior are the loop's arrays and
the colon-keyed split, and a colon-less entry is absent from both.

`hoistInlineObjectType` and `lowerInlineObject` key their `properties` and
`required` writes on the same split (bug 0159 §Fix route (a) makes that
agreement structural), so the discarded entry contributes no property either —
which is why `{void}` lowers the empty-object fragment rather than a corrupted
one, and why the harm at the wire is an under-constrained schema rather than a
wrong key.

## Why it matters

The theta registers and runs with unjudged text standing at a `Type` position.
`fn f(p: {a: integer, array<integer, integer>}): integer { 1 }` loads clean;
so does `{a: integer, void}`, `{a: integer, Élan}` and `{a: integer, "q"}`.
Each of those is refused the moment the author adds the `:` the entry is
missing, so the parser's verdict inverts with the severity of the typo: a
half-written field is admitted and the finished one is judged.

At the wire the consequence is an under-constrained schema with no warning. A
`params:` block declaring `p: '{void}'` or `p: '{a: ,void}'` lowers `p` to the
permissive `{}` — every value accepted — where `p: '{}'` is refused by
`theta/parse/empty-schema-body` for producing that exact fragment
(§Reproduction (e)).

The inline and declaration positions disagree on one `Field` form.
`grammar.md:109` states they are the same form; `schemas.md:19` refuses "a
field name with no following `:`" at the declaration; the inline position
admits it at all twelve `Type` positions measured.

## Non-goals

- The empty type position itself. `{a: }`, `{a:}` and `{a: , }` still draw
  nothing; that is bug 0237's §Fix residual 1 and stays its subject. This
  report's cells hold the empty type position constant across a subject and its
  control (§(a) a1 vs a2) precisely to keep the two apart.
- A keyword-shaped field name that DOES spell its colon. `{a: , void: integer}`
  reports `[]` and lowers a `void` property; that is the reserved-keyword class
  and belongs to its own reports
  ([0242](./0242-reserved-keyword-refusal-misfires-on-three-faces.md)), not
  here. No cell above claims it.
- Bug 0231's resync behaviour for the SIBLINGS. Every control cell in which a
  sibling behind a discarded entry keeps its refusal (§(a) a4–a5) is a no-move.
- The lowering's field division. §(e) records what the lowerers do; a refusal
  added here refuses the document before its bytes matter.
- A keyless entry carrying a STRAY CLOSE TOKEN — a `}` or `>` whose innermost
  open frame is of another kind or absent, bug
  [0238](./0238-stray-close-token-underflows-top-level-split.md)'s
  typed-opener-stack class. `{a: integer, b > c, m: integer}` at `params:`
  registers and lowers `{a, m}`, and the keyless entry drops silently, which is
  0238's own landed design (0.218.0) and not a defect this report claims. Added
  by the operator adjudication below.

## Fix

Refuse the discarded entry at the point it is discarded, keeping bug 0231's
resync: in `TypeParser.parseObject`, the colon-gate failure arm and the
non-`ident` field-name-position arm each emit one error-severity diagnostic
naming the entry before `skipMalformedEntry` / `this.next()` carries it away.
The emission must be at the loop, not at `walkType`: the entry is absent from
`fieldNames`, from `fieldTypes` and from the `inlineObjectFieldKeys` split, so
no later pass has the entry to judge, and widening the split's key rule instead
would change `topLevelColon`'s meaning for the four raw-key rows and for the
two lowerers keyed on it (bug 0159's by-construction agreement).

Binding on the fix:

- **The registry disposition is stated.** The nearest precedent is the
  declaration position's `theta/parse/malformed-schema-field`
  (`code-registry-parse.md:99`, `schemas.md:19`), whose Trigger is written of a
  `schema` object body; reusing it requires widening that Trigger to the inline
  interior, and minting a row requires a `code-registry-parse.md` entry, a
  `docs/reference/diagnostics.md` amendment and a
  `tests/fixtures/h7a/permitted-codes.json` addition. The fix names which and
  carries the amendment.
- **One line per entry.** Bug 0129's count-consequence law
  (`code-registry-parse.md:103`): a discarded entry that already draws an
  error-severity diagnostic from another row keeps that one alone.
- **Reach.** Every cell of §Reproduction (b), (c) subject column and (d) rows
  d3–d4 carries an error-severity diagnostic and does not register, at all
  twelve positions, inside `array<…>`, at nested depth, in a union arm, in a
  `.thetalib` and at `params:`.
- **What must not move.** §(a) rows a4–a6 and a11, §(c)'s whole control column,
  §(d) rows d1, d2, d5, the lowered bytes of a well-formed interior (§(e) rows
  e5, e6, e9), the empty-type-position cells bug 0237's residual 1 owns, and
  the four locked witnesses named in §Affected — re-derived, not weakened; any
  cell this fix flips is flipped by an ADDED diagnostic and stated at the cell.
- **Witness.** One new test file over `parseDoc`, `lowerQueryResponseSchema`
  and `doc.frontmatter.params.loweredSchema` carrying the rows of
  §Reproduction (a)–(e) with both columns per row, the twelve positions, and
  the no-move cells above. Live cover is owed only if the refusal changes what
  reaches a provider-facing schema — §(e) rows e7–e8 say it does, by refusing
  the document that produced them.

### Operator adjudication (2026-08-23)

A premeasure of the §Fix above, implemented exactly as written, measured that it
collides with two shipped sibling contracts: it WITHDRAWS the registration bug
[0238](./0238-stray-close-token-underflows-top-level-split.md) promises at its
own cells (0.218.0), and it SUBSTITUTES its own code for the one bug
[0252](./0252-brace-and-angle-annotation-junk-exempt-from-refusal.md) settled at its
annotation cells (0.225.0). Neither report is named anywhere above — this one
was filed at 0.219.0 — so the flips carried no authorizing clause. The operator
settled it as a carve-out. The adjudication, verbatim:

> 1. AMEND 0244's §Expected 2 on the record: the emission stays
>    text-independent EXCEPT one discriminator — a keyless entry containing a
>    STRAY CLOSE TOKEN (0238's typed-opener-stack class) routes to 0238's
>    tolerance (no emission; the entry drops as 0238's fix promises).
> 2. SCOPE the emission to KEYLESS entries only (an entry that contributes no
>    key). Colon-PRESENT entries with junk tails stay whatever they are today
>    (0252's business at annotations; the tolerant skip elsewhere) — 0244's
>    emission must never fire on them.
> 3. Under that scoping: `{void}`, `{zs}`, `{Zs}`, `{zs, ys}`, `{a: ,void}`,
>    `{a: integer,void}`, `{a: integer, b c}`, `{a: integer, "q"}`,
>    `{a: integer, 3}`, `{a: integer, a}`, `{a: integer, Zs}`,
>    `{a: integer, array<integer, integer>}`, `{a: integer, {}}`,
>    `{a: integer, w as "x"}`, `{a: integer, Élan}` REFUSE with the settled
>    registry disposition (REUSE `theta/parse/malformed-schema-field`; widen its
>    `code-registry-parse.md` Trigger from the schema object body to the inline
>    interior, mirror into `docs/reference/diagnostics.md` and
>    `docs/reference/schema-subset.md`; the Trigger must also state the RANGE
>    divergence — at an inline interior the diagnostic carries the enclosing
>    declaration's range, the same statement
>    `theta/parse/schema-type-not-expression` already makes).
>    `{a: integer, b > c, m: integer}` and every stray-close-carrying keyless
>    entry KEEPS 0238's silent tolerant registration — record that class as
>    0244's §Non-goal (0238's documented design).
> 4. ZERO flips at 0238's witness
>    (`tests/inline-object-stray-close-token-split.test.ts` W-cells + E2) and
>    ZERO flips at 0252's witness/cells — they are LOCKS for this run.

**The amended rule.** §Expected 2 now reads: the refusal is one line per
discarded entry (bug 0129's count-consequence law) and does not depend on the
entry's own text — `{a: integer, void}`, `{a: integer, Zs}` and
`{a: integer, "q"}` are refused alike — with exactly one discriminator. An
entry that contributes no key AND carries a stray close token is not this
report's subject: it keeps bug 0238's silent tolerant registration (§Non-goals).
An entry that DOES contribute a key is out of reach whatever junk stands behind
its colon; that text is bug 0252's business at an annotation and the tolerant
skip elsewhere. Every cell of §Reproduction (a)–(e) above is unaffected by the
carve-out: none of its interiors carries a stray close token.

**"Contributes no key" is the repository's own test, not a paraphrase.**
`inlineObjectFieldKeys` keys each entry of
`splitTopLevel(interiorSource, ",", "angle-and-brace")` on `topLevelColon`
(`src/parser/params.ts`), and bug
[0159](./0159-inline-field-name-stop-masks-duplicate.md)'s route (a)
makes the two lowerers' agreement with that split structural. So the parser's
scoping test is at parity with `topLevelColon` — which tracks `(` as nesting —
and not merely with "spells a `:` somewhere": `{(b: c)}` contributes no key, no
property, and is refused.

## Provenance

Filed as the forward filing of bug 0237's §Fix *Residuals* item 4
(`docs/bugs/0237-empty-inline-field-type-truncates-interior.md`), which
recorded `{a: integer,void}` drawing nothing on any channel in both trees,
attributed it to bug 0231's class, and left it unfiled. Ownership checked at
HEAD: 0231 is fixed (0.189.0) and its subject is the siblings behind a
malformed entry, not the entry itself; `git grep` over `docs/bugs/` finds no
open report claiming a colon-less inline object entry — the two open reports
that mention a colon at an inline interior (0062, 0063) are grammar-appendix
table defects with a different subject.

Independently re-derived at HEAD `b9cf2f26` (0.219.0): one scratch vitest file
over `parseDoc` (`tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`
(`src/runtime/query-schema-lowering.ts`) and
`doc.frontmatter.params.loweredSchema`, run in four rounds covering the eleven
rows of §Reproduction (a), the twelve positions of (b) with both spellings and
the control, the ten subject/control pairs of (c) plus three of them re-measured
at the `schema` field position, the five rows of (d) and the nine lowerings of
(e); plus the corpus census over `git ls-files -- '*.theta' '*.thetalib'` (34
files, one inline object type, every entry well-formed). The scratch file was
deleted and a repository-wide sweep for its token returns no hit; the tracked
tree carries this document alone.

Two facts beyond 0237's residual are added by this measurement: the silence is
not specific to a keyword-shaped entry — an ordinary identifier, a quoted key, a
numeric key, a rename, a non-ASCII key and a whole over-applied generic are
discarded alike, and each is refused the moment the entry spells its colon
(§(c)) — and an interior whose every entry is colon-less lowers the byte-identical
fragment `{}` is refused for producing (§(e) rows e1–e3, e7–e8).

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.


## Fix (0.238.0)

- **What shipped:**
  - `src/parser/type-grammar.ts` — `parseTypeExpression` constructs the
    diagnostics array up front and constructor-injects it, with the
    `TypeCheckSite`, into `TypeParser` (explicit injection; no module state).
    `TypeParser.parseObject`'s two discard arms — the colon-gate failure arm and
    the non-`ident` field-name-position arm — each buffer exactly one
    `theta/parse/malformed-schema-field` for a SOURCE entry that contributes no
    key and carries no stray close token, before `skipMalformedEntry` /
    `this.next()` carries the entry away (§Fix "emission at the loop, not at
    `walkType`"). `TypeParser.classifyEntry` decides that with two typed stacks
    in one pass: one carrying `(`, `<` and `{` for the top-level-`:` test, at
    parity with `topLevelColon`; one carrying `{` and `<` only, parens
    transparent, for the entry `,` boundary and bug 0238's stray-close class, at
    parity with `splitTopLevelSegments` and `skipMalformedEntry`. An
    `entryRefused` latch, reset only when an entry separator is consumed, holds
    §Fix's one-line-per-entry law; `skipMalformedEntry` returns whether it
    crossed one. Buffered refusals flush only when the interior's closing `}` is
    spelled — the same grammar gate the empty-schema and raw-key rules read,
    which is what leaves the unclosed-interior class unmoved.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the registry
    disposition is REUSE, not a mint: `theta/parse/malformed-schema-field`'s
    Trigger is widened from the `schema` object body to the inline interior at
    any `Type` position and any nesting depth, states the RANGE divergence (an
    inline interior carries the enclosing declaration's range, because a
    `TypeNode` carries none — the same statement
    `theta/parse/schema-type-not-expression` already makes), and states the
    three bounded exclusions (colon-present entry; stray-close-carrying keyless
    entry; the stranded-entry residual below).
  - `docs/reference/schema-subset.md`, `docs/spec_topics/grammar.md`
    §"Inline object types", `docs/reference/grammar.md`'s `ObjectType` bullet —
    the same statement mirrored in each page's register, in the same change
    (DIAG-2). `docs/reference/diagnostics.md` needs no edit: that table carries
    code, severity, phase and Message only — no Trigger column — and the Message
    is unchanged. `tests/fixtures/h7a/permitted-codes.json` needs none either:
    it holds load/runtime/host codes and no `theta/parse/` code.
  - `tests/inline-object-keyless-entry-refusal.test.ts` — the new witness
    (below).
  - Ten sibling witnesses updated at fourteen cells, each strictly ADDITIVE and
    stated at the cell (§Fix "any cell this fix flips is flipped by an ADDED
    diagnostic and stated at the cell"): `annotation-nontype-text-refusal`
    (0124, a20 return), `brace-rooted-union-arm-capture` (0095, 3f),
    `empty-object-discriminator-field-withhold` (0129, the exotic-whitespace
    row), `inline-empty-object-type` (0045, d-value / d-return /
    d-schema-feeding / f1 / f4), `inline-object-empty-field-type-truncation`
    (0237, r16 / r16c, its own `EMPTY_LIST_CELLS` re-derived 12 to 10),
    `inline-object-field-name-comparison-key` (0159, C1),
    `inline-object-quoted-field-name-refusal` (0176, H1 twice),
    `let-annotation-inline-object-compat` (0130, e1),
    `params-scalar-nontype-text-refusal` (0059, d10),
    `reserved-keyword-misfire-faces` (0242, P2). No assertion weakened, no cell
    deleted, every stated count re-derived.
- **Gates:** witness RED at HEAD `537c274c` (7 failed / 8 passed, every red a
  missing `theta/parse/malformed-schema-field` line or an absent lowering, no
  fence or control cell red) and GREEN after (19/19 at the sealed state).
  Default suite `npx vitest run` — 420 files / 8817 tests passed.
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean. `npm run lint`
  (`eslint "src/**/*.ts"`) clean. Locks green standalone:
  `tests/inline-object-stray-close-token-split.test.ts` (0238) and
  `tests/brace-and-angle-annotation-junk-refusal.test.ts` (0252), 27/27, zero
  flips — the adjudication's clause 4. `tests/code-registry.test.ts`,
  `tests/citation-symbol-form-gate.test.ts`,
  `tests/registry-closed-set-corpus-gate.test.ts` and
  `tests/committed-fixture-parse-gate.test.ts` 50/50, which is what discharges
  the corpus-wide "no shipped source moves" claim.
- **Review:** 4 rounds.
  - Round 1 (deep) — 7 findings: a no-progress fallback in the colon-gate arm
    that cleared `entryTainted` and so flipped the COLON-PRESENT entry
    `{a > Zs: integer}` from one line to two (deleted; its stated WHY was false
    and the arm trace proves the loop already terminates); `classifyEntry`
    ignoring parens where `topLevelColon` tracks them, leaving `{(b: c)}` silent
    and lowering the permissive `{}`; a `docs/reference/grammar.md` mirror gap;
    a false "spins forever" comment; a wrong mechanism recorded at 0242's P2
    (`tokeniseType` has no keyword kind); three historical comments; a
    duplicated range statement in the Trigger.
  - Round 2 (fast) — 1 correctness finding: round 1's paren remedy used a
    counter separate from the `{`/`<` stack and so lost parity with
    `topLevelColon` on CROSSED brackets — `{( < ) > : x, a: integer}` reported
    `[]` and silently dropped the entry from the lowering. Remedied with the
    two-stack pass described above.
  - Round 3 (deep) — 1 correctness finding, arbitrated as an unfixed residual
    (residual 1 below) and remedied non-behaviourally: zero executable `src/`
    lines changed (`git hash-object src/parser/type-grammar.ts` identical before
    and after).
  - Round 4 (deep confirmation) — CLEAN, no finding on any axis, three
    non-blocking residuals recorded below.
- **Verification:** SOLID.
  - Red path: `src/parser/type-grammar.ts` neutralised to HEAD's blob
    (`8f860c92…`), witness 11 of 19 tests RED; the tests that stay green are the
    designed fences (§(e)'s direct-lowerer half, all of group (G), the
    termination guard (I), the inventory check (L)), and group (K)'s residual
    cells are byte-unmoved under neutralisation — only its discriminator cells
    move, which is what proves the fix's reach. Restored and hash-verified back
    to `19a8b30a…`, witness 19/19 green.
  - Default suite green, both locks green standalone (above).
  - Live: one new standalone cell,
    `tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts`,
    exercising the `params:`-position refusal against a real provider — the
    surface §(e) rows e7–e8 name — plus the four existing H8a cells over the
    same parse/registration surface (0231, 0237, 0238, 0252). All five green;
    no open bug document carries a matching red signature. Fixture stems and
    slash-names use the `b0244live-` stem; the discriminator is fixed-pair
    arithmetic over two `params:`-bound values, never a verbatim-echo demand
    (bug 0243). The inline-object acceptance files were not touched.
  - Lint and typecheck clean.
- **Residuals:**
  1. **The break-residue class is not closed.** `TypeParser.parseObject`'s
     refusal arms fire only on entries the field loop VISITS. Where an entry's
     type text is followed by no entry separator — a junk tail such as `a: b c`
     — the loop takes `if (!this.eatPunct(","))` and breaks, and every source
     entry behind that exit is left unvisited even though the raw-key split
     still spells it. At eleven of §(b)'s twelve positions a recogniser gate
     backstops it; at the generic-argument position there is none, so
     `params:` `p: 'array<{a: b c, d e}>'` reports `[]`, registers, and lowers
     the permissive `{}`. Evidence that this is a residual and not a regression:
     the cell is `[]` at HEAD `537c274c` and `[]` under this change (no flip);
     §Fix names the emission site as exactly the two arms, and an unvisited
     entry reaches neither; and the stranding interior's first entry
     (`a: b c`, a colon-present junk tail) is bug 0252's subject class, which
     the adjudication's clause 2 pins as unmoved and clause 4 makes a lock.
     Pinned by the witness's RESIDUAL FENCE group (K) at its measured values,
     labelled as measured-not-desired, with the byte-neighbour control
     `array<{a: b, d e}>` refusing beside it to prove the distinction is the
     loop's REACH and not the entry's shape. A change that closes it is
     expected to red group (K) loudly.
  2. **The zero-token entry draws nothing.** `{a: integer,,b: string}` and
     `{,}` report `[]`; a zero-token segment contributes no key, but the
     `,`-at-a-field-name-position arm reads it as a skipped separator. `[]` at
     HEAD and `[]` under this change — no flip, and no cell of §Reproduction
     claims it.
  3. **§Fix's "What must not move" is wrong about §(e) row e9.** It lists e9
     among the lowered bytes of a well-formed interior, but e9's interior is
     `{a: integer,void}` — a SUBJECT spelling, and one the adjudication's
     clause 3 lists among the fifteen that must refuse. The document is
     therefore refused and no envelope survives; the witness encodes the
     measurement and says so at the cell. The well-formed bytes §Fix means are
     e5's and e6's, pinned green at the direct-lowerer fence.
  4. **Group (L)'s inventory check is table-derived for groups A, B, C and F
     (97 of 133 list cells) and constant-versus-constant for D, G, J and K,
     whose cells are inline in their `describe` blocks.** Deleting an inline
     cell would shrink coverage without redding (L). The file scopes its own
     claim honestly.
  5. **Verifier process note.** One live invocation released the lock with a
     `; rmdir` that was not scoped inside the parenthesised group the protocol
     requires. No lock belonging to another run was removed — both locks
     released were created by that run — and the lock directory is absent at the
     sealed state.
  6. **Bug 0134's stale-citation class is untouched.** This change shifts line
     numbers in `src/parser/type-grammar.ts`, so `type-grammar.ts:NNN`
     citations elsewhere shift with it. Several were already stale at HEAD.
     Every citation authored here is BY SYMBOL, which is why 0134 is the
     do-not-chase class (§Related).
- **Discharge notes appended:** none. Bug 0238's and bug 0252's witnesses are
  byte-unmoved, so neither report needs a note; bug 0237's witness gains two
  added lines at r16 / r16c, stated at those cells, which its own §Fix
  anticipates.
- **Pinned dispositions / non-goals:** the stray-close-carrying keyless entry
  keeps bug 0238's silent tolerant registration (new §Non-goals bullet, added by
  the operator adjudication); a colon-PRESENT entry with a junk tail keeps
  today's verdict, which at an annotation is bug 0252's
  `theta/parse/annotation-type-not-expression` and elsewhere the tolerant skip;
  the empty type position stays bug 0237's residual 1; the reserved-keyword
  class stays bug 0242's.

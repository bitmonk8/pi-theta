# Bug 0244 — an inline object entry that spells no top-level `:` is discarded by `TypeParser.parseObject`'s resync and is invisible to every rule: `{a: ,void}` and `{a: integer,void}` both report `[]` and register at twelve `Type` positions, the entry reaches neither `fieldNames`/`fieldTypes` (the resync consumes it) nor `inlineObjectFieldKeys` (no top-level colon, no key), so the eight refusals the same entry draws once a `:` is added — `void-in-non-return-position`, `generic-arity-mismatch`, `empty-schema-body`, `binding-case-mismatch` and all four raw-key rows — are withheld, and `{void}` lowers the byte-identical fragment `{}` draws `theta/parse/empty-schema-body` for

- **Status:** open.
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

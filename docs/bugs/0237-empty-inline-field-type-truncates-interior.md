# Bug 0237 — an inline object entry whose TYPE position is empty truncates the interior at that entry, because `parsePrimary`'s tolerant punctuation skip (`type-grammar.ts:606`–`:608`) eats the entry-separating `,` and reads the NEXT entry's name as the empty entry's type: `{a: , Zs: string}` reports `[]` and registers at ten `Type` positions including `params:`, the `.thetalib` spelling and inside `array<…>`, lowers `Zs` into the provider-facing `$defs`, and withholds five registered rows (`binding-case-mismatch`, `void-in-non-return-position`, `generic-arity-mismatch`, `empty-schema-body`, `result-in-schema-position`) that every byte-neighbour control draws — while bug 0231's landed resync never runs, since the colon this entry does spell is consumed

- **Status:** open.
- **Sev/Diff estimate:** S1/D3 — S1 because the theta LOADS AND REGISTERS with
  zero diagnostics on any channel: `fn f(p: {a: , Zs: string}): integer { 1 }`
  reports `[]` where `fn f(p: {a: integer, Zs: string}): integer { 1 }` draws
  `theta/parse/binding-case-mismatch`, the same silence holds at nine further
  positions including the verbatim `params:` one, and the uppercase key the
  case rule exists to refuse reaches the wire — the `params:` lowering emits
  `"$defs":{"__inline_41292d1fcb4b229d":{"type":"object","properties":{"Zs":
  {"type":"string"}}…}}` (§Reproduction (f)). D3 because the eating site is
  `parsePrimary`'s tolerant punctuation skip, the recovery every `Type`
  position in the language shares, the emission point is unsettled between two
  routes with different blast radii (§Fix (a)), and any change moves cells
  pinned by four locked witnesses (§Affected — the witness locks).
- **Kind:** defect — implementation, one recovery point, three consequences.
  1. **The interior is truncated.** For `{a: , Zs: string}` the field loop
     consumes `a` and its `:`, calls `parseUnion` → `parsePrimary`
     (`src/parser/type-grammar.ts:585`), which meets the punct `,`, skips it as
     "unexpected punctuation" (`:606`–`:608`) and recurses onto `Zs`, returning
     `{kind:"named", name:"Zs"}` as field `a`'s TYPE. Control returns to the
     loop on the `:` behind `Zs`, `this.eatPunct(",")` fails, and the loop ends
     at `:739`–`:741`. `fieldNames` is `["a"]` and `fieldTypes` is the one
     named type; `Zs: string` — and every entry behind it — is in neither.
  2. **Bug 0231's resync cannot fire.** The resynchronisation added at
     `:703`–`:713` (`skipMalformedEntry`, `:790`) is reached only when
     `eatPunct(":")` FAILS. This entry spells its colon, so the loop takes the
     well-formed path and stops later at the genuine-end `break`, which is the
     shape 0231's own fix report records as out of its subject
     (`.pi/tmp/fixes/0231-report.md` §Residuals 1).
  3. **Five registered rows are withheld; four others still fire.** The checks
     fed by `fieldNames` / `fieldTypes` lose their input:
     `theta/parse/binding-case-mismatch` (`:1082`, over `node.fieldNames`),
     and, through the field descent `for (const fieldType of node.fieldTypes)`
     (`:1229`), `theta/parse/void-in-non-return-position`,
     `theta/parse/generic-arity-mismatch`, `theta/parse/empty-schema-body` and
     `theta/parse/result-in-schema-position` (§Reproduction (e)). The four
     raw-key rules read `node.interiorSource` (`:1119`,
     `inlineObjectFieldKeys` `:833`), which is sliced from token offsets and is
     complete however early the loop stopped, so they still name keys behind
     the empty entry (§Reproduction (d)) — which is why the harm is a MISSING
     diagnostic on a NEIGHBOUR, and a clean load whenever no raw-key rule
     happens to apply.
- **Related:**
  - [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) —
    **fixed (0.189.0)**, the origin and the explicit non-owner. Its subject is
    an entry that does not spell `Ident ":"`; its route-1 resync repaired that
    class and its fix report records this one as "a candidate filing, not this
    fix's subject", measured on the fixed tree. Its `TypeNode` doc comment
    already names the shape (`type-grammar.ts:279`–`:281`: "the shape where
    `parsePrimary`'s tolerant punctuation skip swallows that `,`, and this
    break then fires mid-interior instead"), so the tree carries the statement
    of the defect without a filing. Its witness
    `tests/inline-object-malformed-entry-resync.test.ts` is a lock here.
  - [0233](./0233-generic-argument-inline-field-key-rules-withheld.md) —
    **fixed (0.196.0)**, the generic-argument widen this defect defeats.
    Re-measured against it: `array<{a: integer, Zs: string}>` now draws
    `theta/parse/binding-case-mismatch` at every position measured, while
    `array<{a: , Zs: string}>` draws `[]` at nine of ten and its position's own
    RHS line at the tenth (§Reproduction (c)). The widen reaches the arm; the
    truncation empties the arrays the arm reads.
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) —
    **fixed (0.165.0)**, which put inline field names under `lexical.md:16`'s
    lowercase-first rule. The pass it landed is the one silenced here, and the
    harm it names — an uppercase key lowered into the provider-facing `$defs` —
    is measured again at §Reproduction (f).
  - [0235](./0235-malformed-inline-field-truncates-generic-argument-list.md) —
    **fixed (0.189.0)**, the enclosing-cursor face of 0231's `break`. The
    genuine-end `break` this report reaches leaves the cursor on a `:` inside
    the interior, so the arity face is reachable in principle from this shape;
    it is not claimed here (§Non-goals).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for the positional drift any fix here induces in
    `src/parser/type-grammar.ts` citations.
- **Affected** (every citation verified at HEAD `30c0cb67`, 0.197.0; cited by
  symbol, the line numbers being 0134's class):
  - **The eating site** — `src/parser/type-grammar.ts`: `TypeParser.parsePrimary`
    (`:585`) and its tolerant punctuation skip (`:606`–`:608`, comment
    "Unexpected punctuation: skip it to stay tolerant"), reached from
    `parseUnion` (`:569`) for every field type, generic argument and union arm.
  - **The truncation point** — `TypeParser.parseObject`'s field loop (`:690`),
    the colon gate `if (!this.eatPunct(":"))` (`:702`) with 0231's resync behind
    it (`:703`–`:713`, `skipMalformedEntry` at `:790`), the name push
    (`:722`) and type push (`:726`), and the genuine-end
    `if (!this.eatPunct(","))` break (`:739`–`:741`);
    `braceClosed = this.eatPunct("}")` (`:744`), false whenever that break
    fires before the interior's own brace.
  - **The starved consumers** — `walkType` (`:992`), the `closingBraceSpelled`
    gate and the case pass over `node.fieldNames` (`:1081`–`:1097`), and the
    field descent `for (const fieldType of node.fieldTypes)` (`:1229`), the
    only route by which a field's own TYPE is judged.
  - **The independent capture that does NOT truncate** —
    `interiorClosingBraceIndex` (`:475`), the `interiorSource` slice (`:756`)
    and `inlineObjectFieldKeys` (`:833`), read at `:1119`: the four raw-key
    rules keep their full input, which is why they still fire behind the empty
    entry.
  - **The registered rows withheld** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`
    (`theta/parse/binding-case-mismatch`), `:65`
    (`theta/parse/generic-arity-mismatch`), `:66`
    (`theta/parse/void-in-non-return-position`), `:67`
    (`theta/parse/result-in-schema-position`), `:98`
    (`theta/parse/empty-schema-body`). The rows that still fire: `:100`–`:102`
    (quoted, renamed, non-identifier) and the duplicate row beside them.
  - **The contract** — `docs/spec_topics/grammar.md:101`
    (`ObjectType ::= "{" Field ("," Field)* ","? "}"`), `:109` (§"Inline object
    types" — the inline `Field` reuses the object-schema `Field` form, in any
    `Type` position, at any depth); `docs/spec_topics/schemas.md:17` ("Field
    names are identifiers; field types are any expression from the Type System
    grammar"), which admits no empty type text; `docs/spec_topics/lexical.md:13`
    and `:16` (`Ident`, and the lowercase-first rule stated of EACH name).
    Mirrors: `docs/reference/grammar.md:225`, `:238`.
  - **The declaration-position precedent** —
    `code-registry-parse.md:104` (`theta/parse/schema-type-not-expression`),
    which is what `schema S { a: }` draws today (§Reproduction (g) row g1)
    where the inline spelling of the same empty type draws nothing.
  - **The witness locks** —
    `tests/inline-object-malformed-entry-resync.test.ts` (bug 0231's witness,
    64 diagnostic-list cells, LEDGER at `:95`);
    `tests/generic-argument-inline-field-key-rules.test.ts` (bug 0233's
    witness, LEDGER at `:119`);
    `tests/inline-object-field-name-case.test.ts` (bug 0227's 62-cell witness,
    count stated at `:196`);
    `tests/inline-object-type-source-capture.test.ts` (bug 0228's capture,
    `TOTAL_LIST_CELLS = 102` at `:658`);
    `tests/params-inline-object-lowering.test.ts`;
    `tests/committed-fixture-parse-gate.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files and
    `git grep -cE '\{[^}]*:[[:space:]]*(,|\})'` over them returns no hit, so no
    committed source moves under any route in §Fix.
- **Observed at:** `0.197.0` (HEAD `30c0cb67`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, frontmatter
  `---\nmode: subagent\n---` where a `.theta` body is required; the `.thetalib`
  rows pass `path = "lib.thetalib"` with no frontmatter; the `params:` rows pass
  the whole document verbatim. Diagnostic cells are the whole unfiltered
  `doc.diagnostics` in emission order rendered `<severity> <code>: <message>`;
  "registers" is the house definition (no error-severity `theta/parse/` or
  `theta/load/` code), so a `[]` cell registers by construction. Lowerings are
  `lowerQueryResponseSchema(<annotation>, [], [])` and
  `doc.frontmatter.params.loweredSchema` verbatim. Three scratch vitest files
  over those entry points, run on the outputs quoted below, then deleted.

## Summary

`TypeParser` is one tolerant recursive-descent parser shared by every `Type`
position. When a field's type position holds no type — `{a: , Zs: string}` —
`parsePrimary` reaches its punctuation skip (`type-grammar.ts:606`–`:608`),
consumes the `,` that separates the entries, and returns the NEXT entry's name
token as this field's type. The loop then sits on that entry's `:` where a `,`
is required and ends at `:739`–`:741`. Everything the source spells behind the
empty type position is absent from `fieldNames` and `fieldTypes`.

Bug 0231's resync does not reach this shape by construction: it hangs off the
failure of `eatPunct(":")` (`:702`), and this entry spells its colon. The
resulting document loads clean. `fn f(p: {a: , Zs: string}): integer { 1 }`,
the same interior at a `schema` field, an `fn` return, a `schema` alias, a
`let` annotation, a query annotation, a `.thetalib` field, a `params:`
right-hand side, one nesting level down and in a union arm all report `[]` and
register, where both entry orders of the well-formed control
`{a: integer, Zs: string}` draw `theta/parse/binding-case-mismatch`
(§Reproduction (b)). Inside a generic argument the same holds against bug
0233's landed widen (§Reproduction (c)).

Five registered rows lose their input: the case rule reads `node.fieldNames`
(`:1082`) and the three field-TYPE rules plus `result-in-schema-position` are
reached only through the field descent (`:1229`) (§Reproduction (e)). The four
raw-key rules read `interiorSource` instead and still fire, so
`{a: , "q": string}` is refused while `{a: , Zs: string}` is not
(§Reproduction (d)). The lowering also reads the raw interior, so the fields
the parser dropped still reach the provider: `params:` `p: '{a: , Zs: string}'`
lowers `"properties":{"Zs":{"type":"string"}}` into `$defs` — the uppercase key
bug 0154's pass exists to refuse — while the field `a` the author wrote is
absent from the wire schema (§Reproduction (f)).

## Reproduction

Each cell is the whole `doc.diagnostics` list in emission order.

### (a) The subject and its two controls, at one position

| # | source | diagnostics | registers |
|---|---|---|---|
| a1 | `fn f(p: {a: , Zs: string}): integer { 1 }` | `[]` | yes |
| a2 | `fn f(p: {a: integer, Zs: string}): integer { 1 }` | `error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _` | no |
| a3 | `fn f(p: {Zs: string, a: integer}): integer { 1 }` | `error theta/parse/binding-case-mismatch: …` | no |
| a4 | `fn f(p: {Zs: string, a: }): integer { 1 }` | `error theta/parse/binding-case-mismatch: …` | no |
| a5 | `fn f(p: {a: , Zs: string, Ys: integer}): integer { 1 }` | `[]` | yes |

a4 is the bound: an empty type position at the LAST entry costs nothing,
because the entries the loop already read are behind it — the truncation
removes what follows the empty entry, not the entry itself. a5 shows the loss
is not one entry: every entry behind the first empty type position is dropped.

### (b) The subject at ten `Type` positions

Fixture interior `{a: , Zs: string}`; the control column is the byte-neighbour
`{a: integer, Zs: string}` at the same position.

| # | position | subject | control |
|---|---|---|---|
| b1 | `fn f(p: <I>): integer { 1 }` | `[]`, registers | `binding-case-mismatch` |
| b2 | `fn f(): <I> { 1 }` | `[]`, registers | `binding-case-mismatch` |
| b3 | `schema S { a: <I> }` | `[]`, registers | `binding-case-mismatch` |
| b4 | `schema T = <I>` | `[]`, registers | `binding-case-mismatch` |
| b5 | `let x: <I> = 1` | `[]`, registers | `binding-case-mismatch` + `let-rhs-type-mismatch` |
| b6 | `let r = @<<I>>` + backtick body | `[]`, registers | `binding-case-mismatch` |
| b7 | b3 in `lib.thetalib`, no frontmatter | `[]` | `binding-case-mismatch` |
| b8 | `params:` → `p: '<I>'` | `[]`, registers | `binding-case-mismatch` |
| b9 | `schema S { a: { p: <I> } }` | `[]`, registers | `binding-case-mismatch` |
| b10 | `schema S { a: <I> \| integer }` | `[]`, registers | `binding-case-mismatch` |

Row b5's subject loses the position's own RHS gate as well: the control draws
`theta/parse/let-rhs-type-mismatch` against `= 1` and the subject draws
nothing.

### (c) Inside a generic argument, against bug 0233's landed widen

| # | source | diagnostics |
|---|---|---|
| c1 | `fn f(p: array<{a: , Zs: string}>): integer { 1 }` | `[]` |
| c2 | `fn f(p: array<{a: integer, Zs: string}>): integer { 1 }` | `error theta/parse/binding-case-mismatch: …` |
| c3 | `schema S { a: array<{a: , Zs: string}> }` | `[]` |
| c4 | `params:` → `p: 'array<{a: , Zs: string}>'` | `[]`, registers |
| c5 | `let x: array<{a: , Zs: string}> = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected array<{a: , Zs: string}>, got integer` |

The subject is silent at nine of the ten positions of §(b) written inside
`array<…>`; c5's single line is that position's own RHS gate, which renders the
interior back to the author verbatim. The control is refused at all ten since
bug 0233's fix (0.196.0).

### (d) What still fires behind the empty entry

Each row `fn f(p: <I>): integer { 1 }`.

| # | interior | diagnostics |
|---|---|---|
| d1 | `{a: , "q": string}` | `error theta/parse/quoted-inline-field-name: quoted field name '"q"' within one inline object type; field names are identifiers` |
| d2 | `{a: , q: string, q: integer}` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'q' within one inline object type` |
| d3 | `{a: , w as "x": integer}` | `error theta/parse/renamed-inline-field-name: wire-name rename on field 'w' within one inline object type` |
| d4 | `{a: , b c: integer}` | `error theta/parse/inline-field-name-not-identifier: field name 'b c' within one inline object type is not an identifier` |
| d5 | `{a: , 3: string}` | `error theta/parse/inline-field-name-not-identifier: field name '3' within one inline object type is not an identifier` |
| d6 | `let x: {a: , b c: integer, Zs: string} = 1` | `error theta/parse/inline-field-name-not-identifier: field name 'b c' …` alone |

All four raw-key rules reach entries behind the empty type position, because
they read `interiorSource`. Row d6 is 0231's fix report's own residual
measurement, re-derived at HEAD: `Zs` draws nothing beside the `b c` refusal.

### (e) What is withheld, each against its own control

Rows measured at both the `fn` parameter and the `schema` body field position;
the two agree per row.

| # | interior | subject | control (`a: integer`) |
|---|---|---|---|
| e1 | `{a: , p: void}` | `[]` | `error theta/parse/void-in-non-return-position: 'void' is only permitted as a function or theta return type` |
| e2 | `{a: , p: array<integer, integer>}` | `[]` | `error theta/parse/generic-arity-mismatch: generic type 'array' expects 1 type argument(s); got 2` |
| e3 | `{a: , p: {}}` | `[]` | `error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.` |
| e4 | `{a: , p: Result<string, integer>}` at a `schema` field | `[]` | `error theta/parse/result-in-schema-position: 'Result' has no lowered-schema form and is not permitted in a schema-feeding position` |
| e5 | `{a: , p: { Zs: string }}` | `[]` | `error theta/parse/binding-case-mismatch: …` (nested depth) |

### (f) What lowers, and what reaches the provider

`lowerQueryResponseSchema(<annotation>, [], [])`, and for `params:`
`doc.frontmatter.params.loweredSchema` verbatim.

| # | annotation | lowered |
|---|---|---|
| f1 | `{a: , Zs: string}` | `{"type":"object","properties":{"Zs":{"type":"string"}},"required":["Zs"],"additionalProperties":false}` |
| f2 | `{a: , Zs: string, Ys: integer}` | `{"type":"object","properties":{"Zs":{"type":"string"},"Ys":{"type":"integer"}},"required":["Zs","Ys"],"additionalProperties":false}` |
| f3 | `{a: }` | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` |
| f4 | `{a: , p: void}` | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| f5 | `array<{a: , Zs: string}>` | `{}` |
| f6 | `params:` → `p: '{a: , Zs: string}'` | `…"$defs":{"__inline_41292d1fcb4b229d":{"type":"object","properties":{"Zs":{"type":"string"},…}}` |
| f7 | `{a: integer, Zs: string}` (control) | `{"type":"object","properties":{"a":{"type":"integer"},"Zs":{"type":"string"}},"required":["a","Zs"],"additionalProperties":false}` |

The lowering divides the raw interior, so it disagrees with the parser about
the field set in both directions: the uppercase key the case rule would refuse
reaches the wire (f1, f6), and the field the author wrote with no type is
dropped from `properties` (f1, f3). Row f4 lowers a `void`-typed field to the
permissive `{}` with no refusal drawn.

### (g) Bounds and neighbours

| # | source | diagnostics |
|---|---|---|
| g1 | `schema S { a: }` | `error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression` |
| g2 | `fn f(p: {a: }): integer { 1 }` | `[]`, registers |
| g3 | `fn f(p: {a:}): integer { 1 }` | `[]`, registers |
| g4 | `fn f(p: {a: , }): integer { 1 }` | `[]`, registers |
| g5 | `schema S { a: integer, }` | `[]`, registers (legal trailing comma) |
| g6 | `schema S { Zs: , a: string }` | `schema-type-not-expression` + `binding-case-mismatch` |

g1 against g2 is the position asymmetry: the declaration field position already
refuses an empty type through `theta/parse/schema-type-not-expression`, and the
inline position — which `grammar.md:109` says reuses the same `Field` form —
admits it. g5 is the control that keeps a fix from refusing the grammar's own
optional trailing comma.

## Expected behaviour

An entry whose type position is empty derives from no `Field`
(`grammar.md:101`, `schemas.md:17`: a field type is a `Type`), so the source is
refused, or — under a recovery route — the entry is skipped and the rest of the
interior is read. Under either disposition:

1. A field's verdict does not depend on a neighbour's spelling. `Zs` in
   `{a: , Zs: string}` draws exactly what `Zs` in `{a: integer, Zs: string}`
   draws, at every position of §Reproduction (b) and inside a generic argument
   (§(c)).
2. No input of this shape loads clean. Every cell of §Reproduction (b), (c) and
   (e) carries at least one error-severity diagnostic and the theta does not
   register.
3. The five rows of §Reproduction (e) fire from their existing code, at nested
   depth as well as at the interior's own level.
4. The parser's field set and the lowering's property set agree, so no key that
   reaches `$defs` escaped the case rule (§Reproduction (f) rows f1 and f6).
5. Rows a4, g5 and the whole of §Reproduction (d) do not move: a trailing comma
   stays legal, an empty type at the last entry keeps drawing what it draws
   today, and the four raw-key rules keep naming the keys they name.

## Actual behaviour / root cause

`parsePrimary` (`type-grammar.ts:585`) has one tolerant arm for punctuation it
does not recognise as a type head: `this.next(); return this.parsePrimary();`
(`:606`–`:608`). It carries no notion of an enclosing construct's separators,
so the `,` between two inline object entries is eaten exactly as a stray `%`
would be, and the recursion then returns whatever token follows. For
`{a: , Zs: string}` that token is `Zs`, which becomes field `a`'s type
(`{kind:"named", name:"Zs"}`, pushed at `:726`) and draws no diagnostic of its
own.

Control returns to the field loop on the `:` that belonged to `Zs`. The loop
requires `,` there (`:739`), does not find one, and breaks — the break the
`TypeNode` doc comment calls the genuine end of the interior, with the
exception this shape is (`:279`–`:281`). `braceClosed` is then false, while
`closingBraceSpelled` — computed by `interiorClosingBraceIndex` (`:475`) over
the token array rather than from `pos` — is true, so the case pass's gate at
`:1081` opens over a `fieldNames` holding one name.

Bug 0231's resynchronisation (`:703`–`:713`, `skipMalformedEntry` at `:790`)
sits on the other side of the colon gate (`:702`) and never runs for this
shape: the entry spells `Ident ":"`, which is precisely the well-formed path.
That is why the landed fix repaired `{a b: integer, Zs: string}` and left
`{a: , Zs: string}` where it was.

Two consumers of the same interior disagree from there. `walkType`'s case pass
(`:1082`) and its field descent (`:1229`) read the truncated arrays and judge
one field. `inlineObjectFieldKeys` (`:833`, read at `:1119`) and the lowering
read `interiorSource` / the raw interior text and see every entry — which is
what makes the raw-key rules fire (§Reproduction (d)) and the dropped fields
reach `$defs` (§(f)).

## Why it matters

The theta registers and runs. A `params:` block declaring
`p: '{a: , Zs: string}'` produces a provider-facing schema whose one property
is `Zs` — an uppercase wire key that the registered case rule refuses in every
byte-neighbour spelling, and whose theta-side field `a` does not exist in the
schema at all. Every constraint written behind the first empty type position is
unenforced: a `void` in a field type, an over-applied `array`, an empty nested
`{}`, a `Result` in a schema-feeding position and any uppercase field name pass
without a diagnostic on any channel.

The silence is order-dependent, which is the property `grammar.md:109` and
`lexical.md:16` state as false: `{Zs: string, a: }` is refused and
`{a: , Zs: string}` is not, for the same two fields. And it defeats a fix that
already landed — bug 0233 widened the four raw-key rules and bug 0154's pass to
reach inside `array<…>`, and `array<{a: , Zs: string}>` is silent there anyway
(§Reproduction (c)).

## Non-goals

- The enclosing generic argument count. `Result<{a: , Zs: string}, string>` is
  reachable from this break site and belongs to bug 0235's frame (fixed
  0.189.0) if it still miscounts; no row here claims it.
- The lowering's field division. Rows f1–f7 record what the lowering does; no
  route in §Fix changes lowered bytes for a well-formed interior, and bug 0204's
  angle-only generic split is untouched.
- Empty type positions outside an inline object interior (`let x: = 1`, a
  `params:` scalar with no type text), which are other rows' subjects.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one,
states it, and corrects the prose the choice falsifies. Both are anchored by
one settled fact: bug 0231's colon-gate resync stays as it is — this shape
enters through the well-formed path, so no route here reaches that gate by
widening it.

**(a) Where the empty type position is answered.**

- *Route `refuse-empty-type-position`.* Detect the empty type position at the
  entry itself — the token after a field's `:` is the interior's own depth-0
  `,` or `}` — and refuse it, then skip that entry the way `skipMalformedEntry`
  (`:790`) skips a colon-less one, so the entries behind it reach `fieldNames`
  and `fieldTypes`. The route must state the registry disposition: whether the
  refusal reuses `theta/parse/inline-field-name-not-identifier`'s neighbour
  rows, reuses the declaration position's
  `theta/parse/schema-type-not-expression` (`code-registry-parse.md:104`, what
  `schema S { a: }` draws today, §Reproduction (g) row g1), or mints a new row
  — and must satisfy bug 0129's count-consequence law, so a refused entry does
  not also draw a second error-severity line.
- *Route `resync-aware-skip`.* Leave the entry unrefused and stop
  `parsePrimary`'s punctuation skip (`:606`–`:608`) from crossing a separator
  the enclosing construct owns: the skip returns `undefined` at a depth-0 `,`,
  `}` or `>` instead of consuming it, so `parseUnion` yields no type for the
  empty position, the field loop's `eatPunct(",")` succeeds, and the interior is
  read to its end. This route changes a recovery every `Type` position shares,
  so it must measure the other callers of `parsePrimary` — union arms
  (`parseUnion`, `:569`), generic arguments (`parseGeneric`, `:634`) and nested
  interiors — and must state what the empty field's type becomes in
  `fieldTypes` and whether that entry contributes a name to `fieldNames`. On
  its own it draws no diagnostic for the empty position itself; if §Expected
  point 2 is to hold at rows g2–g4, the route pairs with a refusal anyway.

**(b) Binding under either route.** Every cell of §Reproduction (b), (c) and
(e) carries at least one error-severity diagnostic and does not register. The
subject and its order-reversed control agree per row (§Reproduction (a) a1 vs
a3). The five rows of §(e) fire at the interior's own level and at nested
depth. The `params:` lowering never mints a property name that escaped the case
rule (§(f) f6).

**(c) What must not move.** Row a4 (`{Zs: string, a: }`), row g5 (the legal
trailing comma), every cell of §(d), and the lowered bytes of a well-formed
interior (f7). The four locked witnesses named in §Affected are re-derived, not
weakened: any cell they hold that this fix flips is flipped by an ADDED
diagnostic and stated at the cell.

**(d) Reach.** The disposition holds at all ten positions of §Reproduction (b),
inside a generic argument (§(c)), at every nesting depth (§(e) row e5) and in a
union arm (b10).

**(e) Witness.** One new test file over `parseDoc`, `lowerQueryResponseSchema`
and `doc.frontmatter.params.loweredSchema`, carrying the rows of
§Reproduction (a)–(g) with both controls per row and the entry order pinned in
both directions, plus the no-move cells of (c). Live cover is owed only if the
chosen route changes what reaches a provider-facing schema.

## Provenance

Filed as the forward filing of bug 0231's fix report
(`.pi/tmp/fixes/0231-report.md` §Residuals 1), which measured this shape on the
fixed tree, recorded `let x: {a: , Zs: string} = 1` → `[]` and
`let x: {a: , b c: integer, Zs: string} = 1` → the `b c` refusal alone, named
the mechanism as `parsePrimary`'s punctuation skip consuming the entry
separator, and stated that a sibling filing should pick it up. No other bug
document claims the shape: `git grep` over `docs/bugs/` finds the empty type
position discussed at 0061, 0124, 0133 and 0150 for whole-annotation and
`params:` positions, none of them for an inline object entry.

Independently re-derived at HEAD `30c0cb67` (0.197.0): three scratch vitest
files over `parseDoc` (`tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`
(`src/runtime/query-schema-lowering.ts`) and
`doc.frontmatter.params.loweredSchema`, covering the five rows of
§Reproduction (a), the ten positions of (b) with both controls, the five
generic-argument rows of (c), the six raw-key rows of (d), the five withheld
rows of (e) at two positions each, the seven lowerings of (f) and the six
bounds of (g); the corpus census over `git ls-files -- '*.theta' '*.thetalib'`.
All three scratch files were deleted; the tracked tree carries this document
alone.

Two facts 0231's residual does not state, added by this measurement: the
truncation drops EVERY entry behind the first empty type position, not one
(§(a) row a5), and the fields it drops still reach the provider through the
lowering while the field the author wrote does not (§(f) rows f1, f6). Bug
0233's widen (0.196.0) was re-measured against the generic-argument rows and
does not reach this shape (§(c)).

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.

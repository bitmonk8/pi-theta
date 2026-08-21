# Bug 0227 — `{ Élan: string }` is admitted at every inline-object field-name position and lowers `Élan` into the provider-facing `$defs`, because `tokeniseType`'s ASCII-only identifier scan (`type-grammar.ts:347`) splits `É` off as a `punct` token, `TypeParser.parseObject`'s tolerant branch (`:633–638`) skips it, and the field name bug 0154's landed pass reads is the ASCII residue `lan` — so the residue's own first letter decides the verdict: `{ éLan: string }` and `{ ÉLan: string }` DRAW `theta/parse/binding-case-mismatch` on the residue `Lan` while `{ Élan: string }`, `{ Δelta: string }`, `{ Жuk: string }` and `{ 字: string }` report `[]` and register, and the same names at a `schema` declaration field are refused (`theta/parse/empty-schema-body`)

- **Status:** open. Filed as residual 2 of bug
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s
  `## Fix (0.165.0)`, which records `{ Élan: string }` as "silent and lowers
  `Élan` into `$defs`" and attributes the gap to the house case predicate
  (`first >= "A" && first <= "Z"`). The attribution is corrected here by
  measurement: at the inline slot the predicate is never asked about `Élan` at
  all — the name never enters `TypeNode.fieldNames`, because the type
  tokeniser's identifier alphabet is ASCII and `parseObject` skips a
  non-`ident` token at a field-name position. The predicate's own A–Z bound is
  real and shared by every position the rule is enforced at, and it becomes
  reachable only once a name spelled outside `[A-Za-z_]` can reach a
  field-name retention. §Fix is constraint-pinned, not settled: whether the
  inline slot widens an alphabet or refuses a key the spec's `Ident` production
  excludes is left to the run. **Ordering:** no report blocks this one.
- **Sev/Diff estimate:** S1/D3 — S1 by the letter on element 1: the spec's
  identifier production is `[A-Za-z_][A-Za-z0-9_]*`
  (`docs/spec_topics/lexical.md:13`) and the inline field-name slot reuses the
  object-schema `Field` form (`docs/spec_topics/grammar.md:109`,
  `docs/reference/grammar.md:238`), so `{ Élan: string }` derives from no
  reading, yet it reports `[]`, registers, and lowers the property key `Élan`
  with `required: ["Élan"]` into the `$defs` document
  `production-theta-producer.ts:822` hands the binder and the provider
  (§Reproduction rows i1–i7, L1, L2). Element 2 is the S2 band on the mirrored
  spelling — `{ éLan: string }` is refused by a declaration-ranged
  `binding-case-mismatch` whose subject is `Lan`, text the author did not write
  as a field name (rows m2, m3, d6). D3 because §Fix needs in-run adjudication
  between two routes with different spec consequences, and because both
  candidate sites are pinned bytes: the identifier pass and the raw-key pass
  share one `walkType` arm, `tests/inline-object-field-name-case.test.ts` is
  30 cells and `tests/schema-field-name-case.test.ts` is 46 cells as re-pinned
  at 0.165.0, and any widening of the type tokeniser's alphabet reaches every
  `Type` position and every rule reading a `TypeToken`.
- **Kind:** defect — implementation, against a normative production, with a
  spec-alphabet question the disposition must answer. Three elements.
  1. **A name the `Ident` production excludes is admitted and reaches the
     wire.** `docs/spec_topics/lexical.md:13` fixes an identifier as
     `[A-Za-z_][A-Za-z0-9_]*`; `docs/spec_topics/grammar.md:109` makes the
     inline `Field` form the object-schema one and
     `docs/spec_topics/diagnostics/code-registry-parse.md:99` states the
     consequence for the neighbouring non-identifier class in terms
     ("[Lexical Structure — Identifiers] admits no quote character, so the
     declaration spelling of the same text is already refused"). `Élan` is
     outside that alphabet exactly as `"Élan"` is, and the declaration spelling
     is likewise already refused (row d1). The inline spelling reports `[]`,
     registers, and lowers `Élan` as a property key (rows i1–i7, L1, L2).
  2. **The verdict is decided by the ASCII residue, not by the name.**
     `tokeniseType`'s local `isIdentStart` (`src/parser/type-grammar.ts:347`)
     admits `A–Z`, `a–z` and `_` only, so `É` is emitted as a single-character
     `punct` token by the fallback at `:396`. `parseObject`'s field loop
     (`:632–638`) advances over a non-`ident` token at the field-name position
     and `continue`s, so the next token — the ASCII tail `lan` — is read as the
     field name, retained at `:649`, and judged by the pass at `:963–976`.
     `lan` is lowercase, so `{ Élan: string }` passes; `Lan` is not, so
     `{ éLan: string }` and `{ ÉLan: string }` draw the code at the
     declaration's range with no subject naming (rows m2, m3, d6). The two
     spellings' verdicts are therefore inverted relative to the rule the code
     names.
  3. **The raw-key rules at the same arm do see the whole key.** The keys
     `inlineObjectFieldKeys` (`:718`) derives from `TypeNode.interiorSource`
     are the raw pre-colon entry texts, so `{ Élan: string, Élan: string }`
     draws `theta/parse/duplicate-inline-field-name` rendering `'Élan'`
     (row m4) and `{ "Élan": string }` draws
     `theta/parse/quoted-inline-field-name` (row m5). One arm therefore holds
     both a key list that carries the non-ASCII name and an identifier list
     that does not.
- **Related:**
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) —
    **fixed (0.165.0)**, the origin. Its `## Fix (0.165.0)` shipped the
    identifier pass this report measures (§Fix (a) route 1, (b) route 2, (c)
    disposition A), records this class as residual 2, and pins the two witness
    files this report's §Fix locks. Its residual-2 attribution to the house
    predicate is corrected above.
  - [0149](./0149-field-name-case-positions-unenforced.md) — **fixed
    (0.82.0)**, which enforced the lowercase-first rule at the object-schema
    body field name and the `params:` key and set the house predicate shape
    (`checkName`, `src/lexer/lexer.ts:814`, `:833`) every later position
    reuses. Both of its faces carry the same A–Z bound: `frontmatter.ts:775`
    guards on `isIdentifierShaped` (`:481–483`, the ASCII regex) and
    `theta-document.ts:2951` guards on `nameTok.kind === "ident"` from an
    ASCII-only lexer (`lexer.ts:212–213`).
  - [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) —
    **fixed (0.161.0)**, the adjacent non-identifier-key class and the precedent §Fix
    route 2 rests on: a key the `Ident` production excludes is refused at the
    raw-key site, in agreement with the declaration spelling's own refusal.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) and
    [0160](./0160-inline-object-wire-name-rename-unparsed.md) — the two other
    rules reading the raw key at the same `walkType` arm. Their cells are
    pinned bytes in the same witness file.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class covering the positional drift any fix here
    induces in `src/parser/type-grammar.ts` citations.
- **Affected** (every citation verified at HEAD `758e3c0d`, 0.173.0; cite by
  symbol, the line numbers being 0134's class):
  - **The spec** — `docs/spec_topics/lexical.md:13`, the `Ident` production and
    "The **first letter's case is enforced** by the parser"; `:16`, the
    lowercase-first bullet naming schema field names; `:20`, the reserved
    spellings. `docs/spec_topics/grammar.md:109`, the "**Inline object
    types.**" paragraph and its `Field`-form equivalence;
    `docs/reference/grammar.md:225` (`ObjectType ::= "{" Field ("," Field)*
    ","? "}"`) and `:238`, the mirror bullet.
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`,
    `theta/parse/binding-case-mismatch`, *Trigger* "Identifier in a binding /
    parameter / fn-name / field-name position does not start with a lowercase
    letter or `_`"; `:99`,
    `theta/parse/quoted-inline-field-name`, whose *Trigger* states the
    identifier-alphabet reasoning for the quote class; `:98`,
    `theta/parse/duplicate-inline-field-name`, whose keys are raw entry text;
    `:97`, `theta/parse/empty-schema-body`, whose *Trigger* covers "a body
    whose first token is not a plain `ident: Type` field list" — the row that
    refuses the declaration spelling (rows d1, d2, s1).
  - **The admitting path** — `src/parser/type-grammar.ts`: `tokeniseType`
    (`:342`) and its local `isIdentStart` (`:347`), ASCII-only; the `punct`
    fallback at `:396`; `TypeParser.parseObject` (`:603`), its field loop's
    non-`ident` branch (`:633–638`) and the retention push (`:649`); bug 0154's
    identifier pass in `walkType`'s `object` arm (`:963–976`) with the house
    predicate at `:969` and the reserved exclusion (`RESERVED_KEYWORDS`,
    `:125`); `inlineObjectFieldKeys` (`:718`), the raw-key list the three
    non-identifier rules read.
  - **The shared predicate's other three sites** — `src/lexer/lexer.ts:814`
    (`checkName`) and its `first >= "A" && first <= "Z"` at `:833`;
    `src/parser/theta-document.ts:2951–2953`, inside `parseSchemaObjectBody`
    (`:2882`) — the `schema-field-name-case` surface, whose predicate carries
    the same bound and is unreachable for a non-ASCII name because the outer
    lexer's `isIdentStart` (`src/lexer/lexer.ts:212–213`) is ASCII-only and the
    malformed body is refused instead (rows s1, d1, d2);
    `src/parser/frontmatter.ts:775–777`, inside `extractParsedParams` (`:726`),
    guarded by `isIdentifierShaped` (`:481–483`).
  - **The wire path** — `src/parser/body-type-lowering.ts:173–195`
    (`lowerInlineObject`), whose field name is `entry.slice(0, colon).trim()`
    (`:188`) over `splitTopLevel`, so the non-ASCII name survives verbatim;
    `src/extension/production-theta-producer.ts:822`
    (`paramsSchema: params.loweredSchema` into the binder envelope).
  - **The witness locks** — `tests/inline-object-field-name-case.test.ts`,
    **30** cells, bug 0154's shipped witness (its LEDGER at `:100`);
    `tests/schema-field-name-case.test.ts`, **46** cells as re-pinned at
    0.165.0, row f7 included. Neither file carries a non-ASCII cell.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files. Every
    non-ASCII byte in them sits inside a `//` comment (em dashes); no field
    name, binding, parameter or declaration name in committed theta source is
    non-ASCII, so no committed source moves under either §Fix route. GOV-15:
    rows i1–i7, p1, p2, q1 load with no `E`-severity diagnostic, so they are
    inside the
    [loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
    set and a refusal is disposed of by the
    [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md)
    as an addition over an in-repo input set that is empty.
- **Observed at:** `0.173.0` (HEAD `758e3c0d`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, frontmatter
  `---\nmode: subagent\n---` on lines 1–3 so the source under test sits on
  line 4. Diagnostic lists are the whole unfiltered `doc.diagnostics` in
  emission order, each range as `line:col-line:col`. Lowered documents are
  `doc.frontmatter.params.loweredSchema` verbatim. "registers" is
  `doc.frontmatter !== null`. Three scratch vitest files, run on the outputs
  quoted below, then deleted; the tracked tree carries this document alone.

## Summary

`docs/spec_topics/lexical.md:13` fixes an identifier as
`[A-Za-z_][A-Za-z0-9_]*`. `docs/spec_topics/grammar.md:109` and
`docs/reference/grammar.md:238` make an inline object type's field name a
schema field name. `Élan` is outside that alphabet, so it spells no field name
at either position — and the declaration spelling is refused today (`schema S {
Élan: string }` draws `theta/parse/empty-schema-body`, row s1), while the
inline spelling reports `[]`, registers, and lowers `Élan` as the property key
with `required: ["Élan"]` (rows i1–i7, L1, L2).

The cause is upstream of the case predicate. `tokeniseType`'s local
`isIdentStart` (`type-grammar.ts:347`) admits ASCII letters and `_` only, so
`É` is emitted as a one-character `punct` token (`:396`); `parseObject`'s field
loop advances over a non-`ident` token at a field-name position and `continue`s
(`:633–638`), so the token it then reads as the field name is the ASCII tail
`lan`, retained at `:649`. Bug 0154's identifier pass (`:963–976`) therefore
judges the residue and never the name. The residue's own first letter decides
the verdict: `{ Élan: string }`, `{ Δelta: string }`, `{ Жuk: string }` and
`{ 字: string }` are silent, and `{ éLan: string }` and `{ ÉLan: string }` draw
`theta/parse/binding-case-mismatch` at the declaration's range on the residue
`Lan` — a name whose first character is not an ASCII letter at all is refused
by the rule about first letters, and one whose first character is uppercase is
admitted.

The raw-key rules sharing that `walkType` arm do see the whole key:
`{ Élan: string, Élan: string }` draws `theta/parse/duplicate-inline-field-name`
rendering `'Élan'` (row m4) and `{ "Élan": string }` draws
`theta/parse/quoted-inline-field-name` (row m5). The house case predicate's own
`first >= "A" && first <= "Z"` bound (`lexer.ts:833` and its three copies) is
shared by every position the rule is enforced at and is unreachable for a
non-ASCII name at all four, each for its own upstream reason.

## Reproduction

Offline, deterministic, at HEAD `758e3c0d`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts`) over the shipped `parseThetaDocument`. Each cell is
the whole diagnostic list in emission order, unfiltered.

### (a) The inline positions — admitted

| # | source | diagnostics | registers |
|---|---|---|---|
| i1 | `fn h(p: { Élan: string }): number { 1 }` | `[]` | yes |
| i2 | `schema S { a: { Élan: string } }` | `[]` | yes |
| i3 | `fn h(): { Élan: string } { 1 }` | `[]` | yes |
| i4 | `schema S = { Élan: string }` | `[]` | yes |
| i5 | `schema S { a: array<{ Élan: string }> }` | `[]` | yes |
| i6 | `schema S { a: { élan: string } }` | `[]` | yes |
| i7 | `schema S { a: { b: string, Élan: string } }` | `[]` | yes |
| g1 | `schema S { a: { Δelta: string } }` | `[]` | yes |
| g2 | `schema S { a: { Жuk: string } }` | `[]` | yes |
| g3 | `schema S { a: { 字: string } }` | `[]` | yes |
| g4 | `schema S { a: { É: string } }` | `[]` | yes |
| tl1 | `fn h(p: { Élan: string }): number { 1 }` as `lib.thetalib`, no frontmatter | `[]` | n/a |
| q1 | `let r: { Élan: boolean } = @`…`?` | `[]` | yes |

Control on the same shape with an ASCII uppercase-first name, so no row above
is explained by a harness that has stopped reaching the pass:

| # | source | diagnostics |
|---|---|---|
| c1 | `schema S { a: { Elan: string } }` | `error theta/parse/binding-case-mismatch @4:1-4:33: binding name must start with a lowercase letter or _` |

Rows g3 and g4 are silent for a second reason: the whole field is lost. `字` and
`É` are skipped by `:633–638`, the following token is `:`, and the field loop
breaks at its tolerant "malformed field" arm, so no field is recorded.

### (b) The residue decides the verdict

| # | source | diagnostics |
|---|---|---|
| m2 | `schema S { a: { éLan: string } }` | `error theta/parse/binding-case-mismatch @4:1-4:33: binding name must start with a lowercase letter or _` |
| m3 | `schema S { a: { ÉLan: string } }` | `error theta/parse/binding-case-mismatch @4:1-4:33: …` |
| d6 | `schema S { a: { b: string, éLan: string } }` | `error theta/parse/binding-case-mismatch @4:1-4:44: …` |
| d5 | `schema S { a: { b: string, Élan: string } }` | `[]` |

The range is the declaration's (§Fix (b) route 2 of bug 0154, the settled
convention at this seam), so nothing in the diagnostic names which text was
judged. The judged text is `Lan`.

### (c) The other three positions carrying the same predicate

| # | source | diagnostics | registers |
|---|---|---|---|
| s1 | `schema S { Élan: string }` | `error theta/parse/empty-schema-body @4:1-4:26: 'S' has no fields; an empty schema cannot be validated.` | yes |
| s2 | `schema S { éLan: string }` | `error theta/parse/empty-schema-body @4:1-4:26: …` | yes |
| d1 | `schema S { b: string, Élan: string }` | `error theta/parse/empty-schema-body @4:1-4:37: …` | yes |
| d2 | `schema S { b: string, éLan: string }` | `error theta/parse/empty-schema-body @4:1-4:37: …` | yes |
| d3 | `schema S { b: string, Elan: string }` | `error theta/parse/binding-case-mismatch @4:23-4:27: …` | yes |
| f1 | `fn h(Élan: string): number { 1 }` | `error theta/parse/fn-param-not-identifier @4:6-4:7: fn parameter name must be an identifier` | yes |
| f2 | `fn h(a: string, Élan: string): number { 1 }` | `error theta/parse/fn-param-not-identifier @4:17-4:18: …` | yes |
| b1 | `let Élan = 1` | `error theta/parse/let-without-initialiser @4:1-4:6: let binding 'É' has no initialiser` | yes |
| p1 | `---\nmode: subagent\nparams:\n  Élan: string\n---\n1\n` | `[]` | yes |
| p2 | `---\nmode: subagent\nparams:\n  éLan: string\n---\n1\n` | `[]` | yes |

The `schema` declaration field name (`schema-field-name-case`'s surface) never
admits a non-ASCII name: its predicate carries the same A–Z bound, and the
outer lexer's ASCII-only `isIdentStart` means the body's field list is
malformed and the declaration is refused by the row that owns that shape
(`code-registry-parse.md:97`). Rows d1 and d2 also lose the well-formed field
`b`. The `params:` KEY position (`frontmatter.ts:775`, guarded by
`isIdentifierShaped`) does admit, and lowers the key verbatim (rows p1, p2 and
L3 below); it is scoped out below rather than claimed.

### (d) The raw-key rules at the same arm

| # | source | diagnostics |
|---|---|---|
| m4 | `schema S { a: { Élan: string, Élan: string } }` | `error theta/parse/duplicate-inline-field-name @4:1-4:47: duplicate field name 'Élan' within one inline object type` |
| m5 | `schema S { a: { "Élan": string } }` | `error theta/parse/quoted-inline-field-name @4:1-4:35: quoted field name '"Élan"' within one inline object type; field names are identifiers` |

### (e) The wire schemas

`doc.frontmatter.params.loweredSchema` verbatim:

| # | source | lowered |
|---|---|---|
| L1 | `params:\n  p: { Élan: string }` | `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_e24cdad12d7e338f"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_e24cdad12d7e338f":{"type":"object","properties":{"Élan":{"type":"string"}},"required":["Élan"],"additionalProperties":false}}}` |
| L2 | as L1 | the `$defs` entry's property key is `Élan` and `required` is `["Élan"]` |
| L3 | `params:\n  Élan: string` | `{"type":"object","properties":{"Élan":{"type":"string"}},"required":["Élan"],"additionalProperties":false}` |

L1's `$defs` entry is what `production-theta-producer.ts:822` hands the binder
envelope, so `Élan` is the property key the provider sees, with no `as
"WireName"` rename written — the mechanism `docs/spec_topics/schemas.md` names
for a property name that is not theta-identifier-compatible, and one the inline
`Field` form does not admit (`grammar.md:109`).

### (f) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. Every non-ASCII byte in
them is inside a `//` comment; filtering comment lines out leaves zero hits, so
no committed theta source carries a non-ASCII name in any position.

## Expected behaviour

`Élan` derives from no `Ident` (`lexical.md:13`), and the inline field-name slot
admits an identifier (`grammar.md:109`, `docs/reference/grammar.md:238`;
`code-registry-parse.md:99` states the same reasoning for the quote class), so
rows i1–i7, g1–g4, tl1, q1 are refused rather than admitted, at every `Type`
position and every nesting depth, and the theta does not register on the
footing row s1's declaration spelling already has. Which registered code
carries the refusal is §Fix's adjudication.

`{ éLan: string }` and `{ ÉLan: string }` (rows m2, m3, d6) are refused too,
but not by a rule about first letters applied to text the author did not write
as a field name: no diagnostic's verdict is derived from the ASCII residue of a
name.

The wire schemas follow from the refusal: a refused theta lowers nothing, so
L1's `$defs` property key `Élan` is unreachable rather than sanitised. No
lowering changes.

Row c1 (ASCII uppercase-first), rows m4 and m5 (the raw-key rules), row d3, and
the four refusals at the other positions (s1, s2, d1, d2, f1, f2, b1) do not
move.

## Actual behaviour / root cause

Three steps, in order.

1. **The type tokeniser's alphabet is ASCII.** `tokeniseType`
   (`src/parser/type-grammar.ts:342`) declares its own `isIdentStart` at `:347`
   as `(c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_"`. `É`
   matches no scanner arm, so the fallback at `:396` pushes
   `{ kind: "punct", text: "É", start: i }`.
2. **`parseObject` skips the token and reads the residue as the name.** The
   field loop (`:632–638`) peeks the field-name token, and when its kind is not
   `ident` it advances one token and `continue`s. The next iteration peeks
   `lan`, which IS an `ident`, consumes the `:` behind it, and pushes `lan` into
   `fieldNames` (`:649`). When the residue is empty (`{ É: string }`, `{ 字:
   string }`) the next token is `:` instead, the loop breaks at its tolerant
   "malformed field" arm, and the field is dropped entirely (rows g3, g4).
3. **The identifier pass judges what it was handed.** Bug 0154's pass
   (`:963–976`) iterates `node.fieldNames`, skips a reserved spelling, and
   tests `first >= "A" && first <= "Z"` (`:969`). It is given `lan` for
   `{ Élan: string }` (silent) and `Lan` for `{ éLan: string }` (refused). The
   pass is behaving exactly as specified over the list it reads; the list is
   wrong.

The house predicate's A–Z bound is real at all four enforcement sites —
`checkName` (`src/lexer/lexer.ts:814`, `:833`), the `fn` parameter arm
(`src/parser/theta-document.ts:2466`), the schema-body arm (`:2953`) and the
`params:` key arm (`src/parser/frontmatter.ts:777`) — and at three of them it is
unreachable for a non-ASCII name because an upstream ASCII guard fires first:
the outer lexer's `isIdentStart` (`src/lexer/lexer.ts:212–213`) for the first
three, `isIdentifierShaped` (`src/parser/frontmatter.ts:481–483`) for the
fourth. The `schema` declaration surface converts that into a refusal (rows s1,
s2, d1, d2, per `code-registry-parse.md:97`) and the `fn` parameter surface into
its own (rows f1, f2). The `params:` key surface and the inline surface convert
it into silence, and both lower the name verbatim.

The names survive into the wire because the lowering re-splits the same bytes:
`lowerInlineObject` (`src/parser/body-type-lowering.ts:173–195`) takes each
field name as `entry.slice(0, colon).trim()` (`:188`) over `splitTopLevel`,
which is byte-transparent. That is also the split
`inlineObjectFieldKeys` (`src/parser/type-grammar.ts:718`) derives the raw-key
rules' keys from, which is why `duplicate-inline-field-name` and
`quoted-inline-field-name` name `Élan` correctly (rows m4, m5) from the same
`walkType` arm that admits it under the identifier rule.

## Why it matters

- **A name the spec's `Ident` production excludes loads, registers, and reaches
  the provider-facing JSON Schema.** Rows i1–i7 report `[]`; row L1 puts
  `"properties":{"Élan":…},"required":["Élan"]` inside the `$defs` entry
  `production-theta-producer.ts:822` hands the binder envelope, with no `as
  "WireName"` rename written and none admissible in the inline form
  (`grammar.md:109`).
- **The two spellings' verdicts are inverted.** `{ Élan: string }` (uppercase
  first character) is admitted and `{ éLan: string }` (lowercase first
  character) is refused, by a rule whose message reads "binding name must start
  with a lowercase letter or _". An author reading the diagnostic cannot
  reconstruct which text produced it, the range being the whole declaration.
- **The same bytes disagree across positions.** `schema S { Élan: string }` is
  refused (row s1) and `schema S { a: { Élan: string } }` is accepted (row i2),
  where `grammar.md:109` says the two carry the same field semantics — the same
  discontinuity bug 0154 closed for the ASCII case and bug 0176 closed for the
  quoted case.
- **One `walkType` arm holds two disagreeing views of the same interior.** The
  raw-key list names `Élan` (rows m4, m5) while the identifier list holds `lan`.
  A later rule keyed on either list inherits whichever view it picks, silently.
- **A well-formed sibling field is lost at the declaration surface.** Rows d1
  and d2 drop `b: string` along with the ill-spelled field; the refusal that
  covers it is `empty-schema-body`, whose message says the schema has no fields.
- **The corpus cost of closing it is zero committed source.** No committed
  `.theta` / `.thetalib` carries a non-ASCII name in any position.

## Non-goals

- **The `params:` KEY position.** Rows p1, p2 and L3 measure that
  `frontmatter.ts:775`'s `isIdentifierShaped` guard admits `Élan` and `éLan`
  silently and that the key is lowered verbatim into `properties` /
  `required`. Recorded here so the measurement is not lost; this report claims
  the inline-object slot only, and a fix here neither closes that position nor
  is blocked by it.
- **Widening the theta identifier alphabet.** `lexical.md:13` is ASCII by
  letter. Whether theta admits non-ASCII identifiers at all is a spec question
  for theta 2.0, not a defect; this report is about what happens to a name that
  the current alphabet excludes.
- **The lost sibling field at the declaration surface** (rows d1, d2). The
  refusal there is prescribed by `code-registry-parse.md:97`; how much of a
  malformed body's field list is recovered is not this report's subject.
- **`{ É: string }` and `{ 字: string }` as field-DROP shapes** (rows g3, g4).
  They are inside this report's refusal set as inputs, but the tolerant
  "malformed field" break that loses them is `parseObject`'s recovery, whose
  reshaping this report does not claim.
- **The field's TYPE slot.** No row here touches it; bug 0044's and bug 0154's
  pinned TYPE-slot cells do not move.
- **The declaration-ranged emission convention.** Bug 0154 §Fix (b) route 2
  settled it for this pass; tightening the range is a separate change with its
  own DIAG-4 and witness consequences.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts` — bug 0134's adjudicated do-not-chase class.

## Fix

Not settled. The two routes below are constraint-pinned; the run selects one
and states it.

**(a) Where the non-ASCII name is caught.**

- *Route 1 — widen the alphabet the inline field-name slot reads.*
  `tokeniseType`'s `isIdentStart` / `isIdentPart` (`type-grammar.ts:347–349`)
  admit the character class the rule wants to judge, so `Élan` arrives as one
  `ident` token, enters `fieldNames` (`:649`), and reaches the pass at `:969` —
  at which point the house predicate's own A–Z bound becomes load-bearing and
  must be stated: `first >= "A" && first <= "Z"` admits `Élan`, so the
  predicate widens with the alphabet or the widening changes nothing. Two costs
  are measured, not speculative: the token kind reaches every rule reading a
  `TypeToken`, not only this pass (`parsePrimary`, the generic-argument
  recognisers, `NamedType` resolution), so a widened `ident` becomes a
  candidate named type as well as a candidate field name; and the four
  positions sharing the predicate (`lexer.ts:833`,
  `theta-document.ts:2466`/`:2953`, `frontmatter.ts:777`) then disagree with
  the inline one unless they widen too, which is a change to what `lexical.md:13`
  admits and therefore a spec question, not an implementation one.
- *Route 2 — refuse the key at the raw-key site, on the spec's alphabet.*
  `walkType`'s `object` arm already derives the raw entry keys
  (`inlineObjectFieldKeys`, `:718`) that carry `Élan` intact (rows m4, m5), and
  bug 0176 shipped exactly this shape for the quote class with the reasoning
  the registry states at `code-registry-parse.md:99` — the declaration spelling
  is already refused, so the inline one comes into agreement. A non-ASCII key
  is the same class under the same sentence (`lexical.md:13`). This route
  leaves the tokeniser, `parseObject` and the house predicate untouched, and
  must state: which registered code carries it (a widening of
  `quoted-inline-field-name`'s subject to "not identifier-shaped" is a DIAG-2
  *Trigger* change with its `docs/reference/diagnostics.md` mirror co-edited; a
  new code needs its own row, spec anchor and *Message*), and its precedence
  against the duplicate, quoted and rename rows, which the registry already
  orders (repeat first, quote-led second, rename third).

**(b) Element 2 is binding under either route.** The residue verdict must go:
no diagnostic's subject may be the ASCII tail of a name the author wrote. Under
route 1 it goes because the whole name becomes one token; under route 2 the
`punct`-skip at `:633–638` must stop feeding the identifier pass a residue —
state whether the pass is gated on the interior carrying no non-identifier key,
or `parseObject` stops skipping, and prove `{ éLan: string }` and
`{ ÉLan: string }` (rows m2, m3, d6) no longer draw
`binding-case-mismatch` for the residue.

**(c) Reach and multiplicity.** The chosen refusal runs at every `Type`
position and every nesting depth (rows i1–i7, i5's generic argument, tl1, q1),
one diagnostic per offending key in source order. Route 2 inherits the
neighbour rows' generic-argument carve-out question explicitly: the two
raw-key rules withhold under `insideGenericArgument`, bug 0154's identifier
pass does not (row i5 fires for the ASCII case), so a route-2 refusal must say
which side it takes and pin it.

**(d) Locks.** `tests/inline-object-field-name-case.test.ts` (30 cells) and
`tests/schema-field-name-case.test.ts` (46 cells, as re-pinned at 0.165.0) are
pinned bytes; a fix here adds cells rather than rewriting them, and any cell it
must move is authorised in the fix record with the reason. Rows m4, m5, c1, d3
and the other-position refusals (s1, s2, d1, d2, f1, f2, b1) are tripwires the
witness carries. The `params:` KEY position stays as measured (rows p1, p2, L3)
unless the run states otherwise.

## Provenance

Filed as residual 2 of bug
[0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s
`## Fix (0.165.0)`, which records `{ Élan: string }` as silent and lowering
`Élan` into `$defs`, and attributes the gap to the house case predicate with
`tokeniseType`'s ASCII-only scan named beside it.

Independently re-derived at HEAD `758e3c0d` (0.173.0), not copied from that
record: three scratch vitest files over `parseDoc` (`tests/helpers/e2e-s1.ts`)
covering every row in §Reproduction (a)–(e), then deleted; the corpus census
run over `git ls-files -- '*.theta' '*.thetalib'`. Every `src/`, `tests/` and
spec citation above was verified against the tree at HEAD.

One correction to the residual's stated cause: the shipped predicate is not
what admits `Élan` at this slot. The name never reaches the predicate — it is
split into a `punct` token and an ASCII residue by `tokeniseType` (`:347`,
`:396`) and the residue is what `parseObject` retains (`:633–638`, `:649`) and
the pass judges (`:969`). The residual's two other facts hold as written: the
predicate does test A–Z only, at all four positions the rule is enforced at,
and `tokeniseType`'s identifier scan is ASCII-only. The measured consequence
the residual does not state is element 2 — `{ éLan: string }` and
`{ ÉLan: string }` are refused on the residue while `{ Élan: string }` is
admitted.

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing. Two scratch files belonging to sibling sessions
(`tests/scratch-0226-*.test.ts`, `tests/scratch-token-join-*0228*.test.ts`)
were present in the untracked tree throughout and are not this filing's; no
`src/` file was modified by any session during measurement
(`git diff HEAD --stat` empty on `src/`).

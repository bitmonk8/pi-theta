# Bug 0229 — `topLevelColon` (`params.ts:1781`) tracks quotes without honouring backslash escapes, while the split feeding it (`splitTopLevelSegments`, `:1867–1875`) does, so an inline object field whose wire-name string carries an escaped quote — `{a as "w\"x": integer}` — has no top-level `:`, spells no key, and is skipped by all three raw-key rules (`type-grammar.ts:721–724`) AND by both lowerers (`params.ts:1268–1270`, `body-type-lowering.ts:183–186`): the field vanishes from the lowered schema with zero diagnostics at every measured `Type` position, and the theta registers

- **Status:** fixed (0.182.0)
- **Sev/Diff estimate:** S1/D2 — S1 because the author's field is deleted from
  the artefact with nothing on any channel: `{a as "w\"x": integer}` reports
  `[]` at eight `Type` positions and at `params:` (§Reproduction A), lowers to
  `{"type":"object","properties":{},"required":[],"additionalProperties":false}`
  at a query-annotation root and to the fully permissive `{}` — no `$defs`
  hoist, no `type`, no `required` — through `params:` and the body-type map
  (§Reproduction C), and the field's own type is never lowered either, so
  `{a as "w\"x": Cat}` draws no `theta/parse/unresolved-named-type` where
  `{b: Cat}` does (§Reproduction B). The same input WITHOUT the escape
  (`{a as "w": integer}`) draws `theta/parse/renamed-inline-field-name` at
  every one of those positions, so the escape is a one-character bypass of a
  landed `E`-severity refusal, and `grammar.md:109` states the refused reading
  normatively. D2 because the substrate is shared: `topLevelColon` has three
  callers (`type-grammar.ts:721`, `params.ts:1267`,
  `body-type-lowering.ts:183`) and its result is the key three registry rows
  compare and the property name both lowerers mint, so an escape-aware colon
  scan moves keys for `theta/parse/duplicate-inline-field-name` and
  `theta/parse/quoted-inline-field-name` as well; the alternative — refuse the
  keyless entry — needs a route decision and a DIAG-2 *Trigger* edit. Three
  landed cells pin the current bytes (§Affected), so any route moves pinned
  bytes with authorisation rather than by accident.
- **Kind:** defect — implementation, against a normative production and against
  a landed registry row's own reach. Two elements.
  1. **Two scanners over one string disagree about escapes.**
     `splitTopLevelSegments` (`src/parser/params.ts:1855`) consumes a
     backslash and the character behind it while inside a quoted region
     (`:1869–1872`), so `{a as "w\"x": integer, b: integer}` splits into the
     two entries the author wrote. `topLevelColon` (`:1781`) has the same
     quote latch with no backslash arm (`:1786–1791`): it closes the string at
     the ESCAPED `"`, reopens one at the `"` behind `x`, and never leaves that
     region, so the entry's `:` is never at depth 0 and the function returns
     `-1`.
  2. **Every consumer treats `-1` as "no field here".**
     `inlineObjectFieldKeys` (`src/parser/type-grammar.ts:718`) `continue`s at
     `:721–724`, so the entry reaches none of the three raw-key rules;
     `hoistInlineObjectType` (`src/parser/params.ts:1266`) `continue`s at
     `:1268–1270`, and `lowerInlineObject`
     (`src/parser/body-type-lowering.ts:173`) at `:183–186`, so the entry
     contributes no `properties` member and no `required` entry. The two
     outcomes therefore compound: no diagnostic, and no field.
- **Related:**
  - [0160](./0160-inline-object-wire-name-rename-unparsed.md) — **fixed
    (0.172.0)**, the origin. Its `## Fix (0.172.0)` *Residuals* item 1 records
    this class as a deliberate bound of the refusal route ("Widening it would
    move 0052's and 0176's keys and is outside this fix … Needs its own
    report") and pins it in both directions by cells g20/g21 and `CONTROL G4`
    of `tests/inline-object-wire-name-rename-refusal.test.ts` plus a sentence
    in the new row's *Trigger*. **Not a duplicate:** 0160 is closed on the
    unescaped rename spelling, which now refuses; this report claims the
    escaped spelling, which still drops the field. One statement of that record
    is corrected here (§Actual behaviour): the *shared split* is escape-aware;
    only `topLevelColon` is not.
  - [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) —
    **fixed (0.161.0)**, the immediate neighbour row and a second bypassed
    refusal. `theta/parse/quoted-inline-field-name` triggers on a key whose
    FIRST character is `"` or `'`; `{"w\"x": integer}` is such a spelling and
    draws nothing at any measured position, because the same colon scan leaves
    it keyless (§Reproduction A row A7). Its key is the same
    `splitTopLevel` / `topLevelColon` pair, which is why a fix here is a fix
    to that row's input set too.
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) — the
    inline identifier rules over the same interior. Its 30-test witness
    (`tests/inline-object-field-name-case.test.ts`) is one of the three files
    a key change re-measures.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    the first rule keyed on this raw text; `{a as "w\"x": integer, a as "w\"x":
    string}` is two entries with one spelling and draws nothing
    (§Reproduction A row A8).
- **Affected** (every citation verified at HEAD `758e3c0d`, v0.173.0):
  - **The colon scan** — `src/parser/params.ts:1781` (`topLevelColon`), doc
    comment `:1780`. `:1782–1783` the `depth` / `quote` state; `:1786–1791`
    the in-quote branch, **the defect site**: it advances one character at a
    time and closes on `c === quote` with no backslash arm; `:1792–1793` the
    quote open; `:1798–1799` the `depth === 0` colon return; `:1802` the `-1`
    return this class takes.
  - **The split that disagrees with it** — `src/parser/params.ts:1855`
    (`splitTopLevelSegments`); `:1867–1875` the in-quote branch, with the
    backslash consume at `:1869–1871`. `splitTopLevel` (`:1913`) is the
    non-empty filter over it and is what all three callers use.
  - **The rule site** — `src/parser/type-grammar.ts:718`
    (`inlineObjectFieldKeys`), whose doc comment already states the
    consequence at `:710–711` ("An entry with no top-level `:` contributes no
    key"). `:721–724` the skip. Downstream of it: `:999` the two shared gates
    (`!insideGenericArgument && node.closingBraceSpelled`), `:1000` the key
    list, `:1037–1046` bug 0176's quote-led emission, `:144`
    `INLINE_FIELD_RENAME`, `:1075–1083` bug 0160's rename emission. No key
    reaches any of the three.
  - **The lowerers** — `src/parser/params.ts:1266–1279`
    (`hoistInlineObjectType`; the skip at `:1268–1270`, the `defineRecordField`
    write at `:1278`, the `required.push` at `:1279`) and `:1281–1283`, the
    `required.length === 0` arm that returns the bare `{}` measured at
    `params:`; `src/parser/body-type-lowering.ts:173` (`lowerInlineObject`),
    the skip at `:183–186` and the `fields.push` at `:192`.
  - **The registry rows whose input sets this class sits outside** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:98`
    (`duplicate-inline-field-name`), `:99` (`quoted-inline-field-name`),
    `:100` (`renamed-inline-field-name`). All three *Triggers* state the
    "spells no key" carve-out; `:100` additionally names this exact spelling
    and attributes it to escape-blindness "in the shared split". Mirrors:
    `docs/reference/diagnostics.md:144`, `:145`, `:146`.
  - **The normative prose** — `docs/spec_topics/grammar.md:109` ("a field
    spelled `ident as "WireName": Type` inside an inline object is
    `theta/parse/renamed-inline-field-name`, judged over the same raw entry
    text the duplicate and quoted rules below read"), and its statement that
    inline fields "carry the same field semantics … each field is required by
    default"; `docs/spec_topics/schemas.md:21`/`:23` (the rename's position
    between identifier and type) and `:39` (the "only mechanism" sentence);
    `docs/spec_topics/schema-subset.md:78` (`properties` keyed by wire names,
    `required` carrying every wire name).
  - **The landed cells that pin the current bytes** —
    `tests/inline-object-wire-name-rename-refusal.test.ts:688` (cell g20, the
    annotation root, `expected: []`), `:689` (cell g21, `params:`,
    `expected: []`), `:676–687` the comment recording the residual,
    `:1349–1383` (`CONTROL G4`, the lowered bytes of both escaping spellings),
    `:1411` (`CONTROL H1`'s named seven-cell empty-expectation list, which
    contains g20 and g21). Two further files read the same key and are the rest
    of the lock set: `tests/inline-object-quoted-field-name-refusal.test.ts`
    (16 tests) and `tests/inline-object-field-name-case.test.ts` (30 tests);
    the rename file itself is 25 tests. All three green at HEAD (71 passed).
- **Observed at:** v0.173.0 (`758e3c0d`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns. Two scratch vitest probes
  (written, run, deleted; tree swept) driving the real `parseThetaDocument`
  through `tests/helpers/e2e-s1.ts`'s `parseDoc`, plus direct
  `lowerQueryResponseSchema`, `lowerParamsFieldType`, `buildBodyTypeSchemas`
  and `respondToolWireSchema` calls. Every value below is that run's output
  verbatim. `src/`, `tests/`, other bug documents and `docs/bugs/README.md` are
  unmodified by this filing.

## Summary

Bug 0160 shipped `theta/parse/renamed-inline-field-name` in 0.172.0: an inline
object field written `a as "w": integer` is refused at every `Type` position,
because the rename is a schema-declaration-only clause. The refusal reads the
raw text before each entry's own top-level `:`. One character defeats it. Write
an escaped quote inside the wire-name string — `{a as "w\"x": integer}` — and
`topLevelColon` (`params.ts:1781`) loses track of the string: it closes the
literal at the escaped `"`, opens a new one at the `"` behind `x`, and reports
no top-level colon. The entry then "spells no key", which every consumer reads
as "no field here".

The result is a silent deletion. The document reports `[]` at the query
annotation, a `let` annotation, a `schema` body field, an `fn` parameter, an
`fn` return, a nested inline body, a generic argument and a `.thetalib` `fn`
parameter, and at `params:`; the theta registers. The lowered artefact has no
such property: at a query-annotation root the schema is
`{"type":"object","properties":{},"required":[],"additionalProperties":false}`,
and through `params:` or the body-type map the whole inline object collapses to
the permissive `{}` — the `required.length === 0` arm at `params.ts:1281–1283`
— so the parameter accepts any JSON at all. The field's type is never lowered
either: `{a as "w\"x": Cat}` draws no `theta/parse/unresolved-named-type` while
`{b: Cat}` does, which is the direct observable that nothing about the field
survives.

The split is not the culprit. `splitTopLevelSegments` (`:1867–1875`) consumes
backslash escapes, so `{a as "w\"x": integer, b: integer}` is correctly two
entries — and only `b` reaches the schema, under the same `$defs` slug
`__inline_8cc8cb1e7074a3af` that `{b: integer}` alone produces. The lowered
bytes are indistinguishable from a source that never wrote the first field.

The class is not confined to the rename spelling. `{"w\"x": integer}` is a
quote-led key, which bug 0176's row refuses — and it too draws nothing and
drops, for the same reason. So does `{a as 'w\'x': integer}`, and so does the
duplicate spelling `{a as "w\"x": integer, a as "w\"x": string}`, which bug
0052's row would otherwise refuse. One escape-blind scanner takes three landed
`E`-severity rules out of play at once.

## Reproduction

All at HEAD `758e3c0d`. `diagnostics` is the whole unfiltered list. Every
fixture carries `mode: prompt`; body fixtures end `let a = 1` + `a`. The
`params:` fixtures write the type as a single-quoted YAML scalar so the interior
double quote and its backslash reach the theta type grammar intact — the
spelling bug 0160's cell g21 uses.

### (A) Zero diagnostics at every position, against the unescaped control

`ESC` is `{a as "w\"x": integer}`; `CTL` is `{a as "w": integer}`.

| # | position | source | `ESC` diagnostics | `CTL` diagnostics |
|---|---|---|---|---|
| A1 | query annotation | `let r = @<T>` + `` `hi` `` | `[]` | `error theta/parse/renamed-inline-field-name: wire-name rename on field 'a' within one inline object type` |
| A2 | `let` annotation | `let x: T = 1` | `[]` | same one line |
| A3 | `schema` body field | `schema S { p: T }` | `[]` | same one line |
| A4 | `fn` parameter | `fn f(p: T) { 1 }` | `[]` | same one line |
| A5 | `fn` return | `fn f(): T { 1 }` | `[]` | same one line |
| A6 | nested body | `let r = @<{q: T}>` + `` `hi` `` | `[]` | same one line |
| A7 | `params:` | `params:` → `p: 'T'` | `[]` | same one line |
| A8 | `.thetalib` `fn` parameter | `fn f(p: T) { 1 }` in `s.thetalib` | `[]` | same one line |
| A9 | generic argument | `let r = @<array<T>>` + `` `hi` `` | `[]` | `[]` (the withheld gate, `type-grammar.ts:999`) |

Four further spellings, all at the query annotation and at `params:` alike:

| # | source | diagnostics |
|---|---|---|
| A10 | `{a as "w\"x": integer, b: integer}` | `[]` |
| A11 | `{b: integer, a as "w\"x": integer}` | `[]` |
| A12 | `{"w\"x": integer}` — bug 0176's quote-led key | `[]` |
| A13 | `{a as 'w\'x': integer}` — the single-quoted rename | `[]` |
| A14 | `{a as "w\"x": integer, a as "w\"x": string}` — bug 0052's repeat | `[]` |

### (B) The field's own type is never lowered

`theta/parse/unresolved-named-type` is drawn from the lowering's own sink, so it
is the observable that separates "the field was judged" from "the field was
never seen". Measured at the query annotation and at `params:`; both columns are
identical.

| # | source | diagnostics |
|---|---|---|
| B1 | `{a as "w\"x": Cat}` | `[]` |
| B2 | control `{b: Cat}` | `error theta/parse/unresolved-named-type: unresolved named type 'Cat'` |
| B3 | control `{a as "w": Cat}` | `error theta/parse/renamed-inline-field-name: …'a'…` **and** `error theta/parse/unresolved-named-type: unresolved named type 'Cat'` |
| B4 | `{a as "w\"x": Cat, b: integer}` | `[]` |
| B5 | `{"w\"x": Cat}` | `[]` |

B3 is the whole point: the unescaped spelling is refused AND its type is
lowered; the escaped spelling is neither.

### (C) What the lowering mints

Direct lowerer calls on the type source, plus the end-to-end `params:` schema
read off `doc.frontmatter.params.loweredSchema`.

| # | source | `lowerQueryResponseSchema` (annotation root) | `lowerParamsFieldType` fragment / `$defs` | `buildBodyTypeSchemas` `S` |
|---|---|---|---|---|
| C1 | `{a as "w\"x": integer}` | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` | `{}` / none | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| C2 | `{"w\"x": integer}` | same as C1 | `{}` / none | same as C1 |
| C3 | `{a as 'w\'x': integer}` | same as C1 | `{}` / none | same as C1 |
| C4 | `{a as "w\"x": integer, a as "w\"x": string}` | same as C1 | `{}` / none | same as C1 |
| C5 | `{a as "w\"x": integer, b: integer}` | `{"type":"object","properties":{"b":{"type":"integer"}},"required":["b"],"additionalProperties":false}` | `{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}` / that member carrying `b` alone | the same `$ref` |
| C6 | control `{b: integer}` | as C5's first cell | the SAME slug `__inline_8cc8cb1e7074a3af` | the same `$ref` |
| C7 | control `{a as "w": integer}` | `{"type":"object","properties":{"a as \"w\"":{"type":"integer"}},"required":["a as \"w\""],"additionalProperties":false}` | `{"$ref":"#/$defs/__inline_de5b12721bc77264"}` | that `$ref` + `$defs` |

End-to-end through the document at `params:`:

| # | `params:` → `p: 'T'` | `doc.diagnostics` | `frontmatter.params.loweredSchema` |
|---|---|---|---|
| C8 | `{a as "w\"x": integer}` | `[]` | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| C9 | `{a as "w\"x": integer, b: integer}` | `[]` | `properties.p` → `$ref` `__inline_8cc8cb1e7074a3af` carrying `b` alone |
| C10 | `{"w\"x": integer}` | `[]` | as C8 |
| C11 | control `{a as "w": integer}` | `error theta/parse/renamed-inline-field-name: …'a'…` | `null` (refused, never lowered) |
| C12 | control `{b: integer}` | `[]` | as C9 |

C5 against C6 is the identity claim: the lowered bytes and the `$defs` slug of a
two-field object with one escaped-quote rename equal those of the one-field
object that omits it. C8 against C12 is the reach: a `params:` field whose
declared type is a one-field inline object accepts any JSON value once the
escape is present, because `hoistInlineObjectType` returns `{}` when no entry
spelled a key (`params.ts:1281–1283`). `respondToolWireSchema` over C1's root
returns it unchanged.

### (D) The token-join spelling is not a way out

At ten of the eleven `Type` positions the document reconstructs the type source
by joining lexer tokens with no separator (bug 0160 `## Fix (0.172.0)`), so the
key does not arrive verbatim. Both candidate reconstructions drop the field
under a direct `lowerQueryResponseSchema` call, which is why (A) measures the
same silence at every position:

| # | source | lowered |
|---|---|---|
| D1 | `{aas"w\"x":integer}` | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` |
| D2 | `{aas"w"x":integer}` | `{}` |
| D3 | `{aas"w\"x":integer,b:integer}` | `properties: {"b": {"type":"integer"}}`, `required: ["b"]` |

### (E) The committed corpus — the GOV-15 baseline

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. One hit for `as *"` across
all of them: the English word in a comment
(`docs/examples/ralph-inline.theta:35`). Zero hits for `\"` in any committed
`.theta` / `.thetalib`. No committed source is in this class's input set, so a
refusal here takes no new refusal in
`tests/committed-fixture-parse-gate.test.ts`.

## Expected behaviour

`docs/spec_topics/grammar.md:109` states that an inline object's fields "reuse
the same `Field` form as an object-schema body and carry the same field
semantics", that "each field is required by default", and that "a field spelled
`ident as "WireName": Type` inside an inline object is
`theta/parse/renamed-inline-field-name`, judged over the same raw entry text the
duplicate and quoted rules below read". `docs/spec_topics/schemas.md:23` fixes
the rename's position between the field identifier and its type, and puts no
constraint on the string literal's contents beyond
`docs/spec_topics/lexical.md`'s string-literal grammar, which admits `\"`.
`{a as "w\"x": integer}` is therefore a field spelled `ident as "WireName":
Type`, and rows A1–A9 should draw `theta/parse/renamed-inline-field-name`
naming `a`, exactly as the unescaped control does at the same positions —
including the one-position withhold at a generic argument (A9), which is the
row's own gate rather than an exception to it.

Whatever answers the diagnostic, the artefact must not lose the field.
`docs/spec_topics/schema-subset.md:78` lowers an object to `"properties"` over
the wire names with `"required"` carrying every one of them, and
`grammar.md:109` makes each inline field required by default. No admissible
outcome mints a schema in which a field the author wrote is absent: either the
input is refused and nothing is lowered (row C11's shape), or the field appears.
Rows C1–C4 and C8–C10 are neither. Row C5's equality with row C6 — one source
with two fields and one source with one field lowering to the same bytes and the
same `$defs` slug — is the same statement in its sharpest form.

The two neighbour rows carry the same expectation over their own spellings.
`code-registry-parse.md:99` refuses a key whose first character is a quote, so
row A12 should draw `theta/parse/quoted-inline-field-name`; `:98` refuses a key
repeated within one interior, so row A14 should draw
`theta/parse/duplicate-inline-field-name`. Row A13 is row A1 with the other
quote character and follows it.

## Actual behaviour / root cause

**One scanner honours escapes and the other does not.** Both read the same
interior text. `splitTopLevelSegments` (`src/parser/params.ts:1855`) tracks a
quoted region in `quote` and, while inside one, consumes a backslash together
with the character behind it (`:1869–1871`) before testing for the closing
quote (`:1872`). `topLevelColon` (`:1781`) has the same `quote` latch
(`:1786–1791`) with no backslash arm at all: every character is compared
against `quote` directly.

For the entry `a as "w\"x": integer` that difference is decisive. The split
keeps the entry whole — the `,` in row A10 is correctly not at top level inside
the literal, and the second field is correctly separated. The colon scan opens
a string at the `"` before `w`, reads `\` as an ordinary character, CLOSES the
string at the escaped `"`, reads `x`, then OPENS a new string at the `"` that
actually closes the literal. From there the rest of the entry — including its
`:` — is inside a quoted region, so `depth === 0 && c === ":"` never holds and
`:1802` returns `-1`.

**A `-1` colon is read as "no field" by every consumer, and there are four.**
`inlineObjectFieldKeys` (`src/parser/type-grammar.ts:718`) skips the entry at
`:721–724`, so no key is added; the three raw-key rules in `walkType`'s
`object` arm iterate that key list (`:1000`) and therefore never see the entry
at all — bug 0052's repeat comparison, bug 0176's quote-led test
(`:1037–1046`), and bug 0160's `INLINE_FIELD_RENAME` test (`:144`,
`:1075–1083`) alike. That is rows A1–A14: the three rows' shared "spells no
key" carve-out, stated normatively at `code-registry-parse.md:98`, `:99` and
`:100`, is reached by a spelling that does spell a key to any reader.

`hoistInlineObjectType` (`src/parser/params.ts:1266`) skips at `:1268–1270`
before `defineRecordField` (`:1278`) and `required.push` (`:1279`), and
`lowerInlineObject` (`src/parser/body-type-lowering.ts:173`) skips at
`:183–186` before its `fields.push` (`:192`). No `properties` member, no
`required` entry, and no recursion into the field's type — which is why
`unresolved-named-type` is silent in row B1 and fires in row B2. Row C5's slug
identity with row C6 follows: the fragment the hash addresses genuinely has one
field.

**The single-field case degrades further than the multi-field case.** When no
entry spelled a key, `hoistInlineObjectType` returns the bare `{}`
(`params.ts:1281–1283`) rather than an empty object schema, so rows C1–C4's
`params:` and body-type columns are the permissive fragment: the declared
parameter accepts any JSON. At a query-annotation root the same input lowers
through `lowerInlineObject`'s empty field list to
`{"type":"object","properties":{},"required":[],"additionalProperties":false}`,
which accepts exactly `{}` and refuses the payload the author's schema
described. One input, two different wrong artefacts, neither announced.

**Bug 0160's record misattributes the escape-blindness by one function.** Its
*Residuals* item 1 and the *Trigger* sentence at
`code-registry-parse.md:100` both say "the quote tracking in the shared
`splitTopLevel`/`topLevelColon` is escape-blind" and "the quote tracking in the
shared split is escape-blind". Measured at HEAD: the split consumes escapes
correctly (`params.ts:1869–1871`; row A10 splits into two entries and `b`
survives). Only `topLevelColon` is escape-blind. The mechanism and the measured
silence are unchanged by that correction, but it narrows the fix surface — the
entry-splitting the three rows and both lowerers agree on does not have to
move.

## Why it matters

- **A field the author wrote is deleted from the schema with nothing on any
  channel.** Rows A1–A9 report `[]` and the theta registers; rows C1–C10 show
  the artefact. The binder's `paramsSchema`, a typed query's response schema
  and the respond tool's advertised schema are all built from these bytes, so
  the model is shown a contract missing a required property, or — in the
  single-field `params:` case (C8) — no contract at all.
- **Two lowered documents that differ by a whole field are byte-identical.**
  Row C5 against row C6: same `properties`, same `required`, same `$defs` slug
  `__inline_8cc8cb1e7074a3af`. Nothing downstream can tell the two sources
  apart, so no later check can recover the loss.
- **A landed `E`-severity refusal is bypassed by one character.** Row A1 against
  the same table's control column: `{a as "w": integer}` is refused at eight
  positions and `{a as "w\"x": integer}` at none. Bug 0160 shipped that row in
  0.172.0 specifically so the inline rename could not reach the lowering.
- **Two further landed rows are bypassed by the same character.** Row A12 is
  bug 0176's quote-led key and row A14 is bug 0052's repeat; both are silent.
  The escape defeats three rules at one site rather than one rule.
- **The failure is position-invariant, which removes the usual mitigation.**
  Rows A1–A9 and section (D) show the silence at the verbatim `params:`
  spelling and at both token-joined reconstructions, so no position of the
  eleven reports it.
- **The corpus is clean, so closing it costs no committed source.** Zero of the
  34 committed `.theta` / `.thetalib` files carry `\"` anywhere
  (§Reproduction E), so GOV-15's disposition is the addition arm of the
  diagnostic-registry carve-out
  (`docs/spec_topics/governance/source-language-stability.md:25`) over an
  in-repo input set that is empty, and
  `tests/committed-fixture-parse-gate.test.ts` takes no new refusal.

## Non-goals

- **The raw-key adjudication itself.** That an inline field's key is the raw
  pre-colon text, taken verbatim after `trim()`, with no unquoting and no
  normalisation — so `'a'` and `"a"` are two keys and neither is `a` — is
  LANDED LAW: bug 0159's route (a), restated normatively in all three
  *Triggers* (`code-registry-parse.md:98`, `:99`, `:100`) and relied on by the
  agreement-by-construction between the rules' keys and the property names both
  lowerers mint. No fix here re-opens it.
- **Wire-name semantics inline.** Bug 0160 settled that the inline `as
  "WireName"` clause is refused rather than parsed, and `grammar.md:109` states
  it. This report claims the escaped spelling's disposition, not a lowering
  that keys `properties` on a wire name.
- **`theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name`.**
  Declaration-scoped, `checkObjectSchema` untouched; the `<schema>` placeholder
  question bug 0160 avoided stays avoided.
- **The `{a as "w" as "x": integer}` under-refusal.** A separate recorded
  residual of bug 0160 (its *Residuals* item 4, cell g23): that entry DOES
  spell a key and is minted as a property name. Not this class, and not
  claimed.
- **The suppression family and the token-join capture.** Bug 0160 *Residuals*
  items 2 and 3 own the field-loop stop and the post-type spelling. This report
  measures neither.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/params.ts` and `src/parser/type-grammar.ts`; that is
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one and
states its choice.

**Constraint 1 — the raw-key adjudication is landed law and is not re-opened.**
The key is the entry's raw pre-colon text after `trim()`, unquoted and
unnormalised (`code-registry-parse.md:98`, `:99`, `:100`; bug 0159's route
(a)). Whatever a route changes, `'a'` must remain a different key from `"a"`
and from `a`, and the rules' keys must remain the property names the lowerings
mint — that agreement is by construction today and must stay so.

**Constraint 2 — the fix surface is `topLevelColon` alone, or the emission
sites alone, not the split.** `splitTopLevelSegments` already honours escapes
(`params.ts:1869–1871`), so the entry list is correct at HEAD (row A10). A
route that touches the split changes which entries exist and is out of
proportion to the measured defect.

**Constraint 3 — every route must state the disposition of all three rows.**
The keyless entry is outside `duplicate-inline-field-name`,
`quoted-inline-field-name` and `renamed-inline-field-name` together (rows A12,
A14). A route that returns a key to the escaped rename spelling returns one to
the escaped quote-led and escaped repeat spellings as well, and the run must
enumerate what each then draws rather than discover it.

**Constraint 4 — the LOCKS.** Three shipped witness files read this key and are
green at HEAD (71 tests): `tests/inline-object-quoted-field-name-refusal.test.ts`
(**16** tests, bug 0176), `tests/inline-object-wire-name-rename-refusal.test.ts`
(**25** tests, bug 0160) and `tests/inline-object-field-name-case.test.ts`
(**30** tests, bug 0154). Three cells of the second pin this class's current
bytes by name and must move under authorisation with their comments corrected in
the same change: g20 (`:688`), g21 (`:689`) and `CONTROL G4` (`:1349–1383`);
`CONTROL H1`'s named empty-expectation list (`:1411`) shrinks with them, and its
declared counts (67 list cells, 47 naming the new row) are recomputed. Any route
also re-measures `tests/inline-object-field-name-comparison-key.test.ts` (bug
0159's key file) and `tests/params-inline-object-lowering.test.ts` (bug 0039's
`params:` byte freeze, 37 cells), and must state whether either moves.

**(a) Escape-aware colon scan.** Give `topLevelColon` (`params.ts:1781`) the
backslash arm its sibling split already has (`:1869–1871`), so
`a as "w\"x": integer` yields the colon the author wrote. The key then becomes
`a as "w\"x"` and all three rows judge it: `INLINE_FIELD_RENAME`
(`type-grammar.ts:144`) does NOT match it as written — its wire-name
alternatives are `"[^"]*"` and `'[^']*'`, which the escaped interior defeats —
so this route must state whether the predicate is widened to admit escapes or
whether the entry falls through to no row at all, which would close the
lowering half and leave the diagnostic half open. It also gives both lowerers a
property name containing a backslash and two quote characters (the class bug
0160 §Fix (b) declined to mint), so the run must state what is lowered and
verify the two byte-freezes above.

**(b) Refuse the keyless entry.** Leave `topLevelColon` alone and add an
emission for an entry that a brace-and-angle-aware split yields but that spells
no key — no top-level `:` — while its interior is non-empty. This is the
minimal statement of the measured defect ("a field the author wrote reached no
rule and no property") and needs no predicate widening, but it is a new DIAG-2
row or a widened *Trigger* on an existing one, and it must be bounded against
the entries that legitimately spell no key today: the trailing-comma position
and `{: x}`-style empties are already handled by the `key.length === 0` arm
(`type-grammar.ts:725–727`), and the run must enumerate which remaining
keyless shapes are inside the new emission set.

**(c) Both halves.** Route (a) for the rename spelling plus route (b) as the
backstop for whatever still spells no key. Admissible, and the most likely
disposition if (a)'s predicate widening is judged too narrow to cover A12/A13/A14
— but it must not double-emit on one entry, so the precedence against the
three-way order already fixed at `code-registry-parse.md:100` ("repeat first,
quote-led second, rename third") has to be stated as a four-way order.

**Registry (DIAG-2).** Whatever (a)/(b)/(c) settles lands in the same commit as
the code (`diagnostic-shape.md:72`) with `docs/reference/diagnostics.md` in
lock-step. Independently of the route, one sentence is false at HEAD and is
corrected in the same change: the escaped-quote clause of
`code-registry-parse.md:100` attributes the escape-blindness to "the shared
split", and the split is escape-aware — the blindness is `topLevelColon`'s
(§Actual behaviour). The parallel sentences at `:98` and `:99` ("quoted regions
skipped") need the same audit. No *Message* is reworded (DIAG-4).

**Witness obligations.** A new witness file on the shape of the three landed
ones: whole-list ordered `toEqual` over unfiltered `doc.diagnostics`, every
expected *Message* read through `parseRegistry` / `registryMessage` (DIAG-4),
`parseDoc` from `tests/helpers/e2e-s1.ts`. Minimum rows: every position of
§Reproduction (A) including `params:` and `.thetalib` and the generic-argument
withhold, with its unescaped control beside it; §Reproduction (B)'s
unresolved-sink pair; §Reproduction (C)'s lowered bytes in whichever direction
the route leaves them, C5-against-C6 among them as the slug-identity claim; and
§Reproduction (D)'s two token-joined spellings. Both directions proven:
neutralise the new behaviour and confirm the new rows red and only they, then
restore and confirm green byte-exact.

**Fix ordering.** Nothing blocks this report from starting. It shares the key
with [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md),
[0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) and
[0160](./0160-inline-object-wire-name-rename-unparsed.md), all closed, so their
witnesses are the constraint rather than a coordination partner.

## Provenance

- Origin: the bug 0160 fix (0.172.0). Its `## Fix (0.172.0)` *Residuals* item 1
  names this class, records the review finding that produced it ("Round 1
  (deep) … one `correctness` finding (an escaped quote in the wire name escapes
  all three inline rules and silently drops the field)"), states it was pinned
  as a bound rather than closed, and leaves the report to be filed.
- Independently re-measured at HEAD `758e3c0d` (v0.173.0) for this filing, not
  copied: bug 0160's cells g20/g21 reproduce (rows A1, A7), and every other row
  is new measurement — the nine positions of (A) with their controls, the four
  further spellings A10–A14, (B)'s five unresolved-sink cells, (C)'s twelve
  lowering cells including the end-to-end `params:` read and the C5/C6 slug
  identity, (D)'s two token-joined reconstructions, and (E)'s census. Two
  scratch vitest files over `parseDoc`, `lowerQueryResponseSchema`,
  `lowerParamsFieldType`, `buildBodyTypeSchemas` and `respondToolWireSchema`,
  run on the outputs quoted above, then deleted and the tree swept.
- One statement of bug 0160's record is corrected by measurement here: the
  escape-blindness is `topLevelColon`'s (`params.ts:1786–1791`), not the shared
  split's (`:1867–1875`, which consumes escapes). The *Trigger* sentence at
  `docs/spec_topics/diagnostics/code-registry-parse.md:100` carries the same
  misattribution.
- Spec: `docs/spec_topics/grammar.md:101`, `:109`;
  `docs/spec_topics/schemas.md:21`, `:23`, `:39`;
  `docs/spec_topics/lexical.md:13`; `docs/spec_topics/type-system.md:15`;
  `docs/spec_topics/schema-subset.md:68`, `:78`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:98`, `:99`, `:100`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15), `:9` (loads-cleanly), `:25` (diagnostic-registry carve-out).
  Mirrors: `docs/reference/diagnostics.md:144`, `:145`, `:146`.
- Implementation evidence at `758e3c0d`: `src/parser/params.ts` (`:1266–1279`,
  `:1281–1283`, `:1781`, `:1786–1791`, `:1798–1799`, `:1802`, `:1855`,
  `:1867–1875`, `:1913`); `src/parser/type-grammar.ts` (`:144`, `:718`,
  `:721–724`, `:725–727`, `:999`, `:1000`, `:1037–1046`, `:1075–1083`);
  `src/parser/body-type-lowering.ts` (`:173`, `:183–186`, `:192`);
  `src/runtime/query-schema-lowering.ts:153`;
  `src/runtime/respond-tool-wire.ts:92`.
- Test evidence at `758e3c0d`:
  `tests/inline-object-wire-name-rename-refusal.test.ts` (`:676–689` cells
  g20/g21 with the residual comment, `:1349–1383` `CONTROL G4`, `:1411`
  `CONTROL H1`'s empty-expectation list; 25 tests, green);
  `tests/inline-object-quoted-field-name-refusal.test.ts` (16 tests, green);
  `tests/inline-object-field-name-case.test.ts` (30 tests, green);
  `tests/inline-object-field-name-comparison-key.test.ts` (bug 0159's key
  file); `tests/params-inline-object-lowering.test.ts` (bug 0039's 37-cell
  `params:` byte freeze); `tests/committed-fixture-parse-gate.test.ts`.

## Fix (0.182.0)

Route **§Fix (a) — the escape-aware colon scan — with `INLINE_FIELD_RENAME`
widened to admit the escape**, and route §Fix (b) DECLINED. The choice was made
against a full-suite premeasurement at this tree, not from the document's own
baseline: bug 0228 (0.179.0) landed between the filing and this fix and changed
both inputs the document reasoned over — inline-object interiors now arrive as
raw author source at every `Type` position, and a fourth raw-key row
(`theta/parse/inline-field-name-not-identifier`) refuses a non-`Ident` pre-colon
key. Every row of §Reproduction was re-derived here before a line of test was
written.

**What the re-measurement changed about the document.** §Fix (a) says the route
"must state whether the predicate is widened to admit escapes or whether the
entry falls through to no row at all, which would close the lowering half and
leave the diagnostic half open". Post-0228 the fall-through is no longer "no row
at all": measured, the unwidened predicate leaves the key `a as "w\"x"` to
0228's fourth row, which refuses it at all eleven positions and names the raw
key. So BOTH readings close the silent-deletion half. The widened predicate was
chosen because §Expected is explicit that rows A1–A9 draw
`theta/parse/renamed-inline-field-name` naming `a`, and because the honest
identity of the input is a rename spelling (`grammar.md:109`; `lexical.md:13`'s
string literal admits `\"`) rather than a name that merely fails to be an
identifier. The unwidened variant was measured too: it moves the same three
tests and reds nothing else, and its signature is recorded in Verification
obligation 1 half (b).

**Route §Fix (b) is declined, and no registry row is minted or widened in
identity.** §Fix (b) asks for an emission on an entry that spells no key while
its interior is non-empty. Measured at this tree, the remaining shapes in that
class are already answered: an unterminated literal (`{a as "w\": integer}`)
draws `theta/parse/literal-newline-in-string` from the lexer at every lexed
position, and any key that reaches the raw-key loop and declines all three rows
is 0228's fourth row's subject. One shape survives and is recorded as
residual 1 below.

- What shipped:
  - `src/parser/params.ts` — `topLevelColon` gains inside its quoted-region
    branch the backslash-consume arm its sibling `splitTopLevelSegments`
    already had: a `\` consumes the character behind it instead of being tested
    against the closing quote, under the same `i + 1 < length` boundary. The
    doc comment states why the two scanners must agree — the raw key the four
    inline raw-key rules compare and the property name both lowerers mint are
    derived from the same colon. `splitTopLevelSegments` is untouched
    (Constraint 2), and `src/parser/type-layer-checks.ts`'s separate
    `topLevelColonIndex` is untouched (a concurrent lane owns that file;
    residual 2).
  - `src/parser/type-grammar.ts` — `INLINE_FIELD_RENAME`'s wire-name literal
    alternatives widen from `"[^"]*"` / `'[^']*'` to `"(?:[^"\\]|\\.)*"` /
    `'(?:[^'\\]|\\.)*'`. Capture group 1 (the theta-side identifier) and the
    both-ends anchoring are unchanged, so the *Message* and its rendered
    subject are unchanged (DIAG-4), and the alternatives still cannot span an
    UNESCAPED quote — which is why `{a as "w" as "x": integer}` (0160's cell
    g23) stays outside this row.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the DIAG-2
    same-commit prose correction the document names. The
    `theta/parse/renamed-inline-field-name` row's escaped-quote clause was
    false in two ways: it attributed the escape-blindness to "the shared split"
    (the split consumes escapes) and it stated that such an entry spells no key
    and is dropped rather than refused. It now states that the colon scan
    honours the escape, that the literal alternatives admit the escaped
    interior, and that the entry is INSIDE the row. The rows at `:98`, `:99`
    and `:101` were audited: they carry no escape-attribution sentence
    (`rg "escaped"` hits `:100` alone) and their "spells no key" carve-outs
    remain true for the unterminated-literal shape.
  - `docs/reference/diagnostics.md` — audited, NOT edited. The mirror carries
    the *Message* column only; no *Message* changed, so the DIAG-2 pair reads
    true byte-for-byte. `placeholder-rendering-b.md` likewise needs no edit:
    this row still renders its capture group, which is identifier-shaped, so it
    takes no row-scoped `<field>` carve-out and the page's named three-row
    carve-out set is unmoved.
  - `tests/inline-object-wire-name-rename-refusal.test.ts` — the three
    authorised flips, each re-derived by measurement and commented with this
    report as the authority (see the flip enumeration below).
  - `tests/escaped-quote-inline-field-name-refusal.test.ts` — NEW, the witness
    (12 tests, 33 inventory cells).
  - `tests/live/escaped-quote-inline-rename-live-cell.test.ts` and
    `tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts` —
    NEW, the live pair (H8a + H9a), modelled on 0160's shipped pair.
- Gates (each re-run independently of every nested report):
  - Witness, both directions, each half neutralised SEPARATELY with its
    prediction stated before the run. Half (a) — the backslash arm removed:
    `Tests 13 failed | 24 passed (37)`, red set `A1 A2 B1 C1 C2 C3 C4 D1 E1 F2
    G1 G4 H2`, every CTL cell green. Half (b) — the widened predicate reverted:
    `Tests 6 failed | 31 passed (37)`, red set `A1 A2 B1 F2 G1 H2`, the
    lowering groups green and the signature the predicted code flip
    (`renamed-inline-field-name` becomes `inline-field-name-not-identifier`
    naming `a as "w\"x"`). Restored by writing the bytes back — never
    `git checkout --`, never `git restore`, never `git stash` — and hash-proven
    byte-exact both times (`params.ts`
    `94fc47a53c5bcd7bd6d097f0601be4c82f17ea39`, `type-grammar.ts`
    `f5415919bd683584c0ad4dc780ff45b023edc9d2`). Restored green:
    `Tests 37 passed (37)`.
  - Full default suite: `Test Files 373 passed (373)`,
    `Tests 7628 passed (7628)` (baseline 372 / 7616; the extra file and its 12
    tests are this fix's witness — the count is exact, with no drift).
  - Typecheck: `tsc -p tsconfig.json --noEmit` clean. Lint:
    `eslint --no-error-on-unmatched-pattern "src/**/*.ts"` clean.
  - Named LOCK gates, all byte-identical to HEAD by `git hash-object` against
    `git rev-parse HEAD:<path>` and green:
    `tests/params-inline-object-lowering.test.ts`
    (`8bcec9b804f99d92351363a0d5f4a727eead1074`, 0035/0039's 37-cell `params:`
    byte freeze), `tests/inline-object-quoted-field-name-refusal.test.ts`
    (`0839ccde1dd3f6e341b2dce7c1db9ab8f31381aa`, 0176's 16),
    `tests/inline-object-field-name-case.test.ts`
    (`350a7b5e21850565aeeec99ee10fc6910b21c81c`, 0154's 30),
    `tests/inline-object-field-name-comparison-key.test.ts`
    (`dde06c4e18b5041fc5d0b2d08738c0695f208978`, 0159's key file) and
    `tests/committed-fixture-parse-gate.test.ts`
    (`4d2e488e534f00c2b7dbf393ce7866778296db5f`, 36 cells). 0228's fresh
    102-cell capture witness is inside the full-suite green.
  - GOV-15: the committed corpus is clean — 34 committed `.theta`/`.thetalib`
    files, ZERO carrying `\"` anywhere (re-verified at this tree) — so the
    newly-refused spellings take no new refusal in the corpus gate and are
    disposed of by the
    [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out).
  - Live, run for real under the shared live lock: H8a
    `tests/live/escaped-quote-inline-rename-live-cell.test.ts` 1/1 passed
    (6.9 s), H9a
    `tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts`
    1/1 passed (6.7 s), both first attempt with no stochastic-class red. The
    H9a MEASUREMENT (`parseSystemNoteCodes(probe.stdout + probe.stderr)`) held
    at `[]` — this code does not reach the H9a stdout/stderr capture, the same
    disposition 0160's identical code has — so
    `tests/fixtures/h7a/permitted-codes.json` is correctly byte-untouched. The
    clean sibling's stderr was the empty capture.
- Review: 2 rounds. Round 1 (deep) — FINDINGS times 2, both confined to the new
  witness file and neither behavioural: the header's declined-§Fix-(b)
  rationale claimed the lexer covers the unterminated-literal keyless class,
  which is false at `params:` (`prose`), and the a13 `params:` twin was omitted
  on a false YAML claim (`test`). Round 2 (fast) — CLEAN, with the corrected
  rationale, the added a13 `params:` twin (YAML single-quote doubling) and the
  recomputed 33/25 inventory counts re-measured rather than taken on trust.
- Verification: SOLID. Obligation 1 discharged in two separable halves, each
  with a stated prediction matching observation and hash-proven restoration.
  Obligation 2 discharged with the suite counts and the five byte-identity
  hashes. Obligation 3 discharged by two real live runs. Obligation 4
  discharged with both commands quoted clean.

**The flip grant, cell by cell, subjects preserved.** Three tests in ONE file,
exactly the set the premeasurement predicted and exactly the set §Fix
Constraint 4 authorises. Every flipped cell was re-derived by measurement, keeps
witnessing bug 0160's own subject, and carries an inline comment naming this
report as the authority.

- `RED G1` — cells `g20` (annotation root) and `g21` (`params:`) move from
  `expected: []` to the renamed row naming `a`. The residual comment above them
  is corrected on two counts: the escape-blindness was `topLevelColon`'s and
  not the shared split's, and the class is now CLOSED rather than pinned.
- `CONTROL G4` — the escaped-quote half moves: the annotation root now mints
  the property `a as "w\"x"` (required), and `lowerParamsFieldType` hoists the
  `$defs` member `__inline_68a87e995fbc02c1` instead of returning the
  permissive `{}`. The `{a as "w" as "x": integer}` half is byte-identical:
  0160's residual 4 under-refusal is untouched.
- `RED H2` — the code-level mirror of the same inventory; `g20`/`g21` gain the
  code. `CONTROL H1`'s named empty-expectation list loses `g20`/`g21`
  (`["g4","g5","g20","g21"]` becomes `["g4","g5"]`) and its declared counts are
  recomputed from the file (67 list cells unchanged, 47 becomes 49 naming the
  row).
- No other cell in any file moved. The g20/g21 route change is a REFUSAL where
  there was silence, so 0035/0039's `params:` byte freeze holds by hash: the
  refused document is never lowered at all.

- Residuals:
  1. **The unterminated-literal keyless entry still drops silently at
     `params:`.** `{a as "w\": integer}` draws
     `theta/parse/literal-newline-in-string` at every position the theta lexer
     reaches, but at `params:` the YAML scalar never reaches that lexer: the
     document reports no diagnostic and lowers `p` to
     `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}`
     — the permissive parameter this report's §Why it matters describes.
     Evidence: round 1's finding F1, measured twice (reviewer and fixer) and
     recorded in the witness header as a bound of this route. It is outside
     this report's measured rows (§Reproduction names no unterminated
     spelling), and closing it is route §Fix (b)'s own decision, declined here.
     A candidate filing.
  2. **`topLevelColonIndex` (`src/parser/type-layer-checks.ts`) tracks no
     quotes at all** — it is more blind than `topLevelColon` was before this
     fix, so the two scanners now disagree on any quoted-interior entry.
     Evidence: round 1's residual R1, which also measured the consequence: its
     sole consumer (`inlineObjectAnnotationToCompatType`) requires an
     identifier-shaped name and declines the whole interior otherwise, so a
     disagreement degrades to the lenient deferring nominal and never to field
     loss. That file is owned by a concurrent lane and was deliberately not
     touched.
  3. **The new `topLevelColon` doc comment carries an absolute line citation**
     (`:1880–1882`, the sibling split's backslash arm). Evidence: round 1's
     residual R2 — accurate at this tree, with precedent in
     `theta-document.ts`, but drift-inviting under
     [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
     adjudication.
- Discharge notes appended:
  [0160](./0160-inline-object-wire-name-rename-unparsed.md)'s *Residuals*
  item 1 — the class this report was filed to carry — is discharged and a note
  is appended there. 0154's *Residuals* item 1 needed no note here: 0228's
  capture change already discharged it and recorded so.
- Pinned dispositions / non-goals: the raw-key adjudication is untouched — the
  key is still the raw pre-colon text after `trim()`, with no unquoting, so
  `'a'`, `"a"` and `a` remain three keys and the rules' keys remain the property
  names both lowerers mint (Constraint 1). `splitTopLevelSegments` is untouched
  (Constraint 2). No new registry row was minted and no *Message* was reworded;
  0228's fourth row keeps its own subject and is the measured fall-through of
  the unwidened variant. 0160's residual 4 (`{a as "w" as "x": integer}`) is
  unmoved and still pinned by cell g23. The declaration-scoped
  `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name` rows
  are untouched. The positional drift this change induces in `params.ts` and
  `type-grammar.ts` is
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class: no citation sweep was performed at any phase.

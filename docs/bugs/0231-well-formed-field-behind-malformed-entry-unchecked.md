# Bug 0231 — `TypeParser.parseObject`'s field loop BREAKS at the first entry that does not spell `Ident ":"` (`type-grammar.ts:694–697`), so every field behind it is absent from both `fieldNames` and `fieldTypes` and every check reached through them is silently withheld: `{a b: integer, Zs: string}` draws `theta/parse/inline-field-name-not-identifier` naming `'a b'` and NOTHING on `Zs`, at all eleven `Type` positions including the verbatim `params:` one, while `{a: integer, Zs: string}` and `{Zs: string, a b: integer}` both draw `theta/parse/binding-case-mismatch` — and the withholding covers the sibling case rule, the field-TYPE checks (`void-in-non-return-position`, `generic-arity-mismatch`, `empty-schema-body`) and all four raw-key rules at any nested depth behind the break

- **Status:** open
- **Sev/Diff estimate:** S1/D3 — S1 by the letter on "declared constraints not
  enforced with no diagnostic": the lowercase-first rule
  (`docs/spec_topics/lexical.md:16`, enforced at this slot by bug
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s pass) and
  the three field-TYPE checks are unenforced on every field behind a malformed
  entry, at every position, with zero diagnostics naming those fields
  (§Reproduction (a), (b)); at a generic type argument the whole document loads
  with an EMPTY diagnostic list and REGISTERS where the same interior minus the
  space refuses (§Reproduction (d)). The bound is stated with it: at the other
  ten positions the malformed entry's own `E` is present, so the document is
  refused and nothing lowers, and no wire key is minted from the unchecked
  field. D3 because the disposition needs in-run adjudication — recovering the
  field list changes `parseObject`'s tolerant recovery, which bugs 0227 and 0228
  both scoped out explicitly — and because the loop is one shared path serving
  every `Type` position with three pinned-byte witnesses against it
  (§Fix (d)).
- **Kind:** defect — implementation, one control-flow element with two measured
  faces.
  1. *The break discards the rest of the field list.* `TypeParser.parseObject`
     (`src/parser/type-grammar.ts:645`) reads a field-name token, requires a
     `:` behind it, and `break`s out of the whole field loop when that colon is
     absent (`:694–697`, comment "Malformed field; stop to stay tolerant").
     `{a b: integer, …}` reaches that break at `b`: `a` is an `ident`, the next
     token is `b` and not `:`. Every entry behind it is never read, so it enters
     neither `fieldNames` (`:703–705`) nor `fieldTypes` (`:709–711`).
  2. *Every check reached through those two arrays is withheld, and nothing
     reports the withholding.* `walkType`'s `object` arm (`:930`, `:1021`) runs
     bug 0154's lowercase-first pass over `node.fieldNames`, and `:1168`
     recurses into `node.fieldTypes` for the field-TYPE checks and for the four
     raw-key rules at every nested depth. Behind the break both arrays are
     short, so `theta/parse/binding-case-mismatch` on a sibling
     (`{a b: integer, Zs: string}`), `theta/parse/void-in-non-return-position`,
     `theta/parse/generic-arity-mismatch`, `theta/parse/empty-schema-body` on a
     nested `{}`, and `duplicate-inline-field-name` /
     `quoted-inline-field-name` / `inline-field-name-not-identifier` inside a
     nested interior are all silent (§Reproduction (b)). The rules that survive
     are the four raw-key rules on the interior's OWN entries, which read
     `TypeNode.interiorSource` through `inlineObjectFieldKeys` (`:776`) and
     never consult the loop's output.
  3. *The verdict set depends on entry ORDER, and on which malformed spelling
     is used.* The same two field names refuse differently depending on which
     comes first (`{Zs: string, a b: integer}` draws both rows,
     `{a b: integer, Zs: string}` draws one), and a non-ASCII field-name head —
     the shape bug [0227](./0227-non-ascii-inline-object-field-name-admitted.md)'s
     `entryTainted` latch (0.183.0) governs — does NOT break: it takes the
     tolerant-skip branch (`:687–693`), reaches the entry-separating `,`, and
     the siblings behind it keep every check (§Reproduction (c)).
- **Related:**
  - [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md) —
    **fixed (0.179.0)**, the origin. Its `## Fix (0.179.0)` *Residuals* item 2
    records this class from that fix's review round 1 as "a well-formed field
    behind a space-broken one draws no rule of its own", names the loop break as
    the mechanism, notes the identical blindness at `params:` at that tree, and
    files it forward as "a candidate filing, not a blocker". This report is that
    filing, re-measured at 0.183.0 and widened: the residual states the loss for
    `theta/parse/binding-case-mismatch` only, and §Reproduction (b) measures the
    same loss for the three field-TYPE checks and for all four raw-key rules at
    nested depth. That fix also shipped
    `theta/parse/inline-field-name-not-identifier`, the row that refuses `a b`
    and therefore bounds this report's harm at ten of the eleven positions.
  - [0227](./0227-non-ascii-inline-object-field-name-admitted.md) — **fixed
    (0.183.0)**, the sibling tolerance path at the same loop. Its `entryTainted`
    latch gates the `fieldNames` retention per entry and clears at the
    entry-separating `,`, so a non-`ident` field-name TOKEN suppresses only its
    own entry's residue and the loop continues. The break this report claims is
    the other arm of the same `if`/`else` and the latch did not move it: with
    the latch in place `{Élan: string, Zs: string}` still refuses `Zs`'s case
    violation and `{a b: integer, Zs: string}` still does not
    (§Reproduction (c)). That fix's *Residuals* item 1 (the generic-argument
    carve-out) is the second cause standing beside this one in
    §Reproduction (d).
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) — **fixed
    (0.165.0)**, whose identifier pass over `TypeNode.fieldNames` is the
    consumer this defect starves, and whose witness
    `tests/inline-object-field-name-case.test.ts` (62 cells) is the lock in
    §Fix (d).
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **fixed**,
    the count-consequence law the shipped registry row for
    `inline-field-name-not-identifier` cites: "A field this row refuses draws no
    other error-severity diagnostic on **that field**"
    (`code-registry-parse.md:101`). The sentence is scoped to the refused field;
    it does not license withholding a diagnostic from a DIFFERENT field, which
    is what §Reproduction (a) measures.
  - [0225](./0225-fn-param-list-foreign-close-paren-silent.md) — **fixed**, the
    `fn` parameter list's own tolerant-recovery class and the sibling row
    (`theta/parse/fn-param-not-identifier`) the inline row was minted beside.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for the positional drift any fix here induces
    in `src/parser/type-grammar.ts`.
- **Affected** (verified at HEAD `4c157bcc`, 0.183.0; cited by symbol, the
  absolute line numbers being 0134's class):
  - **The break.** `src/parser/type-grammar.ts` — the `TypeNode` `object` arm's
    doc comment on `fieldNames` and its three "stop shapes" (`:252–303`);
    `TypeParser.parseObject`
    (`:645`); the field-name peek and its `ident` test (`:686–687`); the
    tolerant non-`ident` branch that sets `entryTainted` and `continue`s
    (`:688–693`, bug 0227's 0.183.0 latch); the malformed-field `break`
    (`:694–697`), which is this report's subject; the `fieldNames` retention
    push behind both latches (`:703–705`); the `fieldTypes` push and the
    `namesStopped` update (`:709–712`); the entry-separator `break` and the
    latch clear (`:721–724`); the `interiorSource` slice (`:738–742`), which is
    computed from token offsets and is therefore COMPLETE however early the loop
    broke.
  - **The starved consumers.** `src/parser/type-grammar.ts` — `walkType`
    (`:930`); bug 0154's lowercase-first pass over `node.fieldNames`, gated on
    `closingBraceSpelled` and deliberately not withheld inside a generic
    argument (`:1002–1038`, predicate at `:1029`); the recursion into
    `node.fieldTypes` that carries every field-TYPE check and every nested
    interior's four raw-key rules (`:1168–1170`); the union-arm recursion
    beneath it (`:1173–1177`).
  - **The consumers that survive the break.** `inlineObjectFieldKeys` (`:776`)
    over `TypeNode.interiorSource`, feeding
    `theta/parse/duplicate-inline-field-name` (`:1057`),
    `theta/parse/quoted-inline-field-name`,
    `theta/parse/renamed-inline-field-name` (predicate `INLINE_FIELD_RENAME`,
    `:153`) and `theta/parse/inline-field-name-not-identifier` (predicate
    `INLINE_FIELD_IDENT`, `:163`; emission `:1157–1165`). These are why the
    malformed entry itself is still named at ten positions.
  - **The eleven positions.** `src/parser/theta-document.ts` —
    `consumeInlineObjectType` (`:3609`) and its three angle-context callers
    (`:3513`, `:3524`, `:5001`, `:5172`), bug 0228's raw-slice capture, so every
    position hands `parseTypeExpression` the author's interior bytes;
    `src/parser/params.ts:212` — the `params:` field's
    `parseTypeExpression(field.typeSource, …)` call, the position whose capture
    was always verbatim and which is blind identically (§Reproduction (e)).
  - **The lowered view.** `src/parser/body-type-lowering.ts:173`
    (`lowerInlineObject`) and `src/parser/params.ts:1259`
    (`hoistInlineObjectType`) key `properties` / `required` on the same
    `splitTopLevel` entries `inlineObjectFieldKeys` uses, not on `fieldTypes`,
    so the lowered artefact holds every field the loop discarded
    (§Reproduction (f)). `src/extension/production-theta-producer.ts:822` is the
    binder envelope that document reaches when nothing refuses.
  - **The spec sentences.** `docs/spec_topics/lexical.md:13` (`Ident` is
    `[A-Za-z_][A-Za-z0-9_]*`) and `:16` (the lowercase-first bullet, "the parser
    only cares about the first letter", naming schema field names);
    `docs/spec_topics/grammar.md:101` (`ObjectType ::= "{" Field ("," Field)*
    ","? "}"`) and `:109` (§"Inline object types", the `Field`-form
    equivalence); `docs/spec_topics/type-system.md:15` (one type grammar in
    every type-annotation position).
  - **The registered rows.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`
    (`theta/parse/binding-case-mismatch`, *Trigger* "Identifier in a binding /
    parameter / fn-name / field-name position does not start with a lowercase
    letter or `_`" — false of `Zs` in `{a b: integer, Zs: string}`); `:101`
    (`theta/parse/inline-field-name-not-identifier`, whose count-consequence
    sentence is scoped to the refused field); `:97`
    (`theta/parse/empty-schema-body`), `:98`, `:99`, `:100` — the rows measured
    silent at nested depth in §Reproduction (b). Mirror:
    `docs/reference/diagnostics.md`.
  - **The witness locks.** `tests/inline-object-field-name-case.test.ts` — bug
    0154's witness as extended by 0227, **62** cells / 43 `it` blocks, whose
    group (J) pins an unclosed interior as silent for both passes;
    `tests/inline-object-type-source-capture.test.ts` — bug 0228's capture
    witness, **102** diagnostic-list cells / 21 `it` blocks, 40 of them naming
    `inline-field-name-not-identifier`, with cell `I1` recomputing both counts;
    `tests/escaped-quote-inline-field-name-refusal.test.ts` — bug 0229's
    witness, **33** cells, 25 carrying the rename row.
    `tests/params-inline-object-lowering.test.ts` (37 cells) is the `params:`
    lowering freeze;
    `tests/inline-object-field-name-comparison-key.test.ts`,
    `tests/inline-object-duplicate-field-name.test.ts`,
    `tests/inline-object-quoted-field-name-refusal.test.ts` and
    `tests/inline-object-wire-name-rename-refusal.test.ts` are the other
    raw-key witnesses over the same arm.
  - **The corpus.** `git ls-files -- '*.theta' '*.thetalib'` is 34 files. No
    committed theta spells an inline object entry that fails to spell
    `Ident ":"`: a scan for an interior whose pre-colon text holds two
    whitespace-separated identifiers returns zero hits, so no committed source
    moves under any route in §Fix.
- **Observed at:** `0.183.0` (HEAD `4c157bcc`). Offline, deterministic; no live
  model, no provider. Every row is the whole unfiltered `doc.diagnostics` in
  emission order, rendered `<severity> <code>: <message>`, through `parseDoc`
  (`tests/helpers/e2e-s1.ts`) driving the shipped `parseThetaDocument`, with
  frontmatter `---\nmode: subagent\n---` on lines 1–3 so the source under test
  sits on line 4; `.thetalib` rows pass `path = "lib.thetalib"` with no
  frontmatter. "registers" is `doc.frontmatter !== null`. `params:` rows are
  written as a quoted YAML scalar and their lowerings are
  `doc.frontmatter.params.loweredSchema` verbatim; §Reproduction (f)'s lowered
  documents are `lowerQueryResponseSchema(<interior>, [], [])`, the call
  `production-theta-producer.ts:2672` makes. Three scratch vitest files over
  those entry points, run on the outputs quoted below, then deleted; the tracked
  tree is identical to HEAD. Four untracked scratch files from a sibling session
  (`tests/zz-scratch-0232-probe*.test.ts`) were present throughout and are not
  this filing's. `src/`, `tests/`, `docs/bugs/README.md` and every other bug
  document are unmodified by this filing.

## Summary

`TypeParser.parseObject` (`type-grammar.ts:645`) parses an inline object type's
interior entry by entry. An entry that does not spell `Ident ":"` at its
field-name position ends the loop: `if (!this.eatPunct(":")) { break; }`
(`:694–697`). Every entry behind that point is never read, so it appears in
neither `fieldNames` (the list bug 0154's lowercase-first pass judges) nor
`fieldTypes` (the array `walkType` recurses through for every field-TYPE check
and for the four raw-key rules at nested depth).

`{a b: integer, Zs: string}` is the minimal witness. `a` is an identifier, `b`
is not a colon, so the loop breaks and `Zs` is never seen. At all eleven `Type`
positions, in `.theta` and `.thetalib` alike, the document draws exactly one
diagnostic — `error theta/parse/inline-field-name-not-identifier: field name
'a b' within one inline object type is not an identifier`, bug 0228's row, which
reads the interior text and not the loop's output. `Zs` violates the
lowercase-first rule (`lexical.md:16`) and draws nothing. Both controls prove
the attribution: `{a: integer, Zs: string}` draws
`theta/parse/binding-case-mismatch` at every position, and
`{Zs: string, a b: integer}` — the same two names, order swapped — draws it
beside the `a b` row.

The withholding is not specific to the case rule. Behind the break, measured
each against its own single-field control:
`theta/parse/void-in-non-return-position`,
`theta/parse/generic-arity-mismatch`, `theta/parse/empty-schema-body` on a
nested `{}`, and `theta/parse/duplicate-inline-field-name`,
`theta/parse/quoted-inline-field-name` and
`theta/parse/inline-field-name-not-identifier` inside a nested interior are all
silent, as is the case rule on a nested interior's own field name. The four
raw-key rules on the broken interior's OWN entries survive, because
`inlineObjectFieldKeys` (`:776`) reads `TypeNode.interiorSource`, which is
sliced from token offsets and is complete however early the loop stopped.

The break is the other arm of the same `if`/`else` that carries bug 0227's
`entryTainted` latch (0.183.0), and the latch did not move it. A non-`ident`
field-name TOKEN takes the tolerant-skip branch (`:687–693`), reaches the
entry-separating `,`, and clears the latch, so `{Élan: string, Zs: string}`
still refuses `Zs`'s case violation. A field-name position holding two
identifiers, a quoted key, a numeric key or an inline `as "W"` rename breaks
instead, and everything behind it goes unchecked.

At ten positions the malformed entry's own `E` bounds the harm: the document is
refused, so nothing lowers and no unchecked name reaches the wire. At a generic
type argument it does not — bug 0228's row is withheld there by its registered
carve-out and the case rule is the only check that would have fired, so
`let x: array<{a b: integer, Zs: string}> = [1]` reports `[]` and registers,
where `array<{a: integer, Zs: string}>` refuses.

## Reproduction

Offline, deterministic, at HEAD `4c157bcc`. Whole unfiltered diagnostic lists in
emission order.

### (a) The subject, at every position

Fixture `{a b: integer, Zs: string}`. `NOT_IDENT` abbreviates
`error theta/parse/inline-field-name-not-identifier: field name 'a b' within
one inline object type is not an identifier`; `CASE` abbreviates
`error theta/parse/binding-case-mismatch: binding name must start with a
lowercase letter or _`.

| # | position | `{a b: integer, Zs: string}` | control `{a: integer, Zs: string}` | control `{Zs: string, a b: integer}` |
|---|---|---|---|---|
| a1 | `let x: {…} = 1` | `NOT_IDENT` | `CASE` (+ `let-rhs-type-mismatch`) | `CASE`, `NOT_IDENT` |
| a2 | `let mut x: {…} = 1` | `NOT_IDENT` | `CASE` (+ mismatch) | `CASE`, `NOT_IDENT` |
| a3 | `fn h(p: {…}): number { 1 }` | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a4 | `fn h(): {…} { 1 }` | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a5 | `schema S { p: {…} }` | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a6 | `schema T = {…}` | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a7 | `let r = @<{…}>` + backtick body | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a8 | `let r = invoke<{…}>("./x.theta")` | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a9 | `let x: { q: {…} } = 1` (nested) | `NOT_IDENT` | `CASE` (+ mismatch) | `CASE`, `NOT_IDENT` |
| a10 | a5 written in `lib.thetalib` | `NOT_IDENT` (+ two `thetalib-top-level-statement`) | `CASE` (+ two) | `CASE`, `NOT_IDENT` (+ two) |
| a11 | `params:` → `p: '{…}'` | `NOT_IDENT` | `CASE` | `CASE`, `NOT_IDENT` |
| a12 | `let x: array<{…}> = 1` (generic arg) | `let-rhs-type-mismatch` alone | `CASE` (+ mismatch) | `CASE` (+ mismatch) |

Adding a third well-formed field changes nothing:
`{a b: integer, Zs: string, Ys: string}` draws `NOT_IDENT` alone at a1–a11.
`{a b: integer, Zs: string,}` (trailing comma) likewise. Reversing the order
(row 3) restores every verdict, which is the attribution: one break position,
two outcomes for the same pair of names.

### (b) What else the break withholds

Each row at a `let` annotation, paired with the single-field control that fires.

| # | source | diagnostics | control | control diagnostics |
|---|---|---|---|---|
| b1 | `{a b: integer, zs: void}` | `NOT_IDENT` | `{a: integer, zs: void}` | `error theta/parse/void-in-non-return-position` |
| b2 | `{a b: integer, zs: array<string, integer>}` | `NOT_IDENT` | `{a: integer, zs: array<string, integer>}` | `error theta/parse/generic-arity-mismatch: generic type 'array' expects 1 type argument(s); got 2` |
| b3 | `{a b: integer, zs: {}}` | `NOT_IDENT` | `{a: integer, zs: {}}` | `error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.` |
| b4 | `{a b: integer, zs: {q: integer, q: integer}}` | `NOT_IDENT` | `{a: integer, zs: {q: integer, q: integer}}` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'q' …` |
| b5 | `{a b: integer, zs: {"q": integer}}` | `NOT_IDENT` | `{a: integer, zs: {"q": integer}}` | `error theta/parse/quoted-inline-field-name: quoted field name '"q"' …` |
| b6 | `{a b: integer, zs: {c d: integer}}` | `NOT_IDENT` (naming `'a b'` only) | — | the nested `c d` is named at no position |
| b7 | `{a b: integer, zs: {Q: string}}` | `NOT_IDENT` | `{a: integer, zs: {Q: string}}` | `CASE` (+ mismatch) |
| b8 | `{a b: integer, zs: {Q: string} \| null}` | `NOT_IDENT` | — | the union-arm recursion (`:1173`) is reached through `fieldTypes` too |
| b9 | `{a b: integer, zs: result<string>}` | `NOT_IDENT` | `{a: integer, zs: result<string>}` | `[]` — the bound: not every field-TYPE check has an emission here |
| b10 | `{a b: integer, c d: integer}` | `NOT_IDENT` ×2, naming `'a b'` and `'c d'` | — | the interior's OWN entries are named from `interiorSource`, not from the loop |

Rows b1–b8 are one mechanism: `walkType`'s `object` arm recurses through
`node.fieldTypes` (`:1168`), and the discarded entries contributed no
`fieldTypes` member. Row b10 is the complement: `inlineObjectFieldKeys` reads
`interiorSource`, so both malformed entries of one interior are still named.

### (c) Which malformed spellings break, and which recover

Each at a `let` annotation, second field `Zs: string` throughout, so the
question is whether `CASE` fires on `Zs`.

| # | first entry | diagnostics | loop behaviour |
|---|---|---|---|
| c1 | `a b: integer` | `NOT_IDENT` | breaks at `:696` — `a` is `ident`, `b` is not `:` |
| c2 | `"q x": integer` | `quoted-inline-field-name` alone | breaks: the `str` token is skipped, then `:`, then `integer` meets `,` |
| c3 | `3: integer` | `NOT_IDENT` naming `'3'` | breaks, same three-token path as c2 |
| c4 | `a as "W": integer` | `renamed-inline-field-name` alone | breaks — the `as` skip sits AFTER the type parse (`:715–720`), so `a` never gets its colon |
| c5 | `Élan: string` | `CASE`, `NOT_IDENT` naming `'Élan'` | does NOT break: bug 0227's tolerant-skip branch (`:687–693`) reaches the `,`, clears `entryTainted`, and `Zs` is retained |
| c6 | `Zs: string` (well-formed, uppercase) | `CASE`, plus whatever the second entry draws | no break |

c5 is the direct measurement that bug 0227's `entryTainted` latch (0.183.0) did
not move this class: the latch governs the branch that CONTINUES, and this
report's subject is the branch that BREAKS. c4 shows the break is not
whitespace-specific.

### (d) The generic-argument position, where nothing refuses

| # | source | diagnostics | registers |
|---|---|---|---|
| d1 | `let x: array<{a b: integer, Zs: string}> = [1]` | `[]` | yes |
| d2 | `let x: array<{a: integer, Zs: string}> = [1]` | `CASE`, `let-rhs-type-mismatch`, `array-element-type-mismatch` | yes |
| d3 | `params:` → `p: 'array<{a b: integer, Zs: string}>'` | `[]`, lowered `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` | yes |
| d4 | `params:` → `p: 'array<{a: integer, Zs: string}>'` | `CASE` | no |

Two causes stand side by side and are separated by the controls. `a b` is
unnamed at d1 and d3 because bug 0228's row carries the registered
generic-argument carve-out (`code-registry-parse.md:101`), which is bug 0227's
*Residuals* item 1 and not this report's. `Zs` is unnamed because of the break:
bug 0154's pass is NOT withheld inside a generic argument (`:1002–1038`), which
is exactly why d2 and d4 refuse. The interior lowers to `{}` at d3, so no
unchecked field name reaches the wire from this position either.

### (e) `params:` — the same blindness at the verbatim position

Row a11 is the `params:` spelling and matches a1 byte-for-byte in its verdict.
`params.ts:212` hands `parseTypeExpression` the YAML scalar as written, so no
capture is involved: the loss is `parseObject`'s, at the one position whose
type source was never reconstructed. Bug 0228's *Residuals* item 2 measured the
same thing at 0.179.0, before and independently of this report.

### (f) The lowered view holds the fields the loop discarded

`lowerQueryResponseSchema(<interior>, [], [])`:

| # | interior | lowered |
|---|---|---|
| f1 | `{a b: integer, Zs: string}` | `{"type":"object","properties":{"a b":{"type":"integer"},"Zs":{"type":"string"}},"required":["a b","Zs"],"additionalProperties":false}` |
| f2 | `{a: integer, Zs: string}` | `{"type":"object","properties":{"a":{"type":"integer"},"Zs":{"type":"string"}},"required":["a","Zs"],"additionalProperties":false}` |

One interior, two views: the lowerer mints two properties from the same text on
which `parseObject` retained no field at all. `lowerInlineObject`
(`body-type-lowering.ts:173`) and `hoistInlineObjectType` (`params.ts:1259`)
key on the `splitTopLevel` entries, not on `fieldTypes`. At the ten positions
where `NOT_IDENT` fires the document is refused and this document is never
built; f1 is stated as the mechanism, not as a leak.

### (g) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. A scan for an inline
object interior holding two whitespace-separated identifiers before a colon
returns zero hits, so no committed theta reaches the break and
`tests/committed-fixture-parse-gate.test.ts` takes no new refusal under any
route in §Fix.

## Expected behaviour

`docs/spec_topics/grammar.md:101` derives an `ObjectType` from
`"{" Field ("," Field)* ","? "}"` and `:109` makes each inline `Field` the
object-schema `Field`. `docs/spec_topics/lexical.md:16` requires a schema field
name to start with a lowercase letter or `_`, and states the rule as a property
of each name. `docs/spec_topics/type-system.md:15` states one type grammar in
every type-annotation position. From those three sentences:

- **A field's verdict does not depend on a neighbour's spelling, or on entry
  order.** `Zs` in `{a b: integer, Zs: string}` draws the same diagnostic it
  draws in `{a: integer, Zs: string}` and in `{Zs: string, a b: integer}`.
  Rows a1–a11 and rows b1–b8 are the set that must move; the controls beside
  them are the target.
- **A malformed entry accounts for itself and for nothing else.** The registry
  states this already for the row that fires: the count-consequence sentence at
  `code-registry-parse.md:101` scopes suppression to "that field". Every other
  field of the interior, and every interior nested inside one, keeps its own
  rules — including at any nesting depth (rows b4–b8).
- **A document whose interior derives from no `ObjectType` does not load
  clean.** Row d1 reports `[]` and registers. Which code carries the refusal
  there is bug 0228's generic-argument carve-out question and not this
  report's; what this report requires at that position is that `Zs`'s case
  violation is named, as rows d2 and d4 name it.

Rows b9, b10, c5 and c6 do not move: b9 has no emission to lose, b10's two
rows come from `interiorSource`, and c5 and c6 already carry the complete
verdict set.

## Actual behaviour / root cause

**One `break` ends the field list.** `TypeParser.parseObject`
(`type-grammar.ts:645`) loops until `}` or end of tokens. Each iteration peeks
the field-name token (`:686`). An `ident` is consumed (`:687–688`); anything
else takes the tolerant branch that sets `entryTainted` and `continue`s
(`:688–693`, bug 0227's 0.183.0 latch). The colon behind the name is then
required, and its absence ends the loop outright:

```
      if (!this.eatPunct(":")) {
        // Malformed field; stop to stay tolerant.
        break;
      }
```

`{a b: integer, Zs: string}` reaches that break on its first entry: `a` is an
`ident`, the token behind it is `b`. `Zs: string` is never read. The same break
also serves the entry-separator position (`:721–722`), where its absence is a
genuine end of interior; at `:696` it is an ERROR RECOVERY decision, and the
recovery chosen is "stop", not "resynchronise at the next `,`".

**Two arrays go short, and they are the input to every check but four.**
`fieldNames` (`:703–705`) is bug 0154's lowercase-first pass's whole input
(`walkType`, `:1002–1038`). `fieldTypes` (`:709–711`) is what `walkType`
recurses through (`:1168`), and that recursion carries the field-TYPE checks
(`void-in-non-return-position`, `generic-arity-mismatch`,
`empty-schema-body`) and every nested interior's own four raw-key rules and
case pass. Behind the break both arrays stop, so each of those checks is
withheld with no record that anything was skipped — measured in
§Reproduction (b) against per-row controls.

**The four raw-key rules survive because they do not read the loop's output.**
`interiorSource` (`:738–742`) is sliced between the interior's `{` and the
depth-0 `}` located by token index, so it is the complete author text however
early the loop stopped. `inlineObjectFieldKeys` (`:776`) splits it on top-level
commas, so `theta/parse/inline-field-name-not-identifier` names `a b` (and, in
row b10, `c d` as well). That is why the ten non-generic positions still refuse
the document, and why the harm is a missing diagnostic rather than a silent
load at those positions.

**The one position where nothing fires.** Bug 0228's row and its three
neighbours are withheld for an interior reached through a generic type
argument (`:1057`, `code-registry-parse.md:101`), because the lowering never
divides that interior into fields. Bug 0154's pass is deliberately not withheld
there. So at a generic argument the case rule is the only check that would have
fired on `{a b: integer, Zs: string}`, the break withholds it, and the document
loads clean and registers (row d1).

**Bug 0227's latch is the other arm.** The latch suppresses only the tainted
entry's own residue from `fieldNames` and clears at the consumed `,` (`:724`),
so the loop continues and the siblings behind a non-ASCII head keep every check
(row c5). The break has no such resynchronisation. Two adjacent
non-`Ident` field-name spellings therefore recover differently: `{Élan: …}`
continues, `{a b: …}` stops.

## Why it matters

- **A declared constraint is unenforced on a whole class of fields.** The
  lowercase-first rule is stated per name (`lexical.md:16`) and enforced at this
  slot by bug 0154's landed pass; rows a1–a11 show it silent on `Zs` at every
  position, including the verbatim `params:` one. The same is true of the three
  field-TYPE checks and of all four raw-key rules at nested depth (rows
  b1–b8) — one recovery decision withholds seven registered rows.
- **One document loads clean and registers.** Row d1
  (`array<{a b: integer, Zs: string}> = [1]`) reports `[]`, where row d2's
  control refuses. An interior deriving from no `ObjectType`, carrying a field
  name the lowercase-first rule refuses, is admitted at that position with no
  diagnostic at all.
- **A registered *Trigger* is false as written.**
  `code-registry-parse.md:19` says `theta/parse/binding-case-mismatch` fires
  when an identifier in a field-name position does not start with a lowercase
  letter or `_`. `Zs` in `{a b: integer, Zs: string}` is such an identifier in
  such a position and draws nothing. The suppression that IS registered
  (`:101`, bug 0129's count-consequence law) is scoped to the refused field and
  does not cover a sibling.
- **The verdict depends on entry order.** `{Zs: string, a b: integer}` and
  `{a b: integer, Zs: string}` declare the same two fields and draw different
  diagnostic sets (rows a1–a11, column 3 versus column 2). An author fixing
  `a b` learns about `Zs` only on the next parse, and an author fixing them in
  the other order learns about both at once.
- **Two tolerance paths in one loop disagree.** Row c5 recovers and row c1 does
  not, so which sibling checks run depends on which non-`Ident` spelling the
  author used. Any later rule reading `fieldNames` or `fieldTypes` inherits
  that asymmetry silently.
- **The lowerer and the checker disagree on the field list.** Row f1: two
  lowered properties from an interior on which the checker retained no field.
  The divergence is invisible today because the ten refusing positions never
  lower; it is load-bearing for any future route that changes what refuses.
- **Closing it costs no committed source.** §Reproduction (g).

## Non-goals

- **Refusing `{a b: integer}` itself.** Bug
  [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md)'s
  `theta/parse/inline-field-name-not-identifier` already does, at ten of the
  eleven positions. This report claims the loss of OTHER fields' diagnostics,
  not the malformed entry's own verdict.
- **The generic-argument carve-out.** That the four raw-key rules are withheld
  inside a generic type argument is registered (`code-registry-parse.md:98`–
  `:101`) and is bug 0227's *Residuals* item 1. Row d1 needs `Zs` named; whether
  `a b` is also named there is that question, not this one.
- **The non-ASCII field-name class.** Bug
  [0227](./0227-non-ascii-inline-object-field-name-admitted.md) settled it at
  0.183.0, including the ASCII-alphabet law and the `entryTainted` latch. Row
  c5 is cited as the contrast that proves this class survived that fix; the
  latch's own behaviour is not re-opened.
- **The theta identifier alphabet.** ASCII, as bug 0227's fix records as law.
- **`theta/parse/empty-schema-body`'s treatment of a malformed object-schema
  DECLARATION body** (`schema S { Élan: string }` and the sibling field it
  loses). That is bug 0227's *Residuals* item 3 and a different parser
  (`parseSchemaObjectBody`).
- **The declaration-ranged emission convention.** Every diagnostic in
  §Reproduction carries the declaration's range, settled by bug 0154 §Fix (b)
  route 2. Rows a1–a12 do not distinguish which field a range names, and
  tightening the range is a separate change with its own DIAG-4 and witness
  consequences.
- **The unclosed-interior class.** Both passes at this arm are gated on
  `TypeNode.closingBraceSpelled`, pinned silent by group (J) of
  `tests/inline-object-field-name-case.test.ts`. Every fixture here closes its
  braces.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts` —
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one,
states it, and records the disposition of the prose the choice falsifies.

**(a) Where the missing verdicts come from.**

- *Route 1 — resynchronise the field loop.* Replace the `break` at `:696` with
  a skip to the next top-level `,` inside this interior (brace- and
  angle-aware, mirroring `splitTopLevel`'s nesting rules) and continue the loop
  with `entryTainted` set for the abandoned entry. Every entry behind a
  malformed one is then read, so `fieldNames` and `fieldTypes` carry it and
  every check in §Reproduction (b) fires from the existing code with no new
  row. Consequences to pre-measure, not discover: the loop's token consumption
  changes, so `interiorClosingBraceIndex`, `braceClosed`,
  `carriesUnclosedInterior` and the `namesStopped` latch must be re-measured
  against the unclosed-interior class (group (J) of
  `tests/inline-object-field-name-case.test.ts`) — a resynchronising loop can
  consume a nested interior's `}` differently; the malformed entry itself must
  stay OUT of `fieldNames` (`entryTainted`'s existing job, bug 0227) so no
  residue verdict returns; and bug 0129's count-consequence law must still hold
  per field, which it does, the added diagnostics naming other fields.
- *Route 2 — drive the starved passes off `interiorSource` instead.* Compute
  bug 0154's field-name list and the field-TYPE walk from the
  `inlineObjectFieldKeys` split rather than from the loop's arrays, so they
  inherit the completeness the four raw-key rules already have. This leaves
  `parseObject`'s recovery untouched — the property bugs 0227 and 0228 both
  scoped out — but requires a second type parse per entry for the TYPE checks
  and must state what it does with an entry whose post-colon text does not
  parse. The two lists then agree by construction with the lowerer's, which is
  the agreement bug 0159 §Fix chose route (a) for.
- *Route 3 — a diagnostic that reports the truncation.* Not sufficient alone:
  it tells an author that fields were skipped without telling them what is
  wrong with those fields, and rows d1/d3 would still load clean at the
  generic-argument position unless the new row fires there too. Stated so the
  run does not re-derive it.

**(b) Whether any new code is registered.** Routes 1 and 2 add no row: every
diagnostic in §Reproduction (b) and (a) is an existing registered code firing
where its *Trigger* already says it fires. A route that mints a row (route 3,
or a "truncated interior" row beside it) owes DIAG-2 in full — the
`code-registry-parse.md` row, its precedence against the four raw-key rows, and
the `docs/reference/diagnostics.md` mirror in the same commit.

**(c) The prose the choice falsifies, corrected in the same change.** Under
either route the `// Malformed field; stop to stay tolerant.` comment at `:695`
and the `TypeNode` doc comment's account of the three "stop shapes"
(`:252–303`) change: the field list is no longer truncated at the first
malformed entry. `code-registry-parse.md:19`'s *Trigger* becomes true of this
position rather than false. Bug 0227's `entryTainted` comment block
(`:672–681`) describes the latch's interaction with a loop that stops; under
route 1 it describes one that resynchronises.

**(d) Locks.** Three witness files are pinned bytes and are re-derived, not
search-edited, where a cell moves:
`tests/inline-object-field-name-case.test.ts` (bug 0154's, as extended by bug
0227 — **62** cells / 43 `it` blocks, groups (H), (I) and (J) plus the
arithmetic LEDGER and anti-vacuity counts);
`tests/inline-object-type-source-capture.test.ts` (bug 0228's — **102**
diagnostic-list cells, 40 naming `inline-field-name-not-identifier`, with cell
`I1` recomputing both counts, so any added or moved cell re-derives that
inventory); `tests/escaped-quote-inline-field-name-refusal.test.ts` (bug
0229's — **33** cells, 25 carrying the rename row). Cells whose fixture holds a
malformed entry followed by any further entry are in scope; every other cell is
proven unmoved by hash. `tests/params-inline-object-lowering.test.ts` (37
cells) must not move under either route — §Reproduction (f) shows the lowerer
never read the loop's arrays — and is proven by hash, not by reading.
`tests/inline-object-duplicate-field-name.test.ts`,
`tests/inline-object-quoted-field-name-refusal.test.ts`,
`tests/inline-object-wire-name-rename-refusal.test.ts` and
`tests/inline-object-field-name-comparison-key.test.ts` are the other witnesses
over this arm.

**(e) Witness obligations.** A new witness file carries this report's rows on
the shape of the existing ones: whole-list ordered `toEqual` over unfiltered
`doc.diagnostics`, every *Message* through `parseRegistry` / `registryMessage`
(DIAG-4), `parseDoc` from `tests/helpers/e2e-s1.ts`. Minimum rows: (a) at all
eleven positions plus `.thetalib`, each with both controls, so entry order is
pinned in both directions; every row of (b) with its control, including the
nested rows b4–b8 and the two bounds b9 and b10; every row of (c), c5 and c6 as
the no-move controls that keep bug 0227's latch behaviour asserted; (d)'s four
rows including the `params:` lowered bytes; and (f)'s two lowered documents.
Both directions proven: neutralise the change and confirm the new rows red and
only they, restore and confirm green by hash.

**(f) Blast radius.** Zero committed `.theta` / `.thetalib` files reach the
break (§Reproduction (g)), so
`tests/committed-fixture-parse-gate.test.ts` takes no new refusal. GOV-15
classes to enumerate: rows a1–a11 and b1–b8 GAIN diagnostics while keeping the
refusal they already had (a diagnostic-count change, not an admission change);
rows d1 and d3 lose their loads-cleanly status and are the one set disposed of
by the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out);
no input becomes admitted.

**(g) Ordering.** Nothing blocks this report. It is independent of bug 0227's
*Residuals* item 1 (the generic-argument carve-out): row d2 shows bug 0154's
pass firing there today, so route 1 or 2 names `Zs` at that position whether or
not the carve-out is ever revisited.

## Provenance

- Origin: bug
  [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md)'s
  `## Fix (0.179.0)` *Residuals* item 2, filed forward from that fix's review
  round 1 as "a well-formed field behind a space-broken one draws no rule of its
  own … a candidate filing, not a blocker", with the loop break named as the
  mechanism and the identical blindness at `params:` measured at that tree.
- Re-measured at HEAD `4c157bcc` (0.183.0) for this filing, not copied, because
  bug [0227](./0227-non-ascii-inline-object-field-name-admitted.md)'s fix
  (0.183.0) changed `parseObject`'s per-entry behaviour between the residual and
  this report. The measurement pins which half survived: the `entryTainted`
  latch governs the tolerant branch that CONTINUES, so a non-ASCII field-name
  head recovers its siblings (row c5), and the `break` at `:694–697` — the
  branch this report claims — is untouched, so a space-broken, quoted, numeric
  or renamed field-name head still discards the rest of the interior (rows
  c1–c4). The residual's own statement is confirmed and widened: it records the
  loss of `theta/parse/binding-case-mismatch`; §Reproduction (b) measures the
  same loss for `theta/parse/void-in-non-return-position`,
  `theta/parse/generic-arity-mismatch`, `theta/parse/empty-schema-body` and all
  four raw-key rules at nested depth, and §Reproduction (d) measures one
  position where the document loads clean and registers.
- Three scratch vitest files over `parseDoc` (`tests/helpers/e2e-s1.ts`),
  `parseTypeExpression` and `lowerQueryResponseSchema`, run on the outputs
  quoted above, then deleted. The corpus census run over
  `git ls-files -- '*.theta' '*.thetalib'`.
- Spec: `docs/spec_topics/lexical.md` (`:13`, `:16`);
  `docs/spec_topics/grammar.md` (`:101`, `:109`);
  `docs/spec_topics/type-system.md:15`;
  `docs/spec_topics/diagnostics/code-registry-parse.md` (`:19`, `:97`, `:98`,
  `:99`, `:100`, `:101`);
  `docs/spec_topics/governance/source-language-stability.md` (GOV-15 and the
  diagnostic-registry carve-out).
- Implementation evidence at `4c157bcc`: `src/parser/type-grammar.ts` (`:153`,
  `:163`, `:252–303`, `:645`, `:669`, `:672–681`, `:686–697`, `:703–705`,
  `:709–712`, `:715–724`, `:738–742`, `:776`, `:930`, `:1002–1038`, `:1057`,
  `:1157–1165`, `:1168–1177`); `src/parser/theta-document.ts` (`:3513`,
  `:3524`, `:3609`, `:5001`, `:5172`); `src/parser/params.ts` (`:212`,
  `:1259`); `src/parser/body-type-lowering.ts:173`;
  `src/runtime/query-schema-lowering.ts:153`;
  `src/extension/production-theta-producer.ts` (`:822`, `:2672`).
- Test evidence at `4c157bcc`:
  `tests/inline-object-field-name-case.test.ts` (62 cells / 43 `it` blocks);
  `tests/inline-object-type-source-capture.test.ts` (102 diagnostic-list cells /
  21 `it` blocks, `TOTAL_LIST_CELLS` at `:637`);
  `tests/escaped-quote-inline-field-name-refusal.test.ts` (33 cells);
  `tests/params-inline-object-lowering.test.ts` (37 cells);
  `tests/inline-object-field-name-comparison-key.test.ts`;
  `tests/committed-fixture-parse-gate.test.ts`.
- `src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
  unmodified by this filing. Four untracked scratch files belonging to a
  sibling session (`tests/zz-scratch-0232-probe*.test.ts`) were present in the
  tree throughout and are not this filing's; `git diff HEAD --stat` is empty on
  `src/` and `tests/`.

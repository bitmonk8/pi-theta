# Bug 0256 — an inline object entry stranded behind `TypeParser.parseObject`'s exit on a missing entry separator is never visited, so `params:` `p: 'array<{a: b c, d e}>'` reports `[]`, registers, and lowers `p` to the permissive `{}` that accepts every argument — the keyless-entry refusal bug 0244 landed (0.238.0) fires only on entries the field loop reaches, and every one of the twelve `Type` positions is silent once the interior sits inside a generic argument, because the recogniser that backstops the unwrapped interior declines brace-and-angle text that is not a single enclosing brace group

- **Status:** open.
- **Sev/Diff estimate:** S1/D3 — S1 because a `params:` field declaring junk
  registers with zero diagnostics on every channel and lowers to the permissive
  `{}`, the accept-anything schema (§Reproduction (a), (c)); D3 because closing
  it necessarily reaches the colon-present junk tail that does the stranding,
  which is bug 0252's landed class, so the fix requires an operator boundary
  adjudication before implementation and carries a DIAG-2 edit across four
  register pages.
- **Kind:** defect — implementation, one loop exit, three consequences.
  1. **The entry is never visited.** `TypeParser.parseObject`
     (`src/parser/type-grammar.ts`) reads an interior entry by entry. After a
     field's type is parsed the loop reads the entry separator with
     `if (!this.eatPunct(",")) { break; }`. Where the type text is followed by a
     token that is neither `,` nor the interior's `}` — a junk tail such as
     `a: b c` — the loop exits, and every source entry standing behind that exit
     is never read. Bug
     [0244](./0244-colon-less-inline-object-entry-silently-discarded.md)'s two
     refusal arms (the colon-gate failure arm and the non-`ident`
     field-name-position arm, both behind `entryQualifiesForRefusal`) fire only
     on entries the loop VISITS, so a keyless entry stranded there draws
     nothing.
  2. **The raw-key rules see the entry and are blind to it by their own rule.**
     The interior's closing `}` is still found (`interiorClosingBraceIndex`), so
     `interiorSource` carries the whole text `a: b c, d e` and the four raw-key
     rows run over it. `inlineObjectFieldKeys` keys each entry on the text
     before that entry's own top-level `:` and skips an entry that spells none,
     so the stranded entry contributes no key and no row reads it.
  3. **The recogniser that backstops the unwrapped interior declines the
     wrapped one.** `annotationSourceIsNotTypeExpression`
     (`src/parser/type-layer-checks.ts`) refuses `{a: b c, d e}` at every
     annotation position through the shared refusable-text sink. For
     `array<{a: b c, d e}>` the text carries a brace and an angle bracket and is
     not a single enclosing brace group (`isSingleEnclosingBraceGroup`,
     `src/parser/params.ts`), so the function returns `false` before the sink is
     consulted — bug 0252's landed decline, narrowed at 0.225.0 to exactly the
     single-enclosing case. The generic wrapper therefore removes the last gate
     at all twelve `Type` positions, not only at the generic-argument position
     bug 0244's residual names (§Reproduction (b)).
- **Related:**
  - [0244](./0244-colon-less-inline-object-entry-silently-discarded.md) —
    **fixed (0.238.0)**, whose refusal this report extends and whose *Residuals*
    item 1 pins this class as an unfixed residual ("the break-residue class is
    not closed"). Its witness
    `tests/inline-object-keyless-entry-refusal.test.ts` group (K) pins the class
    at its measured values, labelled measured-not-desired, with the
    byte-neighbour control `array<{a: b, d e}>` refusing beside it; that group
    is this report's red-when-fixed pin and must be updated by the fix, never
    deleted. 0244's doc does not close the class and claims no cell of it.
  - [0252](./0252-brace-and-angle-annotation-junk-exempt-from-refusal.md) —
    **fixed (0.225.0)**, and the constraint on the fix. Two landed contracts of
    it collide with any route here: the brace-and-angle decline is narrowed to a
    single enclosing brace group only, which is why the generic-wrapped carrier
    is admitted unseen (§Kind 3); and the colon-PRESENT entry with a junk tail —
    `a: b c`, the entry that does the stranding — is its subject class, pinned
    unmoved by 0244's operator adjudication clause 2 and locked by clause 4. The
    §Fix below states the required adjudication.
  - [0238](./0238-stray-close-token-underflows-top-level-split.md) — **fixed
    (0.218.0)**, whose stray-close class is the neighbouring carve-out (a
    keyless entry carrying a `}` or `>` that closes nothing keeps its silent
    tolerant registration) and whose live pair carries the coordination clause
    in §Fix. Measured here: its offender row `p: '{a: integer, b > c, m:
    integer}'` still reports `[]` and lowers `{a, m}` byte-identically to its
    control, so nothing in this report's carriers moves it.
  - [0251](./0251-tolerated-junk-type-text-renders-raw-into-binder-prompt.md) —
    **fixed (0.239.0)**, which projected the binder-prompt rendering for
    tolerated junk type text. Its *Residuals* item 2 measures the same carrier
    (`array<{a: integer, b > c, m: integer}>` lowers to the permissive `{}`) and
    pins generic arguments as deliberately NOT projected, leaving such a type
    verbatim in the prompt. The PROMPT face is therefore settled; the
    PERMISSIVE-`{}` REGISTRATION face is this report.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for absolute line numbers in the parser modules a fix
    here edits. Every `src/` citation below is BY SYMBOL for that reason
    (`docs/STYLE.md` §Citations).
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - **The exit** — `src/parser/type-grammar.ts`: `TypeParser.parseObject`'s
    field loop and its entry-separator read `if (!this.eatPunct(",")) { break; }`,
    the `entryRefused` latch and `entryStart` reset behind it, and
    `TypeParser.entryQualifiesForRefusal` / `TypeParser.classifyEntry` — bug
    0244's refusal decision, reached only for a visited entry.
  - **The consumers that see the stranded text and do not judge it** —
    `TypeNode.interiorSource` (captured off the depth-0 `}`
    `interiorClosingBraceIndex` names, even when `braceClosed` is false) and
    `inlineObjectFieldKeys` (`src/parser/type-grammar.ts`), whose colon-keyed
    split skips an entry contributing no key; `TypeNode.fieldNames` /
    `TypeNode.fieldTypes`, short by every entry behind the exit.
  - **The declined gate** — `annotationSourceIsNotTypeExpression`
    (`src/parser/type-layer-checks.ts`), its brace-and-angle arm and the
    `isSingleEnclosingBraceGroup` (`src/parser/params.ts`) test in front of
    `braceGroupCarriesUnmatchedCloseToken` and the refusable-text sink; its
    readers at the `params:`, `fn` parameter, `fn` return, `let` and QRY-4
    positions.
  - **The lowerers** — `hoistInlineObjectType` and
    `classifyGenericArgumentSegments` (`src/parser/params.ts`),
    `lowerInlineObject` (`src/parser/body-type-lowering.ts`),
    `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts`): the
    generic arm hoists no argument, so the whole field lowers to the permissive
    `{}` (§Reproduction (c)).
  - **The register pages that state this class as an unfixed residual** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:99` (the
    `theta/parse/malformed-schema-field` Trigger's third exclusion, which names
    `array<{a: b c, d e}>` and the permissive `{}` outcome),
    `docs/spec_topics/grammar.md:109` (§"Inline object types"),
    `docs/reference/grammar.md:247`–`:249`, `docs/reference/schema-subset.md:55`–`:57`.
    A fix rewrites all four in the same commit (DIAG-2).
  - **The neighbouring rows** — `code-registry-parse.md:106`
    (`theta/parse/schema-type-not-expression`, whose Trigger states the
    brace-carrying-fragment exemption and the generic-argument shard exclusion),
    `:107` (`theta/parse/annotation-type-not-expression`, whose Trigger states
    bug 0252's narrowed decline verbatim), `code-registry-load.md:19`
    (`theta/load/params-type-not-expression`, the code the unwrapped interior
    draws at `params:`).
  - **The contract** — `docs/spec_topics/grammar.md:109` (the inline `Field`
    reuses the object-schema `Field` form in any `Type` position and at any
    depth), `docs/spec_topics/schemas.md:17` ("Field names are identifiers;
    field types are any expression from the Type System grammar"),
    `docs/reference/grammar.md:225`
    (`ObjectType ::= "{" Field ("," Field)* ","? "}"`).
  - **The witness locks** —
    `tests/inline-object-keyless-entry-refusal.test.ts` (bug 0244's witness, 19
    `it` blocks; group (K) is the red-when-fixed pin),
    `tests/brace-and-angle-annotation-junk-refusal.test.ts` (bug 0252),
    `tests/inline-object-stray-close-token-split.test.ts` (bug 0238),
    `tests/binder-param-type-projection.test.ts` (bug 0251, which pins the
    generic-argument non-projection cells),
    `tests/committed-fixture-parse-gate.test.ts`,
    `tests/live/inline-object-stray-close-token-live-cell.test.ts` and
    `tests/live/acceptance/inline-object-stray-close-token-load.test.ts` (bug
    0238's live pair), `tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files and
    holds one inline object type,
    `tests/live/acceptance/fixtures/acc-typed-inline.theta:22`
    (`let r: { ok: boolean, label: string } = @…`), whose every entry spells
    `Ident ":"` and which stands at no generic argument. No committed source
    carries a carrier of this class.
- **Observed at:** `0.240.0` (HEAD `53cd0d86`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`; `.theta` bodies carry the
  frontmatter `---\nmode: subagent\n---`, the `.thetalib` row passes
  `path = "lib.thetalib"` with no frontmatter, and the `params:` rows pass the
  whole document with the interior as a single-quoted YAML scalar. Diagnostic
  cells are the whole unfiltered `doc.diagnostics` in emission order rendered
  `<severity> <code>: <message>`; "registers" is the house definition (no
  error-severity `theta/parse/` or `theta/load/` code), so a `[]` cell registers
  by construction. Lowerings are `doc.frontmatter.params.loweredSchema` and
  `lowerQueryResponseSchema(<annotation>, [], [])` verbatim. Recogniser cells
  call `annotationSourceIsNotTypeExpression` and
  `isSingleEnclosingBraceGroup` directly. One scratch vitest file over those
  entry points, run in six rounds on the outputs quoted below, then deleted.

## Summary

Bug 0244 (0.238.0) made a keyless inline object entry refuse with
`theta/parse/malformed-schema-field`. The emission sits in
`TypeParser.parseObject`'s two discard arms and therefore reaches only entries
the field loop visits. The loop reads its entry separator with
`if (!this.eatPunct(",")) { break; }`, so an entry whose type text is followed
by a junk tail — `a: b c` — ends the walk, and every source entry behind that
exit is unread. `array<{a: b c, d e}>` strands the keyless entry `d e`.

Nothing else judges it. The interior's `}` is still located, so the raw-key
rules run over the whole text, and their split keys each entry on its own
top-level colon — the stranded entry spells none and contributes no key.
`fieldNames` and `fieldTypes` are short by it.

The unwrapped interior is refused anyway, by
`annotationSourceIsNotTypeExpression`: `{a: b c, d e}` draws
`theta/load/params-type-not-expression` at `params:` and
`theta/parse/annotation-type-not-expression` at an `fn` parameter type. Wrapping
it in a generic argument removes that gate at every position, because the
recogniser declines brace-and-angle text that is not a single enclosing brace
group — bug 0252's decline, narrowed at 0.225.0 to exactly the single-enclosing
case. So `array<{a: b c, d e}>` reports `[]` and registers at all twelve `Type`
positions measured, where bug 0244's residual records only the generic-argument
position as unbackstopped (§Reproduction (b)).

At the wire the `params:` field lowers to the permissive `{}` — every argument
accepted — and a well-formed sibling declared beside the junk is lost with it:
`array<{a: b c, d e, m: integer}>` and `array<{m: integer, a: b c, d e}>` lower
the same permissive fragment as the two-entry form (§Reproduction (c)). The
byte-neighbour control `array<{a: b, d e}>`, which differs only by the junk
tail, refuses and withholds the frontmatter.

## Reproduction

Each cell is the whole `doc.diagnostics` list in emission order.

### (a) The subject, its control, and the class boundary at `params:`

Each row is a whole theta whose one `params:` field is `p: '<T>'`.

| # | `p:` type | diagnostics | registers | lowered `p` |
|---|---|---|---|---|
| a1 **the subject** | `array<{a: b c, d e}>` | `[]` | yes | `{}` (permissive) |
| a2 control, no junk tail | `array<{a: b, d e}>` | `error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'` | no | frontmatter withheld |
| a3 no keyless entry | `array<{a: b c}>` | `[]` | yes | `{"type":"array","items":{}}` |
| a4 no junk tail, keyless alone | `array<{d e}>` | `error theta/parse/malformed-schema-field: …` | no | frontmatter withheld |
| a5 unwrapped subject | `{a: b c, d e}` | `error theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression` | no | frontmatter withheld |
| a6 unwrapped, no keyless entry | `{a: b c}` | `error theta/load/params-type-not-expression: …` | no | frontmatter withheld |

a1 vs a2 is the sharp pair: the two interiors differ by the junk tail alone, and
only the one that strands the entry registers. a1 vs a5 is the wrapper: the same
interior refuses unwrapped and is admitted inside a generic argument. a4 shows
bug 0244's delivered reach — the loop visits `d e` when no junk tail precedes
it.

### (b) The subject at twelve `Type` positions

Subject `array<{a: b c, d e}>`; control `array<{a: b, d e}>`, the same interior
without the junk tail. Every control cell is
`theta/parse/malformed-schema-field` and does not register.

| # | position | subject | registers |
|---|---|---|---|
| b1 | `fn f(p: <T>): integer { 1 }` | `[]` | yes |
| b2 | `fn f(): <T> { 1 }` | `[]` | yes |
| b3 | `schema S { a: <T> }` | `[]` | yes |
| b4 | `schema T = <T>` | `[]` | yes |
| b5 | `let x: <T> \| null = null` | `[]` | yes |
| b6 | `let x: <T> = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected array<{a: b c, d e}>, got integer` | no |
| b7 | `let r = @<<T>>` + backtick body | `[]` | yes |
| b8 | b3 in `lib.thetalib`, no frontmatter | `[]` | — |
| b9 | `params:` → `p: '<T>'` | `[]` | yes |
| b10 | `schema S { a: { p: <T> } }` | `[]` | yes |
| b11 | `fn f(p: array<<T>>): integer { 1 }` | `[]` | yes |
| b12 | `schema S { a: <T> \| integer }` | `[]` | yes |

Eleven of the twelve are silent, which corrects the scope bug 0244's *Residuals*
item 1 states: its "eleven positions have a recogniser gate" holds for the
UNWRAPPED interior, and the gate declines the wrapped one at every position
(§(d)). b6 is the one cell that draws anything, and it draws the deferring
nominal's mismatch rather than a refusal of the junk — the annotation text
renders raw into `expected`, which is bug 0247's class and is not claimed here.
With a compatible initialiser (`let x: array<{a: b c, d e}> = []`) the cell is
`[]` and registers; the control at the same position draws
`malformed-schema-field` beside its mismatch.

### (c) The class's spellings, and the well-formed sibling lost with the junk

`params:` rows; `lowered` is `doc.frontmatter.params.loweredSchema`.
`PERMISSIVE` is
`{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}`.

| # | `p:` type | diagnostics | lowered |
|---|---|---|---|
| c1 | `array<{a: b c, d e}>` | `[]` | `PERMISSIVE` |
| c2 | `array<{a: b c, void}>` | `[]` | `PERMISSIVE` |
| c3 | `array<{a: b c, Zs}>` | `[]` | `PERMISSIVE` |
| c4 | `array<{a: b c, a}>` | `[]` | `PERMISSIVE` |
| c5 | `array<{a: b c, "q"}>` | `[]` | `PERMISSIVE` |
| c6 | `array<{a: b c, {}}>` | `[]` | `PERMISSIVE` |
| c7 | `array<{a: integer x, d e}>` | `[]` | `PERMISSIVE` |
| c8 | `array<{a: b c, d e, m: integer}>` | `[]` | `PERMISSIVE` |
| c9 | `array<{m: integer, a: b c, d e}>` | `[]` | `PERMISSIVE` |
| c10 | `array<{n: {a: b c, d e}}>` | `[]` | `PERMISSIVE` |
| c11 | `array<array<{a: b c, d e}>>` | `[]` | `{"type":"object","properties":{"p":{"type":"array","items":{}}},"required":["p"],"additionalProperties":false}` |
| c12 | `map<string, {a: b c, d e}>` | `[]` | `PERMISSIVE` |
| c13 | `array<{a: b c, d e}> \| null` | `[]` | `{"type":"object","properties":{"p":{"anyOf":[{},{"type":"null"}]}},"required":["p"],"additionalProperties":false}` |

c3, c4 and c5 are the keyless spellings bug 0244 refuses when the loop reaches
them (`Zs`, a repeat, a quoted key); stranded, each draws nothing. c7 shows the
stranding junk tail need not be a bare name — a primitive with a trailing token
strands the same way. c8 and c9 are the starvation face: the declared field `m`
reaches neither the lowering nor any rule, in either order relative to the junk.
c10 is depth 2, c11 a doubled generic, c12 a two-argument generic, c13 a union
arm over the wrapped type.

### (d) Why the wrapper removes the gate

Direct calls, verbatim.

| # | text | `annotationSourceIsNotTypeExpression` | `isSingleEnclosingBraceGroup` |
|---|---|---|---|
| d1 | `{a: b c, d e}` | `true` | `true` |
| d2 | `array<{a: b c, d e}>` | `false` | `false` |
| d3 | `{a: b c}` | `true` | `true` |
| d4 | `array<{a: b c}>` | `false` | `false` |
| d5 | `{a: b, d e}` | `false` | `true` |
| d6 | `array<{a: b, d e}>` | `false` | `false` |

d1/d2 is the mechanism: the wrapped text carries a brace and an angle bracket
and is not a single enclosing brace group, so the recogniser returns `false`
before the refusable-text sink runs. d5/d6 are `false` for a different reason —
the parser's own visited-entry refusal already refuses those two rows (§(a) a2),
so no gate is needed there.

### (e) Union arms are NOT carriers

| # | `p:` type | diagnostics |
|---|---|---|
| e1 | `{a: b c, d e} \| integer` | `error theta/load/params-type-not-expression: …` |
| e2 | `{a: b c, d e} \| null` | `error theta/load/params-type-not-expression: …` |
| e3 | `{q: array<integer>, a: b c, d e}` | `error theta/load/params-type-not-expression: …` |

The other shape bug 0252's decline still covers — a brace group beside a
top-level `|` — is refused through the sink, and so is an interior whose own
field type supplies the angle bracket. The carrier class is the interior nested
in a GENERIC ARGUMENT.

### (f) The neighbouring landed classes, re-measured

| # | `p:` type | diagnostics | lowered |
|---|---|---|---|
| f1 | `{a: integer, b > c, m: integer}` | `[]` | `$ref → __inline_6ab13cdeb4b48b5a`, fragment `{a, m}`, `required ["a","m"]` |
| f2 | `array<{a: integer, b > c, m: integer}>` | `[]` | `PERMISSIVE` |

f1 is bug 0238's shipped outcome and bug 0251's surviving prompt carrier,
unmoved. f2 is bug 0251 *Residuals* item 2's measured row: the generic wrapper
lowers permissively there too, by the same generic-arm non-hoist, without this
report's stranding.

### (g) The committed corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files; the one inline object type
is `tests/live/acceptance/fixtures/acc-typed-inline.theta:22`, whose entries
each spell `Ident ":"` and which stands at no generic argument. No committed
file carries a carrier, so a fix newly refuses no shipped source; the claim is
discharged by `tests/committed-fixture-parse-gate.test.ts`, not by a scratch
probe.

## Expected behaviour

1. Every cell of §Reproduction (a) row a1, (b) rows b1–b12 and (c) rows c1–c13
   carries at least one error-severity diagnostic and does not register.
2. The disposition does not depend on whether an earlier entry ended at the
   separator: a1 agrees with a2, and c8/c9's declared field `m` is either
   lowered or the document is refused — never dropped in silence.
3. One line per stranded entry (bug 0129's count-consequence law,
   `code-registry-parse.md:104`), and no second line on an entry another row
   already refused.
4. No `params:` field lowers to the permissive `{}` from this shape (§(c)); an
   argument-accepting schema is not reachable from a document with no
   diagnostic.
5. Nothing else moves: §(a) rows a2, a4, a5, a6; §(e); §(f) f1 and f2; bug
   0238's stray-close tolerance; bug 0252's colon-present disposition; bug
   0251's generic-argument non-projection cells.

## Actual behaviour / root cause

`TypeParser.parseObject`'s field loop parses an entry's type, skips an optional
`as "WireName"` rename, then reads the entry separator: `if (!this.eatPunct(","))
{ break; }`. For the interior `{a: b c, d e}` the first entry's type capture ends
at `b`, the next token is `c`, the read fails, and the loop breaks with `d e`
never read. Bug 0244's refusal sits inside the loop — the colon-gate failure arm
and the non-`ident` field-name-position arm, gated by
`entryQualifiesForRefusal` — so an unread entry reaches no emission point. The
`entryRefused` latch and `entryStart` reset that follow the separator read are
likewise never reached.

After the break, `braceClosed` is false (the cursor stands at `c`, not at `}`),
but `interiorClosingBraceIndex` still finds this interior's depth-0 `}`, so
`closingBraceSpelled` is true and `interiorSource` carries the full text. The
four raw-key rules therefore run, and their split (`inlineObjectFieldKeys` over
`splitTopLevel(interiorSource, ",", "angle-and-brace")` and `topLevelColon`)
keys each entry on the text before that entry's own top-level colon. `d e`
spells none, contributes no key, and is skipped — the exclusion the function's
own doc comment states. `fieldNames` holds `a` alone and `fieldTypes` is short
by the stranded entry, so `walkType`'s case pass and its field descent have
nothing to judge either.

At every position other than a generic argument's interior, the unwrapped text
is refused before any of that matters:
`annotationSourceIsNotTypeExpression` reaches its refusable-text sink, which
refuses the keyed junk tail `b c`. Inside a generic wrapper the same function
tests the whole annotation text, finds a brace and an angle bracket, asks
`isSingleEnclosingBraceGroup`, gets `false`, and returns `false` — declining
without judging. That decline is bug 0252's landed contract
(`code-registry-parse.md:107`): a brace group nested in a generic argument or
standing beside a top-level `|` is the one shape a splitter can still shred, so
it keeps bug 0124's blanket admission. The wrapper thus removes the gate at all
twelve positions, and the `let` position (b6) survives only because TYPE-8
compares the deferring nominal against the initialiser.

The lowerers agree with the split, so nothing corrupts: `lowerTypeExpr`'s
generic arm never hoists its argument (bug 0251 *Residuals* item 2), so the
whole field lowers to the permissive `{}` rather than to a partial property set.
The harm at the wire is an unconstrained schema, not a wrong key.

## Why it matters

A `params:` field is the declared contract between the theta and the provider. A
document declaring `p: 'array<{a: b c, d e}>'` loads with zero diagnostics on
every channel, registers, and hands the provider `{}` for `p` — the schema that
accepts every value, which is the fragment
`theta/parse/empty-schema-body` exists to refuse when the author writes it
directly as `{}`.

The verdict inverts with the author's progress. `array<{a: b, d e}>` — the same
interior one keystroke earlier — is refused. Finishing the junk tail (`b c`)
silences the refusal the shorter spelling draws.

A well-formed field declared beside the junk is lost with no line:
`array<{a: b c, d e, m: integer}>` reaches the provider as `{}`, so `m` is
neither required nor described, in either source order (§Reproduction (c) c8,
c9).

Four register pages state this class as an unfixed residual
(`code-registry-parse.md:99`, `grammar.md:109`, `reference/grammar.md:247`,
`reference/schema-subset.md:55`). The spec therefore documents an
argument-accepting registration as current behaviour, which is a contract the
pages describe rather than intend.

## Non-goals

- **The colon-present entry's own verdict.** `a: b c` is bug 0252's subject
  class and bug 0244's operator adjudication clause 2 pins it unmoved. This
  report claims the STRANDED entry behind it and the registration that follows.
  Whether the stranding entry itself is refused is the boundary question §Fix
  routes to the operator.
- **The stray-close class.** A keyless entry carrying a `}` or `>` that closes
  nothing keeps bug 0238's silent tolerant registration
  (§Reproduction (f) f1). No cell above claims it.
- **The prompt rendering of tolerated junk.** Bug 0251 *Residuals* item 2 pins
  generic arguments as not projected and leaves such a type verbatim in the
  binder prompt. Measured here (§(f) f2), claimed there.
- **The rendering of the deferring nominal** at §(b) b6's `expected` column —
  bug [0247](./0247-untypeable-static-type-has-no-category-1-rendering-clause.md)'s
  class.
- **The zero-token entry.** `{a: integer,,b: string}` and `{,}` draw nothing;
  bug 0244 *Residuals* item 2 records it as separate filing material and no cell
  above claims it.
- **The empty type position.** Bug 0237's §Fix residual 1.
- **Citation drift.** Bug 0134's adjudicated class; every `src/` citation here
  is by symbol.

## Fix

**Blocked on an operator boundary adjudication.** The fix does not begin until
the operator settles the boundary against bug
[0252](./0252-brace-and-angle-annotation-junk-exempt-from-refusal.md), for the
reason bug 0244's own adjudication established: closing this class necessarily
reaches the colon-present junk tail that strands the entry, and that text is
0252's landed business. Two landed 0252 contracts are on the table, and both
must be named in the adjudication:

1. **The narrowed decline.** `annotationSourceIsNotTypeExpression` declines
   brace-and-angle text that is not a single enclosing brace group
   (`code-registry-parse.md:107`, shipped 0.225.0), because that is the one
   shape a union split can still shred. Every carrier of this report is exactly
   that shape (§Reproduction (d)). Any route through the recogniser reopens the
   boundary 0252 settled and must show, by measurement, that the union half of
   the shard hazard stays closed and that bug 0028's `RESULT-LET-BRACE` cell
   (`tests/unresolved-annotation-lowering.test.ts`) stays green.
2. **The colon-present disposition.** A colon-present entry with a junk tail
   keeps today's verdict — at an annotation
   `theta/parse/annotation-type-not-expression`, elsewhere the tolerant skip
   (bug 0244's adjudication clauses 2 and 4, encoded in
   `tests/inline-object-keyless-entry-refusal.test.ts`). Any route through the
   parser loop must decide whether the stranding entry `a: b c` is refused as
   well as the entry behind it, which flips cells 0252's witness and 0244's
   witness both own.

**The collision, stated concretely.** The parser cannot refuse the stranded
entry without deciding what the loop does at the junk tail that stranded it: to
reach `d e` the loop must either continue past `b c` (which means judging or
tolerating a colon-present entry with a junk tail — 0252's class) or the
document must be refused at the tail itself (which substitutes a parse refusal
for the disposition 0252 landed at the annotation positions and for the tolerant
skip elsewhere). The recogniser cannot refuse the text without widening a
decline 0252 narrowed deliberately in the other direction. There is no route
that touches only this report's cells.

**Once the boundary is settled, the route is constrained as follows.**

- **Emission site.** The refusal belongs where the entry becomes unreachable —
  `TypeParser.parseObject`'s entry-separator read — not at `walkType` and not in
  the raw-key split: the stranded entry is absent from `fieldNames`, from
  `fieldTypes` and from the colon-keyed split, and widening `topLevelColon`'s
  key rule would change what the four raw-key rows and the two lowerers keyed on
  it see (bug 0159's by-construction agreement).
- **Registry disposition.** REUSE
  `theta/parse/malformed-schema-field`, whose Trigger already reaches the inline
  interior and already names this class as its third exclusion
  (`code-registry-parse.md:99`). The fix rewrites that exclusion and its three
  mirrors — `docs/spec_topics/grammar.md:109`,
  `docs/reference/grammar.md:247`–`:249`,
  `docs/reference/schema-subset.md:55`–`:57` — in the same commit (DIAG-2).
  `docs/reference/diagnostics.md` carries no Trigger column and needs no edit;
  `tests/fixtures/h7a/permitted-codes.json` holds no `theta/parse/` code.
- **One line per entry.** Bug 0129's count-consequence law
  (`code-registry-parse.md:104`).
- **Reach.** Every cell of §Reproduction (a) a1, (b) b1–b12 and (c) c1–c13
  carries an error-severity diagnostic and does not register, at all twelve
  positions, at depth 2, under a doubled generic, in a two-argument generic and
  in a union arm over the wrapped type.
- **What must not move.** §(a) a2, a4, a5, a6; §(b)'s whole control column;
  §(d) d5, d6; §(e) e1–e3; §(f) f1 and f2; and the locks in §Affected. Any cell
  the fix flips is flipped by an ADDED diagnostic and stated at the cell.
- **Bug 0244's group (K) is the red-when-fixed pin.**
  `tests/inline-object-keyless-entry-refusal.test.ts` group (K) records this
  class at its measured values and states that a change closing it is expected
  to red the group loudly. The fix updates those cells to the new values with
  this report's attribution, never deletes them, and re-derives the file's
  group-(L) inventory constants.
- **Witness.** One new offline test file over `parseDoc`,
  `doc.frontmatter.params.loweredSchema` and `lowerQueryResponseSchema`,
  carrying §Reproduction (a)–(g) with both columns per row, plus direct unit
  cells over `annotationSourceIsNotTypeExpression` and
  `isSingleEnclosingBraceGroup` for §(d).
- **Live cover.** Owed: the route changes a registration outcome at the
  `params:` position, so a live cell must show the carrier absent from the
  registered set while its byte-neighbour control registers and drives a real
  turn, discriminated by a task-framed arithmetic oracle over bound values and
  never a verbatim echo (bug 0243). The shape to mirror is
  `tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts`.
- **Coordination clause — bug 0238's live offender leg.** Bug 0238's live pair
  (`tests/live/inline-object-stray-close-token-live-cell.test.ts`,
  `tests/live/acceptance/inline-object-stray-close-token-load.test.ts`) uses a
  FIXED observable on its offender leg — the arithmetic answer over two bound
  values — because its offender registers both before and after 0.218.0, so
  "absent from the registered set" was not available as an oracle. That
  adjudication is reversible exactly when the offender interior stops
  registering. Measured at this HEAD, 0238's offender is unmoved by this
  report's carriers (§Reproduction (f) f1), so the retake becomes available only
  if the boundary adjudication above widens the emission to the colon-present
  junk-tail class as well. If it does, the offender leg can be re-taken to a
  content oracle (absence from the registered set, the shape bug 0252's live
  cell already uses) in the same commit; if it does not, both legs stay as
  landed. The fix states which, by measurement.

## Provenance

Filed as the forward filing of bug 0244's `## Fix (0.238.0)` *Residuals* item 1
("the break-residue class is not closed"), which records
`p: 'array<{a: b c, d e}>'` reporting `[]`, registering and lowering the
permissive `{}` at HEAD `537c274c` and under that change alike, pins the class
in its witness group (K) as measured-not-desired, and states that closing it
"will necessarily touch bug 0252's colon-present class — an operator decision,
not a lane one". 0244's document does not close the class and claims no cell of
it.

Ownership checked at HEAD before any probe: `rg -l` over `docs/bugs/` for
`break-residue`, `a: b c` and the carrier spelling returns 0244 alone, which is
**fixed (0.238.0)**; 0238, 0251 and 0252 are fixed and each pins this class or
its neighbour as out of its own scope (0238's stray-close tolerance, 0251's
*Residuals* item 2 non-projection, 0252's narrowed decline). No open document
claims the stranded entry or the permissive registration.

Independently re-derived at HEAD `53cd0d86` (0.240.0): one scratch vitest file
over `parseDoc` (`tests/helpers/e2e-s1.ts`),
`doc.frontmatter.params.loweredSchema`, `lowerQueryResponseSchema`
(`src/runtime/query-schema-lowering.ts`),
`annotationSourceIsNotTypeExpression` (`src/parser/type-layer-checks.ts`) and
`isSingleEnclosingBraceGroup` (`src/parser/params.ts`), run in six rounds
covering §Reproduction (a)'s six rows, (b)'s twelve positions with both columns,
(c)'s thirteen spellings with their lowerings, (d)'s six direct recogniser
cells, (e)'s three union rows and (f)'s two neighbour rows, plus the corpus
census over `git ls-files -- '*.theta' '*.thetalib'` (34 files, one inline
object type, no carrier). The scratch file was deleted; the tracked tree carries
this document alone.

Two facts beyond 0244's residual are added by this measurement. The silence is
not confined to the generic-argument position that residual names: the wrapped
interior is silent at ELEVEN of the twelve `Type` positions and the twelfth
draws only the deferring nominal's mismatch (§(b)), because the gate that
refuses the unwrapped text declines the wrapped text by bug 0252's landed
single-enclosing test (§(d)). And a well-formed field declared beside the junk
is lost with it in either source order (§(c) c8, c9), so the class starves a
declared field rather than only withholding a diagnostic.

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.

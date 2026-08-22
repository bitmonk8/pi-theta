# Bug 0238 — A stray depth-0 CLOSE token in an inline object type underflows `splitTopLevelSegments`' depth counter, so every entry behind it merges into one unkeyed segment: `p: '{a: integer, b > c, m: integer}'` loads clean, lowers `p` to a one-field `{a}` whose `additionalProperties: false` REJECTS the declared field `m`, and withholds all four raw-key rules — while `TypeParser.skipMalformedEntry` CLAMPS on the same token and its own field rules still fire behind it

- **Status:** open. Filed as bug
  [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md)'s
  `## Fix (0.189.0)` *Residuals* item 2 (`:711`). Re-measured at HEAD for this
  filing, not copied from that record. **Ordering:** no report blocks this one
  and this one blocks none; bug 0231 is fixed and shipped, and the clamp it
  landed (`src/parser/type-grammar.ts:798`–`:800`) is one of the two behaviours
  §Fix must reconcile.
- **Sev/Diff estimate:** S1/D2 — S1 because a declared `params:` contract is
  deleted with nothing on any channel and the deletion INVERTS at runtime:
  `p: '{a: integer, b > c, m: integer}'` draws `[]`, registers, and lowers
  `p` to `{"$ref":"#/$defs/__inline_df817b794ef788ce"}` whose fragment carries
  `a` alone with `additionalProperties: false`, so a call supplying the
  author-declared `m` is refused by the envelope validator
  (`must NOT have additional properties`, §Reproduction E) where the control
  `{a: integer, m: integer}` accepts it. Every entry behind the stray token is
  lost, not one (W3: `m` and `n` both), and all four raw-key rules
  `grammar.md:109` states "hold in every `Type` position" go silent for the
  merged region — duplicate (W6), quoted (W8), rename (W12) and non-identifier
  (W10) each fire in their control and draw nothing behind the stray token.
  D2 because the two functions are shared substrate: `splitTopLevelSegments`
  (`src/parser/params.ts:1918`) is reached from 13 call sites across five
  modules through `splitTopLevel` (`:1976`), and `topLevelColon`
  (`:1842`) from three, so a clamp moves every union-arm, generic-argument and
  field-list consumer at once; the refusal route instead needs a registry edit,
  because the load row's brace exemption
  (`code-registry-load.md:19`) presently ADMITS a brace-carrying fragment whose
  quotes all close, which is exactly this class.
- **Kind:** defect — implementation, against a normative rule
  (`grammar.md:109`, all four raw-key rules hold in every `Type` position) and
  against the schema-subset lowering (`schema-subset.md:73`, which defines no
  field-dropping emission). Two components, one token.
  1. **The split's depth counter has no floor.** `splitTopLevelSegments`
     decrements unconditionally on `>` (and on `}` under
     `"angle-and-brace"`) at `src/parser/params.ts:1951`. A close token with no
     matching opener takes depth to `-1`, and the separator test at `:1955` is
     `depth === 0`, so no later separator is top-level: the remainder of the
     source becomes one segment. `topLevelColon` has the same shape — decrement
     at `:1860`, `depth === 0` colon test at `:1861` — so the merged segment
     yields `-1` and contributes NO key at all. Measured:
     `splitTopLevel("a: integer, b > c, m: integer", ",", "angle-and-brace")`
     is `["a: integer", "b > c, m: integer"]` and `topLevelColon` of the second
     is `-1`.
  2. **The three consumers of that pair silently follow it.**
     `inlineObjectFieldKeys` (`src/parser/type-grammar.ts:833`, split `:835`,
     colon `:836`) skips a `colon < 0` entry (`:837`–`:839`), which is what
     withholds the four raw-key rules; `hoistInlineObjectType`
     (`src/parser/params.ts:1269`, split `:1276`, colon `:1277`) and
     `lowerInlineObject` (`src/parser/body-type-lowering.ts:173`, split `:182`,
     colon `:183`) skip the same entry, which is what drops the fields from the
     lowered fragment. The gate the raw-key rules share is
     `TypeNode.closingBraceSpelled` (`type-grammar.ts:766`,
     read `:1118`), and it is TRUE for these fixtures: W13's
     `theta/parse/binding-case-mismatch` fires on `Zs` behind the stray token,
     and that rule is "gated ONLY on `TypeNode.closingBraceSpelled`"
     (`type-grammar.ts:884`–`:885`). The rules run; their split answers nothing.
  3. **The counterpart component clamps.** `TypeParser.skipMalformedEntry`
     (`src/parser/type-grammar.ts:790`) returns without decrementing on a
     depth-0 `}` or `>` (`:798`–`:800`), so `parseObject`'s field loop keeps
     reading entries behind the stray token and the identifier-token rules keep
     firing there (W13). The helper's own doc comment already states the
     divergence (`:779`–`:782`). The two inventories of one interior therefore
     disagree, and nothing reconciles them.
- **Related:**
  - [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) —
    **fixed (0.189.0)**, the origin. Its *Residuals* item 2 (`:711`) records
    this class in the direction it measured (`let x: {a b > c, Zs: string} = 1`
    drawing `binding-case-mismatch` alone) and declines the repair on region
    grounds. **Not a duplicate:** 0231 is closed on `parseObject`'s field-loop
    `break`; this report claims the raw-key split's depth counter, a different
    function in a different module, and adds the `params:` lowering and
    registration observables the residual does not state. Its two new witnesses
    are LOCKS (§Fix constraint 5).
  - [0232](./0232-unterminated-literal-params-type-drops-inline-fields.md) —
    **fixed (0.188.0)**, the nearest neighbour and the reason this report exists
    separately. That report's subject is a string literal that never closes;
    its fix routes such a fragment to
    `theta/load/params-type-not-expression`, and at HEAD
    `p: '{a as "w: integer}'` refuses (§Reproduction D, W17). This report's
    subject is a BALANCED-quote fragment carrying an unmatched close token,
    which the same row's brace exemption admits by rule
    (`code-registry-load.md:19`: "a fragment that reaches the judgement WHOLE
    with a brace in it and every quote closed stays admitted"). Distinct
    spelling, distinct disposition, opposite outcome. Its 5-cell witness
    `tests/unterminated-literal-params-type-refusal.test.ts` is a LOCK.
  - [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
    **fixed (0.139.0)**, the substrate precedent: it left
    `splitTopLevel`'s cut points untouched and repaired the CONSEQUENCE by
    classifying each segment whole-in-the-source or not
    (`classifyGenericArgumentSegments`, `src/parser/params.ts:985`; contract
    `:957`–`:984`). The
    same split is this report's subject one layer down — its depth arithmetic
    rather than its bracket vocabulary — and its §Fix (b)(3) classification is a
    constraint on route (a) (§Fix constraint 3).
  - [0217](./0217-nested-inline-enum-in-generic-argument-draws-nothing.md) —
    **fixed (0.148.0)**, fixed substrate over the same split: the last-resort
    push of an unsplittable bracket group's own source text into the
    `unspellable` sink. Disjoint subject (a CLOSED `[…]` group, not an unmatched
    close token); its witness
    `tests/generic-argument-shredded-group-refusal.test.ts` is a LOCK.
  - [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) —
    **fixed (0.161.0)**, one of the four rules this class withholds (W8). Its
    16-cell witness `tests/inline-object-quoted-field-name-refusal.test.ts` is a
    LOCK.
  - [0227](./0227-non-ascii-inline-object-field-name-admitted.md) — **fixed
    (0.183.0)**, the non-identifier rule this class withholds (W10). Its 62-cell / 43-`it`
    witness `tests/inline-object-field-name-case.test.ts` is a LOCK.
  - [0229](./0229-escaped-quote-wire-name-drops-inline-field.md) — **fixed
    (0.182.0)**, the rename rule this class withholds (W12) and the report that
    fixed `topLevelColon`'s quote handling. Its 33-cell witness
    `tests/escaped-quote-inline-field-name-refusal.test.ts` is a LOCK.
  - [0042](./0042-schema-decl-same-line-residue-silent.md) — **fixed
    (0.52.0)**, the one consumer that reads `splitTopLevelSegments` DIRECTLY
    for its empty-segment count (`src/parser/theta-document.ts:2842`). The alias
    RHS refuses this class ahead of the count (§Reproduction D, W18), so no
    count observable is claimed here; the site is named because route (a) moves
    its input.
  - [0237](./0237-empty-inline-field-type-truncates-interior.md) — **open**,
    bug 0231's *Residuals* item 1, filed in parallel. Disjoint mechanism
    (`parsePrimary`'s tolerant punctuation skip consuming an entry separator)
    and disjoint surface (`src/parser/type-grammar.ts`), sharing only the
    inline-object interior. Neither report blocks the other; whichever lands
    second re-measures the other's rows over the same interiors.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated citation-drift class. A route touching `src/parser/params.ts`
    shifts absolute line numbers in that file; not chased here.
- **Affected:** `splitTopLevelSegments` (`src/parser/params.ts:1918`;
  unconditional decrement `:1951`, `depth === 0` separator test `:1955`),
  `topLevelColon` (`:1842`; decrement `:1860`, colon test `:1861`),
  `splitTopLevel` (`:1976`), and the three consumers that pair them —
  `inlineObjectFieldKeys` (`src/parser/type-grammar.ts:833`),
  `hoistInlineObjectType` (`src/parser/params.ts:1269`), `lowerInlineObject`
  (`src/parser/body-type-lowering.ts:173`). The clamping counterpart is
  `TypeParser.skipMalformedEntry` (`src/parser/type-grammar.ts:790`, clamp
  `:798`–`:800`, divergence comment `:779`–`:782`).
- **Observed at:** HEAD `30c0cb67` (v0.197.0), offline, provider-free.

## Summary

`splitTopLevelSegments` and `topLevelColon` count bracket depth with no floor.
A close token that opens nothing — a `>` at depth 0 anywhere in an inline
object's interior, or a `}` under `"angle-and-brace"` nesting — drives depth to
`-1`, and both functions test `depth === 0` before honouring a separator or a
colon. Everything behind that token therefore reads as one segment with no
top-level colon, which the three consumers that key on the pair skip whole.

The observable at `params:` is a silently deleted contract. `p: '{a: integer,
b > c, m: integer}'` draws `[]`, registers, and lowers `p` to a fragment
declaring `a` alone with `additionalProperties: false`; a call supplying the
declared `m` is then refused by the envelope validator. Two fields behind the
token are lost as readily as one. Where the stray token sits in the FIRST
entry, no key survives and `p` lowers to the permissive `{}`. Where it sits
inside a nested object, the split cuts that object in two and PROMOTES its
second field into the outer contract with a permissive `{}` type.

The four raw-key rules go with the fields: duplicate, quoted, rename and
non-identifier each fire in their control and draw nothing when the same entry
sits behind a stray close token, against `grammar.md:109`, which states all four
"hold in every `Type` position".

The type parser answers the opposite way on the same token. Bug 0231's
`skipMalformedEntry` clamps at depth 0 rather than decrementing, so
`parseObject`'s field loop keeps reading entries behind the stray token and
`theta/parse/binding-case-mismatch` still fires on a field the split has already
lost. One interior, two inventories; the code comment at
`src/parser/type-grammar.ts:779`–`:782` states the divergence and no rule
resolves it.

## Reproduction

Zero model turns, no provider contacted. Every `params:` fixture is a whole
prompt-mode theta:

```
---
mode: prompt
params:
  p: "<type under test>"
---
let x = 1
```

`diags` is the whole unfiltered `doc.diagnostics` list in emission order.
`[]` means the theta registers: `hasLoadParseError`
(`src/extension/production-composition.ts:2220`, read at `:1502` and `:2108`)
needs one error-severity `theta/load/` or `theta/parse/` code. `lowered` is
`doc.frontmatter.params.loweredSchema`; `$defs` bodies are shown inline.

### (A) The class — a stray depth-0 `>` at `params:`

| row | `p:` type under test | diags | lowered `p` / `$defs` fragment |
| --- | --- | --- | --- |
| W1 control | `{a: integer, m: integer}` | `[]` | `$ref → {a: integer, m: integer}`, `required ["a","m"]` |
| W2 **THE SHARP ROW** | `{a: integer, b > c, m: integer}` | `[]` | `$ref → {a: integer}`, `required ["a"]`, `additionalProperties false` |
| W3 two entries behind | `{a: integer, b > c, m: integer, n: integer}` | `[]` | `$ref → {a: integer}` — `m` and `n` both gone |
| W4 stray in the FIRST entry | `{b > c, m: integer}` | `[]` | `p: {}` — no `$defs` entry at all |
| W15 nested, cut in two | `{a: integer, n: {q > r, m: integer}}` | `[]` | `$ref → {a: integer, n: {}, m: {}}`, `required ["a","n","m"]` — the inner `m` is PROMOTED to the outer contract |
| W16 nested control | `{a: integer, n: {q: integer, m: integer}}` | `[]` | outer `{a, n}` with `n` a `$ref` to the inner `{q, m}` |

W2 is the row the class is named for: `{a: integer, b > c, m: integer}` splits
to `["a: integer", "b > c, m: integer"]`, the second segment's `topLevelColon`
is `-1`, and `m` never reaches `properties`. W4 shows the whole declaration
collapsing when no segment survives with a key. W15 is the nested form: the `>`
returns depth to 0 inside `n`'s own braces, so the comma before `m` reads as
top-level and cuts the nested object apart.

### (B) The four raw-key rules, each with its control

| row | `p:` type under test | diags |
| --- | --- | --- |
| W5 duplicate control | `{a: integer, a: integer}` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'a' within one inline object type` |
| W6 duplicate behind stray | `{a: integer, b > c, a: integer}` | `[]` |
| W7 quoted control | `{a: integer, 'q': integer}` | `error theta/parse/quoted-inline-field-name: quoted field name ''q'' within one inline object type; field names are identifiers` |
| W8 quoted behind stray | `{a: integer, b > c, 'q': integer}` | `[]` |
| W9 non-identifier control | `{a: integer, é: integer}` | `error theta/parse/inline-field-name-not-identifier: field name 'é' within one inline object type is not an identifier` |
| W10 non-identifier behind stray | `{a: integer, b > c, é: integer}` | `[]` |
| W11 rename control | `{a: integer, m as "w": integer}` | `error theta/parse/renamed-inline-field-name: wire-name rename on field 'm' within one inline object type` |
| W12 rename behind stray | `{a: integer, b > c, m as "w": integer}` | `[]` |

Every W6/W8/W10/W12 row also registers and lowers `p` to the one-field `{a}`
fragment of W2.

### (C) The disagreement with the type parser

| row | `p:` type under test | diags |
| --- | --- | --- |
| W13 | `{a: integer, b > c, Zs: string}` | `error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _` |

`binding-case-mismatch` keys on `TypeNode.fieldNames` — the parser's identifier
retention — and is gated only on `TypeNode.closingBraceSpelled`
(`src/parser/type-grammar.ts:884`–`:885`). It fires on `Zs`, which proves both
that the parser's field loop reads past the stray token (the 0231 clamp) and
that the gate the raw-key rules share is satisfied for this interior. The
raw-key rules run on the same node and answer nothing, because their split has
merged `Zs` away. W13 does not register — the error refuses the theta — so the
lowering loss is unobservable on that row; W2, W6, W8, W10 and W12 are the rows
where nothing refuses.

### (D) Boundaries — measured, and NOT claimed

| row | source under test | diags |
| --- | --- | --- |
| W14 stray after a well-formed field type | `p: "{a: integer, b: integer > , m: integer}"` | `error theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression` |
| W17 bug 0232's spelling | `p: "{a as \"w: integer}"` | `error theta/load/params-type-not-expression: …` |
| W18 alias RHS, stray `>` | `schema U = Cat > \| Dog` | `error theta/parse/schema-type-not-expression: 'U' declares a type that is not a theta type expression` |
| W19 alias RHS control | `schema U = Cat \| Dog` | `error theta/parse/missing-discriminator: U is a union of object schemas with no shared single-literal discriminator field. …` |
| W20 `let` annotation, control | `let y: {a: integer, m: integer} = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'y' initialiser type mismatch: expected { a: integer, m: integer }, got integer` |
| W21 `let` annotation, stray | `let y: {a: integer, b > c, m: integer} = 1` | `[]` |
| W22 `let` annotation, duplicate behind stray | `let y: {a: integer, b > c, a: integer} = 1` | `[]` |

W14 bounds the class by position within the entry: a stray close token after a
field type that already parsed leaves text the `params:` text stage refuses, so
that spelling is honest. The class claimed here is the stray token inside an
entry that does not spell `Ident ":"` (W2's `b > c`), which the brace exemption
admits. W17 is bug 0232's spelling at HEAD, refusing — the distinction that
report's `## Fix (b)` draws, re-measured. W18 shows the alias RHS refusing this
class ahead of any segment count, so bug 0042's count consumer carries no
observable here. W21 and W22 are the same class at a second position; the
missing `let-rhs-type-mismatch` on W21 is measured and NOT attributed to the
split by this report — the annotation's structural type is built off the type
parse, and this report claims no cause for that row.

### (E) The runtime consequence of W2

The lowered envelope of W2 validated against `{"p": {"a": 1, "m": 2}}` with
`Ajv({strict: false, allErrors: true})`, the configuration
`AjvSchemaValidator` uses (`src/seams/schema-validator.ts:384`):

| row | `p:` type | result |
| --- | --- | --- |
| E1 control `{a: integer, m: integer}` | valid | `true` |
| E2 W2's `{a: integer, b > c, m: integer}` | invalid | `additionalProperties` at `/p`: `must NOT have additional properties`, `additionalProperty: "m"` |

The author declared `m`; the registered contract forbids it.

### (F) The committed corpus

`git ls-files -- '*.theta' '*.thetalib'` → **34 files**.
`tests/committed-fixture-parse-gate.test.ts` is green at HEAD (36 tests).
`git ls-files -- '*.theta' '*.thetalib' | xargs grep -n '>' | grep -v '=>'`
returns nine lines: five inside comments or string literals, three balanced
generic applications (`array<string>`, `Result<integer, QueryError>`,
`@<Triage>`) and one `>` comparison operator in an expression. No committed
fixture spells a depth-0 close token in a type position, so a refusal route
newly refuses no committed file. That bounds the corpus half of a
GOV-15 sweep; it does not discharge it, because every (A) and (B) row loads
cleanly today.

## Expected behaviour

1. **The two inventories of one interior agree.** `skipMalformedEntry`'s
   boundary (`src/parser/type-grammar.ts:798`–`:800`) and
   `splitTopLevelSegments`' boundary (`src/parser/params.ts:1951`) answer alike
   on a depth-0 close token, or the divergence is registered rule rather than
   an artefact of two independently-written depth counters. The comment at
   `:779`–`:782` states the divergence today; after the fix it states a rule.
2. **A field the author declared is not deleted from the lowered contract in
   silence.** W2's `m`, W3's `m` and `n`, and W15's inner `m` either reach
   `properties` or the theta refuses. `schema-subset.md:73` defines a hoist over
   the fields the type declares and no field-dropping emission.
3. **The four raw-key rules hold behind a stray close token.** W6, W8, W10 and
   W12 either draw their control's diagnostic or the theta refuses on the
   malformed entry; `grammar.md:109` states all four hold "in every `Type`
   position", which a merged segment silently exempts.
4. **A registered contract does not forbid what it declares.** E2 either
   validates like E1 or the theta never registers.
5. **Nothing else moves.** W1, W16, W19 and W20 keep their diagnostics, values
   and lowered bytes; W13 keeps `binding-case-mismatch` as its only line; W14,
   W17 and W18 keep their existing refusals with the same codes and messages;
   the five LOCK witnesses of §Fix constraint 5 keep their cell counts and
   ordered diagnostic lists apart from the cells the chosen route's own
   authority moves.

## Actual behaviour / root cause

**One arithmetic, no floor, two functions.** `splitTopLevelSegments`
(`src/parser/params.ts:1918`) increments on `<` (and on `{` when
`nesting === "angle-and-brace"`) at `:1945`–`:1946`, decrements on the matching
close at `:1950`–`:1951`, and honours the separator only at `depth === 0`
(`:1955`). A close token with no opener makes `depth` `-1`. Nothing raises it
again — a later `<` brings it to `0`, but the fixtures here spell none — so the
rest of the source accretes into `current` and is pushed as one final segment at
`:1962`. `topLevelColon` (`:1842`) repeats the shape at `:1858`–`:1861` and
returns `-1` for that merged segment.

**Three consumers read the pair and skip what it cannot key.**
`inlineObjectFieldKeys` (`src/parser/type-grammar.ts:833`) drops a `colon < 0`
entry at `:837`–`:839`, and it is the sole key source for
`duplicate-inline-field-name`, `quoted-inline-field-name`,
`renamed-inline-field-name` and `inline-field-name-not-identifier`
(`:1119`, precedence at `:1131`–`:1226`). `hoistInlineObjectType`
(`src/parser/params.ts:1269`) drops the same entry at `:1278`–`:1280`, which is
where the `params:` fields disappear; `lowerInlineObject`
(`src/parser/body-type-lowering.ts:173`) drops it at `:184`. None of the three
emits anything on the skip — the skip is the "entry with no top-level colon"
case that a legitimately keyless entry also takes.

**The gate is satisfied, so the silence is the split's.** All four raw-key
rules are gated on `TypeNode.closingBraceSpelled` (`:1118`), computed at `:766`
from `interiorClosingBraceIndex`. W13's `binding-case-mismatch` — gated on that
flag alone (`:884`–`:885`) — fires for `{a: integer, b > c, Zs: string}`, so the
flag is true and the interior source is the full text between the braces. The
rules execute over a key list the split has already emptied of everything behind
the stray token.

**The parser resynchronises where the split gives up.** `skipMalformedEntry`
(`:790`) tracks the same two bracket pairs but returns WITHOUT decrementing on
a depth-0 `}` or `>` (`:798`–`:800`), because the enclosing `parseObject` /
`parseGeneric` still needs that token. The clamp is what lets the field loop
reach `Zs`. The two components were written to agree — the helper's comment
(`:774`–`:778`) says the boundary "must be the SAME boundary
`inlineObjectFieldKeys` splits `interiorSource` on" — and on this one token
class they do not.

**The `params:` text stage admits the fragment by rule, not by accident.**
`theta/load/params-type-not-expression`'s registered trigger
(`code-registry-load.md:19`) exempts "any FRAGMENT carrying a `{` or `}`
anywhere, balanced or not … PROVIDED that fragment carries no string literal
that never closes". W2's braces balance and its quotes are absent, so the
exemption applies and the field is admitted with whatever the brace frame lowers
— here, a fragment missing the fields the split lost. Bug 0232 narrowed that
exemption for unterminated literals (W17); the unmatched close token was not in
its scope.

## Why it matters

A `params:` block is the theta's contract with its caller. W2 registers a
contract that omits a declared field AND forbids it: E2's validator refuses
`{"a": 1, "m": 2}` against a declaration that spells `m`. The author's only
signal is the absence of `m` from a schema they never see.

The loss scales with the interior. W3 loses two fields to one token; W4 loses
the whole declaration and lowers the permissive `{}`, which accepts any JSON;
W15 promotes a nested field into the outer object and lowers two properties
permissively, so the registered contract is not a subset of the declared one but
a different shape.

The four withheld rules are the four that bugs 0159, 0176, 0160/0229 and 0227
each landed to close a silent-acceptance class. Behind one stray close token all
four revert to the behaviour those reports fixed, at every `Type` position,
which makes the rule `grammar.md:109` states — that they hold in every position
— false as written.

The disagreement between the split and `skipMalformedEntry` is itself a hazard
for the next change to either: the helper's comment says the two boundaries must
agree, and a future edit made on the strength of that sentence will be wrong on
this class until one rule is chosen.

## Non-goals

- **The empty-TYPE-position truncation.** Bug
  [0237](./0237-empty-inline-field-type-truncates-interior.md)'s subject
  (`parsePrimary`'s tolerant punctuation skip eating an entry separator).
  Disjoint mechanism; not touched here.
- **`parseObject`'s clamp behaviour as a cursor contract.** Bug 0231 §Fix fixed
  where `skipMalformedEntry` leaves the cursor, and route (b) below keeps it
  exactly. Route (a) reconciles the SPLIT to the clamp, not the clamp to the
  split.
- **The generic-argument split's bracket vocabulary.** Bugs 0204 and 0217 own
  which bracket pairs `"angle"` counts and what happens to a manufactured
  shard. This report claims the depth counter's floor, not its alphabet.
- **The `let`-annotation structural type.** W21's missing
  `let-rhs-type-mismatch` is measured and unattributed (§Reproduction D).
- **Widening the brace exemption generally.** Only the unmatched-close-token
  class is claimed; a fragment whose braces balance and whose entries all key
  stays admitted.
- **Citation drift in other documents.** Bug 0134's adjudicated class.

## Fix

The subject is one unfloored decrement whose two consumers disagree with a third
component that clamps. The route is defined by which component becomes law; the
choice is NOT settled here, and both routes carry the same measured rows.

**Route (a) — clamp to match.** `splitTopLevelSegments`
(`src/parser/params.ts:1951`) and `topLevelColon` (`:1860`) floor their
decrement at zero, so a depth-0 close token neither opens nor closes a nesting
level and the separator behind it stays top-level. The split's boundary then IS
`skipMalformedEntry`'s boundary, and the comment at
`src/parser/type-grammar.ts:774`–`:782` becomes true as originally written. W2's
`m`, W3's `m`/`n` and W15's inner `m` reach the key list and the lowered
fragment; W6, W8, W10 and W12 draw their control's diagnostic. This route adds
no code to the registry and refuses no input that loads today except through the
four rules already registered. Its cost is blast radius: the floor applies to
all 13 `splitTopLevel` / `splitTopLevelSegments` call sites and all three
`topLevelColon` call sites, including the union-arm splits
(`params.ts:419`, `:689`, `:1559`, `:1742`, `frontmatter.ts:615`,
`theta-document.ts:2842`, `:7379`, `:7480`) and the generic-argument splits
(`params.ts:713`, `theta-document.ts:6395`), so it must be premeasured over the
whole default suite before it is written.

**Route (b) — refuse the stray close token.** The split is left alone and the
spelling is refused where it is read: an inline object interior (or a generic
argument list) carrying a close token that matches no opener draws an
error-severity diagnostic, and the lowering never runs on it. This route needs a
registry decision under DIAG-2 (`diagnostic-shape.md:72`): either a new code
with its own row, or the `theta/load/params-type-not-expression` brace exemption
(`code-registry-load.md:19`) narrowed a second time — as bug 0232 §Fix narrowed
it for unterminated literals — plus the parallel narrowing for the non-`params:`
positions, which carry their own rows (`theta/parse/annotation-type-not-expression`,
`theta/parse/schema-type-not-expression`,
`theta/parse/query-annotation-type-not-expression`, `grammar.md:105`). It is a
GOV-15 diagnostic-registry carve-out for the inputs it touches
(`source-language-stability.md`, §Diagnostic-registry carve-out), and §Reproduction (F)
bounds the committed corpus at zero affected files.

**Constraints on either route.**

1. **W13 keeps exactly one line.** `binding-case-mismatch` on `Zs` is the
   parser-side rule and does not double under route (a); under route (b) the
   row's list may change only by the route's own new refusal.
2. **The `params:` silent rows must stop being silent.** W2, W3, W4, W6, W8,
   W10, W12 and W15 each end in a diagnostic or in a lowered fragment carrying
   every declared field. A route that leaves any of them at `[]` with a
   short fragment has not closed the report.
3. **Bug 0204's segment classification is preserved.** Route (a) changes cut
   POINTS, and `classifyGenericArgumentSegments`
   (`src/parser/params.ts:985`) reproduces the split's `"angle"` idiom "byte for
   byte" (`:971`–`:975`) to keep its index correspondence. Any floor added to the
   split is added to that scan in the same commit, and the correspondence is
   re-measured, not assumed.
4. **Bug 0042's count comparison is preserved.** The malformed-alias-rhs check
   compares `splitTopLevelSegments`' count against `splitTopLevel`'s
   (`src/parser/theta-document.ts:2842`); W18/W19 keep their codes and messages.
5. **Locks.** These witnesses keep their cell counts and ordered diagnostic
   lists, apart from cells the chosen route's own authority moves, and each is
   re-run before and after:
   `tests/unterminated-literal-params-type-refusal.test.ts` (bug 0232, **5**
   cells); `tests/escaped-quote-inline-field-name-refusal.test.ts` (bug 0229,
   **33** cells / 12 `it` blocks);
   `tests/inline-object-quoted-field-name-refusal.test.ts` (bug 0176, **16**
   cells); `tests/inline-object-field-name-case.test.ts` (bug 0227, **62**
   cells / 43 `it` blocks);
   `tests/inline-object-malformed-entry-resync.test.ts` and
   `tests/inline-object-wire-name-rename-refusal.test.ts` (bug 0231);
   `tests/params-inline-object-lowering.test.ts` (**32** `it` blocks);
   `tests/generic-argument-shredded-group-refusal.test.ts` (bugs 0204/0217);
   `tests/committed-fixture-parse-gate.test.ts`.
6. **The divergence comment is corrected in the same commit.**
   `src/parser/type-grammar.ts:774`–`:782` states today's disagreement; it
   states the chosen rule afterwards. Bug 0231 §Fix (c)'s obligation — correct
   the prose a choice falsifies rather than weaken it — applies.
7. **Corpus.** `tests/committed-fixture-parse-gate.test.ts` green, and under
   route (b) the corpus scan of §Reproduction (F) is re-run at the fix tree
   rather than cited from here.

**Witness — offline, provider-free.** One new file on bug 0231's witness shape
(`parseDoc` from `tests/helpers/e2e-s1.ts`, whole-list ordered `toEqual` over
unfiltered `doc.diagnostics`, expected messages read from the registry through
the `registryMessage` oracle, lowered bytes asserted against hand-written
canonical forms rather than the implementation's serialiser). Required cells:
W1–W4 and W15/W16 with their lowered fragments; W5–W12 as the four rule pairs;
W13 as the parser-side agreement cell; W14, W17, W18, W19 as must-not-move
refusal boundaries; W20–W22 for the second position; E1/E2 as the validator
cells; and a direct unit cell over `splitTopLevelSegments` / `topLevelColon`
pinning the depth-0 close token's segmentation, since that is the changed
arithmetic under route (a). A live cell is owed under either route on bug 0231's
precedent, because both change a registration outcome (W2 registers today).

## Provenance

- **Origin:** bug 0231's `## Fix (0.189.0)` *Residuals* item 2
  (`docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:711`):
  "*The resync boundary and the raw-key split diverge on a stray CLOSE token at
  depth 0.* `skipMalformedEntry` clamps …; `splitTopLevelSegments`
  (`params.ts`) decrements unconditionally and underflows, after which no later
  comma is top-level and `topLevelColon` also underflows, so the raw-key view
  yields ZERO keys. … Not repaired here: `src/parser/params.ts` is another
  lane's region this set, and the clamp is the safer of the two rules."
- **Ownership check performed before any probe.**
  `rg -l 'splitTopLevelSegments|topLevelColon' docs/bugs/` returns 20 documents
  besides this one; every one whose subject is this split is **fixed** (0035,
  0039, 0042, 0052, 0053, 0061, 0097, 0154, 0159, 0160, 0161, 0164, 0176, 0204,
  0229, 0231, 0232, 0235), and the two open ones are
  [0134](./0134-params-shift-induced-stale-citations.md) (citation drift) and
  [0236](./0236-bracket-group-generic-argument-truncates-list.md), whose
  subject is `parsePrimary`'s handling of a `[` in `src/parser/type-grammar.ts`.
  This report's parallel sibling
  [0237](./0237-empty-inline-field-type-truncates-interior.md) names neither
  symbol. No document claims the depth counter's missing floor. Bug 0231's whole record was read first,
  including its §Fix constraints and all four residuals; bug 0232's §Fix (b)
  was read to establish the distinction §Reproduction (D) measures.
- **Measured at HEAD `30c0cb67` (v0.197.0), not copied.** The residual's `let`
  row reproduces (W21/W22 are its class at that position), and the measurement
  adds what the residual does not state: the `params:` position, where the class
  is silent rather than refusing (W2, W6, W8, W10, W12); the lowered fragments
  and the fields they omit (W2, W3, W4, W15); the validator consequence (E1/E2);
  the four rule pairs against their controls; the satisfied
  `closingBraceSpelled` gate that attributes the silence to the split rather
  than to the grammar requirement (W13); and the two boundary spellings that
  refuse honestly (W14, W18). The residual's claim that the raw-key view yields
  "ZERO keys" holds only when the stray token sits in the first entry (W4);
  where it sits later, the keys AHEAD of it survive (W2 keeps `a`) and the
  residual's wording is narrowed accordingly.
- **Scratch probes.** Five probe files under `tests/`, each named
  `scratch-0238-*`, deleted after measurement; `git status --short` carries no
  `tests/` entry from this filing. One pre-existing foreign scratch file,
  `tests/scratch-parfor-qsr-probe.test.ts`, belongs to another session and was
  left untouched.

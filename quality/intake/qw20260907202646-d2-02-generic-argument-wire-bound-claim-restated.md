---
id: pending
title: type-grammar.ts restates one claim — that the lowering never divides a generic argument's interior into fields, so the wire consequence is bounded but the source key is still judged — at twelve sites in three parallel layers of narration
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/type-grammar.ts:46-54
  - src/parser/type-grammar.ts:62-66
  - src/parser/type-grammar.ts:89-92
  - src/parser/type-grammar.ts:1376-1382
  - src/parser/type-grammar.ts:1406-1413
  - src/parser/type-grammar.ts:1424-1429
  - src/parser/type-grammar.ts:1466-1470
  - src/parser/type-grammar.ts:1477-1482
  - src/parser/type-grammar.ts:1534-1536
  - src/parser/type-grammar.ts:1556-1562
  - src/parser/type-grammar.ts:1618-1628
  - src/parser/type-grammar.ts:1699-1706
sites: 12
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# type-grammar.ts restates one claim — that the lowering never divides a generic argument's interior into fields, so the wire consequence is bounded but the source key is still judged — at twelve sites in three parallel layers of narration

## Observation
One claim recurs throughout src/parser/type-grammar.ts: a generic type
argument's inline-object interior is never divided into fields by the
lowering, so no key from there reaches the wire, and that fact bounds the wire
consequence rather than whether the rule judges the source. The claim is
stated in the module header's rule enumeration (three bullets), in
`walkType`'s doc comment (five places), and again as inline comments inside
`walkType`'s `generic` and `object` arms (four places) — twelve statements of
the same fact, in the same file, none of which is a cross-reference to
another. `walkType` itself carries no code that varies on generic-argument
depth: the `generic` arm recurses with `rules` and `position` unchanged and
the `object` arm has no depth parameter.

## Evidence
src/parser/type-grammar.ts:46-54 — module header, `duplicate-inline-field-name`
bullet:
```
//     Answers alike for an object reached through a generic type argument, at
//     every depth beneath it: `TypeParser.parseObject` parses that interior
//     brace-aware, exactly as it parses any other object type, so the same
//     repeat is there to name. The LOWERING's generic-argument split
//     (`params.ts`'s `lowerTypeExpr`, through `splitTopLevel`'s default
//     angle-only nesting) never divides that interior into fields and mints
//     no duplicate `required` on the wire from there — that fact bounds the
//     WIRE consequence of a repeated key, not whether this rule judges the
//     source (code-registry-parse.md's row). Position-independent, like
```

src/parser/type-grammar.ts:62-66 — module header, `quoted-inline-field-name`
bullet:
```
//     names are identifiers, which admit no quote character. Shares the
//     duplicate rule's gate (`TypeNode.closingBraceSpelled`) and its
//     comparison key, and answers alike at any depth beneath a generic type
//     argument on the same ground as the duplicate rule; a key that repeats
//     draws the duplicate row alone (bug 0176 §Fix precedence).
```

src/parser/type-grammar.ts:89-92 — module header, `binding-case-mismatch`
bullet:
```
//     rule's closing-brace gate, the same gate the two raw-key rules above
//     share: all six rules at this arm answer alike regardless of nesting
//     depth beneath a generic type argument, so a nested `array<{ Ys: string }>`
//     fires exactly as a nested `array<{ a b: string }>` does. Emits before
```

src/parser/type-grammar.ts:1376-1382 — `walkType` doc, `binding-case-mismatch`
bullet:
```
 *     Runs under EVERY `rules` value, gated ONLY on `TypeNode.closingBraceSpelled`
 *     (the same grammar requirement the empty rule above reads, and the one
 *     the two raw-key rules below share): every rule at this arm judges the
 *     SOURCE key regardless of nesting depth beneath a generic argument — the
 *     LOWERING never dividing that interior into fields (`params.ts`'s
 *     `lowerTypeExpr`) bounds the WIRE consequence a key has, not whether the
 *     source spelling is judged — so `array<{ Ys: string }>` fires. Emits
```

src/parser/type-grammar.ts:1406-1413 — `walkType` doc,
`duplicate-inline-field-name` bullet:
```
 *     occurrence draws no second line. Runs under EVERY `rules` value — one
 *     of the five checks `"inline-object-shape"` admits — and is
 *     unqualified by `position`, by `isRoot`, or by nesting depth beneath a
 *     generic type argument: a generic argument's interior is never divided
 *     into fields at the LOWERING, so no duplicate `required` is ever minted
 *     on the WIRE from there (code-registry-parse.md's row, "Two shapes sit
 *     outside this row") — but the source key still repeats, and this rule
 *     judges the source, not the lowered artefact. `TypeNode.fieldNames` —
```

src/parser/type-grammar.ts:1424-1429 — `walkType` doc,
`quoted-inline-field-name` bullet:
```
 *     rule brings the inline position into agreement with it. Shares the
 *     duplicate rule's gate above (`closingBraceSpelled`) and its comparison
 *     key, and answers alike at any depth beneath a generic type argument on
 *     the same ground as the duplicate rule: the LOWERING never divides that
 *     interior into fields, which bounds what reaches the wire, not what
 *     this rule judges. A key that REPEATS is the duplicate rule's subject
```

src/parser/type-grammar.ts:1466-1470 — `walkType` doc,
`renamed-inline-field-name` bullet:
```
 *     row-scoped exception of its own either. This row answers alike at any
 *     depth beneath a generic type argument for the same reason its
 *     neighbours do: the LOWERING never divides that interior into fields,
 *     which bounds what a rename would reach on the wire, not whether the
 *     source rename clause is judged. Runs under EVERY `rules` value — the
```

src/parser/type-grammar.ts:1477-1482 — `walkType` doc, closing paragraph:
```
 * three `"all"`-only checks are withheld. The six rules at the `object` arm
 * below judge the SOURCE key at every depth and through every generic
 * argument alike — the LOWERING never dividing a generic argument's interior
 * into fields (`params.ts`'s `lowerTypeExpr`) bounds the WIRE consequence a
 * key has, not whether the source spelling is judged — so `walkType` carries
 * no flag distinguishing a generic argument's subtree from any other.
```

src/parser/type-grammar.ts:1534-1536 — inline comment ahead of the `generic`
arm's descent:
```
      // A generic type argument's interior is one more `ObjectType`
      // interior: nothing narrows `rules` or `position` for it, so it draws
      // the same six object-arm rules as any other subtree.
```

src/parser/type-grammar.ts:1556-1562 — inline comment ahead of the identifier
pass:
```
      // closing-brace requirement (`ObjectType` spells `}`) — the same gate the
      // two raw-key rules below share, so this pass and they answer alike at
      // any depth beneath a generic argument: the LOWERING never dividing that
      // interior into fields (a fact about the lowered artefact) bounds what
      // reaches the wire from there, not whether the source's field-name
      // position is judged, and it exists at any depth, so `array<{ Ys: string }>`
      // must still fire. Emits BEFORE the raw-key rules below so the settled
```

src/parser/type-grammar.ts:1618-1628 — inline comment ahead of the duplicate
rule:
```
      // A generic type argument's interior draws the same gate: `TypeParser.parseObject` parses it
      // exactly as it parses any other object type — brace-aware, not
      // angle-only — so `interiorSource` holds the repeat there just as it
      // does anywhere else, and this rule names it. The LOWERING's own
      // generic-argument handling (`params.ts`'s `lowerTypeExpr`, through
      // `splitTopLevel`'s default angle-only nesting) never divides that
      // interior into fields, so no duplicate `required` is ever minted on
      // the WIRE from there (code-registry-parse.md's row, "Two shapes sit
      // outside this row"; bug 0052 §Non-goals) — that fact bounds the wire
      // consequence of a repeated key, not whether this rule judges the
      // source. `seen` / `reported` are `Set`s, never a plain object, so an
```

src/parser/type-grammar.ts:1699-1706 — inline comment ahead of the rename
rule:
```
          // exception beside its two raw-key neighbours' — their subject is the
          // raw, unnormalised entry text, and this row's subject never is. This
          // row answers alike at any depth beneath a generic argument for the
          // same reason its neighbours do (not 0154's identifier-pass reason):
          // its subject is the raw key the LOWERING mints as a property name,
          // and a generic argument's interior is never divided into fields, so
          // no such key ever reaches the wire from there — which bounds the
          // wire consequence, not whether the source rename clause is judged.
```

Exact search behind the count:
`grep -n "bounds the WIRE consequence\|bounds what reaches the wire\|bounds the wire\|never divid" src/parser/type-grammar.ts`
→ 13 hits, at :51, :1380, :1381, :1409, :1427, :1428, :1468, :1479, :1480,
:1558, :1623, :1626, :1704; those 13 hits fall inside 8 of the 12 cited
passages. The remaining 4 (:62-66, :89-92, :1424-1429's opening sentence, and
:1534-1536) state the same claim without that phrasing — by reference to the
duplicate rule's ground, or as "nothing narrows `rules` or `position` for it".

## Why this is a problem
Historical narration maintained in triplicate. The same fact is authored three
times per rule — once in the module header's enumeration, once in `walkType`'s
doc comment, once as an inline comment beside the emission — and there are
four such rules at the `object` arm, which is how one fact becomes twelve
statements. The code has no corresponding threefold structure: `walkType`'s
`generic` arm recurses with `rules` and `position` unchanged
(src/parser/type-grammar.ts:1537-1539) and the `object` arm takes no
depth-distinguishing input, which the closing paragraph at :1481-1482 itself
states ("`walkType` carries no flag distinguishing a generic argument's
subtree from any other"). Each restatement is a copy that can drift
independently, and the copies already differ in what they cite (three name
`params.ts`'s `lowerTypeExpr`, two name `code-registry-parse.md`'s row, one
names `bug 0052 §Non-goals`, six name none) and in the count they assert
("all six rules at this arm", "The six rules at the `object` arm", "the same
six object-arm rules", "one of the five checks"). The same file already
carries a filed candidate about those counts having drifted
(qw20260907183353-d2-03-type-grammar-rule-counts-stale), which is the drift
this replication makes cheap.

## Suggested direction (non-binding, optional)
State the generic-argument/wire-bound fact once — at `walkType`, where the
descent it describes lives — and let the header bullets and the inline
comments reference it rather than restate it.

## False-positive check
- Occurrence enumeration: the exact grep above was run and its 13 hits mapped
  onto the cited passages; each of the 12 passages was then read in full to
  confirm it states the claim rather than merely mentioning generics.
- Not-a-cross-reference check: each passage was checked for a pointer to
  another statement of the fact. Two passages point at a sibling RULE's
  reasoning (":62-66", "on the same ground as the duplicate rule";
  ":1466-1470", "for the same reason its neighbours do") but still restate the
  claim in the same sentence; none defers to another location without
  repeating it.
- Code-structure check: `walkType`'s signature
  (src/parser/type-grammar.ts:1484-1491) and its `generic` arm's descent
  (:1534-1539) were read to confirm no depth/generic-argument parameter
  exists, so the twelve statements describe one unconditional behaviour, not
  twelve separately conditioned ones.
- Duplicate check against already-filed candidates:
  qw20260907183353-d2-03-type-grammar-rule-counts-stale files the drifted
  rule COUNTS ("all eight checks", "the five checks", "the six rules") and
  cites :88-93, :95-96, :191-199, :1360, :1407, :1433, :1471, :1477-1478,
  :1547 — a different claim from the generic-argument/wire-bound sentence
  filed here, which that report does not mention.
  qw20260907183353-d2-05-type-grammar-registry-citations-drifted covers two
  `code-registry-parse.md` line citations at :939-943 and :979-981, neither of
  which is a site here.
- Not a code-duplication finding: the twelve sites are comments; no production
  code is duplicated by this observation, so the "duplication between live
  copies" exclusion does not apply.

## Triage

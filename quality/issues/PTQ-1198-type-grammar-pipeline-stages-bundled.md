---
id: PTQ-1198
title: type-grammar.ts bundles tokeniser, recursive-descent parser, AST model, and the diagnostic rule walker in one 1756-LOC module
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/type-grammar.ts:1-1756
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/type-grammar.ts
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# type-grammar.ts bundles tokeniser, recursive-descent parser, AST model, and the diagnostic rule walker in one 1756-LOC module

## Observation
src/parser/type-grammar.ts is 1756 LOC (justify band). It carries a complete
four-stage pipeline behind one exported entry point: a private tokeniser
(`tokeniseType`), a private 154-LOC AST model (`TypeNode`), a private 728-LOC
recursive-descent parser (`TypeParser`), and a private 273-LOC
position-sensitive diagnostic walker (`walkType`) that emits ten-plus
`theta/parse/*` codes. `parseTypeExpression` (222-243) sequences the stages.

## Evidence
Distinct-concern inventory (declaration LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| public entry & rule selection | TypePosition, TypeCheckSite, TypeCheckRules, parseTypeExpression | 174-243 | 28 |
| type AST model | TypeNode, TypeToken | 246-399, 413-417 | 159 |
| tokeniser | tokeniseType | 420-478 | 59 |
| recursive-descent parser | TypeParser, GENERIC_ARITY, interiorClosingBraceIndex, carriesUnclosedInterior | 488-533, 558-1299 | 764 |
| diagnostic rule walker | RESERVED_KEYWORDS, INLINE_FIELD_RENAME, INLINE_FIELD_IDENT, inlineObjectFieldKeys, walkType | 119-157, 1323-1337, 1483-1755 | 293 |

The entry point shows the stage boundary (src/parser/type-grammar.ts:222-243):

```ts
export function parseTypeExpression(
  source: string,
  position: TypePosition,
  site: TypeCheckSite,
  rules: TypeCheckRules = "all",
): Diagnostic[] {
  const tokens = tokeniseType(source);
  ...
  const parser = new TypeParser(tokens, source, site, diagnostics);
  const node = parser.parse();
  ...
  walkType(node, true, position, rules, site, diagnostics);
```

Recognition (TypeParser) and judgement (walkType) touch each other only through
the `TypeNode` value and the shared `diagnostics` array; the walker's own
constants (RESERVED_KEYWORDS 119, INLINE_FIELD_RENAME 147-148,
INLINE_FIELD_IDENT 157) serve only walkType.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole
is found. Reasons considered and defeated:
- One grammar production family: that reason covers "a parser routine that is
  one production's sequential recognition" — TypeParser alone. The file also
  carries the tokeniser (a distinct stage) and walkType, a diagnostics rules
  engine over the finished tree (ten-plus codes per the header roster at 1-100),
  which is judgement, not recognition.
- Data-only module / type family: TypeNode + TypeToken = 159 LOC of 1756 (~9%)
  — far below 80%.
- Closed-enumeration dispatch: walkType's switch mirrors TypeNode's closed kind
  set, but its object arm is ~205 LOC — arms are not each short, so the reason
  fails on its own terms (and it would cover walkType, not the file).
- Single algorithm with shared local state: the stages share no locals — the
  handoffs are `tokens`, `node`, and `diagnostics`, each a single value.
- Generated code: hand-written (git log --follow shows per-bug commits).

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): walkType + inlineObjectFieldKeys +
RESERVED_KEYWORDS + INLINE_FIELD_RENAME + INLINE_FIELD_IDENT -> type-walk.ts —
~293 declaration LOC, 0 exported symbols moved (all module-private, importers
0/0), cross-references back into the host: TypeNode, GENERIC_ARITY,
TypeCheckSite/TypePosition/TypeCheckRules (TypeNode and GENERIC_ARITY would need
exporting or a shared model module). Seam B (hypothesis, unproven): tokeniseType
+ TypeToken -> type-tokens.ts — ~64 LOC, 0 exported symbols moved, cross-ref:
none back into the host. The human ratifies one.

## False-positive check
Band: justify (1756 LOC per the authoritative map; not recounted; navigated by
map, no end-to-end read). Reasons considered: all five concrete classes, each
defeated above with counts. Exemptions check: quality/exemptions.json has no
key for src/parser/type-grammar.ts (grep run, zero hits). Generated-code check:
no generator marker; header is hand-written rationale. Spec-mirror check:
grammar.md §"Type grammar" names the production family TypeParser recognises;
it does not name the tokeniser/walker stages as one unit. Placement: imports
(../diagnostics/diagnostic, ../lexer/lexer, ./params, ./schema-declarations)
are all parser-adjacent layers — no misplacement. Not a husk (16 declarations,
parseTypeExpression imported 3/5). The header-roster staleness is already filed
(qw20260920183643-d2-01-type-grammar-header-roster-omits-three-codes) — not
re-filed here.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces 1756 LOC / justify band and the 16-declaration table exactly; no quality/exemptions.json key for the host; the five inventory rows are real distinct stages (tokeniseType 420-478 hands off only `tokens`; TypeParser 572-1299 hands off only `node`+`diagnostics`; walkType 1483-1755 is the sole in-file reader of RESERVED_KEYWORDS:1574, INLINE_FIELD_RENAME:1706, INLINE_FIELD_IDENT:1730 and inlineObjectFieldKeys:1631); one minor row wrinkle that does not refute the inventory — GENERIC_ARITY's only in-file reader is walkType:1511 (plus params.ts), not TypeParser, so it sits in the walker/model concern rather than the parser row; no overlooked reason (walkType switch mirrors TypeNode's 4 kinds but its object arm 1541-1745 is ~205 LOC; git log --follow shows 25 hand-written per-bug commits and no reverted split; header names spec ownership, not a co-location invariant); sibling intake d9-13 targets the function-level host `#walkType` (strong band), a different d9_host, so not a duplicate (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run reproduces 1756 LOC / justify band (bands justify=1000, strong=2000) and all 16 declaration ranges; `grep type-grammar quality/exemptions.json` → 0 hits; parseTypeExpression excerpt matches 222-243 verbatim; the five rows are distinct stages sharing no locals — tokeniseType:420-478 hands off only `tokens`, TypeParser:572-1299 takes (tokens, source, site, diagnostics) via constructor and hands back only `node`, walkType:1483-1755 is the sole in-file reader of RESERVED_KEYWORDS:1574, INLINE_FIELD_RENAME:1706, INLINE_FIELD_IDENT:1730, inlineObjectFieldKeys:1631, while interiorClosingBraceIndex:1070/1250 and carriesUnclosedInterior:1012 are read only inside TypeParser; two non-refuting wrinkles — GENERIC_ARITY's only in-file reader is walkType:1511 (TypeParser only mentions it in a comment at 777-778) so it belongs to the walker/model row, and the walker row sums to 292 not 293; no overlooked reason — walkType's object arm 1541-1745 is ~205 LOC so arms are not short, git log --follow shows 25 hand-written per-bug fix commits and no reverted split, spec clauses cite grammar.md#type-grammar for the production not for module co-location, header states ownership not a keep-whole invariant; siblings d9-12 (#TypeParser.parseObject) and d9-13 (#walkType) carry different d9_hosts and PTQ-1095 is the D2 header-roster item, so not a duplicate (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run now gives 1766 LOC / justify (bands justify=1000, strong=2000; the +10 drift is commit 71af3b5b, the PTQ-1095 header-roster fix, now in quality/resolved) with every declaration LOC identical to the filed table (154/5/59/4/20/12/728/15/273) at +10 line offsets; parseTypeExpression excerpt content-identical at 232-253; `grep type-grammar quality/exemptions.json` → 0 hits; rows are distinct stages sharing no locals — tokeniseType:430 returns only `tokens`, TypeParser takes (tokens, source, site, diagnostics) in its constructor 600-610 and returns only `node`, walkType:1493-1765 is the sole in-file reader of RESERVED_KEYWORDS:1584, INLINE_FIELD_RENAME:1716, INLINE_FIELD_IDENT:1740, inlineObjectFieldKeys:1641, while interiorClosingBraceIndex:1080/1260 and carriesUnclosedInterior:1022 are read only inside TypeParser; non-refuting wrinkle re-confirmed — GENERIC_ARITY's only in-file reader is walkType:1521 (plus params.ts), so it belongs to the walker row; no overlooked reason — walkType's switch has 4 kind arms + default but the object arm 1551-1755 is ~205 LOC, no generator marker, git log --follow = 26 per-bug fix commits with no revert/extraction, grammar.md:86 §Type grammar names the production not a co-location invariant; not a duplicate — d9-12 (#TypeParser.parseObject) and d9-13 (#walkType) are function-level d9_hosts and PTQ-1095 is D2, resolved (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.

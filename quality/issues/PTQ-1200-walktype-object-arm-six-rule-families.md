---
id: PTQ-1200
title: walkType is 273 LOC because its object arm carries six independent inline-field rule families inline
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/type-grammar.ts:1483-1755
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-grammar.ts#walkType
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# walkType is 273 LOC because its object arm carries six independent inline-field rule families inline

## Observation
`walkType` (src/parser/type-grammar.ts:1483-1755) is 273 LOC — strong band. It
is a switch over `TypeNode`'s closed kind set, but the `object` arm
(1541-1745, ~205 LOC) inlines six rule families: empty-schema-body, the bug-0154
identifier pass (reserved-keyword-as-identifier + binding-case-mismatch), and a
four-rule raw-key precedence loop (duplicate-inline-field-name,
quoted-inline-field-name, renamed-inline-field-name,
inline-field-name-not-identifier), plus subtree recursion.

## Evidence
Step inventory (line ranges from the current file; locals each phase touches):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| void arm | 1492-1507 | 16 | reads rules, position, isRoot; writes out |
| generic arm (arity + Result-position + recurse) | 1509-1540 | 32 | reads GENERIC_ARITY, node.ctor/args; writes out |
| object arm: empty-body gate | 1542-1551 | 10 | reads node.interiorHasTokens/braceClosed; writes out |
| object arm: identifier pass (0154 + 0249) | 1572-1610 | 39 | reads node.fieldNames, node.closingBraceSpelled, RESERVED_KEYWORDS; writes out; own local first/isUpper |
| object arm: raw-key precedence loop (0176/0160/0228) | 1630-1740 | 111 | own locals keys, occurrences, seen, reported; reads node.interiorSource; writes out |
| object arm: recursion + union arm | 1741-1751 | 11 | reads node.fieldTypes/arms |

The two object-arm passes share no locals — each reads only node fields, `site`,
and `out`. The raw-key loop is self-contained (src/parser/type-grammar.ts:1630-1640):

```ts
      if (node.closingBraceSpelled) {
        const keys = inlineObjectFieldKeys(node.interiorSource);
        ...
        const occurrences = new Map<string, number>();
        for (const key of keys) {
          occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
        }
        const seen = new Set<string>();
        const reported = new Set<string>();
```

## Why this is a problem
Strong band: the presumption is breakdown unless a strong concrete reason is
found. Reasons considered:
- Closed-enumeration dispatch (concrete): the switch mirrors TypeNode's closed
  kind set and the header's diagnostic roster (type-grammar.ts:1-100), but the
  reason requires each arm to be short — the object arm is ~205 LOC, so the
  reason fails on its own terms.
- Single algorithm with shared local state (concrete): fails — the identifier
  pass and the raw-key loop share zero locals; each extracted helper would take
  (node, site, out) only, well under the 6-local threshold.
- Strong reasons: the only ordering constraint is "Emits BEFORE the raw-key
  rules below so the settled order holds" (1563-1566), which sequential helper
  calls preserve — not a critical section a seam would interleave. No measured
  cost, no prior split reverted (git log --follow shows per-bug fixes only), no
  quality/exemptions.json entry.
None of the four strong classes applies, so the presumption stands.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the raw-key precedence loop (1630-1740) -> a
private checkInlineFieldKeys(interiorSource, site, out) helper — ~111 LOC, 0
exported symbols moved (walkType itself is module-private, importers 0/0),
cross-references back into the host: inlineObjectFieldKeys, INLINE_FIELD_RENAME,
INLINE_FIELD_IDENT, normaliseLiteralValueLineBreaks. Seam B (hypothesis,
unproven): the identifier pass (1572-1610) -> a private
checkInlineFieldIdentifiers(node, site, out) — ~39 LOC, 0 exports moved,
cross-ref: RESERVED_KEYWORDS. Seam C (hypothesis, unproven): the whole object
arm -> walkObjectType(node, position, rules, site, out) — ~205 LOC, 0 exports
moved, cross-ref: walkType recursion. The human ratifies one.

## False-positive check
Band: strong (273 LOC per the authoritative map; not recounted). Reasons
considered: both applicable concrete classes with the evidence defeating each
(arm length count; shared-locals count of zero); all four strong classes checked
and absent. Exemptions check: no type-grammar key in quality/exemptions.json
(grep run, zero hits). Generated-code check: hand-written rationale comments,
per-bug commit history. Spec-mirror check: the emitted codes mirror
code-registry-parse.md rows, but the mirror is per-rule-family, not one
enumeration with short arms. Emission-order constraint verified preserved by
sequential extraction (stable-sort note at 1563-1566 read before filing).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces walkType 1483-1755 at 273 LOC / strong band with no quality/exemptions.json key; the object arm's identifier pass (1572-1610) and raw-key loop (1630-1740) share only node/site/out, the sole ordering constraint is emission order that sequential calls preserve, git --follow shows per-bug accretion with no reverted split, and no open issue tracks walkType breakdown; the seam shape (A/B/C) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map re-run reproduces walkType 1483-1755 at 273 LOC / strong band (FN strong=200), `grep type-grammar quality/exemptions.json` → 0 hits; the object arm 1541-1745 is real and its rows are distinct — identifier pass 1572-1610 owns name/first/isUpper, raw-key loop 1630-1740 owns keys/occurrences/seen/reported/firstChar/renamed, sharing only node/site/out; the sole constraint ("Emits BEFORE the raw-key rules below", 1561-1565) is emission order that sequential calls keep; no overlooked reason — switch mirrors TypeNode's 4 kinds but the object arm is ~205 LOC so arms are not short, 111/273 lines are comments (not a listed reason), git log --follow shows 25 per-bug fix commits and no reverted split; not a duplicate — sibling d9-11 carries the file-level d9_host and PTQ-1095 is D2's header roster (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: independent size-scan map re-run gives `#walkType — 1493-1765 — 273 LOC — band strong` (FN_BANDS strong = 200; a 10-line drift from the cited 1483-1755, content byte-matching at the shifted lines), `grep -i type-grammar quality/exemptions.json` → 0 hits; the inventory rows are real distinct passes, not adjective splits — the 0154/0249 identifier pass owns `name`/`first`/`isUpper` and reads `node.fieldNames`+`RESERVED_KEYWORDS`, the 0176/0160/0228 raw-key loop owns `keys`/`occurrences`/`seen`/`reported`/`firstChar`/`renamed` and reads `node.interiorSource`+`INLINE_FIELD_RENAME`/`INLINE_FIELD_IDENT`, both under the same `node.closingBraceSpelled` gate and sharing only `node`/`site`/`out`; no overlooked reason — the switch mirrors TypeNode's 4 kinds but the object arm is ~205 of 273 LOC so arms are not short, shared locals across the two passes = 0 (< 6), no data/type LOC, walkType is a rule walker not a grammar production, hand-written per-bug comments; strong sweep: the only invariant is the "Emits BEFORE the raw-key rules" emission order that sequential helper calls keep, no measured cost, `git log --follow` (26 commits, all `fix: bug NNNN` accretions, none a revert or extraction), no exemption row; not a duplicate — d9-11 files the FILE key `src/parser/type-grammar.ts` (justify), d9-12 files `#TypeParser.parseObject`, PTQ-1095 is D2's header roster, and no quality/issues/ file mentions walkType (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.

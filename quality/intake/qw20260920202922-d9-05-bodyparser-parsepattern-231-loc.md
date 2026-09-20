---
id: pending
title: BodyParser.parsePattern is 231 LOC whose two largest arms are the twice-written object-field loop
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:6022-6252
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#BodyParser.parsePattern
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# BodyParser.parsePattern is 231 LOC whose two largest arms are the twice-written object-field loop

## Observation
BodyParser.parsePattern (src/parser/theta-document.ts:6022-6252, 231 LOC, strong band) recognises the match-pattern alternation (grammar.md §Pattern grammar): rest, literals, array, constructor, typed object, bare-head identifier, bare object, and an increment/decrement recovery arm. The object-field loop — name token, optional `:` sub-pattern, `{ field }` sugar, rest, comma — is written twice, once inside the typed-object arm and once inside the bare-object arm.

## Evidence
Step inventory (arm | lines | LOC):

| arm | lines | LOC |
|---|---|---|
| rest + mut prologue | 6022-6037 | 16 |
| number/string literal arms | 6039-6056 | 18 |
| array pattern | 6057-6070 | 14 |
| true/false/null literal arms | 6071-6083 | 13 |
| Ok/Err constructor arm | 6084-6096 | 13 |
| typed-object arm (head refusals + field loop 6120-6148) | 6097-6152 | 56 |
| bare-head wildcard/identifier refusals | 6153-6179 | 27 |
| bare-object arm (field loop 6183-6211) | 6181-6215 | 35 |
| ++/-- recovery arm | 6216-6246 | 31 |
| catch-all wildcard | 6247-6251 | 5 |

The two field loops are line-for-line the same shape (excerpt 6136-6143, repeated at 6196-6203):

```ts
          if (this.isPunct(":")) {
            this.advance();
            fieldPattern = this.parsePattern();
          } else {
            // `{ field }` sugars `{ field: field }` (grammar.md §Pattern
            // grammar): a colon-less field binds the field value to a
            // same-named identifier, never a wildcard on the next token.
            fieldPattern = { kind: "identifier", name: nameTok.text };
```

That clone is already filed as qw20260920183643-d4-14-object-pattern-field-loop-cloned (D4's subject); its dedup alone removes ~40 LOC, which would place this host at ~190 LOC — under the strong threshold.

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required. Reasons considered and defeated: (1) one grammar production family — concrete (the Pattern alternation, each arm one alternative, recursing into parsePattern for every sub-pattern) but sufficient only in the justify band; (2) closed-enumeration dispatch — the alternation mirrors grammar.md §Pattern grammar, but the longest arm is 56 LOC, and 40 of the 231 LOC are a duplicated loop rather than enumeration length; (3) strong extras — no spec-cited critical section (each arm returns independently), no measured cost, no reverted split, no exemption entry. The size over the strong threshold is manufactured by the duplication, which is itself already-filed evidence that a seam exists.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: Seam A: the twice-written field loop -> private BodyParser.parsePatternObjectFields() (hypothesis) — ~40 LOC net removal, 0 exported symbols moved, 0 external importers, two calls back from the typed-object and bare-object arms; this is the same seam the D4 filing qw20260920183643-d4-14 already names, so one fix retires both findings. None identified yet beyond it.

## False-positive check
Band check: 231 LOC >= 200, strong. Reasons considered recorded; the grammar-production reason (grammar.md §Pattern grammar) verified against the arm inventory. Exemptions check: no D9 entry for this host in quality/exemptions.json. Generated-code check: hand-written (bug 0123/0141/0221/0234 rationale inline). Spec-mirror check: the alternation does mirror the Pattern grammar, but the over-threshold LOC is the duplicated loop, not the enumeration. Duplication itself is not re-filed here (D4 owns it, already filed); this finding is the band accounting. Range 6022-6252 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan map re-run reports BodyParser.parsePattern 6022-6252 at 231 LOC / strong (FN strong ≥ 200); inventory rows are real distinct Pattern-grammar alternatives (bare-object arm starts 6180, catch-all 6249 — ≤2-line drift); the field-loop clone reproduces at 6118-6151/6181-6214 (D4 sibling qw20260920183643-d4-14 confirmed, still intake, distinct root cause); no D9 exemption for this host (only binder-system-prompt.ts#normaliseParamLineBreaks and package-discovery.ts), no reverted prior split in git history, grammar-production/closed-enumeration reasons are concrete-only; target shape needs a human ruling (triage: claude-fable-5-1)
